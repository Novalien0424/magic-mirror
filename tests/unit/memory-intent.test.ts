import { describe, it, expect, vi } from 'vitest'
import { createMemoryInterpreter } from '../../src/main/memory/intent'
const result = { confirmation: 'yes', authorized: false, name: '', language: 'en' }
const response = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
] }))
describe('Main memory interpretation transport', () => {
  it('uses the configured model and transient structured output without owner identifiers', async () => {
    const fetchImpl = vi.fn(async () => response(result))
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl })
    expect(await interpret({ task: 'confirmation', text: 'Yes, that’s me.', question: 'Are you Alice?' }, new AbortController().signal)).toEqual(result)
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ model: 'configured', store: false, text: { format: { strict: true } } })
    expect(JSON.parse(body.input)).toEqual({ task: 'confirmation', text: 'Yes, that’s me.', question: 'Are you Alice?' })
    expect(body.input).not.toMatch(/owner|profile|avatarId/)
    expect(body.instructions).not.toContain('For request')
    expect(body.instructions).not.toContain('Outside confirmation')
  })
  it.each([{ ...result, confirmation: 'probably' }, { ...result, ownerId: 'forged' }, { ...result, authorized: 'true' }, { ...result, name: 'x'.repeat(81) }])('rejects invalid model output %#', async value => {
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl: async () => response(value) })
    await expect(interpret({ task: 'confirmation', text: 'yes', question: 'Are you Alice?' }, new AbortController().signal)).rejects.toThrow(/^memory_interpretation_schema$/)
  })
  it.each([
    { fetchImpl: async () => { throw Error('PRIVATE FIXTURE') }, code: 'memory_interpretation_unavailable' },
    { fetchImpl: async () => new Response('PRIVATE FIXTURE', { status: 429 }), code: 'memory_interpretation_http' },
    { fetchImpl: async () => new Response('x'.repeat(8193)), code: 'memory_interpretation_schema' },
    { fetchImpl: async () => new Response('{PRIVATE FIXTURE'), code: 'memory_interpretation_schema' },
    { fetchImpl: async () => new Response(JSON.stringify({ status: 'incomplete', output: [] })), code: 'memory_interpretation_schema' },
  ])('keeps $code content-free', async ({ fetchImpl, code }) => {
      const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl })
      await expect(interpret({ task: 'confirmation', text: 'yes' }, new AbortController().signal)).rejects.toThrow(new RegExp(`^${code}$`))
  })
  it('distinguishes cancellation before dispatch without exposing signal reasons', async () => {
    const fetchImpl = vi.fn(), interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl })
    await expect(interpret({ task: 'confirmation', text: 'yes' }, AbortSignal.abort(Error('PRIVATE FIXTURE')))).rejects.toThrow(/^memory_interpretation_cancelled$/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each(['timeout', 'cancelled'] as const)('distinguishes an in-flight %s from a provider error', async cause => {
    const deadline = new AbortController(), caller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    try {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(Error('PRIVATE FIXTURE')), { once: true })
      }))
      const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl })
      const pending = interpret({ task: 'confirmation', text: 'yes' }, caller.signal)
      const rejected = expect(pending).rejects.toThrow(new RegExp(`^memory_interpretation_${cause}$`))
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce())
      expect(timeout).toHaveBeenCalledWith(8000)
      ;(cause === 'timeout' ? deadline : caller).abort(Error('PRIVATE FIXTURE'))
      await rejected
    } finally { timeout.mockRestore() }
  })
})
