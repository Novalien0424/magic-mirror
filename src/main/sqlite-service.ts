import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { isAbsolute } from 'node:path'

import type { Result } from '../shared/types'
import type { Telemetry } from './telemetry'

export const SQLITE_SCHEMA_VERSION = 1 as const

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

const BASELINE_DDL =
  'CREATE TABLE app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)'
const BASELINE_DDL_WITH_IF_NOT_EXISTS =
  'CREATE TABLE IF NOT EXISTS app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)'
const BASELINE_NAME = 'foundation_baseline'

const SQL = {
  foreignKeysOn: 'PRAGMA foreign_keys = ON',
  foreignKeys: 'PRAGMA foreign_keys',
  journalModeWal: 'PRAGMA journal_mode = WAL',
  tableInfo: "PRAGMA table_info('app_migrations')",
  indexList: "PRAGMA index_list('app_migrations')",
  foreignKeyList: "PRAGMA foreign_key_list('app_migrations')",
  master: "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name = 'app_migrations'",
  migrations: 'SELECT version, name FROM app_migrations ORDER BY version ASC',
  createBaseline: BASELINE_DDL_WITH_IF_NOT_EXISTS,
  insertBaseline: 'INSERT INTO app_migrations (version, name) VALUES (?, ?)',
  integrityCheck: 'PRAGMA integrity_check',
  beginImmediate: 'BEGIN IMMEDIATE',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
} as const

const EXPECTED_MIGRATIONS = [
  { version: SQLITE_SCHEMA_VERSION, name: BASELINE_NAME },
] as const

const BASELINE_DDL_NORMALIZED = normalizeSql(BASELINE_DDL)
const BASELINE_MASTER_KEYS = ['type', 'name', 'tbl_name', 'sql'] as const
const BASELINE_COLUMN_KEYS = ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'] as const
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
    reason: 'schema_version=1;foreign_keys=on;journal_mode=wal;integrity=ok',
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
    reason: 'version=1;name=foundation_baseline',
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

  return {
    ok: true,
    value: {
      present: true,
      version: rowResult.value,
      needsMigration: rowResult.value === null,
    },
  }
}

function applyBaselineMigration(driver: SqliteDatabaseDriver): Result<void, SqliteFailure> {
  try {
    driver.exec(SQL.beginImmediate)
    driver.exec(SQL.createBaseline)
    driver.run(SQL.insertBaseline, [SQLITE_SCHEMA_VERSION, BASELINE_NAME])
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

function createService(
  driver: SqliteDatabaseDriver,
  telemetry: unknown,
): SqliteService {
  let healthState: SqliteHealth = {
    status: 'ready',
    schemaVersion: SQLITE_SCHEMA_VERSION,
    journalMode: 'wal',
    foreignKeys: true,
    integrity: 'ok',
    failure: null,
  }
  let firstCloseResult: Result<void, SqliteFailure> | null = null

  const service: SqliteService = {
    health() {
      return cloneHealth(healthState)
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
): Result<SqliteService, SqliteFailure> {
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
): Result<SqliteService, SqliteFailure> {
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
    const migration = applyBaselineMigration(driver)
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
