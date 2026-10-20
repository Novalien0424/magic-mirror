import { describe, expect, it } from 'vitest'
import { pcmLevels, scalePcm } from '../../src/main/wake/qa-levels'

describe('acoustic QA levels', () => {
  it('measures silence without nonfinite artifact values and distinguishes energy from peak', () => {
    expect(pcmLevels(new Int16Array(4))).toEqual({ samples: 4, peak: 0, rms: 0, rmsDbfs: null, clipped: 0 })
    const levels = pcmLevels(Int16Array.of(16384, -16384, 0, 0))
    expect(levels.peak).toBe(.5)
    expect(levels.rms).toBeCloseTo(Math.sqrt(.125))
    expect(levels.rmsDbfs).toBeCloseTo(-9.0309)
  })
  it('bounds stimulus gain, reports clipping and leaves its source unchanged', () => {
    const source = Int16Array.of(20000, -20000, 1000)
    const result = scalePcm(source, 2)
    expect([...result.pcm]).toEqual([32767, -32768, 2000])
    expect(result.clipped).toBe(2)
    expect([...source]).toEqual([20000, -20000, 1000])
    for (const gain of [NaN, Infinity, -1, 4.1]) expect(() => scalePcm(source, gain)).toThrow('raven_qa_gain_invalid')
  })
})
