import CoreGraphics

// Put a pointer arriving from the virtual main display onto the single portrait
// display. Preserve its position when it is already there. No event interception.
var count: UInt32 = 0
guard CGGetActiveDisplayList(0, nil, &count) == .success else { exit(1) }
var displays = [CGDirectDisplayID](repeating: 0, count: Int(count))
guard CGGetActiveDisplayList(count, &displays, &count) == .success else { exit(1) }
let portrait = displays.prefix(Int(count)).map { CGDisplayBounds($0) }
    .filter { $0.height > $0.width && $0.width >= 700 }
guard portrait.count == 1, let point = CGEvent(source: nil)?.location else { exit(1) }
if !portrait[0].contains(point) {
    guard CGWarpMouseCursorPosition(CGPoint(x: portrait[0].midX, y: portrait[0].midY)) == .success else { exit(1) }
}
print("mouse_pointer_on_portrait")
