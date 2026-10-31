import { sameSpokenQuestion, buildMemoryQuestion } from '../shared/realtime-prompts'
export interface SyntheticTurn { visit: number; stage: string; role: string; text: string }
/** Synthetic QA only: examine the actual generated turns, never production diagnostics. */
export function confirmationQuestionMatches(records: SyntheticTurn[], visit: number, name: string): boolean {
  const last = records.filter(r => r.visit === visit && r.role === 'avatar').at(-1)
  // The application asks in the session's selected reply language (Chinese or English).
  return !!last && (['zh-TW', 'en'] as const).some(language => sameSpokenQuestion(buildMemoryQuestion(name, language), last.text))
}
export function judgeMemoryConversation(records: SyntheticTurn[]) {
  const answer = (stage: string) => records.filter(r => r.visit === 2 && r.stage === stage && r.role === 'avatar').map(r => r.text).join(' ')
  const material = answer('recall_material'), commitment = answer('recall_commitment')
  const replies = records.filter(r => r.role === 'avatar' && r.stage !== 'greeting')
  const grouped = new Map<string, string>()
  for (const r of replies) { const key = `${r.visit}:${r.stage}`; grouped.set(key, `${grouped.get(key) ?? ''} ${r.text}`) }
  // Spoken length: Latin words plus Han characters at two per word, so Chinese replies are measured too.
  const counts = [...grouped.values()].map(t => (t.match(/[A-Za-z0-9'’]+/g)?.length ?? 0) + Math.ceil((t.match(/\p{Script=Han}/gu)?.length ?? 0) / 2))
  const confirmations = replies.filter(r => /^(first|return)_confirm$/u.test(r.stage))
  // This fixture contains a correction. Mentioning the old day is valid only
  // when the answer explicitly replaces it with the current one.
  // Replies default to Traditional Chinese (explicit-request language rule), so each
  // fact is recognised in either language; the checks themselves are unchanged.
  const friday = '(?:friday|星期五|週五|周五|禮拜五)', saturday = '(?:saturday|星期六|週六|周六|禮拜六)'
  const currentDeadline = !new RegExp(friday, 'i').test(commitment)
    || new RegExp(`(?:originally|initially|previously|原本|原先|本來|之前)[^.!?。！？]{0,80}${friday}[^.!?。！？]{0,80}(?:changed|moved|now|改成|改到|改為|延到|現在)[^.!?。！？]{0,40}${saturday}`, 'i').test(commitment)
    || new RegExp(`(?:changed|moved) from ${friday}[^.!?]{0,40}to ${saturday}|從${friday}[^。！？]{0,40}(?:改成|改到|改為|延到)${saturday}`, 'i').test(commitment)
  return {
    material: /cork|軟木/i.test(material) && /glare|反光|眩光/i.test(material) && /carry|light|weight|搬|攜|輕|好拿/i.test(material),
    commitment: /two|2|兩|二/i.test(commitment) && /sample|樣品|樣本|色樣/i.test(commitment) && new RegExp(saturday, 'i').test(commitment)
      && /afternoon|下午/i.test(commitment) && currentDeadline,
    policy: confirmations.length === 2 && confirmations.every(r => /summar|remember|記下|記住/i.test(r.text) && !/[?？]|only if|only when|cannot|can't|permission|只有在|無法|不能|允許/i.test(r.text)),
    grounded: !replies.some(r => /already tested|you(?:'ve| have) (?:delivered|finished|tested)|you delivered|samples (?:were|are) delivered|已經(?:測試|交付|交了|送出)|樣品已(?:經)?(?:交|送)/i.test(r.text)),
    clean: !replies.some(r => /trouble saving|(?:cannot|can['’]t) (?:store|save)|let me (?:quickly )?(?:think|prepare|check|look)|存不了|無法(?:儲存|保存|記下)|讓我(?:先)?(?:想想|思考)/i.test(r.text)),
    compact: counts.length === 8 && counts.every(n => n <= 40) && counts.reduce((a, b) => a + b, 0) / counts.length <= 30,
    meanWords: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
    maxWords: Math.max(0, ...counts),
  }
}
