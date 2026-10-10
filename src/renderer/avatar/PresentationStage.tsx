import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import type { LifecycleState } from '../../shared/types'
import type { PresentationPayload } from '../../shared/presentation'
import { getAudioDeviceRouter } from '../audio-devices'
import { createPresentationController, type PresentationPhase } from './presentation-controller'
import { applyPresentationAmbience } from './presentation-ambience'
import { playRitualVideo } from './ritual-video-controller'
import { playWakeCue } from './wake-cue'
import './presentation.css'

export function PresentationStage({ payload, lifecycle, children, onPhase, onFailure, silent = false, draft = false, speechActive = false, mediaActive = false, mediaWithoutAudio = false, initialPhase = 'asleep' }: {
  payload: PresentationPayload; lifecycle: LifecycleState; children: ReactNode
  onPhase?: (phase: PresentationPhase) => void; onFailure?: (reason: string) => void; silent?: boolean; draft?: boolean
  mediaActive?: boolean
  mediaWithoutAudio?: boolean
  speechActive?: boolean
  initialPhase?: 'asleep' | 'awake'
}) {
  const { config, background } = payload
  const [phase, setPhase] = useState<PresentationPhase>(lifecycle === 'starting' ? 'inactive' : initialPhase)
  const [exitOpacity, setExitOpacity] = useState(1)
  const [transitionRun, setTransitionRun] = useState(0)
  const [ritualVisible, setRitualVisible] = useState(false)
  const [readyId, setReadyId] = useState<string | null>(null)
  const [bgmVolume, setBgmVolume] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReducedMotion(query.matches)
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [])
  useEffect(() => getAudioDeviceRouter().watchVolumes(volumes => setBgmVolume(volumes.bgm)), [])
  const failure = useRef(onFailure); failure.current = onFailure
  const phaseListener = useRef(onPhase); phaseListener.current = onPhase
  const controller = useRef<ReturnType<typeof createPresentationController> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const ritualRef = useRef<HTMLVideoElement | null>(null)
  const avatarRef = useRef<HTMLDivElement | null>(null)
  const routeReady = useRef<Promise<unknown>>(Promise.resolve())
  const lifecycleRef = useRef(lifecycle); lifecycleRef.current = lifecycle
  useLayoutEffect(() => {
    const c = createPresentationController({ entranceMs: config.entranceMs, exitMs: config.exitMs,
      initialPhase,
      changed: p => {
        if (p === 'exiting' && avatarRef.current) setExitOpacity(Number(getComputedStyle(avatarRef.current).opacity))
        if (p === 'entering' || p === 'exiting') setTransitionRun(run => run + 1)
        setPhase(p)
      } })
    controller.current = c
    setPhase(initialPhase)
    c.update(lifecycleRef.current)
    return () => { c.dispose(); controller.current = null }
  }, [config.entranceMs, config.exitMs, config.mode, config.blackHoldMs, config.revealStartMs,
    config.entranceVideoId, config.exitVideoId, config.entranceBlend, config.exitBlend, payload.model?.id, initialPhase])
  useLayoutEffect(() => { controller.current?.update(lifecycle) }, [lifecycle])
  useLayoutEffect(() => { phaseListener.current?.(phase) }, [phase])
  useEffect(() => {
    if (phase === 'entering' && config.mode === 'reflective' && !silent && !draft) {
      return playWakeCue(reason => failure.current?.(reason))
    }
  }, [phase, config.mode, silent, draft])
  useEffect(() => { setReadyId(null) }, [background?.id])

  useEffect(() => {
    if (config.mode === 'reflective' || !background || readyId === background.id || phase === 'inactive') return
    const timer = setTimeout(() => failure.current?.('presentation_background_timeout'), 10000)
    return () => clearTimeout(timer)
  }, [background?.id, readyId, phase, config.mode])

  useEffect(() => {
    const video = videoRef.current
    if (!video || config.mode === 'reflective') return
    let cancelled = false
    if (phase === 'asleep' || phase === 'exiting') {
      void video.play().catch(() => { if (!cancelled) failure.current?.('presentation_background_play_failed') })
    } else video.pause()
    return () => { cancelled = true; video.pause() }
  }, [phase, background?.id, draft, config.mode])

  const ritualKind = phase === 'entering' ? 'entrance' : phase === 'exiting' ? 'exit' : null
  const ritualVideo = ritualKind === 'entrance' ? payload.entranceVideo : ritualKind === 'exit' ? payload.exitVideo : null
  useLayoutEffect(() => {
    setRitualVisible(false)
    if (config.mode !== 'reflective' || !ritualKind || reducedMotion) return
    const video = ritualRef.current
    if (!ritualVideo || !video) { failure.current?.('presentation_ritual_video_missing'); return }
    return playRitualVideo({ video,
      src: `magic-mirror-media://visual${draft ? '-draft' : ''}/${encodeURIComponent(ritualVideo.id)}`,
      delayMs: ritualKind === 'entrance' ? config.blackHoldMs ?? 400 : 0,
      durationMs: ritualKind === 'entrance' ? config.entranceMs : config.exitMs,
      onVisible: setRitualVisible, onFailure: reason => failure.current?.(reason) })
  }, [config.mode, ritualKind, ritualVideo?.id, config.blackHoldMs, config.revealStartMs, config.entranceMs, config.exitMs,
    config.entranceBlend, config.exitBlend, payload.model?.id, initialPhase, draft, reducedMotion])

  useLayoutEffect(() => {
    if (!config.ambienceId || silent) return
    const audio = audioRef.current
    if (!audio) return
    audio.loop = true; audio.volume = 0; audio.preload = 'auto'
    audioRef.current = audio
    let disposed = false
    const report = () => { if (!disposed) failure.current?.('presentation_ambience_failed') }
    audio.addEventListener('error', report)
    const attached = getAudioDeviceRouter().attach(audio, () => disposed)
    routeReady.current = attached
    return () => {
      disposed = true; audio.pause(); audio.removeEventListener('error', report)
      audio.removeAttribute('src'); audio.load()
      void attached.then(detach => detach())
    }
  }, [config.ambienceId, silent, draft])

  useLayoutEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    return applyPresentationAmbience({ audio, phase, reflective: config.mode === 'reflective', ambienceGain: config.ambienceGain,
      activeAmbienceGain: config.activeAmbienceGain ?? 0, bgmVolume, speechActive, mediaActive, mediaWithoutAudio,
      routeReady: routeReady.current, onFailure: reason => failure.current?.(reason) })
  }, [phase, config.mode, config.ambienceId, config.ambienceGain, config.activeAmbienceGain, silent, draft, bgmVolume, speechActive, mediaActive, mediaWithoutAudio])

  const backgroundReady = !background || readyId === background.id
  const hidden = config.mode === 'reflective' && (phase === 'asleep' || phase === 'inactive')
    || config.mode === 'emerge' && phase === 'asleep' && backgroundReady
  const mediaUrl = background ? `magic-mirror-media://visual${draft ? '-draft' : ''}/${encodeURIComponent(background.id)}` : undefined
  return <div className="presentation" data-phase={phase} data-mode={config.mode}
    data-background-ready={backgroundReady} style={{ '--entrance-ms': `${config.entranceMs}ms`, '--exit-ms': `${config.exitMs}ms`,
      '--reveal-delay-ms': `${config.revealStartMs ?? 1500}ms`, '--reveal-duration-ms': `${config.entranceMs - (config.revealStartMs ?? 1500)}ms`,
      '--ritual-exit-opacity': exitOpacity } as CSSProperties}>
    {!silent && config.ambienceId ? <audio key={config.ambienceId} ref={audioRef} src={`magic-mirror-media://music${draft ? '-draft' : ''}/${encodeURIComponent(config.ambienceId)}`} data-presentation-ambience="true" /> : null}
    {config.mode !== 'reflective' ? <div className="presentation__background" aria-hidden="true">
      {background?.kind === 'video' ? <video key={background.id} ref={videoRef} src={mediaUrl} muted loop playsInline preload="auto"
        onLoadedData={() => setReadyId(background.id)} onPlaying={() => setReadyId(background.id)} onError={() => { setReadyId(null); failure.current?.('presentation_background_failed') }} /> : null}
      {background?.kind === 'image' ? <img key={background.id} src={mediaUrl} alt=""
        onLoad={() => setReadyId(background.id)} onError={() => { setReadyId(null); failure.current?.('presentation_background_failed') }} /> : null}
    </div> : null}
    <div ref={avatarRef} className="presentation__avatar" style={{ opacity: hidden ? 0 : undefined,
      animationName: config.mode === 'reflective' && (phase === 'entering' || phase === 'exiting')
        ? `reflective-${phase === 'entering' ? 'reveal' : 'retreat'}${transitionRun % 2 ? '' : '-repeat'}` : undefined }}>{children}</div>
    {config.mode === 'reflective' && ritualKind && ritualVideo ? <video
      key={`${ritualKind}:${ritualVideo.id}`} ref={ritualRef} className="presentation__ritual-video" data-ritual-video={ritualKind}
      muted playsInline preload="auto" aria-hidden="true"
      style={{ visibility: ritualVisible ? 'visible' : 'hidden', mixBlendMode: ritualKind === 'entrance' ? config.entranceBlend ?? 'screen' : config.exitBlend ?? 'screen' }} /> : null}
    {config.mode === 'emerge' ? <div className="presentation__mist" aria-hidden="true"><i /><i /><i /></div> : null}
  </div>
}
