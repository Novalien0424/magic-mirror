import lexicon from './command-lexicon.json' with { type: 'json' }
import { mediaClueKey } from './media-clue'

let characters: Map<string, string> | undefined
const phrases: Readonly<Record<string, string>> = lexicon.phrases
// Media discovery tolerates common Mandarin sound confusions. These are not
// command keys and must never authorize a spell, stop, wake or other effect.
const sound = (reading: string) => reading.replace(/^(zh|ch|sh)/u, initial => initial[0]!)
  .replace(/ing$/u, 'in').replace(/eng$/u, 'en')

/** Separate pronunciation index using the pinned public dictionary. Unknown
 * characters remain literal; boundaries prevent partial-syllable matches.
 * Spaces remain available for multi-part title/version clues.
 */
export function mediaPhoneticKey(value: string): string {
  characters ??= new Map(Object.entries(lexicon.groups).flatMap(([reading, group]) =>
    [...group].map(character => [character, reading] as const)))
  const text = mediaClueKey(value), keys: string[] = []
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index), character = [...rest][0]!
    if (character === ' ') { keys.push(' '); index++; continue }
    let reading = characters.get(character), length = character.length
    for (let size = Math.min(8, rest.length); size >= 2; size--) {
      const phrase = rest.slice(0, size)
      if (Object.hasOwn(phrases, phrase)) { reading = phrases[phrase]; length = size; break }
    }
    keys.push(...(reading ? reading.split(' ').map(syllable => `|p:${sound(syllable)}|`) : [`|x:${character}|`]))
    index += length
  }
  return keys.join('')
}
