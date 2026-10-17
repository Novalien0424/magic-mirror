/** Portrait Studio contracts. Dependency-free: also used by the sandboxed preloads. */

export type ExperienceMode = 'conversation' | 'portrait_studio'
export type StudioSlot = 'subject' | 'setting' | 'mood' | 'palette' | 'companion' | 'style' | 'detail'
export type StudioQuality = 'low' | 'medium' | 'high'
export type StudioLanguage = 'zh' | 'en'
export type GuestMatchMode = 'off' | 'prefer' | 'only'
export const STUDIO_SLOTS: readonly StudioSlot[] = Object.freeze(['subject', 'setting', 'mood', 'palette', 'companion', 'style', 'detail'])
export const STUDIO_MAX_QUESTIONS = 8
export const STUDIO_MAX_GUESTS = 1000

export interface StudioQuestion { id: string; zh: string; en: string; slot: StudioSlot }

/** What the avatar is told at each studio stage, in visit order. Operators may override any of them per avatar. */
export const STUDIO_PROMPT_STAGES = Object.freeze(['instructions', 'askName', 'confirmName', 'chooseGuest', 'guestOnly', 'askQuestion',
  'painting', 'reveal', 'revealBlind', 'offerChange', 'repainting', 'noChangesLeft', 'finalVersion', 'finished', 'exited'] as const)
export type StudioPromptStage = typeof STUDIO_PROMPT_STAGES[number]
/** Placeholders each stage supports: required ones must stay in the text; any other placeholder is rejected. */
export const STUDIO_PROMPT_PLACEHOLDERS: Readonly<Record<StudioPromptStage, { required: readonly string[]; optional: readonly string[] }>> = Object.freeze({
  instructions: { required: [], optional: [] }, askName: { required: ['question'], optional: [] },
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
  instructions: { label: 'Studio instructions', when: 'Always in effect while the studio is open: how the avatar runs the studio.' },
  askName: { label: 'Ask the name', when: 'Right after the studio opens.' },
  confirmName: { label: 'Read the name back', when: 'After the visitor says a name, before it is confirmed.' },
  chooseGuest: { label: 'Guest list: close matches', when: 'When the guest list has names close to what the visitor said.' },
  guestOnly: { label: 'Guest list: no match', when: 'When only listed guests may take part and no listed name matches.' },
  askQuestion: { label: 'Each question', when: 'Before every portrait question, in order.' },
  painting: { label: 'Painting starts', when: 'After the last answer, while the first portrait is painted.' },
  reveal: { label: 'Reveal', when: 'When the portrait appears on the mirror and the avatar can see it.' },
  revealBlind: { label: 'Reveal without the image', when: 'When the portrait appears but its image could not be shown to the avatar.' },
  offerChange: { label: 'Offer a change', when: 'Added to the reveal while the visitor may still ask for a change.' },
  repainting: { label: 'Repainting', when: 'After the visitor asks for a change.' },
  noChangesLeft: { label: 'No changes left', when: 'When the visitor asks for another change after the last allowed one.' },
  finalVersion: { label: 'Final version', when: 'Added to the reveal when no more changes are allowed.' },
  finished: { label: 'Goodbye', when: 'When the visitor is happy; the portrait stays on the mirror for photos.' },
  exited: { label: 'Studio closed', when: 'When the visitor stops the studio to keep chatting.' },
})
export const STUDIO_PLACEHOLDER_INFO: Readonly<Record<string, string>> = Object.freeze({
  question: 'the question text', name: 'the name the avatar heard', candidates: 'up to three matching guest names',
  index: 'the question number', count: 'the number of questions', followUp: 'the Offer a change or Final version prompt',
  language: "the visitor's language",
})
/** Per-avatar overrides; a stage without one uses the versioned default. */
export type StudioPrompts = Partial<Record<StudioPromptStage, string>>

