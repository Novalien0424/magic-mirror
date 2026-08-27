import type { WakeDetector } from './detector'

export type WakeCorpusCategory = 'positive' | 'hard_negative' | 'background'

export interface WakeCorpusSample {
  readonly id: string
  readonly category: WakeCorpusCategory
  readonly pcm: Int16Array
}

export interface WakeCorpusCandidate {
  readonly packageId: string
  readonly createDetector: () => WakeDetector
}

export interface WakeCorpusAggregate {
  readonly schemaVersion: 1
  readonly sampleCount: number
  readonly positiveCount: number
  readonly negativeHours: number
  readonly candidates: readonly {
    readonly packageId: string
    readonly detections: number
    readonly falseRejects: number
    readonly falseRejectRate: number
    readonly falseAccepts: number
    readonly falseAcceptsPerHour: number
    readonly meanLatencyMs: number | null
    readonly p95LatencyMs: number | null
    readonly processingMs: number
    readonly cpuMs: number
    readonly failures: number
  }[]
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null
}

export function evaluateWakeCorpus(input: {
  readonly samples: readonly WakeCorpusSample[]
  readonly candidates: readonly WakeCorpusCandidate[]
  readonly chunkSamples?: number
  readonly nowMs?: () => number
  readonly cpuMicros?: () => number
}): WakeCorpusAggregate {
  const chunkSamples = input.chunkSamples ?? 1_600
  if (!Number.isSafeInteger(chunkSamples) || chunkSamples < 1) {
    throw new Error('wake_corpus_configuration_invalid')
  }
  const positiveCount = input.samples.filter((sample) => sample.category === 'positive').length
  const negativeSamples = input.samples
    .filter((sample) => sample.category !== 'positive')
    .reduce((total, sample) => total + sample.pcm.length, 0)
  const negativeHours = negativeSamples / 16_000 / 3_600
  const nowMs = input.nowMs ?? (() => performance.now())
  const cpuMicros = input.cpuMicros ?? (() => {
    const usage = process.cpuUsage()
    return usage.user + usage.system
  })

  const candidates = input.candidates.map((candidate) => {
    const detector = candidate.createDetector()
    let detections = 0
    let falseRejects = 0
    let falseAccepts = 0
    let failures = 0
    const latencies: number[] = []
    const startedAt = nowMs()
    const cpuStartedAt = cpuMicros()
    try {
      for (const sample of input.samples) {
        let detected = false
        try {
          detector.reset()
          for (let offset = 0; offset < sample.pcm.length; offset += chunkSamples) {
            const chunk = sample.pcm.subarray(offset, Math.min(offset + chunkSamples, sample.pcm.length))
            if (detector.process(chunk).status === 'detected') {
              detected = true
              detections += 1
              latencies.push(Math.min(offset + chunk.length, sample.pcm.length) / 16_000 * 1_000)
              break
            }
          }
        } catch {
          failures += 1
        }
        if (sample.category === 'positive' && !detected) falseRejects += 1
        if (sample.category !== 'positive' && detected) falseAccepts += 1
      }
    } finally {
      try { detector.close() } catch { failures += 1 }
    }
    const processingMs = Math.max(0, nowMs() - startedAt)
    const latencyTotal = latencies.reduce((total, latency) => total + latency, 0)
    return Object.freeze({
      packageId: candidate.packageId,
      detections,
      falseRejects,
      falseRejectRate: positiveCount === 0 ? 0 : falseRejects / positiveCount,
      falseAccepts,
      falseAcceptsPerHour: negativeHours === 0 ? 0 : falseAccepts / negativeHours,
      meanLatencyMs: latencies.length === 0 ? null : latencyTotal / latencies.length,
      p95LatencyMs: percentile95(latencies),
      processingMs,
      cpuMs: Math.max(0, cpuMicros() - cpuStartedAt) / 1_000,
      failures,
    })
  })

  return Object.freeze({
    schemaVersion: 1,
    sampleCount: input.samples.length,
    positiveCount,
    negativeHours,
    candidates: Object.freeze(candidates),
  })
}
