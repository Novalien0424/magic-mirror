import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { isAbsolute } from 'node:path'

import type { PhaseTestRecord } from '../shared/console-types'
import type { Result } from '../shared/types'
import type { Telemetry } from './telemetry'

export const SQLITE_SCHEMA_VERSION = 6 as const

export type SqliteFailureCode =
  | 'sqlite_path_invalid'
  | 'sqlite_open_failed'
  | 'sqlite_foreign_keys_failed'
  | 'sqlite_journal_mode_failed'
  | 'sqlite_schema_invalid'
  | 'sqlite_schema_too_new'
  | 'sqlite_migration_failed'
  | 'sqlite_integrity_failed'
  | 'sqlite_close_failed'
  | 'sqlite_closed'
  | 'sqlite_phase_record_invalid'
  | 'sqlite_phase_record_write_failed'
  | 'sqlite_phase_record_read_failed'

export type SqliteFailureReason =
  | 'empty_path'
  | 'nul_byte'
  | 'memory_path'
  | 'not_absolute'
  | 'driver_open_failed'
  | 'foreign_keys_not_enabled'
  | 'journal_mode_not_wal'
  | 'schema_object_invalid'
  | 'schema_ddl_invalid'
  | 'schema_columns_invalid'
  | 'schema_rows_invalid'
  | 'schema_gap'
  | 'schema_name_unknown'
  | 'schema_future_version'
  | 'migration_transaction_failed'
  | 'integrity_check_not_ok'
  | 'driver_close_failed'
  | 'cleanup_close_failed'
  | 'record_invalid'
  | 'phase_invalid'
  | 'transaction_failed'
  | 'read_failed'
  | 'service_closed'

export interface SqliteFailure {
  code: SqliteFailureCode
  reason: SqliteFailureReason
}

export interface SqliteHealth {
  status: 'ready' | 'failed'
  schemaVersion: number | null
  journalMode: 'wal' | 'unknown'
  foreignKeys: boolean | null
  integrity: 'ok' | 'failed' | 'unknown'
  failure: SqliteFailure | null
}

export type SqliteDatabaseRow = Readonly<Record<string, unknown>>

export interface SqliteDatabaseDriver {
  exec(sql: string): void
  get(sql: string, params?: readonly unknown[]): SqliteDatabaseRow | undefined
  all(sql: string, params?: readonly unknown[]): readonly SqliteDatabaseRow[]
  run(sql: string, params?: readonly unknown[]): void
  close(): void
}

export type SqliteDatabaseDriverFactory =
  (dbPath: string) => SqliteDatabaseDriver

export interface SqliteServiceOptions {
  dbPath: string
  telemetry: Pick<Telemetry, 'emit'>
  driverFactory?: SqliteDatabaseDriverFactory
}

export interface SqliteService {
  health(): SqliteHealth
  close(): Result<void, SqliteFailure>
}

export interface SqlitePhaseTestService extends SqliteService {
  appendPhaseTestRecord(record: unknown): Result<void, SqliteFailure>
  readPhaseTestRecords(
    phase: unknown,
  ): Result<readonly PhaseTestRecord[], SqliteFailure>
}

const BASELINE_DDL =
  'CREATE TABLE app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)'
const BASELINE_DDL_WITH_IF_NOT_EXISTS =
  'CREATE TABLE IF NOT EXISTS app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)'
const BASELINE_NAME = 'foundation_baseline'
const PHASE_TEST_V2_MIGRATION_NAME = 'phase_test_records'
const PHASE_TEST_V3_MIGRATION_NAME = 'phase_test_records_v3'
const PHASE_TEST_V4_MIGRATION_NAME = 'phase_test_records_v4'
const PHASE_TEST_V5_MIGRATION_NAME = 'phase_test_records_v5'
const PHASE_TEST_MIGRATION_NAME = 'phase_test_records_v6'
const PHASE_TEST_V2_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase = '0'), demo_id TEXT NOT NULL CHECK (demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'mock_passed')), note TEXT NOT NULL)"
const PHASE_TEST_V3_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase = '1' AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const PHASE_TEST_V4_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const PHASE_TEST_V5_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2', '3')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5')) OR (phase = '3' AND demo_id IN ('P3-D1', 'P3-D2', 'P3-D3', 'P3-D4'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2', '3') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const PHASE_TEST_V6_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2', '3', '4')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5')) OR (phase = '3' AND demo_id IN ('P3-D1', 'P3-D2', 'P3-D3', 'P3-D4')) OR (phase = '4' AND demo_id IN ('P4-D1', 'P4-D2', 'P4-D3', 'P4-D4', 'P4-D5', 'P4-D6', 'P4-D7', 'P4-D8'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2', '3', '4') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const BASELINE_VERSION = 1
const MAX_PHASE_TEST_RECORDS = 20
const MAX_METADATA_LENGTH = 2048
const PHASE_TEST_RECORD_KEYS = ['phase', 'demoId', 'build', 'time', 'result', 'note'] as const
const PHASE_TEST_ROW_KEYS = ['sequence', 'phase', 'demo_id', 'build', 'time', 'result', 'note'] as const
const PHASE0_DEMO_IDS = [
  'P0-D1',
  'P0-D2',
  'P0-D3',
  'P0-D4',
  'P0-D5',
] as const
const PHASE1_DEMO_IDS = [
  'P1-D1',
  'P1-D2',
  'P1-D3',
  'P1-D4',
  'P1-D5',
  'P1-D6',
] as const
const PHASE2_DEMO_IDS = ['P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5'] as const
const PHASE3_DEMO_IDS = ['P3-D1', 'P3-D2', 'P3-D3', 'P3-D4'] as const
const PHASE4_DEMO_IDS = ['P4-D1', 'P4-D2', 'P4-D3', 'P4-D4', 'P4-D5', 'P4-D6', 'P4-D7', 'P4-D8'] as const
const PHASE0_RESULTS = [
  'passed',
  'failed',
  'mock_passed',
] as const
const PHASE1_RESULTS = [
  'passed',
  'failed',
  'mock_passed',
  'not_executed',
] as const
const PHASE2_RESULTS = PHASE1_RESULTS
const PHASE3_RESULTS = PHASE1_RESULTS
const PHASE4_RESULTS = PHASE1_RESULTS
const PHASE_TEST_BUILD_PATTERN = /^[A-Za-z0-9._:+/-]{1,2048}$/
const PHASE_TEST_NOTE_PATTERN = /^[A-Za-z0-9_=;.%:+,/?-]{1,2048}$/
const PHASE_TEST_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const PRIVATE_CONTENT_PATTERN = /(?:guest|candidate|profile|credential|transcript|audio|embedding|memory|secret|token|prompt|private)/i

