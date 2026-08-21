import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  AppSnapshot,
  IdentityStatus,
  LifecycleState,
  ModuleId,
  ModuleStatus,
  MirrorEvent,
  OpStatus,
  Result,
  SimulatorCommand,
  SimulatorResult,
} from '../shared/types'
import type {
  ConsoleRuntimeSnapshot,
  DeveloperModeDecision,
  PhaseTestRecordReader,
} from '../shared/console-types'
import {
  DEFAULT_MODULE_STATUSES,
  MODULE_IDS,
  type ModuleRegistry,
  type ModuleRegistryOptions,
  type ModuleProbeResult,
} from './module-registry'
import {
  createMockModuleFactory as defaultCreateMockModuleFactory,
  type MockModuleOptions,
  type ModuleMockFactory,
} from './module-mocks'
import {
  createLifecycleActor as defaultCreateLifecycleActor,
  type LifecycleActor,
  type LifecycleContext,
  type LifecycleEvent,
  type LifecycleSnapshot,
} from './lifecycle'
import {
  createModuleRegistry as defaultCreateModuleRegistry,
  type ModuleEventSink,
} from './module-registry'
import {
  createTelemetry as defaultCreateTelemetry,
  type Telemetry,
} from './telemetry'
import {
  createConfigService as defaultCreateConfigService,
  type ConfigService,
  type ConfigSlots,
} from './config-service'
import {
  resolveModelSettings as defaultResolveModelSettings,
  type ModelSettingsResolution,
} from './model-settings'
import {
  openSqlite as defaultOpenSqlite,
  type SqliteFailure,
  type SqlitePhaseTestService,
  type SqliteService,
} from './sqlite-service'
import {
  createConsoleDataPlane,
  resolveDeveloperMode,
  type ConsoleDataPlane,
} from './console-data'
import { createConsoleConfigController } from './console-config'
import type {
  ConsoleConfigControllerOptions,
  ConsoleConfigRefreshResult,
} from './console-config'

export function initializeRealtimePrivacyFlags(
  environment: Record<string, string | undefined> = process.env,
): void {
  environment.OPENAI_AGENTS_DISABLE_TRACING = '1'
  environment.OPENAI_AGENTS_DONT_LOG_MODEL_DATA = '1'
  environment.OPENAI_AGENTS_DONT_LOG_TOOL_DATA = '1'
}

// Main establishes the privacy posture while this module is loaded, before
// any future Realtime SDK/session composition or renderer creation.
initializeRealtimePrivacyFlags()

const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const SAFE_REASON_PATTERN = /^[A-Za-z0-9_=;.%:+,/?-]{1,1024}$/
const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const LIFECYCLE_STATES: ReadonlySet<LifecycleState> = new Set([
  'starting',
  'dormant',
  'activating',
  'active',
  'suspending',
  'offlineLoop',
  'maintenance',
])

const IDENTITY_STATUSES: ReadonlySet<IdentityStatus> = new Set([
  'unassigned',
  'confirming',
  'active',
  'anonymous',
  'group',
])

const MODULE_STATUSES: ReadonlySet<ModuleStatus> = new Set([
  'not_implemented',
  'ready',
  'degraded',
  'failed',
])

const PROBED_MODULES: readonly ModuleId[] = [
  'openai',
  'wake',
  'audio',
  'camera',
  'avatar',
  'lighting',
  'fog',
  'music',
]

type MetadataEvent = Omit<MirrorEvent, 'time'>

interface BootFailure {
  readonly module: ModuleId
  readonly errorCode: string
  readonly reason: string
}

interface MaintenanceInfo {
  readonly code: string
  readonly detail: string
}

interface BootContextView {
  readonly state: LifecycleState
  readonly context: LifecycleContext
}

const OFFLINE_LOOP_ASSET_SHA256 = 'e9e4383572854438f47591b67153d5b25dfc20f577019d649f2149e4cbb34cd6'
const OFFLINE_LOOP_ASSET_BYTE_LENGTH = 1687

export interface AssetPreflightResult {
  readonly status: 'ready' | 'unavailable'
  readonly reason: 'asset_verified' | 'offline_loop_asset_missing' | 'offline_loop_asset_corrupt'
  readonly fallback?: {
    readonly state: 'maintenance'
    readonly visible: true
    readonly nonblack: true
  }
}

interface AssetPreflightEvent {
  readonly time: string
  readonly module: 'app'
  readonly event: 'asset_ready' | 'asset_unavailable'
  readonly status: 'success' | 'degraded'
  readonly reason: AssetPreflightResult['reason']
  readonly source: 'runtime'
}

export interface AssetPreflightOptions {
  readonly assetPath: string
  readonly emit: (event: AssetPreflightEvent) => void
  readonly onUnrelatedModuleGate?: () => void
  readonly acquireMicrophone?: () => void
}

