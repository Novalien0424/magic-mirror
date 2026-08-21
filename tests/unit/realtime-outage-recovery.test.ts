import { expect, it } from 'vitest'

import { createRealtimeOutageRecoveryController } from '../../src/main/realtime/outage-recovery'
import {
  createRealtimeSession,
  type CreateRealtimeSessionInput,
  type RealtimeSessionDependencies,
  type RealtimeSessionHandle,
} from '../../src/renderer/realtime/realtime-session-adapter'
import { createDeterministicRealtimeTransport } from '../../src/renderer/realtime/realtime-transport'
import type { RealtimeMetadataEvent } from '../../src/shared/realtime-events'
import { RECOVERY_PROBE_DELAYS_MS } from '../../src/shared/realtime-recovery'
import type { RealtimeFailureInput } from '../../src/shared/realtime-recovery'

type LifecycleState =
  | 'activating'
  | 'active'
  | 'offlineLoop'
  | 'maintenance'
  | 'dormant'

interface ScheduledProbe {
  readonly handle: number
  readonly delayMs: number
  readonly run: () => void | Promise<void>
}

type AdapterSessionEventListener = (event: unknown) => void

interface AdapterFailureProbe {
  readonly dependencies: RealtimeSessionDependencies
  readonly sdkCloseCalls: string[]
  emit(eventName: string, event: unknown): void
}

function makeAdapterFailureProbe(): AdapterFailureProbe {
  const listeners = new Map<string, AdapterSessionEventListener[]>()
  const sdkCloseCalls: string[] = []

  const fakeSession = {
    connect: async (_options: { readonly apiKey: string }) => undefined,
    interrupt: async () => undefined,
    close: async () => {
      sdkCloseCalls.push('sdk_close')
    },
    on: (eventName: string, listener: AdapterSessionEventListener) => {
      const eventListeners = listeners.get(eventName) ?? []
      eventListeners.push(listener)
      listeners.set(eventName, eventListeners)
    },
  }

  const RealtimeSession = function (..._args: unknown[]) {
    return fakeSession
  }

  return {
    dependencies: {
      RealtimeSession: RealtimeSession as unknown as RealtimeSessionDependencies['RealtimeSession'],
      createTransport: () => createDeterministicRealtimeTransport(),
    },
    sdkCloseCalls,
    emit: (eventName: string, event: unknown) => {
      for (const listener of listeners.get(eventName) ?? []) {
        listener(event)
      }
    },
  }
}

function makeAdapterFailureInput(
  probe: AdapterFailureProbe,
  sessionId: string,
  eventSink: (event: RealtimeMetadataEvent) => void,
  onFailure: NonNullable<CreateRealtimeSessionInput['onFailure']>,
): CreateRealtimeSessionInput {
  return {
    snapshot: Object.freeze({
      configVersion: 1,
      fingerprint: 'snapshot-fingerprint',
      sdkVersion: '0.16.1',
      realtimeDialogue: 'configured-realtime-model',
      inputTranscription: 'configured-transcription-model',
      memoryExtractor: 'configured-memory-model',
      voice: 'configured-voice',
      turnDetectionProfile: 'semantic-vad-interruptible',
      reasoningEffort: 'medium',
      takenAt: '2026-08-21T00:00:00.000Z',
    }) as CreateRealtimeSessionInput['snapshot'],
    clientSecret: 'opaque-transient-input',
    mediaStream: {} as MediaStream,
    audioElement: {} as HTMLAudioElement,
    sessionId,
    eventSink,
    onFailure,
    dependencies: probe.dependencies,
  }
}

