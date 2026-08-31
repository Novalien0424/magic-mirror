import { describe, expect, it, vi } from 'vitest'

import {
  MIRROR_STATE_COPY,
  projectMirrorSnapshot,
  reportMirrorRealtimeMetadata,
  subscribeMirrorInterrupt,
  subscribeMirrorRealtimeRuntime,
} from '../../src/renderer/mirror/App'
import type {
  MirrorBridge,
  RealtimeRendererMetadataKind,
  RealtimeRendererMetadataReport,
  RealtimeRuntimeCommand,
  RealtimeRuntimeOutcomeReport,
  RealtimeSessionStartBundleValue,
  TransientRealtimeSecretInput,
  TransientRealtimeSecretResult,
} from '../../src/shared/bridge'
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

describe('Mirror realtime metadata projection', () => {
  type MetadataBridge = Pick<MirrorBridge, 'reportRealtimeMetadata'>

  function createMetadataBridge(): {
    readonly bridge: MetadataBridge
    readonly reportRealtimeMetadata: ReturnType<typeof vi.fn>
  } {
    const reportRealtimeMetadata = vi.fn()
    return {
      bridge: { reportRealtimeMetadata },
      reportRealtimeMetadata,
    }
  }

  it('maps five lower-level event kinds into fresh bounded DTOs exactly once', () => {
    const { bridge, reportRealtimeMetadata } = createMetadataBridge()
    const cases: ReadonlyArray<{
      readonly kind: RealtimeRendererMetadataKind
      readonly event: Record<string, unknown>
      readonly expected: RealtimeRendererMetadataReport
    }> = [
      {
        kind: 'session',
        event: {
          event: 'realtime_stale_event',
          realtimeSessionId: 'synthetic-session-stale',
          sessionGeneration: 4,
          configVersion: 9,
          fingerprint: 'synthetic-fingerprint',
          sdkVersion: 'synthetic-sdk-version',
          realtimeDialogue: 'synthetic-dialogue-metadata',
          inputTranscription: 'synthetic-input-transcription-model',
          memoryExtractor: 'synthetic-memory-extractor-model',
          voice: 'synthetic-voice',
          reasoningEffort: 'synthetic-reasoning-effort',
          turnDetectionProfile: 'synthetic-turn-detection-profile',
          status: 'info',
          reason: 'stale_realtime_session',
        duration_ms: 12,
        },
        expected: {
          kind: 'session',
          status: 'info',
          reason: 'stale_realtime_session',
      durationMs: 12,
          sessionId: 'synthetic-session-stale',
        },
      },
      {
        kind: 'mic',
        event: {
          event: 'mic_handoff_failed',
          owner: 'realtime',
          status: 'failed',
          reason: 'track_stop_failed',
          count: 1,
          track_count: 2,
          stopped_count: 1,
          classification: 'Maintenance',
        },
        expected: {
          kind: 'mic',
          status: 'failed',
          reason: 'track_stop_failed',
        },
      },
      {
        kind: 'playback',
        event: {
          event: 'playback_completion_fallback',
          source: 'bounded_analyser_fallback',
          duration_ms: 750,
          status: 'degraded',
          reason: 'fallback_bound_reached',
          count: 1,
        },
        expected: {
          kind: 'playback',
          status: 'degraded',
          reason: 'fallback_bound_reached',
          durationMs: 750,
        },
      },
      {
        kind: 'transcript',
        event: {
          event: 'transcript_unavailable',
          realtimeSessionId: 'synthetic-session-transcript',
          itemId: 'synthetic-item-id',
          turnId: 'synthetic-turn-id',
          itemCount: 0,
          turnCount: 0,
          transcript: RAW_TRANSCRIPT,
          status: 'info',
          reason: 'cause=stale_realtime_session',
        },
        expected: {
          kind: 'transcript',
          status: 'info',
          reason: 'cause=stale_realtime_session',
          sessionId: 'synthetic-session-transcript',
        },
      },
      {
        kind: 'cleanup',
        event: {
          event: 'cleanup_failed',
          boundary: 'manual_stop',
          session_id: 'synthetic-session-cleanup',
          count: 2,
          status: 'failed',
          reason: 'cleanup_failed',
        },
        expected: {
          kind: 'cleanup',
          status: 'failed',
          reason: 'cleanup_failed',
          sessionId: 'synthetic-session-cleanup',
        },
      },
    ]

    for (const [index, testCase] of cases.entries()) {
      reportMirrorRealtimeMetadata(bridge, testCase.kind, testCase.event)

      expect(reportRealtimeMetadata).toHaveBeenCalledTimes(index + 1)
      const report = reportRealtimeMetadata.mock.calls[index]?.[0]
      expect(report).toEqual(testCase.expected)
      expect(report).not.toBe(testCase.event)
      expect(Object.keys(report ?? {}).sort()).toEqual(
        Object.keys(testCase.expected).sort(),
      )
      expect(
        Object.values(report ?? {}).every(
          (value) =>
            typeof value === 'string'
            || (typeof value === 'number' && Number.isFinite(value)),
        ),
      ).toBe(true)
    }
  })

  it('does not cross extra, private-shaped, nested, model, or config metadata', () => {
    const { bridge, reportRealtimeMetadata } = createMetadataBridge()
    const event = {
      event: 'transcript_available',
      realtimeSessionId: 'synthetic-session-private-shape',
      status: 'success',
      reason: 'cause=transcript_available',
      duration_ms: 20,
      count: 1,
      owner: 'realtime',
      boundary: 'renderer_restart',
      transcript: RAW_TRANSCRIPT,
      credential: RAW_CREDENTIAL,
      privateContext: RAW_PRIVATE_CONTEXT,
      model: RAW_MODEL_ID,
      configVersion: 11,
      config: {
        model: RAW_MODEL_ID,
        credential: RAW_CREDENTIAL,
        privateContext: RAW_PRIVATE_CONTEXT,
        transcript: RAW_TRANSCRIPT,
      },
      nested: {
        sentinel: RAW_TRANSCRIPT,
      },
    }

    reportMirrorRealtimeMetadata(bridge, 'transcript', event)

    expect(reportRealtimeMetadata).toHaveBeenCalledTimes(1)
    const report = reportRealtimeMetadata.mock.calls[0]?.[0]
    expect(report).toEqual({
      kind: 'transcript',
      status: 'success',
      reason: 'cause=transcript_available',
      durationMs: 20,
      sessionId: 'synthetic-session-private-shape',
    })
    expect(report).not.toBe(event)
    expectNoForbiddenContent(report)
    expect(serialized(report)).not.toContain(RAW_CREDENTIAL)
    expect(serialized(report)).not.toContain(RAW_PRIVATE_CONTEXT)
    expect(serialized(report)).not.toContain(RAW_TRANSCRIPT)
    expect(serialized(report)).not.toContain(RAW_MODEL_ID)
    expect(collectKeys(report)).not.toContain('config')
    expect(collectKeys(report)).not.toContain('nested')
  })

  it('reports one fixed failed DTO for missing, invalid, or throwing event access', () => {
    const { bridge, reportRealtimeMetadata } = createMetadataBridge()
    const throwingEvent = new Proxy<Record<string, unknown>>({}, {
      get() {
        throw new Error('synthetic-metadata-event-access-failed')
      },
    })
    const invalidEvents: readonly unknown[] = [
      undefined,
      null,
      'synthetic-non-record-event',
      {},
      { status: 'failed' },
      { reason: 'synthetic-missing-status' },
      { status: 'synthetic-invalid-status', reason: 'synthetic-reason' },
      { status: 'failed', reason: 42 },
      { status: 'failed', reason: '' },
      throwingEvent,
    ]

    for (const event of invalidEvents) {
      expect(() => {
        reportMirrorRealtimeMetadata(bridge, 'session', event)
      }).not.toThrow()
    }

    expect(reportRealtimeMetadata).toHaveBeenCalledTimes(invalidEvents.length)
    for (const [index, call] of reportRealtimeMetadata.mock.calls.entries()) {
      expect(call[0]).toEqual({
        kind: 'session',
        status: 'failed',
        reason: 'metadata_event_invalid',
      })
      expect(Object.keys(call[0] ?? {}).sort()).toEqual(['kind', 'reason', 'status'])
      expect(Object.is(call[0], invalidEvents[index])).toBe(false)
    }
  })

  it('contains throwing and rejecting bridge reports without retrying or duplicating', async () => {
    const event = {
      status: 'failed',
      reason: 'synthetic-bridge-report-test',
    }
    const throwingReportRealtimeMetadata = vi.fn(() => {
      throw new Error('synthetic-bridge-report-threw')
    })
    const throwingBridge: MetadataBridge = {
      reportRealtimeMetadata: throwingReportRealtimeMetadata,
    }
    let throwingReturn: unknown

    expect(() => {
      throwingReturn = reportMirrorRealtimeMetadata(throwingBridge, 'session', event)
    }).not.toThrow()
    expect(throwingReturn).toBeUndefined()
    expect(throwingReportRealtimeMetadata).toHaveBeenCalledTimes(1)

    const rejectedReport = Promise.reject<void>(
      new Error('synthetic-bridge-report-rejected'),
    )
    const rejectingReportRealtimeMetadata = vi.fn(() => rejectedReport)
    const rejectingBridge: MetadataBridge = {
      reportRealtimeMetadata: rejectingReportRealtimeMetadata,
    }
    let rejectingReturn: unknown

    expect(() => {
      rejectingReturn = reportMirrorRealtimeMetadata(rejectingBridge, 'mic', event)
    }).not.toThrow()
    expect(rejectingReturn).toBeUndefined()
    expect(rejectingReportRealtimeMetadata).toHaveBeenCalledTimes(1)

    await Promise.resolve()
    expect(rejectingReportRealtimeMetadata).toHaveBeenCalledTimes(1)
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

describe('Mirror scene-action feedback transport', () => {
  it('sends one frozen metadata-only renderer result on the dedicated channel', async () => {
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
        send: (channel: string, ...payload: unknown[]) => sends.push({ channel, payload }),
      },
    }))

    try {
      await import('../../src/preload/mirror')
      const bridge = exposedBridge as unknown as {
        reportSceneAction?: (report: Record<string, unknown>) => void
      }
      expect(bridge.reportSceneAction).toBeTypeOf('function')
      if (typeof bridge.reportSceneAction !== 'function') return

      bridge.reportSceneAction({
        runId: 'scene-run-1',
        sceneId: 'scene-opening',
        stageId: 'stage-opening',
        actionId: 'dialogue-opening',
        status: 'failed',
        errorCode: 'no_active_realtime_session',
        transcript: RAW_TRANSCRIPT,
        audio: RAW_AUDIO,
        guestId: RAW_GUEST_ID,
      })

      expect(sends).toHaveLength(1)
      expect(sends[0]?.channel).toBe('mirror:report-scene-action')
      expect(sends[0]?.payload).toHaveLength(1)
      expect(sends[0]?.payload[0]).toEqual({
        runId: 'scene-run-1',
        sceneId: 'scene-opening',
        stageId: 'stage-opening',
        actionId: 'dialogue-opening',
        status: 'failed',
        errorCode: 'no_active_realtime_session',
      })
      expect(Object.isFrozen(sends[0]?.payload[0])).toBe(true)
      expectNoForbiddenContent(sends)
    } finally {
      vi.doUnmock('electron')
      vi.resetModules()
    }
  })

  it('delivers correlated scene commands while rejecting malformed context', async () => {
    type IpcListener = (event: unknown, ...payload: unknown[]) => void
    const registrations: Array<{ channel: string; listener: IpcListener }> = []
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
        on: (channel: string, listener: IpcListener) => registrations.push({ channel, listener }),
        removeListener: () => undefined,
        send: () => undefined,
      },
    }))

    try {
      await import('../../src/preload/mirror')
      const bridge = exposedBridge as unknown as {
        onAvatarControl: (listener: (command: unknown) => void) => () => void
      }
      const listener = vi.fn<(command: unknown) => void>()
      bridge.onAvatarControl(listener)
      const registration = registrations.find((entry) => entry.channel === 'mirror:avatar-control')
      expect(registration).toBeDefined()
      if (registration === undefined) return

      const context = {
        runId: 'scene-run-1', sceneId: 'scene-opening',
        stageId: 'stage-opening', actionId: 'dialogue-opening',
      }
      const commands = [
        { type: 'asset_failure', action: 'inject' },
        { type: 'scene_dialogue', text: 'The mirror awakens now.', context },
        { type: 'motion', group: 'Scene', context: { ...context, actionId: 'motion-scene' } },
        { type: 'expression', name: 'exp_01', context: { ...context, actionId: 'expression-one' } },
        { type: 'scene_music', action: 'play', assetId: 'music-tone', gain: 0.65, loop: false, context: { ...context, actionId: 'music-play' } },
      ]
      for (const command of commands) registration.listener({}, command)
      registration.listener({}, {
        type: 'motion', group: 'Scene',
        context: { ...context, transcript: RAW_TRANSCRIPT },
      })

      expect(listener).toHaveBeenCalledTimes(commands.length)
      expect(listener.mock.calls.map(([command]) => command)).toEqual(commands)
      expect(listener.mock.calls.every(([command]) => Object.isFrozen(command))).toBe(true)
      expectNoForbiddenContent(listener.mock.calls)
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

describe('Mirror realtime failure report transport', () => {
  it('sends one fresh frozen exact-key DTO on the failure channel without returning a payload', async () => {
    type IpcSend = (channel: string, ...payload: unknown[]) => unknown

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
          return 'synthetic-return-payload'
        }) as IpcSend,
      },
    }))

    try {
      await import('../../src/preload/mirror')

      const bridge = exposedBridge as unknown as {
        reportRealtimeFailure?: (value: unknown) => unknown
      }
      expect(bridge.reportRealtimeFailure).toBeTypeOf('function')
      if (typeof bridge.reportRealtimeFailure !== 'function') return

      const sourceReport = {
        kind: 'ice',
        realtimeSessionId: 'opaque-realtime-session-42',
        reason: 'ice_failed',
        error: RAW_ERROR_MESSAGE,
        profileId: RAW_PROFILE_ID,
        guestId: RAW_GUEST_ID,
        transcript: RAW_TRANSCRIPT,
        audio: RAW_AUDIO,
        memory: RAW_MEMORY,
        credentials: RAW_CREDENTIAL,
      }
      const result = bridge.reportRealtimeFailure(sourceReport)

      expect(result).toBeUndefined()
      expect(sends).toHaveLength(1)
      expect(sends[0]?.channel).toBe('mirror:report-realtime-failure')
      expect(sends[0]?.payload).toHaveLength(1)

      const dto = sends[0]?.payload[0]
      expect(dto).toEqual({
        kind: 'ice',
        realtimeSessionId: 'opaque-realtime-session-42',
        reason: 'ice_failed',
      })
      expect(dto).not.toBe(sourceReport)
      expect(Object.keys(dto as Record<string, unknown>).sort()).toEqual([
        'kind',
        'realtimeSessionId',
        'reason',
      ])
      expect(Object.isFrozen(dto)).toBe(true)
      expect(collectKeys(dto).some((key) =>
        /error|profile|guest|transcript|audio|memory|credential/i.test(key),
      )).toBe(false)
      expectNoForbiddenContent(dto)
      expect(serialized(dto)).not.toContain(RAW_ERROR_MESSAGE)
      expect(serialized(dto)).not.toContain(RAW_CREDENTIAL)
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

describe('Mirror App realtime runtime composition', () => {
  type RuntimeCompositionBridge = Pick<
    MirrorBridge,
    | 'requestRealtimeClientSecret'
    | 'reportRealtimeRuntimeOutcome'
    | 'onRealtimeRuntimeCommand'
    | 'onInterrupt'
  >
  type CommandHandler = (command: RealtimeRuntimeCommand) => void
  type InterruptHandler = () => void

  const SYNTHETIC_RUNTIME_SECRET = 'ek_synthetic-runtime-client-secret'

  function syntheticBundle(sessionGeneration: number): RealtimeSessionStartBundleValue {
    return {
      snapshot: {
        configVersion: 7,
        fingerprint: 'synthetic-runtime-config-fingerprint',
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
        realtimeSessionId: `synthetic-runtime-session-${sessionGeneration}`,
        sessionGeneration,
      },
      clientSecret: SYNTHETIC_RUNTIME_SECRET as unknown as TransientRealtimeSecretInput,
      expiresAt: 1_800_000_000 + sessionGeneration,
    } as unknown as RealtimeSessionStartBundleValue
  }

  function acceptedSecret(
    value: RealtimeSessionStartBundleValue,
  ): TransientRealtimeSecretResult {
    return Object.freeze({
      status: 'accepted',
      reason: 'mirror_authorized',
      value,
    })
  }

  function rejectedSecret(
    reason: Extract<TransientRealtimeSecretResult, { status: 'rejected' }>['reason'],
  ): TransientRealtimeSecretResult {
    return Object.freeze({ status: 'rejected', reason })
  }

  function runtimeOutcome(
    operation: RealtimeRuntimeOutcome['operation'],
    reason: string,
    status: RealtimeRuntimeOutcome['status'] = 'success',
  ): RealtimeRuntimeOutcome {
    return Object.freeze({
      status,
      operation,
      reason,
      attemptedSteps: Object.freeze([]),
      failedSteps: Object.freeze([]),
    })
  }

  function createRuntimeBridge(events: string[] = []) {
    const commandHandlers: CommandHandler[] = []
    const interruptHandlers: InterruptHandler[] = []
    const commandUnsubscribers: Array<ReturnType<typeof vi.fn>> = []
    const interruptUnsubscribers: Array<ReturnType<typeof vi.fn>> = []
    const requestRealtimeClientSecret = vi.fn<RuntimeCompositionBridge['requestRealtimeClientSecret']>()
    const reportRealtimeRuntimeOutcome = vi.fn<RuntimeCompositionBridge['reportRealtimeRuntimeOutcome']>()

    const onRealtimeRuntimeCommand: RuntimeCompositionBridge['onRealtimeRuntimeCommand'] =
      (listener) => {
        commandHandlers.push(listener)
        const unsubscribe = vi.fn<() => void>()
        unsubscribe.mockImplementation(() => {
          events.push('command_unsubscribe')
        })
        commandUnsubscribers.push(unsubscribe)
        return unsubscribe
      }
    const onInterrupt: RuntimeCompositionBridge['onInterrupt'] = (listener) => {
      interruptHandlers.push(listener)
      const unsubscribe = vi.fn<() => void>()
      unsubscribe.mockImplementation(() => {
        events.push('interrupt_unsubscribe')
      })
      interruptUnsubscribers.push(unsubscribe)
      return unsubscribe
    }

    return {
      bridge: {
        requestRealtimeClientSecret,
        reportRealtimeRuntimeOutcome,
        onRealtimeRuntimeCommand,
        onInterrupt,
      },
      commandHandlers,
      interruptHandlers,
      commandUnsubscribers,
      interruptUnsubscribers,
      requestRealtimeClientSecret,
      reportRealtimeRuntimeOutcome,
    }
  }

  function createRuntimeOwner() {
    const start = vi.fn<RealtimeRuntimeOwner['start']>()
      .mockResolvedValue(runtimeOutcome('start', 'started'))
    const rollover = vi.fn<RealtimeRuntimeOwner['rollover']>()
      .mockResolvedValue(runtimeOutcome('rollover', 'rolled_over'))
    const stop = vi.fn<RealtimeRuntimeOwner['stop']>()
      .mockResolvedValue(runtimeOutcome('stop', 'stopped'))
    const interrupt = vi.fn<RealtimeRuntimeOwner['interrupt']>()
      .mockResolvedValue(runtimeOutcome('interrupt', 'interrupted'))
    const dispose = vi.fn<RealtimeRuntimeOwner['dispose']>()
      .mockResolvedValue(runtimeOutcome('dispose', 'disposed'))

    return {
      owner: { start, rollover, stop, interrupt, dispose },
      start,
      rollover,
      stop,
      interrupt,
      dispose,
    }
  }

  async function flushRuntimeComposition(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  function expectBoundedReport(
    value: unknown,
    expected: RealtimeRuntimeOutcomeReport,
  ): void {
    expect(value).toEqual(expected)
    expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
      'operation',
      'reason',
      'status',
    ])
    expect(collectKeys(value).some((key) =>
      /attempted|failed|error|message|stack|credential|clientSecret|profile|guest|candidate|transcript|audio|memory|private|model|snapshot/i.test(key),
    )).toBe(false)
    expectNoForbiddenContent(value)
    expect(serialized(value)).not.toContain(SYNTHETIC_RUNTIME_SECRET)
    expect(serialized(value)).not.toContain(RAW_ERROR_MESSAGE)
  }

  it('requests one bundle for start and rollover, passes each exact value, and reports bounded outcomes', async () => {
    const bridgeState = createRuntimeBridge()
    const ownerState = createRuntimeOwner()
    const startBundle = syntheticBundle(1)
    const rolloverBundle = syntheticBundle(2)
    const startOutcome = runtimeOutcome('start', 'started')
    const rolloverOutcome = runtimeOutcome('rollover', 'rolled_over')

    bridgeState.requestRealtimeClientSecret
      .mockResolvedValueOnce(acceptedSecret(startBundle))
      .mockResolvedValueOnce(acceptedSecret(rolloverBundle))
    ownerState.start.mockResolvedValueOnce(startOutcome)
    ownerState.rollover.mockResolvedValueOnce(rolloverOutcome)

    const cleanup = subscribeMirrorRealtimeRuntime(bridgeState.bridge, ownerState.owner)
    bridgeState.commandHandlers[0]?.({ operation: 'start', reason: 'manual_start' })
    bridgeState.commandHandlers[0]?.({ operation: 'rollover', reason: 'session_limit' })
    await flushRuntimeComposition()

    expect(bridgeState.requestRealtimeClientSecret).toHaveBeenCalledTimes(2)
    expect(ownerState.start).toHaveBeenCalledTimes(1)
    expect(ownerState.start.mock.calls[0]?.[0]).toBe(startBundle)
    expect(ownerState.rollover).toHaveBeenCalledTimes(1)
    expect(ownerState.rollover.mock.calls[0]?.[0]).toBe(rolloverBundle)
    expect(bridgeState.reportRealtimeRuntimeOutcome).toHaveBeenCalledTimes(2)
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[0]?.[0], {
      status: 'success',
      operation: 'start',
      reason: 'started',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[1]?.[0], {
      status: 'success',
      operation: 'rollover',
      reason: 'rolled_over',
    })

    cleanup()
    await flushRuntimeComposition()
  })

  it('stops without credentials and routes manual stop to the runtime stop boundary plus payload-free interrupt to the same owner', async () => {
    const bridgeState = createRuntimeBridge()
    const ownerState = createRuntimeOwner()
    const cleanup = subscribeMirrorRealtimeRuntime(bridgeState.bridge, ownerState.owner)

    bridgeState.commandHandlers[0]?.({ operation: 'stop', reason: 'manual_stop' })
    bridgeState.interruptHandlers[0]?.()
    await flushRuntimeComposition()

    expect(bridgeState.requestRealtimeClientSecret).not.toHaveBeenCalled()
    expect(ownerState.stop).toHaveBeenCalledTimes(1)
    expect(ownerState.stop).toHaveBeenCalledWith('stop')
    expect(ownerState.interrupt).toHaveBeenCalledTimes(1)
    expect(ownerState.interrupt).toHaveBeenCalledWith()
    expect(bridgeState.reportRealtimeRuntimeOutcome).toHaveBeenCalledTimes(2)
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[0]?.[0], {
      status: 'success',
      operation: 'stop',
      reason: 'stopped',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[1]?.[0], {
      status: 'success',
      operation: 'interrupt',
      reason: 'interrupted',
    })

    cleanup()
    await flushRuntimeComposition()
  })

  it('contains credential rejection, synchronous request throws, and rejected requests without invoking lifecycle methods', async () => {
    const bridgeState = createRuntimeBridge()
    const ownerState = createRuntimeOwner()
    bridgeState.requestRealtimeClientSecret
      .mockResolvedValueOnce(rejectedSecret('broker_failed'))
      .mockImplementationOnce(() => {
        throw new Error(RAW_ERROR_MESSAGE)
      })
      .mockRejectedValueOnce(new Error(RAW_ERROR_MESSAGE))
      .mockRejectedValueOnce(new Error(RAW_ERROR_MESSAGE))

    const cleanup = subscribeMirrorRealtimeRuntime(bridgeState.bridge, ownerState.owner)
    bridgeState.commandHandlers[0]?.({ operation: 'start', reason: 'manual_start' })
    await flushRuntimeComposition()
    expect(() => {
      bridgeState.commandHandlers[0]?.({ operation: 'rollover', reason: 'session_limit' })
    }).not.toThrow()
    await flushRuntimeComposition()
    bridgeState.commandHandlers[0]?.({ operation: 'start', reason: 'manual_start' })
    await flushRuntimeComposition()
    bridgeState.commandHandlers[0]?.({ operation: 'rollover', reason: 'session_limit' })
    await flushRuntimeComposition()

    expect(ownerState.start).not.toHaveBeenCalled()
    expect(ownerState.rollover).not.toHaveBeenCalled()
    expect(bridgeState.reportRealtimeRuntimeOutcome).toHaveBeenCalledTimes(4)
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[0]?.[0], {
      status: 'failed',
      operation: 'start',
      reason: 'broker_failed',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[1]?.[0], {
      status: 'failed',
      operation: 'rollover',
      reason: 'credential_request_failed',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[2]?.[0], {
      status: 'failed',
      operation: 'start',
      reason: 'credential_request_failed',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[3]?.[0], {
      status: 'failed',
      operation: 'rollover',
      reason: 'credential_request_failed',
    })

    cleanup()
    await flushRuntimeComposition()
  })

  it('contains synchronous owner throws and rejected owner promises with stable bounded failures', async () => {
    const bridgeState = createRuntimeBridge()
    const ownerState = createRuntimeOwner()
    const startBundle = syntheticBundle(3)
    const rolloverBundle = syntheticBundle(4)
    bridgeState.requestRealtimeClientSecret
      .mockResolvedValueOnce(acceptedSecret(startBundle))
      .mockResolvedValueOnce(acceptedSecret(rolloverBundle))
    ownerState.start.mockImplementationOnce(() => {
      throw new Error(RAW_ERROR_MESSAGE)
    })
    ownerState.rollover.mockRejectedValueOnce(new Error(RAW_ERROR_MESSAGE))
    ownerState.stop.mockImplementationOnce(() => {
      throw new Error(RAW_ERROR_MESSAGE)
    })
    ownerState.interrupt.mockRejectedValueOnce(new Error(RAW_ERROR_MESSAGE))
    ownerState.dispose.mockImplementationOnce(() => {
      throw new Error(RAW_ERROR_MESSAGE)
    })

    const cleanup = subscribeMirrorRealtimeRuntime(bridgeState.bridge, ownerState.owner)
    expect(() => {
      bridgeState.commandHandlers[0]?.({ operation: 'start', reason: 'manual_start' })
    }).not.toThrow()
    await flushRuntimeComposition()
    bridgeState.commandHandlers[0]?.({ operation: 'rollover', reason: 'session_limit' })
    await flushRuntimeComposition()
    expect(() => {
      bridgeState.commandHandlers[0]?.({ operation: 'stop', reason: 'manual_stop' })
    }).not.toThrow()
    await flushRuntimeComposition()
    expect(() => bridgeState.interruptHandlers[0]?.()).not.toThrow()
    await flushRuntimeComposition()
    cleanup()
    await flushRuntimeComposition()

    expect(bridgeState.reportRealtimeRuntimeOutcome).toHaveBeenCalledTimes(5)
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[0]?.[0], {
      status: 'failed',
      operation: 'start',
      reason: 'start_failed',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[1]?.[0], {
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_failed',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[2]?.[0], {
      status: 'failed',
      operation: 'stop',
      reason: 'stop_failed',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[3]?.[0], {
      status: 'failed',
      operation: 'interrupt',
      reason: 'interrupt_failed',
    })
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[4]?.[0], {
      status: 'failed',
      operation: 'dispose',
      reason: 'dispose_failed',
    })
  })

  it('unsubscribes both listeners before disposing exactly once and reports bounded disposal', async () => {
    const events: string[] = []
    const bridgeState = createRuntimeBridge(events)
    const ownerState = createRuntimeOwner()
    const disposeOutcome = runtimeOutcome('dispose', 'disposed')
    ownerState.dispose.mockImplementationOnce(() => {
      events.push('dispose')
      return Promise.resolve(disposeOutcome)
    })

    const cleanup = subscribeMirrorRealtimeRuntime(bridgeState.bridge, ownerState.owner)
    cleanup()
    cleanup()
    await flushRuntimeComposition()

    expect(events).toEqual([
      'command_unsubscribe',
      'interrupt_unsubscribe',
      'dispose',
    ])
    expect(bridgeState.commandUnsubscribers[0]).toHaveBeenCalledTimes(1)
    expect(bridgeState.interruptUnsubscribers[0]).toHaveBeenCalledTimes(1)
    expect(ownerState.dispose).toHaveBeenCalledTimes(1)
    expect(bridgeState.reportRealtimeRuntimeOutcome).toHaveBeenCalledTimes(1)
    expectBoundedReport(bridgeState.reportRealtimeRuntimeOutcome.mock.calls[0]?.[0], {
      status: 'success',
      operation: 'dispose',
      reason: 'disposed',
    })
  })

  it('ignores stale callbacks and late credentials while StrictMode-style setup/dispose/setup isolates owners', async () => {
    const bridgeState = createRuntimeBridge()
    const firstOwner = createRuntimeOwner()
    const secondOwner = createRuntimeOwner()
    const firstBundle = syntheticBundle(5)
    const secondBundle = syntheticBundle(6)
    let resolveFirstCredentials!: (value: TransientRealtimeSecretResult) => void
    const firstCredentials = new Promise<TransientRealtimeSecretResult>((resolve) => {
      resolveFirstCredentials = resolve
    })
    bridgeState.requestRealtimeClientSecret
      .mockReturnValueOnce(firstCredentials)
      .mockResolvedValueOnce(acceptedSecret(secondBundle))

    const firstCleanup = subscribeMirrorRealtimeRuntime(bridgeState.bridge, firstOwner.owner)
    const staleStart = bridgeState.commandHandlers[0]
    const staleInterrupt = bridgeState.interruptHandlers[0]
    staleStart?.({ operation: 'start', reason: 'manual_start' })
    expect(bridgeState.requestRealtimeClientSecret).toHaveBeenCalledTimes(1)

    firstCleanup()

    const secondCleanup = subscribeMirrorRealtimeRuntime(bridgeState.bridge, secondOwner.owner)
    const activeStart = bridgeState.commandHandlers[1]
    const activeInterrupt = bridgeState.interruptHandlers[1]
    staleStart?.({ operation: 'start', reason: 'manual_start' })
    staleInterrupt?.()
    activeStart?.({ operation: 'start', reason: 'manual_start' })
    activeInterrupt?.()
    resolveFirstCredentials(acceptedSecret(firstBundle))
    await flushRuntimeComposition()

    expect(firstOwner.start).not.toHaveBeenCalled()
    expect(firstOwner.rollover).not.toHaveBeenCalled()
    expect(firstOwner.stop).not.toHaveBeenCalled()
    expect(firstOwner.interrupt).not.toHaveBeenCalled()
    expect(firstOwner.dispose).toHaveBeenCalledTimes(1)
    expect(secondOwner.start).toHaveBeenCalledTimes(1)
    expect(secondOwner.start.mock.calls[0]?.[0]).toBe(secondBundle)
    expect(secondOwner.interrupt).toHaveBeenCalledTimes(1)
    expect(bridgeState.requestRealtimeClientSecret).toHaveBeenCalledTimes(2)

    secondCleanup()
    await flushRuntimeComposition()
    expect(secondOwner.dispose).toHaveBeenCalledTimes(1)
    const reports = bridgeState.reportRealtimeRuntimeOutcome.mock.calls.map((call) => call[0])
    expect(reports).toHaveLength(4)
    expect(reports).toContainEqual({
      status: 'success',
      operation: 'dispose',
      reason: 'disposed',
    })
    expect(reports).toContainEqual({
      status: 'success',
      operation: 'start',
      reason: 'started',
    })
    expect(reports).toContainEqual({
      status: 'success',
      operation: 'interrupt',
      reason: 'interrupted',
    })
    expect(reports.filter((report) => report?.operation === 'dispose')).toHaveLength(2)
    for (const report of reports) {
      expectBoundedReport(report, report as RealtimeRuntimeOutcomeReport)
    }
  })
})
