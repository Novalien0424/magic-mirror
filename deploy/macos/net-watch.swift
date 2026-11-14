// Venue LAN watch (2026-11-14). After days of uptime the Mac's Wi-Fi link stopped receiving all
// group (multicast) traffic while unicast still worked, so Airfoil lost both Edifiers
// (docs/testing/sound-system-2026-11-14.md). One run asks for AirPlay speakers both ways:
//   ok     group replies from another host arrive
//   blind  speakers answer a unicast-reply question but nothing arrives on the group
//   quiet  nobody answers either way (speakers off, or no other Bonjour host)
//   offline no venue LAN address
// It logs state changes and an hourly heartbeat (counts and reason codes only). A confirmed
// "blind" can be healed by re-joining Wi-Fi (--heal): only while Magic Mirror's Electron is not
// running, at most once an hour (six after a failed attempt). launchd runs it every 5 min as
// root (installed copy), so it needs no Local Network consent and no user-writable interpreter.
// Usage: net-watch [--heal] [--once] [--state <file>]   (healing is off unless --heal is given)
import Foundation

let group = "224.0.0.251", port: UInt16 = 5353
let arguments = CommandLine.arguments
let healAllowed = arguments.contains("--heal") && !arguments.contains("--once")
let statePath = arguments.firstIndex(of: "--state").flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
  ?? "/Library/Application Support/MagicMirror/net-watch.json"

func stamp() -> String { ISO8601DateFormatter().string(from: Date()) }
func say(_ fields: String) { print("NET_WATCH \(fields) at=\(stamp())"); fflush(stdout) }

