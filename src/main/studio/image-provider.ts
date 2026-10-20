import { randomUUID } from 'node:crypto'
import type { ChatgptCredential, ChatgptCredentialSource } from '../chatgpt-auth/token-file'
import type { StudioImageFailure, StudioPictureType, StudioQuality } from '../../shared/portrait-studio'

export interface PortraitImageSettings {
  readonly baseUrl: string
  readonly modelId: string
  readonly size: string
  readonly stickerSize: string
  readonly timeoutMs: number
  readonly originator: string
  readonly userAgent: string
}
export type PortraitImageResult =
  | { readonly ok: true; readonly image: Buffer; readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; readonly elapsedMs: number }
  | { readonly ok: false; readonly code: StudioImageFailure; readonly httpStatus?: number; readonly elapsedMs: number }
export interface PortraitImageProvider {
  generate(input: { prompt: string; quality: StudioQuality; picture: StudioPictureType; signal?: AbortSignal }): Promise<PortraitImageResult>
  edit(input: { prompt: string; image: Buffer; mimeType: string; quality: StudioQuality; picture: StudioPictureType; signal?: AbortSignal }): Promise<PortraitImageResult>
}

type WithoutElapsed<T> = T extends unknown ? Omit<T, 'elapsedMs'> : never
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024
const MAX_ERROR_BYTES = 16 * 1024

export function imageMimeType(image: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (image.length > 8 && image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (image.length > 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'image/jpeg'
  if (image.length > 12 && image.subarray(0, 4).toString('latin1') === 'RIFF' && image.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

async function readBounded(response: Response, limit: number): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) { await reader.cancel(); return null }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}

/** Classifies provider errors into metadata codes; error text never leaves this function. */
export function classifyImageFailure(status: number, body: string): StudioImageFailure {
  if (status === 401 || status === 403) return 'studio_auth_required'
  if (status === 429) return 'studio_quota_exhausted'
  const text = body.toLowerCase()
  if (status === 400 && /moderation|safety|content[_ ]policy|policy_violation|blocked/.test(text)) return 'studio_image_refused'
  if ((status === 400 || status === 404) && /model/.test(text)) return 'studio_model_rejected'
  if (status >= 500) return 'studio_image_unavailable'
  return 'studio_provider_contract'
}

/**
 * Portrait generation on the owner's ChatGPT plan through the Codex backend
 * image endpoints (the route OpenClaw and Hermes use; unpublished by OpenAI).
 */
export function createCodexImageProvider(input: {
  credentials: ChatgptCredentialSource
  settings: PortraitImageSettings
  fetchImpl?: typeof fetch
  now?: () => number
  report?: (reason: string) => void
}): PortraitImageProvider {
  const now = input.now ?? Date.now
  const report = (reason: string) => { try { input.report?.(reason) } catch { /* diagnostics only */ } }

  async function post(path: 'images/generations' | 'images/edits', body: Record<string, unknown>, signal?: AbortSignal): Promise<PortraitImageResult> {
    const started = now()
    const done = (result: WithoutElapsed<PortraitImageResult>): PortraitImageResult => ({ ...result, elapsedMs: now() - started })
    let credential: ChatgptCredential | null = await input.credentials.get()
    if (!credential) return done({ ok: false, code: 'studio_auth_required' })
    const deadline = AbortSignal.timeout(input.settings.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    let refreshed = false, retriedNetwork = false
    while (true) {
      if (signal?.aborted) return done({ ok: false, code: 'studio_cancelled' })
      let response: Response
      try {
        response = await (input.fetchImpl ?? fetch)(`${input.settings.baseUrl.replace(/\/+$/, '')}/${path}`, {
          method: 'POST', signal: combined,
          headers: {
            Authorization: `Bearer ${credential.accessToken}`, 'ChatGPT-Account-ID': credential.accountId,
            originator: input.settings.originator, 'User-Agent': input.settings.userAgent,
            'x-codex-image-turn-id': randomUUID(), 'Content-Type': 'application/json', Accept: 'application/json',
          },
          body: JSON.stringify(body),
        })
      } catch {
        if (signal?.aborted) return done({ ok: false, code: 'studio_cancelled' })
        if (deadline.aborted) return done({ ok: false, code: 'studio_image_timeout' })
        // One retry for a connection failure before any response (AGENTS retry limit).
        if (!retriedNetwork) { retriedNetwork = true; report('studio_image_network_retry'); continue }
        return done({ ok: false, code: 'studio_image_unavailable' })
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true
        await response.body?.cancel().catch(() => undefined)
        credential = await input.credentials.refreshAfterRejection(credential)
        if (!credential) return done({ ok: false, code: 'studio_auth_required', httpStatus: 401 })
        continue
      }
      try {
        if (!response.ok) {
          const text = (await readBounded(response, MAX_ERROR_BYTES))?.toString('utf8') ?? ''
          return done({ ok: false, code: classifyImageFailure(response.status, text), httpStatus: response.status })
        }
        const raw = await readBounded(response, MAX_RESPONSE_BYTES)
        if (!raw) return done({ ok: false, code: 'studio_provider_contract', httpStatus: response.status })
        const payload: unknown = JSON.parse(raw.toString('utf8'))
        const encoded = (payload as { data?: { b64_json?: unknown }[] })?.data?.[0]?.b64_json
        if (typeof encoded !== 'string' || !encoded) return done({ ok: false, code: 'studio_provider_contract', httpStatus: response.status })
        const image = Buffer.from(encoded, 'base64')
        const mimeType = imageMimeType(image)
        if (!mimeType) return done({ ok: false, code: 'studio_provider_contract', httpStatus: response.status })
        return done({ ok: true, image, mimeType })
      } catch {
        if (signal?.aborted) return done({ ok: false, code: 'studio_cancelled' })
        if (deadline.aborted) return done({ ok: false, code: 'studio_image_timeout' })
        return done({ ok: false, code: 'studio_provider_contract', httpStatus: response.status })
      }
    }
  }

  // A sticker is a square PNG with a transparent background; a portrait is a tall opaque picture.
  const common = (quality: StudioQuality, picture: StudioPictureType) => ({ model: input.settings.modelId, n: 1, quality,
    ...picture === 'sticker' ? { size: input.settings.stickerSize, background: 'transparent', output_format: 'png' } : { size: input.settings.size, background: 'opaque' } })
  return {
    generate: ({ prompt, quality, picture, signal }) => post('images/generations', { prompt, ...common(quality, picture) }, signal),
    edit: ({ prompt, image, mimeType, quality, picture, signal }) => post('images/edits',
      { prompt, ...common(quality, picture), images: [{ image_url: `data:${mimeType};base64,${image.toString('base64')}` }] }, signal),
  }
}
