import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryConsolidator } from '../../src/main/memory/consolidator'
import type { LearningRecord, MemoryEmbedder, MemoryRepository } from '../../src/main/memory/contracts'
import type { ExtractionInput } from '../../src/main/memory/extractor'
import { MemoryStore } from '../../src/main/memory/store'
import type { MemoryEntry } from '../../src/shared/memory'

const record = (overrides: Partial<LearningRecord> = {}): LearningRecord => ({
  topic: 'Reservation update', text: 'The reservation was cancelled.', kind: 'episode', state: 'resolved',
  eventAt: '', sources: [], expectedRevision: null, keepInMind: false, ...overrides
})
const input = { avatarId: 'raven', name: 'Alice', model: 'configured',
  evidence: [{ id: 'turn-1', text: 'RAW_SYNTHETIC_CANCELLATION', observedAt: '2026-10-05T00:00:00Z' }] }
const asyncStore = (store: MemoryStore): MemoryRepository => new Proxy(store, { get(target, key) {
  const value = Reflect.get(target, key)
  return typeof value === 'function' ? async (...args: unknown[]) => value.apply(target, args) : value
} }) as unknown as MemoryRepository
const embedder = (): MemoryEmbedder => ({ version: 'synthetic-v1', embed: vi.fn(async () => ({ version: 'synthetic-v1', values: [1, 0] })), close: async () => {} })