/// The venue LAN port: the first hardware port with a routable IPv4 (not the TV-board link).
func lanInterface() -> (name: String, address: String)? {
  var list: UnsafeMutablePointer<ifaddrs>?
  guard getifaddrs(&list) == 0, let first = list else { return nil }
  defer { freeifaddrs(list) }
  var found: [(String, String)] = []
  for entry in sequence(first: first, next: { $0.pointee.ifa_next }) {
    guard let raw = entry.pointee.ifa_addr, raw.pointee.sa_family == UInt8(AF_INET) else { continue }
    let name = String(cString: entry.pointee.ifa_name)
    guard name.hasPrefix("en"), Int(name.dropFirst(2)) != nil, entry.pointee.ifa_flags & UInt32(IFF_UP) != 0 else { continue }
    var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
    guard getnameinfo(raw, socklen_t(raw.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
    let address = String(cString: host)
    if address.hasPrefix("169.254.") || address.hasPrefix("192.168.77.") { continue }
    found.append((name, address))
  }
  return found.sorted { $0.0 < $1.0 }.first
}

func ownAddresses() -> Set<String> {
  var list: UnsafeMutablePointer<ifaddrs>?, result = Set<String>()
  guard getifaddrs(&list) == 0, let first = list else { return result }
  defer { freeifaddrs(list) }
  for entry in sequence(first: first, next: { $0.pointee.ifa_next }) {
    guard let raw = entry.pointee.ifa_addr, raw.pointee.sa_family == UInt8(AF_INET) else { continue }
    var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
    if getnameinfo(raw, socklen_t(raw.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 { result.insert(String(cString: host)) }
  }
  return result
}

func endpoint(_ address: String, _ port: UInt16) -> sockaddr_in {
  var value = sockaddr_in()
  value.sin_len = UInt8(MemoryLayout<sockaddr_in>.size); value.sin_family = sa_family_t(AF_INET)
  value.sin_port = port.bigEndian; value.sin_addr.s_addr = inet_addr(address)
  return value
}

func udpSocket(bind address: String, port: UInt16, reuse: Bool) -> Int32? {
  let fd = socket(AF_INET, SOCK_DGRAM, 0)
  guard fd >= 0 else { return nil }
  var on: Int32 = 1
  if reuse {
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &on, socklen_t(MemoryLayout<Int32>.size))
  }
  var local = endpoint(address, port)
  let bound = withUnsafePointer(to: &local) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
  guard bound == 0 else { close(fd); return nil }
  return fd
}

/// A PTR question for one service type; `unicastReply` sets the QU bit.
func question(_ name: String, unicastReply: Bool) -> [UInt8] {
  var bytes: [UInt8] = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]
  for label in name.split(separator: ".") { bytes.append(UInt8(label.utf8.count)); bytes.append(contentsOf: label.utf8) }
  bytes.append(contentsOf: [0, 0, 12, unicastReply ? 0x80 : 0, 1])
  return bytes
}

struct Probe { var groupHosts = Set<String>(); var unicastHosts = Set<String>(); var failed = false }

/// Listens up to `seconds`; ends early once group traffic from another host has arrived.
func probe(address: String, seconds: Double) -> Probe {
  var result = Probe()
  // `listener` is bound to the group address, so it receives multicast only. `asker` sends the
  // normal question from port 5353 (replies go to the group); `direct` asks from another port
  // (RFC 6762 6.7: replies come back unicast).
  guard let listener = udpSocket(bind: group, port: port, reuse: true),
        let asker = udpSocket(bind: "0.0.0.0", port: port, reuse: true),
        let direct = udpSocket(bind: address, port: 0, reuse: false) else { result.failed = true; return result }
  defer { close(listener); close(asker); close(direct) }
  var membership = ip_mreq(imr_multiaddr: in_addr(s_addr: inet_addr(group)), imr_interface: in_addr(s_addr: inet_addr(address)))
  guard setsockopt(listener, IPPROTO_IP, IP_ADD_MEMBERSHIP, &membership, socklen_t(MemoryLayout<ip_mreq>.size)) == 0 else { result.failed = true; return result }
  var out = in_addr(s_addr: inet_addr(address))
  for fd in [asker, direct] { setsockopt(fd, IPPROTO_IP, IP_MULTICAST_IF, &out, socklen_t(MemoryLayout<in_addr>.size)) }
  let own = ownAddresses()
  func send(_ fd: Int32, unicastReply: Bool) {
    var target = endpoint(group, port)
    for type in ["_raop._tcp.local", "_airplay._tcp.local"] {
      let bytes = question(type, unicastReply: unicastReply)
      _ = withUnsafePointer(to: &target) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { sendto(fd, bytes, bytes.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    }
  }
  let start = Date()
  var nextGroupAsk = 0.0, nextDirectAsk = 0.0
  var buffer = [UInt8](repeating: 0, count: 9000)
  while true {
    let elapsed = Date().timeIntervalSince(start)
    if elapsed >= seconds || (!result.groupHosts.isEmpty && elapsed >= 1.0) { break }
    if elapsed >= nextGroupAsk { send(asker, unicastReply: false); nextGroupAsk += 1.5 }
    if elapsed >= nextDirectAsk { send(direct, unicastReply: true); nextDirectAsk += 3.0 }
    var fds = [pollfd(fd: listener, events: Int16(POLLIN), revents: 0), pollfd(fd: direct, events: Int16(POLLIN), revents: 0)]
    guard poll(&fds, 2, 200) > 0 else { continue }
    for (index, item) in fds.enumerated() where item.revents & Int16(POLLIN) != 0 {
      var from = sockaddr_in(), length = socklen_t(MemoryLayout<sockaddr_in>.size)
      let count = withUnsafeMutablePointer(to: &from) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { recvfrom(item.fd, &buffer, buffer.count, 0, $0, &length) } }
      guard count >= 12 else { continue }
      let host = String(cString: inet_ntoa(from.sin_addr))
      if own.contains(host) { continue }
      if index == 0 { result.groupHosts.insert(host) } else if buffer[2] & 0x80 != 0 { result.unicastHosts.insert(host) }
    }
  }
  return result
}

@discardableResult func run(_ path: String, _ args: [String], timeout: Double = 30) -> (status: Int32, output: String) {
  let process = Process(), pipe = Pipe()
  process.executableURL = URL(fileURLWithPath: path); process.arguments = args
  process.standardOutput = pipe; process.standardError = FileHandle.nullDevice
  do { try process.run() } catch { return (-1, "") }
  let deadline = Date().addingTimeInterval(timeout)
  DispatchQueue.global().async { while process.isRunning { if Date() > deadline { process.terminate(); break }; usleep(100_000) } }
  let data = pipe.fileHandleForReading.readDataToEndOfFile()
  process.waitUntilExit()
  return (process.terminationStatus, String(data: data, encoding: .utf8) ?? "")
}

func appRunning() -> Bool {
  run("/usr/bin/pgrep", ["-f", "/Electron.app/Contents/MacOS/Electron"]).status == 0
}

/// Wi-Fi "roamed" events in the last half hour: count and seconds since the latest (onset evidence).
func recentRoams() -> String {
  let text = run("/usr/bin/log", ["show", "--last", "30m", "--style", "compact", "--predicate",
    "process == \"airportd\" AND eventMessage CONTAINS \"APPLE80211_M_ROAMED\""], timeout: 60).output
  let lines = text.split(separator: "\n").filter { $0.contains("APPLE80211_M_ROAMED") }
  guard let last = lines.last else { return "roams_30m=0" }
  let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
  let age = formatter.date(from: String(last.prefix(23))).map { Int(Date().timeIntervalSince($0)) }
  return "roams_30m=\(lines.count)" + (age.map { " last_roam_s_ago=\($0)" } ?? "")
}

struct State: Codable { var state = ""; var since = ""; var lastLogged = 0.0; var lastHeal = 0.0; var healFailed = false; var deferredLogged = false }
func loadState() -> State { (try? JSONDecoder().decode(State.self, from: Data(contentsOf: URL(fileURLWithPath: statePath)))) ?? State() }
func saveState(_ state: State) { if let data = try? JSONEncoder().encode(state) { try? data.write(to: URL(fileURLWithPath: statePath), options: .atomic) } }

func classify(_ lan: (name: String, address: String)?) -> (state: String, probe: Probe) {
  guard let lan else { return ("offline", Probe()) }
  let first = probe(address: lan.address, seconds: 10)
  if first.failed { return ("probe_failed", first) }
  if !first.groupHosts.isEmpty { return ("ok", first) }
  // Confirm before calling it blind or quiet: one missed reply must not count.
  sleep(3)
  let second = probe(address: lan.address, seconds: 10)
  if !second.groupHosts.isEmpty { return ("ok", second) }
  let unicast = first.unicastHosts.union(second.unicastHosts)
  return (unicast.isEmpty ? "quiet" : "blind", Probe(groupHosts: [], unicastHosts: unicast))
}

var state = loadState()
let lan = lanInterface()
let (now, result) = classify(lan)
let counts = { (probe: Probe) in "group_hosts=\(probe.groupHosts.count) unicast_hosts=\(probe.unicastHosts.count)" }
let clock = Date().timeIntervalSince1970
if now != state.state {
  let extra = now == "blind" ? " " + recentRoams() : ""
  say("state=\(now) previous=\(state.state.isEmpty ? "none" : state.state) \(counts(result))\(extra)")
  state.state = now; state.since = stamp(); state.lastLogged = clock; state.deferredLogged = false
  if now == "ok" { state.healFailed = false }
} else if clock - state.lastLogged >= 3600 {
  say("state=\(now) since=\(state.since) \(counts(result))")
  state.lastLogged = clock
}
if now == "blind", healAllowed, let lan {
  let wait = state.healFailed ? 6 * 3600.0 : 3600.0
  if appRunning() {
    if !state.deferredLogged { say("heal=deferred reason=app_running"); state.deferredLogged = true }
  } else if clock - state.lastHeal >= wait {
    state.lastHeal = clock; saveState(state)
    run("/usr/sbin/networksetup", ["-setairportpower", lan.name, "off"])
    sleep(3)
    run("/usr/sbin/networksetup", ["-setairportpower", lan.name, "on"])
    var back: (name: String, address: String)?
    for _ in 0..<45 { sleep(1); back = lanInterface(); if back != nil { break } }
    sleep(8)
    let after = classify(back)
    say("heal=wifi_rejoined result=\(after.state) \(counts(after.probe))")
    state.healFailed = after.state != "ok"
    state.state = after.state; state.since = stamp(); state.lastLogged = Date().timeIntervalSince1970
  }
}
saveState(state)
