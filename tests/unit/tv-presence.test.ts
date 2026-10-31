import { afterEach, describe, expect, it, vi } from 'vitest'
import { monitorTvPresence, parseTvHost, TV_STARTUP_GRACE_MS, type TvPresence } from '../../src/main/tv-presence'

afterEach(() => vi.useRealTimers())
function fixture() {
  vi.useFakeTimers()
  let hdmi: TvPresence = 'absent', ethernet: TvPresence = 'absent'
  const onAbsent = vi.fn(), report = vi.fn()
  const monitor = monitorTvPresence({ display: () => hdmi, ethernet: async () => ethernet,
    onAbsent, report, now: () => Date.now() })
  return { monitor, onAbsent, report, hdmi: (value: TvPresence) => { hdmi = value },
    ethernet: (value: TvPresence) => { ethernet = value } }
}

describe('TV absence shutdown', () => {
  it('allows three minutes for a booting TV, then quits once if both signals remain absent', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(TV_STARTUP_GRACE_MS - 1)
    expect(f.onAbsent).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.onAbsent).toHaveBeenCalledTimes(1)
    expect(f.report).toHaveBeenLastCalledWith({ hdmi: 'absent', ethernet: 'absent', reason: 'startup_presence_grace_expired' })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(f.onAbsent).toHaveBeenCalledTimes(1)
  })
  it.each(['hdmi', 'ethernet'] as const)('stays running when only %s is present and resets the full countdown after recovery', async signal => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(120_000)
    f[signal]('present')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.onAbsent).not.toHaveBeenCalled()
    f[signal]('absent')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(f.onAbsent).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.onAbsent).toHaveBeenCalledTimes(1)
    expect(f.report).toHaveBeenLastCalledWith({ hdmi: 'absent', ethernet: 'absent', reason: 'both_absent_15_seconds' })
  })
  it('never quits for a missing TV while MusicLoop holds, and restarts the countdown afterwards', async () => {
    vi.useFakeTimers()
    let music = true
    const onAbsent = vi.fn(), report = vi.fn()
    monitorTvPresence({ display: () => 'absent', ethernet: async () => 'absent', hold: () => music, onAbsent, report, now: () => Date.now() })
    // A cold MUSIC LOOP press with the TV off: no startup or absence quit while it plays.
    await vi.advanceTimersByTimeAsync(TV_STARTUP_GRACE_MS + 60_000)
    expect(onAbsent).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith({ hdmi: 'absent', ethernet: 'absent', reason: 'absence_held_music_loop' })
    music = false
    await vi.advanceTimersByTimeAsync(14_000)
    expect(onAbsent).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(onAbsent).toHaveBeenCalledTimes(1)
  })
  it('does not treat a failed display query or uncertain network result as power-off', async () => {
    const f = fixture()
    f.ethernet('unknown')
    await vi.advanceTimersByTimeAsync(TV_STARTUP_GRACE_MS + 20_000)
    f.ethernet('absent'); f.hdmi('unknown')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.onAbsent).not.toHaveBeenCalled()
    expect(f.report).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'presence_query_unavailable' }))
    f.monitor.stop()
  })
  it('skips network connections while HDMI is present and probes after HDMI disappears', async () => {
    vi.useFakeTimers()
    let hdmi: TvPresence = 'present'
    const ethernet = vi.fn(async () => 'absent' as const), report = vi.fn(), onAbsent = vi.fn()
    const monitor = monitorTvPresence({ display: () => hdmi, ethernet, report, onAbsent, now: () => Date.now() })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ethernet).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith({ hdmi: 'present', ethernet: 'unknown', reason: 'presence_detected' })
    hdmi = 'absent'
    await vi.advanceTimersByTimeAsync(15_000)
    expect(ethernet).toHaveBeenCalled()
    expect(onAbsent).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onAbsent).toHaveBeenCalledOnce()
    monitor.stop()
  })
  it('honors HDMI that appears during the last startup network probe', async () => {
    vi.useFakeTimers()
    let hdmi: TvPresence = 'absent', complete!: (value: TvPresence) => void
    const onAbsent = vi.fn(), report = vi.fn()
    const monitor = monitorTvPresence({ display: () => hdmi, ethernet: () => new Promise(resolve => { complete = resolve }),
      onAbsent, report, now: () => Date.now() })
    await vi.advanceTimersByTimeAsync(TV_STARTUP_GRACE_MS)
    hdmi = 'present'; complete('absent')
    await vi.advanceTimersByTimeAsync(0)
    expect(onAbsent).not.toHaveBeenCalled()
    expect(report).toHaveBeenLastCalledWith({ hdmi: 'present', ethernet: 'absent', reason: 'presence_detected' })
    monitor.stop()
  })
  it('cancels pending work on stop without a late quit', async () => {
    vi.useFakeTimers()
    let complete!: (value: TvPresence) => void
    let signal!: AbortSignal
    const onAbsent = vi.fn(), display = vi.fn(() => 'absent' as const)
    const monitor = monitorTvPresence({ display, ethernet: s => {
      signal = s; return new Promise(resolve => { complete = resolve })
    }, onAbsent, report: vi.fn() })
    monitor.stop(); complete('absent')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(signal.aborted).toBe(true)
    expect(display).toHaveBeenCalledOnce()
    expect(onAbsent).not.toHaveBeenCalled()
  })
  it('accepts only an explicit IP target', () => {
    expect(parseTvHost(' 192.168.77.2 ')).toBe('192.168.77.2')
    expect(parseTvHost(undefined)).toBeUndefined()
    expect(parseTvHost('example.com')).toBeUndefined()
  })
})
