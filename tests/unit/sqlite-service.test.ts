import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { relative, resolve, sep, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { Telemetry } from '../../src/main/telemetry'
import {
  SQLITE_SCHEMA_VERSION,
  openSqlite,
  type SqliteDatabaseDriver,
  type SqliteDatabaseDriverFactory,
  type SqliteDatabaseRow,
  type SqliteFailure,
  type SqliteFailureCode,
  type SqliteFailureReason,
  type SqliteHealth,
  type SqlitePhaseTestService,
  type SqliteServiceOptions,
} from '../../src/main/sqlite-service'
import type { Result } from '../../src/shared/types'

const BASELINE_DDL =
  'CREATE TABLE app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)'
const BASELINE_DDL_WITH_IF_NOT_EXISTS =
  'CREATE TABLE IF NOT EXISTS app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)'
const BASELINE_ROW = { version: 1, name: 'foundation_baseline' } as const
const PHASE_TEST_V2_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase = '0'), demo_id TEXT NOT NULL CHECK (demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'mock_passed')), note TEXT NOT NULL)"
const PHASE_TEST_V2_DDL_WITH_IF_NOT_EXISTS =
  "CREATE TABLE IF NOT EXISTS phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase = '0'), demo_id TEXT NOT NULL CHECK (demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'mock_passed')), note TEXT NOT NULL)"
const PHASE_TEST_V3_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase = '1' AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const PHASE_TEST_V4_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const PHASE_TEST_V5_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2', '3')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5')) OR (phase = '3' AND demo_id IN ('P3-D1', 'P3-D2', 'P3-D3', 'P3-D4'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2', '3') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const PHASE_TEST_V6_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2', '3', '4')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5')) OR (phase = '3' AND demo_id IN ('P3-D1', 'P3-D2', 'P3-D3', 'P3-D4')) OR (phase = '4' AND demo_id IN ('P4-D1', 'P4-D2', 'P4-D3', 'P4-D4', 'P4-D5', 'P4-D6', 'P4-D7', 'P4-D8'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2', '3', '4') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const PHASE_TEST_V2_MIGRATION_ROW = { version: 2, name: 'phase_test_records' } as const
const PHASE_TEST_V3_MIGRATION_ROW = { version: 3, name: 'phase_test_records_v3' } as const
const PHASE_TEST_V4_MIGRATION_ROW = { version: 4, name: 'phase_test_records_v4' } as const
const PHASE_TEST_V5_MIGRATION_ROW = { version: 5, name: 'phase_test_records_v5' } as const
const PHASE_TEST_V6_MIGRATION_ROW = { version: 6, name: 'phase_test_records_v6' } as const
const PHASE_TEST_COLUMNS = [
  { cid: 0, name: 'sequence', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'phase', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 2, name: 'demo_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 3, name: 'build', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 4, name: 'time', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 5, name: 'result', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 6, name: 'note', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
] as const

const RAW_EXCEPTION_MARKER = 'synthetic-raw-exception-v1'
const SYNTHETIC_TRANSCRIPT_MARKER = 'synthetic-transcript-marker-v1'
const SYNTHETIC_AUDIO_MARKER = 'synthetic-audio-marker-v1'
const SYNTHETIC_PRIVATE_MEMORY_MARKER = 'synthetic-private-memory-marker-v1'
const SYNTHETIC_SECRET_MARKER = 'synthetic-secret-marker-v1'
const SYNTHETIC_CREDENTIAL_MARKER = 'synthetic-credential-marker-v1'
const SYNTHETIC_DRIVER_RESULT_MARKER = 'synthetic-integrity-result'

const SQL_MARKERS = [
  'PRAGMA',
  'CREATE TABLE',
  'INSERT INTO',
  'BEGIN IMMEDIATE',
  'COMMIT',
  'ROLLBACK',
  'SELECT ',
] as const

const CONTENT_MARKERS = [
  RAW_EXCEPTION_MARKER,
  SYNTHETIC_TRANSCRIPT_MARKER,
  SYNTHETIC_AUDIO_MARKER,
  SYNTHETIC_PRIVATE_MEMORY_MARKER,
  SYNTHETIC_SECRET_MARKER,
  SYNTHETIC_CREDENTIAL_MARKER,
  SYNTHETIC_DRIVER_RESULT_MARKER,
] as const

type TelemetryEventInput = Parameters<Telemetry['emit']>[0]
type ExpectedFailure = {
  code: SqliteFailureCode
  reason: SqliteFailureReason
}

type SeedKind = 'empty' | 'exact' | 'malformed' | 'gap' | 'unknown' | 'future'

type FakeFailureOptions = {
  foreignKeys: 'ok' | 'throw' | 'disabled'
  journalMode: 'ok' | 'throw' | 'not_wal'
  migration: 'ok' | 'begin' | 'ddl' | 'insert' | 'commit'
  rollback: 'ok' | 'throw'
  integrity: 'ok' | 'throw' | 'malformed' | 'not_ok'
  close: 'ok' | 'throw'
}

type DriverOperation =
  | 'foreign_keys_on'
  | 'journal_mode_wal'
  | 'begin_immediate'
  | 'create_baseline'
  | 'create_phase_records'
  | 'insert_baseline'
  | 'insert_phase_migration'
  | 'copy_phase_records'
  | 'commit'
  | 'rollback'
  | 'integrity_check'
  | 'drop'
  | 'alter'
  | 'delete'
  | 'close'
  | 'other_exec'
  | 'other_run'

interface FakeDriverHarness {
  driver: SqliteDatabaseDriver
  factory: SqliteDatabaseDriverFactory
  operations: DriverOperation[]
  factoryCalls: number
  closeCalls: number
}

interface TelemetryHarness {
  events: TelemetryEventInput[]
  telemetry: Pick<Telemetry, 'emit'>
  control: { throwOnEmit: boolean }
}

interface PersistentSnapshot {
  objects: Array<Record<string, unknown>>
  columns: Array<Record<string, unknown>>
  indexes: Array<Record<string, unknown>>
  foreignKeys: Array<Record<string, unknown>>
  phaseColumns: Array<Record<string, unknown>>
  phaseIndexes: Array<Record<string, unknown>>
  phaseForeignKeys: Array<Record<string, unknown>>
  migrations: Array<Record<string, unknown>>
  journalMode: Array<Record<string, unknown>>
  integrity: Array<Record<string, unknown>>
}

const activeServices: SqlitePhaseTestService[] = []
const temporaryDirectories: string[] = []

function normalizeSql(sql: string | null): string {
  return (sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function makeTelemetryHarness(throwOnEmit = false): TelemetryHarness {
  const events: TelemetryEventInput[] = []
  const control = { throwOnEmit }
  const telemetry: Pick<Telemetry, 'emit'> = {
    emit(event) {
      if (control.throwOnEmit) {
        throw new Error(RAW_EXCEPTION_MARKER)
      }
      events.push({ ...event })
    },
  }

  return { events, telemetry, control }
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-task5-'))
  temporaryDirectories.push(directory)
  return directory
}

async function makeTemporaryDatabasePath(): Promise<{ directory: string; dbPath: string }> {
  const directory = await makeTemporaryDirectory()
  return { directory, dbPath: join(directory, 'mirror.sqlite') }
}

function openTracked(options: SqliteServiceOptions): Result<SqlitePhaseTestService, SqliteFailure> {
  const result: Result<SqlitePhaseTestService, SqliteFailure> = openSqlite(options)
  if (result.ok) {
    activeServices.push(result.value)
  }
  return result
}

function expectFailure(
  result: Result<SqlitePhaseTestService, SqliteFailure>,
  expected: ExpectedFailure,
): SqliteFailure {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('expected sqlite failure')
  }
  expect(result.error).toEqual(expected)
  return result.error
}

function runtimeMethodNames(service: SqlitePhaseTestService): string[] {
  const names = new Set<string>()
  let current: object | null = service
  while (current !== null && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name !== 'constructor') {
        names.add(name)
      }
    }
    current = Object.getPrototypeOf(current)
  }
  return [...names].sort()
}

