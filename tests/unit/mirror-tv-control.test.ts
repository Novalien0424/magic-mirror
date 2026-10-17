import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error Plain JavaScript shared with the deployed CLI.
import { operateMirrorControl, operateTv, parseTvPower } from '../../scripts/mirror-tv-control.mjs'

const success = (stdout = '') => ({ status: 0, stdout })
const state = (asleep: boolean) => `  mWakefulness=${asleep ? 'Asleep' : 'Awake'}\nDisplay Power: state=${asleep ? 'OFF' : 'ON'}\n`
function device(asleep = false) {
  let time = 0
  return {
    available: vi.fn(() => true), now: () => time,
    wait: vi.fn(async (ms: number) => { time += ms }),
    run: vi.fn(async (args: string[]) => {
      if (args.includes('223')) asleep = true
      if (args.includes('224')) asleep = false
      return success(args.includes('dumpsys') ? state(asleep) : args.includes('am') ? 'Status: ok\n' : '')
    }),
  }
}

describe('TV standby and wake', () => {
  it('requires explicit Android and display states', () => {
    expect(parseTvPower('unavailable')).toEqual({ wakefulness: null, display: null })
    expect(parseTvPower(state(true))).toEqual({ wakefulness: 'Asleep', display: 'OFF' })
  })
  it.each(['standby', 'awake'])('performs idempotent %s without a POWER toggle', async action => {
    const io = device(action === 'awake')
    expect(await operateTv(action, io)).toBe(`tv_${action}`)
    expect(await operateTv(action, io)).toBe(`tv_${action}`)
    expect(io.run.mock.calls.some(([args]) => args.includes(action === 'standby' ? '223' : '224'))).toBe(true)
    expect(io.run.mock.calls.some(([args]) => args.includes('26'))).toBe(false)
    expect(io.run.mock.calls.filter(([args]) => args.includes('am'))).toHaveLength(action === 'awake' ? 2 : 0)
  })
  it('does not inject another sleep key when standby is already confirmed', async () => {
    const io = device(true)
    expect(await operateTv('standby', io)).toBe('tv_standby')
    expect(io.run.mock.calls.some(([args]) => args.includes('keyevent'))).toBe(false)
    expect(io.run.mock.calls.some(([args]) => args.includes('connect'))).toBe(false)
  })
  it('does not start another ADB server when the installed daemon is unavailable', async () => {
    const io = device(); io.available.mockReturnValue(false)
    expect(await operateTv('standby', io)).toBe('tv_unavailable')
    expect(io.run).not.toHaveBeenCalled()
  })
  it('requires sleep confirmation and retries at most once', async () => {
    const io = device(); io.run.mockImplementation(async () => success(state(false)))
    expect(await operateTv('standby', io)).toBe('tv_standby_failed')
    expect(io.run.mock.calls.filter(([args]) => args.includes('223'))).toHaveLength(2)
  })
  it('rejects an unsuccessful HDMI launch even when the display is awake', async () => {
    const io = device(), run = io.run.getMockImplementation()!
    io.run.mockImplementation(async args => args.includes('am') ? success('Error: activity not found') : run(args))
    expect(await operateTv('awake', io)).toBe('tv_awake_failed')
  })
  it('recovers from one transient connection failure', async () => {
    const io = device(); io.run.mockResolvedValueOnce({ status: 1, stdout: '' })
    expect(await operateTv('standby', io)).toBe('tv_standby')
    expect(io.run.mock.calls.filter(([args]) => args.includes('connect'))).toHaveLength(1)
    expect(io.wait).toHaveBeenCalledWith(350)
  })
  it('treats timeouts and thrown driver errors as metadata failures', async () => {
    const io = device(); io.run.mockRejectedValueOnce(Error('private raw driver message'))
    expect(await operateTv('awake', io)).toBe('tv_awake_failed')
  })
  it('caps slow failed probes and reconnects to twelve seconds overall', async () => {
    let time = 0
    const io = { available: () => true, now: () => time, wait: vi.fn(async (ms: number) => { time += ms }),
      run: vi.fn(async (_args: string[], timeout: number) => { time += timeout; return { status: null, error: { code: 'ETIMEDOUT' } } }),
    }
    expect(await operateTv('awake', io)).toBe('tv_awake_failed')
    expect(time).toBe(12000)
    expect(io.run.mock.calls.filter(([args]) => args.includes('connect'))).toHaveLength(2)
  })
  it('reports an offline transport without persisting the raw device error', async () => {
    const io = { ...device(), report: vi.fn() }
    io.run.mockResolvedValueOnce({ status: 1, stdout: '', stderr: 'error: device offline' } as never)
    expect(await operateTv('standby', io)).toBe('tv_standby')
    expect(io.report).toHaveBeenCalledWith('power_before', 'tv_transport_offline')
  })
})

describe('combined Stream Deck sequence', () => {
  function control(appResult?: string, tvResult?: string) {
    const order: string[] = []
    return { order,
      app: vi.fn(async (action: string) => { order.push(action); return appResult ?? (action === 'start' ? 'started' : 'stopped') }),
      ready: vi.fn(async () => { order.push('ready'); return true }),
      tv: vi.fn(async (action: string) => { order.push(action); return tvResult ?? `tv_${action}` }),
    }
  }
  it('puts the TV in standby before closing app windows', async () => {
    const io = control()
    expect(await operateMirrorControl('stop', io)).toEqual({ app: 'stopped', tv: 'tv_standby', outcome: 'stopped' })
    expect(io.order).toEqual(['standby', 'stop'])
  })
  it('still cleans up when TV control fails', async () => {
    const io = control(undefined, 'tv_unavailable')
    expect((await operateMirrorControl('stop', io)).outcome).toBe('tv_unavailable')
    expect(io.order).toEqual(['standby', 'stop'])
  })
  it('preserves app shutdown failure even if the TV is asleep', async () => {
    const io = control('stop_processes_remaining')
    expect((await operateMirrorControl('stop', io)).outcome).toBe('stop_processes_remaining')
  })
  it('sleeps the TV even if the app was already off', async () => {
    const io = control('already_off')
    expect((await operateMirrorControl('stop', io)).outcome).toBe('already_off')
    expect(io.order).toEqual(['standby', 'stop'])
  })
  it.each(['started', 'already_on'])('waits for the %s app before waking HDMI', async result => {
    const io = control(result)
    expect((await operateMirrorControl('start', io)).outcome).toBe(result)
    expect(io.order).toEqual(['start', 'ready', 'awake'])
  })
  it('keeps standby on a launch failure', async () => {
    const io = control('start_failed')
    expect((await operateMirrorControl('start', io)).outcome).toBe('start_failed')
    expect(io.order).toEqual(['start'])
  })
  it('keeps standby when the renderer never becomes ready', async () => {
    const io = control(); io.ready.mockResolvedValue(false)
    expect((await operateMirrorControl('start', io)).outcome).toBe('start_not_ready')
    expect(io.tv).not.toHaveBeenCalled()
  })
  it('reports TV wake failure separately without stopping a running app', async () => {
    const io = control(undefined, 'tv_awake_failed')
    expect(await operateMirrorControl('start', io)).toEqual({ app: 'started', tv: 'tv_awake_failed', outcome: 'tv_awake_failed' })
    expect(io.app).toHaveBeenCalledTimes(1)
  })
})
