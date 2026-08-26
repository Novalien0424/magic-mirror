import type { CredentialEventSink, CredentialStore } from '../credential-store'
import type { MirrorEvent } from '../../shared/types'

type MetadataEvent = Omit<MirrorEvent, 'time'>

export interface ClientSecretBrokerOptions {
  readonly credentialStore: Pick<CredentialStore, 'get'>
  readonly events: CredentialEventSink
}

export interface ClientSecretIssueRequest {
  readonly modelId: string
  readonly fetchImpl?: typeof fetch
}

export interface ClientSecretModelAvailabilityRequest {
  readonly modelId: string
  readonly fetchImpl?: typeof fetch
}

export interface ClientSecretIssueResult {
  readonly value: string
  readonly expiresAt?: number
}

export interface ClientSecretModelAvailabilityResult {
  readonly status: 'available' | 'unavailable'
}

export interface ClientSecretBroker {
  issue(request: ClientSecretIssueRequest): Promise<ClientSecretIssueResult>
  probeModelAvailability(
    request: ClientSecretModelAvailabilityRequest,
  ): Promise<ClientSecretModelAvailabilityResult>
}

export type ClientSecretBrokerErrorCode =
  | 'realtime_client_secret_model_invalid'
  | 'realtime_client_secret_credential_missing'
  | 'realtime_client_secret_credential_read_failed'
  | 'realtime_client_secret_fetch_failed'
  | 'realtime_client_secret_http_failed'
  | 'realtime_client_secret_response_malformed'
  | 'realtime_client_secret_invalid_prefix'

const MODEL_LIST_ENDPOINT = 'https://api.openai.com/v1/models'
const MAX_MODEL_LIST_ITEMS = 256
const MAX_MODEL_ID_LENGTH = 256
const MAX_MODEL_RESPONSE_BYTES = 256 * 1024

export class ClientSecretBrokerError extends Error {
  readonly code: ClientSecretBrokerErrorCode

  constructor(code: ClientSecretBrokerErrorCode) {
    super('Realtime client secret broker operation failed')
    this.name = 'ClientSecretBrokerError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableStatus(value: unknown): string {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 100
    && value <= 599
    ? String(value)
    : 'unknown'
}

function stableExpiry(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function responseContentLengthIsOversized(response: Response): boolean {
  const contentLength = response.headers?.get('content-length')
  if (contentLength === null || contentLength === undefined) return false
  const parsedLength = Number(contentLength)
  return Number.isSafeInteger(parsedLength)
    && parsedLength >= 0
    && parsedLength > MAX_MODEL_RESPONSE_BYTES
}

async function readBoundedModelResponse(response: Response): Promise<unknown> {
  if (typeof response.text === 'function') {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_MODEL_RESPONSE_BYTES) {
      throw new Error('oversized_model_response')
    }
    return JSON.parse(text) as unknown
  }
  return response.json()
}

function hasExactConfiguredModel(
  body: unknown,
  configuredModelId: string,
): boolean {
  if (!isRecord(body) || !Array.isArray(body.data) || body.data.length > MAX_MODEL_LIST_ITEMS) {
    throw new Error('malformed_model_list')
  }

  let available = false
  for (const item of body.data) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > MAX_MODEL_ID_LENGTH) {
      throw new Error('malformed_model_list')
    }
    if (item.id === configuredModelId) available = true
  }
  return available
}

function emitBrokerEvent(
  events: CredentialEventSink,
  event: 'realtime_client_secret_issued' | 'realtime_client_secret_failed',
  status: 'success' | 'failed',
  reason: string,
  errorCode?: ClientSecretBrokerErrorCode,
): void {
  const payload: MetadataEvent = {
    module: 'openai',
    event,
    status,
    source: 'runtime',
    reason,
  }
  if (errorCode !== undefined) payload.error_code = errorCode
  try {
    events.emit(payload)
  } catch {
    // A diagnostic sink failure cannot expose a credential or gate a request.
  }
}

