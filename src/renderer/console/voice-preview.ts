import type { ConsoleBridge } from '../../shared/bridge'
import type { AvatarProfile } from '../../shared/avatar-profiles'
import { DEFAULT_VOICE_EFFECTS, type VoiceEffects } from '../../shared/voice-effects'
import { VOICE_PREVIEW_TEXT } from '../../shared/voice-preview'
import { createVoiceEffectGraph } from '../avatar/audio/voice-effects'
import { createProcessedRealtimeAudioOutput } from '../realtime/processed-audio-output'
import { createRealtimeSession, type RealtimeSessionHandle } from '../realtime/realtime-session-adapter'
import type { RealtimeAudioOutput } from '../realtime/realtime-audio-output'
import { getAudioDeviceRouter } from '../audio-devices'

export interface VoiceAudition { stop(): Promise<void>; update(settings: VoiceEffects): Promise<void> }
export async function startVoiceAudition(input: {
  bridge: ConsoleBridge; avatar: AvatarProfile; file?: File; loop: boolean; signal: AbortSignal
  onAnalyser(node: AnalyserNode | null): void; onStatus(reason: string): void; onEnded(): void
}): Promise<VoiceAudition> {
  const { bridge, avatar, signal } = input, effects = avatar.voiceEffects ?? DEFAULT_VOICE_EFFECTS
  let context: AudioContext | undefined, silentContext: AudioContext | undefined, source: AudioBufferSourceNode | undefined
  let graph: Awaited<ReturnType<typeof createVoiceEffectGraph>> | undefined, output: RealtimeAudioOutput | undefined
  let session: RealtimeSessionHandle | undefined, silentTrack: MediaStreamTrack | undefined, detach: (() => void) | undefined
  let token: string | undefined, stopped = false, timeout: ReturnType<typeof setTimeout> | undefined
  let matchTimer: ReturnType<typeof setInterval> | undefined
  let cleanup: Promise<void> = Promise.resolve(), ended = false
  const end = (): void => { if (ended) return; ended = true; void stop().then(input.onEnded) }
  const stop = async (): Promise<void> => {
    stopped = true; clearTimeout(timeout); clearInterval(matchTimer); signal.removeEventListener('abort', abort)
    const resources = { graph, output, source, session, context, silentContext, silentTrack, detach, token }
    graph = undefined; output = undefined; source = undefined; session = undefined; context = undefined
    silentContext = undefined; silentTrack = undefined; detach = undefined; token = undefined
    for (const action of [() => resources.graph?.setMuted(true), () => resources.output?.setMuted(true), () => resources.source?.stop(),
      () => resources.source?.disconnect(), () => resources.graph?.dispose(), () => resources.silentTrack?.stop()]) {
      try { action() } catch { input.onStatus('voice_preview_cleanup_failed') }
    }
    input.onAnalyser(null)
    cleanup = cleanup.then(async () => {
      const result = await Promise.allSettled([
        () => resources.session?.close('user_requested'), () => resources.output?.dispose(),
        () => resources.context?.close(), () => resources.silentContext?.close(), () => resources.detach?.(),
      ].map(action => Promise.resolve().then(action)))
      if (result.some(item => item.status === 'rejected')) input.onStatus('voice_preview_cleanup_failed')
      if (resources.token) await bridge.releaseVoicePreview?.(resources.token).catch(() => input.onStatus('Preview release failed.'))
    })
    await cleanup
  }
  const abort = (): void => { void stop() }
  const assertCurrent = (): void => { if (signal.aborted || stopped) throw new DOMException('Preview cancelled', 'AbortError') }
  signal.addEventListener('abort', abort, { once: true })
  try {
    assertCurrent()
    const lease = await bridge.acquireVoicePreview?.({ kind: input.file ? 'local' : 'generated', voice: avatar.voice as 'cedar',
      voiceSpeed: avatar.voiceSpeed ?? 1, voiceEffects: effects, speakingStyle: avatar.speakingStyle })
    if (!lease?.ok) throw new Error(lease?.reason ?? 'voice_preview_unavailable')
    token = lease.token
    if (stopped || signal.aborted) { await bridge.releaseVoicePreview?.(token); throw new DOMException('Preview cancelled', 'AbortError') }
    const router = getAudioDeviceRouter()
    if (input.file) {
      if (input.file.size > 20 * 1024 * 1024) throw new Error('Choose an audio fixture smaller than 20 MB.')
      context = new AudioContext(); await context.resume()
      const data = await context.decodeAudioData(await input.file.arrayBuffer()); assertCurrent()
      if (data.duration > 30) throw new Error('Choose a speech fixture up to 30 seconds.')
      graph = await createVoiceEffectGraph(context, effects, input.onStatus); assertCurrent()
      detach = await router.attach(context as AudioContext & { setSinkId(id: string): Promise<void> }, () => stopped); assertCurrent()
      source = context.createBufferSource(); source.buffer = data; source.loop = input.loop
      source.connect(graph.input)
      graph.output.connect(context.destination)
      input.onAnalyser(graph.speechAnalyser)
      // Match processed and original against the same decoded fixture window.
      // Only attenuate; ignore silence. This keeps A/B loudness from favoring DSP.
      const startedAt = context.currentTime, meter = new Float32Array(graph.completionAnalyser.fftSize)
      let matchedVolume = 1
      matchTimer = setInterval(() => {
        if (stopped || !graph || !context) return
        graph.completionAnalyser.getFloatTimeDomainData(meter)
        const actual = Math.sqrt(meter.reduce((sum, x) => sum + x * x, 0) / meter.length)
        const offset = Math.max(0, Math.floor((context.currentTime - startedAt - graph.latencySeconds) * data.sampleRate) - meter.length)
        let energy = 0
        for (let i = 0; i < meter.length; i++) {
          let sample = 0
          for (let c = 0; c < data.numberOfChannels; c++) sample += data.getChannelData(c)[(offset + i) % data.length]! / data.numberOfChannels
          energy += sample * sample
        }
        const reference = Math.sqrt(energy / meter.length)
        if (actual > 0.005 && reference > 0.005) {
          matchedVolume += (Math.min(1, matchedVolume * reference * 0.5 / actual) - matchedVolume) * 0.4
          graph.setVolume(matchedVolume)
        }
      }, 100)
      source.onended = () => { if (!stopped) timeout = setTimeout(end, graph!.tailSeconds * 1000 + 60) }
      source.start(); input.onStatus('Local fixture playing · RMS level matching · provider speed/style require Generate.')
    } else {
      if (!lease.snapshot || !lease.clientSecret) throw new Error('voice_preview_credentials_unavailable')
      output = await createProcessedRealtimeAudioOutput({ voiceEffects: effects, onDegraded: input.onStatus }); assertCurrent()
      detach = await router.attach(output.sink!, () => stopped); assertCurrent()
      silentContext = new AudioContext(); const silent = silentContext.createMediaStreamDestination()
      silentTrack = silent.stream.getAudioTracks()[0]; await silentContext.resume(); assertCurrent()
      session = createRealtimeSession({ preview: true, snapshot: lease.snapshot, clientSecret: lease.clientSecret,
        mediaStream: silent.stream, audioElement: output.audioElement, sessionId: token, sessionGeneration: 1,
        avatar: { name: avatar.name, personality: 'Read the supplied synthetic audition text.', speakingStyle: avatar.speakingStyle,
          wakeGreeting: '', sleepFarewell: '' },
        eventSink: event => { if (event.status === 'failed' || event.status === 'degraded') input.onStatus(event.reason) },
        onFailure: () => { input.onStatus('Voice preview connection failed.'); end() },
        onAudioActivity: activity => output?.handleActivity?.(activity, state => {
          if (state === 'output_started') input.onAnalyser(output!.analyser)
          if (state === 'output_stopped') end()
        }),
      })
      timeout = setTimeout(() => { input.onStatus('Voice preview reached its 20-second limit.'); end() }, 20000)
      await session.connect(); assertCurrent(); session.speakVerbatim(VOICE_PREVIEW_TEXT)
      input.onStatus('Generating one audition · no microphone · audio stays in memory.')
    }
    const routeReason = router.snapshot().reason
    if (routeReason.startsWith('audio_output_')) input.onStatus(`Preview speakers: ${routeReason}`)
    return { stop, update: settings => graph?.update(settings) ?? output?.updateEffects?.(settings) ?? Promise.resolve() }
  } catch (error) { await stop(); throw error }
}
