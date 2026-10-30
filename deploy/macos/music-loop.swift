// Main-owned playback. Dance volume is an explicit one-shot command; no microphone/default-device changes.
import Foundation
import AVFoundation
import CoreAudio
import Darwin

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
             _ element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: element)
}
func emit(_ event: String, _ values: [String: Any] = [:]) {
  let data = try! JSONSerialization.data(withJSONObject: values.merging(["event": event]) { _, new in new }, options: .sortedKeys)
  FileHandle.standardOutput.write(data + Data([10]))
}
func textProperty(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
  var property = address(selector), value: Unmanaged<CFString>?, size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &property, 0, nil, &size, &value) == noErr else { return nil }
  return value?.takeRetainedValue() as String?
}
struct Output: Equatable { let id: AudioDeviceID; let uid: String }
func outputs() -> [Output] {
  var property = address(kAudioHardwarePropertyDevices), size: UInt32 = 0
  let system = AudioObjectID(kAudioObjectSystemObject)
  guard AudioObjectGetPropertyDataSize(system, &property, 0, nil, &size) == noErr else { return [] }
  var devices = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  guard AudioObjectGetPropertyData(system, &property, 0, nil, &size, &devices) == noErr else { return [] }
  return devices.compactMap { id in
    var p = address(kAudioDevicePropertyTransportType), transport: UInt32 = 0, n: UInt32 = 4
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &n, &transport) == noErr,
      ![kAudioDeviceTransportTypeAggregate, kAudioDeviceTransportTypeVirtual].contains(transport) else { return nil }
    p = address(kAudioDevicePropertyDeviceIsAlive); n = 4; var alive: UInt32 = 0
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &n, &alive) == noErr, alive != 0 else { return nil }
    p = address(kAudioDevicePropertyStreams, kAudioDevicePropertyScopeOutput); n = 0
    guard AudioObjectGetPropertyDataSize(id, &p, 0, nil, &n) == noErr, n > 0,
      let uid = textProperty(id, kAudioDevicePropertyDeviceUID) else { return nil }
    return Output(id: id, uid: uid)
  }.sorted { $0.uid < $1.uid }
}

if CommandLine.arguments.contains("--outputs") {
  emit("outputs", ["count": outputs().count]); exit(0)
}

final class Playback {
  var aggregate: AudioDeviceID = 0
  var route: [Output] = []
  var player: AVPlayer?
  var itemObserver: NSKeyValueObservation?
  var endObserver: NSObjectProtocol?
  var failureObserver: NSObjectProtocol?
  var tick: Timer?
  var track = 0
  var reportedPlaying = false
  var lastPosition = 0.0
  var lastAdvance = Date()
  let parent = getppid()
  var closed = false
  var savedVolumes: [(Output, UInt32, Float32)] = []
  var danceVolumeStarted = false

