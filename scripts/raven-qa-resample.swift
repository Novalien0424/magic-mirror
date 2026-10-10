// Independent, RAM-only diagnostic resampling. stdin/stdout are mono int16 PCM.
import AVFoundation
import Foundation

guard CommandLine.arguments.count == 3,
      let inputRate = Double(CommandLine.arguments[1]), (8000...96000).contains(inputRate),
      let outputRate = Double(CommandLine.arguments[2]), (8000...96000).contains(outputRate) else { exit(2) }
let bytes = FileHandle.standardInput.readDataToEndOfFile()
guard !bytes.isEmpty, bytes.count % 2 == 0, bytes.count <= Int(inputRate * 15) * 2,
      let sourceFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: inputRate, channels: 1, interleaved: false),
      let targetFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: outputRate, channels: 1, interleaved: false),
      let converter = AVAudioConverter(from: sourceFormat, to: targetFormat),
      let target = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: 4096) else { exit(2) }
var offset = 0
var result = Data()
while true {
    var error: NSError?
    let status = converter.convert(to: target, error: &error) { requested, state in
        let count = min(Int(requested), bytes.count / 2 - offset)
        if count == 0 { state.pointee = .endOfStream; return nil }
        guard let source = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: AVAudioFrameCount(count)),
              let samples = source.floatChannelData?[0] else { state.pointee = .endOfStream; return nil }
        bytes.withUnsafeBytes { raw in
            for i in 0..<count { samples[i] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: (offset + i) * 2, as: Int16.self))) / 32768 }
        }
        offset += count
        source.frameLength = AVAudioFrameCount(count)
        state.pointee = .haveData
        return source
    }
    guard status != .error, error == nil, let samples = target.floatChannelData?[0] else { exit(2) }
    for i in 0..<Int(target.frameLength) {
        var value = Int16(max(-32768, min(32767, (samples[i] * 32768).rounded()))).littleEndian
        withUnsafeBytes(of: &value) { result.append(contentsOf: $0) }
    }
    if status == .endOfStream { break }
    guard status == .haveData, result.count <= Int(outputRate * 16) * 2 else { exit(2) }
}
FileHandle.standardOutput.write(result)
