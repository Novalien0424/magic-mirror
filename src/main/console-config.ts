import { createHash } from 'node:crypto'

import type {
  ConfigService,
  ConfigSlots,
} from './config-service'
import { ConfigServiceError } from './config-service'
import {
  buildModelSettingsSimulatorEvidence,
  createJobModelSnapshot,
  createSessionModelSnapshot,
  resolveModelSettings,
  type ActiveModelSettings,
  type ModelSettingsResolution,
} from './model-settings'
import type {
  ConfigDiff as ServiceConfigDiff,
  MirrorConfig,
  MirrorEvent,
} from '../shared/types'
import type {
  ConsoleConfigDiff,
  ConsoleConfigDraftInput,
  ConsoleConfigPayload,
  ConsoleConfigSafeView,
  ConsoleDiffConfirmation,
  ConsoleDraftTestResult,
  ConsoleErrorCode,
  ConsoleFieldError,
  ConsoleModelCard,
  ConsoleModelDraftInput,
  ConsoleModelRole,
  ConsoleModelsPayload,
  ConsoleReason,
  ConsoleResponse,
  ConsoleRuntimeSnapshot,
  ConsoleRuntimeSnapshotResult,
} from '../shared/console-types'

const MODEL_PATHS = [
  'aiModels.realtimeDialogue.modelId',
  'aiModels.inputTranscription.modelId',
  'aiModels.memoryExtractor.modelId',
] as const

const MODEL_ROLES: readonly ConsoleModelRole[] = [
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
]

const MODEL_LABELS: Readonly<Record<ConsoleModelRole, ConsoleModelCard['label']>> = {
  realtimeDialogue: 'Realtime Dialogue',
  inputTranscription: 'Input Transcription',
  memoryExtractor: 'Memory Extractor',
}

const SAFE_DRAFT_KEYS = [
  'personaName',
  'voice',
  'idleSeconds',
  'wake',
  'faceModel',
  'assets',
  'adapters',
] as const

const MODEL_DRAFT_KEYS = [
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
] as const

const CONFIRMATION_KEYS = [
  'operation',
  'expectedActiveVersion',
  'changedPaths',
  'nonModelChanges',
  'confirmationDigest',
] as const

const SAFE_DIGEST_PATTERN = /^[A-Za-z0-9:_-]{1,256}$/

type ConfigOperation = 'publish' | 'rollback'

interface RawConfigChange {
  readonly path: string
  readonly from: unknown
  readonly to: unknown
}

interface OperationDiff {
  readonly operation: ConfigOperation
  readonly from: 'active' | 'previous'
  readonly to: 'draft' | 'active'
  readonly expectedActiveVersion: number
  readonly changes: readonly RawConfigChange[]
  readonly publicDiff: ConsoleConfigDiff
}

interface ControllerState {
  readonly service: ConfigService
  readonly slots: ConfigSlots
  readonly resolution: ModelSettingsResolution
}

export type ConsoleDraftProbeResult = {
  readonly result: 'mock_passed' | 'failed'
  readonly reason: 'cause=all_configured_ids_observed' | 'cause=mock_probe_failed' | 'cause=draft_invalid'
}

export type ConsoleConfigRefreshResult =
  | {
      readonly ok: true
      readonly configVersion: number
      readonly resolution: ModelSettingsResolution
    }
  | {
      readonly ok: false
      readonly error: 'console_config_refresh_failed'
      readonly reason: 'cause=refresh_failed'
    }

export interface ConsoleConfigControllerOptions {
  readonly getConfigService: () => ConfigService | null | undefined
  readonly getModelSettings: () => ModelSettingsResolution | null | undefined
  readonly refreshConfig: () => Promise<ConsoleConfigRefreshResult>
  readonly getDeveloperMode: () => boolean
  readonly emit: (event: Omit<MirrorEvent, 'time'>) => void
  readonly now: () => string
  readonly mockDraftProbe?: (...args: readonly unknown[]) =>
    | ConsoleDraftProbeResult
    | PromiseLike<ConsoleDraftProbeResult>
}