const SQL = {
  foreignKeysOn: 'PRAGMA foreign_keys = ON',
  foreignKeys: 'PRAGMA foreign_keys',
  journalModeWal: 'PRAGMA journal_mode = WAL',
  tableInfo: "PRAGMA table_info('app_migrations')",
  indexList: "PRAGMA index_list('app_migrations')",
  foreignKeyList: "PRAGMA foreign_key_list('app_migrations')",
  master: "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name = 'app_migrations'",
  phaseMaster: "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name = 'phase_test_records'",
  phaseTableInfo: "PRAGMA table_info('phase_test_records')",
  phaseIndexList: "PRAGMA index_list('phase_test_records')",
  phaseForeignKeyList: "PRAGMA foreign_key_list('phase_test_records')",
  migrations: 'SELECT version, name FROM app_migrations ORDER BY version ASC',
  createBaseline: BASELINE_DDL_WITH_IF_NOT_EXISTS,
  createPhaseTestRecordsV2: PHASE_TEST_V2_DDL,
  createPhaseTestRecordsV3: PHASE_TEST_V3_DDL,
  createPhaseTestRecordsV4: PHASE_TEST_V4_DDL,
  createPhaseTestRecordsV5: PHASE_TEST_V5_DDL,
  createPhaseTestRecords: PHASE_TEST_V6_DDL,
  phaseTestRows: 'SELECT sequence, phase, demo_id, build, time, result, note FROM phase_test_records ORDER BY sequence ASC',
  renamePhaseTestRecordsV2: 'ALTER TABLE phase_test_records RENAME TO phase_test_records_v2',
  copyPhaseTestRecordsV2: 'INSERT INTO phase_test_records (sequence, phase, demo_id, build, time, result, note) SELECT sequence, phase, demo_id, build, time, result, note FROM phase_test_records_v2 ORDER BY sequence ASC',
  dropPhaseTestRecordsV2: 'DROP TABLE phase_test_records_v2',
  renamePhaseTestRecordsV3: 'ALTER TABLE phase_test_records RENAME TO phase_test_records_v3',
  copyPhaseTestRecordsV3: 'INSERT INTO phase_test_records (sequence, phase, demo_id, build, time, result, note) SELECT sequence, phase, demo_id, build, time, result, note FROM phase_test_records_v3 ORDER BY sequence ASC',
  dropPhaseTestRecordsV3: 'DROP TABLE phase_test_records_v3',
  renamePhaseTestRecordsV4: 'ALTER TABLE phase_test_records RENAME TO phase_test_records_v4',
  copyPhaseTestRecordsV4: 'INSERT INTO phase_test_records (sequence, phase, demo_id, build, time, result, note) SELECT sequence, phase, demo_id, build, time, result, note FROM phase_test_records_v4 ORDER BY sequence ASC',
  dropPhaseTestRecordsV4: 'DROP TABLE phase_test_records_v4',
  renamePhaseTestRecordsV5: 'ALTER TABLE phase_test_records RENAME TO phase_test_records_v5',
  copyPhaseTestRecordsV5: 'INSERT INTO phase_test_records (sequence, phase, demo_id, build, time, result, note) SELECT sequence, phase, demo_id, build, time, result, note FROM phase_test_records_v5 ORDER BY sequence ASC',
  dropPhaseTestRecordsV5: 'DROP TABLE phase_test_records_v5',
  insertMigration: 'INSERT INTO app_migrations (version, name) VALUES (?, ?)',
  insertPhaseTestRecord: 'INSERT INTO phase_test_records (phase, demo_id, build, time, result, note) VALUES (?, ?, ?, ?, ?, ?)',
  prunePhaseTestRecords: `DELETE FROM phase_test_records WHERE sequence NOT IN (SELECT sequence FROM phase_test_records ORDER BY sequence DESC LIMIT ${MAX_PHASE_TEST_RECORDS})`,
  readPhaseTestRecords: 'SELECT sequence, phase, demo_id, build, time, result, note FROM phase_test_records WHERE phase = ? ORDER BY sequence DESC LIMIT 20',
  integrityCheck: 'PRAGMA integrity_check',
  beginImmediate: 'BEGIN IMMEDIATE',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
} as const

const EXPECTED_MIGRATIONS = [
  { version: BASELINE_VERSION, name: BASELINE_NAME },
  { version: 2, name: PHASE_TEST_V2_MIGRATION_NAME },
  { version: 3, name: PHASE_TEST_V3_MIGRATION_NAME },
  { version: 4, name: PHASE_TEST_V4_MIGRATION_NAME },
  { version: 5, name: PHASE_TEST_V5_MIGRATION_NAME },
  { version: SQLITE_SCHEMA_VERSION, name: PHASE_TEST_MIGRATION_NAME },
] as const

const BASELINE_DDL_NORMALIZED = normalizeSql(BASELINE_DDL)
const PHASE_TEST_V2_DDL_NORMALIZED = normalizeSql(PHASE_TEST_V2_DDL)
const PHASE_TEST_V3_DDL_NORMALIZED = normalizeSql(PHASE_TEST_V3_DDL)
const PHASE_TEST_V4_DDL_NORMALIZED = normalizeSql(PHASE_TEST_V4_DDL)
const PHASE_TEST_V5_DDL_NORMALIZED = normalizeSql(PHASE_TEST_V5_DDL)
const PHASE_TEST_DDL_NORMALIZED = normalizeSql(PHASE_TEST_V6_DDL)
const BASELINE_MASTER_KEYS = ['type', 'name', 'tbl_name', 'sql'] as const
const BASELINE_COLUMN_KEYS = ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'] as const
const PHASE_MASTER_KEYS = ['type', 'name', 'tbl_name', 'sql'] as const
const PHASE_COLUMN_KEYS = ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'] as const
const MIGRATION_KEYS = ['version', 'name'] as const

