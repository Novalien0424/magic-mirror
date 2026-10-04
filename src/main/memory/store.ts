import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { MEMORY_CONTEXT_BYTES, MEMORY_TEXT_MAX, validMemoryText, type MemoryEntry } from '../../shared/memory'

const RECORD_LIMIT = 2000
const LIST_LIMIT = 100
const RECALL_LIMIT = 8
const segmenter = new Intl.Segmenter('und', { granularity: 'word' })

type Scope = { avatarId: string; ownerKey: string; name: string; searchKey: string }
type FailureCode = 'memory_limit_reached' | 'memory_schema_unsupported'
class MemoryFailure extends Error {
  constructor(readonly code: FailureCode) { super(code) }
}

function storageFailure(error: unknown): Error {
  return new Error(error instanceof MemoryFailure ? error.code : 'memory_storage_failed')
}

function validated(value: string, maximum: number, empty = false): string {
  if (!validMemoryText(value, maximum, empty)) throw new Error('memory_invalid_input')
  return value
}

function normalized(value: string, maximum: number): string {
  validated(value, maximum)
  return validated(value.normalize('NFKC').trim().toLowerCase(), maximum)
}

function scopeFor(avatarId: string, name: string): Scope {
  validated(avatarId, 128)
  const canonicalName = normalized(name, 80)
  const ownerKey = createHash('sha256').update(canonicalName).digest('hex')
  const searchKey = createHash('sha256').update(JSON.stringify([avatarId, ownerKey])).digest('hex')
  return { avatarId, ownerKey, name: canonicalName, searchKey }
}

function searchTerms(value: string): string[] {
  const text = value.normalize('NFKC').toLowerCase()
  const terms = new Set<string>()
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) terms.add(segment.segment)
  }
  for (const match of text.matchAll(/\p{Script=Han}+/gu)) {
    const characters = [...match[0]]
    for (let index = 0; index + 1 < characters.length; index++) {
      terms.add(characters[index] + characters[index + 1])
    }
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
    try { database.exec('ROLLBACK') } catch { /* Preserve only the sanitized operation failure. */ }
    throw error
  }
}

/** Main-only storage of explicitly selected structured memory; never log its inputs or rows. */
export class MemoryStore {
  private database: DatabaseSync | undefined
  private ftsSecureDelete = false

