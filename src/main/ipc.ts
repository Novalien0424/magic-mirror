import { getAudioPreferences, saveAudioPreferences } from './audio-preferences'
import { isAudioDeviceState, parseAudioPreferences } from '../shared/audio-devices'
import type {
  AppSnapshot,
  MirrorEvent,
  MirrorConfig,
  ManagedVisualAsset,
  OpStatus,
  PendingVisualAsset,
  SceneActionDefinition,
  SceneActionCommandContext,
  SceneActionRendererReport,
  ScenePublicCatalog,
  SceneRunResult,
  SceneStartResult,
  SceneStatusEvent,
  SceneVisualPlaybackReport,
  SimulatorCommand,
  SimulatorResult,
  VisualAssetProbe,
} from '../shared/types'
import type {
  AvatarControlCommand,
  AvatarRuntimeSnapshot,
  ConsoleChannelMap,
  MirrorChannelMap,
  MirrorWindowKind,
  RealtimeRuntimeCommand,
  RealtimeRuntimeOutcomeOperation,
  RealtimeRuntimeOutcomeReport,
  RealtimeRuntimeOutcomeStatus,
  RealtimeFailureReport,
  RealtimeRendererMetadataKind,
  RealtimeRendererMetadataReport,
  RealtimeRendererMetadataStatus,
  RealtimeSessionStartBundleValue,
  TransientRealtimeSecretInput,
  TransientRealtimeSecretResult,
} from '../shared/bridge'
import { AVATAR_RUNTIME_STATES } from '../shared/bridge'
import type {
  ConsoleErrorCode,
  ConsoleLifecycleAction,
  ConsoleLifecycleActionResult,
  ConsoleReason,
  ConsoleResponse,
  PhaseTestPhase,
} from '../shared/console-types'
import { projectAppSnapshot, type BootRuntime } from './boot'
import type { ConsoleDataPlane } from './console-data'
import type { RealtimeSessionStartBundle } from './realtime/session-start-bundle'
import type { RealtimeFailureKind } from '../shared/realtime-recovery'
import { createSceneRuntime, type SceneRuntime, type SceneRuntimeEvent } from './scenes/scene-runtime'
import {
  createMockPhysicalAdapter,
  createUnavailablePhysicalAdapter,
  type PhysicalSceneAdapter,
} from './scenes/adapters'

export const MIRROR_IPC_CHANNELS: MirrorChannelMap = Object.freeze({
  getSnapshot: 'mirror:get-snapshot',
  snapshot: 'mirror:snapshot',
  requestRealtimeClientSecret: 'mirror:request-realtime-client-secret',
  realtimeRuntimeCommand: 'mirror:realtime-runtime-command',
  interrupt: 'mirror:interrupt',
  reportRealtimeRuntimeOutcome: 'mirror:report-realtime-runtime-outcome',
  reportRealtimeFailure: 'mirror:report-realtime-failure',
  reportRealtimeMetadata: 'mirror:report-realtime-metadata',
  sleepRequest: 'mirror:sleep-request',
  avatarControl: 'mirror:avatar-control',
  reportAvatarRuntime: 'mirror:report-avatar-runtime',
  reportSceneAction: 'mirror:report-scene-action',
  reportSceneVisual: 'mirror:report-scene-visual',
  getSceneCatalog: 'mirror:get-scene-catalog',
  triggerScene: 'mirror:trigger-scene',
  stopScene: 'mirror:stop-scene',
  sceneStatus: 'mirror:scene-status',
  ready: 'boot:renderer-ready',
})

export const CONSOLE_IPC_CHANNELS: ConsoleChannelMap = Object.freeze({
  getSnapshot: 'console:get-snapshot',
  snapshot: 'console:snapshot',
  simulate: 'console:simulate',
  startConversation: 'console:start-conversation',
  disconnect: 'console:disconnect',
  interrupt: 'console:interrupt',
  overview: 'console:get-overview',
  events: 'console:get-events',
  config: 'console:get-config',
  models: 'console:get-models',
  saveModelDraft: 'console:save-model-draft',
  saveDraft: 'console:save-draft',
  testDraft: 'console:test-draft',
  publish: 'console:publish',
  rollback: 'console:rollback',
  nextRuntime: 'console:create-next-runtime',
  phaseTests: 'console:get-phase-tests',
  avatarRuntime: 'console:get-avatar-runtime',
  avatarControl: 'console:avatar-control',
  runScene: 'console:run-scene',
  stopScenes: 'console:stop-scenes',
  sceneStatus: 'console:scene-status',
  uploadMusic: 'console:upload-music',
  uploadVisual: 'console:upload-visual',
  finalizeVisual: 'console:finalize-visual',
  cancelVisual: 'console:cancel-visual',
  ready: 'boot:renderer-ready',
})

type MetadataEvent = Omit<MirrorEvent, 'time'>

interface WebContentsLike {
  readonly id: number
  readonly mainFrame: unknown
  readonly isDestroyed?: () => boolean
  readonly send: (channel: string, ...payload: readonly unknown[]) => void
}

interface TrackedWindowLike {
  readonly webContents: WebContentsLike
  readonly webContentsId?: number
  readonly isDestroyed?: () => boolean
}

export type TrackedWindows =
  | Readonly<Partial<Record<MirrorWindowKind, TrackedWindowLike>>>
  | ReadonlyMap<MirrorWindowKind, TrackedWindowLike>

export interface IpcMainRegistrar {
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void
  on(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void
}

export interface IpcEventSink {
  emit(event: MetadataEvent): void
}

export type SenderRejectionReason =
  'unknown_sender'
  | 'sender_frame_invalid'
  | 'web_contents_mismatch'
  | 'window_destroyed'

export interface RegisterIpcHandlersOptions {
  readonly ipcMain: IpcMainRegistrar
  readonly runtime: Pick<BootRuntime, 'snapshot' | 'handleSimulator' | 'manualStart' | 'manualStop'> & {
    readonly console?: ConsoleDataPlane
    readonly requestRealtimeClientSecret?: () => Promise<Readonly<RealtimeSessionStartBundle>>
    readonly handleRealtimeRuntimeOutcome?: (
      report: RealtimeRuntimeOutcomeReport,
    ) => unknown
    readonly handleRealtimeFailure?: (
      report: RealtimeFailureReport,
    ) => unknown | PromiseLike<unknown>
    readonly requestSleep?: () => unknown | PromiseLike<unknown>
    readonly noteRealtimeActivity?: BootRuntime['noteRealtimeActivity']
    readonly getPublishedSceneConfigForRuntime?: BootRuntime['getPublishedSceneConfigForRuntime']
  }
  readonly console?: ConsoleDataPlane
  readonly windows: TrackedWindows
  readonly telemetry: IpcEventSink
  readonly onReady?: (kind: MirrorWindowKind) => void
  readonly importMusicAsset?: () => Promise<MirrorConfig['musicAssets'][number] | null>
  readonly importMedia?: (request: import('../shared/media-import').MediaImportRequest) => Promise<import('../shared/media-import').MediaImportEntry[]>
  readonly importVisualAsset?: () => Promise<PendingVisualAsset | null>
  readonly finalizeVisualAsset?: (input: Readonly<{ token: string; probe: VisualAssetProbe }>) => Promise<ManagedVisualAsset>
  readonly cancelVisualAsset?: (token: string) => Promise<void>
}

export interface SceneRuntimeControl {
  stopAll(): Promise<void>
}

export type SenderAuthResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SenderRejectionReason }

export type SimulatorPayloadValidation =
  | { readonly ok: true; readonly value: SimulatorCommand }
  | { readonly ok: false; readonly reason: 'ipc_payload_invalid' }

export interface RealtimeIpcContractSender {
  readonly identity: 'mirror' | 'console' | 'unknown'
}

export interface RealtimeIpcContractRequest {
  readonly sender: RealtimeIpcContractSender
}

export interface RealtimeIpcContractOptions {
  readonly issueRealtimeSessionStartBundle: () => Promise<Readonly<RealtimeSessionStartBundle>>
}

export interface RealtimeIpcContract {
  readonly handleTransientSecretRequest: (
    request: RealtimeIpcContractRequest,
  ) => Promise<TransientRealtimeSecretResult>
  readonly mirror: {
    readonly requestRealtimeClientSecret: () => Promise<TransientRealtimeSecretResult>
  }
  readonly console: Readonly<Record<string, never>>
}

