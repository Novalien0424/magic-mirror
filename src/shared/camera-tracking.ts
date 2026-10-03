/** Transient direction only: no images, embeddings or guest identifiers. */
export interface CameraTarget { readonly x: number; readonly y: number }

export function isCameraTarget(value: unknown): value is CameraTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return Object.keys(v).sort().join(',') === 'x,y'
    && [v.x, v.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1)
}
