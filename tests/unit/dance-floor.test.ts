import { describe, expect, it } from 'vitest'
import { analyseBeats, type RhythmFeature } from '../../src/main/dance-beats'
import { dancePose } from '../../src/renderer/avatar/dance-performance'
import { DEFAULT_DANCE, parseDanceCommand, parseDanceFrame, type DanceFrame } from '../../src/shared/dance-floor'

function features(duration: number, beats: number[], noise = false): RhythmFeature[] {
  return Array.from({ length: duration * 100 }, (_, i) => {
    const t = i / 100, distance = Math.min(...beats.map(b => Math.abs(b - t)))
    const pulse = Math.exp(-((distance / 0.025) ** 2))
    const extra = noise ? Math.exp(-(((t % 0.25 - 0.125) / 0.012) ** 2)) * 0.12 : 0
    return [t, 0.1 + pulse * 0.7, 0.02 + pulse * 0.5, 0.02 + pulse * 0.3, 0.01 + extra + pulse * 0.2]
  })
}
function score(expected: number[], actual: number[]) {
  const hit = expected.filter(t => actual.some(a => Math.abs(a-t) <= 0.05)).length
  return { recall: hit / expected.length, precision: actual.filter(t => expected.some(e => Math.abs(e-t) <= 0.05)).length / actual.length }
}
describe('Dance Floor beat detection and actual-player clock', () => {
  it('finds beats with off-beat high-frequency distractors', () => {
    const expected = Array.from({ length: 44 }, (_, i) => 1 + i * 0.5)
    const result = analyseBeats(features(24, expected, true))
    const measured = score(expected.filter(t => t > 3 && t < 21), result.beats.map(b => b.timeMs / 1000).filter(t => t > 3 && t < 21))
    expect(measured.recall).toBeGreaterThan(0.9); expect(measured.precision).toBeGreaterThan(0.9)
  })
  it('adapts between 100 and 150 BPM instead of holding a single global tempo', () => {
    const slow = Array.from({ length: 28 }, (_, i) => 1 + i * 0.6), fast = Array.from({ length: 40 }, (_, i) => 19 + i * 0.4)
    const result = analyseBeats(features(36, [...slow, ...fast]))
    for (const [start, end, expected] of [[4, 14, slow], [23, 32, fast]] as const) {
      const measured = score(expected.filter(t => t > start && t < end), result.beats.map(b => b.timeMs / 1000).filter(t => t > start && t < end))
      expect(measured.recall).toBeGreaterThan(0.85); expect(measured.precision).toBeGreaterThan(0.85)
    }
  })
  it('does not call constant loudness or silence a musical beat', () => {
    expect(analyseBeats(Array.from({ length: 1000 }, (_, i) => [i/100, 0.8, 0.3, 0.2, 0.1] as RhythmFeature)).beats).toEqual([])
    expect(analyseBeats(Array.from({ length: 1000 }, (_, i) => [i/100, 0, 0, 0, 0] as RhythmFeature)).beats).toEqual([])
  })
  const frame = (patch: Partial<DanceFrame> = {}): DanceFrame => ({ generation: 1, trackId: 1, positionMs: 900, sentAt: 10000, rate: 1,
    beats: [{ timeMs: 1000, periodMs: 500, strength: 1, confidence: 1, index: 0 }], energy: 1,
    settings: { ...DEFAULT_DANCE }, status: 'playing', reason: 'dance_beat_locked', ...patch })
  it('places the actual head downstroke at the beat within one 60 Hz frame', () => {
    const samples = Array.from({ length: 18 }, (_, i) => dancePose(frame(), 10000 + i * 1000/60))
    const impact = samples.reduce((a, b) => a.parameters.ParamAngleY! < b.parameters.ParamAngleY! ? a : b)
    expect(Math.abs(impact.positionMs - 1000)).toBeLessThanOrEqual(1000 / 60)
    expect(impact.parameters.ParamAngleY).toBeLessThan(-20)
  })
  it('stops dancing on paused/stalled clocks and cannot free-run after stale IPC', () => {
    for (const pose of [dancePose(frame({ rate: 0 }), 10100), dancePose(frame(), 10500), dancePose(frame({ status: 'idle' }), 10100)]) {
      expect(pose.parameters.ParamAngleY).toBe(0); expect(pose.synchronized).toBe(false)
    }
  })
  it('resets phase on a track/loop discontinuity and applies calibrated visual offset', () => {
    const adjusted = frame({ settings: { ...DEFAULT_DANCE, offsetMs: 100 } })
    expect(dancePose(adjusted, 10000).parameters.ParamAngleY).toBeCloseTo(-24, 1)
    const reset = dancePose(frame({ trackId: 2, positionMs: 0, beats: [], sentAt: 20000 }), 20000)
    expect(reset.beatIndex).toBeNull(); expect(reset.positionMs).toBe(0)
  })
  it('rejects hostile settings and malformed renderer clocks', () => {
    expect(parseDanceFrame(frame())).not.toBeNull()
    expect(parseDanceFrame(frame({ rate: NaN }))).toBeNull()
    expect(parseDanceCommand({ action: 'save', settings: { ...DEFAULT_DANCE, volume: 100 } })).toBeNull()
    expect(parseDanceCommand({ action: 'save', settings: { ...DEFAULT_DANCE, track: '../../secret' } })).toBeNull()
  })
})
