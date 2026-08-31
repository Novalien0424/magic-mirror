import { describe, expect, it, vi } from 'vitest'
import { probePendingVisualAsset } from '../../../src/renderer/console/visual-asset-probe'
import type { PendingVisualAsset } from '../../../src/shared/types'

const base: PendingVisualAsset = {
  token: '0123456789abcdef01234567',
  assetId: 'visual-0123456789abcdef01234567',
  name: 'Synthetic visual',
  kind: 'image',
  mimeType: 'image/png',
  byteLength: 1024,
  sha256: 'a'.repeat(64),
}

describe('visual asset Chromium probe', () => {
  it('returns decoded image dimensions and never exposes a source path', async () => {
    const image = {
      naturalWidth: 1080,
      naturalHeight: 1920,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      set src(value: string) {
        expect(value).toBe('magic-mirror-media://visual-pending/0123456789abcdef01234567')
        queueMicrotask(() => this.onload?.())
      },
    }

    const probe = await probePendingVisualAsset(base, {
      createImage: () => image,
      createVideo: () => { throw new Error('video factory should not run') },
    })

    expect(probe).toEqual({ width: 1080, height: 1920, audioTrack: 'absent' })
  })

  it('requires a decoded video frame and reports finite integer metadata with unknown audio', async () => {
    const pause = vi.fn()
    const removeAttribute = vi.fn()
    const load = vi.fn()
    const video = {
      preload: '',
      muted: false,
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 12.345,
      onloadeddata: null as (() => void) | null,
      onerror: null as (() => void) | null,
      pause,
      removeAttribute,
      load,
      set src(value: string) {
        expect(value).toBe('magic-mirror-media://visual-pending/0123456789abcdef01234567')
        queueMicrotask(() => this.onloadeddata?.())
      },
    }

    const probe = await probePendingVisualAsset({ ...base, kind: 'video', mimeType: 'video/webm' }, {
      createImage: () => { throw new Error('image factory should not run') },
      createVideo: () => video,
    })

    expect(probe).toEqual({ width: 1920, height: 1080, durationMs: 12_345, audioTrack: 'unknown' })
    expect(pause).toHaveBeenCalledOnce()
    expect(removeAttribute).toHaveBeenCalledWith('src')
    expect(load).toHaveBeenCalledOnce()
  })

  it('rejects decode failure and timeout with stable content-free reasons', async () => {
    const failedImage = {
      naturalWidth: 0,
      naturalHeight: 0,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      set src(_value: string) { queueMicrotask(() => this.onerror?.()) },
    }
    await expect(probePendingVisualAsset(base, {
      createImage: () => failedImage,
      createVideo: () => { throw new Error('unused') },
    })).rejects.toThrow('visual_asset_decode_failed')

    const waitingImage = {
      naturalWidth: 0,
      naturalHeight: 0,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      set src(_value: string) {},
    }
    await expect(probePendingVisualAsset(base, {
      createImage: () => waitingImage,
      createVideo: () => { throw new Error('unused') },
      schedule: (callback) => { queueMicrotask(callback); return 1 },
      clear: () => undefined,
    })).rejects.toThrow('visual_asset_probe_timeout')
  })
})
