import type { AvatarProfile } from './avatar-profiles'
import { buildAvatarPrompt, buildStudioPrompt, avatarProfileSessionSettings, avatarRealtimeTools, studioToolSpecs } from './avatar-prompt'
import { REALTIME_TOOLS, REALTIME_TOOL_SOURCE, realtimeToolDefinition } from './realtime-tools'
import { PORTRAIT_STUDIO, PORTRAIT_STUDIO_SOURCE, studioPrompt } from './portrait-studio-config'
import { defaultExperience, STUDIO_PROMPT_INFO, STUDIO_PROMPT_STAGES } from './portrait-studio'
import { buildPortraitPrompt, buildRevisionPrompt, STUDIO_SAMPLE_ANSWERS } from './studio-image-prompt'
import { DEFAULT_WAKE_PHRASE } from './avatar-commands'
import { REALTIME_PROMPTS as prompts, REALTIME_PROMPT_SOURCE, buildAuditionPrompt, buildSpeechResponse, buildMemoryQuestion, buildMemoryState, buildMemoryAcknowledgment } from './realtime-prompts'
import type { SceneActionDefinition } from './types'

export const PROMPT_TABS = ['Session', 'Speech', 'Tools & input', 'Audition', 'Sources'] as const
export type PromptTab = typeof PROMPT_TABS[number]
export interface PromptSection { title: string; source: string; content: string }
export interface PromptInspection {
  name: string
  pages: Record<PromptTab, PromptSection[]>
}
const json = (value: unknown): string => JSON.stringify(value, null, 2)

