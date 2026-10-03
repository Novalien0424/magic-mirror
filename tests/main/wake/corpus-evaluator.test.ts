import { describe, expect, it } from 'vitest'

import { evaluateWakeCorpus } from '../../../src/main/wake/corpus-evaluator'
import type { WakeDetector } from '../../../src/main/wake/detector'

function detector(detectedSamples: ReadonlySet<number>): WakeDetector {
  let index = 0
  return {
    sampleRateHz: 16_000,
    process: () => detectedSamples.has(index++) ? { status: 'detected' } : { status: 'listening' },
    reset: () => { index = 0 },
    close: () => {},
  }
}

describe('wake corpus evaluator', () => {
  it('returns metadata-only aggregate misses, false accepts, latency, and CPU', () => {
    let clock = 0
    let cpu = -2_500
    const result = evaluateWakeCorpus({
      samples: [
        { id: 'positive-1', category: 'positive', pcm: new Int16Array(3_200), keywordEndMs: 150 },
        { id: 'positive-2', category: 'positive', pcm: new Int16Array(1_600) },
        { id: 'hard-negative-1', category: 'hard_negative', pcm: new Int16Array(3_200) },
        { id: 'background-1', category: 'background', pcm: new Int16Array(32_000) },
      ],
      candidates: [{ packageId: 'candidate-a', createDetector: () => detector(new Set([1])) }],
      chunkSamples: 1_600,
      nowMs: () => ++clock,
      cpuMicros: () => (cpu += 2_500),
    })

    expect(result).toEqual({
      schemaVersion: 2,
      sampleCount: 4,
      positiveCount: 2,
      negativeHours: 0.0006111111111111112,
      candidates: [{
        packageId: 'candidate-a',
        detections: 3,
        falseRejects: 1,
        falseRejectRate: 0.5,
        falseAccepts: 2,
        falseAcceptsPerHour: 3272.727272727272,
        meanLatencyMs: 50,
        p95LatencyMs: 50,
        processingMs: 1,
        cpuMs: 2.5,
        failures: 0,
      }],
    })
    expect(JSON.stringify(result)).not.toMatch(/positive-1|hard-negative-1|background-1|pcm/)
  })

  it('counts repeated false activations throughout a negative clip and marks unmeasured rates', () => {
    const result = evaluateWakeCorpus({
      samples: [{ id: 'noise', category: 'background', pcm: new Int16Array(6_400) }],
      candidates: [{ packageId: 'test', createDetector: () => detector(new Set([1, 3])) }],
    }).candidates[0]!
    expect(result.falseAccepts).toBe(2)
    expect(result.falseRejectRate).toBeNull()
    expect(result.falseAcceptsPerHour).toBeCloseTo(18_000)
    expect(result.meanLatencyMs).toBeNull()
    const positiveOnly = evaluateWakeCorpus({ samples: [{ id: 'word', category: 'positive', pcm: new Int16Array(1600) }],
      candidates: [{ packageId: 'test', createDetector: () => detector(new Set([0])) }] }).candidates[0]!
    expect(positiveOnly.falseAcceptsPerHour).toBeNull()
    expect(positiveOnly.meanLatencyMs).toBeNull()
  })
})
