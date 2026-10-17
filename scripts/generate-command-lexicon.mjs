// Derive browser-safe pronunciation data from the pinned, licensed wake lexicon.
// Run with Node's TypeScript stripping; no upstream fetch or model change.
import { writeFileSync } from 'node:fs'
import { getWakeLexicon } from '../src/main/wake/lexicon/data.ts'

const toneless = value => value.replaceAll('ü', 'v').normalize('NFD')
  .replace(/u\u0308/g, 'v').replace(/\p{M}/gu, '')
const { characters, phrases } = getWakeLexicon()
const groups = {}
for (const [character, reading] of Object.entries(characters)) {
  const key = toneless(reading)
  groups[key] = (groups[key] ?? '') + character
}
// Keep only contextual readings that differ from character fallback after tone removal.
const contextual = Object.fromEntries(Object.entries(phrases).flatMap(([phrase, reading]) => {
  const key = toneless(reading)
  return [...phrase].map(c => toneless(characters[c] ?? '')).join(' ') === key ? [] : [[phrase, key]]
}))
writeFileSync(new URL('../src/shared/command-lexicon.json', import.meta.url), JSON.stringify({ groups, phrases: contextual }) + '\n')
