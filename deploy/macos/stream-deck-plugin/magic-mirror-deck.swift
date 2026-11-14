// Magic Mirror Stream Deck plugin (SDK v2, native). Titles the Music page folder keys from
// Main's names-only music-folders.json and runs the fixed raven-button.sh music-folder-N
// on a press. No paths, playback or other controls; launchd/Electron ownership unchanged.
// It also records when the Music page appears on or leaves the deck (deck.log, 2026-11-14:
// the page was lost during a loop and nothing showed when or why).
import Foundation

let arguments = CommandLine.arguments
func argument(_ name: String) -> String? {
  guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else { return nil }
  return arguments[index + 1]
}
guard let port = argument("-port"), let pluginUUID = argument("-pluginUUID"), let registerEvent = argument("-registerEvent"),
  let socketURL = URL(string: "ws://127.0.0.1:\(port)") else { exit(2) }
let foldersFile = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Caches/MagicMirror/music-folders.json")
let button = "/Users/novalien0424/magic-mirror/deploy/macos/raven-button.sh"
let deckLog = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/MagicMirror/deck.log")

/// One metadata line: plugin start, Music page shown or hidden.
func record(_ fields: String) {
  let line = "DECK \(fields) at=\(ISO8601DateFormatter().string(from: Date()))\n"
  guard let data = line.data(using: .utf8) else { return }
  if let handle = try? FileHandle(forWritingTo: deckLog) { defer { try? handle.close() }; _ = try? handle.seekToEnd(); try? handle.write(contentsOf: data) }
  else { try? data.write(to: deckLog) }
}

/// Key titles fit about eight characters per line; break long names over up to three lines.
func keyTitle(_ name: String) -> String {
  var lines: [String] = [], line = ""
  for word in name.split(separator: " ").map(String.init) {
    var word = word
    while word.count > 8 { if !line.isEmpty { lines.append(line); line = "" }; lines.append(String(word.prefix(8))); word = String(word.dropFirst(8)) }
    if line.isEmpty { line = word } else if line.count + 1 + word.count <= 8 { line += " " + word } else { lines.append(line); line = word }
  }
  if !line.isEmpty { lines.append(line) }
  return lines.prefix(3).joined(separator: "\n")
}

final class Plugin {
  let socket: URLSessionWebSocketTask
  var slots: [String: Int] = [:], shown: [String: String] = [:]
  init(_ socket: URLSessionWebSocketTask) { self.socket = socket }
  func send(_ message: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: message), let text = String(data: data, encoding: .utf8) else { return }
    socket.send(.string(text)) { _ in }
  }
  func receive() {
    socket.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(.string(let text)): DispatchQueue.main.async { self.handle(Data(text.utf8)) }
      case .success(.data(let data)): DispatchQueue.main.async { self.handle(data) }
      case .success: break
      case .failure: exit(0) // Stream Deck closed the connection: it relaunches the plugin when needed.
      }
      self.receive()
    }
  }
  func handle(_ data: Data) {
    guard let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let event = message["event"] as? String, let context = message["context"] as? String else { return }
    let settings = (message["payload"] as? [String: Any])?["settings"] as? [String: Any]
    let slot = (settings?["slot"] as? NSNumber)?.intValue ?? 0
    switch event {
    case "willAppear":
      guard (1...3).contains(slot) else { return }
      if slots.isEmpty { record("music_page=shown") }
      slots[context] = slot; shown[context] = nil; refresh()
    case "willDisappear":
      let was = slots.count
      slots[context] = nil; shown[context] = nil
      if was > 0 && slots.isEmpty { record("music_page=hidden") }
    case "keyDown":
      guard let slot = slots[context] else { return }
      let process = Process()
      process.executableURL = URL(fileURLWithPath: "/bin/zsh")
      process.arguments = [button, "music-folder-\(slot)"]
      try? process.run()
    default: break
    }
  }
  func refresh() {
    var folders: [String] = [], active: String?, playing = false
    if let data = try? Data(contentsOf: foldersFile), let state = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
      folders = (state["folders"] as? [String]) ?? []; active = state["active"] as? String; playing = state["playing"] as? Bool ?? false
    }
    for (context, slot) in slots {
      let name = slot <= folders.count ? folders[slot - 1] : ""
      // An empty slot stays blank; the folder playing now gets a play mark.
      let title = name.isEmpty ? "" : (playing && active == name ? "▶ " : "") + keyTitle(name)
      if shown[context] == title { continue }
      shown[context] = title
      send(["event": "setTitle", "context": context, "payload": ["title": title, "target": 0]])
    }
  }
}

let socket = URLSession(configuration: .default).webSocketTask(with: socketURL)
let plugin = Plugin(socket)
socket.resume()
plugin.send(["event": registerEvent, "uuid": pluginUUID])
record("plugin=started")
plugin.receive()
Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { _ in plugin.refresh() }
RunLoop.main.run()
