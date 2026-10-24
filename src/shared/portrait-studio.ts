/** Interactive Studio contracts (internal name: portrait studio). Dependency-free: also used by the sandboxed preloads. */
import { speechScriptIssue } from './speech-script.ts'

export type ExperienceMode = 'conversation' | 'portrait_studio'
/** The Mirror's explicit switch (Main-owned, persisted); `studio` makes every wake start the Interactive Studio. */
export type MirrorMode = 'conversation' | 'studio'
export type StudioSlot = 'subject' | 'setting' | 'mood' | 'palette' | 'companion' | 'style' | 'detail'
export type StudioQuality = 'low' | 'medium' | 'high'
export type StudioLanguage = 'zh' | 'en'
export type GuestMatchMode = 'off' | 'prefer' | 'only'
export const STUDIO_SLOTS: readonly StudioSlot[] = Object.freeze(['subject', 'setting', 'mood', 'palette', 'companion', 'style', 'detail'])
export const STUDIO_MAX_QUESTIONS = 8
export const STUDIO_QUESTION_MAX = 600
export const STUDIO_ANSWER_MAX = 1600
export const STUDIO_MAX_GUESTS = 1000

/** `imageLine` (optional) replaces the slot's default image-prompt line; it must contain `{{answer}}`. */
export interface StudioQuestion { id: string; zh: string; en: string; slot: StudioSlot; imageLine?: string }
export interface StudioBilingual { zh: string; en: string }

/** What the avatar is told at each studio stage, in visit order. Operators may override any of them per avatar. */
export const STUDIO_PROMPT_STAGES = Object.freeze(['instructions', 'unavailable', 'askName', 'confirmName',
  'chooseGuest', 'guestOnly', 'askQuestion', 'painting', 'busy', 'reveal', 'revealBlind', 'offerChange', 'repainting', 'noChangesLeft',
  'finalVersion', 'finished', 'exited', 'offer', 'comment'] as const)
export type StudioPromptStage = typeof STUDIO_PROMPT_STAGES[number]
/** Placeholders each stage supports: required ones must stay in the text; any other placeholder is rejected. */
export const STUDIO_PROMPT_PLACEHOLDERS: Readonly<Record<StudioPromptStage, { required: readonly string[]; optional: readonly string[] }>> = Object.freeze({
  instructions: { required: [], optional: [] }, offer: { required: [], optional: [] }, comment: { required: ['answer'], optional: [] },
  unavailable: { required: [], optional: [] }, busy: { required: [], optional: [] }, askName: { required: ['question'], optional: [] },
  confirmName: { required: ['name'], optional: [] }, chooseGuest: { required: ['candidates'], optional: [] },
  guestOnly: { required: [], optional: [] }, askQuestion: { required: ['question'], optional: ['index', 'count'] },
  painting: { required: [], optional: [] }, reveal: { required: ['followUp'], optional: ['language'] },
  revealBlind: { required: ['followUp'], optional: ['language'] }, offerChange: { required: [], optional: [] },
  repainting: { required: [], optional: [] }, noChangesLeft: { required: [], optional: [] },
  finalVersion: { required: [], optional: [] }, finished: { required: [], optional: [] }, exited: { required: [], optional: [] },
})
export const STUDIO_PROMPT_MAX = Object.freeze({ instructions: 4000, other: 1000 })
/** Operator-facing name and moment of each stage prompt (Console editor and prompt inspector). */
export const STUDIO_PROMPT_INFO: Readonly<Record<StudioPromptStage, { label: string; when: string }>> = Object.freeze({
  comment: { label: 'Comment on an answer', when: 'One or two short sentences after each answer. The application then asks the next question without waiting for a reply.' },
  instructions: { label: 'Studio rules', when: 'Part of the studio system prompt, after the Studio character: how the avatar runs the steps. Change the first lines if the story is not a portrait.' },
  offer: { label: 'Conversation mode: what the studio offers', when: 'Only in Conversation mode, when visitors may ask for the studio: completes “It offers …” so the avatar knows which requests open it. Include example requests.' },
  unavailable: { label: 'Studio unavailable', when: 'When the studio cannot start (for example, no ChatGPT sign-in).' },
  askName: { label: 'Ask the name', when: 'Right after the studio opens.' },
  confirmName: { label: 'Read the name back', when: 'After the visitor says a name, before it is confirmed.' },
  chooseGuest: { label: 'Guest list: close matches', when: 'When the guest list has names close to what the visitor said.' },
  guestOnly: { label: 'Guest list: no match', when: 'When only listed guests may take part and no listed name matches.' },
  askQuestion: { label: 'Each question', when: 'Before every portrait question, in order.' },
  painting: { label: 'Painting starts', when: 'After the last answer, while the first picture is painted.' },
  busy: { label: 'While painting', when: 'When the visitor talks or asks for something while a picture is still being painted.' },
  reveal: { label: 'Reveal', when: 'When the portrait appears on the mirror and the avatar can see it.' },
  revealBlind: { label: 'Reveal without the image', when: 'When the portrait appears but its image could not be shown to the avatar.' },
  offerChange: { label: 'Offer a change', when: 'Added to the reveal while the visitor may still ask for a change.' },
  repainting: { label: 'Repainting', when: 'After the visitor asks for a change.' },
  noChangesLeft: { label: 'No changes left', when: 'When the visitor asks for another change after the last allowed one.' },
  finalVersion: { label: 'Final version', when: 'Added to the reveal when no more changes are allowed: the avatar hands the picture over, then the studio finishes by itself and the picture stays up for photos.' },
  finished: { label: 'Hand over the picture', when: 'When the visitor is happy before every change is used, before the photo hold (the last picture is handed over by Final version). In Interactive Studio mode the Studio farewell (5 · Ending) follows, word for word.' },
  exited: { label: 'Visitor stops the studio', when: 'When the visitor stops the studio to keep chatting; the visit continues as a conversation.' },
})
export const STUDIO_PLACEHOLDER_INFO: Readonly<Record<string, string>> = Object.freeze({
  question: 'the question text', name: 'the name the avatar heard', candidates: 'up to three matching guest names',
  index: 'the question number', count: 'the number of questions', followUp: 'the Offer a change or Final version prompt',
  language: "the visitor's language",
  answer: "the visitor's answer, quoted as data",
})
/** Per-avatar overrides; a stage without one uses the versioned default. */
export type StudioPrompts = Partial<Record<StudioPromptStage, string>>

