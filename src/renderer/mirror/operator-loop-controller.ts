import type { LoopVideoSettings, OperatorLoopReport } from '../../shared/operator-loop'
import type { AudioDeviceRouter } from '../audio-devices'

interface OperatorLoopInput {
  generation: number
  settings: LoopVideoSettings
  video: HTMLVideoElement
  audio?: HTMLAudioElement
  router: Pick<AudioDeviceRouter, 'attach' | 'subscribe' | 'snapshot'>
  report(report: OperatorLoopReport): void
  onReady(): void
  onFailure(reason: string): void
}

// StrictMode may reuse a node while an abandoned play()/sink promise is pending.
const owners = new WeakMap<HTMLMediaElement, symbol>()

/** One generation owns both independent loops. Main owns timeout and recovery. */
export function startOperatorLoop(input: OperatorLoopInput): () => void {
  const { generation, settings, video, audio, router } = input
  const elements: HTMLMediaElement[] = settings.audioMode === 'separate' && audio ? [video, audio] : [video]
  const owner = Symbol('operator-loop')
  let disposed = false, failed = false, announced = false, warnedOutput = false, released = false, metricsUnavailable = false
  let timer: ReturnType<typeof setInterval> | undefined
  let unsubscribe = () => {}
  const detach = new Set<() => void>()
  const listeners: Array<() => void> = []
  const playing = new Set<HTMLMediaElement>()
  const active = () => !disposed && !failed
  const owns = (media: HTMLMediaElement) => owners.get(media) === owner
  const frames = (): number => {
    try {
      const count = video.getVideoPlaybackQuality?.().totalVideoFrames
      metricsUnavailable = typeof count !== 'number' || !Number.isFinite(count)
      return metricsUnavailable ? 0 : Math.max(0, Math.floor(count!))
    } catch { metricsUnavailable = true; return 0 }
  }
  const timeMs = (media: HTMLMediaElement) => Number.isFinite(media.currentTime) ? Math.max(0, Math.round(media.currentTime * 1000)) : 0
  let initialFrames = 0, initialTime = 0
  const progress = () => ({ videoTimeMs: timeMs(video), frames: frames(),
    ...(settings.audioMode === 'separate' && audio ? { audioTimeMs: timeMs(audio) } : {}),
    ...(metricsUnavailable ? { reason: 'operator_loop_video_metrics_unavailable' } : {}) })
  const release = () => {
    if (released) return
    released = true
    clearInterval(timer)
    listeners.splice(0).forEach(remove => remove())
    unsubscribe()
    detach.forEach(remove => remove()); detach.clear()
    for (const media of elements) {
      if (!owns(media)) continue
      media.pause()
      media.removeAttribute('src')
      media.load()
    }
    playing.clear()
  }
  const emit = (report: Omit<OperatorLoopReport, 'generation'>) => {
    try { input.report({ generation, ...report }) }
    catch {
      if (!active()) return
      failed = true; release(); input.onFailure('operator_loop_report_unavailable')
    }
  }
  const fail = (reason: string) => {
    if (!active()) return
    failed = true; release(); input.onFailure(reason)
    emit({ status: 'failed', reason })
  }
  const checkReady = () => {
    if (!active() || announced || !elements.every(media => playing.has(media) && !media.paused && !media.ended && media.readyState >= 2)) return
    if (frames() <= initialFrames || timeMs(video) <= initialTime || settings.audioMode === 'separate' && (!audio || timeMs(audio) <= 0)) return
    announced = true
    emit({ status: 'playing', ...progress() })
    if (active()) input.onReady()
  }
  const outputState = () => {
    if (!active()) return
    const reason = router.snapshot().reason
    if (reason === 'audio_output_routing_failed') fail('operator_loop_output_unavailable')
    else if (!warnedOutput && (reason.startsWith('audio_output_') || reason === 'audio_preferences_unreadable_using_default')) {
      warnedOutput = true
      emit({ status: 'progress', ...progress(), reason: 'operator_loop_output_default_fallback' })
    }
  }
  const listen = (media: HTMLMediaElement, name: string, callback: () => void) => {
    const guarded = () => { if (active() && owns(media)) callback() }
    media.addEventListener(name, guarded)
    listeners.push(() => media.removeEventListener(name, guarded))
  }

  for (const media of elements) owners.set(media, owner)
  try {
    video.crossOrigin = 'anonymous'
    video.playsInline = true
    video.muted = settings.audioMode === 'separate'
    video.src = `magic-mirror-media://visual/${encodeURIComponent(settings.videoId)}?operatorLoop=${generation}`
    if (settings.audioMode === 'separate' && audio) {
      audio.crossOrigin = 'anonymous'
      audio.muted = false
      audio.src = `magic-mirror-media://music/${encodeURIComponent(settings.audioId)}?operatorLoop=${generation}`
    }
    for (const media of elements) {
      media.loop = true
      media.preload = 'auto'
      media.volume = settings.volume
      media.currentTime = 0
      listen(media, 'playing', () => { playing.add(media); checkReady() })
      listen(media, 'pause', () => playing.delete(media))
      listen(media, 'waiting', () => playing.delete(media))
      listen(media, 'error', () => fail(media === video ? 'operator_loop_video_failed' : 'operator_loop_audio_failed'))
      listen(media, 'timeupdate', checkReady)
      media.load()
    }
    initialFrames = frames(); initialTime = timeMs(video)
    if (!settings.videoId || settings.audioMode === 'separate' && (!audio || !settings.audioId)) fail('operator_loop_unconfigured')
    if (active()) {
      unsubscribe = router.subscribe(outputState)
      timer = setInterval(() => {
        if (!active()) return
        checkReady()
        if (active()) emit({ status: 'progress', ...progress() })
      }, 1000)
      void Promise.all(elements.map(async media => {
        const remove = await router.attach(media, () => !active() || !owns(media))
        if (!active() || !owns(media)) remove()
        else detach.add(remove)
      })).then(() => {
        if (!active()) return
        outputState()
        if (!active()) return
        for (const media of elements) {
          void media.play().then(() => {
            if (!active()) {
              if (owns(media)) { media.pause(); media.removeAttribute('src'); media.load() }
              return
            }
            checkReady()
          }).catch(() => fail(media === video ? 'operator_loop_video_play_failed' : 'operator_loop_audio_play_failed'))
        }
      }).catch(() => fail('operator_loop_output_unavailable'))
    }
  } catch { fail('operator_loop_media_setup_failed') }

  return () => {
    if (disposed) return
    disposed = true
    release()
    emit({ status: 'released', reason: 'operator_loop_released' })
  }
}
