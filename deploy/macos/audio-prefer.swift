// Magic Mirror field ops: keep a preferred USB audio device (Jabra) as the macOS
// default input, output and system-output whenever it is connected.
// Reacts to CoreAudio device-list changes only, so a manual pick in Sound
// settings holds until the next plug/unplug. When the device is absent macOS
// chooses its own fallback. Metadata-only log on stdout.
// Usage: audio-prefer [name-substring]   (default "Jabra")
import CoreAudio
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let needle = CommandLine.arguments.dropFirst().first ?? "Jabra"
let system = AudioObjectID(kAudioObjectSystemObject)

func addr(_ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func say(_ s: String) {
  let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; f.timeZone = .current
  print("\(f.string(from: Date())) \(s)")
}

func devices() -> [AudioDeviceID] {
  var a = addr(kAudioHardwarePropertyDevices); var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(system, &a, 0, nil, &size) == noErr else { return [] }
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  guard AudioObjectGetPropertyData(system, &a, 0, nil, &size, &ids) == noErr else { return [] }
  return ids
}

func string(_ id: AudioDeviceID, _ sel: AudioObjectPropertySelector) -> String {
  var a = addr(sel); var cf: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &cf) == noErr, let s = cf?.takeRetainedValue() else { return "?" }
  return s as String
}

func channels(_ id: AudioDeviceID, _ scope: AudioObjectPropertyScope) -> Int {
  var a = addr(kAudioDevicePropertyStreamConfiguration, scope); var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(id, &a, 0, nil, &size) == noErr, size > 0 else { return 0 }
  let buf = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: 16); defer { buf.deallocate() }
  guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, buf) == noErr else { return 0 }
  return UnsafeMutableAudioBufferListPointer(buf.assumingMemoryBound(to: AudioBufferList.self)).reduce(0) { $0 + Int($1.mNumberChannels) }
}

func getDefault(_ sel: AudioObjectPropertySelector) -> AudioDeviceID {
  var a = addr(sel); var id = AudioDeviceID(0); var size = UInt32(MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(system, &a, 0, nil, &size, &id); return id
}

func setDefault(_ sel: AudioObjectPropertySelector, _ id: AudioDeviceID) -> OSStatus {
  var a = addr(sel); var dev = id
  return AudioObjectSetPropertyData(system, &a, 0, nil, UInt32(MemoryLayout<AudioDeviceID>.size), &dev)
}

var lastPresent: Bool? = nil

func enforce(reason: String) {
  let matches = devices().filter { string($0, kAudioObjectPropertyName).localizedCaseInsensitiveContains(needle) }
  let output = matches.first { channels($0, kAudioObjectPropertyScopeOutput) > 0 }
  let input = matches.first { channels($0, kAudioObjectPropertyScopeInput) > 0 }
  let present = output != nil || input != nil
  if present != lastPresent {
    say(present ? "PREFERRED_AUDIO_PRESENT needle=\(needle) uid=\(string((output ?? input)!, kAudioDevicePropertyDeviceUID))"
                : "PREFERRED_AUDIO_ABSENT needle=\(needle) reason=not_connected fallback=macos_default")
    lastPresent = present
  }
  let targets: [(String, AudioObjectPropertySelector, AudioDeviceID?)] = [
    ("output", kAudioHardwarePropertyDefaultOutputDevice, output),
    ("system_output", kAudioHardwarePropertyDefaultSystemOutputDevice, output),
    ("input", kAudioHardwarePropertyDefaultInputDevice, input),
  ]
  for (role, sel, dev) in targets {
    guard let dev else { continue }
    if getDefault(sel) == dev { continue }
    let st = setDefault(sel, dev)
    say(st == noErr ? "DEFAULT_SET role=\(role) device=\(string(dev, kAudioObjectPropertyName)) reason=\(reason)"
                    : "DEFAULT_SET_FAILED role=\(role) status=\(st) reason=\(reason)")
  }
}

say("AUDIO_PREFER_START needle=\(needle)")
enforce(reason: "startup")
var listen = addr(kAudioHardwarePropertyDevices)
AudioObjectAddPropertyListenerBlock(system, &listen, DispatchQueue.main) { _, _ in
  // Let a freshly attached device finish publishing its streams first.
  DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { enforce(reason: "device_list_changed") }
}
dispatchMain()