/** Operator-facing problem with an editable template, or '' when it is valid. */
export function templateIssue(text: unknown, max: number, placeholders: { readonly required: readonly string[]; readonly optional: readonly string[] },
  empty: string, multiline = true): string {
  if (typeof text !== 'string' || !text.trim()) return empty
  if (text.length > max) return `Use ${max} characters or fewer (now ${text.length}).`
  if ((multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(text)) {
    return multiline ? 'Remove tabs and other control characters.' : 'Remove line breaks, tabs and other control characters.'
  }
  const { required, optional } = placeholders
  const used = [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]!))]
  const unknown = used.filter(name => !required.includes(name) && !optional.includes(name))
  if (unknown.length) return `Remove ${unknown.map(name => `{{${name}}}`).join(', ')}: this text ${required.length + optional.length
    ? `supports only ${[...required, ...optional].map(name => `{{${name}}}`).join(', ')}` : 'has no placeholders'}.`
  const missing = required.filter(name => !used.includes(name))
  if (missing.length) return `Keep ${missing.map(name => `{{${name}}}`).join(' and ')}; the mirror needs ${missing.length === 1 ? 'it' : 'them'} here.`
  return ''
}

/** Operator-facing problem with a stage prompt, or '' when it is valid. */
export function studioPromptIssue(stage: StudioPromptStage, text: unknown): string {
  return templateIssue(text, stage === 'instructions' ? STUDIO_PROMPT_MAX.instructions : STUDIO_PROMPT_MAX.other, STUDIO_PROMPT_PLACEHOLDERS[stage],
    'Enter what the avatar is told at this stage, or reset it to the default.')
}

/** Image-generation text around the visitor's answers. A fixed data-only guard is always added by the app. */
export type StudioPictureType = 'sticker' | 'portrait'
export const STUDIO_PICTURE_TYPES: readonly StudioPictureType[] = Object.freeze(['sticker', 'portrait'])
export function studioPictureType(studio: Pick<StudioSettings, 'pictureType'> | undefined): StudioPictureType {
  return studio?.pictureType ?? 'sticker'
}
export const STUDIO_NAME_FONT_MAX = 80
export function studioNameFontIssue(value: unknown): string {
  return studioText(value, STUDIO_NAME_FONT_MAX) && value.trim().length > 0 ? '' : `Describe the lettering in 1 to ${STUDIO_NAME_FONT_MAX} characters on one line.`
}
export const STUDIO_IMAGE_PROMPT_KEYS = Object.freeze(['frame', 'nameplate', 'painted', 'untitled', 'revision'] as const)
export type StudioImagePromptKey = typeof STUDIO_IMAGE_PROMPT_KEYS[number]
export const STUDIO_IMAGE_PROMPT_INFO: Readonly<Record<StudioImagePromptKey, { label: string; when: string; max: number; required: readonly string[]; optional: readonly string[] }>> = Object.freeze({
  frame: { label: 'Opening instruction', when: 'Starts every image prompt. {{style}} inserts Art style.', max: 2000, required: [], optional: ['style'] },
  nameplate: { label: 'Nameplate instruction', when: 'Ends the prompt when the app adds the name banner.', max: 600, required: [], optional: [] },
  painted: { label: 'Painted name instruction', when: 'Ends the prompt when the image model letters the name; {{name}} is the confirmed name, {{font}} the Name font.', max: 600, required: ['name'], optional: ['font'] },
  untitled: { label: 'No-name instruction', when: 'Ends the prompt when Ask for a name first is off.', max: 600, required: [], optional: [] },
  revision: { label: 'Change instruction', when: 'The whole prompt for a change; {{change}} is what the visitor asked to change.', max: 1000, required: ['change'], optional: [] },
})
export const STUDIO_IMAGE_LINE_MAX = 300
export function studioImagePromptIssue(key: StudioImagePromptKey, text: unknown): string {
  return templateIssue(text, STUDIO_IMAGE_PROMPT_INFO[key].max, STUDIO_IMAGE_PROMPT_INFO[key], 'Enter this image instruction, or reset it to the default.')
}
export function studioImageLineIssue(text: unknown): string {
  return templateIssue(text, STUDIO_IMAGE_LINE_MAX, { required: ['answer'], optional: [] }, 'Enter this question’s image prompt line, or reset it to the default.', false)
}

