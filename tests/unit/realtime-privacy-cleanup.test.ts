import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { createConsoleDataPlane } from '../../src/main/console-data'
import type { ConsoleDataPlane } from '../../src/main/console-data'
import type {
  CONSOLE_IPC_CHANNELS,
  RealtimeIpcContract,
} from '../../src/main/ipc'
import { createSessionCleanup } from '../../src/renderer/realtime/session-cleanup'
import type {
  ConsoleCurrentSessionTranscriptEntry,
  ConsoleCurrentSessionTranscriptProjection,
  ConsoleResponse,
} from '../../src/shared/console-types'
import type { AppSnapshot } from '../../src/shared/types'

const BOUNDARY_REASONS = [
  'close',
  'manual_stop',
  'offline_loop',
  'rollover',
  'renderer_restart',
] as const

type BoundaryReason = (typeof BOUNDARY_REASONS)[number]

const CURRENT_SESSION_ID = 'realtime-session-under-test'

type MetadataEvent = Record<string, unknown>

interface CleanupHarness {
  readonly cleanup: ReturnType<typeof createSessionCleanup>
  readonly transcriptBuffer: {
    readonly clear: ReturnType<typeof vi.fn>
  }
  readonly clearCurrentTranscriptView: ReturnType<typeof vi.fn>
  readonly hookOrder: string[]
  readonly events: MetadataEvent[]
  readonly transcriptSentinel: symbol
  readonly currentViewSentinel: symbol
  getTranscriptRam(): readonly symbol[]
  getCurrentTranscriptViewRam(): unknown
}

function createCleanupHarness(options?: {
  readonly failTranscriptClear?: boolean
}): CleanupHarness {
  const hookOrder: string[] = []
  const events: MetadataEvent[] = []
  const transcriptSentinel = Symbol('synthetic-transcript-ram')
  const currentViewSentinel = Symbol('synthetic-current-view-ram')
  let transcriptRam: symbol[] = [transcriptSentinel, transcriptSentinel]
  let currentTranscriptViewRam: unknown = currentViewSentinel

  const transcriptBuffer = {
    clear: vi.fn((_reason: string): number => {
      hookOrder.push('transcriptBuffer.clear')
      if (options?.failTranscriptClear === true) {
        throw new Error()
      }

      const count = transcriptRam.length
      transcriptRam = []
      return count
    }),
  }

  const clearCurrentTranscriptView = vi.fn((_reason: string): void => {
    hookOrder.push('clearCurrentTranscriptView')
    currentTranscriptViewRam = undefined
  })

  const cleanup = createSessionCleanup({
    currentRealtimeSessionId: CURRENT_SESSION_ID,
    transcriptBuffer,
    clearCurrentTranscriptView,
    metadataSink: (event: MetadataEvent): void => {
      events.push(event)
    },
  })

  return {
    cleanup,
    transcriptBuffer,
    clearCurrentTranscriptView,
    hookOrder,
    events,
    transcriptSentinel,
    currentViewSentinel,
    getTranscriptRam: () => transcriptRam,
    getCurrentTranscriptViewRam: () => currentTranscriptViewRam,
  }
}

