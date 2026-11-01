// Reads or sets the latency "Magic Mirror Music" reports to apps (custom property 'mmlt',
// frames at 48 kHz, persisted by the driver). Chromium holds video frames back by it and
// AVPlayer's clock (Dance) follows it. Usage: latency [frames]
import CoreAudio
import Foundation
func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}
var translate = address(kAudioHardwarePropertyTranslateUIDToDevice), uid = "MagicMirrorMusic_UID" as CFString, device: AudioDeviceID = 0
var size = UInt32(MemoryLayout<AudioDeviceID>.size)
let status = withUnsafePointer(to: &uid) {
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &translate, UInt32(MemoryLayout<CFString>.size), $0, &size, &device)
}
guard status == noErr, device != 0 else { print("music_device_missing"); exit(1) }
let mmlt = AudioObjectPropertySelector(0x6d6d6c74) // 'mmlt'
if let text = CommandLine.arguments.dropFirst().first {
  guard var frames = Int32(text), frames >= 0, frames <= 480_000 else { print("latency_frames_invalid"); exit(2) }
  var property = address(mmlt), value: CFNumber = CFNumberCreate(nil, .sInt32Type, &frames)
  // The HAL takes a pointer to the CFNumberRef.
  let result = withUnsafePointer(to: &value) { AudioObjectSetPropertyData(device, &property, 0, nil, UInt32(MemoryLayout<CFNumber>.size), $0) }
  guard result == noErr else { print("latency_set_failed"); exit(1) }
}
var reported = address(kAudioDevicePropertyLatency, kAudioObjectPropertyScopeOutput), frames: UInt32 = 0, n = UInt32(4)
guard AudioObjectGetPropertyData(device, &reported, 0, nil, &n, &frames) == noErr else { print("latency_read_failed"); exit(1) }
print("music_device_latency frames=\(frames) ms=\(String(format: "%.1f", Double(frames) / 48.0))")
