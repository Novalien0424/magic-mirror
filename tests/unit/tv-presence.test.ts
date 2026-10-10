import { afterEach, describe, expect, it, vi } from 'vitest'
import { monitorTvPresence, parseTvHost, type TvPresence } from '../../src/main/tv-presence'

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
  it('quits once only after both signals are absent continuously for 15 seconds, including startup', async () => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(14_999)
    expect(f.onAbsent).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.onAbsent).toHaveBeenCalledTimes(1)
    expect(f.report).toHaveBeenLastCalledWith({ hdmi: 'absent', ethernet: 'absent', reason: 'both_absent_15_seconds' })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(f.onAbsent).toHaveBeenCalledTimes(1)
  })
  it.each(['hdmi', 'ethernet'] as const)('stays running when only %s is present and resets the full countdown after recovery', async signal => {
    const f = fixture()
    await vi.advanceTimersByTimeAsync(14_000)
    f[signal]('present')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.onAbsent).not.toHaveBeenCalled()
    f[signal]('absent')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(f.onAbsent).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.onAbsent).toHaveBeenCalledTimes(1)
  })
  it('does not treat a failed display query or uncertain network result as power-off', async () => {
    const f = fixture()
    f.ethernet('unknown')
    await vi.advanceTimersByTimeAsync(20_000)
    f.ethernet('absent'); f.hdmi('unknown')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.onAbsent).not.toHaveBeenCalled()
    expect(f.report).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'presence_query_unavailable' }))
    f.monitor.stop()
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
    expect(display).not.toHaveBeenCalled()
    expect(onAbsent).not.toHaveBeenCalled()
  })
  it('accepts only an explicit IP target', () => {
    expect(parseTvHost(' 192.168.77.2 ')).toBe('192.168.77.2')
    expect(parseTvHost(undefined)).toBeUndefined()
    expect(parseTvHost('example.com')).toBeUndefined()
  })
})
