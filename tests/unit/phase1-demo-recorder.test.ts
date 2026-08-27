import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as sqliteService from '../../src/main/sqlite-service'
import {
  openSqlite,
  type SqlitePhaseTestService,
  type SqliteServiceOptions,
} from '../../src/main/sqlite-service'
import type { PhaseTestRecord } from '../../src/shared/console-types'
import { recordPhase1DeterministicEvidence } from '../../scripts/phase1-demo-recorder'

const FIXED_TIME = '2026-08-23T00:00:00.000Z'
const SAFE_BUILD = 'phase1-build-20260823'
const PHASE1_DEMO_IDS = ['P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6'] as const
const RECORD_KEYS = ['build', 'demoId', 'note', 'phase', 'result', 'time'] as const
const PRIVACY_SENTINELS = [
  'sentinel-private-context-001',
  'sentinel-transcript-002',
  'sentinel-audio-003',
  'sentinel-memory-004',
  'sentinel-credential-005',
] as const

type Phase1Record = Extract<PhaseTestRecord, { phase: '1' }>
type RecorderFailure = {
  readonly ok: false
  readonly error: {
    readonly code: string
    readonly reason: string
  }
}

const activeServices: SqlitePhaseTestService[] = []
const temporaryDirectories: string[] = []

function makeTelemetry(): SqliteServiceOptions['telemetry'] {
  return { emit: vi.fn() } as unknown as SqliteServiceOptions['telemetry']
}

async function makeTemporaryDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-phase1-recorder-'))
  temporaryDirectories.push(directory)
  return join(directory, 'mirror.sqlite')
}

function baseInput(dbPath: string, overrides: Partial<{
  readonly d3: boolean
  readonly d4: boolean
  readonly d6: boolean
  readonly build: string
  readonly time: string
}> = {}) {
  return {
    dbPath,
    build: SAFE_BUILD,
    time: FIXED_TIME,
    d3: true,
    d4: true,
    d6: true,
    ...overrides,
  }
}

function expectNoPrivacySentinels(value: unknown): void {
  const serialized = JSON.stringify(value) ?? ''
  for (const sentinel of PRIVACY_SENTINELS) {
    expect(serialized).not.toContain(sentinel)
  }
}

function expectBoundedFailure(
  value: unknown,
  expectedReason: string,
): asserts value is RecorderFailure {
  expect(value).toMatchObject({ ok: false, error: { reason: expectedReason } })
  expect(value).not.toMatchObject({ ok: true })
  if (
    typeof value !== 'object'
    || value === null
    || (value as { ok?: unknown }).ok !== false
  ) {
    throw new Error('expected recorder failure')
  }

  const error = (value as { error?: unknown }).error
  expect(error).toMatchObject({ code: expect.any(String), reason: expectedReason })
  if (typeof error !== 'object' || error === null) {
    throw new Error('expected recorder failure metadata')
  }
  expect(Object.keys(error).sort()).toEqual(['code', 'reason'])
  const typedError = error as RecorderFailure['error']
  expect(typedError.code).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
  expect(typedError.reason).toMatch(/^[a-z][a-z0-9_]{1,127}$/)
  expectNoPrivacySentinels(value)
}

function recordsFromSuccess(value: unknown): readonly PhaseTestRecord[] {
  expect(value).toMatchObject({ ok: true })
  if (
    typeof value !== 'object'
    || value === null
    || (value as { ok?: unknown }).ok !== true
  ) {
    throw new Error('expected recorder success')
  }

  const records = (value as { value?: unknown }).value
  expect(Array.isArray(records)).toBe(true)
  if (!Array.isArray(records)) throw new Error('expected recorder records')
  return records as readonly PhaseTestRecord[]
}

function expectPhase1RecordShape(record: unknown): asserts record is Phase1Record {
  expect(record).toBeTypeOf('object')
  if (typeof record !== 'object' || record === null) {
    throw new Error('expected Phase 1 record')
  }
  expect(Object.keys(record).sort()).toEqual([...RECORD_KEYS].sort())
  const typed = record as Record<string, unknown>
  expect(typed.phase).toBe('1')
  expect(PHASE1_DEMO_IDS).toContain(typed.demoId)
  expect(typed.build).toBe(SAFE_BUILD)
  expect(typed.time).toBe(FIXED_TIME)
  expect(['mock_passed', 'not_executed']).toContain(typed.result)
  expect(['reason=real_demo_pending', 'source=deterministic_mock']).toContain(typed.note)
  expectNoPrivacySentinels(record)
}

function sortedPhase1Records(records: readonly PhaseTestRecord[]): Phase1Record[] {
  for (const record of records) expectPhase1RecordShape(record)
  return [...records]
    .sort((left, right) => left.demoId.localeCompare(right.demoId)) as Phase1Record[]
}

