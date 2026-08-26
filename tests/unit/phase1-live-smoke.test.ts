import { describe, expect, it } from 'vitest'
import {
  createPhase1LiveSmokeCoordinator,
  type Phase1LiveSmokeResult,
} from '../../src/main/phase1-live-smoke'

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('phase 1 live smoke coordinator', () => {
  it('starts only after mirror readiness, stops after active, and completes at dormant', async () => {
    let lifecycle = 'dormant'
    const listeners = new Set<(snapshot: { lifecycle: string }) => void>()
    const calls: string[] = []
    const results: Phase1LiveSmokeResult[] = []

    const coordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => ({ lifecycle }),
      subscribe: (listener) => {
        listeners.add(listener)
        return { unsubscribe: () => listeners.delete(listener) }
      },
      manualStart: async () => {
        calls.push('manual_start')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      manualStop: async () => {
        calls.push('manual_stop')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      emitResult: (result) => results.push(result),
      stageTimeoutMs: 1_000,
    })

    coordinator.start()
    expect(calls).toEqual([])

    coordinator.onMirrorRendererReady()
    await flushPromises()
    expect(calls).toEqual(['manual_start'])

    lifecycle = 'active'
    for (const listener of listeners) listener({ lifecycle })
    await flushPromises()
    expect(calls).toEqual(['manual_start', 'manual_stop'])

    lifecycle = 'dormant'
    for (const listener of listeners) listener({ lifecycle })
    expect(results).toEqual([
      expect.objectContaining({
        status: 'passed',
        stage: 'dormant',
        reason: 'completed',
        exit: 0,
        modelAvailability: 'probe_failed',
      }),
    ])
  })

  it('starts the model probe concurrently and records its fixed enum result', async () => {
    let lifecycle = 'dormant'
    let probeStarted = false
    let resolveProbe!: (value: unknown) => void
    const listeners = new Set<(snapshot: { lifecycle: string }) => void>()
    const calls: string[] = []
    const results: Phase1LiveSmokeResult[] = []
    const probe = new Promise<unknown>((resolve) => {
      resolveProbe = resolve
    })

    const coordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => ({ lifecycle }),
      subscribe: (listener) => {
        listeners.add(listener)
        return { unsubscribe: () => listeners.delete(listener) }
      },
      probeConfiguredModelAvailability: () => {
        probeStarted = true
        return probe
      },
      manualStart: async () => {
        calls.push('manual_start')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      manualStop: async () => {
        calls.push('manual_stop')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      emitResult: (result) => results.push(result),
      stageTimeoutMs: 1_000,
    })

    coordinator.start()
    expect(probeStarted).toBe(true)

    coordinator.onMirrorRendererReady()
    await flushPromises()
    expect(calls).toEqual(['manual_start'])

    lifecycle = 'active'
    for (const listener of listeners) listener({ lifecycle })
    await flushPromises()
    expect(calls).toEqual(['manual_start', 'manual_stop'])

    lifecycle = 'dormant'
    for (const listener of listeners) listener({ lifecycle })
    expect(results).toHaveLength(0)

    resolveProbe('available')
    await flushPromises()
    expect(results).toEqual([
      expect.objectContaining({ modelAvailability: 'available', status: 'passed', exit: 0 }),
    ])
  })

  it('maps a rejected or invalid model probe to probe_failed without raw errors', async () => {
    for (const probeResult of [
      Promise.reject(),
      Promise.resolve('unexpected'),
    ]) {
      const results: Phase1LiveSmokeResult[] = []
      const coordinator = createPhase1LiveSmokeCoordinator({
        getSnapshot: () => ({ lifecycle: 'offlineLoop' }),
        subscribe: () => ({ unsubscribe() {} }),
        probeConfiguredModelAvailability: () => probeResult,
        manualStart: async () => ({ status: 'success', reason: 'runtime_command_delivered' }),
        manualStop: async () => ({ status: 'success', reason: 'runtime_command_delivered' }),
        emitResult: (result) => results.push(result),
        stageTimeoutMs: 1_000,
      })

      coordinator.start()
      await flushPromises()

      expect(results).toEqual([
        expect.objectContaining({
          modelAvailability: 'probe_failed',
          status: 'failed',
          stage: 'renderer_ready',
          reason: 'lifecycle_offline_loop',
          exit: 1,
        }),
      ])
    }
  })

  it('caps an unresolved model probe at exactly 5 seconds without gating lifecycle actions', async () => {
    let lifecycle = 'dormant'
    const listeners = new Set<(snapshot: { lifecycle: string }) => void>()
    const scheduled: Array<{ callback: () => void; delayMs: number; cleared: boolean }> = []
    const calls: string[] = []
    const results: Phase1LiveSmokeResult[] = []
    const coordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => ({ lifecycle }),
      subscribe: (listener) => {
        listeners.add(listener)
        return { unsubscribe: () => listeners.delete(listener) }
      },
      probeConfiguredModelAvailability: () => new Promise(() => {}),
      manualStart: async () => {
        calls.push('manual_start')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      manualStop: async () => {
        calls.push('manual_stop')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      emitResult: (result) => results.push(result),
      stageTimeoutMs: 1_000,
      scheduleTimeout: (callback, delayMs) => {
        const entry = { callback, delayMs, cleared: false }
        scheduled.push(entry)
        return entry
      },
      clearScheduledTimeout: (handle) => {
        if (typeof handle === 'object' && handle !== null && 'cleared' in handle) {
          ;(handle as { cleared: boolean }).cleared = true
        }
      },
    })

    coordinator.start()
    coordinator.onMirrorRendererReady()
    await flushPromises()
    expect(calls).toEqual(['manual_start'])

    lifecycle = 'active'
    for (const listener of listeners) listener({ lifecycle })
    await flushPromises()
    expect(calls).toEqual(['manual_start', 'manual_stop'])

    lifecycle = 'dormant'
    for (const listener of listeners) listener({ lifecycle })
    expect(results).toHaveLength(0)
    expect(scheduled.map(({ delayMs }) => delayMs)).toContain(5_000)

    const probeTimeout = scheduled.find(({ delayMs }) => delayMs === 5_000)
    expect(probeTimeout).toBeDefined()
    probeTimeout?.callback()
    await flushPromises()

    expect(results).toEqual([
      expect.objectContaining({
        modelAvailability: 'probe_failed',
        status: 'passed',
        stage: 'dormant',
        reason: 'completed',
        exit: 0,
      }),
    ])
  })

  it('emits one metadata-only failure for the first failed action', async () => {
    const results: Phase1LiveSmokeResult[] = []
    let starts = 0
    const coordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => ({ lifecycle: 'dormant' }),
      subscribe: () => ({ unsubscribe() {} }),
      manualStart: async () => {
        starts += 1
        return { status: 'failed', reason: 'client_secret_request_failed' }
      },
      manualStop: async () => ({ status: 'success', reason: 'runtime_command_delivered' }),
      emitResult: (result) => results.push(result),
      stageTimeoutMs: 1_000,
    })

    coordinator.start()
    coordinator.onMirrorRendererReady()
    coordinator.onMirrorRendererReady()
    await flushPromises()

    expect(starts).toBe(1)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(expect.objectContaining({
      status: 'failed',
      stage: 'start',
      reason: 'client_secret_request_failed',
      exit: 1,
      modelAvailability: 'probe_failed',
    }))
  })

  it('uses the last failed realtime outcome reason for an OfflineLoop result', () => {
    const results: Phase1LiveSmokeResult[] = []
    const coordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => ({ lifecycle: 'offlineLoop' }),
      getLastRealtimeRuntimeOutcomeReason: () => 'broker_failed',
      subscribe: () => ({ unsubscribe() {} }),
      manualStart: async () => ({ status: 'success', reason: 'runtime_command_delivered' }),
      manualStop: async () => ({ status: 'success', reason: 'runtime_command_delivered' }),
      emitResult: (result) => results.push(result),
      stageTimeoutMs: 1_000,
    })

    coordinator.start()

    expect(results).toEqual([
      expect.objectContaining({
        status: 'failed',
        reason: 'broker_failed',
        exit: 1,
        modelAvailability: 'probe_failed',
      }),
    ])
  })

  it('falls back to the lifecycle marker for an invalid realtime outcome reason', () => {
    const results: Phase1LiveSmokeResult[] = []
    const coordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => ({ lifecycle: 'offlineLoop' }),
      getLastRealtimeRuntimeOutcomeReason: () => 'broker-failed',
      subscribe: () => ({ unsubscribe() {} }),
      manualStart: async () => ({ status: 'success', reason: 'runtime_command_delivered' }),
      manualStop: async () => ({ status: 'success', reason: 'runtime_command_delivered' }),
      emitResult: (result) => results.push(result),
      stageTimeoutMs: 1_000,
    })

    coordinator.start()

    expect(results).toEqual([
      expect.objectContaining({
        status: 'failed',
        reason: 'lifecycle_offline_loop',
        exit: 1,
        modelAvailability: 'probe_failed',
      }),
    ])
  })
})
