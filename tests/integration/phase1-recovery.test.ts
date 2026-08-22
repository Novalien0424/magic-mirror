import { expect, it } from 'vitest'

import { bootSequence, type BootRuntime as BaseBootRuntime } from '../../src/main/boot'
import type {
  RegisterIpcHandlersOptions,
  RealtimeRuntimeCommandDispatchResult,
} from '../../src/main/ipc'
import { createLifecycleActor } from '../../src/main/lifecycle'
import type {
  RealtimeRuntimeCommand,
  RealtimeRuntimeOutcomeReport,
} from '../../src/shared/bridge'
import {
  createRealtimeOutageRecoveryController,
  type RealtimeOutageRecoveryController,
} from '../../src/main/realtime/outage-recovery'
import type { RealtimeFailureInput } from '../../src/shared/realtime-recovery'

type LifecycleState = ReturnType<ReturnType<typeof createLifecycleActor>['getState']>

type BootRuntime = BaseBootRuntime & {
  handleRealtimeFailure(input: RealtimeFailureInput): Promise<Record<string, unknown>>
  handleRealtimeRuntimeOutcome(report: RealtimeRuntimeOutcomeReport): unknown
  scheduleRecoveryProbes(): void
  manualStart(): Promise<Record<string, unknown>>
  manualStop(): Promise<Record<string, unknown>>
  rolloverAtSafeBoundary(): Promise<Record<string, unknown>>
}

type BootRecoveryMethodNames = keyof Pick<
  BootRuntime,
  | 'handleRealtimeFailure'
  | 'scheduleRecoveryProbes'
  | 'manualStart'
  | 'manualStop'
  | 'rolloverAtSafeBoundary'
>

type RendererRuntimeRecoveryMethodNames = Extract<
  BootRecoveryMethodNames,
  keyof RegisterIpcHandlersOptions['runtime']
>
type NonConsoleRendererRuntimeRecoveryMethodNames = Exclude<
  RendererRuntimeRecoveryMethodNames,
  'manualStart' | 'manualStop'
>

type Snapshot = Readonly<{
  configRevision: number
  configFingerprint: string
  modelRoleIds: Readonly<Record<string, string>>
}>

type TestSession = Readonly<{
  realtimeSessionId: string
  snapshot: Snapshot
  reconnect?: () => Promise<void>
  connect?: (options: { apiKey: unknown }) => Promise<void>
}>

type ManualRecoveryController = Readonly<{
  manualStart: () => Promise<unknown>
  manualStop: () => Promise<unknown>
}>

function expectMetadataOnly(record: Record<string, unknown>): void {
  const forbiddenKeys = [
    'secret',
    'clientSecret',
    'client_secret',
    'apiKey',
    'api_key',
    'credential',
    'mediaStream',
    'media_stream',
    'rawConfig',
    'raw_config',
    'config',
    'configSnapshot',
    'config_snapshot',
    'session',
    'snapshot',
    'transcript',
    'audio',
    'audioChunk',
    'audio_chunk',
    'speech',
    'error',
  ]

  for (const forbiddenKey of forbiddenKeys) {
    expect(record).not.toHaveProperty(forbiddenKey)
  }
}

function sessionIdOf(record: Record<string, unknown>): unknown {
  return record.session_id ?? record.realtimeSessionId
}

async function drainMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

type RuntimeCommandBootOptions = Parameters<typeof bootSequence>[0] & {
  readonly dispatchRealtimeRuntimeCommand: (
    command: RealtimeRuntimeCommand,
  ) => RealtimeRuntimeCommandDispatchResult
}

function bootWithRuntimeCommandSeam(options: RuntimeCommandBootOptions): BootRuntime {
  return bootSequence(options as never) as BootRuntime
}

type BootFixture = Readonly<{
  runtime: BootRuntime
  commands: RealtimeRuntimeCommand[]
  metadata: Array<Record<string, unknown>>
}>

