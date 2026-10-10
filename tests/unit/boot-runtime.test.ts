import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { bootSequence } from '../../src/main/boot'
import { createConfigService, type ConfigService } from '../../src/main/config-service'
import type { MirrorConfig } from '../../src/shared/types'
import { avatarCatalogFor } from '../../src/shared/avatar-profiles'
import type { ConsoleConfigDiff } from '../../src/shared/console-types'

type ProbeStatus = 'available' | 'unavailable'

interface TestRuntimeOptions {
  readonly configService?: ConfigService
  readonly useRealResolution?: boolean
  readonly onFatalFailure?: (reason: string) => void
  readonly rebuildWakeOwner?: () => Promise<{ status: 'success' | 'failed'; reason: string }>
  readonly read?: () => Promise<unknown>
  readonly completeSleepForDemo?: boolean
  readonly clientSecretBroker?: {
    issue?(request: unknown): Promise<unknown>
    probeModelAvailability(request: { readonly modelId: string }): Promise<{ readonly status: ProbeStatus }>
  }
  readonly realtimeDialogue?: unknown
  readonly initialize?: () => Promise<unknown>
  readonly wake?: { readonly phrase: string; readonly modelVersion: string; readonly packageId: string }
  readonly wakeMicrophoneHandoff?: {
    release(): Promise<{ readonly status: 'success' | 'failed'; readonly reason: string }>
    acquire(): Promise<{ readonly status: 'success' | 'failed' | 'degraded'; readonly reason: string }>
  }
  readonly dispatchRealtimeRuntimeCommand?: (command: { readonly operation: string }) => {
    readonly status: 'success'
    readonly reason: 'runtime_command_delivered'
  }
  readonly scheduleRealtimeTimer?: (callback: () => void, delayMs: number) => unknown
  readonly cancelRealtimeTimer?: (handle: unknown) => void
  readonly isPackaged?: boolean
}

