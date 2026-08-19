import type { MirrorEvent } from '../shared/types'
import type {
  ConsolePhaseTestsPayload,
  ConsoleResponse,
  PhaseTestRecord,
  PhaseTestRecordReader,
} from '../shared/console-types'

const MAX_RECORDS = 20
const MAX_METADATA_LENGTH = 2048
const RECORD_KEYS = ['phase', 'demoId', 'build', 'time', 'result', 'note'] as const
const DEMO_IDS: ReadonlySet<string> = new Set(['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'])
const RESULTS: ReadonlySet<string> = new Set(['passed', 'failed', 'mock_passed'])
const CANONICAL_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

type PhaseTestsFailureReason = 'cause=reader_failed' | 'cause=record_invalid'
type MetadataEvent = Omit<MirrorEvent, 'time'>

export interface ConsolePhaseTestsDependencies {
  readonly reader: PhaseTestRecordReader
  readonly getBuildCommit: () => string
  readonly emit: (event: MetadataEvent) => void
}

export interface ConsolePhaseTestsController {
  get(): Promise<ConsoleResponse<ConsolePhaseTestsPayload>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readProperty(value: Record<string, unknown>, key: string): unknown {
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function hasExactRecordKeys(value: Record<string, unknown>): boolean {
  try {
    const keys = Reflect.ownKeys(value)
    return keys.length === RECORD_KEYS.length
      && keys.every((key) => typeof key === 'string' && RECORD_KEYS.includes(key as (typeof RECORD_KEYS)[number]))
  } catch {
    return false
  }
}

function isBoundedMetadata(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_METADATA_LENGTH
    && value.trim().length > 0
}

function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_TIME_PATTERN.test(value)) return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function cloneRecord(record: PhaseTestRecord): PhaseTestRecord {
  return {
    phase: record.phase,
    demoId: record.demoId,
    build: record.build,
    time: record.time,
    result: record.result,
    note: record.note,
  }
}

function validateRecord(value: unknown): PhaseTestRecord | null {
  if (!isRecord(value) || !hasExactRecordKeys(value)) return null

  const phase = readProperty(value, 'phase')
  const demoId = readProperty(value, 'demoId')
  const build = readProperty(value, 'build')
  const time = readProperty(value, 'time')
  const result = readProperty(value, 'result')
  const note = readProperty(value, 'note')
  if (
    phase !== '0'
    || typeof demoId !== 'string'
    || !DEMO_IDS.has(demoId)
    || !isBoundedMetadata(build)
    || !isCanonicalTime(time)
    || typeof result !== 'string'
    || !RESULTS.has(result)
    || !isBoundedMetadata(note)
  ) {
    return null
  }

  return {
    phase,
    demoId: demoId as PhaseTestRecord['demoId'],
    build,
    time,
    result: result as PhaseTestRecord['result'],
    note,
  }
}

function failed(
  emit: (event: MetadataEvent) => void,
  reason: PhaseTestsFailureReason,
): ConsoleResponse<ConsolePhaseTestsPayload> {
  try {
    emit({
      module: 'app',
      event: 'phase_tests_read_failed',
      status: 'failed',
      error_code: 'console_phase_tests_read_failed',
      reason,
      source: 'runtime',
    })
  } catch {
    // A diagnostic sink failure cannot expose the reader failure or gate the Console.
  }
  return {
    ok: false,
    error: 'console_phase_tests_read_failed',
    reason,
  }
}

export function createConsolePhaseTests(
  dependencies: ConsolePhaseTestsDependencies,
): ConsolePhaseTestsController {
  async function get(): Promise<ConsoleResponse<ConsolePhaseTestsPayload>> {
    let rawRecords: unknown
    try {
      rawRecords = await Promise.resolve(dependencies.reader.read('0'))
    } catch {
      return failed(dependencies.emit, 'cause=reader_failed')
    }

    let records: PhaseTestRecord[] = []
    try {
      if (!Array.isArray(rawRecords) || rawRecords.length > MAX_RECORDS) {
        return failed(dependencies.emit, 'cause=record_invalid')
      }

      for (const rawRecord of rawRecords) {
        const record = validateRecord(rawRecord)
        if (record === null) return failed(dependencies.emit, 'cause=record_invalid')
        records.push(record)
      }
    } catch {
      return failed(dependencies.emit, 'cause=record_invalid')
    }

    records.sort((left, right) => {
      if (right.time > left.time) return 1
      if (right.time < left.time) return -1
      return 0
    })
    const clonedRecords = records.map(cloneRecord)
    if (clonedRecords.length === 0) {
      return {
        ok: true,
        value: {
          phase: '0',
          source: 'empty',
          latest: null,
          records: [],
        },
      }
    }

    const latest = clonedRecords[0]
    if (latest === undefined) return failed(dependencies.emit, 'cause=record_invalid')

    return {
      ok: true,
      value: {
        phase: '0',
        source: 'reader',
        latest: cloneRecord(latest),
        records: clonedRecords,
      },
    }
  }

  return { get }
}
