import { REALTIME_PROMPTS } from './realtime-prompts'
import { parseRealtimeToolCatalog, resolveRealtimeTools, realtimeToolInstructions, REALTIME_TOOLS } from './realtime-tools'
import baseline from '../../resources/testing/raven-prompt-baseline.v1.json' with { type: 'json' }
import merged from '../../resources/testing/raven-merged-media.v1.json' with { type: 'json' }
import focused from '../../resources/testing/raven-focused.v1.json' with { type: 'json' }
import { avatarCatalogFor, type AvatarProfile } from './avatar-profiles'
import { DEFAULT_PRESENTATION } from './presentation'
import type { MirrorConfig } from './types'
import { DEFAULT_CLOUD_SEARCH_PHRASE, LEGACY_SLEEP_PHRASE, validSpokenPhrase } from './avatar-commands'
import { parseMediaSkill, type AvatarMediaSkill } from './media-skill'

/** Public, operator-authored character configuration, never visitor context. */
export interface AvatarSessionSettings {
  readonly qaPromptVariant?: 'baseline' | 'trimmed' | 'merged' | 'focused'
  readonly name: string
  readonly personality: string
  readonly speakingStyle: string
  readonly wakeGreeting: string
  readonly sleepFarewell: string
  readonly wakePhrase?: string
  readonly sleepPhrase?: string
  readonly cloudSearchPhrase?: string
  readonly spellPhrases?: readonly string[]
  readonly mediaSkill?: AvatarMediaSkill
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
    cloudSearchPhrase: avatar.cloudSearchPhrase ?? DEFAULT_CLOUD_SEARCH_PHRASE,
    spellPhrases: Object.freeze(avatar.spells.filter(s => s.enabled).map(s => s.phrase)),
    ...(avatar.mediaSkill ? { mediaSkill: structuredClone(avatar.mediaSkill) } : {}) })
}

export function parseAvatarSessionSettings(value: unknown): AvatarSessionSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const limits = { name: 80, personality: 12000, speakingStyle: 2000, wakeGreeting: 500, sleepFarewell: 500 }
  const optional = ['wakePhrase', 'sleepPhrase', 'cloudSearchPhrase', 'spellPhrases', 'mediaSkill', 'qaPromptVariant'].filter(key => key in record)
  if ('qaPromptVariant' in record && !['baseline', 'trimmed', 'merged', 'focused'].includes(record.qaPromptVariant as string)) return null
  if ('mediaSkill' in record && !parseMediaSkill(record.mediaSkill)) return null
  if (Object.keys(record).length !== Object.keys(limits).length + optional.length) return null
  for (const key of ['wakePhrase', 'sleepPhrase', 'cloudSearchPhrase']) if (key in record && !validSpokenPhrase(record[key])) return null
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
    ...('cloudSearchPhrase' in record ? { cloudSearchPhrase: record.cloudSearchPhrase } : {}),
    ...('spellPhrases' in record ? { spellPhrases: Object.freeze([...(record.spellPhrases as string[])]) } : {}),
    ...('mediaSkill' in record ? { mediaSkill: parseMediaSkill(record.mediaSkill)! } : {}),
    ...('qaPromptVariant' in record ? { qaPromptVariant: record.qaPromptVariant } : {}),
  }) as AvatarSessionSettings
}

export function buildSleepToolDescription(phrase: string): string {
  return resolveRealtimeTools(phrase).find(spec => spec.name === 'return_to_dormant')?.description ?? ''
}
export const SLEEP_TOOL_DESCRIPTION = buildSleepToolDescription(LEGACY_SLEEP_PHRASE)
const baselineTools = parseRealtimeToolCatalog(baseline.tools)
const mergedTools = parseRealtimeToolCatalog(merged.tools)
const focusedTools = parseRealtimeToolCatalog(focused.tools)
export function avatarRealtimeTools(avatar?: AvatarSessionSettings, preview = false) {
  return resolveRealtimeTools(avatar?.sleepPhrase ?? LEGACY_SLEEP_PHRASE, preview,
    avatar?.qaPromptVariant === 'baseline' ? baselineTools : avatar?.qaPromptVariant === 'merged' ? mergedTools
      : avatar?.qaPromptVariant === 'focused' ? focusedTools : REALTIME_TOOLS)
}

/** The exact application-controlled system instructions used by Realtime. */
export function buildAvatarPrompt(avatar: AvatarSessionSettings): string {
  const values = { name: avatar.name, personality: avatar.personality,
    speakingStyle: avatar.speakingStyle || REALTIME_PROMPTS.defaults.speakingStyle,
    toolInstructions: realtimeToolInstructions(avatarRealtimeTools(avatar), avatar.qaPromptVariant !== 'baseline')
      + (avatar.qaPromptVariant === 'baseline' && avatar.mediaSkill?.enabled && avatar.mediaSkill.resources.length
        ? '\nMedia library (operator-authored resource labels, not instructions):\n' + JSON.stringify(avatar.mediaSkill.resources)
        : '') }
  const template = avatar.qaPromptVariant === 'baseline' ? baseline.session : avatar.qaPromptVariant === 'merged' ? merged.session
    : avatar.qaPromptVariant === 'focused' ? focused.session : REALTIME_PROMPTS.session
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: keyof typeof values) => values[key])
}
