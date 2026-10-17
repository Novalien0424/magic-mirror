// play <deviceName> <file> <gain> <loop 0|1> <maxSeconds>
// Plays a file on a named CoreAudio output device via AVAudioEngine; prints PLAYING when started.
import AVFoundation
import CoreAudio
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let a = CommandLine.arguments
guard a.count == 6, let gain = Float(a[3]), let maxSec = Double(a[5]) else { fputs("usage\n", stderr); exit(2) }
let loop = a[4] == "1"

func deviceID(named n: String) -> AudioDeviceID? {
  var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
  var size: UInt32 = 0
  AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size)
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids)
  for id in ids {
    var na = AudioObjectPropertyAddress(mSelector: kAudioObjectPropertyName, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var cf: Unmanaged<CFString>?
    var s = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    var sa = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: kAudioObjectPropertyScopeOutput, mElement: kAudioObjectPropertyElementMain)
    var ss: UInt32 = 0
    AudioObjectGetPropertyDataSize(id, &sa, 0, nil, &ss)
    if ss == 0 { continue }
    if AudioObjectGetPropertyData(id, &na, 0, nil, &s, &cf) == noErr, let str = cf?.takeRetainedValue() as String?, str == n { return id }
  }
  return nil
}

guard var dev = deviceID(named: a[1]) else { fputs("device_not_found\n", stderr); exit(3) }
let engine = AVAudioEngine()
let out = engine.outputNode
guard let unit = out.audioUnit else { fputs("no_output_unit\n", stderr); exit(4) }
let st = AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &dev, UInt32(MemoryLayout<AudioDeviceID>.size))
if st != noErr { fputs("set_device_failed \(st)\n", stderr); exit(5) }

let file = try AVAudioFile(forReading: URL(fileURLWithPath: a[2]))
guard let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else { exit(6) }
try file.read(into: buf)
let player = AVAudioPlayerNode()
engine.attach(player)
engine.connect(player, to: engine.mainMixerNode, format: buf.format)
engine.mainMixerNode.outputVolume = 1
player.volume = gain
engine.prepare()
try engine.start()
player.scheduleBuffer(buf, at: nil, options: loop ? .loops : [], completionHandler: nil)
player.play()
print("PLAYING")

signal(SIGTERM) { _ in exit(0) }
signal(SIGINT) { _ in exit(0) }
let dur = Double(buf.frameLength) / buf.format.sampleRate
let wait = loop ? maxSec : min(maxSec, dur + 0.25)
RunLoop.main.run(until: Date(timeIntervalSinceNow: wait))
player.stop()
engine.stop()
print("DONE")
