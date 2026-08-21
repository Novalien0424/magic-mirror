import { describe, expect, it, vi } from 'vitest'

import { projectAppSnapshot } from '../../src/main/boot'
import {
  CONSOLE_IPC_CHANNELS,
  MIRROR_IPC_CHANNELS,
  registerIpcHandlers,
} from '../../src/main/ipc'

const TEST_TRANSCRIPT_SENTINEL = '__TEST_TRANSCRIPT_SENTINEL__'
const TEST_AUDIO_SENTINEL = '__TEST_AUDIO_SENTINEL__'
const TEST_PRIVATE_MEMORY_SENTINEL = '__TEST_PRIVATE_MEMORY_SENTINEL__'
const TEST_CREDENTIAL_SENTINEL = '__TEST_CREDENTIAL_SENTINEL__'
const TEST_IMAGE_SENTINEL = '__TEST_IMAGE_SENTINEL__'
const TEST_EMBEDDING_SENTINEL = '__TEST_EMBEDDING_SENTINEL__'
const TEST_CONFIGURED_VALUE_SENTINEL = '__TEST_CONFIGURED_VALUE_SENTINEL__'
const TEST_SERVICE_SENTINEL = '__TEST_SERVICE_SENTINEL__'

const PRIVACY_SENTINELS = [
  TEST_TRANSCRIPT_SENTINEL,
  TEST_AUDIO_SENTINEL,
  TEST_PRIVATE_MEMORY_SENTINEL,
  TEST_CREDENTIAL_SENTINEL,
  TEST_IMAGE_SENTINEL,
  TEST_EMBEDDING_SENTINEL,
  TEST_CONFIGURED_VALUE_SENTINEL,
  TEST_SERVICE_SENTINEL,
] as const

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

interface RegisteredIpc {
  readonly handlers: Map<string, IpcHandler>
  readonly events: Array<Record<string, unknown>>
  readonly facade: {
    readonly getOverview: ReturnType<typeof vi.fn>
    readonly getEvents: ReturnType<typeof vi.fn>
  }
  readonly handleSimulator: ReturnType<typeof vi.fn>
  readonly consoleSender: Record<string, unknown>
  readonly consoleFrame: Record<string, unknown>
  readonly mirrorSender: Record<string, unknown>
  readonly mirrorFrame: Record<string, unknown>
  readonly snapshot: Record<string, unknown>
}