it('keeps outage cleanup ordered, stale-safe, bounded, and metadata-only', async () => {
  const makeHarness = (initialState: LifecycleState) => {
    let lifecycleState = initialState
    let realtimeSessionId = 'session-current'
    let nowMs = 1_000
    let releaseMicFails = false
    let nextHandle = 1
    const calls: string[] = []
    const closedSessionIds: string[] = []
    const metadata: Array<Record<string, unknown>> = []
    const probeOutcomes: boolean[] = []
    const scheduled: ScheduledProbe[] = []

    const controller = createRealtimeOutageRecoveryController({
      lifecycle: {
        get: () => lifecycleState,
        transition: (nextState: LifecycleState) => {
          lifecycleState = nextState
          calls.push(`transition:${nextState}`)
        },
      },
      getRealtimeSessionId: () => realtimeSessionId,
      stopOutput: async () => {
        calls.push('stopOutput')
        nowMs += 700
      },
      closeSession: async (sessionId: string) => {
        calls.push('closeSession')
        closedSessionIds.push(sessionId)
        nowMs += 700
      },
      releaseMic: async () => {
        calls.push('releaseMic')
        nowMs += 700
        if (releaseMicFails) {
          throw new Error('injected_mic_handoff_failure')
        }
      },
      clearRamSession: () => {
        calls.push('clearRamSession')
        nowMs += 700
      },
      lightweightProbe: async () => {
        calls.push('lightweightProbe')
        return probeOutcomes.shift() ?? false
      },
      schedule: (run: () => void | Promise<void>, delayMs: number) => {
        const handle = nextHandle
        nextHandle += 1
        scheduled.push({ handle, delayMs, run })
        return handle
      },
      cancel: (handle: number) => {
        calls.push(`cancel:${handle}`)
      },
      now: () => nowMs,
      metadataSink: (event: Record<string, unknown>) => {
        metadata.push(event)
      },
    })

    return {
      calls,
      closedSessionIds,
      controller,
      metadata,
      probeOutcomes,
      scheduled,
      get lifecycleState() {
        return lifecycleState
      },
      set lifecycleState(nextState: LifecycleState) {
        lifecycleState = nextState
      },
      get nowMs() {
        return nowMs
      },
      set nowMs(nextNowMs: number) {
        nowMs = nextNowMs
      },
      get releaseMicFails() {
        return releaseMicFails
      },
      set releaseMicFails(value: boolean) {
        releaseMicFails = value
      },
      get realtimeSessionId() {
        return realtimeSessionId
      },
      set realtimeSessionId(nextSessionId: string) {
        realtimeSessionId = nextSessionId
      },
    }
  }

  expect(RECOVERY_PROBE_DELAYS_MS).toEqual([5_000, 15_000, 30_000, 60_000])

  const cleanup = makeHarness('activating')
  const cleanupStartedAt = cleanup.nowMs
  await cleanup.controller.handleRealtimeFailure({
    kind: 'connect',
    realtimeSessionId: 'session-current',
    reason: 'connect_failed',
  })

  expect(cleanup.calls).toEqual([
    'stopOutput',
    'closeSession',
    'releaseMic',
    'clearRamSession',
    'transition:offlineLoop',
  ])
  expect(cleanup.closedSessionIds).toEqual(['session-current'])
  expect(cleanup.lifecycleState).toBe('offlineLoop')
  expect(cleanup.nowMs - cleanupStartedAt).toBeLessThanOrEqual(5_000)
  expect(cleanup.metadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'realtime_failure_entered',
        reason: 'connect_failed',
        session_id: 'session-current',
      }),
      expect.objectContaining({
        event: 'offline_loop_started',
        reason: 'connect_failed',
      }),
    ]),
  )

  cleanup.calls.length = 0
  cleanup.closedSessionIds.length = 0
  cleanup.metadata.length = 0
  cleanup.realtimeSessionId = 'session-new'
  await cleanup.controller.handleRealtimeFailure({
    kind: 'ice',
    realtimeSessionId: 'session-old',
    reason: 'late_ice_failure',
  })

  expect(cleanup.calls).toEqual([])
  expect(cleanup.closedSessionIds).toEqual([])
  expect(cleanup.metadata).toHaveLength(1)
  expect(cleanup.metadata[0]).toEqual(
    expect.objectContaining({
      reason: 'stale_realtime_session',
      session_id: 'session-old',
    }),
  )

  const micFailure = makeHarness('active')
  micFailure.releaseMicFails = true
  await micFailure.controller.handleRealtimeFailure({
    kind: 'active_disconnect',
    realtimeSessionId: 'session-current',
    reason: 'mic_release_failed',
  })

  expect(micFailure.lifecycleState).toBe('maintenance')
  expect(micFailure.calls.slice(0, 3)).toEqual([
    'stopOutput',
    'closeSession',
    'releaseMic',
  ])
  expect(micFailure.calls).not.toContain('transition:offlineLoop')
  expect(micFailure.metadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        classification: 'Maintenance',
        reason: 'mic_handoff_failed',
      }),
    ]),
  )

  const successfulProbe = makeHarness('offlineLoop')
  successfulProbe.probeOutcomes.push(false, true)
  successfulProbe.controller.scheduleRecoveryProbes()

  expect(successfulProbe.scheduled.map(({ delayMs }) => delayMs)).toEqual([
    ...RECOVERY_PROBE_DELAYS_MS,
  ])
  await successfulProbe.scheduled[0].run()
  await successfulProbe.scheduled[1].run()
  expect(successfulProbe.lifecycleState).toBe('dormant')
  expect(successfulProbe.calls).toEqual([
    'lightweightProbe',
    'lightweightProbe',
    'cancel:3',
    'cancel:4',
    'transition:dormant',
  ])

  const exhaustedProbes = makeHarness('offlineLoop')
  exhaustedProbes.probeOutcomes.push(false, false, false, false)
  exhaustedProbes.controller.scheduleRecoveryProbes()
  expect(exhaustedProbes.scheduled.map(({ delayMs }) => delayMs)).toEqual([
    ...RECOVERY_PROBE_DELAYS_MS,
  ])
  for (const probe of exhaustedProbes.scheduled) {
    await probe.run()
  }

  expect(exhaustedProbes.lifecycleState).toBe('dormant')
  expect(exhaustedProbes.calls).toEqual([
    'lightweightProbe',
    'lightweightProbe',
    'lightweightProbe',
    'lightweightProbe',
    'transition:dormant',
  ])
  expect(
    exhaustedProbes.metadata.filter((event) => event.event === 'recovery_probe'),
  ).toHaveLength(4)
})

