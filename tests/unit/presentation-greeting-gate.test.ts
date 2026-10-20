import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPresentationGreetingGate } from '../../src/renderer/avatar/presentation-greeting-gate'
import { DEFAULT_PRESENTATION, type PresentationConfig } from '../../src/shared/presentation'

const reflective: PresentationConfig = { ...DEFAULT_PRESENTATION, mode: 'reflective', entranceMs: 4000, exitMs: 2400 }

describe('wake presentation greeting gate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('leaves legacy greetings, steady awake and dormant sessions immediate', async () => {
    const gate = createPresentationGreetingGate({ onReason: vi.fn() })
    for (const [config, phase, lifecycle] of [
      [DEFAULT_PRESENTATION, 'entering', 'activating'], [reflective, 'awake', 'active'], [reflective, 'asleep', 'dormant'],
    ] as const) {
      gate.update(config, phase, lifecycle)
      await expect(gate.wait(new AbortController().signal)).resolves.toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    }
    gate.dispose()
  })

  it('waits across live entrance updates, then releases only at awake', async () => {
    const gate = createPresentationGreetingGate({ onReason: vi.fn() })
    gate.update(reflective, 'asleep', 'activating')
    let finished = false
    const waiting = gate.wait(new AbortController().signal).then(() => { finished = true })
    gate.update(reflective, 'entering', 'activating')
    await vi.advanceTimersByTimeAsync(3900)
    gate.update(reflective, 'entering', 'active')
    expect(finished).toBe(false)
    gate.update(reflective, 'awake', 'active')
    await waiting
    expect(finished).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    gate.dispose()
  })

  it.each(['abort', 'sleep', 'mode', 'replacement', 'dispose'] as const)('cleans up and suppresses a pending greeting after %s', async action => {
    const reason = vi.fn()
    const gate = createPresentationGreetingGate({ onReason: reason })
    const abort = new AbortController()
    gate.update(reflective, 'entering', 'activating')
    const rejected = expect(gate.wait(abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
    if (action === 'abort') abort.abort()
    if (action === 'sleep') gate.update(reflective, 'exiting', 'dormant')
    if (action === 'mode') gate.update({ ...reflective, mode: 'always_visible' }, 'entering', 'active')
    if (action === 'replacement') gate.update({ ...reflective, entranceVideoId: 'replacement' }, 'entering', 'active')
    if (action === 'dispose') gate.dispose()
    await rejected
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(20000)
    expect(reason.mock.calls.every(([value]) => typeof value === 'string' && /^wake_presentation_[a-z_]+$/.test(value))).toBe(true)
    gate.dispose()
  })

  it('bounds a missing awake callback to the remaining entrance time without extending on repeated updates', async () => {
    const onReason = vi.fn()
    const gate = createPresentationGreetingGate({ onReason })
    gate.update(reflective, 'entering', 'activating')
    await vi.advanceTimersByTimeAsync(3000)
    const waiting = gate.wait(new AbortController().signal)
    gate.update(reflective, 'entering', 'active')
    await vi.advanceTimersByTimeAsync(1250)
    await waiting
    expect(onReason).toHaveBeenCalledExactlyOnceWith('wake_presentation_timeout')
    expect(vi.getTimerCount()).toBe(0)
    gate.dispose()
  })

  it('uses a reasoned immediate fallback for invalid timing and rejects waits after disposal', async () => {
    const onReason = vi.fn()
    const gate = createPresentationGreetingGate({ onReason })
    gate.update({ ...reflective, entranceMs: 1000 }, 'entering', 'active')
    await expect(gate.wait(new AbortController().signal)).resolves.toBeUndefined()
    expect(onReason).toHaveBeenCalledWith('wake_presentation_timing_invalid')
    gate.dispose()
    await expect(gate.wait(new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
