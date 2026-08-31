import type { AvatarControlCommand } from '../../shared/bridge'
import type { SceneActionCommandContext, SceneVisualPlaybackReport } from '../../shared/types'

type VisualStartCommand = Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>
type VisualStopCommand = Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'stop' }>

export interface SceneVisualMedia {
  src: string
  className: string
  currentTime: number
  duration: number
  loop: boolean
  muted: boolean
  preload: string
  autoplay: boolean
  addEventListener(name: string, listener: () => void): void
  removeEventListener(name: string, listener: () => void): void
  play(): Promise<void>
  pause(): void
  load(): void
}

export interface SceneVisualController {
  handleCommand(command: VisualStartCommand | VisualStopCommand): void
  dispose(): void
}

interface ActiveVisual {
  readonly generation: number
  readonly command: VisualStartCommand
  readonly media: SceneVisualMedia
  readonly listeners: Array<readonly [string, () => void]>
  presented: boolean
  audioAttached: boolean
  disposed: boolean
}

type VisualReportFields =
  | { type: 'ready' }
  | { type: 'playing'; durationMs: number }
  | { type: 'progress'; currentTimeMs: number }
  | { type: 'ended' }
  | { type: 'failed'; errorCode: string }

function reportFor(
  context: SceneActionCommandContext,
  fields: VisualReportFields,
): SceneVisualPlaybackReport {
  return { ...context, ...fields } as SceneVisualPlaybackReport
}

export function createSceneVisualController(input: Readonly<{
  createImage: () => SceneVisualMedia
  createVideo: () => SceneVisualMedia
  present: (media: SceneVisualMedia | null) => void
  report: (report: SceneVisualPlaybackReport) => void
  setVideoAudio: (element: SceneVisualMedia | null, gain: number) => void
}>): SceneVisualController {
  let active: ActiveVisual | null = null
  let generation = 0
  let disposed = false

  const emit = (report: SceneVisualPlaybackReport): void => {
    try { input.report(report) } catch { /* observations cannot gate playback */ }
  }

  const release = (visual: ActiveVisual): void => {
    if (visual.disposed) return
    visual.disposed = true
    for (const [name, listener] of visual.listeners) visual.media.removeEventListener(name, listener)
    if (visual.audioAttached) input.setVideoAudio(null, 0)
    if (visual.command.playback !== 'still') {
      try { visual.media.pause() } catch { /* already stopped */ }
      visual.media.src = ''
      try { visual.media.load() } catch { /* teardown is best effort */ }
    }
    if (visual.presented) input.present(null)
    if (active === visual) active = null
  }

  const listen = (visual: ActiveVisual, name: string, listener: () => void): void => {
    visual.listeners.push([name, listener])
    visual.media.addEventListener(name, listener)
  }

  const current = (visual: ActiveVisual): boolean =>
    !disposed && active === visual && visual.generation === generation && !visual.disposed

  const fail = (visual: ActiveVisual, errorCode: string): void => {
    if (!current(visual)) return
    emit(reportFor(visual.command.context, { type: 'failed', errorCode }))
    release(visual)
  }

  const start = (command: VisualStartCommand): void => {
    if (active !== null) release(active)
    const media = command.playback === 'still' ? input.createImage() : input.createVideo()
    const visual: ActiveVisual = {
      generation: ++generation,
      command,
      media,
      listeners: [],
      presented: false,
      audioAttached: false,
      disposed: false,
    }
    active = visual
    media.className = `scene-visual__media scene-visual__media--${command.fit}`
    media.src = `magic-mirror-media://visual/${encodeURIComponent(command.assetId)}`

    if (command.playback === 'still') {
      listen(visual, 'load', () => {
        if (!current(visual)) return
        visual.presented = true
        input.present(media)
        emit(reportFor(command.context, { type: 'ready' }))
      })
      listen(visual, 'error', () => fail(visual, 'visual_image_decode_failed'))
      return
    }

    media.preload = 'auto'
    media.autoplay = true
    media.loop = command.playback === 'loop'
    media.muted = command.audio === 'muted'
    listen(visual, 'loadeddata', () => {
      if (!current(visual)) return
      emit(reportFor(command.context, { type: 'ready' }))
      if (command.audio === 'embedded') {
        visual.audioAttached = true
        input.setVideoAudio(media, command.gain)
      }
      void media.play().catch(() => fail(visual, 'visual_video_play_failed'))
    })
    listen(visual, 'playing', () => {
      if (!current(visual) || !Number.isFinite(media.duration) || media.duration <= 0) {
        fail(visual, 'visual_video_metadata_invalid')
        return
      }
      if (!visual.presented) {
        visual.presented = true
        input.present(media)
      }
      emit(reportFor(command.context, { type: 'playing', durationMs: Math.round(media.duration * 1000) }))
    })
    listen(visual, 'timeupdate', () => {
      if (!current(visual) || !Number.isFinite(media.currentTime) || media.currentTime < 0) return
      emit(reportFor(command.context, { type: 'progress', currentTimeMs: Math.round(media.currentTime * 1000) }))
    })
    listen(visual, 'ended', () => {
      if (!current(visual) || command.playback !== 'once') return
      emit(reportFor(command.context, { type: 'ended' }))
      release(visual)
    })
    listen(visual, 'error', () => fail(visual, 'visual_video_decode_failed'))
    try { media.load() } catch { fail(visual, 'visual_video_load_failed') }
  }

  return Object.freeze({
    handleCommand(command: VisualStartCommand | VisualStopCommand): void {
      if (disposed) return
      if (command.action === 'start') {
        start(command)
        return
      }
      const visual = active
      if (visual === null) return
      if (command.runId !== 'all' && (
        command.runId !== visual.command.context.runId
        || command.sceneId !== visual.command.context.sceneId
      )) return
      release(visual)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      if (active !== null) release(active)
    },
  })
}
