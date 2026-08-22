import { describe, expect, it, vi } from 'vitest'

import {
  MIRROR_STATE_COPY,
  projectMirrorSnapshot,
  subscribeMirrorInterrupt,
} from '../../src/renderer/mirror/App'
import type { MirrorBridge } from '../../src/shared/bridge'
import type {
  RealtimeRuntimeEventSink,
  RealtimeRuntimeOutcome,
  RealtimeRuntimeOwner,
} from '../../src/renderer/realtime/realtime-runtime-owner'
import { ErrorBoundary } from '../../src/renderer/shared/ErrorBoundary'

const RAW_ERROR_MESSAGE = 'synthetic-render-error-message'
const RAW_ERROR_STACK = 'synthetic-render-error-stack'
const RAW_ATTEMPTED_STEP = 'synthetic-attempted-step'
const RAW_FAILED_STEP = 'synthetic-failed-step'
const RAW_CREDENTIAL = 'synthetic-credential'
const RAW_TRANSCRIPT = 'synthetic-transcript-content'
const RAW_AUDIO = 'synthetic-audio-content'
const RAW_MEMORY = 'synthetic-memory-value'
const RAW_PRIVATE_CONTEXT = 'synthetic-private-context'
const RAW_MODEL_ID = 'synthetic-renderer-model-id'
const RAW_PROFILE_ID = 'synthetic-renderer-profile-id'
const RAW_GUEST_ID = 'synthetic-renderer-guest-id'
const RAW_CANDIDATE_ID = 'synthetic-renderer-candidate-id'

const EXPECTED_COPY = {
  starting: { title: 'Starting', detail: 'Preparing the local mirror.' },
  dormant: { title: 'Dormant', detail: 'Waiting for the wake word.' },
  activating: { title: 'Activating', detail: 'Waking the mirror.' },
  active: { title: 'Active', detail: 'Ready for conversation.' },
  suspending: { title: 'Suspending', detail: 'Returning to sleep.' },
  offlineLoop: {
    title: 'OfflineLoop',
    detail: 'Cloud unavailable; local fallback is playing.',
  },
  maintenance: {
    title: 'Maintenance',
    detail: 'Local service unavailable; see the Console.',
  },
} as const

type LifecycleState = keyof typeof EXPECTED_COPY

function baseSnapshot(state: LifecycleState): Record<string, unknown> {
  return {
    lifecycle: state,
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    configVersion: 7,
    modules: {},
    identityStatus: 'unassigned',
    realtimeSessionId: null,
    sessionGeneration: 0,
    lastError: null,
    maintenance: null,
  }
}

function project(snapshot: unknown, options?: unknown): Record<string, unknown> {
  return (projectMirrorSnapshot as unknown as (
    value: unknown,
    projectionOptions?: unknown,
  ) => Record<string, unknown>)(snapshot, options)
}

function serialized(value: unknown): string {
  return JSON.stringify(value)
}

function expectNoForbiddenContent(value: unknown): void {
  const encoded = serialized(value)
  for (const sentinel of [
    RAW_TRANSCRIPT,
    RAW_AUDIO,
    RAW_MEMORY,
    RAW_PRIVATE_CONTEXT,
    RAW_MODEL_ID,
    RAW_PROFILE_ID,
    RAW_GUEST_ID,
    RAW_CANDIDATE_ID,
  ]) {
    expect(encoded).not.toContain(sentinel)
  }
}

function collectKeys(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, result)
    return result
  }
  if (typeof value !== 'object' || value === null) return result
  for (const [key, child] of Object.entries(value)) {
    result.push(key)
    collectKeys(child, result)
  }
  return result
}