  constructor(path: string) {
    validated(path, 4096)
    if (path.trim() === ':memory:') throw new Error('memory_invalid_input')
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
      } finally {
        closeSync(descriptor)
      }
      database = new DatabaseSync(file, { allowExtension: false })
      database.exec('PRAGMA busy_timeout = 1000')
      const version = database.prepare('PRAGMA user_version').get()?.user_version
      if (typeof version !== 'number' || version > 1) throw new MemoryFailure('memory_schema_unsupported')
      if (database.prepare('PRAGMA journal_mode = DELETE').get()?.journal_mode !== 'delete') throw new Error()
      database.exec('PRAGMA secure_delete = ON')
      if (database.prepare('PRAGMA secure_delete').get()?.secure_delete !== 1) throw new Error()
      const opened = database
      transaction(opened, () => {
        opened.exec(`
          CREATE TABLE IF NOT EXISTS memory_entries (
            rowid INTEGER PRIMARY KEY,
            id TEXT NOT NULL UNIQUE,
            avatar_id TEXT NOT NULL,
            owner_key TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            topic_key TEXT NOT NULL,
            topic TEXT NOT NULL,
            text TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (avatar_id, owner_key, topic_key)
          );
          CREATE INDEX IF NOT EXISTS memory_scope_recent
            ON memory_entries (avatar_id, owner_key, updated_at DESC, id);
          CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(scope, terms);
        `)
        try {
          // FTS5 requires an integer flag; node:sqlite binds a JS number as a REAL.
          opened.prepare('INSERT INTO memory_search(memory_search, rank) VALUES (?, ?)').run('secure-delete', 1n)
          this.ftsSecureDelete = true
        } catch {
          // Older FTS5 builds need a fresh index to erase obsolete term segments.
          this.rebuildSearch(opened)
        }
        opened.exec('PRAGMA user_version = 1')
      })
      this.database = database
    } catch (error) {
      try { database?.close() } catch { /* Do not expose native errors. */ }
      throw storageFailure(error)
    }
  }

  names(avatarId: string): string[] {
    validated(avatarId, 128)
    return this.useDatabase(database => database.prepare(`
      SELECT owner_name AS name FROM memory_entries WHERE avatar_id = ?
      GROUP BY owner_key, owner_name ORDER BY owner_name LIMIT ?
    `).all(avatarId, RECORD_LIMIT).map(row => row.name as string))
  }

  save(avatarId: string, name: string, topic: string, text: string): MemoryEntry {
    const scope = scopeFor(avatarId, name)
    const topicKey = normalized(topic, 120)
    validated(text, MEMORY_TEXT_MAX)
    return this.useDatabase(database => transaction(database, () => {
      const existing = database.prepare(`
        SELECT rowid, id FROM memory_entries WHERE avatar_id = ? AND owner_key = ? AND topic_key = ?
      `).get(scope.avatarId, scope.ownerKey, topicKey)
      if (!existing) {
        const count = database.prepare(`
          SELECT COUNT(*) AS count FROM memory_entries WHERE avatar_id = ? AND owner_key = ?
        `).get(scope.avatarId, scope.ownerKey)?.count as number
        if (count >= RECORD_LIMIT) throw new MemoryFailure('memory_limit_reached')
      }
      const entry: MemoryEntry = {
        id: existing ? existing.id as string : randomUUID(),
        topic: topic.trim(), text, updatedAt: new Date().toISOString()
      }
      if (existing) {
        this.deleteSearch(database, scope, topicKey)
        database.prepare(`
          UPDATE memory_entries SET topic = ?, text = ?, updated_at = ?
          WHERE avatar_id = ? AND owner_key = ? AND topic_key = ?
        `).run(entry.topic, entry.text, entry.updatedAt, scope.avatarId, scope.ownerKey, topicKey)
      } else {
        database.prepare(`
          INSERT INTO memory_entries (id, avatar_id, owner_key, owner_name, topic_key, topic, text, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(entry.id, scope.avatarId, scope.ownerKey, scope.name, topicKey, entry.topic, entry.text, entry.updatedAt)
      }
      database.prepare(`
        INSERT INTO memory_search (rowid, scope, terms)
        SELECT rowid, ?, ? FROM memory_entries WHERE avatar_id = ? AND owner_key = ? AND topic_key = ?
      `).run(scope.searchKey, searchTerms(`${entry.topic} ${entry.text}`).join(' '), scope.avatarId, scope.ownerKey, topicKey)
      if (existing && !this.ftsSecureDelete) this.rebuildSearch(database)
      return entry
    }))
  }

  list(avatarId: string, name: string, query?: string): MemoryEntry[] {
    const scope = scopeFor(avatarId, name)
    if (query !== undefined) validated(query, 200, true)
    return this.useDatabase(database => query?.trim()
      ? this.search(database, scope, query, LIST_LIMIT)
      : database.prepare(`
          SELECT id, topic, text, updated_at AS updatedAt FROM memory_entries
          WHERE avatar_id = ? AND owner_key = ? ORDER BY updated_at DESC, id LIMIT ?
        `).all(scope.avatarId, scope.ownerKey, LIST_LIMIT) as unknown as MemoryEntry[])
  }

  recall(avatarId: string, name: string, query: string): MemoryEntry[] {
    const scope = scopeFor(avatarId, name)
    validated(query, 200, true)
    return this.useDatabase(database => {
      const entries: MemoryEntry[] = []
      const candidates = query.trim() ? this.search(database, scope, query, RECALL_LIMIT)
        : database.prepare(`
            SELECT id, topic, text, updated_at AS updatedAt FROM memory_entries
            WHERE avatar_id = ? AND owner_key = ? ORDER BY updated_at DESC, id LIMIT ?
          `).all(scope.avatarId, scope.ownerKey, RECALL_LIMIT) as unknown as MemoryEntry[]
      for (const entry of candidates) {
        if (Buffer.byteLength(JSON.stringify([...entries, entry]), 'utf8') <= MEMORY_CONTEXT_BYTES) entries.push(entry)
      }
      return entries
    })
  }

  forget(avatarId: string, name: string, topic: string): boolean {
    const scope = scopeFor(avatarId, name)
    const topicKey = normalized(topic, 120)
    return this.useDatabase(database => transaction(database, () => {
      this.deleteSearch(database, scope, topicKey)
      const result = database.prepare(`
        DELETE FROM memory_entries WHERE avatar_id = ? AND owner_key = ? AND topic_key = ?
      `).run(scope.avatarId, scope.ownerKey, topicKey)
      if (result.changes && !this.ftsSecureDelete) this.rebuildSearch(database)
      return result.changes > 0
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

  private deleteSearch(database: DatabaseSync, scope: Scope, topicKey: string): void {
    database.prepare(`
      DELETE FROM memory_search WHERE scope = ? AND rowid IN (
        SELECT rowid FROM memory_entries WHERE avatar_id = ? AND owner_key = ? AND topic_key = ?
      )
    `).run(scope.searchKey, scope.avatarId, scope.ownerKey, topicKey)
  }

  private rebuildSearch(database: DatabaseSync): void {
    database.prepare('INSERT INTO memory_search(memory_search) VALUES (?)').run('rebuild')
  }

  private search(database: DatabaseSync, scope: Scope, query: string, limit: number): MemoryEntry[] {
    const terms = searchTerms(query)
    if (!terms.length) return []
    const quoted = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ')
    const match = `scope : "${scope.searchKey}" AND terms : (${quoted})`
    return database.prepare(`
      SELECT e.id, e.topic, e.text, e.updated_at AS updatedAt
      FROM memory_search JOIN memory_entries e ON e.rowid = memory_search.rowid
      WHERE e.avatar_id = ? AND e.owner_key = ? AND memory_search.scope = ? AND memory_search MATCH ?
      ORDER BY bm25(memory_search, 0.0, 1.0), e.updated_at DESC, e.id LIMIT ?
    `).all(scope.avatarId, scope.ownerKey, scope.searchKey, match, limit) as unknown as MemoryEntry[]
  }
}
