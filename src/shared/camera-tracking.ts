/** Transient direction only: no images, embeddings or guest identifiers. */
export interface CameraTarget { readonly x: number; readonly y: number }

/** One requested frame, RAM-only. Never include this object in diagnostics. */
export interface CameraSnapshot { readonly dataUrl: string; readonly width: number; readonly height: number }
// Keep the native JPEG encoder's bounds in deploy/macos/camera-tracker.swift aligned.
export const CAMERA_SNAPSHOT_MAX_DIMENSION = 1920
export const CAMERA_SNAPSHOT_MAX_PIXELS = 1920 * 1080
export const CAMERA_SNAPSHOT_MAX_JPEG_BYTES = 4 * 1024 * 1024
export const CAMERA_SNAPSHOT_MAX_BASE64_LENGTH = 4 * Math.ceil(CAMERA_SNAPSHOT_MAX_JPEG_BYTES / 3)
/** UTF-8 JSON frame, including its terminating newline. */
export const CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES = 6 * 1024 * 1024
const SNAPSHOT_DATA_URL_PREFIX = 'data:image/jpeg;base64,'

export function isCameraSnapshotDimensions(width: unknown, height: unknown): boolean {
  return typeof width === 'number' && Number.isInteger(width) && width > 0 && width <= CAMERA_SNAPSHOT_MAX_DIMENSION
    && typeof height === 'number' && Number.isInteger(height) && height > 0 && height <= CAMERA_SNAPSHOT_MAX_DIMENSION
    && width * height <= CAMERA_SNAPSHOT_MAX_PIXELS
}

export function isCameraSnapshot(value: unknown): value is CameraSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as CameraSnapshot
  if (Object.keys(v).sort().join(',') !== 'dataUrl,height,width'
    || !isCameraSnapshotDimensions(v.width, v.height)
    || typeof v.dataUrl !== 'string' || v.dataUrl.length > SNAPSHOT_DATA_URL_PREFIX.length + CAMERA_SNAPSHOT_MAX_BASE64_LENGTH
    || !v.dataUrl.startsWith(SNAPSHOT_DATA_URL_PREFIX)) return false
  const jpeg = v.dataUrl.slice(SNAPSHOT_DATA_URL_PREFIX.length)
  if (jpeg.length % 4 !== 0 || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(jpeg)) return false
  const padding = jpeg.endsWith('==') ? 2 : jpeg.endsWith('=') ? 1 : 0
  if (jpeg.length / 4 * 3 - padding > CAMERA_SNAPSHOT_MAX_JPEG_BYTES) return false
  // Reject noncanonical padding bits; check JPEG's end marker without decoding the full image.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  if (padding && (alphabet.indexOf(jpeg[jpeg.length - padding - 1]!) & ((1 << (padding * 2)) - 1)) !== 0) return false
  return atob(jpeg.slice(-8)).endsWith('\xff\xd9')
}

export function isCameraTarget(value: unknown): value is CameraTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return Object.keys(v).sort().join(',') === 'x,y'
    && [v.x, v.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1)
}