/** Text shown on the glass during a visit, in both languages. */
export const STUDIO_SCREEN_KEYS = Object.freeze(['nameLabel', 'confirmLabel', 'confirmQuestion', 'questionLabel', 'changePrefix', 'changeHint',
  'doneHint', 'finalHint', 'photoHint', 'captions'] as const)
export type StudioScreenKey = typeof STUDIO_SCREEN_KEYS[number]
export const STUDIO_SCREEN_INFO: Readonly<Record<StudioScreenKey, { label: string; when: string }>> = Object.freeze({
  nameLabel: { label: 'Name label', when: 'Above the name question.' },
  confirmLabel: { label: 'Read-back label', when: 'Above the name while the avatar reads it back.' },
  confirmQuestion: { label: 'Read-back question', when: 'Below the name while the avatar reads it back.' },
  questionLabel: { label: 'Question counter', when: 'Above each question; {{index}} and {{count}} are optional.' },
  changePrefix: { label: 'Change chip prefix', when: 'Before the requested change while it is painted.' },
  changeHint: { label: 'Change hint', when: 'Under a revealed picture while changes remain.' },
  doneHint: { label: 'Done hint', when: 'Under a revealed picture while changes remain.' },
  finalHint: { label: 'Final hint', when: 'Under a revealed picture when no changes remain.' },
  photoHint: { label: 'Photo hint', when: 'While the final picture stays up for photos.' },
  captions: { label: 'Painting captions', when: 'Rotating lines while a picture is painted; one per line, up to 6.' },
})
export const STUDIO_SCREEN_MAX = 60
export function studioScreenIssue(key: StudioScreenKey, text: unknown): string {
  if (key === 'captions') {
    if (typeof text !== 'string' || /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(text)) return 'Remove tabs and other control characters.'
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.length < 1 || lines.length > 6) return 'Enter 1 to 6 caption lines.'
    if (lines.some(line => line.length > STUDIO_SCREEN_MAX)) return `Keep each line to ${STUDIO_SCREEN_MAX} characters.`
    return /\{\{/.test(text) ? 'Captions have no placeholders.' : ''
  }
  return templateIssue(text, STUDIO_SCREEN_MAX, { required: [], optional: key === 'questionLabel' ? ['index', 'count'] : [] }, 'Enter this text, or reset it to the default.', false)
}

/** What the avatar says when a picture cannot be made, in both languages (spoken verbatim). */
export const STUDIO_FAILURE_KEYS = Object.freeze(['studio_auth_required', 'studio_quota_exhausted', 'studio_image_refused', 'revision_failed', 'default'] as const)
export type StudioFailureKey = typeof STUDIO_FAILURE_KEYS[number]
export const STUDIO_FAILURE_INFO: Readonly<Record<StudioFailureKey, string>> = Object.freeze({
  studio_auth_required: 'ChatGPT sign-in missing or rejected', studio_quota_exhausted: 'ChatGPT plan image limit reached',
  studio_image_refused: 'Image refused by the safety system', revision_failed: 'A change failed (the earlier picture stays)', default: 'Any other failure',
})
export function studioFailureIssue(text: unknown): string {
  return templateIssue(text, 200, { required: [], optional: [] }, 'Enter this line, or reset it to the default.', false)
}

export interface StudioSettings {
  /** Wake phrase while the Mirror is in Interactive Studio mode (missing = versioned default). */
  wakePhrase?: string
  startScript: string
  /** The studio's character (system prompt persona); missing = the avatar's Persona personality. */
  character?: string
  /** Spoken when a studio-mode visit ends, one phrase per line with a pause between (missing = versioned default). */
  farewell?: string
  /** Ask the visitor's name first (default true). Off: no name step, no lettering. */
  askName?: boolean
  nameQuestion: { zh: string; en: string }
  questions: StudioQuestion[]
  artStyle: string
  /** Sticker: square, transparent, die-cut (default). Portrait: a full tall picture. */
  pictureType?: StudioPictureType
  nameLettering: 'nameplate' | 'painted'
  /** Lettering for a painted name, e.g. "brush calligraphy" (missing = versioned default). */
  nameFont?: string
  quality: StudioQuality
  revisionsAllowed: number
  holdSeconds: number
  prompts: StudioPrompts
  /** Operator edits only; a missing entry uses the versioned default. */
  imagePrompt?: Partial<Record<StudioImagePromptKey, string>>
  screenText?: Partial<Record<StudioScreenKey, StudioBilingual>>
  failureLines?: Partial<Record<StudioFailureKey, StudioBilingual>>
}
/** Operator-authored in Console; the list and aliases never enter Mirror/model session settings. */
export interface GuestNameAliases { name: string; aliases: string[] }
export interface GuestListSettings { names: string[]; match: GuestMatchMode; aliases?: GuestNameAliases[] }
export interface AvatarExperience {
  defaultMode: ExperienceMode
  visitorMayRequest: boolean
  afterPortrait: 'continue' | 'farewell'
  studio: StudioSettings
  guests: GuestListSettings
}
/** Renderer-visible subset: no guest names. */
export interface SessionExperience {
  defaultMode: ExperienceMode
  visitorMayRequest: boolean
  afterPortrait: 'continue' | 'farewell'
  studio: StudioSettings
  guestMatch: GuestMatchMode
}

export const DEFAULT_EXPERIENCE: Readonly<AvatarExperience> = Object.freeze({
  defaultMode: 'conversation',
  visitorMayRequest: true,
  afterPortrait: 'continue',
  studio: {
    startScript: '歡迎來到Gate thirty-three. 在這連結現實與虛幻的地方，唯有捨棄你的肉身，吾才能引渡你前往下一個世界[pause=1s]',
    nameQuestion: { zh: '準備好的話就告訴我你的名字', en: 'When you are ready, tell me your name.' },
    questions: [
      { id: 'q1', zh: '你的靈魂唯有轉換成為度界之獸，才能進入這個Gate thirty three, 現在讓我們來嘗試描繪你的靈魂吧。說說看最近這一年裡面，有哪一個時刻最讓你印象深刻 為什麼?', en: 'Your soul must become a creature that crosses worlds to enter Gate thirty-three. Let us imagine it. Which moment in the past year stayed with you most, and why?', slot: 'subject', imageLine: 'A meaningful moment, translated symbolically into the imaginary soul creature: {{answer}}.' },
      { id: 'q2', zh: '很好- 那麼說說看是否曾經有哪一件事情，讓你覺得 這就是我啊 這就是我會做的事情。', en: 'Was there something you did that made you think: this is who I am, this is what I would do?', slot: 'detail', imageLine: 'An action expressing the visitor’s character, represented in the creature’s gesture or form: {{answer}}.' },
      { id: 'q3', zh: '很好 -那麼說說看，現在的你有什麼事情是覺得兩件都想要，但是卻很難同時做到的事情?', en: 'What are two things you want now that are difficult to have at the same time?', slot: 'detail', imageLine: 'A tension between two wishes, represented as balanced contrasting features: {{answer}}.' },
      { id: 'q4', zh: '很好 -那麼說說看，如果可以的話 你希望生活裡多一點什麼?', en: 'If you could, what would you like a little more of in your life?', slot: 'mood', imageLine: 'A wish for life, represented in the creature’s colours or small supporting motif: {{answer}}.' },
    ],
    artStyle: 'Modern minimalist multi-colour vector-style illustration. Clean geometric shapes, crisp edges, a balanced palette of distinct flat colours and generous negative space. Keep the soul creature expressive and symbolic with few thoughtful details; no photorealism, gradients or heavy textures.',
    pictureType: 'sticker',
    nameLettering: 'nameplate',
    quality: 'medium',
    revisionsAllowed: 1,
    holdSeconds: 45,
    prompts: {},
  },
  guests: { names: [], match: 'prefer' },
} satisfies AvatarExperience)

export function defaultExperience(): AvatarExperience { return structuredClone(DEFAULT_EXPERIENCE) as AvatarExperience }

/** Each visit starts in Traditional Chinese; only an explicit request changes it. */
export function studioStartLanguage(_startScript: string): StudioLanguage {
  return 'zh'
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const control = /[\u0000-\u001f\u007f]/u
const controlExceptNewline = /[\u0000-\u0009\u000b-\u001f\u007f]/u
export function studioText(value: unknown, max: number, allowEmpty = false, multiline = false): value is string {
  return typeof value === 'string' && value.length <= max && !(multiline ? controlExceptNewline : control).test(value) && (allowEmpty || value.trim().length > 0)
}
export function validGuestName(value: unknown): value is string { return studioText(value, 40) && value.trim() === value }

export function parseGuestSettings(value: unknown): GuestListSettings | null {
  if (!record(value) || !exact(value, ['names', 'match', ...('aliases' in value ? ['aliases'] : [])]) || !['off', 'prefer', 'only'].includes(value.match as string)
    || !Array.isArray(value.names) || value.names.length > STUDIO_MAX_GUESTS || !value.names.every(validGuestName)) return null
  if (value.aliases !== undefined && (!Array.isArray(value.aliases) || value.aliases.length > STUDIO_MAX_GUESTS
    || !value.aliases.every(entry => record(entry) && exact(entry, ['name', 'aliases']) && validGuestName(entry.name)
      && (value.names as string[]).includes(entry.name) && Array.isArray(entry.aliases) && entry.aliases.length > 0
      && entry.aliases.length <= 8 && entry.aliases.every(validGuestName)))) return null
  return structuredClone(value) as unknown as GuestListSettings
}

function parseStudioPrompts(value: unknown): StudioPrompts | null {
  if (!record(value)) return null
  for (const [stage, text] of Object.entries(value)) {
    if (!STUDIO_PROMPT_STAGES.includes(stage as StudioPromptStage) || studioPromptIssue(stage as StudioPromptStage, text)) return null
  }
  return structuredClone(value) as StudioPrompts
}

const STUDIO_KEYS = ['startScript', 'nameQuestion', 'questions', 'artStyle', 'nameLettering', 'quality', 'revisionsAllowed', 'holdSeconds', 'prompts']
const STUDIO_OPTIONAL_KEYS = ['wakePhrase', 'character', 'farewell', 'askName', 'pictureType', 'nameFont', 'imagePrompt', 'screenText', 'failureLines']
export const STUDIO_CHARACTER_MAX = 4000
export const STUDIO_FAREWELL_LINES = 4
/** Same rule as an avatar wake phrase; Main reports a phrase the wake model cannot encode. */
export function studioWakePhraseIssue(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 96 && !/[\u0000-\u001f\u007f]/u.test(value)
    ? '' : 'Enter a wake phrase of 1 to 96 characters on one line.'
}
export function studioFarewellIssue(value: unknown): string {
  if (typeof value !== 'string' || /[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value)) return 'Remove tabs and other control characters.'
  const lines = value.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length < 1 || lines.length > STUDIO_FAREWELL_LINES) return `Enter 1 to ${STUDIO_FAREWELL_LINES} lines; the avatar pauses between lines.`
  return lines.some(line => line.length > 80) ? 'Keep each line to 80 characters.' : speechScriptIssue(value)
}
export function studioCharacterIssue(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= STUDIO_CHARACTER_MAX && !/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value)
    ? '' : `Describe the character in 1 to ${STUDIO_CHARACTER_MAX} characters, or reset it to the Persona.`
}
const bilingualMap = <K extends string>(value: unknown, keys: readonly K[], issue: (key: K, text: unknown) => string): boolean =>
  record(value) && Object.entries(value).every(([key, pair]) => keys.includes(key as K) && record(pair) && exact(pair, ['zh', 'en'])
    && !issue(key as K, pair.zh) && !issue(key as K, pair.en))