it('routes current adapter failures through the typed Main callback once and keeps metadata stable', () => {
  const expectedFailureKeys = ['kind', 'reason', 'realtimeSessionId'].sort()

  const preReadyProbe = makeAdapterFailureProbe()
  const preReadyFailures: RealtimeFailureInput[] = []
  const preReadyMetadata: RealtimeMetadataEvent[] = []
  const preReadyHandle = createRealtimeSession(
    makeAdapterFailureInput(
      preReadyProbe,
      'session-pre-ready',
      (event) => preReadyMetadata.push(event),
      (failure) => {
        preReadyFailures.push(failure)
      },
    ),
  )
  const preReadyTransportError = {
    type: 'error',
    realtimeSessionId: preReadyHandle.realtimeSessionId,
    content: 'opaque-response-content',
    error: 'opaque-provider-error',
  }
  preReadyProbe.emit('transport_event', preReadyTransportError)
  preReadyProbe.emit('transport_event', preReadyTransportError)

  expect(preReadyFailures).toEqual([
    {
      kind: 'connect',
      realtimeSessionId: preReadyHandle.realtimeSessionId,
      reason: 'cause=transport_error',
    },
  ])
  expect(preReadyMetadata.map(({ event }) => event)).toEqual([
    'realtime_session_created',
    'realtime_connect_failed',
  ])

  const postReadyErrorProbe = makeAdapterFailureProbe()
  const postReadyErrorFailures: RealtimeFailureInput[] = []
  const postReadyErrorMetadata: RealtimeMetadataEvent[] = []
  const postReadyErrorHandle = createRealtimeSession(
    makeAdapterFailureInput(
      postReadyErrorProbe,
      'session-post-ready-error',
      (event) => postReadyErrorMetadata.push(event),
      (failure) => {
        postReadyErrorFailures.push(failure)
      },
    ),
  )
  postReadyErrorProbe.emit('transport_event', {
    type: 'ready',
    realtimeSessionId: postReadyErrorHandle.realtimeSessionId,
  })
  const postReadyTransportError = {
    type: 'error',
    realtimeSessionId: postReadyErrorHandle.realtimeSessionId,
    content: 'opaque-response-content',
    error: 'opaque-provider-error',
  }
  postReadyErrorProbe.emit('transport_event', postReadyTransportError)
  postReadyErrorProbe.emit('error', postReadyTransportError)
  postReadyErrorProbe.emit('transport_event', postReadyTransportError)

  expect(postReadyErrorFailures).toEqual([
    {
      kind: 'ice',
      realtimeSessionId: postReadyErrorHandle.realtimeSessionId,
      reason: 'cause=transport_error',
    },
  ])
  expect(postReadyErrorMetadata.map(({ event }) => event)).toEqual([
    'realtime_session_created',
    'realtime_ready',
    'realtime_connect_failed',
  ])

  const disconnectedProbe = makeAdapterFailureProbe()
  const disconnectedFailures: RealtimeFailureInput[] = []
  const disconnectedMetadata: RealtimeMetadataEvent[] = []
  const disconnectedHandle = createRealtimeSession(
    makeAdapterFailureInput(
      disconnectedProbe,
      'session-post-ready-disconnected',
      (event) => disconnectedMetadata.push(event),
      (failure) => {
        disconnectedFailures.push(failure)
      },
    ),
  )
  disconnectedProbe.emit('transport_event', {
    type: 'ready',
    realtimeSessionId: disconnectedHandle.realtimeSessionId,
  })
  const disconnectedChange = {
    type: 'connection_change',
    status: 'disconnected',
    realtimeSessionId: disconnectedHandle.realtimeSessionId,
    content: 'opaque-response-content',
    error: 'opaque-provider-error',
  }
  disconnectedProbe.emit('transport_event', disconnectedChange)
  disconnectedProbe.emit('transport_event', disconnectedChange)

  expect(disconnectedFailures).toEqual([
    {
      kind: 'active_disconnect',
      realtimeSessionId: disconnectedHandle.realtimeSessionId,
      reason: 'cause=transport_disconnected',
    },
  ])
  expect(disconnectedMetadata.map(({ event }) => event)).toEqual([
    'realtime_session_created',
    'realtime_ready',
    'realtime_disconnect',
  ])

  const staleProbe = makeAdapterFailureProbe()
  const staleFailures: RealtimeFailureInput[] = []
  const staleMetadata: RealtimeMetadataEvent[] = []
  const staleHandle = createRealtimeSession(
    makeAdapterFailureInput(
      staleProbe,
      'session-current',
      (event) => staleMetadata.push(event),
      (failure) => {
        staleFailures.push(failure)
      },
    ),
  )
  staleProbe.emit('transport_event', {
    type: 'error',
    realtimeSessionId: 'session-old',
    content: 'opaque-response-content',
    error: 'opaque-provider-error',
  })
  staleProbe.emit('transport_event', {
    type: 'connection_change',
    status: 'disconnected',
    realtimeSessionId: 'session-old',
    content: 'opaque-response-content',
    error: 'opaque-provider-error',
  })

  expect(staleFailures).toEqual([])
  expect(staleMetadata.map(({ event }) => event)).toEqual([
    'realtime_session_created',
    'realtime_stale_event',
    'realtime_stale_event',
  ])
  expect(staleHandle.realtimeSessionId).toBe('session-current')

  for (const failure of [
    ...preReadyFailures,
    ...postReadyErrorFailures,
    ...disconnectedFailures,
  ]) {
    expect(Object.keys(failure).sort()).toEqual(expectedFailureKeys)
    const serialized = JSON.stringify(failure)
    expect(serialized).not.toContain('opaque-response-content')
    expect(serialized).not.toContain('opaque-provider-error')
  }
})

