import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearningRecord, MemoryRepository } from '../../src/main/memory/contracts'
import type { ExtractionInput } from '../../src/main/memory/extractor'
import { MemoryImporter } from '../../src/main/memory/import'
import { MemoryLearning } from '../../src/main/memory/learning'
import { MemoryStore } from '../../src/main/memory/store'

const proposal = (overrides: Partial<LearningRecord> = {}): LearningRecord => ({
  topic: 'Booking', text: 'The synthetic booking was cancelled.', kind: 'commitment', state: 'resolved',
  eventAt: '', sources: [], expectedRevision: null, keepInMind: false, ...overrides
})
const asyncStore = (store: MemoryStore): MemoryRepository => new Proxy(store, { get(target, key) {
  const value = Reflect.get(target, key)
  return typeof value === 'function' ? async (...args: unknown[]) => value.apply(target, args) : value
} }) as unknown as MemoryRepository

describe('retrieve before memory reconciliation', () => {
  let directory: string
  let store: MemoryStore
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'memory-reconciliation-'))
    store = new MemoryStore(join(directory, 'memory.sqlite'))
  })
  afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }) })

  it.each(['learning', 'import'] as const)('corrects a topic older than 100 records through %s without crossing scopes', async path => {
    const old = store.save('raven', 'Alice', 'Booking', 'A synthetic booking is pending.')
    const otherPerson = store.save('raven', 'Bob', 'Booking', 'An independent synthetic booking is pending.')
    const otherAvatar = store.save('owl', 'Alice', 'Booking', 'Another independent synthetic booking is pending.')
    for (let i = 0; i < 120; i++) store.save('raven', 'Alice', `Unrelated ${i}`, `Synthetic separate outcome ${i}.`)
    expect(store.list('raven', 'Alice')).toHaveLength(100)
    expect(store.list('raven', 'Alice').some(entry => entry.id === old.id)).toBe(false)
    const repository = asyncStore(store)
    // Exact retrieval must work even when hybrid search abstains.
    repository.hybridRecall = vi.fn(async () => ({ entries: [], incomplete: false }))
    const list = vi.spyOn(repository, 'list')
    const extract = vi.fn(async (input: ExtractionInput) => {
      const prior = input.existing.find(entry => entry.topic === 'Booking')
      return [proposal({ expectedRevision: prior?.revision ?? null })]
    })
    const report = vi.fn()
    if (path === 'learning') {
      const learning = new MemoryLearning({ repository, extract, model: async () => 'configured', report, debounceMs: 60_000 })
      try {
        await learning.observe({ avatarId: 'raven', name: 'Alice', itemId: 'turn-1', text: 'RAW_SYNTHETIC_CANCELLED_BOOKING', observedAt: '2026-10-05T00:00:00Z' })
        await learning.flush()
        expect(report).toHaveBeenCalledWith('memory_learning_committed')
      } finally { await learning.close() }
    } else {
      const importer = new MemoryImporter({ repository, extract, model: async () => 'configured', report, canRun: () => true })
      importer.stage('raven', 'Alice', 'User: RAW_SYNTHETIC_CANCELLED_BOOKING')
      importer.start(); await importer.idle()
      expect(importer.status()).toMatchObject({ state: 'complete', saved: 1 })
    }
    expect(extract.mock.calls).toHaveLength(2)
    expect(extract.mock.calls[0]![0].existing).toEqual([])
    expect(extract.mock.calls[1]![0].existing).toEqual([old])
    expect(extract.mock.calls.every(([input]) => input.model === 'configured' && !('avatarId' in input) && !('name' in input))).toBe(true)
    expect(list).not.toHaveBeenCalled()
    expect(store.list('raven', 'Alice', 'Booking')).toEqual([expect.objectContaining({ id: old.id, revision: 2, state: 'resolved', text: proposal().text })])
    expect(store.list('raven', 'Bob')).toEqual([otherPerson])
    expect(store.list('owl', 'Alice')).toEqual([otherAvatar])
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/Alice|RAW_SYNTHETIC|booking|cancelled/u)
  })
})