function parseStudioSettings(input: unknown): StudioSettings | null {
  // Settings saved before stage prompts existed use every default.
  const value = record(input) && !Object.hasOwn(input, 'prompts') ? { ...input, prompts: {} } : input
  if (!record(value) || !STUDIO_KEYS.every(key => Object.hasOwn(value, key))
    || !Object.keys(value).every(key => STUDIO_KEYS.includes(key) || STUDIO_OPTIONAL_KEYS.includes(key))
    || !parseStudioPrompts(value.prompts)) return null
  if ('askName' in value && typeof value.askName !== 'boolean') return null
  if ('wakePhrase' in value && studioWakePhraseIssue(value.wakePhrase)) return null
  if ('farewell' in value && studioFarewellIssue(value.farewell)) return null
  if ('character' in value && studioCharacterIssue(value.character)) return null
  if ('pictureType' in value && !STUDIO_PICTURE_TYPES.includes(value.pictureType as StudioPictureType)) return null
  if ('nameFont' in value && studioNameFontIssue(value.nameFont)) return null
  if ('imagePrompt' in value && !(record(value.imagePrompt) && Object.entries(value.imagePrompt)
    .every(([key, text]) => STUDIO_IMAGE_PROMPT_KEYS.includes(key as StudioImagePromptKey) && !studioImagePromptIssue(key as StudioImagePromptKey, text)))) return null
  if ('screenText' in value && !bilingualMap(value.screenText, STUDIO_SCREEN_KEYS, studioScreenIssue)) return null
  if ('failureLines' in value && !bilingualMap(value.failureLines, STUDIO_FAILURE_KEYS, (_key, text) => studioFailureIssue(text))) return null
  const name = value.nameQuestion
  if (!studioText(value.startScript, 500, false, true) || !record(name) || !exact(name, ['zh', 'en']) || !studioText(name.zh, 200) || !studioText(name.en, 200)
    || !Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > STUDIO_MAX_QUESTIONS
    || !studioText(value.artStyle, 600, false, true) || (value.nameLettering !== 'nameplate' && value.nameLettering !== 'painted')
    || !['low', 'medium', 'high'].includes(value.quality as string)
    || !Number.isInteger(value.revisionsAllowed) || (value.revisionsAllowed as number) < 0 || (value.revisionsAllowed as number) > 3
    || !Number.isInteger(value.holdSeconds) || (value.holdSeconds as number) < 10 || (value.holdSeconds as number) > 300) return null
  if (speechScriptIssue(value.startScript) || speechScriptIssue(name.zh) || speechScriptIssue(name.en)) return null
  const ids = new Set<string>()
  for (const question of value.questions) {
    if (!record(question) || !(exact(question, ['id', 'zh', 'en', 'slot']) || exact(question, ['id', 'zh', 'en', 'slot', 'imageLine']))
      || typeof question.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(question.id)
      || ids.has(question.id) || !studioText(question.zh, STUDIO_QUESTION_MAX, false, true) || !studioText(question.en, STUDIO_QUESTION_MAX, false, true) || speechScriptIssue(question.zh) || speechScriptIssue(question.en) || !STUDIO_SLOTS.includes(question.slot as StudioSlot)
      || 'imageLine' in question && studioImageLineIssue(question.imageLine)) return null
    ids.add(question.id)
  }
  return structuredClone(value) as unknown as StudioSettings
}

