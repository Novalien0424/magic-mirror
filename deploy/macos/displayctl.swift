// Magic Mirror field ops: inspect and arrange macOS displays by name.
//
//   displayctl list
//   displayctl modes  <name>
//   displayctl mode   <name> <width> <height> <hz> [--session]
//   displayctl rotate <name> <0|90|180|270>
//   displayctl main   <name>          # make <name> the menu-bar display; others to its right
//   displayctl unmirror
//
// <name> is a case-insensitive substring of the display name (e.g. "T749" for the
// HAOCROWN mirror's RK628D HDMI-in, "MB16" for the ASUS operator monitor).
// Rotation uses the private MonitorPanel framework (no public API exists);
// everything else is public CoreGraphics.
import AppKit
import CoreGraphics
import Foundation

func fail(_ msg: String) -> Never { FileHandle.standardError.write((msg + "\n").data(using: .utf8)!); exit(1) }

func online() -> [CGDirectDisplayID] {
  var ids = [CGDirectDisplayID](repeating: 0, count: 16); var n: UInt32 = 0
  CGGetOnlineDisplayList(16, &ids, &n); return Array(ids.prefix(Int(n)))
}

func name(_ id: CGDirectDisplayID) -> String {
  NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == id }?
    .localizedName ?? "display-\(id)"
}

func find(_ match: String) -> CGDirectDisplayID {
  let hits = online().filter { name($0).localizedCaseInsensitiveContains(match) }
  guard let first = hits.min() else { fail("NO_MATCH name=\(match) online=\(online().map(name))") }
  return first
}

func commit(_ body: (CGDisplayConfigRef?) -> Void, _ option: CGConfigureOption = .permanently) {
  var cfg: CGDisplayConfigRef?
  guard CGBeginDisplayConfiguration(&cfg) == .success else { fail("CONFIG_BEGIN_FAILED") }
  body(cfg)
  let r = CGCompleteDisplayConfiguration(cfg, option)
  guard r == .success else { fail("CONFIG_COMPLETE_FAILED status=\(r.rawValue)") }
}

let opts = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
let a = CommandLine.arguments
switch a.count > 1 ? a[1] : "list" {
case "list":
  for d in online() {
    let b = CGDisplayBounds(d); let m = CGDisplayCopyDisplayMode(d)
    print("- \(name(d)) id=\(d) main=\(CGDisplayIsMain(d) != 0) mirrorOf=\(CGDisplayMirrorsDisplay(d)) rotation=\(Int(CGDisplayRotation(d))) origin=\(Int(b.origin.x)),\(Int(b.origin.y)) size=\(Int(b.width))x\(Int(b.height)) pixels=\(m?.pixelWidth ?? 0)x\(m?.pixelHeight ?? 0) hz=\(m?.refreshRate ?? 0)")
  }
case "modes":
  guard a.count == 3 else { fail("usage: displayctl modes <name>") }
  var seen = Set<String>()
  for m in (CGDisplayCopyAllDisplayModes(find(a[2]), opts) as? [CGDisplayMode] ?? []) where m.isUsableForDesktopGUI() {
    let k = "\(m.pixelWidth)x\(m.pixelHeight) ui=\(m.width)x\(m.height) @\(m.refreshRate)Hz"
    if seen.insert(k).inserted { print("- " + k) }
  }
case "mode":
  guard a.count >= 6, let w = Int(a[3]), let h = Int(a[4]), let hz = Double(a[5]) else { fail("usage: displayctl mode <name> <w> <h> <hz> [--session]") }
  let d = find(a[2])
  // Prefer the non-HiDPI mode (ui size == pixel size) for an exact signal.
  let all = (CGDisplayCopyAllDisplayModes(d, opts) as? [CGDisplayMode] ?? []).filter {
    $0.pixelWidth == w && $0.pixelHeight == h && $0.refreshRate == hz && $0.isUsableForDesktopGUI()
  }
  guard let m = all.first(where: { $0.width == w }) ?? all.first else { fail("NO_SUCH_MODE \(w)x\(h)@\(hz)") }
  commit({ CGConfigureDisplayWithDisplayMode($0, d, m, nil) }, a.contains("--session") ? .forSession : .permanently)
  print("MODE_SET \(name(d)) \(w)x\(h)@\(hz)")
case "rotate":
  guard a.count == 4, let deg = Int(a[3]), [0, 90, 180, 270].contains(deg) else { fail("usage: displayctl rotate <name> <0|90|180|270>") }
  let target = find(a[2])
  guard dlopen("/System/Library/PrivateFrameworks/MonitorPanel.framework/MonitorPanel", RTLD_NOW) != nil,
        let cls = NSClassFromString("MPDisplayMgr") as? NSObject.Type,
        let displays = cls.init().value(forKey: "displays") as? [NSObject],
        let mp = displays.first(where: { ($0.value(forKey: "displayID") as? NSNumber)?.uint32Value == target })
  else { fail("ROTATE_UNAVAILABLE (MonitorPanel private API missing or display not found)") }
  mp.setValue(NSNumber(value: deg), forKey: "orientation")
  print("ROTATED \(name(target)) \(deg)")
case "main":
  guard a.count == 3 else { fail("usage: displayctl main <name>") }
  let m = find(a[2])
  commit { cfg in
    CGConfigureDisplayOrigin(cfg, m, 0, 0)
    var x = Int32(CGDisplayBounds(m).width)
    for d in online() where d != m && CGDisplayMirrorsDisplay(d) == 0 {
      CGConfigureDisplayOrigin(cfg, d, x, 0); x += Int32(CGDisplayBounds(d).width)
    }
  }
  print("MAIN_SET \(name(m))")
case "unmirror":
  commit { cfg in for d in online() where CGDisplayIsInMirrorSet(d) != 0 { CGConfigureDisplayMirrorOfDisplay(cfg, d, kCGNullDirectDisplay) } }
  print("UNMIRRORED")
default:
  fail("unknown command \(a[1]); see header comment")
}
