import {
  RealtimeAgent,
  RealtimeSession,
  type RealtimeSessionOptions,
} from '@openai/agents/realtime'
import type { SessionModelSnapshot } from '../../shared/types'
import {
  REALTIME_METADATA_REASONS,
  type RealtimeMetadataEvent,
  type RealtimeMetadataEventSink,
  type RealtimeMetadataReason,
  type RealtimeFailureCallback,
} from '../../shared/realtime-events'
import type { RealtimeFailureInput } from '../../shared/realtime-recovery'
import {
  createWebRtcRealtimeTransport,
  type RealtimeTransportFactory,
} from './realtime-transport'

type SessionEventListener = (...args: unknown[]) => void
type OutputAudioBufferStoppedListener = () => void
type InputTranscriptCompletedListener = (transcript: string) => void

interface OutputAudioBufferStoppedSubscription {
  readonly listener: OutputAudioBufferStoppedListener
}
interface SessionLike {
  connect(options: { readonly apiKey: string }): void | PromiseLike<void>
  interrupt(): void | PromiseLike<void>
  close(): void | PromiseLike<void>
  on(eventName: string, listener: SessionEventListener): unknown
}

type RealtimeConnectFailureToken =
  | 'start_connect_credential_missing'
  | 'start_connect_ephemeral_key_required'
  | 'start_connect_setup_closed'
  | 'start_connect_sdp_offer_failed'
  | 'start_connect_sdp_answer_failed'
  | 'start_connect_bad_request'
  | 'start_connect_auth_failed'
  | 'start_connect_permission_failed'
  | 'start_connect_not_found'
  | 'start_connect_rate_limited'
  | 'start_connect_service_unavailable'
  | 'start_connect_network_failed'
  | 'start_connect_transport_failed'

const NETWORK_CODES = new Set([
  'eai_again',
  'econnrefused',
  'econnreset',
  'enetunreach',
  'enotfound',
  'etimedout',
  'err_connection_closed',
  'err_connection_reset',
  'err_internet_disconnected',
  'err_network',
  'und_err_connect_timeout',
  'und_err_socket',
])

export interface RealtimeSessionDependencies {
  readonly RealtimeAgent?: typeof RealtimeAgent
  readonly RealtimeSession?: typeof RealtimeSession
  readonly createTransport?: RealtimeTransportFactory
}

export interface CreateRealtimeSessionInput {
  readonly snapshot: SessionModelSnapshot
  readonly clientSecret: string
  readonly mediaStream: MediaStream
  readonly audioElement: HTMLAudioElement
  readonly sessionId: string
  readonly sessionGeneration?: number
  readonly eventSink: RealtimeMetadataEventSink
  readonly onFailure?: RealtimeFailureCallback
  readonly dependencies?: RealtimeSessionDependencies
}

export interface RealtimeSessionHandle {
  readonly realtimeSessionId: string
  readonly sessionGeneration: number
  readonly getLastConnectFailureToken?: () => string | undefined
  connect(): Promise<void>
  interrupt(): Promise<void>
  close(reason: string): Promise<void>
  onOutputAudioBufferStopped(listener: OutputAudioBufferStoppedListener): () => void
  onInputTranscriptCompleted?(listener: InputTranscriptCompletedListener): () => void
}

export class RealtimeSessionAdapterError extends Error {
  readonly reason: string

