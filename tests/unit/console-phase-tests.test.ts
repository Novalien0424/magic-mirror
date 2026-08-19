import { describe, expect, it } from 'vitest'

import { createConsolePhaseTests } from '../../src/main/console-phase-tests'

const TEST_PRIVATE_MEMORY_SENTINEL = '__TEST_PRIVATE_MEMORY_SENTINEL__'

const VALID_DEMO_IDS = ['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'] as const
const VALID_RESULTS = ['passed', 'failed', 'mock_passed'] as const

type DemoId = (typeof VALID_DEMO_IDS)[number]
type PhaseTestResult = (typeof VALID_RESULTS)[number]

interface PhaseTestRecordFixture {
  readonly phase: '0'
  readonly demoId: DemoId
  readonly build: string
  readonly time: string
  readonly result: PhaseTestResult
  readonly note: string
}

function makeRecord(
  index: number,
  overrides: Partial<PhaseTestRecordFixture> = {},
): PhaseTestRecordFixture {
  return {
    phase: '0',
    demoId: VALID_DEMO_IDS[index % VALID_DEMO_IDS.length] as DemoId,
    build: 'fixture-build',
    time: `2026-08-19T00:${String(index).padStart(2, '0')}:00.000Z`,
    result: VALID_RESULTS[index % VALID_RESULTS.length] as PhaseTestResult,
    note: `phase-test-metadata-${index}`,
    ...overrides,
  }
}

function makeCommon(): {
  readonly events: unknown[]
  readonly getBuildCommit: () => string
  readonly emit: (event: unknown) => void
} {
  const events: unknown[] = []
  return {
    events,
    getBuildCommit: () => 'fixture-build',
    emit: (event: unknown): void => {
      events.push(event)
    },
  }
}

function commonDependencies(common: ReturnType<typeof makeCommon>): {
  readonly getBuildCommit: () => string
  readonly emit: (event: unknown) => void
} {
  return {
    getBuildCommit: common.getBuildCommit,
    emit: common.emit,
  }
}

const olderRecord = makeRecord(0, {
  demoId: 'P0-D1',
  time: '2026-08-18T00:00:00.000Z',
  result: 'passed',
  note: 'older metadata',
})

const latestRecord = makeRecord(1, {
  demoId: 'P0-D5',
  time: '2026-08-19T00:00:00.000Z',
  result: 'mock_passed',
  note: 'latest metadata',
})

