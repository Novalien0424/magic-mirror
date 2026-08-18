import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TELEMETRY_DEFAULTS,
  createTelemetry,
  formatWakeMetadata,
  type Telemetry,
  type TelemetryClock,
  type TelemetryDrainScheduler,
  type TelemetryEventInput,
  type TelemetryFileOperations,
  type TelemetryPageRequest,
} from '../../src/main/telemetry'
import type { MirrorEvent } from '../../src/shared/types'

const DIRECTORY = 'synthetic-telemetry-directory'
const FIXED_TIME = '2026-08-19T00:00:00.000Z'
const INPUT_TIME = '1999-01-01T00:00:00.000Z'
const RAW_ERROR_SENTINEL = 'synthetic-raw-error-sentinel'
const TRANSCRIPT_SENTINEL = 'synthetic-transcript-sentinel'
const AUDIO_SENTINEL = 'synthetic-audio-sentinel'

const SENSITIVE_FIELD_NAMES = [
  'transcript',
  'audio',
  'prompt',
  'private_context',
  'memory_value',
  'image',
  'frame',
  'embedding',
  'key',
  'realtime_secret',
  'raw_error',
] as const

type AppendCall = { filePath: string; data: string }
type RenameCall = { fromPath: string; toPath: string }

type HarnessOptions = {
  clock?: TelemetryClock
  filePrefix?: string
  autoStart?: boolean
  neverResolveAppend?: boolean
  blockFirstAppend?: boolean
  failAppend?: boolean
  failSchedule?: boolean
}

type FileHarness = TelemetryFileOperations & {
  contents: Map<string, string>
  byteSizes: Map<string, number>
  ensureCalls: string[]
  sizeCalls: string[]
  appendCalls: AppendCall[]
  renameCalls: RenameCall[]
  removePaths: string[]
  failAppend: boolean
  failRemovePath: string | null
  failRenameFrom: string | null
  appendStarted: boolean
  appendSettled: boolean
  seed(filePath: string, byteLength: number, contents?: string): void
  releaseAppend(): void
}

type TelemetryHarness = {
  telemetry: Telemetry
  files: FileHarness
  scheduled: Array<() => Promise<void>>
  runningDrains: Array<Promise<void>>
  schedulerControl: { failSchedule: boolean }
  get scheduleCount(): number
}

function syntheticEvent(
  index?: number,
  overrides: Partial<TelemetryEventInput> = {},
): TelemetryEventInput {
  const event = index === undefined
    ? 'synthetic_event'
    : `synthetic_event_${String(index).padStart(4, '0')}`
  return {
    module: 'app',
    event,
    status: 'success',
    ...overrides,
  }
}

function asInput(value: unknown): TelemetryEventInput {
  return value as TelemetryEventInput
}

function makeHarness(options: HarnessOptions = {}): TelemetryHarness {
  const contents = new Map<string, string>()
  const byteSizes = new Map<string, number>()
  const ensureCalls: string[] = []
  const sizeCalls: string[] = []
  const appendCalls: AppendCall[] = []
  const renameCalls: RenameCall[] = []
  const removePaths: string[] = []

  let releaseNeverAppend: (() => void) | undefined
  let releaseBlockedAppend: (() => void) | undefined
  let firstAppendBlocked = false
  let scheduleCount = 0

  const files: FileHarness = {
    contents,
    byteSizes,
    ensureCalls,
    sizeCalls,
    appendCalls,
    renameCalls,
    removePaths,
    failAppend: options.failAppend ?? false,
    failRemovePath: null,
    failRenameFrom: null,
    appendStarted: false,
    appendSettled: false,
    seed(filePath, byteLength, seededContents = '') {
      contents.set(filePath, seededContents)
      byteSizes.set(filePath, byteLength)
    },
    releaseAppend() {
      const release = releaseNeverAppend ?? releaseBlockedAppend
      releaseNeverAppend = undefined
      releaseBlockedAppend = undefined
      release?.()
    },
    async ensureDirectory(directoryPath) {
      ensureCalls.push(directoryPath)
    },
    async size(filePath) {
      sizeCalls.push(filePath)
      return byteSizes.get(filePath) ?? null
    },
    async append(filePath, data) {
      appendCalls.push({ filePath, data })
      files.appendStarted = true

      if (files.failAppend) {
        throw new Error(RAW_ERROR_SENTINEL)
      }

      if (options.neverResolveAppend) {
        await new Promise<void>((resolve) => {
          releaseNeverAppend = resolve
        })
      }

      if (options.blockFirstAppend && !firstAppendBlocked) {
        firstAppendBlocked = true
        await new Promise<void>((resolve) => {
          releaseBlockedAppend = resolve
        })
      }

      const previousContents = contents.get(filePath) ?? ''
      const previousBytes = byteSizes.get(filePath) ?? Buffer.byteLength(previousContents, 'utf8')
      contents.set(filePath, previousContents + data)
      byteSizes.set(filePath, previousBytes + Buffer.byteLength(data, 'utf8'))
      files.appendSettled = true
    },
    async rename(fromPath, toPath) {
      renameCalls.push({ fromPath, toPath })
      if (files.failRenameFrom === fromPath) {
        throw new Error(RAW_ERROR_SENTINEL)
      }

      const sourceContents = contents.get(fromPath)
      const sourceBytes = byteSizes.get(fromPath)
      contents.delete(fromPath)
      byteSizes.delete(fromPath)
      if (sourceContents === undefined) contents.delete(toPath)
      else contents.set(toPath, sourceContents)
      if (sourceBytes === undefined) byteSizes.delete(toPath)
      else byteSizes.set(toPath, sourceBytes)
    },
    async remove(filePath) {
      removePaths.push(filePath)
      if (files.failRemovePath === filePath) {
        throw new Error(RAW_ERROR_SENTINEL)
      }
      contents.delete(filePath)
      byteSizes.delete(filePath)
    },
  }

  const scheduled: Array<() => Promise<void>> = []
  const runningDrains: Array<Promise<void>> = []
  const schedulerControl = {
    failSchedule: options.failSchedule ?? false,
  }
  const scheduler: TelemetryDrainScheduler = {
    schedule(drain) {
      scheduleCount += 1
      if (schedulerControl.failSchedule) {
        throw new Error(RAW_ERROR_SENTINEL)
      }
      if (options.autoStart) {
        runningDrains.push(drain())
      } else {
        scheduled.push(drain)
      }
    },
  }

  const telemetryOptions = {
    directory: DIRECTORY,
    clock: options.clock ?? (() => FIXED_TIME),
    files,
    scheduler,
    ...(options.filePrefix === undefined ? {} : { filePrefix: options.filePrefix }),
  }
  const telemetry = createTelemetry(telemetryOptions)

  return {
    telemetry,
    files,
    scheduled,
    runningDrains,
    schedulerControl,
    get scheduleCount() {
      return scheduleCount
    },
  }
}