function createBootFixture(
  dispatchResult: RealtimeRuntimeCommandDispatchResult = {
    status: 'success',
    reason: 'runtime_command_delivered',
  },
  realtimeSessionId = 'synthetic-pending-session',
): BootFixture {
  const metadata: Array<Record<string, unknown>> = []
  const commands: RealtimeRuntimeCommand[] = []
  const config = {
    configVersion: 7,
    persona: { name: 'synthetic-persona', instructions: 'synthetic-instructions' },
    voice: 'synthetic-voice',
    idleSeconds: 300,
    aiModels: {
      realtimeDialogue: { modelId: 'synthetic-configured-model-id' },
      inputTranscription: { modelId: 'synthetic-configured-model-id' },
      memoryExtractor: { modelId: 'synthetic-configured-model-id' },
    },
    wake: { phrase: 'synthetic-wake-phrase', modelVersion: 'synthetic-wake-model' },
    faceModel: {
      detectorId: 'synthetic-face-detector',
      recognizerId: 'synthetic-face-recognizer',
    },
    assets: {
      offlineLoopVideo: 'synthetic/offline-loop.mp4',
      avatarDir: 'synthetic/avatar',
      musicDir: 'synthetic/music',
    },
    spells: [],
    scenes: [],
    adapters: { lighting: 'mock', fog: 'mock', music: 'mock' },
  }
  const modelSettings = {
    slot: 'active',
    configVersion: 7,
    fingerprint: 'synthetic-config-fingerprint',
    realtimeDialogue: 'synthetic-configured-model-id',
    inputTranscription: 'synthetic-configured-model-id',
    memoryExtractor: 'synthetic-configured-model-id',
    voice: 'synthetic-voice',
  }
  const brokerResponse = Object.freeze({
    value: 'ek_synthetic-client-secret',
    expiresAt: 1_900_000_000_000,
  })
  const issueClientSecret = async () => brokerResponse
  const clientSecretBroker = Object.assign(issueClientSecret, {
    create: issueClientSecret,
    createClientSecret: issueClientSecret,
    issue: issueClientSecret,
    mint: issueClientSecret,
    mintClientSecret: issueClientSecret,
    request: issueClientSecret,
    requestClientSecret: issueClientSecret,
  })
  const telemetry = {
    emit: (event: unknown) => {
      metadata.push({ ...(event as Record<string, unknown>) })
    },
    readPage: () => ({ events: [], nextBeforeSequence: null }),
    getStats: () => ({
      telemetryDroppedCount: 0,
      ramEvictedCount: 0,
      rejectedEventCount: 0,
      extraFieldStrippedCount: 0,
      writerFailureCount: 0,
      rotationFailureCount: 0,
      schedulerFailureCount: 0,
      ramEventCount: metadata.length,
      queueDepth: 0,
      closed: false,
    }),
    flush: async () => {},
    close: async () => {},
  }

  const runtime = bootWithRuntimeCommandSeam({
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    createTelemetry: () => telemetry,
    configService: {
      initialize: async () => ({ active: config, draft: config, previous: config }),
    },
    clientSecretBroker: clientSecretBroker as never,
    resolveModelSettings: () => ({
      active: modelSettings,
      draft: { ...modelSettings, slot: 'draft' },
      previous: { ...modelSettings, slot: 'previous' },
    }),
    openSqlite: () => ({
      ok: true,
      value: {
        health: () => ({
          status: 'ready',
          schemaVersion: 1,
          journalMode: 'wal',
          foreignKeys: true,
          integrity: 'ok',
          failure: null,
        }),
        close: () => ({ ok: true, value: undefined }),
      },
    }),
    createMockModuleFactory: () => ({
      create: () => ({ initialStatus: 'not_implemented', outcome: 'success' }),
    }),
    createModuleRegistry: () => ({
      snapshot: () => ({}),
      probe: async () => ({ status: 'ready' }),
    }),
    createActivationId: () => 'synthetic-manual-activation',
    createRealtimeSessionId: () => realtimeSessionId,
    dispatchRealtimeRuntimeCommand: (command: RealtimeRuntimeCommand) => {
      commands.push(command)
      return dispatchResult
    },
    now: () => '2026-08-21T00:00:00.000Z',
  } as unknown as RuntimeCommandBootOptions)

  return { runtime, commands, metadata }
}

async function deliverRuntimeOutcome(
  runtime: BootRuntime,
  report: RealtimeRuntimeOutcomeReport,
): Promise<void> {
  await Promise.resolve(runtime.handleRealtimeRuntimeOutcome(report))
}

