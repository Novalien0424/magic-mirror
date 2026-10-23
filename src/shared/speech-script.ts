/** Operator-authored timing notation; never applied to generated dialogue. */
export interface SpeechSegment { text: string; pauseMs: number }
export function parseSpeechScript(text: string): SpeechSegment[] {
  const segments: SpeechSegment[] = []
  const marker = /\[pause=(\d+(?:\.\d+)?)s\]/g
  let start = 0
  for (const match of text.matchAll(marker)) {
    const pauseMs = Number(match[1]) * 1000
    if (pauseMs < 100 || pauseMs > 10000) throw new Error('speech_pause_invalid')
    segments.push({ text: text.slice(start, match.index).trim(), pauseMs })
    start = match.index! + match[0].length
  }
  const tail = text.slice(start).trim()
  if (tail) segments.push({ text: tail, pauseMs: 0 })
  if (segments.some(segment => /\[pause\b/i.test(segment.text)) || !segments.some(segment => segment.text)) throw new Error('speech_pause_invalid')
  return segments
}
export function speechScriptIssue(text: string): string {
  try { parseSpeechScript(text); return '' } catch { return 'Use [pause=1s] for a pause of 0.1–10 seconds, with spoken text.' }
}
/** Plain text for visual labels and model context; timing stays in the speech owner. */
export function speechScriptText(text: string): string { return parseSpeechScript(text).map(segment => segment.text).filter(Boolean).join(' ') }
/** Visitor data inserted into an authored script must not become a timing instruction. */
export function literalSpeechText(text: string): string { return text.replaceAll('[', '［').replaceAll(']', '］') }