describe('Mirror seven-state projection contract', () => {
  it('exports exactly seven nonblank lifecycle states with exact copy', () => {
    expect(MIRROR_STATE_COPY).toEqual(EXPECTED_COPY)
    expect(Object.keys(MIRROR_STATE_COPY).sort()).toEqual(Object.keys(EXPECTED_COPY).sort())
    for (const state of Object.keys(EXPECTED_COPY) as LifecycleState[]) {
      expect(MIRROR_STATE_COPY[state].title.trim().length).toBeGreaterThan(0)
      expect(MIRROR_STATE_COPY[state].detail.trim().length).toBeGreaterThan(0)
    }
  })

  it.each(Object.keys(EXPECTED_COPY) as LifecycleState[]) (
    'maps %s to the screen class and exact visible copy',
    (state) => {
      const view = project(baseSnapshot(state))

      expect(view).toEqual(expect.objectContaining({
        state,
        className: `screen screen--${state}`,
        title: EXPECTED_COPY[state].title,
        detail: EXPECTED_COPY[state].detail,
      }))
      expect(String(view.title).trim().length).toBeGreaterThan(0)
      expect(String(view.detail).trim().length).toBeGreaterThan(0)
    },
  )

  it('keeps OfflineLoop and Maintenance visible and reasoned', () => {
    const offline = project(baseSnapshot('offlineLoop'))
    const maintenance = project({
      ...baseSnapshot('maintenance'),
      maintenance: {
        code: 'sqlite_open_failed',
        detail: 'synthetic-maintenance-reason',
      },
    })

    expect(offline).toEqual(expect.objectContaining({
      className: 'screen screen--offlineLoop',
      title: 'OfflineLoop',
      detail: EXPECTED_COPY.offlineLoop.detail,
    }))
    expect(maintenance.className).toBe('screen screen--maintenance')
    expect(maintenance.title).toBe('Maintenance')
    expect(String(maintenance.detail)).toContain('sqlite_open_failed')
    expect(String(maintenance.detail).trim().length).toBeGreaterThan(0)
  })

  it('keeps Main snapshot state authoritative and renders a stable offline asset fallback', () => {
    const starting = project(baseSnapshot('starting'))
    const dormant = project(baseSnapshot('dormant'))
    const unavailableOffline = project(baseSnapshot('offlineLoop'), {
      offlineAssetAvailable: false,
    })

    expect(starting.state).toBe('starting')
    expect(starting.className).toBe('screen screen--starting')
    expect(dormant.state).toBe('dormant')
    expect(dormant.className).toBe('screen screen--dormant')
    expect(dormant.state).not.toBe(starting.state)
    expect(unavailableOffline).toEqual(expect.objectContaining({
      state: 'offlineLoop',
      className: 'screen screen--offlineLoop',
      title: 'OfflineLoop',
      detail: 'offline_loop_asset_unavailable',
    }))
    expect(String(unavailableOffline.detail).trim().length).toBeGreaterThan(0)
    expectNoForbiddenContent({ starting, dormant, unavailableOffline })
  })

  it('projects only renderer-safe identifiers and content-free metadata', () => {
    const view = project({
      ...baseSnapshot('active'),
      activeProfileId: RAW_PROFILE_ID,
      guestId: RAW_GUEST_ID,
      candidateProfileId: RAW_CANDIDATE_ID,
      modelId: RAW_MODEL_ID,
      transcript: RAW_TRANSCRIPT,
      audio: RAW_AUDIO,
      memoryValue: RAW_MEMORY,
      privateContext: RAW_PRIVATE_CONTEXT,
      credential: 'synthetic-credential',
      image: 'synthetic-image',
      embedding: 'synthetic-embedding',
    })

    expectNoForbiddenContent(view)
    expect(collectKeys(view).some((key) =>
      /guest|profile|candidate|credential|model|transcript|audio|memory|private|image|embedding/i.test(key),
    )).toBe(false)
    expect(view.className).toBe('screen screen--active')
    expect(String(view.title).trim().length).toBeGreaterThan(0)
    expect(String(view.detail).trim().length).toBeGreaterThan(0)
  })
})