const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/
const SAFE_STATE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/
const SAFE_REASON_PATTERN = /^[A-Za-z0-9_=;.%:+,/?-]{1,1024}$/
const OP_STATUS_VALUES: ReadonlySet<OpStatus> = new Set(['success', 'degraded', 'failed'])
const REALTIME_RUNTIME_OUTCOME_STATUS_VALUES: ReadonlySet<RealtimeRuntimeOutcomeStatus> = new Set([
  'success',
  'degraded',
  'failed',
  'ignored',
])
const REALTIME_RUNTIME_OUTCOME_OPERATION_VALUES: ReadonlySet<RealtimeRuntimeOutcomeOperation> = new Set([
  'start',
  'stop',
  'dispose',
  'interrupt',
  'rollover',
])
const REALTIME_RUNTIME_OUTCOME_ALLOWED_STATUSES: Readonly<Record<RealtimeRuntimeOutcomeOperation, ReadonlySet<RealtimeRuntimeOutcomeStatus>>> = {
  start: new Set(['success', 'failed', 'ignored']),
  stop: new Set(['success', 'failed', 'ignored']),
  dispose: new Set(['success', 'failed', 'ignored']),
  interrupt: new Set(['success', 'failed', 'ignored']),
  rollover: new Set(['success', 'degraded', 'failed', 'ignored']),
}
const REALTIME_RUNTIME_OUTCOME_REASON_PATTERN = /^[a-z][a-z0-9_]{0,95}$/
const REALTIME_FAILURE_KIND_VALUES: ReadonlySet<RealtimeFailureKind> = new Set([
  'connect',
  'ice',
  'active_disconnect',
])
const REALTIME_RENDERER_METADATA_KIND_VALUES: ReadonlySet<RealtimeRendererMetadataKind> = new Set([
  'session',
  'mic',
  'playback',
  'transcript',
  'cleanup',
  'avatar',
])
const REALTIME_RENDERER_METADATA_STATUS_VALUES: ReadonlySet<RealtimeRendererMetadataStatus> = new Set([
  'success',
  'degraded',
  'failed',
  'info',
])
const REALTIME_RENDERER_METADATA_EVENTS: Readonly<Record<RealtimeRendererMetadataKind, string>> = Object.freeze({
  session: 'realtime_session_metadata',
  mic: 'realtime_mic_metadata',
  playback: 'realtime_playback_metadata',
  transcript: 'realtime_transcript_metadata',
  cleanup: 'realtime_cleanup_metadata',
  avatar: 'avatar_runtime_metadata',
})

const AVATAR_STATUS_VALUES = new Set(['not_ready', 'ready', 'degraded', 'failed'])
const AVATAR_STATE_VALUES = new Set<string>(AVATAR_RUNTIME_STATES)
const SCENE_RENDERER_REPORT_STATUSES = new Set(['acknowledged', 'completed', 'failed', 'timeout'])

function isUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isValidAvatarRuntimeSnapshot(value: unknown): value is AvatarRuntimeSnapshot {
  const audioDevices = readProperty(value, 'audioDevices')
  if (audioDevices !== undefined && !isAudioDeviceState(audioDevices)) return false
  if (!exactKeys(value, [
    'status', 'reason', 'state', 'fps', 'waveform', 'mouthOpen',
    'audioUnderruns', 'voiceGain', 'musicGain',
    ...(audioDevices === undefined ? [] : ['audioDevices']),
  ])) return false
  const fps = readProperty(value, 'fps')
  const underruns = readProperty(value, 'audioUnderruns')
  return AVATAR_STATUS_VALUES.has(readProperty(value, 'status') as string)
    && typeof readProperty(value, 'reason') === 'string'
    && REALTIME_RUNTIME_OUTCOME_REASON_PATTERN.test(readProperty(value, 'reason') as string)
    && AVATAR_STATE_VALUES.has(readProperty(value, 'state') as string)
    && typeof fps === 'number' && Number.isFinite(fps) && fps >= 0 && fps <= 240
    && isUnitNumber(readProperty(value, 'waveform'))
    && isUnitNumber(readProperty(value, 'mouthOpen'))
    && typeof underruns === 'number' && Number.isSafeInteger(underruns) && underruns >= 0
    && isUnitNumber(readProperty(value, 'voiceGain'))
    && isUnitNumber(readProperty(value, 'musicGain'))
}