export function parseAvatarExperience(value: unknown): AvatarExperience | null {
  if (!record(value) || !exact(value, ['defaultMode', 'visitorMayRequest', 'afterPortrait', 'studio', 'guests'])) return null
  const guests = value.guests
  const studio = parseStudioSettings(value.studio)
  if ((value.defaultMode !== 'conversation' && value.defaultMode !== 'portrait_studio') || typeof value.visitorMayRequest !== 'boolean'
    || (value.afterPortrait !== 'continue' && value.afterPortrait !== 'farewell') || !studio
    || !parseGuestSettings(guests)) return null
  return { ...structuredClone(value), studio } as unknown as AvatarExperience
}

/** Renderer subset: no guest names, and no image-prompt, on-glass or failure text (Main applies those). */
export function sessionExperience(experience: AvatarExperience): SessionExperience {
  const { imagePrompt: _image, screenText: _screen, failureLines: _failure, pictureType: _picture, nameFont: _font, ...studio } = structuredClone(experience.studio)
  return { defaultMode: experience.defaultMode, visitorMayRequest: experience.visitorMayRequest, afterPortrait: experience.afterPortrait,
    studio, guestMatch: experience.guests.names.length ? experience.guests.match : 'off' }
}

export function parseSessionExperience(value: unknown): SessionExperience | null {
  if (!record(value) || !exact(value, ['defaultMode', 'visitorMayRequest', 'afterPortrait', 'studio', 'guestMatch'])) return null
  const parsed = parseAvatarExperience({ defaultMode: value.defaultMode, visitorMayRequest: value.visitorMayRequest,
    afterPortrait: value.afterPortrait, studio: value.studio, guests: { names: [], match: value.guestMatch } })
  return parsed ? { ...sessionExperience(parsed), guestMatch: parsed.guests.match } : null
}

