import { describe, expect, it, vi } from 'vitest'

import { bootSequence } from '../../src/main/boot'
import {
  createRealtimeIpcContract,
} from '../../src/main/ipc'

const MODEL_ID = 'synthetic-realtime-model'
const SESSION_ID = 'synthetic-realtime-session'
const FIXED_TIME = '2026-08-22T00:00:00.000Z'
const CLIENT_SECRET = 'ek_synthetic-client-secret'
const EXPIRY = 1_800_000_000

type TestRuntime = {
  readonly ready: Promise<void>
  requestRealtimeClientSecret(): Promise<unknown>
  handleSimulator(command: unknown): Promise<unknown>
}

function makeSessionBundle(sdkVersion = '0.16.1'): Record<string, unknown> {
  return {
    snapshot: Object.freeze({
      configVersion: 7,
      fingerprint: 'synthetic-config-fingerprint',
      sdkVersion,
      realtimeDialogue: MODEL_ID,
      inputTranscription: 'synthetic-transcription-model',
      memoryExtractor: 'synthetic-memory-model',
      voice: 'synthetic-voice',
      reasoningEffort: 'low',
      turnDetectionProfile: 'semantic-vad',
      takenAt: FIXED_TIME,
    }),
    identity: Object.freeze({
      realtimeSessionId: SESSION_ID,
      sessionGeneration: 1,
    }),
    clientSecret: Object.freeze({
      value: CLIENT_SECRET,
      expiresAt: EXPIRY,
    }),
  }
}

function makeBootOptions(broker: unknown): unknown {
  const active = {
    slot: 'active' as const,
    configVersion: 7,
    fingerprint: 'synthetic-config-fingerprint',
    realtimeDialogue: MODEL_ID,
    inputTranscription: 'synthetic-transcription-model',
    memoryExtractor: 'synthetic-memory-model',
    voice: 'synthetic-voice',
    reasoningEffort: 'low',
    turnDetectionProfile: 'semantic-vad',
  }
  const modelResolution = {
    active,
    draft: { ...active, slot: 'draft' as const },
    previous: { ...active, slot: 'previous' as const, configVersion: 6 },
  }

  let state = 'starting'
  let context = {
    activationId: null as string | null,
    realtimeSessionId: null as string | null,
    sessionGeneration: 0,
    activeProfileId: null as string | null,
    lastInteractionAt: null as string | null,
    sceneInvocationId: null as string | null,
  }
  const listeners = new Set<(snapshot: { state: string; context: typeof context }) => void>()
  const actor = {
    send(event: { type: string; realtimeSessionId?: string }) {
      if (event.type === 'LOCAL_READY') state = 'dormant'
      if (event.type === 'WAKE_DETECTED') {
        state = 'activating'
        context = { ...context, realtimeSessionId: null }
      }
      if (event.type === 'REALTIME_READY') {
        state = 'active'
        context = { ...context, realtimeSessionId: event.realtimeSessionId ?? null }
      }
      if (event.type === 'CLOUD_FAILED') {
        state = 'offlineLoop'
        context = {
          ...context,
          realtimeSessionId: null,
          sessionGeneration: context.sessionGeneration + 1,
        }
      }
      const snapshot = { state, context: { ...context } }
      for (const listener of listeners) listener(snapshot)
    },
    getState: () => state,
    getContext: () => ({ ...context }),
    subscribe(listener: (snapshot: { state: string; context: typeof context }) => void) {
      listeners.add(listener)
      return { unsubscribe: () => listeners.delete(listener) }
    },
  }

  const telemetry = {
    emit: () => {},
    readPage: () => ({ events: [], nextBeforeSequence: null }),
    getStats: () => ({
      telemetryDroppedCount: 0,
      ramEvictedCount: 0,
      rejectedEventCount: 0,
      extraFieldStrippedCount: 0,
      writerFailureCount: 0,
      rotationFailureCount: 0,
      schedulerFailureCount: 0,
      ramEventCount: 0,
      queueDepth: 0,
      closed: false,
    }),
    flush: async () => {},
    close: async () => {},
  }
  const moduleRegistry = {
    getStatus: () => 'ready',
    snapshot: () => ({
      app: 'ready',
      openai: 'ready',
      wake: 'ready',
      audio: 'ready',
      camera: 'ready',
      avatar: 'ready',
      lighting: 'ready',
      fog: 'ready',
      music: 'ready',
      sqlite: 'ready',
      config: 'ready',
      telemetry: 'ready',
      identity: 'not_implemented',
      memory: 'not_implemented',
    }),
    probe: async (module: string) => ({
      module,
      eventDelivery: 'emitted',
      kind: 'success',
      status: 'ready',
      opStatus: 'success',
      reason: 'probe_success',
    }),
  }

  return {
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    createTelemetry: () => telemetry,
    configService: {
      initialize: async () => ({
        active: { configVersion: 7 },
        draft: { configVersion: 7 },
        previous: { configVersion: 6 },
      }),
      read: async () => ({
        active: { configVersion: 7 },
        draft: { configVersion: 7 },
        previous: { configVersion: 6 },
      }),
    },
    resolveModelSettings: () => modelResolution,
    openSqlite: () => ({
      ok: true,
      value: {
        health: () => ({
          status: 'ready',
          schemaVersion: 1,
          journalMode: 'wal',
          foreignKeys: true,
          integrity: 'ok',
          failure: null,
        }),
        close: () => ({ ok: true, value: undefined }),
        readPhaseTestRecords: () => ({ ok: true, value: [] }),
      },
    }),
    createMockModuleFactory: () => ({
      create: (id: string) => ({
        id,
        initialStatus: 'not_implemented',
        probe: () => 'success',
        setOutcome: () => {},
      }),
    }),
    createModuleRegistry: () => moduleRegistry,
    createLifecycleActor: () => actor,
    clientSecretBroker: broker,
    now: () => FIXED_TIME,
    createActivationId: () => 'synthetic-activation',
    createRealtimeSessionId: () => SESSION_ID,
  }
}

