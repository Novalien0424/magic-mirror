import { nativeImage, type NativeImage } from 'electron'
import { CAMERA_QUESTION_MAX_DATA_URL_LENGTH, type CameraSnapshot } from '../../shared/camera-tracking'

const PREFIX = 'data:image/jpeg;base64,'
/** Full size first, lowering only the JPEG quality; a smaller picture only if that cannot fit. */
const STEPS: readonly (readonly [scale: number, qualities: readonly number[]])[] = [
  [1, [85, 75, 65, 55, 45, 35]], [0.75, [75, 60, 45]], [0.5, [75, 60, 45]],
]

/**
 * A camera question's picture travels to the voice model over the Realtime connection, which
 * refuses one message above about 256 KiB (11-15: a 359 KB full-HD daylight picture was refused
 * and Raven stayed silent). The camera's own picture is kept when it fits. The photo used for
 * portrait art does not pass here and keeps the camera's full quality. RAM only.
 */
export function fitCameraQuestionImage(frame: CameraSnapshot,
  decode: (dataUrl: string) => NativeImage = nativeImage.createFromDataURL): CameraSnapshot | null {
  if (frame.dataUrl.length <= CAMERA_QUESTION_MAX_DATA_URL_LENGTH) return frame
  const image = decode(frame.dataUrl)
  if (image.isEmpty()) return null
  for (const [scale, qualities] of STEPS) {
    const source = scale === 1 ? image : image.resize({ width: Math.round(frame.width * scale), quality: 'best' })
    for (const quality of qualities) {
      const dataUrl = PREFIX + source.toJPEG(quality).toString('base64')
      if (dataUrl.length > CAMERA_QUESTION_MAX_DATA_URL_LENGTH) continue
      const size = source.getSize()
      return { dataUrl, width: size.width, height: size.height, ...(frame.faceCount === undefined ? {} : { faceCount: frame.faceCount }) }
    }
  }
  return null
}
