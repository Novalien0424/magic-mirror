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
  roomSize: z.enum(['short', 'medium', 'hall', 'cathedral']),
  echoMix: z.number().finite().min(0).max(0.3).default(0),
  echoDelayMs: z.number().finite().min(60).max(500).default(220),
  echoRepeats: z.number().int().min(1).max(4).default(2),
  outputTrimDb: z.number().finite().min(-18).max(0),
} as const

export const voiceEffectsSchema = z.object(voiceEffectsShape).strict()