function assertHealthPrivacy(health: SqliteHealth, dbPath?: string): void {
  const serialized = JSON.stringify(health)
  for (const marker of CONTENT_MARKERS) {
    expect(serialized).not.toContain(marker)
  }
  if (dbPath !== undefined) {
    expect(serialized).not.toContain(dbPath)
  }
  expect(Object.keys(health).sort()).toEqual([
    'failure',
    'foreignKeys',
    'integrity',
    'journalMode',
    'schemaVersion',
    'status',
  ])
}

function expectReadyHealth(service: SqlitePhaseTestService, dbPath?: string): SqliteHealth {
  const health = service.health()
  expect(health).toEqual({
    status: 'ready',
    schemaVersion: SQLITE_SCHEMA_VERSION,
    journalMode: 'wal',
    foreignKeys: true,
    integrity: 'ok',
    failure: null,
  })
  assertHealthPrivacy(health, dbPath)
  return health
}

const SQLITE_EVENT_NAMES = new Set([
  'sqlite_open',
  'sqlite_migration',
  'sqlite_integrity_check',
  'sqlite_close',
  'sqlite_phase_record_append',
  'sqlite_phase_record_read',
])

const OPEN_FAILURE_CAUSES: Record<string, readonly string[]> = {
  sqlite_path_invalid: ['empty_path', 'nul_byte', 'memory_path', 'not_absolute'],
  sqlite_open_failed: ['driver_open_failed'],
  sqlite_foreign_keys_failed: ['foreign_keys_not_enabled'],
  sqlite_journal_mode_failed: ['journal_mode_not_wal'],
  sqlite_schema_invalid: [
    'schema_object_invalid',
    'schema_ddl_invalid',
    'schema_columns_invalid',
    'schema_rows_invalid',
    'schema_gap',
    'schema_name_unknown',
  ],
  sqlite_schema_too_new: ['schema_future_version'],
  sqlite_migration_failed: ['migration_transaction_failed'],
  sqlite_integrity_failed: ['integrity_check_not_ok'],
}

function assertTelemetryPrivacy(events: readonly TelemetryEventInput[], dbPath?: string): void {
  for (const event of events) {
    expect(event.module).toBe('sqlite')
    expect(event.source).toBe('runtime')
    expect(SQLITE_EVENT_NAMES.has(event.event)).toBe(true)
    expect(typeof event.reason).toBe('string')
    expect(event.reason).toMatch(/^[a-z0-9_=;.-]+$/)

    const expectedKeys = ['event', 'module', 'reason', 'source', 'status']
    if (event.error_code !== undefined) {
      expectedKeys.push('error_code')
      expect(event.status).toBe('failed')
    } else {
      expect(event.status).toBe('success')
    }
    expect(Object.keys(event).sort()).toEqual(expectedKeys.sort())

    if (event.event === 'sqlite_open') {
      if (event.status === 'success') {
        expect(event.error_code).toBeUndefined()
        expect(event.reason).toBe(
          'schema_version=6;foreign_keys=on;journal_mode=wal;integrity=ok',
        )
      } else {
        const causes = OPEN_FAILURE_CAUSES[event.error_code ?? '']
        expect(causes).toBeDefined()
        if (causes === undefined || typeof event.reason !== 'string') {
          throw new Error('expected stable sqlite_open failure metadata')
        }
        expect(causes).toContain(event.reason.slice('cause='.length))
      }
    } else if (event.event === 'sqlite_migration') {
      if (event.status === 'success') {
        expect(event.error_code).toBeUndefined()
        expect(event.reason).toBe('version=6;name=phase_test_records_v6')
      } else {
        expect(event.error_code).toBe('sqlite_migration_failed')
        expect(event.reason).toBe('cause=migration_transaction_failed')
      }
    } else if (event.event === 'sqlite_integrity_check') {
      if (event.status === 'success') {
        expect(event.error_code).toBeUndefined()
        expect(event.reason).toBe('result=ok')
      } else {
        expect(event.error_code).toBe('sqlite_integrity_failed')
        expect(event.reason).toBe('cause=integrity_check_not_ok')
      }
    } else if (event.event === 'sqlite_close') {
      if (event.status === 'success') {
        expect(event.error_code).toBeUndefined()
        expect(event.reason).toBe('status=closed')
      } else {
        expect(event.error_code).toBe('sqlite_close_failed')
        expect(['cause=driver_close_failed', 'cause=cleanup_close_failed']).toContain(event.reason)
      }
    }

    const serialized = JSON.stringify(event)
    for (const marker of CONTENT_MARKERS) {
      expect(serialized).not.toContain(marker)
    }
    for (const marker of SQL_MARKERS) {
      expect(serialized.toUpperCase()).not.toContain(marker)
    }
    if (dbPath !== undefined) {
      expect(serialized).not.toContain(dbPath)
    }
  }
}

function expectEvent(
  events: readonly TelemetryEventInput[],
  eventName: string,
  expected: Partial<TelemetryEventInput>,
): TelemetryEventInput {
  const matches = events.filter((event) => event.event === eventName)
  expect(matches).toHaveLength(1)
  const event = matches[0]
  expect(event).toBeDefined()
  expect(event).toMatchObject(expected)
  return event as TelemetryEventInput
}

function expectPrimaryOpenFailure(
  events: readonly TelemetryEventInput[],
  expected: ExpectedFailure,
  dbPath?: string,
): void {
  expectEvent(events, 'sqlite_open', {
    module: 'sqlite',
    source: 'runtime',
    status: 'failed',
    error_code: expected.code,
    reason: `cause=${expected.reason}`,
  })
  assertTelemetryPrivacy(events, dbPath)
}