export interface BootOptions {
  readonly appVersion?: string
  readonly buildCommit?: string
  readonly isPackaged?: boolean
  readonly developerModeOverride?: unknown
  readonly telemetryDirectory?: string
  readonly configDir?: string
  readonly defaultConfigPath?: string
  readonly sqlitePath?: string
  readonly offlineLoopAssetPath?: string
  readonly createTelemetry?: () => Telemetry | PromiseLike<Telemetry>
  readonly configService?: ConfigService
  readonly resolveModelSettings?: (slots: ConfigSlots) => ModelSettingsResolution | PromiseLike<ModelSettingsResolution>
  readonly openSqlite?: () =>
    | SqliteService
    | { readonly ok: true; readonly value: SqliteService }
    | { readonly ok: false; readonly error: SqliteFailure }
    | PromiseLike<
      | SqliteService
      | { readonly ok: true; readonly value: SqliteService }
      | { readonly ok: false; readonly error: SqliteFailure }
    >
  readonly createMockModuleFactory?: () => ModuleMockFactory
  readonly createModuleRegistry?: (options: ModuleRegistryOptions) => ModuleRegistry
  readonly createLifecycleActor?: (deps: { telemetry: { emit(event: MetadataEvent): void } }) => LifecycleActor
  /** Main-only deterministic seams consumed by the Phase 0 demo runner. */
  readonly activationFailureAfterWake?: boolean
  readonly completeSleepForDemo?: boolean
  readonly mockDraftProbe?: ConsoleConfigControllerOptions['mockDraftProbe']
  readonly now?: () => string
  readonly createActivationId?: () => string
  readonly createRealtimeSessionId?: () => string
}

export interface BootSubscription {
  unsubscribe(): void
}

export interface BootRuntime {
  readonly ready: Promise<void>
  readonly telemetry: Pick<Telemetry, 'emit'>
  readonly console: ConsoleDataPlane
  shutdown(): Promise<void>
  snapshot(): AppSnapshot
  subscribe(listener: (snapshot: AppSnapshot) => void): BootSubscription
  handleSimulator(command: unknown): Promise<SimulatorResult>
  /** Main-owned phase-record writer; never exposed through renderer IPC. */
  appendPhaseTestRecord(record: unknown): Result<void, SqliteFailure>
  /** Main-only fixture seam; never exposed through renderer IPC. */
  createInitialRuntimeSnapshotsForTest(): Promise<ConsoleRuntimeSnapshot>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function safeCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_CODE_PATTERN.test(value) ? value : fallback
}

function safeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && SAFE_IDENTIFIER_PATTERN.test(value) ? value : null
}

function safeReason(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_REASON_PATTERN.test(value) ? value : fallback
}

function safeTime(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_TIME_PATTERN.test(value)) return null
  try {
    return new Date(value).toISOString() === value ? value : null
  } catch {
    return null
  }
}

function nowValue(now: () => string): string {
  try {
    const candidate = now()
    return safeTime(candidate) ?? '1970-01-01T00:00:00.000Z'
  } catch {
    return '1970-01-01T00:00:00.000Z'
  }
}

function assetEventTime(): string {
  try {
    return new Date().toISOString()
  } catch {
    return '1970-01-01T00:00:00.000Z'
  }
}

function assetSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function unavailableAssetResult(
  options: AssetPreflightOptions,
  reason: 'offline_loop_asset_missing' | 'offline_loop_asset_corrupt',
): AssetPreflightResult {
  options.emit({
    time: assetEventTime(),
    module: 'app',
    event: 'asset_unavailable',
    status: 'degraded',
    reason,
    source: 'runtime',
  })
  return {
    status: 'unavailable',
    reason,
    fallback: { state: 'maintenance', visible: true, nonblack: true },
  }
}

export function preflightOfflineLoopAsset(options: AssetPreflightOptions): AssetPreflightResult {
  let bytes: Uint8Array
  try {
    bytes = readFileSync(options.assetPath)
  } catch {
    return unavailableAssetResult(options, 'offline_loop_asset_missing')
  }

  if (
    bytes.byteLength !== OFFLINE_LOOP_ASSET_BYTE_LENGTH
    || assetSha256(bytes) !== OFFLINE_LOOP_ASSET_SHA256
  ) {
    return unavailableAssetResult(options, 'offline_loop_asset_corrupt')
  }

  options.emit({
    time: assetEventTime(),
    module: 'app',
    event: 'asset_ready',
    status: 'success',
    reason: 'asset_verified',
    source: 'runtime',
  })
  return { status: 'ready', reason: 'asset_verified' }
}

function noOpTelemetry(): Telemetry {
  return {
    emit: () => {},
    readPage: () => ({ events: [], nextBeforeSequence: null }),
    getStats: () => ({
      telemetryDroppedCount: 0,
      ramEvictedCount: 0,
      rejectedEventCount: 0,
      extraFieldStrippedCount: 0,
      writerFailureCount: 0,
      rotationFailureCount: 0,
      schedulerFailureCount: 0,
      ramEventCount: 0,
      queueDepth: 0,
      closed: false,
    }),
    flush: async () => {},
    close: async () => {},
  }
}

function emitMetadata(telemetry: Pick<Telemetry, 'emit'>, event: MetadataEvent): void {
  try {
    telemetry.emit(event)
  } catch {
    // Telemetry remains observational; a sink failure cannot gate the mirror.
  }
}

function failureFromCaught(
  module: ModuleId,
  caught: unknown,
  fallbackCode: string,
  fallbackReason: string,
): BootFailure {
  const code = safeCode(readProperty(caught, 'code'), fallbackCode)
  return { module, errorCode: code, reason: fallbackReason }
}

function failureFromSqlite(value: unknown): BootFailure {
  return failureFromCaught('sqlite', value, 'sqlite_open_failed', 'cause=driver_open_failed')
}

