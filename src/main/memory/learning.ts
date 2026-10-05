import { randomUUID } from 'node:crypto'
import type { MemoryRepository } from './contracts'
import type { MemoryEvidence, MemoryExtractor } from './extractor'

interface Observation { avatarId: string; name: string; itemId: string; text: string; observedAt: string; epoch?: number }
interface Batch { avatarId: string; name: string; epoch: number; model: string; evidence: MemoryEvidence[]; token: number }
interface Options { repository: MemoryRepository; extract: MemoryExtractor; model(): Promise<string>; report(reason: string): void; onCommitted?(avatarId: string, name: string): void; debounceMs?: number }
/** Bounded RAM-only ingestion. Persistent writes contain validated summaries only. */
export class MemoryLearning {
  private batches = new Map<string, Batch>()
  private seen = new Set<string>()
  private tokens = new Map<string, number>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | undefined
  private active: { key: string; abort: AbortController } | undefined
  private closed = false
  constructor(private readonly options: Options) {}
  private key(avatarId: string, name: string): string { return JSON.stringify([avatarId, name.normalize('NFKC').trim().toLowerCase()]) }
  async observe(item: Observation): Promise<void> {
    if (this.closed) return
    const key = this.key(item.avatarId, item.name), unique = `${key}:${item.itemId}`, token = this.tokens.get(key) ?? 0
    if (this.seen.has(unique)) return
    try {
      const policy = await this.options.repository.policy(item.avatarId, item.name)
      if (this.closed || token !== (this.tokens.get(key) ?? 0) || policy.mode !== 'automatic' || policy.cleanupRequired || item.epoch !== undefined && item.epoch !== policy.epoch) {
        this.options.report('memory_learning_ineligible'); return
      }
      const previous = this.batches.get(key)
      if (previous && previous.epoch !== policy.epoch) this.batches.delete(key)
      const batch = this.batches.get(key) ?? { avatarId: item.avatarId, name: item.name, epoch: policy.epoch,
        model: await this.options.model(), token, evidence: [] }
      if (this.closed || token !== (this.tokens.get(key) ?? 0)) return
      if (this.batches.size >= 8 && !this.batches.has(key) || batch.evidence.length >= 24 || item.text.length > 4000 || batch.evidence.reduce((n, e) => n + e.text.length, 0) + item.text.length > 16000) {
        this.options.report('memory_learning_overloaded'); return
      }
      this.seen.add(unique)
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!)
      batch.evidence.push({ id: item.itemId, text: item.text, observedAt: item.observedAt })
      this.batches.set(key, batch)
      this.options.report('memory_learning_pending')
      if (!this.timer) { this.timer = setTimeout(() => { this.timer = undefined; void this.flush() }, this.options.debounceMs ?? 20_000); this.timer.unref() }
      if (batch.evidence.length >= 6) void this.flush()
    } catch { this.options.report('memory_learning_unavailable') }
  }
  invalidate(avatarId: string, name: string): void {
    const key = this.key(avatarId, name)
    this.tokens.set(key, (this.tokens.get(key) ?? 0) + 1)
    this.batches.delete(key)
    if (this.active?.key === key) this.active.abort.abort()
  }
  flush(): Promise<void> {
    if (this.running) return this.running
    clearTimeout(this.timer); this.timer = undefined
    this.running = this.drain().finally(() => { this.running = undefined })
    return this.running
  }
  private async drain(): Promise<void> {
    while (!this.closed && this.batches.size) {
      const [key, batch] = this.batches.entries().next().value!
      this.batches.delete(key)
      const abort = new AbortController(); this.active = { key, abort }
      try {
        const policy = await this.options.repository.policy(batch.avatarId, batch.name)
        if (policy.mode !== 'automatic' || policy.cleanupRequired || policy.epoch !== batch.epoch || batch.token !== (this.tokens.get(key) ?? 0)) {
          this.options.report('memory_learning_stale'); continue
        }
        const existing = await this.options.repository.list(batch.avatarId, batch.name)
        const records = await this.options.extract({ model: batch.model, evidence: batch.evidence, existing }, abort.signal)
        if (this.closed || abort.signal.aborted || batch.token !== (this.tokens.get(key) ?? 0)) { this.options.report('memory_learning_cancelled'); continue }
        if (!records.length) { this.options.report('memory_learning_no_change'); continue }
        const sourceTopics = new Set(records.flatMap(record => record.sources))
        const sourceRevisions = Object.fromEntries(existing.filter(record => sourceTopics.has(record.topic)).map(record => [record.topic, record.revision ?? 1]))
        const result = await this.options.repository.commitLearning(batch.avatarId, batch.name, { operationId: randomUUID(), epoch: batch.epoch, records, sourceRevisions })
        this.options.report(`memory_learning_${result}`)
        if (result === 'committed') this.options.onCommitted?.(batch.avatarId, batch.name)
      } catch (error) {
        const reason = error instanceof Error && ['memory_invalid_input', 'memory_storage_failed', 'memory_extraction_invalid', 'memory_extraction_unavailable'].includes(error.message) ? error.message : 'memory_learning_unavailable'
        this.options.report(abort.signal.aborted ? 'memory_learning_cancelled' : reason)
      }
      finally { batch.evidence.length = 0; this.active = undefined }
    }
  }
  async close(): Promise<void> {
    this.closed = true; clearTimeout(this.timer); this.batches.clear(); this.seen.clear(); this.tokens.clear()
    this.active?.abort.abort()
    await this.running
  }
}