type TelemetryEventInput = Parameters<Telemetry['emit']>[0]

type RawOptions = {
  dbPath?: unknown
  telemetry?: unknown
  driverFactory?: unknown
}

type ValidatedSchema = {
  present: boolean
  version: number | null
  needsMigration: boolean
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

function isOneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return typeof value === 'string' && values.some((candidate) => candidate === value)
}

function makeFailure(
  code: SqliteFailureCode,
  reason: SqliteFailureReason,
): SqliteFailure {
  return { code, reason }
}

function failureResult<T>(failure: SqliteFailure): Result<T, SqliteFailure> {
  return { ok: false, error: failure }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  try {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  } catch {
    return false
  }
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecordObject(value)) return false

  try {
    const actualKeys = Reflect.ownKeys(value)
    return actualKeys.length === expectedKeys.length
      && expectedKeys.every((key) => actualKeys.includes(key))
  } catch {
    return false
  }
}

function readOption(options: unknown, key: keyof RawOptions): unknown {
  if (!isRecordObject(options)) return undefined

  try {
    return options[key]
  } catch {
    return undefined
  }
}

function validateDbPath(value: unknown): Result<string, SqliteFailure> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return failureResult(makeFailure('sqlite_path_invalid', 'empty_path'))
  }
  if (value.includes('\0')) {
    return failureResult(makeFailure('sqlite_path_invalid', 'nul_byte'))
  }
  if (value === ':memory:') {
    return failureResult(makeFailure('sqlite_path_invalid', 'memory_path'))
  }
  if (!isAbsolute(value)) {
    return failureResult(makeFailure('sqlite_path_invalid', 'not_absolute'))
  }

  return { ok: true, value }
}

function safeEmit(telemetry: unknown, event: TelemetryEventInput): void {
  try {
    if (
      (typeof telemetry !== 'object' || telemetry === null)
      && typeof telemetry !== 'function'
    ) {
      return
    }

    const emit = (telemetry as { emit?: unknown }).emit
    if (typeof emit === 'function') {
      emit.call(telemetry, event)
    }
  } catch {
    // Telemetry is observational and must never gate SQLite behavior.
  }
}

function emitOpenFailure(telemetry: unknown, failure: SqliteFailure): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_open',
    status: 'failed',
    error_code: failure.code,
    reason: `cause=${failure.reason}`,
    source: 'runtime',
  })
}

function emitOpenSuccess(telemetry: unknown): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_open',
    status: 'success',
    reason: `schema_version=${SQLITE_SCHEMA_VERSION};foreign_keys=on;journal_mode=wal;integrity=ok`,
    source: 'runtime',
  })
}

function emitMigrationFailure(telemetry: unknown): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_migration',
    status: 'failed',
    error_code: 'sqlite_migration_failed',
    reason: 'cause=migration_transaction_failed',
    source: 'runtime',
  })
}

function emitMigrationSuccess(telemetry: unknown): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_migration',
    status: 'success',
    reason: `version=${SQLITE_SCHEMA_VERSION};name=${PHASE_TEST_MIGRATION_NAME}`,
    source: 'runtime',
  })
}

function emitPhaseRecordFailure(
  telemetry: unknown,
  operation: 'append' | 'read',
  failure: SqliteFailure,
): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: `sqlite_phase_record_${operation}`,
    status: 'failed',
    error_code: failure.code,
    reason: `cause=${failure.reason}`,
    source: 'runtime',
  })
}

function emitIntegrityFailure(telemetry: unknown): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_integrity_check',
    status: 'failed',
    error_code: 'sqlite_integrity_failed',
    reason: 'cause=integrity_check_not_ok',
    source: 'runtime',
  })
}

function emitIntegritySuccess(telemetry: unknown): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_integrity_check',
    status: 'success',
    reason: 'result=ok',
    source: 'runtime',
  })
}

function emitCloseFailure(telemetry: unknown, reason: 'driver_close_failed' | 'cleanup_close_failed'): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_close',
    status: 'failed',
    error_code: 'sqlite_close_failed',
    reason: `cause=${reason}`,
    source: 'runtime',
  })
}

function emitCloseSuccess(telemetry: unknown): void {
  safeEmit(telemetry, {
    module: 'sqlite',
    event: 'sqlite_close',
    status: 'success',
    reason: 'status=closed',
    source: 'runtime',
  })
}

function createDefaultDriver(dbPath: string): SqliteDatabaseDriver {
  const database = new DatabaseSync(dbPath)

  function sqliteInputValues(params: readonly unknown[] | undefined): SQLInputValue[] {
    return (params === undefined ? [] : [...params]) as SQLInputValue[]
  }

  return {
    exec(sql) {
      database.exec(sql)
    },
    get(sql, params) {
      const statement = database.prepare(sql)
      return statement.get(...sqliteInputValues(params)) as SqliteDatabaseRow | undefined
    },
    all(sql, params) {
      const statement = database.prepare(sql)
      return statement.all(...sqliteInputValues(params)) as readonly SqliteDatabaseRow[]
    },
    run(sql, params) {
      const statement = database.prepare(sql)
      statement.run(...sqliteInputValues(params))
    },
    close() {
      database.close()
    },
  }
}

function isDatabaseDriver(value: unknown): value is SqliteDatabaseDriver {
  if (typeof value !== 'object' || value === null) return false

  try {
    return typeof (value as { exec?: unknown }).exec === 'function'
      && typeof (value as { get?: unknown }).get === 'function'
      && typeof (value as { all?: unknown }).all === 'function'
      && typeof (value as { run?: unknown }).run === 'function'
      && typeof (value as { close?: unknown }).close === 'function'
  } catch {
    return false
  }
}

function validateForeignKeys(driver: SqliteDatabaseDriver): boolean {
  try {
    driver.exec(SQL.foreignKeysOn)
    const rows = driver.all(SQL.foreignKeys)
    if (!Array.isArray(rows) || rows.length !== 1) return false

    const row = rows[0]
    return hasExactKeys(row, ['foreign_keys']) && row.foreign_keys === 1
  } catch {
    return false
  }
}