/** Operator-facing problem with a stage prompt, or '' when it is valid. */
export function studioPromptIssue(stage: StudioPromptStage, text: unknown): string {
  const max = stage === 'instructions' ? STUDIO_PROMPT_MAX.instructions : STUDIO_PROMPT_MAX.other
  if (typeof text !== 'string' || !text.trim()) return 'Enter what the avatar is told at this stage, or reset it to the default.'
  if (text.length > max) return `Use ${max} characters or fewer (now ${text.length}).`
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(text)) return 'Remove tabs and other control characters.'
  const { required, optional } = STUDIO_PROMPT_PLACEHOLDERS[stage]
  const used = [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]!))]
  const unknown = used.filter(name => !required.includes(name) && !optional.includes(name))
  if (unknown.length) return `Remove ${unknown.map(name => `{{${name}}}`).join(', ')}: this stage ${required.length + optional.length
    ? `supports only ${[...required, ...optional].map(name => `{{${name}}}`).join(', ')}` : 'has no placeholders'}.`
  const missing = required.filter(name => !used.includes(name))
  if (missing.length) return `Keep ${missing.map(name => `{{${name}}}`).join(' and ')}; the avatar needs ${missing.length === 1 ? 'it' : 'them'} at this stage.`
  return ''
}

export interface StudioSettings {
  startScript: string
  nameQuestion: { zh: string; en: string }
  questions: StudioQuestion[]
  artStyle: string
  nameLettering: 'nameplate' | 'painted'
  quality: StudioQuality
  revisionsAllowed: number
  holdSeconds: number
  prompts: StudioPrompts
}
/** Operator-entered event guests. Stays in Main; never sent to renderers or the model as a list. */
export interface GuestListSettings { names: string[]; match: GuestMatchMode }
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
    startScript: '我在。今天想讓我為你畫一幅畫像嗎？回答我幾個小問題就好。',
    nameQuestion: { zh: '先告訴我，畫上要寫什麼名字？', en: 'First, what name should I write on the portrait?' },
    questions: [
      { id: 'q1', zh: '如果你能變成一種動物或幻想生物，會是什麼？', en: 'If you could become any animal or creature, what would it be?', slot: 'subject' },
      { id: 'q2', zh: '你最想待在哪裡？真實或想像的地方都可以。', en: 'Where would you most like to be, real or imagined?', slot: 'setting' },
      { id: 'q3', zh: '用一種天氣形容你現在的心情。', en: 'Describe your mood right now as a kind of weather.', slot: 'mood' },
      { id: 'q4', zh: '挑一個代表你的顏色。', en: 'Pick a colour that feels like you.', slot: 'palette' },
    ],
    artStyle: 'Ink-and-watercolour storybook illustration, raven-feather motifs, moonlit night palette, soft painterly light.',
    nameLettering: 'nameplate',
    quality: 'medium',
    revisionsAllowed: 1,
    holdSeconds: 45,
    prompts: {},
  },
  guests: { names: [], match: 'prefer' },
} satisfies AvatarExperience)

export function defaultExperience(): AvatarExperience { return structuredClone(DEFAULT_EXPERIENCE) as AvatarExperience }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const control = /[\u0000-\u001f\u007f]/u
const controlExceptNewline = /[\u0000-\u0009\u000b-\u001f\u007f]/u
export function studioText(value: unknown, max: number, allowEmpty = false, multiline = false): value is string {
  return typeof value === 'string' && value.length <= max && !(multiline ? controlExceptNewline : control).test(value) && (allowEmpty || value.trim().length > 0)
}
export function validGuestName(value: unknown): value is string { return studioText(value, 40) && value.trim() === value }

function parseStudioPrompts(value: unknown): StudioPrompts | null {
  if (!record(value)) return null
  for (const [stage, text] of Object.entries(value)) {
    if (!STUDIO_PROMPT_STAGES.includes(stage as StudioPromptStage) || studioPromptIssue(stage as StudioPromptStage, text)) return null
  }
  return structuredClone(value) as StudioPrompts
}