// ---------- Tool requests (renderer → Main) and replies ----------

/** Renderer requests. A session-default start is Main's own decision, never a renderer claim. */
export type StudioRequest =
  | { action: 'start'; source: 'visitor' }
  | { action: 'set_name'; name: string; confirmed: boolean; language: StudioLanguage }
  | { action: 'confirm_name'; stepId: string }
  | { action: 'reject_name' }
  | { action: 'repeat' }
  | { action: 'language'; language: StudioLanguage }
  | { action: 'step_ready' | 'step_activity' | 'paint' | 'deliver'; stepId: string }
  | { action: 'answer'; question: number; answer: string; language: StudioLanguage }
  | { action: 'revise'; change: string }
  | { action: 'finish' }
  | { action: 'exit' }

export function parseStudioRequest(value: unknown): StudioRequest | null {
  if (!record(value)) return null
  switch (value.action) {
    case 'language': return exact(value, ['action', 'language']) && (value.language === 'zh' || value.language === 'en')
      ? { action: 'language', language: value.language } : null
    case 'step_ready': case 'step_activity': case 'paint': case 'deliver': case 'confirm_name':
      return exact(value, ['action', 'stepId']) && validStepId(value.stepId) ? { action: value.action, stepId: value.stepId } : null
    case 'start': return exact(value, ['action', 'source']) && value.source === 'visitor' ? { action: 'start', source: value.source } : null
    case 'set_name': return exact(value, ['action', 'name', 'confirmed', 'language']) && studioText(value.name, 40) && typeof value.confirmed === 'boolean'
      && (value.language === 'zh' || value.language === 'en')
      ? { action: 'set_name', name: value.name, confirmed: value.confirmed, language: value.language } : null
    case 'answer': return exact(value, ['action', 'question', 'answer', 'language']) && Number.isInteger(value.question)
      && (value.question as number) >= 1 && (value.question as number) <= STUDIO_MAX_QUESTIONS && studioText(value.answer, STUDIO_ANSWER_MAX)
      && (value.language === 'zh' || value.language === 'en')
      ? { action: 'answer', question: value.question as number, answer: value.answer, language: value.language } : null
    case 'revise': return exact(value, ['action', 'change']) && studioText(value.change, 120) ? { action: 'revise', change: value.change } : null
    case 'finish': case 'exit': case 'reject_name': case 'repeat': return exact(value, ['action']) ? { action: value.action } : null
    default: return null
  }
}

export type StudioOutcome = 'accepted' | 'ignored' | 'rejected' | 'failed'
export interface StudioReply {
  status: StudioOutcome
  code: string
  /** Application guidance for the model's next spoken move (operator/versioned text, never private data). */
  next?: string
  /** Up to three guest-list names matching the spoken name. */
  candidates?: string[]
  step?: StudioStep
}

export function parseStudioReply(value: unknown): StudioReply | null {
  if (!record(value) || !['accepted', 'ignored', 'rejected', 'failed'].includes(value.status as string)
    || typeof value.code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(value.code)) return null
  const keys = Object.keys(value)
  if (!keys.every(key => ['status', 'code', 'next', 'candidates', 'step'].includes(key))) return null
  if ('step' in value && !parseStudioStep(value.step)) return null
  if ('next' in value && !studioText(value.next, 2000, false, true)) return null
  if ('candidates' in value && (!Array.isArray(value.candidates) || value.candidates.length > 3 || !value.candidates.every(validGuestName))) return null
  return structuredClone(value) as unknown as StudioReply
}

export type StudioImageFailure =
  | 'studio_auth_required' | 'studio_quota_exhausted' | 'studio_image_refused' | 'studio_model_rejected'
  | 'studio_provider_contract' | 'studio_image_timeout' | 'studio_image_unavailable' | 'studio_cancelled'