function validateJournalMode(driver: SqliteDatabaseDriver): boolean {
  try {
    driver.exec(SQL.journalModeWal)
    const rows = driver.all(SQL.journalModeWal)
    if (!Array.isArray(rows) || rows.length !== 1) return false

    const row = rows[0]
    return hasExactKeys(row, ['journal_mode'])
      && typeof row.journal_mode === 'string'
      && row.journal_mode.toLowerCase() === 'wal'
  } catch {
    return false
  }
}

function validateColumns(rows: readonly SqliteDatabaseRow[]): boolean {
  if (!Array.isArray(rows) || rows.length !== 2) return false

  try {
    const versionColumn = rows[0]
    const nameColumn = rows[1]
    return hasExactKeys(versionColumn, BASELINE_COLUMN_KEYS)
      && versionColumn.cid === 0
      && versionColumn.name === 'version'
      && versionColumn.type === 'INTEGER'
      && versionColumn.notnull === 1
      && versionColumn.dflt_value === null
      && versionColumn.pk === 1
      && hasExactKeys(nameColumn, BASELINE_COLUMN_KEYS)
      && nameColumn.cid === 1
      && nameColumn.name === 'name'
      && nameColumn.type === 'TEXT'
      && nameColumn.notnull === 1
      && nameColumn.dflt_value === null
      && nameColumn.pk === 0
  } catch {
    return false
  }
}

function validatePhaseColumns(rows: readonly SqliteDatabaseRow[]): boolean {
  if (!Array.isArray(rows) || rows.length !== 7) return false

  const expected = [
    { cid: 0, name: 'sequence', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
    { cid: 1, name: 'phase', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { cid: 2, name: 'demo_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { cid: 3, name: 'build', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { cid: 4, name: 'time', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { cid: 5, name: 'result', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
    { cid: 6, name: 'note', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  ] as const

  try {
    return rows.every((row, index) => {
      const expectedColumn = expected[index]
      return expectedColumn !== undefined
        && hasExactKeys(row, PHASE_COLUMN_KEYS)
        && row.cid === expectedColumn.cid
        && row.name === expectedColumn.name
        && row.type === expectedColumn.type
        && row.notnull === expectedColumn.notnull
        && row.dflt_value === expectedColumn.dflt_value
        && row.pk === expectedColumn.pk
    })
  } catch {
    return false
  }
}

function inspectPhaseTable(
  driver: SqliteDatabaseDriver,
  expectedDdl: string,
): Result<void, SqliteFailure> {
  let objects: readonly SqliteDatabaseRow[]
  try {
    objects = driver.all(SQL.phaseMaster)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
  }

  if (!Array.isArray(objects) || objects.length !== 1) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
  }

  try {
    const object = objects[0]
    if (
      !hasExactKeys(object, PHASE_MASTER_KEYS)
      || object.type !== 'table'
      || object.name !== 'phase_test_records'
      || object.tbl_name !== 'phase_test_records'
    ) {
      return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
    }
    if (typeof object.sql !== 'string' || normalizeSql(object.sql) !== expectedDdl) {
      return failureResult(makeFailure('sqlite_schema_invalid', 'schema_ddl_invalid'))
    }
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_ddl_invalid'))
  }

  let columns: readonly SqliteDatabaseRow[]
  try {
    columns = driver.all(SQL.phaseTableInfo)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }
  if (!validatePhaseColumns(columns)) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }

  let indexes: readonly SqliteDatabaseRow[]
  let foreignKeys: readonly SqliteDatabaseRow[]
  try {
    indexes = driver.all(SQL.phaseIndexList)
    foreignKeys = driver.all(SQL.phaseForeignKeyList)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }
  if (!Array.isArray(indexes) || indexes.length !== 0 || !Array.isArray(foreignKeys) || foreignKeys.length !== 0) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }

  return { ok: true, value: undefined }
}

function validateMigrationRows(
  rows: readonly SqliteDatabaseRow[],
): Result<number | null, SqliteFailure> {
  if (!Array.isArray(rows)) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_rows_invalid'))
  }

  try {
    const validatedRows: Array<{ version: number; name: string }> = []
    for (const row of rows) {
      if (!hasExactKeys(row, MIGRATION_KEYS)) {
        return failureResult(makeFailure('sqlite_schema_invalid', 'schema_rows_invalid'))
      }

      const version = row.version
      const name = row.name
      if (
        typeof version !== 'number'
        || !Number.isSafeInteger(version)
        || version <= 0
        || typeof name !== 'string'
        || name.length === 0
      ) {
        return failureResult(makeFailure('sqlite_schema_invalid', 'schema_rows_invalid'))
      }

      validatedRows.push({ version, name })
    }

    for (let index = 1; index < validatedRows.length; index += 1) {
      const previous = validatedRows[index - 1].version
      const current = validatedRows[index].version
      if (current !== previous + 1) {
        return failureResult(makeFailure('sqlite_schema_invalid', 'schema_gap'))
      }
    }

    if (validatedRows.length === 0) {
      return { ok: true, value: null }
    }

    if (validatedRows[0].version > SQLITE_SCHEMA_VERSION) {
      return failureResult(makeFailure('sqlite_schema_too_new', 'schema_future_version'))
    }

    const lastVersion = validatedRows[validatedRows.length - 1].version
    if (lastVersion > SQLITE_SCHEMA_VERSION) {
      return failureResult(makeFailure('sqlite_schema_too_new', 'schema_future_version'))
    }

    for (const row of validatedRows) {
      const expected = EXPECTED_MIGRATIONS.find((migration) => migration.version === row.version)
      if (expected === undefined || expected.name !== row.name) {
        return failureResult(makeFailure('sqlite_schema_invalid', 'schema_name_unknown'))
      }
    }

    return { ok: true, value: lastVersion }
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_rows_invalid'))
  }
}

