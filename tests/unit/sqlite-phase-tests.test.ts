import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bootSequence } from '../../src/main/boot'
import {
  openSqlite,
  SQLITE_SCHEMA_VERSION,
  type SqliteDatabaseDriver,
  type SqliteDatabaseDriverFactory,
  type SqliteService,
  type SqliteServiceOptions,
} from '../../src/main/sqlite-service'
import type { PhaseTestRecord } from '../../src/shared/console-types'
import type { Result } from '../../src/shared/types'

const BASELINE_DDL =
  'CREATE TABLE app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)'
const BASELINE_ROW = { version: 1, name: 'foundation_baseline' } as const
const V2_PHASE_TEST_MIGRATION_ROW = { version: 2, name: 'phase_test_records' } as const
const V3_PHASE_TEST_MIGRATION_ROW = { version: 3, name: 'phase_test_records_v3' } as const
const V4_PHASE_TEST_MIGRATION_ROW = { version: 4, name: 'phase_test_records_v4' } as const
const V5_PHASE_TEST_MIGRATION_ROW = { version: 5, name: 'phase_test_records_v5' } as const
const V2_PHASE_TEST_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase = '0'), demo_id TEXT NOT NULL CHECK (demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'mock_passed')), note TEXT NOT NULL)"
const V4_PHASE_TEST_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const V5_PHASE_TEST_DDL =
  "CREATE TABLE phase_test_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL CHECK (phase IN ('0', '1', '2', '3')), demo_id TEXT NOT NULL CHECK ((phase = '0' AND demo_id IN ('P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5')) OR (phase = '1' AND demo_id IN ('P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6')) OR (phase = '2' AND demo_id IN ('P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5')) OR (phase = '3' AND demo_id IN ('P3-D1', 'P3-D2', 'P3-D3', 'P3-D4'))), build TEXT NOT NULL, time TEXT NOT NULL, result TEXT NOT NULL CHECK ((phase = '0' AND result IN ('passed', 'failed', 'mock_passed')) OR (phase IN ('1', '2', '3') AND result IN ('passed', 'failed', 'mock_passed', 'not_executed'))), note TEXT NOT NULL)"
const FIXED_TIME = '2026-08-19T00:00:00.000Z'
const DEMO_IDS = ['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'] as const
const PHASE1_DEMO_IDS = ['P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6'] as const
const RESULT_VALUES = ['passed', 'failed', 'mock_passed'] as const
const PHASE1_RESULT_VALUES = ['passed', 'failed', 'mock_passed', 'not_executed'] as const
const MAX_METADATA_LENGTH = 2048

const SYNTHETIC_PRIVATE_MARKER = 'synthetic-private-marker'
const SYNTHETIC_DRIVER_FAILURE = 'synthetic-driver-failure'

type Phase0TestRecord = Extract<PhaseTestRecord, { phase: '0' }>
type Phase1TestRecord = Extract<PhaseTestRecord, { phase: '1' }>
type Phase2TestRecord = Extract<PhaseTestRecord, { phase: '2' }>
type Phase3TestRecord = Extract<PhaseTestRecord, { phase: '3' }>

type PhaseTestFailure = {
  readonly code: string
  readonly reason: string
}

type PhaseTestService = SqliteService & {
  appendPhaseTestRecord(record: unknown): Result<void, PhaseTestFailure>
  readPhaseTestRecords(
    phase: unknown,
  ): Result<readonly PhaseTestRecord[], PhaseTestFailure>
}

type PhaseDriverFailure = 'migration-copy' | 'insert' | 'prune' | 'commit'
type PhaseDriverOperation = 'begin' | 'migration-copy' | 'insert' | 'prune' | 'commit' | 'rollback'

interface PhaseDriverHarness {
  readonly factory: SqliteDatabaseDriverFactory
  readonly operations: PhaseDriverOperation[]
  arm(): void
}

interface TestTelemetry {
  readonly events: unknown[]
  readonly readPage: ReturnType<typeof vi.fn>
  readonly emit: ReturnType<typeof vi.fn>
  readonly flush: ReturnType<typeof vi.fn>
  readonly close: ReturnType<typeof vi.fn>
  readonly telemetry: SqliteServiceOptions['telemetry']
}

interface OpenPhaseService {
  readonly result: Result<SqliteService, PhaseTestFailure>
  readonly service: PhaseTestService | null
  readonly telemetry: TestTelemetry
}

interface BootSqliteFake extends PhaseTestService {
  readonly readCalls: string[]
  readonly closeCalls: number
}

const activeServices: SqliteService[] = []
const temporaryDirectories: string[] = []

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

function isSqlInputValue(value: unknown): value is SQLInputValue {
  return value === null
    || typeof value === 'number'
    || typeof value === 'bigint'
    || typeof value === 'string'
    || ArrayBuffer.isView(value)
}

function toSqlInputValues(params: readonly unknown[] | undefined): SQLInputValue[] {
  return (params === undefined ? [] : [...params]).map((value) => {
    if (!isSqlInputValue(value)) {
      throw new TypeError('sqlite_input_invalid')
    }
    return value
  })
}

function makeTelemetry(): TestTelemetry {
  const events: unknown[] = []
  const readPage = vi.fn(() => ({ events: [], nextBeforeSequence: null }))
  const emit = vi.fn((event: unknown) => events.push(event))
  const flush = vi.fn(async () => {})
  const close = vi.fn(async () => {})
  const telemetry = {
    emit,
    readPage,
    getStats: () => ({
      telemetryDroppedCount: 0,
      ramEvictedCount: 0,
      rejectedEventCount: 0,
      extraFieldStrippedCount: 0,
      writerFailureCount: 0,
      rotationFailureCount: 0,
      schedulerFailureCount: 0,
      ramEventCount: events.length,
      queueDepth: 0,
      closed: false,
    }),
    flush,
    close,
  }

  return {
    events,
    readPage,
    emit,
    flush,
    close,
    telemetry: telemetry as unknown as SqliteServiceOptions['telemetry'],
  }
}

async function makeTemporaryDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-task10a-'))
  temporaryDirectories.push(directory)
  return join(directory, 'mirror.sqlite')
}

function queryAll(
  database: DatabaseSync,
  sql: string,
): Array<Record<string, unknown>> {
  return database.prepare(sql).all() as Array<Record<string, unknown>>
}

