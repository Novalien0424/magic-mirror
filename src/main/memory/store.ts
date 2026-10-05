import { randomUUID } from 'node:crypto'
import { chmodSync, closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { MEMORY_CONTEXT_BYTES, MEMORY_TEXT_MAX, validMemoryText, type MemoryEntry, type MemoryMode } from '../../shared/memory'
import type { IndexRecord, LearningCommit, LearningRecord, MemoryEmbedding, MemoryPolicy } from './contracts'

const LIST_LIMIT = 100
const RECALL_LIMIT = 8
const BRIEF_BYTES = 2400
const SCAN_BATCH = 256
// Initial abstention threshold; retrieval quality still needs a held-out calibration.
// Provisional Qwen3 threshold: synthetic bilingual matched mean .610 vs unrelated .177.
// Preserve abstention; expand the evaluation set before treating this as quality acceptance.
const SEMANTIC_THRESHOLD = 0.45
const segmenter = new Intl.Segmenter('und', { granularity: 'word' })
type FailureCode = 'memory_invalid_input' | 'memory_schema_unsupported'
type Label = { avatarId: string; name: string }
type Scope = Label & { ownerId: string; searchKey: string; mode: MemoryMode; epoch: number; cleanupRequired: boolean }
type EntryRow = {
  rowid: number; id: string; avatar_id: string; owner_key: string; owner_name: string; topic_key: string
  topic: string; text: string; updated_at: string; kind: LearningRecord['kind']; state: LearningRecord['state']
  event_at: string; revision: number; keep_in_mind: number
}
type Proposal = LearningRecord & { topicKey: string; sources: string[] }
class MemoryFailure extends Error {
  constructor(readonly code: FailureCode) { super(code) }
}
function storageFailure(error: unknown): Error {
  return new Error(error instanceof MemoryFailure ? error.code : 'memory_storage_failed')
}
function validated(value: string, maximum: number, empty = false): string {
  if (!validMemoryText(value, maximum, empty)) throw new MemoryFailure('memory_invalid_input')
  return value
}
function normalized(value: string, maximum: number): string {
  validated(value, maximum)
  return validated(value.normalize('NFKC').trim().toLowerCase(), maximum)
}
function labelFor(avatarId: string, name: string): Label {
  return { avatarId: validated(avatarId, 128), name: normalized(name, 80) }
}
function policyFor(scope: Scope): MemoryPolicy {
  return { mode: scope.mode, epoch: scope.epoch, cleanupRequired: scope.cleanupRequired }
}
function entryFor(row: EntryRow): MemoryEntry {
  return { id: row.id, topic: row.topic, text: row.text, updatedAt: row.updated_at,
    kind: row.kind, revision: row.revision, state: row.state, eventAt: row.event_at, keepInMind: row.keep_in_mind === 1 }
}
function searchTerms(value: string): string[] {
  const text = value.normalize('NFKC').toLowerCase()
  const terms = new Set<string>()
  for (const segment of segmenter.segment(text)) if (segment.isWordLike) terms.add(segment.segment)
  for (const match of text.matchAll(/\p{Script=Han}+/gu)) {
    const characters = [...match[0]]
    for (let index = 0; index + 1 < characters.length; index++) terms.add(characters[index] + characters[index + 1])
  }
  return [...terms]
}
function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    try { database.exec('ROLLBACK') } catch { /* Preserve only the sanitized failure. */ }
    throw error
  }
}
function bounded(rows: MemoryEntry[], bytes = MEMORY_CONTEXT_BYTES, limit = RECALL_LIMIT): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  for (const entry of rows) {
    if (entries.length >= limit) break
    if (Buffer.byteLength(JSON.stringify([...entries, entry]), 'utf8') <= bytes) entries.push(entry)
  }
  return entries
}
function vectorFor(embedding: MemoryEmbedding): number[] {
  if (!embedding || typeof embedding !== 'object') throw new MemoryFailure('memory_invalid_input')
  validated(embedding.version, 128)
  if (!Array.isArray(embedding.values) || !embedding.values.length || embedding.values.length > 4096
    || embedding.values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new MemoryFailure('memory_invalid_input')
  const scale = Math.max(...embedding.values.map(Math.abs))
  if (!scale) throw new MemoryFailure('memory_invalid_input')
  const scaled = embedding.values.map(value => value / scale)
  const length = Math.sqrt(scaled.reduce((sum, value) => sum + value * value, 0))
  return scaled.map(value => value / length)
}
function encodeVector(values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 8)
  values.forEach((value, index) => buffer.writeDoubleLE(value, index * 8))
  return buffer
}
function decodeVector(bytes: Uint8Array, dimensions: number): number[] | undefined {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== dimensions * 8) return undefined
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const values = Array.from({ length: dimensions }, (_, index) => buffer.readDoubleLE(index * 8))
  const length = values.reduce((sum, value) => sum + value * value, 0)
  return values.every(Number.isFinite) && Math.abs(length - 1) < 0.001 ? values : undefined
}
function proposalsFor(commit: LearningCommit): Proposal[] {
  if (!commit || typeof commit !== 'object' || typeof commit.operationId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(commit.operationId)
    || !Number.isSafeInteger(commit.epoch) || commit.epoch < 0
    || !Array.isArray(commit.records) || !commit.records.length || commit.records.length > 64) throw new MemoryFailure('memory_invalid_input')
  const proposals = commit.records.map(record => {
    if (!record || typeof record !== 'object') throw new MemoryFailure('memory_invalid_input')
    const topicKey = normalized(record.topic, 120)
    validated(record.text, MEMORY_TEXT_MAX)
    validated(record.eventAt, 40, true)
    if (!['episode', 'fact', 'commitment'].includes(record.kind) || !['active', 'resolved', 'superseded'].includes(record.state)
      || record.eventAt !== '' && (!/^\d{4}-\d{2}-\d{2}T/.test(record.eventAt) || !Number.isFinite(Date.parse(record.eventAt)))
      || typeof record.keepInMind !== 'boolean' || !Array.isArray(record.sources) || record.sources.length > 64
      || record.expectedRevision !== null && (!Number.isSafeInteger(record.expectedRevision) || record.expectedRevision < 1)) throw new MemoryFailure('memory_invalid_input')
    const sources = record.sources.map(source => normalized(source, 120))
    if (new Set(sources).size !== sources.length || sources.includes(topicKey)) throw new MemoryFailure('memory_invalid_input')
    return { ...record, topic: record.topic.trim(), topicKey, sources }
  })
  const byTopic = new Map(proposals.map(record => [record.topicKey, record]))
  if (byTopic.size !== proposals.length) throw new MemoryFailure('memory_invalid_input')
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (topic: string) => {
    if (visiting.has(topic)) throw new MemoryFailure('memory_invalid_input')
    if (visited.has(topic)) return
    visiting.add(topic)
    for (const source of byTopic.get(topic)?.sources ?? []) if (byTopic.has(source)) visit(source)
    visiting.delete(topic); visited.add(topic)
  }
  for (const record of proposals) visit(record.topicKey)
  return proposals
}

