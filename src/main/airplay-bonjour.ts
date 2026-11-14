import { spawn, type ChildProcess } from 'node:child_process'
import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'

/**
 * Airfoil finds AirPlay speakers only through Bonjour group (multicast) replies. On 2026-11-14 the
 * Mac's Wi-Fi link had stopped receiving all group traffic after days of uptime while unicast still
 * worked, so both Edifiers vanished from Airfoil although they were healthy
 * (docs/testing/sound-system-2026-11-14.md). A Bonjour question sent from a port other than 5353
 * is answered unicast (RFC 6762 6.7), which still arrives. This module asks that way and, only
 * when the group replies are missing, registers the speakers' own records with the local
 * mDNSResponder (`dns-sd -P`, identical data, so no name conflict) so Airfoil lists them.
 * Diagnostics are counts and reason codes only.
 */
const GROUP = '224.0.0.251', PORT = 5353
const TYPES = ['_raop._tcp', '_airplay._tcp'] as const

export interface BonjourService { instance: string; type: string; host: string; port: number; address: string; txt: string[] }
export interface BonjourProbe { services: BonjourService[]; /** Addresses whose replies arrived on the group. */ groupHosts: Set<string> }

interface DnsRecord { name: string; type: number; target?: string; host?: string; port?: number; address?: string; txt?: string[] }

function encodeName(name: string): Buffer {
  const labels = name.split('.').filter(Boolean).map(label => Buffer.from(label, 'utf8'))
  return Buffer.concat([...labels.flatMap(label => [Buffer.from([label.length]), label]), Buffer.from([0])])
}

/** A PTR question; `unicastReply` sets the QU bit (the non-5353 source port already forces unicast). */
export function bonjourQuestion(name: string, unicastReply: boolean): Buffer {
  const header = Buffer.alloc(12); header.writeUInt16BE(1, 4)
  const tail = Buffer.alloc(4); tail.writeUInt16BE(12, 0); tail.writeUInt16BE(unicastReply ? 0x8001 : 1, 2)
  return Buffer.concat([header, encodeName(name), tail])
}

function readName(message: Buffer, start: number): { name: string; end: number } {
  const labels: string[] = []
  let offset = start, end = -1, hops = 0
  for (;;) {
    const length = message[offset]
    if (length === undefined) throw Error('truncated')
    if (length === 0) { offset++; break }
    if ((length & 0xc0) === 0xc0) {
      if (end < 0) end = offset + 2
      offset = ((length & 0x3f) << 8) | message[offset + 1]!
      if (++hops > 32) throw Error('pointer loop')
      continue
    }
    labels.push(message.toString('utf8', offset + 1, offset + 1 + length)); offset += 1 + length
  }
  return { name: labels.join('.'), end: end < 0 ? offset : end }
}

/** Records of one mDNS response; malformed input yields none. */
export function parseBonjourRecords(message: Buffer): DnsRecord[] {
  try {
    if (message.length < 12 || !(message[2]! & 0x80)) return []
    let offset = 12
    for (let i = message.readUInt16BE(4); i > 0; i--) offset = readName(message, offset).end + 4
    const records: DnsRecord[] = []
    for (let i = message.readUInt16BE(6) + message.readUInt16BE(8) + message.readUInt16BE(10); i > 0; i--) {
      const { name, end } = readName(message, offset)
      const type = message.readUInt16BE(end), length = message.readUInt16BE(end + 8), data = end + 10
      if (data + length > message.length) throw Error('truncated')
      const record: DnsRecord = { name, type }
      if (type === 12) record.target = readName(message, data).name
      else if (type === 33) { record.port = message.readUInt16BE(data + 4); record.host = readName(message, data + 6).name }
      else if (type === 1 && length === 4) record.address = [...message.subarray(data, data + 4)].join('.')
      else if (type === 16) {
        record.txt = []
        for (let p = data; p < data + length;) { const n = message[p]!; if (n) record.txt.push(message.toString('utf8', p + 1, p + 1 + n)); p += 1 + n }
      }
      records.push(record); offset = data + length
    }
    return records
  } catch { return [] }
}

