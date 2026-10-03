import type { CameraTarget } from '../../shared/camera-tracking'

interface FaceBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
const area = (box: FaceBox): number => box.width * box.height
const center = (box: FaceBox): [number, number] => [box.x + box.width / 2, box.y + box.height / 2]
const distance = (a: FaceBox, b: FaceBox): number => {
  const [ax, ay] = center(a), [bx, by] = center(b)
  return Math.hypot(ax - bx, ay - by)
}

export function parseCameraFrame(value: unknown): readonly FaceBox[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).sort().join(',') !== 'faces,type' || v.type !== 'faces'
    || !Array.isArray(v.faces) || v.faces.length > 16) return null
  for (const box of v.faces) {
    if (!box || typeof box !== 'object' || Array.isArray(box)
      || Object.keys(box).sort().join(',') !== 'height,width,x,y'
      || !Object.values(box).every(n => typeof n === 'number' && Number.isFinite(n))
      || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0
      || box.x + box.width > 1.000001 || box.y + box.height > 1.000001) return null
  }
  return v.faces as FaceBox[]
}

export function createNearestFaceTracker(): {
  update(faces: readonly FaceBox[], now: number): CameraTarget | null
  reset(): void
} {
  let selected: FaceBox | null = null
  let challenger: FaceBox | null = null
  let challengerSince = 0
  let lastTime = -Infinity
  const target = (): CameraTarget | null => selected === null ? null : {
    x: Number((2 * center(selected)[0] - 1).toFixed(6)),
    y: Number((1 - 2 * center(selected)[1]).toFixed(6)),
  }
  const reset = (): void => { selected = null; challenger = null; lastTime = -Infinity }
  return {
    reset,
    update(faces, now) {
      if (!Number.isFinite(now) || now < lastTime) return target()
      lastTime = now
      if (!faces.length) { selected = null; challenger = null; return null }
      const largest = faces.reduce((a, b) => area(a) >= area(b) ? a : b)
      const old = selected
      const continuing = old === null ? undefined
        : faces.filter(box => distance(box, old) < 0.18).sort((a, b) => distance(a, old) - distance(b, old))[0]
      if (!continuing) { selected = largest; challenger = null; return target() }
      selected = continuing
      if (largest === continuing || area(largest) < area(continuing) * 1.25) {
        challenger = null
        return target()
      }
      if (challenger === null || distance(largest, challenger) >= 0.18) challengerSince = now
      challenger = largest
      if (now - challengerSince >= 600) { selected = largest; challenger = null }
      return target()
    },
  }
}
