// MM sync probe recorder: default input (Jabra) with the host time of every buffer.
// Args: --out <prefix> --seconds n   -> <prefix>.f32 (mono float32) + <prefix>.json
import AVFoundation
import CoreAudio
import AudioToolbox
func arg(_ k: String, _ d: String) -> String { let a = CommandLine.arguments; if let i = a.firstIndex(of: k), i + 1 < a.count { return a[i + 1] }; return d }
let prefix = arg("--out", "/tmp/mmsync-rec"), seconds = Double(arg("--seconds", "10"))!
var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
func secs(_ h: UInt64) -> Double { Double(h) * Double(tb.numer) / Double(tb.denom) / 1e9 }
let engine = AVAudioEngine(); let input = engine.inputNode
let devUID = arg("--device", "")
var dev: AudioDeviceID = 0
if !devUID.isEmpty {
  var p = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyTranslateUIDToDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var cf = devUID as CFString; var id: AudioDeviceID = 0; var n = UInt32(4)
  _ = withUnsafePointer(to: &cf) { AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &p, UInt32(MemoryLayout<CFString>.size), $0, &n, &id) }
  guard id != 0, let unit = input.audioUnit else { print("input device not found"); exit(2) }
  var d = id; guard AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &d, 4) == noErr else { print("set input failed"); exit(2) }
  dev = id
} else {
  var p = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultInputDevice, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var n = UInt32(MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &p, 0, nil, &n, &dev)
}
engine.reset()
let hw = input.inputFormat(forBus: 0)
let fmt = AVAudioFormat(standardFormatWithSampleRate: hw.sampleRate, channels: hw.channelCount)!
FileManager.default.createFile(atPath: prefix + ".f32", contents: nil)
let fh = FileHandle(forWritingAtPath: prefix + ".f32")!
var marks: [[Double]] = []; var written = 0; var peak: Float = 0
let lock = NSLock()
input.installTap(onBus: 0, bufferSize: 2048, format: fmt) { b, t in
  let n = Int(b.frameLength); let p = b.floatChannelData![0]
  var data = Data(count: n * 4); data.withUnsafeMutableBytes { $0.copyMemory(from: UnsafeRawBufferPointer(start: p, count: n * 4)) }
  for i in 0..<n { peak = max(peak, abs(p[i])) }
  lock.lock(); if t.isHostTimeValid { marks.append([Double(written), secs(t.hostTime)]) }; written += n; lock.unlock()
  fh.write(data)
}
do { try engine.start() } catch { print("engine start failed \(error)"); exit(3) }
let t0 = secs(mach_absolute_time())
Thread.sleep(forTimeInterval: seconds)
engine.stop(); input.removeTap(onBus: 0); try? fh.close()
func u32(_ s: AudioObjectPropertySelector) -> UInt32 { var p = AudioObjectPropertyAddress(mSelector: s, mScope: kAudioDevicePropertyScopeInput, mElement: kAudioObjectPropertyElementMain); var v: UInt32 = 0; var n: UInt32 = 4; AudioObjectGetPropertyData(dev, &p, 0, nil, &n, &v); return v }
let info: [String: Any] = ["rate": fmt.sampleRate, "channels": fmt.channelCount, "frames": written, "startedAt": t0, "peak": peak,
  "inputLatency": u32(kAudioDevicePropertyLatency), "inputSafety": u32(kAudioDevicePropertySafetyOffset), "marks": marks]
try! JSONSerialization.data(withJSONObject: info).write(to: URL(fileURLWithPath: prefix + ".json"))
print("recorded frames=\(written) rate=\(fmt.sampleRate) peak=\(peak)")
