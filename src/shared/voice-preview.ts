import { z } from 'zod'
import { AVATAR_VOICES } from './avatar-profiles'
import { voiceEffectsSchema } from './voice-effects-schema'
import type { SessionModelSnapshot } from './types'
export const voicePreviewRequestSchema = z.object({
  kind: z.enum(['local', 'generated']), voice: z.enum(AVATAR_VOICES),
  voiceSpeed: z.number().min(0.5).max(1.5), voiceEffects: voiceEffectsSchema,
  speakingStyle: z.string().max(2000),
}).strict()
export type VoicePreviewRequest = z.infer<typeof voicePreviewRequestSchema>
export type VoicePreviewResult = { ok: false; reason: string } | {
  ok: true; token: string; snapshot?: Readonly<SessionModelSnapshot>; clientSecret?: string
}
export const VOICE_PREVIEW_TEXT = '你好，我在這裡。讓我們慢慢說，仔細聽。 The mirror is awake. Tell me what is on your mind.'
