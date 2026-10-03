import { isAbsolute } from 'node:path'

import * as sqliteService from '../src/main/sqlite-service'
import type {
  SqlitePhaseTestService,
  SqliteServiceOptions,
} from '../src/main/sqlite-service'
import type { PhaseTestRecord } from '../src/shared/console-types'

const RECORDER_ERROR_CODE = 'phase1_deterministic_evidence_failed'
const MAX_METADATA_LENGTH = 2048
const BUILD_PATTERN = /^[A-Za-z0-9._:+/-]{1,2048}$/
const PRIVATE_CONTENT_PATTERN = /(?:guest|candidate|profile|credential|transcript|audio|embedding|memory|secret|token|prompt|private)/i
const UTC_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const RECORD_KEYS = ['phase', 'demoId', 'build', 'time', 'result', 'note'] as const

export type Phase1DeterministicEvidenceInput = Readonly<{
  dbPath: string
  build: string
  time: string
  d3: boolean
  d4: boolean
  d6: boolean
}>

type RecorderFailureReason =
  | 'formal_deterministic_demos_incomplete'
  | 'db_path_not_absolute'
  | 'build_token_invalid'
  | 'time_invalid'
  | 'phase1_record_open_failed'
  | 'phase1_record_append_failed'
  | 'phase1_record_read_failed'
  | 'phase1_record_readback_invalid'
  | 'phase1_record_close_failed'

type RecorderFailure = Readonly<{
  ok: false
  error: Readonly<{
    code: string
    reason: RecorderFailureReason
  }>
}>

export type Phase1DeterministicEvidenceResult =
  | Readonly<{
    ok: true
    value: readonly PhaseTestRecord[]
  }>
  | RecorderFailure

const NOOP_TELEMETRY: SqliteServiceOptions['telemetry'] = {
  emit: () => undefined,
}

function failure(reason: RecorderFailureReason): RecorderFailure {
  return {
    ok: false,
    error: {
      code: RECORDER_ERROR_CODE,
      reason,
    },
  }
}

function isSafeBuild(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_METADATA_LENGTH
    && value.trim().length > 0
    && !/\s/.test(value)
    && BUILD_PATTERN.test(value)
    && !PRIVATE_CONTENT_PATTERN.test(value)
}

function isCanonicalUtcTime(value: unknown): value is string {
  if (typeof value !== 'string' || !UTC_TIME_PATTERN.test(value)) return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function expectedRecords(
  input: Phase1DeterministicEvidenceInput,
): readonly PhaseTestRecord[] {
  return [
    {
      phase: '1',
      demoId: 'P1-D1',
      build: input.build,
      time: input.time,
      result: 'not_executed',
      note: 'reason=real_demo_pending',
    },
    {
      phase: '1',
      demoId: 'P1-D2',
      build: input.build,
      time: input.time,
      result: 'not_executed',
      note: 'reason=real_demo_pending',
    },
    {
      phase: '1',
      demoId: 'P1-D3',
      build: input.build,
      time: input.time,
      result: 'mock_passed',
      note: 'source=deterministic_mock',
    },
    {
      phase: '1',
      demoId: 'P1-D4',
      build: input.build,
      time: input.time,
      result: 'mock_passed',
      note: 'source=deterministic_mock',
    },
    {
      phase: '1',
      demoId: 'P1-D5',
      build: input.build,
      time: input.time,
      result: 'not_executed',
      note: 'reason=real_demo_pending',
    },
    {
      phase: '1',
      demoId: 'P1-D6',
      build: input.build,
      time: input.time,
      result: 'mock_passed',
      note: 'source=deterministic_mock',
    },
  ]
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasExactRecordKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value)
  return keys.length === RECORD_KEYS.length
    && RECORD_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function matchesExpectedRecord(
  value: unknown,
  expected: PhaseTestRecord,
): boolean {
  if (!isObjectRecord(value) || !hasExactRecordKeys(value)) return false
  return value.phase === expected.phase
    && value.demoId === expected.demoId
    && value.build === expected.build
    && value.time === expected.time
    && value.result === expected.result
    && value.note === expected.note
}

function closeService(service: SqlitePhaseTestService): boolean {
  try {
    const result = service.close()
    return result.ok
  } catch {
    return false
  }
}

function isExpectedReadBack(
  records: readonly unknown[],
  expected: readonly PhaseTestRecord[],
): records is readonly PhaseTestRecord[] {
  if (records.length !== expected.length) return false
  return expected.every((record) => records.some((candidate) =>
    matchesExpectedRecord(candidate, record),
  ))
}

export async function recordPhase1DeterministicEvidence(
  input: Phase1DeterministicEvidenceInput,
): Promise<Phase1DeterministicEvidenceResult> {
  if (input.d3 !== true || input.d4 !== true || input.d6 !== true) {
    return failure('formal_deterministic_demos_incomplete')
  }
  if (typeof input.dbPath !== 'string' || !isAbsolute(input.dbPath)) {
    return failure('db_path_not_absolute')
  }
  if (!isSafeBuild(input.build)) return failure('build_token_invalid')
  if (!isCanonicalUtcTime(input.time)) return failure('time_invalid')

  let opened: ReturnType<typeof sqliteService.openSqlite>
  try {
    opened = sqliteService.openSqlite({
      dbPath: input.dbPath,
      telemetry: NOOP_TELEMETRY,
    })
  } catch {
    return failure('phase1_record_open_failed')
  }
  if (!opened.ok) return failure('phase1_record_open_failed')

  const service = opened.value
  const expected = expectedRecords(input)

  for (const record of expected) {
    try {
      const appended = service.appendPhaseTestRecord(record)
      if (!appended.ok) {
        closeService(service)
        return failure('phase1_record_append_failed')
      }
    } catch {
      closeService(service)
      return failure('phase1_record_append_failed')
    }
  }

  let readBack: ReturnType<SqlitePhaseTestService['readPhaseTestRecords']>
  try {
    readBack = service.readPhaseTestRecords('1')
  } catch {
    closeService(service)
    return failure('phase1_record_read_failed')
  }
  if (!readBack.ok || !Array.isArray(readBack.value)) {
    closeService(service)
    return failure('phase1_record_read_failed')
  }

  const runRecords = readBack.value.filter((record) =>
    isObjectRecord(record)
      && record.phase === '1'
      && record.build === input.build
      && record.time === input.time,
  )
  if (!isExpectedReadBack(runRecords, expected)) {
    closeService(service)
    return failure('phase1_record_readback_invalid')
  }

  if (!closeService(service)) return failure('phase1_record_close_failed')
  return { ok: true, value: runRecords }
}
