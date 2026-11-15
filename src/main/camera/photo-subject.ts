import type { CameraFace, CameraSnapshot } from '../../shared/camera-tracking'

export interface PhotoSubject {
  /** Pixel rectangle around the chosen person; absent when the whole picture is used. */
  readonly crop?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

/** A face within this fraction of the picture's edge counts as cut off. */
const EDGE = 0.01
const area = (box: CameraFace): number => box.width * box.height
const full = (box: CameraFace): boolean => box.x >= EDGE && box.y >= EDGE
  && box.x + box.width <= 1 - EDGE && box.y + box.height <= 1 - EDGE

/**
 * Whose photo this is (owner 11-15): several people may be in view; the picture follows the
 * nearest person (largest face) whose whole face is inside the frame, else the nearest face.
 * One person keeps the whole picture. Several are cropped to that person at the camera's own
 * pixels, with the sides drawn in so that a neighbour's face is left out where the two do not
 * overlap. Null: no clear face. A still without boxes (QA fixtures) is used whole with one face.
 */
export function selectPhotoSubject(frame: Pick<CameraSnapshot, 'width' | 'height' | 'faceCount' | 'faces'>): PhotoSubject | null {
  const faces = frame.faces
  if (!faces) return frame.faceCount === 1 ? {} : null
  if (!faces.length) return null
  if (faces.length === 1) return {}
  const whole = faces.filter(full)
  const subject = (whole.length ? whole : faces).reduce((a, b) => area(a) >= area(b) ? a : b)
  // Vision's box spans brow to chin: leave room for hair above and shoulders below.
  let left = subject.x - subject.width, right = subject.x + 2 * subject.width
  const top = subject.y - 0.9 * subject.height, bottom = subject.y + 3.1 * subject.height
  const keep = 0.25 * subject.width
  for (const other of faces) {
    if (other === subject || other.y >= bottom || other.y + other.height <= top) continue
    if (other.x + other.width / 2 < subject.x + subject.width / 2) left = Math.max(left, Math.min(other.x + other.width, subject.x - keep))
    else right = Math.min(right, Math.max(other.x, subject.x + subject.width + keep))
  }
  const x = Math.max(0, Math.round(left * frame.width)), y = Math.max(0, Math.round(top * frame.height))
  const width = Math.min(frame.width, Math.round(right * frame.width)) - x
  const height = Math.min(frame.height, Math.round(bottom * frame.height)) - y
  return width > 0 && height > 0 ? { crop: { x, y, width, height } } : null
}