function cloneModules(value: unknown): Record<ModuleId, ModuleStatus> {
  const result = { ...DEFAULT_MODULE_STATUSES } as Record<ModuleId, ModuleStatus>
  if (!isRecord(value)) return result

  for (const module of MODULE_IDS) {
    const status = readProperty(value, module)
    if (typeof status === 'string' && MODULE_STATUSES.has(status as ModuleStatus)) {
      result[module] = status as ModuleStatus
    }
  }
  return result
}

function identityFromInput(
  input: Record<string, unknown>,
  context: Record<string, unknown>,
): IdentityStatus {
  const activeProfileId = readProperty(context, 'activeProfileId')
  if (activeProfileId === 'anonymous') return 'anonymous'
  if (typeof activeProfileId === 'string' && activeProfileId.length > 0) return 'active'

  const identityStatus = readProperty(input, 'identityStatus')
  if (typeof identityStatus === 'string' && IDENTITY_STATUSES.has(identityStatus as IdentityStatus)) {
    return identityStatus as IdentityStatus
  }
  return 'unassigned'
}

function configVersionFromInput(input: Record<string, unknown>): number | null {
  const value = readProperty(input, 'configVersion')
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null
}

function projectLastError(value: unknown): AppSnapshot['lastError'] {
  if (!isRecord(value)) return null
  const module = readProperty(value, 'module')
  const errorCode = safeCode(readProperty(value, 'error_code'), 'local_core_failed')
  const time = safeTime(readProperty(value, 'time'))
  if (typeof module !== 'string' || !MODULE_IDS.includes(module as ModuleId) || time === null) return null
  return { module: module as ModuleId, error_code: errorCode, time }
}

function projectMaintenance(value: unknown): MaintenanceInfo | null {
  if (!isRecord(value)) return null
  const code = safeCode(readProperty(value, 'code'), 'local_service_unavailable')
  return { code, detail: code }
}

function contextFromInput(input: Record<string, unknown>): Record<string, unknown> {
  const context = readProperty(input, 'context')
  return isRecord(context) ? context : input
}

export function createStartingSnapshot(metadata: {
  readonly appVersion?: string
  readonly buildCommit?: string
} = {}): AppSnapshot {
  return {
    lifecycle: 'starting',
    appVersion: typeof metadata.appVersion === 'string' ? metadata.appVersion : 'unknown',
    buildCommit: typeof metadata.buildCommit === 'string' ? metadata.buildCommit : 'unknown',
    configVersion: null,
    modules: { ...DEFAULT_MODULE_STATUSES },
    identityStatus: 'unassigned',
    realtimeSessionId: null,
    sessionGeneration: 0,
    lastError: null,
    maintenance: null,
  }
}

export function projectAppSnapshot(input: unknown): AppSnapshot {
  const record = isRecord(input) ? input : {}
  const stateValue = readProperty(record, 'lifecycle') ?? readProperty(record, 'state')
  const lifecycle = typeof stateValue === 'string' && LIFECYCLE_STATES.has(stateValue as LifecycleState)
    ? stateValue as LifecycleState
    : 'starting'
  const context = contextFromInput(record)

  const realtimeSessionId = safeIdentifier(
    readProperty(context, 'realtimeSessionId') ?? readProperty(record, 'realtimeSessionId'),
  )
  const generationValue = readProperty(context, 'sessionGeneration') ?? readProperty(record, 'sessionGeneration')
  const sessionGeneration = typeof generationValue === 'number'
    && Number.isSafeInteger(generationValue)
    && generationValue >= 0
    ? generationValue
    : 0

  const inputModules = readProperty(record, 'modules')
  const modules = cloneModules(inputModules)
  const appVersion = readProperty(record, 'appVersion')
  const buildCommit = readProperty(record, 'buildCommit')

  return {
    lifecycle,
    appVersion: typeof appVersion === 'string' ? appVersion : 'unknown',
    buildCommit: typeof buildCommit === 'string' ? buildCommit : 'unknown',
    configVersion: configVersionFromInput(record),
    modules,
    identityStatus: identityFromInput(record, context),
    realtimeSessionId,
    sessionGeneration,
    lastError: projectLastError(readProperty(record, 'lastError')),
    maintenance: projectMaintenance(readProperty(record, 'maintenance')),
  }
}

function mockOptionsForModule(): MockModuleOptions {
  return { initialStatus: 'not_implemented', outcome: 'success' }
}