it('defers SDK close until Main recovery enforces stop-output, close-session, release-mic', async () => {
  const probe = makeAdapterFailureProbe()
  const calls: string[] = []
  const recoveryMetadata: Array<Record<string, unknown>> = []
  let lifecycleState: LifecycleState = 'active'
  let handle: RealtimeSessionHandle | undefined
  let recoveryPromise: Promise<Record<string, unknown>> | undefined

  const controller = createRealtimeOutageRecoveryController({
    lifecycle: {
      get: () => lifecycleState,
      transition: (nextState: string) => {
        lifecycleState = nextState as LifecycleState
        calls.push(`transition:${nextState}`)
      },
    },
    getRealtimeSessionId: () => handle?.realtimeSessionId,
    stopOutput: async () => {
      calls.push('stopOutput')
    },
    closeSession: async (sessionId: string) => {
      calls.push(`closeSession:${sessionId}`)
      if (handle === undefined) {
        throw new Error('handle_uninitialized')
      }
      await handle.close('cause=transport_error')
    },
    releaseMic: async () => {
      calls.push('releaseMic')
    },
    clearRamSession: async () => {
      calls.push('clearRamSession')
    },
    metadataSink: (event: Record<string, unknown>) => {
      recoveryMetadata.push(event)
    },
  })

  handle = createRealtimeSession(
    makeAdapterFailureInput(
      probe,
      'session-ordering',
      () => undefined,
      (failure) => {
        calls.push('failureCallback')
        recoveryPromise = controller.handleRealtimeFailure(failure)
      },
    ),
  )

  probe.emit('transport_event', {
    type: 'error',
    realtimeSessionId: handle.realtimeSessionId,
    content: 'opaque-response-content',
    error: 'opaque-provider-error',
  })

  expect(probe.sdkCloseCalls).toEqual([])
  expect(recoveryPromise).toBeDefined()
  await recoveryPromise

  expect(calls).toEqual([
    'failureCallback',
    'stopOutput',
    'closeSession:session-ordering',
    'releaseMic',
    'clearRamSession',
    'transition:offlineLoop',
  ])
  expect(probe.sdkCloseCalls).toEqual(['sdk_close'])
  expect(lifecycleState).toBe('offlineLoop')
  expect(recoveryMetadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'realtime_failure_entered',
        reason: 'cause=transport_error',
        session_id: 'session-ordering',
      }),
      expect.objectContaining({
        event: 'offline_loop_started',
        reason: 'cause=transport_error',
      }),
    ]),
  )
})
