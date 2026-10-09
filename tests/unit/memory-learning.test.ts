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
    await p.learning.close()
  })
})