  func setDanceVolume(_ value: Float32, capture: Bool) {
    var controlled = 0, verified = true
    for output in route {
      var main = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput)
      let elements: [UInt32] = AudioObjectHasProperty(output.id, &main) ? [0] : [1, 2]
      for element in elements {
        var property = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput, element), writable: DarwinBoolean = false
        guard AudioObjectHasProperty(output.id, &property), AudioObjectIsPropertySettable(output.id, &property, &writable) == noErr, writable.boolValue else { continue }
        var previous: Float32 = 0, size: UInt32 = 4
        guard AudioObjectGetPropertyData(output.id, &property, 0, nil, &size, &previous) == noErr else { verified = false; continue }
        if capture { savedVolumes.append((output, element, previous)) }
        var next = value
        if AudioObjectSetPropertyData(output.id, &property, 0, nil, 4, &next) != noErr { verified = false; continue }
        var observed: Float32 = 0
        if AudioObjectGetPropertyData(output.id, &property, 0, nil, &size, &observed) != noErr || abs(observed-value) > 0.015 { verified = false }
        controlled += 1
      }
    }
    emit("volume", ["outputs": route.count, "controlled": controlled, "verified": verified])
  }
  func restoreVolumes() {
    for (old, element, previous) in savedVolumes {
      guard let output = outputs().first(where: { $0.uid == old.uid }) else { continue }
      var property = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput, element)
      let name = textProperty(output.id, kAudioObjectPropertyName) ?? ""
      var level: Float32 = name.localizedCaseInsensitiveContains("Jabra Speak2 75") ? 0.7 : previous
      var size: UInt32 = 4, observed: Float32 = 0
      if AudioObjectSetPropertyData(output.id, &property, 0, nil, 4, &level) != noErr
        || AudioObjectGetPropertyData(output.id, &property, 0, nil, &size, &observed) != noErr || abs(observed-level) > 0.015 {
        emit("volume_restore_failed")
      }
    }
    savedVolumes.removeAll()
  }

  func releaseItem() {
    player?.pause(); player?.replaceCurrentItem(with: nil); player = nil
    itemObserver = nil
    if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
    if let observer = failureObserver { NotificationCenter.default.removeObserver(observer) }
    endObserver = nil; failureObserver = nil
  }
  func close(_ code: Int32 = 0) -> Never {
    closed = true; tick?.invalidate(); releaseItem(); restoreVolumes()
    if aggregate != 0 { AudioHardwareDestroyAggregateDevice(aggregate); aggregate = 0 }
    emit("stopped"); exit(code)
  }
  func fail(_ reason: String) -> Never { emit("failed", ["reason": reason]); close(1) }
  func setRoute(_ next: [Output]) {
    guard !next.isEmpty else { fail("operator_loop_music_no_outputs") }
    let current = player?.currentTime()
    player?.pause()
    // Disconnect the renderer before destroying its old CoreAudio route.
    player?.audioOutputDeviceUniqueID = nil
    if aggregate != 0 { AudioHardwareDestroyAggregateDevice(aggregate); aggregate = 0 }
    let uid = "com.magicmirror.music-loop.\(UUID().uuidString)"
    let description: [String: Any] = [
      kAudioAggregateDeviceUIDKey: uid,
      kAudioAggregateDeviceNameKey: "Magic Mirror MusicLoop",
      kAudioAggregateDeviceIsPrivateKey: 1,
      // Multi-output mirroring: measured on the venue Mac as one stereo stream.
      // 0 instead concatenates the three outputs into six channels; a stereo
      // player then reaches only the first output despite an advancing clock.
      kAudioAggregateDeviceIsStackedKey: 1,
      kAudioAggregateDeviceMainSubDeviceKey: next[0].uid,
      kAudioAggregateDeviceSubDeviceListKey: next.enumerated().map { index, output in
        [kAudioSubDeviceUIDKey: output.uid, kAudioSubDeviceDriftCompensationKey: index == 0 ? 0 : 1] as [String: Any]
      }
    ]
    guard AudioHardwareCreateAggregateDevice(description as CFDictionary, &aggregate) == noErr else {
      fail("operator_loop_music_route_failed")
    }
    // Do not silently claim all outputs if CoreAudio accepted only part of them.
    var property = address(kAudioAggregateDevicePropertyActiveSubDeviceList), size: UInt32 = 0
    var verified = false
    for _ in 0..<20 {
      if AudioObjectGetPropertyDataSize(aggregate, &property, 0, nil, &size) == noErr,
        Int(size) / MemoryLayout<AudioObjectID>.size == next.count { verified = true; break }
      Thread.sleep(forTimeInterval: 0.025)
    }
    guard verified else { fail("operator_loop_music_route_incomplete") }
    // Counting sub-devices alone does not prove stereo duplication. A concatenated
    // route can report all devices while only its first pair receives the song.
    property = address(kAudioDevicePropertyStreamConfiguration, kAudioDevicePropertyScopeOutput)
    guard AudioObjectGetPropertyDataSize(aggregate, &property, 0, nil, &size) == noErr,
      size >= MemoryLayout<AudioBufferList>.size else { fail("operator_loop_music_route_incomplete") }
    let storage = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { storage.deallocate() }
    guard AudioObjectGetPropertyData(aggregate, &property, 0, nil, &size, storage) == noErr else { fail("operator_loop_music_route_incomplete") }
    let buffers = UnsafeMutableAudioBufferListPointer(storage.assumingMemoryBound(to: AudioBufferList.self))
    guard buffers.count == 1, buffers[0].mNumberChannels > 0 else { fail("operator_loop_music_route_incomplete") }
    route = next
    player?.audioOutputDeviceUniqueID = uid
    if let current = current, current.isValid { player?.seek(to: current) }
    player?.play(); lastAdvance = Date()
    emit("ready", ["outputs": next.count, "streams": buffers.count, "channels": buffers[0].mNumberChannels])
  }
  func play(_ message: [String: Any]) {
    guard let id = message["id"] as? Int, id > 0, let path = message["path"] as? String, path.hasPrefix("/"),
      let mime = message["mime"] as? String, ["audio/mpeg", "audio/mp4", "audio/aac", "audio/vnd.wave", "audio/aiff", "audio/flac", "audio/x-caf"].contains(mime),
      let gain = message["gain"] as? Double, gain.isFinite, gain >= 0, gain <= 1,
      let uid = textProperty(aggregate, kAudioDevicePropertyDeviceUID) else { fail("operator_loop_music_protocol_invalid") }
    releaseItem(); track = id; reportedPlaying = false; lastPosition = 0; lastAdvance = Date()
    if let level = message["danceVolume"] as? Double, level.isFinite, level >= 0, level <= 1, !danceVolumeStarted {
      danceVolumeStarted = true; setDanceVolume(Float32(level), capture: true)
    }
    // The shared File Provider cache intentionally uses .media names. Preserve
    // the original file's container type instead of relying on that extension.
    guard #available(macOS 14.0, *) else { fail("operator_loop_music_platform_unsupported") }
    let asset = AVURLAsset(url: URL(fileURLWithPath: path), options: [AVURLAssetOverrideMIMETypeKey: mime])
    let item = AVPlayerItem(asset: asset)
    let next = AVPlayer(playerItem: item)
    next.audioOutputDeviceUniqueID = uid; next.volume = Float(gain)
    player = next
    itemObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      DispatchQueue.main.async {
        guard let self = self, self.track == id, self.player?.currentItem === item else { return }
        if item.status == .failed { self.trackFailed(id) }
      }
    }
    endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
      guard let self = self, self.track == id, self.player?.currentItem === item else { return }
      self.releaseItem(); emit("ended", ["id": id])
    }
    failureObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self] _ in
      guard let self = self, self.track == id, self.player?.currentItem === item else { return }
      self.trackFailed(id)
    }
    next.play()
  }
  func trackFailed(_ id: Int) {
    releaseItem(); emit("track_failed", ["id": id, "reason": "operator_loop_music_decode_failed"])
  }
  func start() {
    setRoute(outputs())
    tick = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
      guard let self = self, !self.closed else { return }
      if getppid() != self.parent || self.parent == 1 { self.close() }
      let next = outputs()
      if next != self.route { self.setRoute(next) }
      guard let player = self.player else { return }
      let seconds = player.currentTime().seconds
      if self.danceVolumeStarted && seconds.isFinite && seconds >= 0 {
        emit("clock", ["id": self.track, "positionMs": seconds*1000, "sentAt": Date().timeIntervalSince1970*1000,
          "rate": player.timeControlStatus == .playing ? 1 : 0])
      }
      if seconds.isFinite && seconds > self.lastPosition {
        self.lastPosition = seconds; self.lastAdvance = Date()
        if !self.reportedPlaying && seconds >= 0.05 {
          self.reportedPlaying = true
          emit("playing", ["id": self.track, "outputs": self.route.count])
        }
      } else if Date().timeIntervalSince(self.lastAdvance) > 12 { self.trackFailed(self.track) }
    }
  }
}

let playback = Playback()
signal(SIGPIPE, SIG_IGN)
signal(SIGTERM, SIG_IGN); signal(SIGINT, SIG_IGN)
let terminate = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
terminate.setEventHandler { playback.close() }; interrupt.setEventHandler { playback.close() }
terminate.resume(); interrupt.resume()
// EOF is also ownership release: a dead/killed Main cannot orphan this player.
DispatchQueue.global().async {
  while let line = readLine() {
    guard line.utf8.count <= 16384, let data = line.data(using: .utf8),
      let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any], ["play", "volume"].contains(message["action"] as? String ?? "") else {
      DispatchQueue.main.async { playback.fail("operator_loop_music_protocol_invalid") }; return
    }
    DispatchQueue.main.async {
      if message["action"] as? String == "volume" {
        guard playback.danceVolumeStarted, let value = message["value"] as? Double, value.isFinite, value >= 0, value <= 1 else { return }
        playback.setDanceVolume(Float32(value), capture: false)
      } else { playback.play(message) }
    }
  }
  DispatchQueue.main.async { playback.close() }
}
playback.start()
RunLoop.main.run()
