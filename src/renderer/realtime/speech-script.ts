import { parseSpeechScript } from '../../shared/speech-script'

/** Each play callback completes only after actual output and its processed tail. */
export async function playSpeechScript(text: string, signal: AbortSignal,
  play: (text: string, last: boolean) => Promise<boolean>, pause?: (durationMs: number) => void): Promise<boolean> {
  const segments = parseSpeechScript(text)
  const lastSpeech = segments.findLastIndex(segment => !!segment.text)
  for (const [index, segment] of segments.entries()) {
    if (signal.aborted) return false
    if (segment.text && !await play(segment.text, index === lastSpeech)) return false
    if (signal.aborted) return false
    if (segment.pauseMs) {
      pause?.(segment.pauseMs)
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
        const timer = setTimeout(done, segment.pauseMs)
        signal.addEventListener('abort', done, { once: true })
        if (signal.aborted) done()
      })
    }
  }
  return !signal.aborted
}