describe('SessionCleanup privacy boundary', () => {
  it.each(BOUNDARY_REASONS)(
    'clears both RAM views exactly once for the %s boundary',
    async (boundary: BoundaryReason) => {
      const harness = createCleanupHarness()

      await harness.cleanup.run(boundary)

      expect(harness.hookOrder).toEqual([
        'transcriptBuffer.clear',
        'clearCurrentTranscriptView',
      ])
      expect(harness.transcriptBuffer.clear).toHaveBeenCalledTimes(1)
      expect(harness.transcriptBuffer.clear).toHaveBeenCalledWith(boundary)
      expect(harness.clearCurrentTranscriptView).toHaveBeenCalledTimes(1)
      expect(harness.clearCurrentTranscriptView).toHaveBeenCalledWith(boundary)

      expect(harness.getTranscriptRam()).toHaveLength(0)
      expect(harness.getTranscriptRam()).not.toContain(
        harness.transcriptSentinel,
      )
      expect(harness.getCurrentTranscriptViewRam()).toBeUndefined()
      expect(harness.getCurrentTranscriptViewRam()).not.toBe(
        harness.currentViewSentinel,
      )

      expect(harness.events).toHaveLength(1)
      expect(Object.keys(harness.events[0] ?? {}).sort()).toEqual([
        'boundary',
        'count',
        'event',
        'reason',
        'session_id',
        'status',
      ])
      expect(harness.events[0]).toEqual({
        event: 'transcript_buffer_cleared',
        boundary,
        session_id: CURRENT_SESSION_ID,
        count: 2,
        status: 'success',
        reason: boundary,
      })
    },
  )

  it('suppresses one hook failure, runs the remaining hook, and emits stable metadata', async () => {
    const harness = createCleanupHarness({ failTranscriptClear: true })

    await harness.cleanup.run('offline_loop')

    expect(harness.hookOrder).toEqual([
      'transcriptBuffer.clear',
      'clearCurrentTranscriptView',
    ])
    expect(harness.transcriptBuffer.clear).toHaveBeenCalledTimes(1)
    expect(harness.clearCurrentTranscriptView).toHaveBeenCalledTimes(1)
    expect(harness.getCurrentTranscriptViewRam()).toBeUndefined()
    expect(harness.getCurrentTranscriptViewRam()).not.toBe(
      harness.currentViewSentinel,
    )

    expect(harness.events).toHaveLength(1)
    expect(harness.events[0]).toEqual({
      event: 'cleanup_failed',
      boundary: 'offline_loop',
      session_id: CURRENT_SESSION_ID,
      status: 'failed',
      reason: 'cleanup_failed',
    })
    expect(harness.events[0]).not.toHaveProperty('error')
    expect(harness.events[0]).not.toHaveProperty('error_message')
  })
})

type ConsoleDataPlaneDependencies = Parameters<typeof createConsoleDataPlane>[0]
type ForbiddenPersistenceDependencyKey =
  | 'sqlite'
  | 'getSqlite'
  | 'database'
  | 'getDatabase'
  | 'export'
  | 'getExport'
  | 'filesystem'
  | 'getFilesystem'
  | 'persistence'
  | 'getPersistence'
  | 'storage'
  | 'getStorage'

type ExpectedConsoleDataPlaneDependencyKey =
  | 'getSnapshot'
  | 'getTelemetry'
  | 'getDeveloperMode'
  | 'getStartedAt'
  | 'handleSimulator'
  | 'getConfigController'
  | 'getPhaseTestsController'
  | 'getPhaseTestsReader'
  | 'getCurrentSessionTranscriptProjection'

type ExistingConsoleIpcChannelKey =
  | 'getSnapshot'
  | 'snapshot'
  | 'simulate'
  | 'startConversation'
  | 'disconnect'
  | 'interrupt'
  | 'overview'
  | 'events'
  | 'config'
  | 'models'
  | 'saveModelDraft'
  | 'saveDraft'
  | 'testDraft'
  | 'publish'
  | 'rollback'
  | 'nextRuntime'
  | 'phaseTests'
  | 'avatarRuntime'
  | 'avatarControl'
  | 'runScene'
  | 'stopScenes'
  | 'sceneStatus'
  | 'uploadMusic'
  | 'uploadVisual'
  | 'finalizeVisual'
  | 'cancelVisual'
  | 'ready'

const TRANSCRIPT_SENTINEL = 'synthetic-transcript-sentinel'
const OVER_BOUND_ENTRY_COUNT = 201

function createAuthoritativeSnapshot(): AppSnapshot {
  return {
    lifecycle: 'active',
    appVersion: 'test',
    buildCommit: 'test',
    configVersion: 1,
    modules: {
      app: 'ready',
      openai: 'ready',
      wake: 'ready',
      audio: 'ready',
      camera: 'ready',
      identity: 'ready',
      memory: 'ready',
      avatar: 'ready',
      lighting: 'ready',
      fog: 'ready',
      music: 'ready',
      sqlite: 'ready',
      config: 'ready',
      telemetry: 'ready',
    },
    identityStatus: 'anonymous',
    realtimeSessionId: CURRENT_SESSION_ID,
    sessionGeneration: 1,
    lastError: null,
    maintenance: null,
  }
}