function createTestRuntime(options: TestRuntimeOptions = {}) {
  let session = 0
  const runtime = bootSequence({
    onFatalFailure: options.onFatalFailure,
    rebuildWakeOwner: options.rebuildWakeOwner,
    createRealtimeSessionId: () => `session-${++session}`,
    completeSleepForDemo: options.completeSleepForDemo,
    isPackaged: options.isPackaged,
    createTelemetry: () => ({
      emit() {},
      readPage: () => [],
      flush: async () => {},
      close: async () => {},
    } as never),
    configService: options.configService ?? {
      initialize: options.initialize ?? (async () => ({ active: { wake: options.wake } })),
      read: options.read ?? (async () => ({ active: { wake: options.wake } })),
    } as never,
    resolveModelSettings: options.useRealResolution ? undefined : () => ({
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
    wakeMicrophoneHandoff: options.wakeMicrophoneHandoff,
    dispatchRealtimeRuntimeCommand: options.dispatchRealtimeRuntimeCommand ?? (() => ({
      status: 'success',
      reason: 'runtime_command_delivered',
    })),
    scheduleRealtimeTimer: options.scheduleRealtimeTimer,
    cancelRealtimeTimer: options.cancelRealtimeTimer,
    mockDraftProbe: async () => ({ result: 'mock_passed', reason: 'cause=all_configured_ids_observed' }),
  })
  return runtime
}

async function startRuntime(runtime: ReturnType<typeof createTestRuntime>): Promise<void> {
  await runtime.ready
  const result = await runtime.manualStart()
  expect(result).toEqual({ status: 'success', reason: 'runtime_command_delivered' })
}

afterEach(() => vi.useRealTimers())

describe('Main lifecycle remediation', () => {
  const success = { status: 'success' as const, reason: 'synthetic_ready' }
  async function active(options: TestRuntimeOptions = {}) {
    const runtime = createTestRuntime(options)
    await startRuntime(runtime)
    await runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
    return runtime
  }
  it.each(['failed', 'ignored'] as const)('closes the old renderer after %s rollover before wake acquires', async status => {
    const calls: string[] = []
    const runtime = await active({ wakeMicrophoneHandoff: {
      release: async () => success, acquire: async () => { calls.push('wake_acquire'); return success },
    }, dispatchRealtimeRuntimeCommand: command => { calls.push(command.operation); return { status: 'success', reason: 'runtime_command_delivered' } } })
    await runtime.rolloverAtSafeBoundary()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'rollover', status, reason: 'rollover_setup_failed' })
    expect(runtime.snapshot().lifecycle).toBe('suspending')
    expect(calls).toEqual(['start', 'rollover', 'stop'])
    await runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'ignored', reason: 'stop_no_active_session' })
    expect(calls).toEqual(['start', 'rollover', 'stop', 'wake_acquire'])
    expect(runtime.snapshot().lifecycle).toBe('offlineLoop')
    expect(runtime.snapshot().realtimeSessionId).toBeNull()
    await runtime.shutdown()
  })
  it('clears renderer authority and playback timers, then waits for replacement readiness', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn(), acquire = vi.fn(async () => success)
    const runtime = await active({ onFatalFailure: fatal, wakeMicrophoneHandoff: { release: async () => success, acquire } })
    runtime.noteRealtimeActivity('assistant_playback_started', runtime.snapshot().realtimeSessionId!)
    runtime.handleMirrorRendererGone()
    expect(runtime.snapshot()).toMatchObject({ lifecycle: 'maintenance', realtimeSessionId: null })
    await expect(runtime.requestRealtimeClientSecret()).rejects.toMatchObject({ code: 'realtime_session_unavailable' })
    expect(acquire).not.toHaveBeenCalled()
    await runtime.handleMirrorRendererReady()
    expect(acquire).toHaveBeenCalledOnce()
    expect(runtime.snapshot().lifecycle).toBe('dormant')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fatal).not.toHaveBeenCalled()
    await runtime.shutdown()
  })
  it('exits through the configured supervisor boundary if renderer readiness never returns', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn(), runtime = await active({ onFatalFailure: fatal })
    runtime.handleMirrorRendererGone()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fatal).toHaveBeenCalledExactlyOnceWith('maintenance_recovery_exhausted')
    await runtime.shutdown()
  })
  it('keeps authority closed when the renderer crashes before boot finishes', async () => {
    vi.useFakeTimers()
    let finishConfig!: (value: unknown) => void
    const acquire = vi.fn(async () => success), fatal = vi.fn()
    const runtime = createTestRuntime({ onFatalFailure: fatal,
      initialize: () => new Promise(resolve => { finishConfig = resolve }),
      wakeMicrophoneHandoff: { release: async () => success, acquire } })
    runtime.handleMirrorRendererGone()
    finishConfig({ active: {} })
    await runtime.ready
    expect(runtime.snapshot().lifecycle).toBe('maintenance')
    expect(acquire).not.toHaveBeenCalled()
    await runtime.handleMirrorRendererReady()
    expect(runtime.snapshot().lifecycle).toBe('dormant')
    expect(acquire).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fatal).not.toHaveBeenCalled()
    await runtime.shutdown()
  })
  it('retries an audio owner once after a closed renderer receipt and sends RETRY_STARTUP', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn(), rebuild = vi.fn(async () => success), acquire = vi.fn(async () => success), commands: string[] = []
    const runtime = await active({ onFatalFailure: fatal, rebuildWakeOwner: rebuild,
      wakeMicrophoneHandoff: { release: async () => success, acquire },
      dispatchRealtimeRuntimeCommand: command => { commands.push(command.operation); return { status: 'success', reason: 'runtime_command_delivered' } } })
    const states: string[] = []
    runtime.subscribe(snapshot => states.push(snapshot.lifecycle))
    await runtime.manualStop()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'failed', reason: 'stop_cleanup_failed' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(commands).toEqual(['start', 'stop', 'stop'])
    expect(rebuild).not.toHaveBeenCalled()
    await runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'success', reason: 'stopped' })
    expect(rebuild).toHaveBeenCalledOnce()
    expect(acquire).toHaveBeenCalledOnce()
    expect(states).toContain('starting')
    expect(runtime.snapshot().lifecycle).toBe('dormant')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fatal).not.toHaveBeenCalled()
    await runtime.shutdown()
  })
  it('bounds an unsuccessful owner rebuild and cancels recovery on shutdown', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn(), rebuild = vi.fn(async () => ({ status: 'failed' as const, reason: 'synthetic_failed' }))
    const runtime = await active({ onFatalFailure: fatal, rebuildWakeOwner: rebuild })
    await runtime.manualStop()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'failed', reason: 'stop_cleanup_failed' })
    await vi.advanceTimersByTimeAsync(1000)
    await runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'ignored', reason: 'stop_no_active_session' })
    await vi.advanceTimersByTimeAsync(14_000)
    expect(fatal).toHaveBeenCalledOnce()
    expect(rebuild).toHaveBeenCalledOnce()
    await runtime.shutdown()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fatal).toHaveBeenCalledOnce()
  })
  it('lets a confirmed unowned unavailable wake module degrade after a closed conversation', async () => {
    const runtime = await active({ wakeMicrophoneHandoff: { release: async () => success,
      acquire: async () => ({ status: 'degraded', reason: 'wake_worker_unavailable' }) } })
    await runtime.setWakeRuntimeStatus('failed', 'wake_worker_unavailable')
    await runtime.manualStop()
    await runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'success', reason: 'stopped' })
    expect(runtime.snapshot()).toMatchObject({ lifecycle: 'dormant', modules: { wake: 'failed' } })
    await runtime.shutdown()
  })
  it('keeps a real acquire failure in Maintenance when cloud recovery timers fire', async () => {
    vi.useFakeTimers()
    const runtime = await active({ wakeMicrophoneHandoff: { release: async () => success,
      acquire: async () => ({ status: 'failed', reason: 'wake_microphone_open_failed' }) } })
    await runtime.handleRealtimeFailure({ kind: 'ice', realtimeSessionId: runtime.snapshot().realtimeSessionId!, reason: 'ice_failed' })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.snapshot().lifecycle).toBe('maintenance')
    await vi.advanceTimersByTimeAsync(61_000)
    expect(runtime.snapshot().lifecycle).toBe('maintenance')
    await runtime.shutdown()
  })
  it('serves published public controls, scenes and model files without Console or disk reads', async () => {
    const config = { wake: { phrase: 'synthetic-wake', modelVersion: 'v1', packageId: 'synthetic-package' },
      spells: [{ phrase: 'synthetic-spell' }], visualAssets: [], musicAssets: [], sceneActions: [], scenes: [], adapters: {},
      avatarCatalog: { activeAvatarId: 'synthetic-avatar', avatars: [{ id: 'synthetic-avatar', sleepPhrase: 'synthetic-sleep',
        spells: [{ phrase: 'synthetic-avatar-spell' }] }], models: [{ id: 'model-test', files: ['model.json'] }] } }
    const read = vi.fn(async () => ({ active: config, draft: config, previous: config }))
    const runtime = createTestRuntime({ read, initialize: read })
    await runtime.ready
    const count = read.mock.calls.length
    for (let i = 0; i < 20; i++) {
      expect(runtime.getPublishedControlPhrasesForRuntime()).toEqual(['synthetic-spell', 'synthetic-avatar-spell', 'synthetic-sleep', 'synthetic-wake'])
      expect(runtime.getAvatarModelForRuntime('model-test')?.files).toEqual(['model.json'])
      expect((await runtime.getPublishedSceneConfigForRuntime()).wake.phrase).toBe('synthetic-wake')
    }
    expect(read).toHaveBeenCalledTimes(count)
    await runtime.shutdown()
  })
  it('throws when control phrases are unavailable so the caller cannot extract control evidence', async () => {
    const runtime = createTestRuntime()
    await runtime.ready
    expect(() => runtime.getPublishedControlPhrasesForRuntime()).toThrow('memory_control_phrases_unavailable')
    await runtime.shutdown()
  })
  it('refreshes public caches for draft reads, publish and rollback while controls remain published', async () => {
    const source = JSON.parse(readFileSync('resources/config/default.json', 'utf8')) as MirrorConfig
    source.avatarCatalog = avatarCatalogFor(source)
    const files = new Map<string, string>([['/synthetic-default.json', JSON.stringify(source)]])
    const service = createConfigService({ configDir: '/synthetic-config', defaultConfigPath: '/synthetic-default.json',
      files: { ensureDirectory: async () => {}, readText: async path => files.get(path) ?? null, remove: async path => { files.delete(path) } },
      atomicWriter: { write: async (path, value) => { files.set(path, value) } }, events: { emit() {} } })
    const runtime = createTestRuntime({ configService: service, useRealResolution: true })
    await runtime.ready
    const original = runtime.getPublishedControlPhrasesForRuntime()
    const draft = structuredClone((await service.read()).draft)
    draft.avatarCatalog!.avatars[0]!.sleepPhrase = 'synthetic-new-sleep'
    draft.avatarCatalog!.models.push({ id: 'model-test', name: 'Synthetic', manifestFileName: 'test.model3.json', files: ['test.model3.json'] })
    await service.saveDraft(draft)
    const config = await runtime.console.getConfig()
    expect(config.ok).toBe(true)
    expect(runtime.getPublishedControlPhrasesForRuntime()).toEqual(original)
    expect(runtime.getAvatarModelForRuntime('model-test')?.files).toEqual(['test.model3.json'])
    const confirmation = (diff: ConsoleConfigDiff) => ({ operation: diff.operation, expectedActiveVersion: diff.expectedActiveVersion,
      changedPaths: diff.changed.map(change => change.path).sort(), nonModelChanges: diff.nonModelChanges, confirmationDigest: diff.confirmationDigest })
    expect((await runtime.console.testDraft()).ok).toBe(true)
    if (!config.ok) throw Error('synthetic_config_unavailable')
    const published = await runtime.console.publish(confirmation(config.value.publishDiff))
    expect(published.ok).toBe(true)
    expect(runtime.getPublishedControlPhrasesForRuntime()).toContain('synthetic-new-sleep')
    if (!published.ok) throw Error('synthetic_publish_failed')
    expect((await runtime.console.rollback(confirmation(published.value.rollbackDiff))).ok).toBe(true)
    expect(runtime.getPublishedControlPhrasesForRuntime()).toEqual(original)
    expect(runtime.getAvatarModelForRuntime('model-test')).toBeUndefined()
    await runtime.shutdown()
  })
})

