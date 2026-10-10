import { describe, expect, it, vi } from 'vitest'
import { createMemoryExtractor } from '../../src/main/memory/extractor'
import type { MemoryEvidence } from '../../src/main/memory/extractor'

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
  it('preserves a calendar-only date without fabricating a midnight instant', async () => {
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt: '2026-10-05' }]) })
    expect((await extract({ model: 'configured', evidence, existing: [] }, new AbortController().signal))[0]?.eventAt).toBe('2026-10-05')
  })
  it('fails content-free for unavailable credentials/provider and respects cancellation', async () => {
    const fetchImpl = vi.fn()
    const extract = createMemoryExtractor({ credentialSource: { get: async () => null }, fetchImpl })
    await expect(extract({ model: 'configured', evidence, existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_unavailable')
    expect(fetchImpl).not.toHaveBeenCalled()
    const fail = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic' }, fetchImpl: async () => { throw Error('PRIVATE FIXTURE') } })
    await expect(fail({ model: 'configured', evidence, existing: [] }, new AbortController().signal)).rejects.toThrow(/^memory_extraction_unavailable$/)
  })
  it('separates historical source time from import time and carries the prior outcome/date for corrections', async () => {
    const historical: MemoryEvidence[] = [{ id: 'old-visitor', text: 'User: I might book next Friday; the earlier plan was cancelled.', observedAt: '2026-10-05T00:00:00.000Z',
      historical: { headings: ['History', 'Conversation 2021-03-08'], sourceAt: '2021-03-08', speaker: 'visitor' } }]
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response([{ ...record, eventAt: '2021-03-12', state: 'resolved', expectedRevision: 2, evidence: ['old-visitor'] }]))
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl })
    const result = await extract({ model: 'configured', evidence: historical, existing: [{ id: 'prior', topic: record.topic, text: 'Earlier tentative plan.', updatedAt: '2026-10-05T00:00:00.000Z', revision: 2, kind: 'commitment', state: 'active', eventAt: '2021-03-10T00:00:00.000Z' }] }, new AbortController().signal)
    expect(result[0]).toMatchObject({ eventAt: '2021-03-12', state: 'resolved', expectedRevision: 2 })
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    const payload = JSON.parse(body.input)
    expect(payload.evidence).toEqual(historical)
    expect(payload.existing[0]).toMatchObject({ revision: 2, kind: 'commitment', state: 'active', eventAt: '2021-03-10T00:00:00.000Z' })
    expect(body.instructions).toMatch(/sourceAt/)
    expect(body.instructions).toMatch(/never.*import time/i)
    expect(body.instructions).toMatch(/completed.*cancelled/i)
    expect(body.instructions).toMatch(/suggestions.*agreement/i)
  })
  it('rejects calendar dates without a historical basis but retains undated relative wording and explicit source dates', async () => {
    const report = vi.fn()
    const historical: MemoryEvidence[] = [{ id: 'old-visitor', text: 'User: I might book next Friday.', observedAt: '2026-10-05T00:00:00.000Z', historical: { headings: ['Undated conversation'], sourceAt: '', speaker: 'visitor' } }]
    const make = (eventAt: string) => createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, report, fetchImpl: async () => response([{ ...record, text: 'Tentative plan for next Friday; source date unknown.', eventAt, evidence: ['old-visitor'] }]) })
    await expect(make('2026-10-09')({ model: 'configured', evidence: historical, existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
    expect(report.mock.calls).toEqual([['memory_extraction_unanchored_date']])
    const result = await make('')({ model: 'configured', evidence: historical, existing: [] }, new AbortController().signal)
    expect(result[0]).toMatchObject({ eventAt: '', text: 'Tentative plan for next Friday; source date unknown.' })
    expect((await make('2021-03-12')({ model: 'configured', evidence: [{ ...historical[0]!, text: 'User: I booked on 2021-03-12.' }], existing: [] }, new AbortController().signal))[0]?.eventAt).toBe('2021-03-12')
  })
  it('requires visitor evidence for assistant suggestions and accepts supported completed or cancelled outcomes', async () => {
    const assistant: MemoryEvidence = { id: 'suggestion', text: 'Assistant: You could book a museum next Friday.', observedAt: '2026-10-05T00:00:00.000Z', historical: { headings: ['History'], sourceAt: '', speaker: 'assistant' } }
    const unsupported = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, evidence: ['suggestion'] }]) })
    await expect(unsupported({ model: 'configured', evidence: [assistant], existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
    for (const outcome of ['completed', 'cancelled']) {
      const visitor: MemoryEvidence = { ...assistant, id: 'agreement', text: `User: I agreed to the booking and later ${outcome} it.`, historical: { ...assistant.historical!, speaker: 'visitor' } }
      const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, text: `Visitor's agreed booking was ${outcome}.`, kind: 'commitment', state: 'resolved', evidence: ['suggestion', 'agreement'] }]) })
      expect((await extract({ model: 'configured', evidence: [assistant, visitor], existing: [] }, new AbortController().signal))[0]).toMatchObject({ kind: 'commitment', state: 'resolved', text: `Visitor's agreed booking was ${outcome}.` })
    }
  })
  it('cannot use an unrelated explicit date or an export heading to invent an undated event date', async () => {
    const historical: MemoryEvidence = { id: 'old-visitor', text: 'User: I travelled on 2021-03-12. I might book next Friday.', observedAt: '2026-10-05T00:00:00.000Z', historical: { headings: ['History'], sourceAt: '', speaker: 'visitor' } }
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt: '2026-10-09', evidence: ['old-visitor'] }]) })
    await expect(extract({ model: 'configured', evidence: [historical], existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
    const fromExport = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt: '2026-10-05', evidence: ['old-visitor'] }]) })
    await expect(fromExport({ model: 'configured', evidence: [{ ...historical, text: '# Exported 2026-10-05\nUser: Maybe next Friday.' }], existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
  })
  it('does not count unknown heading evidence as visitor agreement to an assistant suggestion', async () => {
    const historical: MemoryEvidence[] = [
      { id: 'heading', text: '# History', observedAt: '2026-10-05T00:00:00.000Z', historical: { headings: ['History'], sourceAt: '', speaker: 'unknown' } },
      { id: 'suggestion', text: 'Assistant: You could book a museum.', observedAt: '2026-10-05T00:00:00.000Z', historical: { headings: ['History'], sourceAt: '', speaker: 'assistant' } },
    ]
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, evidence: ['heading', 'suggestion'] }]) })
    await expect(extract({ model: 'configured', evidence: historical, existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
  })
  it('accepts explicit calendar dates and equivalent instants in undated source text', async () => {
    const historical: MemoryEvidence = { id: 'old-visitor', text: '', observedAt: '2026-10-05T00:00:00.000Z', historical: { headings: ['History'], sourceAt: '', speaker: 'visitor' } }
    for (const [date, normalized] of [['2021-03-12T00:30:00+08:00', '2021-03-11T16:30:00.000Z'], ['March 12, 2021', '2021-03-12T00:00:00.000Z'], ['12 March 2021', '2021-03-12T00:00:00.000Z']]) {
      const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt: normalized, evidence: ['old-visitor'] }]) })
      expect((await extract({ model: 'configured', evidence: [{ ...historical, text: `User: The booking was completed on ${date}.` }], existing: [] }, new AbortController().signal))[0]?.eventAt).toBe(normalized)
    }
  })

  it.each([
    ['2024年3月5日', '2024-03-05T00:00:00+08:00'],
    ['2024-03-05', '2024-03-05'],
    ['2024年3月5日', '2024-03-04T16:00:00Z'],
    ['2024年3月5日', '2024-03-04T16:00:00+00:00'],
    ['2024-03-04T16:30:00+00:00', '2024-03-05'],
    ['2024-03-05T00:30:00+08:00', '2024-03-04T16:30:00Z'],
    ['2024-03-04T16:30:00Z', '2024-03-05T00:30:00+08:00'],
    ['2024年3月5日', '2024-03-05T00:00:00-07:00'],
  ])('keeps event-local days and equivalent instants across UTC/Taiwan midnight %#', async (date, eventAt) => {
    const historical: MemoryEvidence = { id: 'dated', text: `User: Completed on ${date}.`, observedAt: '2026-10-05T00:00:00Z',
      historical: { headings: ['History'], sourceAt: '', speaker: 'visitor' } }
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt, evidence: ['dated'] }]) })
    expect((await extract({ model: 'configured', evidence: [historical], existing: [] }, new AbortController().signal))[0]?.eventAt).toBe(eventAt)
  })

  it('cannot use a UTC timestamp prefix to claim the previous venue calendar day', async () => {
    const historical: MemoryEvidence = { id: 'utc', text: 'User: Completed on 2024-03-04T16:30:00Z.', observedAt: '2026-10-05T00:00:00Z',
      historical: { headings: ['History'], sourceAt: '', speaker: 'visitor' } }
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt: '2024-03-04', evidence: ['utc'] }]) })
    await expect(extract({ model: 'configured', evidence: [historical], existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
  })

  it.each(['2024-02-30', '2024-02-30T00:00:00+08:00', '2024-03-05T00:00:00', 'March 5 2024', '2024-03-05T24:00:00Z'])('rejects invalid or offset-free dates without guessing %#', async eventAt => {
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl: async () => response([{ ...record, eventAt }]) })
    await expect(extract({ model: 'configured', evidence, existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
  })

  it('retains relative-day calendar proposals anchored to source time without resolving undated history from import time', async () => {
    const historical: MemoryEvidence = { id: 'dated-relative', text: 'User: Tomorrow is the planned visit.', observedAt: '2026-10-10T00:30:00+08:00',
      historical: { headings: ['History'], sourceAt: '2024-03-05T00:30:00+08:00', speaker: 'visitor' } }
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response([{ ...record, eventAt: '2024-03-06', evidence: [historical.id] }]))
    const extract = createMemoryExtractor({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl })
    expect((await extract({ model: 'configured', evidence: [historical], existing: [] }, new AbortController().signal))[0]?.eventAt).toBe('2024-03-06')
    expect(JSON.parse(JSON.parse(fetchImpl.mock.calls[0][1]!.body as string).input).evidence[0].historical.sourceAt).toBe(historical.historical!.sourceAt)
    await expect(extract({ model: 'configured', evidence: [{ ...historical, historical: { ...historical.historical!, sourceAt: '' } }], existing: [] }, new AbortController().signal)).rejects.toThrow('memory_extraction_invalid')
  })
})