it('routes manual realtime start and stop through Main lifecycle ownership', async () => {
  const oldRealtimeSessionId = 'realtime-session-old'
  const newRealtimeSessionId = 'realtime-session-new'
  const callerOwnedMediaStream = Object.freeze({ kind: 'caller-owned-stream' })
  const currentSnapshot: Snapshot = Object.freeze({
    configRevision: 18,
    configFingerprint: 'fingerprint-current',
    modelRoleIds: Object.freeze({
      realtime: 'role-current-realtime',
      transcription: 'role-current-transcription',
    }),
  })
  const mintedClientSecret = Symbol('test-client-secret')
  const oldSnapshot: Snapshot = Object.freeze({
    configRevision: 17,
    configFingerprint: 'fingerprint-old',
    modelRoleIds: Object.freeze({
      realtime: 'role-old-realtime',
      transcription: 'role-old-transcription',
    }),
  })

  const order: string[] = []
  const metadata: Array<Record<string, unknown>> = []
  const lifecycleEvents: Array<Record<string, unknown>> = []
  const requestedTransitions: LifecycleState[] = []
  let microphoneAcquired = false
  let freshRealtimeReady = false
  let oldReconnectCount = 0
  let createSessionCount = 0
  const authoritativeSession: { current: TestSession | null } = { current: null }
  let currentSession: TestSession | null = {
    realtimeSessionId: oldRealtimeSessionId,
    snapshot: oldSnapshot,
    reconnect: async () => {
      oldReconnectCount += 1
      order.push('reconnect old session')
    },
  }
  let releaseFreshRealtimeReady!: () => void
  const freshRealtimeReadyPromise = new Promise<void>((resolve) => {
    releaseFreshRealtimeReady = resolve
  })

  const lifecycleActor = createLifecycleActor({
    telemetry: {
      emit: (event) => lifecycleEvents.push(event),
    },
  })
  lifecycleActor.send({ type: 'LOCAL_READY' })
  expect(lifecycleActor.getState()).toBe('dormant')

  const transition = (nextState: LifecycleState): void => {
    requestedTransitions.push(nextState)
    order.push(`transition:${nextState}`)

    if (nextState === 'activating') {
      lifecycleActor.send({
        type: 'WAKE_DETECTED',
        activationId: 'activation-manual',
        lastInteractionAt: '2026-08-21T00:00:00.000Z',
      })
      return
    }

    if (nextState === 'active') {
      expect(microphoneAcquired).toBe(true)
      expect(freshRealtimeReady).toBe(true)
      expect(authoritativeSession.current?.realtimeSessionId).toBe(newRealtimeSessionId)
      lifecycleActor.send({
        type: 'REALTIME_READY',
        realtimeSessionId: newRealtimeSessionId,
      })
      return
    }

    if (nextState === 'suspending') {
      lifecycleActor.send({ type: 'SLEEP_REQUESTED' })
      return
    }

    if (nextState === 'dormant') {
      lifecycleActor.send({ type: 'MEDIA_CLOSED' })
      return
    }

    if (nextState === 'offlineLoop') {
      lifecycleActor.send({ type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' })
      return
    }

    throw new Error(`unexpected integration transition: ${nextState}`)
  }

  const freshSession: TestSession = {
    realtimeSessionId: newRealtimeSessionId,
    snapshot: currentSnapshot,
    connect: async ({ apiKey }) => {
      expect(apiKey).toBe(mintedClientSecret)
      order.push('connect fresh session')
      await freshRealtimeReadyPromise
      freshRealtimeReady = true
      order.push('fresh realtime ready')
    },
  }

  const controller = createRealtimeOutageRecoveryController({
    lifecycle: {
      get: () => lifecycleActor.getState(),
      transition,
    },
    getRealtimeSessionId: () => authoritativeSession.current?.realtimeSessionId ?? null,
    getCurrentSession: () => currentSession,
    acquireMic: async () => {
      order.push('acquire microphone')
      microphoneAcquired = true
      return callerOwnedMediaStream
    },
    stopOutput: async () => {
      order.push('stop output')
    },
    closeSession: async (sessionId: string) => {
      expect(sessionId).toBe(newRealtimeSessionId)
      order.push('close current session')
      currentSession = null
    },
    releaseMic: async () => {
      order.push('release microphone')
    },
    clearRamSession: () => {
      order.push('clear RAM session')
      authoritativeSession.current = null
    },
    getPublishedSnapshot: () => currentSnapshot,
    mintClientSecret: async (snapshot: Snapshot) => {
      expect(snapshot).toBe(currentSnapshot)
      order.push('mint fresh client secret')
      return mintedClientSecret
    },
    createRealtimeSession: ({
      snapshot,
      mediaStream,
    }: {
      snapshot: Snapshot
      mediaStream: typeof callerOwnedMediaStream
    }) => {
      expect(snapshot).toBe(currentSnapshot)
      expect(mediaStream).toBe(callerOwnedMediaStream)
      createSessionCount += 1
      order.push('create fresh session')
      return freshSession
    },
    getCallerOwnedMediaStream: () => callerOwnedMediaStream,
    setAuthoritativeSession: (session: TestSession) => {
      expect(session).toBe(freshSession)
      authoritativeSession.current = session
      currentSession = session
      order.push('publish new authoritative session')
    },
    lightweightProbe: async () => false,
    schedule: () => 1,
    cancel: () => {},
    now: () => 1_000,
    metadataSink: (event: Record<string, unknown>) => {
      metadata.push(event)
    },
  } as never) as unknown as ManualRecoveryController

  const startPromise = controller.manualStart()
  await drainMicrotasks()

  expect(lifecycleActor.getState()).toBe('activating')
  expect(lifecycleActor.getContext().realtimeSessionId).toBeNull()
  expect(authoritativeSession.current).toBeNull()
  expect(oldReconnectCount).toBe(0)

  releaseFreshRealtimeReady()
  await startPromise

  expect(lifecycleActor.getState()).toBe('active')
  expect(lifecycleActor.getContext().realtimeSessionId).toBe(newRealtimeSessionId)
  expect(authoritativeSession.current?.realtimeSessionId).toBe(newRealtimeSessionId)
  expect(createSessionCount).toBe(1)
  expect(oldReconnectCount).toBe(0)
  expect(order.indexOf('transition:activating')).toBeLessThan(order.indexOf('acquire microphone'))
  expect(order.indexOf('acquire microphone')).toBeLessThan(order.indexOf('connect fresh session'))
  expect(order.indexOf('fresh realtime ready')).toBeLessThan(order.indexOf('transition:active'))

  const startEvents = metadata.filter((event) => event.event === 'manual_realtime_start')
  expect(startEvents).toHaveLength(1)
  expect(startEvents[0]).toEqual(expect.objectContaining({
    event: 'manual_realtime_start',
    status: 'success',
    reason: expect.any(String),
  }))
  expect(sessionIdOf(startEvents[0]!)).toBe(newRealtimeSessionId)

  const stopOrderStart = order.length
  await controller.manualStop()

  expect(order.slice(stopOrderStart)).toEqual([
    'transition:suspending',
    'stop output',
    'close current session',
    'release microphone',
    'clear RAM session',
    'transition:dormant',
  ])
  expect(requestedTransitions).toEqual([
    'activating',
    'active',
    'suspending',
    'dormant',
  ])
  expect(lifecycleActor.getState()).toBe('dormant')
  expect(lifecycleActor.getContext().realtimeSessionId).toBeNull()
  expect(metadata.some((event) => event.event === 'offline_loop_started')).toBe(false)
  expect(requestedTransitions).not.toContain('offlineLoop')

  const stopEvents = metadata.filter((event) => event.event === 'manual_realtime_stop')
  expect(stopEvents).toHaveLength(1)
  expect(stopEvents[0]).toEqual(expect.objectContaining({
    event: 'manual_realtime_stop',
    status: 'success',
    reason: expect.any(String),
  }))
  expect(sessionIdOf(stopEvents[0]!)).toBe(newRealtimeSessionId)

  for (const event of metadata) {
    expectMetadataOnly(event)
  }
  expect(lifecycleEvents.some((event) => event.event === 'offline_loop_started')).toBe(false)
})

it('cleans up a current active session into OfflineLoop and ignores stale failures', async () => {
  const oldRealtimeSessionId = 'realtime-session-old'
  const newRealtimeSessionId = 'realtime-session-new'
  const snapshot: Snapshot = Object.freeze({
    configRevision: 19,
    configFingerprint: 'fingerprint-current',
    modelRoleIds: Object.freeze({
      realtime: 'role-current-realtime',
      transcription: 'role-current-transcription',
    }),
  })
  const order: string[] = []
  const metadata: Array<Record<string, unknown>> = []
  const lifecycleEvents: Array<Record<string, unknown>> = []
  let nowMs = 1_000
  let ramSessionPresent = true
  let currentSession: TestSession | null = {
    realtimeSessionId: oldRealtimeSessionId,
    snapshot,
  }

  const lifecycleActor = createLifecycleActor({
    telemetry: {
      emit: (event) => lifecycleEvents.push(event),
    },
  })
  lifecycleActor.send({ type: 'LOCAL_READY' })
  lifecycleActor.send({
    type: 'WAKE_DETECTED',
    activationId: 'activation-outage',
    lastInteractionAt: '2026-08-21T00:00:00.000Z',
  })
  lifecycleActor.send({
    type: 'REALTIME_READY',
    realtimeSessionId: oldRealtimeSessionId,
  })
  expect(lifecycleActor.getState()).toBe('active')

  const controller = createRealtimeOutageRecoveryController({
    lifecycle: {
      get: () => lifecycleActor.getState(),
      transition: (nextState: LifecycleState) => {
        order.push(`transition:${nextState}`)
        expect(nextState).toBe('offlineLoop')
        lifecycleActor.send({ type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' })
      },
    },
    getRealtimeSessionId: () => lifecycleActor.getContext().realtimeSessionId,
    getCurrentSession: () => currentSession,
    stopOutput: async () => {
      order.push('stop output')
      nowMs += 1_000
    },
    closeSession: async (sessionId: string) => {
      expect(sessionId).toBe(oldRealtimeSessionId)
      order.push('close current session')
      currentSession = null
      nowMs += 1_000
    },
    releaseMic: async () => {
      order.push('release microphone')
      nowMs += 1_000
    },
    clearRamSession: () => {
      order.push('clear RAM session')
      ramSessionPresent = false
      nowMs += 1_000
    },
    lightweightProbe: async () => false,
    schedule: () => 1,
    cancel: () => {},
    now: () => nowMs,
    metadataSink: (event: Record<string, unknown>) => {
      metadata.push(event)
    },
  } as never)

  const failureStartedAt = nowMs
  await controller.handleRealtimeFailure({
    kind: 'active_disconnect',
    realtimeSessionId: oldRealtimeSessionId,
    reason: 'active_disconnect',
  })

  expect(order).toEqual([
    'stop output',
    'close current session',
    'release microphone',
    'clear RAM session',
    'transition:offlineLoop',
  ])
  expect(ramSessionPresent).toBe(false)
  expect(currentSession).toBeNull()
  expect(nowMs - failureStartedAt).toBeLessThanOrEqual(5_000)
  expect(lifecycleActor.getState()).toBe('offlineLoop')
  expect(lifecycleActor.getContext().realtimeSessionId).toBeNull()
  expect(metadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event: 'realtime_failure_entered',
        session_id: oldRealtimeSessionId,
      }),
      expect.objectContaining({
        event: 'offline_loop_started',
        reason: 'active_disconnect',
      }),
    ]),
  )

  lifecycleActor.send({ type: 'RECOVERY_PASSED' })
  lifecycleActor.send({
    type: 'WAKE_DETECTED',
    activationId: 'activation-new-session',
    lastInteractionAt: '2026-08-21T00:01:00.000Z',
  })
  currentSession = {
    realtimeSessionId: newRealtimeSessionId,
    snapshot,
  }
  lifecycleActor.send({
    type: 'REALTIME_READY',
    realtimeSessionId: newRealtimeSessionId,
  })
  expect(lifecycleActor.getState()).toBe('active')
  expect(lifecycleActor.getContext().realtimeSessionId).toBe(newRealtimeSessionId)

  const staleOrderStart = order.length
  const staleMetadataStart = metadata.length
  await controller.handleRealtimeFailure({
    kind: 'ice',
    realtimeSessionId: oldRealtimeSessionId,
    reason: 'late_old_session_failure',
  })

  expect(order.slice(staleOrderStart)).toEqual([])
  expect(metadata).toHaveLength(staleMetadataStart + 1)
  const staleEvent = metadata[metadata.length - 1]!
  expect(staleEvent).toEqual(expect.objectContaining({
    reason: 'stale_realtime_session',
  }))
  expect(sessionIdOf(staleEvent)).toBe(oldRealtimeSessionId)
  expect(lifecycleActor.getState()).toBe('active')
  expect(lifecycleActor.getContext().realtimeSessionId).toBe(newRealtimeSessionId)

  for (const event of metadata) {
    expectMetadataOnly(event)
  }
  for (const event of lifecycleEvents) {
    expectMetadataOnly(event)
  }
})

