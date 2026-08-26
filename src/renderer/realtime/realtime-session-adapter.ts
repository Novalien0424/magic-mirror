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

type PublicRealtimeModelId =
  | 'gpt-realtime-2'
  | 'gpt-realtime-1.5'
  | 'gpt-realtime'
  | 'gpt-realtime-2.1'
  | 'gpt-realtime-2.1-mini'
  | 'gpt-realtime-mini'
  | 'gpt-4o-realtime-preview'
  | 'gpt-4o-mini-realtime-preview'

type SupportedRealtimeModelToken =
  `start_connect_realtime_model_unsupported_supported_${PublicRealtimeModelId}`

type PublicRealtimeModelMentionId =
  | 'gpt-realtime-2.1'
  | 'gpt-realtime-2.1-mini'
  | 'gpt-realtime-2'
  | 'gpt-realtime-1.5'
  | 'gpt-realtime'
  | 'gpt-realtime-mini'
  | 'gpt-realtime-2025-08-28'
  | 'gpt-4o-realtime-preview'
  | 'gpt-4o-realtime-preview-2024-10-01'
  | 'gpt-4o-realtime-preview-2024-12-17'
  | 'gpt-4o-realtime-preview-2025-06-03'
  | 'gpt-4o-mini-realtime-preview'
  | 'gpt-4o-mini-realtime-preview-2024-12-17'

type RealtimeConnectFailureModelMentionToken =
  `start_connect_model_unsupported_mentions_${PublicRealtimeModelMentionId}`

type RealtimeConnectFailureModelUnsupportedCategoryToken =
  | 'start_connect_reasoning_unsupported'
  | 'start_connect_input_transcription_unsupported'
  | 'start_connect_voice_unsupported'
  | 'start_connect_turn_detection_unsupported'
  | 'start_connect_audio_output_unsupported'

type RealtimeConnectFailureBadRequestParamField =
  | 'model'
  | 'session.model'
  | 'type'
  | 'session.type'
  | 'voice'
  | 'session.voice'
  | 'input_audio_transcription.model'
  | 'session.input_audio_transcription.model'
  | 'audio.input.transcription.model'
  | 'session.audio.input.transcription.model'

type RealtimeConnectFailureBadRequestParamToken =
  | 'start_connect_bad_request_param_model'
  | 'start_connect_bad_request_param_session_model'
  | 'start_connect_bad_request_param_type'
  | 'start_connect_bad_request_param_session_type'
  | 'start_connect_bad_request_param_voice'
  | 'start_connect_bad_request_param_session_voice'
  | 'start_connect_bad_request_param_input_audio_transcription_model'
  | 'start_connect_bad_request_param_session_input_audio_transcription_model'
  | 'start_connect_bad_request_param_audio_input_transcription_model'
  | 'start_connect_bad_request_param_session_audio_input_transcription_model'

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
  | 'start_connect_sdp_offer_missing'
  | 'start_connect_sdp_answer_failed'
  | 'start_connect_model_mismatch'
  | 'start_connect_model_access_denied'
  | 'start_connect_model_missing'
  | 'start_connect_model_unsupported'
  | RealtimeConnectFailureModelUnsupportedCategoryToken
  | 'start_connect_realtime_model_unsupported'
  | 'start_connect_input_transcription_model_unsupported'
  | 'start_connect_model_rejected'
  | SupportedRealtimeModelToken
  | RealtimeConnectFailureModelMentionToken
  | RealtimeConnectFailureBadRequestParamToken
  | 'start_connect_sdp_rejected'
  | 'start_connect_bad_request'
  | 'start_connect_http_other'
  | 'start_connect_auth_failed'
  | 'start_connect_permission_failed'
  | 'start_connect_rate_limited'
  | 'start_connect_model_unavailable'
  | 'start_connect_service_unavailable'
  | 'start_connect_network_failed'
  | 'start_connect_transport_failed'