/** Private, synchronous storage. Call through the Main-owned worker; never log inputs or rows. */
export class MemoryStore {
  private database: DatabaseSync | undefined
  private ftsSecureDelete = false

  constructor(path: string) {
    validated(path, 4096)
    if (path.trim() === ':memory:') throw new MemoryFailure('memory_invalid_input')
    let database: DatabaseSync | undefined
    try {
      const file = resolve(path)
      const directory = dirname(file)
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      if (!lstatSync(directory).isDirectory()) throw new Error()
      chmodSync(directory, 0o700)
      const descriptor = openSync(file, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)
      try {
        const information = fstatSync(descriptor)
        if (!information.isFile() || information.nlink !== 1) throw new Error()
        fchmodSync(descriptor, 0o600)
      } finally { closeSync(descriptor) }
      database = new DatabaseSync(file, { allowExtension: false })
      database.exec('PRAGMA busy_timeout = 1000')
      const version = database.prepare('PRAGMA user_version').get()?.user_version
      if (typeof version !== 'number' || version > 2 || version < 0) throw new MemoryFailure('memory_schema_unsupported')
      if (database.prepare('PRAGMA journal_mode = DELETE').get()?.journal_mode !== 'delete') throw new Error()
      database.exec('PRAGMA secure_delete = ON; PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY')
      if (database.prepare('PRAGMA secure_delete').get()?.secure_delete !== 1) throw new Error()
      const opened = database
      transaction(opened, () => {
        if (version < 2) {
          if (opened.prepare("SELECT name FROM sqlite_master WHERE name='memory_entries'").get()) this.migrate(opened)
          else this.createSchema(opened)
        }
        try {
          // FTS5 requires an INTEGER; node:sqlite binds a JS number as REAL.
          opened.prepare('INSERT INTO memory_search(memory_search, rank) VALUES (?, ?)').run('secure-delete', 1n)
          this.ftsSecureDelete = true
        } catch { this.rebuildSearch(opened) }
        opened.exec('PRAGMA user_version = 2')
      })
      this.database = database
    } catch (error) {
      try { database?.close() } catch { /* Never expose native errors. */ }
      throw storageFailure(error)
    }
  }