async function runNextScheduled(harness: TelemetryHarness): Promise<void> {
  const drain = harness.scheduled.shift()
  expect(drain).toBeDefined()
  await drain!()
}

async function settleMicrotasks(turns = 4): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve()
  }
}

type PageFilters = Pick<TelemetryPageRequest, 'module' | 'status' | 'source'>

function readAllEvents(telemetry: Telemetry, filters: PageFilters = {}): MirrorEvent[] {
  const events: MirrorEvent[] = []
  let beforeSequence: number | undefined

  for (;;) {
    const request: TelemetryPageRequest = {
      ...filters,
      limit: TELEMETRY_DEFAULTS.maxPageSize,
    }
    if (beforeSequence !== undefined) request.beforeSequence = beforeSequence

    const page = telemetry.readPage(request)
    events.push(...page.events)
    if (page.nextBeforeSequence === null) return events
    beforeSequence = page.nextBeforeSequence
  }
}

function expectEventByName(events: readonly MirrorEvent[], eventName: string): MirrorEvent {
  const event = events.find((candidate) => candidate.event === eventName)
  expect(event).toBeDefined()
  return event!
}

function decodeLine(data: string): MirrorEvent {
  expect(data.endsWith('\n')).toBe(true)
  expect(data.slice(0, -1)).not.toContain('\n')
  expect(data).not.toContain('\r')
  return JSON.parse(data.slice(0, -1)) as MirrorEvent
}

function activePath(filePrefix: string = TELEMETRY_DEFAULTS.filePrefix): string {
  return join(DIRECTORY, `${filePrefix}-0.jsonl`)
}

