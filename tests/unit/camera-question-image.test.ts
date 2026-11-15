import { describe, expect, it, vi } from 'vitest'
import { CAMERA_QUESTION_MAX_DATA_URL_LENGTH, isCameraSnapshot } from '../../src/shared/camera-tracking'

vi.mock('electron', () => ({ nativeImage: { createFromDataURL: () => { throw Error('unexpected decode') } } }))
const { fitCameraQuestionImage } = await import('../../src/main/camera/question-image')

function jpeg(byteLength: number): Buffer {
  // Synthetic marker bytes only; no captured image.
  const bytes = Buffer.alloc(byteLength, 0xff)
  bytes.set([0xff, 0xd8, 0xff]); bytes.set([0xff, 0xd9], byteLength - 2)
  return bytes
}
const frame = (byteLength: number) => ({ dataUrl: `data:image/jpeg;base64,${jpeg(byteLength).toString('base64')}`, width: 1920, height: 1080, faceCount: 0 })
/** Encoded size falls with quality and area, like a real JPEG. */
function image(bytesAtFull: number, width = 1920, height = 1080, log: string[] = []) {
  return {
    isEmpty: () => false, getSize: () => ({ width, height }),
    toJPEG: (quality: number) => { log.push(`${width}@${quality}`); return jpeg(Math.round(bytesAtFull * quality / 100 * (width / 1920) ** 2)) },
    resize: (options: { width: number }) => image(bytesAtFull, options.width, Math.round(options.width * 1080 / 1920), log),
  }
}

describe('camera question picture fits the Realtime connection', () => {
  it('keeps the camera picture untouched when it already fits', () => {
    const small = frame(150_000)
    expect(fitCameraQuestionImage(small) === small).toBe(true)
  })
  it('keeps full size and lowers only the quality when that is enough', () => {
    const log: string[] = [], fitted = fitCameraQuestionImage(frame(358_671), () => image(260_000, 1920, 1080, log) as never)!
    expect(fitted).toMatchObject({ width: 1920, height: 1080, faceCount: 0 })
    expect(fitted.dataUrl.length).toBeLessThanOrEqual(CAMERA_QUESTION_MAX_DATA_URL_LENGTH)
    expect(isCameraSnapshot(fitted)).toBe(true)
    expect(log).toEqual(['1920@85', '1920@75', '1920@65'])
  })
  it('shrinks only when the lowest quality at full size is still too large', () => {
    const log: string[] = [], fitted = fitCameraQuestionImage(frame(2_000_000), () => image(600_000, 1920, 1080, log) as never)!
    expect(fitted).toMatchObject({ width: 1440, height: 810 })
    expect(fitted.dataUrl.length).toBeLessThanOrEqual(CAMERA_QUESTION_MAX_DATA_URL_LENGTH)
    expect(log.slice(0, 6).every(step => step.startsWith('1920@'))).toBe(true)
  })
  it('returns null for an undecodable or unfittable picture', () => {
    expect(fitCameraQuestionImage(frame(400_000), () => ({ isEmpty: () => true }) as never)).toBeNull()
    expect(fitCameraQuestionImage(frame(4_000_000), () => image(40_000_000) as never)).toBeNull()
  })
})