  names(avatarId: string): string[] {
    validated(avatarId, 128)
    return this.useDatabase(database => database.prepare(`
      SELECT s.owner_name AS name FROM memory_scopes s WHERE s.avatar_id = ?
      AND EXISTS (SELECT 1 FROM memory_entries e WHERE e.owner_key = s.owner_id)
      ORDER BY s.owner_name LIMIT 2000
    `).all(avatarId).map(row => row.name as string))
  }

  save(avatarId: string, name: string, topic: string, text: string): MemoryEntry {
    const label = labelFor(avatarId, name)
    const topicKey = normalized(topic, 120)
    validated(text, MEMORY_TEXT_MAX)
    return this.explicitMutation(label, database => {
      const scope = this.scope(database, label, true)!
      const existing = this.row(database, scope, topicKey)
      const now = new Date().toISOString()
      const record: Proposal = { topicKey, topic: topic.trim(), text, kind: existing?.kind ?? 'fact',
        state: existing?.state ?? 'active', eventAt: existing?.event_at ?? now, sources: [],
        expectedRevision: existing?.revision ?? null, keepInMind: existing?.keep_in_mind === 1 }
      if (existing) this.deleteRows(database, this.descendants(database, existing.id))
      const entry = this.write(database, scope, record, existing?.id ?? randomUUID(), (existing?.revision ?? 0) + 1, now)
      database.prepare('UPDATE memory_scopes SET epoch = epoch + 1, cleanup_required = MAX(cleanup_required, ?) WHERE owner_id = ?')
        .run(existing ? 1 : 0, scope.ownerId)
      if (existing && !this.ftsSecureDelete) this.rebuildSearch(database)
      return entry
    })
  }

  list(avatarId: string, name: string, query?: string): MemoryEntry[] {
    const label = labelFor(avatarId, name)
    if (query !== undefined) validated(query, 200, true)
    return this.useDatabase(database => {
      const scope = this.scope(database, label)
      if (!scope) return []
      return (query?.trim() ? this.search(database, scope, query, LIST_LIMIT) : this.recent(database, scope, LIST_LIMIT)).map(entryFor)
    })
  }

  recall(avatarId: string, name: string, query: string): MemoryEntry[] {
    const label = labelFor(avatarId, name)
    validated(query, 200, true)
    return this.useDatabase(database => {
      const scope = this.scope(database, label)
      if (!scope || !this.readable(scope)) return []
      const candidates = query.trim() ? this.search(database, scope, query, RECALL_LIMIT) : this.recent(database, scope, RECALL_LIMIT)
      return bounded(candidates.filter(row => this.supported(database, row.id)).map(entryFor))
    })
  }

  forget(avatarId: string, name: string, topic: string): boolean {
    const label = labelFor(avatarId, name)
    const topicKey = normalized(topic, 120)
    return this.explicitMutation(label, database => {
      const scope = this.scope(database, label, true)!
      const existing = this.row(database, scope, topicKey)
      if (existing) this.deleteRows(database, new Set([existing.id, ...this.descendants(database, existing.id)]))
      database.prepare('UPDATE memory_scopes SET epoch = epoch + 1, cleanup_required = MAX(cleanup_required, ?) WHERE owner_id = ?')
        .run(existing ? 1 : 0, scope.ownerId)
      if (existing && !this.ftsSecureDelete) this.rebuildSearch(database)
      return !!existing
    })
  }

  policy(avatarId: string, name: string): MemoryPolicy {
    const label = labelFor(avatarId, name)
    return this.useDatabase(database => transaction(database, () => policyFor(this.scope(database, label, true)!)))
  }

  setPolicy(avatarId: string, name: string, mode: MemoryMode): MemoryPolicy {
    const label = labelFor(avatarId, name)
    if (!['automatic', 'explicit', 'off'].includes(mode)) throw new MemoryFailure('memory_invalid_input')
    return this.useDatabase(database => transaction(database, () => {
      const scope = this.scope(database, label, true)!
      const cleanup = mode === 'off' && scope.mode !== 'off' && !!database.prepare('SELECT 1 FROM memory_entries WHERE owner_key = ? LIMIT 1').get(scope.ownerId)
      database.prepare('UPDATE memory_scopes SET mode = ?, epoch = epoch + 1, cleanup_required = MAX(cleanup_required, ?) WHERE owner_id = ?')
        .run(mode, cleanup ? 1 : 0, scope.ownerId)
      return policyFor(this.scope(database, label)!)
    }))
  }

