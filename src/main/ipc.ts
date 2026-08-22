import type {
  AppSnapshot,
  MirrorEvent,
  OpStatus,
  SimulatorCommand,
  SimulatorResult,
} from '../shared/types'
import type {
  ConsoleChannelMap,
  MirrorChannelMap,
  MirrorWindowKind,
  TransientRealtimeSecretInput,
  TransientRealtimeSecretResult,
} from '../shared/bridge'
import type {
  ConsoleErrorCode,
  ConsoleLifecycleAction,
  ConsoleLifecycleActionResult,
  ConsoleReason,
  ConsoleResponse,
} from '../shared/console-types'
import { projectAppSnapshot, type BootRuntime } from './boot'
import type { ConsoleDataPlane } from './console-data'
import type { ClientSecretIssueResult } from './realtime/client-secret-broker'

export const MIRROR_IPC_CHANNELS: MirrorChannelMap = Object.freeze({
  getSnapshot: 'mirror:get-snapshot',
  snapshot: 'mirror:snapshot',
  requestRealtimeClientSecret: 'mirror:request-realtime-client-secret',
  interrupt: 'mirror:interrupt',
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
    readonly requestRealtimeClientSecret?: () => Promise<ClientSecretIssueResult>
  }
  readonly console?: ConsoleDataPlane
  readonly windows: TrackedWindows
  readonly telemetry: IpcEventSink
  readonly onReady?: (kind: MirrorWindowKind) => void
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
  readonly getTransientSecret: () => Promise<TransientRealtimeSecretInput>
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

function invalidPayload(): SimulatorPayloadValidation {
  return { ok: false, reason: 'ipc_payload_invalid' }
}

function rejectedTransientSecret(
  reason: 'unauthorized_sender' | 'broker_unavailable' | 'broker_failed' | 'invalid_payload',
): TransientRealtimeSecretResult {
  return { status: 'rejected', reason }
}

export function createRealtimeIpcContract(
  options: RealtimeIpcContractOptions,
): RealtimeIpcContract {
  const handleTransientSecretRequest = async (
    request: RealtimeIpcContractRequest,
  ): Promise<TransientRealtimeSecretResult> => {
    if (request.sender.identity !== 'mirror') return rejectedTransientSecret('unauthorized_sender')
    try {
      const issued = await options.getTransientSecret()
      return {
        status: 'accepted',
        reason: 'mirror_authorized',
        value: issued,
      }
    } catch {
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

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { ipcMain, runtime, windows, telemetry } = options

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

    try {
      const result = await issue()
      if (typeof result.value !== 'string' || result.value.length === 0) {
        return rejectedTransientSecret('broker_failed')
      }
      const response = {
        status: 'accepted' as const,
        reason: 'mirror_authorized' as const,
        value: result.value as TransientRealtimeSecretInput,
      }
      return typeof result.expiresAt === 'number' && Number.isSafeInteger(result.expiresAt)
        ? { ...response, expiresAt: result.expiresAt }
        : response
    } catch {
      return rejectedTransientSecret('broker_failed')
    }
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
    if (!eventArgsAreEmpty(args)) {
      payloadRejected(telemetry)
      return consoleFailure('console_request_invalid', 'cause=payload_schema_invalid')
    }
    return invokeConsole(consoleFacade(options), (facade) => facade.getPhaseTests(), telemetry)
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
}
