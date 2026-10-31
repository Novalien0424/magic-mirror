import { useEffect, useRef, useState } from 'react'
import type { MirrorBridge } from '../../shared/bridge'
import type { DanceFrame } from '../../shared/dance-floor'
/** Applied Core parameters exposed to movement QA, in this order. */
const DANCE_QA_PARAMETERS = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ', 'ParamEyeBallX', 'ParamEyeLOpen']
import type { AvatarModelReference } from '../../shared/avatar-profiles'
import { AvatarCanvas } from '../avatar/AvatarCanvas'
import type { CubismAvatarRenderer } from '../avatar/cubism-avatar'
import { createProcessedRealtimeAudioOutput } from '../realtime/processed-audio-output'
import { createRealtimeSession, type RealtimeSessionHandle } from '../realtime/realtime-session-adapter'
import type { RealtimeAudioOutput } from '../realtime/realtime-audio-output'
import { getAudioDeviceRouter } from '../audio-devices'

export function DanceFloor(): React.JSX.Element {
  const bridge = window.magicMirror as MirrorBridge
  const [frame, setFrame] = useState<DanceFrame | null>(null), [model, setModel] = useState<AvatarModelReference>()
  const [speaking, setSpeaking] = useState(false)
  const renderer = useRef<CubismAvatarRenderer | null>(null), root = useRef<HTMLElement>(null), current = useRef(frame)
  current.current = frame
  useEffect(() => {
    let disposed = false, received = false
    const stop = bridge.onDanceFrame?.(next => { received = true; if (!disposed) setFrame(next) })
    const unavailable = () => bridge.reportRealtimeMetadata?.({ kind: 'avatar', status: 'failed', reason: 'dance_presentation_unavailable' })
    void bridge.getDanceFrame?.().then(next => { if (!disposed && !received) setFrame(next) }).catch(unavailable)
    void bridge.getPresentation?.().then(presentation => { if (!disposed && presentation?.model) setModel(presentation.model) }).catch(unavailable)
    return () => { disposed = true; stop?.() }
  }, [])
  useEffect(() => { renderer.current?.setDanceFrame?.(frame?.status === 'playing' ? frame : null) }, [frame])
  useEffect(() => {
    // Actual Core writes on the rendered frame clock; metadata only, for sync QA.
    let id = 0
    const inspect = () => {
      const sample = renderer.current?.getDanceSample?.(), element = root.current
      if (element && sample) {
        element.dataset.dancePositionMs = String(sample.positionMs)
        element.dataset.danceHeadY = String(sample.parameters.ParamAngleY)
        element.dataset.danceBeat = String(sample.beatIndex ?? -1)
        element.dataset.danceImpactMs = String(sample.impactTimeMs ?? -1)
        element.dataset.danceSynchronized = String(sample.synchronized)
        element.dataset.danceParams = DANCE_QA_PARAMETERS.map(name => (sample.parameters[name] ?? 0).toFixed(2)).join(',')
      }
      id = requestAnimationFrame(inspect)
    }
    id = requestAnimationFrame(inspect)
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => {
    if (!frame || frame.status !== 'welcome') return
    const generation = frame.generation, abort = new AbortController()
    let output: RealtimeAudioOutput | undefined, session: RealtimeSessionHandle | undefined
    let silent: AudioContext | undefined, track: MediaStreamTrack | undefined, detach: (() => void) | undefined
    let raf = 0, stopped = false, cleanup: Promise<void> | undefined
    const stop = (): Promise<void> => {
      stopped = true; abort.abort(); cancelAnimationFrame(raf); output?.setMuted(true); track?.stop()
      renderer.current?.setMouthOpen(0); setSpeaking(false)
      const resources = { session, output, silent, detach }; session = undefined; output = undefined; silent = undefined; detach = undefined
      cleanup = Promise.allSettled([cleanup, resources.session?.close('dance_finished'), resources.output?.dispose(), resources.silent?.close()]).then(() => { resources.detach?.() })
      return cleanup
    }
    const check = () => { if (stopped || abort.signal.aborted) throw Error('dance_cancelled') }
    const run = async () => {
      const bundle = await bridge.danceWelcome?.(generation); check()
      if (!bundle) throw Error('dance_welcome_unavailable')
      output = await createProcessedRealtimeAudioOutput({ voiceEffects: bundle.snapshot.voiceEffects }); check()
      const router = getAudioDeviceRouter(), preferences = await bridge.getAudioPreferences?.(); check()
      if (preferences) await router.select(preferences.preferences)
      detach = await router.attach(output.sink!, () => stopped); check()
      silent = new AudioContext(); const destination = silent.createMediaStreamDestination()
      track = destination.stream.getAudioTracks()[0]; await silent.resume(); check()
      const samples = new Float32Array(output.analyser.fftSize)
      let peak = 0
      const mouth = () => {
        if (stopped || !output) return
        output.analyser.getFloatTimeDomainData(samples)
        const rms = Math.sqrt(samples.reduce((sum, v) => sum + v*v, 0) / samples.length)
        peak = Math.max(peak, rms)
        if (root.current) root.current.dataset.danceWelcomePeak = String(peak)
        renderer.current?.setMouthOpen(Math.min(1, rms * 8))
        raf = requestAnimationFrame(mouth)
      }
      session = createRealtimeSession({ preview: true, snapshot: bundle.snapshot, clientSecret: bundle.clientSecret,
        mediaStream: destination.stream, audioElement: output.audioElement, sessionId: `dance-${generation}`, sessionGeneration: generation + 1,
        avatar: { ...bundle.avatar, wakeGreeting: '', sleepFarewell: '' },
        eventSink: event => { if (event.status === 'failed' || event.status === 'degraded') bridge.reportRealtimeMetadata?.({ kind: 'avatar', status: 'degraded', reason: 'dance_welcome_degraded' }) },
        onFailure: () => { void stop().then(() => bridge.finishDanceWelcome?.(generation, false)) },
        waitForOutputTail: () => output?.waitForTail?.() ?? Promise.resolve(),
        onAudioActivity: activity => output?.handleActivity?.(activity, state => {
          if (state === 'output_started') { setSpeaking(true); cancelAnimationFrame(raf); mouth() }
          if (state === 'output_stopped') setSpeaking(false)
        }),
      })
      await session.connect(); check()
      session.danceWelcome?.(bundle.language, abort.signal, completed => {
        if (root.current) root.current.dataset.danceWelcomeCompleted = String(completed)
        void stop().then(() => bridge.finishDanceWelcome?.(generation, completed))
      })
    }
    void run().catch(() => stop().then(() => bridge.finishDanceWelcome?.(generation, false)))
    return () => { void stop().then(() => bridge.finishDanceWelcome?.(generation, false)) }
  }, [frame?.generation, frame?.status])
  return <main ref={root} className="dance-floor" data-dance-status={frame?.status ?? 'preparing'} style={{ position: 'fixed', inset: 0, background: '#000' }}>
    {model && <AvatarCanvas model={model} state={speaking ? 'Speaking' : 'Listening'}
      onRenderer={value => { renderer.current = value; value?.setDanceFrame?.(current.current?.status === 'playing' ? current.current : null) }}
      onEvent={event => { if (event.status === 'failed') bridge.reportRealtimeMetadata?.({ kind: 'avatar', status: 'failed', reason: 'dance_avatar_failed' }) }}
      onMetrics={() => {}} />}
  </main>
}
