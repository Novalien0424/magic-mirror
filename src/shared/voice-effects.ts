export interface VoiceEffects {
  readonly enabled: boolean
  readonly pitchSemitones: number
  readonly formantSemitones: number
  readonly formantCompensation: boolean
  readonly warmthDb: number
  readonly brightnessDb: number
  readonly grit: number
  readonly roomMix: number
  readonly roomSize: 'short' | 'medium'
  readonly outputTrimDb: number
}

export const DEFAULT_VOICE_EFFECTS: Readonly<VoiceEffects> = Object.freeze({
  enabled: false,
  pitchSemitones: 0,
  formantSemitones: 0,
  formantCompensation: true,
  warmthDb: 0,
  brightnessDb: 0,
  grit: 0,
  roomMix: 0,
  roomSize: 'short',
  outputTrimDb: -3,
})

export const VOICE_EFFECT_PRESETS: Readonly<{
  readonly ethereal: VoiceEffects
  readonly darkOracle: VoiceEffects
}> = Object.freeze({
  ethereal: Object.freeze({
    ...DEFAULT_VOICE_EFFECTS,
    enabled: true,
    pitchSemitones: 1,
    formantSemitones: 1.5,
    warmthDb: -1,
    brightnessDb: 1,
    roomMix: 0.12,
    roomSize: 'medium',
  }),
  darkOracle: Object.freeze({
    ...DEFAULT_VOICE_EFFECTS,
    enabled: true,
    pitchSemitones: -3,
    formantSemitones: -2,
    warmthDb: 2,
    brightnessDb: -1,
    grit: 0.08,
    roomMix: 0.1,
    roomSize: 'short',
  }),
})

export function parseVoiceEffects(value: unknown): VoiceEffects | null {
  if (value === undefined) return { ...DEFAULT_VOICE_EFFECTS }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== Object.keys(DEFAULT_VOICE_EFFECTS).length
    || typeof record.enabled !== 'boolean' || typeof record.formantCompensation !== 'boolean'
    || !['short', 'medium'].includes(record.roomSize as string)) return null
  const ranges = { pitchSemitones: [-12, 12], formantSemitones: [-6, 6], warmthDb: [-6, 6],
    brightnessDb: [-6, 6], grit: [0, 0.3], roomMix: [0, 0.25], outputTrimDb: [-18, 0] }
  for (const [key, range] of Object.entries(ranges)) {
    const number = record[key]
    if (typeof number !== 'number' || !Number.isFinite(number) || number < range[0]! || number > range[1]!) return null
  }
  return { ...record } as unknown as VoiceEffects
}

export function normalizeVoiceSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 1.5
    ? value
    : 1
}
