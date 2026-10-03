import { describe, expect, it, vi } from 'vitest'
import { createSherpaDetector } from '../../../src/main/wake/sherpa-detector'

describe('wake detector adapters', () => {
  it('exposes native partial-match measurements without token text or invented confidence', () => {
    let ready = true
    const spotter = {
      createStream: () => ({ acceptWaveform() {} }),
      isReady: () => ready,
      decode: () => { ready = false },
      getResult: () => ({ keyword: '', tokens: ['private'], wake_score_version: 1,
        acoustic_score: 0.82, matched_tokens: 4, keyword_tokens: 9, candidate_trailing_blanks: 2 }),
      reset() {},
    }
    const detector = createSherpaDetector(spotter, 16_000)
    expect(detector.process(new Int16Array(1600))).toEqual({ status: 'listening' })
    expect(detector.measurement?.()).toEqual({ acousticScore: 0.82, matchedTokens: 4,
      totalTokens: 9, trailingBlanks: 2, decodedSteps: 1 })
    detector.reset()
    expect(detector.measurement?.()).toBeNull()
  })
  it('clears an old numerical measurement when a new decode has invalid native fields', () => {
    let ready = true
    let valid = true
    const spotter = {
      createStream: () => ({ acceptWaveform() { ready = true } }),
      isReady: () => ready, decode: () => { ready = false },
      getResult: () => ({ keyword: '', wake_score_version: 1, acoustic_score: valid ? 0.8 : NaN,
        matched_tokens: 4, keyword_tokens: 9, candidate_trailing_blanks: 0 }),
      reset() {},
    }
    const detector = createSherpaDetector(spotter, 16_000)
    detector.process(new Int16Array(1600))
    expect(detector.measurement?.()?.acousticScore).toBe(0.8)
    valid = false
    detector.process(new Int16Array(1600))
    expect(detector.measurement?.()).toBeNull()
  })

  it('reads each decoded step before the next step can consume a keyword result', () => {
    let step = 0
    let keyword = ''
    const stream = { acceptWaveform: vi.fn() }
    const spotter = {
      createStream: () => stream,
      isReady: () => step < 3,
      decode: () => { keyword = ++step === 1 ? 'wake' : '' },
      getResult: vi.fn(() => ({ keyword })),
      reset: vi.fn(() => { keyword = '' }),
    }
    const detector = createSherpaDetector(spotter, 16_000)

    expect(detector.process(new Int16Array(64_000))).toEqual({ status: 'detected' })
    expect(step).toBe(3)
    expect(spotter.getResult).toHaveBeenCalledTimes(3)
    expect(spotter.reset).toHaveBeenCalledTimes(1)
    expect(detector.process(new Int16Array(160))).toEqual({ status: 'listening' })
  })

  it('converts sherpa input, resets after detection, and exposes no keyword text', () => {
    const accepted: Float32Array[] = []
    const stream = {
      acceptWaveform: ({ samples }: { samples: Float32Array; sampleRate: number }) => accepted.push(samples),
    }
    let ready = true
    const spotter = {
      createStream: () => stream,
      isReady: () => ready,
      decode: () => { ready = false },
      getResult: () => ({ keyword: '魔鏡阿魔鏡' }),
      reset: vi.fn(),
    }
    const detector = createSherpaDetector(spotter, 16_000)

    const result = detector.process(new Int16Array([-32768, 0, 32767]))

    expect(result).toEqual({ status: 'detected' })
    expect(Object.keys(result)).toEqual(['status'])
    expect([...accepted[0]]).toEqual([-1, 0, 32767 / 32768])
    expect(spotter.reset).toHaveBeenCalledWith(stream)
  })
})