function inspectDatabase(
  dbPath: string,
): {
  readonly objects: Array<Record<string, unknown>>
  readonly migrations: Array<Record<string, unknown>>
  readonly phaseTable: Record<string, unknown> | undefined
  readonly phaseColumns: Array<Record<string, unknown>>
  readonly phaseRows: Array<Record<string, unknown>>
} {
  const database = new DatabaseSync(dbPath)
  try {
    const phaseTable = database.prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name = 'phase_test_records'",
    ).get() as Record<string, unknown> | undefined
    return {
      objects: queryAll(
        database,
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name ASC",
      ),
      migrations: queryAll(
        database,
        'SELECT version, name FROM app_migrations ORDER BY version ASC',
      ),
      phaseTable,
      phaseColumns: phaseTable === undefined
        ? []
        : queryAll(database, "PRAGMA table_info('phase_test_records')"),
      phaseRows: phaseTable === undefined
        ? []
        : queryAll(
          database,
          'SELECT sequence, phase, demo_id, build, time, result, note FROM phase_test_records ORDER BY sequence ASC',
        ),
    }
  } finally {
    database.close()
  }
}

async function seedMigrationHistory(
  kind: 'v1' | 'malformed' | 'gap' | 'future',
): Promise<string> {
  const dbPath = await makeTemporaryDatabasePath()
  const database = new DatabaseSync(dbPath)
  try {
    if (kind === 'malformed') {
      database.exec(
        'CREATE TABLE app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL, extra TEXT NOT NULL)',
      )
      return dbPath
    }

    database.exec(BASELINE_DDL)
    const insert = database.prepare('INSERT INTO app_migrations (version, name) VALUES (?, ?)')
    if (kind === 'v1') {
      insert.run(BASELINE_ROW.version, BASELINE_ROW.name)
    } else if (kind === 'gap') {
      insert.run(1, BASELINE_ROW.name)
      insert.run(3, V3_PHASE_TEST_MIGRATION_ROW.name)
    } else {
      insert.run(6, 'future_migration')
    }
    return dbPath
  } finally {
    database.close()
  }
}

async function seedExactV2PhaseDatabase(
  rows: readonly { readonly sequence: number; readonly record: Phase0TestRecord }[],
): Promise<string> {
  const dbPath = await makeTemporaryDatabasePath()
  const database = new DatabaseSync(dbPath)
  try {
    database.exec(BASELINE_DDL)
    database.exec(V2_PHASE_TEST_DDL)
    const insertMigration = database.prepare('INSERT INTO app_migrations (version, name) VALUES (?, ?)')
    insertMigration.run(BASELINE_ROW.version, BASELINE_ROW.name)
    insertMigration.run(V2_PHASE_TEST_MIGRATION_ROW.version, V2_PHASE_TEST_MIGRATION_ROW.name)

    const insertRecord = database.prepare(
      'INSERT INTO phase_test_records (sequence, phase, demo_id, build, time, result, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of rows) {
      insertRecord.run(
        row.sequence,
        row.record.phase,
        row.record.demoId,
        row.record.build,
        row.record.time,
        row.record.result,
        row.record.note,
      )
    }
    return dbPath
  } finally {
    database.close()
  }
}

function phaseOperation(sql: string): PhaseDriverOperation | null {
  const statement = normalizeSql(sql)
  if (statement === 'begin immediate') return 'begin'
  if (statement === 'commit') return 'commit'
  if (statement === 'rollback') return 'rollback'
  if (statement.includes('phase_test_records') && statement.includes(' select ')) return 'migration-copy'
  if (statement.includes('insert into phase_test_records')) return 'insert'
  if (statement.includes('delete from phase_test_records')) return 'prune'
  return null
}

function makePhaseDriverHarness(
  failure: PhaseDriverFailure | undefined = undefined,
): PhaseDriverHarness {
  const operations: PhaseDriverOperation[] = []
  let armed = false
  let database: DatabaseSync | null = null

  function execute(
    sql: string,
    operation: PhaseDriverOperation | null,
  ): void {
    if (operation !== null) {
      operations.push(operation)
      if (armed && operation === failure) {
        throw new Error(SYNTHETIC_DRIVER_FAILURE)
      }
    }
    if (database === null) throw new Error('driver_not_open')
    database.exec(sql)
  }

  function statement(sql: string): ReturnType<DatabaseSync['prepare']> {
    if (database === null) throw new Error('driver_not_open')
    return database.prepare(sql)
  }

  const driver: SqliteDatabaseDriver = {
    exec(sql) {
      execute(sql, phaseOperation(sql))
    },
    get(sql, params) {
      const values = toSqlInputValues(params)
      return statement(sql).get(...values) as Record<string, unknown> | undefined
    },
    all(sql, params) {
      const values = toSqlInputValues(params)
      return statement(sql).all(...values) as readonly Record<string, unknown>[]
    },
    run(sql, params) {
      const operation = phaseOperation(sql)
      if (operation !== null) {
        operations.push(operation)
        if (armed && operation === failure) {
          throw new Error(SYNTHETIC_DRIVER_FAILURE)
        }
      }
      const values = toSqlInputValues(params)
      statement(sql).run(...values)
    },
    close() {
      if (database !== null) {
        database.close()
        database = null
      }
    },
  }

  return {
    factory: (dbPath) => {
      database = new DatabaseSync(dbPath)
      return driver
    },
    operations,
    arm() {
      armed = true
    },
  }
}

function openPhaseService(
  dbPath: string,
  driverFactory?: SqliteDatabaseDriverFactory,
): OpenPhaseService {
  const telemetry = makeTelemetry()
  const options: SqliteServiceOptions = {
    dbPath,
    telemetry: telemetry.telemetry,
    ...(driverFactory === undefined ? {} : { driverFactory }),
  }
  const result = openSqlite(options) as Result<SqliteService, PhaseTestFailure>
  if (result.ok) activeServices.push(result.value)
  return {
    result,
    service: result.ok ? result.value as PhaseTestService : null,
    telemetry,
  }
}

function requireService(result: OpenPhaseService): PhaseTestService {
  expect(result.result.ok).toBe(true)
  if (!result.result.ok || result.service === null) {
    throw new Error('expected open phase-test service')
  }
  return result.service
}

function requireFailure(value: unknown): PhaseTestFailure {
  expect(value).toMatchObject({ ok: false })
  if (
    typeof value !== 'object'
    || value === null
    || (value as { ok?: unknown }).ok !== false
  ) {
    throw new Error('expected a stable failure result')
  }

  const error = (value as { error?: unknown }).error
  expect(error).toMatchObject({ code: expect.any(String), reason: expect.any(String) })
  if (typeof error !== 'object' || error === null) {
    throw new Error('expected a stable failure object')
  }
  const typed = error as PhaseTestFailure
  expect(Object.keys(typed).sort()).toEqual(['code', 'reason'])
  expect(typed.code).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
  expect(typed.reason).toMatch(/^[a-z][a-z0-9_=;.%:+,/?-]{0,1023}$/)
  return typed
}

