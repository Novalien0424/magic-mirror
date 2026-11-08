import { describe, expect, it, vi } from 'vitest'
import { AIRFOIL_LOCAL_ID, AIRFOIL_SOURCE, airfoilKind, createAirfoilRoute, parseAirfoilSpeakers } from '../../src/main/airfoil-route'
import { parseSpeakerLevels } from '../../src/main/speaker-levels'

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

  it('keeps the calibrated AirPlay offset from the Jabra level, with a floor while the Jabra plays', async () => {
    const airfoil = fakeAirfoil(), report = vi.fn()
    const levels = parseSpeakerLevels(JSON.stringify({ normal: { 'Jabra Speak2 75': 0.7, A1: 0.55, EDIFIER: 0.4 } }))
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded: vi.fn(), run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, levels })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    const edifier = 'AABBCC001133@EDIFIER M330 Ⅱ 1133'
    // Connected at the Jabra's normal 70%: the Edifier gets its normal 40%; Computer and Bluetooth stay at 1.
    expect(airfoil.volumes.get(edifier)).toBe(0.4)
    expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(1)
    // A freshly connected Bluetooth speaker stays silent while Airfoil syncs it (next test).
    expect(airfoil.volumes.get('AA-BB-CC-00-11-22:output')).toBe(0)
    route.setLevel(0.9)
    await vi.waitFor(() => expect(airfoil.volumes.get(edifier)).toBe(0.6))
    route.setLevel(0.3)
    await vi.waitFor(() => expect(airfoil.volumes.get(edifier)).toBe(0.05))
    route.setLevel(0)
    await vi.waitFor(() => expect(airfoil.volumes.get(edifier)).toBe(0))
    // Above the Jabra's 100% the group level keeps rising until the Edifier reaches 100%.
    route.setLevel(1.1)
    await vi.waitFor(() => expect(airfoil.volumes.get(edifier)).toBe(0.8))
    route.setLevel(1.5)
    await vi.waitFor(() => expect(airfoil.volumes.get(edifier)).toBe(1))
    route.stop()
  })

  it('keeps a freshly connected Bluetooth speaker silent until Airfoil has synced it, again after a reconnect', async () => {
    let t = 0
    const airfoil = fakeAirfoil(), report = vi.fn(), a1 = 'AA-BB-CC-00-11-22:output'
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded: vi.fn(), run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, bluetoothSettleMs: 1000, now: () => t })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.volumes.get(a1)).toBe(0)
    expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(1)
    expect(report).toHaveBeenCalledWith('music_output_bluetooth_settling', { speakers: 1, seconds: 1 })
    t = 1000
    await vi.waitFor(() => expect(airfoil.volumes.get(a1)).toBe(1))
    expect(report).toHaveBeenCalledWith('music_output_bluetooth_joined', { speakers: 1 })
    // A1 leaves Bluetooth and returns: silent again until it has settled.
    airfoil.connected.delete(a1)
    await vi.waitFor(() => expect(airfoil.volumes.get(a1)).toBe(0))
    t = 1999
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(airfoil.volumes.get(a1)).toBe(0)
    t = 2500
    await vi.waitFor(() => expect(airfoil.volumes.get(a1)).toBe(1))
    route.stop()
  })

  it('plays a Bluetooth speaker at once when it and Computer were already connected before Main started', async () => {
    const airfoil = fakeAirfoil(), report = vi.fn(), a1 = 'AA-BB-CC-00-11-22:output'
    airfoil.connected.add(a1); airfoil.connected.add(AIRFOIL_LOCAL_ID)
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded: vi.fn(), run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, bluetoothSettleMs: 60_000, now: () => 0 })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.volumes.get(a1)).toBe(1)
    expect(report).not.toHaveBeenCalledWith('music_output_bluetooth_settling', expect.anything())
    route.stop()
  })

  it('re-settles a connected Bluetooth speaker whenever Computer joins (Airfoil restarts its glide), at start or mid-run', async () => {
    let t = 0
    const airfoil = fakeAirfoil(), report = vi.fn(), a1 = 'AA-BB-CC-00-11-22:output'
    airfoil.connected.add(a1)
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded: vi.fn(), run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, bluetoothSettleMs: 1000, now: () => t })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.volumes.get(a1)).toBe(0)
    expect(report).toHaveBeenCalledWith('music_output_bluetooth_resync_computer_joined', { speakers: 1, seconds: 1 })
    expect(report).not.toHaveBeenCalledWith('music_output_bluetooth_settling', expect.anything())
    t = 1000
    await vi.waitFor(() => expect(airfoil.volumes.get(a1)).toBe(1))
    // Computer drops and rejoins while A1 stays connected: A1 sits out the glide again.
    airfoil.connected.delete(AIRFOIL_LOCAL_ID)
    await vi.waitFor(() => expect(airfoil.volumes.get(a1)).toBe(0))
    expect(airfoil.connected.has(AIRFOIL_LOCAL_ID)).toBe(true)
    t = 1999
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(airfoil.volumes.get(a1)).toBe(0)
    t = 2500
    await vi.waitFor(() => expect(airfoil.volumes.get(a1)).toBe(1))
    // An Edifier reconnect leaves A1 in sync (measured 2026-11-08): no new settle.
    const resyncs = report.mock.calls.filter(([reason]) => reason === 'music_output_bluetooth_resync_computer_joined').length
    expect(resyncs).toBe(2)
    airfoil.connected.delete('AABBCC001133@EDIFIER M330 Ⅱ 1133')
    await vi.waitFor(() => expect(airfoil.connected.has('AABBCC001133@EDIFIER M330 Ⅱ 1133')).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(airfoil.volumes.get(a1)).toBe(1)
    expect(report.mock.calls.filter(([reason]) => reason === 'music_output_bluetooth_resync_computer_joined').length).toBe(resyncs)
    route.stop()
  })

  it('releases only AirPlay speakers at stop, keeping Computer and Bluetooth connected, so the next start skips the settle', async () => {
    const airfoil = fakeAirfoil(), released: string[][] = [], a1 = 'AA-BB-CC-00-11-22:output'
    const options = { flagPath: '/flag', degraded: vi.fn(), run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, bluetoothSettleMs: 60_000, now: () => 0, disconnectDetached: (ids: string[]) => { released.push(ids); ids.forEach(id => airfoil.connected.delete(id)) } }
    const first = createAirfoilRoute({ ...options, report: vi.fn() })
    await first.start()
    await vi.waitFor(() => expect(airfoil.connected.size).toBe(3))
    await new Promise(resolve => setTimeout(resolve, 20))
    first.stop()
    expect(released).toEqual([['AABBCC001133@EDIFIER M330 Ⅱ 1133']])
    expect([...airfoil.connected].sort()).toEqual([AIRFOIL_LOCAL_ID, a1].sort())
    // The next run finds Computer and A1 still connected and in sync: A1 plays at once.
    const report = vi.fn(), second = createAirfoilRoute({ ...options, report })
    await second.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.volumes.get(a1)).toBe(1)
    expect(report).not.toHaveBeenCalledWith('music_output_bluetooth_settling', expect.anything())
    second.stop()
  })

  it('resumes the settle time of a Bluetooth speaker kept connected through a quick stop and start', async () => {
    let t = 0, state: Record<string, number> = {}
    const airfoil = fakeAirfoil(), a1 = 'AA-BB-CC-00-11-22:output'
    const options = { flagPath: '/flag', degraded: vi.fn(), run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, bluetoothSettleMs: 1000, now: () => t,
      settleState: { load: () => state, save: (next: Record<string, number>) => { state = { ...next } } },
      disconnectDetached: (ids: string[]) => ids.forEach(id => airfoil.connected.delete(id)) }
    const first = createAirfoilRoute({ ...options, report: vi.fn() })
    await first.start()
    await vi.waitFor(() => expect(state[a1]).toBe(0))
    first.stop()
    t = 400
    const report = vi.fn(), second = createAirfoilRoute({ ...options, report })
    await second.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.volumes.get(a1)).toBe(0)
    t = 1000
    await vi.waitFor(() => expect(airfoil.volumes.get(a1)).toBe(1))
    expect(state).toEqual({})
    second.stop()
  })

  it('keeps the Jabras out of the music while their microphone is open (it then plays ~150 ms early)', async () => {
    let micOpen = true
    const airfoil = fakeAirfoil(), report = vi.fn()
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded: vi.fn(), run: airfoil.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, bluetoothSettleMs: 0, localMusic: () => !micOpen })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(0)
    micOpen = false; route.refreshLocal()
    await vi.waitFor(() => expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(1))
    expect(report).toHaveBeenCalledWith('music_output_jabra_music_on')
    // Each poll re-checks, so a missed notification is corrected within one poll.
    micOpen = true
    await vi.waitFor(() => expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(0))
    expect(report).toHaveBeenCalledWith('music_output_jabra_music_off')
    route.stop()
  })

  it('commits a Jabra music change only after Airfoil applied it, retries a failed write on the next poll, one write at a time', async () => {
    let micOpen = false, failWrites = false, inFlight = 0, overlapped = false
    const airfoil = fakeAirfoil(), report = vi.fn(), degraded = vi.fn()
    const run = vi.fn(async (script: string, args: string[] = []) => {
      if (args[0] !== AIRFOIL_LOCAL_ID || script.includes('every speaker')) return airfoil.run(script, args)
      if (inFlight++) overlapped = true
      try {
        await new Promise(resolve => setTimeout(resolve, 15))
        if (failWrites && !script.includes('connect to')) throw Error('osascript timeout')
        return await airfoil.run(script, args)
      } finally { inFlight-- }
    })
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded, run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, bluetoothSettleMs: 0, localMusic: () => !micOpen })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(1)
    failWrites = true; micOpen = true; route.refreshLocal(); route.refreshLocal()
    await vi.waitFor(() => expect(degraded).toHaveBeenCalledWith('music_output_jabra_music_failed'))
    expect(report).not.toHaveBeenCalledWith('music_output_jabra_music_off')
    expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(1)
    // The failed write is not recorded as applied: a later poll writes it again and only then reports.
    // Keep the failure active until the assertion: a finite two-failure window
    // could finish before waitFor's 50 ms observation, making this test race.
    failWrites = false
    await vi.waitFor(() => expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(0))
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_jabra_music_off'))
    expect(degraded.mock.calls.filter(([reason]) => reason === 'music_output_jabra_music_failed')).toHaveLength(1)
    // A microphone change during a write is applied right after it.
    micOpen = false; route.refreshLocal(); micOpen = true; route.refreshLocal(); micOpen = false; route.refreshLocal()
    await vi.waitFor(() => expect(report.mock.calls.filter(([reason]) => reason === 'music_output_jabra_music_on')).toHaveLength(1))
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(airfoil.volumes.get(AIRFOIL_LOCAL_ID)).toBe(1)
    expect(overlapped).toBe(false)
    route.stop()
  })

  it('retries a failed AirPlay level on the next poll and applies only the latest level, in order', async () => {
    let failNext = 0, inFlight = 0, overlapped = false
    const airfoil = fakeAirfoil(), report = vi.fn(), degraded = vi.fn(), edifier = 'AABBCC001133@EDIFIER M330 Ⅱ 1133'
    const run = vi.fn(async (script: string, args: string[] = []) => {
      if (args[0] !== edifier) return airfoil.run(script, args)
      if (inFlight++) overlapped = true
      try {
        await new Promise(resolve => setTimeout(resolve, 10))
        if (failNext > 0 && !script.includes('connect to')) { failNext--; throw Error('osascript timeout') }
        return await airfoil.run(script, args)
      } finally { inFlight-- }
    })
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded, run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5 })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 3, airplay: 1, bluetooth: 1 }))
    failNext = 1; route.setLevel(0.42)
    await vi.waitFor(() => expect(degraded).toHaveBeenCalledWith('music_output_airplay_level_failed'))
    await vi.waitFor(() => expect(airfoil.volumes.get(edifier)).toBe(0.42))
    route.setLevel(0.5); route.setLevel(0.6); route.setLevel(0.3)
    await vi.waitFor(() => expect(airfoil.volumes.get(edifier)).toBe(0.3))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(airfoil.volumes.get(edifier)).toBe(0.3)
    expect(overlapped).toBe(false)
    expect(degraded).toHaveBeenCalledTimes(1)
    route.stop()
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

  it('reports once when no AirPlay speaker plays for 30 s, unreachable or not found, and when it returns', async () => {
    let t = 0, refuse = true
    const edifier = 'AABBCC001133@EDIFIER M330 Ⅱ 1133', airfoil = fakeAirfoil(), report = vi.fn(), degraded = vi.fn()
    // The Edifier is listed but Airfoil cannot connect it (off the network after a reboot, 2026-11-08).
    const run = vi.fn(async (script: string, args: string[] = []) =>
      script.includes('connect to') && args[0] === edifier && refuse ? 'false' : airfoil.run(script, args))
    const route = createAirfoilRoute({ flagPath: '/flag', report, degraded, run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, now: () => t })
    await route.start()
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 2, airplay: 0, bluetooth: 1 }))
    t = 29_999
    await new Promise(done => setTimeout(done, 30))
    expect(degraded).not.toHaveBeenCalled()
    t = 30_000
    await vi.waitFor(() => expect(degraded).toHaveBeenCalledWith('music_output_airplay_unreachable'))
    await new Promise(done => setTimeout(done, 30))
    expect(degraded).toHaveBeenCalledTimes(1)
    refuse = false
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('music_output_airplay_restored', { speakers: 1 }))
    route.stop()
    // A fresh Airfoil that does not list the Edifier at all.
    t = 0
    const hidden = fakeAirfoil(LIST.split('\n').filter(line => !line.includes('EDIFIER')).join('\n')), missing = vi.fn(), ready = vi.fn()
    const second = createAirfoilRoute({ flagPath: '/flag', report: ready, degraded: missing, run: hidden.run, launch: async () => {}, installed: () => true,
      writeFlag: async () => {}, pollMs: 5, now: () => t })
    await second.start()
    await vi.waitFor(() => expect(ready).toHaveBeenCalledWith('music_output_airfoil_ready', { speakers: 2, airplay: 0, bluetooth: 1 }))
    t = 30_000
    await vi.waitFor(() => expect(missing).toHaveBeenCalledWith('music_output_airplay_not_found'))
    second.stop()
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
