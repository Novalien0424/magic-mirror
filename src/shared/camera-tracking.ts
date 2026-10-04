/** Transient direction only: no images, embeddings or guest identifiers. */
export interface CameraTarget { readonly x: number; readonly y: number }

/** One requested frame, RAM-only. Never include this object in diagnostics. */
export interface CameraSnapshot { readonly dataUrl: string; readonly width: number; readonly height: number }
export function isCameraSnapshot(value: unknown): value is CameraSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as CameraSnapshot
  return typeof v.dataUrl === 'string' && v.dataUrl.length <= 700000
    && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(v.dataUrl)
    && Number.isInteger(v.width) && v.width > 0 && v.width <= 1280
    && Number.isInteger(v.height) && v.height > 0 && v.height <= 1280
}

export function isCameraTarget(value: unknown): value is CameraTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return Object.keys(v).sort().join(',') === 'x,y'
    && [v.x, v.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1)
}