  setCleanupRequired(avatarId: string, name: string, required: boolean): void {
    const label = labelFor(avatarId, name)
    if (typeof required !== 'boolean') throw new MemoryFailure('memory_invalid_input')
    this.useDatabase(database => transaction(database, () => {
      const scope = this.scope(database, label, true)!
      database.prepare('UPDATE memory_scopes SET cleanup_required = ?, epoch = epoch + ? WHERE owner_id = ?')
        .run(required ? 1 : 0, required ? 1 : 0, scope.ownerId)
    }))
  }

  commitLearning(avatarId: string, name: string, commit: LearningCommit): 'committed' | 'duplicate' | 'stale' {
    const label = labelFor(avatarId, name)
    const proposals = proposalsFor(commit)
    return this.useDatabase(database => transaction(database, () => {
      const scope = this.scope(database, label, true)!
      if (database.prepare('SELECT 1 FROM memory_operations WHERE owner_id = ? AND operation_id = ?').get(scope.ownerId, commit.operationId)) return 'duplicate'
      if (scope.mode === 'off' || scope.mode !== 'automatic' && commit.origin !== 'import' || scope.cleanupRequired || scope.epoch !== commit.epoch) return 'stale'
      const targets = new Map(proposals.map(record => [record.topicKey, this.row(database, scope, record.topicKey)]))
      const sources = new Map(Object.entries(commit.sourceRevisions ?? {}).map(([topic, revision]) => [normalized(topic, 120), revision]))
      for (const proposal of proposals) {
        const target = targets.get(proposal.topicKey)
        if ((target?.revision ?? null) !== proposal.expectedRevision) return 'stale'
        if (proposal.sources.some(source => !targets.has(source) && (!Number.isSafeInteger(sources.get(source)) || this.row(database, scope, source)?.revision !== sources.get(source)))) return 'stale'
        if (target && !this.supported(database, target.id)) return 'stale'
      }
      const ids = new Map(proposals.map(record => [record.topicKey, targets.get(record.topicKey)?.id ?? randomUUID()]))
      const revisions = new Map<string, number>()
      for (const source of sources.keys()) if (!targets.has(source)) {
        const row = this.row(database, scope, source)
        if (!row || !this.supported(database, row.id)) return 'stale'
        ids.set(source, row.id); revisions.set(source, row.revision)
      }
      const changedTopics = new Set(proposals.filter(record => {
        const old = targets.get(record.topicKey)
        const dependencies = old ? database.prepare(`SELECT e.topic_key FROM memory_dependencies d
          JOIN memory_entries e ON e.id = d.source_id WHERE d.dependent_id = ? ORDER BY e.topic_key`).all(old.id).map(row => row.topic_key as string) : []
        const differs = !old || old.topic !== record.topic || old.text !== record.text || old.kind !== record.kind || old.state !== record.state
          || old.event_at !== record.eventAt || (old.keep_in_mind === 1) !== record.keepInMind
          || JSON.stringify(dependencies) !== JSON.stringify([...record.sources].sort())
        revisions.set(record.topicKey, (old?.revision ?? 0) + (differs ? 1 : 0))
        return differs
      }).map(record => record.topicKey))
      // A dependency revision is part of the derived record's revision, even when its text is unchanged.
      let expanded = true
      while (expanded) {
        expanded = false
        for (const record of proposals) {
          if (changedTopics.has(record.topicKey) || !record.sources.some(source => changedTopics.has(source))) continue
          changedTopics.add(record.topicKey)
          revisions.set(record.topicKey, (targets.get(record.topicKey)?.revision ?? 0) + 1)
          expanded = true
        }
      }
      const changed = proposals.filter(record => changedTopics.has(record.topicKey))
      const removed = new Set<string>()
      for (const record of changed) {
        const old = targets.get(record.topicKey)
        if (old) for (const id of this.descendants(database, old.id)) if (![...ids.values()].includes(id)) removed.add(id)
      }
      this.deleteRows(database, removed)
      const now = new Date().toISOString()
      for (const record of changed) this.write(database, scope, record, ids.get(record.topicKey)!, revisions.get(record.topicKey)!, now)
      for (const record of changed) for (const source of record.sources) {
        database.prepare('INSERT INTO memory_dependencies (source_id, dependent_id, source_revision) VALUES (?, ?, ?)')
          .run(ids.get(source)!, ids.get(record.topicKey)!, revisions.get(source)!)
      }
      // A source can change in the same batch as an otherwise unchanged dependent snapshot.
      for (const record of proposals) for (const source of record.sources) {
        database.prepare('UPDATE memory_dependencies SET source_revision = ? WHERE source_id = ? AND dependent_id = ?')
          .run(revisions.get(source)!, ids.get(source)!, ids.get(record.topicKey)!)
      }
      if (changed.some(record => !!targets.get(record.topicKey)) || removed.size) {
        database.prepare('UPDATE memory_scopes SET cleanup_required = 1, epoch = epoch + ? WHERE owner_id = ?').run(removed.size ? 1 : 0, scope.ownerId)
      }
      if (!this.ftsSecureDelete && (removed.size || changed.some(record => !!targets.get(record.topicKey)))) this.rebuildSearch(database)
      database.prepare('INSERT INTO memory_operations (owner_id, operation_id) VALUES (?, ?)').run(scope.ownerId, commit.operationId)
      return 'committed'
    }))
  }

