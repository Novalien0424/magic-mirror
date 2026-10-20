import { z } from 'zod'
import type { MemoryEntry } from '../../shared/memory'
import type { LearningRecord } from './contracts'
import { MEMORY_PROMPTS } from '../../shared/memory-prompts'
import { eventCalendarDay, memoryEventDate } from './calendar'

export interface HistoricalMemoryContext {
  headings: string[]
  sourceAt: string
  speaker: 'visitor' | 'assistant' | 'unknown'
  headingsTruncated?: true
}
export interface MemoryEvidence { id: string; text: string; observedAt: string; historical?: HistoricalMemoryContext }
export interface ExtractionInput { model: string; evidence: MemoryEvidence[]; existing: MemoryEntry[] }
export type MemoryExtractor = (input: ExtractionInput, signal: AbortSignal) => Promise<LearningRecord[]>
function mentionsEventDate(text: string, eventAt: string): boolean {
  const event = memoryEventDate(eventAt)
  if (!event) return false
  const content = text.replace(/^\s{0,3}#{1,6}\s+.*$/gmu, ''), day = eventCalendarDay(eventAt, event)
  const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})/gu
  const timestamps = [...content.matchAll(timestampPattern)]
  if (timestamps.some(match => {
    const date = memoryEventDate(match[0])
    return date && (event.instant !== undefined && date.instant === event.instant || eventCalendarDay(match[0], date) === day)
  })) return true
  // A timestamp's UTC date prefix is not independent event-local calendar evidence.
  const calendarContent = content.replace(timestampPattern, '')
  const dates = [...calendarContent.matchAll(/(?<!\d)(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?!\d)/gu)]
  if (dates.some(date => `${date[1]}-${date[2]!.padStart(2, '0')}-${date[3]!.padStart(2, '0')}` === day)) return true
  const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
  const words = new RegExp(`\\b(?:${month}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${month}\\s+\\d{4})\\b`, 'giu')
  return [...calendarContent.matchAll(words)].some(date => {
    const parsed = Date.parse(`${date[0]} UTC`)
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === day
  })
}
const safeText = (max: number) => z.string().max(max).refine(s => !/[\u0000-\u001f\u007f]/u.test(s))
const proposal = z.object({
  topic: safeText(120).refine(s => !!s.trim()), text: safeText(1000).refine(s => !!s.trim()),
  kind: z.enum(['episode', 'fact', 'commitment']), state: z.enum(['active', 'resolved', 'superseded']),
  eventAt: safeText(40), sources: z.array(safeText(120)).max(12),
  expectedRevision: z.number().int().positive().nullable(), keepInMind: z.boolean(),
  evidence: z.array(safeText(128)).min(1).max(24),
}).strict()
const output = z.object({ records: z.array(proposal).max(8) }).strict()
const schema = { type: 'object', properties: { records: { type: 'array', items: {
  type: 'object', properties: {
    topic: { type: 'string' }, text: { type: 'string' }, kind: { type: 'string', enum: ['episode', 'fact', 'commitment'] },
    state: { type: 'string', enum: ['active', 'resolved', 'superseded'] }, eventAt: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } }, expectedRevision: { type: ['integer', 'null'] }, keepInMind: { type: 'boolean' },
    evidence: { type: 'array', items: { type: 'string' } },
  }, required: ['topic', 'text', 'kind', 'state', 'eventAt', 'sources', 'expectedRevision', 'keepInMind', 'evidence'], additionalProperties: false,
} } }, required: ['records'], additionalProperties: false }
const instructions = MEMORY_PROMPTS.extractor

export function createMemoryExtractor(options: { credentialSource: { get(): Promise<string | null> }; fetchImpl?: typeof fetch; report?: (reason: string) => void }): MemoryExtractor {
  return async (input, signal) => {
    if (!input.model || input.evidence.length === 0 || input.evidence.length > 24 || signal.aborted) throw Error('memory_extraction_unavailable')
    let body: unknown
    try {
      const key = await options.credentialSource.get()
      if (!key || signal.aborted) throw Error()
      const response = await (options.fetchImpl ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: input.model, store: false, instructions,
          input: JSON.stringify({ evidence: input.evidence, existing: input.existing.map(({ topic, text, revision, kind, state, eventAt }) => ({ topic, text, revision: revision ?? 1, kind: kind ?? 'fact', state: state ?? 'active', eventAt: eventAt ?? '' })) }),
          text: { format: { type: 'json_schema', name: 'relationship_memory', strict: true, schema } } }),
      })
      if (!response.ok || !response.body) throw Error()
      const reader = response.body.getReader(), chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          if (size > 96 * 1024) { await reader.cancel(); throw Error() }
          chunks.push(part.value)
        }
      } finally { reader.releaseLock() }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch { throw Error('memory_extraction_unavailable') }
    let validationReason = 'memory_extraction_shape_invalid'
    const invalid = (reason: string): never => { validationReason = reason; throw Error() }
    try {
      const result = body as { status: string; output: { type: string; phase?: unknown; content?: { type: string; text?: string }[] }[] }
      if (signal.aborted || result.status !== 'completed' || !Array.isArray(result.output)) throw Error()
      const parts = result.output.filter(item => item.type === 'message' && (item.phase == null || item.phase === 'final_answer')).flatMap(item => item.content ?? [])
      if (parts.length !== 1 || parts[0]?.type !== 'output_text') throw Error()
      const parsed = output.parse(JSON.parse(parts[0].text!))
      const evidence = new Map(input.evidence.map(e => [e.id, e])), existing = new Map(input.existing.map(e => [e.topic, e]))
      for (const record of parsed.records) {
        if (!record.evidence.every(id => evidence.has(id))) invalid('memory_extraction_evidence_unknown')
        if (!record.sources.every(topic => existing.has(topic))) invalid('memory_extraction_source_unknown')
        const cited = record.evidence.map(id => evidence.get(id)!)
        if (cited.some(item => item.historical?.speaker === 'assistant') && !cited.some(item => !item.historical || item.historical.speaker === 'visitor')) invalid('memory_extraction_speaker_unsupported')
        // Unknown historical dates cannot gain a calendar anchor from ingestion time.
        if (record.eventAt && cited.every(item => item.historical && !item.historical.sourceAt && !mentionsEventDate(item.text, record.eventAt))) invalid('memory_extraction_unanchored_date')
        const prior = existing.get(record.topic)
        if (prior ? record.expectedRevision !== (prior.revision ?? 1) : record.expectedRevision !== null) invalid('memory_extraction_revision_mismatch')
        if (record.eventAt && !memoryEventDate(record.eventAt)) invalid('memory_extraction_date_invalid')
      }
      return parsed.records.map(({ evidence: _evidence, ...record }) => record)
    } catch {
      try { options.report?.(validationReason) } catch { /* Diagnostics cannot change rejection. */ }
      throw Error('memory_extraction_invalid')
    }
  }
}
