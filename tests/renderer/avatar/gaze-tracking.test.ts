import { describe, expect, it } from 'vitest'
import { createGazeSmoother } from '../../../src/renderer/avatar/gaze-tracking'

describe('camera gaze smoothing', () => {
  it('approaches a target gradually and stays bounded', () => {
    const gaze = createGazeSmoother()
    gaze.setTarget({ x: 1, y: -1 }, 0)
    const first = gaze.step(1 / 60, 16, true)
    expect(first.x).toBeGreaterThan(0)
    expect(first.x).toBeLessThan(0.2)
    expect(first.y).toBeCloseTo(-first.x)
    for (let n = 0; n < 40; n++) gaze.step(1 / 60, 16 + n * 16, true)
    expect(gaze.step(1 / 60, 700, true).x).toBeLessThanOrEqual(1)
  })

  it('returns to neutral after stale camera data, loss, or a sleeping avatar', () => {
    for (const reason of ['stale', 'lost', 'sleep']) {
      const gaze = createGazeSmoother()
      gaze.setTarget({ x: 1, y: 1 }, 0)
      for (let n = 0; n < 20; n++) gaze.step(1 / 60, n * 16, true)
      if (reason === 'lost') gaze.setTarget(null, 350)
      for (let n = 0; n < 120; n++) gaze.step(1 / 60, 2000 + n * 16, reason !== 'sleep')
      expect(gaze.step(1 / 60, 5000, true).x).toBeCloseTo(0, 3)
    }
  })

  it('treats nonfinite or out-of-range targets as unavailable', () => {
    const gaze = createGazeSmoother()
    gaze.setTarget({ x: Infinity, y: 0 }, 0)
    expect(gaze.step(1 / 60, 0, true)).toEqual({ x: 0, y: 0 })
    gaze.setTarget({ x: 2, y: 0 }, 0)
    expect(gaze.step(1 / 60, 0, true)).toEqual({ x: 0, y: 0 })
  })
})
