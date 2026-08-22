import { describe, expect, it, vi } from 'vitest'

import type { CredentialStore } from '../../src/main/credential-store'
import { createClientSecretBroker } from '../../src/main/realtime/client-secret-broker'

const CONFIGURED_MODEL_ID = 'configured-realtime-model'
const LONG_CREDENTIAL = 'synthetic-long-credential-for-test-only'
const SHORT_CLIENT_SECRET = 'ek_synthetic-short-secret-for-test-only'
const PROVIDER_EXPIRY = 1_700_000_000
const RAW_PROVIDER_DETAIL = 'synthetic-provider-detail-redacted'

type MetadataEvent = Record<string, unknown>

type FetchResponse = {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

const ALLOWED_EVENT_NAMES = new Set([
  'realtime_client_secret_issued',
  'realtime_client_secret_failed',
])

const ALLOWED_EVENT_FIELDS = new Set([
  'module',
  'event',
  'status',
  'error_code',
  'reason',
  'source',
])

function makeCredentialStore(value: string | null): CredentialStore {
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  }
}

function makeFetchMock(body: unknown, status = 200): {
  mock: ReturnType<typeof vi.fn>
  fetchImpl: typeof fetch
} {
  const mock = vi.fn(async (_input: unknown, _init?: unknown): Promise<FetchResponse> => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
  }))
  return { mock, fetchImpl: mock as unknown as typeof fetch }
}

function makeEvents(): { events: MetadataEvent[]; sink: { emit(event: MetadataEvent): void } } {
  const events: MetadataEvent[] = []
  return {
    events,
    sink: {
      emit(event) {
        events.push({ ...event })
      },
    },
  }
}

function makeBroker(credential: string | null, events: MetadataEvent[]) {
  return createClientSecretBroker({
    credentialStore: makeCredentialStore(credential),
    events: {
      emit(event: MetadataEvent) {
        events.push({ ...event })
      },
    },
  })
}

function assertMetadataOnly(events: readonly MetadataEvent[], forbidden: readonly string[]): void {
  expect(events.length).toBeGreaterThan(0)
  for (const event of events) {
    expect(ALLOWED_EVENT_NAMES.has(String(event.event))).toBe(true)
    expect(Object.keys(event).every((key) => ALLOWED_EVENT_FIELDS.has(key))).toBe(true)
    expect(event.reason).toEqual(expect.any(String))
    expect(['runtime', 'contract_test']).toContain(event.source)

    const serialized = JSON.stringify(event)
    for (const value of forbidden) {
      expect(serialized).not.toContain(value)
    }
  }
}

