import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startOperatorLoop } from '../../../src/renderer/mirror/operator-loop-controller'
import type { LoopVideoSettings, OperatorLoopReport } from '../../../src/shared/operator-loop'
import type { AudioDeviceRouter } from '../../../src/renderer/audio-devices'

const videoId = `folder-${'a'.repeat(40)}`, audioId = `folder-${'b'.repeat(40)}`
const settings: LoopVideoSettings = { videoId, audioId, audioMode: 'separate', volume: .63, fit: 'cover' }
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

class Media extends EventTarget {
  src = ''
  currentTime = 0
  duration = 0
  paused = true
  ended = false
  readyState = 4
  muted = false
  loop = false
  volume = 1
  crossOrigin: string | null = null
  playsInline = false
  preload = ''
  frames = 0
  play = vi.fn(async () => { this.paused = false })
  pause = vi.fn(() => { this.paused = true })
  load = vi.fn()
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = '' })
  getVideoPlaybackQuality = () => ({ totalVideoFrames: this.frames })
  playing() { this.paused = false; this.dispatchEvent(new Event('playing')) }
  update() { this.dispatchEvent(new Event('timeupdate')) }
}

function fixture() {
  const video = new Media(), audio = new Media()
  const removeVideo = vi.fn(), removeAudio = vi.fn(), unsubscribe = vi.fn()
  const reports: OperatorLoopReport[] = []
  const ready = vi.fn(), failed = vi.fn()
  let reason = 'audio_devices_ready'
  let outputChanged = () => {}
  const router = {
    attach: vi.fn(async (media: unknown) => media === video ? removeVideo : removeAudio),
    subscribe: vi.fn((listener: () => void) => { outputChanged = listener; return unsubscribe }),
    snapshot: () => ({ reason }),
  }
  const start = (config = settings, generation = 7) => startOperatorLoop({ generation, settings: config,
    video: video as unknown as HTMLVideoElement, audio: audio as unknown as HTMLAudioElement,
    router: router as unknown as Pick<AudioDeviceRouter, 'attach' | 'subscribe' | 'snapshot'>,
    report: report => reports.push(report), onReady: ready, onFailure: failed })
  return { video, audio, reports, ready, failed, router, start, removeVideo, removeAudio, unsubscribe,
    output(reasonCode: string) { reason = reasonCode; outputChanged() } }
}

