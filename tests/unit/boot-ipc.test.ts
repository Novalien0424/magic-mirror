import { describe, expect, it } from 'vitest'

import {
  bootSequence,
  createStartingSnapshot,
  projectAppSnapshot,
} from '../../src/main/boot'
import { ConfigServiceError } from '../../src/main/config-service'
import {
  authorizeSender,
  CONSOLE_IPC_CHANNELS,
  MIRROR_IPC_CHANNELS,
  publishSnapshot,
  registerIpcHandlers,
  validateSimulatorPayload,
} from '../../src/main/ipc'
import { createLifecycleActor } from '../../src/main/lifecycle'
import { DEFAULT_MODULE_STATUSES } from '../../src/main/module-registry'
import type { ModuleId, ModuleStatus, OpStatus } from '../../src/shared/types'

const RAW_CONFIG_ERROR = 'synthetic-config-raw-error'
const RAW_MODEL_ERROR = 'synthetic-model-raw-error'
const RAW_SQLITE_ERROR = 'synthetic-sqlite-raw-error'
const RAW_DELIVERY_ERROR = 'synthetic-snapshot-delivery-error'
const MODEL_ID_SENTINEL = 'synthetic-configured-model-id'
const PROFILE_ID_SENTINEL = 'synthetic-profile-id'
const GUEST_ID_SENTINEL = 'synthetic-guest-id'
const CANDIDATE_ID_SENTINEL = 'synthetic-candidate-profile-id'
const ACTIVATION_ID_SENTINEL = 'synthetic-activation-id'
const REALTIME_SESSION_ID_SENTINEL = 'synthetic-realtime-session-id'
const FIXED_TIME = '2026-08-19T00:00:00.000Z'

type MetadataEvent = Record<string, unknown>
type ModuleStatuses = Partial<Record<ModuleId, ModuleStatus>>
type BootFailure = 'config' | 'model' | 'sqlite'
type SimulatorResult = {
  readonly op: OpStatus
  readonly lifecycleEvent?: string
}

interface BootRuntimeLike {
  readonly ready: Promise<void>
  snapshot(): Record<string, unknown>
  handleSimulator(command: unknown): Promise<SimulatorResult> | SimulatorResult
}

interface HarnessOptions {
  readonly failure?: BootFailure
  readonly configError?: Error
  readonly pendingConfig?: boolean
  readonly moduleStatuses?: ModuleStatuses
}

interface BootHarness {
  readonly options: unknown
  readonly calls: string[]
  readonly events: MetadataEvent[]
  readonly sentLifecycleEvents: MetadataEvent[]
  readonly releaseConfig: () => void
}

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

interface IpcMainRegistrar {
  handle(channel: string, handler: IpcHandler): void
  on(channel: string, handler: IpcHandler): void
}

interface RegisteredIpcHarness {
  readonly ipcMain: IpcMainRegistrar
  readonly handlers: Map<string, IpcHandler>
}

function rawFailure(message: string, code: string): Error & { code: string } {
  const failure = new Error(message) as Error & { code: string }
  failure.code = code
  return failure
}

function unsupportedSchemaConfigError(): ConfigServiceError {
  const failure = new ConfigServiceError('config_schema_invalid', [
    { path: RAW_CONFIG_ERROR, message: RAW_CONFIG_ERROR },
  ])
  Object.defineProperty(failure, 'code', { value: 'config_schema_unsupported' })
  return failure
}

function makeTelemetry(events: MetadataEvent[]): Record<string, unknown> {
  return {
    emit(event: MetadataEvent) {
      events.push({ ...event })
    },
    readPage() {
      return { events: [], nextBeforeSequence: null }
    },
    getStats() {
      return {
        telemetryDroppedCount: 0,
        ramEvictedCount: 0,
        rejectedEventCount: 0,
        extraFieldStrippedCount: 0,
        writerFailureCount: 0,
        rotationFailureCount: 0,
        schedulerFailureCount: 0,
        ramEventCount: events.length,
        queueDepth: 0,
        closed: false,
      }
    },
    flush: async () => {},
    close: async () => {},
  }
}