describe('Main-owned metadata-only telemetry contract', () => {
  it('exports the exact production bounds', () => {
    expect(TELEMETRY_DEFAULTS).toEqual({
      ramLimit: 2000,
      queueLimit: 1000,
      maxFileBytes: 5 * 1024 * 1024,
      maxFiles: 5,
      pageSize: 50,
      maxPageSize: 200,
      filePrefix: 'telemetry',
    })
  })

  it('owns time, observes RAM synchronously, and serializes exact optional-field order', async () => {
    const harness = makeHarness()
    const input = asInput({
      source: 'contract_test',
      reason: 'cause=synthetic;detail=utf8',
      scene_id: 'scene.synthetic-1',
      session_id: 'session.synthetic-1',
      error_code: 'synthetic_failure',
      duration_ms: 12.5,
      status: 'degraded',
      event: 'synthetic_event',
      module: 'app',
      time: INPUT_TIME,
    })

    expect(() => harness.telemetry.emit(input)).not.toThrow()
    expect(harness.telemetry.getStats().ramEventCount).toBeGreaterThan(0)
    expect(harness.telemetry.getStats().queueDepth).toBe(1)
    expect(harness.scheduled).toHaveLength(1)
    expect(harness.files.appendCalls).toEqual([])

    const accepted = expectEventByName(readAllEvents(harness.telemetry), 'synthetic_event')
    expect(accepted).toEqual({
      time: FIXED_TIME,
      module: 'app',
      event: 'synthetic_event',
      status: 'degraded',
      duration_ms: 12.5,
      error_code: 'synthetic_failure',
      session_id: 'session.synthetic-1',
      scene_id: 'scene.synthetic-1',
      reason: 'cause=synthetic;detail=utf8',
      source: 'contract_test',
    })
    expect(Object.keys(accepted)).toEqual([
      'time',
      'module',
      'event',
      'status',
      'duration_ms',
      'error_code',
      'session_id',
      'scene_id',
      'reason',
      'source',
    ])
    expect(harness.telemetry.getStats().extraFieldStrippedCount).toBe(1)

    await runNextScheduled(harness)

    expect(harness.files.ensureCalls).toEqual([DIRECTORY])
    expect(harness.files.appendCalls).toHaveLength(1)
    const line = harness.files.appendCalls[0].data
    const expectedLine = JSON.stringify(accepted) + '\n'
    expect(line).toBe(expectedLine)
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(line).not.toContain('\r')
    expect(Buffer.byteLength(line, 'utf8')).toBe(Buffer.byteLength(expectedLine, 'utf8'))
    expect(decodeLine(line)).toEqual(accepted)
  })

  it('omits every undefined optional field and defaults omitted source to runtime', async () => {
    const harness = makeHarness()
    harness.telemetry.emit({
      module: 'audio',
      event: 'optional_omission',
      status: 'info',
    })

    const accepted = expectEventByName(readAllEvents(harness.telemetry), 'optional_omission')
    expect(accepted).toEqual({
      time: FIXED_TIME,
      module: 'audio',
      event: 'optional_omission',
      status: 'info',
      source: 'runtime',
    })
    expect(Object.keys(accepted)).toEqual(['time', 'module', 'event', 'status', 'source'])
    expect(Object.prototype.hasOwnProperty.call(accepted, 'duration_ms')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(accepted, 'error_code')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(accepted, 'session_id')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(accepted, 'scene_id')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(accepted, 'reason')).toBe(false)

    await runNextScheduled(harness)
    expect(harness.files.appendCalls[0].data).toBe(JSON.stringify(accepted) + '\n')
  })

  it('strips arbitrary and sensitive extras before RAM or JSONL construction', async () => {
    const harness = makeHarness()
    let unknownReads = 0
    const input: Record<string, unknown> = {
      module: 'app',
      event: 'privacy_event',
      status: 'success',
      reason: 'cause=synthetic',
      source: 'simulator',
    }

    for (const fieldName of SENSITIVE_FIELD_NAMES) {
      Object.defineProperty(input, fieldName, {
        configurable: true,
        enumerable: true,
        get() {
          unknownReads += 1
          return fieldName === 'audio' ? AUDIO_SENTINEL : TRANSCRIPT_SENTINEL
        },
      })
    }

    expect(() => harness.telemetry.emit(asInput(input))).not.toThrow()
    expect(unknownReads).toBe(0)

    const eventsBeforeDrain = readAllEvents(harness.telemetry)
    const accepted = expectEventByName(eventsBeforeDrain, 'privacy_event')
    expect(Object.keys(accepted)).toEqual([
      'time',
      'module',
      'event',
      'status',
      'reason',
      'source',
    ])
    for (const fieldName of SENSITIVE_FIELD_NAMES) {
      expect(Object.prototype.hasOwnProperty.call(accepted, fieldName)).toBe(false)
    }

    const metadataOnlyRam = JSON.stringify(eventsBeforeDrain)
    expect(metadataOnlyRam).not.toContain(TRANSCRIPT_SENTINEL)
    expect(metadataOnlyRam).not.toContain(AUDIO_SENTINEL)
    for (const fieldName of SENSITIVE_FIELD_NAMES) {
      expect(metadataOnlyRam).not.toContain(fieldName)
    }

    const stripped = expectEventByName(eventsBeforeDrain, 'telemetry_extra_fields_stripped')
    expect(stripped).toEqual({
      time: FIXED_TIME,
      module: 'telemetry',
      event: 'telemetry_extra_fields_stripped',
      status: 'info',
      reason: `field_count=${SENSITIVE_FIELD_NAMES.length}`,
      source: 'runtime',
    })
    expect(harness.telemetry.getStats().extraFieldStrippedCount).toBe(SENSITIVE_FIELD_NAMES.length)

    await runNextScheduled(harness)
    expect(harness.files.appendCalls).toHaveLength(1)
    const serialized = harness.files.appendCalls[0].data
    expect(serialized).not.toContain(TRANSCRIPT_SENTINEL)
    expect(serialized).not.toContain(AUDIO_SENTINEL)
    for (const fieldName of SENSITIVE_FIELD_NAMES) {
      expect(serialized).not.toContain(fieldName)
    }
    expect(decodeLine(serialized)).toEqual(accepted)
  })

  it('rejects invalid inputs with stable metadata-only diagnostics and never throws', () => {
    const harness = makeHarness()
    const invalidCases: Array<{ field: string; input: unknown }> = [
      { field: 'module', input: syntheticEvent(undefined, { module: 'not-a-module' } as never) },
      { field: 'event', input: syntheticEvent(undefined, { event: 'Invalid Event' } as never) },
      { field: 'status', input: syntheticEvent(undefined, { status: 'pending' } as never) },
      { field: 'source', input: syntheticEvent(undefined, { source: 'unknown-source' } as never) },
      { field: 'duration_ms', input: syntheticEvent(undefined, { duration_ms: -1 }) },
      { field: 'duration_ms', input: syntheticEvent(undefined, { duration_ms: Number.POSITIVE_INFINITY }) },
      { field: 'error_code', input: syntheticEvent(undefined, { error_code: 'Synthetic Error!' }) },
      { field: 'session_id', input: syntheticEvent(undefined, { session_id: 'not a safe id' }) },
      { field: 'scene_id', input: syntheticEvent(undefined, { scene_id: '' }) },
      {
        field: 'reason',
        input: syntheticEvent(undefined, { reason: `${RAW_ERROR_SENTINEL} with spaces` }),
      },
    ]

    for (const invalidCase of invalidCases) {
      expect(() => harness.telemetry.emit(asInput(invalidCase.input))).not.toThrow()
    }
    expect(() => harness.telemetry.emit(null as unknown as TelemetryEventInput)).not.toThrow()
    expect(() => harness.telemetry.emit([] as unknown as TelemetryEventInput)).not.toThrow()

    const events = readAllEvents(harness.telemetry)
    const rejected = events.filter((event) => event.event === 'telemetry_event_rejected')
    expect(rejected).toHaveLength(invalidCases.length + 2)
    expect(rejected.every((event) => event.module === 'telemetry')).toBe(true)
    expect(rejected.every((event) => event.status === 'failed')).toBe(true)
    expect(rejected.every((event) => event.source === 'runtime')).toBe(true)
    expect(rejected.every((event) => event.error_code === 'telemetry_event_invalid')).toBe(true)
    expect(rejected.every((event) => /^cause=validation_failed;field=[a-z_]+$/.test(event.reason ?? ''))).toBe(true)

    for (const invalidCase of invalidCases) {
      expect(rejected).toContainEqual(expect.objectContaining({
        reason: `cause=validation_failed;field=${invalidCase.field}`,
      }))
    }
    expect(JSON.stringify(events)).not.toContain(RAW_ERROR_SENTINEL)
    expect(harness.telemetry.getStats()).toMatchObject({
      rejectedEventCount: invalidCases.length + 2,
      queueDepth: 0,
    })
    expect(harness.scheduleCount).toBe(0)
  })

  it('falls back to canonical UTC time for every invalid injected clock result', async () => {
    const badClockCases: Array<{ clock: TelemetryClock; candidate: string }> = [
      {
        clock: () => {
          throw new Error(RAW_ERROR_SENTINEL)
        },
        candidate: RAW_ERROR_SENTINEL,
      },
      {
        clock: () => 'synthetic-invalid-clock',
        candidate: 'synthetic-invalid-clock',
      },
      {
        clock: () => '2026-08-19T00:00:00.00Z',
        candidate: '2026-08-19T00:00:00.00Z',
      },
      {
        clock: () => '2026-08-19T08:00:00.000+08:00',
        candidate: '2026-08-19T08:00:00.000+08:00',
      },
      {
        clock: () => `${FIXED_TIME}-extra`,
        candidate: `${FIXED_TIME}-extra`,
      },
    ]

    const expectCanonicalUtcTime = (time: string): void => {
      expect(time).toHaveLength(24)
      expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(new Date(time).toISOString()).toBe(time)
    }

    for (const [index, badClock] of badClockCases.entries()) {
      const harness = makeHarness({ clock: badClock.clock })
      const eventName = `clock_fallback_event_${index}`
      expect(() => harness.telemetry.emit(syntheticEvent(undefined, { event: eventName }))).not.toThrow()

      const events = readAllEvents(harness.telemetry)
      const accepted = expectEventByName(events, eventName)
      const fallbackDiagnostics = events.filter((event) => event.event === 'telemetry_event_rejected')
      expect(events).toHaveLength(2)
      expectCanonicalUtcTime(accepted.time)
      expect(fallbackDiagnostics).toHaveLength(1)
      expectCanonicalUtcTime(fallbackDiagnostics[0].time)
      expect(fallbackDiagnostics[0]).toEqual({
        time: fallbackDiagnostics[0].time,
        module: 'telemetry',
        event: 'telemetry_event_rejected',
        status: 'failed',
        error_code: 'telemetry_event_invalid',
        reason: 'cause=clock_fallback',
        source: 'runtime',
      })
      expect(harness.telemetry.getStats().queueDepth).toBe(1)

      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(RAW_ERROR_SENTINEL)
      expect(serializedEvents).not.toContain(badClock.candidate)

      await runNextScheduled(harness)
      expect(harness.files.appendCalls).toHaveLength(1)
      expect(decodeLine(harness.files.appendCalls[0].data)).toEqual(accepted)
    }
  })

  it('preserves and filters runtime, simulator, and contract_test sources without relabeling', async () => {
    const harness = makeHarness()
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'runtime_default' }))
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'runtime_explicit', source: 'runtime' }))
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'simulator_record', source: 'simulator' }))
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'contract_record', source: 'contract_test' }))

    const runtimeEvents = harness.telemetry.readPage({ source: 'runtime', limit: 50 }).events
    const simulatorEvents = harness.telemetry.readPage({ source: 'simulator', limit: 50 }).events
    const contractEvents = harness.telemetry.readPage({ source: 'contract_test', limit: 50 }).events
    expect(new Set(runtimeEvents.map((event) => event.event))).toEqual(new Set([
      'runtime_default',
      'runtime_explicit',
    ]))
    expect(simulatorEvents.map((event) => event.event)).toEqual(['simulator_record'])
    expect(contractEvents.map((event) => event.event)).toEqual(['contract_record'])
    expect(simulatorEvents.every((event) => event.source === 'simulator')).toBe(true)
    expect(contractEvents.every((event) => event.source === 'contract_test')).toBe(true)
    expect(runtimeEvents.every((event) => event.source === 'runtime')).toBe(true)

    await runNextScheduled(harness)
    const appended = harness.files.appendCalls.map((call) => decodeLine(call.data))
    expect(new Set(appended.map((event) => event.source))).toEqual(new Set([
      'runtime',
      'simulator',
      'contract_test',
    ]))
  })

  it('keeps exactly 2,000 RAM events and paginates newest-first with an exclusive cursor', async () => {
    const harness = makeHarness()
    for (let index = 1; index <= TELEMETRY_DEFAULTS.ramLimit + 1; index += 1) {
      harness.telemetry.emit(syntheticEvent(index))
      await runNextScheduled(harness)
    }

    expect(harness.telemetry.getStats()).toMatchObject({
      ramEventCount: TELEMETRY_DEFAULTS.ramLimit,
      ramEvictedCount: 1,
      telemetryDroppedCount: 0,
      queueDepth: 0,
    })

    const allEvents = readAllEvents(harness.telemetry)
    expect(allEvents).toHaveLength(TELEMETRY_DEFAULTS.ramLimit)
    expect(allEvents[0].event).toBe('synthetic_event_2001')
    expect(allEvents.at(-1)?.event).toBe('synthetic_event_0002')
    expect(allEvents.some((event) => event.event === 'synthetic_event_0001')).toBe(false)
    expect(Object.keys(allEvents[0])).not.toContain('sequence')

    const firstPage = harness.telemetry.readPage({ limit: 2 })
    expect(firstPage.events.map((event) => event.event)).toEqual([
      'synthetic_event_2001',
      'synthetic_event_2000',
    ])
    expect(firstPage.nextBeforeSequence).not.toBeNull()

    const secondPage = harness.telemetry.readPage({
      limit: 2,
      beforeSequence: firstPage.nextBeforeSequence!,
    })
    expect(secondPage.events.map((event) => event.event)).toEqual([
      'synthetic_event_1999',
      'synthetic_event_1998',
    ])
    expect(new Set([
      ...firstPage.events.map((event) => event.event),
      ...secondPage.events.map((event) => event.event),
    ]).size).toBe(4)

    const thirdPage = harness.telemetry.readPage({
      limit: 2,
      beforeSequence: secondPage.nextBeforeSequence!,
    })
    expect(thirdPage.events.map((event) => event.event)).toEqual([
      'synthetic_event_1997',
      'synthetic_event_1996',
    ])
    expect(thirdPage.events.some((event) => event.event === 'synthetic_event_1998')).toBe(false)

    const evictionGap = harness.telemetry.readPage({ limit: 10, beforeSequence: 3 })
    expect(evictionGap.events.map((event) => event.event)).toEqual(['synthetic_event_0002'])

    const mutatedPage = harness.telemetry.readPage({ limit: 1 })
    mutatedPage.events[0].event = 'mutated_test_only'
    expect(harness.telemetry.readPage({ limit: 1 }).events[0].event).toBe('synthetic_event_2001')

    expect(harness.telemetry.readPage({ limit: 0 }).events).toHaveLength(1)
    expect(harness.telemetry.readPage({ limit: -1 }).events).toHaveLength(1)
    expect(harness.telemetry.readPage({ limit: 999 }).events).toHaveLength(200)
    expect(harness.telemetry.readPage({ limit: Number.NaN }).events).toHaveLength(50)
  })

  it('filters pagination by module, status, and source', () => {
    const harness = makeHarness()
    harness.telemetry.emit({
      module: 'app',
      event: 'filter_app_success',
      status: 'success',
      source: 'runtime',
    })
    harness.telemetry.emit({
      module: 'wake',
      event: 'filter_wake_degraded',
      status: 'degraded',
      source: 'simulator',
    })
    harness.telemetry.emit({
      module: 'app',
      event: 'filter_app_info',
      status: 'info',
      source: 'contract_test',
    })
    harness.telemetry.emit({
      module: 'camera',
      event: 'filter_camera_failed',
      status: 'failed',
      source: 'runtime',
    })

    expect(harness.telemetry.readPage({ module: 'app', limit: 50 }).events.map((event) => event.event)).toEqual([
      'filter_app_info',
      'filter_app_success',
    ])
    expect(harness.telemetry.readPage({ status: 'degraded', limit: 50 }).events.map((event) => event.event)).toEqual([
      'filter_wake_degraded',
    ])
    expect(harness.telemetry.readPage({ source: 'contract_test', limit: 50 }).events.map((event) => event.event)).toEqual([
      'filter_app_info',
    ])
    expect(harness.telemetry.readPage({
      module: 'app',
      status: 'success',
      source: 'runtime',
      limit: 50,
    }).events.map((event) => event.event)).toEqual(['filter_app_success'])
  })

  it('caps the pending FIFO queue at 1,000 and records one direct oldest-drop diagnostic', async () => {
    const harness = makeHarness()
    for (let index = 1; index <= TELEMETRY_DEFAULTS.queueLimit + 1; index += 1) {
      expect(() => harness.telemetry.emit(syntheticEvent(index, { event: `queue_event_${String(index).padStart(4, '0')}` }))).not.toThrow()
    }

    expect(harness.telemetry.getStats()).toMatchObject({
      queueDepth: TELEMETRY_DEFAULTS.queueLimit,
      telemetryDroppedCount: 1,
    })
    expect(harness.scheduled).toHaveLength(1)
    expect(harness.scheduleCount).toBe(1)

    const eventsBeforeDrain = readAllEvents(harness.telemetry)
    const queueDrop = expectEventByName(eventsBeforeDrain, 'telemetry_queue_drop')
    expect(queueDrop).toEqual({
      time: FIXED_TIME,
      module: 'telemetry',
      event: 'telemetry_queue_drop',
      status: 'degraded',
      error_code: 'telemetry_queue_full',
      reason: 'cause=queue_full;dropped=oldest;queue_limit=1000',
      source: 'runtime',
    })

    await runNextScheduled(harness)

    const appendedEvents = harness.files.appendCalls.map((call) => decodeLine(call.data))
    expect(appendedEvents).toHaveLength(TELEMETRY_DEFAULTS.queueLimit)
    expect(appendedEvents[0].event).toBe('queue_event_0002')
    expect(appendedEvents.at(-1)?.event).toBe('queue_event_1001')
    expect(appendedEvents.some((event) => event.event === 'queue_event_0001')).toBe(false)
    expect(appendedEvents.some((event) => event.event === 'telemetry_queue_drop')).toBe(false)
    expect(harness.telemetry.getStats().queueDepth).toBe(0)
    expect(harness.telemetry.getStats().telemetryDroppedCount).toBe(1)
  })

  it('returns from emit before a pending writer settles and never waits on disk', async () => {
    const harness = makeHarness({ autoStart: true, neverResolveAppend: true })
    let returned = false
    let result: void | undefined

    expect(() => {
      result = harness.telemetry.emit(syntheticEvent(undefined, { event: 'pending_writer_event' }))
      returned = true
    }).not.toThrow()
    expect(result).toBeUndefined()
    expect(returned).toBe(true)

    await settleMicrotasks()
    expect(harness.files.appendStarted).toBe(true)
    expect(harness.files.appendSettled).toBe(false)
    expect(harness.runningDrains).toHaveLength(1)

    harness.files.releaseAppend()
    await Promise.all(harness.runningDrains)
    expect(harness.files.appendSettled).toBe(true)
  })

  it('drains one scheduled FIFO callback and keeps events emitted during an awaited write in order', async () => {
    const harness = makeHarness({ blockFirstAppend: true })
    harness.telemetry.emit(syntheticEvent(1, { event: 'fifo_event_0001' }))
    harness.telemetry.emit(syntheticEvent(2, { event: 'fifo_event_0002' }))
    harness.telemetry.emit(syntheticEvent(3, { event: 'fifo_event_0003' }))
    expect(harness.scheduleCount).toBe(1)

    const drain = harness.scheduled.shift()!
    const drainPromise = drain()
    await settleMicrotasks()
    expect(harness.files.appendCalls.map((call) => decodeLine(call.data).event)).toEqual([
      'fifo_event_0001',
    ])

    harness.telemetry.emit(syntheticEvent(4, { event: 'fifo_event_0004' }))
    expect(harness.scheduleCount).toBe(1)
    harness.files.releaseAppend()
    await drainPromise

    expect(harness.files.ensureCalls).toEqual([DIRECTORY])
    expect(harness.files.appendCalls.map((call) => decodeLine(call.data).event)).toEqual([
      'fifo_event_0001',
      'fifo_event_0002',
      'fifo_event_0003',
      'fifo_event_0004',
    ])
    expect(harness.telemetry.getStats().queueDepth).toBe(0)
  })

  it('uses a configurable file prefix for the injected writer path', async () => {
    const harness = makeHarness({ filePrefix: 'contract' })
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'prefix_event' }))
    await runNextScheduled(harness)
    expect(harness.files.appendCalls[0].filePath).toBe(activePath('contract'))
  })

  it('accepts an exact-fit UTF-8 line and rotates on a one-byte overflow', async () => {
    const exactHarness = makeHarness()
    exactHarness.telemetry.emit(syntheticEvent(undefined, { event: 'rotation_boundary_event' }))
    const exactEvent = expectEventByName(readAllEvents(exactHarness.telemetry), 'rotation_boundary_event')
    const exactLine = JSON.stringify(exactEvent) + '\n'
    const lineBytes = Buffer.byteLength(exactLine, 'utf8')
    expect(lineBytes).toBeGreaterThan(1)
    const exactActivePath = activePath()
    exactHarness.files.seed(exactActivePath, TELEMETRY_DEFAULTS.maxFileBytes - lineBytes)

    await runNextScheduled(exactHarness)
    expect(exactHarness.files.removePaths).toEqual([])
    expect(exactHarness.files.renameCalls).toEqual([])
    expect(exactHarness.files.appendCalls).toHaveLength(1)
    expect(exactHarness.files.byteSizes.get(exactActivePath)).toBe(TELEMETRY_DEFAULTS.maxFileBytes)

    const overflowHarness = makeHarness()
    overflowHarness.telemetry.emit(syntheticEvent(undefined, { event: 'rotation_boundary_event' }))
    const overflowEvent = expectEventByName(readAllEvents(overflowHarness.telemetry), 'rotation_boundary_event')
    const overflowLine = JSON.stringify(overflowEvent) + '\n'
    expect(Buffer.byteLength(overflowLine, 'utf8')).toBe(lineBytes)
    const overflowActivePath = activePath()
    overflowHarness.files.seed(
      overflowActivePath,
      TELEMETRY_DEFAULTS.maxFileBytes - lineBytes + 1,
    )
    const olderPaths = [1, 2, 3, 4].map((suffix) => join(DIRECTORY, `telemetry-${suffix}.jsonl`))
    olderPaths.forEach((filePath, index) => {
      overflowHarness.files.seed(filePath, Buffer.byteLength(`old-${index + 1}`, 'utf8'), `old-${index + 1}`)
    })

    await runNextScheduled(overflowHarness)

    expect(overflowHarness.files.removePaths).toEqual([
      join(DIRECTORY, 'telemetry-4.jsonl'),
    ])
    expect(overflowHarness.files.renameCalls).toEqual([
      {
        fromPath: join(DIRECTORY, 'telemetry-3.jsonl'),
        toPath: join(DIRECTORY, 'telemetry-4.jsonl'),
      },
      {
        fromPath: join(DIRECTORY, 'telemetry-2.jsonl'),
        toPath: join(DIRECTORY, 'telemetry-3.jsonl'),
      },
      {
        fromPath: join(DIRECTORY, 'telemetry-1.jsonl'),
        toPath: join(DIRECTORY, 'telemetry-2.jsonl'),
      },
      {
        fromPath: join(DIRECTORY, 'telemetry-0.jsonl'),
        toPath: join(DIRECTORY, 'telemetry-1.jsonl'),
      },
    ])
    expect(overflowHarness.files.contents.get(overflowActivePath)).toBe(overflowLine)
    expect(overflowHarness.files.contents.get(join(DIRECTORY, 'telemetry-1.jsonl'))).toBe('')
    expect(overflowHarness.files.contents.get(join(DIRECTORY, 'telemetry-2.jsonl'))).toBe('old-1')
    expect(overflowHarness.files.contents.get(join(DIRECTORY, 'telemetry-3.jsonl'))).toBe('old-2')
    expect(overflowHarness.files.contents.get(join(DIRECTORY, 'telemetry-4.jsonl'))).toBe('old-3')
    expect(overflowHarness.files.byteSizes.size).toBe(TELEMETRY_DEFAULTS.maxFiles)
    expect([...overflowHarness.files.byteSizes.keys()].every((filePath) => /telemetry-[0-4]\.jsonl$/.test(filePath))).toBe(true)
  })

  it('accepts a maximum-valid record below the fixed file cap', async () => {
    const harness = makeHarness({ clock: () => FIXED_TIME })
    const maxValidInput: TelemetryEventInput = {
      module: 'telemetry',
      event: `e${'a'.repeat(63)}`,
      status: 'degraded',
      duration_ms: 86400000,
      error_code: `e${'a'.repeat(63)}`,
      session_id: 'A'.repeat(128),
      scene_id: 'B'.repeat(128),
      reason: 'r'.repeat(1024),
      source: 'contract_test',
    }

    expect(maxValidInput.event).toHaveLength(64)
    expect(maxValidInput.error_code).toHaveLength(64)
    expect(maxValidInput.session_id).toHaveLength(128)
    expect(maxValidInput.scene_id).toHaveLength(128)
    expect(maxValidInput.reason).toHaveLength(1024)
    expect(() => harness.telemetry.emit(maxValidInput)).not.toThrow()

    const accepted = expectEventByName(readAllEvents(harness.telemetry), maxValidInput.event)
    expect(accepted).toEqual({
      time: FIXED_TIME,
      ...maxValidInput,
    })

    await runNextScheduled(harness)

    expect(harness.files.appendCalls).toHaveLength(1)
    const actualLine = harness.files.appendCalls[0].data
    expect(actualLine.endsWith('\n')).toBe(true)
    expect((actualLine.match(/\n/g) ?? [])).toHaveLength(1)
    expect(actualLine.slice(0, -1)).not.toContain('\n')
    expect(actualLine).not.toContain('\r')
    expect(Buffer.byteLength(actualLine, 'utf8')).toBeLessThan(TELEMETRY_DEFAULTS.maxFileBytes)
    expect(actualLine).toBe(JSON.stringify(accepted) + '\n')
    expect(decodeLine(actualLine)).toEqual(accepted)
  })

  it('degrades on writer failure, clears bounded work, and can retry after recovery', async () => {
    const harness = makeHarness({ failAppend: true })
    harness.telemetry.emit(syntheticEvent(1, { event: 'writer_failure_0001' }))
    harness.telemetry.emit(syntheticEvent(2, { event: 'writer_failure_0002' }))
    await expect(runNextScheduled(harness)).resolves.toBeUndefined()

    const events = readAllEvents(harness.telemetry)
    const diagnostic = expectEventByName(events, 'telemetry_writer_degraded')
    expect(diagnostic).toEqual({
      time: FIXED_TIME,
      module: 'telemetry',
      event: 'telemetry_writer_degraded',
      status: 'degraded',
      error_code: 'telemetry_writer_failed',
      reason: 'cause=writer_failure;dropped_count=2',
      source: 'runtime',
    })
    expect(harness.telemetry.getStats()).toMatchObject({
      telemetryDroppedCount: 2,
      writerFailureCount: 1,
      rotationFailureCount: 0,
      schedulerFailureCount: 0,
      queueDepth: 0,
    })
    expect(JSON.stringify(events)).not.toContain(RAW_ERROR_SENTINEL)
    expect(harness.files.appendCalls).toHaveLength(1)
    expect(harness.files.appendCalls[0].data).not.toContain('telemetry_writer_degraded')
    await expect(harness.telemetry.flush()).resolves.toBeUndefined()

    harness.files.failAppend = false
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'writer_recovery_event' }))
    await runNextScheduled(harness)
    expect(harness.files.appendCalls.map((call) => decodeLine(call.data).event)).toEqual([
      'writer_failure_0001',
      'writer_recovery_event',
    ])
  })

  it('degrades on remove and rename rotation failures without exposing adapter errors', async () => {
    for (const failureKind of ['remove', 'rename'] as const) {
      const harness = makeHarness()
      const event = syntheticEvent(undefined, { event: `rotation_${failureKind}_failure` })
      harness.telemetry.emit(event)
      const accepted = expectEventByName(readAllEvents(harness.telemetry), event.event)
      const lineBytes = Buffer.byteLength(JSON.stringify(accepted) + '\n', 'utf8')
      harness.files.seed(activePath(), TELEMETRY_DEFAULTS.maxFileBytes - lineBytes + 1)
      for (let suffix = 1; suffix <= 4; suffix += 1) {
        const filePath = join(DIRECTORY, `telemetry-${suffix}.jsonl`)
        harness.files.seed(filePath, 1, `x${suffix}`)
      }
      if (failureKind === 'remove') {
        harness.files.failRemovePath = join(DIRECTORY, 'telemetry-4.jsonl')
      } else {
        harness.files.failRenameFrom = join(DIRECTORY, 'telemetry-3.jsonl')
      }

      await expect(runNextScheduled(harness)).resolves.toBeUndefined()

      const events = readAllEvents(harness.telemetry)
      const diagnostic = expectEventByName(events, 'telemetry_writer_degraded')
      expect(diagnostic).toEqual({
        time: FIXED_TIME,
        module: 'telemetry',
        event: 'telemetry_writer_degraded',
        status: 'degraded',
        error_code: 'telemetry_rotation_failed',
        reason: 'cause=rotation_failure;dropped_count=1',
        source: 'runtime',
      })
      expect(harness.telemetry.getStats()).toMatchObject({
        telemetryDroppedCount: 1,
        writerFailureCount: 0,
        rotationFailureCount: 1,
        queueDepth: 0,
      })
      expect(JSON.stringify(events)).not.toContain(RAW_ERROR_SENTINEL)
      expect(harness.files.appendCalls).toEqual([])
      await expect(harness.telemetry.flush()).resolves.toBeUndefined()
    }
  })

  it('degrades on scheduler failure, clears the queued item, and keeps later emit usable', async () => {
    const harness = makeHarness({ failSchedule: true })
    expect(() => harness.telemetry.emit(syntheticEvent(undefined, { event: 'scheduler_failure_event' }))).not.toThrow()
    expect(harness.telemetry.getStats()).toMatchObject({
      schedulerFailureCount: 1,
      telemetryDroppedCount: 1,
      queueDepth: 0,
    })
    const events = readAllEvents(harness.telemetry)
    const diagnostic = expectEventByName(events, 'telemetry_scheduler_degraded')
    expect(diagnostic).toEqual({
      time: FIXED_TIME,
      module: 'telemetry',
      event: 'telemetry_scheduler_degraded',
      status: 'degraded',
      error_code: 'telemetry_scheduler_failed',
      reason: 'cause=scheduler_failure;dropped_count=1',
      source: 'runtime',
    })
    expect(JSON.stringify(events)).not.toContain(RAW_ERROR_SENTINEL)
    expect(harness.scheduled).toEqual([])

    harness.schedulerControl.failSchedule = false
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'scheduler_recovery_event' }))
    await runNextScheduled(harness)
    expect(harness.files.appendCalls.map((call) => decodeLine(call.data).event)).toEqual([
      'scheduler_recovery_event',
    ])
  })

  it('flushes directly, close drains queued work idempotently, and post-close emit is visible but not queued', async () => {
    const harness = makeHarness()
    harness.telemetry.emit(syntheticEvent(1, { event: 'flush_event_0001' }))
    harness.telemetry.emit(syntheticEvent(2, { event: 'flush_event_0002' }))
    expect(harness.scheduled).toHaveLength(1)

    await expect(harness.telemetry.flush()).resolves.toBeUndefined()
    expect(harness.telemetry.getStats().queueDepth).toBe(0)
    expect(harness.files.appendCalls.map((call) => decodeLine(call.data).event)).toEqual([
      'flush_event_0001',
      'flush_event_0002',
    ])

    await expect(harness.telemetry.close()).resolves.toBeUndefined()
    const appendCountAfterFirstClose = harness.files.appendCalls.length
    await expect(harness.telemetry.close()).resolves.toBeUndefined()
    expect(harness.files.appendCalls).toHaveLength(appendCountAfterFirstClose)
    expect(harness.telemetry.getStats().closed).toBe(true)

    expect(() => harness.telemetry.emit(syntheticEvent(undefined, { event: 'post_close_event' }))).not.toThrow()
    expect(harness.telemetry.getStats()).toMatchObject({
      closed: true,
      queueDepth: 0,
      telemetryDroppedCount: 1,
    })
    const ignored = expectEventByName(readAllEvents(harness.telemetry), 'telemetry_emit_ignored')
    expect(ignored).toEqual({
      time: FIXED_TIME,
      module: 'telemetry',
      event: 'telemetry_emit_ignored',
      status: 'info',
      error_code: 'telemetry_closed',
      reason: 'cause=closed',
      source: 'runtime',
    })
    await expect(harness.telemetry.flush()).resolves.toBeUndefined()
    expect(harness.files.appendCalls).toHaveLength(appendCountAfterFirstClose)
    expect(harness.scheduleCount).toBe(1)
  })

  it('marks close before an awaited drain so concurrent post-close producers cannot queue', async () => {
    const harness = makeHarness({ blockFirstAppend: true })
    harness.telemetry.emit(syntheticEvent(undefined, { event: 'close_inflight_event' }))
    const closePromise = harness.telemetry.close()
    expect(harness.telemetry.getStats().closed).toBe(true)
    await settleMicrotasks()
    expect(harness.files.appendCalls).toHaveLength(1)

    expect(() => harness.telemetry.emit(syntheticEvent(undefined, { event: 'close_race_event' }))).not.toThrow()
    expect(harness.telemetry.getStats().queueDepth).toBe(0)
    harness.files.releaseAppend()
    await closePromise

    expect(harness.files.appendCalls.map((call) => decodeLine(call.data).event)).toEqual([
      'close_inflight_event',
    ])
    expect(harness.telemetry.getStats().closed).toBe(true)
    expect(readAllEvents(harness.telemetry).filter((event) => event.event === 'telemetry_emit_ignored')).toHaveLength(1)
  })

  it('formats configurable wake metadata with no confidence-like field', async () => {
    const metadata = {
      keyword: 'synthetic-wake-phrase-小鏡子',
      configured_threshold: 0.42,
      boost: 1.5,
      num_trailing_blanks: 7,
    }
    const reason = formatWakeMetadata(metadata)
    expect(reason).toBe(
      `keyword=${encodeURIComponent(metadata.keyword)};configured_threshold=0.42;boost=1.5;num_trailing_blanks=7`,
    )
    expect(reason).toMatch(/^[A-Za-z0-9_=;.%:+,/?-]+$/)
    expect(reason).toContain(`keyword=${encodeURIComponent(metadata.keyword)}`)
    expect(reason).toContain('configured_threshold=0.42')
    expect(reason).toContain('boost=1.5')
    expect(reason).toContain('num_trailing_blanks=7')
    expect(reason).not.toMatch(/confidence|score|probability/i)

    expect(() => formatWakeMetadata({ ...metadata, keyword: '' })).toThrow()
    expect(() => formatWakeMetadata({ ...metadata, configured_threshold: Number.NaN })).toThrow()
    expect(() => formatWakeMetadata({ ...metadata, boost: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => formatWakeMetadata({ ...metadata, num_trailing_blanks: -1 })).toThrow()
    expect(() => formatWakeMetadata({ ...metadata, num_trailing_blanks: 1.5 })).toThrow()

    const harness = makeHarness()
    const wakeInput = asInput({
      module: 'wake',
      event: 'wake_detected',
      status: 'success',
      source: 'runtime',
      reason,
      confidence: 0.99,
      score: 0.98,
      probability: 0.97,
    })
    harness.telemetry.emit(wakeInput)
    const events = readAllEvents(harness.telemetry)
    const wakeEvent = expectEventByName(events, 'wake_detected')
    expect(wakeEvent).toEqual({
      time: FIXED_TIME,
      module: 'wake',
      event: 'wake_detected',
      status: 'success',
      reason,
      source: 'runtime',
    })
    expect(Object.keys(wakeEvent)).not.toContain('confidence')
    expect(Object.keys(wakeEvent)).not.toContain('score')
    expect(Object.keys(wakeEvent)).not.toContain('probability')
    expect(JSON.stringify(events)).not.toMatch(/confidence|score|probability/i)

    await runNextScheduled(harness)
    expect(harness.files.appendCalls).toHaveLength(1)
    const persisted = decodeLine(harness.files.appendCalls[0].data)
    expect(persisted).toEqual(wakeEvent)
    expect(persisted.reason).toBe(reason)
  })
})
