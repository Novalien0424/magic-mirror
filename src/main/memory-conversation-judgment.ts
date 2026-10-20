import { sameSpokenQuestion, buildMemoryQuestion } from '../shared/realtime-prompts'
export interface SyntheticTurn { visit: number; stage: string; role: string; text: string }
/** Synthetic QA only: examine the actual generated turns, never production diagnostics. */
export function confirmationQuestionMatches(records: SyntheticTurn[], visit: number, name: string): boolean {
  const last = records.filter(r => r.visit === visit && r.role === 'avatar').at(-1)
  return !!last && sameSpokenQuestion(buildMemoryQuestion(name), last.text)
}
export function judgeMemoryConversation(records: SyntheticTurn[]) {
  const answer = (stage: string) => records.filter(r => r.visit === 2 && r.stage === stage && r.role === 'avatar').map(r => r.text).join(' ')
  const material = answer('recall_material'), commitment = answer('recall_commitment')
  const replies = records.filter(r => r.role === 'avatar' && r.stage !== 'greeting')
  const grouped = new Map<string, string>()
  for (const r of replies) { const key = `${r.visit}:${r.stage}`; grouped.set(key, `${grouped.get(key) ?? ''} ${r.text}`) }
  const counts = [...grouped.values()].map(t => t.trim().split(/\s+/u).length)
  const confirmations = replies.filter(r => /^(first|return)_confirm$/u.test(r.stage))
  // This fixture contains a correction. Mentioning the old day is valid only
  // when the answer explicitly replaces it with the current one.
  const currentDeadline = !/friday/i.test(commitment)
    || /(?:originally|initially|previously)[^.!?]{0,80}friday[^.!?]{0,80}(?:changed|moved|now)[^.!?]{0,40}saturday/i.test(commitment)
    || /(?:changed|moved) from friday[^.!?]{0,40}to saturday/i.test(commitment)
  return {
    material: /cork/i.test(material) && /glare/i.test(material) && /carry|light|weight/i.test(material),
    commitment: /two|2/i.test(commitment) && /sample/i.test(commitment) && /saturday/i.test(commitment) && /afternoon/i.test(commitment) && currentDeadline,
    policy: confirmations.length === 2 && confirmations.every(r => /summar|remember/i.test(r.text) && !/\?|only if|only when|cannot|can't|permission/i.test(r.text)),
    grounded: !replies.some(r => /already tested|you(?:'ve| have) (?:delivered|finished|tested)|you delivered|samples (?:were|are) delivered/i.test(r.text)),
    clean: !replies.some(r => /trouble saving|(?:cannot|can['’]t) (?:store|save)|let me (?:quickly )?(?:think|prepare|check|look)/i.test(r.text)),
    compact: counts.length === 8 && counts.every(n => n <= 40) && counts.reduce((a, b) => a + b, 0) / counts.length <= 30,
    meanWords: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
    maxWords: Math.max(0, ...counts),
  }
}
