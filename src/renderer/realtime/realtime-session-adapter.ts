import { REALTIME_PROMPTS, buildAuditionPrompt, buildSpeechResponse } from '../../shared/realtime-prompts'
import { danceWelcomeLine } from '../../shared/dance-prompt'
import { memoryNeedsReset } from '../../shared/memory'
import {
  RealtimeAgent,
  RealtimeSession,
  type RealtimeSessionOptions,
} from '@openai/agents/realtime'
import { avatarRealtimeTools, buildAvatarPrompt, buildStudioCommentPrompt, buildStudioPrompt, studioToolSpecs, type AvatarSessionSettings } from '../../shared/avatar-prompt'
import { PORTRAIT_STUDIO, renderStudioText, studioFarewellSpeech, studioFirstStepInstructions, studioPrompt, studioReplyLanguage, studioRevealInstructions } from '../../shared/portrait-studio-config'
import type { StudioEventIdentity, StudioReply, StudioRequest, StudioSessionEvent, StudioStep } from '../../shared/portrait-studio'
import { playSpeechScript } from './speech-script'
import { IMAGE_SKILL, type ImageSkillEvent, type ImageSkillReply, type ImageSkillRequest } from '../../shared/image-skill'
import { MemoryDialogue } from './memory-dialogue'
import { isSpellAttempt, opensWithSpokenPhrase, spokenCommandKey } from '../../shared/spoken-command'
import { bindRealtimeTools, type RealtimeToolHandler, type ToolFailureReason } from './realtime-tool-bindings'
import { mergedMediaTool } from './merged-media-tool'
import { MediaSearchContext } from './media-search-context'
import { mediaDiscoveryNext } from '../../shared/media-discovery'
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
  readonly onStudioRequest?: (request: StudioRequest, identity: import('../../shared/bridge').RealtimeSessionIdentity) => Promise<StudioReply>
  readonly onImageRequest?: NonNullable<import('../../shared/bridge').MirrorBridge['imageSkill']>
  /** Downscales a Portrait Studio image URL to a small JPEG data URL for the model; null when unavailable. */
  readonly prepareStudioImage?: (imageUrl: string) => Promise<string | null>
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
  /** Portrait Studio events from Main (via the Mirror): agent swap, reveal, failure lines, end of keepsake. */
  studioEvent?(event: StudioSessionEvent, identity: StudioEventIdentity): void
  imageEvent?(event: ImageSkillEvent, identity: StudioEventIdentity): void
  close(reason: string): Promise<void>
  speakVerbatim(text: string, signal?: AbortSignal, onFinished?: (completed: boolean) => void): void
  danceWelcome?(language: 'zh-TW' | 'en', signal: AbortSignal, onFinished: (completed: boolean) => void): void
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
  let farewellScript: Promise<boolean> | undefined
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
  const mediaSearch = new MediaSearchContext()
  let memoryInputQueue: Promise<unknown> = Promise.resolve()
  let memoryInputRevision = 0
  let memoryTurnGeneration = 0
  let memoryLatestItem = ''
  let replyLanguage: 'chinese' | 'english' = 'chinese'
  // Preamble diagnostics belong to the response that called the tool.
  const modelAudioResponses = new Set<string>()
  const spokenResponses = new Set<string>()
  let toolCallResponse = ''
  let memoryTransportClosed = false
  const memoryResponses = new Map<string, string>()
  const audioResponseInputs = new Map<string, string>()
  const activeMemoryResponses = new Set<string>()
  const memoryAudioResponses = new Set<string>()
  const audioResponseOrder = new Map<string, number>()
  let nextAudioResponseOrder = 0
  const finishedMemoryAudio = new Set<string>()
  let pendingQuestion: import('../../shared/memory').MemoryReply['confirmation']
  let questionToolEnded = false
  const promptAvatar: AvatarSessionSettings = input.avatar ?? { ...REALTIME_PROMPTS.defaults, speakingStyle: '', wakeGreeting: input.wakeGreeting ?? '', sleepFarewell: input.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell! }
  const baseInstructions = input.preview ? buildAuditionPrompt(input.avatar?.speakingStyle ?? '') : buildAvatarPrompt(promptAvatar)
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
    if (pendingQuestion && studioActive) {
      // Identity questions never interrupt the studio; Main learns this one was not asked.
      memoryInput('question_cancelled', pendingQuestion.token)
      pendingQuestion = undefined; questionToolEnded = false
      return
    }
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
  // The studio entry tool needs Main's studio; without it the model never sees the tool.
  const imageHandlers = new Set(['create_image', 'edit_image', 'dismiss_image', 'studio_use_photo'])
  const toolSpecs = avatarRealtimeTools(input.avatar, input.preview).filter(spec => (spec.handler !== 'start_portrait_studio' || !!input.onStudioRequest) && (!imageHandlers.has(spec.handler) || !!input.onImageRequest))
  // The studio agent exists only when the application can execute studio requests.
  const studioSpecs = input.preview || !input.onStudioRequest ? [] : studioToolSpecs({ ...promptAvatar, sleepPhrase: input.avatar?.sleepPhrase ?? LEGACY_SLEEP_PHRASE }).filter(spec => !imageHandlers.has(spec.handler) || !!input.onImageRequest)
  const studioInstructions = studioSpecs.length ? buildStudioPrompt(promptAvatar) : ''
  const studioToolNames = new Set([...studioSpecs.filter(spec => spec.availability === 'studio'), ...toolSpecs.filter(spec => spec.handler === 'start_portrait_studio')].map(spec => spec.name))
  let studioActive = false
  /** Studio runs started in this session; work queued for one run never reaches a later run. */
  let studioStarts = 0
  let studioEnter: Promise<boolean> | undefined
  let studioAgentSwap: Promise<unknown> = Promise.resolve()
  let studioRevealImageItem: string | undefined
  // A studio started by Main (wake, Mirror mode switch, Console) gets its first step with `enter`;
  // a visitor's own request gets it in the tool result instead.
  let studioNameReadBack: { run: number; name: string; inputs: number; stepId?: string } | undefined, visitorInputs = 0, studioEnteredInputs = -1, studioRevealInputs = -1
  // Items the server added to the conversation; out-of-band replies never are (they may still get item.done).
  const listedItems = new Set<string>()
  let studioFirstStep = '', studioFirstStepPending = false, studioFirstLanguage: 'zh' | 'en' = 'zh'
  // The run whose final reveal is speaking; the application finishes it when that reply ends.
  let studioFinalReveal: number | undefined
  let studioStep: StudioStep | undefined
  let studioStepAbort = new AbortController()
  let studioStepSpeaking = false
  let studioListeningStep: string | undefined
  let studioCapturePaused = false
  const studioMutedTracks = new Map<MediaStreamTrack, boolean>()
  const studioIgnoredInputs = new Set<string>()
  let studioRevisionAnnounced = false
  let studioStepInputs = -1
  let studioStepBeforeQuestion = false
  let studioResumeStep: StudioStep | undefined
  const speechScripts = new Set<AbortController>()
  const farewellParts = new Set<string>()
  // Main starts a studio-default session once it is active; the greeting waits for its `enter`.
  let studioDefaultStart: Promise<boolean> | undefined
  let studioDefaultSettle: ((started: boolean) => void) | undefined
  let studioDefaultTimer: ReturnType<typeof setTimeout> | undefined
  let studioImageSequence = 0
  let studioSendSequence = 0
  // Main's latest portrait revision in the current run; an older one is never revealed after it.
  let studioRevision = 0
  let imageRun = '', imageUrl = '', imageClosed = true, imageRevealInputs = -1, imageLastRequestInputs = -1
  let imageConsent: { id: string; ticket: string; armed: boolean; startedInputs: number; abort: AbortController } | undefined
  let imagePhotoPending = false, imageRevealItem: string | undefined
  let cameraViewingPending = false
  let imageStateItem: string | undefined
  const imageCues = new AbortController()
  let visitorSpeaking = false
  let speechSettledAt = 0
  let idleRetryTimer: ReturnType<typeof setTimeout> | undefined
  const studioItems = new Set<string>()
  // Function calls by call_id: a call and its output are deleted together, or neither.
  // An interrupted (incomplete) call never runs, so it ends without an output.
  const studioCalls = new Map<string, { call?: string; output?: string; ended?: boolean }>()
  // Visitor turns that began in the studio stay control turns even if it closes first.
  const studioTurnItems = new Set<string>()
  // Application responses the server rejected before they started: one retry when idle.
  const studioSends = new Map<string, () => void>()
  const retrievedItems = new Set<string>()
  const idleTasks: { run: () => boolean | void; timer: ReturnType<typeof setTimeout> }[] = []
  const studioIdentity = () => ({ realtimeSessionId: input.sessionId, sessionGeneration })
  async function studioRequest(request: StudioRequest): Promise<StudioReply | null> {
    if (closed || !input.onStudioRequest) return null
    try { return await input.onStudioRequest(request, studioIdentity()) } catch { return null }
  }
  async function imageRequest(request: ImageSkillRequest): Promise<ImageSkillReply> {
    try { return await input.onImageRequest?.(request, studioIdentity()) ?? { status: 'failed', code: 'image_unavailable' } }
    catch { return { status: 'failed', code: 'image_unavailable' } }
  }
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
  let conversationAgent: RealtimeAgent | undefined
  let studioAgent: RealtimeAgent | undefined
  try {
    const transportFactory = dependencies?.createTransport ?? createWebRtcRealtimeTransport
    transport = transportFactory({
      mediaStream: input.mediaStream,
      audioElement: input.audioElement,
    })
    const agentConstructor = dependencies?.RealtimeAgent ?? RealtimeAgent
    const sessionConstructor = dependencies?.RealtimeSession ?? RealtimeSession
    const studioTool = async (request: StudioRequest) => {
      // A spoken command owns this turn; a studio call from its cancelled reply is stale.
      if (closed || !studioActive || commandTurnOwned) return { outcome: 'ignored' as const, studio: { status: 'ignored' as const, code: 'studio_not_active_stale' } }
      if ((imagePhotoPending || studioStepSpeaking) && request.action !== 'exit') return { outcome: 'ignored' as const, spoken: true, studio: { status: 'ignored' as const, code: imagePhotoPending ? 'studio_photo_pending' : 'studio_step_speaking' } }
      // A language switch may also come while painting, which has no listening step.
      if (studioStep && ['set_name', 'confirm_name', 'reject_name', 'repeat', 'answer', 'revise', 'finish', 'language'].includes(request.action)
        && (request.action !== 'language' && studioListeningStep !== studioStep.id || visitorInputs <= studioStepInputs)) return awaitingVisitor()
      const reply = await studioRequest(request)
      if (!reply) return { outcome: 'failed' as const, studio: { status: 'failed' as const, code: 'studio_unavailable' } }
      return { outcome: reply.status, studio: reply, ...(reply.step ? { spoken: true } : {}) }
    }
    // A name or answer recorded before the visitor spoke is the model's own text: ignored silently.
    const awaitingVisitor = async () => {
      emitMetadata(input, 'realtime_observer_event', 'info', 'studio_visitor_reply_missing', sessionGeneration, createdAt)
      return { outcome: 'ignored' as const, spoken: true, studio: { status: 'ignored' as const, code: 'studio_visitor_reply_missing' } }
    }
    const imageTool = async (request: ImageSkillRequest) => {
      if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || memoryDialogue.active || pendingQuestion
        || !visitorInputs || (imagePhotoPending && request.action !== 'dismiss'
          && !(cameraViewingPending && request.action === 'generate' && request.source === 'photo'))) return { outcome: 'ignored' as const, spoken: true, image: { status: 'ignored' as const, code: 'image_request_stale' } }
      if (request.action === 'edit' && (imageClosed || visitorInputs <= imageRevealInputs)) return { outcome: 'rejected' as const, image: { status: 'rejected' as const, code: 'image_not_available' } }
      if (['generate', 'edit', 'studio_photo'].includes(request.action)) {
        if (imageLastRequestInputs === visitorInputs) return { outcome: 'ignored' as const, spoken: true, image: { status: 'ignored' as const, code: 'image_request_stale' } }
        imageLastRequestInputs = visitorInputs
      }
      if (memoryLatestItem) memoryInput('control', memoryLatestItem)
      if ('language' in request) {
        request = { ...request, language: replyLanguage === 'english' ? 'en' : 'zh' }
      }
      cameraViewingPending = request.action === 'camera_permission'
      const photo = request.action === 'camera_permission' || request.action === 'studio_photo' || request.action === 'generate' && request.source === 'photo'
      if (photo) imagePhotoPending = true
      const image = await imageRequest(request)
      if (photo && image.code !== 'image_consent_pending') imagePhotoPending = false
      return { outcome: image.status, image }
    }
    const toolHandlers: Record<string, RealtimeToolHandler> = {
      set_reply_language: async args => {
        if (closed || commandTurnOwned || !visitorInputs || mediaPlaybackActive || returnToDormantPending || memoryDialogue.active || pendingQuestion)
          return { outcome: 'ignored', spoken: true }
        const language = args.language as 'zh' | 'en'
        const result = studioActive ? await studioTool({ action: 'language', language }) : { outcome: 'accepted' as const }
        if (result.outcome !== 'accepted') return result
        replyLanguage = language === 'en' ? 'english' : 'chinese'
        memoryDialogue.setReplyLanguage(replyLanguage)
        if (memoryLatestItem) memoryInput('control', memoryLatestItem)
        emitMetadata(input, 'realtime_observer_event', 'info', 'reply_language_changed', sessionGeneration, createdAt)
        return result
      },
      create_image: args => imageTool({ action: 'generate', prompt: args.prompt as string, picture: args.picture as 'portrait' | 'sticker', source: args.source as 'description' | 'photo', language: args.language as 'zh' | 'en' }),
      edit_image: args => imageTool({ action: 'edit', prompt: args.prompt as string, language: args.language as 'zh' | 'en' }),
      // In Studio an ignored dismissal stays silent: a model follow-up would inherit the
      // step's required tool_choice and be forced into another, unrelated tool call.
      dismiss_image: async () => {
        const result = await imageTool({ action: 'dismiss' })
        return studioActive && result.outcome === 'ignored' ? { ...result, spoken: true } : result
      },
      studio_use_photo: args => imageTool({ action: 'studio_photo', language: args.language as 'zh' | 'en' }),
      start_portrait_studio: async () => {
        // Duplicate or stale starts stay silent (background results), never an unguided reply.
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || studioActive) {
          return { outcome: 'ignored', studio: { status: 'ignored', code: studioActive ? 'studio_start_duplicate' : 'studio_start_stale' } }
        }
        // An identity question owns the turn; the visitor can ask again once it is answered.
        if (memoryDialogue.active || pendingQuestion) {
          emitMetadata(input, 'realtime_observer_event', 'info', 'studio_identity_question_pending', sessionGeneration, createdAt)
          return { outcome: 'rejected', studio: { status: 'rejected', code: 'studio_identity_question_pending', next: PORTRAIT_STUDIO.guidance.identityPending } }
        }
        const unavailable = { outcome: 'failed' as const, studio: { status: 'failed' as const, code: 'studio_unavailable', next: studioPrompt(input.avatar?.experience?.studio, 'unavailable') } }
        if (input.onImageRequest) await imageRequest({ action: 'dismiss' })
        const reply = await studioRequest({ action: 'start', source: 'visitor' })
        if (!reply) return unavailable
        // The swap precedes the tool output, so the studio agent asks the name question.
        if (reply.status === 'accepted' && !await enterStudio()) { void studioRequest({ action: 'exit' }); return unavailable }
        if (reply.step) queueStudioStep(reply.step, reply.next, false, input.avatar?.experience?.studio.startScript)
        return { outcome: reply.status, studio: reply, ...(reply.step ? { spoken: true } : {}) }
      },
      studio_set_name: async args => {
        if (visitorInputs === studioEnteredInputs) return awaitingVisitor()
        studioFirstStepPending = false
        // Only the visitor's reply to a read-back confirms: a later visitor turn, about the name read back.
        const name = (args.name as string).trim(), readBack = studioNameReadBack
        const confirmed = args.confirmed === true && readBack?.run === studioStarts && readBack.name === name && visitorInputs > readBack.inputs
        const result = await studioTool({ action: 'set_name', name, confirmed, language: args.language as 'zh' | 'en' })
        if (result.outcome === 'accepted' && ['studio_name_heard', 'studio_name_candidates'].includes(result.studio.code))
          studioNameReadBack = { run: studioStarts, name: result.studio.candidates?.[0] ?? name, inputs: visitorInputs, stepId: result.studio.step?.id }
        return { ...result, ...(studioStep && result.outcome === 'accepted' ? { spoken: true } : {}) }
      },
      studio_confirm_name: async () => {
        const readBack = studioNameReadBack
        if (!readBack?.stepId || readBack.run !== studioStarts || visitorInputs <= readBack.inputs) return awaitingVisitor()
        const result = await studioTool({ action: 'confirm_name', stepId: studioStep?.phase === 'confirm' ? studioStep.id : readBack.stepId })
        if (result.outcome === 'accepted') studioNameReadBack = undefined
        return { ...result, ...(result.outcome === 'accepted' ? { spoken: true } : {}) }
      },
      studio_reject_name: async () => {
        if (visitorInputs <= studioStepInputs) return awaitingVisitor()
        const result = await studioTool({ action: 'reject_name' })
        studioNameReadBack = undefined
        return { ...result, ...(studioStep && result.outcome === 'accepted' ? { spoken: true } : {}) }
      },
      studio_repeat_question: async () => {
        const result = await studioTool({ action: 'repeat' })
        return { ...result, ...(result.outcome === 'accepted' ? { spoken: true } : {}) }
      },
      studio_answer: async args => {
        if (visitorInputs === studioEnteredInputs) return awaitingVisitor()
        studioFirstStepPending = false
        const result = await studioTool({ action: 'answer', question: args.question as number, answer: args.answer as string, language: args.language as 'zh' | 'en' })
        return { ...result, ...(studioStep && result.outcome === 'accepted' ? { spoken: true } : {}) }
      },
      studio_revise: async args => {
        // A change is the visitor's request after seeing the picture, never the reveal's own idea.
        if (visitorInputs === studioRevealInputs) return awaitingVisitor()
        // Echo/noise captured during the offer is not a new preference. Wait for
        // a nonempty final transcript of this later visitor turn, never its text.
        if (studioStep && !await studioReplyHeard()) return awaitingVisitor()
        // A preamble already told the visitor about the repaint; the result's own reply would repeat it.
        const preamble = spokenResponses.has(toolCallResponse)
        studioRevisionAnnounced = preamble
        try {
          const result = await studioTool({ action: 'revise', change: args.change as string })
          if (result.outcome !== 'accepted') studioRevisionAnnounced = false
          return result.outcome === 'accepted' && (studioStep || preamble) ? { ...result, spoken: true } : result
        } catch (error) { studioRevisionAnnounced = false; throw error }
      },
      // The visitor is happy only if they said so after the picture was shown.
      studio_finish: async () => {
        if (visitorInputs === studioRevealInputs) return awaitingVisitor()
        if (studioStep && !await studioReplyHeard()) return awaitingVisitor()
        const result = await studioTool({ action: 'finish' })
        return { ...result, ...(studioStep && result.outcome === 'accepted' ? { spoken: true } : {}) }
      },
      studio_exit: async () => {
        const result = await studioTool({ action: 'exit' })
        // A reply suppressed by a spoken command reached no Main; the studio stays open on both sides.
        if (studioActive && result.outcome === 'ignored') return result
        await exitStudio()
        return result.outcome === 'ignored' ? { outcome: 'accepted' as const, studio: { status: 'accepted' as const, code: 'studio_exited', next: studioPrompt(input.avatar?.experience?.studio, 'exited') } } : result
      },
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
        // The studio agent has no memory tool; a call that raced the swap never asks identity mid-studio.
        if (closed || commandTurnOwned || studioActive || mediaPlaybackActive || returnToDormantPending || !input.onMemory) return 'failed'
        await memoryInputQueue
        if (closed || commandTurnOwned || studioActive || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        const revision = memoryInputRevision
        // Main asks the identity question in the selected reply language, never a guessed one.
        const request = () => input.onMemory!(args as unknown as import('../../shared/memory').MemoryRequest,
          { realtimeSessionId: input.sessionId, sessionGeneration }, replyLanguage === 'english' ? 'en' : 'zh-TW')
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
        if (closed || commandTurnOwned || studioActive || mediaPlaybackActive || generation !== memoryTurnGeneration) return stale()
        if (memory.confirmation) { pendingQuestion = memory.confirmation; questionToolEnded = false }
        return { outcome: memory.status, memory }
      },
      capture_camera: async () => {
        if (!input.onCameraCapture || !input.onImageRequest) return 'failed'
        return imageTool({ action: 'camera_permission', language: replyLanguage === 'english' ? 'en' : 'zh' })
      },
      find_media: async args => {
        const generation = memoryTurnGeneration
        const stale = () => ({ outcome: 'ignored' as const, media: { status: 'rejected' as const, code: 'media_discovery_stale', resources: [], total: 0 } })
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending) return stale()
        const request = mediaSearch.prepare({ query: args.query as string, kind: args.kind as import('../../shared/media-discovery').MediaDiscoveryRequest['kind'] }, args.context === 'refine' ? 'refine' : 'new', generation)
        if (!request) return { outcome: 'accepted', media: { status: 'accepted', code: 'media_discovery_context_missing', resources: [], total: 0 }, next: 'ask' }
        let media = await findLocalMedia(request, generation)
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        media = mediaSearch.remember(request, media, generation, args.context === 'refine')
        const online = args.kind !== 'image' && media.code === 'media_discovery_no_match' && !await onlineMediaRestriction()
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration) return stale()
        return { outcome: media.status, media, next: online ? 'search_youtube' : mediaDiscoveryNext(media) }
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
          mediaSearch.remember({ query: args.query as string, kind: 'all' }, media, generation, false)
          if (media.resources.length) return { outcome: 'accepted', code: 'media_discovery_results', media, next: mediaDiscoveryNext(media) }
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
        const generation = memoryTurnGeneration
        const selection = mediaSearch.selection(args.kind as string, args.assetId as string, generation)
        if (selection !== 'ready') {
          emitMetadata(input, 'realtime_observer_event', 'info', 'media_selection_required', sessionGeneration, createdAt)
          return { outcome: 'rejected', code: 'media_selection_required', next: selection === 'clarify' ? 'ask' : 'find_media' }
        }
        const result = await requestMedia({ action: 'play', kind: args.kind as import('../../shared/media-skill').LocalMediaKind, assetId: args.assetId as string,
          mode: args.mode as 'once' | 'loop' })
        if (result === 'accepted') mediaSearch.played(args.kind as string, args.assetId as string, generation)
        return result
      },
      stop_media: async () => {
        if (closed || commandTurnOwned || !input.onMediaRequest) return 'ignored'
        return requestMedia({ action: 'stop' })
      },
      return_to_dormant: async () => {
        if (closed || commandTurnOwned || mediaPlaybackActive || returnToDormantPending || farewellRequested) return 'ignored'
        if (input.onImageRequest) await imageRequest({ action: 'dismiss' })
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
    }
    const onToolFailure = (reason: ToolFailureReason) => {
      if (!returnToDormantPending && !farewellRequested) sleepAudioSuppressed = false
      emitMetadata(input, 'realtime_observer_event', 'degraded', reason, sessionGeneration, createdAt)
    }
    // Preamble diagnostics for both agents' tools.
    const onToolInvocation = (name: string) => {
      if (!mediaToolNames.has(name)) mediaSearch.clear()
      const preamble = modelAudioResponses.has(toolCallResponse) || spokenResponses.has(toolCallResponse) ? 'yes' : 'no'
      return (outcome: import('../../shared/realtime-tools').ToolOutcome) => {
        const known = OBSERVED_TOOL_NAMES.find(value => value === name)
        if (known) emitMetadata(input, 'realtime_observer_event', 'info', `tool_${known}_${outcome}_preamble_${preamble}`, sessionGeneration, createdAt)
      }
    }
    const tools = bindRealtimeTools(toolSpecs, toolHandlers, onToolFailure, onToolInvocation)
    const agent = new agentConstructor({
      name: 'magic-mirror-realtime',
      instructions: baseInstructions,
      tools,
    })
    conversationAgent = agent
    studioAgent = studioSpecs.length ? new agentConstructor({ name: 'magic-mirror-portrait-studio', instructions: studioInstructions,
      tools: bindRealtimeTools(studioSpecs, toolHandlers, onToolFailure, onToolInvocation) }) : undefined
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
  // Only a woken session (it carries the wake greeting) waits for Main's studio start; a rollover never does.
  const studioDefaultMode = studioSpecs.length > 0 && input.avatar?.experience?.defaultMode === 'portrait_studio' && input.wakeGreeting !== undefined
  let greetingState: 'pending' | 'sent' | 'cancelled' | 'none' = input.wakeGreeting?.trim() || studioDefaultMode ? 'pending' : 'none'
  if (studioDefaultMode) studioDefaultStart = new Promise<boolean>(resolve => { studioDefaultSettle = resolve })
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
    const speak = (text: string, onFinished?: (completed: boolean) => void) => {
      if (closed || !text.trim()) return
      try { speakVerbatim(text, greetingAbort.signal, onFinished) }
      catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'wake_greeting_failed', sessionGeneration, createdAt) }
    }
    if (!studioDefaultStart) { speak(input.wakeGreeting ?? ''); return }
    // Studio-default sessions greet with the studio start script once Main started the studio.
    void studioDefaultStart.then(started => {
      if (closed) return
      if (started && studioStep) queueStudioStep(studioStep, undefined, false, input.avatar!.experience!.studio.startScript)
      else if (started) speak(input.avatar!.experience!.studio.startScript, completed => { if (completed) askStudioFirstStep(studioStarts) })
      else { setStudioCapturePaused(false); speak(input.wakeGreeting ?? '') }
    })
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
  type SpeechCue = { signal: AbortSignal; abort: () => void; send: () => void; sent: boolean; finish?: (completed: boolean) => void; responseId?: string; done: boolean; cleared: boolean; played: boolean; failed: boolean; finishing?: boolean; cancelSent?: boolean; clearSent?: boolean }
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
        if (idleTasks.length) queueMicrotask(runIdleTasks)
      }
      if (cue.signal.aborted || cue.failed) finish(false)
      else {
        cue.finishing = true
        void Promise.resolve(input.waitForOutputTail?.()).then(() => finish(true), () => finish(false))
      }
    }
    if (![...cues.values()].some(cue => cue.signal.aborted)) {
      clearTimeout(cueCancelTimer); cueCancelTimer = undefined
      if (cueMuted !== undefined) input.audioElement.muted = cueMuted
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
    setStudioCapturePaused(false)
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
  // Each item is deleted at most once: a repeated request fails with item_delete_invalid_item_id.
  const deletedItemIds = new Set<string>()
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
    // The SDK retrieves an input item only after a transcript, so a failed
    // transcription is never requested and settles the item the same way.
    const transcriptionFailed = type === 'conversation.item.input_audio_transcription.failed'
    if (type === 'conversation.item.retrieved' || transcriptionFailed) {
      const itemId = transcriptionFailed ? readProperty(event, 'item_id') : readProperty(readProperty(event, 'item'), 'id')
      if (transcriptionFailed) emitMetadata(input, 'realtime_observer_event', 'degraded', 'transcript_unavailable', sessionGeneration, createdAt)
      if (typeof itemId === 'string') { retrievedItems.add(itemId); if (retrievedItems.size > 256) retrievedItems.delete(retrievedItems.values().next().value!) }
      if (typeof itemId === 'string' && mediaCleanupPending.delete(itemId)) {
        // Delete only after that retrieval, otherwise its request fails with item_not_found.
        deleteConversationItem(itemId, 'input')
      }
      return
    }
    if (type === 'response.output_item.added') {
      const item = readProperty(event, 'item'), responseId = readProperty(event, 'response_id')
      if (readProperty(item, 'type') === 'function_call' && typeof responseId === 'string') toolCallResponse = responseId
      // Its audio starts after the tool runs; the message item is the earlier sign of a preamble.
      if (readProperty(item, 'type') === 'message' && typeof responseId === 'string') {
        spokenResponses.add(responseId)
        if (spokenResponses.size > 128) spokenResponses.delete(spokenResponses.values().next().value!)
      }
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
      // A studio reveal is application speech: command-turn suppression never cancels it.
      const applicationOwned = ['mirror_scene_cue', 'mirror_sleep_cue', 'mirror_sleep_part', 'mirror_memory_question', 'mirror_studio', 'mirror_image'].some(key => typeof readProperty(metadata, key) === 'string')
      const ownedResponseId = readProperty(response, 'id')
      if (typeof ownedResponseId === 'string' && readProperty(metadata, 'mirror_sleep_part') === farewellCueId) farewellParts.add(ownedResponseId)
      if (type === 'response.created' && typeof ownedResponseId === 'string' && !audioResponseOrder.has(ownedResponseId)) {
        audioResponseOrder.set(ownedResponseId, ++nextAudioResponseOrder)
        if (audioResponseOrder.size > 128) audioResponseOrder.delete(audioResponseOrder.keys().next().value!)
      }
      if (type === 'response.done' && typeof ownedResponseId === 'string') commandCandidate?.cancelled.delete(ownedResponseId)
      if (applicationOwned && typeof ownedResponseId === 'string') {
        applicationResponses.add(ownedResponseId)
        if (applicationResponses.size > 128) applicationResponses.delete(applicationResponses.values().next().value!)
      }
      if (type === 'response.created' && (commandTurnOwned || studioCapturePaused) && !applicationOwned) {
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
          emitMetadata(input, 'realtime_observer_event', 'info', studioCapturePaused ? 'studio_narration_input_ignored' : 'command_reply_suppressed', sessionGeneration, createdAt)
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
            if (studioActive) rememberStudioTurn(memoryLatestItem)
          }
        } else {
          activeMemoryResponses.delete(memoryResponseId)
          const itemId = memoryResponses.get(memoryResponseId)
          memoryResponses.delete(memoryResponseId)
          const output = readProperty(response, 'output')
          if (!applicationOwned && itemId === memoryLatestItem && readProperty(response, 'status') === 'completed'
            && Array.isArray(output) && !output.some(item => readProperty(item, 'type') === 'function_call')) mediaSearch.endReply(memoryTurnGeneration)
          if (!finishedMemoryAudio.has(memoryResponseId) && readProperty(response, 'status') === 'completed' && Array.isArray(output) && output.some(item => {
            const content = readProperty(item, 'content')
            return Array.isArray(content) && content.some(part => ['audio', 'output_audio'].includes(readProperty(part, 'type') as string))
          })) memoryAudioResponses.add(memoryResponseId)
          // Main classifies memory-management intent from the visitor's actual
          // words. An unsolicited/rejected model save must not erase ordinary evidence.
          const hasControl = Array.isArray(output) && output.some(item => readProperty(item, 'type') === 'function_call'
            && (sleepToolNames.has(readProperty(item, 'name') as string) || mediaToolNames.has(readProperty(item, 'name') as string)
              || studioToolNames.has(readProperty(item, 'name') as string) || imageHandlers.has(readProperty(item, 'name') as string)))
          // Studio turns (name and answers) never reach memory extraction (owner ruling R5, invariant 6).
          if (itemId && (hasControl || studioActive || studioTurnItems.has(itemId))) memoryInput('control', itemId)
          // Application studio replies (the reveal) have no visitor turn; their metadata marks them.
          const studioReply = typeof readProperty(metadata, 'mirror_studio') === 'string' || !!itemId && studioTurnItems.has(itemId)
          if (type === 'response.done' && Array.isArray(output)) for (const item of output) trackStudioItem(item, studioReply)
          if (type === 'response.done' && readProperty(readProperty(response, 'metadata'), 'mirror_studio_final') === 'true' && studioFinalReveal !== undefined) {
            // No change is left: the reveal handed the picture over, so the application finishes the studio
            // (the model is not asked to call studio_finish, which it tended to do before describing).
            const run = studioFinalReveal; studioFinalReveal = undefined
            if (sameStudioRun(run)) void studioRequest({ action: 'finish' })
          }
          if (type === 'response.done' && readProperty(readProperty(response, 'metadata'), 'mirror_studio') === 'reveal' && studioRevealImageItem) {
            // The downscaled image served one reveal; keep it out of later billed context.
            deleteConversationItem(studioRevealImageItem, 'image'); studioRevealImageItem = undefined
          }
          if (type === 'response.done' && readProperty(metadata, 'mirror_image') === 'reveal' && imageRevealItem) {
            deleteConversationItem(imageRevealItem, 'image'); imageRevealItem = undefined
          }
          if (itemId && readProperty(response, 'status') === 'completed') memoryInput('settled', itemId)
          askPendingQuestion()
          if (type === 'response.done') queueMicrotask(runIdleTasks)
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
        // WebRTC may join a tool preamble and its follow-up in one output
        // buffer, then report only the last response when it drains. Retire
        // completed earlier replies too; newer or still-generating replies
        // retain ownership and cannot be interrupted by queued image speech.
        const order = audioResponseOrder.get(responseId)
        const drained = [responseId, ...[...memoryAudioResponses].filter(id => id !== responseId
          && order !== undefined && (audioResponseOrder.get(id) ?? Infinity) < order && !activeMemoryResponses.has(id))]
        for (const id of drained) {
          memoryAudioResponses.delete(id)
          audioResponseInputs.delete(id)
          finishedMemoryAudio.add(id)
        }
        // One WebRTC buffer can contain multiple completed responses. Its drain
        // also completes an earlier cue, while a newer/generating cue stays owned.
        for (const cue of cues.values()) {
          if (!cue.responseId || !(cue.responseId === responseId || cue.done && order !== undefined
            && (audioResponseOrder.get(cue.responseId) ?? Infinity) < order)) continue
          cue.cleared = true
          cue.played = true
          if (type === 'output_audio_buffer.cleared') cue.failed = true
        }
        // Playback completion can precede a late/duplicate response.done.
        while (finishedMemoryAudio.size > 128) finishedMemoryAudio.delete(finishedMemoryAudio.values().next().value!)
      }
      resumeRevisedCommand()
      if (pendingQuestion) void Promise.resolve(input.waitForOutputTail?.()).then(askPendingQuestion)
        .catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'memory_dialogue_failed', sessionGeneration, createdAt))
      if (idleTasks.length) queueMicrotask(runIdleTasks)
    }
    if (type === 'output_audio_buffer.stopped') {
      releaseFinishedCues()
      if (studioActive && studioStep && studioListeningStep === studioStep.id && !studioStepSpeaking && !imagePhotoPending) {
        const step = studioStep
        whenIdle(() => {
          if (studioStep?.id === step.id && !studioStepSpeaking && !imagePhotoPending) void Promise.resolve(input.waitForOutputTail?.())
            .then(() => { if (studioStep?.id === step.id && !visitorSpeaking && !imagePhotoPending) return studioRequest({ action: 'step_ready', stepId: step.id }); return null })
          return false
        })
      }
    }
    if (type === 'output_audio_buffer.cleared') {
      releaseFinishedCues()
      // A server-VAD barge-in clears output without output_audio_buffer.stopped;
      // Main must still learn playback ended, or its idle timer stays paused.
      emitMetadata(input, 'realtime_observer_event', 'success', 'cause=output_interrupted', sessionGeneration, createdAt)
    }
    if (type === 'ready' || (type === 'connection_change' && rawEventStatus(event) === 'connected')) {
      emitReady('cause=connect_succeeded')
      return
    }
    if (type === 'error') {
      const rejectedId = readProperty(readProperty(event, 'error'), 'event_id')
      const studioRetry = typeof rejectedId === 'string' ? studioSends.get(rejectedId) : undefined
      if (studioRetry) { studioSends.delete(rejectedId as string); studioRetry() }
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
      if (sleepAudioSuppressed && (!farewellResponseId || readProperty(event, 'response_id') !== farewellResponseId) && !farewellParts.has(String(responseId))) {
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
          void Promise.resolve(input.waitForOutputTail?.()).then(async () => {
            if (farewellScript && !await farewellScript) return
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
      if (ignoreStudioInput(event)) return
      if (greetingState === 'sent') greetingAbort.abort()
      if (studioActive && studioStep) {
        void studioRequest({ action: 'step_activity', stepId: studioStep.id })
        if (studioStepSpeaking) {
          const resume = studioStepBeforeQuestion || ['painting', 'revising', 'keepsake'].includes(studioStep.phase)
          studioStepAbort.abort()
          studioStepSpeaking = resume
          studioResumeStep = resume ? { ...studioStep, comment: undefined, silent: false } : undefined
        }
      }
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
      mediaSearch.expire(memoryTurnGeneration)
      memoryLatestItem = typeof itemId === 'string' ? itemId : ''
      memoryInput('speech', memoryLatestItem)
      if (imageConsent) { commandTurnOwned = true; memoryInput('control', memoryLatestItem) }
      cancelPendingGreeting('wake_greeting_cancelled_visitor_speech')
      if (studioActive) rememberStudioTurn(memoryLatestItem)
      visitorSpeaking = true
      notifyAudioActivity('speech_started')
      return
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      if (ignoreStudioInput(event)) return
      if (mediaPlaybackActive) return
      visitorSpeaking = false
      // The server normally answers this turn itself; let its response start first.
      speechSettledAt = Date.now() + 1500
      if (studioActive && studioStep) {
        const step = studioStep
        whenIdle(() => {
          if (!studioActive || studioStep?.id !== step.id || visitorSpeaking || imagePhotoPending) return false
          if (studioResumeStep?.id === step.id) queueStudioStep(studioResumeStep)
          else if (!studioStepSpeaking && studioListeningStep === step.id) void studioRequest({ action: 'step_ready', stepId: step.id })
          return true
        })
      }
      if (idleTasks.length) scheduleIdleRetry(1500)
      notifyAudioActivity('speech_stopped')
      return
    }
    if (type === 'input_audio_buffer.committed') {
      if (ignoreStudioInput(event)) return
      visitorInputs++
      const itemId = readProperty(event, 'item_id')
      notifyInputItemCreated(itemId)
      if (typeof itemId === 'string' && (!memoryLatestItem || memoryLatestItem === itemId)) committedCommandItem = itemId
      watchCommandFinal()
      return
    }
    if (type === 'conversation.item.created' || type === 'conversation.item.added' || type === 'conversation.item.done') {
      const item = readProperty(event, 'item'), listed = readProperty(item, 'id')
      if (typeof listed === 'string' && type !== 'conversation.item.done') { listedItems.add(listed); if (listedItems.size > 1024) listedItems.delete(listedItems.values().next().value!) }
      trackStudioItem(item)
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
      if (ignoreStudioInput(event)) return
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
      if (imageConsent && (!memoryLatestItem || memoryLatestItem === itemId)) {
        const consent = imageConsent
        commandTurnOwned = true; memoryInput('control', itemId)
        notifyAudioActivity('interrupted')
        void Promise.resolve(session.interrupt()).catch(() => undefined)
        if (consent.armed && visitorInputs > consent.startedInputs) {
          consent.armed = false
          void imageRequest({ action: 'photo_reply', ticket: consent.ticket, text: transcript.slice(0, 1000), itemId })
            .then(result => { if (imageConsent === consent && result.code !== 'image_consent_not_ready') imageConsent = undefined })
        } else emitMetadata(input, 'realtime_observer_event', 'info', 'image_consent_early_reply', sessionGeneration, createdAt)
        return
      }
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
      // control before this transcript affects private learning.
      const classified = decisions.length ? Promise.all(decisions).catch(() =>
        emitMetadata(input, 'realtime_observer_event', 'degraded', 'transcript_listener_failed', sessionGeneration, createdAt)) : undefined
      memoryInputQueue = memoryInputQueue.then(async () => {
        if (classified) await classified
        if (closed) return
        const current = !memoryLatestItem || memoryLatestItem === itemId
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
    const sdkError = readProperty(event, 'error')
    if (readyEmitted && !closed && sdkError instanceof Error && /^Tool [A-Za-z0-9_-]{1,64} not found$/.test(sdkError.message)) {
      // A Portrait Studio agent swap can race a response the server created under
      // the other agent. The SDK already answered that call; keep the session.
      emitMetadata(input, 'realtime_observer_event', 'degraded', 'realtime_tool_not_found', sessionGeneration, createdAt)
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
  // transport_event carries only server messages. A lost peer connection (failed,
  // or disconnected past the SDK grace) closes the transport, which reports here;
  // an active session must end visibly instead of staying silent and awake.
  ;(transport as unknown as { on?: (name: 'connection_change', listener: (status: unknown) => void) => void })
    .on?.('connection_change', status => {
      if (status === 'disconnected' && readyEmitted) handleTransportEvent({ type: 'connection_change', status })
    })
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
      if (farewell.includes('[pause')) speakVerbatim(farewell, undefined, undefined, { mirror_sleep_cue: farewellCueId! })
      else if (transport.requestResponse) transport.requestResponse(response)
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
      // No post-wake audio may generate an ordinary reply before Main supplies
      // the Studio opening/name sequence. Keep ownership of the existing track.
      if (studioDefaultMode) setStudioCapturePaused(true, false)
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
      if (studioCapturePaused) setStudioCapturePaused(true)
      latestConnectFailureToken = undefined
      if (input.microphoneRecovery && !closed) {
        const options = input.microphoneRecovery
        microphoneRecovery = watchMicrophone({
          stream: input.mediaStream,
          mediaDevices: options.mediaDevices,
          getConstraints: options.getConstraints,
          getTrackEnabled: track => studioMutedTracks.get(track) ?? track.enabled,
          replaceTrack: async track => {
            if (closed) throw new Error('session_closed')
            const state = (transport as { connectionState?: { peerConnection?: RTCPeerConnection } }).connectionState
            const sender = state?.peerConnection?.getSenders().find(s => s.track?.kind === 'audio')
            if (!sender) throw new Error('audio_sender_unavailable')
            if (studioCapturePaused) { studioMutedTracks.set(track, track.enabled); track.enabled = false }
            await sender.replaceTrack(track)
          },
          onStatus: reason => emitMetadata(input, 'realtime_observer_event',
            reason === 'microphone_recovery_ready' ? 'success' : 'degraded', reason, sessionGeneration, createdAt),
        })
      }
      if (!closed) emitReady('cause=connect_succeeded')
      // The default reply language is explicit from the first turn, not only after a switch.
      if (!closed && !input.preview) memoryDialogue.setReplyLanguage(replyLanguage)
      // Main starts the studio after it marks this session active; fall back to the wake greeting.
      if (!closed && studioDefaultSettle) studioDefaultTimer = setTimeout(() => settleStudioDefault(false), 10000)
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
    mediaSearch.reset(); lastLocalSearch = undefined; localSearchClue = undefined
    setStudioCapturePaused(false)
    studioStepAbort.abort()
    for (const controller of speechScripts) controller.abort()
    imageCues.abort(); imageConsent?.abort.abort(); imageConsent = undefined; imagePhotoPending = false; imageClosed = true
    clearCommandCandidate()
    pendingQuestion = undefined
    memoryDialogue.close()
    for (const done of memoryInputWaiters) done()
    for (const task of idleTasks.splice(0)) clearTimeout(task.timer)
    clearTimeout(idleRetryTimer); clearTimeout(studioDefaultTimer)
    studioDefaultSettle?.(false); studioDefaultSettle = undefined
    studioItems.clear(); studioCalls.clear(); studioTurnItems.clear(); studioSends.clear()
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

  function speakVerbatim(text: string, signal?: AbortSignal, onFinished?: (completed: boolean) => void, metadata?: Record<string, string>): void {
    if (closed) throw new RealtimeSessionAdapterError('session_closed')
    if (mediaPlaybackActive) throw new RealtimeSessionAdapterError('media_playback_active')
    if (text.trim().length === 0 || text.length > 1000) {
      throw new RealtimeSessionAdapterError('scene_dialogue_invalid')
    }
    const language = metadata?.mirror_studio && studioStep ? studioReplyLanguage(studioStep.language) : ''
    const responseFor = (segment: string) => {
      const response = buildSpeechResponse(segment, input.avatar?.speakingStyle ?? '')
      return language ? { ...response, instructions: `${language}\n\n${response.instructions}` } : response
    }
    if (text.includes('[pause')) {
      const controller = new AbortController()
      const cancel = () => controller.abort()
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) controller.abort()
      speechScripts.add(controller)
      const playback = playSpeechScript(text, controller.signal, (segment, last) => new Promise(resolve =>
        queueSpeechResponse(responseFor(segment), controller.signal, resolve,
          last ? metadata : metadata?.mirror_sleep_cue ? { mirror_sleep_part: metadata.mirror_sleep_cue } : metadata)))
      if (metadata?.mirror_sleep_cue) farewellScript = playback
      void playback.then(completed => onFinished?.(completed), () => onFinished?.(false))
        .finally(() => { signal?.removeEventListener('abort', cancel); speechScripts.delete(controller); if (idleTasks.length) queueMicrotask(runIdleTasks) })
      return
    }
    queueSpeechResponse(responseFor(text), signal, onFinished, metadata)
  }
  function queueSpeechResponse(response: ReturnType<typeof buildSpeechResponse>, signal?: AbortSignal,
    onFinished?: (completed: boolean) => void, metadata?: Record<string, string>): void {
    signal ??= new AbortController().signal
    if (signal.aborted) { onFinished?.(false); return }
    const id = `scene-${sessionGeneration}-${++cueSequence}`
    const cue: SpeechCue = {
      signal, finish: onFinished, sent: false, done: false, cleared: false, played: false, failed: false,
      send: () => {
        try { transport.sendEvent({ type: 'response.create', event_id: id, response: { ...response, metadata: { mirror_scene_cue: id, ...metadata } } }) }
        catch { cue.failed = true; cue.done = true; cue.played = true; cue.cleared = true; releaseFinishedCues() }
      },
      abort: () => {
        if (closed) return
        if (!cue.sent) { cue.done = true; cue.cleared = true; releaseFinishedCues(); return }
        // Natural stop or VAD clear may precede this abort. Never wait for a
        // second clear of an empty buffer, or clear a newer visitor response.
        if (cue.cleared && cue.done) { releaseFinishedCues(); return }
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
          if (!cue.done && !cue.cancelSent) { cue.cancelSent = true; transport.sendEvent({ type: 'response.cancel', response_id: cue.responseId }) }
          if (!cue.cleared && !cue.clearSent) { cue.clearSent = true; transport.sendEvent({ type: 'output_audio_buffer.clear' }) }
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

  function sendMediaTurnDetection(active: boolean): void {
    // Preserve the configured VAD and one mic owner, but prevent model replies.
    transport.sendEvent({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: {
      type: turnDetection.type, create_response: !active, interrupt_response: true,
      ...(turnDetection.eagerness ? { eagerness: turnDetection.eagerness } : {}),
      ...(turnDetection.threshold !== undefined ? { threshold: turnDetection.threshold,
        prefix_padding_ms: turnDetection.prefixPaddingMs, silence_duration_ms: turnDetection.silenceDurationMs } : {}),
    } } } } })
  }
  /** Application narration is a listen-after-speaking turn, including its DSP tail. */
  function setStudioCapturePaused(paused: boolean, notify = true): void {
    const changed = studioCapturePaused !== paused
    if (changed) {
      studioCapturePaused = paused
      if (paused) {
        for (const track of input.mediaStream.getAudioTracks?.() ?? []) { studioMutedTracks.set(track, track.enabled); track.enabled = false }
      } else {
        for (const [track, enabled] of studioMutedTracks) track.enabled = enabled
        studioMutedTracks.clear()
      }
    }
    if (notify && !closed && (changed || paused)) transport.sendEvent({ type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: {
      ...wireTurnDetection, create_response: !paused && !mediaPlaybackActive, interrupt_response: !paused,
    } } } } })
  }
  function ignoreStudioInput(event: unknown): boolean {
    const item = readProperty(event, 'item_id')
    if (!studioCapturePaused && !(typeof item === 'string' && studioIgnoredInputs.has(item))) return false
    if (typeof item === 'string') {
      studioIgnoredInputs.add(item); rememberStudioTurn(item)
      if (studioIgnoredInputs.size > 128) studioIgnoredInputs.delete(studioIgnoredInputs.values().next().value!)
    }
    emitMetadata(input, 'realtime_observer_event', 'info', 'studio_narration_input_ignored', sessionGeneration, createdAt)
    return true
  }
  async function studioReplyHeard(): Promise<boolean> {
    const item = memoryLatestItem, step = studioListeningStep
    if (!item || !step || visitorInputs <= studioStepInputs) return false
    if (!finalCommandInputs.has(item)) await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); memoryInputWaiters.delete(done); resolve() }
      const timer = setTimeout(done, 1500); memoryInputWaiters.add(done)
    })
    return !closed && studioListeningStep === step && memoryLatestItem === item && finalCommandInputs.has(item) && !studioIgnoredInputs.has(item)
  }
  function setMediaPlayback(active: boolean): void {
    if (closed || mediaPlaybackActive === active) return
    mediaPlaybackActive = active
    if (active) mediaSearch.clear()
    if (active) void imageRequest({ action: 'dismiss' })
    // speech_stopped is ignored during media; never keep a stale speaking flag across it.
    visitorSpeaking = false
    if (!active && idleTasks.length) queueMicrotask(runIdleTasks)
    if (active && memoryDialogue.active) { memoryDialogue.cancel(); return }
    sendMediaTurnDetection(active)
    if (active) void interrupt()
  }

  function rememberStudioItem(itemId: unknown): void {
    if (typeof itemId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(itemId)) return
    studioItems.add(itemId)
    if (studioItems.size > 512) studioItems.delete(studioItems.values().next().value!)
  }
  function rememberStudioTurn(itemId: string): void {
    if (!itemId) return
    studioTurnItems.add(itemId)
    if (studioTurnItems.size > 256) studioTurnItems.delete(studioTurnItems.values().next().value!)
  }
  /**
   * Records studio history for removal on exit: visitor and avatar items, and studio calls with their outputs.
   * A visitor turn that began in the studio, and the reply to it, stay studio history even when they arrive after exit.
   */
  function trackStudioItem(item: unknown, studioTurn = false): void {
    const itemId = readProperty(item, 'id'), kind = readProperty(item, 'type'), callId = readProperty(item, 'call_id')
    // Application system items (hints) hold no visitor content.
    if (typeof itemId !== 'string' || itemId === studioRevealImageItem || readProperty(item, 'role') === 'system') return
    // A late item event for an item already removed must not queue a second delete.
    if (deletedItemIds.has(itemId)) return
    if (kind === 'function_call' || kind === 'function_call_output') {
      if (typeof callId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(itemId)) return
      const known = studioCalls.get(callId)
      if (kind === 'function_call' && (studioActive || known || studioToolNames.has(readProperty(item, 'name') as string))) {
        studioCalls.set(callId, { ...known, call: itemId, ...(readProperty(item, 'status') === 'incomplete' ? { ended: true } : {}) })
      } else if (kind === 'function_call_output' && known) known.output = itemId
      if (studioCalls.size > 256) studioCalls.delete(studioCalls.keys().next().value!)
      // A pair completed or ended after the studio closed: the exit cleanup skipped it, so schedule another.
      const pair = studioCalls.get(callId)
      if (!studioActive && pair?.call && (pair.output || pair.ended)) whenIdle(() => { cleanupStudioItems(); return false }, 30000)
      return
    }
    if (!studioActive && !studioTurn && !studioTurnItems.has(itemId)) return
    const late = !studioActive && !studioItems.has(itemId)
    rememberStudioItem(itemId)
    // The exit cleanup may already have run; a late arrival schedules its own.
    if (late) whenIdle(() => { cleanupStudioItems(); return false }, 30000)
  }
  function cleanupStudioItems(): void {
    // A studio entered again keeps its history until it closes too.
    if (closed || studioActive) return
    if (studioRevealImageItem) { deleteConversationItem(studioRevealImageItem, 'image'); studioRevealImageItem = undefined }
    for (const itemId of studioItems) {
      if (createdInputItemIds.has(itemId) && !retrievedItems.has(itemId)) mediaCleanupPending.add(itemId)
      else if (listedItems.has(itemId)) deleteConversationItem(itemId, 'turn')
    }
    studioItems.clear()
    for (const [callId, pair] of studioCalls) {
      if (!pair.call || !pair.output && !pair.ended) continue
      deleteConversationItem(pair.call, pair.ended && !pair.output ? 'ended_call' : 'call')
      if (pair.output) deleteConversationItem(pair.output, 'output')
      studioCalls.delete(callId)
    }
  }
  /** `kind` names the cleanup path in the event ID, so a rejected delete identifies its path (never its content). */
  function deleteConversationItem(itemId: string, kind: 'input' | 'image' | 'turn' | 'call' | 'ended_call' | 'output'): void {
    if (closed || deletedItemIds.has(itemId)) return
    deletedItemIds.add(itemId)
    if (deletedItemIds.size > 1024) deletedItemIds.delete(deletedItemIds.values().next().value!)
    try { transport.sendEvent({ type: 'conversation.item.delete', event_id: `delete_${kind}_${deletedItemIds.size}`, item_id: itemId }) } catch { /* Cleanup is best effort; the session ends with the visit. */ }
  }
  function rememberStudioSend(eventId: string, retry: () => void): void {
    studioSends.set(eventId, retry)
    if (studioSends.size > 16) studioSends.delete(studioSends.keys().next().value!)
  }
  function scheduleIdleRetry(delayMs: number): void {
    clearTimeout(idleRetryTimer)
    idleRetryTimer = setTimeout(runIdleTasks, Math.max(0, delayMs))
  }
  /**
   * Runs work once no response is active and the visitor is not speaking (Fable
   * review: no response collisions). A task returns true when it started a
   * response; the rest wait for that response to finish.
   */
  function whenIdle(run: () => boolean | void, maxWaitMs = 15000): void {
    if (closed) return
    const force = () => {
      const index = idleTasks.indexOf(task)
      if (index < 0 || closed) return
      // Never force past an identity question, a spoken-command prefix or media:
      // a new response would fail the question or play under media. Each ends on its own.
      if (memoryDialogue.active || pendingQuestion || commandCandidate !== undefined || mediaPlaybackActive) { task.timer = setTimeout(force, 2000); return }
      idleTasks.splice(index, 1)
      emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_speech_forced', sessionGeneration, createdAt)
      run()
    }
    const task = { run, timer: setTimeout(force, maxWaitMs) }
    idleTasks.push(task)
    queueMicrotask(runIdleTasks)
  }
  function runIdleTasks(): void {
    // Also yield to queued application speech, a spoken-command prefix awaiting
    // its final transcript, and an identity question: any new response would
    // fail that question's dialogue.
    if (closed || activeMemoryResponses.size > 0 || visitorSpeaking || memoryAudioResponses.size > 0 || cues.size > 0 || speechScripts.size > 0
      || commandCandidate !== undefined || memoryDialogue.active || pendingQuestion || mediaPlaybackActive) return
    if (Date.now() < speechSettledAt) { scheduleIdleRetry(speechSettledAt - Date.now()); return }
    while (!closed && idleTasks.length) {
      const task = idleTasks.shift()!
      clearTimeout(task.timer)
      if (task.run() === true) return
    }
  }
  function updateAgent(agent: RealtimeAgent): Promise<unknown> {
    return (session as unknown as { updateAgent(agent: RealtimeAgent): Promise<unknown> }).updateAgent(agent)
  }
  /** Cancelling an identity question replaces the whole session, so the studio waits for it instead. */
  async function identityQuestionSettled(maxMs: number): Promise<boolean> {
    const deadline = Date.now() + maxMs
    while (!closed && (memoryDialogue.active || pendingQuestion)) {
      if (Date.now() >= deadline) return false
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    return !closed
  }
  /** Swaps to the studio agent: studio tools and script only, no memory or media tools. */
  function enterStudio(): Promise<boolean> {
    if (closed || !studioAgent) return Promise.resolve(false)
    if (studioActive) return Promise.resolve(true)
    studioEnter ??= (async () => {
      try {
        if (!await identityQuestionSettled(20000)) {
          if (!closed) emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_identity_question_pending', sessionGeneration, createdAt)
          return false
        }
        studioActive = true
        // A new visit begins with the default language, independently of prior conversation.
        if (replyLanguage !== 'chinese') { replyLanguage = 'chinese'; memoryDialogue.setReplyLanguage(replyLanguage) }
        studioStarts++
        studioEnteredInputs = visitorInputs
        const swap = studioAgentSwap.then(() => updateAgent(studioAgent!))
        studioAgentSwap = swap.catch(() => undefined)
        try { await swap; if (mediaPlaybackActive) restoreSessionState(false); return !closed } catch {
          emitMetadata(input, 'realtime_observer_event', 'failed', 'studio_agent_swap_failed', sessionGeneration, createdAt)
          // Restore the conversation agent; later turns must not stay control turns.
          studioActive = false
          studioAgentSwap = studioAgentSwap.then(() => updateAgent(conversationAgent!)).catch(() => undefined)
          await studioAgentSwap
          restoreSessionState()
          return false
        }
      } finally { studioEnter = undefined }
    })()
    return studioEnter
  }
  async function exitStudio(): Promise<void> {
    if (studioEnter) await studioEnter
    if (closed || !studioActive || !conversationAgent) return
    studioActive = false
    studioListeningStep = undefined
    setStudioCapturePaused(false)
    studioStepAbort.abort(); studioStep = undefined; studioStepSpeaking = false; studioResumeStep = undefined; studioRevisionAnnounced = false
    const swap = studioAgentSwap.then(() => updateAgent(conversationAgent!))
    studioAgentSwap = swap.catch(() => undefined)
    try { await swap } catch { emitMetadata(input, 'realtime_observer_event', 'failed', 'studio_agent_swap_failed', sessionGeneration, createdAt) }
    restoreSessionState()
    transport.sendEvent({ type: 'session.update', session: { type: 'realtime', tool_choice: 'auto' } })
    // The name and answers leave the Realtime history once the studio closes (R5).
    whenIdle(() => { cleanupStudioItems(); return false }, 30000)
  }
  /**
   * updateAgent resends the agent's base instructions and the configured turn
   * detection: restore a confirmed visitor's brief and media's no-reply mode.
   */
  function restoreSessionState(brief = true): void {
    if (closed) return
    try {
      if (brief) memoryDialogue.reapply()
      if (mediaPlaybackActive) sendMediaTurnDetection(true)
      if (studioCapturePaused) setStudioCapturePaused(true)
    } catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_agent_swap_failed', sessionGeneration, createdAt) }
  }
  function settleStudioDefault(started: boolean): void {
    const settle = studioDefaultSettle
    if (!settle) return
    studioDefaultSettle = undefined
    clearTimeout(studioDefaultTimer); studioDefaultTimer = undefined
    if (!started && !closed) emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_default_unavailable', sessionGeneration, createdAt)
    settle(started)
  }
  /** False, with a metadata reason, when work queued for an earlier studio run would reach a later one. */
  function sameStudioRun(run: number, requireActive = true): boolean {
    if (run === studioStarts && (!requireActive || studioActive)) return true
    emitMetadata(input, 'realtime_observer_event', 'info', 'studio_event_stale', sessionGeneration, createdAt)
    return false
  }
  function speakStudioLine(text: string, onFinished?: (completed: boolean) => void): boolean {
    if (closed) return false
    try { speakVerbatim(text, undefined, onFinished); return true } catch {
      emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_speech_failed', sessionGeneration, createdAt)
      return false
    }
  }
  /** Main advances the state; one cancellable speech sequence performs that step. */
  function queueStudioStep(step: StudioStep, _guidance?: string, preempt = false, opening?: string): void {
    if (closed || !studioActive) return
    const revisionAnnounced = step.phase === 'revising' && studioRevisionAnnounced
    if (step.phase === 'revising') studioRevisionAnnounced = false
    const cancellingCue = [...cues.values()].some(c => c.signal === studioStepAbort.signal && c.sent && !c.cleared)
    studioStepAbort.abort()
    const controller = new AbortController()
    studioStepAbort = controller; studioStep = step; studioStepSpeaking = true; studioStepInputs = visitorInputs
    studioListeningStep = undefined
    setStudioCapturePaused(true)
    studioStepBeforeQuestion = !!opening || !!step.comment || !!step.silent; studioResumeStep = undefined
    // Required structured turns cannot silently become an unrecorded chat reply.
    // Clarification/repetition has its own non-recording tool; painting stays conversational.
    transport.sendEvent({ type: 'session.update', session: { type: 'realtime', tool_choice:
      ['name', 'confirm', 'question', 'reveal'].includes(step.phase) ? 'required' : 'auto' } })
    studioFirstStepPending = false
    const run = studioStarts
    const current = () => !closed && !controller.signal.aborted && studioActive && studioStarts === run && studioStep?.id === step.id
    noteStudioFirstStep(renderStudioText(PORTRAIT_STUDIO.journey.context, { phase: step.phase, guidance: step.guidance }))
    studioFirstStepPending = false
    const say = (text: string, stage: string) => new Promise<boolean>(resolve => {
      if (!current()) { resolve(false); return }
      speakVerbatim(text, controller.signal, resolve, { mirror_studio: stage, mirror_studio_step: step.id })
    })
    // One retry, then continue without the line: a rejected cue must never strand
    // a step without its listening deadline, painting, reveal or transfer.
    const line = async (text: string, stage: string): Promise<boolean> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (await say(text, stage).catch(() => false)) return true
        if (!current()) return false
        emitMetadata(input, 'realtime_observer_event', 'degraded', attempt ? 'studio_speech_skipped' : 'studio_speech_failed', sessionGeneration, createdAt)
        if (!attempt) { await input.waitForOutputTail?.(); await new Promise(resolve => setTimeout(resolve, 400)) }
      }
      return current()
    }
    const perform = async () => {
      try {
        if (!current()) return
        if (opening && !await line(opening, 'opening')) return
        if (step.silent && !await line(PORTRAIT_STUDIO.journey[step.language].silence, 'silence')) return
        if (step.comment) {
          const instructions = buildStudioCommentPrompt(promptAvatar, step.comment, step.language)
          const completed = await new Promise<boolean>(resolve => queueSpeechResponse({ conversation: 'none', tool_choice: 'none', input: [], instructions }, controller.signal, resolve, { mirror_studio: 'comment', mirror_studio_step: step.id }))
          if (!current()) return
          if (!completed) emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_speech_failed', sessionGeneration, createdAt)
        }
        studioStepBeforeQuestion = false
        if (!current()) return
        // The native revision preamble owns this announcement when present.
        // Wait for its processed playback before starting the image request.
        if (revisionAnnounced) await input.waitForOutputTail?.()
        else if (!await line(step.speech, step.phase === 'keepsake' ? 'transfer' : step.phase)) return
        if (!current()) return
        if (step.phase === 'painting' || step.phase === 'revising') {
          const result = await studioRequest({ action: 'paint', stepId: step.id })
          if (!current() || result?.status !== 'accepted') return
          if (step.phase === 'painting') await say(PORTRAIT_STUDIO.journey[step.language].waiting, 'waiting')
        } else if (step.phase === 'keepsake') await studioRequest({ action: 'deliver', stepId: step.id })
        else if (step.phase === 'reveal' && step.final) await studioRequest({ action: 'finish' })
        else {
          studioListeningStep = step.id
          studioStepInputs = visitorInputs
          if (step.phase === 'reveal') studioRevealInputs = visitorInputs
          await studioRequest({ action: 'step_ready', stepId: step.id })
        }
      } catch { if (current()) emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_speech_failed', sessionGeneration, createdAt) }
      finally { if (current()) { studioStepSpeaking = false; setStudioCapturePaused(false) } }
    }
    if (step.phase === 'reveal') studioRevealInputs = visitorInputs
    const schedule = () => whenIdle(() => { if (!current()) return false; void perform(); return true })
    if (preempt && !cancellingCue && (activeMemoryResponses.size > 0 || memoryAudioResponses.size > 0)) {
      notifyAudioActivity('interrupted')
      void Promise.resolve(session.interrupt()).then(schedule).catch(() => {
        emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_speech_failed', sessionGeneration, createdAt)
        schedule()
      })
    } else schedule()
  }
  /**
   * The first step's guidance joins the conversation as a system message, so any reply (also
   * one to a visitor who speaks first) knows the step; it leaves with the other studio items.
   */
  function noteStudioFirstStep(step: string): void {
    studioFirstStep = step
    studioFirstStepPending = !!step.trim()
    if (closed || !studioFirstStepPending) return
    const id = `studio_step_${sessionGeneration}_${++studioImageSequence}`.slice(0, 32)
    try {
      transport.sendEvent({ type: 'conversation.item.create', item: { id, type: 'message', role: 'system', content: [{ type: 'input_text', text: step }] } })
      rememberStudioItem(id)
    } catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_first_step_failed', sessionGeneration, createdAt) }
  }
  /** After the start script, the avatar asks the first step in character, unless the visitor already answered it. */
  function askStudioFirstStep(run: number): void {
    if (studioStep) { queueStudioStep(studioStep, studioFirstStep); return }
    whenIdle(() => sendStudioFirstStep(run, false))
  }
  function sendStudioFirstStep(run: number, retried: boolean): boolean {
    if (closed || !studioActive || !sameStudioRun(run) || !studioFirstStepPending) return false
    const eventId = `studio-${sessionGeneration}-${++studioSendSequence}`
    rememberStudioSend(eventId, () => {
      if (retried) emitMetadata(input, 'realtime_observer_event', 'failed', 'studio_first_step_failed', sessionGeneration, createdAt)
      else whenIdle(() => sendStudioFirstStep(run, true))
    })
    try {
      // Nobody has spoken yet, so the studio's own language decides, not the Persona default.
      transport.sendEvent({ type: 'response.create', event_id: eventId, response: { instructions: studioFirstStepInstructions(studioInstructions, studioFirstLanguage, studioFirstStep),
        metadata: { mirror_studio: 'first_step' } } })
      return true
    } catch {
      emitMetadata(input, 'realtime_observer_event', 'failed', 'studio_first_step_failed', sessionGeneration, createdAt)
      return false
    }
  }
  function requestStudioFarewell(run: number, retried = false): boolean {
    if (closed || !sameStudioRun(run, false) || returnToDormantPending || farewellRequested) return false
    sleepAudioSuppressed = true
    returnToDormantPending = true
    farewellCueId = `sleep-${sessionGeneration}-${++farewellSequence}`
    farewellResponseId = undefined
    farewellAudioStarted = false
    farewellRequested = true
    const eventId = `studio-${sessionGeneration}-${++studioSendSequence}`
    rememberStudioSend(eventId, () => {
      // Rejected before it started (another response was active): release and retry once.
      returnToDormantPending = false; farewellRequested = false; sleepAudioSuppressed = false
      if (retried) emitMetadata(input, 'realtime_observer_event', 'failed', 'sleep_request_failed', sessionGeneration, createdAt)
      else whenIdle(() => requestStudioFarewell(run, true))
    })
    try {
      // A studio-mode visit ends with the studio's own farewell, not the avatar's sleep farewell.
      if (studioFarewellSpeech(input.avatar?.experience?.studio).includes('[pause')) {
        speakVerbatim(studioFarewellSpeech(input.avatar?.experience?.studio), undefined, undefined, { mirror_sleep_cue: farewellCueId! })
        return true
      }
      transport.sendEvent({ type: 'response.create', event_id: eventId, response: { ...buildSpeechResponse(studioFarewellSpeech(input.avatar?.experience?.studio),
        input.avatar?.speakingStyle ?? ''), metadata: { mirror_sleep_cue: farewellCueId } } })
      return true
    } catch {
      studioSends.delete(eventId)
      returnToDormantPending = false; farewellRequested = false; sleepAudioSuppressed = false
      emitMetadata(input, 'realtime_observer_event', 'failed', 'sleep_request_failed', sessionGeneration, createdAt)
      return false
    }
  }
  /** A reveal belongs to its run and to Main's latest revision in that run. */
  function currentStudioReveal(event: Extract<StudioSessionEvent, { event: 'ready' }>, run: number): boolean {
    if (!sameStudioRun(run)) return false
    if (event.revision === studioRevision) return true
    emitMetadata(input, 'realtime_observer_event', 'info', 'studio_event_stale', sessionGeneration, createdAt)
    return false
  }
  async function revealStudioImage(event: Extract<StudioSessionEvent, { event: 'ready' }>, run: number): Promise<void> {
    let dataUrl: string | null = null
    try { dataUrl = await input.prepareStudioImage?.(event.imageUrl) ?? null } catch { dataUrl = null }
    if (closed || !currentStudioReveal(event, run)) return
    if (!dataUrl) emitMetadata(input, 'realtime_observer_event', 'degraded', 'studio_image_prepare_failed', sessionGeneration, createdAt)
    whenIdle(() => sendStudioReveal(event, dataUrl, false, run))
  }
  function sendStudioReveal(event: Extract<StudioSessionEvent, { event: 'ready' }>, dataUrl: string | null, retried: boolean, run: number): boolean {
    if (closed || !currentStudioReveal(event, run)) return false
    const studio = input.avatar?.experience?.studio
    const instructions = studioRevealInstructions(studioInstructions, studio, { seen: !!dataUrl, language: event.language, final: event.revisionsLeft <= 0 })
    try {
      if (dataUrl) {
        if (studioRevealImageItem) deleteConversationItem(studioRevealImageItem, 'image')
        studioRevealImageItem = `studio_img_${sessionGeneration}_${++studioImageSequence}`.slice(0, 32)
        transport.sendEvent({ type: 'conversation.item.create', item: { id: studioRevealImageItem, type: 'message', role: 'user',
          content: [{ type: 'input_image', image_url: dataUrl }] } })
      }
      const eventId = `studio-${sessionGeneration}-${++studioSendSequence}`
      rememberStudioSend(eventId, () => {
        if (retried) emitMetadata(input, 'realtime_observer_event', 'failed', 'studio_reveal_failed', sessionGeneration, createdAt)
        else whenIdle(() => sendStudioReveal(event, dataUrl, true, run))
      })
      const final = event.revisionsLeft <= 0
      if (final) studioFinalReveal = run
      studioRevealInputs = visitorInputs
      transport.sendEvent({ type: 'response.create', event_id: eventId, response: { instructions, ...(final ? { tool_choice: 'none' as const } : {}),
        metadata: { mirror_studio: 'reveal', ...(final ? { mirror_studio_final: 'true' } : {}) } } })
      return true
    } catch {
      emitMetadata(input, 'realtime_observer_event', 'failed', 'studio_reveal_failed', sessionGeneration, createdAt)
      return false
    }
  }
  function studioEvent(event: StudioSessionEvent, identity: StudioEventIdentity): void {
    if (closed || !studioAgent) return
    if (identity.realtimeSessionId !== input.sessionId || identity.sessionGeneration !== sessionGeneration) {
      emitMetadata(input, 'realtime_observer_event', 'info', 'studio_event_stale', sessionGeneration, createdAt)
      return
    }
    if (event.event === 'enter') {
      // A studio-default session speaks the start script as its wake greeting.
      const greets = studioDefaultSettle !== undefined
      void enterStudio().then(entered => {
        if (!entered) void studioRequest({ action: 'exit' })
        if (entered) { studioFirstLanguage = event.language; noteStudioFirstStep(event.firstStep); studioStep = event.step }
        if (greets) settleStudioDefault(entered)
        else if (entered && event.step) queueStudioStep(event.step, undefined, false, event.startScript)
        else if (entered) {
          const run = studioStarts
          whenIdle(() => sameStudioRun(run) && speakStudioLine(event.startScript, completed => { if (completed) askStudioFirstStep(run) }))
        }
      })
      return
    }
    if (event.event === 'step') { queueStudioStep(event.step); return }
    if (event.event === 'ready') {
      if (event.step) {
        studioRevision = event.revision
        queueStudioStep(event.step, undefined, true)
        return
      }
      if (studioActive) { studioRevision = event.revision; void revealStudioImage(event, studioStarts) }
      else emitMetadata(input, 'realtime_observer_event', 'info', 'studio_event_stale', sessionGeneration, createdAt)
      return
    }
    // A run's closing line and farewell still play after its own exit, never after a newer run starts.
    const run = studioStarts
    if (event.event === 'failed') {
      if (!event.keepPortrait) void exitStudio()
      whenIdle(() => sameStudioRun(run, false) && speakStudioLine(event.line))
      return
    }
    if (event.event === 'keepsake_done') {
      void exitStudio().then(() => { if (event.afterPortrait === 'farewell') whenIdle(() => requestStudioFarewell(run)) })
      return
    }
    settleStudioDefault(false)
    void exitStudio()
  }

  function imageEvent(event: ImageSkillEvent, identity: StudioEventIdentity): void {
    if (closed || identity.realtimeSessionId !== input.sessionId || identity.sessionGeneration !== sessionGeneration) {
      emitMetadata(input, 'realtime_observer_event', 'info', 'image_event_stale', sessionGeneration, createdAt); return
    }
    if (event.event === 'camera_approved') {
      if (imageRun !== event.id || closed || mediaPlaybackActive || returnToDormantPending || !input.onCameraCapture) return
      imageRun = ''
      const generation = memoryTurnGeneration, ownedAtCapture = commandTurnOwned
      const stale = () => closed || commandTurnOwned && !ownedAtCapture || mediaPlaybackActive || returnToDormantPending || generation !== memoryTurnGeneration
      void withWorking(() => input.onCameraCapture!({ realtimeSessionId: input.sessionId, sessionGeneration })).then(frame => {
        if (stale()) {
          emitMetadata(input, 'realtime_observer_event', 'info', 'camera_result_stale', sessionGeneration, createdAt); return
        }
        if (frame) whenImageIdle(() => {
          if (stale()) { emitMetadata(input, 'realtime_observer_event', 'info', 'camera_result_stale', sessionGeneration, createdAt); return false }
          session.addImage(frame.dataUrl, { triggerResponse: false })
          transport.sendEvent({ type: 'response.create', response: { instructions: `${baseInstructions}\n\n${IMAGE_SKILL.cameraAnswer}\n\n${IMAGE_SKILL.language[replyLanguage === 'english' ? 'en' : 'zh']}`,
            tool_choice: 'none', metadata: { mirror_image: 'camera' } } })
          return true
        })
        else speakVerbatim(IMAGE_SKILL.cameraUnavailable[replyLanguage === 'english' ? 'en' : 'zh'], imageCues.signal)
      }).catch(() => emitMetadata(input, 'realtime_observer_event', 'degraded', 'camera_result_stale', sessionGeneration, createdAt))
      return
    }
    if (event.event !== 'line' && imageStateItem) { deleteConversationItem(imageStateItem, 'turn'); imageStateItem = undefined }
    if (event.event === 'closed') {
      const consent = imageConsent
      imageRun = event.id; imageClosed = true; imageConsent = undefined; imagePhotoPending = false; cameraViewingPending = false; imageUrl = ''
      consent?.abort.abort()
      if (imageRevealItem) { deleteConversationItem(imageRevealItem, 'image'); imageRevealItem = undefined }
      // Application speech is out-of-band. Replace the model's stale pending
      // state explicitly, without inventing a visitor turn or authorizing work.
      imageStateItem = `imgstate_${sessionGeneration}_${++studioImageSequence}`.slice(0, 32)
      try { transport.sendEvent({ type: 'conversation.item.create', item: { id: imageStateItem, type: 'message', role: 'system', content: [{ type: 'input_text', text: event.outcome === 'photo_attached' ? IMAGE_SKILL.studioPhotoAttached : IMAGE_SKILL.requestClosed }] } }) }
      catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'image_state_update_failed', sessionGeneration, createdAt) }
      return
    }
    imageRun = event.id
    if (event.event === 'consent') {
      imageClosed = false; imagePhotoPending = true
      const previous = imageConsent
      imageConsent = undefined; previous?.abort.abort()
      const consent = { id: event.id, ticket: event.ticket, armed: false, startedInputs: visitorInputs, abort: new AbortController() }
      imageConsent = consent
      whenImageIdle(() => {
        if (closed || imageConsent !== consent) return false
        speakVerbatim(event.line, consent.abort.signal, completed => {
          if (closed || imageConsent !== consent) return
          if (!completed) { void imageRequest({ action: 'dismiss' }); return }
          void imageRequest({ action: 'consent_ready', ticket: consent.ticket }).then(result => {
            if (imageConsent === consent && result.status === 'accepted') { consent.armed = true; consent.startedInputs = visitorInputs }
          })
        })
        return true
      })
      return
    }
    if (event.event === 'line') {
      imageConsent = undefined; imagePhotoPending = false
      whenImageIdle(() => {
        if (closed || imageRun !== event.id) return false
        speakVerbatim(event.line, imageCues.signal)
        return true
      })
      return
    }
    imageClosed = false; imageConsent = undefined; imagePhotoPending = false; imageUrl = event.imageUrl; imageRevealInputs = visitorInputs
    const current = () => !closed && !imageClosed && imageRun === event.id && imageUrl === event.imageUrl
    void (async () => {
      let dataUrl: string | null = null
      try { dataUrl = await input.prepareStudioImage?.(event.imageUrl) ?? null } catch { /* spoken fallback below */ }
      if (!current()) return
      whenImageIdle(() => {
        if (!current()) return false
        try {
          if (dataUrl) {
            if (imageRevealItem) deleteConversationItem(imageRevealItem, 'image')
            imageRevealItem = `image_${sessionGeneration}_${++studioImageSequence}`.slice(0, 32)
            transport.sendEvent({ type: 'conversation.item.create', item: { id: imageRevealItem, type: 'message', role: 'user', content: [{ type: 'input_image', image_url: dataUrl }] } })
          }
          transport.sendEvent({ type: 'response.create', response: { instructions: `${baseInstructions}\n\n${dataUrl ? IMAGE_SKILL.reveal : IMAGE_SKILL.revealBlind}\n\n${IMAGE_SKILL.language[replyLanguage === 'english' ? 'en' : 'zh']}`,
            tool_choice: 'none', metadata: { mirror_image: 'reveal' } } })
          imageRevealInputs = visitorInputs
          return true
        } catch { emitMetadata(input, 'realtime_observer_event', 'degraded', 'image_reveal_failed', sessionGeneration, createdAt); return false }
      })
    })()
  }

  // Pictures may wait for conversation. Never force a reveal or permission
  // question over an ongoing visitor turn or actual avatar playback.
  function whenImageIdle(run: () => boolean | void): void {
    whenIdle(() => {
      if (visitorSpeaking || activeMemoryResponses.size || memoryAudioResponses.size || cues.size) { whenImageIdle(run); return false }
      return run()
    }, 30000)
  }

  return Object.freeze({
    realtimeSessionId: input.sessionId,
    sessionGeneration,
    connect,
    getLastConnectFailureToken: () => latestConnectFailureToken,
    interrupt,
    setMediaPlayback,
    studioEvent,
    imageEvent,
    close,
    speakVerbatim,
    danceWelcome: (language: 'zh-TW' | 'en', signal: AbortSignal, onFinished: (completed: boolean) => void) => {
      if (!input.preview || !input.avatar) { onFinished(false); return }
      queueSpeechResponse(buildSpeechResponse(danceWelcomeLine(language), input.avatar.speakingStyle), signal, onFinished)
    },
    claimControlTurn: (itemId: string) => { if (!memoryLatestItem || memoryLatestItem === itemId) commandTurnOwned = true },
    onOutputAudioBufferStopped,
    onInputItemCreated,
    onInputTranscriptCompleted,
  })
}