function inspectSchema(driver: SqliteDatabaseDriver): Result<ValidatedSchema, SqliteFailure> {
  let objects: readonly SqliteDatabaseRow[]
  try {
    objects = driver.all(SQL.master)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
  }

  if (!Array.isArray(objects)) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
  }
  if (objects.length === 0) {
    return {
      ok: true,
      value: { present: false, version: null, needsMigration: true },
    }
  }
  if (objects.length !== 1) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
  }

  try {
    const object = objects[0]
    if (!hasExactKeys(object, BASELINE_MASTER_KEYS)) {
      return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
    }
    if (
      object.type !== 'table'
      || object.name !== 'app_migrations'
      || object.tbl_name !== 'app_migrations'
    ) {
      return failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
    }
    if (typeof object.sql !== 'string' || normalizeSql(object.sql) !== BASELINE_DDL_NORMALIZED) {
      return failureResult(makeFailure('sqlite_schema_invalid', 'schema_ddl_invalid'))
    }
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_ddl_invalid'))
  }

  let columns: readonly SqliteDatabaseRow[]
  try {
    columns = driver.all(SQL.tableInfo)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }
  if (!validateColumns(columns)) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }

  let indexes: readonly SqliteDatabaseRow[]
  try {
    indexes = driver.all(SQL.indexList)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }
  if (!Array.isArray(indexes) || indexes.length !== 0) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }

  let foreignKeys: readonly SqliteDatabaseRow[]
  try {
    foreignKeys = driver.all(SQL.foreignKeyList)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }
  if (!Array.isArray(foreignKeys) || foreignKeys.length !== 0) {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_columns_invalid'))
  }

  let migrations: readonly SqliteDatabaseRow[]
  try {
    migrations = driver.all(SQL.migrations)
  } catch {
    return failureResult(makeFailure('sqlite_schema_invalid', 'schema_rows_invalid'))
  }
  const rowResult = validateMigrationRows(migrations)
  if (!rowResult.ok) return rowResult

  if (rowResult.value === SQLITE_SCHEMA_VERSION) {
    const phaseTable = inspectPhaseTable(driver, PHASE_TEST_DDL_NORMALIZED)
    if (!phaseTable.ok) return phaseTable
  }

  return {
    ok: true,
    value: {
      present: true,
      version: rowResult.value,
      needsMigration: rowResult.value === null || rowResult.value < SQLITE_SCHEMA_VERSION,
    },
  }
}

function validateExistingV2PhaseRows(driver: SqliteDatabaseDriver): boolean {
  let rows: readonly SqliteDatabaseRow[]
  try {
    rows = driver.all(SQL.phaseTestRows)
  } catch {
    return false
  }

  if (!Array.isArray(rows)) return false

  try {
    for (const row of rows) {
      if (!hasExactKeys(row, PHASE_TEST_ROW_KEYS)) return false
      if (
        typeof row.sequence !== 'number'
        || !Number.isSafeInteger(row.sequence)
        || row.sequence <= 0
        || row.phase !== '0'
      ) {
        return false
      }

      const recordValidation = validatePhaseTestRecord({
        phase: row.phase,
        demoId: row.demo_id,
        build: row.build,
        time: row.time,
        result: row.result,
        note: row.note,
      })
      if (!recordValidation.ok || recordValidation.value.phase !== '0') return false
    }
    return true
  } catch {
    return false
  }
}

function migratePhaseTestRecordsV2ToV3(driver: SqliteDatabaseDriver): void {
  const v2Schema = inspectPhaseTable(driver, PHASE_TEST_V2_DDL_NORMALIZED)
  if (!v2Schema.ok) throw new Error('migration_v2_schema_invalid')
  if (!validateExistingV2PhaseRows(driver)) throw new Error('migration_v2_rows_invalid')

  driver.exec(SQL.renamePhaseTestRecordsV2)
  driver.exec(SQL.createPhaseTestRecordsV3)
  driver.exec(SQL.copyPhaseTestRecordsV2)
  driver.exec(SQL.dropPhaseTestRecordsV2)
  driver.run(SQL.insertMigration, [3, PHASE_TEST_V3_MIGRATION_NAME])
}

function validateExistingV3PhaseRows(driver: SqliteDatabaseDriver): boolean {
  let rows: readonly SqliteDatabaseRow[]
  try {
    rows = driver.all(SQL.phaseTestRows)
  } catch {
    return false
  }
  if (!Array.isArray(rows)) return false
  return rows.every((row) => {
    if (!hasExactKeys(row, PHASE_TEST_ROW_KEYS)) return false
    const validated = validatePhaseTestRecord({
      phase: row.phase,
      demoId: row.demo_id,
      build: row.build,
      time: row.time,
      result: row.result,
      note: row.note,
    })
    return typeof row.sequence === 'number'
      && Number.isSafeInteger(row.sequence)
      && row.sequence > 0
      && (row.phase === '0' || row.phase === '1')
      && validated.ok
  })
}

function migratePhaseTestRecordsV3ToV4(driver: SqliteDatabaseDriver): void {
  const schema = inspectPhaseTable(driver, PHASE_TEST_V3_DDL_NORMALIZED)
  if (!schema.ok || !validateExistingV3PhaseRows(driver)) throw new Error('migration_v3_invalid')
  driver.exec(SQL.renamePhaseTestRecordsV3)
  driver.exec(SQL.createPhaseTestRecordsV4)
  driver.exec(SQL.copyPhaseTestRecordsV3)
  driver.exec(SQL.dropPhaseTestRecordsV3)
  driver.run(SQL.insertMigration, [4, PHASE_TEST_V4_MIGRATION_NAME])
}

function validateExistingV4PhaseRows(driver: SqliteDatabaseDriver): boolean {
  let rows: readonly SqliteDatabaseRow[]
  try {
    rows = driver.all(SQL.phaseTestRows)
  } catch {
    return false
  }
  if (!Array.isArray(rows)) return false
  return rows.every((row) => {
    if (!hasExactKeys(row, PHASE_TEST_ROW_KEYS)) return false
    const validated = validatePhaseTestRecord({
      phase: row.phase,
      demoId: row.demo_id,
      build: row.build,
      time: row.time,
      result: row.result,
      note: row.note,
    })
    return typeof row.sequence === 'number'
      && Number.isSafeInteger(row.sequence)
      && row.sequence > 0
      && (row.phase === '0' || row.phase === '1' || row.phase === '2')
      && validated.ok
  })
}

