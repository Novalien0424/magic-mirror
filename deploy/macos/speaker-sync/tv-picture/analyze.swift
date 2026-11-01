// QA probe: per recorded board frame, read the board's overlay clock (Vision OCR) and the Mac clock barcode.
// Output CSV: board_ms_of_day,mac_ms_low24,valid
import AppKit
import Vision
let dir = CommandLine.arguments[1]
let files = try FileManager.default.contentsOfDirectory(atPath: dir).filter { $0.hasSuffix(".png") }.sorted()
let regex = try NSRegularExpression(pattern: "(\\d{2}):(\\d{2}):(\\d{2})\\.(\\d{3})")
for name in files {
  guard let image = NSImage(contentsOfFile: dir + "/" + name), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let w = cg.width, h = cg.height
  guard let data = cg.dataProvider?.data, let ptr = CFDataGetBytePtr(data) else { continue }
  let bpp = cg.bitsPerPixel / 8, bpr = cg.bytesPerRow
  func lum(_ x: Int, _ y: Int) -> Int { let o = y * bpr + x * bpp; return (Int(ptr[o]) + Int(ptr[o+1]) + Int(ptr[o+2])) / 3 }
  // Board landscape: 7 columns (Mac rows 0..6, left to right) x 4 rows (Mac cols 3..0, top to bottom).
  func cell(_ i: Int) -> Bool {
    let r = i / 4, c = i % 4, cx = r, cy = 3 - c
    let x = Int((Double(cx) + 0.5) * Double(w) / 7), y = Int((Double(cy) + 0.6) * Double(h) / 4)
    var sum = 0; for dx in -3...3 { for dy in -3...3 { sum += lum(x + dx * 2, y + dy * 2) } }
    return sum / 49 > 128
  }
  let valid = cell(24) && !cell(25) && cell(26) && !cell(27)
  var gray: UInt64 = 0
  for i in 0..<24 where cell(i) { gray |= 1 << UInt64(i) }
  var bin = gray, shift: UInt64 = 1
  while shift < 32 { bin ^= bin >> shift; shift <<= 1 }
  let crop = cg.cropping(to: CGRect(x: 0, y: 0, width: min(w, 320), height: 34))!
  let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = false
  try VNImageRequestHandler(cgImage: crop).perform([request])
  let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
  var boardMs = -1
  if let m = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) {
    let part = { (k: Int) in Int((text as NSString).substring(with: m.range(at: k)))! }
    boardMs = ((part(1) * 60 + part(2)) * 60 + part(3)) * 1000 + part(4)
  }
  print("\(name),\(boardMs),\(bin & 0xFFFFFF),\(valid ? 1 : 0)")
}
