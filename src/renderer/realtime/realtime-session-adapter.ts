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

interface SessionLike {
  connect(options: { readonly apiKey: string }): void | PromiseLike<void>
  interrupt(): void | PromiseLike<void>
  close(): void | PromiseLike<void>
  on(eventName: string, listener: SessionEventListener): unknown
}

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
  readonly eventSink: RealtimeMetadataEventSink
  readonly onFailure?: RealtimeFailureCallback
  readonly dependencies?: RealtimeSessionDependencies
}

export interface RealtimeSessionHandle {
  readonly realtimeSessionId: string
  readonly sessionGeneration: number
  connect(): Promise<void>
  interrupt(): Promise<void>
  close(reason: string): Promise<void>
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
  readonly type: 'semantic_vad'
  readonly interruptResponse: true
} {
  if (profile === 'semantic-vad-interruptible') {
    return Object.freeze({ type: 'semantic_vad', interruptResponse: true })
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

function stableCloseReason(reason: string): RealtimeMetadataReason {
  return (REALTIME_METADATA_REASONS as readonly string[]).includes(reason)
    ? reason as RealtimeMetadataReason
    : 'cause=close'
}

export function createRealtimeSession(
  input: CreateRealtimeSessionInput,
): RealtimeSessionHandle {
  const createdAt = Date.now()
  const sessionGeneration = nextSessionGeneration()
  let turnDetection: {
    readonly type: 'semantic_vad'
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
            transcription: { model: input.snapshot.inputTranscription },
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
  let connectPromise: Promise<void> | null = null
  let transientClientSecret: string | null = input.clientSecret

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
      reason,
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
      reportFailure(
        readyEmitted ? 'ice' : 'connect',
        'realtime_connect_failed',
        'failed',
        'cause=transport_error',
      )
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
    const clientSecret = transientClientSecret
    transientClientSecret = null
    if (typeof clientSecret !== 'string' || clientSecret.length === 0) {
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
      if (!closed) emitReady('cause=connect_succeeded')
    } catch {
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
    let closeFailed = false
    try {
      await session.close()
    } catch {
      closeFailed = true
    }
    const disconnectReason = stableCloseReason(reason)
    emitDisconnected(closeFailed ? 'cause=close_failed' : disconnectReason)
  }

  return Object.freeze({
    realtimeSessionId: input.sessionId,
    sessionGeneration,
    connect,
    interrupt,
    close,
  })
}
