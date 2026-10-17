import { describe, expect, it, vi } from 'vitest'
import { classifyImageFailure, createCodexImageProvider, imageMimeType } from '../../src/main/studio/image-provider'
import type { ChatgptCredentialSource } from '../../src/main/chatgpt-auth/token-file'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)])
const settings = { baseUrl: 'https://chatgpt.com/backend-api/codex/', modelId: 'gpt-image-2.5-flare', size: '1024x1536', timeoutMs: 5000, originator: 'magic_mirror', userAgent: 'MagicMirror/test' }
const ok = () => new Response(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] }))
function credentials(overrides: Partial<ChatgptCredentialSource> = {}): ChatgptCredentialSource {
  return { get: async () => ({ accessToken: 'token-a', accountId: 'acct-1' }), refreshAfterRejection: async () => ({ accessToken: 'token-b', accountId: 'acct-1' }),
    status: async () => ({ status: 'signed_in' }), ...overrides }
}

describe('Codex backend portrait image provider', () => {
  it('posts the configured model, portrait size and account headers, and returns the decoded image', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok())
    const result = await createCodexImageProvider({ credentials: credentials(), settings, fetchImpl: fetchImpl as unknown as typeof fetch })
      .generate({ prompt: 'p', quality: 'medium' })
    expect(result).toMatchObject({ ok: true, mimeType: 'image/png' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://chatgpt.com/backend-api/codex/images/generations')
    expect(JSON.parse(init!.body as string)).toEqual({ prompt: 'p', model: 'gpt-image-2.5-flare', n: 1, quality: 'medium', size: '1024x1536', background: 'opaque' })
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer token-a', 'ChatGPT-Account-ID': 'acct-1', originator: 'magic_mirror' })
  })

  it('sends edits with the previous image as a data URL', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok())
    await createCodexImageProvider({ credentials: credentials(), settings, fetchImpl: fetchImpl as unknown as typeof fetch })
      .edit({ prompt: 'change', image: PNG, mimeType: 'image/png', quality: 'low' })
    expect(fetchImpl.mock.calls[0]![0]).toMatch(/\/images\/edits$/)
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).images[0].image_url).toMatch(/^data:image\/png;base64,/)
  })

  it('refreshes once after a 401 and retries with the new token', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(ok())
    const result = await createCodexImageProvider({ credentials: credentials(), settings, fetchImpl }).generate({ prompt: 'p', quality: 'medium' })
    expect(result.ok).toBe(true)
    expect(fetchImpl.mock.calls[1]![1].headers.Authorization).toBe('Bearer token-b')
    const always401 = vi.fn(async () => new Response('', { status: 401 }))
    expect(await createCodexImageProvider({ credentials: credentials(), settings, fetchImpl: always401 }).generate({ prompt: 'p', quality: 'medium' }))
      .toMatchObject({ ok: false, code: 'studio_auth_required' })
    expect(always401).toHaveBeenCalledTimes(2)
  })

  it('maps provider failures to metadata codes without leaking error text', async () => {
    expect(classifyImageFailure(429, '')).toBe('studio_quota_exhausted')
    expect(classifyImageFailure(400, '{"error":{"code":"moderation_blocked"}}')).toBe('studio_image_refused')
    expect(classifyImageFailure(400, '{"error":{"message":"Unsupported model"}}')).toBe('studio_model_rejected')
    expect(classifyImageFailure(503, 'x')).toBe('studio_image_unavailable')
    expect(classifyImageFailure(400, 'odd')).toBe('studio_provider_contract')
    const shape = await createCodexImageProvider({ credentials: credentials(), settings, fetchImpl: async () => new Response('{"data":[]}') })
      .generate({ prompt: 'p', quality: 'medium' })
    expect(shape).toMatchObject({ ok: false, code: 'studio_provider_contract' })
    expect(JSON.stringify(shape)).not.toContain('data')
  })

  it('fails as auth-required without credentials, retries one network error, and distinguishes cancellation', async () => {
    expect(await createCodexImageProvider({ credentials: credentials({ get: async () => null }), settings, fetchImpl: vi.fn() })
      .generate({ prompt: 'p', quality: 'medium' })).toMatchObject({ ok: false, code: 'studio_auth_required' })
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(ok())
    expect((await createCodexImageProvider({ credentials: credentials(), settings, fetchImpl: flaky }).generate({ prompt: 'p', quality: 'medium' })).ok).toBe(true)
    const controller = new AbortController()
    const hanging = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')))))
    const pending = createCodexImageProvider({ credentials: credentials(), settings, fetchImpl: hanging as unknown as typeof fetch }).generate({ prompt: 'p', quality: 'medium', signal: controller.signal })
    controller.abort()
    expect(await pending).toMatchObject({ ok: false, code: 'studio_cancelled' })
  })

  it('recognizes image formats by signature', () => {
    expect(imageMimeType(PNG)).toBe('image/png')
    expect(imageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(imageMimeType(Buffer.from('not an image'))).toBeNull()
  })
})