function makeConfig(configVersion = 7): Record<string, unknown> {
  return {
    configVersion,
    persona: { name: 'synthetic-persona', instructions: 'synthetic-instructions' },
    voice: 'synthetic-voice',
    idleSeconds: 300,
    aiModels: {
      realtimeDialogue: { modelId: MODEL_ID_SENTINEL },
      inputTranscription: { modelId: MODEL_ID_SENTINEL },
      memoryExtractor: { modelId: MODEL_ID_SENTINEL },
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
}

function makeModelResolution(): Record<string, unknown> {
  const settings = {
    slot: 'active',
    configVersion: 7,
    fingerprint: 'synthetic-config-fingerprint',
    realtimeDialogue: MODEL_ID_SENTINEL,
    inputTranscription: MODEL_ID_SENTINEL,
    memoryExtractor: MODEL_ID_SENTINEL,
    voice: 'synthetic-voice',
  }
  return {
    active: settings,
    draft: { ...settings, slot: 'draft' },
    previous: { ...settings, slot: 'previous' },
  }
}

function makeModuleRegistry(
  events: MetadataEvent[],
  moduleStatuses: ModuleStatuses,
): Record<string, unknown> {
  const snapshot: Record<ModuleId, ModuleStatus> = { ...DEFAULT_MODULE_STATUSES, ...moduleStatuses }

  return {
    getStatus(module: ModuleId) {
      return snapshot[module]
    },
    snapshot: () => ({ ...snapshot }),
    async probe(module: ModuleId) {
      const status = snapshot[module]
      if (status === 'ready') {
        events.push({
          module,
          event: 'module_probe',
          status: 'success',
          reason: 'probe_success',
          source: 'runtime',
        })
        return {
          module,
          eventDelivery: 'emitted',
          kind: 'success',
          status: 'ready',
          opStatus: 'success',
          reason: 'probe_success',
        }
      }
      if (status === 'degraded') {
        events.push({
          module,
          event: 'module_probe',
          status: 'degraded',
          error_code: 'module_probe_degraded',
          reason: 'probe_degraded',
          source: 'runtime',
        })
        return {
          module,
          eventDelivery: 'emitted',
          kind: 'degraded',
          status: 'degraded',
          opStatus: 'degraded',
          reason: 'probe_degraded',
          errorCode: 'module_probe_degraded',
        }
      }
      if (status === 'failed') {
        events.push({
          module,
          event: 'module_probe',
          status: 'failed',
          error_code: 'module_probe_failed',
          reason: 'probe_failed',
          source: 'runtime',
        })
        return {
          module,
          eventDelivery: 'emitted',
          kind: 'failed',
          status: 'failed',
          opStatus: 'failed',
          reason: 'probe_failed',
          errorCode: 'module_probe_failed',
        }
      }
      events.push({
        module,
        event: 'module_probe',
        status: 'info',
        error_code: 'module_adapter_missing',
        reason: 'module_missing',
        source: 'runtime',
      })
      return {
        module,
        eventDelivery: 'emitted',
        kind: 'missing',
        status: 'not_implemented',
        opStatus: 'info',
        reason: 'module_missing',
        errorCode: 'module_adapter_missing',
      }
    },
  }
}

function makeBootHarness(harnessOptions: HarnessOptions = {}): BootHarness {
  const calls: string[] = []
  const events: MetadataEvent[] = []
  const sentLifecycleEvents: MetadataEvent[] = []
  const telemetry = makeTelemetry(events)
  const slots = {
    active: makeConfig(7),
    draft: makeConfig(7),
    previous: makeConfig(6),
  }
  const modelResolution = makeModelResolution()
  const moduleStatuses = harnessOptions.moduleStatuses ?? {}
  let releaseConfig: () => void = () => {}

  const configService = {
    initialize: () => {
      calls.push('configService.initialize')
      if (harnessOptions.configError !== undefined) {
        return Promise.reject(harnessOptions.configError)
      }
      if (harnessOptions.failure === 'config') {
        return Promise.reject(rawFailure(RAW_CONFIG_ERROR, 'config_read_failed'))
      }
      if (harnessOptions.pendingConfig) {
        return new Promise<Record<string, unknown>>((resolve) => {
          releaseConfig = () => resolve(slots)
        })
      }
      return Promise.resolve(slots)
    },
  }

  const moduleRegistry = makeModuleRegistry(events, moduleStatuses)
  const mockFactory = {
    create(id: string) {
      return {
        id,
        initialStatus: 'not_implemented',
        probe: () => 'success',
        setOutcome: () => {},
      }
    },
  }

  const innerActor = createLifecycleActor({
    telemetry: {
      emit(event) {
        events.push({ ...event })
      },
    },
  })
  const actor = {
    send(event: MetadataEvent) {
      sentLifecycleEvents.push({ ...event })
      innerActor.send(event as never)
    },
    getState: innerActor.getState,
    getContext: innerActor.getContext,
    subscribe: innerActor.subscribe,
  }

  const options = {
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    createTelemetry: () => {
      calls.push('createTelemetry')
      return telemetry
    },
    configService,
    resolveModelSettings: () => {
      calls.push('resolveModelSettings')
      if (harnessOptions.failure === 'model') {
        throw rawFailure(RAW_MODEL_ERROR, 'model_settings_invalid_config')
      }
      return modelResolution
    },
    openSqlite: () => {
      calls.push('openSqlite')
      if (harnessOptions.failure === 'sqlite') {
        throw rawFailure(RAW_SQLITE_ERROR, 'sqlite_open_failed')
      }
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
      return mockFactory
    },
    createModuleRegistry: () => {
      calls.push('createModuleRegistry')
      return moduleRegistry
    },
    createLifecycleActor: () => {
      calls.push('createLifecycleActor')
      return actor
    },
    now: () => FIXED_TIME,
    createActivationId: () => ACTIVATION_ID_SENTINEL,
    createRealtimeSessionId: () => REALTIME_SESSION_ID_SENTINEL,
  }

  return {
    options,
    calls,
    events,
    sentLifecycleEvents,
    releaseConfig: () => releaseConfig(),
  }
}

function startBoot(options: unknown): BootRuntimeLike {
  return (bootSequence as unknown as (value: unknown) => BootRuntimeLike)(options)
}

function startingSnapshot(): Record<string, unknown> {
  return (createStartingSnapshot as unknown as () => Record<string, unknown>)()
}

function projectSnapshot(input: unknown): Record<string, unknown> {
  return (projectAppSnapshot as unknown as (value: unknown) => Record<string, unknown>)(input)
}

function serialize(value: unknown): string {
  return JSON.stringify(value)
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

function expectNoIdentifierKeys(value: unknown): void {
  expect(collectKeys(value).some((key) => /guest|profile|candidate|modelid/i.test(key))).toBe(false)
}

function expectNoPrivateSentinels(value: unknown): void {
  const encoded = serialize(value)
  for (const sentinel of [
    RAW_CONFIG_ERROR,
    RAW_MODEL_ERROR,
    RAW_SQLITE_ERROR,
    RAW_DELIVERY_ERROR,
    MODEL_ID_SENTINEL,
    PROFILE_ID_SENTINEL,
    GUEST_ID_SENTINEL,
    CANDIDATE_ID_SENTINEL,
    ACTIVATION_ID_SENTINEL,
  ]) {
    expect(encoded).not.toContain(sentinel)
  }
}

function expectNoRealtimeSessionSentinel(value: unknown): void {
  expect(serialize(value)).not.toContain(REALTIME_SESSION_ID_SENTINEL)
}

function expectReasonedMetadataEvents(events: readonly MetadataEvent[]): void {
  for (const event of events) {
    expect(event.reason).toEqual(expect.any(String))
    expect(event.source).toEqual(expect.any(String))
    expect(Object.keys(event)).not.toContain('time')
    expectNoPrivateSentinels(event)
  }
}

function expectSuccessfulSimulatorResult(result: SimulatorResult): void {
  expect(result.op).toBe('success')
  expect(Object.keys(result)).toContain('op')
  expect(Object.keys(result).every((key) => key === 'op' || key === 'lifecycleEvent')).toBe(true)
}

function expectSimulatorResultShape(value: unknown): asserts value is SimulatorResult {
  expect(value).toEqual(expect.objectContaining({ op: expect.any(String) }))
  expect(['success', 'degraded', 'failed']).toContain((value as SimulatorResult).op)
  expect(Object.keys(value as object).every((key) => key === 'op' || key === 'lifecycleEvent')).toBe(true)
}

function makeIpcMainRegistrar(): RegisteredIpcHarness {
  const handlers = new Map<string, IpcHandler>()
  return {
    handlers,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler)
      },
      on(channel, handler) {
        handlers.set(channel, handler)
      },
    },
  }
}