// ---------- Mirror view and session events (Main → renderer) ----------

export type StudioPhase = 'name' | 'confirm' | 'question' | 'painting' | 'reveal' | 'revising' | 'keepsake'
export interface StudioView {
  phase: StudioPhase
  language: StudioLanguage
  questionCount: number
  answered: number
  /** Current question text in the session language (operator text). */
  prompt?: string
  /** The visitor's own name, displayed on the glass. */
  name?: string
  chips: string[]
  change?: string
  imageUrl?: string
  lettering: 'nameplate' | 'painted'
  picture: StudioPictureType
  revisionsLeft: number
  holdEndsAt?: number
  /** False when the experience skips the name step. */
  askName: boolean
  /** On-glass text resolved by Main for this language (operator edits or versioned defaults). */
  text: StudioScreenView
}
export type StudioScreenView = Record<Exclude<StudioScreenKey, 'captions'>, string> & { captions: string[] }
function parseScreenView(value: unknown): value is StudioScreenView {
  return record(value) && exact(value, [...STUDIO_SCREEN_KEYS]) && STUDIO_SCREEN_KEYS.every(key => key === 'captions'
    ? Array.isArray(value.captions) && value.captions.length >= 1 && value.captions.length <= 6 && value.captions.every(line => studioText(line, STUDIO_SCREEN_MAX))
    : studioText(value[key], 80))
}

export function parseStudioView(value: unknown): StudioView | null {
  if (!record(value) || !['name', 'confirm', 'question', 'painting', 'reveal', 'revising', 'keepsake'].includes(value.phase as string)
    || (value.language !== 'zh' && value.language !== 'en') || !Number.isInteger(value.questionCount) || !Number.isInteger(value.answered)
    || (value.questionCount as number) < 1 || (value.questionCount as number) > STUDIO_MAX_QUESTIONS
    || (value.answered as number) < 0 || (value.answered as number) > (value.questionCount as number)
    || !Array.isArray(value.chips) || value.chips.length > STUDIO_MAX_QUESTIONS || !value.chips.every(chip => studioText(chip, 80))
    || (value.lettering !== 'nameplate' && value.lettering !== 'painted') || !STUDIO_PICTURE_TYPES.includes(value.picture as StudioPictureType)
    || !Number.isInteger(value.revisionsLeft) || (value.revisionsLeft as number) < 0 || (value.revisionsLeft as number) > 3
    || typeof value.askName !== 'boolean' || !parseScreenView(value.text)) return null
  const allowed = ['phase', 'language', 'questionCount', 'answered', 'prompt', 'name', 'chips', 'change', 'imageUrl', 'lettering', 'picture', 'revisionsLeft', 'holdEndsAt', 'askName', 'text']
  if (!Object.keys(value).every(key => allowed.includes(key))) return null
  if ('prompt' in value && !studioText(value.prompt, STUDIO_QUESTION_MAX, false, true)) return null
  if ('name' in value && !studioText(value.name, 40)) return null
  if ('change' in value && !studioText(value.change, 120)) return null
  if ('imageUrl' in value && (typeof value.imageUrl !== 'string' || !/^magic-mirror-media:\/\/studio\/[a-z0-9-]{8,64}$/.test(value.imageUrl))) return null
  if ('holdEndsAt' in value && (!Number.isSafeInteger(value.holdEndsAt) || (value.holdEndsAt as number) <= 0)) return null
  return structuredClone(value) as unknown as StudioView
}

/** Main-issued, run-specific speech/timeout token. No identity/profile data. */
export interface StudioStep {
  id: string
  phase: StudioPhase
  speech: string
  guidance: string
  language: StudioLanguage
  comment?: string
  silent?: boolean
  final?: boolean
}
const validStepId = (value: unknown): value is string => typeof value === 'string' && /^studio-[a-z0-9-]{8,90}$/.test(value)
function parseStudioStep(value: unknown): value is StudioStep {
  return record(value) && validStepId(value.id) && ['name', 'confirm', 'question', 'painting', 'revising', 'reveal', 'keepsake'].includes(value.phase as string)
    && studioText(value.speech, 1600, false, true) && studioText(value.guidance, 2000, false, true) && (value.language === 'zh' || value.language === 'en')
    && Object.keys(value).every(k => ['id', 'phase', 'speech', 'guidance', 'language', 'comment', 'silent', 'final'].includes(k))
    && (!('comment' in value) || studioText(value.comment, STUDIO_ANSWER_MAX))
    && (!('silent' in value) || typeof value.silent === 'boolean') && (!('final' in value) || typeof value.final === 'boolean')
}
export type StudioSessionEvent =
  /** `firstStep`: Main's guidance for the first step (name question or question 1), asked after the start script. */
  | { event: 'enter'; startScript: string; firstStep: string; language: StudioLanguage; step?: StudioStep }
  | { event: 'step'; step: StudioStep }
  | { event: 'ready'; imageUrl: string; revision: number; revisionsLeft: number; language: StudioLanguage; step?: StudioStep }
  | { event: 'failed'; code: StudioImageFailure; line: string; keepPortrait: boolean }
  | { event: 'keepsake_done'; afterPortrait: 'continue' | 'farewell' }
  | { event: 'closed'; reason: string }

