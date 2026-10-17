import { describe, it, expect, vi } from 'vitest'
import { createMemoryInterpreter } from '../../src/main/memory/intent'
const result = { confirmation: 'yes', authorized: false, name: '', language: 'en' }
const response = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
] }))
describe('Main memory interpretation transport', () => {
  it.each([
    ['body_oversized', 'PRIVATE'.repeat(10000)],
    ['envelope_invalid', '{PRIVATE'],
    ['completion_invalid', JSON.stringify({ status: 'incomplete', output: [] })],
    ['final_output_invalid', JSON.stringify({ status: 'completed', output: [{ type: 'message', phase: 'commentary', content: [] }] })],
    ['payload_invalid', JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{PRIVATE' }] }] })],
  ])('reports only the bounded validation stage %s', async (stage, body) => {
    const report = vi.fn()
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', report,
      fetchImpl: async () => new Response(body) })
    await expect(interpret({ task: 'request', text: 'Synthetic request.' }, new AbortController().signal)).rejects.toThrow(/^memory_interpretation_schema$/)
    const boundary = stage === 'body_oversized' ? 'body' : stage.replace(/_invalid$/, '')
    expect(report.mock.calls).toEqual([[`memory_interpretation_${stage}`], [expect.stringMatching(new RegExp(
      `^memory_interpretation_failed_${boundary}_http_200_status_(none|completed|incomplete)_bytes_${Math.min(Buffer.byteLength(body), 65537)}_ms_\\d{1,4}$`))]])
    expect(JSON.stringify(report.mock.calls)).not.toContain('PRIVATE')
  })
  it.each([
    ['incomplete', 'incomplete'], ['failed', 'failed'], ['PRIVATE PROVIDER STATUS', 'unknown'],
  ])('bounds completion status diagnostics for %s without accepting an assessment', async (status, expected) => {
    const report = vi.fn(), body = JSON.stringify({ status, output: [] })
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', report,
      fetchImpl: async () => new Response(body) })
    await expect(interpret({ task: 'introduction', text: 'PRIVATE INTRODUCTION' }, new AbortController().signal)).rejects.toThrow('memory_interpretation_schema')
    expect(report).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^memory_interpretation_failed_completion_http_200_status_${expected}_bytes_\\d{1,5}_ms_\\d{1,4}$`)))
    expect(JSON.stringify(report.mock.calls)).not.toContain('PRIVATE')
  })
  it('reports an HTTP status without reading or reporting the error body', async () => {
    const report = vi.fn()
    const response = new Response('PRIVATE PROVIDER ERROR', { status: 429 })
    const read = vi.spyOn(response.body!, 'getReader')
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', report,
      fetchImpl: async () => response })
    await expect(interpret({ task: 'request', text: 'PRIVATE REQUEST' }, new AbortController().signal)).rejects.toThrow('memory_interpretation_http')
    expect(read).not.toHaveBeenCalled()
    expect(report.mock.calls).toEqual([[expect.stringMatching(/^memory_interpretation_failed_dispatch_http_429_status_none_bytes_0_ms_\d{1,4}$/)]])
    expect(JSON.stringify(report.mock.calls)).not.toContain('PRIVATE')
  })
  it('accepts a bounded large provider envelope without returning its extra content', async () => {
    const report = vi.fn()
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', report,
      fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', metadata: { synthetic: 'x'.repeat(12000) }, output: [
        { type: 'reasoning', encrypted_content: 'synthetic opaque metadata' },
        { type: 'message', phase: 'final_answer', content: [{ type: 'output_text', text: JSON.stringify(result) }] },
      ] })) })
    expect(await interpret({ task: 'request', text: 'Synthetic request.' }, new AbortController().signal)).toEqual(result)
    expect(report).not.toHaveBeenCalled()
  })
  it('bounds the final assessment separately even inside a valid envelope', async () => {
    const report = vi.fn()
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', report,
      fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output: [
        { type: 'message', content: [{ type: 'output_text', text: ' '.repeat(2049) + JSON.stringify(result) }] },
      ] })) })
    await expect(interpret({ task: 'request', text: 'Synthetic request.' }, new AbortController().signal)).rejects.toThrow('memory_interpretation_schema')
    expect(report).toHaveBeenCalledWith('memory_interpretation_payload_invalid')
  })
  it('uses only the final assessment when a provider also emits commentary', async () => {
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured',
      fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output: [
        { type: 'message', phase: 'commentary', content: [{ type: 'output_text', text: JSON.stringify({ ...result, authorized: true }) }] },
        { type: 'message', phase: 'final_answer', content: [{ type: 'output_text', text: JSON.stringify(result) }] },
      ] })) })
    await expect(interpret({ task: 'request', text: 'Synthetic request.' }, new AbortController().signal)).resolves.toEqual(result)
  })
  it.each(['commentary', 'unknown'])('never authorizes from an explicit %s phase without a final assessment', async phase => {
    const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured',
      fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output: [
        { type: 'message', phase, content: [{ type: 'output_text', text: JSON.stringify({ ...result, authorized: true }) }] },
      ] })) })
    await expect(interpret({ task: 'request', text: 'Synthetic request.' }, new AbortController().signal)).rejects.toThrow(/^memory_interpretation_schema$/)
  })
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
    { fetchImpl: async () => new Response('x'.repeat(65537)), code: 'memory_interpretation_schema' },
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
    const report = vi.fn()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    try {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(Error('PRIVATE FIXTURE')), { once: true })
      }))
      const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl, report })
      const pending = interpret({ task: 'confirmation', text: 'yes' }, caller.signal)
      const rejected = expect(pending).rejects.toThrow(new RegExp(`^memory_interpretation_${cause}$`))
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce())
      expect(timeout).toHaveBeenCalledWith(8000)
      ;(cause === 'timeout' ? deadline : caller).abort(Error('PRIVATE FIXTURE'))
      await rejected
      expect(report.mock.calls).toEqual([[expect.stringMatching(/^memory_interpretation_failed_dispatch_http_0_status_none_bytes_0_ms_\d{1,4}$/)]])
      expect(JSON.stringify(report.mock.calls)).not.toContain('PRIVATE')
    } finally { timeout.mockRestore() }
  })
  it('identifies a deadline during body delivery and retains the eight-second limit', async () => {
    const deadline = new AbortController(), report = vi.fn()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    let reading = false
    try {
      const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', report,
        fetchImpl: async (_url, init) => new Response(new ReadableStream({
          start(controller) { init!.signal!.addEventListener('abort', () => controller.error(Error('PRIVATE BODY ERROR')), { once: true }) },
          pull(controller) { reading = true; controller.enqueue(new TextEncoder().encode('{')); return new Promise(() => {}) },
        }, { highWaterMark: 0 })) })
      const pending = interpret({ task: 'confirmation', text: 'PRIVATE ANSWER' }, new AbortController().signal)
      const rejected = expect(pending).rejects.toThrow(/^memory_interpretation_timeout$/)
      await vi.waitFor(() => expect(reading).toBe(true))
      expect(timeout).toHaveBeenCalledWith(8000)
      deadline.abort(Error('PRIVATE REASON'))
      await rejected
      expect(report.mock.calls).toEqual([[expect.stringMatching(/^memory_interpretation_failed_body_http_200_status_none_bytes_1_ms_\d{1,4}$/)]])
      expect(JSON.stringify(report.mock.calls)).not.toContain('PRIVATE')
    } finally { timeout.mockRestore() }
  })
})
