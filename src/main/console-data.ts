import type {
  ConsoleEventSummary,
  ConsoleConfigPayload,
  ConsoleEventsPage,
  ConsoleEventsQuery,
  ConsoleModuleObservation,
  ConsoleModelsPayload,
  ConsoleOverviewPayload,
  ConsolePhaseTestsPayload,
  ConsoleReason,
  ConsoleResponse,
  ConsoleDraftTestResult,
  ConsoleRuntimeSnapshotResult,
  DeveloperModeDecision,
} from '../shared/console-types'
import type { ConsoleConfigController } from './console-config'
import type {
  AppSnapshot,
  IdentityStatus,
  LifecycleState,
  MirrorEvent,
  ModuleId,
  ModuleStatus,
  SimulatorResult,
} from '../shared/types'
import { MODULE_IDS } from './module-registry'
import type { Telemetry } from './telemetry'
import {
  createConsolePhaseTests,
  type ConsolePhaseTestsController,
} from './console-phase-tests'
import type { PhaseTestRecordReader } from '../shared/console-types'

const MAX_PAGE_SIZE = 200
const MAX_UPTIME_SECONDS = 2_147_483_647
const MAX_SESSION_GENERATION = 2_147_483_647
const MAX_DISPLAY_STRING_LENGTH = 128
const MAX_REASON_LENGTH = 1024
const MAX_DURATION_MS = 86_400_000

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
const EVENT_STATUSES: ReadonlySet<MirrorEvent['status']> = new Set([
  'success',
  'degraded',
  'failed',
  'info',
])
const EVENT_SOURCES: ReadonlySet<NonNullable<MirrorEvent['source']>> = new Set([
  'runtime',
  'simulator',
  'contract_test',
])
const MODULE_ID_SET: ReadonlySet<ModuleId> = new Set(MODULE_IDS)

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const REASON_PATTERN = /^[A-Za-z0-9_=;.%:+,/?-]+$/
const DISPLAY_STRING_PATTERN = /^[A-Za-z0-9._:+/-]+$/
const CANONICAL_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const EVENT_QUERY_KEYS = ['limit', 'beforeSequence', 'module', 'status', 'source'] as const

export interface ConsoleBaseDataPlane {
  getOverview(): ConsoleResponse<ConsoleOverviewPayload>
  getEvents(request: unknown): ConsoleResponse<ConsoleEventsPage>
  simulate(command: unknown): Promise<SimulatorResult>
}

export interface ConsoleDataPlane extends ConsoleBaseDataPlane {
  getConfig(): Promise<ConsoleResponse<ConsoleConfigPayload>>
  getModels(): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveModelDraft(input: unknown): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveDraft(input: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  testDraft(): Promise<ConsoleResponse<ConsoleDraftTestResult>>
  publish(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  rollback(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  createNextRuntimeSnapshots(): Promise<ConsoleResponse<ConsoleRuntimeSnapshotResult>>
  getPhaseTests(): Promise<ConsoleResponse<ConsolePhaseTestsPayload>>
}

interface ConsoleDataPlaneDependencies {
  readonly getSnapshot: () => AppSnapshot
  readonly getTelemetry: () => Pick<Telemetry, 'readPage' | 'emit'>
  readonly getDeveloperMode: () => DeveloperModeDecision
  readonly getStartedAt: () => number
  readonly handleSimulator: (command: unknown) => Promise<SimulatorResult>
  readonly getConfigController?: () => ConsoleConfigController | null
  readonly getPhaseTestsController?: () => ConsolePhaseTestsController | null
  readonly getPhaseTestsReader?: () => PhaseTestRecordReader
}

type QueryValidation =
  | { readonly ok: true; readonly value: ConsoleEventsQuery | undefined }
  | { readonly ok: false; readonly reason: ConsoleReason }

function isRecord(value: unknown): value is Record<string, unknown> {
  try {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  } catch {
    return false
  }
}

function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function hasOwnProperty(value: object, key: string): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(value, key)
  } catch {
    return false
  }
}

function readOwnKeys(value: object): readonly (string | symbol)[] | null {
  try {
    return Reflect.ownKeys(value)
  } catch {
    return null
  }
}

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && MODULE_ID_SET.has(value as ModuleId)
}