/** The Realtime session a studio event belongs to; a replaced session ignores it. */
export interface StudioEventIdentity { realtimeSessionId: string; sessionGeneration: number }
export function parseStudioEventIdentity(value: unknown): StudioEventIdentity | null {
  return record(value) && exact(value, ['realtimeSessionId', 'sessionGeneration']) && studioText(value.realtimeSessionId, 256)
    && Number.isSafeInteger(value.sessionGeneration) && (value.sessionGeneration as number) > 0
    ? { realtimeSessionId: value.realtimeSessionId, sessionGeneration: value.sessionGeneration as number } : null
}

export function parseStudioSessionEvent(value: unknown): StudioSessionEvent | null {
  if (!record(value)) return null
  switch (value.event) {
    case 'step': return exact(value, ['event', 'step']) && parseStudioStep(value.step) ? { event: 'step', step: structuredClone(value.step) } : null
    // Same rule as the saved start script, which may span lines.
    case 'enter': return (exact(value, ['event', 'startScript', 'firstStep', 'language']) || exact(value, ['event', 'startScript', 'firstStep', 'language', 'step']) && parseStudioStep(value.step)) && studioText(value.startScript, 500, false, true)
      && studioText(value.firstStep, 2000, true, true) && (value.language === 'zh' || value.language === 'en')
      ? { event: 'enter', startScript: value.startScript, firstStep: value.firstStep, language: value.language, ...(parseStudioStep(value.step) ? { step: structuredClone(value.step) } : {}) } : null
    case 'ready': return (exact(value, ['event', 'imageUrl', 'revision', 'revisionsLeft', 'language']) || exact(value, ['event', 'imageUrl', 'revision', 'revisionsLeft', 'language', 'step']) && parseStudioStep(value.step)) && typeof value.imageUrl === 'string'
      && /^magic-mirror-media:\/\/studio\/[a-z0-9-]{8,64}$/.test(value.imageUrl) && Number.isInteger(value.revision) && (value.revision as number) >= 0
      && Number.isInteger(value.revisionsLeft) && (value.revisionsLeft as number) >= 0 && (value.language === 'zh' || value.language === 'en')
      ? { event: 'ready', imageUrl: value.imageUrl, revision: value.revision as number, revisionsLeft: value.revisionsLeft as number, language: value.language, ...(parseStudioStep(value.step) ? { step: structuredClone(value.step) } : {}) } : null
    case 'failed': return exact(value, ['event', 'code', 'line', 'keepPortrait']) && typeof value.code === 'string' && /^studio_[a-z_]{1,40}$/.test(value.code)
      && studioText(value.line, 500) && typeof value.keepPortrait === 'boolean'
      ? { event: 'failed', code: value.code as StudioImageFailure, line: value.line, keepPortrait: value.keepPortrait } : null
    case 'keepsake_done': return exact(value, ['event', 'afterPortrait']) && (value.afterPortrait === 'continue' || value.afterPortrait === 'farewell')
      ? { event: 'keepsake_done', afterPortrait: value.afterPortrait } : null
    case 'closed': return exact(value, ['event', 'reason']) && typeof value.reason === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.reason)
      ? { event: 'closed', reason: value.reason } : null
    default: return null
  }
}

// ---------- Channels and Console contracts ----------

export const STUDIO_MIRROR_CHANNEL = 'mirror:studio'
export const STUDIO_CONSOLE_CHANNEL = 'console:studio'
export type StudioAuthStatus = 'signed_in' | 'missing' | 'invalid' | 'expired' | 'refresh_failed'
export type StudioConsoleCommand = { action: 'status' } | { action: 'start' } | { action: 'exit' } | { action: 'test' } | { action: 'mode'; mode: MirrorMode }
  | { action: 'match_name'; name: string; guests: GuestListSettings }
export interface StudioConsoleStatus {
  imageSkillEnabled?: boolean
  auth: StudioAuthStatus
  lastRefresh?: string
  modelId: string
  active: boolean
  phase?: StudioPhase
  /** The Mirror's explicit switch. */
  mirrorMode: MirrorMode
  /** The active avatar's studio wake phrase (what visitors say in Interactive Studio mode). */
  wakePhrase?: string
}
export interface StudioConsoleResult {
  status: StudioConsoleStatus
  action?: { status: StudioOutcome; code: string }
  /** Test portrait for the Console only; never saved. */
  test?: { ok: boolean; code?: string; elapsedMs: number; dataUrl?: string }
  nameMatches?: string[]
}

export function parseStudioConsoleCommand(value: unknown): StudioConsoleCommand | null {
  if (record(value) && value.action === 'match_name') {
    const guests = parseGuestSettings(value.guests)
    return exact(value, ['action', 'name', 'guests']) && validGuestName(value.name) && guests
      ? { action: 'match_name', name: value.name, guests } : null
  }
  if (record(value) && value.action === 'mode') return exact(value, ['action', 'mode']) && (value.mode === 'conversation' || value.mode === 'studio')
    ? { action: 'mode', mode: value.mode } : null
  return record(value) && exact(value, ['action']) && ['status', 'start', 'exit', 'test'].includes(value.action as string)
    ? { action: value.action as Exclude<StudioConsoleCommand['action'], 'mode' | 'match_name'> } : null
}
