import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearningCommit, LearningRecord } from '../../src/main/memory/contracts'
import { MemoryStore } from '../../src/main/memory/store'
import { MEMORY_CONTEXT_BYTES } from '../../src/shared/memory'

const record = (topic: string, overrides: Partial<LearningRecord> = {}): LearningRecord => ({
  topic, text: `Synthetic ${topic} summary.`, kind: 'episode', state: 'active',
  eventAt: '2026-10-01T10:00:00.000Z', sources: [], expectedRevision: null, keepInMind: false, ...overrides
})

describe('relationship memory storage', () => {
  let directory: string
  let path: string
  let store: MemoryStore
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'memory-relationship-test-'))
    path = join(directory, 'private', 'memory.sqlite')
    store = new MemoryStore(path)
  })
  afterEach(() => { store?.close(); rmSync(directory, { recursive: true, force: true }) })
  const commit = (operationId: string, records: LearningRecord[], epoch = store.policy('raven', 'Alice').epoch) =>
    store.commitLearning('raven', 'Alice', { operationId, epoch, records })

  it('creates persistent random owner UUIDs per avatar and exposes only policy metadata', () => {
    expect(store.policy('raven', 'ＡＬＩＣＥ')).toEqual({ mode: 'automatic', epoch: 0, cleanupRequired: false })
    store.policy('owl', 'alice')
    store.policy('raven', 'alice (2)')
    const db = new DatabaseSync(path)
    const scopes = db.prepare('SELECT owner_id, avatar_id, owner_name FROM memory_scopes ORDER BY avatar_id, owner_name').all()
    db.close()
    expect(scopes).toHaveLength(3)
    expect(new Set(scopes.map(scope => scope.owner_id)).size).toBe(3)
    for (const scope of scopes) expect(scope.owner_id).toMatch(/^[0-9a-f-]{36}$/)
    store.close(); store = new MemoryStore(path)
    const restarted = new DatabaseSync(path)
    expect(restarted.prepare('SELECT owner_id, avatar_id, owner_name FROM memory_scopes ORDER BY avatar_id, owner_name').all()).toEqual(scopes)
    restarted.close()
  })

  it('migrates v1 labels, IDs, dates and records transactionally without cross-avatar merging', () => {
    store.close(); rmSync(path)
    const db = new DatabaseSync(path)
    db.exec(`CREATE TABLE memory_entries (
      rowid INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, avatar_id TEXT NOT NULL, owner_key TEXT NOT NULL,
      owner_name TEXT NOT NULL, topic_key TEXT NOT NULL, topic TEXT NOT NULL, text TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(avatar_id, owner_key, topic_key)); CREATE VIRTUAL TABLE memory_search USING fts5(scope, terms);
      PRAGMA user_version=1;`)
    const legacyKey = createHash('sha256').update('alice').digest('hex')
    const insert = db.prepare('INSERT INTO memory_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    insert.run(1, 'legacy-raven', 'raven', legacyKey, ' ＡＬＩＣＥ ', 'tea', 'Tea', 'Synthetic legacy jasmine.', '2026-09-01T00:00:00.000Z')
    insert.run(2, 'legacy-owl', 'owl', legacyKey, 'Alice', 'tea', 'Tea', 'Synthetic independent mint.', '2026-09-02T00:00:00.000Z')
    db.close(); store = new MemoryStore(path)
    expect(store.policy('raven', 'Alice')).toEqual({ mode: 'explicit', epoch: 0, cleanupRequired: false })
    expect(store.names('raven')).toEqual(['alice'])
    expect(store.recall('raven', 'alice', 'jasmine')[0]).toMatchObject({ id: 'legacy-raven', updatedAt: '2026-09-01T00:00:00.000Z', revision: 1 })
    expect(store.recall('owl', 'Alice', 'mint')[0]?.id).toBe('legacy-owl')
    const migrated = new DatabaseSync(path)
    const keys = migrated.prepare('SELECT owner_id FROM memory_scopes').all().map(row => row.owner_id)
    expect(new Set(keys).size).toBe(2); expect(keys).not.toContain(legacyKey)
    expect(migrated.prepare('PRAGMA user_version').get()?.user_version).toBe(2)
    migrated.close()
    expect(readdirSync(join(directory, 'private'))).toEqual(['memory.sqlite'])
  })

  it('rolls a failed migration back to v1 without a fallback copy or partial schema', () => {
    store.close(); rmSync(path)
    const legacy = new DatabaseSync(path)
    legacy.exec(`CREATE TABLE memory_entries (rowid INTEGER PRIMARY KEY, id TEXT, avatar_id TEXT, owner_key TEXT,
      owner_name TEXT, topic_key TEXT, topic TEXT, text TEXT, updated_at TEXT); PRAGMA user_version=1;`)
    legacy.prepare('INSERT INTO memory_entries VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('synthetic-legacy-id', 'raven', 'synthetic-legacy-owner', 'Alice', 'tea', 'Tea', 'Synthetic legacy fixture.', '2026-09-01T00:00:00.000Z')
    const before = legacy.prepare('SELECT * FROM memory_entries').all()
    legacy.close()
    const execute = DatabaseSync.prototype.exec
    const failMigration = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (this: DatabaseSync, sql: string) {
      if (sql === 'DROP TABLE memory_entries_v1') throw new Error('synthetic_private_migration_failure')
      return execute.call(this, sql)
    })
    try { expect(() => new MemoryStore(path)).toThrow(/^memory_storage_failed$/) } finally { failMigration.mockRestore() }
    const untouched = new DatabaseSync(path)
    expect(untouched.prepare('PRAGMA user_version').get()?.user_version).toBe(1)
    expect(untouched.prepare('SELECT * FROM memory_entries').all()).toEqual(before)
    expect(untouched.prepare("SELECT name FROM sqlite_master WHERE name IN ('memory_scopes','memory_entries_v1')").all()).toEqual([])
    untouched.close()
    expect(readdirSync(join(directory, 'private'))).toEqual(['memory.sqlite'])
    store = new MemoryStore(path)
    expect(store.list('raven', 'Alice')[0]?.id).toBe('synthetic-legacy-id')
  })

  it('rejects stale new inserts after explicit save, forget and policy changes', () => {
    let epoch = store.policy('raven', 'Alice').epoch
    store.save('raven', 'Alice', 'Explicit', 'Synthetic explicit memory.')
    expect(commit('before-save', [record('old automatic insert')], epoch)).toBe('stale')
    epoch = store.policy('raven', 'Alice').epoch
    expect(store.forget('raven', 'Alice', 'missing')).toBe(false)
    expect(commit('before-forget', [record('another old insert')], epoch)).toBe('stale')
    epoch = store.policy('raven', 'Alice').epoch
    expect(store.setPolicy('raven', 'Alice', 'automatic').epoch).toBe(epoch + 1)
    expect(commit('before-policy', [record('policy-old')], epoch)).toBe('stale')
    store.setPolicy('raven', 'Alice', 'explicit')
    expect(commit('explicit-block', [record('blocked')])).toBe('stale')
    store.setPolicy('raven', 'Alice', 'off')
    expect(store.recall('raven', 'Alice', 'explicit')).toEqual([])
    expect(store.brief('raven', 'Alice')).toEqual([])
    expect(store.hybridRecall('raven', 'Alice', 'explicit', { version: 'synthetic-v1', values: [1, 0] })).toEqual({ entries: [], incomplete: true })
    expect(store.list('raven', 'Alice')).toHaveLength(1)
  })

  it('checks every target and source revision and commits only once without a payload journal', () => {
    const source = record('Encounter')
    const fact = record('Preference', { kind: 'fact', sources: [' encounter '], keepInMind: true })
    expect(commit('operation-1', [source, fact])).toBe('committed')
    expect(commit('operation-1', [source, fact], 999)).toBe('duplicate')
    expect(store.list('raven', 'alice')).toHaveLength(2)
    expect(commit('target-conflict', [record('Preference', { expectedRevision: 7 })])).toBe('stale')
    expect(commit('unguarded-source', [record('Unguarded', { kind: 'fact', sources: ['Encounter'] })])).toBe('stale')
    expect(commit('source-conflict', [record('Encounter', { expectedRevision: 7 }), record('Another', { sources: ['Encounter'] })])).toBe('stale')
    const guarded = record('Encounter', { expectedRevision: 1 })
    expect(commit('guarded-source', [guarded, record('Another', { sources: ['Encounter'] })])).toBe('committed')
    expect(store.list('raven', 'alice').find(entry => entry.topic === 'Encounter')?.revision).toBe(1)
    const db = new DatabaseSync(path)
    expect(db.prepare('PRAGMA table_info(memory_operations)').all().map(row => row.name)).toEqual(['owner_id', 'operation_id'])
    db.close(); store.close(); store = new MemoryStore(path)
    expect(commit('operation-1', [source, fact])).toBe('duplicate')
  })

  it('rolls back records, dependencies and operation metadata together', () => {
    const db = new DatabaseSync(path)
    db.exec(`CREATE TRIGGER reject_learning BEFORE INSERT ON memory_entries
      WHEN NEW.topic_key='rejected' BEGIN SELECT RAISE(ABORT, 'synthetic_private_error'); END;`)
    const proposal = [record('Accepted'), record('Rejected', { sources: ['Accepted'] })]
    expect(() => commit('transaction-1', proposal)).toThrow(/^memory_storage_failed$/)
    expect(store.list('raven', 'Alice')).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_operations').get()?.count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_dependencies').get()?.count).toBe(0)
    db.exec('DROP TRIGGER reject_learning'); db.close()
    expect(commit('transaction-1', proposal)).toBe('committed')
  })

  it('deletes transitive derivations and vectors, prevents resurrection and persists cleanup', () => {
    const marker = 'syntheticderiveddeletionmarkerxyz'
    expect(commit('derived-1', [
      record('Source', { text: marker }),
      record('Fact', { kind: 'fact', text: `${marker} derived.`, sources: ['Source'] }),
      record('Commitment', { kind: 'commitment', text: `${marker} further derived.`, sources: ['Fact'] })
    ])).toBe('committed')
    for (const item of store.pendingIndex('synthetic-v1', 100)) {
      expect(store.setEmbedding(item.avatarId, item.name, item.entry.id, item.revision, { version: 'synthetic-v1', values: [1, 0] })).toBe(true)
    }
    const vectorReader = new DatabaseSync(path)
    const vectorBytes = Buffer.from(vectorReader.prepare('SELECT vector FROM memory_vectors LIMIT 1').get()?.vector as Uint8Array)
    vectorReader.close()
    expect(readFileSync(path).includes(vectorBytes)).toBe(true)
    const epoch = store.policy('raven', 'Alice').epoch
    expect(store.forget('raven', 'alice', 'source')).toBe(true)
    expect(store.policy('raven', 'Alice')).toEqual({ mode: 'automatic', epoch: epoch + 1, cleanupRequired: true })
    expect(store.list('raven', 'Alice')).toEqual([])
    expect(commit('late-insert', [record('Recreated', { text: marker })], epoch)).toBe('stale')
    store.close(); expect(readFileSync(path).includes(Buffer.from(marker))).toBe(false)
    expect(readFileSync(path).includes(vectorBytes)).toBe(false)
    expect(readdirSync(join(directory, 'private'))).toEqual(['memory.sqlite'])
    store = new MemoryStore(path)
    expect(store.policy('raven', 'Alice').cleanupRequired).toBe(true)
    expect(store.pendingIndex('synthetic-v1', 100)).toEqual([])
    const db = new DatabaseSync(path)
    for (const table of ['memory_entries', 'memory_dependencies', 'memory_vectors', 'memory_search']) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count).toBe(0)
    }
    db.close()
  })

  it('explicit correction removes stale derivations and blocks private reads until cleanup', () => {
    expect(commit('correction-source', [record('Source'), record('Derived', { kind: 'fact', sources: ['Source'] })])).toBe('committed')
    const before = store.list('raven', 'Alice').find(entry => entry.topic === 'Source')!
    const updated = store.save('raven', 'Alice', 'Source', 'Synthetic corrected source.')
    expect(updated).toMatchObject({ id: before.id, revision: 2 })
    expect(store.list('raven', 'Alice')).toEqual([updated])
    expect(store.policy('raven', 'Alice').cleanupRequired).toBe(true)
    expect(store.brief('raven', 'Alice')).toEqual([])
    expect(store.recall('raven', 'Alice', 'corrected')).toEqual([])
    store.setCleanupRequired('raven', 'Alice', false)
    expect(store.recall('raven', 'Alice', 'corrected')).toEqual([updated])
  })

  it('invalidates dependent revisions and embeddings when a guarded source changes in a batch', () => {
    const source = record('Source')
    const derived = record('Derived', { kind: 'fact', sources: ['Source'] })
    expect(commit('source-initial', [source, derived])).toBe('committed')
    const before = store.list('raven', 'Alice').find(entry => entry.topic === 'Derived')!
    expect(store.setEmbedding('raven', 'Alice', before.id, 1, { version: 'synthetic-v1', values: [1, 0] })).toBe(true)
    expect(commit('source-updated', [
      { ...source, expectedRevision: 1, text: 'Synthetic changed source.' },
      { ...derived, expectedRevision: 1 }
    ])).toBe('committed')
    const after = store.list('raven', 'Alice').find(entry => entry.topic === 'Derived')!
    expect(after.revision).toBe(2)
    store.setCleanupRequired('raven', 'Alice', false)
    expect(store.setEmbedding('raven', 'Alice', before.id, 1, { version: 'synthetic-v1', values: [1, 0] })).toBe(false)
    expect(store.pendingIndex('synthetic-v1', 10).map(item => item.entry.id)).toContain(before.id)
  })

  it('persists a cleanup barrier when durable explicit deletion fails', () => {
    store.save('raven', 'Alice', 'Tea', 'Synthetic retained fixture.')
    const epoch = store.policy('raven', 'Alice').epoch
    const db = new DatabaseSync(path)
    db.exec(`CREATE TRIGGER reject_forget BEFORE DELETE ON memory_entries
      BEGIN SELECT RAISE(ABORT, 'synthetic_private_failure'); END;`)
    expect(() => store.forget('raven', 'Alice', 'Tea')).toThrow(/^memory_storage_failed$/)
    expect(store.policy('raven', 'Alice')).toEqual({ mode: 'automatic', epoch: epoch + 1, cleanupRequired: true })
    expect(store.list('raven', 'Alice')).toHaveLength(1)
    expect(store.recall('raven', 'Alice', 'retained')).toEqual([])
    store.close(); store = new MemoryStore(path)
    expect(store.policy('raven', 'Alice').cleanupRequired).toBe(true)
    expect(commit('failed-forget-old-job', [record('Resurrected')], epoch)).toBe('stale')
    db.close()
  })

  it('never uses a stale vector or a record with an invalid source revision', () => {
    expect(commit('stale-index', [record('Source'), record('Derived', { kind: 'fact', sources: ['Source'] })])).toBe('committed')
    for (const item of store.pendingIndex('synthetic-v1', 100)) {
      store.setEmbedding(item.avatarId, item.name, item.entry.id, item.revision, { version: 'synthetic-v1', values: [1, 0] })
    }
    const db = new DatabaseSync(path)
    db.exec('UPDATE memory_vectors SET revision=0; UPDATE memory_dependencies SET source_revision=0')
    expect(store.hybridRecall('raven', 'Alice', 'absent phrase', { version: 'synthetic-v1', values: [1, 0] })).toEqual({ entries: [], incomplete: true })
    expect(store.recall('raven', 'Alice', 'Derived')).toEqual([])
    expect(store.brief('raven', 'Alice').map(entry => entry.topic)).not.toContain('Derived')
    expect(store.pendingIndex('synthetic-v1', 100).map(item => item.entry.topic)).toEqual(['Source'])
    db.close()
  })

  it('builds a bounded active brief from current facts, commitments, keep-in-mind and a recent episode', () => {
    expect(commit('brief-1', [
      record('Recent encounter', { eventAt: '2026-10-04T00:00:00.000Z' }),
      record('Old encounter'), record('Tea', { kind: 'fact' }),
      record('Open plan', { kind: 'commitment' }),
      record('Resolved plan', { kind: 'commitment', state: 'resolved' }),
      record('Superseded preference', { kind: 'fact', state: 'superseded' }),
      record('Important episode', { keepInMind: true })
    ])).toBe('committed')
    const brief = store.brief('raven', 'Alice')
    expect(brief.map(entry => entry.topic)).toEqual(expect.arrayContaining(['Tea', 'Open plan', 'Important episode', 'Recent encounter']))
    expect(brief.every(entry => entry.state === 'active')).toBe(true)
    expect(brief.map(entry => entry.topic)).not.toContain('Old encounter')
    expect(Buffer.byteLength(JSON.stringify(brief), 'utf8')).toBeLessThanOrEqual(2400)
    expect(commit('brief-large', Array.from({ length: 15 }, (_, i) => record(`Fact ${i}`, { kind: 'fact', text: '合成'.repeat(450), keepInMind: true })))).toBe('committed')
    const bounded = store.brief('raven', 'Alice')
    expect(Buffer.byteLength(JSON.stringify(bounded), 'utf8')).toBeLessThanOrEqual(2400)
    expect(bounded.some(entry => entry.topic === 'Recent encounter')).toBe(true)
  })

  it('finds semantic candidates without word overlap, merges lexical candidates and abstains', () => {
    const semantic = store.save('raven', 'Alice', '照明', '合成資料：展覽需要柔和暖色燈光。')
    const lexical = store.save('raven', 'Alice', 'Synthetic exact title', 'Synthetic lexical fixture.')
    store.save('owl', 'Alice', '照明', '合成資料：另一個角色的偏好。')
    expect(store.setEmbedding('raven', 'Alice', semantic.id, semantic.revision!, { version: 'synthetic-v1', values: [10, 0] })).toBe(true)
    expect(store.setEmbedding('raven', 'Alice', lexical.id, lexical.revision!, { version: 'synthetic-v1', values: [0, 1] })).toBe(true)
    expect(store.hybridRecall('raven', 'Alice', '場地如何營造舒服氛圍', { version: 'synthetic-v1', values: [1, 0] })).toEqual({ entries: [semantic], incomplete: false })
    const mixed = store.hybridRecall('raven', 'Alice', 'exact title', { version: 'synthetic-v1', values: [1, 0] })
    expect(mixed.entries).toEqual(expect.arrayContaining([semantic, lexical]))
    expect(mixed.entries).toHaveLength(2)
    expect(store.hybridRecall('raven', 'Alice', 'unknown', { version: 'synthetic-v1', values: [-1, -1] })).toEqual({ entries: [], incomplete: false })
    expect(store.hybridRecall('raven', 'Alice', 'unknown', { version: 'synthetic-v2', values: [1, 0] })).toEqual({ entries: [], incomplete: true })
    expect(store.hybridRecall('raven', 'Alice', 'exact title')).toEqual({ entries: [lexical], incomplete: true })
    expect(Buffer.byteLength(JSON.stringify(mixed.entries), 'utf8')).toBeLessThanOrEqual(MEMORY_CONTEXT_BYTES)
  })

  it('scans the whole scope in batches rather than limiting semantics to recent or lexical records', () => {
    let oldestId = ''
    for (let i = 0; i < 300; i++) {
      const item = store.save('raven', 'Alice', `Item ${i}`, `Synthetic unrelated ${i}.`)
      if (i === 0) oldestId = item.id
      store.setEmbedding('raven', 'Alice', item.id, item.revision!, { version: 'synthetic-v1', values: i === 0 ? [1, 0] : [0, 1] })
    }
    expect(store.hybridRecall('raven', 'Alice', 'absent phrase', { version: 'synthetic-v1', values: [1, 0] }).entries.map(item => item.id)).toEqual([oldestId])
  })

  it('bounds pending indexing and validates scope, finite nonzero vectors, version dimensions and revision', () => {
    const item = store.save('raven', 'Alice', 'Tea', 'Synthetic tea preference.')
    const embedding = { version: 'synthetic-v1', values: [2, 0] }
    expect(store.pendingIndex('synthetic-v1', 1)).toEqual([{ avatarId: 'raven', name: 'alice', entry: item, revision: 1 }])
    expect(store.setEmbedding('owl', 'Alice', item.id, 1, embedding)).toBe(false)
    expect(store.setEmbedding('raven', 'Bob', item.id, 1, embedding)).toBe(false)
    expect(store.setEmbedding('raven', 'Alice', item.id, 99, embedding)).toBe(false)
    for (const values of [[], [0, 0], [NaN, 1], [Infinity, 1]]) {
      expect(() => store.setEmbedding('raven', 'Alice', item.id, 1, { version: 'synthetic-v1', values })).toThrow(/^memory_invalid_input$/)
    }
    expect(store.setEmbedding('raven', 'Alice', item.id, 1, embedding)).toBe(true)
    expect(() => store.setEmbedding('raven', 'Alice', item.id, 1, { version: 'synthetic-v1', values: [1, 0, 0] })).toThrow(/^memory_invalid_input$/)
    expect(store.pendingIndex('synthetic-v1', 1)).toEqual([])
    expect(store.pendingIndex('synthetic-v2', 1)).toHaveLength(1)
    const updated = store.save('raven', 'Alice', 'Tea', 'Synthetic corrected preference.')
    store.setCleanupRequired('raven', 'Alice', false)
    expect(store.setEmbedding('raven', 'Alice', item.id, 1, embedding)).toBe(false)
    expect(store.pendingIndex('synthetic-v1', 1)[0]).toMatchObject({ entry: updated, revision: 2 })
    for (let i = 0; i < 110; i++) store.save('raven', 'Alice', `Pending ${i}`, 'Synthetic pending fixture.')
    expect(store.pendingIndex('synthetic-v1', 10000)).toHaveLength(100)
  })

  it('rejects malformed proposals and cyclic dependencies with sanitized errors', () => {
    const invalid = [
      { operationId: 'invalid id', epoch: 0, records: [record('X')] },
      { operationId: 'invalid-epoch', epoch: -1, records: [record('X')] },
      { operationId: 'invalid-date', epoch: 0, records: [record('X', { eventAt: 'invalid' })] },
      { operationId: 'invalid-revision', epoch: 0, records: [record('X', { expectedRevision: 0 })] },
      { operationId: 'duplicate-topics', epoch: 0, records: [record('X'), record(' x ')] },
      { operationId: 'cycle', epoch: 0, records: [record('X', { sources: ['Y'] }), record('Y', { sources: ['X'] })] }
    ] as LearningCommit[]
    for (const value of invalid) expect(() => store.commitLearning('raven', 'Alice', value)).toThrow(/^memory_invalid_input$/)
    expect(store.list('raven', 'Alice')).toEqual([])
  })
})
