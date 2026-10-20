import { describe, expect, it } from 'vitest'
import { echoImpulse, roomImpulse, spatialTailSeconds } from '../../src/renderer/avatar/audio/voice-spatial-effects'
import { DEFAULT_VOICE_EFFECTS } from '../../src/shared/voice-effects'

function context() {
  return { sampleRate: 48000, createBuffer(channels: number, length: number, rate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { length, duration: length / rate, numberOfChannels: channels, getChannelData: (c: number) => data[c]! }
  } } as unknown as BaseAudioContext
}

describe('bounded voice echo and room tails', () => {
  it('creates exact, diminishing repeats with no dry copy or unbounded feedback', () => {
    const buffer = echoImpulse(context(), 220, 3), data = buffer.getChannelData(0)
    const taps = Array.from(data.entries()).filter(([, sample]) => sample !== 0)
    expect(taps.map(([index]) => index)).toEqual([10560, 21120, 31680])
    expect(taps[0]![1]).toBeGreaterThan(taps[1]![1])
    expect(taps[1]![1]).toBeGreaterThan(taps[2]![1])
    expect(taps.reduce((sum, [, value]) => sum + value, 0)).toBeCloseTo(1)
    expect(buffer.duration).toBeLessThan(.661)
  })
  it('preserves short rooms and provides longer finite halls with a clear onset gap', () => {
    expect(roomImpulse(context(), 'short').duration).toBe(.12)
    expect(roomImpulse(context(), 'medium').duration).toBe(.25)
    for (const [size, seconds] of [['hall', 1.2], ['cathedral', 2.4]] as const) {
      const buffer = roomImpulse(context(), size)
      expect(buffer.duration).toBe(seconds)
      expect(buffer.getChannelData(0).slice(0, 1680).every(x => x === 0)).toBe(true)
      expect(buffer.getChannelData(0).some(x => x !== 0)).toBe(true)
    }
  })
  it('waits for the longest parallel effect, excluding disabled spatial paths', () => {
    expect(spatialTailSeconds(DEFAULT_VOICE_EFFECTS)).toBe(0)
    expect(spatialTailSeconds({ ...DEFAULT_VOICE_EFFECTS, roomMix: .2, roomSize: 'hall', echoMix: .2, echoDelayMs: 500, echoRepeats: 4 })).toBeCloseTo(2, 3)
    expect(spatialTailSeconds({ ...DEFAULT_VOICE_EFFECTS, roomMix: .2, roomSize: 'cathedral', echoMix: .2, echoDelayMs: 220, echoRepeats: 3 })).toBe(2.4)
  })
})
