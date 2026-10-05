// Local synthetic visitor speech. Audio stays in pipes/RAM; no recording file.
import AVFoundation
import Foundation

let input = FileHandle.standardInput.readDataToEndOfFile()
let texts = try JSONDecoder().decode([String].self, from: input)
final class Completion: NSObject, AVSpeechSynthesizerDelegate {
    var finished = false
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { finished = true }
}
let synthesizer = AVSpeechSynthesizer()
let completion = Completion()
synthesizer.delegate = completion
var results: [String] = []
for text in texts {
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    utterance.rate = 0.51
    var samples = Data()
    var sampleRate: UInt32 = 22050
    completion.finished = false
    synthesizer.write(utterance) { buffer in
        guard let pcm = buffer as? AVAudioPCMBuffer else { return }
        if pcm.frameLength == 0 { return }
        sampleRate = UInt32(pcm.format.sampleRate)
        guard let channel = pcm.floatChannelData?[0] else { return }
        for i in 0..<Int(pcm.frameLength) {
            var value = Int16(max(-32767, min(32767, channel[i] * 32767))).littleEndian
            withUnsafeBytes(of: &value) { samples.append(contentsOf: $0) }
        }
    }
    let deadline = Date().addingTimeInterval(30)
    while !completion.finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
    guard completion.finished && !samples.isEmpty else { exit(2) }
    var wav = Data()
    func string(_ value: String) { wav.append(value.data(using: .ascii)!) }
    func u32(_ value: UInt32) { var v = value.littleEndian; withUnsafeBytes(of: &v) { wav.append(contentsOf: $0) } }
    func u16(_ value: UInt16) { var v = value.littleEndian; withUnsafeBytes(of: &v) { wav.append(contentsOf: $0) } }
    string("RIFF"); u32(UInt32(samples.count) + 36); string("WAVEfmt "); u32(16)
    u16(1); u16(1); u32(sampleRate); u32(sampleRate * 2); u16(2); u16(16)
    string("data"); u32(UInt32(samples.count)); wav.append(samples)
    results.append(wav.base64EncodedString())
}
FileHandle.standardOutput.write(try JSONEncoder().encode(results))