describe('Mirror ErrorBoundary stable failure contract', () => {
  it('derives and reports only stable renderer failure metadata', () => {
    const callbacks: unknown[] = []
    const boundary = new ErrorBoundary({
      label: 'mirror',
      children: null,
      onFailure: (failure: unknown) => callbacks.push(failure),
    } as never)

    boundary.componentDidCatch(
      new Error(RAW_ERROR_MESSAGE),
      { componentStack: RAW_ERROR_STACK } as never,
    )

    expect(callbacks).toEqual([{ code: 'renderer_boundary_failed', reason: 'render_exception' }])
    expectNoForbiddenContent(callbacks)
    expect(serialized(callbacks)).not.toContain(RAW_ERROR_MESSAGE)
    expect(serialized(callbacks)).not.toContain(RAW_ERROR_STACK)
  })

  it('renders a nonblank fallback containing only stable failure code and reason', () => {
    const boundary = new ErrorBoundary({
      label: 'mirror',
      children: null,
      onFailure: () => {},
    } as never)
    const derive = (ErrorBoundary as unknown as {
      getDerivedStateFromError(error: unknown): unknown
    }).getDerivedStateFromError
    ;(boundary as unknown as { state: unknown }).state = derive(new Error(RAW_ERROR_MESSAGE))
    const fallback = boundary.render()
    const encoded = serialized(fallback)

    expect(String(encoded).trim().length).toBeGreaterThan(0)
    expect(encoded).toContain('renderer_boundary_failed')
    expect(encoded).toContain('render_exception')
    expect(encoded).not.toContain(RAW_ERROR_MESSAGE)
    expect(encoded).not.toContain(RAW_ERROR_STACK)
  })
})

describe('Mirror preload interrupt bridge contract', () => {
  it('subscribes to mirror:interrupt with no payload and disposes the exact wrapper', async () => {
    type IpcListener = (event: unknown, ...payload: unknown[]) => void

    const registrations: Array<{ channel: string; listener: IpcListener }> = []
    const removals: Array<{ channel: string; listener: IpcListener }> = []
    let exposedBridge: Record<string, unknown> | undefined

    vi.resetModules()
    vi.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => {
          exposedBridge = bridge
        },
      },
      ipcRenderer: {
        invoke: () => Promise.resolve(undefined),
        on: (channel: string, listener: IpcListener) => {
          registrations.push({ channel, listener })
        },
        removeListener: (channel: string, listener: IpcListener) => {
          removals.push({ channel, listener })
        },
        send: () => undefined,
      },
    }))

    try {
      await import('../../src/preload/mirror')

      const bridge = exposedBridge as {
        onInterrupt(listener: () => void): () => void
      }
      const listener = vi.fn<() => void>()

      const dispose = bridge.onInterrupt(listener)
      const registration = registrations[0]

      expect(registrations).toHaveLength(1)
      expect(registration?.channel).toBe('mirror:interrupt')
      expect(registration?.listener).toBeTypeOf('function')

      registration?.listener({ type: 'synthetic-event' }, { unexpected: 'synthetic-payload' })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith()

      dispose()

      expect(removals).toHaveLength(1)
      expect(removals[0]?.channel).toBe('mirror:interrupt')
      expect(removals[0]?.listener).toBe(registration?.listener)
    } finally {
      vi.doUnmock('electron')
      vi.resetModules()
    }
  })
})

