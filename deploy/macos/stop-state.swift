// Fixed venue policies: black HDMI, portrait orientation, every external speaker OUTPUT at its
// calibrated normal level (Playback VOL± steps them together, keeping their offsets).
// No microphone, input-gain, credential, default-device or restart ownership.
import AppKit
import CoreAudio
import Darwin

let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Caches/MagicMirror/blackout")
let active = root.appendingPathComponent("active")
let ready = root.appendingPathComponent("ready.json")
func fail(_ reason: String) -> Never { print(reason); exit(1) }
/// The venue HDMI receiver is T749. If its bridge stops sending the EDID, macOS lists it
/// unnamed; a single unnamed non-main screen is then the panel. Never the operator's display.
func venueScreens() -> [NSScreen] {
  let named = NSScreen.screens.filter { $0.localizedName.localizedCaseInsensitiveContains("T749") }
  if !named.isEmpty { return named }
  let unnamed = NSScreen.screens.filter { screen in
    let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
    return screen.localizedName.trimmingCharacters(in: .whitespaces).isEmpty && id != 0 && CGDisplayIsMain(id) == 0
  }
  return unnamed.count == 1 ? unnamed : []
}
func portrait() {
  let screens = venueScreens()
  guard screens.count == 1, let id = (screens[0].deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
    else { fail("portrait_display_unavailable") }
  // Same accepted venue orientation as displayctl. Only touch the HDMI target.
  if Int(CGDisplayRotation(id)) != 90 {
    guard dlopen("/System/Library/PrivateFrameworks/MonitorPanel.framework/MonitorPanel", RTLD_NOW) != nil,
      let cls = NSClassFromString("MPDisplayMgr") as? NSObject.Type,
      let displays = cls.init().value(forKey: "displays") as? [NSObject],
      let display = displays.first(where: { ($0.value(forKey: "displayID") as? NSNumber)?.uint32Value == id })
      else { fail("portrait_rotation_unavailable") }
    display.setValue(NSNumber(value: 90), forKey: "orientation")
  }
  for _ in 0..<40 {
    let bounds = CGDisplayBounds(id)
    if Int(CGDisplayRotation(id)) == 90 && bounds.height > bounds.width { print("portrait_ready"); return }
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
  }
  fail("portrait_rotation_verify_failed")
}
func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
             _ element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: element)
}
func outputDevices() -> [(id: AudioDeviceID, name: String, builtIn: Bool)] {
  var property = address(kAudioHardwarePropertyDevices), size: UInt32 = 0
  let system = AudioObjectID(kAudioObjectSystemObject)
  guard AudioObjectGetPropertyDataSize(system, &property, 0, nil, &size) == noErr else { fail("jabra_devices_unavailable") }
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  guard AudioObjectGetPropertyData(system, &property, 0, nil, &size, &ids) == noErr else { fail("jabra_devices_unavailable") }
  return ids.compactMap { id in
    var p = address(kAudioObjectPropertyName), name: Unmanaged<CFString>?, n = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &n, &name) == noErr, let value = name?.takeRetainedValue() else { return nil }
    p = address(kAudioDevicePropertyStreams, kAudioDevicePropertyScopeOutput); n = 0
    guard AudioObjectGetPropertyDataSize(id, &p, 0, nil, &n) == noErr, n > 0 else { return nil }
    p = address(kAudioDevicePropertyTransportType); var transport: UInt32 = 0; n = 4
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &n, &transport) == noErr,
      ![kAudioDeviceTransportTypeAggregate, kAudioDeviceTransportTypeVirtual].contains(transport) else { return nil }
    return (id, value as String, transport == kAudioDeviceTransportTypeBuiltIn)
  }
}
/// Calibrated normal levels (owner 2026-11-07): `ops/music-device/speaker-levels.json`,
/// e.g. `{"normal": {"Jabra Speak2 75": 0.80, "A1": 0.65, "EDIFIER": 0.50}}`. The Jabra is the
/// reference; a speaker whose name starts with another key keeps that key's offset from the
/// Jabra; unlisted speakers follow the Jabra. Missing or invalid file: every speaker 70%.
/// Same rule (kept identical) in music-loop.swift, qa-output-volume.swift and src/main/speaker-levels.ts;
/// tests/unit/speaker-levels.test.ts checks the copies match.
struct SpeakerLevels {
  static let jabraName = "Jabra Speak2 75"
  var jabra: Float32 = 0.7, others: [(String, Float32)] = [], calibrated = false
  init() {
    let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/MagicMirror/ops/music-device/speaker-levels.json")
    guard let data = try? Data(contentsOf: url), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let normal = root["normal"] as? [String: Any] else { return }
    var reference: Float32?, parsed: [(String, Float32)] = []
    for (key, raw) in normal {
      guard !key.isEmpty, let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
        number.doubleValue.isFinite, number.doubleValue >= 0, number.doubleValue <= 1 else { return }
      if key.caseInsensitiveCompare(Self.jabraName) == .orderedSame { reference = number.floatValue } else { parsed.append((key, number.floatValue)) }
    }
    guard let reference else { return }
    jabra = reference; others = parsed.sorted { $0.0.count > $1.0.count }; calibrated = true
  }
  func isJabra(_ name: String) -> Bool { name.localizedCaseInsensitiveContains(Self.jabraName) }
  func normal(_ name: String) -> Float32 {
    isJabra(name) ? jabra : others.first { name.lowercased().hasPrefix($0.0.lowercased()) }?.1 ?? jabra
  }
  /// A speaker's level for a group (Jabra) level: its normal offset, clamped; a quieter speaker
  /// never goes silent while the Jabra plays (5% floor). The group level may exceed 1 (Jabra
  /// held at 100%) so that further VOL+ presses bring every speaker to 100% (owner 2026-11-07).
  func target(_ name: String, jabraLevel group: Float32) -> Float32 {
    let value = min(1, max(0, group + normal(name) - jabra)), floor = min(group, 0.05)
    return group > 0 && value < floor ? floor : value
  }
  /// Highest useful group level: every speaker at 100%.
  var maxGroup: Float32 { 1 + max(0, others.map { jabra - $0.1 }.max() ?? 0) }
  static let groupFile = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/MagicMirror/ops/music-device/group-level")
  /// The group level for a Jabra level: the Jabra's own below 100%, else the last VOL± level
  /// stored by stop-state (at least 1).
  func group(jabraLevel level: Float32) -> Float32 {
    guard level >= 0.995 else { return level }
    let stored = (try? String(contentsOf: Self.groupFile, encoding: .utf8)).flatMap { Float32($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? 1
    return max(level, min(maxGroup, stored.isFinite ? stored : 1))
  }
}
let speakerLevels = SpeakerLevels()
/// Sets (when `target` is given) or reads one output. Nil when it has no writable volume (HDMI TV).
func level(_ id: AudioDeviceID, set target: Float32? = nil, unmute: Bool = false) -> (volumes: [Float32], muted: Bool)? {
  var main = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput)
  var values: [Float32] = []
  for element: UInt32 in AudioObjectHasProperty(id, &main) ? [0] : [1, 2] {
    var p = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput, element), writable: DarwinBoolean = false
    guard AudioObjectHasProperty(id, &p), AudioObjectIsPropertySettable(id, &p, &writable) == noErr, writable.boolValue else { continue }
    var value: Float32 = 0, size = UInt32(MemoryLayout<Float32>.size)
    if var next = target {
      guard AudioObjectSetPropertyData(id, &p, 0, nil, size, &next) == noErr else { fail("output_volume_set_failed") }
    }
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &size, &value) == noErr else { fail("output_volume_read_failed") }
    values.append(value)
  }
  guard !values.isEmpty else { return nil }
  // The Jabra's own firmware mutes when its buttons take it to step 0, and a later volume
  // write does not clear that, so a reset or VOL+ also unmutes. Input gain is never touched.
  var mute = address(kAudioDevicePropertyMute, kAudioDevicePropertyScopeOutput), muted: UInt32 = 0, muteSize = UInt32(MemoryLayout<UInt32>.size)
  let hasMute = AudioObjectHasProperty(id, &mute)
  if unmute && hasMute {
    var off: UInt32 = 0
    guard AudioObjectSetPropertyData(id, &mute, 0, nil, muteSize, &off) == noErr else { fail("output_unmute_failed") }
  }
  if hasMute && AudioObjectGetPropertyData(id, &mute, 0, nil, &muteSize, &muted) != noErr { fail("output_mute_read_failed") }
  return (values, muted != 0)
}
// Normal use is every external speaker at its calibrated level, unmuted (owner 2026-11-07;
// 70% each before). The Jabra is required, but without exactly one controllable Jabra the
// other speakers still return to normal before its reason is reported (a second Jabra is never
// touched). The Mac mini speaker is excluded from music and keeps its level.
func volume(_ reset: Bool) {
  let external = outputDevices().filter { !$0.builtIn }
  let jabras = external.filter { speakerLevels.isJabra($0.name) }
  let near = { (values: [Float32], target: Float32) in !values.contains(where: { abs($0 - target) > 0.015 }) }
  var jabraFailure: String? = jabras.count == 1 ? nil : jabras.isEmpty ? "jabra_output_missing" : "jabra_output_ambiguous"
  let jabra = jabraFailure == nil ? level(jabras[0].id, set: reset ? speakerLevels.jabra : nil, unmute: reset) : nil
  if jabraFailure == nil && jabra == nil { jabraFailure = "jabra_volume_unavailable" }
  if reset { storeGroup(speakerLevels.jabra) }
  var speakers: [[String: Any]] = [], uncontrolled = 0, verified = jabra.map { near($0.volumes, speakerLevels.jabra) && !$0.muted } ?? false
  for output in external where !speakerLevels.isJabra(output.name) {
    let normal = speakerLevels.normal(output.name)
    guard let other = level(output.id, set: reset ? normal : nil, unmute: reset) else { uncontrolled += 1; continue }
    verified = verified && near(other.volumes, normal) && !other.muted
    speakers.append(["output": output.name, "volumes": other.volumes, "muted": other.muted, "normal": normal])
  }
  let data = try! JSONSerialization.data(withJSONObject: ["output": SpeakerLevels.jabraName, "volumes": jabra?.volumes ?? [], "reset": reset, "muted": jabra?.muted ?? false,
    "normal": speakerLevels.jabra, "levels": speakerLevels.calibrated ? "calibrated" : "default",
    "speakers": speakers, "uncontrolled": uncontrolled, "jabra": jabraFailure ?? "ready"], options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
  if let jabraFailure { fail(jabraFailure) }
  if reset && !verified { fail("output_volume_verify_failed") }
}
// A conversation opens the Jabra with echo cancellation, which switches it to its call path and
// that path's own stored volume (found 2026-11-08: it had been left at 0, muted, during the
// 11-07 sound work, and START's and STOP's resets, run outside a call, never reach it). Main runs this as a
// conversation starts: for 10 s it returns the Jabra to its normal level, unmuted, whenever it
// reads otherwise, so the write lands on the call path whether the switch comes before or after
// it starts. The switch takes up to ~1 s while the capture starts and overrides writes made
// during it (a stored 1% call volume is step 0, which the Jabra reads as muted), so writes are
// 0.3 s apart, at most 8. Only the Jabra: other speakers, the group level and input gain are
// untouched.
func resetVoice() {
  let jabras = outputDevices().filter { !$0.builtIn && speakerLevels.isJabra($0.name) }
  guard jabras.count == 1 else { fail(jabras.isEmpty ? "jabra_output_missing" : "jabra_output_ambiguous") }
  let target = speakerLevels.jabra, end = Date(timeIntervalSinceNow: 10)
  let off = { (state: (volumes: [Float32], muted: Bool)) in state.muted || state.volumes.contains { abs($0 - target) > 0.015 } }
  guard var state = level(jabras[0].id) else { fail("jabra_volume_unavailable") }
  var writes = 0
  while true {
    if off(state) && writes < 8 {
      writes += 1
      guard level(jabras[0].id, set: target, unmute: true) != nil else { fail("jabra_volume_unavailable") }
      Thread.sleep(forTimeInterval: 0.3)
    } else if Date() >= end { break } else { Thread.sleep(forTimeInterval: 0.1) }
    guard let next = level(jabras[0].id) else { fail("jabra_volume_unavailable") }
    state = next
  }
  let data = try! JSONSerialization.data(withJSONObject: ["output": SpeakerLevels.jabraName, "volumes": state.volumes, "muted": state.muted,
    "normal": target, "writes": writes], options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
  if off(state) { fail("output_volume_verify_failed") }
}
/// The group level for music-loop to report to Main (AirPlay speakers) while the Jabra is at 100%.
func storeGroup(_ value: Float32) {
  try? FileManager.default.createDirectory(at: SpeakerLevels.groupFile.deletingLastPathComponent(), withIntermediateDirectories: true)
  try? String(format: "%.2f\n", value).write(to: SpeakerLevels.groupFile, atomically: true, encoding: .utf8)
}
// Playback VOL± (Stream Deck): the group level moves 10% (snapped to 5% so hardware rounding
// such as 0.701 never drifts): the Jabra follows it up to 100% and every other external
// speaker keeps its calibrated offset; above the Jabra's 100% further VOL+ presses raise the
// others until every speaker is at 100%. Without exactly one Jabra each speaker steps on its
// own. The Mac mini speaker and fixed-volume HDMI are left alone.
func stepVolume(_ step: Float32) {
  let external = outputDevices().filter { !$0.builtIn }
  let jabras = external.filter { speakerLevels.isJabra($0.name) }
  let snap = { (value: Float32, top: Float32) in min(top, max(0, ((value + step) * 20).rounded() / 20)) }
  var speakers: [[String: Any]] = []
  if jabras.count == 1, let now = level(jabras[0].id)?.volumes.first {
    let group = snap(speakerLevels.group(jabraLevel: now), speakerLevels.maxGroup)
    storeGroup(group)
    for output in external {
      let target = output.id == jabras[0].id ? min(1, group) : speakerLevels.target(output.name, jabraLevel: group)
      guard let changed = level(output.id, set: target, unmute: step > 0) else { continue }
      speakers.append(["output": output.name, "volumes": changed.volumes, "muted": changed.muted])
    }
  } else {
    for output in external {
      guard let now = level(output.id)?.volumes.first, let changed = level(output.id, set: snap(now, 1), unmute: step > 0) else { continue }
      speakers.append(["output": output.name, "volumes": changed.volumes, "muted": changed.muted])
    }
  }
  guard !speakers.isEmpty else { fail("output_volume_unavailable") }
  let data = try! JSONSerialization.data(withJSONObject: ["step": step, "speakers": speakers, "levels": speakerLevels.calibrated ? "calibrated" : "default"], options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}

final class BlackView: NSView {
  override func draw(_ dirtyRect: NSRect) { NSColor.black.setFill(); bounds.fill() }
  override func resetCursorRects() {
    addCursorRect(bounds, cursor: NSCursor(image: NSImage(size: NSSize(width: 1, height: 1)), hotSpot: .zero))
  }
}
final class BlackWindow: NSWindow {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

// Button feedback: a quiet system sound on the alert output only (audio-prefer keeps that on
// the Jabra), never the all-speakers default output that music uses.
func chime(_ name: String) {
  guard ["Pop", "Basso", "Glass", "Tink", "Sosumi"].contains(name), let sound = NSSound(named: NSSound.Name(name)) else { fail("chime_invalid") }
  var property = address(kAudioHardwarePropertyDefaultSystemOutputDevice), device: AudioDeviceID = 0
  var size = UInt32(MemoryLayout<AudioDeviceID>.size)
  if AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &property, 0, nil, &size, &device) == noErr, device != 0 {
    var uid = address(kAudioDevicePropertyDeviceUID), value: Unmanaged<CFString>?, n = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    if AudioObjectGetPropertyData(device, &uid, 0, nil, &n, &value) == noErr, let id = value?.takeRetainedValue() {
      sound.playbackDeviceIdentifier = NSSound.PlaybackDeviceIdentifier(id as String)
    }
  }
  sound.volume = 0.35
  guard sound.play() else { fail("chime_failed") }
  let end = Date(timeIntervalSinceNow: 3)
  while sound.isPlaying && Date() < end { RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05)) }
}

switch CommandLine.arguments.dropFirst().first {
case "--chime": chime(CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "")
case "--reset-output": volume(true)
case "--output-status": volume(false)
case "--reset-voice": resetVoice()
case "--volume-up": stepVolume(0.1)
case "--volume-down": stepVolume(-0.1)
case "--portrait": portrait()
case "--black":
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
  let lock = open(root.appendingPathComponent("owner.lock").path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
  guard lock >= 0 else { fail("blackout_lock_unavailable") }
  guard flock(lock, LOCK_EX | LOCK_NB) == 0 else { exit(0) }
  defer { close(lock); try? FileManager.default.removeItem(at: ready) }
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  var windows: [BlackWindow] = [], priorFrames: [NSRect] = [], priorToken = ""
  func refresh() {
    guard let token = try? String(contentsOf: active, encoding: .utf8), !token.isEmpty else {
      try? FileManager.default.removeItem(at: ready)
      app.terminate(nil); return
    }
    let targets = venueScreens()
    let frames = targets.map(\.frame)
    if frames != priorFrames {
      windows.forEach { $0.orderOut(nil) }; windows = []; priorFrames = frames
      for screen in targets {
        let window = BlackWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.backgroundColor = .black; window.isOpaque = true; window.hasShadow = false
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)) + 1)
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        window.contentView = BlackView(frame: NSRect(origin: .zero, size: screen.frame.size))
        window.setFrame(screen.frame, display: true); window.orderFrontRegardless()
        windows.append(window)
      }
      priorToken = ""
    }
    if token != priorToken {
      let data = try! JSONSerialization.data(withJSONObject: ["token": token, "pid": getpid(), "displays": windows.count], options: [.sortedKeys])
      try? data.write(to: ready, options: .atomic); priorToken = token
    }
  }
  refresh()
  let timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in refresh() }
  app.run(); timer.invalidate()
default: fail("stop_state_action_invalid")
}