describe('P1-U2 Main-only Realtime client-secret broker RED contract', () => {
  it('uses the safeStorage credential only in Main and posts the configured model with provider expiry metadata', async () => {
    const { events } = makeEvents()
    const { mock, fetchImpl } = makeFetchMock({
      value: SHORT_CLIENT_SECRET,
      expires_at: PROVIDER_EXPIRY,
    })
    const broker = makeBroker(LONG_CREDENTIAL, events)

    const issued = await broker.issue({
      modelId: CONFIGURED_MODEL_ID,
      fetchImpl,
    })

    expect(issued).toEqual({
      value: SHORT_CLIENT_SECRET,
      expiresAt: PROVIDER_EXPIRY,
    })
    expect(JSON.stringify(issued)).not.toContain(LONG_CREDENTIAL)

    expect(mock).toHaveBeenCalledTimes(1)
    const [requestUrl, requestInit] = mock.mock.calls[0] as [
      unknown,
      { method?: string; headers?: Record<string, string>; body?: string } | undefined,
    ]
    expect(requestUrl).toBe('https://api.openai.com/v1/realtime/client_secrets')
    expect(requestInit?.method).toBe('POST')
    expect(requestInit?.headers).toEqual(expect.objectContaining({
      Authorization: `Bearer ${LONG_CREDENTIAL}`,
      'Content-Type': 'application/json',
    }))
    expect(JSON.parse(requestInit?.body ?? '')).toEqual({
      expires_after: {
        anchor: 'created_at',
        seconds: 600,
      },
      session: {
        type: 'realtime',
        model: CONFIGURED_MODEL_ID,
      },
    })

    expect(events).toContainEqual(expect.objectContaining({
      event: 'realtime_client_secret_issued',
      status: 'success',
    }))
    assertMetadataOnly(events, [LONG_CREDENTIAL, SHORT_CLIENT_SECRET])
  })

  it('does not invent a client-secret lifetime when the provider omits stable expiry metadata', async () => {
    const { events } = makeEvents()
    const { fetchImpl } = makeFetchMock({ value: SHORT_CLIENT_SECRET })
    const broker = makeBroker(LONG_CREDENTIAL, events)

    const issued = await broker.issue({
      modelId: CONFIGURED_MODEL_ID,
      fetchImpl,
    })

    expect(issued).toEqual({ value: SHORT_CLIENT_SECRET })
    expect(events).toContainEqual(expect.objectContaining({
      event: 'realtime_client_secret_issued',
      reason: expect.stringContaining('expiry=absent'),
    }))
    assertMetadataOnly(events, [LONG_CREDENTIAL, SHORT_CLIENT_SECRET])
  })

  it('fails visibly without calling the provider when Main has no safeStorage credential', async () => {
    const { events } = makeEvents()
    const { mock, fetchImpl } = makeFetchMock({ value: SHORT_CLIENT_SECRET })
    const broker = makeBroker(null, events)

    await expect(broker.issue({ modelId: CONFIGURED_MODEL_ID, fetchImpl })).rejects.toBeDefined()

    expect(mock).not.toHaveBeenCalled()
    expect(events).toContainEqual(expect.objectContaining({
      event: 'realtime_client_secret_failed',
      status: 'failed',
      reason: expect.stringContaining('cause=credential_missing'),
    }))
    assertMetadataOnly(events, [LONG_CREDENTIAL, SHORT_CLIENT_SECRET])
  })

  it('maps a non-2xx provider response to a metadata-only failure without model substitution', async () => {
    const { events } = makeEvents()
    const { mock, fetchImpl } = makeFetchMock({ error: RAW_PROVIDER_DETAIL }, 503)
    const broker = makeBroker(LONG_CREDENTIAL, events)

    await expect(broker.issue({ modelId: CONFIGURED_MODEL_ID, fetchImpl })).rejects.toBeDefined()

    expect(mock).toHaveBeenCalledTimes(1)
    const [, requestInit] = mock.mock.calls[0] as [unknown, { body?: string } | undefined]
    expect(JSON.parse(requestInit?.body ?? '')).toEqual({
      expires_after: {
        anchor: 'created_at',
        seconds: 600,
      },
      session: {
        type: 'realtime',
        model: CONFIGURED_MODEL_ID,
      },
    })
    expect(events).toContainEqual(expect.objectContaining({
      event: 'realtime_client_secret_failed',
      status: 'failed',
      reason: 'http_status=503',
    }))
    assertMetadataOnly(events, [LONG_CREDENTIAL, SHORT_CLIENT_SECRET, RAW_PROVIDER_DETAIL])
  })

  it('maps fetch rejection to a reasoned failure without exposing the caught error', async () => {
    const { events } = makeEvents()
    const mock = vi.fn(async () => {
      throw new Error('synthetic-fetch-failure-detail')
    })
    const broker = makeBroker(LONG_CREDENTIAL, events)

    await expect(broker.issue({
      modelId: CONFIGURED_MODEL_ID,
      fetchImpl: mock as unknown as typeof fetch,
    })).rejects.toBeDefined()

    expect(mock).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual(expect.objectContaining({
      event: 'realtime_client_secret_failed',
      status: 'failed',
      reason: 'cause=fetch_failed',
    }))
    assertMetadataOnly(events, [
      LONG_CREDENTIAL,
      SHORT_CLIENT_SECRET,
      'synthetic-fetch-failure-detail',
    ])
  })

  it.each([
    { label: 'malformed response', body: {}, reason: 'cause=response_malformed' },
    {
      label: 'wrong secret prefix',
      body: { value: 'provider-secret-without-required-prefix' },
      reason: 'cause=invalid_secret_prefix',
    },
  ])('rejects a $label and emits no secret-bearing event', async ({ body, reason }) => {
    const { events } = makeEvents()
    const { fetchImpl } = makeFetchMock(body)
    const broker = makeBroker(LONG_CREDENTIAL, events)

    await expect(broker.issue({ modelId: CONFIGURED_MODEL_ID, fetchImpl })).rejects.toBeDefined()

    expect(events).toContainEqual(expect.objectContaining({
      event: 'realtime_client_secret_failed',
      status: 'failed',
      reason,
    }))
    assertMetadataOnly(events, [LONG_CREDENTIAL, SHORT_CLIENT_SECRET, 'provider-secret-without-required-prefix'])
  })
})