function parseStudioSettings(input: unknown): StudioSettings | null {
  // Settings saved before stage prompts existed use every default.
  const value = record(input) && !Object.hasOwn(input, 'prompts') ? { ...input, prompts: {} } : input
  if (!record(value) || !exact(value, ['startScript', 'nameQuestion', 'questions', 'artStyle', 'nameLettering', 'quality', 'revisionsAllowed', 'holdSeconds', 'prompts'])
    || !parseStudioPrompts(value.prompts)) return null
  const name = value.nameQuestion
  if (!studioText(value.startScript, 500, false, true) || !record(name) || !exact(name, ['zh', 'en']) || !studioText(name.zh, 200) || !studioText(name.en, 200)
    || !Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > STUDIO_MAX_QUESTIONS
    || !studioText(value.artStyle, 600, false, true) || (value.nameLettering !== 'nameplate' && value.nameLettering !== 'painted')
    || !['low', 'medium', 'high'].includes(value.quality as string)
    || !Number.isInteger(value.revisionsAllowed) || (value.revisionsAllowed as number) < 0 || (value.revisionsAllowed as number) > 3
    || !Number.isInteger(value.holdSeconds) || (value.holdSeconds as number) < 10 || (value.holdSeconds as number) > 300) return null
  const ids = new Set<string>()
  for (const question of value.questions) {
    if (!record(question) || !exact(question, ['id', 'zh', 'en', 'slot']) || typeof question.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(question.id)
      || ids.has(question.id) || !studioText(question.zh, 200) || !studioText(question.en, 200) || !STUDIO_SLOTS.includes(question.slot as StudioSlot)) return null
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
    || !record(guests) || !exact(guests, ['names', 'match']) || !['off', 'prefer', 'only'].includes(guests.match as string)
    || !Array.isArray(guests.names) || guests.names.length > STUDIO_MAX_GUESTS || !guests.names.every(validGuestName)) return null
  return { ...structuredClone(value), studio } as unknown as AvatarExperience
}