  brief(avatarId: string, name: string): MemoryEntry[] {
    const label = labelFor(avatarId, name)
    return this.useDatabase(database => {
      const scope = this.scope(database, label)
      if (!scope || !this.readable(scope)) return []
      const current = database.prepare(`SELECT * FROM memory_entries WHERE owner_key = ? AND state = 'active'
        AND (kind IN ('fact', 'commitment') OR keep_in_mind = 1)
        ORDER BY keep_in_mind DESC, CASE kind WHEN 'commitment' THEN 0 ELSE 1 END, updated_at DESC, id LIMIT ?`)
        .all(scope.ownerId, LIST_LIMIT) as unknown as EntryRow[]
      const episodes = database.prepare(`SELECT * FROM memory_entries WHERE owner_key = ? AND kind = 'episode' AND state = 'active'
        ORDER BY event_at DESC, updated_at DESC, id LIMIT ?`).all(scope.ownerId, RECALL_LIMIT) as unknown as EntryRow[]
      const episode = episodes.find(row => this.supported(database, row.id) && bounded([entryFor(row)], BRIEF_BYTES).length)
      const entries = episode ? [entryFor(episode)] : []
      for (const row of current) {
        if (row.id === episode?.id || !this.supported(database, row.id)) continue
        const entry = entryFor(row)
        if (Buffer.byteLength(JSON.stringify([...entries, entry]), 'utf8') <= BRIEF_BYTES) entries.push(entry)
      }
      return episode ? [...entries.slice(1), entries[0]] : entries
    })
  }

