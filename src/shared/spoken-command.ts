import { Converter } from 'opencc-js/t2cn'
import lexicon from './command-lexicon.json' with { type: 'json' }

let script: ReturnType<typeof Converter> | undefined
let characters: Map<string, string> | undefined
const phrases: Readonly<Record<string, string>> = lexicon.phrases
const foldSyllable = (value: string): string => value.replace(/ing$/u, 'in').replace(/eng$/u, 'en')

/** Deterministic whole-utterance keys, shared by authorization and extraction exclusion.
 * Only the approved tones, script, in/ing and en/eng folds apply. Unknown text
 * stays literal; it never disappears or receives an approximate match.
 */
export function spokenCommandKey(value: string): string {
  characters ??= new Map(Object.entries(lexicon.groups).flatMap(([reading, group]) =>
    [...group].map(character => [character, reading] as const)))
  const text = (script ??= Converter({ from: 't', to: 'cn' }))(value.normalize('NFKC'))
    .replace(/[\p{P}]/gu, mark => /[「」『』“”‘’"'«»]/u.test(mark) ? mark : '')
    .replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu, '$1').trim()
  const keys: string[] = []
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index), character = [...rest][0]!
    let reading = characters.get(character), length = character.length
    for (let size = Math.min(8, rest.length); size >= 2; size--) {
      const phrase = rest.slice(0, size)
      if (Object.hasOwn(phrases, phrase)) { reading = phrases[phrase]; length = size; break }
    }
    keys.push(...(reading ? reading.split(' ').map(syllable => `p:${foldSyllable(syllable)}`) : [`x:${character}`]))
    index += length
  }
  return keys.join('|')
}

/** The folded utterance is the phrase itself or continues it at a syllable boundary. */
export function opensWithSpokenPhrase(value: string, phrase: string): boolean {
  const prefix = spokenCommandKey(phrase)
  const key = spokenCommandKey(value)
  return prefix !== '' && (key === prefix || key.startsWith(`${prefix}|`))
}

const SEARCH_LEAD_LIMIT = 6
const NEGATIONS = new Set(['p:bu', 'p:bie', 'p:mei', 'p:wu', 'p:mo', 'p:ben'])
const QUOTES = /^x:[「」『』“”‘’"'«»]$/u
const SEARCH_FILLERS = new Set(['p:yi', 'p:xia', 'p:ba', 'p:a', 'p:ma', 'p:hao', 'p:ne', 'p:o', 'p:kan', 'p:la', 'p:ya', 'p:zhao'])

/**
 * The online search phrase, deliberately not strict (owner 2026-11-07). Its core (a repeated
 * last syllable optional: 在雲上找找 → 在雲上找; or without its first syllable when three remain:
 * 雲上找) may follow a short lead-in such as 幫我, 請, 麻煩你 or 可不可以幫我 (at most six syllables,
 * Latin words count once). A negation before it (不, 別, 沒, 勿, 莫, 甭; A-not-A questions such as
 * 可不可以 and 有沒有 are not negations), a quotation mark, or a later mention does not unlock.
 * Returns 'alone' when only fillers follow (the next turn is covered too), 'request' when a request
 * follows, or undefined.
 */
export function matchSearchPhrase(value: string, phrase: string): 'alone' | 'request' | undefined {
  const phraseKeys = spokenCommandKey(phrase).split('|').filter(Boolean)
  if (!phraseKeys.length) return undefined
  const repeated = phraseKeys.length > 1 && phraseKeys.at(-1) === phraseKeys.at(-2)
  const base = repeated ? phraseKeys.slice(0, -1) : phraseKeys
  const cores = base.length - 1 >= 3 ? [base, base.slice(1)] : [base]
  const keys = spokenCommandKey(value).split('|').filter(Boolean)
  // Latin words count once toward the lead-in limit.
  const tokens: string[][] = []
  for (const key of keys) {
    const latin = /^x:[\p{Script=Latin}\p{N}]$/u.test(key)
    if (latin && tokens.length && /^x:[\p{Script=Latin}\p{N}]$/u.test(tokens.at(-1)!.at(-1)!)) tokens.at(-1)!.push(key)
    else tokens.push([key])
  }
  for (let token = 0; token <= Math.min(SEARCH_LEAD_LIMIT, tokens.length - 1); token++) {
    const start = tokens.slice(0, token).reduce((sum, group) => sum + group.length, 0)
    const core = cores.find(candidate => candidate.every((key, index) => keys[start + index] === key))
    if (!core) continue
    const lead = keys.slice(0, start)
    if (lead.some(key => QUOTES.test(key))) return undefined
    if (lead.some((key, index) => NEGATIONS.has(key) && !(index > 0 && lead[index - 1] === lead[index + 1]))) return undefined
    const rest = keys.slice(start + core.length)
    return rest.every(key => SEARCH_FILLERS.has(key)) ? 'alone' : 'request'
  }
  return undefined
}

export function isSpellAttempt(value: string): boolean {
  return opensWithSpokenPhrase(value, '施放咒語')
}