  constructor(reason: string) {
    super('Realtime session operation failed')
    this.name = 'RealtimeSessionAdapterError'
    this.reason = reason
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

let sessionGenerationCounter = 0

function nextSessionGeneration(): number {
  sessionGenerationCounter = sessionGenerationCounter >= Number.MAX_SAFE_INTEGER
    ? 1
    : sessionGenerationCounter + 1
  return sessionGenerationCounter
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

function configuredTurnDetection(profile: string): {
  readonly type: 'semantic_vad' | 'server_vad'
  readonly eagerness?: 'low'
  readonly threshold?: 0.7
  readonly prefixPaddingMs?: 300
  readonly silenceDurationMs?: 900
  readonly createResponse?: true
  readonly interruptResponse: true
} {
  if (profile === 'semantic-vad-interruptible') {
    return Object.freeze({ type: 'semantic_vad', interruptResponse: true })
  }
  if (profile === 'semantic-vad-strict') {
    return Object.freeze({
      type: 'semantic_vad',
      eagerness: 'low',
      createResponse: true,
      interruptResponse: true,
    })
  }
  if (profile === 'server-vad-noisy') {
    return Object.freeze({
      type: 'server_vad',
      threshold: 0.7,
      prefixPaddingMs: 300,
      silenceDurationMs: 900,
      createResponse: true,
      interruptResponse: true,
    })
  }
  throw new RealtimeSessionAdapterError('unknown_turn_detection_profile')
}

function metadataEvent(
  input: CreateRealtimeSessionInput,
  event: RealtimeMetadataEvent['event'],
  status: RealtimeMetadataEvent['status'],
  reason: RealtimeMetadataReason,
  sessionGeneration: number,
  createdAt: number,
): RealtimeMetadataEvent {
  const elapsed = Date.now() - createdAt
  return {
    event,
    realtimeSessionId: input.sessionId,
    sessionGeneration,
    configVersion: input.snapshot.configVersion,
    fingerprint: input.snapshot.fingerprint,
    sdkVersion: input.snapshot.sdkVersion,
    realtimeDialogue: input.snapshot.realtimeDialogue,
    inputTranscription: input.snapshot.inputTranscription,
    memoryExtractor: input.snapshot.memoryExtractor,
    voice: input.snapshot.voice,
    reasoningEffort: input.snapshot.reasoningEffort,
    turnDetectionProfile: input.snapshot.turnDetectionProfile,
    status,
    reason,
    duration_ms: Number.isSafeInteger(elapsed) && elapsed >= 0 ? elapsed : 0,
  }
}

function emitMetadata(
  input: CreateRealtimeSessionInput,
  event: RealtimeMetadataEvent['event'],
  status: RealtimeMetadataEvent['status'],
  reason: RealtimeMetadataReason,
  sessionGeneration: number,
  createdAt: number,
): void {
  try {
    input.eventSink(metadataEvent(input, event, status, reason, sessionGeneration, createdAt))
  } catch {
    // Metadata delivery cannot gate the realtime session or unrelated adapters.
  }
}

function closeWithoutMetadata(session: SessionLike): void {
  try {
    const result = session.close()
    if (typeof (result as PromiseLike<void> | undefined)?.then === 'function') {
      void Promise.resolve(result).catch(() => {})
    }
  } catch {
    // A close failure is represented by the adapter's stable metadata outcome.
  }
}

function readEventSessionId(event: unknown): string | null {
  const value = readProperty(event, 'realtimeSessionId')
  return typeof value === 'string' ? value : null
}

function readEventType(event: unknown): string | null {
  const value = readProperty(event, 'type')
  return typeof value === 'string' ? value : null
}

function rawEventIsStale(event: unknown, realtimeSessionId: string): boolean {
  const eventSessionId = readEventSessionId(event)
  return eventSessionId !== null && eventSessionId !== realtimeSessionId
}

function rawEventStatus(event: unknown): string | null {
  const value = readProperty(event, 'status')
  return typeof value === 'string' ? value : null
}

function errorNodes(value: unknown): readonly unknown[] {
  const nodes: unknown[] = []
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  const visited = new Set<object>()

  while (pending.length > 0 && nodes.length < 8) {
    const current = pending.shift()
    if (current === undefined) break
    nodes.push(current.value)
    if (!isRecord(current.value) || current.depth >= 2 || visited.has(current.value)) continue
    visited.add(current.value)
    for (const key of ['cause', 'error', 'response']) {
      const nested = readProperty(current.value, key)
      if (nested !== undefined) pending.push({ value: nested, depth: current.depth + 1 })
    }
  }
  return nodes
}

function connectFailureMessage(value: unknown): string | undefined {
  if (value instanceof Error) return value.message
  const message = readProperty(value, 'message')
  return typeof message === 'string' ? message : undefined
}

function tokenForStatus(status: number): RealtimeConnectFailureToken | undefined {
  if (status === 0 || status === 408) return 'start_connect_network_failed'
  if (status === 400) return 'start_connect_bad_request'
  if (status === 401) return 'start_connect_auth_failed'
  if (status === 403) return 'start_connect_permission_failed'
  if (status === 404) return 'start_connect_not_found'
  if (status === 429) return 'start_connect_rate_limited'
  if (status >= 500 && status <= 599) return 'start_connect_service_unavailable'
  return undefined
}

function invalidRequestToken(nodes: readonly unknown[]): string | undefined {
  const isInvalidRequest = nodes.some((node) => {
    const type = readProperty(node, 'type')
    const code = readProperty(node, 'code')
    return type === 'invalid_request_error'
      || (typeof code === 'string' && ['invalid_value', 'unknown_parameter'].includes(code))
  })
  if (!isInvalidRequest) return undefined

  const parameter = nodes
    .map((node) => readProperty(node, 'param'))
    .find((value): value is string => typeof value === 'string' && value.length > 0)
  if (parameter === undefined) return 'start_connect_bad_request'
  const safeParameter = parameter
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return safeParameter.length === 0
    ? 'start_connect_bad_request'
    : `start_connect_bad_request_${safeParameter}`
}

function classifyConnectFailure(value: unknown): string {
  const nodes = errorNodes(value)
  const message = nodes.map(connectFailureMessage).find((item) => item !== undefined)

  if (message?.startsWith('Using the WebRTC connection in a browser environment requires an ephemeral client key.')) {
    return 'start_connect_ephemeral_key_required'
  }
  if (
    message?.startsWith('Connection closed before setup completed')
    || message?.startsWith('Connection closed before session config was acknowledged')
  ) {
    return 'start_connect_setup_closed'
  }
  if (message?.startsWith('Failed to create offer')) return 'start_connect_sdp_offer_failed'
  if (message?.startsWith('Failed to parse SessionDescription')) {
    return 'start_connect_sdp_answer_failed'
  }

  const invalidRequest = invalidRequestToken(nodes)
  if (invalidRequest !== undefined) return invalidRequest

  const signalingStatus = message?.match(/^Realtime call request failed with status (\d{3})/)
  if (signalingStatus !== undefined && signalingStatus !== null) {
    const token = tokenForStatus(Number(signalingStatus[1]))
    if (token !== undefined) return token
  }

  for (const node of nodes) {
    for (const key of ['status', 'statusCode']) {
      const status = readProperty(node, key)
      if (typeof status === 'number' && Number.isSafeInteger(status)) {
        const token = tokenForStatus(status)
        if (token !== undefined) return token
      }
    }
  }

  for (const node of nodes) {
    for (const key of ['code', 'type', 'name']) {
      const raw = readProperty(node, key)
      if (typeof raw !== 'string') continue
      const value = raw.toLowerCase()
      if (NETWORK_CODES.has(value) || value === 'networkerror' || value === 'network_error') {
        return 'start_connect_network_failed'
      }
      if (value === 'typeerror' && node instanceof Error) return 'start_connect_network_failed'
      if (value.includes('auth') || value === 'invalid_api_key' || value === 'unauthorized') {
        return 'start_connect_auth_failed'
      }
      if (value.includes('permission') || value === 'forbidden') {
        return 'start_connect_permission_failed'
      }
      if (value.includes('rate_limit') || value === 'too_many_requests') {
        return 'start_connect_rate_limited'
      }
      if (value.includes('service_unavailable') || value.includes('server_error')) {
        return 'start_connect_service_unavailable'
      }
    }
  }

  return 'start_connect_transport_failed'
}

function stableCloseReason(reason: string): RealtimeMetadataReason {
  return (REALTIME_METADATA_REASONS as readonly string[]).includes(reason)
    ? reason as RealtimeMetadataReason
    : 'cause=close'
}

function runtimeFailureReason(reason: RealtimeMetadataReason): string {
  return reason.startsWith('cause=') ? reason.slice('cause='.length) : reason
}

export function createRealtimeSession(
  input: CreateRealtimeSessionInput,
): RealtimeSessionHandle {
  const createdAt = Date.now()
  const sessionGeneration =
    input.sessionGeneration === undefined
      ? nextSessionGeneration()
      : input.sessionGeneration
  if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration <= 0) {
    throw new RealtimeSessionAdapterError('invalid_session_generation')
  }
  let turnDetection: {
    readonly type: 'semantic_vad' | 'server_vad'
    readonly eagerness?: 'low'
    readonly threshold?: 0.7
    readonly prefixPaddingMs?: 300
    readonly silenceDurationMs?: 900
    readonly createResponse?: true
    readonly interruptResponse: true
  }
  try {
    turnDetection = configuredTurnDetection(input.snapshot.turnDetectionProfile)
  } catch {
    emitMetadata(
      input,
      'realtime_connect_failed',
      'failed',
      'unknown_turn_detection_profile',
      sessionGeneration,
      createdAt,
    )
    throw new RealtimeSessionAdapterError('unknown_turn_detection_profile')
  }

  const dependencies = input.dependencies
  let session: SessionLike
  try {
    const transportFactory = dependencies?.createTransport ?? createWebRtcRealtimeTransport
    const transport = transportFactory({
      mediaStream: input.mediaStream,
      audioElement: input.audioElement,
    })
    const agentConstructor = dependencies?.RealtimeAgent ?? RealtimeAgent
    const sessionConstructor = dependencies?.RealtimeSession ?? RealtimeSession
    const agent = new agentConstructor({ name: 'magic-mirror-realtime' })
    const sessionOptions = {
      transport,
      model: input.snapshot.realtimeDialogue,
      historyStoreAudio: false,
      tracingDisabled: true,
      config: {
        tracing: null,
        audio: {
          input: {
            noiseReduction: { type: 'far_field' },
            transcription: {
              model: input.snapshot.inputTranscription,
              languages: ['zh-tw', 'en'],
              keywords: ['恭送渡鴨大人'],
              delay: 'medium',
            },
            turnDetection,
          },
          output: { voice: input.snapshot.voice },
        },
        reasoning: {
          effort: input.snapshot.reasoningEffort,
        },
      },
    } as unknown as Partial<RealtimeSessionOptions>
    session = new sessionConstructor(agent, sessionOptions) as unknown as SessionLike
  } catch {
    emitMetadata(
      input,
      'realtime_connect_failed',
      'failed',
      'cause=connect_failed',
      sessionGeneration,
      createdAt,
    )
    throw new RealtimeSessionAdapterError('connect_failed')
  }

  let closed = false
  let readyEmitted = false
  let failureReported = false
  let latestConnectFailureToken: string | undefined
  let connectPromise: Promise<void> | null = null
  let transientClientSecret: string | null = input.clientSecret
  const outputAudioBufferStoppedSubscriptions = new Set<OutputAudioBufferStoppedSubscription>()
  const inputTranscriptCompletedListeners = new Set<InputTranscriptCompletedListener>()

  const emitReady = (reason: RealtimeMetadataReason): void => {
    if (closed || readyEmitted || failureReported) return
    readyEmitted = true
    emitMetadata(
      input,
      'realtime_ready',
      'success',
      reason,
      sessionGeneration,
      createdAt,
    )
  }

  const emitStale = (): void => {
    emitMetadata(
      input,
      'realtime_stale_event',
      'info',
      'stale_realtime_session',
      sessionGeneration,
      createdAt,
    )
  }

  const emitConnectFailed = (reason: RealtimeMetadataReason): void => {
    emitMetadata(
      input,
      'realtime_connect_failed',
      'failed',
      reason,
      sessionGeneration,
      createdAt,
    )
  }

  const emitDisconnected = (reason: RealtimeMetadataReason): void => {
    emitMetadata(
      input,
      'realtime_disconnect',
      'info',
      reason,
      sessionGeneration,
      createdAt,
    )
  }

  const notifyOutputAudioBufferStopped = (): void => {
    if (closed) return
    for (const { listener } of [...outputAudioBufferStoppedSubscriptions]) {
      try {
        listener()
      } catch {
        emitMetadata(
          input,
          'realtime_observer_event',
          'degraded',
          'output_playback_listener_failed',
          sessionGeneration,
          createdAt,
        )
      }
    }
  }

  const closeLegacySession = (): void => {
    if (closed) return
    closed = true
    closeWithoutMetadata(session)
  }

  const reportFailure = (
    kind: RealtimeFailureInput['kind'],
    event: RealtimeMetadataEvent['event'],
    status: RealtimeMetadataEvent['status'],
    reason: RealtimeMetadataReason,
  ): void => {
    if (closed || failureReported) return
    failureReported = true

    const failure: RealtimeFailureInput = {
      kind,
      realtimeSessionId: input.sessionId,
      reason: reason === 'cause=transport_error' && latestConnectFailureToken !== undefined
        ? latestConnectFailureToken
        : runtimeFailureReason(reason),
    }
    const onFailure = input.onFailure

    if (onFailure === undefined) {
      closeLegacySession()
      emitMetadata(input, event, status, reason, sessionGeneration, createdAt)
      return
    }

    emitMetadata(input, event, status, reason, sessionGeneration, createdAt)
    let delivery: void | PromiseLike<void>
    try {
      delivery = onFailure(failure)
    } catch {
      closeLegacySession()
      return
    }
    void Promise.resolve(delivery).catch(() => {
      closeLegacySession()
    })
  }

  const handleTransportEvent = (event: unknown): void => {
    if (rawEventIsStale(event, input.sessionId)) {
      emitStale()
      return
    }
    const type = readEventType(event)
    if (type === 'ready' || (type === 'connection_change' && rawEventStatus(event) === 'connected')) {
      emitReady('cause=connect_succeeded')
      return
    }
    if (type === 'error') {
      if (!readyEmitted) latestConnectFailureToken = classifyConnectFailure(event)
      reportFailure(
        readyEmitted ? 'ice' : 'connect',
        'realtime_connect_failed',
        'failed',
        'cause=transport_error',
      )
      return
    }
    if (type === 'output_audio_buffer.stopped') {
      notifyOutputAudioBufferStopped()
      return
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = readProperty(event, 'transcript')
      if (typeof transcript !== 'string' || transcript.trim().length === 0) return
      for (const listener of [...inputTranscriptCompletedListeners]) {
        try {
          listener(transcript)
        } catch {
          emitMetadata(
            input,
            'realtime_observer_event',
            'degraded',
            'transcript_listener_failed',
            sessionGeneration,
            createdAt,
          )
        }
      }
      return
    }
    if (type === 'connection_change' && rawEventStatus(event) === 'disconnected') {
      reportFailure(
        readyEmitted ? 'active_disconnect' : 'connect',
        'realtime_disconnect',
        'info',
        'cause=transport_disconnected',
      )
    }
  }

  const handleSessionError = (event: unknown): void => {
    if (rawEventIsStale(event, input.sessionId)) {
      emitStale()
      return
    }
    if (!readyEmitted) latestConnectFailureToken = classifyConnectFailure(event)
    reportFailure(
      readyEmitted ? 'ice' : 'connect',
      'realtime_connect_failed',
      'failed',
      'cause=transport_error',
    )
  }

  session.on('transport_event', handleTransportEvent)
  session.on('error', handleSessionError)
  // Interruption and completion stay on official RealtimeSession event surfaces.
  session.on('audio_interrupted', () => {})
  session.on('audio_stopped', () => {})

  emitMetadata(
    input,
    'realtime_session_created',
    'success',
    'cause=session_created',
    sessionGeneration,
    createdAt,
  )

  async function connectOnce(): Promise<void> {
    if (closed) throw new RealtimeSessionAdapterError('session_closed')
    latestConnectFailureToken = undefined
    const clientSecret = transientClientSecret
    transientClientSecret = null
    if (typeof clientSecret !== 'string' || clientSecret.length === 0) {
      latestConnectFailureToken = 'start_connect_credential_missing'
      reportFailure(
        'connect',
        'realtime_connect_failed',
        'failed',
        'cause=connect_failed',
      )
      throw new RealtimeSessionAdapterError('connect_failed')
    }

    emitMetadata(
      input,
      'realtime_connect_started',
      'info',
      'cause=connect_started',
      sessionGeneration,
      createdAt,
    )
    try {
      await session.connect({ apiKey: clientSecret })
      if (failureReported) {
        throw new RealtimeSessionAdapterError('connect_failed')
      }
      latestConnectFailureToken = undefined
      if (!closed) emitReady('cause=connect_succeeded')
    } catch (error: unknown) {
      latestConnectFailureToken ??= classifyConnectFailure(error)
      if (!closed && !failureReported) {
        reportFailure(
          readyEmitted ? 'ice' : 'connect',
          'realtime_connect_failed',
          'failed',
          'cause=connect_failed',
        )
      }
      throw new RealtimeSessionAdapterError('connect_failed')
    }
  }

  async function connect(): Promise<void> {
    if (connectPromise !== null) return connectPromise
    connectPromise = connectOnce()
    return connectPromise
  }

  async function interrupt(): Promise<void> {
    if (closed) return
    try {
      await session.interrupt()
    } catch {
      emitConnectFailed('cause=transport_error')
    }
  }

  async function close(reason: string): Promise<void> {
    if (closed) return
    closed = true
    outputAudioBufferStoppedSubscriptions.clear()
    inputTranscriptCompletedListeners.clear()
    let closeFailed = false
    try {
      await session.close()
    } catch {
      closeFailed = true
    }
    const disconnectReason = stableCloseReason(reason)
    emitDisconnected(closeFailed ? 'cause=close_failed' : disconnectReason)
  }

  function onOutputAudioBufferStopped(
    listener: OutputAudioBufferStoppedListener,
  ): () => void {
    if (closed) {
      emitMetadata(
        input,
        'realtime_observer_event',
        'info',
        'output_playback_subscription_closed',
        sessionGeneration,
        createdAt,
      )
      return () => {}
    }
    const subscription: OutputAudioBufferStoppedSubscription = { listener }
    outputAudioBufferStoppedSubscriptions.add(subscription)
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      outputAudioBufferStoppedSubscriptions.delete(subscription)
    }
  }

  function onInputTranscriptCompleted(
    listener: InputTranscriptCompletedListener,
  ): () => void {
    if (closed) return () => {}
    inputTranscriptCompletedListeners.add(listener)
    return () => inputTranscriptCompletedListeners.delete(listener)
  }

  return Object.freeze({
    realtimeSessionId: input.sessionId,
    sessionGeneration,
    connect,
    getLastConnectFailureToken: () => latestConnectFailureToken,
    interrupt,
    close,
    onOutputAudioBufferStopped,
    onInputTranscriptCompleted,
  })
}