it('enters Maintenance for local audio failures and atomically records a Main-owned session replacement', () => {
  const createActiveActor = (realtimeSessionId: string) => {
    const lifecycleEvents: Array<Record<string, unknown>> = []
    const actor = createLifecycleActor({
      telemetry: {
        emit: (event) => lifecycleEvents.push(event),
      },
    })
    actor.send({ type: 'LOCAL_READY' })
    actor.send({
      type: 'WAKE_DETECTED',
      activationId: `activation-${realtimeSessionId}`,
      lastInteractionAt: '2026-08-21T00:02:00.000Z',
    })
    actor.send({ type: 'REALTIME_READY', realtimeSessionId })
    expect(actor.getState()).toBe('active')
    return { actor, lifecycleEvents }
  }

  const activeFailure = createActiveActor('realtime-session-active-audio')
  activeFailure.actor.send({
    type: 'LOCAL_AUDIO_FAILED',
    errorCode: 'microphone_unavailable',
  })

  expect(activeFailure.actor.getState()).toBe('maintenance')
  expect(activeFailure.actor.getContext().realtimeSessionId).toBeNull()
  expect(activeFailure.lifecycleEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({
      event: 'lifecycle_transition',
      status: 'failed',
      error_code: 'microphone_unavailable',
      source: 'runtime',
      reason: expect.stringContaining('event=LOCAL_AUDIO_FAILED'),
    }),
  ]))

  const suspendingFailure = createActiveActor('realtime-session-suspending-audio')
  suspendingFailure.actor.send({ type: 'SLEEP_REQUESTED' })
  expect(suspendingFailure.actor.getState()).toBe('suspending')
  suspendingFailure.actor.send({
    type: 'LOCAL_AUDIO_FAILED',
    errorCode: 'microphone_released_unexpectedly',
  })

  expect(suspendingFailure.actor.getState()).toBe('maintenance')
  expect(suspendingFailure.actor.getContext().realtimeSessionId).toBeNull()
  expect(suspendingFailure.lifecycleEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({
      event: 'lifecycle_transition',
      status: 'failed',
      error_code: 'microphone_released_unexpectedly',
      source: 'runtime',
      reason: expect.stringContaining('event=LOCAL_AUDIO_FAILED'),
    }),
  ]))

  const replacement = createActiveActor('realtime-session-before-rollover')
  const replacementSessionId = 'realtime-session-after-rollover'
  const replacementGeneration = 12
  replacement.actor.send({
    type: 'REALTIME_SESSION_REPLACED',
    realtimeSessionId: replacementSessionId,
    sessionGeneration: replacementGeneration,
  } as never)

  expect(replacement.actor.getState()).toBe('active')
  expect(replacement.actor.getContext()).toEqual(expect.objectContaining({
    realtimeSessionId: replacementSessionId,
    sessionGeneration: replacementGeneration,
  }))
  expect(replacement.lifecycleEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({
      event: 'lifecycle_transition',
      status: 'success',
      source: 'runtime',
      reason: expect.stringContaining('event=REALTIME_SESSION_REPLACED'),
    }),
  ]))

  for (const event of [
    ...activeFailure.lifecycleEvents,
    ...suspendingFailure.lifecycleEvents,
    ...replacement.lifecycleEvents,
  ]) {
    expectMetadataOnly(event)
  }
})

