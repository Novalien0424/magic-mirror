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
    await expect(interpret({ task: 'confirmation', text: 'yes', question: 'Are you Alice?' }, new AbortController().signal)).rejects.toThrow('memory_interpretation_unavailable')
  })
  it('fails content-free on network errors, cancellation and oversized output', async () => {
    for (const fetchImpl of [async () => { throw Error('PRIVATE FIXTURE') }, async () => new Response('x'.repeat(8193))]) {
      const interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl })
      await expect(interpret({ task: 'confirmation', text: 'yes' }, new AbortController().signal)).rejects.toThrow(/^memory_interpretation_unavailable$/)
    }
    const fetchImpl = vi.fn(), interpret = createMemoryInterpreter({ credentialSource: { get: async () => 'synthetic' }, model: async () => 'configured', fetchImpl })
    await expect(interpret({ task: 'confirmation', text: 'yes' }, AbortSignal.abort())).rejects.toThrow('memory_interpretation_unavailable')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