const CONNECT_FAILURE_STATUS_CLASSIFICATIONS = Object.freeze([
  { status: 0, token: 'start_connect_network_failed' },
  { status: 400, token: 'start_connect_bad_request' },
  { status: 401, token: 'start_connect_auth_failed' },
  { status: 403, token: 'start_connect_permission_failed' },
  { status: 404, token: 'start_connect_model_unavailable' },
  { status: 408, token: 'start_connect_network_failed' },
  { status: 429, token: 'start_connect_rate_limited' },
  { status: 500, token: 'start_connect_service_unavailable' },
  { status: 502, token: 'start_connect_service_unavailable' },
  { status: 503, token: 'start_connect_service_unavailable' },
  { status: 504, token: 'start_connect_service_unavailable' },
] as const)

const CONNECT_FAILURE_NETWORK_CODES = Object.freeze([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_RESET',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
] as const)

const CONNECT_FAILURE_AUTH_VALUES = Object.freeze([
  'authentication_error',
  'invalid_api_key',
  'invalid_credentials',
  'unauthorized',
] as const)

const CONNECT_FAILURE_PERMISSION_VALUES = Object.freeze([
  'forbidden',
  'insufficient_permissions',
  'permission_denied',
  'permission_error',
] as const)

const CONNECT_FAILURE_RATE_VALUES = Object.freeze([
  'rate_limit_error',
  'rate_limit_exceeded',
  'rate_limited',
  'too_many_requests',
] as const)

const CONNECT_FAILURE_MODEL_VALUES = Object.freeze([
  'invalid_model',
  'model_not_available',
  'model_not_found',
  'model_not_supported',
  'model_unavailable',
] as const)

const CONNECT_FAILURE_SERVICE_VALUES = Object.freeze([
  'bad_gateway',
  'gateway_timeout',
  'internal_server_error',
  'server_error',
  'service_unavailable',
] as const)

const CONNECT_FAILURE_NETWORK_NAMES = Object.freeze([
  'NetworkError',
  'TypeError',
] as const)

const CONNECT_FAILURE_NETWORK_TYPES = Object.freeze([
  'network',
  'network_error',
] as const)

const CONNECT_FAILURE_NESTED_KEYS = Object.freeze([
  'cause',
  'error',
  'response',
] as const)

const CONNECT_FAILURE_STRUCTURAL_KEYS = Object.freeze([
  'code',
  'name',
  'type',
] as const)

const CONNECT_FAILURE_STATUS_KEYS = Object.freeze([
  'status',
  'statusCode',
] as const)

const CONNECT_FAILURE_MESSAGE_PREFIXES = Object.freeze({
  ephemeralKeyRequired:
    'Using the WebRTC connection in a browser environment requires an ephemeral client key.',
  setupClosed: 'Connection closed before setup completed',
  sessionConfigClosed: 'Connection closed before session config was acknowledged',
  sdpOfferMissing: 'Failed to create offer',
  signalingHttp: 'Realtime call request failed with status ',
  sdpAnswerFailed: 'Failed to parse SessionDescription',
} as const)

const CONNECT_FAILURE_400_MODEL_DETAIL_MARKERS = Object.freeze([
  'model',
] as const)

const CONNECT_FAILURE_400_MODEL_SUBREASONS = Object.freeze([
  {
    token: 'start_connect_model_mismatch',
    sequences: [
      ['mismatch'],
      ['mismatched'],
      ['mismatches'],
      ['match'],
      ['matched'],
      ['matches'],
      ['matching'],
      ['unmatched'],
    ],
  },
  {
    token: 'start_connect_model_access_denied',
    sequences: [
      ['access'],
      ['denied'],
      ['permission'],
      ['forbidden'],
      ['verification'],
      ['verify'],
      ['verified'],
      ['unauthorized'],
      ['not', 'enabled'],
    ],
  },
  {
    token: 'start_connect_model_missing',
    sequences: [
      ['missing'],
      ['required'],
      ['no', 'such'],
      ['not', 'found'],
      ['not', 'available'],
      ['unavailable'],
    ],
  },
  {
    token: 'start_connect_model_unsupported',
    sequences: [['unsupported'], ['not', 'supported'], ['invalid']],
  },
] as const)

