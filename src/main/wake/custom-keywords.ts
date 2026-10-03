import { getWakeLexicon } from './lexicon/data'

/** Public operator text only. The neural model and its tuning stay unchanged. */
export function compileWakePhrase(phrase: string, tokensText: string): string {
  const text = phrase.normalize('NFKC').trim()
  if (!text || text.length > 96) throw new Error('wake_phrase_unsupported')
  const lexicon = getWakeLexicon()
  const phonemes: string[] = []
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index)
    const separator = /^[\s\p{P}]+/u.exec(rest)
    if (separator) { index += separator[0].length; continue }
    const english = /^[A-Za-z]+(?:'[A-Za-z]+)*/.exec(rest)
    if (english) {
      const phones = lexicon.english[english[0].toLowerCase()]
      if (!phones) throw new Error('wake_phrase_unsupported')
      phonemes.push(...phones.split(' ')); index += english[0].length; continue
    }
    const character = Array.from(rest)[0]!
    let pronunciation = lexicon.characters[character]
    let length = character.length
    for (let size = Math.min(8, rest.length); size >= 2; size--) {
      const match = lexicon.phrases[rest.slice(0, size)]
      if (match) { pronunciation = match; length = size; break }
    }
    if (!pronunciation) throw new Error('wake_phrase_unsupported')
    for (const syllable of pronunciation.split(' ')) {
      const initial = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/.exec(syllable)?.[0] ?? ''
      if (initial) phonemes.push(initial)
      if (syllable.length > initial.length) phonemes.push(syllable.slice(initial.length))
    }
    index += length
  }
  const tokens = new Set(tokensText.split(/\r?\n/).map(line => line.trim().split(/\s+/)[0]))
  if (!phonemes.length) throw new Error('wake_phrase_unsupported')
  if (phonemes.some(token => !tokens.has(token))) throw new Error('wake_phrase_token_unavailable')
  return `${phonemes.join(' ')} @avatar_wake\n`
}
