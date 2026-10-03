import type { VoiceEffects } from '../../../shared/voice-effects'

const ROOM_SECONDS = { short: .12, medium: .25, hall: 1.2, cathedral: 2.4 } as const

export function roomImpulse(context: BaseAudioContext, size: VoiceEffects['roomSize']): AudioBuffer {
  const length = Math.ceil(context.sampleRate * ROOM_SECONDS[size])
  const buffer = context.createBuffer(2, length, context.sampleRate)
  const onset = size === 'hall' || size === 'cathedral' ? Math.round(context.sampleRate * .035) : 0
  let seed = 137
  for (let c = 0; c < 2; c++) {
    const channel = buffer.getChannelData(c)
    let filtered = 0
    for (let i = onset; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      const noise = seed / 2147483648
      filtered += .3 * (noise - filtered)
      channel[i] = (onset ? filtered : noise) * Math.pow(1 - (i - onset) / (length - onset), 3) * .15
    }
  }
  return buffer
}

/** Sparse impulse response gives exact finite repeats, without a feedback loop.
 * Disable ConvolverNode normalization for this buffer: tap gains sum to one.
 */
export function echoImpulse(context: BaseAudioContext, delayMs: number, repeats: number): AudioBuffer {
  const spacing = Math.round(context.sampleRate * delayMs / 1000)
  const buffer = context.createBuffer(1, spacing * repeats + 1, context.sampleRate)
  const channel = buffer.getChannelData(0)
  const total = Array.from({ length: repeats }, (_, i) => .45 ** i).reduce((sum, x) => sum + x, 0)
  for (let i = 0; i < repeats; i++) channel[spacing * (i + 1)] = .45 ** i / total
  return buffer
}

export function spatialTailSeconds(settings: VoiceEffects, sampleRate = 48000): number {
  return Math.max(settings.roomMix ? ROOM_SECONDS[settings.roomSize] : 0,
    settings.echoMix ? (Math.round(sampleRate * settings.echoDelayMs / 1000) * settings.echoRepeats + 1) / sampleRate : 0)
}
