import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playRitualVideo } from '../../../src/renderer/avatar/ritual-video-controller'

function fixture() {
  const media = Object.assign(new EventTarget(), { src: '', currentTime: 8, muted: false, loop: true, playsInline: false, preload: '',
    play: vi.fn<() => Promise<void>>(async () => {}), pause: vi.fn(), load: vi.fn() })
  const video = Object.assign(media, { removeAttribute: vi.fn((key: string) => { if (key === 'src') media.src = '' }) })
  const onVisible = vi.fn(), onFailure = vi.fn()
  const input = { video: video as unknown as HTMLVideoElement, src: 'magic-mirror-media://visual/mist', delayMs: 400, durationMs: 4000, onVisible, onFailure }
  return { media, input, onVisible, onFailure }
}

describe('one-shot ritual video ownership', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds the clip hidden, starts once from zero and releases it at the total entrance boundary', async () => {
    const { media, input, onVisible, onFailure } = fixture()
    playRitualVideo(input)
    expect(media.muted).toBe(true); expect(media.loop).toBe(false)
    await vi.advanceTimersByTimeAsync(399)
    expect(media.play).not.toHaveBeenCalled(); expect(onVisible).toHaveBeenLastCalledWith(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(media.currentTime).toBe(0); expect(media.play).toHaveBeenCalledTimes(1)
    expect(onVisible).toHaveBeenLastCalledWith(true)
    await vi.advanceTimersByTimeAsync(3600)
    expect(media.src).toBe(''); expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(media.pause).toHaveBeenCalled(); expect(onFailure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(8000)
    expect(media.play).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the black-hold start and clears pending media on disposal', async () => {
    const { media, input, onVisible } = fixture()
    const stop = playRitualVideo(input)
    stop(); stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(media.play).not.toHaveBeenCalled(); expect(media.src).toBe('')
    expect(onVisible).toHaveBeenLastCalledWith(false); expect(vi.getTimerCount()).toBe(0)
  })
  it('does not let a preload stall create a timeout after playback recovers', async () => {
    const { media, input, onFailure } = fixture()
    const stop = playRitualVideo(input)
    media.dispatchEvent(new Event('stalled'))
    await vi.advanceTimersByTimeAsync(3500)
    expect(media.play).toHaveBeenCalledOnce()
    expect(onFailure).not.toHaveBeenCalled()
    stop(); expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses a late play completion on an abandoned element without showing it', async () => {
    const { media, input, onVisible } = fixture()
    let finish!: () => void
    media.play.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const stop = playRitualVideo(input)
    await vi.advanceTimersByTimeAsync(400)
    stop(); const pauses = media.pause.mock.calls.length
    finish(); await Promise.resolve(); await Promise.resolve()
    expect(media.pause.mock.calls.length).toBeGreaterThan(pauses)
    expect(onVisible).not.toHaveBeenCalledWith(true); expect(media.src).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let an old promise pause or hide a replacement using the same element', async () => {
    const { media, input, onVisible } = fixture()
    let oldFinish!: () => void
    media.play.mockImplementationOnce(() => new Promise<void>(resolve => { oldFinish = resolve }))
    playRitualVideo(input); await vi.advanceTimersByTimeAsync(400)
    const stop = playRitualVideo({ ...input, src: 'magic-mirror-media://visual/replacement', delayMs: 0 })
    await vi.advanceTimersByTimeAsync(0)
    const pauses = media.pause.mock.calls.length
    oldFinish(); await Promise.resolve(); await Promise.resolve()
    expect(media.pause).toHaveBeenCalledTimes(pauses)
    expect(media.src).toContain('replacement'); expect(onVisible).toHaveBeenLastCalledWith(true)
    stop(); expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['error', 'reject', 'timeout', 'stall'] as const)('reports %s once, clears playback and keeps the presentation clock bounded', async cause => {
    const { media, input, onFailure, onVisible } = fixture()
    if (cause === 'reject') media.play.mockRejectedValueOnce(new Error('synthetic decode failure'))
    if (cause === 'timeout') media.play.mockImplementationOnce(() => new Promise<void>(() => {}))
    playRitualVideo(input)
    await vi.advanceTimersByTimeAsync(400)
    if (cause === 'error') media.dispatchEvent(new Event('error'))
    if (cause === 'stall') media.dispatchEvent(new Event('waiting'))
    await vi.advanceTimersByTimeAsync(5000)
    media.dispatchEvent(new Event('error'))
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0]).toMatch(/^presentation_ritual_video_(?:failed|play_failed|timeout)$/)
    expect(media.src).toBe(''); expect(onVisible).toHaveBeenLastCalledWith(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