describe('Mirror realtime runtime command transport', () => {
  const RUNTIME_COMMAND_CHANNEL = 'mirror:realtime-runtime-command'

  type RealtimeRuntimeCommand =
    | Readonly<{ operation: 'start'; reason: 'manual_start' }>
    | Readonly<{ operation: 'stop'; reason: 'manual_stop' }>
    | Readonly<{ operation: 'rollover'; reason: 'session_limit' }>

  it('delivers only exact frozen command DTOs and removes the exact subscription wrapper', async () => {
    type IpcListener = (event: unknown, ...payload: unknown[]) => void

    const registrations: Array<{ channel: string; listener: IpcListener }> = []
    const removals: Array<{ channel: string; listener: IpcListener }> = []
    let exposedBridge: Record<string, unknown> | undefined

    vi.resetModules()
    vi.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => {
          exposedBridge = bridge
        },
      },
      ipcRenderer: {
        invoke: () => Promise.resolve(undefined),
        on: (channel: string, listener: IpcListener) => {
          registrations.push({ channel, listener })
        },
        removeListener: (channel: string, listener: IpcListener) => {
          removals.push({ channel, listener })
        },
        send: () => undefined,
      },
    }))

    try {
      await import('../../src/preload/mirror')

      const bridge = exposedBridge as unknown as MirrorBridge & {
        onRealtimeRuntimeCommand?: (listener: (command: RealtimeRuntimeCommand) => void) => () => void
      }
      const listener = vi.fn<(command: RealtimeRuntimeCommand) => void>()
      expect(bridge.onRealtimeRuntimeCommand).toBeTypeOf('function')
      if (typeof bridge.onRealtimeRuntimeCommand !== 'function') return
      const dispose = bridge.onRealtimeRuntimeCommand(listener)
      const registration = registrations[0]

      expect(registrations).toHaveLength(1)
      expect(registration?.channel).toBe(RUNTIME_COMMAND_CHANNEL)
      expect(registration?.listener).toBeTypeOf('function')
      if (registration === undefined) return

      const validCommands: RealtimeRuntimeCommand[] = [
        { operation: 'start', reason: 'manual_start' },
        { operation: 'stop', reason: 'manual_stop' },
        { operation: 'rollover', reason: 'session_limit' },
      ]
      const invalidCommands: unknown[] = [
        { operation: 'start', reason: 'manual_stop' },
        { operation: 'stop', reason: 'session_limit' },
        { operation: 'rollover', reason: 'manual_start' },
        { operation: 'pause', reason: 'manual_start' },
        { operation: 'start', reason: 'manual_start', profileId: RAW_PROFILE_ID },
        { operation: 'stop', reason: 'manual_stop', transcript: RAW_TRANSCRIPT },
        { operation: 'rollover', reason: 'session_limit', clientSecret: RAW_CREDENTIAL },
        undefined,
      ]

      for (const command of validCommands) {
        registration.listener({ type: 'synthetic-event' }, command)
      }
      for (const command of invalidCommands) {
        registration.listener({ type: 'synthetic-event' }, command)
      }

      expect(listener).toHaveBeenCalledTimes(validCommands.length)
      for (const [index, command] of validCommands.entries()) {
        const received = listener.mock.calls[index]?.[0]
        expect(received).toEqual(command)
        expect(Object.keys(received as object).sort()).toEqual(['operation', 'reason'])
        expect(Object.isFrozen(received)).toBe(true)
      }
      expect(collectKeys(listener.mock.calls).some((key) =>
        /secret|credential|profile|guest|candidate|transcript|audio|memory|private|model/i.test(key),
      )).toBe(false)
      expect(serialized(listener.mock.calls)).not.toContain(RAW_CREDENTIAL)
      expectNoForbiddenContent(listener.mock.calls)

      dispose()

      expect(removals).toHaveLength(1)
      expect(removals[0]?.channel).toBe(RUNTIME_COMMAND_CHANNEL)
      expect(removals[0]?.listener).toBe(registration.listener)
    } finally {
      vi.doUnmock('electron')
      vi.resetModules()
    }
  })

  function preloadStartBundle(sessionGeneration: number): Record<string, unknown> {
    return {
      snapshot: {
        configVersion: 7,
        fingerprint: 'synthetic-config-fingerprint',
        sdkVersion: '0.16.1',
        realtimeDialogue: 'synthetic-realtime-model',
        inputTranscription: 'synthetic-transcription-model',
        memoryExtractor: 'synthetic-memory-model',
        voice: 'synthetic-voice',
        reasoningEffort: 'low',
        turnDetectionProfile: 'semantic-vad',
        takenAt: '2026-08-19T00:00:00.000Z',
      },
      identity: {
        realtimeSessionId: 'synthetic-realtime-session',
        sessionGeneration,
      },
      clientSecret: 'ek_synthetic-client-secret',
      expiresAt: 1_800_000_000,
    }
  }

  it.each([
    { sessionGeneration: 0, expectedStatus: 'rejected', expectedReason: 'invalid_payload' },
    { sessionGeneration: 1, expectedStatus: 'accepted', expectedReason: 'mirror_authorized' },
    {
      sessionGeneration: Number.MAX_SAFE_INTEGER,
      expectedStatus: 'accepted',
      expectedReason: 'mirror_authorized',
    },
  ])(
    'validates the preload start bundle at sessionGeneration=$sessionGeneration',
    async ({ sessionGeneration, expectedStatus, expectedReason }) => {
      let exposedBridge: Record<string, unknown> | undefined

      vi.resetModules()
      vi.doMock('electron', () => ({
        contextBridge: {
          exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => {
            exposedBridge = bridge
          },
        },
        ipcRenderer: {
          invoke: () => Promise.resolve({
            status: 'accepted',
            reason: 'mirror_authorized',
            value: preloadStartBundle(sessionGeneration),
          }),
          on: () => undefined,
          removeListener: () => undefined,
          send: () => undefined,
        },
      }))

      try {
        await import('../../src/preload/mirror')

        const bridge = exposedBridge as unknown as Pick<MirrorBridge, 'requestRealtimeClientSecret'>
        const result = await bridge.requestRealtimeClientSecret()

        expect(result).toEqual(expect.objectContaining({
          status: expectedStatus,
          reason: expectedReason,
        }))
        if (expectedStatus === 'accepted') {
          expect(result).toEqual(expect.objectContaining({
            value: expect.objectContaining({
              identity: expect.objectContaining({ sessionGeneration }),
            }),
          }))
        }
      } finally {
        vi.doUnmock('electron')
        vi.resetModules()
      }
    },
  )
})

