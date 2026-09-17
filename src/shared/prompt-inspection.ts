import type { AvatarProfile } from './avatar-profiles'
import { buildAvatarPrompt, avatarProfileSessionSettings } from './avatar-prompt'
import { REALTIME_TOOLS, REALTIME_TOOL_SOURCE, resolveRealtimeTools, realtimeToolDefinition } from './realtime-tools'
import { DEFAULT_WAKE_PHRASE } from './avatar-commands'
import { REALTIME_PROMPTS as prompts, REALTIME_PROMPT_SOURCE, buildAuditionPrompt, buildSpeechResponse } from './realtime-prompts'
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
  const tools = resolveRealtimeTools(settings.sleepPhrase!)
  const section = (title: string, content: string, source = REALTIME_PROMPT_SOURCE): PromptSection => ({ title, source, content })
  const speech = (title: string, text: string, source: string): PromptSection => section(title,
    text ? json(buildSpeechResponse(text, settings.speakingStyle)) : 'Disabled · silent wake; no request sent.', `${REALTIME_PROMPT_SOURCE}#performance + ${source}`)
  return { name: avatar.name, pages: {
    Session: [section('Session instructions · system', buildAvatarPrompt(settings), `${REALTIME_PROMPT_SOURCE}#session + ${profileSource}`)],
    Speech: [speech('Wake greeting · response.create', settings.wakeGreeting, `${profileSource}.presentation.wakeGreeting`),
      speech('Sleep farewell · response.create', settings.sleepFarewell, `${profileSource}.presentation.sleepFarewell`),
      speech('Spell announcement · response.create', prompts.spellAnnouncement, `${REALTIME_PROMPT_SOURCE}#spellAnnouncement`),
      ...actions.filter(a => a.kind === 'avatar_dialogue').map(a => speech(`Scene dialogue · ${a.name} (${a.id})`, a.text, `sceneActions[${a.id}].text`))],
    'Tools & input': [...tools.flatMap(spec => [
      section(`${spec.name} · tool definition`, json(realtimeToolDefinition(spec)), `${REALTIME_TOOL_SOURCE} + ${profileSource}.sleepPhrase`),
      section(`${spec.name} · structured results`, json(spec.results), REALTIME_TOOL_SOURCE),
      section(`${spec.name} · execution policy`, json({ handler: spec.handler, availability: spec.availability, routing: spec.routing,
        completion: spec.completion, rules: spec.rules }), REALTIME_TOOL_SOURCE)]),
      section('Application exact-match routes · spells', json(avatar.spells), `${profileSource}.spells · application matcher; not model tools`),
      section('Input transcription hints · not conversational instructions', json({ ...prompts.transcription,
        keywords: [...new Set([settings.wakePhrase, settings.sleepPhrase, ...settings.spellPhrases!])] }), `${REALTIME_PROMPT_SOURCE}#transcription + ${profileSource}`),
      section('User messages', 'Visitor microphone audio is the user input. The application inserts no user-role prompt for greeting, farewell, scenes or audition. Visitor content remains in memory and is not recorded by this inspector.', 'Live microphone')],
    Audition: [section('Audition session instructions · system', buildAuditionPrompt(settings.speakingStyle), `${REALTIME_PROMPT_SOURCE}#audition + ${profileSource}.speakingStyle`),
      speech('Audition speech · response.create', prompts.auditionText, `${REALTIME_PROMPT_SOURCE}#auditionText`),
      section('Audition tools and input', json({ tools: [], input: { turnDetection: null, transcription: null } }), 'src/renderer/realtime/realtime-session-adapter.ts')],
    Sources: [section(`Loaded catalog · ${prompts.version}`, json(prompts)),
      section(`Loaded tool catalog · ${REALTIME_TOOLS.version}`, json(REALTIME_TOOLS), REALTIME_TOOL_SOURCE),
      section('Avatar variables', json(settings), profileSource)],
  } }
}