function isStatus(value: unknown): value is MirrorEvent['status'] {
  return typeof value === 'string' && EVENT_STATUSES.has(value as MirrorEvent['status'])
}

function isSource(value: unknown): value is NonNullable<MirrorEvent['source']> {
  return typeof value === 'string' && EVENT_SOURCES.has(value as NonNullable<MirrorEvent['source']>)
}

function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_TIME_PATTERN.test(value)) return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function boundedDisplayString(value: unknown, fallback: string): string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_DISPLAY_STRING_LENGTH
    && DISPLAY_STRING_PATTERN.test(value)
    ? value
    : fallback
}

function boundedIdentifier(value: unknown): string | null {
  return typeof value === 'string' && SAFE_IDENTIFIER_PATTERN.test(value) ? value : null
}

function emitSafely(
  getTelemetry: ConsoleDataPlaneDependencies['getTelemetry'],
  event: Omit<MirrorEvent, 'time'>,
): void {
  try {
    const telemetry = getTelemetry()
    telemetry.emit(event)
  } catch {
    // Console diagnostics remain observational and cannot gate the runtime.
  }
}

function unavailable<T>(
  getTelemetry: ConsoleDataPlaneDependencies['getTelemetry'],
  event: string,
): ConsoleResponse<T> {
  emitSafely(getTelemetry, {
    module: 'app',
    event,
    status: 'failed',
    error_code: 'console_not_ready',
    reason: 'cause=console_data_plane_unavailable',
    source: 'runtime',
  })
  return {
    ok: false,
    error: 'console_not_ready',
    reason: 'cause=console_data_plane_unavailable',
  }
}

function invalidQuery<T>(
  getTelemetry: ConsoleDataPlaneDependencies['getTelemetry'],
  reason: ConsoleReason,
): ConsoleResponse<T> {
  emitSafely(getTelemetry, {
    module: 'app',
    event: 'console_events_query_invalid',
    status: 'failed',
    error_code: 'console_events_query_invalid',
    reason,
    source: 'runtime',
  })
  return {
    ok: false,
    error: 'console_events_query_invalid',
    reason,
  }
}

function validateEventsQuery(request: unknown): QueryValidation {
  if (request === undefined) return { ok: true, value: undefined }
  if (!isRecord(request)) return { ok: false, reason: 'cause=payload_schema_invalid' }

  const keys = readOwnKeys(request)
  if (keys === null || keys.some((key) => (
    typeof key !== 'string' || !(EVENT_QUERY_KEYS as readonly string[]).includes(key)
  ))) {
    return { ok: false, reason: 'cause=payload_schema_invalid' }
  }

  for (const key of EVENT_QUERY_KEYS) {
    const own = hasOwnProperty(request, key)
    const value = readProperty(request, key)
    if (!own) {
      if (value !== undefined) return { ok: false, reason: 'cause=payload_schema_invalid' }
      continue
    }
    if (value === undefined) return { ok: false, reason: 'cause=payload_schema_invalid' }

    if (key === 'limit') {
      if (typeof value !== 'number') return { ok: false, reason: 'cause=payload_schema_invalid' }
      if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
        return { ok: false, reason: 'cause=query_bounds_invalid' }
      }
      continue
    }

    if (key === 'beforeSequence') {
      if (typeof value !== 'number') return { ok: false, reason: 'cause=payload_schema_invalid' }
      if (!Number.isSafeInteger(value) || value < 0) {
        return { ok: false, reason: 'cause=query_bounds_invalid' }
      }
      continue
    }

    if (key === 'module' && !isModuleId(value)) {
      return { ok: false, reason: 'cause=payload_schema_invalid' }
    }
    if (key === 'status' && !isStatus(value)) {
      return { ok: false, reason: 'cause=payload_schema_invalid' }
    }
    if (key === 'source' && !isSource(value)) {
      return { ok: false, reason: 'cause=payload_schema_invalid' }
    }
  }

  return { ok: true, value: request as ConsoleEventsQuery }
}

