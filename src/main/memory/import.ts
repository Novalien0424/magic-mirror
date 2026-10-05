import { randomUUID } from 'node:crypto'
import type { MemoryRepository } from './contracts'
import type { MemoryExtractor } from './extractor'
import type { MemoryImportStatus } from '../../shared/memory'

/** The operator's source file stays in place. No raw imported history is copied to app storage. */
export function prepareMemoryMarkdown(markdown: string): { persona: string; chunks: string[] } {
  if (Buffer.byteLength(markdown, 'utf8') > 20 * 1024 * 1024) throw Error('memory_import_too_large')
  const history: string[] = [], persona: string[] = []
  let personaLevel = 0
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      if (personaLevel && heading[1]!.length <= personaLevel) personaLevel = 0
      if (/^(?:persona|character|personality|system prompt|master prompt|角色|人設|人设|個性|个性)(?:\s|[:：—-]|$)/iu.test(heading[2]!)) personaLevel = heading[1]!.length
    }
    ;(personaLevel ? persona : history).push(line)
  }
  const draft = persona.join('\n').trim()
  if (draft.length > 24000) throw Error('memory_import_persona_too_large')
  const source = history.join('\n').trim(), chunks: string[] = []
  for (let start = 0; start < source.length;) {
    let end = Math.min(start + 12000, source.length)
    if (end < source.length) {
      const boundary = source.lastIndexOf('\n', end)
      if (boundary > start + 6000) end = boundary + 1
      if (/^[\uDC00-\uDFFF]$/.test(source[end] ?? '')) end--
    }
    chunks.push(source.slice(start, end)); start = end
  }
  if (!chunks.length && !draft) throw Error('memory_import_empty')
  return { persona: draft, chunks }
}
interface Options { repository: MemoryRepository; extract: MemoryExtractor; model(): Promise<string>; canRun(): boolean; report(reason: string): void; onChanged?(): void }
/** One bounded import at a time, explicit operator scope, cancellable between every async boundary. */
export class MemoryImporter {
  private current: MemoryImportStatus = { state: 'empty', chunks: 0, processed: 0, saved: 0, persona: '', code: 'memory_import_empty' }
  private staged?: { avatarId: string; name: string; chunks: string[] }
  private abort?: AbortController
  private running?: Promise<void>
  constructor(private readonly options: Options) {}
  status(): MemoryImportStatus { return { ...this.current } }
  owns(avatarId: string, name: string): boolean { return this.staged?.avatarId === avatarId && this.staged.name === name }
  stage(avatarId: string, name: string, markdown: string): MemoryImportStatus {
    if (this.running) throw Error('memory_import_busy')
    const plan = prepareMemoryMarkdown(markdown)
    this.staged = { avatarId, name, chunks: plan.chunks }
    this.current = { state: 'staged', chunks: plan.chunks.length, processed: 0, saved: 0, persona: plan.persona, code: 'memory_import_staged' }
    return this.status()
  }
  start(): MemoryImportStatus {
    if (!this.staged || this.running || !this.options.canRun()) throw Error('memory_import_unavailable')
    const staged = this.staged, abort = new AbortController(); this.abort = abort
    this.current.state = 'running'; this.current.code = 'memory_import_running'
    this.running = this.run(staged, abort.signal).finally(() => { this.running = undefined; staged.chunks.length = 0; this.staged = undefined; this.abort = undefined })
    return this.status()
  }
  private async run(staged: NonNullable<MemoryImporter['staged']>, signal: AbortSignal): Promise<void> {
    try {
      const model = await this.options.model()
      const initial = await this.options.repository.policy(staged.avatarId, staged.name)
      let epoch = initial.epoch
      if (initial.mode === 'off' || initial.cleanupRequired) throw Error()
      const importId = randomUUID()
      for (let i = 0; i < staged.chunks.length; i++) {
        if (signal.aborted || !this.options.canRun()) throw Error()
        const policy = await this.options.repository.policy(staged.avatarId, staged.name)
        if (policy.epoch !== epoch || policy.mode === 'off' || policy.cleanupRequired) throw Error()
        const existing = await this.options.repository.list(staged.avatarId, staged.name)
        const records = await this.options.extract({ model, existing,
          evidence: [{ id: `import-${i}`, text: staged.chunks[i]!, observedAt: new Date().toISOString() }] }, signal)
        if (signal.aborted || !this.options.canRun()) throw Error()
        if (records.length) {
          const sourceTopics = new Set(records.flatMap(record => record.sources))
          const sourceRevisions = Object.fromEntries(existing.filter(record => sourceTopics.has(record.topic)).map(record => [record.topic, record.revision ?? 1]))
          const committed = await this.options.repository.commitLearning(staged.avatarId, staged.name,
            { operationId: `${importId}:${i}`, epoch, origin: 'import', records, sourceRevisions })
          if (committed === 'stale') throw Error()
          this.current.saved += records.length
          if (!this.options.canRun()) throw Error()
          // Imports run only while Dormant; no live provider context exists to clean.
          await this.options.repository.setCleanupRequired(staged.avatarId, staged.name, false)
          epoch = (await this.options.repository.policy(staged.avatarId, staged.name)).epoch
          this.options.onChanged?.()
        }
        staged.chunks[i] = ''; this.current.processed = i + 1
      }
      this.current.state = 'complete'; this.current.code = 'memory_import_complete'
    } catch {
      this.current.state = signal.aborted ? 'cancelled' : 'failed'
      this.current.code = signal.aborted ? 'memory_import_cancelled' : 'memory_import_failed'
    }
    this.options.report(this.current.code)
  }
  cancel(): MemoryImportStatus {
    this.abort?.abort()
    if (!this.running) { this.staged = undefined; this.current.persona = ''; this.current.state = 'cancelled'; this.current.code = 'memory_import_cancelled' }
    return this.status()
  }
  idle(): Promise<void> { return this.running ?? Promise.resolve() }
}