describe('bounded scoped memory consolidation', () => {
  let directory: string
  let store: MemoryStore
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'memory-consolidator-'))
    store = new MemoryStore(join(directory, 'memory.sqlite'))
  })
  afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }) })

  it('retrieves a paraphrased correction beyond 100 rows using the existing local hybrid index', async () => {
    const old = store.save('raven', 'Alice', 'Booking', 'A pending appointment.')
    const otherPerson = store.save('raven', 'Bob', 'Booking', 'Unrelated other person.')
    const otherAvatar = store.save('owl', 'Alice', 'Booking', 'Unrelated other avatar.')
    for (const [avatar, name, entry] of [['raven', 'Alice', old], ['raven', 'Bob', otherPerson], ['owl', 'Alice', otherAvatar]] as const) {
      store.setEmbedding(avatar, name, entry.id, entry.revision!, { version: 'synthetic-v1', values: [1, 0] })
    }
    for (let i = 0; i < 120; i++) {
      const filler = store.save('raven', 'Alice', `Unrelated ${i}`, `Separate event ${i}.`)
      store.setEmbedding('raven', 'Alice', filler.id, filler.revision!, { version: 'synthetic-v1', values: [0, 1] })
    }
    expect(store.list('raven', 'Alice').some(entry => entry.id === old.id)).toBe(false)
    const extract = vi.fn(async ({ existing }: ExtractionInput) => {
      const prior = existing.find(entry => entry.id === old.id)
      return [record(prior ? { topic: prior.topic, expectedRevision: prior.revision! } : {})]
    })
    const local = embedder(), report = vi.fn(), signal = new AbortController().signal
    const consolidate = createMemoryConsolidator({ repository: asyncStore(store), extract, embedder: local, report })
    const patch = await consolidate(input, signal)
    expect(extract.mock.calls).toHaveLength(2)
    expect(extract.mock.calls[1]![0].existing).toEqual([old])
    expect(local.embed).toHaveBeenCalledWith(expect.any(String), 'query', signal)
    expect(store.commitLearning('raven', 'Alice', { operationId: 'correction', epoch: store.policy('raven', 'Alice').epoch, ...patch })).toBe('committed')
    expect(store.list('raven', 'Alice', 'appointment reservation')).toEqual([expect.objectContaining({ id: old.id, topic: 'Booking', revision: 2 })])
    expect(store.list('raven', 'Alice', 'Reservation update').some(entry => entry.topic === 'Reservation update')).toBe(false)
    expect(store.list('raven', 'Bob')).toEqual([otherPerson])
    expect(store.list('owl', 'Alice')).toEqual([otherAvatar])
    expect(report).not.toHaveBeenCalled()
  })

  it('retains the retrieved target revision when a concurrent correction wins during reconciliation', async () => {
    const old = store.save('raven', 'Alice', 'Booking', 'A pending appointment.')
    const epoch = store.policy('raven', 'Alice').epoch
    const extract = vi.fn(async ({ existing }: ExtractionInput) => {
      const prior = existing[0]
      if (prior) {
        expect(store.commitLearning('raven', 'Alice', { operationId: 'concurrent', epoch,
          records: [record({ topic: 'Booking', text: 'A newer confirmed outcome.', expectedRevision: old.revision! })] })).toBe('committed')
        store.setCleanupRequired('raven', 'Alice', false)
      }
      return [record({ topic: 'Booking', expectedRevision: prior?.revision ?? null })]
    })
    const consolidate = createMemoryConsolidator({ repository: asyncStore(store), extract, report: vi.fn() })
    const patch = await consolidate(input, new AbortController().signal)
    expect(patch.records[0]?.expectedRevision).toBe(1)
    expect(store.policy('raven', 'Alice').epoch).toBe(epoch)
    expect(store.commitLearning('raven', 'Alice', { operationId: 'stale', epoch, ...patch })).toBe('stale')
    expect(store.list('raven', 'Alice')[0]).toMatchObject({ id: old.id, text: 'A newer confirmed outcome.', revision: 2 })
    expect(extract).toHaveBeenCalledTimes(2)
  })

  it('guards source revisions from retrieved records rather than from the draft or latest list', async () => {
    const source = store.save('raven', 'Alice', 'Reservation', 'A pending appointment.')
    const repository = asyncStore(store)
    repository.hybridRecall = vi.fn(async () => ({ entries: [source], incomplete: false }))
    const extract = vi.fn(async ({ existing }: ExtractionInput) => [record({ sources: existing.length ? ['Reservation'] : [] })])
    const consolidate = createMemoryConsolidator({ repository, extract, report: vi.fn() })
    const patch = await consolidate(input, new AbortController().signal)
    expect(patch.sourceRevisions).toEqual({ Reservation: source.revision })
    const epoch = store.policy('raven', 'Alice').epoch
    expect(store.commitLearning('raven', 'Alice', { operationId: 'source-change', epoch,
      records: [record({ topic: source.topic, text: 'The source has changed.', expectedRevision: source.revision! })] })).toBe('committed')
    store.setCleanupRequired('raven', 'Alice', false)
    expect(store.commitLearning('raven', 'Alice', { operationId: 'stale-derived', epoch, ...patch })).toBe('stale')
    expect(store.list('raven', 'Alice', 'Reservation update').some(entry => entry.topic === 'Reservation update')).toBe(false)
  })

  it('prioritizes exact targets while bounding count and UTF-8 context and reporting omitted candidates', async () => {
    const exact: MemoryEntry[] = Array.from({ length: 8 }, (_, i) => ({
      id: `exact-${i}`, topic: `Exact ${i}`, text: '合'.repeat(1000), revision: i + 1, updatedAt: '2026-10-05T00:00:00Z'
    }))
    let query = 0
    const repository = { lookupTopics: vi.fn(async () => exact), hybridRecall: vi.fn(async () => ({ incomplete: false,
      entries: Array.from({ length: 8 }, (_, i) => ({ id: `extra-${query}-${i}`, topic: `Extra ${query++} ${i}`, text: '成'.repeat(1000), revision: 1, updatedAt: '' })) })) } as unknown as MemoryRepository
    const extract = vi.fn(async ({ existing }: ExtractionInput) => existing.length ? [] : exact.map(entry => record({ topic: entry.topic })))
    const report = vi.fn()
    await createMemoryConsolidator({ repository, extract, report })(input, new AbortController().signal)
    const context = extract.mock.calls[1]![0].existing
    expect(context.slice(0, 8)).toEqual(exact)
    expect(context.length).toBeLessThanOrEqual(24)
    expect(Buffer.byteLength(JSON.stringify(context), 'utf8')).toBeLessThanOrEqual(32_000)
    expect(report).toHaveBeenCalledWith('memory_consolidation_context_bounded')
    expect(repository.hybridRecall).toHaveBeenCalledTimes(8)
  })

  it('falls back visibly to scoped lexical recall when local embeddings fail without logging content', async () => {
    const old = store.save('raven', 'Alice', 'Reservation', 'A pending reservation.')
    const local = embedder()
    vi.mocked(local.embed).mockRejectedValue(Error('RAW_SYNTHETIC_PRIVATE_ERROR'))
    const extract = vi.fn(async ({ existing }: ExtractionInput) => [record({ text: 'Reservation cancelled.', ...(existing.length ? { topic: old.topic, expectedRevision: old.revision! } : {}) })])
    const report = vi.fn()
    const patch = await createMemoryConsolidator({ repository: asyncStore(store), extract, embedder: local, report })(input, new AbortController().signal)
    expect(patch.records[0]?.topic).toBe(old.topic)
    expect(report).toHaveBeenCalledWith('memory_consolidation_embedding_unavailable')
    expect(report).toHaveBeenCalledWith('memory_consolidation_retrieval_incomplete')
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/RAW_SYNTHETIC|Alice|reservation/u)
  })

  it.each(['revision', 'source'] as const)('rejects an ungrounded reconciled %s rather than silently patching it', async invalid => {
    const old = store.save('raven', 'Alice', 'Booking', 'A pending appointment.')
    const extract = vi.fn(async ({ existing }: ExtractionInput) => [record({ topic: old.topic,
      expectedRevision: existing.length ? invalid === 'revision' ? 99 : old.revision! : null,
      sources: existing.length && invalid === 'source' ? ['Unretrieved source'] : [] })])
    await expect(createMemoryConsolidator({ repository: asyncStore(store), extract, report: vi.fn() })(input, new AbortController().signal))
      .rejects.toThrow(/^memory_extraction_invalid$/)
    expect(store.list('raven', 'Alice')).toEqual([old])
  })

  it('stops after cancellation during retrieval without reconciling or invoking another adapter', async () => {
    const abort = new AbortController()
    const repository = { lookupTopics: vi.fn(async () => { abort.abort(); return [] }), hybridRecall: vi.fn() } as unknown as MemoryRepository
    const extract = vi.fn(async () => [record()])
    await expect(createMemoryConsolidator({ repository, extract, report: vi.fn() })(input, abort.signal)).rejects.toThrow(/^memory_consolidation_cancelled$/)
    expect(extract).toHaveBeenCalledOnce()
    expect(repository.hybridRecall).not.toHaveBeenCalled()
  })
})
