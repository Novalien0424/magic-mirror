import source from '../../resources/config/prompts/realtime.v1.json'
import type { MemoryReply, MemoryLanguage } from './memory'

export const REALTIME_PROMPT_SOURCE = 'resources/config/prompts/realtime.v1.json'
// Static JSON imports give builders a checked shape without dependencies in the
// sandboxed preload. Validate and freeze every leaf, including new catalog fields.
function freezeCatalog<T>(value: T): Readonly<T> {
  if (typeof value === 'string') {
    if (!value.trim()) throw new Error('invalid_prompt_catalog')
  } else if (value && typeof value === 'object' && Object.keys(value).length > 0) {
    for (const child of Object.values(value)) freezeCatalog(child)
    Object.freeze(value)
  } else throw new Error('invalid_prompt_catalog')
  return value
}
const catalog = freezeCatalog(source)

// Fail at load for an invalid catalog; never silently substitute hidden prose.
const variables = {
  session: ['name', 'personality', 'speakingStyle', 'toolInstructions'],
  performance: ['speakingStyle', 'text'], audition: ['speakingStyle'],
  memoryQuestion: ['name'], memoryState: ['mode', 'reference'],
} as const
type Template = keyof typeof variables
for (const key of Object.keys(variables) as Template[]) {
  const actual = [...catalog[key].matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...variables[key]].sort())) throw new Error('invalid_prompt_variables')
}
export const REALTIME_PROMPTS = Object.freeze(catalog)

/** One pass only: supplied text is data, including text containing template markers. */
export function renderPrompt<K extends Template>(key: K, values: Record<typeof variables[K][number], string>): string {
  return REALTIME_PROMPTS[key].replace(/\{\{(\w+)\}\}/g, (_match, name: keyof typeof values) => values[name])
}

export function buildAuditionPrompt(speakingStyle: string): string {
  return renderPrompt('audition', { speakingStyle: speakingStyle || REALTIME_PROMPTS.defaults.speakingStyle })
}

/** Response-scoped instructions cannot become a lingering imperative user turn. */
export function buildSpeechResponse(text: string, speakingStyle: string) {
  return { tool_choice: 'none' as const, input: [], instructions: renderPrompt('performance', {
    speakingStyle: speakingStyle || REALTIME_PROMPTS.defaults.speakingStyle, text,
  }) }
}

export function buildMemoryQuestion(name: string, language: MemoryLanguage = 'en'): string {
  return language === 'zh-TW' ? REALTIME_PROMPTS.memoryChinese.question.replace('{{name}}', () => name) : renderPrompt('memoryQuestion', { name })
}
/** Punctuation/spacing do not change the question; added or changed words do. RAM only. */
export function sameSpokenQuestion(expected: string, actual: string): boolean {
  const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '')
  return !!actual.trim() && normalize(expected) === normalize(actual)
}
export function buildMemoryState(reply: MemoryReply): string {
  const mode = reply.temporary ? 'temporary' : reply.mode ?? 'off'
  const reference = (reply.entries ?? []).map(({ topic, text, kind, state, eventAt }) => ({ topic, text, kind, state, eventAt }))
  return renderPrompt('memoryState', { mode: REALTIME_PROMPTS.memoryModes[mode], reference: JSON.stringify(reference) })
}
export function buildMemoryAcknowledgment(reply: MemoryReply, speakingStyle: string) {
  const mode = reply.temporary ? 'temporary' : reply.mode ?? 'off'
  return buildSpeechResponse((reply.language === 'zh-TW' ? REALTIME_PROMPTS.memoryChinese.acknowledgments : REALTIME_PROMPTS.memoryAcknowledgments)[mode], speakingStyle)
}