export function inspectAvatarPrompts(avatar: AvatarProfile, actions: readonly SceneActionDefinition[], wakePhrase = DEFAULT_WAKE_PHRASE): PromptInspection {
  const settings = avatarProfileSessionSettings(avatar, wakePhrase)
  const profileSource = `avatarCatalog.avatars[${avatar.id}]`
  const tools = [...avatarRealtimeTools(settings), ...studioToolSpecs(settings).filter(spec => spec.availability === 'studio')]
  const section = (title: string, content: string, source = REALTIME_PROMPT_SOURCE): PromptSection => ({ title, source, content })
  const speech = (title: string, text: string, source: string): PromptSection => section(title,
    text ? json(buildSpeechResponse(text, settings.speakingStyle)) : 'Disabled · silent wake; no request sent.', `${REALTIME_PROMPT_SOURCE}#performance + ${source}`)
  return { name: avatar.name, pages: {
    Session: [section('Session instructions · system', buildAvatarPrompt(settings), `${REALTIME_PROMPT_SOURCE}#session + ${profileSource}`),
      section('Interactive Studio agent instructions · system (after updateAgent)', buildStudioPrompt(settings), `${PORTRAIT_STUDIO_SOURCE}#agent + ${REALTIME_PROMPT_SOURCE}#session + ${profileSource}.experience`),
      ...STUDIO_PROMPT_STAGES.filter(stage => stage !== 'instructions').map(stage => {
        const studio = (avatar.experience ?? defaultExperience()).studio
        const edited = studio.prompts?.[stage] !== undefined
        return section(`Interactive Studio stage · ${STUDIO_PROMPT_INFO[stage].label}`, studioPrompt(studio, stage),
          edited ? `${profileSource}.experience.studio.prompts.${stage}` : `${PORTRAIT_STUDIO_SOURCE} (default)`)
      }),
      ...studioImagePrompts(avatar, profileSource),
      section('Confirmed memory state · synthetic empty brief', buildMemoryState({ status: 'accepted', code: 'memory_identity_confirmed', mode: 'automatic', entries: [] }), `${REALTIME_PROMPT_SOURCE}#memoryState`)],
    Speech: [speech('Wake greeting · response.create', settings.wakeGreeting, `${profileSource}.presentation.wakeGreeting`),
      speech('Sleep farewell · response.create', settings.sleepFarewell, `${profileSource}.presentation.sleepFarewell`),
      speech('Spell announcement · response.create', prompts.spellAnnouncement, `${REALTIME_PROMPT_SOURCE}#spellAnnouncement`),
      speech('Spell retry · response.create', prompts.spellRetry, `${REALTIME_PROMPT_SOURCE}#spellRetry`),
      ...actions.filter(a => a.kind === 'avatar_dialogue').map(a => speech(`Scene dialogue · ${a.name} (${a.id})`, a.text, `sceneActions[${a.id}].text`)),
      speech('Identity question · synthetic name', buildMemoryQuestion('Example Visitor'), `${REALTIME_PROMPT_SOURCE}#memoryQuestion`),
      section('Confirmation reply · synthetic automatic policy', json(buildMemoryAcknowledgment({ status: 'accepted', code: 'memory_identity_confirmed', mode: 'automatic' }, settings.speakingStyle)), `${REALTIME_PROMPT_SOURCE}#memoryAcknowledgments`)],
    'Tools & input': [...tools.flatMap(spec => [
      section(`${spec.name} · tool definition`, json(realtimeToolDefinition(spec)), `${REALTIME_TOOL_SOURCE} + ${profileSource}.sleepPhrase`),
      section(`${spec.name} · structured results`, json(spec.results), REALTIME_TOOL_SOURCE),
      section(`${spec.name} · execution policy`, json({ handler: spec.handler, availability: spec.availability, routing: spec.routing,
        completion: spec.completion, rules: spec.rules }), REALTIME_TOOL_SOURCE)]),
      section('Application exact-match routes · spells', json(avatar.spells), `${profileSource}.spells · application matcher; not model tools`),
      section('Application opening-phrase route · online media search', json({ cloudSearchPhrase: settings.cloudSearchPhrase }), `${profileSource}.cloudSearchPhrase · application matcher; not model-visible`),
      section('Input transcription hints · not conversational instructions', json({ ...prompts.transcription,
        keywords: [...new Set([settings.wakePhrase, settings.sleepPhrase, settings.cloudSearchPhrase, ...settings.spellPhrases!])] }), `${REALTIME_PROMPT_SOURCE}#transcription + ${profileSource}`),
      section('Visitor language hints · system items', json(prompts.languageHints), `${REALTIME_PROMPT_SOURCE}#languageHints`),
      section('User messages', 'Visitor microphone audio is the user input. The application inserts no user-role prompt for greeting, farewell, scenes or audition. Visitor content remains in memory and is not recorded by this inspector.', 'Live microphone')],
    Audition: [section('Audition session instructions · system', buildAuditionPrompt(settings.speakingStyle), `${REALTIME_PROMPT_SOURCE}#audition + ${profileSource}.speakingStyle`),
      speech('Audition speech · response.create', prompts.auditionText, `${REALTIME_PROMPT_SOURCE}#auditionText`),
      section('Audition tools and input', json({ tools: [], input: { turnDetection: null, transcription: null } }), 'src/renderer/realtime/realtime-session-adapter.ts')],
    Sources: [section(`Loaded catalog · ${prompts.version}`, json(prompts)),
      section(`Loaded tool catalog · ${REALTIME_TOOLS.version}`, json(REALTIME_TOOLS), REALTIME_TOOL_SOURCE),
      section(`Loaded Interactive Studio config · ${PORTRAIT_STUDIO.version}`, json(PORTRAIT_STUDIO), PORTRAIT_STUDIO_SOURCE),
      section('Avatar variables', json(settings), profileSource)],
  } }
}

/** The image prompts Main would send, with sample answers instead of visitor data. */
function studioImagePrompts(avatar: AvatarProfile, profileSource: string): PromptSection[] {
  const studio = (avatar.experience ?? defaultExperience()).studio
  const name = studio.askName === false ? '' : 'Raven'
  const answers = studio.questions.map((question, index) => ({ slot: question.slot, imageLine: question.imageLine,
    answer: STUDIO_SAMPLE_ANSWERS[index % STUDIO_SAMPLE_ANSWERS.length]! }))
  const source = `${PORTRAIT_STUDIO_SOURCE}#imagePrompt + ${profileSource}.experience.studio`
  return [
    { title: 'Interactive Studio image prompt · first picture (sample answers)', source, content: buildPortraitPrompt({ studio, answers, name }) },
    { title: 'Interactive Studio image prompt · change (sample request)', source, content: buildRevisionPrompt({ studio, change: 'make the sky snowy', name }) },
  ]
}
