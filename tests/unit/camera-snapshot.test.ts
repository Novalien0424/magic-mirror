import { describe, expect, it } from 'vitest'
import {
  CAMERA_SNAPSHOT_MAX_JPEG_BYTES,
  isCameraSnapshot,
} from '../../src/shared/camera-tracking'

function snapshot(byteLength = 4, width = 1920, height = 1080) {
  // Synthetic marker bytes only; no captured image or disk artifact.
  const bytes = Buffer.alloc(byteLength, 0xff)
  bytes.set([0xff, 0xd8, 0xff])
  bytes.set([0xff, 0xd9], byteLength - 2)
  return { dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, width, height }
}

describe('RAM-only full-HD camera snapshot validation', () => {
  it.each([[1920, 1080], [1080, 1920], [1440, 1440], [640, 480], [1, 1]])(
    'accepts bounded dimensions %sx%s without requiring upscaling', (width, height) => {
      expect(isCameraSnapshot(snapshot(4, width, height))).toBe(true)
    })

  it.each([
    [1921, 1080], [1080, 1921], [1920, 1081], [1081, 1920], [1441, 1440], [1920, 1920],
    [0, 1080], [-1, 1080], [1920, 0], [1920, -1], [1.5, 1080], [1920, 1.5],
    [NaN, 1080], [1920, Infinity], ['1920', 1080], [1920, null],
  ])('rejects invalid or excessive dimensions %sx%s', (width, height) => {
    expect(isCameraSnapshot({ ...snapshot(), width, height })).toBe(false)
  })

  it.each([-2, -1, 0])('accepts the JPEG byte boundary with offset %s for every padding length', offset => {
    expect(isCameraSnapshot(snapshot(CAMERA_SNAPSHOT_MAX_JPEG_BYTES + offset))).toBe(true)
  })

  it.each([1, 2, 3])('rejects JPEG bytes beyond 4 MiB by %s, including equal base64 lengths', offset => {
    expect(isCameraSnapshot(snapshot(CAMERA_SNAPSHOT_MAX_JPEG_BYTES + offset))).toBe(false)
  })

  it.each([
    '/9j/2Q', '/9j/2Q=', '/9j/2Q===', '/9j/2R==', '/9j/2Q=!', '/9j/2Q==\n',
    '/9j/2Q==AAAA', '/9j/AAAA', '/9k/2Q==', '', 'AAAA',
  ])('rejects malformed base64 or JPEG markers (case %#)', jpeg => {
    expect(isCameraSnapshot({ ...snapshot(), dataUrl: `data:image/jpeg;base64,${jpeg}` })).toBe(false)
  })

  it.each([null, undefined, 1, 'frame', [], {}, { ...snapshot(), unexpected: true },
    { ...snapshot(), dataUrl: 1 }, { ...snapshot(), dataUrl: 'data:image/png;base64,/9j/2Q==' },
    { ...snapshot(), height: undefined }, Object.assign([], snapshot())])(
    'rejects malformed snapshot shape (case %#)', value => {
      expect(isCameraSnapshot(value)).toBe(false)
    })
})
