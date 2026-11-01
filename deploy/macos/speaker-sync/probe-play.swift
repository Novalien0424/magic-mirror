// MM sync probe player: one long buffer (soft bed + chirps) scheduled at a host time; logs exact chirp host times.
// Args: --out <json> [--device <uid>] [--lead s] [--count n] [--period s] [--bed amp]
import AVFoundation
import CoreAudio
import AudioToolbox
func arg(_ k: String, _ d: String) -> String { let a = CommandLine.arguments; if let i = a.firstIndex(of: k), i + 1 < a.count { return a[i + 1] }; return d }
let out = arg("--out", "/tmp/mmsync-play.json"), deviceUID = arg("--device", "")
let lead = Double(arg("--lead", "6"))!, count = Int(arg("--count", "30"))!, period = Double(arg("--period", "1.0"))!, bedAmp = Float(arg("--bed", "0.04"))!
var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
func secs(_ h: UInt64) -> Double { Double(h) * Double(tb.numer) / Double(tb.denom) / 1e9 }
func ticks(_ s: Double) -> UInt64 { UInt64(s * 1e9 * Double(tb.denom) / Double(tb.numer)) }
func a(_ s: AudioObjectPropertySelector, _ sc: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress { .init(mSelector: s, mScope: sc, mElement: kAudioObjectPropertyElementMain) }
func u32(_ id: AudioObjectID, _ s: AudioObjectPropertySelector, _ sc: AudioObjectPropertyScope) -> UInt32 { var p = a(s, sc); var v: UInt32 = 0; var n: UInt32 = 4; AudioObjectGetPropertyData(id, &p, 0, nil, &n, &v); return v }
func deviceID(_ uid: String) -> AudioDeviceID {
  var p = a(kAudioHardwarePropertyTranslateUIDToDevice); var cf = uid as CFString; var id: AudioDeviceID = 0; var n = UInt32(4)
  _ = withUnsafePointer(to: &cf) { AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &p, UInt32(MemoryLayout<CFString>.size), $0, &n, &id) }
  return id
}
let engine = AVAudioEngine()
var dev: AudioDeviceID = 0
if !deviceUID.isEmpty {
  dev = deviceID(deviceUID)
  guard dev != 0, let unit = engine.outputNode.audioUnit else { print("device not found"); exit(2) }
  var d = dev; guard AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &d, 4) == noErr else { print("set device failed"); exit(2) }
} else { var p = a(kAudioHardwarePropertyDefaultOutputDevice); var n = UInt32(4); AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &p, 0, nil, &n, &dev) }
let rate = engine.outputNode.outputFormat(forBus: 0).sampleRate
let fmt = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
let player = AVAudioPlayerNode(); engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: fmt)
// Irregular spacing (deterministic) so a ~2 s delay cannot alias onto another chirp.
var chirpTimes: [Double] = []; var acc = 0.0; var seed: UInt64 = 0x5eed
for _ in 0..<count { chirpTimes.append(acc); seed = seed &* 6364136223846793005 &+ 1442695040888963407; acc += period * (0.75 + Double(seed >> 40) / Double(1 << 24) * 0.6) }
let total = lead + acc + 2.5
let frames = AVAudioFrameCount(total * rate)
let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: frames)!; buf.frameLength = frames
let L = buf.floatChannelData![0], R = buf.floatChannelData![1]
let dur = 0.08, f0 = 500.0, f1 = 4000.0, k = log(f1 / f0)
for n in 0..<Int(frames) {
  let t = Double(n) / rate
  let fade = Float(min(1.0, t / 0.5, (total - t) / 0.5))
  var s = bedAmp * fade * Float(sin(2 * .pi * 220 * t))
  if let c = chirpTimes.last(where: { $0 <= t - lead }) {
    let ph = t - lead - c
    if ph < dur { s += 0.5 * Float(pow(sin(.pi * ph / dur), 2) * sin(2 * .pi * f0 * dur / k * (exp(ph / dur * k) - 1))) }
  }
  L[n] = s; R[n] = s
}
do { try engine.start() } catch { print("engine start failed \(error)"); exit(3) }
let startHost = mach_absolute_time() + ticks(1.0)
player.scheduleBuffer(buf, at: AVAudioTime(hostTime: startHost), options: [], completionHandler: nil)
player.play()
var sp = a(kAudioDevicePropertyStreams, kAudioDevicePropertyScopeOutput); var sn: UInt32 = 0
AudioObjectGetPropertyDataSize(dev, &sp, 0, nil, &sn); var streams = [AudioStreamID](repeating: 0, count: Int(sn)/4); if sn > 0 { AudioObjectGetPropertyData(dev, &sp, 0, nil, &sn, &streams) }
var np = a(kAudioObjectPropertyName); var name: Unmanaged<CFString>?; var nn = UInt32(MemoryLayout<Unmanaged<CFString>?>.size); AudioObjectGetPropertyData(dev, &np, 0, nil, &nn, &name)
var drp = a(kAudioDevicePropertyNominalSampleRate); var drate: Float64 = 0; var drn = UInt32(8); AudioObjectGetPropertyData(dev, &drp, 0, nil, &drn, &drate)
let info: [String: Any] = ["device": (name?.takeRetainedValue() as String?) ?? "?", "engineRate": rate, "deviceRate": drate,
  "deviceLatency": u32(dev, kAudioDevicePropertyLatency, kAudioDevicePropertyScopeOutput), "safety": u32(dev, kAudioDevicePropertySafetyOffset, kAudioDevicePropertyScopeOutput),
  "streamLatency": streams.first.map { u32($0, kAudioStreamPropertyLatency, kAudioObjectPropertyScopeGlobal) } ?? 0,
  "startHost": secs(startHost), "lead": lead, "period": period, "count": count,
  "chirps": chirpTimes.map { secs(startHost) + lead + $0 }]
try! JSONSerialization.data(withJSONObject: info, options: [.sortedKeys]).write(to: URL(fileURLWithPath: out))
print("scheduled start=\(secs(startHost)) total=\(total)s device=\(info["device"]!)")
Thread.sleep(forTimeInterval: total + 1.5)
engine.stop()
