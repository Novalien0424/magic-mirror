import type { CreateRealtimeAudioOutputInput, RealtimeAudioOutput } from './realtime-audio-output'
import { createVoiceEffectGraph } from '../avatar/audio/voice-effects'
import { DEFAULT_VOICE_EFFECTS } from '../../shared/voice-effects'

/** The muted SDK receiver keeps WebRTC alive; only the context reaches speakers. */
export async function createProcessedRealtimeAudioOutput(input: CreateRealtimeAudioOutputInput = {}): Promise<RealtimeAudioOutput> {
  const element = input.dependencies?.createAudioElement?.() ?? document.createElement('audio')
  const context = input.dependencies?.createAudioContext?.() ?? new AudioContext()
  element.autoplay = true; element.muted = true; element.volume = 0
  let graph: Awaited<ReturnType<typeof createVoiceEffectGraph>>
  try { graph = await createVoiceEffectGraph(context, input.voiceEffects ?? DEFAULT_VOICE_EFFECTS, input.onDegraded) }
  catch (error) { await context.close(); throw error }
  graph.output.connect(context.destination)
  let source: MediaStreamAudioSourceNode | null = null, disposed = false, generation = 0, disposal: Promise<void> | undefined
  const attachAnalyserTap = (): void => {
    if (disposed || source || !element.srcObject) return
    source = context.createMediaStreamSource(element.srcObject as MediaStream)
    source.connect(graph.input)
    void context.resume().catch(() => input.onDegraded?.('voice_audio_context_resume_failed'))
  }
  element.addEventListener('loadedmetadata', attachAnalyserTap)
  element.addEventListener('playing', attachAnalyserTap)
  const waitForTail = (signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const started = performance.now(), token = generation, minimumMs = graph.tailSeconds * 1000
    let timer: ReturnType<typeof setTimeout>, quiet = 0
    const samples = new Float32Array(graph.completionAnalyser.fftSize)
    const abort = (): void => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Audio wait cancelled', 'AbortError')) }
    const finish = (): void => { signal?.removeEventListener('abort', abort); resolve() }
    const poll = (): void => {
      if (disposed || token !== generation) { finish(); return }
      const elapsed = performance.now() - started
      if (elapsed < minimumMs) { timer = setTimeout(poll, 20); return }
      graph.completionAnalyser.getFloatTimeDomainData(samples)
      quiet = samples.every(x => Number.isFinite(x) && Math.abs(x) < 0.001) ? quiet + 1 : 0
      if (quiet >= 3) { finish(); return }
      if (elapsed > minimumMs + 1000) { input.onDegraded?.('voice_output_tail_bound_reached'); finish(); return }
      timer = setTimeout(poll, 20)
    }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true }); poll()
  })
  return {
    audioElement: element, analyser: graph.speechAnalyser, completionAnalyser: graph.completionAnalyser,
    sink: context as AudioContext & { setSinkId(id: string): Promise<void> },
    attachAnalyserTap, waitForTail,
    updateEffects: graph.update,
    setVolume: value => graph.setVolume(value), setMuted: value => graph.setMuted(value),
    handleActivity(activity, notify) {
      if (disposed) return
      if (activity === 'interrupted' || activity === 'speech_started') { ++generation; graph.interrupt(); notify(activity); return }
      if (activity === 'output_started') {
        const token = ++generation; attachAnalyserTap()
        void graph.begin().then(() => { if (!disposed && token === generation) notify(activity) }).catch(() => input.onDegraded?.('voice_output_resume_failed'))
      } else if (activity === 'output_stopped') {
        const token = generation
        void waitForTail().then(() => { if (!disposed && token === generation) notify(activity) }).catch(() => input.onDegraded?.('voice_output_tail_wait_failed'))
      } else notify(activity)
    },
    dispose() {
      if (disposal) return disposal
      disposed = true; ++generation
      let failed = false
      for (const release of [() => graph.dispose(), () => source?.disconnect(),
        () => element.removeEventListener('loadedmetadata', attachAnalyserTap), () => element.removeEventListener('playing', attachAnalyserTap),
        () => element.pause(), () => { element.srcObject = null }]) {
        try { release() } catch { failed = true }
      }
      disposal = context.close().catch(() => { failed = true }).then(() => {
        if (failed) { input.onDegraded?.('voice_audio_cleanup_failed'); throw new Error('voice_audio_cleanup_failed') }
      })
      return disposal
    },
  }
}
