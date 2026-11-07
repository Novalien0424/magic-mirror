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
/** Natural ways to say "look it up online" (owner 2026-11-07: 幫我在雲上找, 幫我再網路上找 and the like). */
const ONLINE_PLACES = ['雲上', '雲端', '雲端上', '網路上', '網路', '網上', '線上', '上網', 'youtube上', 'youtube']
/** Places that can also follow the verb (搜尋網路, 播放YouTube上的…) without sounding like everyday words. */
const VERB_FIRST_PLACES = ['網路', '網路上', '雲端', 'youtube', 'youtube上']
const ONLINE_VERBS = ['找', '找找', '搜', '搜尋', '搜索', '查', '查查', '查詢', '尋找', '播放']
let onlineCores: string[][] | undefined
// Spaces from the recognizer (「在 YouTube 上找」) are not words.
const keysOf = (text: string): string[] => spokenCommandKey(text.toLowerCase()).split('|').filter(key => key && key !== 'x: ')

/**
 * Online search, deliberately relaxed (owner 2026-11-07). It unlocks when, within the first six
 * syllables (Latin words count once; a lead-in such as 幫我, 幫我再, 請 or 可不可以幫我), the
 * transcript says an online place with a search verb in either order (雲上找, 網路上找, 上網查,
 * 搜尋網路, YouTube上找…) or the avatar's configured phrase (its repeated last character
 * optional, or without its first syllable when three remain). A negation before it (不, 別, 沒,
 * 勿, 莫, 甭; A-not-A questions such as 可不可以 and 有沒有 excepted), a quotation mark, or a later
 * mention does not unlock. Returns 'alone' when only fillers follow (the next turn is covered
 * too), 'request' when a request follows, or undefined.
 */
export function matchSearchPhrase(value: string, phrase: string): 'alone' | 'request' | undefined {
  onlineCores ??= [...ONLINE_PLACES.flatMap(place => ONLINE_VERBS.map(verb => keysOf(place + verb))),
    ...VERB_FIRST_PLACES.flatMap(place => ONLINE_VERBS.map(verb => keysOf(verb + place)))]
  const phraseKeys = keysOf(phrase)
  const repeated = phraseKeys.length > 1 && phraseKeys.at(-1) === phraseKeys.at(-2)
  const base = repeated ? phraseKeys.slice(0, -1) : phraseKeys
  const configured = !base.length ? [] : base.length - 1 >= 3 ? [base, base.slice(1)] : [base]
  const cores = [...configured, ...onlineCores].filter(core => core.length > 1).sort((x, y) => y.length - x.length)
  const keys = keysOf(value)
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
