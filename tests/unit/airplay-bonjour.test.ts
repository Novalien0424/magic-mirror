import { describe, expect, it, vi } from 'vitest'
import { bonjourQuestion, bonjourServices, createAirplayProxy, lanAddress, parseBonjourRecords, type BonjourProbe, type BonjourService } from '../../src/main/airplay-bonjour'

const name = (text: string) => Buffer.concat([...text.split('.').map(label => Buffer.concat([Buffer.from([Buffer.byteLength(label)]), Buffer.from(label)])), Buffer.from([0])])
function record(owner: string, type: number, data: Buffer) {
  const head = Buffer.alloc(10); head.writeUInt16BE(type, 0); head.writeUInt16BE(1, 2); head.writeUInt32BE(120, 4); head.writeUInt16BE(data.length, 8)
  return Buffer.concat([name(owner), head, data])
}
const txt = (entries: string[]) => Buffer.concat(entries.map(entry => Buffer.concat([Buffer.from([Buffer.byteLength(entry)]), Buffer.from(entry)])))
function srv(port: number, host: string) { const head = Buffer.alloc(6); head.writeUInt16BE(port, 4); return Buffer.concat([head, name(host)]) }
function response(records: Buffer[]) {
  const header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(records.length, 6)
  return Buffer.concat([header, ...records])
}
const RAOP = 'AABBCC001133@EDIFIER M330 Ⅱ 1133', HOST = 'EDIFIER-M330-Ⅱ-1133.local'
const speakerReply = response([
  record('_raop._tcp.local', 12, name(`${RAOP}._raop._tcp.local`)),
  record(`${RAOP}._raop._tcp.local`, 33, srv(7000, HOST)),
  record(`${RAOP}._raop._tcp.local`, 16, txt(['cn=0,1', 'tp=UDP'])),
  record(HOST, 1, Buffer.from([10, 0, 0, 41])),
])

describe('Bonjour records of AirPlay speakers', () => {
  it('asks for a service by PTR, with the unicast-reply bit only when asked', () => {
    const group = bonjourQuestion('_raop._tcp.local', false), direct = bonjourQuestion('_raop._tcp.local', true)
    expect(group.readUInt16BE(4)).toBe(1)
    expect(group.subarray(-4)).toEqual(Buffer.from([0, 12, 0, 1]))
    expect(direct.subarray(-4)).toEqual(Buffer.from([0, 12, 0x80, 1]))
  })

  it('reads a complete service from one reply, non-ASCII names and compressed names included', () => {
    expect(bonjourServices(parseBonjourRecords(speakerReply))).toEqual([
      { instance: RAOP, type: '_raop._tcp', host: HOST, port: 7000, address: '10.0.0.41', txt: ['cn=0,1', 'tp=UDP'] }])
    // The same PTR with its target compressed to a pointer at the SRV owner name.
    const header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(1, 6)
    const owner = name('_raop._tcp.local'), head = Buffer.alloc(10); head.writeUInt16BE(12, 0); head.writeUInt16BE(2, 8)
    expect(parseBonjourRecords(Buffer.concat([header, owner, head, Buffer.from([0xc0, 12])]))).toEqual([{ name: '_raop._tcp.local', type: 12, target: '_raop._tcp.local' }])
  })

  it('ignores questions, truncated replies, pointer loops and services with a missing part', () => {
    expect(parseBonjourRecords(bonjourQuestion('_raop._tcp.local', false))).toEqual([])
    expect(parseBonjourRecords(speakerReply.subarray(0, speakerReply.length - 3))).toEqual([])
    const header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(1, 6)
    expect(parseBonjourRecords(Buffer.concat([header, Buffer.from([0xc0, 12])]))).toEqual([])
    const noAddress = response([record('_raop._tcp.local', 12, name(`${RAOP}._raop._tcp.local`)), record(`${RAOP}._raop._tcp.local`, 33, srv(7000, HOST)),
      record(`${RAOP}._raop._tcp.local`, 16, txt(['tp=UDP']))])
    expect(bonjourServices(parseBonjourRecords(noAddress))).toEqual([])
  })

  it('uses the venue LAN address, not the TV-board link, a tunnel or a link-local address', () => {
    const entry = (address: string) => ({ address, family: 'IPv4' as const, internal: false, netmask: '', mac: '', cidr: null })
    expect(lanAddress({ en0: [entry('192.168.77.1')], utun4: [entry('100.64.0.9')], en5: [entry('169.254.3.4')], en1: [entry('10.0.0.101')] })).toBe('10.0.0.101')
    expect(lanAddress({})).toBeUndefined()
  })
})