function migratePhaseTestRecordsV4ToV5(driver: SqliteDatabaseDriver): void {
  const schema = inspectPhaseTable(driver, PHASE_TEST_V4_DDL_NORMALIZED)
  if (!schema.ok || !validateExistingV4PhaseRows(driver)) throw new Error('migration_v4_invalid')
  driver.exec(SQL.renamePhaseTestRecordsV4)
  driver.exec(SQL.createPhaseTestRecordsV5)
  driver.exec(SQL.copyPhaseTestRecordsV4)
  driver.exec(SQL.dropPhaseTestRecordsV4)
  driver.run(SQL.insertMigration, [5, PHASE_TEST_V5_MIGRATION_NAME])
}

function validateExistingV5PhaseRows(driver: SqliteDatabaseDriver): boolean {
  let rows: readonly SqliteDatabaseRow[]
  try {
    rows = driver.all(SQL.phaseTestRows)
  } catch {
    return false
  }
  if (!Array.isArray(rows)) return false
  return rows.every((row) => {
    if (!hasExactKeys(row, PHASE_TEST_ROW_KEYS)) return false
    const validated = validatePhaseTestRecord({
      phase: row.phase,
      demoId: row.demo_id,
      build: row.build,
      time: row.time,
      result: row.result,
      note: projectStoredPhaseNote(row.phase, row.note),
    })
    return typeof row.sequence === 'number'
      && Number.isSafeInteger(row.sequence)
      && row.sequence > 0
      && (row.phase === '0' || row.phase === '1' || row.phase === '2' || row.phase === '3')
      && validated.ok
  })
}

function migratePhaseTestRecordsV5ToV6(driver: SqliteDatabaseDriver): void {
  const schema = inspectPhaseTable(driver, PHASE_TEST_V5_DDL_NORMALIZED)
  if (!schema.ok || !validateExistingV5PhaseRows(driver)) throw new Error('migration_v5_invalid')
  driver.exec(SQL.renamePhaseTestRecordsV5)
  driver.exec(SQL.createPhaseTestRecords)
  driver.exec(SQL.copyPhaseTestRecordsV5)
  driver.exec(SQL.dropPhaseTestRecordsV5)
  driver.run(SQL.insertMigration, [SQLITE_SCHEMA_VERSION, PHASE_TEST_MIGRATION_NAME])
}

function applyMigrations(
  driver: SqliteDatabaseDriver,
  currentVersion: number | null,
): Result<void, SqliteFailure> {
  try {
    driver.exec(SQL.beginImmediate)
    let version = currentVersion
    if (version === null) {
      driver.exec(SQL.createBaseline)
      driver.run(SQL.insertMigration, [BASELINE_VERSION, BASELINE_NAME])
      version = BASELINE_VERSION
    }
    if (version === BASELINE_VERSION) {
      driver.exec(SQL.createPhaseTestRecordsV2)
      driver.run(SQL.insertMigration, [2, PHASE_TEST_V2_MIGRATION_NAME])
      version = 2
    }
    if (version === 2) {
      migratePhaseTestRecordsV2ToV3(driver)
      version = 3
    }
    if (version === 3) {
      migratePhaseTestRecordsV3ToV4(driver)
      version = 4
    }
    if (version === 4) {
      migratePhaseTestRecordsV4ToV5(driver)
      version = 5
    }
    if (version === 5) {
      migratePhaseTestRecordsV5ToV6(driver)
    }
    driver.exec(SQL.commit)
    return { ok: true, value: undefined }
  } catch {
    try {
      driver.exec(SQL.rollback)
    } catch {
      // Rollback is best effort; the transaction failure remains primary.
    }
    return failureResult(makeFailure('sqlite_migration_failed', 'migration_transaction_failed'))
  }
}

function validateIntegrity(driver: SqliteDatabaseDriver): boolean {
  try {
    const rows = driver.all(SQL.integrityCheck)
    if (!Array.isArray(rows) || rows.length !== 1) return false
    const row = rows[0]
    return hasExactKeys(row, ['integrity_check']) && row.integrity_check === 'ok'
  } catch {
    return false
  }
}

function cloneFailure(failure: SqliteFailure): SqliteFailure {
  return { code: failure.code, reason: failure.reason }
}

function cloneHealth(health: SqliteHealth): SqliteHealth {
  return {
    status: health.status,
    schemaVersion: health.schemaVersion,
    journalMode: health.journalMode,
    foreignKeys: health.foreignKeys,
    integrity: health.integrity,
    failure: health.failure === null ? null : cloneFailure(health.failure),
  }
}

function cloneCloseResult(result: Result<void, SqliteFailure>): Result<void, SqliteFailure> {
  if (result.ok) return { ok: true, value: undefined }
  return { ok: false, error: cloneFailure(result.error) }
}

function phaseRecordFailure(
  code: SqliteFailureCode,
  reason: SqliteFailureReason,
): Result<never, SqliteFailure> {
  return failureResult(makeFailure(code, reason))
}

function isSafeMetadata(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_METADATA_LENGTH
    && value.trim().length > 0
    && pattern.test(value)
    && !PRIVATE_CONTENT_PATTERN.test(value)
}

