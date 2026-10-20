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
      mode: vi.fn(async (action: string) => { order.push(action); return { status: 'success', reason: action === 'show_console' ? 'console_shown' : action === 'normal' ? 'normal_ready' : action === 'studio' ? 'studio_ready' : 'loop_playing' } }),
      tv: vi.fn(async (action: string) => { order.push(action); return tvResult ?? `tv_${action}` }),
    }
  }
  it('puts the TV in standby before closing app windows', async () => {
    const io = control()
    expect(await operateMirrorControl('stop', io)).toEqual({ app: 'stopped', tv: 'tv_standby', outcome: 'stopped' })
    expect(io.order).toEqual(['standby', 'stop'])
    expect(io.mode).not.toHaveBeenCalled()
  })
  it('connects the venue mouse only after Console and HDMI are ready', async () => {
    const base = control('already_on')
    const io = { ...base, mouse: vi.fn(async (action: string) => { base.order.push(`mouse_${action}`); return 'mouse_started' }) }
    expect((await operateMirrorControl('console', io)).outcome).toBe('console_shown')
    expect(base.order).toEqual(['start', 'ready', 'show_console', 'awake', 'mouse_start'])
    await operateMirrorControl('loop', io)
    await operateMirrorControl('start', io)
    await operateMirrorControl('studio', io)
    expect(io.mouse).toHaveBeenCalledExactlyOnceWith('start')
  })
  it('reports a mouse failure while leaving the opened Console usable by other input', async () => {
    const io = { ...control(), mouse: vi.fn(async () => { throw Error('opaque driver text') }) }
    const result = await operateMirrorControl('console', io)
    expect(result).toMatchObject({ mode: 'success', tv: 'tv_awake', mouse: 'mouse_start_failed', outcome: 'mouse_start_failed' })
    expect(io.app).toHaveBeenCalledExactlyOnceWith('start')
    expect(JSON.stringify(result)).not.toContain('opaque')
  })
  it('still releases the mouse when both TV and application shutdown fail', async () => {
    const io = { ...control('stop_failed', 'tv_standby_failed'), mouse: vi.fn(async () => 'mouse_stopped') }
    expect((await operateMirrorControl('stop', io)).outcome).toBe('stop_failed')
    expect(io.mouse).toHaveBeenCalledExactlyOnceWith('stop')
  })
  it('reports incomplete mouse shutdown after the application has stopped', async () => {
    const io = { ...control(), mouse: vi.fn(async () => 'mouse_stop_failed') }
    expect((await operateMirrorControl('stop', io)).outcome).toBe('mouse_stop_failed')
    expect(io.app).toHaveBeenCalledWith('stop')
  })
  it('keeps controls available on deployments without the optional venue mouse', async () => {
    const io = { ...control(), mouse: vi.fn(async () => 'mouse_not_installed') }
    expect((await operateMirrorControl('console', io)).outcome).toBe('console_shown')
    expect((await operateMirrorControl('stop', io)).outcome).toBe('stopped')
  })
  it('still cleans up when TV control fails', async () => {
    const io = control(undefined, 'tv_unavailable')
    expect((await operateMirrorControl('stop', io)).outcome).toBe('tv_unavailable')
    expect(io.order).toEqual(['standby', 'stop'])
  })
  it('still cleans up when TV control throws, without issuing a mode command', async () => {
    const io = control(); io.tv.mockRejectedValueOnce(Error('private driver output'))
    expect(await operateMirrorControl('stop', io)).toEqual({ app: 'stopped', tv: 'tv_standby_failed', outcome: 'tv_standby_failed' })
    expect(io.app).toHaveBeenCalledWith('stop')
    expect(io.mode).not.toHaveBeenCalled()
    expect(io.ready).not.toHaveBeenCalled()
  })
  it('reports shutdown failure when both TV and shutdown fail', async () => {
    const io = control(undefined, 'tv_unavailable'); io.app.mockRejectedValueOnce(Error('private process output'))
    expect(await operateMirrorControl('stop', io)).toEqual({ app: 'stop_failed', tv: 'tv_unavailable', outcome: 'stop_failed' })
    expect(io.order).toEqual(['standby'])
    expect(io.app).toHaveBeenCalledWith('stop')
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
  it.each(['started', 'already_on'])('waits for the %s app and acknowledged normal mode before waking HDMI', async result => {
    const io = control(result)
    expect((await operateMirrorControl('start', io)).outcome).toBe(result)
    expect(io.order).toEqual(['start', 'ready', 'normal', 'awake'])
  })
  it.each(['started', 'already_on'])('selects acknowledged Interactive Studio in the %s app before waking HDMI', async app => {
    const io = control(app)
    expect(await operateMirrorControl('studio', io)).toEqual({ app, mode: 'success', modeReason: 'studio_ready', tv: 'tv_awake', outcome: 'studio_ready' })
    expect(io.order).toEqual(['start', 'ready', 'studio', 'awake'])
    expect(io.mode).toHaveBeenCalledExactlyOnceWith('studio')
  })
  it('rejects an unknown control before touching the app, mailbox or TV', async () => {
    const io = control()
    await expect(operateMirrorControl('show_studio', io)).rejects.toThrow('mirror_control_action_invalid')
    expect(io.order).toEqual([])
  })
  it.each(['started', 'already_on'])('shows Console in the %s app before waking HDMI', async app => {
    const io = control(app)
    expect(await operateMirrorControl('console', io)).toEqual({ app, mode: 'success', modeReason: 'console_shown', tv: 'tv_awake', outcome: 'console_shown' })
    expect(io.order).toEqual(['start', 'ready', 'show_console', 'awake'])
    expect(io.mode).toHaveBeenCalledExactlyOnceWith('show_console')
  })
  it('keeps standby on a launch failure', async () => {
    const io = control('start_failed')
    expect((await operateMirrorControl('start', io)).outcome).toBe('start_failed')
    expect(io.order).toEqual(['start'])
    expect(io.mode).not.toHaveBeenCalled()
  })
  it('keeps standby when the renderer never becomes ready', async () => {
    const io = control(); io.ready.mockResolvedValue(false)
    expect((await operateMirrorControl('start', io)).outcome).toBe('start_not_ready')
    expect(io.tv).not.toHaveBeenCalled()
    expect(io.mode).not.toHaveBeenCalled()
  })
  it.each([['start', 'normal'], ['loop', 'play_loop'], ['console', 'show_console'], ['studio', 'studio']])('keeps the TV asleep on a failed %s acknowledgement', async (action, command) => {
    const io = control(); io.mode.mockResolvedValue({ status: 'failed', reason: 'playback_failed' })
    expect(await operateMirrorControl(action, io)).toEqual({ app: 'started', mode: 'failed', modeReason: 'playback_failed', tv: 'tv_wake_skipped', outcome: `${action}_mode_failed` })
    expect(io.mode).toHaveBeenCalledWith(command)
    expect(io.tv).not.toHaveBeenCalled()
  })
  it.each(['start', 'loop', 'console', 'studio'])('keeps the TV asleep on an unavailable %s mailbox', async action => {
    const io = control(); io.mode.mockRejectedValueOnce(Error('private raw message'))
    const result = await operateMirrorControl(action, io)
    expect(result.outcome).toBe(`${action}_mode_failed`)
    expect(result.modeReason).toBe('operator_command_failed')
    expect(JSON.stringify(result)).not.toContain('private raw message')
    expect(io.tv).not.toHaveBeenCalled()
  })
  it('rejects a malformed success acknowledgement without retaining its reason', async () => {
    const io = control(); io.mode.mockResolvedValue({ status: 'success', reason: 'private raw message' })
    expect((await operateMirrorControl('loop', io)).modeReason).toBe('operator_response_invalid')
    expect(io.tv).not.toHaveBeenCalled()
  })
  it.each([
    null, {}, { status: 'ok', reason: 'console_shown' }, { status: 'success', reason: 'private raw message' },
  ])('rejects a malformed Console acknowledgement without retaining raw data: %j', async reply => {
    const io = control(); io.mode.mockResolvedValue(reply as never)
    expect(await operateMirrorControl('console', io)).toEqual({ app: 'started', mode: 'failed', modeReason: 'operator_response_invalid', tv: 'tv_wake_skipped', outcome: 'console_mode_failed' })
    expect(io.tv).not.toHaveBeenCalled()
  })
  it.each([['loop', 'play_loop', 'loop_playing'], ['console', 'show_console', 'console_shown'], ['studio', 'studio', 'studio_ready']])('awaits the %s acknowledgement before waking HDMI', async (action, command, outcome) => {
    const io = control()
    let acknowledge!: (result: { status: string, reason: string }) => void
    io.mode.mockImplementationOnce(async action => {
      io.order.push(action)
      return new Promise<{ status: string, reason: string }>(resolve => { acknowledge = resolve })
    })
    const result = operateMirrorControl(action, io)
    await vi.waitFor(() => expect(io.mode).toHaveBeenCalledWith(command))
    expect(io.tv).not.toHaveBeenCalled()
    acknowledge({ status: 'success', reason: outcome })
    expect((await result).outcome).toBe(outcome)
    expect(io.order).toEqual(['start', 'ready', command, 'awake'])
  })
  it('sends repeated LOOP requests to Main for idempotent acknowledgement', async () => {
    const io = control('already_on')
    io.mode.mockImplementation(async action => { io.order.push(action); return { status: 'success', reason: 'loop_already_playing' } })
    expect((await operateMirrorControl('loop', io)).outcome).toBe('loop_playing')
    expect((await operateMirrorControl('loop', io)).outcome).toBe('loop_playing')
    expect(io.order).toEqual(['start', 'ready', 'play_loop', 'awake', 'start', 'ready', 'play_loop', 'awake'])
  })
  it('returns from LOOP to acknowledged normal mode on START', async () => {
    const io = control('already_on')
    await operateMirrorControl('loop', io)
    await operateMirrorControl('start', io)
    expect(io.mode.mock.calls).toEqual([['play_loop'], ['normal']])
  })
  it('switches between Interactive Studio and Conversation through acknowledged STUDIO and START', async () => {
    const io = control('already_on')
    expect((await operateMirrorControl('loop', io)).outcome).toBe('loop_playing')
    expect((await operateMirrorControl('studio', io)).outcome).toBe('studio_ready')
    expect((await operateMirrorControl('start', io)).outcome).toBe('already_on')
    expect(io.mode.mock.calls).toEqual([['play_loop'], ['studio'], ['normal']])
  })
  it.each([['start', 'normal'], ['loop', 'play_loop']])('accepts repeated Console requests while preserving the current %s mode', async (action, command) => {
    const io = control('already_on')
    await operateMirrorControl(action, io)
    expect((await operateMirrorControl('console', io)).outcome).toBe('console_shown')
    expect((await operateMirrorControl('console', io)).outcome).toBe('console_shown')
    expect(io.mode.mock.calls).toEqual([[command], ['show_console'], ['show_console']])
    expect(io.order.slice(4)).toEqual(['start', 'ready', 'show_console', 'awake', 'start', 'ready', 'show_console', 'awake'])
    await operateMirrorControl('stop', io)
    expect(io.order.slice(-2)).toEqual(['standby', 'stop'])
    expect(io.mode).toHaveBeenCalledTimes(3)
  })
  it.each(['start_failed', 'start_timeout'])('skips Console and HDMI after %s', async app => {
    const io = control(app)
    expect(await operateMirrorControl('console', io)).toEqual({ app, tv: 'tv_wake_skipped', outcome: app })
    expect(io.order).toEqual(['start'])
    expect(io.ready).not.toHaveBeenCalled()
    expect(io.mode).not.toHaveBeenCalled()
  })
  it('skips Console and HDMI if readiness fails', async () => {
    const io = control(); io.ready.mockResolvedValue(false)
    expect(await operateMirrorControl('console', io)).toEqual({ app: 'started', tv: 'tv_wake_skipped', outcome: 'console_not_ready' })
    expect(io.mode).not.toHaveBeenCalled()
    expect(io.tv).not.toHaveBeenCalled()
  })
  it('reports a Console acknowledgement timeout without waking HDMI', async () => {
    const io = control(); io.mode.mockResolvedValue({ status: 'failed', reason: 'operator_command_timeout' })
    expect(await operateMirrorControl('console', io)).toEqual({ app: 'started', mode: 'failed', modeReason: 'operator_command_timeout', tv: 'tv_wake_skipped', outcome: 'console_mode_failed' })
    expect(io.tv).not.toHaveBeenCalled()
  })
  it('reports HDMI failure after showing Console without stopping the app or changing mode', async () => {
    const io = control('already_on', 'tv_awake_failed')
    expect(await operateMirrorControl('console', io)).toEqual({ app: 'already_on', mode: 'success', modeReason: 'console_shown', tv: 'tv_awake_failed', outcome: 'tv_awake_failed' })
    expect(io.order).toEqual(['start', 'ready', 'show_console', 'awake'])
    expect(io.app).toHaveBeenCalledExactlyOnceWith('start')
  })
  it('keeps standby when STUDIO cannot establish renderer readiness', async () => {
    const io = control(); io.ready.mockResolvedValue(false)
    expect(await operateMirrorControl('studio', io)).toEqual({ app: 'started', tv: 'tv_wake_skipped', outcome: 'studio_not_ready' })
    expect(io.mode).not.toHaveBeenCalled()
    expect(io.tv).not.toHaveBeenCalled()
  })
  it('skips Interactive Studio and HDMI after a launch failure', async () => {
    const io = control('start_timeout')
    expect(await operateMirrorControl('studio', io)).toEqual({ app: 'start_timeout', tv: 'tv_wake_skipped', outcome: 'start_timeout' })
    expect(io.ready).not.toHaveBeenCalled()
    expect(io.mode).not.toHaveBeenCalled()
  })
  it('reports HDMI failure after selecting Interactive Studio without stopping the app', async () => {
    const io = control('already_on', 'tv_awake_failed')
    expect(await operateMirrorControl('studio', io)).toEqual({ app: 'already_on', mode: 'success', modeReason: 'studio_ready', tv: 'tv_awake_failed', outcome: 'tv_awake_failed' })
    expect(io.app).toHaveBeenCalledExactlyOnceWith('start')
  })
  it('keeps standby when LOOP cannot establish renderer readiness', async () => {
    const io = control(); io.ready.mockResolvedValue(false)
    expect((await operateMirrorControl('loop', io)).outcome).toBe('loop_not_ready')
    expect(io.mode).not.toHaveBeenCalled()
    expect(io.tv).not.toHaveBeenCalled()
  })
  it('reports TV wake failure separately without stopping a running app', async () => {
    const io = control(undefined, 'tv_awake_failed')
    expect(await operateMirrorControl('start', io)).toEqual({ app: 'started', mode: 'success', modeReason: 'normal_ready', tv: 'tv_awake_failed', outcome: 'tv_awake_failed' })
    expect(io.app).toHaveBeenCalledTimes(1)
  })
})
