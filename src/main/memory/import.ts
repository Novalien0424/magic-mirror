import { randomUUID } from 'node:crypto'
import type { MemoryRepository } from './contracts'
import type { HistoricalMemoryContext, MemoryExtractor } from './extractor'
import { createMemoryConsolidator, type MemoryConsolidator } from './consolidator'
import type { MemoryImportStatus } from '../../shared/memory'

interface HistoryRange { start: number; end: number; historical: HistoricalMemoryContext }
interface Heading { level: number; text: string; sourceAt?: string; speaker?: HistoricalMemoryContext['speaker']; truncated?: true }
function speaker(label: string): HistoricalMemoryContext['speaker'] | undefined {
  const value = label.replace(/[*_]/g, '').replace(/[:：]\s*$/, '').trim()
  if (/^(?:user|human|visitor|you(?: said)?|用户|用戶|使用者|訪客|访客|人類|人类)$/iu.test(value)) return 'visitor'
  if (/^(?:assistant|ai|chatgpt(?: said)?|model|助手|助理)$/iu.test(value)) return 'assistant'
  return undefined
}
function sourceTime(title: string): string | undefined {
  if (/undated|(?:date.*unknown|unknown.*date)|(?:日期|時間|时间).*(?:不明|未知|未記錄|未记录)/iu.test(title)) return ''
  // Archive/export metadata is not the time of the source conversation.
  const source = title.replace(/(?:\b(?:export(?:ed)?|import(?:ed)?|generated|download(?:ed)?)\b|匯出|导出|匯入|导入).*$/iu, '')
  const dates = [...source.matchAll(/(?<!\d)(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?!\d)/gu)]
  if (!dates.length) return undefined
  if (dates.length !== 1) return ''
  const date = dates[0]!, day = `${date[1]}-${date[2]!.padStart(2, '0')}-${date[3]!.padStart(2, '0')}`
  const parsed = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day) return ''
  const timestamp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})/u.exec(source)?.[0]
  return timestamp ? Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : '' : day
}
function sameContext(a: HistoricalMemoryContext, b: HistoricalMemoryContext): boolean {
  return a.sourceAt === b.sourceAt && a.speaker === b.speaker && a.headingsTruncated === b.headingsTruncated
    && a.headings.length === b.headings.length && a.headings.every((heading, i) => heading === b.headings[i])
}
/** The operator's source file stays in place. No raw imported history is copied to app storage. */
export function prepareMemoryMarkdown(markdown: string): { persona: string; chunks: string[]; contexts: HistoryRange[][] } {
  if (Buffer.byteLength(markdown, 'utf8') > 20 * 1024 * 1024) throw Error('memory_import_too_large')
  const history: string[] = [], persona: string[] = []
  const headings: Heading[] = [], sections: { start: number; historical: HistoricalMemoryContext }[] = []
  let personaLevel = 0, offset = 0, activeSpeaker: HistoricalMemoryContext['speaker'] = 'unknown'
  let fence: { char: string; length: number } | undefined
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const heading = !fence ? /^(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/.exec(line) : null
    if (heading) {
      if (personaLevel && heading[1]!.length <= personaLevel) personaLevel = 0
      if (/^(?:persona|character|personality|system prompt|master prompt|角色|人設|人设|個性|个性)(?:\s|[:：—-]|$)/iu.test(heading[2]!)) personaLevel = heading[1]!.length
    }
    if (personaLevel) persona.push(line)
    else {
      if (heading) {
        const level = heading[1]!.length, title = heading[2]!
        while (headings.length && headings.at(-1)!.level >= level) headings.pop()
        headings.push({ level, text: title.slice(0, 512), sourceAt: sourceTime(title), speaker: speaker(title), ...(title.length > 512 ? { truncated: true as const } : {}) })
        activeSpeaker = [...headings].reverse().find(item => item.speaker)?.speaker ?? 'unknown'
      } else if (!fence) {
        const label = /^\s{0,3}(?:\*\*|__)?([^:\n：*]{1,80}?)(?:\*\*|__)?\s*[:：](?:\*\*|__)?(?:\s|$)/u.exec(line)?.[1]
        if (label) activeSpeaker = speaker(label) ?? 'unknown'
      }
      const historical: HistoricalMemoryContext = { headings: headings.map(item => item.text),
        sourceAt: [...headings].reverse().find(item => item.sourceAt !== undefined)?.sourceAt ?? '', speaker: activeSpeaker,
        ...(headings.some(item => item.truncated) ? { headingsTruncated: true as const } : {}) }
      if (!sections.length || !sameContext(sections.at(-1)!.historical, historical)) sections.push({ start: offset, historical })
      history.push(line); offset += line.length + 1
    }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line)
    if (marker) {
      if (!fence) fence = { char: marker[1]![0]!, length: marker[1]!.length }
      else if (marker[1]![0] === fence.char && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined
    }
  }
  const draft = persona.join('\n').trim()
  if (draft.length > 24000) throw Error('memory_import_persona_too_large')
  const joined = history.join('\n'), source = joined.trim(), trimStart = joined.length - joined.trimStart().length
  const ranges = sections.map((section, i) => ({ start: Math.max(section.start - trimStart, 0),
    end: Math.min((sections[i + 1]?.start ?? joined.length) - trimStart, source.length), historical: section.historical })).filter(range => range.start < range.end)
  const chunks: string[] = [], contexts: HistoryRange[][] = []
  let section = 0
  for (let start = 0; start < source.length;) {
    while (ranges[section]!.end <= start) section++
    let end = Math.min(start + 12000, source.length, ranges[section + 24]?.start ?? source.length)
    if (end < source.length) {
      const boundary = source.lastIndexOf('\n', end - 1)
      if (boundary > start + 6000) end = boundary + 1
      if (/^[\uDC00-\uDFFF]$/.test(source[end] ?? '')) end--
    }
    const context: HistoryRange[] = []
    for (let i = section; i < ranges.length && ranges[i]!.start < end; i++) {
      const range = ranges[i]!
      context.push({ start: Math.max(range.start, start) - start, end: Math.min(range.end, end) - start, historical: range.historical })
    }
    contexts.push(context); chunks.push(source.slice(start, end)); start = end
  }
  if (!chunks.length && !draft) throw Error('memory_import_empty')
  return { persona: draft, chunks, contexts }
}
interface Options { repository: MemoryRepository; extract: MemoryExtractor; consolidate?: MemoryConsolidator; model(): Promise<string>; canRun(): boolean; report(reason: string): void; onChanged?(): void }
/** One bounded import at a time, explicit operator scope, cancellable between every async boundary. */
export class MemoryImporter {
  private current: MemoryImportStatus = { state: 'empty', chunks: 0, processed: 0, saved: 0, persona: '', code: 'memory_import_empty' }
  private staged?: { avatarId: string; name: string; chunks: string[]; contexts: HistoryRange[][] }
  private abort?: AbortController
  private running?: Promise<void>
  private readonly consolidate: MemoryConsolidator
  constructor(private readonly options: Options) {
    this.consolidate = options.consolidate ?? createMemoryConsolidator({ repository: options.repository, extract: options.extract, report: options.report })
  }
  status(): MemoryImportStatus { return { ...this.current } }
  owns(avatarId: string, name: string): boolean { return this.staged?.avatarId === avatarId && this.staged.name === name }
  stage(avatarId: string, name: string, markdown: string): MemoryImportStatus {
    if (this.running) throw Error('memory_import_busy')
    const plan = prepareMemoryMarkdown(markdown)
    this.staged = { avatarId, name, chunks: plan.chunks, contexts: plan.contexts }
    this.current = { state: 'staged', chunks: plan.chunks.length, processed: 0, saved: 0, persona: plan.persona, code: 'memory_import_staged' }
    if (plan.contexts.some(chunk => chunk.some(range => range.historical.headingsTruncated))) this.options.report('memory_import_heading_context_truncated')
    return this.status()
  }
  start(): MemoryImportStatus {
    if (!this.staged || this.running || !this.options.canRun()) throw Error('memory_import_unavailable')
    const staged = this.staged, abort = new AbortController(); this.abort = abort
    this.current.state = 'running'; this.current.code = 'memory_import_running'
    this.running = this.run(staged, abort.signal).finally(() => { this.running = undefined; staged.chunks.length = 0; staged.contexts.length = 0; this.staged = undefined; this.abort = undefined })
    return this.status()
  }
  private async run(staged: NonNullable<MemoryImporter['staged']>, signal: AbortSignal): Promise<void> {
    try {
      const model = await this.options.model()
      const initial = await this.options.repository.policy(staged.avatarId, staged.name)
      let epoch = initial.epoch
      if (initial.mode === 'off' || initial.cleanupRequired) throw Error()
      const importId = randomUUID()
      const observedAt = new Date().toISOString()
      for (let i = 0; i < staged.chunks.length; i++) {
        if (signal.aborted || !this.options.canRun()) throw Error()
        const policy = await this.options.repository.policy(staged.avatarId, staged.name)
        if (policy.epoch !== epoch || policy.mode === 'off' || policy.cleanupRequired) throw Error()
        const { records, sourceRevisions } = await this.consolidate({ avatarId: staged.avatarId, name: staged.name, model,
          evidence: staged.contexts[i]!.map(({ start, end, historical }, part) => ({ id: `import-${i}-${part}`, text: staged.chunks[i]!.slice(start, end), observedAt, historical })) }, signal)
        if (signal.aborted || !this.options.canRun()) throw Error()
        if (records.length) {
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
        staged.chunks[i] = ''; staged.contexts[i] = []; this.current.processed = i + 1
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