describe('Mirror runtime outcome reporting', () => {
  type MirrorRuntimeOutcomeReport = Readonly<{
    status: 'success' | 'failed' | 'ignored' | 'degraded'
    operation: 'start' | 'stop' | 'dispose' | 'interrupt' | 'rollover'
    reason: string
  }>

  it('sends exactly one frozen DTO with only the closed runtime outcome fields', async () => {
    type IpcSend = (channel: string, ...payload: unknown[]) => void

    const sends: Array<{ channel: string; payload: unknown[] }> = []
    let exposedBridge: Record<string, unknown> | undefined

    vi.resetModules()
    vi.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: (_name: string, bridge: Record<string, unknown>) => {
          exposedBridge = bridge
        },
      },
      ipcRenderer: {
        invoke: () => Promise.resolve(undefined),
        on: () => undefined,
        removeListener: () => undefined,
        send: ((channel: string, ...payload: unknown[]) => {
          sends.push({ channel, payload })
        }) as IpcSend,
      },
    }))

    try {
      await import('../../src/preload/mirror')

      const bridge = exposedBridge as {
        reportRealtimeRuntimeOutcome(value: unknown): void
      }
      bridge.reportRealtimeRuntimeOutcome({
        status: 'failed',
        operation: 'interrupt',
        reason: 'interrupt_failed',
        attemptedSteps: [RAW_ATTEMPTED_STEP],
        failedSteps: [RAW_FAILED_STEP],
        error: RAW_ERROR_MESSAGE,
        message: RAW_ERROR_MESSAGE,
        stack: RAW_ERROR_STACK,
        profileId: RAW_PROFILE_ID,
        guestId: RAW_GUEST_ID,
        candidateProfileId: RAW_CANDIDATE_ID,
        transcript: RAW_TRANSCRIPT,
        audio: RAW_AUDIO,
        memory: RAW_MEMORY,
        credentials: RAW_CREDENTIAL,
        model: RAW_MODEL_ID,
      } as MirrorRuntimeOutcomeReport)

      expect(sends).toHaveLength(1)
      expect(sends[0]?.channel).toBe('mirror:report-realtime-runtime-outcome')
      expect(sends[0]?.payload).toHaveLength(1)

      const dto = sends[0]?.payload[0]
      expect(dto).toEqual({
        status: 'failed',
        operation: 'interrupt',
        reason: 'interrupt_failed',
      })
      expect(Object.keys(dto as Record<string, unknown>).sort()).toEqual([
        'operation',
        'reason',
        'status',
      ])
      expect(Object.isFrozen(dto)).toBe(true)
      expect(collectKeys(dto).some((key) =>
        /attempted|failed|error|message|stack|profile|guest|candidate|transcript|audio|memory|credential|model/i.test(key),
      )).toBe(false)
      expectNoForbiddenContent(dto)
      for (const rawValue of [
        RAW_ATTEMPTED_STEP,
        RAW_FAILED_STEP,
        RAW_ERROR_MESSAGE,
        RAW_ERROR_STACK,
        RAW_CREDENTIAL,
      ]) {
        expect(serialized(dto)).not.toContain(rawValue)
      }
    } finally {
      vi.doUnmock('electron')
      vi.resetModules()
    }
  })
})