it('composes the recovery controller from the authoritative boot lifecycle actor', async () => {
  const calls: string[] = []
  const recoveryCalls: string[] = []
  const metadata: Array<Record<string, unknown>> = []
  const telemetry = {
    emit: (event: unknown) => metadata.push({ ...(event as Record<string, unknown>) }),
  }
  const config = {
    configVersion: 7,
    persona: { name: 'synthetic-persona', instructions: 'synthetic-instructions' },
    voice: 'synthetic-voice',
    idleSeconds: 300,
    aiModels: {
      realtimeDialogue: { modelId: 'synthetic-configured-model-id' },
      inputTranscription: { modelId: 'synthetic-configured-model-id' },
      memoryExtractor: { modelId: 'synthetic-configured-model-id' },
    },
    wake: { phrase: 'synthetic-wake-phrase', modelVersion: 'synthetic-wake-model' },
    faceModel: {
      detectorId: 'synthetic-face-detector',
      recognizerId: 'synthetic-face-recognizer',
    },
    assets: {
      offlineLoopVideo: 'synthetic/offline-loop.mp4',
      avatarDir: 'synthetic/avatar',
      musicDir: 'synthetic/music',
    },
    spells: [],
    scenes: [],
    adapters: { lighting: 'mock', fog: 'mock', music: 'mock' },
  }
  const modelSettings = {
    slot: 'active',
    configVersion: 7,
    fingerprint: 'synthetic-config-fingerprint',
    realtimeDialogue: 'synthetic-configured-model-id',
    inputTranscription: 'synthetic-configured-model-id',
    memoryExtractor: 'synthetic-configured-model-id',
    voice: 'synthetic-voice',
  }
  const authoritativeActor = createLifecycleActor({ telemetry })
  let receivedActor: typeof authoritativeActor | null = null
  let recoveryFactoryCount = 0
  let forwardedFailureInput: RealtimeFailureInput | undefined

  const recoveryResults = {
    handleRealtimeFailure: Object.freeze({
      event: 'realtime_failure_entered',
      status: 'degraded',
      reason: 'synthetic_handle_failure_result',
      source: 'runtime',
    }),
    manualStart: Object.freeze({
      event: 'manual_realtime_start',
      status: 'success',
      reason: 'synthetic_manual_start_result',
      source: 'runtime',
    }),
    manualStop: Object.freeze({
      event: 'manual_realtime_stop',
      status: 'success',
      reason: 'synthetic_manual_stop_result',
      source: 'runtime',
    }),
    rolloverAtSafeBoundary: Object.freeze({
      event: 'realtime_rollover',
      status: 'success',
      reason: 'synthetic_rollover_result',
      source: 'runtime',
    }),
  }

  const fakeRecoveryController: RealtimeOutageRecoveryController = {
    handleRealtimeFailure: async (input) => {
      recoveryCalls.push('handleRealtimeFailure')
      forwardedFailureInput = input
      return recoveryResults.handleRealtimeFailure
    },
    scheduleRecoveryProbes: () => {
      recoveryCalls.push('scheduleRecoveryProbes')
    },
    manualStart: async () => {
      recoveryCalls.push('manualStart')
      return recoveryResults.manualStart
    },
    manualStop: async () => {
      recoveryCalls.push('manualStop')
      return recoveryResults.manualStop
    },
    rolloverAtSafeBoundary: async () => {
      recoveryCalls.push('rolloverAtSafeBoundary')
      return recoveryResults.rolloverAtSafeBoundary
    },
  }

  const options = {
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    createTelemetry: () => {
      calls.push('createTelemetry')
      return telemetry
    },
    configService: {
      initialize: async () => {
        calls.push('configService.initialize')
        return { active: config, draft: config, previous: config }
      },
    },
    resolveModelSettings: () => {
      calls.push('resolveModelSettings')
      return {
        active: modelSettings,
        draft: { ...modelSettings, slot: 'draft' },
        previous: { ...modelSettings, slot: 'previous' },
      }
    },
    openSqlite: () => {
      calls.push('openSqlite')
      return {
        ok: true,
        value: {
          health: () => ({
            status: 'ready',
            schemaVersion: 1,
            journalMode: 'wal',
            foreignKeys: true,
            integrity: 'ok',
            failure: null,
          }),
          close: () => ({ ok: true, value: undefined }),
        },
      }
    },
    createMockModuleFactory: () => {
      calls.push('createMockModuleFactory')
      return { create: () => ({ initialStatus: 'not_implemented', outcome: 'success' }) }
    },
    createModuleRegistry: () => {
      calls.push('createModuleRegistry')
      return {
        snapshot: () => ({}),
        probe: async () => ({ status: 'ready' }),
      }
    },
    createLifecycleActor: () => {
      calls.push('createLifecycleActor')
      return authoritativeActor
    },
    createRealtimeRecoveryController: (dependencies: {
      lifecycleActor: typeof authoritativeActor
      metadataSink: (event: Record<string, unknown>) => void
    }) => {
      calls.push('createRealtimeRecoveryController')
      recoveryFactoryCount += 1
      receivedActor = dependencies.lifecycleActor
      dependencies.metadataSink({
        module: 'app',
        event: 'recovery_controller_wiring',
        status: 'info',
        reason: 'factory_wiring_probe',
        source: 'runtime',
      })
      return fakeRecoveryController
    },
    now: () => '2026-08-21T00:00:00.000Z',
  }

  const runtime: BootRuntime = bootSequence(options as never) as BootRuntime
  await runtime.ready

  const failureInput: RealtimeFailureInput = Object.freeze({
    kind: 'active_disconnect',
    realtimeSessionId: 'synthetic-realtime-session',
    reason: 'synthetic-realtime-failure',
  })
  const handleFailureResult = await runtime.handleRealtimeFailure(failureInput)
  runtime.scheduleRecoveryProbes()
  const manualStartResult = await runtime.manualStart()
  const manualStopResult = await runtime.manualStop()
  const rolloverResult = await runtime.rolloverAtSafeBoundary()

  expect(forwardedFailureInput).toBe(failureInput)
  expect(recoveryCalls).toEqual([
    'handleRealtimeFailure',
    'scheduleRecoveryProbes',
    'manualStart',
    'manualStop',
    'rolloverAtSafeBoundary',
  ])
  for (const methodName of [
    'handleRealtimeFailure',
    'scheduleRecoveryProbes',
    'manualStart',
    'manualStop',
    'rolloverAtSafeBoundary',
  ]) {
    expect(recoveryCalls.filter((call) => call === methodName)).toHaveLength(1)
  }
  expect(handleFailureResult).toBe(recoveryResults.handleRealtimeFailure)
  expect(manualStartResult).toBe(recoveryResults.manualStart)
  expect(manualStopResult).toBe(recoveryResults.manualStop)
  expect(rolloverResult).toBe(recoveryResults.rolloverAtSafeBoundary)
  for (const result of Object.values(recoveryResults)) {
    expectMetadataOnly(result)
  }
  const rendererRuntimeExposesNoRecoveryMethods:
    NonConsoleRendererRuntimeRecoveryMethodNames extends never ? true : false = true
  expect(rendererRuntimeExposesNoRecoveryMethods).toBe(true)

  expect(recoveryFactoryCount).toBe(1)
  expect(receivedActor).toBe(authoritativeActor)
  expect(calls).toEqual([
    'createTelemetry',
    'configService.initialize',
    'resolveModelSettings',
    'openSqlite',
    'createMockModuleFactory',
    'createModuleRegistry',
    'createLifecycleActor',
    'createRealtimeRecoveryController',
  ])
  expect(metadata).toContainEqual({
    module: 'app',
    event: 'recovery_controller_wiring',
    status: 'info',
    reason: 'factory_wiring_probe',
    source: 'runtime',
  })
  for (const event of metadata) {
    expectMetadataOnly(event)
  }
  expect(runtime.handleSimulator).toEqual(expect.any(Function))
})

