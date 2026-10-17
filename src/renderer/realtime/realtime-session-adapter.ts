import { REALTIME_PROMPTS, buildAuditionPrompt, buildSpeechResponse } from '../../shared/realtime-prompts'
import { memoryNeedsReset } from '../../shared/memory'
import {
  RealtimeAgent,
  RealtimeSession,
  type RealtimeSessionOptions,
} from '@openai/agents/realtime'
import { avatarRealtimeTools, buildAvatarPrompt, type AvatarSessionSettings } from '../../shared/avatar-prompt'
import { MemoryDialogue } from './memory-dialogue'
import { isSpellAttempt, opensWithSpokenPhrase, spokenCommandKey } from '../../shared/spoken-command'
import { visitorSentenceLanguage } from '../../shared/visitor-language'
import { bindRealtimeTools } from './realtime-tool-bindings'
import { mergedMediaTool } from './merged-media-tool'
import { DEFAULT_CLOUD_SEARCH_PHRASE, DEFAULT_WAKE_PHRASE, LEGACY_SLEEP_PHRASE } from '../../shared/avatar-commands'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'
import type { SessionModelSnapshot } from '../../shared/types'
import {
  REALTIME_METADATA_REASONS,
  OBSERVED_TOOL_NAMES,
  type RealtimeMetadataEvent,
  type RealtimeMetadataEventSink,
  type RealtimeMetadataReason,
  type RealtimeFailureCallback,
} from '../../shared/realtime-events'
import type { RealtimeFailureInput } from '../../shared/realtime-recovery'
import { watchMicrophone } from './microphone-recovery'
import {
  createWebRtcRealtimeTransport,
  type RealtimeTransportFactory,
} from './realtime-transport'

type SessionEventListener = (...args: unknown[]) => void
type OutputAudioBufferStoppedListener = () => void
type InputItemCreatedListener = (itemId: string) => void
type InputTranscriptCompletedListener = (input: Readonly<{ itemId: string; transcript: string }>) => void | PromiseLike<void>

interface OutputAudioBufferStoppedSubscription {
  readonly listener: OutputAudioBufferStoppedListener
}
interface SessionLike {
  connect(options: { readonly apiKey: string }): void | PromiseLike<void>
  interrupt(): void | PromiseLike<void>
  close(): void | PromiseLike<void>
  sendMessage(message: string): void
  addImage(image: string, options: { triggerResponse: boolean }): void
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
  readonly onMemory?: import('../../shared/bridge').MirrorBridge['memory']
  readonly onMemoryInput?: import('../../shared/bridge').MirrorBridge['memoryInput']
  readonly onMemoryReset?: import('../../shared/bridge').MirrorBridge['resetMemorySession']
  readonly microphoneRecovery?: {
    readonly mediaDevices: MediaDevices
    readonly getConstraints: () => Promise<true | MediaTrackConstraints>
  }
  readonly preview?: boolean
  readonly avatar?: Readonly<AvatarSessionSettings>
  readonly wakeGreeting?: string
  readonly sleepFarewell?: string
  readonly snapshot: SessionModelSnapshot
  readonly clientSecret: string
  readonly mediaStream: MediaStream
  readonly audioElement: HTMLAudioElement
  readonly sessionId: string
  readonly sessionGeneration?: number
  readonly eventSink: RealtimeMetadataEventSink
  readonly onFailure?: RealtimeFailureCallback
  readonly onReturnToDormant?: () => void | PromiseLike<void>
  readonly onCameraCapture?: (identity: import('../../shared/bridge').RealtimeSessionIdentity) => Promise<import('../../shared/camera-tracking').CameraSnapshot | null>
  readonly onMediaRequest?: (request: import('../../shared/media-skill').MediaSkillRequest,
    identity: import('../../shared/bridge').RealtimeSessionIdentity) => Promise<import('../../shared/media-skill').MediaSkillResult>
  readonly onFindMedia?: NonNullable<import('../../shared/bridge').MirrorBridge['findMedia']>
  readonly onSearchYoutube?: NonNullable<import('../../shared/bridge').MirrorBridge['searchYoutube']>
  readonly waitForOutputTail?: () => Promise<void>
  readonly waitForWakePresentation?: (signal: AbortSignal) => Promise<void>
  readonly onAudioActivity?: (
    activity:
      | 'speech_started'
      | 'speech_stopped'
      | 'output_started'
      | 'output_stopped'
      | 'interrupted'
      | 'tool_started'
      | 'tool_finished'
  ) => void
  readonly dependencies?: RealtimeSessionDependencies
}