function expectNoPrivateContent(value: unknown): void {
  const serialized = JSON.stringify(value) ?? ''
  expect(serialized).not.toContain(SYNTHETIC_PRIVATE_MARKER)
  expect(serialized).not.toContain(SYNTHETIC_DRIVER_FAILURE)
  expect(serialized).not.toMatch(/(?:guest|candidate|profile|credential|transcript|audio|embedding|memory)/i)
}

function expectRecordShape(value: unknown): asserts value is Phase0TestRecord {
  expect(value).toBeTypeOf('object')
  if (typeof value !== 'object' || value === null) {
    throw new Error('expected a phase-test record')
  }
  expect(Object.keys(value).sort()).toEqual(['build', 'demoId', 'note', 'phase', 'result', 'time'])
  const record = value as Record<string, unknown>
  expect(record.phase).toBe('0')
  expect(DEMO_IDS).toContain(record.demoId)
  expect(RESULT_VALUES).toContain(record.result)
  expect(record.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  expect(new Date(record.time as string).toISOString()).toBe(record.time)
  expect(record.build).toMatch(/^[A-Za-z0-9._:+/-]{1,2048}$/)
  expect(record.note).toMatch(/^[A-Za-z0-9_=;.%:+,/?-]{1,2048}$/)
  expectNoPrivateContent(value)
}

function validRecord(overrides: Partial<Phase0TestRecord> = {}): Phase0TestRecord {
  return {
    phase: '0',
    demoId: 'P0-D1',
    build: 'build-abc123',
    time: FIXED_TIME,
    result: 'passed',
    note: 'phase-check',
    ...overrides,
  }
}

function validPhase1Record(overrides: Partial<Phase1TestRecord> = {}): Phase1TestRecord {
  return {
    phase: '1',
    demoId: 'P1-D1',
    build: 'phase1-build-abc123',
    time: FIXED_TIME,
    result: 'passed',
    note: 'phase1-check',
    ...overrides,
  }
}

function validPhase2Record(overrides: Partial<Phase2TestRecord> = {}): Phase2TestRecord {
  return {
    phase: '2', demoId: 'P2-D1', build: 'phase2-build-abc123', time: FIXED_TIME,
    result: 'not_executed', note: 'phase2-check', ...overrides,
  }
}

async function seedExactV4PhaseDatabase(
  rows: readonly { readonly sequence: number; readonly record: PhaseTestRecord }[],
): Promise<string> {
  const dbPath = await makeTemporaryDatabasePath()
  const database = new DatabaseSync(dbPath)
  try {
    database.exec(BASELINE_DDL)
    database.exec(V4_PHASE_TEST_DDL)
    const insertMigration = database.prepare('INSERT INTO app_migrations (version, name) VALUES (?, ?)')
    for (const migration of [
      BASELINE_ROW,
      V2_PHASE_TEST_MIGRATION_ROW,
      V3_PHASE_TEST_MIGRATION_ROW,
      V4_PHASE_TEST_MIGRATION_ROW,
    ]) {
      insertMigration.run(migration.version, migration.name)
    }
    const insertRecord = database.prepare(
      'INSERT INTO phase_test_records (sequence, phase, demo_id, build, time, result, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const { sequence, record } of rows) {
      insertRecord.run(
        sequence,
        record.phase,
        record.demoId,
        record.build,
        record.time,
        record.result,
        record.note,
      )
    }
    return dbPath
  } finally {
    database.close()
  }
}

function validPhase3Record(overrides: Partial<Phase3TestRecord> = {}): Phase3TestRecord {
  return {
    phase: '3', demoId: 'P3-D1', build: 'phase3-build-abc123', time: FIXED_TIME,
    result: 'not_executed', note: 'phase3-check', ...overrides,
  }
}

function readRecordsForPhase(
  service: PhaseTestService,
  phase: '0',
): readonly Phase0TestRecord[]
function readRecordsForPhase(
  service: PhaseTestService,
  phase: '1',
): readonly Phase1TestRecord[]
function readRecordsForPhase(
  service: PhaseTestService,
  phase: '2',
): readonly Phase2TestRecord[]
function readRecordsForPhase(
  service: PhaseTestService,
  phase: '3',
): readonly Phase3TestRecord[]
function readRecordsForPhase(
  service: PhaseTestService,
  phase: '0' | '1' | '2' | '3',
): readonly PhaseTestRecord[] {
  const result = service.readPhaseTestRecords(phase)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('expected phase-test records')
  return result.value
}

function readRecords(service: PhaseTestService): readonly Phase0TestRecord[] {
  return readRecordsForPhase(service, '0')
}

function makeBootActor(): Record<string, unknown> {
  let state = 'starting'
  const listeners = new Set<(snapshot: unknown) => void>()
  const context = {
    activationId: null,
    realtimeSessionId: null,
    sessionGeneration: 0,
    activeProfileId: null,
    lastInteractionAt: null,
    sceneInvocationId: null,
  }
  const notify = (): void => {
    for (const listener of listeners) {
      listener({ state, context: { ...context } })
    }
  }

  return {
    send(event: unknown) {
      if (typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'LOCAL_READY') {
        state = 'dormant'
        notify()
      }
    },
    getState: () => state,
    getContext: () => ({ ...context }),
    subscribe(listener: (snapshot: unknown) => void) {
      listeners.add(listener)
      return { unsubscribe: () => listeners.delete(listener) }
    },
  }
}

function makeBootOptions(
  sqliteService: unknown,
  telemetry: TestTelemetry,
): Record<string, unknown> {
  const config = {
    active: { configVersion: 1 },
    draft: { configVersion: 1 },
    previous: { configVersion: 1 },
  }
  const actor = makeBootActor()
  const moduleSnapshot = {}
  return {
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    createTelemetry: () => telemetry,
    configService: {
      initialize: async () => config,
      read: async () => config,
    },
    resolveModelSettings: () => ({
      active: { configVersion: 1 },
      draft: { configVersion: 1 },
      previous: { configVersion: 1 },
    }),
    openSqlite: () => sqliteService,
    createMockModuleFactory: () => ({
      create: (id: string) => ({
        id,
        initialStatus: 'not_implemented',
        probe: () => 'success',
        setOutcome: () => {},
      }),
    }),
    createModuleRegistry: () => ({
      snapshot: () => moduleSnapshot,
      probe: async (module: string) => ({
        module,
        eventDelivery: 'emitted',
        kind: 'missing',
        status: 'not_implemented',
        opStatus: 'info',
        reason: 'module_missing',
        errorCode: 'module_adapter_missing',
      }),
    }),
    createLifecycleActor: () => actor,
    now: () => FIXED_TIME,
  }
}

function makeBootSqliteFake(record: Phase0TestRecord): BootSqliteFake {
  const readCalls: string[] = []
  let closeCalls = 0
  const service = {
    health: () => ({
      status: 'ready',
      schemaVersion: SQLITE_SCHEMA_VERSION,
      journalMode: 'wal',
      foreignKeys: true,
      integrity: 'ok',
      failure: null,
    }),
    appendPhaseTestRecord: () => ({ ok: true, value: undefined }),
    readPhaseTestRecords: (phase: unknown) => {
      readCalls.push(String(phase))
      return { ok: true, value: [record] }
    },
    close: () => {
      closeCalls += 1
      return { ok: true, value: undefined }
    },
    get readCalls() {
      return readCalls
    },
    get closeCalls() {
      return closeCalls
    },
  }
  return service as unknown as BootSqliteFake
}

type MainIndexHandler = (...args: unknown[]) => unknown

interface DeferredShutdown {
  readonly promise: Promise<void>
  resolve(): void
}

function makeDeferredShutdown(): DeferredShutdown {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: () => resolvePromise?.(),
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function stubImmediateMarkerFlush(): ReturnType<typeof vi.spyOn> {
  const stdoutWrite = vi.spyOn(process.stdout, 'write')
  stdoutWrite.mockImplementation((...args: Parameters<typeof process.stdout.write>) => {
    const callback = args.find((value) => typeof value === 'function')
    if (typeof callback === 'function') callback()
    return true
  })
  return stdoutWrite
}

function defineSyntheticResourcesPath(): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
  Object.defineProperty(process, 'resourcesPath', {
    configurable: true,
    enumerable: originalDescriptor?.enumerable ?? false,
    writable: true,
    value: 'C:\\synthetic-resources',
  })

  return () => {
    if (originalDescriptor === undefined) {
      Reflect.deleteProperty(process, 'resourcesPath')
      return
    }
    Object.defineProperty(process, 'resourcesPath', originalDescriptor)
  }
}

function makeMainIndexHarness(options: {
  readonly smoke?: boolean
  readonly crashGiveUp?: boolean
  readonly userData?: string
} = {}) {
  const userData = options.userData ?? 'C:\\synthetic-user-data'
  const appHandlers = new Map<string, MainIndexHandler>()
  const bootCalls: unknown[] = []
  const deferredShutdown = makeDeferredShutdown()
  const shutdown = vi.fn(() => deferredShutdown.promise)
  const windows: Array<{ readonly webContents: unknown }> = []
  const runtime = {
    ready: Promise.resolve(),
    telemetry: { emit: vi.fn() },
    console: {},
    snapshot: () => ({
      lifecycle: 'starting',
      appVersion: 'synthetic',
      buildCommit: 'synthetic',
      configVersion: null,
      modules: {},
      identityStatus: 'unassigned',
      realtimeSessionId: null,
      sessionGeneration: 0,
      lastError: null,
      maintenance: null,
    }),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    handleSimulator: vi.fn(),
    setAvatarRuntimeStatus: vi.fn(() => Promise.resolve()),
    shutdown,
  }

  class FakeBrowserWindow {
    readonly webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
      loadFile: vi.fn(() => Promise.resolve()),
      forcefullyCrashRenderer: vi.fn(),
    }
    private destroyed = false
    private visible = false

    constructor(_windowOptions: unknown) {
      windows.push(this)
    }

    once(_event: string, _listener: (...args: unknown[]) => unknown): void {}
    loadURL(_url: string): Promise<void> { return Promise.resolve() }
    loadFile(_file: string): Promise<void> { return Promise.resolve() }
    isDestroyed(): boolean { return this.destroyed }
    isVisible(): boolean { return this.visible }
    show(): void { this.visible = true }
    hide(): void { this.visible = false }
    focus(): void {}
    maximize(): void {}
    setSimpleFullScreen(_value: boolean): void {}
    destroy(): void { this.destroyed = true }
  }

  const app = {
    commandLine: { appendSwitch: vi.fn() },
    whenReady: vi.fn(() => Promise.resolve()),
    getPath: vi.fn((_name: string) => userData),
    getAppPath: vi.fn(() => resolve(__dirname, '../..')),
    getVersion: vi.fn(() => 'synthetic-version'),
    isPackaged: false,
    on: vi.fn((event: string, handler: MainIndexHandler) => {
      appHandlers.set(event, handler)
    }),
    exit: vi.fn(),
    quit: vi.fn(),
  }
  const globalShortcut = {
    register: vi.fn(() => true),
    unregisterAll: vi.fn(),
  }
  const electron = {
    app,
    BrowserWindow: FakeBrowserWindow,
    globalShortcut,
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1280, height: 800 },
      })),
      getAllDisplays: vi.fn(() => [{
        id: 1,
        bounds: { x: 0, y: 0, width: 1280, height: 800 },
      }]),
    },
    powerSaveBlocker: {
      start: vi.fn(() => 1),
      isStarted: vi.fn(() => true),
      stop: vi.fn(),
    },
  }

  vi.doMock('electron', () => electron)
  vi.doMock('../../src/main/boot', () => ({
    bootSequence: vi.fn((bootOptions: unknown) => {
      bootCalls.push(bootOptions)
      return runtime
    }),
  }))
  vi.doMock('../../src/main/ipc', () => ({
    publishSnapshot: vi.fn(),
    registerIpcHandlers: vi.fn(),
  }))
  vi.doMock('../../src/main/display-sleep-blocker', () => ({
    createDisplaySleepBlocker: () => ({ start: vi.fn(), stop: vi.fn() }),
  }))
  vi.doMock('../../src/main/crash-recovery', () => ({
    createCrashRecovery: () => ({
      decide: () => options.crashGiveUp === true
        ? { action: 'give_up', attempt: 1, reason: 'crash_limit' }
        : { action: 'ignore' },
    }),
  }))
  vi.doMock('../../src/main/log', () => ({
    marker: vi.fn(),
    formatMarker: vi.fn(() => ''),
  }))
  vi.doMock('../../src/main/smoke', () => ({
    parseSmokeMode: vi.fn(() => options.smoke === true
      ? { kind: 'on', ms: 1, raw: '1' }
      : { kind: 'off', raw: '' }),
    evaluateSmoke: vi.fn(() => ({ exitCode: 2, reason: 'criteria_unmet' })),
  }))

  return {
    app,
    appHandlers,
    bootCalls,
    deferredShutdown,
    globalShortcut,
    runtime,
    shutdown,
    windows,
  }
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

  vi.resetModules()
})

