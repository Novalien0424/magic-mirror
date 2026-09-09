import { z } from 'zod'

const voiceEffectsShape = {
  enabled: z.boolean(),
  pitchSemitones: z.number().finite().min(-12).max(12),
  formantSemitones: z.number().finite().min(-6).max(6),
  formantCompensation: z.boolean(),
  warmthDb: z.number().finite().min(-6).max(6),
  brightnessDb: z.number().finite().min(-6).max(6),
  grit: z.number().finite().min(0).max(0.3),
  roomMix: z.number().finite().min(0).max(0.25),
  roomSize: z.enum(['short', 'medium']),
  outputTrimDb: z.number().finite().min(-18).max(0),
} as const

export const voiceEffectsSchema = z.object(voiceEffectsShape).strict()