function createTranscriptProjectionPlane(projection?: () => unknown) {
  const telemetry = {
    readPage: vi.fn(),
    emit: vi.fn(),
  }
  const baseDependencies = {
    getSnapshot: createAuthoritativeSnapshot,
    getTelemetry: () => telemetry,
    getDeveloperMode: () => ({
      enabled: false,
      source: 'packaging_default' as const,
    }),
    getStartedAt: () => 0,
    handleSimulator: async () => ({ op: 'success' as const }),
  }
  const dependencies = projection === undefined
    ? baseDependencies
    : {
      ...baseDependencies,
      getCurrentSessionTranscriptProjection: projection,
    }

  return {
    plane: createConsoleDataPlane(
      dependencies as ConsoleDataPlaneDependencies,
    ),
    telemetry,
  }
}

function createCurrentSessionEntry(): ConsoleCurrentSessionTranscriptEntry {
  return {
    itemId: 'item-current',
    turnId: 'turn-current',
    transcript: TRANSCRIPT_SENTINEL,
  }
}

function createCurrentSessionProjection(): ConsoleCurrentSessionTranscriptProjection {
  return {
    realtimeSessionId: CURRENT_SESSION_ID,
    entries: [createCurrentSessionEntry()],
  }
}

function expectNoTranscriptInDiagnostics(
  telemetry: ReturnType<typeof createTranscriptProjectionPlane>['telemetry'],
  result: unknown,
): void {
  expect(
    JSON.stringify({
      readPageCalls: telemetry.readPage.mock.calls,
      emitCalls: telemetry.emit.mock.calls,
    }),
  ).not.toContain(TRANSCRIPT_SENTINEL)
  expect(JSON.stringify(result)).not.toContain(TRANSCRIPT_SENTINEL)
  expect(String(result)).not.toContain(TRANSCRIPT_SENTINEL)
}

