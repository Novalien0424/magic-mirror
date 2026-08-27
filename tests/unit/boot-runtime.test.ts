import { describe, expect, it } from 'vitest'
import { bootSequence } from '../../src/main/boot'

type ProbeStatus = 'available' | 'unavailable'

interface TestRuntimeOptions {
  readonly clientSecretBroker?: {
    probeModelAvailability(request: { readonly modelId: string }): Promise<{ readonly status: ProbeStatus }>
  }
  readonly realtimeDialogue?: unknown
  readonly initialize?: () => Promise<unknown>
  readonly wake?: { readonly phrase: string; readonly modelVersion: string; readonly packageId: string }
}

function createTestRuntime(options: TestRuntimeOptions = {}) {
  const runtime = bootSequence({
    createTelemetry: () => ({
      emit() {},
      readPage: () => [],
      flush: async () => {},
      close: async () => {},
    } as never),
    configService: {
      initialize: options.initialize ?? (async () => ({ active: { wake: options.wake } })),
      read: async () => ({ active: { wake: options.wake } }),
    } as never,
    resolveModelSettings: () => ({
      active: {
        slot: 'active',
        configVersion: 1,
        fingerprint: 'a'.repeat(64),
        realtimeDialogue: options.realtimeDialogue,
        inputTranscription: 'configured-transcription-model',
        memoryExtractor: 'configured-memory-model',
        voice: 'marin',
        reasoningEffort: 'low',
        turnDetectionProfile: 'semantic-vad-interruptible',
      },
    } as never),
    clientSecretBroker: options.clientSecretBroker as never,
    openSqlite: () => ({ close() {} } as never),
    createMockModuleFactory: () => ({ create: () => ({}) } as never),
    createModuleRegistry: () => ({
      getStatus: () => 'not_implemented',
      snapshot: () => ({}),
      probe: async () => ({ status: 'not_implemented' }),
    } as never),
    dispatchRealtimeRuntimeCommand: () => ({
      status: 'success',
      reason: 'runtime_command_delivered',
    }),
  })
  return runtime
}

async function startRuntime(runtime: ReturnType<typeof createTestRuntime>): Promise<void> {
  await runtime.ready
  const result = await runtime.manualStart()
  expect(result).toEqual({ status: 'success', reason: 'runtime_command_delivered' })
}

describe('BootRuntime realtime runtime outcome reason', () => {
  it('makes the sanitized failed reason readable before OfflineLoop subscribers run', async () => {
    const runtime = createTestRuntime()
    await startRuntime(runtime)

    const observedReasons: Array<string | null> = []
    runtime.subscribe(() => observedReasons.push(runtime.getLastRealtimeRuntimeOutcomeReason()))

    const result = runtime.handleRealtimeRuntimeOutcome({
      operation: 'start',
      status: 'failed',
      reason: 'broker_failed',
    })

    expect(result).toEqual({ status: 'failed', reason: 'broker_failed' })
    expect(runtime.snapshot().lifecycle).toBe('offlineLoop')
    expect(runtime.getLastRealtimeRuntimeOutcomeReason()).toBe('broker_failed')
    expect(observedReasons).toContain('broker_failed')
  })

  it('clears the reason when a new manual start begins and on shutdown', async () => {
    const runtime = createTestRuntime()
    await startRuntime(runtime)
    runtime.handleRealtimeRuntimeOutcome({
      operation: 'start',
      status: 'failed',
      reason: 'broker_failed',
    })
    expect(runtime.getLastRealtimeRuntimeOutcomeReason()).toBe('broker_failed')

    await runtime.handleSimulator({ type: 'cloud_recovery' })
    expect(runtime.snapshot().lifecycle).toBe('dormant')
    await runtime.manualStart()
    expect(runtime.getLastRealtimeRuntimeOutcomeReason()).toBeNull()

    await runtime.shutdown()
    expect(runtime.getLastRealtimeRuntimeOutcomeReason()).toBeNull()
  })
})

describe('BootRuntime configured model availability probe', () => {
  it('publishes the Main-only wake config and updates wake status without gating lifecycle', async () => {
    const wake = {
      phrase: '魔鏡阿魔鏡',
      modelVersion: 'test-v1',
      packageId: 'magic-mirror-zh-test-v1',
    }
    const runtime = createTestRuntime({ wake })

    const published = await runtime.getPublishedWakeConfigForRuntime()
    await runtime.setWakeRuntimeStatus('degraded', 'wake_package_manifest_invalid')

    expect(published).toEqual(wake)
    expect(Object.isFrozen(published)).toBe(true)
    expect(runtime.snapshot().modules.wake).toBe('degraded')
    expect(runtime.snapshot().lifecycle).not.toBe('maintenance')
  })

  it('publishes the validated Main-only session model snapshot after ready', async () => {
    const runtime = createTestRuntime({ realtimeDialogue: 'configured-realtime-model' })

    const snapshot = await runtime.getPublishedSessionModelSnapshotForDiagnostics()

    expect(snapshot).toEqual(expect.objectContaining({
      configVersion: 1,
      fingerprint: 'a'.repeat(64),
      sdkVersion: '0.16.1',
      realtimeDialogue: 'configured-realtime-model',
      inputTranscription: 'configured-transcription-model',
      voice: 'marin',
    }))
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  it('waits for ready, probes the validated active model, and returns available unchanged', async () => {
    let releaseInitialize!: () => void
    const initializeGate = new Promise<void>((resolve) => {
      releaseInitialize = resolve
    })
    const probeRequests: Array<{ readonly modelId: string }> = []
    const runtime = createTestRuntime({
      initialize: async () => {
        await initializeGate
        return {}
      },
      realtimeDialogue: 'configured-realtime-model',
      clientSecretBroker: {
        probeModelAvailability: async (request) => {
          probeRequests.push(request)
          return { status: 'available' }
        },
      },
    })

    const resultPromise = runtime.probeConfiguredModelAvailability()
    await Promise.resolve()
    expect(probeRequests).toHaveLength(0)

    releaseInitialize()

    await expect(resultPromise).resolves.toBe('available')
    expect(probeRequests).toEqual([{ modelId: 'configured-realtime-model' }])
  })

  it('returns unavailable unchanged when the broker reports unavailable', async () => {
    const runtime = createTestRuntime({
      realtimeDialogue: 'configured-realtime-model',
      clientSecretBroker: {
        probeModelAvailability: async () => ({ status: 'unavailable' }),
      },
    })

    await expect(runtime.probeConfiguredModelAvailability()).resolves.toBe('unavailable')
  })

  it('returns probe_failed without probing when the broker or model is missing', async () => {
    const missingBrokerRuntime = createTestRuntime({ realtimeDialogue: 'configured-realtime-model' })
    await expect(missingBrokerRuntime.probeConfiguredModelAvailability()).resolves.toBe('probe_failed')

    let probeCount = 0
    const missingModelRuntime = createTestRuntime({
      clientSecretBroker: {
        probeModelAvailability: async () => {
          probeCount += 1
          return { status: 'available' }
        },
      },
    })
    await expect(missingModelRuntime.probeConfiguredModelAvailability()).resolves.toBe('probe_failed')
    expect(probeCount).toBe(0)
  })

  it('returns probe_failed when the broker rejects', async () => {
    const runtime = createTestRuntime({
      realtimeDialogue: 'configured-realtime-model',
      clientSecretBroker: {
        probeModelAvailability: async () => {
          throw new Error()
        },
      },
    })

    await expect(runtime.probeConfiguredModelAvailability()).resolves.toBe('probe_failed')
  })
})
