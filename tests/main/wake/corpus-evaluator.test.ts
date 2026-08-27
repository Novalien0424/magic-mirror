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
        { id: 'positive-1', category: 'positive', pcm: new Int16Array(3_200) },
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
      schemaVersion: 1,
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
        meanLatencyMs: 200,
        p95LatencyMs: 200,
        processingMs: 1,
        cpuMs: 2.5,
        failures: 0,
      }],
    })
    expect(JSON.stringify(result)).not.toMatch(/positive-1|hard-negative-1|background-1|pcm/)
  })
})