const CONNECT_FAILURE_400_MODEL_UNSUPPORTED_CATEGORY_MATCHERS = Object.freeze([
  {
    token: 'start_connect_reasoning_unsupported',
    sequences: [['reasoning'], ['effort']],
  },
  {
    token: 'start_connect_input_transcription_unsupported',
    sequences: [['input'], ['transcription'], ['transcribe']],
  },
  {
    token: 'start_connect_voice_unsupported',
    sequences: [['voice']],
  },
  {
    token: 'start_connect_turn_detection_unsupported',
    sequences: [['turn'], ['detection'], ['vad']],
  },
  {
    token: 'start_connect_audio_output_unsupported',
    sequences: [['audio', 'output'], ['output'], ['modalities']],
  },
] as const)

const CONNECT_FAILURE_400_SDP_DETAIL_MARKERS = Object.freeze([
  'sdp',
  'session description',
  'sessiondescription',
  'offer',
] as const)

const CONNECT_FAILURE_400_PUBLIC_REALTIME_MODEL_IDS = Object.freeze([
  'gpt-realtime-2',
  'gpt-realtime-1.5',
  'gpt-realtime',
  'gpt-realtime-2.1',
  'gpt-realtime-2.1-mini',
  'gpt-realtime-mini',
  'gpt-4o-realtime-preview',
  'gpt-4o-mini-realtime-preview',
] as const)

const CONNECT_FAILURE_400_PUBLIC_REALTIME_MODEL_MENTION_IDS = Object.freeze([
  'gpt-4o-realtime-preview-2025-06-03',
  'gpt-4o-realtime-preview-2024-12-17',
  'gpt-4o-realtime-preview-2024-10-01',
  'gpt-4o-mini-realtime-preview-2024-12-17',
  'gpt-realtime-2025-08-28',
  'gpt-realtime-2.1-mini',
  'gpt-4o-realtime-preview',
  'gpt-4o-mini-realtime-preview',
  'gpt-realtime-2.1',
  'gpt-realtime-1.5',
  'gpt-realtime-mini',
  'gpt-realtime-2',
  'gpt-realtime',
] as const)

const CONNECT_FAILURE_400_MODEL_FIELD_NAMES = Object.freeze([
  'model',
  'session.model',
  'session.audio.input.transcription.model',
] as const)

const CONNECT_FAILURE_400_MODEL_DETAIL_MAX_LENGTH = 1024
const CONNECT_FAILURE_400_MODEL_VALUE_MAX_LENGTH = 128
const CONNECT_FAILURE_400_SUPPORTED_VALUES_MAX_LENGTH = 512
const CONNECT_FAILURE_400_SUPPORTED_VALUES_MARKERS = Object.freeze([
  'expected one of:',
  'supported values are:',
] as const)
const CONNECT_FAILURE_400_MODEL_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const CONNECT_FAILURE_400_PARAM_JSON_MAX_LENGTH = 2048

const CONNECT_FAILURE_400_PARAM_TOKENS: Readonly<
  Record<
    RealtimeConnectFailureBadRequestParamField,
    RealtimeConnectFailureBadRequestParamToken
  >
> = Object.freeze({
  model: 'start_connect_bad_request_param_model',
  'session.model': 'start_connect_bad_request_param_session_model',
  type: 'start_connect_bad_request_param_type',
  'session.type': 'start_connect_bad_request_param_session_type',
  voice: 'start_connect_bad_request_param_voice',
  'session.voice': 'start_connect_bad_request_param_session_voice',
  'input_audio_transcription.model':
    'start_connect_bad_request_param_input_audio_transcription_model',
  'session.input_audio_transcription.model':
    'start_connect_bad_request_param_session_input_audio_transcription_model',
  'audio.input.transcription.model':
    'start_connect_bad_request_param_audio_input_transcription_model',
  'session.audio.input.transcription.model':
    'start_connect_bad_request_param_session_audio_input_transcription_model',
})

interface StrictConnectFailure400ModelDetail {
  readonly rejectedValue: string
  readonly supportedValues?: readonly PublicRealtimeModelId[]
}

