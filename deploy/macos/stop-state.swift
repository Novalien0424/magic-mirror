// Fixed STOP policy: black HDMI surface, or reset Jabra OUTPUT to 70%.
// No microphone, input-gain, credential, default-device or restart ownership.
import AppKit
import CoreAudio
import Darwin

let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Caches/MagicMirror/blackout")
let active = root.appendingPathComponent("active")
let ready = root.appendingPathComponent("ready.json")
func fail(_ reason: String) -> Never { print(reason); exit(1) }
func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
             _ element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: element)
}
func jabraOutput() -> AudioDeviceID {
  var property = address(kAudioHardwarePropertyDevices), size: UInt32 = 0
  let system = AudioObjectID(kAudioObjectSystemObject)
  guard AudioObjectGetPropertyDataSize(system, &property, 0, nil, &size) == noErr else { fail("jabra_devices_unavailable") }
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  guard AudioObjectGetPropertyData(system, &property, 0, nil, &size, &ids) == noErr else { fail("jabra_devices_unavailable") }
  let matches = ids.filter { id in
    var p = address(kAudioObjectPropertyName), name: Unmanaged<CFString>?, n = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &n, &name) == noErr, let value = name?.takeRetainedValue(),
          (value as String).localizedCaseInsensitiveContains("Jabra Speak2 75") else { return false }
    p = address(kAudioDevicePropertyStreams, kAudioDevicePropertyScopeOutput); n = 0
    return AudioObjectGetPropertyDataSize(id, &p, 0, nil, &n) == noErr && n > 0
  }
  guard matches.count == 1 else { fail(matches.isEmpty ? "jabra_output_missing" : "jabra_output_ambiguous") }
  return matches[0]
}
func volume(_ reset: Bool) {
  let id = jabraOutput()
  var values: [Float32] = []
  for element: UInt32 in [0, 1, 2] {
    var p = address(kAudioDevicePropertyVolumeScalar, kAudioDevicePropertyScopeOutput, element)
    guard AudioObjectHasProperty(id, &p) else { continue }
    if reset {
      var writable: DarwinBoolean = false
      guard AudioObjectIsPropertySettable(id, &p, &writable) == noErr, writable.boolValue else { fail("jabra_volume_readonly") }
      var value: Float32 = 0.7
      guard AudioObjectSetPropertyData(id, &p, 0, nil, UInt32(MemoryLayout<Float32>.size), &value) == noErr else { fail("jabra_volume_set_failed") }
    }
    var value: Float32 = 0, size = UInt32(MemoryLayout<Float32>.size)
    guard AudioObjectGetPropertyData(id, &p, 0, nil, &size, &value) == noErr else { fail("jabra_volume_read_failed") }
    values.append(value)
  }
  guard !values.isEmpty else { fail("jabra_volume_unavailable") }
  if reset && values.contains(where: { abs($0 - 0.7) > 0.015 }) { fail("jabra_volume_verify_failed") }
  let data = try! JSONSerialization.data(withJSONObject: ["output": "Jabra Speak2 75", "volumes": values, "reset": reset], options: [.sortedKeys])
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

switch CommandLine.arguments.dropFirst().first {
case "--reset-output": volume(true)
case "--output-status": volume(false)
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
    // The venue HDMI receiver is T749. Never cover the operator's display.
    let targets = NSScreen.screens.filter { $0.localizedName.localizedCaseInsensitiveContains("T749") }
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