describe('local announcements for speakers the Mac cannot hear (2026-11-14)', () => {
  const service = (type: '_raop._tcp' | '_airplay._tcp', address = '10.0.0.41'): BonjourService => ({
    instance: type === '_raop._tcp' ? RAOP : 'EDIFIER M330 Ⅱ 1133', type, host: HOST, port: 7000, address, txt: ['tp=UDP', 'pk=abc'] })
  const other: BonjourService = { instance: 'Living Room', type: '_airplay._tcp', host: 'tv.local', port: 7000, address: '10.0.0.9', txt: [] }
  function setup() {
    let next: BonjourProbe = { services: [], groupHosts: new Set() }
    const children: { args: string[]; kill: ReturnType<typeof vi.fn> }[] = [], report = vi.fn(), degraded = vi.fn()
    const proxy = createAirplayProxy({ wanted: text => /^EDIFIER\b/i.test(text), report, degraded, probe: async () => next,
      spawnImpl: (_command, args) => { const child = { args, kill: vi.fn(), on: vi.fn() }; children.push(child); return child as never } })
    return { proxy, children, report, degraded, probe: (services: BonjourService[], heard: string[] = []) => { next = { services, groupHosts: new Set(heard) } } }
  }

  it('announces nothing while the speakers are heard on the group', async () => {
    const { proxy, children, probe, degraded } = setup()
    probe([service('_raop._tcp'), service('_airplay._tcp'), other], ['10.0.0.41'])
    expect(await proxy.refresh()).toEqual({ speakers: 1, blind: false, proxied: 0 })
    expect(children).toHaveLength(0)
    expect(degraded).not.toHaveBeenCalled()
  })

  it('announces both services of a venue speaker that answers only unicast, with its own data, once', async () => {
    const { proxy, children, probe, report, degraded } = setup()
    probe([service('_raop._tcp'), service('_airplay._tcp'), other])
    expect(await proxy.refresh()).toEqual({ speakers: 1, blind: true, proxied: 1 })
    expect(children.map(child => child.args)).toEqual([
      ['-P', RAOP, '_raop._tcp', 'local', '7000', HOST, '10.0.0.41', 'tp=UDP', 'pk=abc'],
      ['-P', 'EDIFIER M330 Ⅱ 1133', '_airplay._tcp', 'local', '7000', HOST, '10.0.0.41', 'tp=UDP', 'pk=abc']])
    expect(degraded).toHaveBeenCalledWith('music_output_bonjour_group_blind')
    expect(report).toHaveBeenCalledWith('music_output_airplay_proxied', { speakers: 1 })
    await proxy.refresh()
    expect(children).toHaveLength(2)
    expect(degraded).toHaveBeenCalledTimes(1)
    expect(proxy.active()).toBe(true)
  })

  it('withdraws a speaker that stops answering twice or changes address, and everything at stop', async () => {
    const { proxy, children, probe, report } = setup()
    probe([service('_raop._tcp')])
    await proxy.refresh()
    probe([])
    await proxy.refresh()
    expect(children[0]!.kill).not.toHaveBeenCalled()
    await proxy.refresh()
    expect(children[0]!.kill).toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith('music_output_airplay_proxy_withdrawn', { speakers: 0 })
    probe([service('_raop._tcp')])
    await proxy.refresh()
    probe([service('_raop._tcp', '10.0.0.77')])
    await proxy.refresh()
    expect(children[1]!.kill).toHaveBeenCalled()
    expect(children.at(-1)!.args).toContain('10.0.0.77')
    proxy.stop()
    expect(children.at(-1)!.kill).toHaveBeenCalled()
    expect(proxy.active()).toBe(false)
  })

  it('says when the group replies return, and keeps existing announcements', async () => {
    const { proxy, children, probe, report } = setup()
    probe([service('_raop._tcp')])
    await proxy.refresh()
    probe([service('_raop._tcp')], ['10.0.0.41'])
    expect(await proxy.refresh()).toEqual({ speakers: 1, blind: false, proxied: 1 })
    expect(report).toHaveBeenCalledWith('music_output_bonjour_group_restored', { speakers: 1 })
    expect(children[0]!.kill).not.toHaveBeenCalled()
  })
})
