import { describe, expect, it, vi } from 'vitest'
import {
  ClientSecretBrokerError,
  type ClientSecretBrokerOptions,
  createClientSecretBroker,
} from '../../src/main/realtime/client-secret-broker'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

function createFixture(credential: string | null = 'fixture-credential') {
  const get = vi.fn(async () => credential)
  const emit = vi.fn()
  const options: ClientSecretBrokerOptions = {
    credentialStore: { get } as ClientSecretBrokerOptions['credentialStore'],
    events: { emit } as unknown as ClientSecretBrokerOptions['events'],
  }
  return { broker: createClientSecretBroker(options), get, emit }
}

function expectBrokerError(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({
    name: 'ClientSecretBrokerError',
    code,
  })
}

describe('ClientSecretBroker model availability probe', () => {
  it('returns a frozen available status for one exact configured ID', async () => {
    const { broker } = createFixture()
    const configuredModelId = 'configured-model-v1'
    const fetchImpl = vi.fn(async () => jsonResponse({
      object: 'list',
      data: [
        { id: 'configured-model-v10', ignored: { provider: 'redacted' } },
        { id: configuredModelId, object: 'model', created: 123, owned_by: 'ignored' },
      ],
      ignored: 'discarded',
    }))

    const result = await broker.probeModelAvailability({ modelId: configuredModelId, fetchImpl })

    expect(result).toEqual({ status: 'available' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('returns frozen unavailable metadata without prefix, case, or fallback matching', async () => {
    const { broker } = createFixture()
    const configuredModelId = 'configured-model-v1'
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [
        { id: 'configured-model-v10' },
        { id: 'Configured-Model-v1' },
        { id: 'another-configured-model-v1' },
      ],
    }))

    const result = await broker.probeModelAvailability({ modelId: configuredModelId, fetchImpl })

    expect(result).toEqual({ status: 'unavailable' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('uses the existing metadata-only credential failure categories', async () => {
    const missing = createFixture(null)
    const request = { modelId: 'configured-model-v1', fetchImpl: vi.fn() }

    await expectBrokerError(
      missing.broker.probeModelAvailability(request),
      'realtime_client_secret_credential_missing',
    )
    expect(missing.get).toHaveBeenCalledTimes(1)
    expect(missing.emit).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'realtime_client_secret_credential_missing',
      reason: 'cause=credential_missing',
    }))

    const readFailed = createFixture()
    readFailed.get.mockRejectedValueOnce(new Error('fixture read failure'))

    await expectBrokerError(
      readFailed.broker.probeModelAvailability(request),
      'realtime_client_secret_credential_read_failed',
    )
    expect(readFailed.emit).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'realtime_client_secret_credential_read_failed',
      reason: 'cause=credential_read_failed',
    }))
  })

  it('reports fetch and non-OK HTTP failures without retrying', async () => {
    const fetchFailed = createFixture()
    const fetchImpl = vi.fn(async () => {
      throw new Error('fixture fetch failure')
    })

    await expectBrokerError(
      fetchFailed.broker.probeModelAvailability({ modelId: 'configured-model-v1', fetchImpl }),
      'realtime_client_secret_fetch_failed',
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const httpFailed = createFixture()
    const responseJson = vi.fn(async () => ({ data: [] }))
    const httpFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: responseJson,
    }) as unknown as Response)

    await expectBrokerError(
      httpFailed.broker.probeModelAvailability({ modelId: 'configured-model-v1', fetchImpl: httpFetch }),
      'realtime_client_secret_http_failed',
    )
    expect(httpFetch).toHaveBeenCalledTimes(1)
    expect(responseJson).not.toHaveBeenCalled()
  })

  it('reports malformed, non-object, invalid-item, and oversized responses', async () => {
    const malformed = createFixture()
    const malformedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('fixture malformed response')
      },
    }) as unknown as Response)
    await expectBrokerError(
      malformed.broker.probeModelAvailability({ modelId: 'configured-model-v1', fetchImpl: malformedFetch }),
      'realtime_client_secret_response_malformed',
    )

    const nonObject = createFixture()
    const nonObjectFetch = vi.fn(async () => jsonResponse(['not-an-object']))
    await expectBrokerError(
      nonObject.broker.probeModelAvailability({ modelId: 'configured-model-v1', fetchImpl: nonObjectFetch }),
      'realtime_client_secret_response_malformed',
    )

    const invalidItem = createFixture()
    const invalidItemFetch = vi.fn(async () => jsonResponse({ data: [{ id: 123 }] }))
    await expectBrokerError(
      invalidItem.broker.probeModelAvailability({ modelId: 'configured-model-v1', fetchImpl: invalidItemFetch }),
      'realtime_client_secret_response_malformed',
    )

    const oversized = createFixture()
    const oversizedFetch = vi.fn(async () => jsonResponse({
      data: Array.from({ length: 257 }, () => ({ id: 'ignored-model' })),
    }))
    await expectBrokerError(
      oversized.broker.probeModelAvailability({ modelId: 'configured-model-v1', fetchImpl: oversizedFetch }),
      'realtime_client_secret_response_malformed',
    )
  })

  it('rejects an empty configured model ID before reading credentials', async () => {
    const { broker, get, emit } = createFixture()

    await expectBrokerError(
      broker.probeModelAvailability({ modelId: '' }),
      'realtime_client_secret_model_invalid',
    )
    expect(get).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'realtime_client_secret_model_invalid',
      reason: 'cause=model_invalid',
    }))
  })

  it('keeps probe failures within ClientSecretBrokerError', async () => {
    const { broker } = createFixture()
    const promise = broker.probeModelAvailability({
      modelId: 'configured-model-v1',
      fetchImpl: vi.fn(async () => jsonResponse({ data: 'not-an-array' })),
    })

    await expect(promise).rejects.toBeInstanceOf(ClientSecretBrokerError)
  })
})