export interface RealtimeSessionHandle {
  readonly realtimeSessionId: string
  readonly sessionGeneration: number
  readonly getLastConnectFailureToken?: () => string | undefined
  connect(): Promise<void>
  interrupt(): Promise<void>
  setMediaPlayback?(active: boolean): void
  close(reason: string): Promise<void>
  speakVerbatim(text: string, signal?: AbortSignal, onFinished?: (completed: boolean) => void): void
  claimControlTurn?(itemId: string): void
  onOutputAudioBufferStopped(listener: OutputAudioBufferStoppedListener): () => void
  onInputItemCreated?(listener: InputItemCreatedListener): () => void
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
  let transport: ReturnType<RealtimeTransportFactory>
  let microphoneRecovery: ReturnType<typeof watchMicrophone> | undefined
  let returnToDormantPending = false
  let returnToDormantAudioStarted = false
  let farewellRequested = false
  let farewellResponseId: string | undefined
  let farewellAudioStarted = false
  let sleepAudioSuppressed = false
  let commandTurnOwned = false
  let partialCommandItem = '', partialCommandText = '', committedCommandItem = ''
  const finalCommandInputs = new Set<string>()
  let commandCandidate: { itemId: string; generation: number; revised: boolean; awaitingMemory: boolean;
    resumeNeeded: boolean; cancelled: Set<string> } | undefined
  let commandCandidateTimer: ReturnType<typeof setTimeout> | undefined
  const suppressedResponses = new Set<string>()
  const applicationResponses = new Set<string>()
  let mediaPlaybackActive = false
  let memoryResetPending = false
  // Online media needs the avatar's hidden phrase to open the visitor's final
  // transcript (owner ruling 2026-10-14); the phrase alone also covers the next
  // turn. Results of an allowed search stay playable for a later selection.
  const cloudSearchPhrase = input.avatar?.cloudSearchPhrase ?? DEFAULT_CLOUD_SEARCH_PHRASE
  let onlineTurns = 0
  const onlineCandidates = new Set<string>()
  let localSearchClue: { generation: number; text: string } | undefined
  let lastLocalSearch: { generation: number; query: string; media: import('../../shared/media-discovery').MediaDiscoveryReply } | undefined
  let memoryInputQueue: Promise<unknown> = Promise.resolve()
  let memoryInputRevision = 0
  let memoryTurnGeneration = 0
  let memoryLatestItem = ''
  let replyLanguage: 'chinese' | 'english' = 'chinese'
  // Preamble diagnostics belong to the response that called the tool.
  const modelAudioResponses = new Set<string>()
  let toolCallResponse = ''
  let memoryTransportClosed = false
  const memoryResponses = new Map<string, string>()
  const audioResponseInputs = new Map<string, string>()
  const activeMemoryResponses = new Set<string>()
  const memoryAudioResponses = new Set<string>()
  const finishedMemoryAudio = new Set<string>()
  let pendingQuestion: import('../../shared/memory').MemoryReply['confirmation']
  let questionToolEnded = false
  const baseInstructions = input.preview ? buildAuditionPrompt(input.avatar?.speakingStyle ?? '')
    : buildAvatarPrompt(input.avatar ?? { ...REALTIME_PROMPTS.defaults, speakingStyle: '', wakeGreeting: input.wakeGreeting ?? '', sleepFarewell: input.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell! })
  const wireTurnDetection = { type: turnDetection.type, interrupt_response: true,
    ...(turnDetection.eagerness ? { eagerness: turnDetection.eagerness } : {}),
    ...(turnDetection.threshold !== undefined ? { threshold: turnDetection.threshold, prefix_padding_ms: turnDetection.prefixPaddingMs, silence_duration_ms: turnDetection.silenceDurationMs } : {}) }
  const memoryDialogue = new MemoryDialogue({ baseInstructions, speakingStyle: input.avatar?.speakingStyle ?? '', turnDetection: wireTurnDetection,
    send: event => transport.sendEvent(event),
    input: (phase, token, text) => {
      const operation = memoryInputQueue.then(() => {
        if (closed || !input.onMemoryInput) throw new Error('memory_session_closed')
        return input.onMemoryInput(phase, token, text, { realtimeSessionId: input.sessionId, sessionGeneration })
      })
      memoryInputQueue = operation.catch(() => undefined)
      return operation
    },
    tail: async () => { if (!input.waitForOutputTail) throw new Error('memory_playback_unavailable'); await input.waitForOutputTail() },
    interrupt: async () => { notifyAudioActivity('interrupted'); await session.interrupt() },
    report: reason => emitMetadata(input, 'realtime_observer_event', reason === 'memory_dialogue_failed' ? 'degraded' : 'info', reason, sessionGeneration, createdAt),
    failed: () => { void replaceMemorySession() },
  })
  async function replaceMemorySession(): Promise<void> {
    if (closed || memoryTransportClosed) return
    clearCommandCandidate()
    memoryTransportClosed = true; memoryDialogue.close(); pendingQuestion = undefined
    try { await session.close(); await input.onMemoryReset?.({ realtimeSessionId: input.sessionId, sessionGeneration }) }
    catch { reportFailure('active_disconnect', 'realtime_disconnect', 'failed', 'cause=transport_error') }
  }
  function askPendingQuestion(): void {
    if (!pendingQuestion || !questionToolEnded || activeMemoryResponses.size || memoryAudioResponses.size || closed) return
    const q = pendingQuestion; pendingQuestion = undefined; questionToolEnded = false
    void memoryDialogue.ask(q)
  }
  function memoryInput(phase: import('../../shared/memory').MemoryInputPhase, itemId: string): void {
    if (!input.onMemoryInput || !itemId) return
    memoryInputQueue = memoryInputQueue.then(() => closed ? undefined : input.onMemoryInput!(phase, itemId, '', { realtimeSessionId: input.sessionId, sessionGeneration }))
      .catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'memory_input_unavailable', sessionGeneration, createdAt))
  }
  const memoryInputWaiters = new Set<() => void>()
  let farewellSequence = 0
  let farewellCueId = ''
  const farewell = input.avatar?.sleepFarewell ?? input.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell!
  const toolSpecs = avatarRealtimeTools(input.avatar, input.preview)
  const sleepToolNames = new Set(toolSpecs.filter(spec => spec.handler === 'return_to_dormant').map(spec => spec.name))
  const mediaToolNames = new Set(toolSpecs.filter(spec => ['play', 'find_media', 'search_youtube', 'play_media', 'play_youtube', 'stop_media'].includes(spec.handler)).map(spec => spec.name))
  let workingEpoch = 0, workingCount = 0
  async function withWorking<T>(job: () => Promise<T>): Promise<T> {
    const epoch = workingEpoch
    if (workingCount++ === 0) notifyAudioActivity('tool_started')
    try { return await job() }
    finally { if (epoch === workingEpoch && --workingCount === 0) notifyAudioActivity('tool_finished') }
  }
  async function requestMedia(request: import('../../shared/media-skill').MediaSkillRequest) {
    const result = await input.onMediaRequest!(request, { realtimeSessionId: input.sessionId, sessionGeneration })
    return typeof result === 'string' ? result : { outcome: result.status, code: result.code }
  }
  const localQueryKey = (query: string) => query.trim().toLowerCase().replace(/\s+/gu, ' ')
  async function findLocalMedia(request: import('../../shared/media-discovery').MediaDiscoveryRequest, generation: number) {
    const lookup = (query: typeof request) => withWorking(async () => await input.onFindMedia?.(query, { realtimeSessionId: input.sessionId, sessionGeneration })
      ?? { status: 'failed' as const, code: 'media_discovery_unavailable', resources: [], total: 0 })
    let media = await lookup(request)
    const item = memoryLatestItem
    if (media.status === 'accepted' && media.resources.length === 0 && !closed && !commandTurnOwned
      && generation === memoryTurnGeneration && item && !finalCommandInputs.has(item)) await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); memoryInputWaiters.delete(done); resolve() }
      const timer = setTimeout(done, 1500)
      memoryInputWaiters.add(done)
    })
    const clue = localSearchClue
    // Recover literal titles lost in a model-written query. This is discovery
    // only: preserve ambiguity, never select/play. An empty lookup can briefly
    // await its own final ASR; ordinary dialogue has no transcript gate.
    if (!closed && !commandTurnOwned && generation === memoryTurnGeneration && clue?.generation === generation
      && media.status === 'accepted' && media.resources.length === 0 && localQueryKey(clue.text) !== localQueryKey(request.query)) {
      emitMetadata(input, 'realtime_observer_event', 'info', 'media_discovery_visitor_clue', sessionGeneration, createdAt)
      media = await lookup({ ...request, query: clue.text })
    }
    if (!closed && generation === memoryTurnGeneration) lastLocalSearch = { generation, query: localQueryKey(request.query), media }
    return media
  }
  async function onlineMediaRestriction(): Promise<'media_source_restricted' | 'media_source_unconfirmed' | undefined> {
    const item = memoryLatestItem
    if (item && !finalCommandInputs.has(item)) await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); memoryInputWaiters.delete(done); resolve() }
      const timer = setTimeout(done, 1500)
      memoryInputWaiters.add(done)
    })
    await memoryInputQueue
    if (item && !finalCommandInputs.has(item)) return 'media_source_unconfirmed'
    if (onlineTurns === 0) return 'media_source_restricted'
    return undefined
  }
  try {
    const transportFactory = dependencies?.createTransport ?? createWebRtcRealtimeTransport
    transport = transportFactory({
      mediaStream: input.mediaStream,
      audioElement: input.audioElement,
    })
    const agentConstructor = dependencies?.RealtimeAgent ?? RealtimeAgent
    const sessionConstructor = dependencies?.RealtimeSession ?? RealtimeSession
    const tools = bindRealtimeTools(toolSpecs, {
      play: async args => {
        const generation = memoryTurnGeneration
        return mergedMediaTool({
          current: () => !closed && !commandTurnOwned && !mediaPlaybackActive && !returnToDormantPending && generation === memoryTurnGeneration && !!input.onMediaRequest,
          source: () => onlineTurns > 0 ? 'youtube' : 'local',
          restriction: onlineMediaRestriction,
          find: request => withWorking(async () => await input.onFindMedia?.(request, { realtimeSessionId: input.sessionId, sessionGeneration })
            ?? { status: 'failed', code: 'media_discovery_unavailable', resources: [], total: 0 }),
          search: query => withWorking(async () => await input.onSearchYoutube?.({ query }, { realtimeSessionId: input.sessionId, sessionGeneration })
            ?? { status: 'failed', code: 'youtube_search_not_configured', videos: [] }),
          play: request => input.onMediaRequest!(request, { realtimeSessionId: input.sessionId, sessionGeneration }),
        })(args)
      },
      memory: async args => {
        const generation = memoryTurnGeneration
        const stale = () => ({ outcome: 'rejected' as const, memory: { status: 'rejected' as const, code: 'memory_result_stale' } })
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || !input.onMemory) return 'failed'
        await memoryInputQueue
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        const revision = memoryInputRevision
        const request = () => input.onMemory!(args as unknown as import('../../shared/memory').MemoryRequest,
          { realtimeSessionId: input.sessionId, sessionGeneration })
        const requestMemory = () => args.action === 'recall' ? request() : withWorking(request)
        let memory = await requestMemory()
        // Main may already have changed private context even if a command has
        // taken this turn. Session replacement must survive stale tool output.
        memoryResetPending ||= memoryNeedsReset(memory.code)
        if (commandTurnOwned) return stale()
        if (memory.code === 'memory_confirmation_pending' || memory.code === 'memory_source_pending') {
          if (revision === memoryInputRevision) await new Promise<void>(resolve => {
            const done = () => { clearTimeout(timer); memoryInputWaiters.delete(done); resolve() }
            const timer = setTimeout(done, 1500)
            memoryInputWaiters.add(done)
          })
          await memoryInputQueue
          if (closed || commandTurnOwned || mediaPlaybackActive || generation !== memoryTurnGeneration) return stale()
          memory = await requestMemory()
        }
        memoryResetPending ||= memoryNeedsReset(memory.code)
        if (closed || commandTurnOwned || mediaPlaybackActive || generation !== memoryTurnGeneration) return stale()
        if (memory.confirmation) { pendingQuestion = memory.confirmation; questionToolEnded = false }
        return { outcome: memory.status, memory }
      },
      capture_camera: async () => {
        const generation = memoryTurnGeneration
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || !input.onCameraCapture) return 'ignored'
        const frame = await withWorking(() => input.onCameraCapture!({ realtimeSessionId: input.sessionId, sessionGeneration }))
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) {
          emitMetadata(input, 'realtime_observer_event', 'info', 'camera_result_stale', sessionGeneration, createdAt)
          return 'ignored'
        }
        if (!frame) return 'failed'
        session.addImage(frame.dataUrl, { triggerResponse: false })
        return 'accepted'
      },
      find_media: async args => {
        const generation = memoryTurnGeneration
        const stale = () => ({ outcome: 'ignored' as const, media: { status: 'rejected' as const, code: 'media_discovery_stale', resources: [], total: 0 } })
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending) return stale()
        const media = await findLocalMedia({ query: args.query as string, kind: args.kind as 'all' | 'music' | 'video' }, generation)
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        const online = media.code === 'media_discovery_no_match' && !await onlineMediaRestriction()
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        return { outcome: media.status, media, ...(media.code === 'media_discovery_weak' ? { next: 'ask' as const }
          : online ? { next: 'search_youtube' as const } : {}) }
      },
      search_youtube: async args => {
        const generation = memoryTurnGeneration
        const stale = () => ({ outcome: 'ignored' as const, youtube: { status: 'rejected' as const, code: 'youtube_search_stale' as const, videos: [] } })
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending) return stale()
        const restriction = await onlineMediaRestriction()
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        if (restriction) {
          // Without the phrase this stays a local lookup. Reuse only this turn's
          // literal query; a miss never becomes an online search.
          const media = (lastLocalSearch?.generation === generation && lastLocalSearch.query === localQueryKey(args.query as string)
            ? lastLocalSearch.media : undefined) ?? await findLocalMedia({ query: args.query as string, kind: 'all' }, generation)
          if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
          if (media.status !== 'accepted') return { outcome: media.status, code: 'media_discovery_unavailable', media, next: 'explain' }
          if (media.resources.length) return { outcome: 'accepted', code: 'media_discovery_results', media, next: media.code === 'media_discovery_matches' ? 'play_media' : 'ask' }
          emitMetadata(input, 'realtime_observer_event', 'info', restriction, sessionGeneration, createdAt)
          return { outcome: 'rejected', code: restriction, media }
        }
        const youtube = await withWorking(async () => await input.onSearchYoutube?.({ query: args.query as string }, { realtimeSessionId: input.sessionId, sessionGeneration })
          ?? { status: 'failed' as const, code: 'youtube_search_not_configured' as const, videos: [] })
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        if (youtube.status === 'accepted') { onlineCandidates.clear(); for (const video of youtube.videos) onlineCandidates.add(video.url) }
        return { outcome: youtube.status, youtube }
      },
      play_youtube: async args => {
        const generation = memoryTurnGeneration
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || !input.onMediaRequest) return 'ignored'
        const restriction = onlineCandidates.has(args.url as string) ? undefined : await onlineMediaRestriction()
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return 'ignored'
        if (restriction) {
          emitMetadata(input, 'realtime_observer_event', 'info', restriction, sessionGeneration, createdAt)
          return { outcome: 'rejected', code: restriction }
        }
        return requestMedia({ action: 'play_youtube', kind: args.kind as 'video' | 'music', url: args.url as string,
          mode: args.mode as 'once' | 'loop' })
      },
      play_media: async args => {
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || !input.onMediaRequest) return 'ignored'
        return requestMedia({ action: 'play', kind: args.kind as 'video' | 'music', assetId: args.assetId as string,
          mode: args.mode as 'once' | 'loop' })
      },
      stop_media: async () => {
        if (closed || commandTurnOwned || !input.onMediaRequest) return 'ignored'
        return requestMedia({ action: 'stop' })
      },
      return_to_dormant: async () => {
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || farewellRequested) return 'ignored'
        // Cut off a premature acknowledgement and require the farewell's own
        // output start/end pair, never the previous response's completion.
        const wasPlaying = returnToDormantAudioStarted
        returnToDormantPending = false
        returnToDormantAudioStarted = false
        if (wasPlaying) await session.interrupt()
        if (closed) return 'ignored'
        sleepAudioSuppressed = true
        notifyAudioActivity('interrupted')
        returnToDormantPending = true
        farewellCueId = `sleep-${sessionGeneration}-${++farewellSequence}`
        farewellResponseId = undefined
        farewellAudioStarted = false
        // The SDK commits this result without generating a conversational reply.
        return 'accepted'
      },
    }, reason => {
      if (!returnToDormantPending && !farewellRequested) sleepAudioSuppressed = false
      emitMetadata(input, 'realtime_observer_event', 'degraded', reason, sessionGeneration, createdAt)
    }, name => {
      const preamble = modelAudioResponses.has(toolCallResponse) ? 'yes' : 'no'
      return outcome => {
        const known = OBSERVED_TOOL_NAMES.find(value => value === name)
        if (known) emitMetadata(input, 'realtime_observer_event', 'info', `tool_${known}_${outcome}_preamble_${preamble}`, sessionGeneration, createdAt)
      }
    })
    const agent = new agentConstructor({
      name: 'magic-mirror-realtime',
      instructions: baseInstructions,
      tools,
    })
    const sessionOptions = {
      transport,
      model: input.snapshot.realtimeDialogue,
      historyStoreAudio: false,
      tracingDisabled: true,
      config: {
        tracing: null,
        providerData: { truncation: { type: 'retention_ratio', retention_ratio: 0.8, token_limits: { post_instructions: 16000 } } },
        audio: {
          input: input.preview ? { turnDetection: null, transcription: null } : {
            noiseReduction: { type: 'far_field' },
            transcription: {
              model: input.snapshot.inputTranscription,
              languages: [...REALTIME_PROMPTS.transcription.languages],
              prompt: REALTIME_PROMPTS.transcription.prompt,
              keywords: [...new Set([input.avatar?.wakePhrase ?? DEFAULT_WAKE_PHRASE,
                input.avatar?.sleepPhrase ?? LEGACY_SLEEP_PHRASE, cloudSearchPhrase, ...(input.avatar?.spellPhrases ?? [])])],
              ...(REALTIME_PROMPTS.transcription.delayModels.includes(input.snapshot.inputTranscription) ? { delay: REALTIME_PROMPTS.transcription.delay } : {}),
            },
            turnDetection,
          },
          output: { voice: input.snapshot.voice, speed: input.snapshot.voiceSpeed ?? 1 },
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
  let closePromise: Promise<void> | null = null
  let greetingState: 'pending' | 'sent' | 'cancelled' | 'none' = input.wakeGreeting?.trim() ? 'pending' : 'none'
  const greetingAbort = new AbortController()
  const cancelPendingGreeting = (reason: RealtimeMetadataReason) => {
    if (greetingState !== 'pending') return
    greetingState = 'cancelled'
    greetingAbort.abort()
    emitMetadata(input, 'realtime_observer_event', 'info', reason, sessionGeneration, createdAt)
  }
  const sendGreeting = () => {
    if (closed || failureReported || greetingState !== 'pending' || greetingAbort.signal.aborted) return
    greetingState = 'sent'
    try { speakVerbatim(input.wakeGreeting!) }
    catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'wake_greeting_failed', sessionGeneration, createdAt) }
  }
  const scheduleGreeting = () => {
    if (greetingState !== 'pending') return
    const wait = input.waitForWakePresentation
    if (!wait) { sendGreeting(); return }
    // The detached task owns only greeting scheduling, never connect/ready.
    void (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          let settled = false
          const presentationAbort = new AbortController()
          const finish = (error?: unknown) => {
            if (settled) return
            settled = true
            clearTimeout(timer); greetingAbort.signal.removeEventListener('abort', abort)
            presentationAbort.abort()
            if (error !== undefined) reject(error); else resolve()
          }
          const abort = () => { const error = new Error('wake_greeting_cancelled'); error.name = 'AbortError'; finish(error) }
          const timer = setTimeout(() => {
            emitMetadata(input, 'realtime_observer_event', 'degraded', 'wake_greeting_gate_timeout', sessionGeneration, createdAt)
            finish()
          }, 10250)
          greetingAbort.signal.addEventListener('abort', abort, { once: true })
          if (greetingAbort.signal.aborted) { abort(); return }
          void Promise.resolve().then(() => wait(presentationAbort.signal)).then(() => finish(),
            error => finish(error ?? new Error('wake_presentation_failed')))
        })
      } catch (error) {
        if (greetingState !== 'pending') return
        if (readProperty(error, 'name') === 'AbortError') { cancelPendingGreeting('wake_greeting_gate_cancelled'); return }
        emitMetadata(input, 'realtime_observer_event', 'degraded', 'wake_greeting_gate_failed', sessionGeneration, createdAt)
      }
      sendGreeting()
    })()
  }
  let cueSequence = 0
  type SpeechCue = { signal: AbortSignal; abort: () => void; send: () => void; sent: boolean; finish?: (completed: boolean) => void; responseId?: string; done: boolean; cleared: boolean; played: boolean; failed: boolean; finishing?: boolean }
  const cues = new Map<string, SpeechCue>()
  let cueMuted: boolean | undefined
  let cueCancelTimer: ReturnType<typeof setTimeout> | undefined
  const resetCues = () => {
    clearTimeout(cueCancelTimer); cueCancelTimer = undefined
    for (const cue of cues.values()) { cue.signal.removeEventListener('abort', cue.abort); cue.finish?.(false) }
    cues.clear()
    if (cueMuted !== undefined) { input.audioElement.muted = cueMuted; cueMuted = undefined }
  }
  const pumpSpeech = (): void => {
    if (closed || memoryDialogue.active || activeMemoryResponses.size || memoryAudioResponses.size
      || [...cues.values()].some(cue => cue.sent)) return
    const next = [...cues.values()][0]
    if (next) { next.sent = true; next.send() }
  }
  const clearCommandCandidate = (): void => {
    clearTimeout(commandCandidateTimer); commandCandidateTimer = undefined
    commandCandidate = undefined; partialCommandItem = ''; partialCommandText = ''
  }
  const watchCommandFinal = (): void => {
    const candidate = commandCandidate
    if (!candidate || candidate.revised || candidate.itemId !== committedCommandItem) return
    clearTimeout(commandCandidateTimer)
    commandCandidateTimer = setTimeout(() => {
      if (commandCandidate === candidate && !candidate.revised) {
        clearCommandCandidate()
        commandTurnOwned = false
        memoryInput('control', candidate.itemId)
        emitMetadata(input, 'realtime_observer_event', 'degraded', 'command_prefix_final_timeout', sessionGeneration, createdAt)
      }
    }, 8000)
  }
  const resumeRevisedCommand = (): void => {
    const candidate = commandCandidate
    if (!candidate?.revised || candidate.awaitingMemory) return
    if (closed || memoryTransportClosed || candidate.generation !== memoryTurnGeneration || memoryLatestItem && candidate.itemId !== memoryLatestItem
      || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || !candidate.resumeNeeded) {
      clearCommandCandidate(); return
    }
    // A cancelled automatic reply must finish before its replacement. A new
    // automatic reply also clears the candidate, so recovery never adds two.
    if (candidate.cancelled.size || activeMemoryResponses.size || memoryAudioResponses.size || memoryDialogue.active || cues.size) return
    clearCommandCandidate()
    try {
      transport.sendEvent({ type: 'response.create' })
      emitMetadata(input, 'realtime_observer_event', 'info', 'command_reply_resumed', sessionGeneration, createdAt)
    } catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'command_reply_resume_failed', sessionGeneration, createdAt) }
  }
  const releaseFinishedCues = () => {
    for (const [id, cue] of cues) {
      if (cue.finishing || (cue.signal.aborted ? !cue.done || !cue.cleared : !cue.done || !cue.played)) continue
      const finish = (completed: boolean): void => {
        if (!cues.has(id)) return
        cue.signal.removeEventListener('abort', cue.abort)
        cues.delete(id)
        cue.finish?.(completed && !cue.signal.aborted && !cue.failed)
        releaseFinishedCues()
        pumpSpeech()
      }
      if (cue.signal.aborted || cue.failed) finish(false)
      else {
        cue.finishing = true
        void Promise.resolve(input.waitForOutputTail?.()).then(() => finish(true), () => finish(false))
      }
    }
    if (![...cues.values()].some(cue => cue.signal.aborted) && cueMuted !== undefined) {
      clearTimeout(cueCancelTimer); cueCancelTimer = undefined
      input.audioElement.muted = cueMuted
      cueMuted = undefined
    }
    pumpSpeech()
    resumeRevisedCommand()
  }
  let readyEmitted = false
  let failureReported = false
  let latestConnectFailureToken: string | undefined
  let connectPromise: Promise<void> | null = null
  let transientClientSecret: string | null = input.clientSecret
  const outputAudioBufferStoppedSubscriptions = new Set<OutputAudioBufferStoppedSubscription>()
  const inputTranscriptCompletedListeners = new Set<InputTranscriptCompletedListener>()
  const inputItemCreatedListeners = new Set<InputItemCreatedListener>()
  const createdInputItemIds = new Set<string>()

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
    clearCommandCandidate()
    memoryDialogue.close()
    for (const done of memoryInputWaiters) done()
    closePromise = (async () => {
      if (microphoneRecovery) await microphoneRecovery.stop()
      closeWithoutMetadata(session)
    })()
    resetCues()
  }

  const reportFailure = (
    kind: RealtimeFailureInput['kind'],
    event: RealtimeMetadataEvent['event'],
    status: RealtimeMetadataEvent['status'],
    reason: RealtimeMetadataReason,
  ): void => {
    if (closed || failureReported) return
    failureReported = true
    cancelPendingGreeting('wake_greeting_cancelled_failure')

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

  const notifyAudioActivity = (
    activity: Parameters<NonNullable<CreateRealtimeSessionInput['onAudioActivity']>>[0],
  ): void => {
    if (closed) return
    if (activity === 'output_started' && [...cues.values()].some(cue => cue.signal.aborted)) {
      emitMetadata(input, 'realtime_observer_event', 'info', 'scene_dialogue_cancel_pending', sessionGeneration, createdAt)
      return
    }
    if (activity === 'output_started' || activity === 'output_stopped' || activity === 'interrupted') {
      emitMetadata(
        input,
        'realtime_observer_event',
        'success',
        activity === 'interrupted' ? 'cause=output_interrupted' : `cause=${activity}`,
        sessionGeneration,
        createdAt,
      )
    }
    try {
      input.onAudioActivity?.(activity)
    } catch {
      emitMetadata(
        input,
        'realtime_observer_event',
        'degraded',
        'avatar_audio_activity_listener_failed',
        sessionGeneration,
        createdAt,
      )
    }
  }

  const mediaWakeItems = new Set<string>()
  const mediaInputItems = new Set<string>()
  const mediaCleanupPending = new Set<string>()
  const rememberMediaInput = (itemId: string): void => {
    mediaInputItems.add(itemId)
    if (mediaInputItems.size > 256) mediaInputItems.delete(mediaInputItems.values().next().value!)
  }
  const handleTransportEvent = (event: unknown): void => {
    if (closed) return
    if (rawEventIsStale(event, input.sessionId)) {
      emitStale()
      return
    }
    const type = readEventType(event)
    memoryDialogue.event(event)
    if (type === 'conversation.item.retrieved') {
      const itemId = readProperty(readProperty(event, 'item'), 'id')
      if (typeof itemId === 'string' && mediaCleanupPending.delete(itemId)) {
        // The SDK requests this item after transcription. Delete only after
        // that retrieval, otherwise its request fails with item_not_found.
        transport.sendEvent({ type: 'conversation.item.delete', item_id: itemId })
      }
      return
    }
    if (type === 'response.output_item.added') {
      const item = readProperty(event, 'item'), responseId = readProperty(event, 'response_id')
      if (readProperty(item, 'type') === 'function_call' && typeof responseId === 'string') toolCallResponse = responseId
      if (readProperty(item, 'type') === 'function_call' && sleepToolNames.has(readProperty(item, 'name') as string)) {
        sleepAudioSuppressed = true
        notifyAudioActivity('interrupted')
      }
    }
    if (type === 'response.created' || type === 'response.done') {
      if (mediaPlaybackActive && type === 'response.created') {
        void interrupt()
        return
      }
      const response = readProperty(event, 'response')
      const metadata = readProperty(response, 'metadata')
      const applicationOwned = ['mirror_scene_cue', 'mirror_sleep_cue', 'mirror_memory_question'].some(key => typeof readProperty(metadata, key) === 'string')
      const ownedResponseId = readProperty(response, 'id')
      if (type === 'response.done' && typeof ownedResponseId === 'string') commandCandidate?.cancelled.delete(ownedResponseId)
      if (applicationOwned && typeof ownedResponseId === 'string') {
        applicationResponses.add(ownedResponseId)
        if (applicationResponses.size > 128) applicationResponses.delete(applicationResponses.values().next().value!)
      }
      if (type === 'response.created' && commandTurnOwned && !applicationOwned) {
        const responseId = readProperty(response, 'id')
        if (typeof responseId === 'string') {
          // Keep cancellation in the queue until response.done, including a
          // reply created after final ASR. The application cue must not race it.
          activeMemoryResponses.add(responseId)
          if (commandCandidate && !commandCandidate.revised) {
            commandCandidate.resumeNeeded = true; commandCandidate.cancelled.add(responseId)
          }
          suppressedResponses.add(responseId)
          if (suppressedResponses.size > 128) suppressedResponses.delete(suppressedResponses.values().next().value!)
          try {
            transport.sendEvent({ type: 'response.cancel', response_id: responseId })
          } catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt) }
          // Creation is not playback. A global clear here can cut an already
          // playing application cue; clear only if this reply starts audio.
          emitMetadata(input, 'realtime_observer_event', 'info', 'command_reply_suppressed', sessionGeneration, createdAt)
        }
        return
      }
      if (type === 'response.created' && !applicationOwned && commandCandidate?.revised) clearCommandCandidate()
      const memoryResponseId = readProperty(response, 'id')
      if (typeof memoryResponseId === 'string') {
        if (type === 'response.created') {
          activeMemoryResponses.add(memoryResponseId)
          if (!applicationOwned) {
            memoryResponses.set(memoryResponseId, memoryLatestItem)
            audioResponseInputs.set(memoryResponseId, memoryLatestItem)
            if (audioResponseInputs.size > 128) audioResponseInputs.delete(audioResponseInputs.keys().next().value!)
          }
        } else {
          activeMemoryResponses.delete(memoryResponseId)
          const itemId = memoryResponses.get(memoryResponseId)
          memoryResponses.delete(memoryResponseId)
          const output = readProperty(response, 'output')
          if (!finishedMemoryAudio.has(memoryResponseId) && readProperty(response, 'status') === 'completed' && Array.isArray(output) && output.some(item => {
            const content = readProperty(item, 'content')
            return Array.isArray(content) && content.some(part => ['audio', 'output_audio'].includes(readProperty(part, 'type') as string))
          })) memoryAudioResponses.add(memoryResponseId)
          // Main classifies memory-management intent from the visitor's actual
          // words. An unsolicited/rejected model save must not erase ordinary evidence.
          const hasControl = Array.isArray(output) && output.some(item => readProperty(item, 'type') === 'function_call'
            && (sleepToolNames.has(readProperty(item, 'name') as string) || mediaToolNames.has(readProperty(item, 'name') as string)))
          if (itemId && hasControl) memoryInput('control', itemId)
          if (itemId && readProperty(response, 'status') === 'completed') memoryInput('settled', itemId)
          askPendingQuestion()
        }
      }
      if (readProperty(readProperty(response, 'metadata'), 'mirror_sleep_cue') === farewellCueId && farewellRequested) {
        const responseId = readProperty(response, 'id')
        if (typeof responseId === 'string') farewellResponseId = responseId
        if (type === 'response.done' && readProperty(response, 'status') !== 'completed') {
          returnToDormantPending = false
          farewellRequested = false
          farewellResponseId = undefined
          farewellAudioStarted = false
          sleepAudioSuppressed = false
          emitMetadata(input, 'realtime_observer_event', 'degraded', 'sleep_request_failed', sessionGeneration, createdAt)
        }
      }
      const cueId = readProperty(readProperty(response, 'metadata'), 'mirror_scene_cue')
      const cue = (typeof cueId === 'string' ? cues.get(cueId) : undefined)
        ?? [...cues.values()].find(value => value.responseId !== undefined && value.responseId === readProperty(response, 'id'))
      if (cue) {
        const responseId = readProperty(response, 'id')
        if (typeof responseId === 'string') cue.responseId = responseId
        if (type === 'response.done') {
          cue.done = true
          if (readProperty(response, 'status') !== 'completed') { cue.failed = true; cue.played = true }
          releaseFinishedCues()
        }
        else if (cue.signal.aborted) cue.abort()
      }
      if (type === 'response.done') { pumpSpeech(); resumeRevisedCommand() }
    }
    if (type === 'output_audio_buffer.stopped' || type === 'output_audio_buffer.cleared') {
      const responseId = readProperty(event, 'response_id')
      if (typeof responseId === 'string') {
        memoryAudioResponses.delete(responseId)
        audioResponseInputs.delete(responseId)
        // Playback completion can precede a late/duplicate response.done.
        finishedMemoryAudio.add(responseId)
        if (finishedMemoryAudio.size > 128) finishedMemoryAudio.delete(finishedMemoryAudio.values().next().value!)
      }
      resumeRevisedCommand()
      if (pendingQuestion) void Promise.resolve(input.waitForOutputTail?.()).then(askPendingQuestion)
        .catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'memory_dialogue_failed', sessionGeneration, createdAt))
    }
    if (type === 'output_audio_buffer.stopped') {
      const responseId = readProperty(event, 'response_id')
      for (const cue of cues.values()) if (cue.responseId === responseId && responseId) cue.played = true
      releaseFinishedCues()
    }
    if (type === 'output_audio_buffer.cleared') {
      const responseId = readProperty(event, 'response_id')
      for (const cue of cues.values()) {
        if (!cue.responseId || cue.responseId !== responseId) continue
        // Visitor barge-in clears an uncancelled cue; it ended unheard, not stuck.
        if (cue.signal.aborted) cue.cleared = true
        else { cue.played = true; cue.failed = true }
      }
      releaseFinishedCues()
    }
    if (type === 'ready' || (type === 'connection_change' && rawEventStatus(event) === 'connected')) {
      emitReady('cause=connect_succeeded')
      return
    }
    if (type === 'error') {
      const rejectedId = readProperty(readProperty(event, 'error'), 'event_id')
      const cue = typeof rejectedId === 'string' ? cues.get(rejectedId) : undefined
      if (cue) { cue.failed = true; cue.done = true; cue.cleared = true; cue.played = true; releaseFinishedCues() }
      if (reportRequestRejection(event)) return
      if (!readyEmitted) latestConnectFailureToken = classifyConnectFailure(event)
      reportFailure(
        readyEmitted ? 'ice' : 'connect',
        'realtime_connect_failed',
        'failed',
        'cause=transport_error',
      )
      return
    }
    if (type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done') {
      const responseId = readProperty(event, 'response_id'), text = readProperty(event, 'transcript')
      if (typeof text === 'string' && typeof responseId === 'string' && !applicationResponses.has(responseId) && !mediaPlaybackActive && !commandTurnOwned) {
        const han = (text.match(/\p{Script=Han}/gu) ?? []).length, latin = (text.match(/[A-Za-z]/g) ?? []).length
        const detected = han >= 2 && han >= latin / 4 ? 'chinese' : !han && latin >= 8 ? 'english' : null
        const flag = !detected || memoryLatestItem && !finalCommandInputs.has(memoryLatestItem) ? 'unknown' : detected === replyLanguage ? 'match' : 'mismatch'
        emitMetadata(input, 'realtime_observer_event', 'info', `reply_language_${flag}`, sessionGeneration, createdAt)
      }
    }
    if (type === 'output_audio_buffer.started') {
      const responseId = readProperty(event, 'response_id')
      if (typeof responseId === 'string' && !applicationResponses.has(responseId) && !mediaPlaybackActive && !commandTurnOwned) modelAudioResponses.add(responseId)
      if (typeof responseId === 'string' && (suppressedResponses.has(responseId)
        || commandTurnOwned && !applicationResponses.has(responseId))) {
        // The buffer-clear receipt, not response cancellation alone, releases
        // playback ownership before an application cue can start.
        if (!finishedMemoryAudio.has(responseId)) memoryAudioResponses.add(responseId)
        if (commandCandidate && !commandCandidate.revised && (memoryResponses.get(responseId) ?? audioResponseInputs.get(responseId)) === commandCandidate.itemId) {
          commandCandidate.resumeNeeded = true
          if (activeMemoryResponses.has(responseId)) commandCandidate.cancelled.add(responseId)
        }
        // A response may have been created (even finished generating) before
        // final ASR, with its first audio arriving only after our interrupt.
        if (!suppressedResponses.has(responseId)) {
          suppressedResponses.add(responseId)
          if (suppressedResponses.size > 128) suppressedResponses.delete(suppressedResponses.values().next().value!)
          emitMetadata(input, 'realtime_observer_event', 'info', 'command_reply_suppressed', sessionGeneration, createdAt)
        }
        notifyAudioActivity('interrupted')
        try { transport.sendEvent({ type: 'output_audio_buffer.clear' }) }
        catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt) }
        return
      }
      if (typeof responseId === 'string' && !finishedMemoryAudio.has(responseId)) memoryAudioResponses.add(responseId)
      if (mediaPlaybackActive) { void interrupt(); return }
      if (sleepAudioSuppressed && (!farewellResponseId || readProperty(event, 'response_id') !== farewellResponseId)) {
        emitMetadata(input, 'realtime_observer_event', 'info', 'sleep_nonfarewell_output_suppressed', sessionGeneration, createdAt)
        return
      }
      returnToDormantAudioStarted = true
      if (farewellResponseId && readProperty(event, 'response_id') === farewellResponseId) farewellAudioStarted = true
      notifyAudioActivity('output_started')
      return
    }
    if (type === 'output_audio_buffer.stopped') {
      returnToDormantAudioStarted = false
      notifyOutputAudioBufferStopped()
      notifyAudioActivity('output_stopped')
      if (returnToDormantPending && farewellAudioStarted && farewellResponseId && readProperty(event, 'response_id') === farewellResponseId) {
        returnToDormantPending = false
        const request = input.onReturnToDormant
        if (request === undefined) {
          emitMetadata(
            input,
            'realtime_observer_event',
            'degraded',
            'sleep_request_unavailable',
            sessionGeneration,
            createdAt,
          )
          return
        }
        try {
          const ownerResponseId = farewellResponseId
          void Promise.resolve(input.waitForOutputTail?.()).then(() => {
            if (!closed && farewellRequested && farewellResponseId === ownerResponseId) {
              emitMetadata(input, 'realtime_observer_event', 'success', 'sleep_farewell_completed', sessionGeneration, createdAt)
              return request()
            }
          }).catch(() => {
            emitMetadata(
              input,
              'realtime_observer_event',
              'failed',
              'sleep_request_failed',
              sessionGeneration,
              createdAt,
            )
          })
        } catch {
          emitMetadata(
            input,
            'realtime_observer_event',
            'failed',
            'sleep_request_failed',
            sessionGeneration,
            createdAt,
          )
        }
      }
      return
    }
    if (type === 'input_audio_buffer.speech_started') {
      localSearchClue = undefined
      modelAudioResponses.clear(); toolCallResponse = ''
      clearCommandCandidate()
      committedCommandItem = ''
      commandTurnOwned = false
      workingEpoch++
      if (workingCount) { workingCount = 0; notifyAudioActivity('tool_finished') }
      if (mediaPlaybackActive) return
      const itemId = readProperty(event, 'item_id')
      memoryDialogue.speech(typeof itemId === 'string' ? itemId : '')
      if (pendingQuestion) {
        memoryInput('question_cancelled', pendingQuestion.token)
        pendingQuestion = undefined; questionToolEnded = false
      }
      memoryTurnGeneration++
      memoryLatestItem = typeof itemId === 'string' ? itemId : ''
      memoryInput('speech', memoryLatestItem)
      cancelPendingGreeting('wake_greeting_cancelled_visitor_speech')
      notifyAudioActivity('speech_started')
      return
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      if (mediaPlaybackActive) return
      notifyAudioActivity('speech_stopped')
      return
    }
    if (type === 'input_audio_buffer.committed') {
      const itemId = readProperty(event, 'item_id')
      notifyInputItemCreated(itemId)
      if (typeof itemId === 'string' && (!memoryLatestItem || memoryLatestItem === itemId)) committedCommandItem = itemId
      watchCommandFinal()
      return
    }
    if (type === 'conversation.item.created' || type === 'conversation.item.added' || type === 'conversation.item.done') {
      const item = readProperty(event, 'item')
      if (readProperty(item, 'role') === 'user') {
        notifyInputItemCreated(readProperty(item, 'id'))
      }
      return
    }
    if (type === 'conversation.item.input_audio_transcription.delta') {
      const itemId = readProperty(event, 'item_id'), delta = readProperty(event, 'delta')
      if (mediaPlaybackActive || memoryTransportClosed || typeof itemId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(itemId)
        || typeof delta !== 'string' || finalCommandInputs.has(itemId) || memoryLatestItem && itemId !== memoryLatestItem || commandTurnOwned) return
      if (partialCommandItem !== itemId) { partialCommandItem = itemId; partialCommandText = '' }
      // Only a bounded beginning of the current utterance is needed. It stays
      // in RAM and never reaches Main, diagnostics, or command authorization.
      partialCommandText = (partialCommandText + delta.slice(0, 128)).slice(0, 128)
      if (isSpellAttempt(partialCommandText)) {
        commandCandidate = { itemId, generation: memoryTurnGeneration, revised: false, awaitingMemory: false,
          resumeNeeded: false, cancelled: new Set() }
        for (const responseId of new Set([...activeMemoryResponses, ...memoryAudioResponses])) if ((memoryResponses.get(responseId) ?? audioResponseInputs.get(responseId)) === itemId && !applicationResponses.has(responseId)) {
          commandCandidate.resumeNeeded = true
          if (activeMemoryResponses.has(responseId)) commandCandidate.cancelled.add(responseId)
          suppressedResponses.add(responseId)
          if (suppressedResponses.size > 128) suppressedResponses.delete(suppressedResponses.values().next().value!)
        }
        commandTurnOwned = true
        notifyAudioActivity('interrupted')
        // Do not send a premature response.cancel when generation has not begun.
        if (commandCandidate.resumeNeeded) {
          try { void Promise.resolve(session.interrupt()).catch(() =>
            emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt)) }
          catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt) }
        }
        emitMetadata(input, 'realtime_observer_event', 'info', 'command_prefix_pending', sessionGeneration, createdAt)
        watchCommandFinal()
      }
      return
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = readProperty(event, 'transcript')
      const itemId = readProperty(event, 'item_id')
      if (
        typeof itemId !== 'string'
        || !/^[A-Za-z0-9._:-]{1,128}$/.test(itemId)
        || typeof transcript !== 'string'
        || transcript.trim().length === 0
      ) {
        emitMetadata(
          input,
          'realtime_observer_event',
          'degraded',
          'transcript_unavailable',
          sessionGeneration,
          createdAt,
        )
        return
      }
      if (finalCommandInputs.has(itemId)) {
        emitMetadata(input, 'realtime_observer_event', 'info', 'transcript_duplicate_ignored', sessionGeneration, createdAt)
        return
      }
      finalCommandInputs.add(itemId)
      if (finalCommandInputs.size > 128) finalCommandInputs.delete(finalCommandInputs.values().next().value!)
      if (mediaPlaybackActive) rememberMediaInput(itemId)
      const mediaInput = mediaInputItems.has(itemId)
      if (mediaInput) {
        mediaCleanupPending.add(itemId)
        if (mediaCleanupPending.size > 256) mediaCleanupPending.delete(mediaCleanupPending.values().next().value!)
      }
      if (mediaInput && !mediaPlaybackActive) return
      const revisedCandidate = commandCandidate?.itemId === itemId && !isSpellAttempt(transcript) ? commandCandidate : undefined
      if (commandCandidate?.itemId === itemId) {
        clearTimeout(commandCandidateTimer); commandCandidateTimer = undefined
        partialCommandItem = ''; partialCommandText = ''
        if (revisedCandidate) {
          commandTurnOwned = false; revisedCandidate.revised = true; revisedCandidate.awaitingMemory = true
          emitMetadata(input, 'realtime_observer_event', 'info', 'command_prefix_revised', sessionGeneration, createdAt)
          commandCandidateTimer = setTimeout(() => {
            if (commandCandidate !== revisedCandidate) return
            clearCommandCandidate()
            emitMetadata(input, 'realtime_observer_event', 'degraded', 'command_reply_resume_failed', sessionGeneration, createdAt)
          }, 5000)
        } else clearCommandCandidate()
      } else if (partialCommandItem === itemId) { partialCommandItem = ''; partialCommandText = '' }
      if (isSpellAttempt(transcript) && (!memoryLatestItem || memoryLatestItem === itemId)) {
        commandTurnOwned = true
        notifyAudioActivity('interrupted')
        void Promise.resolve(session.interrupt()).catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt))
      }
      const wakeMatched = spokenCommandKey(transcript) === spokenCommandKey(input.avatar?.wakePhrase ?? DEFAULT_WAKE_PHRASE)
      const mediaStopMatched = REALTIME_PROMPTS.mediaStopPhrases.some(phrase => spokenCommandKey(transcript) === spokenCommandKey(phrase))
      if (mediaPlaybackActive) emitMetadata(input, 'realtime_observer_event', 'info',
        wakeMatched ? 'media_wake_matched' : 'media_wake_not_matched', sessionGeneration, createdAt)
      if (mediaPlaybackActive && input.onMediaRequest && (wakeMatched || mediaStopMatched)) {
        commandTurnOwned = true
        memoryInput('control', itemId)
        if (mediaWakeItems.has(itemId)) return
        mediaWakeItems.add(itemId)
        if (mediaWakeItems.size > 256) mediaWakeItems.delete(mediaWakeItems.values().next().value!)
        // The active Realtime session already owns the microphone. Reuse its
        // final ASR event; never acquire a second wake microphone during media.
        void input.onMediaRequest({ action: 'stop' }, { realtimeSessionId: input.sessionId, sessionGeneration })
          .then(outcome => { if (!closed && outcome === 'accepted') return session.interrupt() })
          .catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt))
        return
      }
      if (mediaInput) return
      if (!commandTurnOwned && (!memoryLatestItem || memoryLatestItem === itemId)) {
        if (opensWithSpokenPhrase(transcript, cloudSearchPhrase)) {
          onlineTurns = spokenCommandKey(transcript) === spokenCommandKey(cloudSearchPhrase) ? 2 : 1
          memoryInput('control', itemId)
          emitMetadata(input, 'realtime_observer_event', 'info', 'media_online_unlocked', sessionGeneration, createdAt)
        } else onlineTurns = Math.max(0, onlineTurns - 1)
        const clue = transcript.trim()
        localSearchClue = clue && clue.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(clue)
          ? { generation: memoryTurnGeneration, text: clue } : undefined
      }
      const decisions: Promise<void>[] = []
      for (const listener of [...inputTranscriptCompletedListeners]) {
        try {
          const decision = listener(Object.freeze({ itemId, transcript }))
          if (decision) decisions.push(Promise.resolve(decision))
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
      // Scene matching may refresh Main's catalog asynchronously. Let it claim
      // control before this transcript affects language or private learning.
      const classified = decisions.length ? Promise.all(decisions).catch(() =>
        emitMetadata(input, 'realtime_observer_event', 'degraded', 'transcript_listener_failed', sessionGeneration, createdAt)) : undefined
      memoryInputQueue = memoryInputQueue.then(async () => {
        if (classified) await classified
        if (closed) return
        const current = !memoryLatestItem || memoryLatestItem === itemId
        if (!commandTurnOwned && current) {
          replyLanguage = visitorSentenceLanguage(transcript) ?? replyLanguage
          memoryDialogue.observeVisitorSentence(transcript)
        }
        if (commandTurnOwned && current) await input.onMemoryInput?.('control', itemId, '', { realtimeSessionId: input.sessionId, sessionGeneration })
        const result = await input.onMemoryInput?.('complete', itemId, transcript, { realtimeSessionId: input.sessionId, sessionGeneration })
        if (!closed && result && !commandTurnOwned) void memoryDialogue.answer(itemId, result)
        memoryInputRevision++
        for (const done of memoryInputWaiters) done()
        return result
      }).catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt))
      if (revisedCandidate) void memoryInputQueue.then(() => {
        if (commandCandidate !== revisedCandidate) return
        revisedCandidate.awaitingMemory = false
        resumeRevisedCommand()
      })
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
    if (reportRequestRejection(event)) return
    if (!readyEmitted) latestConnectFailureToken = classifyConnectFailure(event)
    reportFailure(
      readyEmitted ? 'ice' : 'connect',
      'realtime_connect_failed',
      'failed',
      'cause=transport_error',
    )
  }

  function reportRequestRejection(event: unknown): boolean {
    if (!readyEmitted || closed) return false
    const error = readProperty(event, 'error')
    const nested = readProperty(error, 'error')
    if (readProperty(error, 'type') !== 'invalid_request_error' && readProperty(nested, 'type') !== 'invalid_request_error') return false
    // Only known provider codes leave RAM. Never retain messages or arbitrary
    // code strings that could contain request content.
    const reasons: Readonly<Record<string, RealtimeMetadataReason>> = {
      response_cancel_not_active: 'realtime_request_rejected_response_cancel_not_active',
      conversation_already_has_active_response: 'realtime_request_rejected_conversation_already_has_active_response',
      item_not_found: 'realtime_request_rejected_item_not_found',
      invalid_value: 'realtime_request_rejected_invalid_value',
      unknown_parameter: 'realtime_request_rejected_unknown_parameter',
    }
    const code = readProperty(nested, 'code') ?? readProperty(error, 'code')
    const reason = typeof code === 'string' && Object.prototype.hasOwnProperty.call(reasons, code)
      ? reasons[code]! : 'realtime_request_rejected'
    emitMetadata(input, 'realtime_observer_event', 'degraded', reason, sessionGeneration, createdAt)
    return true
  }

  session.on('transport_event', handleTransportEvent)
  session.on('error', handleSessionError)
  session.on('agent_tool_end', (_context, _agent, completedTool) => {
    if (!closed && pendingQuestion && readProperty(completedTool, 'name') === 'memory') { questionToolEnded = true; askPendingQuestion() }
    if (!closed && memoryResetPending && readProperty(completedTool, 'name') === 'memory') {
      memoryResetPending = false
      void Promise.resolve(session.interrupt()).then(async () => {
        // Main may clear its cleanup tombstone only after the old provider session is closed.
        return replaceMemorySession()
      })
        .catch(() => reportFailure('active_disconnect', 'realtime_disconnect', 'failed', 'cause=transport_error'))
      return
    }
    if (closed || !returnToDormantPending || farewellRequested || !sleepToolNames.has(readProperty(completedTool, 'name') as string)) return
    farewellRequested = true
    try {
      // One response with no conversation input: no invitation or tool follow-up.
      const response = { ...buildSpeechResponse(farewell, input.avatar?.speakingStyle ?? ''),
        metadata: { mirror_sleep_cue: farewellCueId } }
      if (transport.requestResponse) transport.requestResponse(response)
      else transport.sendEvent({ type: 'response.create', response })
    } catch {
      returnToDormantPending = false
      farewellRequested = false
      sleepAudioSuppressed = false
      emitMetadata(input, 'realtime_observer_event', 'failed', 'sleep_request_failed', sessionGeneration, createdAt)
    }
  })
  // Interruption and completion stay on official RealtimeSession event surfaces.
  session.on('audio_interrupted', () => {
    cancelPendingGreeting('wake_greeting_cancelled_interrupt')
    returnToDormantPending = false
    returnToDormantAudioStarted = false
    farewellRequested = false
    farewellResponseId = undefined
    farewellAudioStarted = false
    sleepAudioSuppressed = false
    notifyAudioActivity('interrupted')
  })
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
      if (closed) {
        // Stop may run while the SDK is still establishing its transport.
        // Close again after that late completion so no connection survives it.
        await session.close()
        throw new RealtimeSessionAdapterError('session_closed')
      }
      if (failureReported) {
        throw new RealtimeSessionAdapterError('connect_failed')
      }
      latestConnectFailureToken = undefined
      if (input.microphoneRecovery && !closed) {
        const options = input.microphoneRecovery
        microphoneRecovery = watchMicrophone({
          stream: input.mediaStream,
          mediaDevices: options.mediaDevices,
          getConstraints: options.getConstraints,
          replaceTrack: async track => {
            if (closed) throw new Error('session_closed')
            const state = (transport as { connectionState?: { peerConnection?: RTCPeerConnection } }).connectionState
            const sender = state?.peerConnection?.getSenders().find(s => s.track?.kind === 'audio')
            if (!sender) throw new Error('audio_sender_unavailable')
            await sender.replaceTrack(track)
          },
          onStatus: reason => emitMetadata(input, 'realtime_observer_event',
            reason === 'microphone_recovery_ready' ? 'success' : 'degraded', reason, sessionGeneration, createdAt),
        })
      }
      if (!closed) emitReady('cause=connect_succeeded')
      if (!closed) scheduleGreeting()
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
    cancelPendingGreeting('wake_greeting_cancelled_interrupt')
    // WebRTC interrupt sends a server clear but does not emit audio_interrupted.
    // Mute and flush our audible graph before waiting for that network request.
    notifyAudioActivity('interrupted')
    try {
      await session.interrupt()
    } catch {
      emitConnectFailed('cause=transport_error')
    }
  }

  function close(reason: string): Promise<void> {
    if (closePromise !== null) return closePromise
    cancelPendingGreeting('wake_greeting_cancelled_close')
    closed = true
    clearCommandCandidate()
    pendingQuestion = undefined
    memoryDialogue.close()
    for (const done of memoryInputWaiters) done()
    closePromise = (async () => {
    await microphoneRecovery?.stop()
    clearTimeout(cueCancelTimer)
    outputAudioBufferStoppedSubscriptions.clear()
    inputTranscriptCompletedListeners.clear()
    inputItemCreatedListeners.clear()
    createdInputItemIds.clear()
    let closeFailed = false
    try {
      if (!memoryTransportClosed) await session.close()
    } catch {
      closeFailed = true
    }
    resetCues()
    const disconnectReason = stableCloseReason(reason)
    emitDisconnected(closeFailed ? 'cause=close_failed' : disconnectReason)
    })()
    return closePromise
  }

  const notifyInputItemCreated = (itemId: unknown): void => {
    if (typeof itemId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(itemId)) return
    if (mediaPlaybackActive) rememberMediaInput(itemId)
    if (mediaInputItems.has(itemId)) return
    if (createdInputItemIds.has(itemId)) return
    createdInputItemIds.add(itemId)
    if (input.onMemoryInput) memoryInputQueue = memoryInputQueue.then(() => {
      if (!closed) return input.onMemoryInput!('start', itemId, '', { realtimeSessionId: input.sessionId, sessionGeneration })
      return undefined
    }).catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'tool_execution_failed', sessionGeneration, createdAt))
    for (const listener of [...inputItemCreatedListeners]) {
      try {
        listener(itemId)
      } catch {
        emitMetadata(
          input,
          'realtime_observer_event',
          'degraded',
          'input_item_listener_failed',
          sessionGeneration,
          createdAt,
        )
      }
    }
  }

  function speakVerbatim(text: string, signal?: AbortSignal, onFinished?: (completed: boolean) => void): void {
    if (closed) throw new RealtimeSessionAdapterError('session_closed')
    if (mediaPlaybackActive) throw new RealtimeSessionAdapterError('media_playback_active')
    if (text.trim().length === 0 || text.length > 1000) {
      throw new RealtimeSessionAdapterError('scene_dialogue_invalid')
    }
    const response = buildSpeechResponse(text, input.avatar?.speakingStyle ?? '')
    signal ??= new AbortController().signal
    if (signal.aborted) return
    const id = `scene-${sessionGeneration}-${++cueSequence}`
    const cue: SpeechCue = {
      signal, finish: onFinished, sent: false, done: false, cleared: false, played: false, failed: false,
      send: () => {
        try { transport.sendEvent({ type: 'response.create', event_id: id, response: { ...response, metadata: { mirror_scene_cue: id } } }) }
        catch { cue.failed = true; cue.done = true; cue.played = true; cue.cleared = true; releaseFinishedCues() }
      },
      abort: () => {
        if (closed) return
        if (!cue.sent) { cue.done = true; cue.cleared = true; releaseFinishedCues(); return }
        // Keep queued SDK requests inaudible until their own cancellation and
        // buffer-clear acknowledgements arrive. Unrelated output cannot release them.
        cueMuted ??= input.audioElement.muted
        input.audioElement.muted = true
        // Interrupt also silences and drains the processed Web Audio graph.
        // Its begin/output_started hook stays blocked until cancellation resolves.
        notifyAudioActivity('interrupted')
        const failCancellation = () => {
          reportFailure('ice', 'realtime_observer_event', 'failed', 'scene_dialogue_cancel_failed')
          void close('scene_dialogue_cancel_failed')
        }
        cueCancelTimer ??= setTimeout(failCancellation, 8000)
        if (!cue.responseId) return
        try {
          if (!cue.done) transport.sendEvent({ type: 'response.cancel', response_id: cue.responseId })
          transport.sendEvent({ type: 'output_audio_buffer.clear' })
        } catch { failCancellation() }
      },
    }
    cues.set(id, cue)
    signal.addEventListener('abort', cue.abort, { once: true })
    pumpSpeech()
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

  function onInputItemCreated(listener: InputItemCreatedListener): () => void {
    if (closed) return () => {}
    inputItemCreatedListeners.add(listener)
    return () => inputItemCreatedListeners.delete(listener)
  }

  function setMediaPlayback(active: boolean): void {
    if (closed || mediaPlaybackActive === active) return
    mediaPlaybackActive = active
    if (active && memoryDialogue.active) { memoryDialogue.cancel(); return }
    // Preserve the configured VAD and one mic owner, but prevent model replies.
    transport.sendEvent({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: {
      type: turnDetection.type, create_response: !active, interrupt_response: true,
      ...(turnDetection.eagerness ? { eagerness: turnDetection.eagerness } : {}),
      ...(turnDetection.threshold !== undefined ? { threshold: turnDetection.threshold,
        prefix_padding_ms: turnDetection.prefixPaddingMs, silence_duration_ms: turnDetection.silenceDurationMs } : {}),
    } } } } })
    if (active) void interrupt()
  }

  return Object.freeze({
    realtimeSessionId: input.sessionId,
    sessionGeneration,
    connect,
    getLastConnectFailureToken: () => latestConnectFailureToken,
    interrupt,
    setMediaPlayback,
    close,
    speakVerbatim,
    claimControlTurn: (itemId: string) => { if (!memoryLatestItem || memoryLatestItem === itemId) commandTurnOwned = true },
    onOutputAudioBufferStopped,
    onInputItemCreated,
    onInputTranscriptCompleted,
  })
}
