// Read-only CoreAudio snapshot: default devices, channels, rates, volumes and mute.
import CoreAudio
import Foundation

func prop(_ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
          _ el: AudioObjectPropertyElement = kAudioObjectPropertyElementMain) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: el)
}

func devices() -> [AudioDeviceID] {
  var a = prop(kAudioHardwarePropertyDevices)
  var size: UInt32 = 0
  AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size)
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &ids)
  return ids
}

func name(_ id: AudioDeviceID) -> String {
  var a = prop(kAudioObjectPropertyName)
  var n: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &n) == noErr, let s = n?.takeRetainedValue() else { return "?" }
  return s as String
}

func channels(_ id: AudioDeviceID, _ scope: AudioObjectPropertyScope) -> Int {
  var a = prop(kAudioDevicePropertyStreamConfiguration, scope)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(id, &a, 0, nil, &size) == noErr, size > 0 else { return 0 }
  let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: 16)
  defer { raw.deallocate() }
  guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, raw) == noErr else { return 0 }
  let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
  return list.reduce(0) { $0 + Int($1.mNumberChannels) }
}

func rate(_ id: AudioDeviceID) -> Double {
  var a = prop(kAudioDevicePropertyNominalSampleRate)
  var r: Float64 = 0
  var size = UInt32(MemoryLayout<Float64>.size)
  AudioObjectGetPropertyData(id, &a, 0, nil, &size, &r)
  return r
}

func defaultDev(_ sel: AudioObjectPropertySelector) -> AudioDeviceID {
  var a = prop(sel)
  var id: AudioDeviceID = 0
  var size = UInt32(MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &id)
  return id
}

// Returns element -> scalar for elements that expose a volume.
func volumes(_ id: AudioDeviceID, _ scope: AudioObjectPropertyScope) -> [UInt32: Float32] {
  var out: [UInt32: Float32] = [:]
  for el in [UInt32(0), 1, 2] {
    var a = prop(kAudioDevicePropertyVolumeScalar, scope, el)
    if !AudioObjectHasProperty(id, &a) { continue }
    var v: Float32 = 0
    var size = UInt32(MemoryLayout<Float32>.size)
    if AudioObjectGetPropertyData(id, &a, 0, nil, &size, &v) == noErr { out[el] = v }
  }
  return out
}

func mute(_ id: AudioDeviceID, _ scope: AudioObjectPropertyScope) -> Int? {
  var a = prop(kAudioDevicePropertyMute, scope, 0)
  if !AudioObjectHasProperty(id, &a) { return nil }
  var v: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  return AudioObjectGetPropertyData(id, &a, 0, nil, &size, &v) == noErr ? Int(v) : nil
}

func info(_ id: AudioDeviceID) -> [String: Any] {
  let oc = channels(id, kAudioObjectPropertyScopeOutput), ic = channels(id, kAudioObjectPropertyScopeInput)
  var d: [String: Any] = ["name": name(id), "id": Int(id), "outCh": oc, "inCh": ic, "rate": rate(id)]
  if oc > 0 {
    d["outVol"] = volumes(id, kAudioObjectPropertyScopeOutput).map { ["el": Int($0.key), "v": $0.value] }
    d["outMute"] = mute(id, kAudioObjectPropertyScopeOutput) as Any
  }
  if ic > 0 { d["inVol"] = volumes(id, kAudioObjectPropertyScopeInput).map { ["el": Int($0.key), "v": $0.value] } }
  return d
}

let all = devices().map(info)
let res: [String: Any] = ["defaultOutput": name(defaultDev(kAudioHardwarePropertyDefaultOutputDevice)),
  "defaultInput": name(defaultDev(kAudioHardwarePropertyDefaultInputDevice)), "devices": all]
print(String(data: try! JSONSerialization.data(withJSONObject: res, options: [.sortedKeys]), encoding: .utf8)!)
