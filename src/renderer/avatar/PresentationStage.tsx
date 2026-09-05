import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import type { LifecycleState } from '../../shared/types'
import type { PresentationPayload } from '../../shared/presentation'
import { getAudioDeviceRouter } from '../audio-devices'
import { createPresentationController, type PresentationPhase } from './presentation-controller'
import './presentation.css'

export function PresentationStage({ payload, lifecycle, children, onPhase, onFailure, silent = false, draft = false }: {
  payload: PresentationPayload; lifecycle: LifecycleState; children: ReactNode
  onPhase?: (phase: PresentationPhase) => void; onFailure?: (reason: string) => void; silent?: boolean; draft?: boolean
}) {
  const { config, background } = payload
  const [phase, setPhase] = useState<PresentationPhase>(lifecycle === 'starting' ? 'inactive' : 'asleep')
  const [readyId, setReadyId] = useState<string | null>(null)
  const failure = useRef(onFailure); failure.current = onFailure
  const phaseListener = useRef(onPhase); phaseListener.current = onPhase
  const controller = useRef<ReturnType<typeof createPresentationController> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const routeReady = useRef<Promise<unknown>>(Promise.resolve())
  const lifecycleRef = useRef(lifecycle); lifecycleRef.current = lifecycle
  useEffect(() => {
    const c = createPresentationController({ entranceMs: config.entranceMs, exitMs: config.exitMs,
      changed: p => { setPhase(p); phaseListener.current?.(p) } })
    controller.current = c
    setPhase('asleep'); phaseListener.current?.('asleep')
    c.update(lifecycleRef.current)
    return () => { c.dispose(); controller.current = null }
  }, [config.entranceMs, config.exitMs, config.mode])
  useEffect(() => { controller.current?.update(lifecycle) }, [lifecycle])
  useEffect(() => { setReadyId(null) }, [background?.id])

  useEffect(() => {
    if (!background || readyId === background.id || phase === 'inactive') return
    const timer = setTimeout(() => failure.current?.('presentation_background_timeout'), 10000)
    return () => clearTimeout(timer)
  }, [background?.id, readyId, phase])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    if (phase === 'asleep' || phase === 'exiting') {
      void video.play().catch(() => { if (!cancelled) failure.current?.('presentation_background_play_failed') })
    } else video.pause()
    return () => { cancelled = true; video.pause() }
  }, [phase, background?.id, draft])

  useEffect(() => {
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

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let cancelled = false
    let frame = 0
    const target = phase === 'asleep' || phase === 'exiting' ? config.ambienceGain : 0
    const start = audio.volume
    const started = performance.now()
    if (target > 0) void routeReady.current.then(() => { if (!cancelled) return audio.play() }).catch(() => { if (!cancelled) failure.current?.('presentation_ambience_play_failed') })
    const tick = () => {
      if (cancelled) return
      const fraction = Math.min(1, (performance.now() - started) / 500)
      audio.volume = start + (target - start) * fraction
      if (fraction < 1) frame = requestAnimationFrame(tick)
      else if (target === 0) audio.pause()
    }
    if (phase === 'inactive') { audio.volume = 0; audio.pause() } else tick()
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [phase, config.ambienceId, config.ambienceGain, silent])

  const backgroundReady = !background || readyId === background.id
  const hidden = config.mode === 'emerge' && phase === 'asleep' && backgroundReady
  const mediaUrl = background ? `magic-mirror-media://visual${draft ? '-draft' : ''}/${encodeURIComponent(background.id)}` : undefined
  return <div className="presentation" data-phase={phase} data-mode={config.mode}
    data-background-ready={backgroundReady} style={{ '--entrance-ms': `${config.entranceMs}ms`, '--exit-ms': `${config.exitMs}ms` } as CSSProperties}>
    {!silent && config.ambienceId ? <audio key={config.ambienceId} ref={audioRef} src={`magic-mirror-media://music${draft ? '-draft' : ''}/${encodeURIComponent(config.ambienceId)}`} data-presentation-ambience="true" /> : null}
    <div className="presentation__background" aria-hidden="true">
      {background?.kind === 'video' ? <video key={background.id} ref={videoRef} src={mediaUrl} muted loop playsInline preload="auto"
        onLoadedData={() => setReadyId(background.id)} onPlaying={() => setReadyId(background.id)} onError={() => { setReadyId(null); failure.current?.('presentation_background_failed') }} /> : null}
      {background?.kind === 'image' ? <img key={background.id} src={mediaUrl} alt=""
        onLoad={() => setReadyId(background.id)} onError={() => { setReadyId(null); failure.current?.('presentation_background_failed') }} /> : null}
    </div>
    <div className="presentation__avatar" style={{ opacity: hidden ? 0 : undefined }}>{children}</div>
    {config.mode === 'emerge' ? <div className="presentation__mist" aria-hidden="true"><i /><i /><i /></div> : null}
  </div>
}
