import { describe, expect, it, vi } from 'vitest'
import { createSceneVisualController, type SceneVisualMedia } from '../../../src/renderer/mirror/scene-visual-controller'
import type { AvatarControlCommand } from '../../../src/shared/bridge'

class FakeMedia implements SceneVisualMedia {
  src = ''
  className = ''
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
  const audio: Array<{ element: SceneVisualMedia | null; gain: number }> = []
  const controller = createSceneVisualController({
    createImage: () => { const media = new FakeMedia(); images.push(media); return media },
    createVideo: () => { const media = new FakeMedia(); videos.push(media); return media },
    present: (media) => presented.push(media),
    report: (report) => reports.push(report),
    setVideoAudio: (element, gain) => audio.push({ element, gain }),
  })
  return { audio, controller, images, presented, reports, videos }
}

describe('Mirror Scene visual controller', () => {
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
})
