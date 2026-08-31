import type { PendingVisualAsset, VisualAssetProbe } from '../../shared/types'

interface ProbeImageElement {
  src: string
  readonly naturalWidth: number
  readonly naturalHeight: number
  onload: (() => void) | null
  onerror: (() => void) | null
}

interface ProbeVideoElement {
  src: string
  preload: string
  muted: boolean
  readonly videoWidth: number
  readonly videoHeight: number
  readonly duration: number
  onloadeddata: (() => void) | null
  onerror: (() => void) | null
  pause(): void
  removeAttribute(name: string): void
  load(): void
}

export interface VisualAssetProbeDependencies {
  readonly createImage?: () => ProbeImageElement
  readonly createVideo?: () => ProbeVideoElement
  readonly schedule?: (callback: () => void, delayMs: number) => unknown
  readonly clear?: (handle: unknown) => void
}

const PROBE_TIMEOUT_MS = 10_000

function pendingUrl(token: string): string {
  return `magic-mirror-media://visual-pending/${encodeURIComponent(token)}`
}

export function probePendingVisualAsset(
  candidate: PendingVisualAsset,
  dependencies: VisualAssetProbeDependencies = {},
): Promise<VisualAssetProbe> {
  const schedule = dependencies.schedule ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
  const clear = dependencies.clear ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>))

  return new Promise((resolve, reject) => {
    let settled = false
    let cleanup = (): void => undefined
    const timer = schedule(() => finishError('visual_asset_probe_timeout'), PROBE_TIMEOUT_MS)

    const finish = (probe: VisualAssetProbe): void => {
      if (settled) return
      settled = true
      clear(timer)
      cleanup()
      resolve(probe)
    }
    function finishError(reason: 'visual_asset_probe_timeout' | 'visual_asset_decode_failed'): void {
      if (settled) return
      settled = true
      clear(timer)
      cleanup()
      reject(new Error(reason))
    }

    if (candidate.kind === 'image') {
      const image = (dependencies.createImage ?? (() => new Image()))()
      cleanup = () => {
        image.onload = null
        image.onerror = null
      }
      image.onload = () => {
        const width = image.naturalWidth
        const height = image.naturalHeight
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
          finishError('visual_asset_decode_failed')
          return
        }
        finish({ width, height, audioTrack: 'absent' })
      }
      image.onerror = () => finishError('visual_asset_decode_failed')
      image.src = pendingUrl(candidate.token)
      return
    }

    const video = (dependencies.createVideo ?? (() => document.createElement('video')))()
    cleanup = () => {
      video.onloadeddata = null
      video.onerror = null
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    video.preload = 'auto'
    video.muted = true
    video.onloadeddata = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      const durationMs = Math.round(video.duration * 1000)
      if (
        !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
        || !Number.isSafeInteger(durationMs) || durationMs < 1
      ) {
        finishError('visual_asset_decode_failed')
        return
      }
      finish({ width, height, durationMs, audioTrack: 'unknown' })
    }
    video.onerror = () => finishError('visual_asset_decode_failed')
    video.src = pendingUrl(candidate.token)
  })
}