function createFallbackRegistry(telemetry: Pick<Telemetry, 'emit'>): ModuleRegistry {
  return {
    getStatus: (module) => DEFAULT_MODULE_STATUSES[module],
    snapshot: () => ({ ...DEFAULT_MODULE_STATUSES }),
    probe: async (module): Promise<ModuleProbeResult> => {
      emitMetadata(telemetry, {
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

function createFallbackActor(telemetry: Pick<Telemetry, 'emit'>): LifecycleActor {
  let state: LifecycleState = 'starting'
  let context: LifecycleContext = {
    activationId: null,
    realtimeSessionId: null,
    sessionGeneration: 0,
    activeProfileId: null,
    lastInteractionAt: null,
    sceneInvocationId: null,
  }
  const listeners = new Set<(snapshot: LifecycleSnapshot) => void>()
  const transitions: Partial<Record<LifecycleState, Partial<Record<LifecycleEvent['type'], LifecycleState>>>> = {
    starting: { LOCAL_READY: 'dormant', LOCAL_CORE_FAILED: 'maintenance' },
    dormant: { WAKE_DETECTED: 'activating', LOCAL_CORE_FAILED: 'maintenance' },
    activating: { REALTIME_READY: 'active', CLOUD_FAILED: 'offlineLoop', LOCAL_CORE_FAILED: 'maintenance' },
    active: { CLOUD_FAILED: 'offlineLoop', SLEEP_REQUESTED: 'suspending', IDLE_TIMEOUT: 'suspending', LOCAL_CORE_FAILED: 'maintenance' },
    suspending: { MEDIA_CLOSED: 'dormant', LOCAL_CORE_FAILED: 'maintenance' },
    offlineLoop: { RECOVERY_PASSED: 'dormant', LOCAL_CORE_FAILED: 'maintenance' },
    maintenance: { RETRY_STARTUP: 'starting', LOCAL_CORE_FAILED: 'maintenance' },
  }

  function notify(): void {
    const snapshot = { state, context: { ...context } }
    for (const listener of listeners) {
      try {
        listener(snapshot)
      } catch {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'lifecycle_subscription_failed',
          status: 'failed',
          error_code: 'lifecycle_subscription_failed',
          reason: 'listener_failed',
          source: 'runtime',
        })
      }
    }
  }

  return {
    send(event) {
      const target = transitions[state]?.[event.type]
      if (target === undefined) return
      if (event.type === 'WAKE_DETECTED') {
        context = {
          ...context,
          activationId: event.activationId,
          lastInteractionAt: event.lastInteractionAt,
          realtimeSessionId: null,
          activeProfileId: null,
          sceneInvocationId: null,
        }
      } else if (event.type === 'REALTIME_READY') {
        context = { ...context, realtimeSessionId: event.realtimeSessionId }
      } else if (event.type === 'CLOUD_FAILED') {
        context = {
          ...context,
          realtimeSessionId: null,
          activeProfileId: null,
          sceneInvocationId: null,
          sessionGeneration: context.sessionGeneration + 1,
        }
      } else if (
        event.type === 'LOCAL_CORE_FAILED'
        || event.type === 'MEDIA_CLOSED'
      ) {
        context = { ...context, realtimeSessionId: null, activeProfileId: null, sceneInvocationId: null }
      }
      state = target
      notify()
    },
    getState: () => state,
    getContext: () => ({ ...context }),
    subscribe(callback) {
      listeners.add(callback)
      return { unsubscribe: () => listeners.delete(callback) }
    },
  }
}

function simulatorResult(op: OpStatus, lifecycleEvent?: string): SimulatorResult {
  return lifecycleEvent === undefined ? { op } : { op, lifecycleEvent }
}

function eventStatusForSimulator(command: SimulatorCommand): OpStatus {
  if (command.type === 'camera_result' && command.faces === 'multiple') return 'degraded'
  return command.type === 'scene_result' ? command.status : 'success'
}

function commandType(value: unknown): SimulatorCommand['type'] | null {
  const type = readProperty(value, 'type')
  if (
    type === 'wake'
    || type === 'cloud_failure'
    || type === 'cloud_recovery'
    || type === 'camera_result'
    || type === 'avatar_state'
    || type === 'scene_result'
    || type === 'sqlite_failure'
    || type === 'sleep'
  ) return type
  return null
}

function exactCommandKeys(value: unknown, expected: readonly string[]): boolean {
  if (!isRecord(value)) return false
  try {
    const keys = Reflect.ownKeys(value)
    return keys.length === expected.length
      && keys.every((key) => typeof key === 'string' && expected.includes(key))
      && expected.every((key) => keys.includes(key))
  } catch {
    return false
  }
}

function simulatorCommandOf(value: unknown): SimulatorCommand | null {
  const type = commandType(value)
  if (type === null) return null

  if (
    type === 'wake'
    || type === 'cloud_failure'
    || type === 'cloud_recovery'
    || type === 'sqlite_failure'
    || type === 'sleep'
  ) {
    return exactCommandKeys(value, ['type']) ? value as SimulatorCommand : null
  }

  if (type === 'camera_result') {
    const faces = readProperty(value, 'faces')
    return exactCommandKeys(value, ['type', 'faces'])
      && (faces === 0 || faces === 1 || faces === 'multiple')
      ? value as SimulatorCommand
      : null
  }

  if (type === 'avatar_state') {
    const state = readProperty(value, 'state')
    return exactCommandKeys(value, ['type', 'state'])
      && typeof state === 'string'
      && /^[a-z][a-z0-9_-]{0,31}$/.test(state)
      ? value as SimulatorCommand
      : null
  }

  const sceneId = readProperty(value, 'sceneId')
  const status = readProperty(value, 'status')
  return exactCommandKeys(value, ['type', 'sceneId', 'status'])
    && typeof sceneId === 'string'
    && /^[A-Za-z0-9._:-]{1,64}$/.test(sceneId)
    && typeof status === 'string'
    && (status === 'success' || status === 'degraded' || status === 'failed')
    ? value as SimulatorCommand
    : null
}

export function bootSequence(options: BootOptions = {}): BootRuntime {
  const appVersion = options.appVersion ?? 'unknown'
  const buildCommit = options.buildCommit ?? 'unknown'
  const isPackaged = options.isPackaged === true
  const startedAt = Date.now()
  const now = options.now ?? (() => new Date().toISOString())
  const createActivationId = options.createActivationId ?? (() => `activation-${nowValue(now)}`)
  const createRealtimeSessionId = options.createRealtimeSessionId ?? (() => `session-${nowValue(now)}`)
  let activationFailureAfterWake = options.activationFailureAfterWake === true

  let telemetry: Telemetry = noOpTelemetry()
  let actor: LifecycleActor | null = null
  let lifecycleView: BootContextView = {
    state: 'starting',
    context: {
      activationId: null,
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: null,
      sceneInvocationId: null,
    },
  }
  let modules: Record<ModuleId, ModuleStatus> = { ...DEFAULT_MODULE_STATUSES }
  let configVersion: number | null = null
  let lastError: AppSnapshot['lastError'] = null
  let maintenance: MaintenanceInfo | null = null
  let resolvedModelSettings: ModelSettingsResolution | null = null
  let configService: ConfigService | null = options.configService ?? null
  let sqliteService: SqlitePhaseTestService | null = null
  const resolveModelSettings = options.resolveModelSettings ?? defaultResolveModelSettings
  let developerMode: DeveloperModeDecision = resolveDeveloperMode(
    isPackaged,
    options.developerModeOverride,
    () => {},
  )
  const listeners = new Set<(snapshot: AppSnapshot) => void>()
  let current = createStartingSnapshot({ appVersion, buildCommit })

  function notifyListeners(): void {
    for (const listener of listeners) {
      try {
        listener(current)
      } catch {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'snapshot_subscription_failed',
          status: 'failed',
          error_code: 'snapshot_subscription_failed',
          reason: 'listener_failed',
          source: 'runtime',
        })
      }
    }
  }

  function refreshSnapshot(): void {
    current = projectAppSnapshot({
      state: lifecycleView.state,
      context: lifecycleView.context,
      appVersion,
      buildCommit,
      configVersion,
      modules,
      lastError,
      maintenance,
    })
  }

  function attachActor(nextActor: LifecycleActor): void {
    actor = nextActor
    try {
      lifecycleView = { state: actor.getState(), context: actor.getContext() }
    } catch {
      lifecycleView = { state: 'starting', context: lifecycleView.context }
    }
    actor.subscribe((snapshot) => {
      lifecycleView = { state: snapshot.state, context: { ...snapshot.context } }
      refreshSnapshot()
      notifyListeners()
    })
    refreshSnapshot()
  }

  function rememberFailure(failure: BootFailure, failures: BootFailure[]): void {
    failures.push(failure)
    emitMetadata(telemetry, {
      module: failure.module,
      event: 'local_core_failed',
      status: 'failed',
      error_code: failure.errorCode,
      reason: failure.reason,
      source: 'runtime',
    })
    if (lastError === null) {
      lastError = {
        module: failure.module,
        error_code: failure.errorCode,
        time: nowValue(now),
      }
      maintenance = { code: failure.errorCode, detail: failure.reason }
    }
  }

  function sendLifecycle(event: LifecycleEvent): boolean {
    if (actor === null) return false
    try {
      actor.send(event)
      try {
        lifecycleView = { state: actor.getState(), context: actor.getContext() }
      } catch {
        // The actor already emitted its own stable transition; keep the last view.
      }
      refreshSnapshot()
      return true
    } catch {
      emitMetadata(telemetry, {
        module: 'app',
        event: 'lifecycle_send_failed',
        status: 'failed',
        error_code: 'lifecycle_send_failed',
        reason: `event=${event.type};cause=send_failed`,
        source: 'runtime',
      })
      return false
    }
  }

  const ready = (async () => {
    const failures: BootFailure[] = []
    let configSlots: ConfigSlots | undefined

    try {
      const factory = options.createTelemetry ?? (() => defaultCreateTelemetry({
        directory: options.telemetryDirectory ?? join(process.cwd(), 'telemetry'),
      }))
      const createdTelemetry = factory()
      if (isRecord(createdTelemetry) && typeof readProperty(createdTelemetry, 'then') === 'function') {
        telemetry = await createdTelemetry
      } else {
        telemetry = createdTelemetry as Telemetry
      }
    } catch (caught) {
      telemetry = noOpTelemetry()
      rememberFailure(
        failureFromCaught('telemetry', caught, 'telemetry_create_failed', 'cause=create_failed'),
        failures,
      )
    }

    developerMode = resolveDeveloperMode(
      isPackaged,
      options.developerModeOverride,
      (event) => emitMetadata(telemetry, event),
    )

    const createdConfigService: ConfigService | null = options.configService ?? (() => {
      try {
        return defaultCreateConfigService({
          configDir: options.configDir ?? join(process.cwd(), 'config'),
          defaultConfigPath: options.defaultConfigPath ?? join(process.cwd(), 'config', 'default.json'),
          events: telemetry,
        })
      } catch {
        return null
      }
    })()
    configService = createdConfigService
    const configInitializer: Pick<ConfigService, 'initialize'> = createdConfigService ?? {
      initialize: async () => {
        throw new Error('config_service_create_failed')
      },
    }

    try {
      configSlots = await configInitializer.initialize()
      const activeVersion = readProperty(readProperty(configSlots, 'active'), 'configVersion')
      if (typeof activeVersion === 'number' && Number.isSafeInteger(activeVersion) && activeVersion >= 1) {
        configVersion = activeVersion
      }
    } catch (caught) {
      rememberFailure(
        failureFromCaught('config', caught, 'config_read_failed', 'operation=initialize;cause=read_failed'),
        failures,
      )
    }

    try {
      resolvedModelSettings = await Promise.resolve(resolveModelSettings(configSlots ?? ({} as ConfigSlots)))
      const activeVersion = resolvedModelSettings.active.configVersion
      if (Number.isSafeInteger(activeVersion) && activeVersion >= 1) configVersion = activeVersion
    } catch (caught) {
      rememberFailure(
        failureFromCaught('config', caught, 'model_settings_invalid_config', 'operation=resolve;cause=invalid_config'),
        failures,
      )
    }

    const openSqlite = options.openSqlite ?? (() => defaultOpenSqlite({
      dbPath: options.sqlitePath ?? join(process.cwd(), 'mirror.sqlite'),
      telemetry,
    }))
    try {
      const opened = await Promise.resolve(openSqlite())
      if (isRecord(opened) && readProperty(opened, 'ok') === false) {
        const failure = failureFromSqlite(readProperty(opened, 'error'))
        rememberFailure(failure, failures)
      } else if (isRecord(opened) && readProperty(opened, 'ok') === true) {
        const value = readProperty(opened, 'value')
        if (isRecord(value)) sqliteService = value as unknown as SqlitePhaseTestService
        else rememberFailure(
          { module: 'sqlite', errorCode: 'sqlite_open_failed', reason: 'cause=invalid_result' },
          failures,
        )
      } else if (isRecord(opened)) {
        sqliteService = opened as unknown as SqlitePhaseTestService
      } else {
        rememberFailure(
          { module: 'sqlite', errorCode: 'sqlite_open_failed', reason: 'cause=invalid_result' },
          failures,
        )
      }
    } catch (caught) {
      rememberFailure(failureFromSqlite(caught), failures)
    }

    let mockFactory: ModuleMockFactory | null = null
    try {
      const createMockModuleFactory = options.createMockModuleFactory ?? defaultCreateMockModuleFactory
      mockFactory = createMockModuleFactory()
    } catch (caught) {
      rememberFailure(
        failureFromCaught('app', caught, 'module_mock_factory_failed', 'cause=create_failed'),
        failures,
      )
    }

    let registry: ModuleRegistry
    try {
      const adapters = [] as Array<ReturnType<ModuleMockFactory['create']>>
      if (mockFactory !== null) {
        for (const module of PROBED_MODULES) {
          try {
            adapters.push(mockFactory.create(module, mockOptionsForModule()))
          } catch (caught) {
            rememberFailure(
              failureFromCaught('app', caught, 'module_adapter_create_failed', 'cause=create_failed'),
              failures,
            )
          }
        }
      }
      const createModuleRegistry = options.createModuleRegistry ?? defaultCreateModuleRegistry
      registry = createModuleRegistry({
        events: telemetry as ModuleEventSink,
        source: 'runtime',
        adapters,
      })
    } catch (caught) {
      rememberFailure(
        failureFromCaught('app', caught, 'module_registry_create_failed', 'cause=create_failed'),
        failures,
      )
      registry = createFallbackRegistry(telemetry)
    }

    const probedStatuses: Partial<Record<ModuleId, ModuleStatus>> = {}
    for (const module of PROBED_MODULES) {
      try {
        const result = await registry.probe(module)
        const status = readProperty(result, 'status')
        if (typeof status === 'string' && MODULE_STATUSES.has(status as ModuleStatus)) {
          probedStatuses[module] = status as ModuleStatus
        }
      } catch (caught) {
        const failure = failureFromCaught('app', caught, 'module_probe_failed', `module=${module};cause=probe_failed`)
        emitMetadata(telemetry, {
          module,
          event: 'module_probe',
          status: 'failed',
          error_code: failure.errorCode,
          reason: failure.reason,
          source: 'runtime',
        })
      }
    }

    if (options.offlineLoopAssetPath !== undefined) {
      const assetResult = preflightOfflineLoopAsset({
        assetPath: options.offlineLoopAssetPath,
        emit: (event) => emitMetadata(telemetry, {
          module: event.module,
          event: event.event,
          status: event.status,
          reason: event.reason,
          source: event.source,
        }),
      })
      if (assetResult.status === 'unavailable') {
        failures.push({
          module: 'app',
          errorCode: assetResult.reason,
          reason: assetResult.reason,
        })
      }
    }

    try {
      modules = cloneModules(registry.snapshot())
    } catch {
      modules = { ...DEFAULT_MODULE_STATUSES }
    }
    for (const module of PROBED_MODULES) {
      const status = probedStatuses[module]
      if (status !== undefined) modules[module] = status
    }
    modules.telemetry = 'ready'
    modules.config = failures.some((failure) => failure.module === 'config') ? 'failed' : 'ready'
    modules.sqlite = sqliteService === null ? 'failed' : 'ready'
    refreshSnapshot()

    let createdActor: LifecycleActor | null = null
    try {
      const createLifecycleActor = options.createLifecycleActor ?? defaultCreateLifecycleActor
      createdActor = createLifecycleActor({ telemetry })
    } catch (caught) {
      rememberFailure(
        failureFromCaught('app', caught, 'lifecycle_create_failed', 'cause=create_failed'),
        failures,
      )
      try {
        createdActor = defaultCreateLifecycleActor({ telemetry })
      } catch {
        createdActor = createFallbackActor(telemetry)
      }
    }
    attachActor(createdActor)

    const firstFailure = failures[0]
    if (firstFailure === undefined) {
      sendLifecycle({ type: 'LOCAL_READY' })
    } else {
      maintenance = { code: firstFailure.errorCode, detail: firstFailure.reason }
      lastError = {
        module: firstFailure.module,
        error_code: firstFailure.errorCode,
        time: nowValue(now),
      }
      sendLifecycle({ type: 'LOCAL_CORE_FAILED', errorCode: firstFailure.errorCode })
    }
    refreshSnapshot()
    notifyListeners()
  })().catch(() => {
    // The bounded boot promise never rejects into the renderer. The actor path above
    // maps expected failures; this final guard retains a visible local failure state.
    const failure: BootFailure = {
      module: 'app',
      errorCode: 'boot_sequence_failed',
      reason: 'cause=unexpected_boot_failure',
    }
    if (lastError === null) {
      lastError = { module: failure.module, error_code: failure.errorCode, time: nowValue(now) }
      maintenance = { code: failure.errorCode, detail: failure.reason }
    }
    if (actor !== null) sendLifecycle({ type: 'LOCAL_CORE_FAILED', errorCode: failure.errorCode })
    else {
      lifecycleView = { state: 'maintenance', context: lifecycleView.context }
      refreshSnapshot()
      notifyListeners()
    }
  })

  const phaseTestsReader: PhaseTestRecordReader = {
    read() {
      const service = sqliteService
      if (service === null) return []
      try {
        const result = service.readPhaseTestRecords('0')
        if (result.ok) return result.value
      } catch {
        // The Console phase-test controller maps this stable reader failure to metadata.
      }
      throw new Error('sqlite_phase_record_read_failed')
    },
  }

  function appendPhaseTestRecord(record: unknown): Result<void, SqliteFailure> {
    const service = sqliteService
    if (service === null) {
      return {
        ok: false,
        error: {
          code: 'sqlite_phase_record_write_failed',
          reason: 'transaction_failed',
        },
      }
    }
    try {
      return service.appendPhaseTestRecord(record)
    } catch {
      return {
        ok: false,
        error: {
          code: 'sqlite_phase_record_write_failed',
          reason: 'transaction_failed',
        },
      }
    }
  }

  let shutdownPromise: Promise<void> | null = null
  async function shutdown(): Promise<void> {
    if (shutdownPromise !== null) return shutdownPromise

    shutdownPromise = (async () => {
      try {
        await ready
      } catch {
        // The bounded boot promise already maps failures to a visible state.
      }

      try {
        await telemetry.flush()
      } catch {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'telemetry_flush_failed',
          status: 'failed',
          error_code: 'telemetry_flush_failed',
          reason: 'cause=flush_failed',
          source: 'runtime',
        })
      }

      try {
        await telemetry.close()
      } catch {
        // Telemetry is supplementary; close failure cannot gate SQLite cleanup.
      }

      try {
        sqliteService?.close()
      } catch {
        // SQLite close failures are represented by its stable service result/event.
      }
    })()
    return shutdownPromise
  }

  async function handleSimulator(command: unknown): Promise<SimulatorResult> {
    await ready
    const typedCommand = simulatorCommandOf(command)
    const type = typedCommand?.type ?? null
    if (typedCommand === null || type === null) {
      emitMetadata(telemetry, {
        module: 'app',
        event: 'simulator_command_ignored',
        status: 'info',
        reason: 'command=unknown;cause=invalid_command',
        source: 'simulator',
      })
      return simulatorResult('failed')
    }

    const currentState = actor?.getState() ?? lifecycleView.state
    if (type === 'wake') {
      if (currentState !== 'dormant') {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'simulator_command_ignored',
          status: 'info',
          reason: `state=${currentState};command=wake;cause=not_dormant`,
          source: 'simulator',
        })
        return simulatorResult('degraded')
      }
      const activationId = createActivationId()
      const lastInteractionAt = nowValue(now)
      if (!sendLifecycle({ type: 'WAKE_DETECTED', activationId, lastInteractionAt })) {
        return simulatorResult('failed')
      }
      if (activationFailureAfterWake) {
        activationFailureAfterWake = false
        if (!sendLifecycle({ type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' })) {
          return simulatorResult('failed')
        }
        lastError = {
          module: 'openai',
          error_code: 'cloud_unavailable',
          time: nowValue(now),
        }
        refreshSnapshot()
        return simulatorResult('degraded', 'CLOUD_FAILED')
      }
      const realtimeSessionId = createRealtimeSessionId()
      if (!sendLifecycle({ type: 'REALTIME_READY', realtimeSessionId })) {
        return simulatorResult('failed')
      }
      lastError = null
      maintenance = null
      refreshSnapshot()
      return simulatorResult('success', 'REALTIME_READY')
    }

    if (type === 'cloud_failure') {
      const accepted = currentState === 'activating' || currentState === 'active'
      if (!accepted || !sendLifecycle({ type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' })) {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'simulator_command_ignored',
          status: 'info',
          reason: `state=${currentState};command=cloud_failure;cause=not_active`,
          source: 'simulator',
        })
        return simulatorResult('degraded')
      }
      lastError = {
        module: 'openai',
        error_code: 'cloud_unavailable',
        time: nowValue(now),
      }
      refreshSnapshot()
      return simulatorResult('success', 'CLOUD_FAILED')
    }

    if (type === 'cloud_recovery') {
      if (currentState !== 'offlineLoop' || !sendLifecycle({ type: 'RECOVERY_PASSED' })) {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'simulator_command_ignored',
          status: 'info',
          reason: `state=${currentState};command=cloud_recovery;cause=not_offline_loop`,
          source: 'simulator',
        })
        return simulatorResult('degraded')
      }
      lastError = null
      maintenance = null
      refreshSnapshot()
      return simulatorResult('success', 'RECOVERY_PASSED')
    }

    if (type === 'sqlite_failure') {
      lastError = { module: 'sqlite', error_code: 'sqlite_open_failed', time: nowValue(now) }
      maintenance = { code: 'sqlite_open_failed', detail: 'cause=simulator_failure' }
      if (!sendLifecycle({ type: 'LOCAL_CORE_FAILED', errorCode: 'sqlite_open_failed' })) {
        return simulatorResult('failed')
      }
      refreshSnapshot()
      return simulatorResult('failed', 'LOCAL_CORE_FAILED')
    }

    if (type === 'sleep') {
      if (currentState !== 'active' || !sendLifecycle({ type: 'SLEEP_REQUESTED' })) {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'simulator_command_ignored',
          status: 'info',
          reason: `state=${currentState};command=sleep;cause=not_active`,
          source: 'simulator',
        })
        return simulatorResult('degraded')
      }
      if (options.completeSleepForDemo === true) {
        sendLifecycle({ type: 'MEDIA_CLOSED' })
      }
      return simulatorResult('success', 'SLEEP_REQUESTED')
    }

    const typed = typedCommand
    const status = eventStatusForSimulator(typed)
    if (typed.type === 'camera_result') {
      emitMetadata(telemetry, {
        module: 'camera',
        event: 'simulator_result',
        status,
        reason: `faces=${typed.faces};cause=simulator_result`,
        source: 'simulator',
      })
    } else if (typed.type === 'avatar_state') {
      emitMetadata(telemetry, {
        module: 'avatar',
        event: 'simulator_result',
        status,
        reason: `state=${safeReason(typed.state, 'invalid_state')};cause=simulator_result`,
        source: 'simulator',
      })
    } else if (typed.type === 'scene_result') {
      const sceneId = safeIdentifier(typed.sceneId) ?? 'scene_invalid'
      emitMetadata(telemetry, {
        module: 'app',
        event: 'simulator_result',
        status,
        scene_id: sceneId,
        reason: `status=${typed.status};cause=simulator_result`,
        source: 'simulator',
      })
    }
    return simulatorResult(status)
  }

  async function refreshConfig(): Promise<ConsoleConfigRefreshResult> {
    const refreshFailure = (): ConsoleConfigRefreshResult => {
      resolvedModelSettings = null
      configVersion = null
      refreshSnapshot()
      notifyListeners()
      return { ok: false, error: 'console_config_refresh_failed', reason: 'cause=refresh_failed' }
    }
    const service = configService
    if (service === null) {
      return refreshFailure()
    }
    try {
      const slots = await service.read()
      const resolution = await Promise.resolve(resolveModelSettings(slots))
      const activeVersion = resolution.active.configVersion
      if (!Number.isSafeInteger(activeVersion) || activeVersion < 1) {
        return refreshFailure()
      }
      configVersion = activeVersion
      resolvedModelSettings = resolution
      refreshSnapshot()
      notifyListeners()
      return { ok: true, configVersion: activeVersion, resolution }
    } catch {
      return refreshFailure()
    }
  }

  const consoleConfigController = createConsoleConfigController({
    getConfigService: () => configService,
    getModelSettings: () => resolvedModelSettings,
    refreshConfig,
    getDeveloperMode: () => developerMode.enabled,
    emit: (event) => emitMetadata(telemetry, event),
    now: () => nowValue(now),
    mockDraftProbe: options.mockDraftProbe,
  })

  const consoleDataPlane = createConsoleDataPlane({
    getSnapshot: () => projectAppSnapshot(current),
    getTelemetry: () => ({
      readPage: (request) => telemetry.readPage(request),
      emit: (event) => emitMetadata(telemetry, event),
    }),
    getDeveloperMode: () => developerMode,
    getStartedAt: () => startedAt,
    handleSimulator,
    getConfigController: () => consoleConfigController,
    getPhaseTestsReader: () => phaseTestsReader,
  })

  const runtime: BootRuntime = {
    ready,
    console: consoleDataPlane,
    shutdown,
    telemetry: {
      emit: (event) => emitMetadata(telemetry, event),
    },
    appendPhaseTestRecord,
    createInitialRuntimeSnapshotsForTest: () => consoleDataPlane.createInitialRuntimeSnapshotsForTest(),
    snapshot: () => projectAppSnapshot(current),
    subscribe(listener) {
      listeners.add(listener)
      try {
        listener(current)
      } catch {
        emitMetadata(telemetry, {
          module: 'app',
          event: 'snapshot_subscription_failed',
          status: 'failed',
          error_code: 'snapshot_subscription_failed',
          reason: 'listener_failed',
          source: 'runtime',
        })
      }
      return {
        unsubscribe: () => listeners.delete(listener),
      }
    },
    handleSimulator,
  }

  return runtime
}
