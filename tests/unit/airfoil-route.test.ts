import { describe, expect, it, vi } from 'vitest'
import { AIRFOIL_LOCAL_ID, AIRFOIL_SOURCE, airfoilKind, createAirfoilRoute, parseAirfoilSpeakers } from '../../src/main/airfoil-route'

const LIST = [
  `${AIRFOIL_LOCAL_ID}\tComputer\tfalse`,
  'AA-BB-CC-00-11-22:output\tA1\tfalse',
  'AABBCC001133@EDIFIER M330 Ⅱ 1133\tEDIFIER M330 Ⅱ 1133\tfalse',
  'AABBCC001144@Macmini\tMacmini\tfalse',
  'AABBCC001155@tranScreen\ttranScreen\tfalse',
].join('\n')

function fakeAirfoil(listing = LIST) {
  const connected = new Set<string>(), volumes = new Map<string, number>(), calls: string[] = []
  let failList = false
  const run = vi.fn(async (script: string, args: string[] = []) => {
    if (script.includes('every speaker') && !args.length) {
      if (failList) throw Error('not running')
      return parseAirfoilSpeakers(listing).map(s => `${s.id}\t${s.name}\t${connected.has(s.id)}`).join('\n')
    }
    if (script.includes('current audio source')) { calls.push(`source:${args[0]}`); return args[0]! }
    if (script.includes('connect to')) { connected.add(args[0]!); volumes.set(args[0]!, Number(args[1])); return 'true' }
    if (script.includes('disconnect from')) { args.forEach(id => connected.delete(id)); return '' }
    volumes.set(args[0]!, Number(args[1])); return ''
  })
  return { run, connected, volumes, calls, failList: (on: boolean) => { failList = on } }
}

describe('Airfoil venue route', () => {
  it('drives only the venue speakers: Computer, Bluetooth outputs and EDIFIER AirPlay speakers', () => {
    expect(parseAirfoilSpeakers(LIST).map(airfoilKind)).toEqual(['local', 'bluetooth', 'airplay', undefined, undefined])
    expect(airfoilKind({ id: 'x@EDIFIER M330 Ⅱ 1234', name: 'Edifier M330 Ⅱ 1234' })).toBe('airplay')
  })

  it('sets the music source, connects, then raises the flag and reports counts only', async () => {
    const airfoil = fakeAirfoil(), flags: boolean[] = [], report = vi.fn(), degraded = vi.fn()
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded, run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async on => { flags.push(on) }, pollMs: 5 })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.calls).toContain(`source:${AIRFOIL_SOURCE}`)
    expect([...airfoil.connected].sort()).toEqual(['AABBCC001133@EDIFIER M330 Ⅱ 1133', 'AA-BB-CC-00-11-22:output', AIRFOIL_LOCAL_ID].sort())
    expect(airfoil.volumes.get('AABBCC001133@EDIFIER M330 Ⅱ 1133')).toBe(0.7)
    expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(1)
    expect(flags).toEqual([false, true])
    // A dropped speaker (A1 leaving Bluetooth) is reconnected on the next poll.
    airfoil.connected.delete('AA-BB-CC-00-11-22:output')
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_speaker_reconnected', { speakers: 1 }))
    // AirPlay speakers follow the group level; local and Bluetooth stay at 1 (device volumes rule).
    route.setLevel(0.42)
    await vi.waitFor(() => expect(airfoil.volumes.get('AABBCC001133@EDIFIER M330 Ⅱ 1133')).toBe(0.42))
    route.stop()
    expect(flags.at(-1)).toBe(false)
    expect(degraded).not.toHaveBeenCalled()
  })

  it('falls back to the direct speakers with one reason when Airfoil stops answering', async () => {
    const airfoil = fakeAirfoil(), flags: boolean[] = [], degraded = vi.fn(), launch = vi.fn(async () => {})
    const route = createAirfoilRoute({ flagPath: '/flag', report: vi.fn(), degraded, run: airfoil.run, launch, installed: () => true,
      writeFlag: async on => { flags.push(on) }, pollMs: 5 })
    await route.start()
    await vi.waitFor(() => expect(flags).toContain(true))
    airfoil.failList(true)
    await vi.waitFor(() => expect(degraded).toHaveBeenCalledWith('music_output_airfoil_unavailable'))
    expect(launch).toHaveBeenCalledTimes(2) // start + one relaunch attempt
    expect(flags.at(-1)).toBe(false)
    await new Promise(done => setTimeout(done, 30))
    expect(degraded).toHaveBeenCalledTimes(1)
    airfoil.failList(false)
    await vi.waitFor(() => expect(flags.at(-1)).toBe(true))
    route.stop()
  })

  it('keeps direct speakers when the Jabra (Computer) cannot join, or Airfoil is not installed', async () => {
    const airfoil = fakeAirfoil(LIST.split('\n').slice(1).join('\n')), degraded = vi.fn(), flags: boolean[] = []
    const route = createAirfoilRoute({ flagPath: '/flag', report: vi.fn(), degraded, run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async on => { flags.push(on) }, pollMs: 5 })
    await route.start()
    await vi.waitFor(() => expect(degraded).toHaveBeenCalledWith('music_output_airfoil_local_failed'))
    expect(flags).not.toContain(true)
    route.stop()
    const report = vi.fn(), run = vi.fn()
    await createAirfoilRoute({ flagPath: '/flag', report, degraded: vi.fn(), run, installed: () => false }).start()
    expect(report).toHaveBeenCalledWith('music_output_airfoil_not_installed')
    expect(run).not.toHaveBeenCalled()
  })
})