describe('Phase 0 Task 9 Gate 9C.1 Phase Tests Main adapter RED contract', () => {
  it('returns an honest empty Phase Tests payload when the reader has no records', async () => {
    const common = makeCommon()
    const result = await createConsolePhaseTests({
      ...commonDependencies(common),
      reader: { read: () => [] },
    }).get()

    expect(result).toEqual({
      ok: true,
      value: {
        phase: '0',
        source: 'empty',
        latest: null,
        records: [],
      },
    })
  })

  it('returns the newest bounded reader record without fabricating a result', async () => {
    const common = makeCommon()
    const result = await createConsolePhaseTests({
      ...commonDependencies(common),
      reader: { read: () => [olderRecord, latestRecord] },
    }).get()

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: 'reader',
        latest: latestRecord,
        records: [latestRecord, olderRecord],
      },
    })
  })

  it('maps reader failure or malformed output to a visible stable error', async () => {
    const common = makeCommon()
    const result = await createConsolePhaseTests({
      ...commonDependencies(common),
      reader: {
        read: (): never => {
          throw new Error(TEST_PRIVATE_MEMORY_SENTINEL)
        },
      },
    }).get()

    expect(result).toMatchObject({
      ok: false,
      error: 'console_phase_tests_read_failed',
      reason: 'cause=reader_failed',
    })
    expect(JSON.stringify(result)).not.toContain(TEST_PRIVATE_MEMORY_SENTINEL)
    expect(JSON.stringify(common.events)).not.toContain(TEST_PRIVATE_MEMORY_SENTINEL)
    expect(common.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'phase_tests_read_failed',
        reason: 'cause=reader_failed',
      }),
    ]))
  })

  it('accepts at most 20 validated records across the exact P0-D1 through P0-D5 IDs', async () => {
    const common = makeCommon()
    const records = Array.from({ length: 20 }, (_, index) => makeRecord(index))
    const result = await createConsolePhaseTests({
      ...commonDependencies(common),
      reader: { read: () => records },
    }).get()

    expect(result).toMatchObject({ ok: true, value: { source: 'reader' } })
    if (!result.ok) return

    expect(result.value.records).toHaveLength(20)
    expect(result.value.records).toEqual([...records].reverse())
    expect(result.value.latest).toEqual(records[19])
    expect(new Set(result.value.records.map((record) => record.demoId))).toEqual(new Set(VALID_DEMO_IDS))
    expect(Object.keys(result.value.records[0] ?? {}).sort()).toEqual([
      'build',
      'demoId',
      'note',
      'phase',
      'result',
      'time',
    ])
  })

  it('accepts an asynchronous reader while preserving canonical descending time order', async () => {
    const common = makeCommon()
    const result = await createConsolePhaseTests({
      ...commonDependencies(common),
      reader: {
        read: async (phase: '0') => {
          expect(phase).toBe('0')
          return [olderRecord, latestRecord]
        },
      },
    }).get()

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: 'reader',
        latest: latestRecord,
        records: [latestRecord, olderRecord],
      },
    })
  })

  it('rejects malformed bounded fields and never fabricates a Phase Tests record', async () => {
    const validRecord = makeRecord(2)
    const malformedCases: readonly [string, never][] = [
      ['phase', { ...validRecord, phase: '1' } as unknown as never],
      ['demoId', { ...validRecord, demoId: 'P0-D6' } as unknown as never],
      ['build', { ...validRecord, build: 'b'.repeat(2049) } as unknown as never],
      ['time', { ...validRecord, time: '2026-08-19T00:00:00Z' } as unknown as never],
      ['result', { ...validRecord, result: 'passed_with_extra_state' } as unknown as never],
      ['note', { ...validRecord, note: 'n'.repeat(2049) } as unknown as never],
      ['extra key', { ...validRecord, unexpected: 'field' } as unknown as never],
    ]

    for (const [field, malformedRecord] of malformedCases) {
      const common = makeCommon()
      const result = await createConsolePhaseTests({
        ...commonDependencies(common),
        reader: { read: () => [malformedRecord] },
      }).get()

      expect(result, field).toMatchObject({
        ok: false,
        error: 'console_phase_tests_read_failed',
        reason: 'cause=record_invalid',
      })
      expect(result, field).not.toHaveProperty('value')
      expect(common.events, field).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'phase_tests_read_failed',
          reason: 'cause=record_invalid',
        }),
      ]))
    }
  })

  it('rejects malformed and over-limit reader output with the same stable record_invalid failure', async () => {
    const malformedCommon = makeCommon()
    const malformedResult = await createConsolePhaseTests({
      ...commonDependencies(malformedCommon),
      reader: { read: (): never => null as never },
    }).get()

    expect(malformedResult).toMatchObject({
      ok: false,
      error: 'console_phase_tests_read_failed',
      reason: 'cause=record_invalid',
    })
    expect(malformedResult).not.toHaveProperty('value')

    const overLimitCommon = makeCommon()
    const overLimitRecords = Array.from({ length: 21 }, (_, index) => makeRecord(index))
    const overLimitResult = await createConsolePhaseTests({
      ...commonDependencies(overLimitCommon),
      reader: { read: () => overLimitRecords },
    }).get()

    expect(overLimitResult).toMatchObject({
      ok: false,
      error: 'console_phase_tests_read_failed',
      reason: 'cause=record_invalid',
    })
    expect(overLimitResult).not.toHaveProperty('value')
    expect(overLimitCommon.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'phase_tests_read_failed',
        reason: 'cause=record_invalid',
      }),
    ]))
  })
})
