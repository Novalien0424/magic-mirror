import { describe, expect, it, vi } from 'vitest'

import { createConsolePhaseTests } from '../../src/main/console-phase-tests'

const TEST_PRIVATE_MEMORY_SENTINEL = '__TEST_PRIVATE_MEMORY_SENTINEL__'

const VALID_DEMO_IDS = ['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'] as const
const VALID_RESULTS = ['passed', 'failed', 'mock_passed'] as const
const VALID_PHASE_1_DEMO_IDS = ['P1-D1', 'P1-D2', 'P1-D3', 'P1-D4', 'P1-D5', 'P1-D6'] as const
const VALID_PHASE_1_RESULTS = ['passed', 'failed', 'mock_passed', 'not_executed'] as const

type DemoId = (typeof VALID_DEMO_IDS)[number]
type PhaseTestResult = (typeof VALID_RESULTS)[number]
type Phase1DemoId = (typeof VALID_PHASE_1_DEMO_IDS)[number]
type Phase1TestResult = (typeof VALID_PHASE_1_RESULTS)[number]

interface PhaseTestRecordFixture {
  readonly phase: '0'
  readonly demoId: DemoId
  readonly build: string
  readonly time: string
  readonly result: PhaseTestResult
  readonly note: string
}

interface Phase1TestRecordFixture {
  readonly phase: '1'
  readonly demoId: Phase1DemoId
  readonly build: string
  readonly time: string
  readonly result: Phase1TestResult
  readonly note: string
}

type SupportedPhase = '0' | '1'

type PhaseAwareResponse =
  | {
      readonly ok: true
      readonly value: {
        readonly phase: '1'
        readonly source: 'empty' | 'reader'
        readonly latest: Phase1TestRecordFixture | null
        readonly records: readonly Phase1TestRecordFixture[]
      }
    }
  | {
      readonly ok: false
      readonly error: string
      readonly reason: string
    }

interface PhaseAwareController {
  get(phase?: SupportedPhase): Promise<PhaseAwareResponse>
}

type PhaseAwareReader = (
  phase: SupportedPhase,
) => readonly unknown[] | PromiseLike<readonly unknown[]>

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

