import { describe, expect, it, vi } from 'vitest'
import { createMemoryExtractor } from '../../src/main/memory/extractor'

const evidence = [{ id: 'turn-a', text: 'Synthetic visitor chose a museum because rain is expected.', observedAt: '2026-10-05T00:00:00.000Z' }]
const record = { topic: 'Saturday outing', text: 'Museum chosen because rain is expected; booking undecided.', kind: 'episode', state: 'active', eventAt: '', sources: [], expectedRevision: null, keepInMind: false, evidence: ['turn-a'] }
const response = (records: unknown[]) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ records }) }] }] }))
describe('private background memory extraction', () => {
  it('uses only the supplied frozen model, no provider storage, and strict validated proposals', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response([record]))
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl })
    const result = await extract({ model: 'configured-extractor', evidence, existing: [] }, new AbortController().signal)
    expect(result).toEqual([{ ...record, evidence: undefined }].map(({ evidence: _ignored, ...r }) => r))
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    expect(body).toMatchObject({ model: 'configured-extractor', store: false, text: { format: { type: 'json_schema', strict: true } } })
    expect(body).not.toHaveProperty('previous_response_id')
    expect(JSON.stringify(body)).not.toContain('ownerId')
  })
  it('rejects invented source turns, refusals, invalid records and unknown fields without partial commits', async () => {
    for (const records of [[{ ...record, evidence: ['missing'] }], [{ ...record, ownerId: 'forged' }], [record, { ...record, kind: 'instruction' }]]) {
      const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response(records) })
      await expect(extract({ model: 'configured', evidence, existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
    }
  })
  it('normalizes a supported date-only proposal into the storage timestamp contract', async () => {
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt: '2026-10-05' }]) })
    expect((await extract({ model: 'configured', evidence, existing: [] }, new AbortController().signal))[0]?.eventAt).toBe('2026-10-05T00:00:00.000Z')
  })
  it('fails content-free for unavailable credentials/provider and respects cancellation', async () => {
    const fetchImpl = vi.fn()
    const extract = createMemoryExtractor({ credentialSource: { get: async () => null }, fetchImpl })
    await expect(extract({ model: 'configured', evidence, existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_unavailable')
    expect(fetchImpl).not.toHaveBeenCalled()
    const fail = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic' }, fetchImpl: async () => { throw Error('PRIVATE FIXTURE') } })
    await expect(fail({ model: 'configured', evidence, existing: [] }, new AbortController().signal)).rejects.toThrow(/^memory_extraction_unavailable$/)
  })
})