describe('dedicated operator loop ownership', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('routes both elements before starting, then waits for both playing events and video frames', async () => {
    const h = fixture(), routedVideo = deferred(), routedAudio = deferred()
    h.router.attach.mockImplementation(async media => {
      await (media === h.video ? routedVideo.promise : routedAudio.promise)
      return media === h.video ? h.removeVideo : h.removeAudio
    })
    const stop = h.start()
    expect(h.video.src).toBe(`magic-mirror-media://visual/${videoId}?operatorLoop=7`)
    expect(h.audio.src).toBe(`magic-mirror-media://music/${audioId}?operatorLoop=7`)
    routedVideo.resolve(); await settle()
    expect(h.video.play).not.toHaveBeenCalled(); expect(h.audio.play).not.toHaveBeenCalled()
    routedAudio.resolve(); await settle()
    expect(h.video.play).toHaveBeenCalledOnce(); expect(h.audio.play).toHaveBeenCalledOnce()
    h.video.playing(); h.video.frames = 1; h.video.update()
    expect(h.ready).not.toHaveBeenCalled()
    h.audio.playing()
    expect(h.ready).not.toHaveBeenCalled()
    h.video.currentTime = .1; h.audio.currentTime = .1; h.video.update()
    expect(h.ready).toHaveBeenCalledOnce()
    expect(h.reports).toEqual([{ generation: 7, status: 'playing', videoTimeMs: 100, audioTimeMs: 100, frames: 1 }])
    h.video.update(); h.audio.playing()
    expect(h.reports.filter(report => report.status === 'playing')).toHaveLength(1)
    stop()
  })

  it('does not confuse play promises or a playing event without frame/time progress with readiness', async () => {
    const h = fixture(), stop = h.start()
    await settle()
    h.video.playing(); h.audio.playing()
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.ready).not.toHaveBeenCalled()
    h.video.currentTime = .14; h.video.update()
    expect(h.ready).not.toHaveBeenCalled()
    h.video.frames = 2; h.audio.currentTime = .14; h.video.update()
    expect(h.ready).toHaveBeenCalledOnce()
    stop()
  })

  it('uses one configured volume and independent native loops, reporting each position every second', async () => {
    const h = fixture(), stop = h.start()
    await settle()
    expect(h.video.muted).toBe(true); expect(h.audio.muted).toBe(false)
    expect(h.video.volume).toBe(.63); expect(h.audio.volume).toBe(.63)
    expect(h.video.loop).toBe(true); expect(h.audio.loop).toBe(true)
    h.video.duration = 2; h.audio.duration = 7
    h.video.playing(); h.audio.playing(); h.video.frames = 3; h.video.update()
    h.video.currentTime = .25; h.audio.currentTime = 4.5; h.video.frames = 70
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.reports.at(-1)).toEqual({ generation: 7, status: 'progress', videoTimeMs: 250, audioTimeMs: 4500, frames: 70 })
    h.video.currentTime = 1.25; h.audio.currentTime = .1; h.video.frames = 100
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.reports.at(-1)).toMatchObject({ videoTimeMs: 1250, audioTimeMs: 100, frames: 100 })
    expect(h.video.play).toHaveBeenCalledOnce(); expect(h.audio.play).toHaveBeenCalledOnce()
    stop()
  })

  it('plays embedded audio through the video alone, at the same configured volume', async () => {
    const h = fixture(), stop = h.start({ ...settings, audioMode: 'embedded', audioId: '' })
    await settle()
    expect(h.router.attach).toHaveBeenCalledTimes(1)
    expect(h.video.muted).toBe(false); expect(h.video.volume).toBe(.63)
    expect(h.audio.play).not.toHaveBeenCalled(); expect(h.audio.src).toBe('')
    h.video.playing(); h.video.frames = 1; h.video.currentTime = .1; h.video.update()
    expect(h.reports[0]).toEqual({ generation: 7, status: 'playing', videoTimeMs: 100, frames: 1 })
    stop()
  })

  it('does not claim playback when decoded frame metrics are unavailable', async () => {
    const h = fixture()
    h.video.getVideoPlaybackQuality = () => { throw Error('synthetic metrics failure') }
    const stop = h.start(); await settle()
    h.video.playing(); h.audio.playing()
    expect(h.ready).not.toHaveBeenCalled()
    h.video.currentTime = .12; h.video.update()
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.ready).not.toHaveBeenCalled()
    expect(h.reports[0]).toMatchObject({ status: 'progress', videoTimeMs: 120, frames: 0, reason: 'operator_loop_video_metrics_unavailable' })
    stop()
  })

  it('releases both sources, routing, listeners and timers once, with no reports after cleanup', async () => {
    const h = fixture(), stop = h.start()
    await settle()
    stop(); stop()
    for (const media of [h.video, h.audio]) {
      expect(media.pause).toHaveBeenCalledOnce(); expect(media.src).toBe('')
      expect(media.load).toHaveBeenCalledTimes(2)
    }
    expect(h.removeVideo).toHaveBeenCalledOnce(); expect(h.removeAudio).toHaveBeenCalledOnce()
    expect(h.unsubscribe).toHaveBeenCalledOnce()
    expect(h.reports).toEqual([{ generation: 7, status: 'released', reason: 'operator_loop_released' }])
    h.video.frames = 100; h.video.playing(); h.audio.playing(); h.video.update()
    h.audio.dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(3000)
    expect(h.reports).toHaveLength(1); expect(h.ready).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })

  it('detaches late routing results without starting abandoned media', async () => {
    const h = fixture(), routed = deferred()
    h.router.attach.mockImplementation(async media => { await routed.promise; return media === h.video ? h.removeVideo : h.removeAudio })
    const stop = h.start(); stop(); routed.resolve(); await settle()
    expect(h.removeVideo).toHaveBeenCalledOnce(); expect(h.removeAudio).toHaveBeenCalledOnce()
    expect(h.video.play).not.toHaveBeenCalled(); expect(h.audio.play).not.toHaveBeenCalled()
    expect(h.reports).toHaveLength(1)
  })

  it('fences a late play completion from a replacement reusing the same nodes', async () => {
    const h = fixture(), played = deferred()
    h.video.play.mockImplementationOnce(() => played.promise)
    const oldStop = h.start(); await settle(); oldStop()
    const nextStop = h.start(settings, 8); await settle()
    const pauses = h.video.pause.mock.calls.length
    played.resolve(); await settle()
    expect(h.video.pause).toHaveBeenCalledTimes(pauses)
    h.video.frames = 1; h.video.currentTime = .1; h.audio.currentTime = .1; h.video.playing(); h.audio.playing()
    expect(h.reports.filter(report => report.status === 'playing')).toEqual([
      { generation: 8, status: 'playing', videoTimeMs: 100, audioTimeMs: 100, frames: 1 },
    ])
    expect(h.video.src).toContain('operatorLoop=8')
    nextStop()
  })

  it('releases a late play completion on an abandoned node without reporting playing', async () => {
    const h = fixture(), played = deferred()
    h.video.play.mockImplementationOnce(() => played.promise)
    const stop = h.start(); await settle(); stop()
    played.resolve(); await settle()
    expect(h.video.src).toBe(''); expect(h.video.pause).toHaveBeenCalledTimes(2)
    expect(h.reports).toEqual([{ generation: 7, status: 'released', reason: 'operator_loop_released' }])
    expect(h.ready).not.toHaveBeenCalled()
  })

  it('fails the combined playback and releases both sources on audio rejection without leaking errors', async () => {
    const h = fixture()
    h.audio.play.mockRejectedValueOnce(Error('synthetic decoder details'))
    const stop = h.start(); await settle()
    expect(h.video.src).toBe(''); expect(h.audio.src).toBe('')
    expect(h.failed).toHaveBeenCalledWith('operator_loop_audio_play_failed')
    expect(h.reports).toEqual([{ generation: 7, status: 'failed', reason: 'operator_loop_audio_play_failed' }])
    expect(h.ready).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
    stop()
    expect(h.removeVideo).toHaveBeenCalledOnce(); expect(h.removeAudio).toHaveBeenCalledOnce()
    expect(h.unsubscribe).toHaveBeenCalledOnce()
  })

  it('leaves stall recovery to Main and exposes an output fallback using only a safe reason', async () => {
    const h = fixture(), stop = h.start(); await settle()
    h.video.dispatchEvent(new Event('waiting'))
    h.output('audio_output_unavailable_using_default')
    expect(h.reports.at(-1)).toMatchObject({ status: 'progress', reason: 'operator_loop_output_default_fallback' })
    await vi.advanceTimersByTimeAsync(10000)
    expect(h.video.play).toHaveBeenCalledOnce(); expect(h.failed).not.toHaveBeenCalled()
    h.output('audio_output_routing_failed')
    expect(h.failed).toHaveBeenCalledWith('operator_loop_output_unavailable')
    expect(h.video.src).toBe(''); expect(h.audio.src).toBe('')
    stop()
  })
})