describe('Mirror App interrupt composition', () => {
  type InterruptHandler = () => void

  function createInterruptBridge(): {
    bridge: Pick<MirrorBridge, 'onInterrupt'>
    handlers: InterruptHandler[]
    removals: InterruptHandler[]
    disposers: Array<ReturnType<typeof vi.fn>>
  } {
    const handlers: InterruptHandler[] = []
    const removals: InterruptHandler[] = []
    const disposers: Array<ReturnType<typeof vi.fn>> = []

    const bridge: Pick<MirrorBridge, 'onInterrupt'> = {
      onInterrupt: (listener) => {
        handlers.push(listener)
        const dispose = vi.fn(() => {
          removals.push(listener)
        })
        disposers.push(dispose)
        return dispose
      },
    }

    return { bridge, handlers, removals, disposers }
  }

  function interruptOutcome(
    status: 'success' | 'failed',
    reason: 'interrupted' | 'interrupt_failed',
  ): RealtimeRuntimeOutcome {
    return Object.freeze({
      status,
      operation: 'interrupt',
      reason,
      attemptedSteps: Object.freeze([]),
      failedSteps: Object.freeze([]),
    })
  }

  async function flushInterruptCompletion(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
  }

  function expectContainedInterruptFailure(value: unknown): void {
    expect(value).toBeTypeOf('object')
    expect(value).not.toBeNull()

    const outcome = value as RealtimeRuntimeOutcome
    expect(outcome).toEqual({
      status: 'failed',
      operation: 'interrupt',
      reason: 'interrupt_failed',
      attemptedSteps: [],
      failedSteps: [],
    })
    expect(Object.keys(outcome).sort()).toEqual([
      'attemptedSteps',
      'failedSteps',
      'operation',
      'reason',
      'status',
    ])
    expect(Object.isFrozen(outcome)).toBe(true)
    expect(Object.isFrozen(outcome.attemptedSteps)).toBe(true)
    expect(Object.isFrozen(outcome.failedSteps)).toBe(true)
    expect(collectKeys(outcome).some((key) =>
      /error|message|stack|private|credential|profile|guest|model|transcript|audio|memory/i.test(key),
    )).toBe(false)
    expectNoForbiddenContent(outcome)
    expect(serialized(outcome)).not.toContain(RAW_ERROR_MESSAGE)
    expect(serialized(outcome)).not.toContain(RAW_ERROR_STACK)
  }

  it('dispatches one payload-free bridge event and forwards the exact typed outcome once', async () => {
    const { bridge, handlers } = createInterruptBridge()
    const outcome = interruptOutcome('success', 'interrupted')
    const interrupt = vi.fn<() => Promise<RealtimeRuntimeOutcome>>().mockResolvedValue(outcome)
    const target: Pick<RealtimeRuntimeOwner, 'interrupt'> = { interrupt }
    const sink = vi.fn<RealtimeRuntimeEventSink>()

    const cleanup = subscribeMirrorInterrupt(bridge, target, sink)
    handlers[0]?.()
    await flushInterruptCompletion()

    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(interrupt).toHaveBeenCalledWith()
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith(outcome)
    expect(sink.mock.calls[0]?.[0]).toBe(outcome)
    expectNoForbiddenContent(sink.mock.calls[0]?.[0])

    cleanup()
  })

  it('supports StrictMode-style setup/cleanup/setup with only the active wrapper delivering', async () => {
    const { bridge, handlers, removals, disposers } = createInterruptBridge()
    const outcome = interruptOutcome('success', 'interrupted')
    const interrupt = vi.fn<() => Promise<RealtimeRuntimeOutcome>>().mockResolvedValue(outcome)
    const target: Pick<RealtimeRuntimeOwner, 'interrupt'> = { interrupt }
    const sink = vi.fn<RealtimeRuntimeEventSink>()

    const firstCleanup = subscribeMirrorInterrupt(bridge, target, sink)
    const staleHandler = handlers[0]
    expect(staleHandler).toBeTypeOf('function')

    firstCleanup()
    firstCleanup()
    expect(disposers[0]).toHaveBeenCalledTimes(1)
    expect(removals[0]).toBe(staleHandler)

    const secondCleanup = subscribeMirrorInterrupt(bridge, target, sink)
    const activeHandler = handlers[1]
    expect(activeHandler).toBeTypeOf('function')

    staleHandler?.()
    activeHandler?.()
    await flushInterruptCompletion()

    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink.mock.calls[0]?.[0]).toBe(outcome)

    secondCleanup()
    secondCleanup()
    expect(disposers[1]).toHaveBeenCalledTimes(1)
    expect(removals).toEqual([staleHandler, activeHandler])
  })

  it('allows a pre-cleanup completion to report to the lifecycle-independent sink', async () => {
    const { bridge, handlers } = createInterruptBridge()
    const outcome = interruptOutcome('success', 'interrupted')
    let resolveInterrupt!: (value: RealtimeRuntimeOutcome) => void
    const pendingInterrupt = new Promise<RealtimeRuntimeOutcome>((resolve) => {
      resolveInterrupt = resolve
    })
    const interrupt = vi.fn<() => Promise<RealtimeRuntimeOutcome>>().mockReturnValue(pendingInterrupt)
    const target: Pick<RealtimeRuntimeOwner, 'interrupt'> = { interrupt }
    const sink = vi.fn<RealtimeRuntimeEventSink>()

    const cleanup = subscribeMirrorInterrupt(bridge, target, sink)
    handlers[0]?.()
    expect(interrupt).toHaveBeenCalledTimes(1)

    cleanup()
    resolveInterrupt(outcome)
    await flushInterruptCompletion()

    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink.mock.calls[0]?.[0]).toBe(outcome)
  })

  it('contains synchronous throws as a frozen metadata-only failure outcome', async () => {
    const { bridge, handlers } = createInterruptBridge()
    const interrupt = vi.fn<() => Promise<RealtimeRuntimeOutcome>>().mockImplementation(() => {
      throw new Error(RAW_ERROR_MESSAGE)
    })
    const target: Pick<RealtimeRuntimeOwner, 'interrupt'> = { interrupt }
    const sink = vi.fn<RealtimeRuntimeEventSink>()

    const cleanup = subscribeMirrorInterrupt(bridge, target, sink)
    expect(() => handlers[0]?.()).not.toThrow()
    await flushInterruptCompletion()

    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledTimes(1)
    expectContainedInterruptFailure(sink.mock.calls[0]?.[0])
    cleanup()
  })

  it('contains rejected promises as a frozen metadata-only failure outcome', async () => {
    const { bridge, handlers } = createInterruptBridge()
    const interrupt = vi.fn<() => Promise<RealtimeRuntimeOutcome>>()
      .mockRejectedValue(new Error(RAW_ERROR_MESSAGE))
    const target: Pick<RealtimeRuntimeOwner, 'interrupt'> = { interrupt }
    const sink = vi.fn<RealtimeRuntimeEventSink>()

    const cleanup = subscribeMirrorInterrupt(bridge, target, sink)
    expect(() => handlers[0]?.()).not.toThrow()
    await flushInterruptCompletion()

    expect(interrupt).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledTimes(1)
    expectContainedInterruptFailure(sink.mock.calls[0]?.[0])
    cleanup()
  })
})
