import source from '../../resources/config/portrait-studio.v1.json' with { type: 'json' }
import {
  studioFarewellIssue, studioWakePhraseIssue, STUDIO_FAILURE_KEYS, STUDIO_IMAGE_PROMPT_KEYS, STUDIO_PROMPT_STAGES, STUDIO_SCREEN_KEYS, studioFailureIssue, studioImageLineIssue,
  studioImagePromptIssue, studioPromptIssue, studioScreenIssue,
  type StudioFailureKey, type StudioImagePromptKey, type StudioLanguage, type StudioPromptStage, type StudioQuestion, type StudioScreenKey,
  type StudioScreenView, type StudioSettings,
} from './portrait-studio'
import { DEFAULT_STUDIO_OFFER } from './realtime-tools'

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
  ['agent', 'reveal', ['followUp']], ['agent', 'revealBlind', ['followUp']], ['guidance', 'askName', ['question']], ['guidance', 'confirmName', ['name']],
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
  instructions: config.agent.studio, offer: DEFAULT_STUDIO_OFFER,
  unavailable: config.guidance.unavailable, busy: config.guidance.busy, askName: config.guidance.askName, confirmName: config.guidance.confirmName,
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

type Settings = Partial<Pick<StudioSettings, 'imagePrompt' | 'screenText' | 'failureLines'>> | undefined
const failed = config.lines.failed as Readonly<Record<StudioFailureKey, Readonly<Record<StudioLanguage, string>>>>
for (const key of STUDIO_FAILURE_KEYS) if (studioFailureIssue(failed[key]?.zh) || studioFailureIssue(failed[key]?.en)) throw new Error('invalid_portrait_studio_config')

/** Versioned studio defaults: wake phrase and farewell. */
export const STUDIO_DEFAULT_WAKE_PHRASE: string = config.defaults.wakePhrase
export const STUDIO_DEFAULT_FAREWELL: string = config.defaults.farewell
if (studioWakePhraseIssue(STUDIO_DEFAULT_WAKE_PHRASE) || studioFarewellIssue(STUDIO_DEFAULT_FAREWELL)) throw new Error('invalid_portrait_studio_config')
export function studioWakePhrase(settings: Pick<StudioSettings, 'wakePhrase'> | undefined): string {
  return settings?.wakePhrase?.trim() || STUDIO_DEFAULT_WAKE_PHRASE
}
export function studioFarewellLines(settings: Pick<StudioSettings, 'farewell'> | undefined): string[] {
  return (settings?.farewell ?? STUDIO_DEFAULT_FAREWELL).split('\n').map(line => line.trim()).filter(Boolean)
}
/** One verbatim cue: a sentence end and an ellipsis between lines make the voice pause (about a second). */
export function studioFarewellSpeech(settings: Pick<StudioSettings, 'farewell'> | undefined): string {
  return studioFarewellLines(settings).map(line => /[。！？.!?…]$/u.test(line) ? line : `${line}。`).join('……')
}

/** The spoken line for a failure: the avatar's edit, else the versioned default. */
export function studioFailureLine(code: string, language: StudioLanguage, settings?: Settings): string {
  const key: StudioFailureKey = (STUDIO_FAILURE_KEYS as readonly string[]).includes(code) ? code as StudioFailureKey : 'default'
  return settings?.failureLines?.[key]?.[language] ?? failed[key][language]
}

/** Versioned image-prompt templates; the guard is fixed and never operator-editable. */
export const STUDIO_IMAGE_PROMPT_DEFAULTS: Readonly<Record<StudioImagePromptKey, string>> = Object.freeze({
  frame: config.imagePrompt.frame, nameplate: config.imagePrompt.nameplate, painted: config.imagePrompt.painted,
  untitled: config.imagePrompt.untitled, revision: config.imagePrompt.revision,
})
for (const key of STUDIO_IMAGE_PROMPT_KEYS) if (studioImagePromptIssue(key, STUDIO_IMAGE_PROMPT_DEFAULTS[key])) throw new Error('invalid_portrait_studio_variables')
for (const line of Object.values(config.imagePrompt.slots)) if (studioImageLineIssue(line)) throw new Error('invalid_portrait_studio_variables')
export function studioImagePrompt(settings: Settings, key: StudioImagePromptKey): string {
  return settings?.imagePrompt?.[key] ?? STUDIO_IMAGE_PROMPT_DEFAULTS[key]
}
/** A question's image-prompt line: its own edit, else its image part's default. */
export function studioQuestionLine(question: Pick<StudioQuestion, 'slot' | 'imageLine'>): string {
  return question.imageLine ?? config.imagePrompt.slots[question.slot]
}

/** Versioned on-glass text; captions are stored one per line. */
export const STUDIO_SCREEN_DEFAULTS: Readonly<Record<StudioLanguage, Readonly<Record<StudioScreenKey, string>>>> = config.screen
for (const language of ['zh', 'en'] as const) for (const key of STUDIO_SCREEN_KEYS) {
  if (studioScreenIssue(key, config.screen[language][key])) throw new Error('invalid_portrait_studio_config')
}
export function studioScreenText(settings: Settings, key: StudioScreenKey, language: StudioLanguage): string {
  return settings?.screenText?.[key]?.[language] ?? STUDIO_SCREEN_DEFAULTS[language][key]
}
/** Everything the glass shows for one language, with the question counter already filled in. */
export function studioScreenView(settings: Settings, language: StudioLanguage, index: number, count: number): StudioScreenView {
  const text = (key: StudioScreenKey) => studioScreenText(settings, key, language)
  return {
    nameLabel: text('nameLabel'), confirmLabel: text('confirmLabel'), confirmQuestion: text('confirmQuestion'),
    questionLabel: renderStudioText(text('questionLabel'), { index: String(index), count: String(count) }),
    changePrefix: text('changePrefix'), changeHint: text('changeHint'), doneHint: text('doneHint'), finalHint: text('finalHint'),
    photoHint: text('photoHint'), captions: text('captions').split('\n').map(line => line.trim()).filter(Boolean),
  }
}
