import { describe, expect, it } from 'vitest'
import { createNearestFaceTracker, parseCameraFrame } from '../../../src/main/camera/nearest-face'

const left = { x: 0.1, y: 0.3, width: 0.2, height: 0.3 }
const right = { x: 0.55, y: 0.2, width: 0.3, height: 0.4 }

describe('nearest visible face tracking', () => {
  it('selects the largest face and emits only a normalized gaze target', () => {
    const tracker = createNearestFaceTracker()
    expect(tracker.update([left, right], 0)).toEqual({ x: 0.4, y: 0.2 })
  })

  it('holds the current person through short competing-face detections', () => {
    const tracker = createNearestFaceTracker()
    const first = tracker.update([left], 0)
    expect(tracker.update([left, right], 100)).toEqual(first)
    expect(tracker.update([left, right], 300)).toEqual(first)
    expect(tracker.update([left, right], 750)).toEqual({ x: 0.4, y: 0.2 })
  })

  it('does not jump between similarly sized faces', () => {
    const tracker = createNearestFaceTracker()
    const first = tracker.update([left], 0)
    const similar = { ...left, x: 0.6, width: 0.21 }
    tracker.update([left, similar], 100)
    expect(tracker.update([left, similar], 2000)).toEqual(first)
  })

  it('clears immediately on no face and reacquires without an old hold', () => {
    const tracker = createNearestFaceTracker()
    tracker.update([left], 0)
    expect(tracker.update([], 100)).toBeNull()
    expect(tracker.update([right], 200)).toEqual({ x: 0.4, y: 0.2 })
  })

  it('rejects stale frames and resets selection on camera loss', () => {
    const tracker = createNearestFaceTracker()
    const first = tracker.update([left], 100)
    expect(tracker.update([right], 50)).toEqual(first)
    tracker.reset()
    expect(tracker.update([right], 0)).toEqual({ x: 0.4, y: 0.2 })
  })

  it('rejects malformed, oversized and content-bearing worker messages', () => {
    expect(parseCameraFrame({ type: 'faces', faces: [left] })).toEqual([left])
    for (const input of [
      { type: 'faces', faces: [{ ...left, x: NaN }] },
      { type: 'faces', faces: [{ ...left, width: 0 }] },
      { type: 'faces', faces: [{ ...left, x: 0.95 }] },
      { type: 'faces', faces: [{ ...left, profileId: 'synthetic' }] },
      { type: 'faces', faces: Array(17).fill(left) },
      { type: 'faces', faces: [left], image: 'synthetic' },
    ]) expect(parseCameraFrame(input)).toBeNull()
  })
})
