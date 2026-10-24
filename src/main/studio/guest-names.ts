import { Converter } from 'opencc-js/t2cn'
import { getWakeLexicon } from '../wake/lexicon/data'
import type { GuestNameAliases } from '../../shared/portrait-studio'

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
      const syllable = (reading?.split(/\s+/)[0] ?? char).normalize('NFD').replace(/u\u0308/g, 'v').replace(/\p{M}/gu, '').toLowerCase()
      out.push(syllable.replace(/ing$/, 'in').replace(/eng$/, 'en'))
    } else if (/[\p{L}\p{N}]/u.test(char)) latin += char.toLowerCase()
    else flush()
  }
  flush()
  return out
}

// Names only: these are suggestions, never the spoken-command authorization key.
const mandarinNear = (syllable: string) => syllable.replace(/^(zh|ch|sh)/, initial => initial[0]!).replace(/ing$/, 'in').replace(/eng$/, 'en')
function englishPhones(words: readonly string[], near = false): string | undefined {
  const dictionary = getWakeLexicon().english
  const phones = words.map(word => dictionary[guestTextKey(word).normalize('NFD').replace(/\p{M}/gu, '')])
  if (phones.some(value => !value)) return undefined
  return phones.map(value => value!.split(' ').map(phone => near && /^(AH|IH)0$/.test(phone) ? 'V0' : phone.replace(/[012]$/, '')).join(' ')).join(' | ')
}

function soundScore(spoken: readonly string[], written: readonly string[], chinese: boolean): number {
  if (spoken.join(' ') === written.join(' ')) return 80
  if (chinese) return spoken.map(mandarinNear).join(' ') === written.map(mandarinNear).join(' ') ? 65 : 0
  const phones = englishPhones(spoken), target = englishPhones(written)
  if (phones && target && phones === target) return 80
  const near = englishPhones(spoken, true)
  return near && near === englishPhones(written, true) ? 65 : 0
}

/**
 * Ranked shortlist (≤3) of guest-list names for a spoken name. Never returns the
 * whole list. Exact spelling wins; phonetic matches are suggestions requiring
 * read-back. Aliases are operator-owned, not inferred bilingual identities.
 */
export function matchGuestNames(spoken: string, guests: readonly string[], limit = 3,
  aliases: readonly GuestNameAliases[] = [], excluded: ReadonlySet<string> = new Set()): string[] {
  const text = guestTextKey(spoken)
  const sound = guestSoundKey(spoken)
  if (!text) return []
  const scored: { name: string; score: number; index: number }[] = []
  const seen = new Set<string>()
  const aliasMap = new Map<string, string[]>()
  for (const entry of aliases) {
    const key = guestTextKey(entry.name)
    aliasMap.set(key, [...(aliasMap.get(key) ?? []), ...entry.aliases])
  }
  guests.forEach((name, index) => {
    const key = guestTextKey(name)
    if (!key || seen.has(key) || excluded.has(key)) return
    seen.add(key)
    let score = 0
    for (const variant of [name, ...(aliasMap.get(key) ?? [])]) {
      const nameSound = guestSoundKey(variant), chinese = HAN.test(variant)
      if (guestTextKey(variant) === text) score = Math.max(score, variant === name ? 100 : 95)
      score = Math.max(score, soundScore(sound, nameSound, chinese))
      // A complete given name/word may be ambiguous; never use arbitrary substrings.
      if (nameSound.length > 1) {
        const parts = chinese ? [nameSound.slice(1)] : nameSound.map(word => [word])
        for (const part of parts) { const partial = soundScore(sound, part, chinese); if (partial) score = Math.max(score, partial - 40) }
      }
    }
    if (score > 0) scored.push({ name, score, index })
  })
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, Math.max(0, Math.min(3, limit))).map(entry => entry.name)
}