function expectSuccessfulOpen(
  events: readonly TelemetryEventInput[],
  dbPath?: string,
): void {
  expectEvent(events, 'sqlite_open', {
    module: 'sqlite',
    source: 'runtime',
    status: 'success',
    reason: 'schema_version=6;foreign_keys=on;journal_mode=wal;integrity=ok',
  })
  assertTelemetryPrivacy(events, dbPath)
}

function queryAll(database: DatabaseSync, sql: string): Array<Record<string, unknown>> {
  return database.prepare(sql).all() as Array<Record<string, unknown>>
}

async function inspectPersistentDatabase(dbPath: string): Promise<PersistentSnapshot> {
  expect(dbPath).not.toBe(':memory:')
  const database = new DatabaseSync(dbPath)
  try {
    database.exec('PRAGMA foreign_keys = ON')
    return {
      objects: queryAll(
        database,
        `SELECT type, name, tbl_name, sql
           FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY type ASC, name ASC`,
      ),
      columns: queryAll(database, "PRAGMA table_info('app_migrations')"),
      indexes: queryAll(database, "PRAGMA index_list('app_migrations')"),
      foreignKeys: queryAll(database, "PRAGMA foreign_key_list('app_migrations')"),
      phaseColumns: queryAll(database, "PRAGMA table_info('phase_test_records')"),
      phaseIndexes: queryAll(database, "PRAGMA index_list('phase_test_records')"),
      phaseForeignKeys: queryAll(database, "PRAGMA foreign_key_list('phase_test_records')"),
      migrations: queryAll(
        database,
        'SELECT version, name FROM app_migrations ORDER BY version ASC',
      ),
      journalMode: queryAll(database, 'PRAGMA journal_mode'),
      integrity: queryAll(database, 'PRAGMA integrity_check'),
    }
  } finally {
    database.close()
  }
}

async function seedPersistentDatabase(dbPath: string, kind: SeedKind): Promise<void> {
  expect(dbPath).not.toBe(':memory:')
  const database = new DatabaseSync(dbPath)
  try {
    if (kind === 'malformed') {
      database.exec(
        'CREATE TABLE app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL, extra TEXT NOT NULL)',
      )
      return
    }

    database.exec(BASELINE_DDL)
    if (kind === 'empty') {
      return
    }

    const insert = database.prepare('INSERT INTO app_migrations (version, name) VALUES (?, ?)')
    if (kind === 'exact') {
      insert.run(BASELINE_ROW.version, BASELINE_ROW.name)
      database.exec(PHASE_TEST_V3_DDL)
      insert.run(PHASE_TEST_V2_MIGRATION_ROW.version, PHASE_TEST_V2_MIGRATION_ROW.name)
      insert.run(PHASE_TEST_V3_MIGRATION_ROW.version, PHASE_TEST_V3_MIGRATION_ROW.name)
      database.exec('ALTER TABLE phase_test_records RENAME TO phase_test_records_v3')
      database.exec(PHASE_TEST_V4_DDL)
      database.exec('INSERT INTO phase_test_records SELECT * FROM phase_test_records_v3')
      database.exec('DROP TABLE phase_test_records_v3')
      insert.run(PHASE_TEST_V4_MIGRATION_ROW.version, PHASE_TEST_V4_MIGRATION_ROW.name)
      database.exec('ALTER TABLE phase_test_records RENAME TO phase_test_records_v4')
      database.exec(PHASE_TEST_V5_DDL)
      database.exec('INSERT INTO phase_test_records SELECT * FROM phase_test_records_v4')
      database.exec('DROP TABLE phase_test_records_v4')
      insert.run(PHASE_TEST_V5_MIGRATION_ROW.version, PHASE_TEST_V5_MIGRATION_ROW.name)
      database.exec('ALTER TABLE phase_test_records RENAME TO phase_test_records_v5')
      database.exec(PHASE_TEST_V6_DDL)
      database.exec('INSERT INTO phase_test_records SELECT * FROM phase_test_records_v5')
      database.exec('DROP TABLE phase_test_records_v5')
      insert.run(PHASE_TEST_V6_MIGRATION_ROW.version, PHASE_TEST_V6_MIGRATION_ROW.name)
    } else if (kind === 'gap') {
      insert.run(1, BASELINE_ROW.name)
      insert.run(3, 'gap_marker')
    } else if (kind === 'unknown') {
      insert.run(1, 'unknown_migration')
    } else if (kind === 'future') {
      insert.run(7, 'future_migration')
    }
  } finally {
    database.close()
  }
}

function makePathProbe(): { factory: SqliteDatabaseDriverFactory; calls: () => number } {
  let calls = 0
  const driver: SqliteDatabaseDriver = {
    exec() {
      throw new Error(RAW_EXCEPTION_MARKER)
    },
    get() {
      return undefined
    },
    all() {
      return []
    },
    run() {
      throw new Error(RAW_EXCEPTION_MARKER)
    },
    close() {},
  }
  const factory: SqliteDatabaseDriverFactory = (dbPath) => {
    void dbPath
    calls += 1
    return driver
  }
  return { factory, calls: () => calls }
}

