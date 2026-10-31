// Read-only bounded audio decoding. Emits timing/energy features, never PCM.
import Foundation
import AVFoundation
import Darwin

func emit(_ value: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: value) { try? FileHandle.standardOutput.write(contentsOf: data + Data([10])) }
}
func analyse() throws {
  guard CommandLine.arguments.count == 3, #available(macOS 14.0, *) else { throw NSError(domain: "analysis", code: 1) }
  let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]), options: [AVURLAssetOverrideMIMETypeKey: CommandLine.arguments[2]])
  guard let track = asset.tracks(withMediaType: .audio).first else { throw NSError(domain: "analysis", code: 2) }
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM,
    AVSampleRateKey: 22050, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 32,
    AVLinearPCMIsFloatKey: true, AVLinearPCMIsNonInterleaved: false, AVLinearPCMIsBigEndianKey: false])
  output.alwaysCopiesSampleData = false
  guard reader.canAdd(output) else { throw NSError(domain: "analysis", code: 3) }
  reader.add(output)
  guard reader.startReading() else { throw reader.error ?? NSError(domain: "analysis", code: 4) }
  let parent = getppid(), sampleRate = 22050.0, hop = 220
  let bassA = 1 - exp(-2 * Double.pi * 180 / sampleRate), midA = 1 - exp(-2 * Double.pi * 2000 / sampleRate)
  var bass = 0.0, mid = 0.0, total = 0, count = 0, sum = [Double](repeating: 0, count: 4)
  var batch: [[Double]] = []
  while reader.status == .reading {
    if getppid() != parent || parent == 1 { reader.cancelReading(); exit(0) }
    guard let sample = output.copyNextSampleBuffer() else { break }
    guard let block = CMSampleBufferGetDataBuffer(sample) else { throw NSError(domain: "analysis", code: 5) }
    let bytes = CMBlockBufferGetDataLength(block)
    var values = [Float](repeating: 0, count: bytes / 4)
    let copied = values.withUnsafeMutableBytes { buffer in CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: bytes, destination: buffer.baseAddress!) }
    guard copied == kCMBlockBufferNoErr else { throw NSError(domain: "analysis", code: 6) }
    for raw in values {
      let x = Double(raw)
      guard x.isFinite else { throw NSError(domain: "analysis", code: 7) }
      bass += bassA * (x - bass); mid += midA * (x - mid)
      sum[0] += x*x; sum[1] += bass*bass; sum[2] += (mid-bass)*(mid-bass); sum[3] += (x-mid)*(x-mid)
      count += 1; total += 1
      if count == hop {
        batch.append([Double(total-hop)/sampleRate] + sum.map { sqrt($0/Double(hop)) })
        count = 0; sum = [Double](repeating: 0, count: 4)
        if batch.count == 500 { emit(["event": "features", "frames": batch]); batch.removeAll(keepingCapacity: true) }
      }
      if total > Int(sampleRate * 6 * 3600) { reader.cancelReading(); throw NSError(domain: "analysis", code: 8) }
    }
    CMSampleBufferInvalidate(sample)
  }
  guard reader.status == .completed else { throw reader.error ?? NSError(domain: "analysis", code: 9) }
  if !batch.isEmpty { emit(["event": "features", "frames": batch]) }
  emit(["event": "complete", "durationMs": Double(total)/sampleRate*1000])
}
signal(SIGPIPE, SIG_IGN)
do { try analyse() } catch {
  let e = error as NSError, underlying = e.userInfo[NSUnderlyingErrorKey] as? NSError
  emit(["event": "failed", "reason": "dance_analysis_decode_failed", "code": e.code, "underlyingCode": underlying?.code ?? 0]); exit(1)
}
