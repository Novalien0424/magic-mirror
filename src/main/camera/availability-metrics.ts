import type { CameraQaSample } from './tracker'

/** Numeric-only summaries; never retain sample buffers or device identifiers. */
export function cameraSampleMetrics(startupMs: number, durationMs: number) {
  const windows = Array<number>(Math.ceil(durationMs / 5000)).fill(0)
  const formats: Omit<CameraQaSample, 'sequence' | 'sourceSeconds'>[] = []
  let samples = 0, firstAtMs: number | null = null, lastAtMs: number | null = null
  let firstSource: number | null = null, lastSource: number | null = null
  let maxSourceGapMs = 0, maxReceiptGapMs = 0, staleSamples = 0
  return {
    add(sample: CameraQaSample, at: number) {
      if (at > startupMs + durationMs) return
      firstAtMs ??= at
      if (lastSource !== null) {
        if (sample.sourceSeconds <= lastSource) staleSamples++
        maxSourceGapMs = Math.max(maxSourceGapMs, (sample.sourceSeconds - lastSource) * 1000)
      }
      if (lastAtMs !== null) maxReceiptGapMs = Math.max(maxReceiptGapMs, at - lastAtMs)
      firstSource ??= sample.sourceSeconds
      lastSource = sample.sourceSeconds; lastAtMs = at; samples++
      const { sequence: _sequence, sourceSeconds: _source, ...format } = sample
      if (!formats.some(value => Object.keys(format).every(key => value[key as keyof typeof value] === format[key as keyof typeof format]))
        && formats.length < 16) formats.push(format)
      if (at >= startupMs) windows[Math.min(windows.length - 1, Math.floor((at - startupMs) / 5000))]!++
    },
    result(elapsedMs: number) {
      const finalGap = Math.max(0, Math.min(elapsedMs, startupMs + durationMs) - Math.max(startupMs, lastAtMs ?? 0))
      return { samples, firstAtMs, lastAtMs, staleSamples, formats, windows,
        maxSourceGapMs, maxReceiptGapMs: Math.max(maxReceiptGapMs, finalGap),
        deliveredFps: firstSource !== null && lastSource !== null && lastSource > firstSource ? (samples - 1) / (lastSource - firstSource) : 0 }
    },
  }
}