function makeFakeDriverHarness(
  overrides: Partial<FakeFailureOptions> = {},
): FakeDriverHarness {
  const options: FakeFailureOptions = {
    foreignKeys: 'ok',
    journalMode: 'ok',
    migration: 'ok',
    rollback: 'ok',
    integrity: 'ok',
    close: 'ok',
    ...overrides,
  }
  const operations: DriverOperation[] = []
  let factoryCalls = 0
  let closeCalls = 0
  let tableExists = false
  let phaseTableVersion: 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | null = null
  let migrationRows: SqliteDatabaseRow[] = []
  let transactionSnapshot: {
    tableExists: boolean
    phaseTableVersion: 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | null
    migrationRows: SqliteDatabaseRow[]
  } | null = null

  const masterRow: SqliteDatabaseRow = {
    type: 'table',
    name: 'app_migrations',
    tbl_name: 'app_migrations',
    sql: BASELINE_DDL,
  }
  const makePhaseMasterRow = (): SqliteDatabaseRow => ({
    type: 'table',
    name: 'phase_test_records',
    tbl_name: 'phase_test_records',
    sql: phaseTableVersion === 'v2'
      ? PHASE_TEST_V2_DDL
      : phaseTableVersion === 'v3'
        ? PHASE_TEST_V3_DDL
        : phaseTableVersion === 'v4'
          ? PHASE_TEST_V4_DDL
          : phaseTableVersion === 'v5'
            ? PHASE_TEST_V5_DDL
            : PHASE_TEST_V6_DDL,
  })
  const columnRows: readonly SqliteDatabaseRow[] = [
    { cid: 0, name: 'version', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
    { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  ]
  const phaseColumnRows: readonly SqliteDatabaseRow[] = [...PHASE_TEST_COLUMNS]

  const normalized = (sql: string): string => normalizeSql(sql)
  const fail = (): never => {
    throw new Error(RAW_EXCEPTION_MARKER)
  }
  const recordForbiddenOperation = (sql: string): boolean => {
    const statement = normalized(sql)
    if (statement.includes('delete ')) {
      operations.push('delete')
      return true
    }
    return false
  }
  const applyMigrationInsert = (params: readonly unknown[] | undefined): void => {
    const version = params?.[0]
    const name = params?.[1]
    let migration: SqliteDatabaseRow
    if (version === BASELINE_ROW.version && name === BASELINE_ROW.name) {
      operations.push('insert_baseline')
      migration = { ...BASELINE_ROW }
    } else if (
      version === PHASE_TEST_V2_MIGRATION_ROW.version
      && name === PHASE_TEST_V2_MIGRATION_ROW.name
    ) {
      operations.push('insert_phase_migration')
      migration = { ...PHASE_TEST_V2_MIGRATION_ROW }
    } else if (
      version === PHASE_TEST_V3_MIGRATION_ROW.version
      && name === PHASE_TEST_V3_MIGRATION_ROW.name
    ) {
      operations.push('insert_phase_migration')
      migration = { ...PHASE_TEST_V3_MIGRATION_ROW }
    } else if (
      version === PHASE_TEST_V4_MIGRATION_ROW.version
      && name === PHASE_TEST_V4_MIGRATION_ROW.name
    ) {
      operations.push('insert_phase_migration')
      migration = { ...PHASE_TEST_V4_MIGRATION_ROW }
    } else if (
      version === PHASE_TEST_V5_MIGRATION_ROW.version
      && name === PHASE_TEST_V5_MIGRATION_ROW.name
    ) {
      operations.push('insert_phase_migration')
      migration = { ...PHASE_TEST_V5_MIGRATION_ROW }
    } else if (
      version === PHASE_TEST_V6_MIGRATION_ROW.version
      && name === PHASE_TEST_V6_MIGRATION_ROW.name
    ) {
      operations.push('insert_phase_migration')
      migration = { ...PHASE_TEST_V6_MIGRATION_ROW }
    } else {
      operations.push('other_run')
      return
    }
    if (options.migration === 'insert') {
      fail()
    }
    migrationRows.push(migration)
  }

  const driver: SqliteDatabaseDriver = {
    exec(sql) {
      const statement = normalized(sql)
      if (recordForbiddenOperation(sql)) {
        return
      }
      if (statement.includes('pragma foreign_keys = on')) {
        operations.push('foreign_keys_on')
        if (options.foreignKeys === 'throw') {
          fail()
        }
        return
      }
      if (statement.includes('pragma journal_mode = wal')) {
        operations.push('journal_mode_wal')
        if (options.journalMode === 'throw') {
          fail()
        }
        return
      }
      if (statement.startsWith('begin immediate')) {
        operations.push('begin_immediate')
        if (options.migration === 'begin') {
          fail()
        }
        transactionSnapshot = {
          tableExists,
          phaseTableVersion,
          migrationRows: migrationRows.map((row) => ({ ...row })),
        }
        return
      }
      if (statement.includes(normalizeSql(BASELINE_DDL_WITH_IF_NOT_EXISTS))) {
        operations.push('create_baseline')
        if (options.migration === 'ddl') {
          fail()
        }
        tableExists = true
        return
      }
      if (
        statement.includes(normalizeSql(PHASE_TEST_V2_DDL))
        || statement.includes(normalizeSql(PHASE_TEST_V2_DDL_WITH_IF_NOT_EXISTS))
      ) {
        operations.push('create_phase_records')
        if (options.migration === 'ddl') {
          fail()
        }
        phaseTableVersion = 'v2'
        return
      }
      if (statement.includes(normalizeSql(PHASE_TEST_V3_DDL))) {
        operations.push('create_phase_records')
        if (options.migration === 'ddl') {
          fail()
        }
        phaseTableVersion = 'v3'
        return
      }
      if (statement.includes(normalizeSql(PHASE_TEST_V4_DDL))) {
        operations.push('create_phase_records')
        if (options.migration === 'ddl') fail()
        phaseTableVersion = 'v4'
        return
      }
      if (statement.includes(normalizeSql(PHASE_TEST_V5_DDL))) {
        operations.push('create_phase_records')
        if (options.migration === 'ddl') fail()
        phaseTableVersion = 'v5'
        return
      }
      if (statement.includes(normalizeSql(PHASE_TEST_V6_DDL))) {
        operations.push('create_phase_records')
        if (options.migration === 'ddl') fail()
        phaseTableVersion = 'v6'
        return
      }
      if (statement.startsWith('alter table phase_test_records rename to phase_test_records_v2')) {
        operations.push('alter')
        return
      }
      if (statement.startsWith('alter table phase_test_records rename to phase_test_records_v3')) {
        operations.push('alter')
        return
      }
      if (statement.startsWith('alter table phase_test_records rename to phase_test_records_v4')) {
        operations.push('alter')
        return
      }
      if (statement.startsWith('alter table phase_test_records rename to phase_test_records_v5')) {
        operations.push('alter')
        return
      }
      if (statement.includes('insert into phase_test_records') && statement.includes(' select ')) {
        operations.push('copy_phase_records')
        return
      }
      if (statement.startsWith('drop table phase_test_records_v2')) {
        operations.push('drop')
        return
      }
      if (statement.startsWith('drop table phase_test_records_v3')) {
        operations.push('drop')
        return
      }
      if (statement.startsWith('drop table phase_test_records_v4')) {
        operations.push('drop')
        return
      }
      if (statement.startsWith('drop table phase_test_records_v5')) {
        operations.push('drop')
        return
      }
      if (statement.includes('insert into app_migrations')) {
        return
      }
      if (statement.startsWith('commit')) {
        operations.push('commit')
        if (options.migration === 'commit') {
          fail()
        }
        transactionSnapshot = null
        return
      }
      if (statement.startsWith('rollback')) {
        operations.push('rollback')
        if (options.rollback === 'throw') {
          fail()
        }
        if (transactionSnapshot !== null) {
          tableExists = transactionSnapshot.tableExists
          phaseTableVersion = transactionSnapshot.phaseTableVersion
          migrationRows = transactionSnapshot.migrationRows.map((row) => ({ ...row }))
        }
        transactionSnapshot = null
        return
      }
      operations.push('other_exec')
    },
    get(sql, params) {
      void params
      const statement = normalized(sql)
      if (statement.includes('pragma foreign_keys')) {
        return { foreign_keys: options.foreignKeys === 'disabled' ? 0 : 1 }
      }
      if (statement.includes('pragma journal_mode')) {
        return { journal_mode: options.journalMode === 'not_wal' ? 'delete' : 'wal' }
      }
      if (statement.includes('pragma integrity_check')) {
        operations.push('integrity_check')
        if (options.integrity === 'throw') {
          return fail()
        }
        if (options.integrity === 'malformed') {
          return { integrity_result: 'synthetic-integrity-result' }
        }
        return { integrity_check: options.integrity === 'not_ok' ? 'not_ok' : 'ok' }
      }
      if (statement.includes('from sqlite_master')) {
        if (statement.includes("where name = 'phase_test_records'")) {
          return phaseTableVersion === null ? undefined : makePhaseMasterRow()
        }
        return tableExists ? masterRow : undefined
      }
      if (statement.includes('pragma table_info')) {
        if (statement.includes("'phase_test_records'")) {
          return phaseTableVersion === null ? undefined : phaseColumnRows[0]
        }
        return tableExists ? columnRows[0] : undefined
      }
      if (statement.includes('pragma index_list') || statement.includes('pragma foreign_key_list')) {
        return undefined
      }
      if (statement.includes('from app_migrations')) {
        return tableExists && migrationRows.length > 0 ? migrationRows[0] : undefined
      }
      return undefined
    },
    all(sql, params) {
      void params
      const statement = normalized(sql)
      if (statement.includes('pragma foreign_keys')) {
        return [{ foreign_keys: options.foreignKeys === 'disabled' ? 0 : 1 }]
      }
      if (statement.includes('pragma journal_mode')) {
        return [{ journal_mode: options.journalMode === 'not_wal' ? 'delete' : 'wal' }]
      }
      if (statement.includes('pragma integrity_check')) {
        operations.push('integrity_check')
        if (options.integrity === 'throw') {
          return fail()
        }
        if (options.integrity === 'malformed') {
          return [{ integrity_result: 'synthetic-integrity-result' }]
        }
        return [{ integrity_check: options.integrity === 'not_ok' ? 'not_ok' : 'ok' }]
      }
      if (statement.includes('from sqlite_master')) {
        if (statement.includes("where name = 'phase_test_records'")) {
          return phaseTableVersion === null ? [] : [makePhaseMasterRow()]
        }
        return tableExists ? [masterRow] : []
      }
      if (statement.includes('pragma table_info')) {
        if (statement.includes("'phase_test_records'")) {
          return phaseTableVersion === null ? [] : phaseColumnRows
        }
        return tableExists ? columnRows : []
      }
      if (statement.includes('pragma index_list') || statement.includes('pragma foreign_key_list')) {
        return []
      }
      if (statement.includes('from app_migrations')) {
        return tableExists && migrationRows.length > 0 ? migrationRows : []
      }
      return []
    },
    run(sql, params) {
      const statement = normalized(sql)
      if (statement.includes('insert into app_migrations')) {
        applyMigrationInsert(params)
        return
      }
      operations.push('other_run')
    },
    close() {
      closeCalls += 1
      operations.push('close')
      if (options.close === 'throw') {
        fail()
      }
    },
  }

  const factory: SqliteDatabaseDriverFactory = (dbPath) => {
    void dbPath
    factoryCalls += 1
    return driver
  }

  return {
    driver,
    factory,
    operations,
    get factoryCalls() {
      return factoryCalls
    },
    get closeCalls() {
      return closeCalls
    },
  }
}

function expectOnlyAppMigrationsObject(snapshot: PersistentSnapshot): void {
  expect(snapshot.objects).toHaveLength(1)
  expect(snapshot.objects[0]).toMatchObject({
    type: 'table',
    name: 'app_migrations',
    tbl_name: 'app_migrations',
  })
  expect(snapshot.objects.some((row) =>
    ['guests', 'enrollment_images', 'face_embeddings', 'visit_summaries', 'guest_memories', 'master_memory', 'telemetry', 'logs'].includes(
      row.name as string,
    ),
  )).toBe(false)
}

function expectOnlyCurrentSchemaObjects(snapshot: PersistentSnapshot): void {
  expect(snapshot.objects).toHaveLength(2)
  expect(snapshot.objects.map((row) => row.name)).toEqual([
    'app_migrations',
    'phase_test_records',
  ])
  expect(snapshot.objects[0]).toMatchObject({
    type: 'table',
    name: 'app_migrations',
    tbl_name: 'app_migrations',
  })
  expect(snapshot.objects[1]).toMatchObject({
    type: 'table',
    name: 'phase_test_records',
    tbl_name: 'phase_test_records',
  })
}

function expectExactPhaseTable(snapshot: PersistentSnapshot): void {
  const phaseTable = snapshot.objects.find((row) => row.name === 'phase_test_records')
  expect(phaseTable).toBeDefined()
  if (phaseTable === undefined) return
  expect(normalizeSql(phaseTable.sql as string)).toBe(normalizeSql(PHASE_TEST_V6_DDL))
  expect(snapshot.phaseColumns).toEqual(PHASE_TEST_COLUMNS)
  expect(snapshot.phaseIndexes).toEqual([])
  expect(snapshot.phaseForeignKeys).toEqual([])
}

function expectExactValidSchema(
  snapshot: PersistentSnapshot,
  rows: Array<Record<string, unknown>> = [
    { ...BASELINE_ROW },
    { ...PHASE_TEST_V2_MIGRATION_ROW },
    { ...PHASE_TEST_V3_MIGRATION_ROW },
    { ...PHASE_TEST_V4_MIGRATION_ROW },
    { ...PHASE_TEST_V5_MIGRATION_ROW },
    { ...PHASE_TEST_V6_MIGRATION_ROW },
  ],
): void {
  expectOnlyCurrentSchemaObjects(snapshot)
  expect(normalizeSql(snapshot.objects[0].sql as string)).toBe(normalizeSql(BASELINE_DDL))
  expect(snapshot.columns).toEqual([
    { cid: 0, name: 'version', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
    { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  ])
  expect(snapshot.indexes).toEqual([])
  expect(snapshot.foreignKeys).toEqual([])
  expect(snapshot.migrations).toEqual(rows)
  expectExactPhaseTable(snapshot)
  expect(snapshot.journalMode).toEqual([{ journal_mode: 'wal' }])
  expect(snapshot.integrity).toEqual([{ integrity_check: 'ok' }])
}

function expectUnchangedV1Fixture(
  snapshot: PersistentSnapshot,
  rows: Array<Record<string, unknown>>,
): void {
  expectOnlyAppMigrationsObject(snapshot)
  expect(normalizeSql(snapshot.objects[0].sql as string)).toBe(normalizeSql(BASELINE_DDL))
  expect(snapshot.columns).toEqual([
    { cid: 0, name: 'version', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
    { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  ])
  expect(snapshot.indexes).toEqual([])
  expect(snapshot.foreignKeys).toEqual([])
  expect(snapshot.migrations).toEqual(rows)
  expect(snapshot.phaseColumns).toEqual([])
  expect(snapshot.phaseIndexes).toEqual([])
  expect(snapshot.phaseForeignKeys).toEqual([])
  expect(snapshot.journalMode).toEqual([{ journal_mode: 'wal' }])
  expect(snapshot.integrity).toEqual([{ integrity_check: 'ok' }])
}

function expectNoUnapprovedDriverOperations(operations: readonly DriverOperation[]): void {
  expect(operations).not.toEqual(expect.arrayContaining(['delete', 'other_exec', 'other_run']))
}

function expectV3MigrationSwap(operations: readonly DriverOperation[]): void {
  expect(operations).toEqual(expect.arrayContaining([
    'alter',
    'create_phase_records',
    'copy_phase_records',
    'drop',
  ]))
}

afterEach(async () => {
  for (const service of activeServices.splice(0)) {
    service.close()
  }

  for (const directory of temporaryDirectories.splice(0)) {
    const tempRoot = resolve(tmpdir())
    const candidate = resolve(directory)
    if (!candidate.startsWith(`${tempRoot}${sep}`)) {
      throw new Error('refusing cleanup outside the OS temporary directory')
    }
    await rm(directory, { recursive: true, force: true })
  }
})

describe('SQLite service public contract', () => {
  it('uses the shared Result shape and exposes the phase-test service contract', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const options: SqliteServiceOptions = { dbPath, telemetry: telemetry.telemetry }
    const result: Result<SqlitePhaseTestService, SqliteFailure> = openTracked(options)

    expect(SQLITE_SCHEMA_VERSION).toBe(6)
    expect(Object.keys(result).sort()).toEqual(['ok', 'value'])
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected ready sqlite service')
    }

    expect(runtimeMethodNames(result.value)).toEqual([
      'appendPhaseTestRecord',
      'close',
      'health',
      'readPhaseTestRecords',
    ])
    expect(typeof result.value.appendPhaseTestRecord).toBe('function')
    expect(typeof result.value.health).toBe('function')
    expect(typeof result.value.readPhaseTestRecords).toBe('function')
    expect(typeof result.value.close).toBe('function')
    expectReadyHealth(result.value, dbPath)
    expectSuccessfulOpen(telemetry.events, dbPath)

    const closed = result.value.close()
    expect(closed).toEqual({ ok: true, value: undefined })
    expect(telemetry.events.filter((event) => event.event === 'sqlite_close')).toHaveLength(1)
    assertTelemetryPrivacy(telemetry.events, dbPath)
  })

  it('opens a persistent file with the exact schema-v3 contract and required metadata', async () => {
    const { directory, dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected persistent sqlite open')
    }
    expectReadyHealth(result.value, dbPath)
    expect(existsSync(dbPath)).toBe(true)
    expect(existsSync(join(directory, 'alternate.sqlite'))).toBe(false)
    expectEvent(telemetry.events, 'sqlite_migration', {
      status: 'success',
      reason: 'version=6;name=phase_test_records_v6',
    })
    expectEvent(telemetry.events, 'sqlite_integrity_check', {
      status: 'success',
      reason: 'result=ok',
    })

    expect(result.value.close()).toEqual({ ok: true, value: undefined })
    const snapshot = await inspectPersistentDatabase(dbPath)
    expectExactValidSchema(snapshot)
    assertTelemetryPrivacy(telemetry.events, dbPath)
  })

  it('reopens the same persistent file without duplicating or recreating schema-v3 objects', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const firstTelemetry = makeTelemetryHarness()
    const first = openTracked({ dbPath, telemetry: firstTelemetry.telemetry })
    expect(first.ok).toBe(true)
    if (!first.ok) {
      throw new Error('expected first sqlite open')
    }
    expect(first.value.close()).toEqual({ ok: true, value: undefined })

    const secondTelemetry = makeTelemetryHarness()
    const second = openTracked({ dbPath, telemetry: secondTelemetry.telemetry })
    expect(second.ok).toBe(true)
    if (!second.ok) {
      throw new Error('expected reopen')
    }
    expectReadyHealth(second.value, dbPath)
    expect(secondTelemetry.events.some((event) => event.event === 'sqlite_migration')).toBe(false)
    expectEvent(secondTelemetry.events, 'sqlite_open', {
      status: 'success',
      reason: 'schema_version=6;foreign_keys=on;journal_mode=wal;integrity=ok',
    })
    expect(second.value.close()).toEqual({ ok: true, value: undefined })

    const snapshot = await inspectPersistentDatabase(dbPath)
    expectExactValidSchema(snapshot)
    expect(firstTelemetry.events.filter((event) => event.event === 'sqlite_close')).toHaveLength(1)
    expect(secondTelemetry.events.filter((event) => event.event === 'sqlite_close')).toHaveLength(1)
    assertTelemetryPrivacy(firstTelemetry.events, dbPath)
    assertTelemetryPrivacy(secondTelemetry.events, dbPath)
  })

  it('returns defensive health copies and makes successful close idempotent', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected sqlite service')
    }

    const readyCopy = result.value.health()
    const readySecondCopy = result.value.health()
    expect(readyCopy).not.toBe(readySecondCopy)
    readyCopy.status = 'failed'
    readyCopy.schemaVersion = 99
    expect(result.value.health()).toEqual({
      status: 'ready',
      schemaVersion: 6,
      journalMode: 'wal',
      foreignKeys: true,
      integrity: 'ok',
      failure: null,
    })

    const firstClose = result.value.close()
    expect(firstClose).toEqual({ ok: true, value: undefined })
    const failedCopy = result.value.health()
    const failedSecondCopy = result.value.health()
    expect(failedCopy).not.toBe(failedSecondCopy)
    expect(failedCopy.failure).not.toBeNull()
    expect(failedSecondCopy.failure).not.toBeNull()
    if (failedCopy.failure === null || failedSecondCopy.failure === null) {
      throw new Error('expected closed health failure')
    }
    failedCopy.status = 'ready'
    failedCopy.failure.code = 'sqlite_close_failed'
    failedCopy.failure.reason = 'driver_close_failed'
    expect(result.value.health()).toEqual({
      status: 'failed',
      schemaVersion: 6,
      journalMode: 'wal',
      foreignKeys: true,
      integrity: 'ok',
      failure: { code: 'sqlite_closed', reason: 'service_closed' },
    })

    const secondClose = result.value.close()
    expect(secondClose).toEqual(firstClose)
    expect(telemetry.events.filter((event) => event.event === 'sqlite_close')).toHaveLength(1)
    assertTelemetryPrivacy(telemetry.events, dbPath)
  })
})

describe('SQLite persistent schema and migration contract', () => {
  it('migrates an existing empty v1 table through the schema-v3 contract', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    await seedPersistentDatabase(dbPath, 'empty')
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected empty migration to succeed')
    }
    expectReadyHealth(result.value, dbPath)
    expectEvent(telemetry.events, 'sqlite_migration', {
      status: 'success',
      reason: 'version=6;name=phase_test_records_v6',
    })
    expect(result.value.close()).toEqual({ ok: true, value: undefined })

    const snapshot = await inspectPersistentDatabase(dbPath)
    expectExactValidSchema(snapshot)
    assertTelemetryPrivacy(telemetry.events, dbPath)
  })

  it('accepts an already exact seeded schema-v3 database without applying migrations again', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    await seedPersistentDatabase(dbPath, 'exact')
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected exact seeded baseline to reopen')
    }
    expectReadyHealth(result.value, dbPath)
    expect(telemetry.events.some((event) => event.event === 'sqlite_migration')).toBe(false)
    expect(result.value.close()).toEqual({ ok: true, value: undefined })

    const snapshot = await inspectPersistentDatabase(dbPath)
    expectExactValidSchema(snapshot)
    assertTelemetryPrivacy(telemetry.events, dbPath)
  })

  it('rejects a malformed app_migrations shape without repairing or expanding it', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    await seedPersistentDatabase(dbPath, 'malformed')
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    const failure = expectFailure(result, {
      code: 'sqlite_schema_invalid',
      reason: 'schema_ddl_invalid',
    })
    expect(failure).toEqual({ code: 'sqlite_schema_invalid', reason: 'schema_ddl_invalid' })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
    expect(telemetry.events.some((event) => event.event === 'sqlite_migration')).toBe(false)

    const snapshot = await inspectPersistentDatabase(dbPath)
    expectOnlyAppMigrationsObject(snapshot)
    expect(snapshot.columns.map((row) => row.name)).toEqual(['version', 'name', 'extra'])
    expect(snapshot.migrations).toEqual([])
  })

  it('rejects a gapped 1,3 migration sequence before any downgrade or repair', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    await seedPersistentDatabase(dbPath, 'gap')
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    const failure = expectFailure(result, {
      code: 'sqlite_schema_invalid',
      reason: 'schema_gap',
    })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
    const snapshot = await inspectPersistentDatabase(dbPath)
    expectUnchangedV1Fixture(snapshot, [
      { version: 1, name: 'foundation_baseline' },
      { version: 3, name: 'gap_marker' },
    ])
  })

  it('rejects an unknown migration name without replacing the row', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    await seedPersistentDatabase(dbPath, 'unknown')
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    const failure = expectFailure(result, {
      code: 'sqlite_schema_invalid',
      reason: 'schema_name_unknown',
    })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
    const snapshot = await inspectPersistentDatabase(dbPath)
    expectUnchangedV1Fixture(snapshot, [{ version: 1, name: 'unknown_migration' }])
  })

  it('rejects true future version 7 without downgrading it', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    await seedPersistentDatabase(dbPath, 'future')
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    const failure = expectFailure(result, {
      code: 'sqlite_schema_too_new',
      reason: 'schema_future_version',
    })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
    const snapshot = await inspectPersistentDatabase(dbPath)
    expectUnchangedV1Fixture(snapshot, [{ version: 7, name: 'future_migration' }])
  })

  it('maps a real missing-parent open failure without creating the parent or an alternate file', async () => {
    const { directory } = await makeTemporaryDatabasePath()
    const missingParent = join(directory, 'missing-parent')
    const dbPath = join(missingParent, 'mirror.sqlite')
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    const failure = expectFailure(result, {
      code: 'sqlite_open_failed',
      reason: 'driver_open_failed',
    })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
    expect(existsSync(missingParent)).toBe(false)
    expect(existsSync(dbPath)).toBe(false)
    expect(await readdir(directory)).toEqual([])
  })
})