function projectEvent(value: unknown): ConsoleEventSummary | null {
  if (!isRecord(value)) return null

  const time = readProperty(value, 'time')
  const module = readProperty(value, 'module')
  const event = readProperty(value, 'event')
  const status = readProperty(value, 'status')
  if (
    !isCanonicalTime(time)
    || !isModuleId(module)
    || typeof event !== 'string'
    || !EVENT_NAME_PATTERN.test(event)
    || !isStatus(status)
  ) {
    return null
  }

  const summary = { time, module, event, status } as {
    time: string
    module: ModuleId
    event: string
    status: MirrorEvent['status']
    duration_ms?: number
    error_code?: string
    session_id?: string
    scene_id?: string
    reason?: string
    source?: NonNullable<MirrorEvent['source']>
  }

  const duration = readProperty(value, 'duration_ms')
  if (
    duration !== undefined
    && typeof duration === 'number'
    && Number.isFinite(duration)
    && duration >= 0
    && duration <= MAX_DURATION_MS
  ) {
    summary.duration_ms = duration
  }

  const errorCode = readProperty(value, 'error_code')
  if (errorCode !== undefined && typeof errorCode === 'string' && ERROR_CODE_PATTERN.test(errorCode)) {
    summary.error_code = errorCode
  }

  const sessionId = boundedIdentifier(readProperty(value, 'session_id'))
  if (sessionId !== null) summary.session_id = sessionId

  const sceneId = boundedIdentifier(readProperty(value, 'scene_id'))
  if (sceneId !== null) summary.scene_id = sceneId

  const reason = readProperty(value, 'reason')
  if (
    reason !== undefined
    && typeof reason === 'string'
    && reason.length > 0
    && reason.length <= MAX_REASON_LENGTH
    && !reason.includes('__')
    && REASON_PATTERN.test(reason)
  ) {
    summary.reason = reason
  }

  const source = readProperty(value, 'source')
  if (source !== undefined && isSource(source)) summary.source = source

  return summary
}

function newerEvent(
  current: ConsoleEventSummary | null,
  candidate: ConsoleEventSummary,
): ConsoleEventSummary {
  if (current === null || candidate.time > current.time) return candidate
  return current
}

function projectModuleObservations(
  snapshot: unknown,
  events: readonly ConsoleEventSummary[],
): Readonly<Record<ModuleId, ConsoleModuleObservation>> {
  const inputModules = readProperty(snapshot, 'modules')
  const modules = {} as Record<ModuleId, ConsoleModuleObservation>

  for (const module of MODULE_IDS) {
    const inputStatus = readProperty(inputModules, module)
    const status = typeof inputStatus === 'string' && MODULE_STATUSES.has(inputStatus as ModuleStatus)
      ? inputStatus as ModuleStatus
      : 'not_implemented'
    let lastSuccess: ConsoleEventSummary | null = null
    let lastError: ConsoleEventSummary | null = null
    let lastFallback: ConsoleEventSummary | null = null

    for (const event of events) {
      if (event.module !== module) continue
      if (event.status === 'success') lastSuccess = newerEvent(lastSuccess, event)
      if (event.status === 'failed') lastError = newerEvent(lastError, event)
      if (event.status === 'degraded' || event.event.includes('fallback')) {
        lastFallback = newerEvent(lastFallback, event)
      }
    }

    modules[module] = {
      status,
      readiness: 'mock',
      lastSuccess,
      lastError,
      lastFallback,
    }
  }

  return modules
}

function projectEventsPage(value: unknown): ConsoleEventsPage | null {
  try {
    if (!isRecord(value)) return null
    const rawEvents = readProperty(value, 'events')
    if (!Array.isArray(rawEvents)) return null

    const events: ConsoleEventSummary[] = []
    for (const rawEvent of rawEvents) {
      const event = projectEvent(rawEvent)
      if (event !== null) events.push(event)
    }

    const nextBeforeSequence = readProperty(value, 'nextBeforeSequence')
    if (nextBeforeSequence !== null
      && nextBeforeSequence !== undefined
      && (typeof nextBeforeSequence !== 'number'
        || !Number.isSafeInteger(nextBeforeSequence)
        || nextBeforeSequence < 0)) {
      return { events, nextBeforeSequence: null }
    }

    return {
      events,
      nextBeforeSequence: nextBeforeSequence === undefined ? null : nextBeforeSequence as number | null,
    }
  } catch {
    return null
  }
}