describe('BootRuntime realtime runtime outcome reason', () => {
  it('completes media-requested sleep through the offline simulator without stopping a nonexistent renderer session', async () => {
    const dispatch = vi.fn(() => ({ status: 'success' as const, reason: 'runtime_command_delivered' as const }))
    const runtime = createTestRuntime({ completeSleepForDemo: true, dispatchRealtimeRuntimeCommand: dispatch })
    await runtime.ready
    expect((await runtime.handleSimulator({ type: 'wake' })).op).toBe('success')
    expect(runtime.snapshot().lifecycle).toBe('active')
    expect(await runtime.requestSleep()).toEqual({ status: 'success', reason: 'simulated_sleep_handoff' })
    expect(runtime.snapshot().lifecycle).toBe('dormant')
    expect(runtime.snapshot().realtimeSessionId).toBeNull()
    expect(dispatch).not.toHaveBeenCalled()
    await runtime.shutdown()
  })
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
  it('pauses idle throughout avatar speech, ignores late transcripts, and grants a full interval after playback', async () => {
    vi.useFakeTimers()
    const operations: string[] = []
    const runtime = createTestRuntime({
      dispatchRealtimeRuntimeCommand: (command) => {
        operations.push(command.operation)
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      scheduleRealtimeTimer: (callback, delayMs) => setTimeout(callback, delayMs),
      cancelRealtimeTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    })
    try {
      await startRuntime(runtime)
      runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
      const sessionId = runtime.snapshot().realtimeSessionId!
      await vi.advanceTimersByTimeAsync(299_000)
      runtime.noteRealtimeActivity('assistant_playback_started', sessionId)
      runtime.noteRealtimeActivity('user_turn', sessionId)
      await vi.advanceTimersByTimeAsync(390_000)
      expect(runtime.snapshot().lifecycle).toBe('active')
      expect(operations).toEqual(['start'])
      runtime.noteRealtimeActivity('assistant_playback', 'stale-session')
      await vi.advanceTimersByTimeAsync(301_000)
      expect(operations).toEqual(['start'])
      runtime.noteRealtimeActivity('assistant_playback', sessionId)
      await vi.advanceTimersByTimeAsync(299_999)
      expect(operations).toEqual(['start'])
      await vi.advanceTimersByTimeAsync(1)
      expect(operations).toEqual(['start', 'stop'])
      runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'success', reason: 'stopped' })
      await startRuntime(runtime)
      runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
      runtime.noteRealtimeActivity('assistant_playback_started', sessionId)
      await vi.advanceTimersByTimeAsync(300_000)
      expect(operations).toEqual(['start', 'stop', 'start', 'stop'])
    } finally {
      await runtime.shutdown()
      vi.useRealTimers()
    }
  })

  it('holds idle for scenes and overlapping speech, ignores stale finishes, and resumes the full interval', async () => {
    vi.useFakeTimers()
    const runtime = createTestRuntime({ scheduleRealtimeTimer: (fn, ms) => setTimeout(fn, ms),
      cancelRealtimeTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) })
    try {
      await startRuntime(runtime)
      runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
      const session = runtime.snapshot().realtimeSessionId!
      await vi.advanceTimersByTimeAsync(299_000)
      runtime.noteSceneActivity('started', 'scene-a')
      runtime.noteRealtimeActivity('user_turn', session)
      runtime.noteRealtimeActivity('assistant_playback_started', session)
      runtime.noteRealtimeActivity('assistant_playback', session)
      await vi.advanceTimersByTimeAsync(600_000)
      expect(runtime.snapshot().lifecycle).toBe('active')
      runtime.noteSceneActivity('started', 'scene-b')
      runtime.noteSceneActivity('finished', 'scene-a')
      runtime.noteSceneActivity('finished', 'stale-run')
      await vi.advanceTimersByTimeAsync(301_000)
      expect(runtime.snapshot().lifecycle).toBe('active')
      runtime.noteRealtimeActivity('assistant_playback_started', session)
      runtime.noteSceneActivity('finished', 'scene-b')
      await vi.advanceTimersByTimeAsync(301_000)
      expect(runtime.snapshot().lifecycle).toBe('active')
      runtime.noteRealtimeActivity('assistant_playback', session)
      await vi.advanceTimersByTimeAsync(299_999)
      expect(runtime.snapshot().lifecycle).toBe('active')
      await vi.advanceTimersByTimeAsync(1)
      expect(runtime.snapshot().lifecycle).toBe('suspending')
    } finally { await runtime.shutdown(); vi.useRealTimers() }
  })

  it('owns one resettable configured 300-second Developer Mode idle timer and dispatches idle stop', async () => {
    const timers = new Map<number, { callback: () => void; delayMs: number }>()
    let nextHandle = 0
    const cancelled: number[] = []
    const operations: string[] = []
    const runtime = createTestRuntime({
      scheduleRealtimeTimer: (callback, delayMs) => {
        const handle = ++nextHandle
        timers.set(handle, { callback, delayMs })
        return handle
      },
      cancelRealtimeTimer: (handle) => {
        cancelled.push(handle as number)
        timers.delete(handle as number)
      },
      dispatchRealtimeRuntimeCommand: (command) => {
        operations.push(command.operation)
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
    })

    await runtime.ready
    await runtime.manualStart()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
    const firstIdle = [...timers.entries()].find(([, timer]) => timer.delayMs === 300_000)
    expect(firstIdle).toBeDefined()

    runtime.noteRealtimeActivity('user_turn')
    const activeIdleTimers = [...timers.entries()].filter(([, timer]) => timer.delayMs === 300_000)
    expect(activeIdleTimers).toHaveLength(1)
    expect(cancelled).toContain(firstIdle?.[0])

    activeIdleTimers[0]?.[1].callback()
    await vi.waitFor(() => expect(operations).toEqual(['start', 'stop']))
    expect(runtime.snapshot().lifecycle).toBe('suspending')
  })

  it('keeps the published 300-second idle duration outside Developer Mode', async () => {
    const delays: number[] = []
    const runtime = createTestRuntime({
      isPackaged: true,
      scheduleRealtimeTimer: (_callback, delayMs) => {
        delays.push(delayMs)
        return delays.length
      },
      cancelRealtimeTimer: () => {},
    })

    await runtime.ready
    await runtime.manualStart()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })

    expect(delays).toContain(300_000)
  })

  it('releases wake capture before Realtime start and reacquires only after renderer stop', async () => {
    const calls: string[] = []
    const runtime = createTestRuntime({
      wakeMicrophoneHandoff: {
        release: async () => {
          calls.push('wake_release')
          return { status: 'success', reason: 'wake_microphone_released' }
        },
        acquire: async () => {
          calls.push('wake_acquire')
          return { status: 'success', reason: 'wake_microphone_acquired' }
        },
      },
      dispatchRealtimeRuntimeCommand: (command) => {
        calls.push(`renderer_${command.operation}`)
        return { status: 'success', reason: 'runtime_command_delivered' } as const
      },
    })
    await runtime.ready

    await runtime.manualStart()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
    await runtime.manualStop()
    await runtime.handleRealtimeRuntimeOutcome({ operation: 'stop', status: 'success', reason: 'closed' })

    expect(calls).toEqual(['wake_release', 'renderer_start', 'renderer_stop', 'wake_acquire'])
    expect(runtime.snapshot().lifecycle).toBe('dormant')
  })

  it('enters Maintenance without dispatch when wake microphone release fails', async () => {
    let dispatches = 0
    const runtime = createTestRuntime({
      wakeMicrophoneHandoff: {
        release: async () => ({ status: 'failed', reason: 'wake_worker_unavailable' }),
        acquire: async () => ({ status: 'success', reason: 'wake_microphone_acquired' }),
      },
      dispatchRealtimeRuntimeCommand: () => {
        dispatches += 1
        return { status: 'success', reason: 'runtime_command_delivered' } as const
      },
    })

    const result = await runtime.manualStart()

    expect(result).toEqual({ status: 'failed', reason: 'wake_microphone_release_failed' })
    expect(dispatches).toBe(0)
    expect(runtime.snapshot().lifecycle).toBe('maintenance')
  })

  it('enters Maintenance if wake capture cannot reacquire after renderer stop', async () => {
    const runtime = createTestRuntime({
      wakeMicrophoneHandoff: {
        release: async () => ({ status: 'success', reason: 'wake_microphone_released' }),
        acquire: async () => ({ status: 'failed', reason: 'wake_worker_unavailable' }),
      },
    })
    await runtime.ready
    await runtime.manualStart()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
    await runtime.manualStop()

    const result = await runtime.handleRealtimeRuntimeOutcome({
      operation: 'stop',
      status: 'success',
      reason: 'closed',
    })

    expect(result).toEqual({ status: 'failed', reason: 'wake_microphone_acquire_failed' })
    expect(runtime.snapshot().lifecycle).toBe('maintenance')
  })

  it('does not reacquire wake or enter cloud recovery when renderer cleanup failed', async () => {
    const acquire = vi.fn(async () => ({ status: 'success' as const, reason: 'wake_microphone_acquired' }))
    const runtime = createTestRuntime({ wakeMicrophoneHandoff: {
      release: async () => ({ status: 'success', reason: 'wake_microphone_released' }), acquire,
    } })
    await runtime.ready; await runtime.manualStart()
    runtime.handleRealtimeRuntimeOutcome({ operation: 'start', status: 'success', reason: 'connected' })
    const realtimeSessionId = runtime.snapshot().realtimeSessionId!
    await runtime.handleRealtimeFailure({ kind: 'ice', realtimeSessionId, reason: 'realtime_cleanup_failed' })
    expect(runtime.snapshot().lifecycle).toBe('maintenance')
    expect(acquire).not.toHaveBeenCalled()
  })

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
