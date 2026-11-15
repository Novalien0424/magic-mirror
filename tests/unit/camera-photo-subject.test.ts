import { describe, expect, it } from 'vitest'
import { selectPhotoSubject } from '../../src/main/camera/photo-subject'
import { isCameraSnapshot } from '../../src/shared/camera-tracking'

const still = (faces: { x: number; y: number; width: number; height: number }[] | undefined, faceCount?: number) =>
  ({ width: 1920, height: 1080, ...(faces ? { faces } : {}), ...(faceCount === undefined ? {} : { faceCount }) })
const near = { x: 0.4, y: 0.3, width: 0.2, height: 0.3 }
describe('photo subject (owner 11-15: several people allowed, nearest whole face)', () => {
  it('refuses a still with no clear face', () => {
    expect(selectPhotoSubject(still([], 0))).toBeNull()
    expect(selectPhotoSubject(still(undefined))).toBeNull()
    expect(selectPhotoSubject(still(undefined, 2))).toBeNull()
  })
  it('uses the whole picture for one person, even when that face touches the edge', () => {
    expect(selectPhotoSubject(still([near], 1))).toEqual({})
    expect(selectPhotoSubject(still([{ x: 0, y: 0.2, width: 0.2, height: 0.3 }], 1))).toEqual({})
    expect(selectPhotoSubject(still(undefined, 1))).toEqual({})
  })
  it('crops to the nearest person and leaves a neighbour’s face out', () => {
    const far = { x: 0.7, y: 0.35, width: 0.08, height: 0.12 }
    const { crop } = selectPhotoSubject(still([far, near], 2))!
    // Hair above and shoulders below the face; the right side stops before the neighbour.
    expect(crop).toEqual({ x: 384, y: 32, width: 960, height: 1048 })
    expect(crop!.x + crop!.width).toBeLessThanOrEqual(Math.round(far.x * 1920))
  })
  it('passes over a nearer face that the edge cuts off, and falls back to it when no face is whole', () => {
    const cut = { x: 0, y: 0.1, width: 0.3, height: 0.5 }, whole = { x: 0.6, y: 0.3, width: 0.1, height: 0.15 }
    const chosen = selectPhotoSubject(still([cut, whole], 2))!.crop!
    expect(chosen.x).toBeGreaterThanOrEqual(Math.round(0.3 * 1920))
    expect(chosen.x + chosen.width).toBeGreaterThan(Math.round(0.7 * 1920))
    const fallback = selectPhotoSubject(still([cut, { x: 0.9, y: 0.3, width: 0.1, height: 0.15 }], 2))!.crop!
    expect(fallback.x).toBe(0)
    expect(fallback.x + fallback.width).toBeLessThanOrEqual(Math.round(0.9 * 1920))
  })
  it('keeps the subject’s own face when faces overlap', () => {
    const behind = { x: 0.45, y: 0.05, width: 0.1, height: 0.15 }
    const { crop } = selectPhotoSubject(still([near, behind], 2))!
    expect(crop!.x).toBeLessThanOrEqual(Math.round((near.x - 0.25 * near.width) * 1920))
    expect(crop!.x + crop!.width).toBeGreaterThanOrEqual(Math.round((near.x + 1.25 * near.width) * 1920))
  })
})
describe('snapshot face boxes', () => {
  const base = { dataUrl: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]).toString('base64')}`, width: 1920, height: 1080 }
  it('accepts bounded boxes and rejects malformed ones', () => {
    expect(isCameraSnapshot(base)).toBe(true)
    expect(isCameraSnapshot({ ...base, faceCount: 2, faces: [near, { x: 0, y: 0, width: 1, height: 1 }] })).toBe(true)
    for (const faces of [[{ ...near, id: 1 }], [{ ...near, x: -0.1 }], [{ ...near, width: 0 }], [{ ...near, x: 0.9 }],
      [{ ...near, y: Number.NaN }], Array.from({ length: 17 }, () => near), 'faces', [null]]) {
      expect(isCameraSnapshot({ ...base, faces })).toBe(false)
    }
    expect(isCameraSnapshot({ ...base, extra: 1 })).toBe(false)
  })
})