  hybridRecall(avatarId: string, name: string, query: string, embedding?: MemoryEmbedding): { entries: MemoryEntry[]; incomplete: boolean } {
    const label = labelFor(avatarId, name)
    validated(query, 200, true)
    const vector = embedding === undefined ? undefined : vectorFor(embedding)
    return this.useDatabase(database => {
      const scope = this.scope(database, label)
      if (!scope) return { entries: [], incomplete: false }
      if (!this.readable(scope)) return { entries: [], incomplete: true }
      const candidates = new Map<string, { row: EntryRow; score: number }>()
      const terms = searchTerms(query)
      const lexical = query.trim() ? this.search(database, scope, query, LIST_LIMIT) : this.recent(database, scope, RECALL_LIMIT)
      for (const row of lexical) {
        if (row.state === 'superseded' || !this.supported(database, row.id)) continue
        const indexed = new Set(searchTerms(`${row.topic} ${row.text}`))
        const overlap = terms.length ? terms.filter(term => indexed.has(term)).length / terms.length : 1
        if (overlap >= 0.25) candidates.set(row.id, { row, score: 0.20 + overlap * 0.05 })
      }
      let incomplete = vector === undefined
      if (vector && embedding) {
        const dimension = database.prepare('SELECT dimensions FROM memory_embedding_versions WHERE version = ?').get(embedding.version)?.dimensions
        const missing = database.prepare(`SELECT 1 FROM memory_entries e LEFT JOIN memory_vectors v
          ON v.entry_id = e.id AND v.revision = e.revision AND v.version = ? AND v.dimensions = ?
          WHERE e.owner_key = ? AND e.state != 'superseded' AND v.entry_id IS NULL LIMIT 1`).get(embedding.version, vector.length, scope.ownerId)
        incomplete = !!missing || dimension !== undefined && dimension !== vector.length
        if (dimension === vector.length) {
          let cursor = 0
          const scan = database.prepare(`SELECT e.*, v.vector FROM memory_entries e JOIN memory_vectors v ON v.entry_id = e.id
            WHERE e.owner_key = ? AND e.state != 'superseded' AND v.version = ? AND v.revision = e.revision AND v.dimensions = ? AND e.rowid > ?
            ORDER BY e.rowid LIMIT ?`)
          while (true) {
            const batch = scan.all(scope.ownerId, embedding.version, vector.length, cursor, SCAN_BATCH) as unknown as (EntryRow & { vector: Uint8Array })[]
            if (!batch.length) break
            for (const row of batch) {
              cursor = row.rowid
              const values = decodeVector(row.vector, vector.length)
              if (!values || !this.supported(database, row.id)) { incomplete = true; continue }
              const score = values.reduce((sum, value, index) => sum + value * vector[index], 0)
              if (score < SEMANTIC_THRESHOLD) continue
              const previous = candidates.get(row.id)
              candidates.set(row.id, { row, score: score + (previous ? 0.05 : 0) })
              // Bound candidate memory while still scanning every eligible vector.
              if (candidates.size > LIST_LIMIT * 2) {
                const weakest = [...candidates.values()].sort((a, b) => a.score - b.score || a.row.id.localeCompare(b.row.id))[0]
                candidates.delete(weakest.row.id)
              }
            }
          }
        }
      }
      const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || b.row.event_at.localeCompare(a.row.event_at) || a.row.id.localeCompare(b.row.id))
      return { entries: bounded(ranked.map(candidate => entryFor(candidate.row))), incomplete }
    })
  }

  pendingIndex(version: string, limit: number): IndexRecord[] {
    validated(version, 128)
    if (!Number.isSafeInteger(limit) || limit < 0) throw new MemoryFailure('memory_invalid_input')
    return this.useDatabase(database => {
      const rows = database.prepare(`SELECT e.* FROM memory_entries e JOIN memory_scopes s ON s.owner_id = e.owner_key
        LEFT JOIN memory_vectors v ON v.entry_id = e.id AND v.revision = e.revision AND v.version = ?
        WHERE s.mode != 'off' AND s.cleanup_required = 0 AND e.state != 'superseded' AND v.entry_id IS NULL
        ORDER BY e.rowid LIMIT ?`).all(version, Math.min(limit, LIST_LIMIT)) as unknown as EntryRow[]
      return rows.filter(row => this.supported(database, row.id)).map(row => ({ avatarId: row.avatar_id, name: row.owner_name, entry: entryFor(row), revision: row.revision }))
    })
  }

  setEmbedding(avatarId: string, name: string, id: string, revision: number, embedding: MemoryEmbedding): boolean {
    const label = labelFor(avatarId, name)
    validated(id, 128)
    if (!Number.isSafeInteger(revision) || revision < 1) throw new MemoryFailure('memory_invalid_input')
    const vector = vectorFor(embedding)
    return this.useDatabase(database => transaction(database, () => {
      const scope = this.scope(database, label)
      if (!scope || !this.readable(scope)) return false
      const row = database.prepare('SELECT * FROM memory_entries WHERE owner_key = ? AND id = ? AND revision = ?').get(scope.ownerId, id, revision) as unknown as EntryRow | undefined
      if (!row || row.state === 'superseded' || !this.supported(database, id)) return false
      const dimension = database.prepare('SELECT dimensions FROM memory_embedding_versions WHERE version = ?').get(embedding.version)?.dimensions
      if (dimension !== undefined && dimension !== vector.length) throw new MemoryFailure('memory_invalid_input')
      database.prepare('INSERT OR IGNORE INTO memory_embedding_versions (version, dimensions) VALUES (?, ?)').run(embedding.version, vector.length)
      database.prepare(`INSERT INTO memory_vectors (entry_id, revision, version, dimensions, vector) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(entry_id) DO UPDATE SET revision=excluded.revision, version=excluded.version, dimensions=excluded.dimensions, vector=excluded.vector`)
        .run(id, revision, embedding.version, vector.length, encodeVector(vector))
      return true
    }))
  }

  close(): void {
    const database = this.database
    this.database = undefined
    try { database?.close() } catch { throw new Error('memory_storage_failed') }
  }

  private useDatabase<T>(operation: (database: DatabaseSync) => T): T {
    if (!this.database) throw new Error('memory_storage_failed')
    try { return operation(this.database) } catch (error) { throw storageFailure(error) }
  }
  private explicitMutation<T>(label: Label, operation: (database: DatabaseSync) => T): T {
    return this.useDatabase(database => {
      try { return transaction(database, () => operation(database)) } catch (error) {
        // Keep content/index rollback atomic, but persist the content-free safety barrier separately.
        try {
          transaction(database, () => {
            const scope = this.scope(database, label, true)!
            database.prepare('UPDATE memory_scopes SET epoch = epoch + 1, cleanup_required = 1 WHERE owner_id = ?').run(scope.ownerId)
          })
        } catch { /* Main also treats the failed mutation as unavailable if storage itself is unusable. */ }
        throw error
      }
    })
  }
  private readable(scope: Scope): boolean { return scope.mode !== 'off' && !scope.cleanupRequired }
  private scope(database: DatabaseSync, label: Label, create = false, mode: MemoryMode = 'automatic'): Scope | undefined {
    let row = database.prepare('SELECT * FROM memory_scopes WHERE avatar_id = ? AND owner_name = ?').get(label.avatarId, label.name)
    if (!row && create) {
      const id = randomUUID()
      database.prepare('INSERT INTO memory_scopes (owner_id, avatar_id, owner_name, mode) VALUES (?, ?, ?, ?)').run(id, label.avatarId, label.name, mode)
      row = database.prepare('SELECT * FROM memory_scopes WHERE owner_id = ?').get(id)
    }
    return row ? { ...label, ownerId: row.owner_id as string, searchKey: (row.owner_id as string).replaceAll('-', ''),
      mode: row.mode as MemoryMode, epoch: row.epoch as number, cleanupRequired: row.cleanup_required === 1 } : undefined
  }
  private row(database: DatabaseSync, scope: Scope, topic: string): EntryRow | undefined {
    return database.prepare('SELECT * FROM memory_entries WHERE avatar_id = ? AND owner_key = ? AND topic_key = ?')
      .get(scope.avatarId, scope.ownerId, topic) as unknown as EntryRow | undefined
  }
  private recent(database: DatabaseSync, scope: Scope, limit: number): EntryRow[] {
    return database.prepare('SELECT * FROM memory_entries WHERE avatar_id = ? AND owner_key = ? ORDER BY updated_at DESC, id LIMIT ?')
      .all(scope.avatarId, scope.ownerId, limit) as unknown as EntryRow[]
  }
  private supported(database: DatabaseSync, id: string, ancestors = new Set<string>()): boolean {
    if (ancestors.has(id) || ancestors.size >= 64) return false
    const dependencies = database.prepare(`SELECT d.source_id, d.source_revision, e.revision FROM memory_dependencies d
      LEFT JOIN memory_entries e ON e.id = d.source_id WHERE d.dependent_id = ?`).all(id)
    const next = new Set([...ancestors, id])
    return dependencies.every(row => row.revision === row.source_revision && this.supported(database, row.source_id as string, next))
  }
  private descendants(database: DatabaseSync, id: string): Set<string> {
    return new Set(database.prepare(`WITH RECURSIVE affected(id) AS (
      SELECT dependent_id FROM memory_dependencies WHERE source_id = ?
      UNION SELECT d.dependent_id FROM memory_dependencies d JOIN affected a ON d.source_id = a.id)
      SELECT id FROM affected`).all(id).map(row => row.id as string))
  }
  private deleteRows(database: DatabaseSync, ids: Set<string>): void {
    const search = database.prepare('DELETE FROM memory_search WHERE rowid IN (SELECT rowid FROM memory_entries WHERE id = ?)')
    const entries = database.prepare('DELETE FROM memory_entries WHERE id = ?')
    for (const id of ids) { search.run(id); entries.run(id) }
  }
  private write(database: DatabaseSync, scope: Scope, record: Proposal, id: string, revision: number, now: string): MemoryEntry {
    database.prepare('DELETE FROM memory_search WHERE rowid IN (SELECT rowid FROM memory_entries WHERE id = ?)').run(id)
    database.prepare('DELETE FROM memory_vectors WHERE entry_id = ?').run(id)
    database.prepare('DELETE FROM memory_dependencies WHERE dependent_id = ?').run(id)
    database.prepare(`INSERT INTO memory_entries (id, avatar_id, owner_key, owner_name, topic_key, topic, text, updated_at, kind, state, event_at, revision, keep_in_mind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(avatar_id, owner_key, topic_key) DO UPDATE SET topic=excluded.topic, text=excluded.text, updated_at=excluded.updated_at,
      kind=excluded.kind, state=excluded.state, event_at=excluded.event_at, revision=excluded.revision, keep_in_mind=excluded.keep_in_mind`)
      .run(id, scope.avatarId, scope.ownerId, scope.name, record.topicKey, record.topic, record.text, now, record.kind, record.state, record.eventAt, revision, record.keepInMind ? 1 : 0)
    this.indexSearch(database, scope, id, `${record.topic} ${record.text}`)
    return entryFor(this.row(database, scope, record.topicKey)!)
  }
  private indexSearch(database: DatabaseSync, scope: Scope, id: string, text: string): void {
    database.prepare('INSERT INTO memory_search (rowid, scope, terms) SELECT rowid, ?, ? FROM memory_entries WHERE id = ?')
      .run(scope.searchKey, searchTerms(text).join(' '), id)
  }
  private rebuildSearch(database: DatabaseSync): void {
    database.prepare('INSERT INTO memory_search(memory_search) VALUES (?)').run('rebuild')
  }
  private search(database: DatabaseSync, scope: Scope, query: string, limit: number): EntryRow[] {
    const terms = searchTerms(query)
    if (!terms.length) return []
    const quoted = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ')
    const match = `scope : "${scope.searchKey}" AND terms : (${quoted})`
    return database.prepare(`SELECT e.* FROM memory_search JOIN memory_entries e ON e.rowid = memory_search.rowid
      WHERE e.avatar_id = ? AND e.owner_key = ? AND memory_search.scope = ? AND memory_search MATCH ?
      ORDER BY bm25(memory_search, 0.0, 1.0), e.updated_at DESC, e.id LIMIT ?`)
      .all(scope.avatarId, scope.ownerId, scope.searchKey, match, limit) as unknown as EntryRow[]
  }
  private createSchema(database: DatabaseSync): void {
    database.exec(`CREATE TABLE memory_scopes (
      owner_id TEXT PRIMARY KEY, avatar_id TEXT NOT NULL, owner_name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('automatic','explicit','off')), epoch INTEGER NOT NULL DEFAULT 0,
      cleanup_required INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_required IN (0,1)), UNIQUE(avatar_id, owner_name));
      CREATE TABLE memory_entries (
        rowid INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, avatar_id TEXT NOT NULL, owner_key TEXT NOT NULL REFERENCES memory_scopes(owner_id),
        owner_name TEXT NOT NULL, topic_key TEXT NOT NULL, topic TEXT NOT NULL, text TEXT NOT NULL, updated_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('episode','fact','commitment')), state TEXT NOT NULL CHECK(state IN ('active','resolved','superseded')),
        event_at TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), keep_in_mind INTEGER NOT NULL CHECK(keep_in_mind IN (0,1)),
        UNIQUE(avatar_id, owner_key, topic_key));
      CREATE INDEX memory_scope_v2_recent ON memory_entries(owner_key, updated_at DESC, id);
      CREATE TABLE memory_dependencies (
        source_id TEXT NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
        dependent_id TEXT NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE, source_revision INTEGER NOT NULL,
        PRIMARY KEY(source_id, dependent_id));
      CREATE INDEX memory_dependency_target ON memory_dependencies(dependent_id);
      CREATE TABLE memory_vectors (
        entry_id TEXT PRIMARY KEY REFERENCES memory_entries(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL, version TEXT NOT NULL, dimensions INTEGER NOT NULL, vector BLOB NOT NULL);
      CREATE TABLE memory_embedding_versions (version TEXT PRIMARY KEY, dimensions INTEGER NOT NULL);
      CREATE TABLE memory_operations (owner_id TEXT NOT NULL REFERENCES memory_scopes(owner_id), operation_id TEXT NOT NULL, PRIMARY KEY(owner_id, operation_id));
      CREATE VIRTUAL TABLE memory_search USING fts5(scope, terms);`)
  }
  private migrate(database: DatabaseSync): void {
    // No backup or payload journal: old rows and projections are replaced in one DELETE-journal transaction.
    database.exec('DROP TABLE IF EXISTS memory_search; ALTER TABLE memory_entries RENAME TO memory_entries_v1')
    this.createSchema(database)
    const scopes = new Map<string, Scope>()
    const rows = database.prepare('SELECT * FROM memory_entries_v1 ORDER BY avatar_id, owner_key, rowid').all()
    for (const old of rows) {
      const avatarId = validated(old.avatar_id as string, 128)
      const oldKey = JSON.stringify([avatarId, old.owner_key])
      let scope = scopes.get(oldKey)
      if (!scope) {
        const base = normalized(old.owner_name as string, 80)
        let name = base
        // Preserve distinct legacy owners even if their operator labels normalize to the same string.
        for (let suffix = 2; this.scope(database, { avatarId, name }); suffix++) {
          const ending = ` (${suffix})`
          name = `${base.slice(0, 80 - ending.length)}${ending}`
        }
        scope = this.scope(database, { avatarId, name }, true, 'explicit')!
        scopes.set(oldKey, scope)
      }
      database.prepare(`INSERT INTO memory_entries (rowid, id, avatar_id, owner_key, owner_name, topic_key, topic, text, updated_at, kind, state, event_at, revision, keep_in_mind)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'fact', 'active', ?, 1, 0)`)
        .run(old.rowid, old.id, avatarId, scope.ownerId, scope.name, normalized(old.topic as string, 120), old.topic, old.text, old.updated_at, old.updated_at)
      this.indexSearch(database, scope, old.id as string, `${old.topic} ${old.text}`)
    }
    database.exec('DROP TABLE memory_entries_v1')
  }
}