function isCanonicalPhaseTime(value: unknown): value is string {
  if (typeof value !== 'string' || !PHASE_TEST_TIME_PATTERN.test(value)) return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function projectStoredPhaseNote(phase: unknown, note: unknown): unknown {
  // The Windows Phase 3 checkpoint predates the strict note format. Keep its
  // original evidence in SQLite; never expose unvalidated prose to Console.
  return phase === '3' && typeof note === 'string' && !isSafeMetadata(note, PHASE_TEST_NOTE_PATTERN)
    ? 'legacy_note_redacted'
    : note
}

function validatePhaseTestRecord(value: unknown): Result<PhaseTestRecord, SqliteFailure> {
  if (!isRecordObject(value) || !hasExactKeys(value, PHASE_TEST_RECORD_KEYS)) {
    return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
  }

  try {
    const phase = value.phase
    const demoId = value.demoId
    const build = value.build
    const time = value.time
    const result = value.result
    const note = value.note
    if (phase === '0') {
      if (!isOneOf(demoId, PHASE0_DEMO_IDS)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isSafeMetadata(build, PHASE_TEST_BUILD_PATTERN)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isCanonicalPhaseTime(time)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isOneOf(result, PHASE0_RESULTS)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isSafeMetadata(note, PHASE_TEST_NOTE_PATTERN)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }

      return {
        ok: true,
        value: {
          phase,
          demoId,
          build,
          time,
          result,
          note,
        },
      }
    }

    if (phase === '1') {
      if (!isOneOf(demoId, PHASE1_DEMO_IDS)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isSafeMetadata(build, PHASE_TEST_BUILD_PATTERN)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isCanonicalPhaseTime(time)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isOneOf(result, PHASE1_RESULTS)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      if (!isSafeMetadata(note, PHASE_TEST_NOTE_PATTERN)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }

      return {
        ok: true,
        value: {
          phase,
          demoId,
          build,
          time,
          result,
          note,
        },
      }
    }

    if (phase === '2') {
      if (!isOneOf(demoId, PHASE2_DEMO_IDS)
        || !isSafeMetadata(build, PHASE_TEST_BUILD_PATTERN)
        || !isCanonicalPhaseTime(time)
        || !isOneOf(result, PHASE2_RESULTS)
        || !isSafeMetadata(note, PHASE_TEST_NOTE_PATTERN)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      return { ok: true, value: { phase, demoId, build, time, result, note } }
    }

    if (phase === '3') {
      if (!isOneOf(demoId, PHASE3_DEMO_IDS)
        || !isSafeMetadata(build, PHASE_TEST_BUILD_PATTERN)
        || !isCanonicalPhaseTime(time)
        || !isOneOf(result, PHASE3_RESULTS)
        || !isSafeMetadata(note, PHASE_TEST_NOTE_PATTERN)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      return { ok: true, value: { phase, demoId, build, time, result, note } }
    }

    if (phase === '4') {
      if (!isOneOf(demoId, PHASE4_DEMO_IDS)
        || !isSafeMetadata(build, PHASE_TEST_BUILD_PATTERN)
        || !isCanonicalPhaseTime(time)
        || !isOneOf(result, PHASE4_RESULTS)
        || !isSafeMetadata(note, PHASE_TEST_NOTE_PATTERN)) {
        return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
      }
      return { ok: true, value: { phase, demoId, build, time, result, note } }
    }

    return phaseRecordFailure('sqlite_phase_record_invalid', 'phase_invalid')
  } catch {
    return phaseRecordFailure('sqlite_phase_record_invalid', 'record_invalid')
  }
}

function clonePhaseTestRecord(record: PhaseTestRecord): PhaseTestRecord {
  return { ...record }
}

function phaseRecordReadFailure(): SqliteFailure {
  return makeFailure('sqlite_phase_record_read_failed', 'read_failed')
}

function phaseRecordWriteFailure(): SqliteFailure {
  return makeFailure('sqlite_phase_record_write_failed', 'transaction_failed')
}

function createService(
  driver: SqliteDatabaseDriver,
  telemetry: unknown,
): SqlitePhaseTestService {
  let healthState: SqliteHealth = {
    status: 'ready',
    schemaVersion: SQLITE_SCHEMA_VERSION,
    journalMode: 'wal',
    foreignKeys: true,
    integrity: 'ok',
    failure: null,
  }
  let firstCloseResult: Result<void, SqliteFailure> | null = null

  const service: SqlitePhaseTestService = {
    health() {
      return cloneHealth(healthState)
    },
    appendPhaseTestRecord(record) {
      if (firstCloseResult !== null) {
        const failure = makeFailure('sqlite_closed', 'service_closed')
        emitPhaseRecordFailure(telemetry, 'append', failure)
        return failureResult(failure)
      }

      const validation = validatePhaseTestRecord(record)
      if (!validation.ok) {
        emitPhaseRecordFailure(telemetry, 'append', validation.error)
        return validation
      }

      try {
        driver.exec(SQL.beginImmediate)
        driver.run(SQL.insertPhaseTestRecord, [
          validation.value.phase,
          validation.value.demoId,
          validation.value.build,
          validation.value.time,
          validation.value.result,
          validation.value.note,
        ])
        driver.run(SQL.prunePhaseTestRecords)
        driver.exec(SQL.commit)
        return { ok: true, value: undefined }
      } catch {
        try {
          driver.exec(SQL.rollback)
        } catch {
          // Rollback is best effort; the append failure remains primary.
        }
        const failure = phaseRecordWriteFailure()
        emitPhaseRecordFailure(telemetry, 'append', failure)
        return failureResult(failure)
      }
    },
    readPhaseTestRecords(phase) {
      if (firstCloseResult !== null) {
        const failure = makeFailure('sqlite_closed', 'service_closed')
        emitPhaseRecordFailure(telemetry, 'read', failure)
        return failureResult(failure)
      }
      if (phase !== '0' && phase !== '1' && phase !== '2' && phase !== '3' && phase !== '4') {
        const failure = makeFailure('sqlite_phase_record_invalid', 'phase_invalid')
        emitPhaseRecordFailure(telemetry, 'read', failure)
        return failureResult(failure)
      }

      let rows: readonly SqliteDatabaseRow[]
      try {
        rows = driver.all(SQL.readPhaseTestRecords, [phase])
      } catch {
        const failure = phaseRecordReadFailure()
        emitPhaseRecordFailure(telemetry, 'read', failure)
        return failureResult(failure)
      }

      if (!Array.isArray(rows) || rows.length > MAX_PHASE_TEST_RECORDS) {
        const failure = phaseRecordReadFailure()
        emitPhaseRecordFailure(telemetry, 'read', failure)
        return failureResult(failure)
      }

      try {
        const ordered: Array<{ sequence: number; record: PhaseTestRecord }> = []
        for (const row of rows) {
          if (!hasExactKeys(row, PHASE_TEST_ROW_KEYS)) {
            const failure = phaseRecordReadFailure()
            emitPhaseRecordFailure(telemetry, 'read', failure)
            return failureResult(failure)
          }
          if (
            typeof row.sequence !== 'number'
            || !Number.isSafeInteger(row.sequence)
            || row.sequence <= 0
          ) {
            const failure = phaseRecordReadFailure()
            emitPhaseRecordFailure(telemetry, 'read', failure)
            return failureResult(failure)
          }

          const recordValidation = validatePhaseTestRecord({
            phase: row.phase,
            demoId: row.demo_id,
            build: row.build,
            time: row.time,
            result: row.result,
            note: projectStoredPhaseNote(row.phase, row.note),
          })
          if (!recordValidation.ok || recordValidation.value.phase !== phase) {
            const failure = phaseRecordReadFailure()
            emitPhaseRecordFailure(telemetry, 'read', failure)
            return failureResult(failure)
          }
          ordered.push({ sequence: row.sequence, record: recordValidation.value })
        }

        ordered.sort((left, right) => right.sequence - left.sequence)
        return {
          ok: true,
          value: ordered.map(({ record }) => clonePhaseTestRecord(record)),
        }
      } catch {
        const failure = phaseRecordReadFailure()
        emitPhaseRecordFailure(telemetry, 'read', failure)
        return failureResult(failure)
      }
    },
    close() {
      if (firstCloseResult !== null) {
        return cloneCloseResult(firstCloseResult)
      }

      let closeResult: Result<void, SqliteFailure>
      try {
        driver.close()
        const closedFailure = makeFailure('sqlite_closed', 'service_closed')
        healthState = {
          ...healthState,
          status: 'failed',
          failure: closedFailure,
        }
        closeResult = { ok: true, value: undefined }
      } catch {
        const closeFailure = makeFailure('sqlite_close_failed', 'driver_close_failed')
        healthState = {
          ...healthState,
          status: 'failed',
          failure: closeFailure,
        }
        closeResult = { ok: false, error: closeFailure }
      }

      firstCloseResult = closeResult
      if (closeResult.ok) {
        emitCloseSuccess(telemetry)
      } else {
        emitCloseFailure(telemetry, 'driver_close_failed')
      }
      return cloneCloseResult(closeResult)
    },
  }

  return service
}

function failAfterOpen(
  driver: SqliteDatabaseDriver,
  telemetry: unknown,
  primaryFailure: SqliteFailure,
): Result<SqlitePhaseTestService, SqliteFailure> {
  try {
    driver.close()
  } catch {
    emitCloseFailure(telemetry, 'cleanup_close_failed')
  }

  emitOpenFailure(telemetry, primaryFailure)
  return failureResult(primaryFailure)
}

export function openSqlite(
  options: SqliteServiceOptions,
): Result<SqlitePhaseTestService, SqliteFailure> {
  const telemetry = readOption(options, 'telemetry')
  const pathResult = validateDbPath(readOption(options, 'dbPath'))
  if (!pathResult.ok) {
    emitOpenFailure(telemetry, pathResult.error)
    return pathResult
  }

  const factoryOption = readOption(options, 'driverFactory')
  if (factoryOption !== undefined && typeof factoryOption !== 'function') {
    const failure = makeFailure('sqlite_open_failed', 'driver_open_failed')
    emitOpenFailure(telemetry, failure)
    return failureResult(failure)
  }

  let driver: SqliteDatabaseDriver
  try {
    const factory = factoryOption === undefined
      ? createDefaultDriver
      : factoryOption as SqliteDatabaseDriverFactory
    const candidate = factory(pathResult.value)
    if (!isDatabaseDriver(candidate)) {
      const failure = makeFailure('sqlite_open_failed', 'driver_open_failed')
      emitOpenFailure(telemetry, failure)
      return failureResult(failure)
    }
    driver = candidate
  } catch {
    const failure = makeFailure('sqlite_open_failed', 'driver_open_failed')
    emitOpenFailure(telemetry, failure)
    return failureResult(failure)
  }

  if (!validateForeignKeys(driver)) {
    return failAfterOpen(
      driver,
      telemetry,
      makeFailure('sqlite_foreign_keys_failed', 'foreign_keys_not_enabled'),
    )
  }

  if (!validateJournalMode(driver)) {
    return failAfterOpen(
      driver,
      telemetry,
      makeFailure('sqlite_journal_mode_failed', 'journal_mode_not_wal'),
    )
  }

  let initialSchema: Result<ValidatedSchema, SqliteFailure>
  try {
    initialSchema = inspectSchema(driver)
  } catch {
    initialSchema = failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
  }
  if (!initialSchema.ok) {
    return failAfterOpen(driver, telemetry, initialSchema.error)
  }

  if (initialSchema.value.needsMigration) {
    const migration = applyMigrations(driver, initialSchema.value.version)
    if (!migration.ok) {
      emitMigrationFailure(telemetry)
      return failAfterOpen(driver, telemetry, migration.error)
    }
    emitMigrationSuccess(telemetry)

    let committedSchema: Result<ValidatedSchema, SqliteFailure>
    try {
      committedSchema = inspectSchema(driver)
    } catch {
      committedSchema = failureResult(makeFailure('sqlite_schema_invalid', 'schema_object_invalid'))
    }
    if (!committedSchema.ok) {
      return failAfterOpen(driver, telemetry, committedSchema.error)
    }
    if (
      !committedSchema.value.present
      || committedSchema.value.version !== SQLITE_SCHEMA_VERSION
      || committedSchema.value.needsMigration
    ) {
      return failAfterOpen(
        driver,
        telemetry,
        makeFailure('sqlite_schema_invalid', 'schema_rows_invalid'),
      )
    }
  } else if (
    !initialSchema.value.present
    || initialSchema.value.version !== SQLITE_SCHEMA_VERSION
  ) {
    return failAfterOpen(
      driver,
      telemetry,
      makeFailure('sqlite_schema_invalid', 'schema_rows_invalid'),
    )
  }

  if (!validateIntegrity(driver)) {
    emitIntegrityFailure(telemetry)
    return failAfterOpen(
      driver,
      telemetry,
      makeFailure('sqlite_integrity_failed', 'integrity_check_not_ok'),
    )
  }
  emitIntegritySuccess(telemetry)

  const service = createService(driver, telemetry)
  emitOpenSuccess(telemetry)
  return { ok: true, value: service }
}
