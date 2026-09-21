import type { PresentationPhase } from './presentation-controller'

/** One ambience element keeps its position across wake/sleep and speech pauses. */
export function applyPresentationAmbience(input: {
  audio: Pick<HTMLAudioElement, 'volume' | 'play' | 'pause'>
  phase: PresentationPhase
  ambienceGain: number
  activeAmbienceGain: number
  bgmVolume: number
  speechActive: boolean
  routeReady: Promise<unknown>
  onFailure(reason: string): void
}): () => void {
  const { audio, phase, speechActive } = input
  let cancelled = false
  let frame = 0
  const authoredGain = phase === 'asleep' || phase === 'exiting' ? input.ambienceGain : input.activeAmbienceGain
  const target = Math.max(0, Math.min(1, authoredGain * input.bgmVolume))
  const start = audio.volume
  const started = performance.now()
  // Speech has priority even during greeting/farewell transitions. Keep the
  // loop running silently so restoring it does not restart the track.
  if (phase === 'inactive') { audio.volume = 0; audio.pause() }
  else if (speechActive) audio.volume = 0
  else {
    if (target > 0) void input.routeReady.then(() => {
      if (!cancelled) return audio.play()
    }).catch(() => { if (!cancelled) input.onFailure('presentation_ambience_play_failed') })
    const tick = () => {
      if (cancelled) return
      const fraction = Math.min(1, (performance.now() - started) / 500)
      audio.volume = start + (target - start) * fraction
      if (fraction < 1) frame = requestAnimationFrame(tick)
      else if (target === 0) audio.pause()
    }
    tick()
  }
  return () => { cancelled = true; cancelAnimationFrame(frame) }
}
