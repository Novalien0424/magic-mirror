import { describe, expect, it, vi } from 'vitest'
import { createSceneVisualController, videoHasAudio, type SceneVisualMedia } from '../../../src/renderer/mirror/scene-visual-controller'
import type { AvatarControlCommand } from '../../../src/shared/bridge'

class FakeMedia implements SceneVisualMedia {
  error: { code: number } | null = null
  crossOrigin: string | null = null
  crossOriginAtLoad: string | null = null
  private source = ''
  get src(): string { return this.source }
  set src(value: string) { this.crossOriginAtLoad = this.crossOrigin; this.source = value }
  className = ''
  style = { opacity: '1', transition: '' }
  currentTime = 0
  duration = 5
  loop = false
  muted = true
  preload = ''
  autoplay = false
  readonly pause = vi.fn()
  readonly load = vi.fn()
  readonly play = vi.fn(async () => undefined)
  readonly listeners = new Map<string, Set<() => void>>()
  addEventListener(name: string, listener: () => void): void {
    const listeners = this.listeners.get(name) ?? new Set()
    listeners.add(listener)
    this.listeners.set(name, listeners)
  }
  removeEventListener(name: string, listener: () => void): void {
    this.listeners.get(name)?.delete(listener)
  }
  emit(name: string): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener()
  }
}

const context = {
  runId: 'scene-run-1', sceneId: 'scene-one', stageId: 'stage-one', actionId: 'visual-one',
}

function command(fields: Partial<Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>> = {}) {
  return {
    type: 'scene_visual', action: 'start', assetId: 'visual-one', fit: 'contain',
    playback: 'once', audio: 'muted', gain: 0, context, ...fields,
  } as const
}

function harness() {
  const images: FakeMedia[] = []
  const videos: FakeMedia[] = []
  const reports: unknown[] = []
  const presented: Array<SceneVisualMedia | null> = []
  const audio: Array<{ element: SceneVisualMedia | null; gain: number; durationMs?: number }> = []
  let clock = 0
  let nextTimer = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  const controller = createSceneVisualController({
    createImage: () => { const media = new FakeMedia(); images.push(media); return media },
    createVideo: () => { const media = new FakeMedia(); videos.push(media); return media },
    present: (media) => presented.push(media),
    report: (report) => reports.push(report),
    setVideoAudio: (element, gain, durationMs) => audio.push(durationMs === undefined ? { element, gain } : { element, gain, durationMs }),
    schedule: (callback, delayMs) => {
      const handle = ++nextTimer
      timers.set(handle, { at: clock + delayMs, callback })
      return handle
    },
    clear: (handle) => { timers.delete(handle as number) },
  })
  const advance = (durationMs: number): void => {
    const target = clock + durationMs
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, left], [, right]) => left.at - right.at)[0]
      if (due === undefined) break
      const [handle, timer] = due
      timers.delete(handle)
      clock = timer.at
      timer.callback()
    }
    clock = target
  }
  return { advance, audio, controller, images, presented, reports, videos }
}

