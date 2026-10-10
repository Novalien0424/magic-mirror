import { describe, expect, it, vi } from 'vitest'
import { MemoryLearning } from '../../src/main/memory/learning'
import type { ExtractionInput } from '../../src/main/memory/extractor'
import type { MemoryRepository, LearningRecord } from '../../src/main/memory/contracts'
const record: LearningRecord = { topic: 'Fixture', text: 'Distilled synthetic outcome.', kind: 'episode', state: 'active', eventAt: '', sources: [], expectedRevision: null, keepInMind: false }
function setup() {
  let epoch = 1
  const repository = { policy: vi.fn(async () => ({ epoch, mode: 'automatic', cleanupRequired: false })), lookupTopics: vi.fn(async () => []), hybridRecall: vi.fn(async () => ({ entries: [], incomplete: false })), commitLearning: vi.fn(async (_a, _n, op) => op.epoch === epoch ? 'committed' : 'stale') }
  const extract = vi.fn(async (_input: ExtractionInput, _signal: AbortSignal) => [record]), report = vi.fn()
  const learning = new MemoryLearning({ repository: repository as unknown as MemoryRepository, extract, model: async () => 'configured', report, debounceMs: 60_000 })
  return { learning, repository, extract, report, correct: () => epoch++ }
}
describe('summary learning lifecycle', () => {
  it('writes to the captured owner and only persists distilled records, not transcripts', async () => {
    const p = setup()
    await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId: 'turn-a', text: 'RAW SYNTHETIC EVIDENCE', observedAt: '2026-10-05T00:00:00Z' })
    await p.learning.flush()
    expect(p.repository.commitLearning).toHaveBeenCalledWith('raven', 'Alice', expect.objectContaining({ epoch: 1, records: [record] }))
    expect(JSON.stringify(p.repository.commitLearning.mock.calls)).not.toContain('RAW SYNTHETIC')
    expect(JSON.stringify(p.report.mock.calls)).not.toMatch(/Alice|RAW|Distilled/)
    await p.learning.close()
  })
  it('invalidates pending work and never retries a stale patch after a correction', async () => {
    const p = setup()
    await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId: 'turn-a', text: 'synthetic', observedAt: '2026-10-05T00:00:00Z' })
    p.correct()
    await p.learning.flush()
    expect(p.repository.commitLearning).not.toHaveBeenCalled()
    expect(p.extract).not.toHaveBeenCalled()
    await p.learning.close()
  })
  it('deduplicates turn evidence and drops in-flight proposals on policy cancellation', async () => {
    const p = setup()
    let finish!: (records: LearningRecord[]) => void
    p.extract.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const evidence = { avatarId: 'raven', name: 'Alice', itemId: 'turn-a', text: 'synthetic', observedAt: '2026-10-05T00:00:00Z' }
    await p.learning.observe(evidence); await p.learning.observe(evidence)
    const flush = p.learning.flush()
    await vi.waitFor(() => expect(p.extract).toHaveBeenCalledOnce())
    expect(p.extract.mock.calls[0]![0].evidence).toHaveLength(1)
    p.learning.invalidate('raven', 'Alice'); finish([record]); await flush
    expect(p.repository.commitLearning).not.toHaveBeenCalled()
    expect(p.report).toHaveBeenCalledWith('memory_learning_invalidated;count=1')
    expect(JSON.stringify(p.report.mock.calls)).not.toMatch(/Alice|synthetic/)
    await p.learning.close()
  })
  it('removes a pending control item while retaining other eligible evidence for flush', async () => {
    const p = setup()
    const evidence: string[][] = []
    p.extract.mockImplementation(async input => { evidence.push(input.evidence.map(e => e.id)); return [record] })
    for (const itemId of ['ordinary', 'control']) await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId, text: 'synthetic', observedAt: '' })
    try {
      p.learning.exclude('raven', 'Alice', 'control')
      await p.learning.flush()
      expect(evidence).toEqual([['ordinary']])
      expect(p.repository.commitLearning).toHaveBeenCalledOnce()
    } finally { await p.learning.close() }
  })
  it('retries only unaffected evidence after an active batch gains a control exclusion', async () => {
    const p = setup()
    const evidence: string[][] = []
    p.extract.mockImplementation(async input => { evidence.push(input.evidence.map(e => e.id)); return [record] })
    let finish!: (records: LearningRecord[]) => void
    p.extract.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    for (const itemId of ['ordinary', 'control']) await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId, text: 'synthetic', observedAt: '' })
    const flush = p.learning.flush()
    try {
      await vi.waitFor(() => expect(p.extract).toHaveBeenCalledOnce())
      p.learning.exclude('raven', 'Alice', 'control')
      expect(p.extract.mock.calls[0]![1].aborted).toBe(true)
      // New eligible evidence must also survive while the cancelled batch finishes.
      await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId: 'new-ordinary', text: 'synthetic', observedAt: '' })
      finish([record]); await flush
      expect(evidence).toEqual([['ordinary'], ['new-ordinary']])
      expect(p.repository.commitLearning).toHaveBeenCalledTimes(2)
    } finally { finish?.([]); await flush; await p.learning.close() }
  })
  it('excludes an observation still awaiting eligibility without invalidating its owner', async () => {
    const p = setup()
    const evidence: string[][] = []
    p.extract.mockImplementation(async input => { evidence.push(input.evidence.map(e => e.id)); return [record] })
    await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId: 'ordinary', text: 'synthetic', observedAt: '' })
    let finish!: (policy: { epoch: number; mode: string; cleanupRequired: boolean }) => void
    p.repository.policy.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId: 'control', text: 'synthetic', observedAt: '' })
    try {
      p.learning.exclude('raven', 'Alice', 'control')
      finish({ epoch: 1, mode: 'automatic', cleanupRequired: false }); await pending
      await p.learning.flush()
      expect(evidence).toEqual([['ordinary']])
      expect(p.repository.commitLearning).toHaveBeenCalledOnce()
    } finally { finish?.({ epoch: 1, mode: 'automatic', cleanupRequired: false }); await pending; await p.learning.close() }
  })
  it('does not replay unaffected evidence after a scope mutation invalidates an excluded batch', async () => {
    const p = setup()
    let finish!: (records: LearningRecord[]) => void
    p.extract.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    for (const itemId of ['ordinary', 'control']) await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId, text: 'synthetic', observedAt: '' })
    const flush = p.learning.flush()
    try {
      await vi.waitFor(() => expect(p.extract).toHaveBeenCalledOnce())
      p.learning.exclude('raven', 'Alice', 'control')
      p.learning.invalidate('raven', 'Alice')
      finish([record]); await flush
      expect(p.extract).toHaveBeenCalledOnce()
      expect(p.repository.commitLearning).not.toHaveBeenCalled()
    } finally { finish?.([]); await flush; await p.learning.close() }
  })

  it('reports counts for discarded pending evidence without owner IDs or content', async () => {
    const p = setup()
    for (const itemId of ['first', 'second']) await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId, text: 'PRIVATE SYNTHETIC', observedAt: '' })
    p.learning.invalidate('raven', 'Alice')
    await p.learning.flush()
    expect(p.report).toHaveBeenCalledWith('memory_learning_invalidated;count=2')
    expect(p.repository.commitLearning).not.toHaveBeenCalled()
    expect(JSON.stringify(p.report.mock.calls)).not.toMatch(/raven|Alice|PRIVATE|first|second/)
    await p.learning.close()
  })

  it('never resubmits an excluded batch after a storage mutation has an uncertain result', async () => {
    const p = setup()
    let failed!: (error: Error) => void
    p.repository.commitLearning.mockImplementationOnce(() => new Promise<'committed' | 'stale'>((_resolve, reject) => { failed = reject }))
    for (const itemId of ['ordinary', 'control']) await p.learning.observe({ avatarId: 'raven', name: 'Alice', itemId, text: 'PRIVATE SYNTHETIC', observedAt: '' })
    const flush = p.learning.flush()
    try {
      await vi.waitFor(() => expect(p.repository.commitLearning).toHaveBeenCalledOnce())
      p.learning.exclude('raven', 'Alice', 'control')
      failed(Error('memory_storage_failed')); await flush
      expect(p.repository.commitLearning).toHaveBeenCalledOnce()
      expect(p.extract).toHaveBeenCalledOnce()
      expect(p.report).toHaveBeenCalledWith('memory_learning_retry_skipped;cause=mutation_started')
      expect(JSON.stringify(p.report.mock.calls)).not.toMatch(/Alice|PRIVATE|raven/)
    } finally { failed?.(Error('memory_storage_failed')); await flush; await p.learning.close() }
  })
})