describe('SQLite path validation precedence', () => {
  it.each([
    { label: 'empty', dbPath: '', reason: 'empty_path' as const },
    { label: 'whitespace', dbPath: ' \t\r\n ', reason: 'empty_path' as const },
    { label: 'NUL-containing', dbPath: 'absolute\u0000marker', reason: 'nul_byte' as const },
    { label: 'exact memory path', dbPath: ':memory:', reason: 'memory_path' as const },
  ])('rejects $label before opening a driver', async ({ dbPath, reason }) => {
    const { directory } = await makeTemporaryDatabasePath()
    const expectedTarget = join(directory, 'mirror.sqlite')
    const probe = makePathProbe()
    const telemetry = makeTelemetryHarness()
    const result = openTracked({
      dbPath,
      telemetry: telemetry.telemetry,
      driverFactory: probe.factory,
    })

    const failure = expectFailure(result, { code: 'sqlite_path_invalid', reason })
    expect(probe.calls()).toBe(0)
    expect(existsSync(expectedTarget)).toBe(false)
    expect(await readdir(directory)).toEqual([])
    expectPrimaryOpenFailure(telemetry.events, failure, expectedTarget)
  })

  it('rejects a relative path after the exact memory-path check without relocation', async () => {
    const { directory } = await makeTemporaryDatabasePath()
    const expectedTarget = join(directory, 'mirror.sqlite')
    const relativePath = relative(process.cwd(), expectedTarget)
    const probe = makePathProbe()
    const telemetry = makeTelemetryHarness()
    const result = openTracked({
      dbPath: relativePath,
      telemetry: telemetry.telemetry,
      driverFactory: probe.factory,
    })

    const failure = expectFailure(result, {
      code: 'sqlite_path_invalid',
      reason: 'not_absolute',
    })
    expect(probe.calls()).toBe(0)
    expect(existsSync(expectedTarget)).toBe(false)
    expect(await readdir(directory)).toEqual([])
    expectPrimaryOpenFailure(telemetry.events, failure, expectedTarget)
  })
})

