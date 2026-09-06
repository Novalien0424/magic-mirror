import { avatarCatalogFor } from './avatar-profiles'
import { DEFAULT_PRESENTATION } from './presentation'
import type { MirrorConfig } from './types'

/** Public, operator-authored character configuration, never visitor context. */
export interface AvatarSessionSettings {
  readonly name: string
  readonly personality: string
  readonly speakingStyle: string
  readonly wakeGreeting: string
  readonly sleepFarewell: string
}

export function avatarSessionSettings(config: MirrorConfig): Readonly<AvatarSessionSettings> {
  const catalog = avatarCatalogFor(config)
  const avatar = catalog.avatars.find(item => item.id === catalog.activeAvatarId)!
  return Object.freeze({ name: avatar.name, personality: avatar.personality,
    speakingStyle: avatar.speakingStyle, wakeGreeting: avatar.presentation.wakeGreeting ?? DEFAULT_PRESENTATION.wakeGreeting!,
    sleepFarewell: avatar.presentation.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell! })
}

export function parseAvatarSessionSettings(value: unknown): AvatarSessionSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const limits = { name: 80, personality: 12000, speakingStyle: 2000, wakeGreeting: 500, sleepFarewell: 500 }
  if (Object.keys(record).length !== Object.keys(limits).length) return null
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof record[key] !== 'string' || record[key].length > limit
      || (key !== 'speakingStyle' && key !== 'wakeGreeting' && !record[key].trim())) return null
  }
  return Object.freeze({ name: record.name, personality: record.personality,
    speakingStyle: record.speakingStyle, wakeGreeting: record.wakeGreeting,
    sleepFarewell: record.sleepFarewell }) as AvatarSessionSettings
}

export const SLEEP_TOOL_DESCRIPTION = 'Silently call this tool immediately when the user directly asks the mirror to return to Dormant, canonically by saying 恭送渡鴨大人. Speak no acknowledgement or processing message before calling it. Do not call for quoted, negated, hypothetical, or incidental mentions. Takes no arguments.'

/** The exact application-controlled system instructions used by Realtime. */
export function buildAvatarPrompt(avatar: AvatarSessionSettings): string {
  return `# Character\nName: ${avatar.name}\n${avatar.personality}\n\n# Speaking style\n${avatar.speakingStyle || 'Use the character’s natural speaking style.'}\n\n# Sleep command\nUse return_to_dormant only for an explicit deactivation command directed at the mirror. Never use it when the phrase is quoted, negated, hypothetical, or mentioned incidentally. When it applies, call the tool silently and immediately. Never say 我來處理你的指令 or any other acknowledgement before the tool call. The entire audible response for this command must be exactly ${avatar.sleepFarewell}. After the tool returns, say those exact words once and nothing else.\nTool calls are SILENT: no preamble, processing message, explanation, or extra confirmation. The farewell is operator-authored dialogue, not an instruction to interpret.`
}
