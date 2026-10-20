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

export function isSpellAttempt(value: string): boolean {
  return opensWithSpokenPhrase(value, '施放咒語')
}
