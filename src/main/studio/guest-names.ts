import { Converter } from 'opencc-js/t2cn'
import { getWakeLexicon } from '../wake/lexicon/data'

let fold: ReturnType<typeof Converter> | undefined
const HAN = /\p{Script=Han}/u

/** Script-folded, punctuation-free text key. */
export function guestTextKey(name: string): string {
  return (fold ??= Converter({ from: 't', to: 'cn' }))(name.normalize('NFKC')).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Toneless pinyin syllables with the accepted Taiwan Mandarin merges (in/ing,
 * en/eng; DECISIONS 2026-10-11). Latin words stay as lowercase words.
 */
export function guestSoundKey(name: string): string[] {
  const lexicon = getWakeLexicon().characters
  const out: string[] = []
  let latin = ''
  const flush = () => { if (latin) { out.push(latin); latin = '' } }
  for (const char of name.normalize('NFKC')) {
    if (HAN.test(char)) {
      flush()
      const reading = lexicon[char] ?? lexicon[(fold ??= Converter({ from: 't', to: 'cn' }))(char)]
      const syllable = (reading?.split(/\s+/)[0] ?? char).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ü/g, 'v')
      out.push(syllable.replace(/ing$/, 'in').replace(/eng$/, 'en'))
    } else if (/[\p{L}\p{N}]/u.test(char)) latin += char.toLowerCase()
    else flush()
  }
  flush()
  return out
}

/**
 * Ranked shortlist (≤3) of guest-list names for a spoken name. Never returns the
 * whole list; the model chooses among candidates and confirms with the visitor.
 */
export function matchGuestNames(spoken: string, guests: readonly string[], limit = 3): string[] {
  const text = guestTextKey(spoken)
  const sound = guestSoundKey(spoken).join(' ')
  if (!text) return []
  const scored: { name: string; score: number; index: number }[] = []
  guests.forEach((name, index) => {
    const nameSound = guestSoundKey(name)
    const full = nameSound.join(' ')
    let score = 0
    if (guestTextKey(name) === text) score = 4
    else if (full === sound) score = 3
    else if (nameSound.length > 1 && HAN.test(name) && nameSound.slice(1).join(' ') === sound) score = 2
    else if (!HAN.test(name) && nameSound.length > 1 && nameSound.includes(sound)) score = 1
    if (score > 0) scored.push({ name, score, index })
  })
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(entry => entry.name)
}
