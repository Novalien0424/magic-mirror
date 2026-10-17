import source from '../../resources/config/portrait-studio.v1.json'
import { STUDIO_PROMPT_STAGES, studioPromptIssue, type StudioLanguage, type StudioPromptStage, type StudioSettings } from './portrait-studio'

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

/** Versioned default for each operator-editable stage prompt. */
export const STUDIO_PROMPT_DEFAULTS: Readonly<Record<StudioPromptStage, string>> = Object.freeze({
  instructions: config.agent.studio, askName: config.guidance.askName, confirmName: config.guidance.confirmName,
  chooseGuest: config.guidance.chooseGuest, guestOnly: config.guidance.guestOnly, askQuestion: config.guidance.askQuestion,
  painting: config.guidance.painting, reveal: config.agent.reveal, revealBlind: config.agent.revealBlind,
  offerChange: config.agent.offerChange, repainting: config.guidance.repainting, noChangesLeft: config.guidance.noChangesLeft,
  finalVersion: config.agent.finalVersion, finished: config.guidance.finished, exited: config.guidance.exited,
})
for (const stage of STUDIO_PROMPT_STAGES) if (studioPromptIssue(stage, STUDIO_PROMPT_DEFAULTS[stage])) throw new Error('invalid_portrait_studio_variables')

/** The avatar's effective prompt for a stage: its override, else the versioned default. */
export function studioPrompt(settings: Pick<StudioSettings, 'prompts'> | undefined, stage: StudioPromptStage): string {
  const override = settings?.prompts?.[stage]
  return typeof override === 'string' && override.trim() ? override : STUDIO_PROMPT_DEFAULTS[stage]
}

/** One pass; inserted values are data and are never re-expanded. */
export function renderStudioText(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => Object.hasOwn(values, name) ? values[name]! : match)
}

export function studioFailureLine(code: string, language: StudioLanguage): string {
  const lines = PORTRAIT_STUDIO.lines.failed as Readonly<Record<string, Readonly<Record<StudioLanguage, string>>>>
  return (lines[code] ?? lines.default!)[language]
}
