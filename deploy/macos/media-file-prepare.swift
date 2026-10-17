import Foundation
import Darwin

// File Provider placeholders need coordinated access before ordinary POSIX reads.
// Copy only selected media into Main's private staging file, in bounded buffers.
// Main sizes the deadline to the file so a cold cloud download can finish.
guard CommandLine.arguments.count == 5,
      let expected = Int(CommandLine.arguments[2]), expected > 0,
      let deadline = Int(CommandLine.arguments[4]), (1...600).contains(deadline) else { exit(2) }
DispatchQueue.global().asyncAfter(deadline: .now() + .seconds(deadline)) {
    print("media_file_prepare_timeout")
    exit(124)
}
let url = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
let destination = CommandLine.arguments[3]
let coordinator = NSFileCoordinator()
var coordinationError: NSError?
var succeeded = false
coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) { target in
    guard target.standardizedFileURL == url, target.resolvingSymlinksInPath() == url else { return }
    do {
        let handle = try FileHandle(forReadingFrom: target)
        defer { try? handle.close() }
        let descriptor = open(destination, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { return }
        let output = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? output.close() }
        var bytes = 0
        while let chunk = try handle.read(upToCount: 65536), !chunk.isEmpty {
            bytes += chunk.count
            if bytes > expected { return }
            try output.write(contentsOf: chunk)
        }
        try output.synchronize()
        succeeded = bytes == expected
    } catch { /* Never print file paths, provider messages or contents. */ }
}
guard coordinationError == nil, succeeded else {
    print("media_file_prepare_failed")
    exit(1)
}
print("media_file_prepared bytes=\(expected)")