export interface ConsoleConfigController {
  getConfig(): Promise<ConsoleResponse<ConsoleConfigPayload>>
  getModels(): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveModelDraft(input: unknown): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveDraft(input: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  testDraft(): Promise<ConsoleResponse<ConsoleDraftTestResult>>
  publish(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  rollback(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  createNextRuntimeSnapshots(): Promise<ConsoleResponse<ConsoleRuntimeSnapshotResult>>
  /** Deterministic fixture seam; it is not exposed through IPC. */
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

function exactKeys(value: unknown, expected: readonly string[]): boolean {
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function safeFieldError(path: string, message: string): ConsoleFieldError {
  return { path, message }
}

function safeFields(fields: readonly ConsoleFieldError[]): readonly ConsoleFieldError[] {
  return fields.slice(0, 32).map((field) => ({
    path: typeof field.path === 'string' && field.path.length <= 128 ? field.path : '$',
    message: typeof field.message === 'string' && field.message.length <= 128
      ? field.message
      : 'schema_invalid',
  }))
}

function responseError<T>(
  error: ConsoleErrorCode,
  reason: ConsoleReason,
  fields?: readonly ConsoleFieldError[],
): ConsoleResponse<T> {
  return fields === undefined
    ? { ok: false, error, reason }
    : { ok: false, error, reason, fields: safeFields(fields) }
}

function emitSafely(
  options: ConsoleConfigControllerOptions,
  event: Omit<MirrorEvent, 'time'>,
): void {
  try {
    options.emit(event)
  } catch {
    // Console telemetry is observational and never gates the action result.
  }
}

function emitAction(
  options: ConsoleConfigControllerOptions,
  event: string,
  status: MirrorEvent['status'],
  reason: string,
  errorCode?: string,
): void {
  emitSafely(options, {
    module: 'config',
    event,
    status,
    ...(errorCode === undefined ? {} : { error_code: errorCode }),
    reason,
    source: 'runtime',
  })
}

function safeInitialResolution(
  options: ConsoleConfigControllerOptions,
): ModelSettingsResolution | null {
  try {
    return options.getModelSettings() ?? null
  } catch {
    return null
  }
}

function getService(options: ConsoleConfigControllerOptions): ConfigService | null {
  try {
    const service = options.getConfigService()
    return service === undefined || service === null ? null : service
  } catch {
    return null
  }
}

function stableValue(value: unknown, ancestors: Set<object> = new Set<object>()): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return '[cycle]'
    ancestors.add(value)
    try {
      return value.map((item) => stableValue(item, ancestors))
    } finally {
      ancestors.delete(value)
    }
  }

  if (typeof value === 'object' && value !== null) {
    if (ancestors.has(value)) return '[cycle]'
    ancestors.add(value)
    try {
      const output: Record<string, unknown> = {}
      for (const key of Object.keys(value).sort()) {
        output[key] = stableValue((value as Record<string, unknown>)[key], ancestors)
      }
      return output
    } finally {
      ancestors.delete(value)
    }
  }

  if (value === undefined) return '[undefined]'
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
  return value
}

function digestFor(
  operation: ConfigOperation,
  from: 'active' | 'previous',
  to: 'draft' | 'active',
  expectedActiveVersion: number,
  changes: readonly RawConfigChange[],
): string {
  const input = stableValue({
    operation,
    from,
    to,
    expectedActiveVersion,
    changed: changes.map((change) => ({
      path: change.path,
      from: change.from,
      to: change.to,
    })),
  })
  const serialized = JSON.stringify(input) ?? ''
  return 'sha256:' + createHash('sha256').update(serialized, 'utf8').digest('hex')
}

function changeKind(path: string): 'model' | 'non_model' {
  return (MODEL_PATHS as readonly string[]).includes(path) ? 'model' : 'non_model'
}

function changeType(change: RawConfigChange): 'added' | 'removed' | 'updated' {
  if (change.from === undefined) return 'added'
  if (change.to === undefined) return 'removed'
  return 'updated'
}

function publicDiff(
  operation: ConfigOperation,
  from: 'active' | 'previous',
  to: 'draft' | 'active',
  expectedActiveVersion: number,
  changes: readonly RawConfigChange[],
): ConsoleConfigDiff {
  const changed = changes.map((change) => ({
    path: change.path,
    kind: changeKind(change.path),
    change: changeType(change),
  }))
  return {
    operation,
    from,
    to,
    expectedActiveVersion,
    changed,
    nonModelChanges: changed.some((change) => change.kind === 'non_model'),
    confirmationDigest: digestFor(operation, from, to, expectedActiveVersion, changes),
  }
}

function safeConfigView(config: MirrorConfig): ConsoleConfigSafeView {
  return {
    configVersion: config.configVersion,
    personaName: config.persona.name,
    voice: config.voice,
    idleSeconds: config.idleSeconds,
    wake: {
      phrase: config.wake.phrase,
      modelVersion: config.wake.modelVersion,
      packageId: config.wake.packageId,
    },
    faceModel: {
      detectorId: config.faceModel.detectorId,
      recognizerId: config.faceModel.recognizerId,
    },
    assets: {
      offlineLoopVideo: config.assets.offlineLoopVideo,
      avatarDir: config.assets.avatarDir,
      musicDir: config.assets.musicDir,
    },
    adapters: {
      lighting: config.adapters.lighting,
      fog: config.adapters.fog,
      music: config.adapters.music,
    },
  }
}

function configDiffFromService(
  result: ServiceConfigDiff,
): readonly RawConfigChange[] {
  return result.changed.map((change) => ({
    path: change.path,
    from: change.from,
    to: change.to,
  }))
}

function normalizeProbeResult(value: unknown): ConsoleDraftProbeResult {
  const result = readProperty(value, 'result')
  const reason = readProperty(value, 'reason')
  if (result === 'mock_passed') {
    return { result, reason: 'cause=all_configured_ids_observed' }
  }
  if (reason === 'cause=draft_invalid') return { result: 'failed', reason }
  return { result: 'failed', reason: 'cause=mock_probe_failed' }
}

function defaultDraftProbe(
  resolution: ModelSettingsResolution,
  now: string,
): ConsoleDraftProbeResult {
  try {
    const draft = resolution.draft
    const activeLike = {
      ...draft,
      slot: 'active' as const,
    } as ActiveModelSettings
    const session = createSessionModelSnapshot(activeLike, now)
    const job = createJobModelSnapshot(activeLike, now)
    const evidence = buildModelSettingsSimulatorEvidence(activeLike, session, job, {
      session: {
        realtimeDialogue: draft.realtimeDialogue,
        inputTranscription: draft.inputTranscription,
        voice: draft.voice,
      },
      job: { memoryExtractor: draft.memoryExtractor },
    })
    return evidence.result === 'mock_passed'
      ? { result: 'mock_passed', reason: 'cause=all_configured_ids_observed' }
      : { result: 'failed', reason: 'cause=mock_probe_failed' }
  } catch {
    return { result: 'failed', reason: 'cause=draft_invalid' }
  }
}

function sanitizeConfirmation(value: unknown): ConsoleDiffConfirmation | null {
  if (!exactKeys(value, CONFIRMATION_KEYS)) return null
  const operation = readProperty(value, 'operation')
  const expectedActiveVersion = readProperty(value, 'expectedActiveVersion')
  const changedPaths = readProperty(value, 'changedPaths')
  const nonModelChanges = readProperty(value, 'nonModelChanges')
  const confirmationDigest = readProperty(value, 'confirmationDigest')
  if (
    (operation !== 'publish' && operation !== 'rollback')
    || typeof expectedActiveVersion !== 'number'
    || !Number.isSafeInteger(expectedActiveVersion)
    || expectedActiveVersion < 1
    || !Array.isArray(changedPaths)
    || !changedPaths.every((path) => typeof path === 'string' && path.length > 0 && path.length <= 256)
    || typeof nonModelChanges !== 'boolean'
    || typeof confirmationDigest !== 'string'
    || !SAFE_DIGEST_PATTERN.test(confirmationDigest)
  ) {
    return null
  }
  return {
    operation,
    expectedActiveVersion,
    changedPaths,
    nonModelChanges,
    confirmationDigest,
  }
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((path, index) => path === right[index])
}

function confirmationMatches(
  confirmation: ConsoleDiffConfirmation,
  diff: ConsoleConfigDiff,
): boolean {
  const expectedPaths = diff.changed.map((entry) => entry.path).slice().sort()
  return confirmation.operation === diff.operation
    && confirmation.expectedActiveVersion === diff.expectedActiveVersion
    && confirmation.nonModelChanges === diff.nonModelChanges
    && confirmation.confirmationDigest === diff.confirmationDigest
    && samePaths(confirmation.changedPaths, expectedPaths)
}

function draftInputValidation(value: unknown):
  | { readonly ok: true; readonly value: ConsoleConfigDraftInput }
  | { readonly ok: false; readonly fields: readonly ConsoleFieldError[] } {
  if (!exactKeys(value, SAFE_DRAFT_KEYS)) {
    return { ok: false, fields: [safeFieldError('$', 'unrecognized_keys')] }
  }

  const stringFields = ['personaName', 'voice'] as const
  for (const field of stringFields) {
    const fieldValue = readProperty(value, field)
    if (!nonEmptyString(fieldValue)) {
      return { ok: false, fields: [safeFieldError(field, 'invalid_type')] }
    }
  }

  const idleSeconds = readProperty(value, 'idleSeconds')
  if (typeof idleSeconds !== 'number' || !Number.isSafeInteger(idleSeconds) || idleSeconds < 1 || idleSeconds > 86_400) {
    return { ok: false, fields: [safeFieldError('idleSeconds', 'invalid_type')] }
  }

  const nested = [
    ['wake', ['phrase', 'modelVersion', 'packageId']],
    ['faceModel', ['detectorId', 'recognizerId']],
    ['assets', ['offlineLoopVideo', 'avatarDir', 'musicDir']],
    ['adapters', ['lighting', 'fog', 'music']],
  ] as const
  for (const [parent, keys] of nested) {
    const child = readProperty(value, parent)
    if (!exactKeys(child, keys)) {
      return { ok: false, fields: [safeFieldError(parent, 'unrecognized_keys')] }
    }
    for (const key of keys) {
      const childValue = readProperty(child, key)
      if (parent === 'adapters') {
        if (childValue !== 'mock' && childValue !== 'physical') {
          return { ok: false, fields: [safeFieldError(`${parent}.${key}`, 'invalid_enum_value')] }
        }
      } else if (!nonEmptyString(childValue)) {
        return { ok: false, fields: [safeFieldError(`${parent}.${key}`, 'invalid_type')] }
      }
    }
  }

  return {
    ok: true,
    value: {
      personaName: readProperty(value, 'personaName') as string,
      voice: readProperty(value, 'voice') as string,
      idleSeconds: idleSeconds as number,
      wake: {
        phrase: readProperty(readProperty(value, 'wake'), 'phrase') as string,
        modelVersion: readProperty(readProperty(value, 'wake'), 'modelVersion') as string,
        packageId: readProperty(readProperty(value, 'wake'), 'packageId') as string,
      },
      faceModel: {
        detectorId: readProperty(readProperty(value, 'faceModel'), 'detectorId') as string,
        recognizerId: readProperty(readProperty(value, 'faceModel'), 'recognizerId') as string,
      },
      assets: {
        offlineLoopVideo: readProperty(readProperty(value, 'assets'), 'offlineLoopVideo') as string,
        avatarDir: readProperty(readProperty(value, 'assets'), 'avatarDir') as string,
        musicDir: readProperty(readProperty(value, 'assets'), 'musicDir') as string,
      },
      adapters: {
        lighting: readProperty(readProperty(value, 'adapters'), 'lighting') as 'mock' | 'physical',
        fog: readProperty(readProperty(value, 'adapters'), 'fog') as 'mock' | 'physical',
        music: readProperty(readProperty(value, 'adapters'), 'music') as 'mock' | 'physical',
      },
    },
  }
}

function modelDraftValidation(value: unknown):
  | { readonly ok: true; readonly value: ConsoleModelDraftInput }
  | { readonly ok: false; readonly fields: readonly ConsoleFieldError[] } {
  if (!exactKeys(value, MODEL_DRAFT_KEYS)) {
    return { ok: false, fields: [safeFieldError('$', 'unrecognized_keys')] }
  }
  for (const role of MODEL_DRAFT_KEYS) {
    if (!nonEmptyString(readProperty(value, role))) {
      return { ok: false, fields: [safeFieldError(role, 'invalid_type')] }
    }
  }
  return {
    ok: true,
    value: {
      realtimeDialogue: readProperty(value, 'realtimeDialogue') as string,
      inputTranscription: readProperty(value, 'inputTranscription') as string,
      memoryExtractor: readProperty(value, 'memoryExtractor') as string,
    },
  }
}

function mapConfigError<T>(
  error: unknown,
  operation: 'read' | 'save' | 'publish' | 'rollback',
): ConsoleResponse<T> {
  if (error instanceof ConfigServiceError) {
    if (error.code === 'config_schema_invalid') {
      return responseError('console_config_invalid', 'cause=config_schema_invalid', error.fields)
    }
    if (error.code === 'config_previous_unavailable') {
      return responseError('console_config_previous_unavailable', 'cause=previous_unavailable')
    }
  }
  if (operation === 'publish') {
    return responseError('console_config_publish_failed', 'cause=atomic_publish_failed')
  }
  if (operation === 'rollback') {
    return responseError('console_config_rollback_failed', 'cause=atomic_rollback_failed')
  }
  if (operation === 'read') {
    return responseError('console_not_ready', 'cause=config_service_unavailable')
  }
  return responseError('console_config_invalid', 'cause=config_service_unavailable')
}

function copyConfigInput(
  config: MirrorConfig,
  input: ConsoleConfigDraftInput,
): MirrorConfig {
  return {
    ...config,
    persona: { ...config.persona, name: input.personaName },
    voice: input.voice,
    idleSeconds: input.idleSeconds,
    wake: { ...input.wake },
    faceModel: { ...input.faceModel },
    assets: { ...input.assets },
    adapters: { ...input.adapters },
  }
}

function copyModelInput(
  config: MirrorConfig,
  input: ConsoleModelDraftInput,
): MirrorConfig {
  return {
    ...config,
    aiModels: {
      ...config.aiModels,
      realtimeDialogue: { ...config.aiModels.realtimeDialogue, modelId: input.realtimeDialogue },
      inputTranscription: { ...config.aiModels.inputTranscription, modelId: input.inputTranscription },
      memoryExtractor: { ...config.aiModels.memoryExtractor, modelId: input.memoryExtractor },
    },
  }
}

function snapshotSlot(
  settings: ModelSettingsResolution['active'] | ModelSettingsResolution['draft'] | ModelSettingsResolution['previous'],
  role: ConsoleModelRole,
): { readonly configVersion: number; readonly fingerprint: string; readonly modelId: string } {
  return {
    configVersion: settings.configVersion,
    fingerprint: settings.fingerprint,
    modelId: settings[role],
  }
}

function runtimeSlot(
  runtime: ConsoleRuntimeSnapshot | null,
  role: ConsoleModelRole,
  baseline: ReturnType<typeof snapshotSlot>,
): ReturnType<typeof snapshotSlot> {
  if (runtime === null) return baseline
  if (role === 'memoryExtractor') {
    const job = runtime.job
    if (job === null) return baseline
    return {
      configVersion: job.configVersion,
      fingerprint: job.fingerprint,
      modelId: job.memoryExtractor,
    }
  }
  const session = runtime.session
  if (session === null) return baseline
  return {
    configVersion: session.configVersion,
    fingerprint: session.fingerprint,
    modelId: role === 'realtimeDialogue' ? session.realtimeDialogue : session.inputTranscription,
  }
}

function makeRuntimeSnapshot(
  active: ModelSettingsResolution['active'],
  takenAt: string,
  label: ConsoleRuntimeSnapshot['label'],
): ConsoleRuntimeSnapshot {
  const activeLike = active as ActiveModelSettings
  const session = createSessionModelSnapshot(activeLike, takenAt)
  const job = createJobModelSnapshot(activeLike, takenAt)
  return Object.freeze({
    label,
    source: 'simulator' as const,
    session,
    job,
  })
}

function runtimePending(
  runtimeLoaded: ReturnType<typeof snapshotSlot>,
  active: ReturnType<typeof snapshotSlot>,
  role: ConsoleModelRole,
): 'none' | 'next_session' | 'next_job' {
  if (runtimeLoaded.configVersion === active.configVersion && runtimeLoaded.fingerprint === active.fingerprint) {
    return 'none'
  }
  return role === 'memoryExtractor' ? 'next_job' : 'next_session'
}

export function createConsoleConfigController(
  options: ConsoleConfigControllerOptions,
): ConsoleConfigController {
  let cachedResolution = safeInitialResolution(options)
  let resolutionStale = false
  let draftTest: ConsoleDraftTestResult | null = null
  let runtimeCurrent: ConsoleRuntimeSnapshot | null = null
  let runtimeOld: ConsoleRuntimeSnapshot | null = null
  let runtimeNew: ConsoleRuntimeSnapshot | null = null

  async function readState(): Promise<ControllerState | null> {
    const service = getService(options)
    if (service === null) return null
    const slots = await service.read()
    const resolution = resolveModelSettings(slots)
    cachedResolution = resolution
    return { service, slots, resolution }
  }

  async function readOperationDiff(
    operation: ConfigOperation,
  ): Promise<OperationDiff | null> {
    const state = await readState()
    if (state === null) return null
    const from: 'active' | 'previous' = operation === 'publish' ? 'active' : 'previous'
    const to: 'draft' | 'active' = operation === 'publish' ? 'draft' : 'active'
    const serviceDiff = await state.service.diff(from, to)
    const changes = configDiffFromService(serviceDiff)
    return {
      operation,
      from,
      to,
      expectedActiveVersion: state.slots.active.configVersion,
      changes,
      publicDiff: publicDiff(
        operation,
        from,
        to,
        state.slots.active.configVersion,
        changes,
      ),
    }
  }

  function currentDraftTest(resolution: ModelSettingsResolution): ConsoleDraftTestResult | null {
    if (draftTest === null) return null
    if (
      draftTest.configVersion !== resolution.draft.configVersion
      || draftTest.fingerprint !== resolution.draft.fingerprint
    ) {
      draftTest = null
      return null
    }
    return draftTest
  }

  async function getConfig(): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    const service = getService(options)
    if (service === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
    try {
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      const publish = await readOperationDiff('publish')
      const rollback = await readOperationDiff('rollback')
      if (publish === null || rollback === null) {
        return responseError('console_not_ready', 'cause=config_service_unavailable')
      }
      return {
        ok: true,
        value: {
          active: safeConfigView(state.slots.active),
          draft: safeConfigView(state.slots.draft),
          previous: safeConfigView(state.slots.previous),
          publishDiff: publish.publicDiff,
          rollbackDiff: rollback.publicDiff,
          draftTest: currentDraftTest(state.resolution),
        },
      }
    } catch (error) {
      return mapConfigError(error, 'read')
    }
  }

  function makeModelsPayload(resolution: ModelSettingsResolution): ConsoleModelsPayload {
    const current = runtimeCurrent
    const cards = MODEL_ROLES.map((role) => {
      const draft = snapshotSlot(resolution.draft, role)
      const publishedActive = snapshotSlot(resolution.active, role)
      const previous = snapshotSlot(resolution.previous, role)
      const runtimeLoaded = runtimeSlot(current, role, publishedActive)
      return {
        role,
        label: MODEL_LABELS[role],
        draft,
        publishedActive,
        runtimeLoaded,
        previous,
        pending: runtimePending(runtimeLoaded, publishedActive, role),
      }
    })
    return {
      cards,
      runtime: {
        current: runtimeCurrent,
        old: runtimeOld,
        new: runtimeNew,
      },
      latestTest: currentDraftTest(resolution),
    }
  }

  async function getModels(): Promise<ConsoleResponse<ConsoleModelsPayload>> {
    if (resolutionStale) return responseError('console_config_refresh_failed', 'cause=refresh_failed')
    const service = getService(options)
    if (service === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
    try {
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      return { ok: true, value: makeModelsPayload(state.resolution) }
    } catch (error) {
      return mapConfigError(error, 'read')
    }
  }

  async function saveDraft(input: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    const validation = draftInputValidation(input)
    if (!validation.ok) {
      emitAction(options, 'config_draft_rejected', 'failed', 'cause=payload_schema_invalid', 'console_config_invalid')
      return responseError('console_config_invalid', 'cause=payload_schema_invalid', validation.fields)
    }
    const service = getService(options)
    if (service === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
    try {
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      await state.service.saveDraft(copyConfigInput(state.slots.draft, validation.value))
      draftTest = null
      emitAction(
        options,
        'config_draft_saved',
        'success',
        'operation=save_draft;config_version=' + String(state.slots.active.configVersion),
      )
      return getConfig()
    } catch (error) {
      emitAction(options, 'config_draft_rejected', 'failed', 'cause=config_service_unavailable', 'console_config_invalid')
      return mapConfigError(error, 'save')
    }
  }

  async function saveModelDraft(input: unknown): Promise<ConsoleResponse<ConsoleModelsPayload>> {
    const validation = modelDraftValidation(input)
    if (!validation.ok) {
      emitAction(options, 'config_draft_rejected', 'failed', 'cause=payload_schema_invalid', 'console_config_invalid')
      return responseError('console_config_invalid', 'cause=payload_schema_invalid', validation.fields)
    }
    const service = getService(options)
    if (service === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
    try {
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      await state.service.saveDraft(copyModelInput(state.slots.draft, validation.value))
      draftTest = null
      emitAction(
        options,
        'config_draft_saved',
        'success',
        'operation=save_model_draft;role_count=3;config_version=' + String(state.slots.active.configVersion),
      )
      return getModels()
    } catch (error) {
      emitAction(options, 'config_draft_rejected', 'failed', 'cause=config_service_unavailable', 'console_config_invalid')
      return mapConfigError(error, 'save')
    }
  }

  async function testDraft(): Promise<ConsoleResponse<ConsoleDraftTestResult>> {
    if (resolutionStale) return responseError('console_config_refresh_failed', 'cause=refresh_failed')
    const service = getService(options)
    if (service === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
    try {
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      let probeResult: ConsoleDraftProbeResult
      try {
        probeResult = options.mockDraftProbe === undefined
          ? defaultDraftProbe(state.resolution, options.now())
          : normalizeProbeResult(await Promise.resolve(options.mockDraftProbe(state.resolution.draft, state.slots)))
      } catch {
        probeResult = { result: 'failed', reason: 'cause=mock_probe_failed' }
      }
      const result: ConsoleDraftTestResult = Object.freeze({
        result: probeResult.result,
        source: 'simulator',
        configVersion: state.resolution.draft.configVersion,
        fingerprint: state.resolution.draft.fingerprint,
        roleCount: 3,
        reason: probeResult.reason,
      })
      draftTest = result
      emitAction(
        options,
        'model_settings_simulated',
        result.result === 'mock_passed' ? 'success' : 'failed',
        'operation=test_draft;result=' + result.result + ';role_count=3;config_version=' + String(result.configVersion) + ';cause=' + result.reason.slice('cause='.length),
        result.result === 'mock_passed' ? undefined : 'model_settings_simulator_mismatch',
      )
      return { ok: true, value: result }
    } catch (error) {
      return mapConfigError(error, 'read')
    }
  }

  function invalidConfirmation<T>(): ConsoleResponse<T> {
    emitAction(options, 'config_diff_rejected', 'failed', 'cause=confirmation_invalid', 'console_config_confirmation_invalid')
    return responseError('console_config_confirmation_invalid', 'cause=confirmation_invalid')
  }

  async function refreshAfterMutation(): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    let refreshed: ConsoleConfigRefreshResult
    try {
      refreshed = await options.refreshConfig()
    } catch {
      refreshed = { ok: false, error: 'console_config_refresh_failed', reason: 'cause=refresh_failed' }
    }
    if (!refreshed.ok) {
      resolutionStale = true
      cachedResolution = null
      emitAction(options, 'config_refresh_failed', 'failed', 'cause=refresh_failed', 'console_config_refresh_failed')
      return responseError('console_config_refresh_failed', 'cause=refresh_failed')
    }
    resolutionStale = false
    cachedResolution = refreshed.resolution
    draftTest = null
    const config = await getConfig()
    if (!config.ok) {
      emitAction(options, 'config_refresh_failed', 'failed', 'cause=refresh_failed', 'console_config_refresh_failed')
      return responseError('console_config_refresh_failed', 'cause=refresh_failed')
    }
    return config
  }

  async function publish(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    emitAction(options, 'config_publish_requested', 'info', 'operation=publish;action=requested')
    const parsed = sanitizeConfirmation(confirmation)
    if (parsed === null || parsed.operation !== 'publish') return invalidConfirmation()
    if (resolutionStale) return responseError('console_config_refresh_failed', 'cause=refresh_failed')
    try {
      const currentDiff = await readOperationDiff('publish')
      if (currentDiff === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      if (!confirmationMatches(parsed, currentDiff.publicDiff)) {
        emitAction(options, 'config_diff_rejected', 'failed', 'cause=diff_stale', 'console_config_diff_stale')
        return responseError('console_config_diff_stale', 'cause=diff_stale')
      }
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      const matchingTest = currentDraftTest(state.resolution)
      if (matchingTest === null) return responseError('console_config_not_tested', 'cause=draft_not_tested')
      if (matchingTest.result !== 'mock_passed') {
        return responseError('console_config_test_failed', 'cause=draft_test_failed')
      }
      await state.service.publish()
      if (runtimeCurrent !== null) runtimeOld = runtimeCurrent
      runtimeNew = null
      return refreshAfterMutation()
    } catch (error) {
      return mapConfigError(error, 'publish')
    }
  }

  async function rollback(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    emitAction(options, 'config_rollback_requested', 'info', 'operation=rollback;action=requested')
    const parsed = sanitizeConfirmation(confirmation)
    if (parsed === null || parsed.operation !== 'rollback') return invalidConfirmation()
    if (resolutionStale) return responseError('console_config_refresh_failed', 'cause=refresh_failed')
    try {
      const currentDiff = await readOperationDiff('rollback')
      if (currentDiff === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      if (!confirmationMatches(parsed, currentDiff.publicDiff)) {
        emitAction(options, 'config_diff_rejected', 'failed', 'cause=diff_stale', 'console_config_diff_stale')
        return responseError('console_config_diff_stale', 'cause=diff_stale')
      }
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      await state.service.rollback()
      if (runtimeCurrent !== null) runtimeOld = runtimeCurrent
      runtimeNew = null
      return refreshAfterMutation()
    } catch (error) {
      return mapConfigError(error, 'rollback')
    }
  }

  async function createInitialRuntimeSnapshotsForTest(): Promise<ConsoleRuntimeSnapshot> {
    const state = await readState()
    const resolution = state?.resolution ?? cachedResolution
    if (state === null || resolution === null) throw new Error('console_not_ready')
    const snapshot = makeRuntimeSnapshot(resolution.active, options.now(), 'current')
    runtimeCurrent = snapshot
    runtimeOld = null
    runtimeNew = null
    return snapshot
  }

  async function createNextRuntimeSnapshots(): Promise<ConsoleResponse<ConsoleRuntimeSnapshotResult>> {
    if (!safeDeveloperMode(options)) {
      const result: ConsoleRuntimeSnapshotResult = {
        result: 'failed',
        source: 'simulator',
        reason: 'cause=developer_mode_disabled',
      }
      emitAction(options, 'runtime_snapshot_created', 'failed', result.reason)
      return { ok: true, value: result }
    }
    if (resolutionStale) {
      const result: ConsoleRuntimeSnapshotResult = {
        result: 'failed',
        source: 'simulator',
        reason: 'cause=refresh_failed',
      }
      emitAction(options, 'runtime_snapshot_created', 'failed', result.reason)
      return { ok: true, value: result }
    }
    try {
      const state = await readState()
      if (state === null) return responseError('console_not_ready', 'cause=config_service_unavailable')
      runtimeNew = makeRuntimeSnapshot(state.resolution.active, options.now(), 'new')
      const result: ConsoleRuntimeSnapshotResult = {
        result: 'mock_passed',
        source: 'simulator',
        reason: 'cause=next_snapshot_created',
      }
      emitAction(options, 'runtime_snapshot_created', 'success', result.reason)
      return { ok: true, value: result }
    } catch {
      const result: ConsoleRuntimeSnapshotResult = {
        result: 'failed',
        source: 'simulator',
        reason: 'cause=refresh_failed',
      }
      emitAction(options, 'runtime_snapshot_created', 'failed', result.reason)
      return { ok: true, value: result }
    }
  }

  return {
    getConfig,
    getModels,
    saveModelDraft,
    saveDraft,
    testDraft,
    publish,
    rollback,
    createNextRuntimeSnapshots,
    createInitialRuntimeSnapshotsForTest,
  }
}

function safeDeveloperMode(options: ConsoleConfigControllerOptions): boolean {
  try {
    return options.getDeveloperMode() === true
  } catch {
    return false
  }
}