function registerTestIpcHandlers(
  runtime: BootRuntimeLike,
  windows: unknown,
  events: MetadataEvent[],
): RegisteredIpcHarness {
  const registered = makeIpcMainRegistrar()
  const register = registerIpcHandlers as unknown as (options: {
    ipcMain: IpcMainRegistrar
    runtime: BootRuntimeLike
    windows: unknown
    telemetry: { emit(event: MetadataEvent): void }
  }) => void
  register({
    ipcMain: registered.ipcMain,
    runtime,
    windows,
    telemetry: { emit: (event) => events.push({ ...event }) },
  })
  return registered
}

describe('Phase 0 Task 8 Main boot and IPC RED contract', () => {
  it('creates the renderer-safe Starting snapshot before local initialization', () => {
    const snapshot = startingSnapshot()

    expect(snapshot.lifecycle).toBe('starting')
    expect(snapshot.configVersion).toBeNull()
    expect(snapshot.modules).toEqual(DEFAULT_MODULE_STATUSES)
    expect(snapshot.identityStatus).toBe('unassigned')
    expect(snapshot.realtimeSessionId).toBeNull()
    expect(snapshot.lastError).toBeNull()
    expect(snapshot.maintenance).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'activeProfileId')).toBe(false)
    expectNoIdentifierKeys(snapshot)
    expectNoPrivateSentinels(snapshot)
  })

  it('runs injected boot factories in the exact accepted order', async () => {
    const harness = makeBootHarness()
    const runtime = startBoot(harness.options)

    expect(await runtime.ready).toBeUndefined()
    expect(harness.calls).toEqual([
      'createTelemetry',
      'configService.initialize',
      'resolveModelSettings',
      'openSqlite',
      'createMockModuleFactory',
      'createModuleRegistry',
      'createLifecycleActor',
    ])
    expect(runtime.snapshot().lifecycle).toBe('dormant')
    expectNoPrivateSentinels(runtime.snapshot())
    expectReasonedMetadataEvents(harness.events)
  })

  it('keeps Starting visible while ConfigService.initialize is pending', async () => {
    const harness = makeBootHarness({ pendingConfig: true })
    const runtime = startBoot(harness.options)

    expect(runtime.snapshot().lifecycle).toBe('starting')
    expect(harness.calls.slice(0, 2)).toEqual([
      'createTelemetry',
      'configService.initialize',
    ])

    harness.releaseConfig()
    await runtime.ready
    expect(runtime.snapshot().lifecycle).toBe('dormant')
  })

  it.each([
    { failure: 'config' as const, code: 'config_read_failed', sentinel: RAW_CONFIG_ERROR },
    { failure: 'model' as const, code: 'model_settings_invalid_config', sentinel: RAW_MODEL_ERROR },
    { failure: 'sqlite' as const, code: 'sqlite_open_failed', sentinel: RAW_SQLITE_ERROR },
  ])(
    'routes $failure local-essential failure to stable Maintenance without the raw sentinel',
    async ({ failure, code, sentinel }) => {
      const harness = makeBootHarness({ failure })
      const runtime = startBoot(harness.options)

      await runtime.ready
      const snapshot = runtime.snapshot()

      expect(snapshot.lifecycle).toBe('maintenance')
      expect(snapshot.maintenance).toEqual(expect.objectContaining({ code }))
      expect(harness.calls).toContain('createModuleRegistry')
      expect(harness.calls).toContain('createLifecycleActor')
      expect(serialize(snapshot)).not.toContain(sentinel)
      expectNoPrivateSentinels(snapshot)
      expectReasonedMetadataEvents(harness.events)
    },
  )

  it('routes a ConfigServiceError for unsupported schema to Maintenance with safe metadata only', async () => {
    const harness = makeBootHarness({ configError: unsupportedSchemaConfigError() })
    const runtime = startBoot(harness.options)

    await runtime.ready
    const snapshot = runtime.snapshot()

    expect(snapshot.lifecycle).toBe('maintenance')
    expect(snapshot.maintenance).toEqual({
      code: 'config_schema_unsupported',
      detail: 'config_schema_unsupported',
    })
    expect(snapshot.lastError).toEqual(expect.objectContaining({
      module: 'config',
      error_code: 'config_schema_unsupported',
    }))
    expect(harness.events).toContainEqual(expect.objectContaining({
      module: 'config',
      event: 'local_core_failed',
      status: 'failed',
      error_code: 'config_schema_unsupported',
      reason: 'operation=initialize;cause=read_failed',
      source: 'runtime',
    }))
    expectNoIdentifierKeys(snapshot)
    expectNoPrivateSentinels(snapshot)
    expectNoPrivateSentinels(harness.events)
    expect(serialize(snapshot)).not.toContain(RAW_CONFIG_ERROR)
    expect(serialize(harness.events)).not.toContain(RAW_CONFIG_ERROR)
    expectReasonedMetadataEvents(harness.events)
  })

  it('keeps failed and degraded non-core modules visible without gating Dormant', async () => {
    const harness = makeBootHarness({
      moduleStatuses: {
        openai: 'failed',
        wake: 'degraded',
        camera: 'failed',
        lighting: 'degraded',
      },
    })
    const runtime = startBoot(harness.options)

    await runtime.ready
    const snapshot = runtime.snapshot()

    expect(snapshot.lifecycle).toBe('dormant')
    expect((snapshot.modules as ModuleStatuses).openai).toBe('failed')
    expect((snapshot.modules as ModuleStatuses).wake).toBe('degraded')
    expect((snapshot.modules as ModuleStatuses).camera).toBe('failed')
    expect((snapshot.modules as ModuleStatuses).lighting).toBe('degraded')
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: 'openai', reason: 'probe_failed' }),
      expect.objectContaining({ module: 'wake', reason: 'probe_degraded' }),
      expect.objectContaining({ module: 'camera', reason: 'probe_failed' }),
      expect.objectContaining({ module: 'lighting', reason: 'probe_degraded' }),
    ]))
    expectReasonedMetadataEvents(harness.events)
  })

  it('projects only bounded identity status and Main-owned metadata', () => {
    const snapshot = projectSnapshot({
      state: 'active',
      context: {
        activationId: ACTIVATION_ID_SENTINEL,
        realtimeSessionId: REALTIME_SESSION_ID_SENTINEL,
        sessionGeneration: 4,
        activeProfileId: PROFILE_ID_SENTINEL,
        guestId: GUEST_ID_SENTINEL,
        candidateProfileId: CANDIDATE_ID_SENTINEL,
        modelId: MODEL_ID_SENTINEL,
        lastInteractionAt: FIXED_TIME,
        sceneInvocationId: 'synthetic-scene-invocation',
      },
      appVersion: 'synthetic-app-version',
      buildCommit: 'synthetic-build-commit',
      configVersion: 7,
      modules: DEFAULT_MODULE_STATUSES,
      lastError: null,
      maintenance: null,
    })

    expect(snapshot.lifecycle).toBe('active')
    expect(snapshot.identityStatus).toBe('active')
    expect(snapshot.configVersion).toBe(7)
    expect(snapshot.realtimeSessionId).toBe(REALTIME_SESSION_ID_SENTINEL)
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'activeProfileId')).toBe(false)
    expectNoIdentifierKeys(snapshot)
    expectNoPrivateSentinels(snapshot)
  })

  it('preserves the R2 simulator result shape while sequencing wake events', async () => {
    const harness = makeBootHarness()
    const runtime = startBoot(harness.options)
    await runtime.ready

    const result = await runtime.handleSimulator({ type: 'wake' })

    expectSuccessfulSimulatorResult(result)
    expect(harness.sentLifecycleEvents.slice(-2)).toEqual([
      {
        type: 'WAKE_DETECTED',
        activationId: ACTIVATION_ID_SENTINEL,
        lastInteractionAt: FIXED_TIME,
      },
      {
        type: 'REALTIME_READY',
        realtimeSessionId: REALTIME_SESSION_ID_SENTINEL,
      },
    ])
    expectNoPrivateSentinels(result)
    expectNoRealtimeSessionSentinel(result)
    expectReasonedMetadataEvents(harness.events)
  })

  it('returns the authoritative result shape and records a reason when wake is ignored outside Dormant', async () => {
    const harness = makeBootHarness()
    const runtime = startBoot(harness.options)
    await runtime.ready

    await runtime.handleSimulator({ type: 'wake' })
    const eventCountBeforeIgnoredCommand = harness.events.length
    const lifecycleEventCountBeforeIgnoredCommand = harness.sentLifecycleEvents.length

    const ignored = await runtime.handleSimulator({ type: 'wake' })

    expectSimulatorResultShape(ignored)
    expectNoPrivateSentinels(ignored)
    expectNoRealtimeSessionSentinel(ignored)
    expect(runtime.snapshot().lifecycle).toBe('active')
    expect(harness.sentLifecycleEvents).toHaveLength(lifecycleEventCountBeforeIgnoredCommand)
    expect(harness.events.slice(eventCountBeforeIgnoredCommand)).toContainEqual(expect.objectContaining({
      module: 'app',
      event: 'simulator_command_ignored',
      reason: 'state=active;command=wake;cause=not_dormant',
      source: 'simulator',
    }))
    expectReasonedMetadataEvents(harness.events)
  })

  it('does not expose a public realtime readiness simulator command', () => {
    const rejected = (validateSimulatorPayload as unknown as (value: unknown) => unknown)({
      type: 'realtime_ready',
    })

    expect(rejected).toEqual({ ok: false, reason: 'ipc_payload_invalid' })
    expectNoPrivateSentinels(rejected)
  })

  it('routes cloud failure to OfflineLoop and recovers to clean Dormant', async () => {
    const harness = makeBootHarness()
    const runtime = startBoot(harness.options)
    await runtime.ready

    await runtime.handleSimulator({ type: 'wake' })
    const failed = await runtime.handleSimulator({ type: 'cloud_failure' })
    expectSuccessfulSimulatorResult(failed)
    expect(runtime.snapshot().lifecycle).toBe('offlineLoop')

    const recovered = await runtime.handleSimulator({ type: 'cloud_recovery' })
    expectSuccessfulSimulatorResult(recovered)
    const snapshot = runtime.snapshot()
    expect(snapshot.lifecycle).toBe('dormant')
    expect(snapshot.identityStatus).toBe('unassigned')
    expect(snapshot.realtimeSessionId).toBeNull()
    expect(snapshot.lastError).toBeNull()
    expect(snapshot.maintenance).toBeNull()
    expectNoPrivateSentinels({ failed, recovered, snapshot })
  })

  it('keeps exact Mirror and Console channel allowlists', () => {
    expect(MIRROR_IPC_CHANNELS).toEqual({
      getSnapshot: 'mirror:get-snapshot',
      snapshot: 'mirror:snapshot',
      requestRealtimeClientSecret: 'mirror:request-realtime-client-secret',
      ready: 'boot:renderer-ready',
    })
    expect(CONSOLE_IPC_CHANNELS).toEqual({
      getSnapshot: 'console:get-snapshot',
      snapshot: 'console:snapshot',
      simulate: 'console:simulate',
      overview: 'console:get-overview',
      events: 'console:get-events',
      config: 'console:get-config',
      models: 'console:get-models',
      phaseTests: 'console:get-phase-tests',
      saveModelDraft: 'console:save-model-draft',
      saveDraft: 'console:save-draft',
      testDraft: 'console:test-draft',
      publish: 'console:publish',
      rollback: 'console:rollback',
      nextRuntime: 'console:create-next-runtime',
      ready: 'boot:renderer-ready',
    })
  })

  it('authorizes only tracked main-frame senders with the expected webContents id', () => {
    const mainFrame = {}
    const consoleFrame = {}
    let destroyed = false
    const mirrorSender = {
      id: 101,
      mainFrame,
      isDestroyed: () => destroyed,
      send: () => {},
    }
    const consoleSender = {
      id: 202,
      mainFrame: consoleFrame,
      isDestroyed: () => false,
      send: () => {},
    }
    const windows = {
      mirror: { webContents: mirrorSender, webContentsId: 101 },
      console: { webContents: consoleSender, webContentsId: 202 },
    }
    const authorize = authorizeSender as unknown as (
      event: unknown,
      expectedKind: 'mirror' | 'console',
      trackedWindows: unknown,
    ) => { ok: boolean; reason?: string }

    expect(authorize({ sender: mirrorSender, senderFrame: mainFrame }, 'mirror', windows)).toEqual({ ok: true })
    expect(authorize({ sender: mirrorSender, senderFrame: consoleFrame }, 'mirror', windows)).toEqual({
      ok: false,
      reason: 'sender_frame_invalid',
    })

    destroyed = true
    expect(authorize({ sender: mirrorSender, senderFrame: mainFrame }, 'mirror', windows)).toEqual({
      ok: false,
      reason: 'window_destroyed',
    })
    destroyed = false

    expect(authorize({ sender: { ...mirrorSender, id: 999 }, senderFrame: mainFrame }, 'mirror', windows)).toEqual({
      ok: false,
      reason: 'web_contents_mismatch',
    })
    expect(authorize({ sender: { id: 303, mainFrame }, senderFrame: mainFrame }, 'mirror', windows)).toEqual({
      ok: false,
      reason: 'unknown_sender',
    })
    expect(authorize({ sender: consoleSender, senderFrame: consoleFrame }, 'mirror', windows).ok).toBe(false)
  })

  it('rejects wrong-kind senders and invalid Console simulator payloads at the registered handler boundary', async () => {
    const events: MetadataEvent[] = []
    const dispatched: unknown[] = []
    const mirrorFrame = {}
    const consoleFrame = {}
    const mirrorSender = {
      id: 501,
      mainFrame: mirrorFrame,
      isDestroyed: () => false,
      send: () => {},
    }
    const consoleSender = {
      id: 502,
      mainFrame: consoleFrame,
      isDestroyed: () => false,
      send: () => {},
    }
    const windows = {
      mirror: { webContents: mirrorSender, webContentsId: 501 },
      console: { webContents: consoleSender, webContentsId: 502 },
    }
    const runtime: BootRuntimeLike = {
      ready: Promise.resolve(),
      snapshot: startingSnapshot,
      handleSimulator(command) {
        dispatched.push(command)
        return { op: 'success' }
      },
    }
    const registered = registerTestIpcHandlers(runtime, windows, events)
    const simulate = registered.handlers.get(CONSOLE_IPC_CHANNELS.simulate) as IpcHandler

    const wrongKindResult = await simulate(
      { sender: mirrorSender, senderFrame: mirrorFrame },
      { type: 'wake' },
    )
    expectSimulatorResultShape(wrongKindResult)
    expectNoPrivateSentinels(wrongKindResult)
    expect(events).toContainEqual(expect.objectContaining({
      module: 'app',
      event: 'ipc_sender_rejected',
      reason: 'web_contents_mismatch',
      source: 'runtime',
    }))
    expect(dispatched).toHaveLength(0)

    const invalidPayloadResult = await simulate(
      { sender: consoleSender, senderFrame: consoleFrame },
      { type: 'wake', profileId: PROFILE_ID_SENTINEL },
    )
    expectSimulatorResultShape(invalidPayloadResult)
    expectNoPrivateSentinels(invalidPayloadResult)
    expect(events).toContainEqual(expect.objectContaining({
      module: 'app',
      event: 'ipc_payload_invalid',
      reason: 'payload_schema_invalid',
      source: 'runtime',
    }))
    expect(dispatched).toHaveLength(0)
    expectReasonedMetadataEvents(events)
  })

  it('accepts only exact simulator payloads and rejects identifier-shaped keys', () => {
    const validate = validateSimulatorPayload as unknown as (value: unknown) => unknown
    const validCommands = [
      { type: 'wake' },
      { type: 'cloud_failure' },
      { type: 'cloud_recovery' },
      { type: 'camera_result', faces: 0 },
      { type: 'camera_result', faces: 1 },
      { type: 'camera_result', faces: 'multiple' },
      { type: 'avatar_state', state: 'idle' },
      { type: 'scene_result', sceneId: 'scene-1', status: 'success' },
      { type: 'sqlite_failure' },
      { type: 'sleep' },
    ]
    for (const command of validCommands) {
      expect(validate(command)).toEqual({ ok: true, value: command })
    }

    const invalidCommands = [
      { type: 'wake', guestId: GUEST_ID_SENTINEL },
      { type: 'cloud_failure', profileId: PROFILE_ID_SENTINEL },
      { type: 'cloud_recovery', candidateProfileId: CANDIDATE_ID_SENTINEL },
      { type: 'sleep', modelId: MODEL_ID_SENTINEL },
      { type: 'camera_result', faces: 'two' },
      { type: 'avatar_state', state: 'unsafe state with spaces' },
      { type: 'scene_result', sceneId: 'scene-1', status: 'unknown' },
      { type: 'scene_result', sceneId: 'scene-1', status: 'success', profileId: PROFILE_ID_SENTINEL },
      { type: 'realtime_ready' },
    ]
    for (const command of invalidCommands) {
      const result = validate(command)
      expect(result).toEqual({ ok: false, reason: 'ipc_payload_invalid' })
      expectNoPrivateSentinels(result)
    }
  })

  it('keeps snapshot delivery failure non-gating and emits a stable metadata event', async () => {
    const events: MetadataEvent[] = []
    const delivered: Array<{ channel: string; payload: unknown }> = []
    const mirrorFrame = {}
    const consoleFrame = {}
    const mirrorSender = {
      id: 401,
      mainFrame: mirrorFrame,
      isDestroyed: () => false,
      send() {
        throw new Error(RAW_DELIVERY_ERROR)
      },
    }
    const consoleSender = {
      id: 402,
      mainFrame: consoleFrame,
      isDestroyed: () => false,
      send(channel: string, payload: unknown) {
        delivered.push({ channel, payload })
      },
    }
    const windows = {
      mirror: { webContents: mirrorSender, webContentsId: 401 },
      console: { webContents: consoleSender, webContentsId: 402 },
    }
    const snapshot = startingSnapshot()
    const publish = publishSnapshot as unknown as (
      kind: 'mirror' | 'console',
      value: unknown,
      trackedWindows: unknown,
      eventSink: { emit(event: MetadataEvent): void },
    ) => Promise<void> | void

    await publish('mirror', snapshot, windows, { emit: (event) => events.push({ ...event }) })
    await publish('console', snapshot, windows, { emit: (event) => events.push({ ...event }) })

    expect(delivered).toEqual([{ channel: 'console:snapshot', payload: snapshot }])
    expect(events).toContainEqual(expect.objectContaining({
      module: 'app',
      event: 'ipc_snapshot_delivery_failed',
      status: 'failed',
      reason: expect.stringContaining('window=mirror'),
      source: 'runtime',
    }))
    expectReasonedMetadataEvents(events)
    expectNoPrivateSentinels({ delivered, events })
    expectNoRealtimeSessionSentinel({ delivered, events })
  })

  it('does not put model or private identifiers in any public boot result or event serialization', async () => {
    const harness = makeBootHarness()
    const runtime = startBoot(harness.options)
    await runtime.ready
    const simulatorResult = await runtime.handleSimulator({ type: 'wake' })

    expectNoPrivateSentinels(runtime.snapshot())
    expectNoPrivateSentinels(simulatorResult)
    expectNoRealtimeSessionSentinel(simulatorResult)
    expectReasonedMetadataEvents(harness.events)
    expect(serialize(runtime.snapshot())).not.toContain('modelId')
    expect(serialize(runtime.snapshot())).not.toContain('profileId')
    expect(serialize(runtime.snapshot())).not.toContain('candidateProfileId')
    expect(serialize(runtime.snapshot())).not.toContain('guestId')
  })
})
