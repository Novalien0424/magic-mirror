// QA only: quiet physical output volumes; restore by UID; external speakers return to their
// calibrated normal level (owner rule; 70% when uncalibrated).
// Restore unmutes external speakers; never touches input gain, default devices or the runtime key.
import Foundation
import CoreAudio
func addr(_ s: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, _ e: UInt32 = 0) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector:s,mScope:scope,mElement:e)
}
func text(_ id: UInt32, _ s: AudioObjectPropertySelector) -> String {
  var a=addr(s), value: Unmanaged<CFString>?, n=UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id,&a,0,nil,&n,&value)==noErr else{return ""}
  return value?.takeRetainedValue() as String? ?? ""
}
/// Calibrated normal levels (owner 2026-11-07): `ops/music-device/speaker-levels.json`,
/// `{"normal": {"Jabra Speak2 75": 0.7, "A1": 0.55, "EDIFIER": 0.4}}`; a speaker whose name
/// starts with a key uses it, others the Jabra's. Missing or invalid file: 70%.
/// Same rule in stop-state.swift, music-loop.swift and src/main/speaker-levels.ts.
func normalLevel(_ name: String) -> Float32 {
  let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/MagicMirror/ops/music-device/speaker-levels.json")
  guard let data = try? Data(contentsOf: url), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let normal = root["normal"] as? [String: Any] else { return 0.7 }
  var levels: [(String, Float32)] = []
  for (key, raw) in normal {
    guard !key.isEmpty, let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
      number.doubleValue.isFinite, number.doubleValue >= 0, number.doubleValue <= 1 else { return 0.7 }
    levels.append((key, number.floatValue))
  }
  guard let jabra = levels.first(where: { $0.0.caseInsensitiveCompare("Jabra Speak2 75") == .orderedSame })?.1 else { return 0.7 }
  if name.localizedCaseInsensitiveContains("Jabra Speak2 75") { return jabra }
  return levels.sorted { $0.0.count > $1.0.count }.first { name.lowercased().hasPrefix($0.0.lowercased()) }?.1 ?? jabra
}
struct Level: Codable { let uid:String; let element:UInt32; let value:Float32 }
var a=addr(kAudioHardwarePropertyDevices), n:UInt32=0
guard AudioObjectGetPropertyDataSize(1,&a,0,nil,&n)==noErr else{exit(2)}
var devices=[UInt32](repeating:0,count:Int(n)/4)
guard AudioObjectGetPropertyData(1,&a,0,nil,&n,&devices)==noErr, CommandLine.arguments.count==3 else{exit(2)}
let file=URL(fileURLWithPath:CommandLine.arguments[2]), quiet=CommandLine.arguments[1]=="quiet"
guard quiet || CommandLine.arguments[1]=="restore" else{exit(2)}
var levels:[Level]=[]
if quiet {
  for id in devices {
    var transport:UInt32=0, size:UInt32=4, t=addr(kAudioDevicePropertyTransportType)
    guard AudioObjectGetPropertyData(id,&t,0,nil,&size,&transport)==noErr,
      ![kAudioDeviceTransportTypeVirtual,kAudioDeviceTransportTypeAggregate].contains(transport) else{continue}
    var master=addr(kAudioDevicePropertyVolumeScalar,kAudioObjectPropertyScopeOutput)
    for element:UInt32 in AudioObjectHasProperty(id,&master) ? [0] : [1,2] {
      var p=addr(kAudioDevicePropertyVolumeScalar,kAudioObjectPropertyScopeOutput,element), writable:DarwinBoolean=false, v:Float32=0
      guard AudioObjectHasProperty(id,&p),AudioObjectIsPropertySettable(id,&p,&writable)==noErr,writable.boolValue,
        AudioObjectGetPropertyData(id,&p,0,nil,&size,&v)==noErr else{continue}
      levels.append(Level(uid:text(id,kAudioDevicePropertyDeviceUID),element:element,value:v))
    }
  }
  try JSONEncoder().encode(levels).write(to:file,options:.withoutOverwriting)
} else { levels=try JSONDecoder().decode([Level].self,from:Data(contentsOf:file)) }
var failed=false
for level in levels {
  guard let id=devices.first(where:{text($0,kAudioDevicePropertyDeviceUID)==level.uid}) else{continue}
  var p=addr(kAudioDevicePropertyVolumeScalar,kAudioObjectPropertyScopeOutput,level.element), size:UInt32=4, observed:Float32=0
  var transport:UInt32=0, t=addr(kAudioDevicePropertyTransportType)
  AudioObjectGetPropertyData(id,&t,0,nil,&size,&transport)
  let external = transport != kAudioDeviceTransportTypeBuiltIn
  var value:Float32=quiet ? 0.01 : external ? normalLevel(text(id,kAudioObjectPropertyName)) : level.value
  if AudioObjectSetPropertyData(id,&p,0,nil,4,&value) != noErr || AudioObjectGetPropertyData(id,&p,0,nil,&size,&observed) != noErr || abs(value-observed)>0.015 {failed=true}
  // After QA every external speaker is back in normal use: calibrated level, unmuted (the Jabra's firmware mutes at step 0).
  if !quiet && external { var m=addr(kAudioDevicePropertyMute,kAudioObjectPropertyScopeOutput), off:UInt32=0; if AudioObjectHasProperty(id,&m) { AudioObjectSetPropertyData(id,&m,0,nil,4,&off) } }
}
print(quiet ? "qa_output_quiet=\(!failed)" : "qa_output_restored=\(!failed)")
exit(failed ? 2 : 0)