function validateAvatarControl(value: unknown): value is AvatarControlCommand {
  const type = readProperty(value, 'type')
  if (type === 'refresh_audio_devices') return exactKeys(value, ['type'])
  if (type === 'audio_devices') return exactKeys(value, ['type', 'preferences'])
    && parseAudioPreferences(readProperty(value, 'preferences')) !== null
  if (type === 'state') {
    return exactKeys(value, ['type', 'state'])
      && AVATAR_STATE_VALUES.has(readProperty(value, 'state') as string)
  }
  if (type === 'asset_failure') {
    return exactKeys(value, ['type', 'action'])
      && (readProperty(value, 'action') === 'inject' || readProperty(value, 'action') === 'clear')
  }
  if (type === 'expression') {
    return exactKeys(value, ['type', 'name'])
      && typeof readProperty(value, 'name') === 'string'
      && /^[A-Za-z0-9._-]{1,80}$/.test(readProperty(value, 'name') as string)
  }
  if (type === 'motion') {
    return exactKeys(value, ['type', 'group'])
      && typeof readProperty(value, 'group') === 'string'
      && /^[A-Za-z0-9._-]{1,80}$/.test(readProperty(value, 'group') as string)
  }
  if (type === 'scene_dialogue') {
    const text = readProperty(value, 'text')
    return exactKeys(value, ['type', 'text'])
      && typeof text === 'string' && text.trim().length > 0 && text.length <= 1000
  }
  if (type === 'scene_music') {
    const action = readProperty(value, 'action')
    if (action === 'play') {
      return exactKeys(value, ['type', 'action', 'assetId', 'gain', 'loop'])
        && SAFE_ID_PATTERN.test(readProperty(value, 'assetId') as string)
        && isUnitNumber(readProperty(value, 'gain'))
        && typeof readProperty(value, 'loop') === 'boolean'
    }
    if (action === 'stop') {
      const duration = readProperty(value, 'fadeDurationMs')
      return exactKeys(value, ['type', 'action', 'fadeDurationMs'])
        && typeof duration === 'number' && Number.isSafeInteger(duration)
        && duration >= 0 && duration <= 60_000
    }
    if (action === 'fade') {
      const duration = readProperty(value, 'durationMs')
      return exactKeys(value, ['type', 'action', 'targetGain', 'durationMs'])
        && isUnitNumber(readProperty(value, 'targetGain'))
        && typeof duration === 'number' && Number.isSafeInteger(duration)
        && duration >= 1 && duration <= 60_000
    }
    return false
  }
  if (type === 'recorded_audio' || type === 'music') {
    return exactKeys(value, ['type', 'action'])
      && (readProperty(value, 'action') === 'play' || readProperty(value, 'action') === 'stop')
  }
  if (type === 'voice_gain' || type === 'music_gain') {
    return exactKeys(value, ['type', 'value']) && isUnitNumber(readProperty(value, 'value'))
  }
  return false
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

function getTrackedWindow(windows: TrackedWindows, kind: MirrorWindowKind): TrackedWindowLike | null {
  try {
    if (windows instanceof Map) return windows.get(kind) ?? null
    const value = readProperty(windows, kind)
    return isRecord(value) ? value as unknown as TrackedWindowLike : null
  } catch {
    return null
  }
}

function isWebContentsLike(value: unknown): value is WebContentsLike {
  if (!isRecord(value)) return false
  try {
    return typeof readProperty(value, 'id') === 'number'
      && typeof readProperty(value, 'mainFrame') !== 'undefined'
      && typeof readProperty(value, 'send') === 'function'
  } catch {
    return false
  }
}

function isDestroyed(value: unknown): boolean {
  const method = readProperty(value, 'isDestroyed')
  if (typeof method !== 'function') return false
  try {
    return method.call(value) === true
  } catch {
    return true
  }
}

function isTrackedWindowDestroyed(value: TrackedWindowLike): boolean {
  const method = readProperty(value, 'isDestroyed')
  if (typeof method === 'function') {
    try {
      if (method.call(value) === true) return true
    } catch {
      return true
    }
  }
  return isDestroyed(readProperty(value, 'webContents'))
}

function senderFromEvent(event: unknown): unknown {
  return readProperty(event, 'sender')
}

function senderFrameFromEvent(event: unknown): unknown {
  return readProperty(event, 'senderFrame')
}

function otherKind(kind: MirrorWindowKind): MirrorWindowKind {
  return kind === 'mirror' ? 'console' : 'mirror'
}

export function authorizeSender(
  event: unknown,
  expectedKind: MirrorWindowKind,
  windows: TrackedWindows,
): SenderAuthResult {
  const expectedWindow = getTrackedWindow(windows, expectedKind)
  if (expectedWindow === null) return { ok: false, reason: 'unknown_sender' }

  const sender = senderFromEvent(event)
  const expectedSender = readProperty(expectedWindow, 'webContents')
  if (!isWebContentsLike(sender) || !isWebContentsLike(expectedSender)) {
    return { ok: false, reason: 'unknown_sender' }
  }

  const knownOtherWindow = getTrackedWindow(windows, otherKind(expectedKind))
  const otherSender = knownOtherWindow === null ? null : readProperty(knownOtherWindow, 'webContents')
  if (sender !== expectedSender) {
    if (
      sender === otherSender
      || (sender.mainFrame === expectedSender.mainFrame && isWebContentsLike(sender))
    ) {
      return { ok: false, reason: 'web_contents_mismatch' }
    }
    return { ok: false, reason: 'unknown_sender' }
  }

  if (isTrackedWindowDestroyed(expectedWindow)) return { ok: false, reason: 'window_destroyed' }

  const configuredId = readProperty(expectedWindow, 'webContentsId')
  const expectedId = typeof configuredId === 'number' ? configuredId : readProperty(expectedSender, 'id')
  const senderId = readProperty(sender, 'id')
  if (
    typeof expectedId !== 'number'
    || typeof senderId !== 'number'
    || senderId !== expectedId
    || readProperty(expectedSender, 'id') !== expectedId
  ) {
    return { ok: false, reason: 'web_contents_mismatch' }
  }

  const senderFrame = senderFrameFromEvent(event)
  if (senderFrame === undefined || senderFrame !== expectedSender.mainFrame) {
    return { ok: false, reason: 'sender_frame_invalid' }
  }

  return { ok: true }
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function isValidRealtimeRuntimeOutcomeReport(value: unknown): boolean {
  if (!isPlainObject(value) || !exactKeys(value, ['status', 'operation', 'reason'])) return false
  const status = readProperty(value, 'status')
  const operation = readProperty(value, 'operation')
  const reason = readProperty(value, 'reason')
  return (
    typeof status === 'string'
    && typeof operation === 'string'
    && REALTIME_RUNTIME_OUTCOME_STATUS_VALUES.has(status as RealtimeRuntimeOutcomeStatus)
    && REALTIME_RUNTIME_OUTCOME_OPERATION_VALUES.has(operation as RealtimeRuntimeOutcomeOperation)
    && REALTIME_RUNTIME_OUTCOME_ALLOWED_STATUSES[operation as RealtimeRuntimeOutcomeOperation]?.has(
      status as RealtimeRuntimeOutcomeStatus,
    ) === true
    && typeof reason === 'string'
    && REALTIME_RUNTIME_OUTCOME_REASON_PATTERN.test(reason)
  )
}

function isValidRealtimeFailureReport(value: unknown): boolean {
  if (!isPlainObject(value) || !exactKeys(value, ['kind', 'realtimeSessionId', 'reason'])) return false
  const kind = readProperty(value, 'kind')
  const realtimeSessionId = readProperty(value, 'realtimeSessionId')
  const reason = readProperty(value, 'reason')
  return (
    typeof kind === 'string'
    && REALTIME_FAILURE_KIND_VALUES.has(kind as RealtimeFailureKind)
    && typeof realtimeSessionId === 'string'
    && SAFE_ID_PATTERN.test(realtimeSessionId)
    && typeof reason === 'string'
    && REALTIME_RUNTIME_OUTCOME_REASON_PATTERN.test(reason)
  )
}

function isValidRealtimeRendererMetadataReport(
  value: unknown,
): value is RealtimeRendererMetadataReport {
  if (!isPlainObject(value)) return false

  const hasRequiredKeys = exactKeys(value, ['kind', 'status', 'reason'])
  const hasDuration = exactKeys(value, ['kind', 'status', 'reason', 'durationMs'])
  const hasSessionId = exactKeys(value, ['kind', 'status', 'reason', 'sessionId'])
  const hasBothOptionals = exactKeys(value, ['kind', 'status', 'reason', 'durationMs', 'sessionId'])
  if (!hasRequiredKeys && !hasDuration && !hasSessionId && !hasBothOptionals) return false

  const kind = readProperty(value, 'kind')
  const status = readProperty(value, 'status')
  const reason = readProperty(value, 'reason')
  const durationMs = readProperty(value, 'durationMs')
  const sessionId = readProperty(value, 'sessionId')
  return (
    typeof kind === 'string'
    && REALTIME_RENDERER_METADATA_KIND_VALUES.has(kind as RealtimeRendererMetadataKind)
    && typeof status === 'string'
    && REALTIME_RENDERER_METADATA_STATUS_VALUES.has(status as RealtimeRendererMetadataStatus)
    && typeof reason === 'string'
    && SAFE_REASON_PATTERN.test(reason)
    && (!hasDuration
      && !hasBothOptionals
      || typeof durationMs === 'number'
        && Number.isSafeInteger(durationMs)
        && durationMs >= 0
        && durationMs <= 86_400_000)
    && (!hasSessionId
      && !hasBothOptionals
      || typeof sessionId === 'string'
        && SAFE_ID_PATTERN.test(sessionId))
  )
}

function invalidPayload(): SimulatorPayloadValidation {
  return { ok: false, reason: 'ipc_payload_invalid' }
}

function rejectedTransientSecret(
  reason:
    | 'unauthorized_sender'
    | 'broker_unavailable'
    | 'broker_failed'
    | 'session_unavailable'
    | 'invalid_payload',
): TransientRealtimeSecretResult {
  return { status: 'rejected', reason }
}

const SESSION_SNAPSHOT_KEYS = [
  'configVersion',
  'fingerprint',
  'sdkVersion',
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
  'voice',
  'reasoningEffort',
  'turnDetectionProfile',
  'takenAt',
] as const

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

const INVALID_REALTIME_SESSION_START_BUNDLE_CODE = 'invalid_realtime_session_start_bundle' as const

class InvalidRealtimeSessionStartBundleError extends Error {
  readonly code = INVALID_REALTIME_SESSION_START_BUNDLE_CODE

  constructor() {
    super('Realtime session start bundle is invalid')
    this.name = 'InvalidRealtimeSessionStartBundleError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function isValidRealtimeSessionStartBundle(
  value: unknown,
): value is RealtimeSessionStartBundle {
  if (!isRecord(value) || !exactKeys(value, ['snapshot', 'identity', 'clientSecret'])) return false

  const snapshot = readProperty(value, 'snapshot')
  if (!isRecord(snapshot) || !exactKeys(snapshot, SESSION_SNAPSHOT_KEYS)) return false
  if (
    typeof readProperty(snapshot, 'configVersion') !== 'number'
    || !Number.isSafeInteger(readProperty(snapshot, 'configVersion'))
    || (readProperty(snapshot, 'configVersion') as number) < 1
    || !nonEmptyString(readProperty(snapshot, 'sdkVersion'))
  ) {
    return false
  }
  for (const key of SESSION_SNAPSHOT_KEYS) {
    if (key === 'configVersion' || key === 'sdkVersion') continue
    if (!nonEmptyString(readProperty(snapshot, key))) return false
  }

  const identity = readProperty(value, 'identity')
  if (
    !isRecord(identity)
    || !exactKeys(identity, ['realtimeSessionId', 'sessionGeneration'])
    || !nonEmptyString(readProperty(identity, 'realtimeSessionId'))
    || typeof readProperty(identity, 'sessionGeneration') !== 'number'
    || !Number.isSafeInteger(readProperty(identity, 'sessionGeneration'))
    || (readProperty(identity, 'sessionGeneration') as number) <= 0
  ) {
    return false
  }

  const clientSecret = readProperty(value, 'clientSecret')
  if (!isRecord(clientSecret)) return false
  const hasExpiry = exactKeys(clientSecret, ['value', 'expiresAt'])
  if (!hasExpiry && !exactKeys(clientSecret, ['value'])) return false
  const secretValue = readProperty(clientSecret, 'value')
  if (typeof secretValue !== 'string' || !secretValue.startsWith('ek_') || secretValue.length <= 3) {
    return false
  }
  const expiresAt = readProperty(clientSecret, 'expiresAt')
  return !hasExpiry || (
    typeof expiresAt === 'number'
    && Number.isSafeInteger(expiresAt)
  )
}

function mapRealtimeSessionStartBundle(
  bundle: unknown,
): TransientRealtimeSecretResult {
  if (!isValidRealtimeSessionStartBundle(bundle)) {
    throw new InvalidRealtimeSessionStartBundleError()
  }

  const clientSecret = readProperty(bundle, 'clientSecret') as Record<string, unknown>
  const mappedValue: RealtimeSessionStartBundleValue = {
    snapshot: readProperty(bundle, 'snapshot') as RealtimeSessionStartBundleValue['snapshot'],
    identity: readProperty(bundle, 'identity') as RealtimeSessionStartBundleValue['identity'],
    clientSecret: readProperty(clientSecret, 'value') as TransientRealtimeSecretInput,
  }
  const expiresAt = readProperty(clientSecret, 'expiresAt')
  const value = expiresAt === undefined
    ? Object.freeze(mappedValue)
    : Object.freeze({ ...mappedValue, expiresAt: expiresAt as number })
  return {
    status: 'accepted',
    reason: 'mirror_authorized',
    value,
  }
}

export function createRealtimeIpcContract(
  options: RealtimeIpcContractOptions,
): RealtimeIpcContract {
  const handleTransientSecretRequest = async (
    request: RealtimeIpcContractRequest,
  ): Promise<TransientRealtimeSecretResult> => {
    if (readProperty(readProperty(request, 'sender'), 'identity') !== 'mirror') {
      return rejectedTransientSecret('unauthorized_sender')
    }
    try {
      return mapRealtimeSessionStartBundle(await options.issueRealtimeSessionStartBundle())
    } catch (error) {
      if (
        error instanceof InvalidRealtimeSessionStartBundleError
        && readProperty(error, 'code') === INVALID_REALTIME_SESSION_START_BUNDLE_CODE
      ) {
        return rejectedTransientSecret('invalid_payload')
      }
      if (readProperty(error, 'code') === 'realtime_session_unavailable') {
        return rejectedTransientSecret('session_unavailable')
      }
      return rejectedTransientSecret('broker_failed')
    }
  }

  return Object.freeze({
    handleTransientSecretRequest,
    mirror: Object.freeze({
      requestRealtimeClientSecret: () => handleTransientSecretRequest({
        sender: { identity: 'mirror' },
      }),
    }),
    console: Object.freeze({}),
  })
}

export function validateSimulatorPayload(value: unknown): SimulatorPayloadValidation {
  const type = readProperty(value, 'type')
  if (typeof type !== 'string') return invalidPayload()

  if (
    type === 'wake'
    || type === 'cloud_failure'
    || type === 'cloud_recovery'
    || type === 'sqlite_failure'
    || type === 'sleep'
  ) {
    return exactKeys(value, ['type'])
      ? { ok: true, value: value as SimulatorCommand }
      : invalidPayload()
  }

  if (type === 'camera_result') {
    const faces = readProperty(value, 'faces')
    if (!exactKeys(value, ['type', 'faces']) || !(faces === 0 || faces === 1 || faces === 'multiple')) {
      return invalidPayload()
    }
    return { ok: true, value: value as SimulatorCommand }
  }

  if (type === 'avatar_state') {
    const state = readProperty(value, 'state')
    if (!exactKeys(value, ['type', 'state']) || typeof state !== 'string' || !SAFE_STATE_PATTERN.test(state)) {
      return invalidPayload()
    }
    return { ok: true, value: value as SimulatorCommand }
  }

  if (type === 'scene_result') {
    const sceneId = readProperty(value, 'sceneId')
    const status = readProperty(value, 'status')
    if (
      !exactKeys(value, ['type', 'sceneId', 'status'])
      || typeof sceneId !== 'string'
      || !SAFE_ID_PATTERN.test(sceneId)
      || typeof status !== 'string'
      || !OP_STATUS_VALUES.has(status as OpStatus)
    ) {
      return invalidPayload()
    }
    return { ok: true, value: value as SimulatorCommand }
  }

  return invalidPayload()
}

function emit(telemetry: IpcEventSink, event: MetadataEvent): void {
  try {
    telemetry.emit(event)
  } catch {
    // IPC diagnostics cannot turn a sender rejection into a renderer failure.
  }
}

function senderRejected(telemetry: IpcEventSink, reason: SenderRejectionReason): void {
  emit(telemetry, {
    module: 'app',
    event: 'ipc_sender_rejected',
    status: 'failed',
    reason,
    source: 'runtime',
  })
}

function payloadRejected(telemetry: IpcEventSink): void {
  emit(telemetry, {
    module: 'app',
    event: 'ipc_payload_invalid',
    status: 'failed',
    error_code: 'ipc_payload_invalid',
    reason: 'payload_schema_invalid',
    source: 'runtime',
  })
}

function consoleFailure<T>(
  error: ConsoleErrorCode,
  reason: ConsoleReason,
): ConsoleResponse<T> {
  return { ok: false, error, reason }
}

function consoleUnavailable(telemetry: IpcEventSink): ConsoleResponse<never> {
  emit(telemetry, {
    module: 'app',
    event: 'console_request_failed',
    status: 'failed',
    error_code: 'console_not_ready',
    reason: 'cause=console_data_plane_unavailable',
    source: 'runtime',
  })
  return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
}

async function invokeConsole<T>(
  facade: ConsoleDataPlane | null,
  operation: (value: ConsoleDataPlane) => ConsoleResponse<T> | PromiseLike<ConsoleResponse<T>>,
  telemetry: IpcEventSink,
): Promise<ConsoleResponse<T>> {
  if (facade === null) return consoleUnavailable(telemetry)
  try {
    return await Promise.resolve(operation(facade))
  } catch {
    return consoleUnavailable(telemetry)
  }
}

function consoleFacade(options: RegisterIpcHandlersOptions): ConsoleDataPlane | null {
  try {
    if (options.console !== undefined) return options.console
    return options.runtime.console ?? null
  } catch {
    return null
  }
}

function rejectedSimulatorResult(): SimulatorResult {
  return { op: 'failed' }
}

function eventArgsAreEmpty(args: readonly unknown[]): boolean {
  return args.length === 0
}

function isPhaseTestPhase(value: unknown): value is PhaseTestPhase {
  return value === '0' || value === '1' || value === '2' || value === '3' || value === '4'
}

function cloneProjectedSnapshot(value: unknown): AppSnapshot {
  return projectAppSnapshot(value)
}

export async function publishSnapshot(
  kind: MirrorWindowKind,
  value: unknown,
  windows: TrackedWindows,
  telemetry: IpcEventSink,
): Promise<void> {
  const tracked = getTrackedWindow(windows, kind)
  const channel = kind === 'mirror' ? MIRROR_IPC_CHANNELS.snapshot : CONSOLE_IPC_CHANNELS.snapshot
  if (tracked === null) {
    emit(telemetry, {
      module: 'app',
      event: 'ipc_snapshot_delivery_failed',
      status: 'failed',
      error_code: 'ipc_snapshot_delivery_failed',
      reason: `window=${kind};cause=window_unknown`,
      source: 'runtime',
    })
    return
  }

  const sender = readProperty(tracked, 'webContents')
  if (!isWebContentsLike(sender) || isTrackedWindowDestroyed(tracked)) {
    emit(telemetry, {
      module: 'app',
      event: 'ipc_snapshot_delivery_failed',
      status: 'failed',
      error_code: 'ipc_snapshot_delivery_failed',
      reason: `window=${kind};cause=window_destroyed`,
      source: 'runtime',
    })
    return
  }

  let snapshot: AppSnapshot
  try {
    snapshot = cloneProjectedSnapshot(value)
  } catch {
    emit(telemetry, {
      module: 'app',
      event: 'ipc_snapshot_delivery_failed',
      status: 'failed',
      error_code: 'ipc_snapshot_delivery_failed',
      reason: `window=${kind};cause=projection_failed`,
      source: 'runtime',
    })
    return
  }
  try {
    sender.send(channel, snapshot)
  } catch {
    emit(telemetry, {
      module: 'app',
      event: 'ipc_snapshot_delivery_failed',
      status: 'failed',
      error_code: 'ipc_snapshot_delivery_failed',
      reason: `window=${kind};cause=send_failed`,
      source: 'runtime',
    })
  }
}

async function invokeSimulator(
  runtime: Pick<BootRuntime, 'handleSimulator'>,
  command: SimulatorCommand,
  telemetry: IpcEventSink,
): Promise<SimulatorResult> {
  try {
    return await runtime.handleSimulator(command)
  } catch {
    emit(telemetry, {
      module: 'app',
      event: 'ipc_dispatch_failed',
      status: 'failed',
      error_code: 'ipc_dispatch_failed',
      reason: 'cause=runtime_dispatch_failed',
      source: 'runtime',
    })
    return rejectedSimulatorResult()
  }
}

function lifecycleActionStatus(value: unknown): ConsoleLifecycleActionResult['status'] | null {
  if (value === 'ignored') return 'degraded'
  return value === 'success' || value === 'degraded' || value === 'failed'
    ? value
    : null
}

function lifecycleActionReason(value: unknown): string | null {
  return typeof value === 'string' && SAFE_REASON_PATTERN.test(value) ? value : null
}

function projectLifecycleActionResult(
  action: ConsoleLifecycleAction,
  value: unknown,
  telemetry: IpcEventSink,
): ConsoleResponse<ConsoleLifecycleActionResult> {
  const status = lifecycleActionStatus(readProperty(value, 'status'))
  const reason = lifecycleActionReason(readProperty(value, 'reason'))
  if (status === null || reason === null) {
    const fallback: ConsoleLifecycleActionResult = {
      action,
      status: 'failed',
      reason: 'cause=action_result_invalid',
    }
    emit(telemetry, {
      module: 'app',
      event: 'console_lifecycle_action',
      status: 'failed',
      error_code: 'console_lifecycle_action_failed',
      reason: `action=${action};${fallback.reason}`,
      source: 'runtime',
    })
    return { ok: true, value: fallback }
  }

  const result: ConsoleLifecycleActionResult = { action, status, reason }
  emit(telemetry, {
    module: 'app',
    event: 'console_lifecycle_action',
    status,
    reason: `action=${action};${reason}`,
    source: 'runtime',
  })
  return { ok: true, value: result }
}

async function invokeLifecycleAction(
  action: ConsoleLifecycleAction,
  operation: () => Promise<Record<string, unknown>>,
  telemetry: IpcEventSink,
): Promise<ConsoleResponse<ConsoleLifecycleActionResult>> {
  try {
    return projectLifecycleActionResult(action, await operation(), telemetry)
  } catch {
    emit(telemetry, {
      module: 'app',
      event: 'console_lifecycle_action',
      status: 'failed',
      error_code: 'console_lifecycle_action_failed',
      reason: `action=${action};cause=runtime_action_failed`,
      source: 'runtime',
    })
    return consoleFailure('console_lifecycle_action_failed', 'cause=runtime_action_failed')
  }
}

function dispatchMirrorInterrupt(windows: TrackedWindows): Record<string, unknown> {
  const tracked = getTrackedWindow(windows, 'mirror')
  if (tracked === null || isTrackedWindowDestroyed(tracked)) {
    return {
      status: 'failed',
      reason: 'cause=interrupt_dispatch_failed',
    }
  }

  const sender = readProperty(tracked, 'webContents')
  if (!isWebContentsLike(sender)) {
    return {
      status: 'failed',
      reason: 'cause=interrupt_dispatch_failed',
    }
  }

  try {
    sender.send(MIRROR_IPC_CHANNELS.interrupt)
    return {
      status: 'success',
      reason: 'cause=interrupt_dispatched',
    }
  } catch {
    return {
      status: 'failed',
      reason: 'cause=interrupt_dispatch_failed',
    }
  }
}

export type RealtimeRuntimeCommandDispatchResult =
  | Readonly<{ status: 'success'; reason: 'runtime_command_delivered' }>
  | Readonly<{ status: 'failed'; reason: 'mirror_window_missing' }>
  | Readonly<{ status: 'failed'; reason: 'mirror_window_destroyed' }>
  | Readonly<{ status: 'failed'; reason: 'runtime_command_send_failed' }>

export function dispatchMirrorRealtimeRuntimeCommand(
  command: RealtimeRuntimeCommand,
  windows: TrackedWindows,
): RealtimeRuntimeCommandDispatchResult {
  const tracked = getTrackedWindow(windows, 'mirror')
  if (tracked === null) {
    return { status: 'failed', reason: 'mirror_window_missing' }
  }
  if (isTrackedWindowDestroyed(tracked)) {
    return { status: 'failed', reason: 'mirror_window_destroyed' }
  }

  const sender = readProperty(tracked, 'webContents')
  if (!isWebContentsLike(sender)) {
    return { status: 'failed', reason: 'mirror_window_destroyed' }
  }

  const dto = Object.freeze({
    operation: command.operation,
    reason: command.reason,
  })
  try {
    sender.send(MIRROR_IPC_CHANNELS.realtimeRuntimeCommand, dto)
    return { status: 'success', reason: 'runtime_command_delivered' }
  } catch {
    return { status: 'failed', reason: 'runtime_command_send_failed' }
  }
}

function dispatchMirrorAvatarControl(
  command: AvatarControlCommand,
  windows: TrackedWindows,
): boolean {
  const tracked = getTrackedWindow(windows, 'mirror')
  if (tracked === null || isTrackedWindowDestroyed(tracked)) return false
  const sender = readProperty(tracked, 'webContents')
  if (!isWebContentsLike(sender)) return false
  try {
    sender.send(MIRROR_IPC_CHANNELS.avatarControl, Object.freeze({ ...command }))
    return true
  } catch {
    return false
  }
}

const VISUAL_PENDING_TOKEN_PATTERN = /^[a-f0-9]{24}$/

function isValidVisualAssetProbe(value: unknown): value is VisualAssetProbe {
  const hasDuration = Object.prototype.hasOwnProperty.call(
    typeof value === 'object' && value !== null ? value : {},
    'durationMs',
  )
  if (!exactKeys(value, hasDuration
    ? ['width', 'height', 'durationMs', 'audioTrack']
    : ['width', 'height', 'audioTrack'])) return false
  const width = readProperty(value, 'width')
  const height = readProperty(value, 'height')
  const audioTrack = readProperty(value, 'audioTrack')
  if (
    typeof width !== 'number' || !Number.isSafeInteger(width) || width < 1 || width > 4096
    || typeof height !== 'number' || !Number.isSafeInteger(height) || height < 1 || height > 4096
    || (audioTrack !== 'present' && audioTrack !== 'absent' && audioTrack !== 'unknown')
  ) return false
  if (!hasDuration) return audioTrack === 'absent'
  const durationMs = readProperty(value, 'durationMs')
  return typeof durationMs === 'number' && Number.isSafeInteger(durationMs)
    && durationMs >= 1 && durationMs <= 10 * 60_000
}

function isValidSceneActionRendererReport(value: unknown): value is SceneActionRendererReport {
  const status = readProperty(value, 'status')
  const errorCode = readProperty(value, 'errorCode')
  const expectedKeys = status === 'failed' || status === 'timeout'
    ? ['runId', 'sceneId', 'stageId', 'actionId', 'status', 'errorCode']
    : ['runId', 'sceneId', 'stageId', 'actionId', 'status']
  return exactKeys(value, expectedKeys)
    && ['runId', 'sceneId', 'stageId', 'actionId'].every((key) =>
      SAFE_ID_PATTERN.test(readProperty(value, key) as string))
    && SCENE_RENDERER_REPORT_STATUSES.has(status as string)
    && (errorCode === undefined || REALTIME_RUNTIME_OUTCOME_REASON_PATTERN.test(errorCode as string))
}

function isValidSceneVisualPlaybackReport(value: unknown): value is SceneVisualPlaybackReport {
  const type = readProperty(value, 'type')
  const expectedKeys = type === 'playing'
    ? ['runId', 'sceneId', 'stageId', 'actionId', 'type', 'durationMs']
    : type === 'progress'
      ? ['runId', 'sceneId', 'stageId', 'actionId', 'type', 'currentTimeMs']
      : type === 'failed'
        ? ['runId', 'sceneId', 'stageId', 'actionId', 'type', 'errorCode']
        : ['runId', 'sceneId', 'stageId', 'actionId', 'type']
  if (!exactKeys(value, expectedKeys)) return false
  if (!['runId', 'sceneId', 'stageId', 'actionId'].every((key) =>
    SAFE_ID_PATTERN.test(readProperty(value, key) as string))) return false
  if (type === 'ready' || type === 'ended') return true
  if (type === 'playing') {
    const durationMs = readProperty(value, 'durationMs')
    return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 1
  }
  if (type === 'progress') {
    const currentTimeMs = readProperty(value, 'currentTimeMs')
    return typeof currentTimeMs === 'number' && Number.isFinite(currentTimeMs) && currentTimeMs >= 0
  }
  return type === 'failed'
    && REALTIME_RUNTIME_OUTCOME_REASON_PATTERN.test(readProperty(value, 'errorCode') as string)
}

function sceneRendererCommand(
  action: SceneActionDefinition,
  context: SceneActionCommandContext,
): AvatarControlCommand | null {
  if (action.kind === 'avatar_dialogue') {
    return { type: 'scene_dialogue', text: action.text, context }
  }
  if (action.kind === 'avatar_motion') {
    return { type: 'motion', group: action.motionGroup, context }
  }
  if (action.kind === 'avatar_expression') {
    return { type: 'expression', name: action.expression, context }
  }
  if (action.kind === 'music') {
    if (action.command === 'play') {
      return {
        type: 'scene_music',
        action: 'play',
        assetId: action.assetId,
        gain: action.gain,
        loop: action.loop,
        context,
      }
    }
    if (action.command === 'stop') {
      return {
        type: 'scene_music',
        action: 'stop',
        fadeDurationMs: action.fadeDurationMs,
        context,
      }
    }
    return {
      type: 'scene_music',
      action: 'fade',
      targetGain: action.targetGain,
      durationMs: action.durationMs,
      context,
    }
  }
  if (action.kind === 'visual') {
    return {
      type: 'scene_visual',
      action: 'start',
      assetId: action.assetId,
      fit: action.fit,
      playback: action.playback,
      audio: action.audio,
      gain: action.gain,
      context,
    }
  }
  return null
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): SceneRuntimeControl {
  const { ipcMain, runtime, windows, telemetry } = options
  let avatarRuntime: AvatarRuntimeSnapshot = Object.freeze({
    status: 'not_ready',
    reason: 'avatar_renderer_not_ready',
    state: 'Dormant',
    fps: 0,
    waveform: 0,
    mouthOpen: 0,
    audioUnderruns: 0,
    voiceGain: 1,
    musicGain: 1,
  })
  let cachedSceneRuntime: { readonly configVersion: number; readonly value: SceneRuntime } | null = null
  let unavailableSceneRunSequence = 0

  const unavailableSceneResult = (): SceneStartResult => ({
    runId: 'scene-unavailable-' + String(++unavailableSceneRunSequence),
    status: 'skipped',
    skipReason: 'invalid_config',
  })

  const dispatchSceneStatus = (status: SceneStatusEvent): void => {
    for (const kind of ['mirror', 'console'] as const) {
      const tracked = getTrackedWindow(windows, kind)
      if (tracked === null || isTrackedWindowDestroyed(tracked)) continue
      const sender = readProperty(tracked, 'webContents')
      if (!isWebContentsLike(sender)) continue
      try {
        sender.send(kind === 'mirror' ? MIRROR_IPC_CHANNELS.sceneStatus : CONSOLE_IPC_CHANNELS.sceneStatus, status)
      } catch {
        emit(telemetry, {
          module: 'lighting',
          event: 'scene_status_delivery_failed',
          status: 'degraded',
          reason: `window=${kind};cause=send_failed`,
          source: 'runtime',
        })
      }
    }
  }

  const onSceneRuntimeEvent = (event: SceneRuntimeEvent): void => {
    if (event.type === 'diagnostic') {
      emit(telemetry, {
        module: event.category === 'visual' ? 'avatar' : 'lighting',
        event: 'scene_runtime_diagnostic',
        status: 'degraded',
        reason: event.reason,
        ...(event.sceneId === undefined ? {} : { scene_id: event.sceneId }),
        source: 'runtime',
      })
      return
    }
    dispatchSceneStatus(event)
    if (event.type === 'finished') emitSceneResult(event.result, 'runtime')
  }

  const loadSceneRuntime = async (): Promise<{
    readonly config: Readonly<Pick<
      MirrorConfig,
      'configVersion' | 'wake' | 'visualAssets' | 'musicAssets' | 'sceneActions' | 'spells' | 'scenes' | 'adapters'
    >>
    readonly value: SceneRuntime
  } | null> => {
    const getConfig = runtime.getPublishedSceneConfigForRuntime
    if (getConfig === undefined) return null
    let config: Awaited<ReturnType<NonNullable<typeof getConfig>>>
    try {
      config = await getConfig()
    } catch {
      return null
    }
    if (cachedSceneRuntime?.configVersion === config.configVersion) {
      return { config, value: cachedSceneRuntime.value }
    }
    if (cachedSceneRuntime !== null) await cachedSceneRuntime.value.stopAll()

    const physicalAdapter = (kind: 'lighting' | 'fog'): PhysicalSceneAdapter =>
      config.adapters[kind] === 'mock'
        ? createMockPhysicalAdapter(kind, { behavior: 'success' })
        : createUnavailablePhysicalAdapter(kind)
    const lighting = physicalAdapter('lighting')
    const fog = physicalAdapter('fog')
    const value = createSceneRuntime({
      spells: config.spells,
      scenes: config.scenes,
      actions: config.sceneActions,
      visualAssets: config.visualAssets,
      eventSink: onSceneRuntimeEvent,
      executor: {
        dispatch(action, actionContext, signal) {
          if (action.kind === 'lighting' || action.kind === 'fog') {
            const adapter = action.kind === 'lighting' ? lighting : fog
            return {
              status: 'dispatched',
              feedback: adapter.execute(action, signal),
            }
          }
          const context: SceneActionCommandContext = { ...actionContext, actionId: action.id }
          const command = sceneRendererCommand(action, context)
          if (command === null) {
            return { status: 'failed', errorCode: 'scene_renderer_unavailable' }
          }
          if (!dispatchMirrorAvatarControl(command, windows)) {
            return { status: 'failed', errorCode: 'scene_renderer_unavailable' }
          }
          return { status: 'dispatched' }
        },
        async release(category, context) {
          if (category === 'lighting') return lighting.stopAll()
          if (category === 'fog') return fog.stopAll()
          const delivered = category === 'music'
            ? dispatchMirrorAvatarControl({ type: 'scene_music', action: 'stop', fadeDurationMs: 0 }, windows)
            : dispatchMirrorAvatarControl({
                type: 'scene_visual', action: 'stop', runId: context.runId, sceneId: context.sceneId,
              }, windows)
          if (!delivered) throw new Error('scene_renderer_unavailable')
        },
        async stopAll() {
          await Promise.allSettled([lighting.stopAll(), fog.stopAll()])
          const musicStopped = dispatchMirrorAvatarControl({
            type: 'scene_music',
            action: 'stop',
            fadeDurationMs: 0,
          }, windows)
          const visualStopped = dispatchMirrorAvatarControl({
            type: 'scene_visual', action: 'stop', runId: 'all', sceneId: 'all',
          }, windows)
          if (!musicStopped || !visualStopped) throw new Error('scene_renderer_unavailable')
        },
      },
    })
    cachedSceneRuntime = { configVersion: config.configVersion, value }
    return { config, value }
  }

  const emitSceneResult = (result: SceneRunResult, source: 'runtime' | 'simulator'): void => {
    emit(telemetry, {
      module: 'lighting',
      event: 'scene_run_finished',
      status: result.status === 'completed'
        ? 'success'
        : result.status === 'partial_failure' || result.status === 'skipped'
          ? 'degraded'
          : 'failed',
      duration_ms: result.durationMs,
      ...(result.sceneId === undefined ? {} : { scene_id: result.sceneId }),
      ...(result.skipReason === undefined ? {} : { reason: result.skipReason }),
      source,
    })
  }
  const realtimeIpcContract = createRealtimeIpcContract({
    issueRealtimeSessionStartBundle: () => {
      const issue = runtime.requestRealtimeClientSecret
      if (issue === undefined) return Promise.reject(new Error('realtime_client_secret_unavailable'))
      return issue()
    },
  })

  ipcMain.handle(MIRROR_IPC_CHANNELS.requestRealtimeClientSecret, async (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return rejectedTransientSecret('unauthorized_sender')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return rejectedTransientSecret('invalid_payload')
    }

    const issue = runtime.requestRealtimeClientSecret
    if (issue === undefined) return rejectedTransientSecret('broker_unavailable')

    return realtimeIpcContract.handleTransientSecretRequest({
      sender: { identity: 'mirror' },
    })
  })

  ipcMain.on(MIRROR_IPC_CHANNELS.reportRealtimeRuntimeOutcome, (event, ...args) => {
    try {
      const authorization = authorizeSender(event, 'mirror', windows)
      if (!authorization.ok) {
        senderRejected(telemetry, authorization.reason)
        return
      }
      if (args.length !== 1 || !isValidRealtimeRuntimeOutcomeReport(args[0])) {
        payloadRejected(telemetry)
        return
      }

      const report = args[0]
      const status = readProperty(report, 'status') as RealtimeRuntimeOutcomeStatus
      const operation = readProperty(report, 'operation') as RealtimeRuntimeOutcomeOperation
      const reason = readProperty(report, 'reason') as string
      emit(telemetry, {
        module: 'openai',
        event: `realtime_runtime_${operation}`,
        status: status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'info',
        reason,
        source: 'runtime',
      })
      const handleOutcome = runtime.handleRealtimeRuntimeOutcome
      if (handleOutcome === undefined) return
      try {
        const result = handleOutcome(report as RealtimeRuntimeOutcomeReport)
        if (isRecord(result) && typeof readProperty(result, 'then') === 'function') {
          void Promise.resolve(result).catch(() => {
            emit(telemetry, {
              module: 'openai',
              event: 'realtime_runtime_outcome_handler_failed',
              status: 'failed',
              error_code: 'realtime_runtime_outcome_handler_failed',
              reason: 'cause=handler_failed',
              source: 'runtime',
            })
          })
        }
      } catch {
        emit(telemetry, {
          module: 'openai',
          event: 'realtime_runtime_outcome_handler_failed',
          status: 'failed',
          error_code: 'realtime_runtime_outcome_handler_failed',
          reason: 'cause=handler_failed',
          source: 'runtime',
        })
      }
    } catch {
      payloadRejected(telemetry)
    }
  })

  ipcMain.on(MIRROR_IPC_CHANNELS.reportAvatarRuntime, (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return
    }
    if (args.length !== 1 || !isValidAvatarRuntimeSnapshot(args[0])) {
      payloadRejected(telemetry)
      return
    }
    avatarRuntime = Object.freeze({ ...(args[0] as AvatarRuntimeSnapshot) })
  })

  ipcMain.on(MIRROR_IPC_CHANNELS.reportSceneAction, (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return
    }
    if (args.length !== 1 || !isValidSceneActionRendererReport(args[0])) {
      payloadRejected(telemetry)
      return
    }
    const report = args[0] as SceneActionRendererReport
    void loadSceneRuntime().then((loaded) => loaded?.value.reportAction(report))
  })

  ipcMain.on(MIRROR_IPC_CHANNELS.reportSceneVisual, (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return
    }
    if (args.length !== 1 || !isValidSceneVisualPlaybackReport(args[0])) {
      payloadRejected(telemetry)
      return
    }
    const report = args[0] as SceneVisualPlaybackReport
    void loadSceneRuntime().then((loaded) => loaded?.value.reportVisual(report))
  })

  ipcMain.on(MIRROR_IPC_CHANNELS.reportRealtimeMetadata, (event, ...args) => {
    try {
      const authorization = authorizeSender(event, 'mirror', windows)
      if (!authorization.ok) {
        senderRejected(telemetry, authorization.reason)
        return
      }
      if (args.length !== 1 || !isValidRealtimeRendererMetadataReport(args[0])) {
        payloadRejected(telemetry)
        return
      }

      const report = args[0]
      const kind = readProperty(report, 'kind') as RealtimeRendererMetadataKind
      const status = readProperty(report, 'status') as RealtimeRendererMetadataStatus
      const reason = readProperty(report, 'reason') as string
      const durationMs = readProperty(report, 'durationMs')
      const sessionId = readProperty(report, 'sessionId')
      emit(telemetry, {
        module: kind === 'avatar' ? 'avatar' : 'openai',
        event: REALTIME_RENDERER_METADATA_EVENTS[kind],
        status,
        reason,
        source: 'runtime',
        ...(durationMs === undefined ? {} : { duration_ms: durationMs as number }),
        ...(sessionId === undefined ? {} : { session_id: sessionId as string }),
      })
      if (status === 'success' && kind === 'transcript') {
        runtime.noteRealtimeActivity?.('user_turn', sessionId as string | undefined)
      } else if (
        kind === 'session' && status === 'success' && typeof sessionId === 'string'
        && (reason === 'cause=output_started' || reason === 'cause=output_stopped' || reason === 'cause=output_interrupted')
      ) {
        runtime.noteRealtimeActivity?.(reason === 'cause=output_started' ? 'assistant_playback_started' : 'assistant_playback', sessionId)
      }
    } catch {
      payloadRejected(telemetry)
    }
  })

  ipcMain.on(MIRROR_IPC_CHANNELS.sleepRequest, (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return
    }
    try {
      const result = runtime.requestSleep?.()
      void Promise.resolve(result).catch(() => undefined)
    } catch {
      // The runtime emits the bounded failure outcome.
    }
  })

  ipcMain.on(MIRROR_IPC_CHANNELS.reportRealtimeFailure, (event, ...args) => {
    try {
      const authorization = authorizeSender(event, 'mirror', windows)
      if (!authorization.ok) {
        senderRejected(telemetry, authorization.reason)
        return
      }
      if (args.length !== 1 || !isValidRealtimeFailureReport(args[0])) {
        payloadRejected(telemetry)
        return
      }

      const source = args[0]
      const report: RealtimeFailureReport = Object.freeze({
        kind: readProperty(source, 'kind') as RealtimeFailureKind,
        realtimeSessionId: readProperty(source, 'realtimeSessionId') as string,
        reason: readProperty(source, 'reason') as string,
      })
      emit(telemetry, {
        module: 'openai',
        event: 'realtime_failure_reported',
        status: 'failed',
        reason: `failure_kind=${report.kind};cause=${report.reason}`,
        source: 'runtime',
        session_id: report.realtimeSessionId,
      })

      const handleFailure = runtime.handleRealtimeFailure
      if (handleFailure === undefined) return
      try {
        const result = handleFailure(report)
        if (isRecord(result) && typeof readProperty(result, 'then') === 'function') {
          void Promise.resolve(result).catch(() => {
            emit(telemetry, {
              module: 'openai',
              event: 'realtime_failure_handler_failed',
              status: 'failed',
              error_code: 'realtime_failure_handler_failed',
              reason: 'cause=handler_failed',
              source: 'runtime',
            })
          })
        }
      } catch {
        emit(telemetry, {
          module: 'openai',
          event: 'realtime_failure_handler_failed',
          status: 'failed',
          error_code: 'realtime_failure_handler_failed',
          reason: 'cause=handler_failed',
          source: 'runtime',
        })
      }
    } catch {
      payloadRejected(telemetry)
    }
  })

  ipcMain.handle('mirror:get-audio-preferences', (event, ...args) => {
    if (!authorizeSender(event, 'mirror', windows).ok || !eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      throw new Error('audio_preferences_request_rejected')
    }
    return getAudioPreferences()
  })

  ipcMain.handle(MIRROR_IPC_CHANNELS.getSnapshot, (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return null
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return null
    }
    return projectAppSnapshot(runtime.snapshot())
  })

  ipcMain.handle(MIRROR_IPC_CHANNELS.getSceneCatalog, async (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return { configVersion: 0, stopPhrase: '', spells: [] } satisfies ScenePublicCatalog
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return { configVersion: 0, stopPhrase: '', spells: [] } satisfies ScenePublicCatalog
    }
    const loaded = await loadSceneRuntime()
    if (loaded === null) return { configVersion: 0, stopPhrase: '', spells: [] }
    return {
      configVersion: loaded.config.configVersion,
      stopPhrase: loaded.config.wake.phrase,
      spells: loaded.config.spells
        .filter((spell) => spell.enabled)
        .map((spell) => ({ id: spell.id, phrase: spell.phrase })),
    } satisfies ScenePublicCatalog
  })

  ipcMain.handle(MIRROR_IPC_CHANNELS.triggerScene, async (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return unavailableSceneResult()
    }
    const request = args[0]
    if (
      args.length !== 1
      || !exactKeys(request, ['spellId', 'turnId'])
      || !SAFE_ID_PATTERN.test(readProperty(request, 'spellId') as string)
      || !SAFE_ID_PATTERN.test(readProperty(request, 'turnId') as string)
    ) {
      payloadRejected(telemetry)
      return unavailableSceneResult()
    }
    const loaded = await loadSceneRuntime()
    if (loaded === null) return unavailableSceneResult()
    const result = await loaded.value.triggerSpell({
      spellId: readProperty(request, 'spellId') as string,
      turnId: readProperty(request, 'turnId') as string,
    })
    return result
  })

  ipcMain.handle(MIRROR_IPC_CHANNELS.stopScene, async (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return 'stale' as const
    }
    const request = args[0]
    if (
      args.length !== 1
      || !exactKeys(request, ['runId', 'turnId'])
      || !SAFE_ID_PATTERN.test(readProperty(request, 'runId') as string)
      || !SAFE_ID_PATTERN.test(readProperty(request, 'turnId') as string)
    ) {
      payloadRejected(telemetry)
      return 'stale' as const
    }
    const loaded = await loadSceneRuntime()
    if (loaded === null) return 'stale' as const
    return loaded.value.stopRun({
      runId: readProperty(request, 'runId') as string,
      turnId: readProperty(request, 'turnId') as string,
    })
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.getSnapshot, (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return null
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return null
    }
    return projectAppSnapshot(runtime.snapshot())
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.simulate, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return rejectedSimulatorResult()
    }
    if (args.length !== 1) {
      payloadRejected(telemetry)
      return rejectedSimulatorResult()
    }
    const validation = validateSimulatorPayload(args[0])
    if (!validation.ok) {
      payloadRejected(telemetry)
      return rejectedSimulatorResult()
    }
    return invokeSimulator(runtime, validation.value, telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.startConversation, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeLifecycleAction('start_conversation', () => runtime.manualStart(), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.disconnect, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeLifecycleAction('disconnect', () => runtime.manualStop(), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.interrupt, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeLifecycleAction('interrupt', async () => dispatchMirrorInterrupt(windows), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.overview, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.getOverview(), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.avatarRuntime, (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return { ok: true, value: avatarRuntime }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.avatarControl, (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (args.length !== 1 || !validateAvatarControl(args[0])) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    if (args[0].type === 'audio_devices') {
      try { saveAudioPreferences(args[0].preferences) } catch {
        emit(telemetry, { module: 'audio', event: 'audio_preferences_save_failed', status: 'failed', reason: 'audio_preferences_save_failed', source: 'runtime' })
        return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
      }
    }
    if (!dispatchMirrorAvatarControl(args[0], windows)) {
      emit(telemetry, {
        module: 'avatar',
        event: 'avatar_control_dispatch_failed',
        status: 'failed',
        reason: 'mirror_window_unavailable',
        source: 'runtime',
      })
      return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    }
    return { ok: true, value: avatarRuntime }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.runScene, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (args.length !== 1 || !SAFE_ID_PATTERN.test(args[0] as string)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    const loaded = await loadSceneRuntime()
    if (loaded === null) {
      return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    }
    const result = await loaded.value.runScene(args[0] as string)
    return { ok: true, value: result }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.stopScenes, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    const loaded = await loadSceneRuntime()
    if (loaded === null) {
      return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    }
    await loaded.value.stopAll()
    return { ok: true, value: { status: 'stopped' as const } }
  })

  ipcMain.handle('console:import-media', async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) { senderRejected(telemetry, authorization.reason); return consoleFailure('console_request_rejected', 'cause=sender_rejected') }
    const request = args[0]
    if (args.length !== 1 || !exactKeys(request, ['kind', 'multiple'])
      || !['all', 'visual', 'music'].includes(readProperty(request, 'kind') as string)
      || typeof readProperty(request, 'multiple') !== 'boolean') {
      payloadRejected(telemetry); return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    if (!options.importMedia) return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    try { return { ok: true, value: await options.importMedia(request as import('../shared/media-import').MediaImportRequest) } }
    catch { return consoleFailure('console_request_rejected', 'cause=runtime_action_failed') }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.uploadMusic, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    const importer = options.importMusicAsset
    if (importer === undefined) {
      return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    }
    try {
      return { ok: true, value: await importer() }
    } catch {
      emit(telemetry, {
        module: 'music',
        event: 'music_asset_import_failed',
        status: 'failed',
        error_code: 'music_asset_import_failed',
        reason: 'cause=import_failed',
        source: 'runtime',
      })
      return consoleFailure('console_request_rejected', 'cause=runtime_action_failed')
    }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.uploadVisual, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    if (options.importVisualAsset === undefined) {
      return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    }
    try {
      return { ok: true, value: await options.importVisualAsset() }
    } catch {
      emit(telemetry, {
        module: 'avatar',
        event: 'visual_asset_import_failed',
        status: 'failed',
        error_code: 'visual_asset_import_failed',
        reason: 'cause=import_failed',
        source: 'runtime',
      })
      return consoleFailure('console_request_rejected', 'cause=runtime_action_failed')
    }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.finalizeVisual, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    const request = args[0]
    if (
      args.length !== 1
      || !exactKeys(request, ['token', 'probe'])
      || !VISUAL_PENDING_TOKEN_PATTERN.test(readProperty(request, 'token') as string)
      || !isValidVisualAssetProbe(readProperty(request, 'probe'))
    ) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    if (options.finalizeVisualAsset === undefined) {
      return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    }
    try {
      return {
        ok: true,
        value: await options.finalizeVisualAsset({
          token: readProperty(request, 'token') as string,
          probe: structuredClone(readProperty(request, 'probe')) as VisualAssetProbe,
        }),
      }
    } catch {
      emit(telemetry, {
        module: 'avatar',
        event: 'visual_asset_finalize_failed',
        status: 'failed',
        error_code: 'visual_asset_finalize_failed',
        reason: 'cause=probe_or_storage_failed',
        source: 'runtime',
      })
      return consoleFailure('console_request_rejected', 'cause=runtime_action_failed')
    }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.cancelVisual, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    const request = args[0]
    if (
      args.length !== 1
      || !exactKeys(request, ['token'])
      || !VISUAL_PENDING_TOKEN_PATTERN.test(readProperty(request, 'token') as string)
    ) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    if (options.cancelVisualAsset === undefined) {
      return consoleFailure('console_not_ready', 'cause=console_data_plane_unavailable')
    }
    try {
      await options.cancelVisualAsset(readProperty(request, 'token') as string)
      return { ok: true, value: { status: 'cancelled' as const } }
    } catch {
      return consoleFailure('console_request_rejected', 'cause=runtime_action_failed')
    }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.events, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (args.length > 1) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    const request = args.length === 0 ? undefined : args[0]
    return invokeConsole(consoleFacade(options), (facade) => facade.getEvents(request), telemetry)
  })

  ipcMain.handle('mirror:get-presentation', async (event, ...args) => {
    const authorization = authorizeSender(event, 'mirror', windows)
    if (!authorization.ok) { senderRejected(telemetry, authorization.reason); return null }
    if (!eventArgsAreEmpty(args)) { payloadRejected(telemetry); return null }
    const response = await invokeConsole(consoleFacade(options), facade => facade.getConfig(), telemetry)
    if (!response.ok) return null
    const config = response.value.active.presentation
    if (!config) return null
    const asset = response.value.active.visualAssets.find(asset => asset.id === config.backgroundId)
    return { config: structuredClone(config), background: asset ? { id: asset.id, kind: asset.kind } : null }
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.config, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.getConfig(), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.models, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.getModels(), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.saveModelDraft, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (args.length !== 1) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.saveModelDraft(args[0]), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.saveDraft, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (args.length !== 1) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.saveDraft(args[0]), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.testDraft, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.testDraft(), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.publish, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (args.length !== 1) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.publish(args[0]), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.rollback, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (args.length !== 1) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.rollback(args[0]), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.nextRuntime, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.createNextRuntimeSnapshots(), telemetry)
  })

  ipcMain.handle(CONSOLE_IPC_CHANNELS.phaseTests, async (event, ...args) => {
    const authorization = authorizeSender(event, 'console', windows)
    if (!authorization.ok) {
      senderRejected(telemetry, authorization.reason)
      return consoleFailure('console_request_rejected', 'cause=sender_rejected')
    }
    const phase = args[0]
    if (args.length === 0) {
      return invokeConsole(consoleFacade(options), (facade) => facade.getPhaseTests(), telemetry)
    }
    if (args.length !== 1 || !isPhaseTestPhase(phase)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.getPhaseTests(phase), telemetry)
  })

  ipcMain.on(CONSOLE_IPC_CHANNELS.ready, (event, ...args) => {
    const mirrorAuthorization = authorizeSender(event, 'mirror', windows)
    if (mirrorAuthorization.ok) {
      if (!eventArgsAreEmpty(args)) {
        payloadRejected(telemetry)
        return
      }
      options.onReady?.('mirror')
      void publishSnapshot('mirror', runtime.snapshot(), windows, telemetry)
      return
    }

    const consoleAuthorization = authorizeSender(event, 'console', windows)
    if (consoleAuthorization.ok) {
      if (!eventArgsAreEmpty(args)) {
        payloadRejected(telemetry)
        return
      }
      options.onReady?.('console')
      void publishSnapshot('console', runtime.snapshot(), windows, telemetry)
      return
    }

    senderRejected(telemetry, mirrorAuthorization.reason === 'unknown_sender'
      ? consoleAuthorization.reason
      : mirrorAuthorization.reason)
  })

  return Object.freeze({
    async stopAll(): Promise<void> {
      await cachedSceneRuntime?.value.stopAll()
    },
  })
}