describe('Console current-session transcript RAM projection', () => {
  it('returns only the bounded current-session RAM projection for an authoritative session', async () => {
    const harness = createTranscriptProjectionPlane(() => createCurrentSessionProjection())

    const result = await harness.plane.getCurrentSessionTranscripts()

    expect(result).toEqual({
      ok: true,
      value: createCurrentSessionProjection(),
    })
    const value = result.ok ? result.value : null
    expect(value?.realtimeSessionId).toBe(CURRENT_SESSION_ID)
    expect(value?.entries[0]).toEqual({
      itemId: 'item-current',
      turnId: 'turn-current',
      transcript: TRANSCRIPT_SENTINEL,
    })
    expect(Object.keys(value?.entries[0] ?? {}).sort()).toEqual([
      'itemId',
      'transcript',
      'turnId',
    ])
    expect(harness.telemetry.readPage).toHaveBeenCalledTimes(0)
    expect(harness.telemetry.emit).toHaveBeenCalledTimes(0)
    expectNoTranscriptInDiagnostics(harness.telemetry, {
      telemetryOnly: {
        readPageCalls: harness.telemetry.readPage.mock.calls,
        emitCalls: harness.telemetry.emit.mock.calls,
      },
    })
  })

  it('returns an honest null value when the optional projection dependency is absent', async () => {
    const harness = createTranscriptProjectionPlane()

    const result = await harness.plane.getCurrentSessionTranscripts()

    expect(result).toEqual({ ok: true, value: null })
    expect(harness.telemetry.readPage).toHaveBeenCalledTimes(0)
    expect(harness.telemetry.emit).toHaveBeenCalledTimes(0)
    expectNoTranscriptInDiagnostics(harness.telemetry, result)
  })

  it('returns an honest null value when the projection dependency throws', async () => {
    const harness = createTranscriptProjectionPlane(() => {
      throw new Error(TRANSCRIPT_SENTINEL)
    })

    const result = await harness.plane.getCurrentSessionTranscripts()

    expect(result).toEqual({ ok: true, value: null })
    expect(harness.telemetry.readPage).toHaveBeenCalledTimes(0)
    expect(harness.telemetry.emit).toHaveBeenCalledTimes(0)
    expectNoTranscriptInDiagnostics(harness.telemetry, result)
  })

  it.each([
    {
      name: 'malformed',
      projection: {
        realtimeSessionId: CURRENT_SESSION_ID,
        entries: [{ itemId: 'item-current', turnId: 'turn-current', transcript: 42 }],
      },
    },
    {
      name: 'over-bound',
      projection: {
        realtimeSessionId: CURRENT_SESSION_ID,
        entries: Array.from({ length: OVER_BOUND_ENTRY_COUNT }, (_, index) => ({
          itemId: `item-${index}`,
          turnId: `turn-${index}`,
          transcript: TRANSCRIPT_SENTINEL,
        })),
      },
    },
    {
      name: 'stale-session',
      projection: {
        realtimeSessionId: 'stale-realtime-session',
        entries: [
          {
            itemId: 'item-stale',
            turnId: 'turn-stale',
            transcript: TRANSCRIPT_SENTINEL,
          },
        ],
      },
    },
    {
      name: 'whitespace-only-transcript',
      projection: {
        realtimeSessionId: CURRENT_SESSION_ID,
        entries: [
          {
            itemId: 'item-whitespace',
            turnId: 'turn-whitespace',
            transcript: '   ',
          },
        ],
      },
    },
  ])('returns an honest null value for a $name projection', async ({ projection }) => {
    const harness = createTranscriptProjectionPlane(() => projection)

    const result = await harness.plane.getCurrentSessionTranscripts()

    expect(result).toEqual({ ok: true, value: null })
    expect(harness.telemetry.readPage).toHaveBeenCalledTimes(0)
    expect(harness.telemetry.emit).toHaveBeenCalledTimes(0)
    expectNoTranscriptInDiagnostics(harness.telemetry, result)
  })

  it('keeps transcript access Main-only and leaves the existing renderer IPC surface unchanged', () => {
    expectTypeAssertionsAreCheckedAtCompileTime()
    expect(true).toBe(true)
  })
})

function expectTypeAssertionsAreCheckedAtCompileTime(): void {
  type CurrentTranscriptResponse = Awaited<
    ReturnType<ConsoleDataPlane['getCurrentSessionTranscripts']>
  >

  expectTypeOf<CurrentTranscriptResponse>().toEqualTypeOf<
    ConsoleResponse<ConsoleCurrentSessionTranscriptProjection | null>
  >()
  expectTypeOf<
    ConsoleDataPlaneDependencies['getCurrentSessionTranscriptProjection']
  >().toMatchTypeOf<(() => unknown) | undefined>()
  expectTypeOf<
    undefined extends ConsoleDataPlaneDependencies['getCurrentSessionTranscriptProjection']
      ? true
      : false
  >().toEqualTypeOf<true>()
  expectTypeOf<
    Extract<keyof ConsoleDataPlaneDependencies, ForbiddenPersistenceDependencyKey>
  >().toEqualTypeOf<never>()
  expectTypeOf<keyof ConsoleDataPlaneDependencies>().toEqualTypeOf<
    ExpectedConsoleDataPlaneDependencyKey
  >()
  expectTypeOf<
    Extract<keyof ConsoleDataPlane, 'getCurrentSessionTranscripts'>
  >().toEqualTypeOf<'getCurrentSessionTranscripts'>()
  expectTypeOf<
    Extract<
      keyof RealtimeIpcContract['console'],
      'getCurrentSessionTranscripts' | 'getCurrentSessionTranscriptProjection'
    >
  >().toEqualTypeOf<never>()
  expectTypeOf<keyof typeof CONSOLE_IPC_CHANNELS>().toEqualTypeOf<
    ExistingConsoleIpcChannelKey
  >()
}
