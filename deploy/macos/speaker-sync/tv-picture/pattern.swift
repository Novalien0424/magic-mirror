// QA probe: shows the Mac wall clock (ms, Gray-coded, 24 bits) as a 4x7 cell grid on the TV display.
import AppKit
let seconds = Double(CommandLine.arguments.dropFirst().first ?? "20") ?? 20
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
guard let screen = NSScreen.screens.first(where: { $0.localizedName.contains("T749") })
  ?? NSScreen.screens.first(where: { $0 != NSScreen.screens.first }) else { print("no_tv_screen"); exit(2) }
final class Grid: NSView {
  override var isOpaque: Bool { true }
  override func draw(_ dirty: NSRect) {
    let ms = UInt64(Date().timeIntervalSince1970 * 1000)
    let code = (ms ^ (ms >> 1)) & 0xFFFFFF
    let cols = 4, rows = 7, w = bounds.width / CGFloat(cols), h = bounds.height / CGFloat(rows)
    for i in 0..<(cols * rows) {
      let on: Bool
      switch i { case 0..<24: on = (code >> UInt64(i)) & 1 == 1; case 24, 26: on = true; default: on = false }
      (on ? NSColor.white : NSColor.black).setFill()
      // Row 0 is the top of the screen.
      NSRect(x: CGFloat(i % cols) * w, y: bounds.height - CGFloat(i / cols + 1) * h, width: w, height: h).fill()
    }
  }
}
let window = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false, screen: screen)
window.level = .screenSaver; window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
window.isOpaque = true; window.backgroundColor = .black; window.ignoresMouseEvents = true
let view = Grid(frame: NSRect(origin: .zero, size: screen.frame.size)); window.contentView = view
window.setFrame(screen.frame, display: true); window.orderFrontRegardless()
Timer.scheduledTimer(withTimeInterval: 1.0 / 240, repeats: true) { _ in view.needsDisplay = true }
DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { exit(0) }
print("pattern_on \(screen.localizedName) \(Int(screen.frame.width))x\(Int(screen.frame.height))")
app.run()
