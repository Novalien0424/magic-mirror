import source from '../../resources/config/portrait-studio.v1.json'
import type { StudioLanguage } from './portrait-studio'

export const PORTRAIT_STUDIO_SOURCE = 'resources/config/portrait-studio.v1.json'

// Versioned studio text and the image model ID (invariant 11). Fail at load on any
// empty leaf or template-variable drift; never substitute hidden prose.
function freeze<T>(value: T): Readonly<T> {
  if (typeof value === 'string') { if (!value.trim()) throw new Error('invalid_portrait_studio_config') }
  else if (typeof value === 'number') { if (!Number.isFinite(value) || value <= 0) throw new Error('invalid_portrait_studio_config') }
  else if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value) }
  else throw new Error('invalid_portrait_studio_config')
  return value
}
const config = freeze(source)
const variables: [string, string, string[]][] = [
  ['imagePrompt', 'frame', ['style']], ['imagePrompt', 'painted', ['name']], ['imagePrompt', 'revision', ['change']],
  ['agent', 'reveal', ['followUp', 'language']], ['agent', 'revealBlind', ['followUp', 'language']], ['guidance', 'askName', ['question']], ['guidance', 'confirmName', ['name']],
  ['guidance', 'chooseGuest', ['candidates']], ['guidance', 'askQuestion', ['count', 'index', 'question']], ['guidance', 'wrongStep', ['current']],
]
for (const [group, key, expected] of variables) {
  const text = (config as unknown as Record<string, Record<string, string>>)[group]![key]!
  const actual = [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]))].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('invalid_portrait_studio_variables')
}
for (const slot of Object.values(config.imagePrompt.slots)) if (!slot.includes('{{answer}}')) throw new Error('invalid_portrait_studio_variables')
if (!/^https:\/\/[a-z0-9.-]+\//.test(config.image.baseUrl) || !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(config.image.modelId)
  || !/^\d{3,4}x\d{3,4}$/.test(config.image.size)) throw new Error('invalid_portrait_studio_config')

export const PORTRAIT_STUDIO = config

/** One pass; inserted values are data and are never re-expanded. */
export function renderStudioText(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => Object.hasOwn(values, name) ? values[name]! : match)
}

export function studioFailureLine(code: string, language: StudioLanguage): string {
  const lines = PORTRAIT_STUDIO.lines.failed as Readonly<Record<string, Readonly<Record<StudioLanguage, string>>>>
  return (lines[code] ?? lines.default!)[language]
}
