import type { DanceAnalysis } from '../shared/dance-floor'

/** Native band-RMS frames: seconds, full-band, bass, mid, treble. No PCM retained. */
export type RhythmFeature = [number, number, number, number, number]
const clamp = (x: number) => Math.min(1, Math.max(0, x))

/** Onset evidence plus locally estimated periodicity, followed by a dynamic-programming
 * beat path. Inspired by Ellis (2007); this is our implementation, not copied code.
 * Re-estimate tempo locally: a DJ mix must not inherit one global BPM. */
export function analyseBeats(frames: readonly RhythmFeature[]): DanceAnalysis {
  const n = frames.length, step = n > 1 ? (frames[n - 1]![0] - frames[0]![0]) / (n - 1) : 0.01
  if (n < 30 || !Number.isFinite(step) || step < 0.005 || step > 0.03) throw Error('dance_analysis_invalid')
  const onset = new Float64Array(n), energy: number[] = []
  for (let i = 3; i < n; i++) {
    const f = frames[i]!
    for (let band = 2; band < 5; band++) {
      const previous = (frames[i - 1]![band]! + frames[i - 2]![band]! + frames[i - 3]![band]!) / 3
      onset[i] += Math.max(0, Math.log1p(f[band]! * 100) - Math.log1p(previous * 100)) * (band === 2 ? 1.5 : 1)
    }
  }
  // Normalize per window, not per entire track: quiet introductions still have rhythm.
  const period = new Float64Array(n), confidence = new Float64Array(n), local = new Float64Array(n)
  const stride = Math.round(2 / step), radius = Math.round(4 / step)
  const minLag = Math.round(0.3 / step), maxLag = Math.round(1 / step)
  for (let block = 0; block < n; block += stride) {
    const center = block + Math.floor(stride / 2), start = Math.max(0, center - radius), end = Math.min(n, center + radius)
    let norm = 0, peak = 0
    for (let i = start; i < end; i++) { norm += onset[i]! ** 2; peak = Math.max(peak, onset[i]!) }
    let best = 0, bestLag = Math.round(0.5 / step), correlation = 0
    for (let lag = minLag; lag <= maxLag; lag++) {
      let score = 0, a = 0, b = 0
      for (let i = start + lag; i < end; i++) {
        // ±1 frame tolerates quantization and human timing.
        const x = onset[i]!, y = Math.max(onset[i - lag - 1] ?? 0, onset[i - lag]!, onset[i - lag + 1] ?? 0)
        score += x * y; a += x * x; b += y * y
      }
      const corr = score / Math.sqrt(Math.max(1e-12, a * b))
      const weighted = corr * Math.exp(-0.5 * (Math.log(lag * step / 0.5) / 0.75) ** 2)
      if (weighted > best) { best = weighted; bestLag = lag; correlation = corr }
    }
    const scale = Math.max(0.05, Math.sqrt(norm / Math.max(1, end - start)) * 2.5)
    for (let i = block; i < Math.min(n, block + stride); i++) {
      period[i] = bestLag; confidence[i] = peak > 0.08 ? clamp((correlation - 0.15) / 0.65) : 0
      local[i] = Math.min(4, onset[i]! / scale)
    }
  }
  const scores = new Float64Array(n), prior = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const p = period[i]!, lo = Math.max(0, i - Math.ceil(p * 1.5)), hi = i - Math.floor(p * 0.65)
    let best = 0, at = -1
    for (let j = lo; j <= hi; j++) {
      const score = scores[j]! * 0.92 - 12 * Math.log((i - j) / p) ** 2
      if (score > best) { best = score; at = j }
    }
    scores[i] = local[i]! + best; prior[i] = at
  }
  let end = n - 1
  for (let i = Math.max(0, n - Math.ceil(2 / step)); i < n; i++) if (scores[i]! > scores[end]!) end = i
  const path: number[] = []
  for (let i = end; i >= 0; i = prior[i]!) path.push(i)
  path.reverse()
  const beats = path.filter(i => confidence[i]! >= 0.35 && frames[i]![1] > 0.002 && local[i]! > 0.15)
    .map((i, index) => ({ timeMs: frames[i]![0] * 1000, periodMs: period[i]! * step * 1000,
      strength: clamp(local[i]! / 3), confidence: confidence[i]!, index }))
  const energyStride = Math.max(1, Math.round(0.1 / step))
  const sorted = frames.map(f => f[1]).sort((a, b) => a - b), reference = Math.max(0.02, sorted[Math.floor(n * 0.9)]!)
  for (let i = 0; i < n; i += energyStride) {
    let sum = 0, count = 0
    for (let j = i; j < Math.min(n, i + energyStride); j++) { sum += frames[j]![1]; count++ }
    energy.push(clamp(sum / count / reference))
  }
  return { version: 1, durationMs: (frames[n - 1]![0] + step) * 1000, beats, energy, energyStepMs: energyStride * step * 1000 }
}