it('starts a production boot runtime with one pending session and commits it on renderer success', async () => {
  const fixture = createBootFixture()
  const { runtime, commands, metadata } = fixture

  await runtime.ready
  expect(runtime.snapshot().lifecycle).toBe('dormant')

  const startResult = await runtime.manualStart()
  expect(runtime.snapshot().lifecycle).toBe('activating')
  expect(commands).toEqual([{ operation: 'start', reason: 'manual_start' }])
  expect(startResult).toEqual(expect.objectContaining({
    status: 'success',
    reason: 'runtime_command_delivered',
  }))
  expectMetadataOnly(startResult)
  expect(startResult).not.toHaveProperty('reason', 'recovery_controller_unavailable')

  const pendingBundle = await runtime.requestRealtimeClientSecret()
  expect(pendingBundle.identity).toEqual({
    realtimeSessionId: 'synthetic-pending-session',
    sessionGeneration: expect.any(Number),
  })
  expect(pendingBundle.identity.sessionGeneration).toBeGreaterThan(0)
  expect(pendingBundle).toHaveProperty('clientSecret')

  const duplicateStartResult = await runtime.manualStart()
  expect(commands).toHaveLength(1)
  expect(duplicateStartResult).toEqual(expect.objectContaining({
    status: 'ignored',
    reason: 'start_in_progress',
  }))
  expectMetadataOnly(duplicateStartResult)
  const duplicateBundle = await runtime.requestRealtimeClientSecret()
  expect(duplicateBundle.identity).toEqual(pendingBundle.identity)

  await deliverRuntimeOutcome(runtime, {
    status: 'success',
    operation: 'start',
    reason: 'renderer_started',
  })

  expect(runtime.snapshot()).toEqual(expect.objectContaining({
    lifecycle: 'active',
    realtimeSessionId: pendingBundle.identity.realtimeSessionId,
    sessionGeneration: pendingBundle.identity.sessionGeneration,
  }))
  expect(metadata.some((event) => event.reason === 'recovery_controller_unavailable')).toBe(false)
  for (const event of metadata) expectMetadataOnly(event)
})