/** Complete services (PTR + SRV + TXT + A) among the records one host sent. */
export function bonjourServices(records: DnsRecord[]): BonjourService[] {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const services: BonjourService[] = []
  for (const pointer of records) {
    if (pointer.type !== 12 || !pointer.target) continue
    const type = TYPES.find(candidate => same(pointer.name, `${candidate}.local`))
    const suffix = type && `.${type}.local`
    if (!type || !suffix || !pointer.target.toLowerCase().endsWith(suffix)) continue
    const srv = records.find(record => record.type === 33 && same(record.name, pointer.target!))
    const txt = records.find(record => record.type === 16 && same(record.name, pointer.target!))
    const address = srv?.host && records.find(record => record.type === 1 && same(record.name, srv.host!))
    if (!srv?.host || !srv.port || !txt?.txt || !address || !address.address) continue
    const instance = pointer.target.slice(0, -suffix.length)
    if (services.some(service => service.type === type && service.instance === instance)) continue
    services.push({ instance, type, host: srv.host, port: srv.port, address: address.address, txt: txt.txt })
  }
  return services
}

/** The venue LAN address: the first routable IPv4 on a hardware port. */
export function lanAddress(interfaces = networkInterfaces()): string | undefined {
  const addresses = Object.entries(interfaces).flatMap(([name, list]) => (list ?? []).map(entry => ({ name, entry })))
    .filter(({ entry }) => entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'))
  // The wired port is the private TV-board link (192.168.77.x) and tunnels are not the venue LAN.
  return (addresses.find(({ name, entry }) => /^en\d+$/.test(name) && !entry.address.startsWith('192.168.77.')) ?? addresses[0])?.entry.address
}

/**
 * Asks for AirPlay speakers both ways: a normal question on the group (replies come back on the
 * group when the link receives multicast) and one from another port (replies come back unicast).
 * Ends after `settleMs` once every host that answered unicast was also heard on the group (the
 * healthy case), otherwise listens for `listenMs`, asking the group again (responders multicast a
 * record at most once a second). Never rejects; a socket failure yields what arrived.
 */
export function probeBonjour(input: { address?: string; listenMs?: number; settleMs?: number } = {}): Promise<BonjourProbe> {
  const address = input.address ?? lanAddress(), listenMs = input.listenMs ?? 4000, settleMs = input.settleMs ?? 700
  if (!address) return Promise.resolve({ services: [], groupHosts: new Set() })
  return new Promise(resolve => {
    const own = new Set(Object.values(networkInterfaces()).flatMap(list => (list ?? []).map(entry => entry.address)))
    const byHost = new Map<string, DnsRecord[]>(), groupHosts = new Set<string>()
    // `group` is bound to the group address, so it hears multicast only (a unicast reply to port
    // 5353 never counts as group traffic); `asker` only sends the normal question from port 5353.
    const group = dgram.createSocket({ type: 'udp4', reuseAddr: true }), asker = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const direct = dgram.createSocket('udp4')
    const timers: ReturnType<typeof setTimeout>[] = []
    let done = false
    const finish = () => {
      if (done) return
      done = true
      timers.forEach(clearTimeout)
      for (const socket of [group, asker, direct]) { try { socket.close() } catch { /* already closed */ } }
      resolve({ services: [...byHost.values()].flatMap(bonjourServices), groupHosts })
    }
    group.on('error', finish); asker.on('error', finish); direct.on('error', finish)
    group.on('message', (message, from) => { if (!own.has(from.address) && parseBonjourRecords(message).length) groupHosts.add(from.address) })
    direct.on('message', (message, from) => {
      if (own.has(from.address)) return
      byHost.set(from.address, [...byHost.get(from.address) ?? [], ...parseBonjourRecords(message)])
    })
    const send = (socket: dgram.Socket, unicastReply: boolean) => {
      for (const type of TYPES) { try { socket.send(bonjourQuestion(`${type}.local`, unicastReply), PORT, GROUP) } catch { /* closing */ } }
    }
    const heardAll = () => byHost.size > 0 && [...byHost.keys()].every(host => groupHosts.has(host))
    group.bind(PORT, GROUP, () => {
      try { group.addMembership(GROUP, address) } catch { return finish() }
      // The wildcard address: a specific-address bind to 5353 is refused while mDNSResponder runs.
      asker.bind(PORT, () => direct.bind(0, address, () => {
        try { asker.setMulticastInterface(address); direct.setMulticastInterface(address) } catch { return finish() }
        send(direct, true); send(asker, false)
        timers.push(setTimeout(() => send(direct, true), 300))
        for (let at = settleMs; at < listenMs; at += 300) timers.push(setTimeout(() => { if (heardAll()) finish() }, at))
        for (let at = 1300; at < listenMs - 500; at += 1300) timers.push(setTimeout(() => send(asker, false), at))
        timers.push(setTimeout(finish, listenMs))
      }))
    })
  })
}

/** Local announcements for speakers the Mac can reach but cannot hear on the Bonjour group. */
export function createAirplayProxy(input: {
  /** Speakers to cover, by AirPlay instance name. */
  wanted(name: string): boolean
  report(reason: string, details?: Record<string, number>): void
  /** The Mac hears no Bonjour group replies although the speakers answer: a degrade, said once. */
  degraded(reason: string): void
  probe?: () => Promise<BonjourProbe>
  spawnImpl?: (command: string, args: string[]) => Pick<ChildProcess, 'kill' | 'on'>
}) {
  const probe = input.probe ?? (() => probeBonjour())
  const spawnImpl = input.spawnImpl ?? ((command, args) => spawn(command, args, { stdio: 'ignore' }))
  const proxies = new Map<string, { service: BonjourService; child: Pick<ChildProcess, 'kill' | 'on'>; misses: number }>()
  const key = (service: BonjourService) => `${service.type}\n${service.instance}`
  const speakerName = (service: BonjourService) => service.type === '_raop._tcp' ? service.instance.replace(/^[0-9A-Fa-f]+@/, '') : service.instance
  const drop = (id: string) => { const proxy = proxies.get(id); proxies.delete(id); try { proxy?.child.kill() } catch { /* gone */ } }
  let blindReported = false
  return {
    /**
     * One probe. Returns how many wanted speakers answer at all and whether their replies reach the
     * group; registers a local record for each service of a speaker that answers only unicast, and
     * withdraws records of speakers that stopped answering (two probes) or moved address.
     */
    async refresh(): Promise<{ speakers: number; blind: boolean; proxied: number }> {
      const result = await probe()
      const wanted = result.services.filter(service => input.wanted(speakerName(service)))
      const speakers = new Set(wanted.map(service => service.address)).size
      const unheard = wanted.filter(service => !result.groupHosts.has(service.address))
      const blind = speakers > 0 && unheard.length === wanted.length
      if (blind && !blindReported) { blindReported = true; input.degraded('music_output_bonjour_group_blind') }
      if (!blind && speakers > 0 && blindReported) { blindReported = false; input.report('music_output_bonjour_group_restored', { speakers }) }
      let added = 0, dropped = 0
      for (const [id, proxy] of proxies) {
        const current = wanted.find(service => key(service) === id)
        if (current) proxy.misses = 0
        const moved = current && (current.address !== proxy.service.address || current.port !== proxy.service.port || current.host !== proxy.service.host)
        if (moved || (!current && ++proxy.misses >= 2)) { drop(id); dropped++ }
      }
      for (const service of blind ? unheard : []) {
        if (proxies.has(key(service))) continue
        const child = spawnImpl('/usr/bin/dns-sd', ['-P', service.instance, service.type, 'local', String(service.port), service.host, service.address, ...service.txt])
        const id = key(service)
        proxies.set(id, { service, child, misses: 0 })
        child.on('exit', () => { if (proxies.get(id)?.child === child) proxies.delete(id) })
        child.on('error', () => { if (proxies.get(id)?.child === child) proxies.delete(id) })
        added++
      }
      const count = () => new Set([...proxies.values()].map(proxy => proxy.service.address)).size
      if (added) input.report('music_output_airplay_proxied', { speakers: count() })
      if (dropped) input.report('music_output_airplay_proxy_withdrawn', { speakers: count() })
      return { speakers, blind, proxied: count() }
    },
    active: (): boolean => proxies.size > 0,
    /** Ends announcements a crashed run left behind (they would outlive a moved or removed speaker). */
    reap(): void {
      try { spawnImpl('/usr/bin/pkill', ['-f', '^/usr/bin/dns-sd -P .* _(raop|airplay)\\._tcp local ']).on('error', () => undefined) } catch { /* best effort */ }
    },
    stop(): void { for (const id of [...proxies.keys()]) drop(id); blindReported = false },
  }
}