interface ConnectFailureStructuralNode {
  readonly value: unknown
  readonly depth: number
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

function readConnectFailureStructuralNodes(value: unknown): ConnectFailureStructuralNode[] {
  const nodes: ConnectFailureStructuralNode[] = []
  const pending: ConnectFailureStructuralNode[] = [{ value, depth: 0 }]
  const visited = new Set<object>()

  while (pending.length > 0) {
    const node = pending.shift()
    if (node === undefined || !isRecord(node.value)) continue
    if (visited.has(node.value)) continue
    visited.add(node.value)
    nodes.push(node)

    if (node.depth >= 3) continue
    for (const key of CONNECT_FAILURE_NESTED_KEYS) {
      const nested = readProperty(node.value, key)
      if (isRecord(nested)) {
        pending.push({ value: nested, depth: node.depth + 1 })
      }
    }
  }

  return nodes
}

function readConnectFailureStatus(value: unknown): number | undefined {
  for (const key of CONNECT_FAILURE_STATUS_KEYS) {
    const status = readProperty(value, key)
    if (typeof status !== 'number' || !Number.isSafeInteger(status)) continue
    for (const classification of CONNECT_FAILURE_STATUS_CLASSIFICATIONS) {
      if (classification.status === status) return classification.status
    }
  }
  return undefined
}

function tokenForConnectFailureStatus(
  status: number,
): RealtimeConnectFailureToken | undefined {
  for (const classification of CONNECT_FAILURE_STATUS_CLASSIFICATIONS) {
    if (classification.status === status) {
      return classification.token
    }
  }
  return undefined
}

function includesStructuralValue(
  values: readonly string[],
  value: unknown,
): value is string {
  return typeof value === 'string' && values.includes(value)
}

function readConnectFailureMessage(value: unknown): string | undefined {
  if (!(value instanceof Error)) return undefined
  try {
    return typeof value.message === 'string' ? value.message : undefined
  } catch {
    return undefined
  }
}

function parseStrictConnectFailure400SupportedValues(
  segment: string,
): readonly PublicRealtimeModelId[] | undefined {
  if (
    segment.length === 0 ||
    segment.length > CONNECT_FAILURE_400_SUPPORTED_VALUES_MAX_LENGTH
  ) {
    return undefined
  }

  const entries = segment.split(', ')
  if (
    entries.length === 0 ||
    entries.length > CONNECT_FAILURE_400_PUBLIC_REALTIME_MODEL_IDS.length
  ) {
    return undefined
  }

  const values: PublicRealtimeModelId[] = []
  const seen = new Set<PublicRealtimeModelId>()
  for (const entry of entries) {
    if (entry.length < 3 || entry[0] !== "'" || entry.at(-1) !== "'") {
      return undefined
    }
    const value = entry.slice(1, -1)
    if (
      value.length > CONNECT_FAILURE_400_MODEL_VALUE_MAX_LENGTH ||
      !CONNECT_FAILURE_400_MODEL_VALUE_PATTERN.test(value)
    ) {
      return undefined
    }
    const publicModelId = CONNECT_FAILURE_400_PUBLIC_REALTIME_MODEL_IDS.find(
      (candidate) => candidate === value,
    )
    if (publicModelId === undefined || seen.has(publicModelId)) return undefined
    seen.add(publicModelId)
    values.push(publicModelId)
  }

  return Object.freeze(values)
}

function parseStrictConnectFailure400ModelDetail(
  detail: string,
): StrictConnectFailure400ModelDetail | undefined {
  if (
    detail.length === 0 ||
    detail.length > CONNECT_FAILURE_400_MODEL_DETAIL_MAX_LENGTH
  ) {
    return undefined
  }

  let providerDetail = detail
  if (providerDetail.startsWith(' :: ')) {
    providerDetail = providerDetail.slice(4)
  } else if (providerDetail.startsWith(': ')) {
    providerDetail = providerDetail.slice(2)
  }

  const match = /^Invalid (?:(?:'([^']+)')|value): '([^']+)'(?:\. (?:Expected one of|Supported values are): (.*))?$/.exec(
    providerDetail,
  )
  if (match === null) return undefined

  const fieldName = match[1]
  if (
    fieldName !== undefined &&
    !(CONNECT_FAILURE_400_MODEL_FIELD_NAMES as readonly string[]).includes(fieldName)
  ) {
    return undefined
  }

  const rejectedValue = match[2]
  if (
    rejectedValue.length === 0 ||
    rejectedValue.length > CONNECT_FAILURE_400_MODEL_VALUE_MAX_LENGTH ||
    !CONNECT_FAILURE_400_MODEL_VALUE_PATTERN.test(rejectedValue)
  ) {
    return undefined
  }

  const supportedSegment = match[3]
  if (supportedSegment === undefined) {
    return { rejectedValue }
  }

  return {
    rejectedValue,
    supportedValues: parseStrictConnectFailure400SupportedValues(supportedSegment),
  }
}

function tokenForConnectFailure400ModelMention(
  detail: string,
  realtimeDialogueModel: string,
  inputTranscriptionModel: string,
): RealtimeConnectFailureModelMentionToken | undefined {
  const cappedDetail = detail.slice(0, CONNECT_FAILURE_400_MODEL_DETAIL_MAX_LENGTH)
  const normalizedDetail = cappedDetail.toLowerCase()
  const configuredModelIds = new Set(
    [realtimeDialogueModel, inputTranscriptionModel]
      .filter((model) => model.length > 0)
      .map((model) => model.toLowerCase()),
  )
  let firstMention:
    | { readonly modelId: PublicRealtimeModelMentionId; readonly occurrence: number }
    | undefined

  for (const modelId of CONNECT_FAILURE_400_PUBLIC_REALTIME_MODEL_MENTION_IDS) {
    if (configuredModelIds.has(modelId)) continue

    let searchFrom = 0
    while (searchFrom < normalizedDetail.length) {
      const occurrence = normalizedDetail.indexOf(modelId, searchFrom)
      if (occurrence < 0) break
      const precedingCharacter = normalizedDetail[occurrence - 1]
      const followingCharacter = normalizedDetail[occurrence + modelId.length]
      const hasExactBoundaries =
        (precedingCharacter === undefined || !/[A-Za-z0-9._-]/.test(precedingCharacter)) &&
        (followingCharacter === undefined || !/[A-Za-z0-9._-]/.test(followingCharacter))
      if (hasExactBoundaries) {
        if (firstMention === undefined || occurrence < firstMention.occurrence) {
          firstMention = { modelId, occurrence }
        }
        break
      }
      searchFrom = occurrence + 1
    }
  }

  return firstMention === undefined
    ? undefined
    : `start_connect_model_unsupported_mentions_${firstMention.modelId}`
}

function hasConnectFailure400SupportedValuesMarker(detail: string): boolean {
  const normalizedDetail = detail
    .slice(0, CONNECT_FAILURE_400_MODEL_DETAIL_MAX_LENGTH)
    .toLowerCase()
  return CONNECT_FAILURE_400_SUPPORTED_VALUES_MARKERS.some((marker) =>
    normalizedDetail.includes(marker),
  )
}

function tokenForConnectFailure400ExactConfiguredModel(
  detail: string,
  realtimeDialogueModel: string,
  inputTranscriptionModel: string,
): RealtimeConnectFailureToken | undefined {
  const normalizedDetail = detail
    .slice(0, CONNECT_FAILURE_400_MODEL_DETAIL_MAX_LENGTH)
    .toLowerCase()
  const configuredModels = [
    {
      model: realtimeDialogueModel,
      token: 'start_connect_realtime_model_unsupported',
    },
    {
      model: inputTranscriptionModel,
      token: 'start_connect_input_transcription_model_unsupported',
    },
  ] as const
  const matchingTokens: RealtimeConnectFailureToken[] = []

  for (const configured of configuredModels) {
    const normalizedModel = configured.model.toLowerCase()
    if (normalizedModel.length === 0) continue

    let searchFrom = 0
    while (searchFrom < normalizedDetail.length) {
      const occurrence = normalizedDetail.indexOf(normalizedModel, searchFrom)
      if (occurrence < 0) break
      const precedingCharacter = normalizedDetail[occurrence - 1]
      const followingCharacter = normalizedDetail[
        occurrence + normalizedModel.length
      ]
      const hasExactBoundaries =
        (precedingCharacter === undefined ||
          !/[A-Za-z0-9._-]/.test(precedingCharacter)) &&
        (followingCharacter === undefined ||
          !/[A-Za-z0-9._-]/.test(followingCharacter))
      if (hasExactBoundaries) {
        matchingTokens.push(configured.token)
        break
      }
      searchFrom = occurrence + 1
    }
  }

  return matchingTokens.length === 1 ? matchingTokens[0] : undefined
}

function tokenForConnectFailure400ParamDetail(
  detail: string,
): RealtimeConnectFailureBadRequestParamToken | undefined {
  if (
    detail.length === 0 ||
    detail.length > CONNECT_FAILURE_400_PARAM_JSON_MAX_LENGTH
  ) {
    return undefined
  }

  let jsonText: string
  if (detail.startsWith(' :: ')) {
    jsonText = detail.slice(4)
  } else if (detail.startsWith(': ')) {
    jsonText = detail.slice(2)
  } else {
    return undefined
  }
  if (
    jsonText.length === 0 ||
    jsonText.length > CONNECT_FAILURE_400_PARAM_JSON_MAX_LENGTH
  ) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined

  const rootKeys = Object.keys(parsed)
  if (rootKeys.length !== 1 || rootKeys[0] !== 'error') return undefined

  const error = readProperty(parsed, 'error')
  if (!isRecord(error)) return undefined
  const param = readProperty(error, 'param')
  if (typeof param !== 'string') return undefined

  if (!Object.prototype.hasOwnProperty.call(CONNECT_FAILURE_400_PARAM_TOKENS, param)) {
    return undefined
  }
  return CONNECT_FAILURE_400_PARAM_TOKENS[
    param as RealtimeConnectFailureBadRequestParamField
  ]
}

function tokenForStrictConnectFailure400ModelDetail(
  detail: StrictConnectFailure400ModelDetail,
  realtimeDialogueModel: string,
  inputTranscriptionModel: string,
): RealtimeConnectFailureToken {
  const matchedRealtimeModel =
    realtimeDialogueModel.length > 0 && detail.rejectedValue === realtimeDialogueModel
  const matchedInputTranscriptionModel =
    inputTranscriptionModel.length > 0 && detail.rejectedValue === inputTranscriptionModel

  if (matchedRealtimeModel === matchedInputTranscriptionModel) {
    return 'start_connect_model_unsupported'
  }
  if (matchedInputTranscriptionModel) {
    return 'start_connect_input_transcription_model_unsupported'
  }

  const supportedModelId = detail.supportedValues?.[0]
  if (supportedModelId !== undefined) {
    return `start_connect_realtime_model_unsupported_supported_${supportedModelId}`
  }
  return 'start_connect_realtime_model_unsupported'
}

function tokenForConnectFailure400ModelDetail(
  detail: string,
  realtimeDialogueModel: string,
  inputTranscriptionModel: string,
): RealtimeConnectFailureToken | undefined {
  const strictDetail = parseStrictConnectFailure400ModelDetail(detail)
  const words = new Set(detail.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const categoryWords = categoryWordsForConnectFailure400ModelDetail(
    detail,
    realtimeDialogueModel,
    inputTranscriptionModel,
  )
  const hasSupportedValuesMarker = hasConnectFailure400SupportedValuesMarker(detail)
  const hasModelMarker = CONNECT_FAILURE_400_MODEL_DETAIL_MARKERS.some((marker) =>
    words.has(marker),
  )

  if (strictDetail !== undefined && (hasModelMarker || strictDetail.supportedValues !== undefined)) {
    return tokenForStrictConnectFailure400ModelDetail(
      strictDetail,
      realtimeDialogueModel,
      inputTranscriptionModel,
    )
  }
  if (!hasModelMarker) return undefined
  const modelMentionToken = tokenForConnectFailure400ModelMention(
    detail,
    realtimeDialogueModel,
    inputTranscriptionModel,
  )

  for (const subreason of CONNECT_FAILURE_400_MODEL_SUBREASONS) {
    if (
      subreason.sequences.some((sequence) =>
        sequence.every((word) => words.has(word)),
      )
    ) {
      if (subreason.token === 'start_connect_model_unsupported') {
        return (
          tokenForConnectFailure400ModelUnsupportedCategory(categoryWords) ??
          (hasSupportedValuesMarker
            ? undefined
            : tokenForConnectFailure400ExactConfiguredModel(
                detail,
                realtimeDialogueModel,
                inputTranscriptionModel,
              )) ??
          modelMentionToken ??
          subreason.token
        )
      }
      return subreason.token
    }
  }

  return modelMentionToken ?? 'start_connect_model_rejected'
}

function tokenForConnectFailure400ModelUnsupportedCategory(
  words: ReadonlySet<string>,
): RealtimeConnectFailureModelUnsupportedCategoryToken | undefined {
  let matchingToken: RealtimeConnectFailureModelUnsupportedCategoryToken | undefined
  let matchCount = 0

  for (const category of CONNECT_FAILURE_400_MODEL_UNSUPPORTED_CATEGORY_MATCHERS) {
    if (!category.sequences.some((sequence) => sequence.every((word) => words.has(word)))) {
      continue
    }
    matchingToken = category.token
    matchCount += 1
  }

  return matchCount === 1 ? matchingToken : undefined
}

function categoryWordsForConnectFailure400ModelDetail(
  detail: string,
  realtimeDialogueModel: string,
  inputTranscriptionModel: string,
): ReadonlySet<string> {
  let categorySource = detail
  let jsonText: string | undefined
  if (detail.startsWith(' :: ')) {
    jsonText = detail.slice(4)
  } else if (detail.startsWith(': ')) {
    jsonText = detail.slice(2)
  }

  if (jsonText !== undefined) {
    try {
      const parsed: unknown = JSON.parse(jsonText)
      const error = isRecord(parsed) ? readProperty(parsed, 'error') : undefined
      const providerMessage = isRecord(error) ? readProperty(error, 'message') : undefined
      categorySource = typeof providerMessage === 'string' ? providerMessage : ''
    } catch {
      // Keep non-JSON SDK detail available to the bounded word classifier.
    }
  }

  for (const configuredModel of [realtimeDialogueModel, inputTranscriptionModel]) {
    if (configuredModel.length > 0) {
      categorySource = categorySource.split(configuredModel).join(' ')
    }
  }

  return new Set(categorySource.toLowerCase().match(/[a-z0-9]+/g) ?? [])
}

function classifyConnectFailureMessage(
  message: string,
  realtimeDialogueModel: string,
  inputTranscriptionModel: string,
): RealtimeConnectFailureToken | undefined {
  if (message.startsWith(CONNECT_FAILURE_MESSAGE_PREFIXES.ephemeralKeyRequired)) {
    return 'start_connect_ephemeral_key_required'
  }
  if (message.startsWith(CONNECT_FAILURE_MESSAGE_PREFIXES.setupClosed)) {
    return 'start_connect_setup_closed'
  }
  if (message.startsWith(CONNECT_FAILURE_MESSAGE_PREFIXES.sessionConfigClosed)) {
    return 'start_connect_setup_closed'
  }
  if (message.startsWith(CONNECT_FAILURE_MESSAGE_PREFIXES.sdpOfferMissing)) {
    return 'start_connect_sdp_offer_missing'
  }
  if (message.startsWith(CONNECT_FAILURE_MESSAGE_PREFIXES.signalingHttp)) {
    const statusText = message.slice(
      CONNECT_FAILURE_MESSAGE_PREFIXES.signalingHttp.length,
      CONNECT_FAILURE_MESSAGE_PREFIXES.signalingHttp.length + 3,
    )
    if (!/^\d{3}$/.test(statusText)) return undefined
    const status = Number(statusText)
if (status === 400) {
const detail = message
.slice(CONNECT_FAILURE_MESSAGE_PREFIXES.signalingHttp.length + statusText.length)
const paramToken = tokenForConnectFailure400ParamDetail(detail)
if (paramToken !== undefined) return paramToken
const detailLower = detail.toLowerCase()
const modelToken = tokenForConnectFailure400ModelDetail(
detail,
realtimeDialogueModel,
inputTranscriptionModel,
)
if (modelToken !== undefined) return modelToken
if (CONNECT_FAILURE_400_SDP_DETAIL_MARKERS.some((marker) => detailLower.includes(marker))) {
return 'start_connect_sdp_rejected'
}
      return 'start_connect_bad_request'
    }
    const token = tokenForConnectFailureStatus(status)
    return token ?? 'start_connect_http_other'
  }
  if (message.startsWith(CONNECT_FAILURE_MESSAGE_PREFIXES.sdpAnswerFailed)) {
    return 'start_connect_sdp_answer_failed'
  }
  return undefined
}

function classifyConnectFailure(
  value: unknown,
  realtimeDialogueModel: string,
  inputTranscriptionModel: string,
): RealtimeConnectFailureToken {
  const message = readConnectFailureMessage(value)
  if (message !== undefined) {
    const messageToken = classifyConnectFailureMessage(
      message,
      realtimeDialogueModel,
      inputTranscriptionModel,
    )
    if (messageToken !== undefined) return messageToken
  }

  const nodes = readConnectFailureStructuralNodes(value)

  for (const node of nodes) {
    const status = readConnectFailureStatus(node.value)
    if (status !== undefined) {
      const token = tokenForConnectFailureStatus(status)
      if (token !== undefined) return token
    }
  }

  for (const node of nodes) {
    for (const key of CONNECT_FAILURE_STRUCTURAL_KEYS) {
      const structuralValue = readProperty(node.value, key)
      if (includesStructuralValue(CONNECT_FAILURE_NETWORK_CODES, structuralValue)) {
        return 'start_connect_network_failed'
      }
      if (key === 'name' && includesStructuralValue(CONNECT_FAILURE_NETWORK_NAMES, structuralValue)) {
        return 'start_connect_network_failed'
      }
      if (key === 'type' && includesStructuralValue(CONNECT_FAILURE_NETWORK_TYPES, structuralValue)) {
        return 'start_connect_network_failed'
      }
      if (includesStructuralValue(CONNECT_FAILURE_AUTH_VALUES, structuralValue)) {
        return 'start_connect_auth_failed'
      }
      if (includesStructuralValue(CONNECT_FAILURE_PERMISSION_VALUES, structuralValue)) {
        return 'start_connect_permission_failed'
      }
      if (includesStructuralValue(CONNECT_FAILURE_RATE_VALUES, structuralValue)) {
        return 'start_connect_rate_limited'
      }
      if (includesStructuralValue(CONNECT_FAILURE_MODEL_VALUES, structuralValue)) {
        return 'start_connect_model_unavailable'
      }
      if (includesStructuralValue(CONNECT_FAILURE_SERVICE_VALUES, structuralValue)) {
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
  let latestConnectFailureToken: RealtimeConnectFailureToken | undefined
  let connectPromise: Promise<void> | null = null
  let transientClientSecret: string | null = input.clientSecret
  const outputAudioBufferStoppedSubscriptions = new Set<OutputAudioBufferStoppedSubscription>()

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
    if (type === 'output_audio_buffer.stopped') {
      notifyOutputAudioBufferStopped()
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
      latestConnectFailureToken = classifyConnectFailure(
        error,
        input.snapshot.realtimeDialogue,
        input.snapshot.inputTranscription,
      )
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

  return Object.freeze({
    realtimeSessionId: input.sessionId,
    sessionGeneration,
    connect,
    getLastConnectFailureToken: () => latestConnectFailureToken,
    interrupt,
    close,
    onOutputAudioBufferStopped,
  })
}
