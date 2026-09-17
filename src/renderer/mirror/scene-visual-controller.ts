import type { AvatarControlCommand } from '../../shared/bridge'
import type { SceneActionCommandContext, SceneVisualPlaybackReport } from '../../shared/types'

type VisualStartCommand = Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>
type VisualStopCommand = Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'stop' }>

export interface SceneVisualMedia {
  src: string
  crossOrigin: string | null
  className: string
  style: {
    opacity: string
    transition: string
  }
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
  fadeInStarted: boolean
  fadeOutScheduled: boolean
  fadeOutStarted: boolean
  readonly timers: Set<unknown>
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
  setVideoAudio: (element: SceneVisualMedia | null, gain: number, durationMs?: number) => void
  prepareFade?: (media: SceneVisualMedia) => void
  schedule?: (callback: () => void, delayMs: number) => unknown
  clear?: (handle: unknown) => void
}>): SceneVisualController {
  let active: ActiveVisual | null = null
  let generation = 0
  let disposed = false
  const schedule = input.schedule ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
  const clear = input.clear ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>))

  const emit = (report: SceneVisualPlaybackReport): void => {
    try { input.report(report) } catch { /* observations cannot gate playback */ }
  }

  const clearVisualTimers = (visual: ActiveVisual): void => {
    for (const handle of visual.timers) clear(handle)
    visual.timers.clear()
    visual.media.style.transition = ''
  }

  const release = (visual: ActiveVisual): void => {
    if (visual.disposed) return
    visual.disposed = true
    clearVisualTimers(visual)
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

  const scheduleFor = (visual: ActiveVisual, callback: () => void, delayMs: number): void => {
    let handle: unknown
    handle = schedule(() => {
      if (handle !== undefined) visual.timers.delete(handle)
      if (current(visual)) callback()
    }, Math.max(0, Math.round(delayMs)))
    visual.timers.add(handle)
  }

  const fadeOpacity = (visual: ActiveVisual, target: number, durationMs: number, done?: () => void): void => {
    if (!current(visual)) return
    const duration = Math.max(0, Math.round(durationMs))
    if (duration > 0) {
      // Force the browser to resolve the initial opacity before the target is
      // assigned. Without this, a media element inserted and changed in one
      // task can skip the visible first frame of the CSS transition.
      try { input.prepareFade?.(visual.media) } catch { /* layout observation cannot gate playback */ }
    }
    visual.media.style.transition = duration === 0 ? '' : `opacity ${duration}ms linear`
    visual.media.style.opacity = String(Math.max(0, Math.min(1, target)))
    if (duration === 0) {
      done?.()
      return
    }
    scheduleFor(visual, () => {
      // A short clip can enter its ending fade before the fade-in timer
      // completes. The ending transition owns the style until release.
      if (!visual.fadeOutStarted) visual.media.style.transition = ''
      done?.()
    }, duration)
  }

  const finishOnce = (visual: ActiveVisual): void => {
    if (!current(visual)) return
    emit(reportFor(visual.command.context, { type: 'ended' }))
    release(visual)
  }

  const beginFadeOut = (visual: ActiveVisual, done: () => void): void => {
    if (!current(visual) || visual.fadeOutStarted) return
    visual.fadeOutStarted = true
    const duration = visual.command.fadeOutMs ?? 0
    if (visual.audioAttached) input.setVideoAudio(visual.media, 0, duration)
    fadeOpacity(visual, 0, duration, done)
  }

  const scheduleNaturalFade = (visual: ActiveVisual): void => {
    const fadeOutMs = visual.command.fadeOutMs ?? 0
    const endingAtMs = Math.max(0, visual.media.duration * 1000 - fadeOutMs)
    const checkPlaybackPosition = (): void => {
      if (!current(visual) || visual.fadeOutStarted) return
      const currentMs = Number.isFinite(visual.media.currentTime) ? Math.max(0, visual.media.currentTime * 1000) : 0
      if (currentMs >= endingAtMs || endingAtMs === 0) {
        beginFadeOut(visual, () => finishOnce(visual))
        return
      }
      // Media can stall while a wall-clock timer is pending. Polling against
      // currentTime keeps the fade bound to playback, then ended remains the
      // final fallback when a browser emits no final timeupdate.
      scheduleFor(visual, checkPlaybackPosition, Math.min(250, Math.max(16, endingAtMs - currentMs)))
    }
    checkPlaybackPosition()
  }

  const fail = (visual: ActiveVisual, errorCode: string): void => {
    if (!current(visual)) return
    emit(reportFor(visual.command.context, { type: 'failed', errorCode }))
    release(visual)
  }

  const start = (command: VisualStartCommand): void => {
    // Replacement is an immediate hard handoff. Only an explicit stop or a
    // one-shot natural ending uses fadeOutMs; old media never fades over new.
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
      fadeInStarted: false,
      fadeOutScheduled: false,
      fadeOutStarted: false,
      timers: new Set(),
    }
    active = visual
    media.className = `scene-visual__media scene-visual__media--${command.fit}`
    media.style.opacity = command.playback === 'still' || (command.fadeInMs ?? 0) === 0 ? '1' : '0'
    media.style.transition = ''
    // The managed-media scheme is a different origin from the renderer.
    // Request CORS before loading so Web Audio can consume the embedded track.
    if (command.playback !== 'still') media.crossOrigin = 'anonymous'
    media.src = `magic-mirror-media://${command.preview ? 'visual-draft' : 'visual'}/${encodeURIComponent(command.assetId)}`

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
        input.setVideoAudio(media, command.fadeInMs && command.fadeInMs > 0 ? 0 : command.gain)
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
      if (!visual.fadeInStarted) {
        visual.fadeInStarted = true
        const fadeInMs = command.fadeInMs ?? 0
        if (fadeInMs > 0) {
          // Let the host paint the initial opacity before changing it. This
          // makes the transition observable instead of two same-task styles.
          scheduleFor(visual, () => {
            if (visual.audioAttached) input.setVideoAudio(media, command.gain, fadeInMs)
            fadeOpacity(visual, 1, fadeInMs)
          }, 0)
        } else {
          fadeOpacity(visual, 1, 0)
        }
      }
      if (command.playback === 'once' && (command.fadeOutMs ?? 0) > 0 && !visual.fadeOutScheduled) {
        visual.fadeOutScheduled = true
        scheduleNaturalFade(visual)
      }
      emit(reportFor(command.context, { type: 'playing', durationMs: Math.round(media.duration * 1000) }))
    })
    listen(visual, 'timeupdate', () => {
      if (!current(visual) || !Number.isFinite(media.currentTime) || media.currentTime < 0) return
      if (command.playback === 'once' && (command.fadeOutMs ?? 0) > 0 && !visual.fadeOutStarted && media.currentTime * 1000 >= media.duration * 1000 - (command.fadeOutMs ?? 0)) {
        beginFadeOut(visual, () => finishOnce(visual))
      }
      emit(reportFor(command.context, { type: 'progress', currentTimeMs: Math.round(media.currentTime * 1000) }))
    })
    listen(visual, 'ended', () => {
      if (!current(visual) || command.playback !== 'once') return
      if ((command.fadeOutMs ?? 0) > 0) {
        beginFadeOut(visual, () => finishOnce(visual))
        return
      }
      finishOnce(visual)
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
      if ((visual.command.fadeOutMs ?? 0) > 0 && visual.command.playback !== 'still') {
        beginFadeOut(visual, () => release(visual))
        return
      }
      release(visual)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      if (active !== null) release(active)
    },
  })
}
