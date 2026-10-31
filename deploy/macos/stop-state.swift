// Fixed venue policies: black HDMI, portrait orientation, every external speaker OUTPUT at 70%
// (Playback VOL± steps them together).
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
/// Sets (reset), steps (Playback VOL±) or reads one output; a reset is 70% unmuted.
/// Nil when it has no writable volume (HDMI TV).
func level(_ id: AudioDeviceID, _ reset: Bool, step: Float32 = 0) -> (volumes: [Float32], muted: Bool)? {
  var main = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput)
  var values: [Float32] = []
  for element: UInt32 in AudioObjectHasProperty(id, &main) ? [0] : [1, 2] {
    var p = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput, element), writable: DarwinBoolean = false
    guard AudioObjectHasProperty(id, &p), AudioObjectIsPropertySettable(id, &p, &writable) == noErr, writable.boolValue else { continue }
    var value: Float32 = 0, size = UInt32(MemoryLayout<Float32>.size)
    if step != 0 {
      guard AudioObjectGetPropertyData(id, &p, 0, nil, &size, &value) == noErr else { fail("output_volume_read_failed") }
      // Snap to 5% so hardware rounding (Jabra 0.701) never drifts the speakers apart.
      value = min(1, max(0, ((value + step) * 20).rounded() / 20))
    }
    if reset || step != 0 {
      if reset { value = 0.7 }
      guard AudioObjectSetPropertyData(id, &p, 0, nil, size, &value) == noErr else { fail("output_volume_set_failed") }
    }
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &size, &value) == noErr else { fail("output_volume_read_failed") }
    values.append(value)
  }
  guard !values.isEmpty else { return nil }
  // The Jabra's own firmware mutes when its buttons take it to step 0, and a later volume
  // write does not clear that, so a reset or VOL+ also unmutes. Input gain is never touched.
  var mute = address(kAudioDevicePropertyMute, kAudioDevicePropertyScopeOutput), muted: UInt32 = 0, muteSize = UInt32(MemoryLayout<UInt32>.size)
  let hasMute = AudioObjectHasProperty(id, &mute)
  if (reset || step > 0) && hasMute {
    var off: UInt32 = 0
    guard AudioObjectSetPropertyData(id, &mute, 0, nil, muteSize, &off) == noErr else { fail("output_unmute_failed") }
  }
  if hasMute && AudioObjectGetPropertyData(id, &mute, 0, nil, &muteSize, &muted) != noErr { fail("output_mute_read_failed") }
  return (values, muted != 0)
}
// Normal use is every external speaker at 70% unmuted (owner 2026-10-31). The Jabra is
// required; the Mac mini speaker is excluded from music and keeps its level.
func volume(_ reset: Bool) {
  let external = outputDevices().filter { !$0.builtIn }
  let jabras = external.filter { $0.name.localizedCaseInsensitiveContains("Jabra Speak2 75") }
  guard jabras.count == 1 else { fail(jabras.isEmpty ? "jabra_output_missing" : "jabra_output_ambiguous") }
  guard let jabra = level(jabras[0].id, reset) else { fail("jabra_volume_unavailable") }
  var speakers: [[String: Any]] = [], uncontrolled = 0, verified = !jabra.volumes.contains(where: { abs($0 - 0.7) > 0.015 }) && !jabra.muted
  for output in external where output.id != jabras[0].id {
    guard let other = level(output.id, reset) else { uncontrolled += 1; continue }
    verified = verified && !other.volumes.contains(where: { abs($0 - 0.7) > 0.015 }) && !other.muted
    speakers.append(["output": output.name, "volumes": other.volumes, "muted": other.muted])
  }
  let data = try! JSONSerialization.data(withJSONObject: ["output": "Jabra Speak2 75", "volumes": jabra.volumes, "reset": reset, "muted": jabra.muted,
    "speakers": speakers, "uncontrolled": uncontrolled], options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
  if reset && !verified { fail("output_volume_verify_failed") }
}
// Playback VOL± (Stream Deck): every external speaker moves 10% together; the Jabra is
// not required here, and the Mac mini speaker and fixed-volume HDMI are left alone.
func stepVolume(_ step: Float32) {
  var speakers: [[String: Any]] = []
  for output in outputDevices() where !output.builtIn {
    guard let changed = level(output.id, false, step: step) else { continue }
    speakers.append(["output": output.name, "volumes": changed.volumes, "muted": changed.muted])
  }
  guard !speakers.isEmpty else { fail("output_volume_unavailable") }
  let data = try! JSONSerialization.data(withJSONObject: ["step": step, "speakers": speakers], options: [.sortedKeys])
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