describe('Phase 0 Task 10A authoritative SQLite phase-test records', () => {
  it('uses schema v5, applies ordered migrations, and creates the exact phase table contract', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const opened = openPhaseService(dbPath)
    const service = requireService(opened)

    expect(SQLITE_SCHEMA_VERSION).toBe(5)
    expect(service.health().schemaVersion).toBe(5)
    expect(inspectDatabase(dbPath).migrations).toEqual([
      BASELINE_ROW,
      V2_PHASE_TEST_MIGRATION_ROW,
      V3_PHASE_TEST_MIGRATION_ROW,
      V4_PHASE_TEST_MIGRATION_ROW,
      V5_PHASE_TEST_MIGRATION_ROW,
    ])

    const snapshot = inspectDatabase(dbPath)
    expect(snapshot.objects.map((row) => row.name)).toEqual([
      'app_migrations',
      'phase_test_records',
    ])
    expect(snapshot.phaseTable).toMatchObject({
      type: 'table',
      name: 'phase_test_records',
      tbl_name: 'phase_test_records',
    })
    if (snapshot.phaseTable === undefined) return

    expect(snapshot.phaseColumns.map((row) => row.name)).toEqual([
      'sequence',
      'phase',
      'demo_id',
      'build',
      'time',
      'result',
      'note',
    ])
    expect(snapshot.phaseColumns.map((row) => row.type)).toEqual([
      'INTEGER',
      'TEXT',
      'TEXT',
      'TEXT',
      'TEXT',
      'TEXT',
      'TEXT',
    ])

    const ddl = normalizeSql(String(snapshot.phaseTable.sql))
    expect(ddl).toBe(normalizeSql(V5_PHASE_TEST_DDL))
    expect(ddl).toContain("check (phase in ('0', '1', '2', '3'))")
    expect(ddl).toContain("phase = '3'")
    expect(snapshot.objects.some((row) => String(row.name).includes('temp'))).toBe(false)
    expectNoPrivateContent(snapshot)
  })

  it('migrates an existing v1 database in place without replacing its path or history', async () => {
    const dbPath = await seedMigrationHistory('v1')
    const opened = openPhaseService(dbPath)
    const service = requireService(opened)

    expect(service.health().schemaVersion).toBe(5)
    expect(inspectDatabase(dbPath).migrations).toEqual([
      BASELINE_ROW,
      V2_PHASE_TEST_MIGRATION_ROW,
      V3_PHASE_TEST_MIGRATION_ROW,
      V4_PHASE_TEST_MIGRATION_ROW,
      V5_PHASE_TEST_MIGRATION_ROW,
    ])
    expect(inspectDatabase(dbPath).phaseTable).toBeDefined()
    expectNoPrivateContent(opened.telemetry.events)
  })

  it('migrates an exact v2 database while preserving nonconsecutive sequences, append order, and reopen state', async () => {
    const firstSeed = {
      sequence: 2,
      record: validRecord({
        demoId: 'P0-D2',
        build: 'v2-build-sequence-2',
        note: 'v2-sequence-2',
      }),
    } as const
    const secondSeed = {
      sequence: 9,
      record: validRecord({
        demoId: 'P0-D3',
        build: 'v2-build-sequence-9',
        result: 'failed',
        note: 'v2-sequence-9',
      }),
    } as const
    const dbPath = await seedExactV2PhaseDatabase([firstSeed, secondSeed])

    const seededSnapshot = inspectDatabase(dbPath)
    expect(seededSnapshot.migrations).toEqual([
      BASELINE_ROW,
      V2_PHASE_TEST_MIGRATION_ROW,
    ])
    expect(normalizeSql(String(seededSnapshot.phaseTable?.sql))).toBe(normalizeSql(V2_PHASE_TEST_DDL))

    const opened = openPhaseService(dbPath)
    const service = requireService(opened)
    expect(service.health().schemaVersion).toBe(5)
    expect(inspectDatabase(dbPath).phaseRows).toEqual([
      {
        sequence: 2,
        phase: '0',
        demo_id: 'P0-D2',
        build: 'v2-build-sequence-2',
        time: FIXED_TIME,
        result: 'passed',
        note: 'v2-sequence-2',
      },
      {
        sequence: 9,
        phase: '0',
        demo_id: 'P0-D3',
        build: 'v2-build-sequence-9',
        time: FIXED_TIME,
        result: 'failed',
        note: 'v2-sequence-9',
      },
    ])
    expect(readRecords(service)).toEqual([secondSeed.record, firstSeed.record])

    const appended = validRecord({
      demoId: 'P0-D4',
      build: 'v3-build-after-copy',
      note: 'v3-after-copy',
    })
    expect(service.appendPhaseTestRecord(appended)).toEqual({ ok: true, value: undefined })
    const afterAppend = inspectDatabase(dbPath)
    expect(afterAppend.phaseRows.at(-1)).toEqual({
      sequence: 10,
      phase: '0',
      demo_id: 'P0-D4',
      build: 'v3-build-after-copy',
      time: FIXED_TIME,
      result: 'passed',
      note: 'v3-after-copy',
    })
    expect(afterAppend.migrations).toEqual([
      BASELINE_ROW,
      V2_PHASE_TEST_MIGRATION_ROW,
      V3_PHASE_TEST_MIGRATION_ROW,
      V4_PHASE_TEST_MIGRATION_ROW,
      V5_PHASE_TEST_MIGRATION_ROW,
    ])

    const beforeReopen = inspectDatabase(dbPath)
    expect(service.close()).toEqual({ ok: true, value: undefined })
    const reopened = requireService(openPhaseService(dbPath))
    expect(reopened.health().schemaVersion).toBe(5)
    expect(inspectDatabase(dbPath)).toEqual(beforeReopen)
    expect(readRecords(reopened)).toEqual([appended, secondSeed.record, firstSeed.record])
    expectNoPrivateContent(beforeReopen)
    expectNoPrivateContent(opened.telemetry.events)
  })

  it('rolls back an injected v3 copy failure with the exact v2 rows and schema intact', async () => {
    const firstSeed = {
      sequence: 3,
      record: validRecord({ demoId: 'P0-D1', build: 'v2-copy-build-3', note: 'v2-copy-3' }),
    } as const
    const secondSeed = {
      sequence: 8,
      record: validRecord({ demoId: 'P0-D5', build: 'v2-copy-build-8', note: 'v2-copy-8' }),
    } as const
    const dbPath = await seedExactV2PhaseDatabase([firstSeed, secondSeed])
    const before = inspectDatabase(dbPath)
    const harness = makePhaseDriverHarness('migration-copy')
    harness.arm()

    const opened = openPhaseService(dbPath, harness.factory)

    expect(opened.result).toEqual({
      ok: false,
      error: { code: 'sqlite_migration_failed', reason: 'migration_transaction_failed' },
    })
    expect(harness.operations).toContain('begin')
    expect(harness.operations).toContain('migration-copy')
    expect(harness.operations).toContain('rollback')
    expect(harness.operations).not.toContain('commit')

    const after = inspectDatabase(dbPath)
    expect(after).toEqual(before)
    expect(after.migrations).toEqual([
      BASELINE_ROW,
      V2_PHASE_TEST_MIGRATION_ROW,
    ])
    expect(after.objects.map((row) => row.name)).toEqual([
      'app_migrations',
      'phase_test_records',
    ])
    expect(after.objects.some((row) => String(row.name).includes('temp'))).toBe(false)
    expectNoPrivateContent(after)
    expectNoPrivateContent(opened.telemetry.events)
  })

  it.each([
    {
      label: 'malformed',
      kind: 'malformed' as const,
      failure: { code: 'sqlite_schema_invalid', reason: 'schema_ddl_invalid' },
      expectedMigrations: [],
    },
    {
      label: 'gapped',
      kind: 'gap' as const,
      failure: { code: 'sqlite_schema_invalid', reason: 'schema_gap' },
      expectedMigrations: [BASELINE_ROW, V3_PHASE_TEST_MIGRATION_ROW],
    },
    {
      label: 'future',
      kind: 'future' as const,
      failure: { code: 'sqlite_schema_too_new', reason: 'schema_future_version' },
      expectedMigrations: [{ version: 6, name: 'future_migration' }],
    },
  ])('rejects $label migration histories with stable metadata and no repair', async ({ kind, failure, expectedMigrations }) => {
    const dbPath = await seedMigrationHistory(kind)
    const opened = openPhaseService(dbPath)

    expect(opened.result).toEqual({ ok: false, error: failure })
    expect(opened.telemetry.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        module: 'sqlite',
        status: 'failed',
        error_code: failure.code,
        reason: `cause=${failure.reason}`,
      }),
    ]))
    expectNoPrivateContent(opened.telemetry.events)
    expect(inspectDatabase(dbPath).migrations).toEqual(expectedMigrations)
  })

  it('rejects invalid record shapes before BEGIN IMMEDIATE and never returns input content in errors', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const harness = makePhaseDriverHarness()
    const opened = openPhaseService(dbPath, harness.factory)
    const service = requireService(opened)
    harness.arm()

    const base = validRecord()
    const recordWithoutNote = { ...base }
    Reflect.deleteProperty(recordWithoutNote, 'note')
    const invalidRecords: readonly {
      readonly record: unknown
      readonly failure: PhaseTestFailure
    }[] = [
      {
        record: { ...base, phase: 0 },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'phase_invalid' },
      },
      {
        record: { ...base, phase: '4' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'phase_invalid' },
      },
      {
        record: { ...base, phase: '1' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, demoId: 'P1-D1', result: 'not_executed' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...validPhase1Record({ result: 'not_executed' }), demoId: 'P0-D1' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, result: 'not_executed' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...validPhase1Record(), demoId: 'P1-D7' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, result: 'unknown' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, time: '2026-08-19T00:00:00Z' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, build: 'build\nunsafe' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, build: 'b'.repeat(MAX_METADATA_LENGTH + 1) },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, note: 'note\nunsafe' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, note: 'n'.repeat(MAX_METADATA_LENGTH + 1) },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: recordWithoutNote,
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, extra: 'unexpected' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, guestId: SYNTHETIC_PRIVATE_MARKER },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, profileId: SYNTHETIC_PRIVATE_MARKER },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
      {
        record: { ...base, note: 'profileId=synthetic-id' },
        failure: { code: 'sqlite_phase_record_invalid', reason: 'record_invalid' },
      },
    ]

    for (const invalidRecord of invalidRecords) {
      const before = harness.operations.length
      const first = service.appendPhaseTestRecord(invalidRecord.record)
      const firstFailure = requireFailure(first)
      expect(firstFailure).toEqual(invalidRecord.failure)
      const second = service.appendPhaseTestRecord(invalidRecord.record)
      expect(second).toEqual(first)
      expect(harness.operations.slice(before)).not.toContain('begin')
      expectNoPrivateContent(firstFailure)
    }

    expect(inspectDatabase(dbPath).phaseRows).toEqual([])
    expectNoPrivateContent(opened.telemetry.events)
  })

  it('appends passed and failed attempts atomically in insert, prune, commit order', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const harness = makePhaseDriverHarness()
    const opened = openPhaseService(dbPath, harness.factory)
    const service = requireService(opened)
    harness.arm()

    expect(service.appendPhaseTestRecord(validRecord())).toEqual({ ok: true, value: undefined })
    expect(service.appendPhaseTestRecord(validRecord({
      demoId: 'P0-D2',
      result: 'failed',
      note: 'adapter-failed',
    }))).toEqual({ ok: true, value: undefined })
    expect(harness.operations.slice(-8)).toEqual([
      'begin', 'insert', 'prune', 'commit',
      'begin', 'insert', 'prune', 'commit',
    ])

    const snapshot = inspectDatabase(dbPath)
    expect(snapshot.phaseRows).toEqual([
      {
        sequence: 1,
        phase: '0',
        demo_id: 'P0-D1',
        build: 'build-abc123',
        time: FIXED_TIME,
        result: 'passed',
        note: 'phase-check',
      },
      {
        sequence: 2,
        phase: '0',
        demo_id: 'P0-D2',
        build: 'build-abc123',
        time: FIXED_TIME,
        result: 'failed',
        note: 'adapter-failed',
      },
    ])
    expectNoPrivateContent(snapshot)
    expectNoPrivateContent(opened.telemetry.events)
  })

  it('round-trips P1-D1 through P1-D6 including not_executed and isolates phase reads', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const service = requireService(openPhaseService(dbPath))
    const phase0Record = validRecord({
      demoId: 'P0-D5',
      build: 'phase0-isolated-build',
      note: 'phase0-isolated',
    })
    const phase1Records: readonly Phase1TestRecord[] = PHASE1_DEMO_IDS.map((demoId, index) => {
      const result = PHASE1_RESULT_VALUES[index % PHASE1_RESULT_VALUES.length]
      if (result === undefined) throw new Error('expected phase-one result fixture')
      return validPhase1Record({
        demoId,
        build: `phase1-build-${index + 1}`,
        result,
        note: `phase1-${index + 1}`,
      })
    })

    expect(service.appendPhaseTestRecord(phase0Record)).toEqual({ ok: true, value: undefined })
    for (const record of phase1Records) {
      expect(service.appendPhaseTestRecord(record)).toEqual({ ok: true, value: undefined })
    }

    const phase1Read = readRecordsForPhase(service, '1')
    expect(phase1Read).toEqual([...phase1Records].reverse())
    expect(phase1Read).toContainEqual(expect.objectContaining({
      demoId: 'P1-D4',
      result: 'not_executed',
    }))
    expect(readRecordsForPhase(service, '0')).toEqual([phase0Record])
    expectNoPrivateContent(phase1Read)
    expectNoPrivateContent(readRecordsForPhase(service, '0'))
  })

  it('round-trips Phase 2 evidence independently', async () => {
    const service = requireService(openPhaseService(await makeTemporaryDatabasePath()))
    const records = (['P2-D1', 'P2-D2', 'P2-D3', 'P2-D4', 'P2-D5'] as const)
      .map((demoId) => validPhase2Record({ demoId }))
    for (const record of records) {
      expect(service.appendPhaseTestRecord(record)).toEqual({ ok: true, value: undefined })
    }
    expect(readRecordsForPhase(service, '2')).toEqual([...records].reverse())
    expect(readRecordsForPhase(service, '1')).toEqual([])
  })

  it('migrates exact v4 Phase 0-2 evidence to v5 without changing records', async () => {
    const phase0 = validRecord({ demoId: 'P0-D4', note: 'v4-phase0' })
    const phase2 = validPhase2Record({ demoId: 'P2-D3', note: 'v4-phase2' })
    const dbPath = await seedExactV4PhaseDatabase([
      { sequence: 4, record: phase0 },
      { sequence: 11, record: phase2 },
    ])

    const service = requireService(openPhaseService(dbPath))
    const snapshot = inspectDatabase(dbPath)

    expect(service.health().schemaVersion).toBe(5)
    expect(snapshot.migrations).toEqual([
      BASELINE_ROW,
      V2_PHASE_TEST_MIGRATION_ROW,
      V3_PHASE_TEST_MIGRATION_ROW,
      V4_PHASE_TEST_MIGRATION_ROW,
      V5_PHASE_TEST_MIGRATION_ROW,
    ])
    expect(snapshot.phaseRows.map(({ sequence, ...record }) => record)).toEqual([
      {
        phase: phase0.phase, demo_id: phase0.demoId, build: phase0.build,
        time: phase0.time, result: phase0.result, note: phase0.note,
      },
      {
        phase: phase2.phase, demo_id: phase2.demoId, build: phase2.build,
        time: phase2.time, result: phase2.result, note: phase2.note,
      },
    ])
    expect(readRecordsForPhase(service, '0')).toEqual([phase0])
    expect(readRecordsForPhase(service, '2')).toEqual([phase2])
  })

  it('round-trips Phase 3 evidence independently', async () => {
    const service = requireService(openPhaseService(await makeTemporaryDatabasePath()))
    const records = (['P3-D1', 'P3-D2', 'P3-D3', 'P3-D4'] as const)
      .map((demoId) => validPhase3Record({ demoId }))
    for (const record of records) {
      expect(service.appendPhaseTestRecord(record)).toEqual({ ok: true, value: undefined })
    }
    expect(readRecordsForPhase(service, '3')).toEqual([...records].reverse())
    expect(readRecordsForPhase(service, '2')).toEqual([])
  })

  it.each(['insert', 'prune', 'commit'] as const)('rolls back an append when $failure fails', async (failure) => {
    const dbPath = await makeTemporaryDatabasePath()
    const harness = makePhaseDriverHarness(failure)
    const service = requireService(openPhaseService(dbPath, harness.factory))

    if (failure === 'prune') {
      for (let index = 0; index < 20; index += 1) {
        expect(service.appendPhaseTestRecord(validRecord({
          demoId: DEMO_IDS[index % DEMO_IDS.length],
          build: `build-${index}`,
          time: new Date(Date.UTC(2026, 7, 19, 0, 0, index)).toISOString(),
          note: `attempt-${index}`,
        }))).toEqual({ ok: true, value: undefined })
      }
    }

    const before = readRecords(service)
    harness.arm()
    const failed = service.appendPhaseTestRecord(validRecord({
      demoId: 'P0-D3',
      result: 'mock_passed',
      note: 'synthetic-failure-path',
    }))
    const error = requireFailure(failed)

    expect(harness.operations).toContain('begin')
    expect(harness.operations).toContain(failure)
    expect(harness.operations).toContain('rollback')
    expect(harness.operations.lastIndexOf('rollback')).toBeGreaterThan(
      harness.operations.lastIndexOf('begin'),
    )
    expect(readRecords(service)).toEqual(before)
    expectNoPrivateContent(error)
    expect(inspectDatabase(dbPath).phaseRows.length).toBe(before.length)
  })

  it('prunes to newest twenty, reads phase zero newest-first, and returns defensive copies', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const service = requireService(openPhaseService(dbPath))

    for (let index = 0; index < 25; index += 1) {
      expect(service.appendPhaseTestRecord(validRecord({
        demoId: DEMO_IDS[index % DEMO_IDS.length],
        build: `build-${index}`,
        time: new Date(Date.UTC(2026, 7, 19, 0, 0, index)).toISOString(),
        result: RESULT_VALUES[index % RESULT_VALUES.length],
        note: `attempt-${index}`,
      }))).toEqual({ ok: true, value: undefined })
    }

    const records = readRecords(service)
    expect(records).toHaveLength(20)
    expect(records.map((record) => record.build)).toEqual(
      Array.from({ length: 20 }, (_, index) => `build-${24 - index}`),
    )
    for (const record of records) expectRecordShape(record)

    const first = records[0]
    if (first === undefined) throw new Error('expected newest phase-test record')
    const mutableFirst = first as { build: string; note?: string }
    mutableFirst.build = 'tampered-build'
    mutableFirst.note = 'tampered-note'

    const reread = readRecords(service)
    expect(reread[0]).toEqual(expect.objectContaining({
      build: 'build-24',
      note: 'attempt-24',
    }))
    expect(inspectDatabase(dbPath).phaseRows).toHaveLength(20)
  })

  it('fails closed after SQLite close with the existing stable service convention', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const service = requireService(openPhaseService(dbPath))
    expect(service.close()).toEqual({ ok: true, value: undefined })

    expect(service.appendPhaseTestRecord(validRecord())).toEqual({
      ok: false,
      error: { code: 'sqlite_closed', reason: 'service_closed' },
    })
    expect(service.readPhaseTestRecords('0')).toEqual({
      ok: false,
      error: { code: 'sqlite_closed', reason: 'service_closed' },
    })
  })

  it('supplies the SQLite reader to Console Phase Tests while telemetry remains supplementary', async () => {
    const record = validRecord({ demoId: 'P0-D4', result: 'mock_passed', note: 'sqlite-authoritative' })
    const sqlite = makeBootSqliteFake(record)
    const telemetry = makeTelemetry()
    const runtime = bootSequence(makeBootOptions(sqlite, telemetry) as never) as unknown as {
      readonly ready: Promise<void>
      readonly console: { getPhaseTests(): Promise<{ ok: boolean; value?: unknown }> }
    }

    await runtime.ready
    const result = await runtime.console.getPhaseTests()
    expect(result.ok).toBe(true)
    expect(sqlite.readCalls).toEqual(['0'])
    expect(telemetry.readPage).not.toHaveBeenCalled()
    if (result.ok) {
      expect(result.value).toEqual(expect.objectContaining({ records: [record] }))
      expectNoPrivateContent(result.value)
    }
  })

  it('flushes telemetry and closes SQLite exactly once across idempotent shutdown calls', async () => {
    const sqlite = makeBootSqliteFake(validRecord())
    const telemetry = makeTelemetry()
    const runtime = bootSequence(makeBootOptions(sqlite, telemetry) as never) as unknown as {
      readonly ready: Promise<void>
      readonly shutdown: () => Promise<void>
    }

    await runtime.ready
    expect(typeof runtime.shutdown).toBe('function')
    await runtime.shutdown()
    await runtime.shutdown()

    expect(telemetry.flush).toHaveBeenCalledTimes(1)
    expect(telemetry.close).toHaveBeenCalledTimes(1)
    expect(sqlite.closeCalls).toBe(1)
  })

  it('keeps Main SQLite at userData/mirror.sqlite and gates will-quit until idempotent shutdown settles', async () => {
    const userData = 'C:\\synthetic-user-data'
    const harness = makeMainIndexHarness({ userData })
    const restoreResourcesPath = defineSyntheticResourcesPath()

    try {
      await import('../../src/main/index')
      await flushMicrotasks()

      expect(harness.bootCalls).toHaveLength(1)
      expect(harness.bootCalls[0]).toEqual(expect.objectContaining({
        sqlitePath: join(userData, 'mirror.sqlite'),
      }))

      const willQuit = harness.appHandlers.get('will-quit')
      expect(willQuit).toEqual(expect.any(Function))
      if (willQuit === undefined) return

      const finalEvent = { preventDefault: vi.fn() }
      harness.app.quit.mockImplementation(() => {
        const reentrantWillQuit = harness.appHandlers.get('will-quit')
        reentrantWillQuit?.(finalEvent)
      })

      const firstEvent = { preventDefault: vi.fn() }
      willQuit(firstEvent)
      expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1)
      expect(harness.app.quit).not.toHaveBeenCalled()

      const repeatedEvent = { preventDefault: vi.fn() }
      willQuit(repeatedEvent)
      expect(repeatedEvent.preventDefault).toHaveBeenCalledTimes(1)
      expect(harness.app.quit).not.toHaveBeenCalled()

      await flushMicrotasks()
      expect(harness.shutdown).toHaveBeenCalledTimes(1)
      expect(harness.app.quit).not.toHaveBeenCalled()

      harness.deferredShutdown.resolve()
      await flushMicrotasks()

      expect(harness.app.quit).toHaveBeenCalledTimes(1)
      expect(finalEvent.preventDefault).not.toHaveBeenCalled()
      expect(harness.shutdown).toHaveBeenCalledTimes(1)
    } finally {
      restoreResourcesPath()
    }
  })

  it('gates smoke exitWithMarker app.exit behind the pending shutdown and preserves code 2', async () => {
    vi.useFakeTimers()
    const stdoutWrite = stubImmediateMarkerFlush()
    const harness = makeMainIndexHarness({ smoke: true })
    const restoreResourcesPath = defineSyntheticResourcesPath()

    try {
      await import('../../src/main/index')
      await flushMicrotasks()

      await vi.advanceTimersByTimeAsync(1)
      await flushMicrotasks()
      expect(harness.shutdown).toHaveBeenCalledTimes(1)
      expect(harness.app.exit).not.toHaveBeenCalled()

      harness.deferredShutdown.resolve()
      await flushMicrotasks()

      expect(harness.app.exit).toHaveBeenCalledTimes(1)
      expect(harness.app.exit).toHaveBeenCalledWith(2)
    } finally {
      restoreResourcesPath()
      stdoutWrite.mockRestore()
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('gates crash exitWithMarker app.exit behind the pending shutdown and preserves code 1', async () => {
    vi.useFakeTimers()
    const stdoutWrite = stubImmediateMarkerFlush()
    const harness = makeMainIndexHarness({ crashGiveUp: true })
    const restoreResourcesPath = defineSyntheticResourcesPath()

    try {
      await import('../../src/main/index')
      await flushMicrotasks()

      const renderProcessGone = harness.appHandlers.get('render-process-gone')
      const mirrorWindow = harness.windows[0]
      expect(renderProcessGone).toEqual(expect.any(Function))
      expect(mirrorWindow).toBeDefined()
      if (renderProcessGone === undefined || mirrorWindow === undefined) return

      renderProcessGone(undefined, mirrorWindow.webContents, {
        reason: 'crashed',
        exitCode: 1,
      })
      await flushMicrotasks()

      expect(harness.shutdown).toHaveBeenCalledTimes(1)
      expect(harness.app.exit).not.toHaveBeenCalled()

      harness.deferredShutdown.resolve()
      await flushMicrotasks()

      expect(harness.app.exit).toHaveBeenCalledTimes(1)
      expect(harness.app.exit).toHaveBeenCalledWith(1)
    } finally {
      restoreResourcesPath()
      stdoutWrite.mockRestore()
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})