interface HarnessOptions {
  readonly destroyed?: boolean
  readonly mismatchedTrackedId?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serialize(value: unknown): string {
  return JSON.stringify(value) ?? ''
}

function expectNoSensitiveOutput(value: unknown): void {
  const encoded = serialize(value)
  for (const sentinel of PRIVACY_SENTINELS) {
    expect(encoded).not.toContain(sentinel)
  }
}

function makeHarness(options: HarnessOptions = {}): RegisteredIpc {
  const handlers = new Map<string, IpcHandler>()
  const events: Array<Record<string, unknown>> = []
  const mirrorFrame: Record<string, unknown> = {}
  const consoleFrame: Record<string, unknown> = {}
  const mirrorSender: Record<string, unknown> = {
    id: 101,
    mainFrame: mirrorFrame,
    isDestroyed: () => false,
    send: vi.fn(),
  }
  const consoleSender: Record<string, unknown> = {
    id: 202,
    mainFrame: consoleFrame,
    isDestroyed: () => false,
    send: vi.fn(),
  }

  const snapshot: Record<string, unknown> = {
    lifecycle: 'dormant',
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    configVersion: null,
    modules: {},
    identityStatus: 'unassigned',
    realtimeSessionId: null,
    sessionGeneration: 0,
    lastError: null,
    maintenance: null,
  }
  const overviewResponse = {
    ok: true,
    value: {
      lifecycle: 'dormant',
      appVersion: 'synthetic-app-version',
      buildCommit: 'synthetic-build-commit',
      configVersion: null,
      identityStatus: 'unassigned',
      realtimeSessionId: null,
      sessionGeneration: 0,
      uptimeSeconds: 0,
      developerMode: true,
      developerModeSource: 'packaging_default',
      modules: {},
      audioTcc: 'not_checked',
      cameraTcc: 'not_checked',
    },
  }
  const eventsResponse = {
    ok: true,
    value: {
      events: [{
        time: '2026-08-19T00:00:00.000Z',
        module: 'app',
        event: 'console_ready',
        status: 'success',
        source: 'runtime',
      }],
      nextBeforeSequence: null,
    },
  }
  const serviceObjects = {
    configService: { marker: TEST_SERVICE_SENTINEL },
    telemetry: { marker: TEST_SERVICE_SENTINEL },
    filesystem: { marker: TEST_SERVICE_SENTINEL },
    sqlite: { marker: TEST_SERVICE_SENTINEL },
    credential: { marker: TEST_SERVICE_SENTINEL },
    lifecycle: { marker: TEST_SERVICE_SENTINEL },
  }
  const getOverview = vi.fn(() => overviewResponse)
  const getEvents = vi.fn((request: unknown) => {
    if (isRecord(request) && Object.keys(request).some((key) => (
      !['limit', 'beforeSequence', 'module', 'status', 'source'].includes(key)
    ))) {
      return {
        ok: false,
        error: 'console_events_query_invalid',
        reason: 'cause=payload_schema_invalid',
      }
    }
    return eventsResponse
  })
  const facade = {
    ...serviceObjects,
    getOverview,
    getEvents,
  }
  const handleSimulator = vi.fn(async () => ({ op: 'success' as const }))
  const runtime = {
    snapshot: () => snapshot,
    handleSimulator,
    console: facade,
    ...serviceObjects,
  }
  const windows = {
    mirror: { webContents: mirrorSender, webContentsId: 101 },
    console: {
      webContents: consoleSender,
      webContentsId: options.mismatchedTrackedId ? 999 : 202,
      isDestroyed: () => options.destroyed === true,
    },
  }

  registerIpcHandlers({
    ipcMain: {
      handle(channel: string, handler: IpcHandler): void {
        handlers.set(channel, handler)
      },
      on(channel: string, handler: IpcHandler): void {
        handlers.set(channel, handler)
      },
    },
    runtime,
    console: facade,
    windows,
    telemetry: {
      emit(event: unknown): void {
        if (isRecord(event)) events.push({ ...event })
      },
    },
  } as never)

  return {
    handlers,
    events,
    facade,
    handleSimulator,
    consoleSender,
    consoleFrame,
    mirrorSender,
    mirrorFrame,
    snapshot,
  }
}

function getHandler(registered: RegisteredIpc, channel: string): IpcHandler {
  const handler = registered.handlers.get(channel)
  expect(handler).toBeDefined()
  return handler as IpcHandler
}

function authorizedEvent(registered: RegisteredIpc): Record<string, unknown> {
  return {
    sender: registered.consoleSender,
    senderFrame: registered.consoleFrame,
  }
}

describe('Phase 0 Task 9 Gate 9A.1 Console IPC RED contract', () => {
  it('registers the 9A Console channels while preserving Task 8 snapshot, simulate, ready, and Mirror contracts', async () => {
    const registered = makeHarness()

    expect(CONSOLE_IPC_CHANNELS).toEqual(expect.objectContaining({
      getSnapshot: 'console:get-snapshot',
      snapshot: 'console:snapshot',
      simulate: 'console:simulate',
      overview: 'console:get-overview',
      events: 'console:get-events',
      ready: 'boot:renderer-ready',
    }))
    expect(MIRROR_IPC_CHANNELS).toEqual({
      getSnapshot: 'mirror:get-snapshot',
      snapshot: 'mirror:snapshot',
      requestRealtimeClientSecret: 'mirror:request-realtime-client-secret',
      ready: 'boot:renderer-ready',
    })
    expect(registered.handlers.has('console:get-overview')).toBe(true)
    expect(registered.handlers.has('console:get-events')).toBe(true)

    const event = authorizedEvent(registered)
    const overview = await getHandler(registered, 'console:get-overview')(event)
    const events = await getHandler(registered, 'console:get-events')(event, { limit: 2 })
    const snapshot = await getHandler(registered, CONSOLE_IPC_CHANNELS.getSnapshot)(event)
    const simulation = await getHandler(registered, CONSOLE_IPC_CHANNELS.simulate)(event, { type: 'wake' })

    expect(overview).toEqual(registered.facade.getOverview.mock.results[0]?.value)
    expect(events).toEqual(registered.facade.getEvents.mock.results[0]?.value)
    expect(snapshot).toEqual(projectAppSnapshot(registered.snapshot))
    expect(simulation).toEqual({ op: 'success' })
    expect(registered.handleSimulator).toHaveBeenCalledWith({ type: 'wake' })
    expectNoSensitiveOutput({ overview, events, snapshot, simulation })
    expect(serialize({ overview, events, snapshot, simulation })).not.toContain('ConfigService')
    expect(serialize({ overview, events, snapshot, simulation })).not.toContain(TEST_SERVICE_SENTINEL)
  })

  it('requires the Console main frame and exact tracked webContents id for every 9A handler', async () => {
    const cases: readonly {
      name: string
      options?: HarnessOptions
      event: (registered: RegisteredIpc) => Record<string, unknown>
      metadataReason: string
    }[] = [
      {
        name: 'Mirror sender',
        event: (registered) => ({ sender: registered.mirrorSender, senderFrame: registered.mirrorFrame }),
        metadataReason: 'web_contents_mismatch',
      },
      {
        name: 'unknown sender',
        event: () => ({
          sender: { id: 303, mainFrame: {}, send: vi.fn() },
          senderFrame: {},
        }),
        metadataReason: 'unknown_sender',
      },
      {
        name: 'non-main frame',
        event: (registered) => ({ sender: registered.consoleSender, senderFrame: {} }),
        metadataReason: 'sender_frame_invalid',
      },
      {
        name: 'mismatched tracked id',
        options: { mismatchedTrackedId: true },
        event: authorizedEvent,
        metadataReason: 'web_contents_mismatch',
      },
      {
        name: 'destroyed Console window',
        options: { destroyed: true },
        event: authorizedEvent,
        metadataReason: 'window_destroyed',
      },
    ]

    for (const testCase of cases) {
      const registered = makeHarness(testCase.options)
      const event = testCase.event(registered)
      const overviewResult = await getHandler(registered, 'console:get-overview')(event)
      const eventsResult = await getHandler(registered, 'console:get-events')(event, { limit: 1 })

      expect(overviewResult, testCase.name).toEqual({
        ok: false,
        error: 'console_request_rejected',
        reason: 'cause=sender_rejected',
      })
      expect(eventsResult, testCase.name).toEqual({
        ok: false,
        error: 'console_request_rejected',
        reason: 'cause=sender_rejected',
      })
      expect(registered.facade.getOverview, testCase.name).not.toHaveBeenCalled()
      expect(registered.facade.getEvents, testCase.name).not.toHaveBeenCalled()
      expect(registered.handleSimulator, testCase.name).not.toHaveBeenCalled()
      expect(registered.events, testCase.name).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'ipc_sender_rejected',
          reason: testCase.metadataReason,
          source: 'runtime',
        }),
      ]))
      expectNoSensitiveOutput({ overviewResult, eventsResult, events: registered.events })
    }
  })

  it('rejects extra arguments and unknown query keys with stable metadata-only failures', async () => {
    const registered = makeHarness()
    const event = authorizedEvent(registered)
    const overview = getHandler(registered, 'console:get-overview')
    const events = getHandler(registered, 'console:get-events')

    const extraOverviewArgument = await overview(event, { unexpected: TEST_CONFIGURED_VALUE_SENTINEL })
    const extraEventsArguments = await events(
      event,
      { limit: 1 },
      TEST_PRIVATE_MEMORY_SENTINEL,
    )
    const unknownQueryKey = await events(event, {
      limit: 1,
      unexpected: TEST_CONFIGURED_VALUE_SENTINEL,
    })

    expect(extraOverviewArgument).toEqual({
      ok: false,
      error: 'console_request_invalid',
      reason: 'cause=payload_schema_invalid',
    })
    expect(extraEventsArguments).toEqual({
      ok: false,
      error: 'console_request_invalid',
      reason: 'cause=payload_schema_invalid',
    })
    expect(unknownQueryKey).toEqual({
      ok: false,
      error: 'console_events_query_invalid',
      reason: 'cause=payload_schema_invalid',
    })
    expect(registered.facade.getOverview).not.toHaveBeenCalled()
    expect(registered.facade.getEvents).toHaveBeenCalledTimes(1)
    expect(registered.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'ipc_payload_invalid',
        reason: 'payload_schema_invalid',
        source: 'runtime',
      }),
    ]))
    expectNoSensitiveOutput({ extraOverviewArgument, extraEventsArguments, unknownQueryKey, events: registered.events })
  })
})