export function sessionExperience(experience: AvatarExperience): SessionExperience {
  return { defaultMode: experience.defaultMode, visitorMayRequest: experience.visitorMayRequest, afterPortrait: experience.afterPortrait,
    studio: structuredClone(experience.studio), guestMatch: experience.guests.names.length ? experience.guests.match : 'off' }
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
  | { action: 'answer'; question: number; answer: string; language: StudioLanguage }
  | { action: 'revise'; change: string }
  | { action: 'finish' }
  | { action: 'exit' }

export function parseStudioRequest(value: unknown): StudioRequest | null {
  if (!record(value)) return null
  switch (value.action) {
    case 'start': return exact(value, ['action', 'source']) && value.source === 'visitor' ? { action: 'start', source: value.source } : null
    case 'set_name': return exact(value, ['action', 'name', 'confirmed', 'language']) && studioText(value.name, 40) && typeof value.confirmed === 'boolean'
      && (value.language === 'zh' || value.language === 'en')
      ? { action: 'set_name', name: value.name, confirmed: value.confirmed, language: value.language } : null
    case 'answer': return exact(value, ['action', 'question', 'answer', 'language']) && Number.isInteger(value.question)
      && (value.question as number) >= 1 && (value.question as number) <= STUDIO_MAX_QUESTIONS && studioText(value.answer, 80)
      && (value.language === 'zh' || value.language === 'en')
      ? { action: 'answer', question: value.question as number, answer: value.answer, language: value.language } : null
    case 'revise': return exact(value, ['action', 'change']) && studioText(value.change, 120) ? { action: 'revise', change: value.change } : null
    case 'finish': case 'exit': return exact(value, ['action']) ? { action: value.action } : null
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
}

export function parseStudioReply(value: unknown): StudioReply | null {
  if (!record(value) || !['accepted', 'ignored', 'rejected', 'failed'].includes(value.status as string)
    || typeof value.code !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(value.code)) return null
  const keys = Object.keys(value)
  if (!keys.every(key => ['status', 'code', 'next', 'candidates'].includes(key))) return null
  if ('next' in value && !studioText(value.next, 2000)) return null
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
  revisionsLeft: number
  holdEndsAt?: number
}

export function parseStudioView(value: unknown): StudioView | null {
  if (!record(value) || !['name', 'confirm', 'question', 'painting', 'reveal', 'revising', 'keepsake'].includes(value.phase as string)
    || (value.language !== 'zh' && value.language !== 'en') || !Number.isInteger(value.questionCount) || !Number.isInteger(value.answered)
    || (value.questionCount as number) < 1 || (value.questionCount as number) > STUDIO_MAX_QUESTIONS
    || (value.answered as number) < 0 || (value.answered as number) > (value.questionCount as number)
    || !Array.isArray(value.chips) || value.chips.length > STUDIO_MAX_QUESTIONS || !value.chips.every(chip => studioText(chip, 80))
    || (value.lettering !== 'nameplate' && value.lettering !== 'painted')
    || !Number.isInteger(value.revisionsLeft) || (value.revisionsLeft as number) < 0 || (value.revisionsLeft as number) > 3) return null
  const allowed = ['phase', 'language', 'questionCount', 'answered', 'prompt', 'name', 'chips', 'change', 'imageUrl', 'lettering', 'revisionsLeft', 'holdEndsAt']
  if (!Object.keys(value).every(key => allowed.includes(key))) return null
  if ('prompt' in value && !studioText(value.prompt, 200)) return null
  if ('name' in value && !studioText(value.name, 40)) return null
  if ('change' in value && !studioText(value.change, 120)) return null
  if ('imageUrl' in value && (typeof value.imageUrl !== 'string' || !/^magic-mirror-media:\/\/studio\/[a-z0-9-]{8,64}$/.test(value.imageUrl))) return null
  if ('holdEndsAt' in value && (!Number.isSafeInteger(value.holdEndsAt) || (value.holdEndsAt as number) <= 0)) return null
  return structuredClone(value) as unknown as StudioView
}

export type StudioSessionEvent =
  | { event: 'enter'; startScript: string }
  | { event: 'ready'; imageUrl: string; revision: number; revisionsLeft: number; language: StudioLanguage }
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
    // Same rule as the saved start script, which may span lines.
    case 'enter': return exact(value, ['event', 'startScript']) && studioText(value.startScript, 500, false, true) ? { event: 'enter', startScript: value.startScript } : null
    case 'ready': return exact(value, ['event', 'imageUrl', 'revision', 'revisionsLeft', 'language']) && typeof value.imageUrl === 'string'
      && /^magic-mirror-media:\/\/studio\/[a-z0-9-]{8,64}$/.test(value.imageUrl) && Number.isInteger(value.revision) && (value.revision as number) >= 0
      && Number.isInteger(value.revisionsLeft) && (value.revisionsLeft as number) >= 0 && (value.language === 'zh' || value.language === 'en')
      ? { event: 'ready', imageUrl: value.imageUrl, revision: value.revision as number, revisionsLeft: value.revisionsLeft as number, language: value.language } : null
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
export type StudioConsoleCommand = { action: 'status' } | { action: 'start' } | { action: 'exit' } | { action: 'test' }
export interface StudioConsoleStatus {
  auth: StudioAuthStatus
  lastRefresh?: string
  modelId: string
  active: boolean
  phase?: StudioPhase
}
export interface StudioConsoleResult {
  status: StudioConsoleStatus
  action?: { status: StudioOutcome; code: string }
  /** Test portrait for the Console only; never saved. */
  test?: { ok: boolean; code?: string; elapsedMs: number; dataUrl?: string }
}

export function parseStudioConsoleCommand(value: unknown): StudioConsoleCommand | null {
  return record(value) && exact(value, ['action']) && ['status', 'start', 'exit', 'test'].includes(value.action as string)
    ? { action: value.action as StudioConsoleCommand['action'] } : null
}