function fail(
  events: CredentialEventSink,
  code: ClientSecretBrokerErrorCode,
  reason: string,
): never {
  emitBrokerEvent(events, 'realtime_client_secret_failed', 'failed', reason, code)
  throw new ClientSecretBrokerError(code)
}

export function createClientSecretBroker(
  options: ClientSecretBrokerOptions,
): ClientSecretBroker {
  return {
    async issue(request: ClientSecretIssueRequest): Promise<ClientSecretIssueResult> {
      if (typeof request.modelId !== 'string' || request.modelId.length === 0) {
        return fail(
          options.events,
          'realtime_client_secret_model_invalid',
          'cause=model_invalid',
        )
      }

      let credential: string | null = null
      try {
        credential = await options.credentialStore.get()
      } catch {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_credential_read_failed',
          'cause=credential_read_failed',
        )
      }

      if (typeof credential !== 'string' || credential.length === 0) {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_credential_missing',
          'cause=credential_missing',
        )
      }

      let response: Response
      try {
        const fetchImpl = request.fetchImpl ?? fetch
        response = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credential}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expires_after: {
              anchor: 'created_at',
              seconds: 600,
            },
            session: {
              type: 'realtime',
              model: request.modelId,
            },
          }),
        })
      } catch {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_fetch_failed',
          'cause=fetch_failed',
        )
      }

      if (!response.ok) {
        const status = stableStatus(response.status)
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_http_failed',
          `http_status=${status}`,
        )
      }

      let body: unknown
      try {
        body = await readBoundedModelResponse(response)
      } catch {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_response_malformed',
          'cause=response_malformed',
        )
      }
      credential = null

      if (!isRecord(body) || typeof body.value !== 'string' || body.value.length === 0) {
        return fail(
          options.events,
          'realtime_client_secret_response_malformed',
          'cause=response_malformed',
        )
      }
      if (!body.value.startsWith('ek_') || body.value.length <= 3) {
        return fail(
          options.events,
          'realtime_client_secret_invalid_prefix',
          'cause=invalid_secret_prefix',
        )
      }

      const expiresAt = body.expires_at
      if (expiresAt !== undefined && !stableExpiry(expiresAt)) {
        return fail(
          options.events,
          'realtime_client_secret_response_malformed',
          'cause=response_malformed',
        )
      }

      emitBrokerEvent(
        options.events,
        'realtime_client_secret_issued',
        'success',
        `expiry=${expiresAt === undefined ? 'absent' : 'present'}`,
      )
      return expiresAt === undefined
        ? { value: body.value }
        : { value: body.value, expiresAt }
    },
    async probeModelAvailability(
      request: ClientSecretModelAvailabilityRequest,
    ): Promise<ClientSecretModelAvailabilityResult> {
      if (typeof request.modelId !== 'string' || request.modelId.length === 0) {
        return fail(
          options.events,
          'realtime_client_secret_model_invalid',
          'cause=model_invalid',
        )
      }

      let credential: string | null = null
      try {
        credential = await options.credentialStore.get()
      } catch {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_credential_read_failed',
          'cause=credential_read_failed',
        )
      }

      if (typeof credential !== 'string' || credential.length === 0) {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_credential_missing',
          'cause=credential_missing',
        )
      }

      let response: Response
      try {
        const fetchImpl = request.fetchImpl ?? fetch
        response = await fetchImpl(MODEL_LIST_ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${credential}`,
          },
        })
      } catch {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_fetch_failed',
          'cause=fetch_failed',
        )
      }

      if (!response.ok) {
        const status = stableStatus(response.status)
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_http_failed',
          `http_status=${status}`,
        )
      }

      if (responseContentLengthIsOversized(response)) {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_response_malformed',
          'cause=response_malformed',
        )
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        credential = null
        return fail(
          options.events,
          'realtime_client_secret_response_malformed',
          'cause=response_malformed',
        )
      }
      credential = null

      let available: boolean
      try {
        available = hasExactConfiguredModel(body, request.modelId)
      } catch {
        return fail(
          options.events,
          'realtime_client_secret_response_malformed',
          'cause=response_malformed',
        )
      }

      return Object.freeze({ status: available ? 'available' : 'unavailable' })
    },
  }
}