function overviewUptime(getStartedAt: ConsoleDataPlaneDependencies['getStartedAt']): number {
  try {
    const startedAt = getStartedAt()
    const elapsed = Date.now() - startedAt
    if (!Number.isFinite(elapsed) || elapsed <= 0) return 0
    return Math.min(MAX_UPTIME_SECONDS, Math.floor(elapsed / 1000))
  } catch {
    return 0
  }
}

function developerModeView(
  getDeveloperMode: ConsoleDataPlaneDependencies['getDeveloperMode'],
): DeveloperModeDecision {
  try {
    const decision = getDeveloperMode()
    return {
      enabled: decision.enabled === true,
      source: decision.source === 'startup_override' ? 'startup_override' : 'packaging_default',
    }
  } catch {
    return { enabled: false, source: 'packaging_default' }
  }
}

export function resolveDeveloperMode(
  isPackaged: boolean,
  override: unknown,
  emit: (event: Omit<MirrorEvent, 'time'>) => void,
): DeveloperModeDecision {
  const packagingDefault: DeveloperModeDecision = {
    enabled: isPackaged !== true,
    source: 'packaging_default',
  }

  if (override === undefined) return packagingDefault
  if (override === 'enabled') return { enabled: true, source: 'startup_override' }
  if (override === 'disabled') return { enabled: false, source: 'startup_override' }

  try {
    emit({
      module: 'app',
      event: 'developer_mode_override_invalid',
      status: 'failed',
      error_code: 'developer_mode_override_invalid',
      reason: 'cause=payload_schema_invalid',
      source: 'runtime',
    })
  } catch {
    // An observational telemetry failure cannot change the packaging default.
  }
  return packagingDefault
}

