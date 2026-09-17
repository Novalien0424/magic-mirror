import { REALTIME_PROMPTS, renderPrompt } from './realtime-prompts'
import { resolveRealtimeTools, realtimeToolInstructions } from './realtime-tools'
import { avatarCatalogFor, type AvatarProfile } from './avatar-profiles'
import { DEFAULT_PRESENTATION } from './presentation'
import type { MirrorConfig } from './types'
import { LEGACY_SLEEP_PHRASE, validSpokenPhrase } from './avatar-commands'

/** Public, operator-authored character configuration, never visitor context. */
export interface AvatarSessionSettings {
  readonly name: string
  readonly personality: string
  readonly speakingStyle: string
  readonly wakeGreeting: string
  readonly sleepFarewell: string
  readonly wakePhrase?: string
  readonly sleepPhrase?: string
  readonly spellPhrases?: readonly string[]
}

export function avatarSessionSettings(config: MirrorConfig): Readonly<AvatarSessionSettings> {
  const catalog = avatarCatalogFor(config)
  const avatar = catalog.avatars.find(item => item.id === catalog.activeAvatarId)!
  return avatarProfileSessionSettings(avatar, config.wake.phrase)
}

export function avatarProfileSessionSettings(avatar: AvatarProfile, wakePhrase: string): Readonly<AvatarSessionSettings> {
  return Object.freeze({ name: avatar.name, personality: avatar.personality,
    speakingStyle: avatar.speakingStyle, wakeGreeting: avatar.presentation.wakeGreeting ?? DEFAULT_PRESENTATION.wakeGreeting!,
    sleepFarewell: avatar.presentation.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell!,
    wakePhrase: avatar.wakePhrase ?? wakePhrase,
    sleepPhrase: avatar.sleepPhrase ?? LEGACY_SLEEP_PHRASE,
    spellPhrases: Object.freeze(avatar.spells.filter(s => s.enabled).map(s => s.phrase)) })
}

export function parseAvatarSessionSettings(value: unknown): AvatarSessionSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const limits = { name: 80, personality: 12000, speakingStyle: 2000, wakeGreeting: 500, sleepFarewell: 500 }
  const optional = ['wakePhrase', 'sleepPhrase', 'spellPhrases'].filter(key => key in record)
  if (Object.keys(record).length !== Object.keys(limits).length + optional.length) return null
  for (const key of ['wakePhrase', 'sleepPhrase']) if (key in record && !validSpokenPhrase(record[key])) return null
  if ('spellPhrases' in record && (!Array.isArray(record.spellPhrases) || record.spellPhrases.length > 128
    || !record.spellPhrases.every(value => typeof value === 'string' && value.length > 0 && value.length <= 500))) return null
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof record[key] !== 'string' || record[key].length > limit
      || (key !== 'speakingStyle' && key !== 'wakeGreeting' && !record[key].trim())) return null
  }
  return Object.freeze({ name: record.name, personality: record.personality,
    speakingStyle: record.speakingStyle, wakeGreeting: record.wakeGreeting,
    sleepFarewell: record.sleepFarewell,
    ...('wakePhrase' in record ? { wakePhrase: record.wakePhrase } : {}),
    ...('sleepPhrase' in record ? { sleepPhrase: record.sleepPhrase } : {}),
    ...('spellPhrases' in record ? { spellPhrases: Object.freeze([...(record.spellPhrases as string[])]) } : {}),
  }) as AvatarSessionSettings
}

export function buildSleepToolDescription(phrase: string): string {
  return resolveRealtimeTools(phrase).find(spec => spec.name === 'return_to_dormant')?.description ?? ''
}
export const SLEEP_TOOL_DESCRIPTION = buildSleepToolDescription(LEGACY_SLEEP_PHRASE)

/** The exact application-controlled system instructions used by Realtime. */
export function buildAvatarPrompt(avatar: AvatarSessionSettings): string {
  return renderPrompt('session', { name: avatar.name, personality: avatar.personality,
    speakingStyle: avatar.speakingStyle || REALTIME_PROMPTS.defaults.speakingStyle,
    toolInstructions: realtimeToolInstructions(resolveRealtimeTools(avatar.sleepPhrase ?? LEGACY_SLEEP_PHRASE)) })
}