it('moves boot-sequence starts to OfflineLoop without leaking data on delivery or renderer failure', async () => {
  const deliveryFailure = createBootFixture({
    status: 'failed',
    reason: 'mirror_window_missing',
  }, 'synthetic-delivery-failure-session')
  await deliveryFailure.runtime.ready

  const deliveryResult = await deliveryFailure.runtime.manualStart()
  expect(deliveryFailure.runtime.snapshot()).toEqual(expect.objectContaining({
    lifecycle: 'offlineLoop',
    realtimeSessionId: null,
  }))
  expect(deliveryFailure.commands).toEqual([{ operation: 'start', reason: 'manual_start' }])
  expect(deliveryResult).toEqual(expect.objectContaining({
    status: 'failed',
    reason: 'mirror_window_missing',
  }))
  expectMetadataOnly(deliveryResult)
  expect([
    deliveryResult.reason,
    ...deliveryFailure.metadata.map((event) => event.reason),
  ]).toContain('mirror_window_missing')
  await expect(deliveryFailure.runtime.requestRealtimeClientSecret()).rejects.toMatchObject({
    code: 'realtime_session_unavailable',
  })
  for (const event of deliveryFailure.metadata) expectMetadataOnly(event)

  const rendererFailure = createBootFixture(undefined, 'synthetic-renderer-failure-session')
  await rendererFailure.runtime.ready
  await rendererFailure.runtime.manualStart()
  await deliverRuntimeOutcome(rendererFailure.runtime, {
    status: 'failed',
    operation: 'start',
    reason: 'renderer_start_failed',
  })

  expect(rendererFailure.runtime.snapshot()).toEqual(expect.objectContaining({
    lifecycle: 'offlineLoop',
    realtimeSessionId: null,
  }))
  await expect(rendererFailure.runtime.requestRealtimeClientSecret()).rejects.toMatchObject({
    code: 'realtime_session_unavailable',
  })
  expect(rendererFailure.metadata.some((event) => event.reason === 'renderer_start_failed')).toBe(true)
  expect(rendererFailure.metadata.some((event) => event.error !== undefined)).toBe(false)
  for (const event of rendererFailure.metadata) expectMetadataOnly(event)
})