function expectedPhase1Records(): readonly Phase1Record[] {
  return [
    {
      phase: '1',
      demoId: 'P1-D1',
      build: SAFE_BUILD,
      time: FIXED_TIME,
      result: 'not_executed',
      note: 'reason=real_demo_pending',
    },
    {
      phase: '1',
      demoId: 'P1-D2',
      build: SAFE_BUILD,
      time: FIXED_TIME,
      result: 'not_executed',
      note: 'reason=real_demo_pending',
    },
    {
      phase: '1',
      demoId: 'P1-D3',
      build: SAFE_BUILD,
      time: FIXED_TIME,
      result: 'mock_passed',
      note: 'source=deterministic_mock',
    },
    {
      phase: '1',
      demoId: 'P1-D4',
      build: SAFE_BUILD,
      time: FIXED_TIME,
      result: 'mock_passed',
      note: 'source=deterministic_mock',
    },
    {
      phase: '1',
      demoId: 'P1-D5',
      build: SAFE_BUILD,
      time: FIXED_TIME,
      result: 'not_executed',
      note: 'reason=real_demo_pending',
    },
    {
      phase: '1',
      demoId: 'P1-D6',
      build: SAFE_BUILD,
      time: FIXED_TIME,
      result: 'mock_passed',
      note: 'source=deterministic_mock',
    },
  ]
}

function readPhase1Records(service: SqlitePhaseTestService): readonly PhaseTestRecord[] {
  const result = service.readPhaseTestRecords('1')
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('expected persisted Phase 1 records')
  return result.value
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

  vi.restoreAllMocks()
})

describe('Phase 1 deterministic evidence recorder RED contract', () => {
  it.each(['d3', 'd4', 'd6'] as const)(
    'refuses before opening the writer when formal flag %s is false',
    async (flag) => {
      const dbPath = await makeTemporaryDatabasePath()
      const input = baseInput(dbPath, { [flag]: false })
      const writer = vi.spyOn(sqliteService, 'openSqlite')

      const result = await recordPhase1DeterministicEvidence(input)

      expectBoundedFailure(result, 'formal_deterministic_demos_incomplete')
      expect(writer).not.toHaveBeenCalled()
    },
  )

  it('rejects a non-absolute dbPath before writer use', async () => {
    const absoluteDbPath = await makeTemporaryDatabasePath()
    const dbPath = relative(process.cwd(), absoluteDbPath)
    expect(isAbsolute(dbPath)).toBe(false)
    const writer = vi.spyOn(sqliteService, 'openSqlite')

    const result = await recordPhase1DeterministicEvidence(baseInput(dbPath))

    expectBoundedFailure(result, 'db_path_not_absolute')
    expect(writer).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['invalid', 'unsafe build token'],
  ] as const)('rejects an %s build token before writer use', async (_label, build) => {
    const dbPath = await makeTemporaryDatabasePath()
    const writer = vi.spyOn(sqliteService, 'openSqlite')

    const result = await recordPhase1DeterministicEvidence(baseInput(dbPath, { build }))

    expectBoundedFailure(result, 'build_token_invalid')
    expect(writer).not.toHaveBeenCalled()
  })

  it('records and reads back exactly six Phase 1 records without synthesizing a real pass', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const expected = expectedPhase1Records()
    const writer = vi.spyOn(sqliteService, 'openSqlite')

    const result = await recordPhase1DeterministicEvidence(baseInput(dbPath))
    const returned = sortedPhase1Records(recordsFromSuccess(result))

    expect(writer).toHaveBeenCalledTimes(1)
    expect(writer).toHaveBeenCalledWith(expect.objectContaining({ dbPath }))
    expect(returned).toHaveLength(6)
    expect(returned).toEqual(expected)
    expect(returned.some((record) => record.result === 'passed')).toBe(false)
    expectNoPrivacySentinels(returned)

    const opened = openSqlite({ dbPath, telemetry: makeTelemetry() })
    expect(opened.ok).toBe(true)
    if (!opened.ok) throw new Error('expected SQLite reader')
    activeServices.push(opened.value)

    const persisted = sortedPhase1Records(readPhase1Records(opened.value))
    expect(persisted).toHaveLength(6)
    expect(persisted).toEqual(expected)
    expect(persisted).toEqual(returned)
    expect(persisted.some((record) => record.result === 'passed')).toBe(false)
    expectNoPrivacySentinels(persisted)

    expect(opened.value.close()).toEqual({ ok: true, value: undefined })
  })

  it('returns a bounded failure when append fails partway and never claims success', async () => {
    const dbPath = await makeTemporaryDatabasePath()
    const appendCalls: unknown[] = []
    const append = vi.fn((record: unknown) => {
      appendCalls.push(record)
      return appendCalls.length === 2
        ? { ok: false, error: { code: 'sqlite_phase_record_write_failed', reason: 'transaction_failed' } }
        : { ok: true, value: undefined }
    })
    const read = vi.fn(() => ({ ok: true, value: [] as readonly PhaseTestRecord[] }))
    const close = vi.fn(() => ({ ok: true, value: undefined }))
    const fakeService = {
      health: vi.fn(),
      appendPhaseTestRecord: append,
      readPhaseTestRecords: read,
      close,
    } as unknown as SqlitePhaseTestService
    const writer = vi.spyOn(sqliteService, 'openSqlite').mockReturnValue({
      ok: true,
      value: fakeService,
    })

    const result = await recordPhase1DeterministicEvidence(baseInput(dbPath))

    expectBoundedFailure(result, 'phase1_record_append_failed')
    expect(result).not.toMatchObject({ ok: true, value: expect.anything() })
    expect(writer).toHaveBeenCalledTimes(1)
    expect(append).toHaveBeenCalledTimes(2)
    expect(appendCalls).toHaveLength(2)
    expect(read).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    expectNoPrivacySentinels(appendCalls)
  })
})
