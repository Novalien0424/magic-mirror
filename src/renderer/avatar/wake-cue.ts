import { getAudioDeviceRouter } from '../audio-devices'

/** A brief local acknowledgement while the authored reveal and cloud connect
 * continue. No microphone or provider; the operator's effects volume applies. */
export function playWakeCue(onFailure: (reason: string) => void): () => void {
  let disposed = false, context: AudioContext | undefined, detach: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    if (disposed) return
    disposed = true; clearTimeout(timer); detach?.()
    void context?.close().catch(() => onFailure('wake_cue_close_failed'))
  }
  try {
    const router = getAudioDeviceRouter()
    const audio = context = new AudioContext()
    void router.attach(audio as AudioContext & { setSinkId(id: string): Promise<void> }, () => disposed).then(async release => {
      detach = release
      if (disposed) { release(); return }
      const volume = router.snapshot().preferences.volumes?.effects ?? 1
      if (volume === 0) { stop(); return }
      await audio.resume()
      if (disposed) return
      const tone = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime
      tone.type = 'sine'; tone.frequency.setValueAtTime(440, start); tone.frequency.exponentialRampToValueAtTime(660, start + .12)
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.06 * volume, start + .015)
      gain.gain.exponentialRampToValueAtTime(.0001, start + .16)
      tone.connect(gain).connect(audio.destination); tone.start(start); tone.stop(start + .17)
      timer = setTimeout(stop, 220)
    }).catch(() => { if (!disposed) { onFailure('wake_cue_unavailable'); stop() } })
  } catch { onFailure('wake_cue_unavailable'); stop() }
  return stop
}