describe('SQLite deterministic failure contract', () => {
  it.each([
    { label: 'throws', foreignKeys: 'throw' as const },
    { label: 'reports disabled', foreignKeys: 'disabled' as const },
  ])('fails closed when foreign-key verification $label', async ({ foreignKeys }) => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const fake = makeFakeDriverHarness({ foreignKeys })
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry, driverFactory: fake.factory })

    const failure = expectFailure(result, {
      code: 'sqlite_foreign_keys_failed',
      reason: 'foreign_keys_not_enabled',
    })
    expect(fake.factoryCalls).toBe(1)
    expect(fake.operations).toContain('foreign_keys_on')
    expect(fake.operations).not.toContain('begin_immediate')
    expect(fake.operations).not.toContain('create_baseline')
    expect(fake.operations).not.toContain('insert_baseline')
    expect(fake.closeCalls).toBe(1)
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
  })

  it.each([
    { label: 'throws', journalMode: 'throw' as const },
    { label: 'returns a non-WAL mode', journalMode: 'not_wal' as const },
  ])('fails closed when WAL verification $label', async ({ journalMode }) => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const fake = makeFakeDriverHarness({ journalMode })
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry, driverFactory: fake.factory })

    const failure = expectFailure(result, {
      code: 'sqlite_journal_mode_failed',
      reason: 'journal_mode_not_wal',
    })
    expect(fake.operations).toContain('foreign_keys_on')
    expect(fake.operations).toContain('journal_mode_wal')
    expect(fake.operations).not.toContain('begin_immediate')
    expect(fake.operations).not.toContain('create_baseline')
    expect(fake.closeCalls).toBe(1)
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
  })

  it.each([
    { label: 'begin', migration: 'begin' as const },
    { label: 'DDL', migration: 'ddl' as const },
    { label: 'insert', migration: 'insert' as const },
    { label: 'commit', migration: 'commit' as const },
  ])('rolls back a migration failure at $label', async ({ migration }) => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const fake = makeFakeDriverHarness({ migration })
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry, driverFactory: fake.factory })

    const failure = expectFailure(result, {
      code: 'sqlite_migration_failed',
      reason: 'migration_transaction_failed',
    })
    expect(fake.operations).toContain('begin_immediate')
    expect(fake.operations).toContain('rollback')
    expect(fake.operations.indexOf('begin_immediate')).toBeLessThan(fake.operations.indexOf('rollback'))
    expect(fake.closeCalls).toBe(1)
    expectNoUnapprovedDriverOperations(fake.operations)
    if (migration === 'commit') expectV3MigrationSwap(fake.operations)
    expectEvent(telemetry.events, 'sqlite_migration', {
      status: 'failed',
      error_code: 'sqlite_migration_failed',
      reason: 'cause=migration_transaction_failed',
    })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
  })

  it('retains the migration failure when best-effort rollback also fails', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const fake = makeFakeDriverHarness({ migration: 'insert', rollback: 'throw' })
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry, driverFactory: fake.factory })

    const failure = expectFailure(result, {
      code: 'sqlite_migration_failed',
      reason: 'migration_transaction_failed',
    })
    expect(fake.operations).toContain('begin_immediate')
    expect(fake.operations).toContain('rollback')
    expect(fake.closeCalls).toBe(1)
    expectNoUnapprovedDriverOperations(fake.operations)
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
    expectEvent(telemetry.events, 'sqlite_migration', {
      status: 'failed',
      error_code: 'sqlite_migration_failed',
      reason: 'cause=migration_transaction_failed',
    })
  })

  it.each([
    { label: 'throws', integrity: 'throw' as const },
    { label: 'returns malformed metadata', integrity: 'malformed' as const },
    { label: 'returns a non-ok result', integrity: 'not_ok' as const },
  ])('fails after committed migration when integrity check $label', async ({ integrity }) => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const fake = makeFakeDriverHarness({ integrity })
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry, driverFactory: fake.factory })

    const failure = expectFailure(result, {
      code: 'sqlite_integrity_failed',
      reason: 'integrity_check_not_ok',
    })
    expect(fake.operations).toContain('begin_immediate')
    expect(fake.operations).toContain('commit')
    expect(fake.operations).toContain('integrity_check')
    expect(fake.operations).not.toContain('rollback')
    expect(fake.closeCalls).toBe(1)
    expectNoUnapprovedDriverOperations(fake.operations)
    expectV3MigrationSwap(fake.operations)
    expectEvent(telemetry.events, 'sqlite_integrity_check', {
      status: 'failed',
      error_code: 'sqlite_integrity_failed',
      reason: 'cause=integrity_check_not_ok',
    })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
  })

  it('reports cleanup-close failure without replacing the primary initialization failure', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const fake = makeFakeDriverHarness({ integrity: 'not_ok', close: 'throw' })
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry, driverFactory: fake.factory })

    const failure = expectFailure(result, {
      code: 'sqlite_integrity_failed',
      reason: 'integrity_check_not_ok',
    })
    expect(fake.closeCalls).toBe(1)
    expectEvent(telemetry.events, 'sqlite_close', {
      status: 'failed',
      error_code: 'sqlite_close_failed',
      reason: 'cause=cleanup_close_failed',
    })
    expectPrimaryOpenFailure(telemetry.events, failure, dbPath)
  })

  it('retains a driver close failure in health and on repeated close calls', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const fake = makeFakeDriverHarness({ close: 'throw' })
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry, driverFactory: fake.factory })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected fake driver open')
    }
    expectReadyHealth(result.value, dbPath)
    expectV3MigrationSwap(fake.operations)
    const firstClose = result.value.close()
    expect(firstClose).toEqual({
      ok: false,
      error: { code: 'sqlite_close_failed', reason: 'driver_close_failed' },
    })
    expect(Object.keys(firstClose).sort()).toEqual(['error', 'ok'])
    expect(result.value.health()).toEqual({
      status: 'failed',
      schemaVersion: 6,
      journalMode: 'wal',
      foreignKeys: true,
      integrity: 'ok',
      failure: { code: 'sqlite_close_failed', reason: 'driver_close_failed' },
    })

    const secondClose = result.value.close()
    expect(secondClose).toEqual(firstClose)
    expect(fake.closeCalls).toBe(1)
    expect(telemetry.events.filter((event) => event.event === 'sqlite_close')).toHaveLength(1)
    expectEvent(telemetry.events, 'sqlite_close', {
      status: 'failed',
      error_code: 'sqlite_close_failed',
      reason: 'cause=driver_close_failed',
    })
    assertTelemetryPrivacy(telemetry.events, dbPath)
  })
})

