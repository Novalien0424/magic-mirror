import { validMemoryText, type MemoryEntry } from '../../shared/memory'
import type { LearningRecord, MemoryEmbedder, MemoryRepository } from './contracts'
import type { MemoryEvidence, MemoryExtractor } from './extractor'

export interface MemoryConsolidationInput { avatarId: string; name: string; model: string; evidence: MemoryEvidence[] }
export interface MemoryConsolidation { records: LearningRecord[]; sourceRevisions: Record<string, number> }
export type MemoryConsolidator = (input: MemoryConsolidationInput, signal: AbortSignal) => Promise<MemoryConsolidation>
interface Options { repository: MemoryRepository; extract: MemoryExtractor; embedder?: MemoryEmbedder; report(reason: string): void }
const PROPOSAL_LIMIT = 8
const CONTEXT_LIMIT = 24
const CONTEXT_BYTES = 32_000

function topicKey(topic: string): string {
  if (!validMemoryText(topic, 120)) throw Error('memory_extraction_invalid')
  const key = topic.normalize('NFKC').trim().toLowerCase()
  if (!validMemoryText(key, 120)) throw Error('memory_extraction_invalid')
  return key
}
function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw Error('memory_consolidation_cancelled')
}
/** Validate model semantics against retrieved snapshots; never fill in or rebase a revision. */
function grounded(records: LearningRecord[], existing: MemoryEntry[]): MemoryConsolidation {
  if (!Array.isArray(records) || records.length > PROPOSAL_LIMIT) throw Error('memory_extraction_invalid')
  const byTopic = new Map(existing.map(entry => [topicKey(entry.topic), entry]))
  const targets = new Set<string>(), sources: [string, number][] = []
  for (const record of records) {
    if (!record || !validMemoryText(record.text, 1000)) throw Error('memory_extraction_invalid')
    const key = topicKey(record.topic), prior = byTopic.get(key)
    if (targets.has(key) || record.expectedRevision !== (prior ? prior.revision ?? 1 : null)
      || !Array.isArray(record.sources) || record.sources.length > 12) throw Error('memory_extraction_invalid')
    targets.add(key)
    const dependencies = new Set<string>()
    for (const topic of record.sources) {
      const sourceKey = topicKey(topic), source = byTopic.get(sourceKey)
      if (!source || sourceKey === key || dependencies.has(sourceKey)) throw Error('memory_extraction_invalid')
      dependencies.add(sourceKey); sources.push([topic, source.revision ?? 1])
    }
  }
  return { records, sourceRevisions: Object.fromEntries(sources) }
}

/** Main-only extract -> scoped retrieve -> reconcile. Raw evidence and candidates stay in RAM. */
export function createMemoryConsolidator(options: Options): MemoryConsolidator {
  return async (input, signal) => {
    checkCancelled(signal)
    const extraction = { model: input.model, evidence: input.evidence, existing: [] as MemoryEntry[] }
    const draft = grounded(await options.extract(extraction, signal), []).records
    checkCancelled(signal)
    if (!draft.length) return { records: [], sourceRevisions: {} }

    const exact = await options.repository.lookupTopics(input.avatarId, input.name, draft.map(record => record.topic))
    checkCancelled(signal)
    const candidates = new Map(exact.map(entry => [topicKey(entry.topic), entry]))
    let semanticAvailable = !!options.embedder, incomplete = false, omitted = false
    for (const record of draft) {
      let query = `${record.topic} ${record.text}`.slice(0, 200)
      if (/[\uD800-\uDBFF]$/u.test(query)) query = query.slice(0, -1)
      let embedding
      if (semanticAvailable && options.embedder) {
        try { embedding = await options.embedder.embed(query, 'query', signal) }
        catch {
          checkCancelled(signal)
          semanticAvailable = false
          options.report('memory_consolidation_embedding_unavailable')
        }
        checkCancelled(signal)
      }
      const recalled = await options.repository.hybridRecall(input.avatarId, input.name, query, embedding)
      checkCancelled(signal)
      incomplete ||= recalled.incomplete
      omitted ||= recalled.entries.length > 8
      for (const entry of recalled.entries.slice(0, 8)) {
        const key = topicKey(entry.topic)
        if (!candidates.has(key)) candidates.set(key, entry)
      }
    }
    if (incomplete) options.report('memory_consolidation_retrieval_incomplete')

    const existing: MemoryEntry[] = [], exactKeys = new Set(exact.map(entry => topicKey(entry.topic)))
    for (const [key, entry] of candidates) {
      if (existing.length < CONTEXT_LIMIT && Buffer.byteLength(JSON.stringify([...existing, entry]), 'utf8') <= CONTEXT_BYTES) existing.push(entry)
      else {
        if (exactKeys.has(key)) throw Error('memory_extraction_invalid')
        omitted = true
      }
    }
    if (omitted) options.report('memory_consolidation_context_bounded')
    // No candidates means the draft already has the correct empty-store semantics.
    if (!existing.length) return grounded(draft, [])
    const records = await options.extract({ ...extraction, existing }, signal)
    checkCancelled(signal)
    return grounded(records, existing)
  }
}
