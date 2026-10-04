import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStore } from '../../src/main/memory/store'
import { MEMORY_CONTEXT_BYTES } from '../../src/shared/memory'

describe('private local memory store', () => {
  let directory: string
  let path: string
  let store: MemoryStore

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'magic-mirror-memory-test-'))
    path = join(directory, 'private', 'memory.sqlite')
    store = new MemoryStore(path)
  })

  afterEach(() => {
    store?.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('persists across restart in a private file with secure SQLite settings', () => {
    const saved = store.save('raven', 'Alice', 'Tea', 'Synthetic jasmine tea preference.')
    expect(saved).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      topic: 'Tea', text: 'Synthetic jasmine tea preference.', updatedAt: expect.any(String)
    })
    store.close()
    expect(statSync(join(directory, 'private')).mode & 0o777).toBe(0o700)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    const database = new DatabaseSync(path)
    try {
      expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
      expect(database.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' })
      // secure_delete is a connection setting; verify its effect on disk below.
      expect(database.prepare("SELECT v FROM memory_search_config WHERE k = 'secure-delete'").get())
        .toEqual({ v: 1 })
    } finally {
      database.close()
    }
    store = new MemoryStore(path)
    expect(store.list('raven', 'alice')).toEqual([saved])
    expect(store.recall('raven', 'ALICE', 'jasmine')).toEqual([saved])
  })

  it('normalizes owner names and topics while isolating each avatar and person', () => {
    const alice = store.save('raven', 'ＡＬＩＣＥ', 'Tea', 'Synthetic jasmine preference.')
    const bob = store.save('raven', 'Bob', 'Tea', 'Synthetic jasmine alternative.')
    const otherAvatar = store.save('owl', 'Alice', 'Tea', 'Synthetic jasmine third option.')
    expect(store.names('raven')).toEqual(['alice', 'bob'])
    expect(store.names('owl')).toEqual(['alice'])
    expect(store.names('unknown')).toEqual([])
    expect(store.list('raven', ' Alice ')).toEqual([alice])
    expect(store.recall('raven', 'alice', 'jasmine')).toEqual([alice])
    expect(store.recall('raven', 'bob', 'jasmine')).toEqual([bob])
    expect(store.recall('owl', 'alice', 'jasmine')).toEqual([otherAvatar])
    expect(store.recall('raven', 'missing', 'jasmine')).toEqual([])
    expect(store.forget('raven', 'alice', 'tea')).toBe(true)
    expect(store.list('raven', 'bob')).toEqual([bob])
    expect(store.list('owl', 'alice')).toEqual([otherAvatar])
    expect(store.names('raven')).toEqual(['bob'])
  })

  it('corrects one normalized topic without changing its entry ID or duplicating it', () => {
    const original = store.save('raven', 'Alice', 'ＴＥＡ', 'Synthetic obsolete mint preference.')
    const corrected = store.save('raven', 'alice', 'tea', 'Synthetic corrected jasmine preference.')
    expect(corrected.id).toBe(original.id)
    expect(corrected.text).toBe('Synthetic corrected jasmine preference.')
    expect(store.list('raven', 'alice')).toEqual([corrected])
    expect(store.recall('raven', 'alice', 'obsolete')).toEqual([])
    expect(store.recall('raven', 'alice', 'jasmine')).toEqual([corrected])
    const repeated = store.save('raven', 'ALICE', 'Tea', corrected.text)
    expect(repeated.id).toBe(original.id)
    expect(store.list('raven', 'alice')).toHaveLength(1)
  })

  it('recalls two-character Chinese terms and safely handles punctuation', () => {
    const saved = store.save('raven', '測試者', '飲料', '這是合成資料：喜歡茉莉奶茶。')
    expect(store.recall('raven', '測試者', '茉莉')).toEqual([saved])
    expect(store.recall('raven', '測試者', '莉奶')).toEqual([saved])
    expect(store.list('raven', '測試者', '（茉莉）！')).toEqual([saved])
    expect(store.recall('raven', '測試者', '"茉莉" OR * ( )')).toEqual([saved])
    expect(store.recall('raven', '測試者', "'); DROP TABLE memory_entries; --")).toEqual([])
    expect(store.recall('raven', '測試者', '"*()[]{}:!?')).toEqual([])
    expect(store.recall('raven', '測試者', '')).toEqual([saved])
    expect(store.list('raven', '測試者')).toEqual([saved])
  })

  it('deletes the row and indexed terms without restart resurrection or disk remnants', () => {
    const marker = 'syntheticdeletionmarkerzqv'
    store.save('raven', 'Alice', 'Disposable', `${marker} synthetic fixture.`)
    expect(readFileSync(path).includes(Buffer.from(marker))).toBe(true)
    expect(store.forget('raven', 'ALICE', 'disposable')).toBe(true)
    expect(store.forget('raven', 'alice', 'disposable')).toBe(false)
    expect(store.list('raven', 'alice')).toEqual([])
    expect(store.recall('raven', 'alice', marker)).toEqual([])
    expect(store.names('raven')).toEqual([])
    store.close()
    expect(readFileSync(path).includes(Buffer.from(marker))).toBe(false)
    const database = new DatabaseSync(path)
    try {
      expect(database.prepare('SELECT COUNT(*) AS count FROM memory_search').get()).toEqual({ count: 0 })
    } finally {
      database.close()
    }
    store = new MemoryStore(path)
    expect(store.recall('raven', 'alice', marker)).toEqual([])
    expect(store.list('raven', 'alice')).toEqual([])
  })

  it('rebuilds obsolete terms when the FTS secure-delete feature is unavailable', () => {
    store.close()
    const database = new DatabaseSync(path)
    database.prepare('INSERT INTO memory_search(memory_search, rank) VALUES (?, ?)').run('secure-delete', 0n)
    database.close()
    const prepare = DatabaseSync.prototype.prepare
    const unsupportedFeature = vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (this: DatabaseSync, sql) {
      if (sql === 'INSERT INTO memory_search(memory_search, rank) VALUES (?, ?)') {
        throw new Error('synthetic_unsupported_fts_feature')
      }
      return prepare.call(this, sql)
    })
    try {
      store = new MemoryStore(path)
    } finally {
      unsupportedFeature.mockRestore()
    }
    const obsolete = 'syntheticfallbackobsoleteqvz'
    const replacement = 'replacementfixturemarkerqvz'
    store.save('raven', 'Alice', 'Tea', obsolete)
    expect(store.recall('raven', 'alice', obsolete)).toHaveLength(1)
    store.save('raven', 'alice', 'Tea', replacement)
    expect(store.recall('raven', 'alice', obsolete)).toEqual([])
    expect(readFileSync(path).includes(Buffer.from(obsolete))).toBe(false)
    expect(store.forget('raven', 'alice', 'Tea')).toBe(true)
    expect(store.recall('raven', 'alice', replacement)).toEqual([])
    expect(readFileSync(path).includes(Buffer.from(replacement))).toBe(false)
    store.close()
    store = new MemoryStore(path)
    expect(store.list('raven', 'alice')).toEqual([])
  })

  it('rolls back both row and index when an upsert or deletion fails', () => {
    const original = store.save('raven', 'Alice', 'Tea', 'Synthetic original mint choice.')
    const database = new DatabaseSync(path)
    try {
      database.exec(`
        CREATE TRIGGER reject_entry_update BEFORE UPDATE ON memory_entries
        BEGIN SELECT RAISE(ABORT, 'synthetic_failure_detail'); END;
      `)
      expect(() => store.save('raven', 'alice', 'Tea', 'Synthetic corrected jasmine choice.'))
        .toThrow(/^memory_storage_failed$/)
      expect(store.list('raven', 'alice')).toEqual([original])
      expect(store.recall('raven', 'alice', 'mint')).toEqual([original])
      expect(store.recall('raven', 'alice', 'jasmine')).toEqual([])
      database.exec(`
        DROP TRIGGER reject_entry_update;
        CREATE TRIGGER reject_entry_delete BEFORE DELETE ON memory_entries
        BEGIN SELECT RAISE(ABORT, 'synthetic_failure_detail'); END;
      `)
      expect(() => store.forget('raven', 'alice', 'Tea')).toThrow(/^memory_storage_failed$/)
      expect(store.list('raven', 'alice')).toEqual([original])
      expect(store.recall('raven', 'alice', 'mint')).toEqual([original])
    } finally {
      database.close()
    }
  })

  it('bounds list results, recall count, and UTF-8 JSON recall bytes', () => {
    for (let index = 0; index < 105; index++) {
      store.save('raven', 'Alice', `Topic ${index}`, 'Synthetic bounded search fixture.')
    }
    expect(store.list('raven', 'alice')).toHaveLength(100)
    expect(store.list('raven', 'alice', 'bounded')).toHaveLength(100)
    expect(store.recall('raven', 'alice', 'bounded')).toHaveLength(8)
    for (let index = 0; index < 10; index++) {
      store.save('raven', 'Bob', `大型資料 ${index}`, `合成資料 ${'茶'.repeat(990)}`)
    }
    const recalled = store.recall('raven', 'bob', '資料')
    expect(recalled.length).toBeGreaterThan(0)
    expect(recalled.length).toBeLessThanOrEqual(8)
    expect(Buffer.byteLength(JSON.stringify(recalled), 'utf8')).toBeLessThanOrEqual(MEMORY_CONTEXT_BYTES)
  })

  it('rejects invalid values without writing or exposing the supplied content', () => {
    const invalidCalls = [
      () => store.save('', 'Alice', 'Tea', 'Synthetic text.'),
      () => store.names('a'.repeat(129)),
      () => store.save('raven', '', 'Tea', 'Synthetic text.'),
      () => store.save('raven', 'a'.repeat(81), 'Tea', 'Synthetic text.'),
      () => store.save('raven', 'Alice', '', 'Synthetic text.'),
      () => store.save('raven', 'Alice', 't'.repeat(121), 'Synthetic text.'),
      () => store.save('raven', 'Alice', 'Tea', ''),
      () => store.save('raven', 'Alice', 'Tea', 'x'.repeat(1001)),
      () => store.save('raven', 'Alice', 'Tea', 'synthetic\ninvalid'),
      () => store.save('raven', 'Alice\u0000', 'Tea', 'Synthetic text.'),
      () => store.list('raven', 'Alice', 'x'.repeat(201)),
      () => store.recall('raven', 'Alice', 'synthetic\u007finvalid'),
      () => store.forget('raven', 'Alice', ' '),
      () => store.names(null as unknown as string),
      () => store.list('raven', 'Alice', null as unknown as string),
      () => store.save('raven', 'Alice', 'Tea', 1 as unknown as string)
    ]
    for (const call of invalidCalls) expect(call).toThrow(/^memory_invalid_input$/)
    expect(store.names('raven')).toEqual([])
    expect(store.list('raven', 'alice')).toEqual([])
  })

  it('accepts values at the specified input limits', () => {
    const avatar = 'a'.repeat(128)
    const name = 'n'.repeat(80)
    const topic = 't'.repeat(120)
    const saved = store.save(avatar, name, topic, 'x'.repeat(1000))
    expect(store.list(avatar, name)).toEqual([saved])
    expect(() => store.recall(avatar, name, 'q'.repeat(200))).not.toThrow()
  })

  it('rejects a future schema version without overwriting it', () => {
    store.close()
    const database = new DatabaseSync(path)
    database.exec('PRAGMA user_version = 2')
    database.close()
    expect(() => new MemoryStore(path)).toThrow(/^memory_schema_unsupported$/)
    const unchanged = new DatabaseSync(path)
    try {
      expect(unchanged.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 })
    } finally {
      unchanged.close()
    }
  })

  it('sanitizes filesystem and closed-store failures', () => {
    expect(() => new MemoryStore(join(path, 'invalid.sqlite'))).toThrow(/^memory_storage_failed$/)
    expect(() => new MemoryStore(':memory:')).toThrow(/^memory_invalid_input$/)
    store.close()
    expect(() => store.list('raven', 'alice')).toThrow(/^memory_storage_failed$/)
    expect(() => store.save('raven', 'alice', 'Tea', 'Synthetic text.')).toThrow(/^memory_storage_failed$/)
    expect(() => store.close()).not.toThrow()
  })

  it('bounds a synthetic 2000-record scope and reads it promptly', () => {
    for (let index = 0; index < 2000; index++) {
      store.save('raven', 'Alice', `Topic ${index}`, `Synthetic performance fixture ${index}.`)
    }
    expect(() => store.save('raven', 'Alice', 'Overflow', 'Synthetic overflow fixture.'))
      .toThrow(/^memory_limit_reached$/)
    const correction = store.save('raven', 'ALICE', 'TOPIC 0', 'Synthetic corrected performance fixture.')
    const started = performance.now()
    expect(store.list('raven', 'alice')).toHaveLength(100)
    expect(store.recall('raven', 'alice', 'performance')).toHaveLength(8)
    const duration = performance.now() - started
    process.stdout.write(`memory_store_read_duration_ms=${duration.toFixed(2)}\n`)
    expect(duration).toBeLessThan(1000)
    expect(store.list('raven', 'alice', 'corrected')).toEqual([correction])
    expect(store.forget('raven', 'alice', 'Topic 1')).toBe(true)
    expect(() => store.save('raven', 'alice', 'Replacement', 'Synthetic replacement fixture.')).not.toThrow()
    expect(() => store.save('owl', 'alice', 'Independent', 'Synthetic independent avatar.')).not.toThrow()
    expect(() => store.save('raven', 'bob', 'Independent', 'Synthetic independent person.')).not.toThrow()
  }, 30_000)
})