export function createConsoleDataPlane(
  dependencies: ConsoleDataPlaneDependencies,
): ConsoleDataPlane {
  const phaseTestsController = (() => {
    try {
      const injectedController = dependencies.getPhaseTestsController?.() ?? null
      if (injectedController !== null && typeof injectedController.get === 'function') {
        return injectedController
      }
    } catch {
      // A missing optional controller falls back to the honest empty reader.
    }

    let reader: PhaseTestRecordReader = { read: () => [] }
    try {
      const injectedReader = dependencies.getPhaseTestsReader?.()
      if (injectedReader !== undefined && injectedReader !== null) reader = injectedReader
    } catch {
      // A missing optional reader falls back to the honest empty reader.
    }

    return createConsolePhaseTests({
      reader,
      getBuildCommit: () => {
        try {
          const buildCommit = readProperty(dependencies.getSnapshot(), 'buildCommit')
          return typeof buildCommit === 'string' ? buildCommit : 'unknown'
        } catch {
          return 'unknown'
        }
      },
      emit: (event) => emitSafely(dependencies.getTelemetry, event),
    })
  })()

  function getOverview(): ConsoleResponse<ConsoleOverviewPayload> {
    let snapshot: unknown
    let page: unknown
    try {
      snapshot = dependencies.getSnapshot()
      const telemetry = dependencies.getTelemetry()
      page = telemetry.readPage({ limit: MAX_PAGE_SIZE })
    } catch {
      return unavailable(dependencies.getTelemetry, 'console_overview_read_failed')
    }

    const projectedPage = projectEventsPage(page)
    if (projectedPage === null) {
      return unavailable(dependencies.getTelemetry, 'console_overview_read_failed')
    }

    const lifecycle = readProperty(snapshot, 'lifecycle')
    const identityStatus = readProperty(snapshot, 'identityStatus')
    const realtimeSessionId = boundedIdentifier(readProperty(snapshot, 'realtimeSessionId'))
    const sessionGeneration = readProperty(snapshot, 'sessionGeneration')
    const configVersion = readProperty(snapshot, 'configVersion')
    const decision = developerModeView(dependencies.getDeveloperMode)

    return {
      ok: true,
      value: {
        lifecycle: LIFECYCLE_STATES.has(lifecycle as LifecycleState) ? lifecycle as LifecycleState : 'starting',
        appVersion: boundedDisplayString(readProperty(snapshot, 'appVersion'), 'unknown'),
        buildCommit: boundedDisplayString(readProperty(snapshot, 'buildCommit'), 'unknown'),
        configVersion: typeof configVersion === 'number'
          && Number.isSafeInteger(configVersion)
          && configVersion >= 1
          ? configVersion
          : null,
        identityStatus: IDENTITY_STATUSES.has(identityStatus as IdentityStatus)
          ? identityStatus as IdentityStatus
          : 'unassigned',
        realtimeSessionId,
        sessionGeneration: typeof sessionGeneration === 'number'
          && Number.isSafeInteger(sessionGeneration)
          && sessionGeneration >= 0
          ? Math.min(MAX_SESSION_GENERATION, sessionGeneration)
          : 0,
        uptimeSeconds: overviewUptime(dependencies.getStartedAt),
        developerMode: decision.enabled,
        developerModeSource: decision.source,
        modules: projectModuleObservations(snapshot, projectedPage.events),
        audioTcc: 'not_checked',
        cameraTcc: 'not_checked',
      },
    }
  }

  function getEvents(request: unknown): ConsoleResponse<ConsoleEventsPage> {
    const validation = validateEventsQuery(request)
    if (!validation.ok) return invalidQuery(dependencies.getTelemetry, validation.reason)

    let page: unknown
    try {
      const telemetry = dependencies.getTelemetry()
      page = telemetry.readPage(validation.value)
    } catch {
      return unavailable(dependencies.getTelemetry, 'console_events_read_failed')
    }

    const projectedPage = projectEventsPage(page)
    if (projectedPage === null) {
      return unavailable(dependencies.getTelemetry, 'console_events_read_failed')
    }
    return { ok: true, value: projectedPage }
  }

  async function simulate(command: unknown): Promise<SimulatorResult> {
    const decision = developerModeView(dependencies.getDeveloperMode)
    if (!decision.enabled) {
      emitSafely(dependencies.getTelemetry, {
        module: 'app',
        event: 'simulator_command_ignored',
        status: 'info',
        reason: 'cause=developer_mode_disabled',
        source: 'simulator',
      })
      return { op: 'degraded' }
    }
    return dependencies.handleSimulator(command)
  }

  async function invokeConfig<T>(
    operation: (controller: ConsoleConfigController) => Promise<ConsoleResponse<T>>,
  ): Promise<ConsoleResponse<T>> {
    let controller: ConsoleConfigController | null = null
    try {
      controller = dependencies.getConfigController?.() ?? null
    } catch {
      controller = null
    }
    if (controller === null) return unavailable(dependencies.getTelemetry, 'console_config_not_ready')
    try {
      return await operation(controller)
    } catch {
      return unavailable(dependencies.getTelemetry, 'console_config_request_failed')
    }
  }

  return {
    getOverview,
    getEvents,
    simulate,
    getConfig: () => invokeConfig((controller) => controller.getConfig()),
    getModels: () => invokeConfig((controller) => controller.getModels()),
    saveModelDraft: (input) => invokeConfig((controller) => controller.saveModelDraft(input)),
    saveDraft: (input) => invokeConfig((controller) => controller.saveDraft(input)),
    testDraft: () => invokeConfig((controller) => controller.testDraft()),
    publish: (confirmation) => invokeConfig((controller) => controller.publish(confirmation)),
    rollback: (confirmation) => invokeConfig((controller) => controller.rollback(confirmation)),
    createNextRuntimeSnapshots: () => invokeConfig((controller) => controller.createNextRuntimeSnapshots()),
    getPhaseTests: () => phaseTestsController.get(),
  }
}