describe('SQLite telemetry isolation and privacy', () => {
  it('does not let a throwing telemetry sink gate real open, integrity, or close', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness(true)
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected telemetry-independent open')
    }
    expectReadyHealth(result.value, dbPath)
    expect(telemetry.events).toEqual([])
    expect(() => result.value.close()).not.toThrow()
    expect(result.value.health()).toEqual({
      status: 'failed',
      schemaVersion: 6,
      journalMode: 'wal',
      foreignKeys: true,
      integrity: 'ok',
      failure: { code: 'sqlite_closed', reason: 'service_closed' },
    })
    assertTelemetryPrivacy(telemetry.events, dbPath)
  })

  it('keeps every non-throwing event to stable metadata and omits telemetry/log persistence', async () => {
    const { dbPath } = await makeTemporaryDatabasePath()
    const telemetry = makeTelemetryHarness()
    const result = openTracked({ dbPath, telemetry: telemetry.telemetry })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected privacy-test open')
    }
    expectReadyHealth(result.value, dbPath)
    expect(result.value.close()).toEqual({ ok: true, value: undefined })

    const snapshot = await inspectPersistentDatabase(dbPath)
    expectExactValidSchema(snapshot)
    expect(snapshot.objects.some((row) => row.name === 'telemetry' || row.name === 'logs')).toBe(false)
    assertTelemetryPrivacy(telemetry.events, dbPath)
    for (const event of telemetry.events) {
      expect(event.session_id).toBeUndefined()
      expect(event.scene_id).toBeUndefined()
      expect(event.duration_ms).toBeUndefined()
    }
  })
})
