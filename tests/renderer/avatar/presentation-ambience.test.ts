import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPresentationAmbience } from '../../../src/renderer/avatar/presentation-ambience'

describe('presentation BGM speech priority', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16))
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  const setup = () => {
    const audio = { volume: .4, currentTime: 12, play: vi.fn(async () => undefined), pause: vi.fn() }
    const input = { audio, phase: 'awake' as const, ambienceGain: .4, activeAmbienceGain: .2,
      bgmVolume: .5, speechActive: false, routeReady: Promise.resolve(), onFailure: vi.fn() }
    return { audio, input }
  }

  it('keeps the same track playing across wake, using independent active and sleeping levels', async () => {
    const { audio, input } = setup()
    const cancel = applyPresentationAmbience(input)
    await vi.advanceTimersByTimeAsync(600)
    expect(audio.volume).toBeCloseTo(.1)
    expect(audio.play).toHaveBeenCalled()
    expect(audio.pause).not.toHaveBeenCalled()
    expect(audio.currentTime).toBe(12)
    cancel()
    applyPresentationAmbience({ ...input, phase: 'asleep' })
    await vi.advanceTimersByTimeAsync(600)
    expect(audio.volume).toBeCloseTo(.2)
  })

  it('silences immediately for speech, keeps its position and fades back only after speech ends', async () => {
    const { audio, input } = setup()
    const cancel = applyPresentationAmbience({ ...input, speechActive: true })
    expect(audio.volume).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(audio.volume).toBe(0)
    expect(audio.pause).not.toHaveBeenCalled()
    expect(audio.currentTime).toBe(12)
    cancel()
    applyPresentationAmbience(input)
    expect(audio.volume).toBe(0)
    await vi.advanceTimersByTimeAsync(250)
    expect(audio.volume).toBeGreaterThan(0)
    expect(audio.volume).toBeLessThan(.1)
    await vi.advanceTimersByTimeAsync(400)
    expect(audio.volume).toBeCloseTo(.1)
  })

  it('keeps farewell speech silent through an exit and cancels stale volume ramps', async () => {
    const { audio, input } = setup()
    const cancel = applyPresentationAmbience(input)
    await vi.advanceTimersByTimeAsync(100)
    cancel()
    applyPresentationAmbience({ ...input, phase: 'exiting', speechActive: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(audio.volume).toBe(0)
  })

  it('pauses for inactive states, zero active volume and global mute', async () => {
    for (const patch of [{ phase: 'inactive' as const }, { activeAmbienceGain: 0 }, { bgmVolume: 0 }]) {
      const { audio, input } = setup()
      applyPresentationAmbience({ ...input, ...patch })
      await vi.advanceTimersByTimeAsync(600)
      expect(audio.volume).toBe(0)
      expect(audio.pause).toHaveBeenCalled()
    }
  })

  it('does not play after disposal while routing is pending, and reports playback failures', async () => {
    const { audio, input } = setup()
    let ready!: () => void
    const cancel = applyPresentationAmbience({ ...input, routeReady: new Promise<void>(resolve => { ready = resolve }) })
    cancel(); ready()
    await vi.advanceTimersByTimeAsync(600)
    expect(audio.play).not.toHaveBeenCalled()
    audio.play.mockRejectedValueOnce(new Error('decode failed'))
    applyPresentationAmbience(input)
    await vi.advanceTimersByTimeAsync(600)
    expect(input.onFailure).toHaveBeenCalledWith('presentation_ambience_play_failed')
  })
})
