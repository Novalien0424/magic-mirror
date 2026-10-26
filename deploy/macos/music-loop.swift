// Main-owned playback only. No microphone, default-device or volume changes.
import Foundation
import AVFoundation
import CoreAudio
import Darwin

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
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

  func releaseItem() {
    player?.pause(); player?.replaceCurrentItem(with: nil); player = nil
    itemObserver = nil
    if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
    if let observer = failureObserver { NotificationCenter.default.removeObserver(observer) }
    endObserver = nil; failureObserver = nil
  }
  func close(_ code: Int32 = 0) -> Never {
    closed = true; tick?.invalidate(); releaseItem()
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
      kAudioAggregateDeviceIsStackedKey: 0,
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
    route = next
    player?.audioOutputDeviceUniqueID = uid
    if let current = current, current.isValid { player?.seek(to: current) }
    player?.play(); lastAdvance = Date()
    emit("ready", ["outputs": next.count])
  }
  func play(_ message: [String: Any]) {
    guard let id = message["id"] as? Int, id > 0, let path = message["path"] as? String, path.hasPrefix("/"),
      let mime = message["mime"] as? String, ["audio/mpeg", "audio/mp4", "audio/aac", "audio/vnd.wave", "audio/aiff", "audio/flac", "audio/x-caf"].contains(mime),
      let gain = message["gain"] as? Double, gain.isFinite, gain >= 0, gain <= 1,
      let uid = textProperty(aggregate, kAudioDevicePropertyDeviceUID) else { fail("operator_loop_music_protocol_invalid") }
    releaseItem(); track = id; reportedPlaying = false; lastPosition = 0; lastAdvance = Date()
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
    tick = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
      guard let self = self, !self.closed else { return }
      if getppid() != self.parent || self.parent == 1 { self.close() }
      let next = outputs()
      if next != self.route { self.setRoute(next) }
      guard let player = self.player else { return }
      let seconds = player.currentTime().seconds
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
      let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any], message["action"] as? String == "play" else {
      DispatchQueue.main.async { playback.fail("operator_loop_music_protocol_invalid") }; return
    }
    DispatchQueue.main.async { playback.play(message) }
  }
  DispatchQueue.main.async { playback.close() }
}
playback.start()
RunLoop.main.run()