function makeContract(issue: () => Promise<unknown>): ReturnType<typeof createRealtimeIpcContract> {
  return (createRealtimeIpcContract as unknown as (options: unknown) => ReturnType<typeof createRealtimeIpcContract>)({
    issueRealtimeSessionStartBundle: issue,
  })
}

const electronHarness = vi.hoisted(() => ({
  invoke: vi.fn(),
  bridge: undefined as unknown,
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: unknown) => {
      electronHarness.bridge = bridge
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => electronHarness.invoke(...args),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

type MirrorBridgeLike = {
  requestRealtimeClientSecret(): Promise<unknown>
}

let mirrorBridgePromise: Promise<MirrorBridgeLike> | null = null

function mirrorBridge(): Promise<MirrorBridgeLike> {
  mirrorBridgePromise ??= import('../../src/preload/mirror').then(() => (
    electronHarness.bridge as MirrorBridgeLike
  ))
  return mirrorBridgePromise
}

describe('P1-U7 C2 atomic session-start bridge', () => {
  it('captures the published snapshot and lifecycle identity before broker await', async () => {
    let brokerCalls = 0
    let requestedModel: string | null = null
    let resolveBroker!: (value: { value: string; expiresAt: number }) => void
    const broker = {
      issue: ({ modelId }: { modelId: string }) => {
        brokerCalls += 1
        requestedModel = modelId
        return new Promise<{ value: string; expiresAt: number }>((resolve) => {
          resolveBroker = resolve
        })
      },
    }
    const runtime = bootSequence(makeBootOptions(broker) as never) as unknown as TestRuntime

    await runtime.ready
    await runtime.handleSimulator({ type: 'wake' })
    const pending = runtime.requestRealtimeClientSecret()
    await Promise.resolve()

    expect(brokerCalls).toBe(1)
    expect(requestedModel).toBe(MODEL_ID)
    await runtime.handleSimulator({ type: 'cloud_failure' })
    resolveBroker({ value: CLIENT_SECRET, expiresAt: EXPIRY })

    await expect(pending).resolves.toEqual({
      snapshot: {
        configVersion: 7,
        fingerprint: 'synthetic-config-fingerprint',
        sdkVersion: '0.16.1',
        realtimeDialogue: MODEL_ID,
        inputTranscription: 'synthetic-transcription-model',
        memoryExtractor: 'synthetic-memory-model',
        voice: 'synthetic-voice',
        reasoningEffort: 'low',
        turnDetectionProfile: 'semantic-vad',
        takenAt: FIXED_TIME,
      },
      identity: {
        realtimeSessionId: SESSION_ID,
        sessionGeneration: 0,
      },
      clientSecret: {
        value: CLIENT_SECRET,
        expiresAt: EXPIRY,
      },
    })
  })

  it('does not call the broker when the current lifecycle has no realtime identity', async () => {
    let brokerCalls = 0
    const runtime = bootSequence(makeBootOptions({
      issue: async () => {
        brokerCalls += 1
        return { value: CLIENT_SECRET }
      },
    }) as never) as unknown as TestRuntime

    await runtime.ready

    await expect(runtime.requestRealtimeClientSecret()).rejects.toMatchObject({
      code: 'realtime_session_unavailable',
    })
    expect(brokerCalls).toBe(0)
  })

  it('maps the atomic Main bundle through the pure Mirror contract', async () => {
    const contract = makeContract(async () => makeSessionBundle())

    await expect(contract.handleTransientSecretRequest({ sender: { identity: 'mirror' } })).resolves.toEqual({
      status: 'accepted',
      reason: 'mirror_authorized',
      value: {
        snapshot: {
          configVersion: 7,
          fingerprint: 'synthetic-config-fingerprint',
          sdkVersion: '0.16.1',
          realtimeDialogue: MODEL_ID,
          inputTranscription: 'synthetic-transcription-model',
          memoryExtractor: 'synthetic-memory-model',
          voice: 'synthetic-voice',
          reasoningEffort: 'low',
          turnDetectionProfile: 'semantic-vad',
          takenAt: FIXED_TIME,
        },
        identity: {
          realtimeSessionId: SESSION_ID,
          sessionGeneration: 1,
        },
        clientSecret: CLIENT_SECRET,
        expiresAt: EXPIRY,
      },
    })
  })

  it('accepts a non-pinned nonempty SDK version through Main and preload validation', async () => {
    const contract = makeContract(async () => makeSessionBundle('synthetic-sdk-version'))

    const mainResult = await contract.handleTransientSecretRequest({ sender: { identity: 'mirror' } })
    expect(mainResult).toMatchObject({
      status: 'accepted',
      reason: 'mirror_authorized',
      value: { snapshot: { sdkVersion: 'synthetic-sdk-version' } },
    })

    const bridge = await mirrorBridge()
    electronHarness.invoke.mockResolvedValueOnce(mainResult)
    await expect(bridge.requestRealtimeClientSecret()).resolves.toMatchObject({
      status: 'accepted',
      value: { snapshot: { sdkVersion: 'synthetic-sdk-version' } },
    })
  })

  it('returns frozen sanitized copies instead of mutable IPC references', async () => {
    const bridge = await mirrorBridge()
    const source = {
      status: 'accepted',
      reason: 'mirror_authorized',
      value: {
        snapshot: {
          configVersion: 7,
          fingerprint: 'synthetic-config-fingerprint',
          sdkVersion: '0.16.1',
          realtimeDialogue: MODEL_ID,
          inputTranscription: 'synthetic-transcription-model',
          memoryExtractor: 'synthetic-memory-model',
          voice: 'synthetic-voice',
          reasoningEffort: 'low',
          turnDetectionProfile: 'semantic-vad',
          takenAt: FIXED_TIME,
        },
        identity: {
          realtimeSessionId: SESSION_ID,
          sessionGeneration: 1,
        },
        clientSecret: CLIENT_SECRET,
        expiresAt: EXPIRY,
      },
    }
    electronHarness.invoke.mockResolvedValueOnce(source)

    const returned = await bridge.requestRealtimeClientSecret() as typeof source

    expect(returned).not.toBe(source)
    expect(returned.value).not.toBe(source.value)
    expect(returned.value.snapshot).not.toBe(source.value.snapshot)
    expect(returned.value.identity).not.toBe(source.value.identity)
    expect(Object.isFrozen(returned)).toBe(true)
    expect(Object.isFrozen(returned.value)).toBe(true)
    expect(Object.isFrozen(returned.value.snapshot)).toBe(true)
    expect(Object.isFrozen(returned.value.identity)).toBe(true)

    source.value.snapshot.voice = 'mutated-voice'
    source.value.identity.sessionGeneration = 9
    source.value.expiresAt = 0

    expect(returned.value.snapshot.voice).toBe('synthetic-voice')
    expect(returned.value.identity.sessionGeneration).toBe(1)
    expect(returned.value.expiresAt).toBe(EXPIRY)
  })

  it('maps a malformed Main bundle to an explicit invalid payload rejection', async () => {
    const malformed = {
      ...makeSessionBundle(),
      identity: {},
    }
    const contract = makeContract(async () => malformed)

    await expect(contract.handleTransientSecretRequest({ sender: { identity: 'mirror' } })).resolves.toEqual({
      status: 'rejected',
      reason: 'invalid_payload',
    })
  })

  it('keeps sender, session-unavailable, and broker-failed outcomes explicit', async () => {
    const contract = makeContract(async () => {
      throw { code: 'realtime_session_unavailable' }
    })

    await expect(contract.handleTransientSecretRequest({ sender: { identity: 'console' } })).resolves.toEqual({
      status: 'rejected',
      reason: 'unauthorized_sender',
    })
    await expect(contract.handleTransientSecretRequest({ sender: { identity: 'mirror' } })).resolves.toEqual({
      status: 'rejected',
      reason: 'session_unavailable',
    })

    const failedContract = makeContract(async () => {
      throw new Error('synthetic broker failure')
    })
    await expect(failedContract.handleTransientSecretRequest({ sender: { identity: 'mirror' } })).resolves.toEqual({
      status: 'rejected',
      reason: 'broker_failed',
    })
  })

  it('structurally validates preload results and invokes the existing channel once', async () => {
    const bridge = await mirrorBridge()
    const valid = {
      status: 'accepted',
      reason: 'mirror_authorized',
      value: {
        snapshot: {
          configVersion: 7,
          fingerprint: 'synthetic-config-fingerprint',
          sdkVersion: '0.16.1',
          realtimeDialogue: MODEL_ID,
          inputTranscription: 'synthetic-transcription-model',
          memoryExtractor: 'synthetic-memory-model',
          voice: 'synthetic-voice',
          reasoningEffort: 'low',
          turnDetectionProfile: 'semantic-vad',
          takenAt: FIXED_TIME,
        },
        identity: {
          realtimeSessionId: SESSION_ID,
          sessionGeneration: 1,
        },
        clientSecret: CLIENT_SECRET,
        expiresAt: EXPIRY,
      },
    }
    electronHarness.invoke.mockClear()
    electronHarness.invoke.mockResolvedValueOnce(valid)

    await expect(bridge.requestRealtimeClientSecret()).resolves.toEqual(valid)
    expect(electronHarness.invoke).toHaveBeenCalledTimes(1)
    expect(electronHarness.invoke).toHaveBeenCalledWith('mirror:request-realtime-client-secret')
  })

  it.each([
    { status: 'accepted', reason: 'mirror_authorized', value: CLIENT_SECRET },
    { status: 'accepted', reason: 'mirror_authorized', value: { snapshot: {} } },
    { status: 'accepted', reason: 'unknown_reason', value: makeSessionBundle() },
    { status: 'rejected', reason: 'unknown_reason' },
    { status: 'rejected', reason: 'broker_failed', extra: true },
  ])('maps malformed, legacy, or unknown preload payloads to invalid_payload', async (payload) => {
    const bridge = await mirrorBridge()
    electronHarness.invoke.mockResolvedValueOnce(payload)

    await expect(bridge.requestRealtimeClientSecret()).resolves.toEqual({
      status: 'rejected',
      reason: 'invalid_payload',
    })
  })
})