function makePhase1Record(
  index: number,
  overrides: Partial<Phase1TestRecordFixture> = {},
): Phase1TestRecordFixture {
  return {
    phase: '1',
    demoId: VALID_PHASE_1_DEMO_IDS[index % VALID_PHASE_1_DEMO_IDS.length] as Phase1DemoId,
    build: 'phase-1-fixture-build',
    time: `2026-08-20T00:${String(index).padStart(2, '0')}:00.000Z`,
    result: VALID_PHASE_1_RESULTS[index % VALID_PHASE_1_RESULTS.length] as Phase1TestResult,
    note: `phase-1-test-metadata-${index}`,
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

function createPhaseAwareController(
  common: ReturnType<typeof makeCommon>,
  read: PhaseAwareReader,
): PhaseAwareController {
  return createConsolePhaseTests({
    ...commonDependencies(common),
    reader: { read } as never,
  }) as unknown as PhaseAwareController
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
  it('accepts bounded Phase 2 demo evidence without changing the default phase', async () => {
    const common = makeCommon()
    const record = {
      phase: '2', demoId: 'P2-D1', build: 'phase2-build',
      time: '2026-08-27T00:00:00.000Z', result: 'not_executed', note: 'target_mac_pending',
    } as const
    const controller = createConsolePhaseTests({
      ...commonDependencies(common),
      reader: { read: vi.fn(() => [record]) },
    })

    await expect(controller.get('2')).resolves.toMatchObject({
      ok: true,
      value: { phase: '2', latest: record, records: [record] },
    })
  })

  it('defaults to Phase 0, reads phase 0, and preserves the existing Phase 0 payload', async () => {
    const common = makeCommon()
    const read = vi.fn(() => [olderRecord, latestRecord])
    const result = await createConsolePhaseTests({
      ...commonDependencies(common),
      reader: { read },
    }).get()

    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('0')
    expect(result).toMatchObject({
      ok: true,
      value: {
        phase: '0',
        source: 'reader',
        latest: latestRecord,
        records: [latestRecord, olderRecord],
      },
    })
  })

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

  it('reads Phase 1 and accepts exactly the authoritative P1-D1 through P1-D6 records', async () => {
    const common = makeCommon()
    const records = VALID_PHASE_1_DEMO_IDS.map((demoId, index) => makePhase1Record(index, { demoId }))
    const read = vi.fn((_phase: SupportedPhase) => records)
    const result = await createPhaseAwareController(common, read).get('1')

    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('1')
    expect(result).toMatchObject({
      ok: true,
      value: {
        phase: '1',
        source: 'reader',
        latest: records[5],
        records: [...records].reverse(),
      },
    })
    if (!result.ok) return
    expect(new Set(result.value.records.map((record) => record.demoId))).toEqual(
      new Set(VALID_PHASE_1_DEMO_IDS),
    )
  })

  it('preserves not_executed and never treats it as passed for Phase 1', async () => {
    const common = makeCommon()
    const record = makePhase1Record(0, {
      demoId: 'P1-D6',
      result: 'not_executed',
    })
    const read = vi.fn((_phase: SupportedPhase) => [record])
    const result = await createPhaseAwareController(common, read).get('1')

    expect(read).toHaveBeenCalledWith('1')
    expect(result).toMatchObject({
      ok: true,
      value: {
        phase: '1',
        latest: { ...record, result: 'not_executed' },
        records: [{ ...record, result: 'not_executed' }],
      },
    })
    if (!result.ok) return
    expect(result.value.latest?.result).toBe('not_executed')
    expect(result.value.records.map((item) => item.result)).toEqual(['not_executed'])
    expect(result.value.records.some((item) => item.result === 'passed')).toBe(false)
  })

  it('rejects a mixed Phase 0 record and P1-D7 with the existing record_invalid behavior', async () => {
    const invalidP1Record = {
      ...makePhase1Record(0),
      demoId: 'P1-D7',
    } as unknown as Phase1TestRecordFixture
    const cases: readonly { readonly label: string; readonly records: readonly unknown[] }[] = [
      {
        label: 'mixed phase record',
        records: [makePhase1Record(0), makeRecord(0)],
      },
      {
        label: 'unknown Phase 1 demo ID',
        records: [invalidP1Record],
      },
    ]

    for (const testCase of cases) {
      const common = makeCommon()
      const read = vi.fn((_phase: SupportedPhase) => testCase.records)
      const result = await createPhaseAwareController(common, read).get('1')

      expect(read, testCase.label).toHaveBeenCalledWith('1')
      expect(result, testCase.label).toMatchObject({
        ok: false,
        error: 'console_phase_tests_read_failed',
        reason: 'cause=record_invalid',
      })
      expect(result, testCase.label).not.toHaveProperty('value')
      expect(common.events, testCase.label).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'phase_tests_read_failed',
          reason: 'cause=record_invalid',
        }),
      ]))
    }
  })

  it('retains the Phase 1 20-record cap, descending order, and clone contract while rejecting 21', async () => {
    const records = Array.from({ length: 20 }, (_, index) => makePhase1Record(index))
    const common = makeCommon()
    const read = vi.fn((_phase: SupportedPhase) => records)
    const result = await createPhaseAwareController(common, read).get('1')

    expect(read).toHaveBeenCalledWith('1')
    expect(result).toMatchObject({ ok: true, value: { phase: '1', source: 'reader' } })
    if (!result.ok) return

    expect(result.value.records).toHaveLength(20)
    expect(result.value.records).toEqual([...records].reverse())
    expect(result.value.latest).toEqual(records[19])
    expect(result.value.records).not.toBe(records)
    expect(result.value.records[0]).not.toBe(records[19])
    expect(result.value.latest).not.toBe(records[19])
    expect(new Set(result.value.records.map((record) => record.demoId))).toEqual(
      new Set(VALID_PHASE_1_DEMO_IDS),
    )

    const overLimitCommon = makeCommon()
    const overLimitRecords = Array.from({ length: 21 }, (_, index) => makePhase1Record(index))
    const overLimitRead = vi.fn((_phase: SupportedPhase) => overLimitRecords)
    const overLimitResult = await createPhaseAwareController(overLimitCommon, overLimitRead).get('1')

    expect(overLimitRead).toHaveBeenCalledWith('1')
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