it('stops an active boot-sequence session and ignores stop outcomes outside their state', async () => {
  const success = createBootFixture(undefined, 'synthetic-stop-success-session')
  await success.runtime.ready
  await success.runtime.manualStart()
  const activeBundle = await success.runtime.requestRealtimeClientSecret()
  await deliverRuntimeOutcome(success.runtime, {
    status: 'success',
    operation: 'start',
    reason: 'renderer_started',
  })
  expect(success.runtime.snapshot()).toEqual(expect.objectContaining({ lifecycle: 'active' }))

  const stopResult = await success.runtime.manualStop()
  expect(success.runtime.snapshot().lifecycle).toBe('suspending')
  expect(success.commands).toEqual([
    { operation: 'start', reason: 'manual_start' },
    { operation: 'stop', reason: 'manual_stop' },
  ])
  expect(stopResult).toEqual(expect.objectContaining({
    status: 'success',
    reason: 'runtime_command_delivered',
  }))
  expectMetadataOnly(stopResult)

  await deliverRuntimeOutcome(success.runtime, {
    status: 'success',
    operation: 'stop',
    reason: 'renderer_stopped',
  })
  expect(success.runtime.snapshot()).toEqual(expect.objectContaining({
    lifecycle: 'dormant',
    realtimeSessionId: null,
  }))
  await expect(success.runtime.requestRealtimeClientSecret()).rejects.toMatchObject({
    code: 'realtime_session_unavailable',
  })
  expect(activeBundle.identity.realtimeSessionId).toBe('synthetic-stop-success-session')

  const stopFailure = createBootFixture(undefined, 'synthetic-stop-failure-session')
  await stopFailure.runtime.ready
  await stopFailure.runtime.manualStart()
  await deliverRuntimeOutcome(stopFailure.runtime, {
    status: 'success',
    operation: 'start',
    reason: 'renderer_started',
  })
  await stopFailure.runtime.manualStop()
  await deliverRuntimeOutcome(stopFailure.runtime, {
    status: 'failed',
    operation: 'stop',
    reason: 'renderer_stop_failed',
  })
  expect(stopFailure.runtime.snapshot()).toEqual(expect.objectContaining({
    lifecycle: 'maintenance',
    realtimeSessionId: null,
  }))
  expect(stopFailure.metadata.some((event) => event.reason === 'renderer_stop_failed')).toBe(true)
  await expect(stopFailure.runtime.requestRealtimeClientSecret()).rejects.toMatchObject({
    code: 'realtime_session_unavailable',
  })

  const wrongState = createBootFixture(undefined, 'synthetic-wrong-state-session')
  await wrongState.runtime.ready
  await wrongState.runtime.manualStart()
  const beforeIgnoredOutcome = wrongState.runtime.snapshot()
  await deliverRuntimeOutcome(wrongState.runtime, {
    status: 'success',
    operation: 'stop',
    reason: 'renderer_stopped',
  })
  expect(wrongState.runtime.snapshot()).toEqual(beforeIgnoredOutcome)
  expect(wrongState.commands).toEqual([{ operation: 'start', reason: 'manual_start' }])
  expect(wrongState.metadata.some((event) => event.reason === 'outcome_ignored_wrong_state')).toBe(true)
  for (const event of [
    ...success.metadata,
    ...stopFailure.metadata,
    ...wrongState.metadata,
  ]) {
    expectMetadataOnly(event)
  }
})