describe('Mirror Scene visual controller', () => {
  it.each([true, false])('detects embedded audio presence=%s and releases every inspection track', hasAudio => {
    const videoTrack = { stop: vi.fn() }, audioTrack = { stop: vi.fn() }
    const tracks = hasAudio ? [videoTrack, audioTrack] : [videoTrack]
    const stream = { getVideoTracks: () => [videoTrack], getAudioTracks: () => hasAudio ? [audioTrack] : [], getTracks: () => tracks } as unknown as MediaStream
    expect(videoHasAudio({ captureStream: () => stream })).toBe(hasAudio)
    for (const track of tracks) expect(track.stop).toHaveBeenCalledOnce()
  })
  it('does not treat unavailable capture or unready metadata as proof of no audio', () => {
    expect(videoHasAudio({})).toBeNull()
    expect(videoHasAudio({ captureStream: () => { throw Error('unsupported') } })).toBeNull()
    expect(videoHasAudio({ captureStream: () => new class { getVideoTracks() { return [] }; getTracks() { return [] } } as unknown as MediaStream })).toBeNull()
  })
  it('retries a transient folder-video load once, before showing it, and fences cancelled retries', () => {
    const h = harness()
    h.controller.handleCommand(command({ assetId: 'folder-test' }))
    const video = h.videos[0]!
    video.error = { code: 4 }; video.emit('error')
    expect(h.reports).toEqual([])
    h.advance(500)
    expect(video.load).toHaveBeenCalledTimes(2)
    video.error = null; video.emit('loadeddata'); video.emit('playing')
    expect(h.reports.at(-1)).toMatchObject({ type: 'playing' })
    h.controller.handleCommand(command({ assetId: 'folder-next' }))
    const next = h.videos[1]!
    next.error = { code: 2 }; next.emit('error'); h.advance(500); next.emit('error')
    expect(h.reports.at(-1)).toMatchObject({ type: 'failed' })
    h.controller.handleCommand(command({ assetId: 'folder-last' }))
    const last = h.videos[2]!
    last.error = { code: 2 }; last.emit('error'); h.controller.dispose()
    const loads = last.load.mock.calls.length
    h.advance(1000)
    expect(last.load).toHaveBeenCalledTimes(loads)
  })
  it('loads draft media only for an explicit preview command', () => {
    const h = harness()
    h.controller.handleCommand(command({ preview: true }))
    expect(h.videos[0]!.src).toBe('magic-mirror-media://visual-draft/visual-one?playback=1')
    h.controller.handleCommand(command())
    expect(h.videos[1]!.src).toBe('magic-mirror-media://visual/visual-one?playback=2')
    h.controller.dispose()
  })
  it('keeps the prior surface visible until an image is decoded and fences stale replacement events', () => {
    const h = harness()
    h.controller.handleCommand(command({ playback: 'still' }))
    const first = h.images[0]!
    expect(h.presented).toEqual([])
    first.emit('load')
    expect(h.presented).toEqual([first])
    expect(h.reports.at(-1)).toMatchObject({ ...context, type: 'ready' })

    h.controller.handleCommand(command({ assetId: 'visual-two', context: { ...context, actionId: 'visual-two' }, playback: 'still' }))
    expect(h.presented.at(-1)).toBeNull()
    first.emit('error')
    expect(h.reports).not.toContainEqual(expect.objectContaining({ actionId: 'visual-one', type: 'failed' }))
  })

  it('reports video readiness, actual playing, progress, and one-shot completion', async () => {
    const h = harness()
    h.controller.handleCommand(command({ audio: 'embedded', gain: 0.4 }))
    const video = h.videos[0]!
    expect(video.crossOriginAtLoad).toBe('anonymous')
    video.emit('loadeddata')
    await Promise.resolve()
    expect(video.play).toHaveBeenCalledTimes(1)
    expect(h.reports.at(-1)).toMatchObject({ type: 'ready' })
    video.emit('playing')
    expect(h.presented.at(-1)).toBe(video)
    expect(h.audio).toContainEqual({ element: video, gain: 0.4 })
    expect(h.reports.at(-1)).toMatchObject({ type: 'playing', durationMs: 5000 })
    video.currentTime = 1.25
    video.emit('timeupdate')
    expect(h.reports.at(-1)).toMatchObject({ type: 'progress', currentTimeMs: 1250 })
    video.emit('ended')
    expect(h.reports).toContainEqual(expect.objectContaining({ type: 'ended' }))
    expect(h.audio.at(-1)).toEqual({ element: null, gain: 0 })
  })

  it('honors targeted stop and disposes each media element once', () => {
    const h = harness()
    h.controller.handleCommand(command())
    const video = h.videos[0]!
    video.emit('loadeddata')
    video.emit('playing')
    h.controller.handleCommand({ type: 'scene_visual', action: 'stop', runId: 'other', sceneId: 'scene-one' })
    expect(video.pause).not.toHaveBeenCalled()
    h.controller.handleCommand({ type: 'scene_visual', action: 'stop', runId: context.runId, sceneId: context.sceneId })
    h.controller.dispose()
    expect(video.pause).toHaveBeenCalledTimes(1)
    expect(video.load).toHaveBeenCalledTimes(2)
    expect(h.presented.at(-1)).toBeNull()
  })

  it('fades video opacity and embedded audio together after the media is presented', async () => {
    const h = harness()
    h.controller.handleCommand(command({ audio: 'embedded', gain: 0.4, fadeInMs: 800 }))
    const video = h.videos[0]!
    expect(video.style.opacity).toBe('0')
    video.emit('loadeddata')
    await Promise.resolve()
    expect(h.audio).toContainEqual({ element: video, gain: 0 })
    video.emit('playing')
    expect(h.presented.at(-1)).toBe(video)
    h.advance(0)
    expect(video.style.opacity).toBe('1')
    expect(video.style.transition).toBe('opacity 800ms linear')
    expect(h.audio.at(-1)).toEqual({ element: video, gain: 0.4, durationMs: 800 })
    h.advance(800)
    expect(video.style.transition).toBe('')
  })

  it('starts a one-shot fade during the final interval and releases after the fade', () => {
    const h = harness()
    h.controller.handleCommand(command({ audio: 'embedded', gain: 0.6, fadeOutMs: 1000 }))
    const video = h.videos[0]!
    video.emit('loadeddata')
    video.emit('playing')
    expect(video.style.opacity).toBe('1')
    video.currentTime = 4
    video.emit('timeupdate')
    expect(video.style.opacity).toBe('0')
    expect(video.style.transition).toBe('opacity 1000ms linear')
    expect(h.audio.at(-1)).toEqual({ element: video, gain: 0, durationMs: 1000 })
    h.advance(1000)
    expect(h.reports).toContainEqual(expect.objectContaining({ type: 'ended' }))
    expect(video.pause).toHaveBeenCalledTimes(1)
    expect(h.audio.at(-1)).toEqual({ element: null, gain: 0 })
  })

  it('fades an explicit stop, but replacement and dispose cancel pending fades immediately', () => {
    const h = harness()
    h.controller.handleCommand(command({ audio: 'embedded', gain: 0.5, fadeOutMs: 1000 }))
    const first = h.videos[0]!
    first.emit('loadeddata')
    first.emit('playing')
    h.controller.handleCommand({ type: 'scene_visual', action: 'stop', runId: context.runId, sceneId: context.sceneId })
    expect(first.style.opacity).toBe('0')
    expect(first.pause).not.toHaveBeenCalled()
    h.controller.handleCommand(command({ assetId: 'visual-two', audio: 'muted' }))
    const second = h.videos[1]!
    h.advance(1000)
    expect(first.pause).toHaveBeenCalledTimes(1)
    expect(second.style.opacity).toBe('1')
    h.controller.handleCommand(command({ assetId: 'visual-three', audio: 'muted', fadeOutMs: 1000 }))
    const third = h.videos[2]!
    third.emit('loadeddata')
    third.emit('playing')
    h.controller.dispose()
    expect(third.pause).toHaveBeenCalledTimes(1)
    expect(third.style.transition).toBe('')
    h.advance(1000)
    expect(third.pause).toHaveBeenCalledTimes(1)
  })
})
