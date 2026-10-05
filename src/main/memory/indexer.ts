import type { MemoryRepository, MemoryEmbedder } from './contracts'

/** Low-priority, revision-guarded indexing. Text/vectors remain private IPC, never telemetry. */
export class MemoryIndexer {
  private running?: Promise<void>
  private requested = false
  private abort = new AbortController()
  constructor(private readonly repository: MemoryRepository, private readonly embedder: MemoryEmbedder, private readonly report: (reason: string) => void) {}
  schedule(): void {
    this.requested = true
    if (this.running || this.abort.signal.aborted) return
    this.running = (async () => {
      do { this.requested = false; await this.drain() } while (this.requested && !this.abort.signal.aborted)
    })().finally(() => { this.running = undefined })
  }
  private async drain(): Promise<void> {
    try {
      while (!this.abort.signal.aborted) {
        const records = await this.repository.pendingIndex(this.embedder.version, 8)
        if (!records.length) return
        for (const record of records) {
          if (this.abort.signal.aborted) return
          const vector = await this.embedder.embed(`${record.entry.topic}: ${record.entry.text}`, 'document', this.abort.signal)
          if (!await this.repository.setEmbedding(record.avatarId, record.name, record.entry.id, record.revision, vector)) this.report('memory_index_stale')
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }
    } catch { if (!this.abort.signal.aborted) this.report('memory_index_unavailable') }
  }
  async close(): Promise<void> { this.abort.abort(); await this.running }
}
