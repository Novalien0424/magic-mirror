// Diagnostic comparisons only; never repairs transcripts or authorizes effects.
// Inputs and transformed text stay in RAM. Output contains no recognized text.
import Foundation
struct Pair: Decodable { let expected: String; let actual: String }
let pairs = try JSONDecoder().decode([Pair].self, from: FileHandle.standardInput.readDataToEndOfFile())
let result = pairs.map { pair -> [String: Any] in
    let expected = Array(pair.expected), actual = Array(pair.actual)
    var previous = Array(0...actual.count)
    for (i, a) in expected.enumerated() {
        var row = [i + 1]
        for (j, b) in actual.enumerated() {
            row.append(min(previous[j + 1] + 1, row[j] + 1, previous[j] + (a == b ? 0 : 1)))
        }
        previous = row
    }
    let expectedTraditional = pair.expected.applyingTransform(StringTransform("Hans-Hant"), reverse: false)
    let actualTraditional = pair.actual.applyingTransform(StringTransform("Hans-Hant"), reverse: false)
    return ["expectedCharacters": expected.count, "actualCharacters": actual.count,
            "editDistance": previous.last!, "exact": pair.expected == pair.actual,
            "traditionalScriptEquivalent": expectedTraditional != nil && expectedTraditional == actualTraditional,
            "containsExpected": pair.actual.contains(pair.expected)]
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]))
