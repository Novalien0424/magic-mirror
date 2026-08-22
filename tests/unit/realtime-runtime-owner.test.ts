import { describe, expect, it, vi } from 'vitest'
import type { RealtimeSessionStartBundleValue } from '../../src/shared/bridge'
import {
  createRealtimeRuntimeOwner,
  type RealtimeRuntimeAudioOutput,
  type RealtimeRuntimeCleanup,
  type RealtimeRuntimeOwnerDependencies,
  type RealtimeRuntimeOutcome,
  type RealtimeRuntimeSnapshot,
  type RealtimeRuntimeMicOwner,
  type RealtimeRuntimePlaybackTransport,
  type RealtimeRuntimeSession,
} from '../../src/renderer/realtime/realtime-runtime-owner'

type MutableRealtimeRuntimeOwnerDependencies = {
  -readonly [Key in keyof RealtimeRuntimeOwnerDependencies]: RealtimeRuntimeOwnerDependencies[Key]
}

type Deferred<T> = {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function makeBundle(
  realtimeSessionId = 'runtime-1',
  sessionGeneration = 1,
): Readonly<RealtimeSessionStartBundleValue> {
  return {
    snapshot: {} as RealtimeSessionStartBundleValue['snapshot'],
    identity: Object.freeze({ realtimeSessionId, sessionGeneration }),
    clientSecret: undefined as unknown as RealtimeSessionStartBundleValue['clientSecret'],
  }
}

function makeStream(trackCount = 1): {
  readonly stream: MediaStream
  readonly tracks: readonly { readonly stop: ReturnType<typeof vi.fn> }[]
  readonly getTracks: ReturnType<typeof vi.fn>
} {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }))
  const getTracks = vi.fn(() => tracks)
  return {
    stream: { getTracks } as unknown as MediaStream,
    tracks,
    getTracks,
  }
}

function makeFixture(
  overrides: Partial<{
    readonly stream: MediaStream
    readonly audioOutput: RealtimeRuntimeAudioOutput
    readonly session: RealtimeRuntimeSession
    readonly micOwner: RealtimeRuntimeMicOwner
    readonly playbackTransport: RealtimeRuntimePlaybackTransport
    readonly cleanup: RealtimeRuntimeCleanup
  }> = {},
): {
  readonly dependencies: MutableRealtimeRuntimeOwnerDependencies
  readonly stream: MediaStream
  readonly tracks: readonly { readonly stop: ReturnType<typeof vi.fn> }[]
  readonly audioOutput: { readonly audioElement: HTMLAudioElement; readonly dispose: ReturnType<typeof vi.fn> }
  readonly session: {
    readonly realtimeSessionId: string
    readonly sessionGeneration: number
    readonly connect: ReturnType<typeof vi.fn>
    readonly interrupt: ReturnType<typeof vi.fn>
    readonly close: ReturnType<typeof vi.fn>
    readonly onOutputAudioBufferStopped: ReturnType<typeof vi.fn>
  }
  readonly micOwner: {
    readonly acquire: ReturnType<typeof vi.fn>
    readonly release: ReturnType<typeof vi.fn>
  }
  readonly playbackTransport: { readonly dispose: ReturnType<typeof vi.fn> }
  readonly cleanup: { readonly run: ReturnType<typeof vi.fn> }
  readonly order: string[]
  readonly events: RealtimeRuntimeOutcome[]
} {
  const streamFixture = makeStream()
  const order: string[] = []
  const events: RealtimeRuntimeOutcome[] = []
  const audioOutput = {
    audioElement: {} as HTMLAudioElement,
    dispose: vi.fn(async () => {
      order.push('audio-dispose')
    }),
  }
  const session = {
    realtimeSessionId: 'runtime-1',
    sessionGeneration: 1,
    connect: vi.fn(async () => {
      order.push('connect')
    }),
    interrupt: vi.fn(async () => {
      order.push('interrupt')
    }),
    close: vi.fn(async () => {
      order.push('session-close')
    }),
    onOutputAudioBufferStopped: vi.fn(() => () => {}),
  }
  const micOwner = {
    acquire: vi.fn(async () => {
      order.push('mic-acquire')
    }),
    release: vi.fn(async () => {
      order.push('mic-release')
    }),
  }
  const playbackTransport = {
    dispose: vi.fn(() => {
      order.push('playback-dispose')
    }),
  }
  const cleanup = {
    run: vi.fn(async () => {
      order.push('cleanup')
    }),
  }
  const dependencies: MutableRealtimeRuntimeOwnerDependencies = {
    acquireMediaStream: vi.fn(async () => {
      order.push('stream')
      return overrides.stream ?? streamFixture.stream
    }),
    createAudioOutput: vi.fn(async () => {
      order.push('audio-create')
      return overrides.audioOutput ?? audioOutput
    }),
    createSession: vi.fn(async () => {
      order.push('session-create')
      return overrides.session ?? session
    }),
    createMicOwner: vi.fn(async () => {
      order.push('mic-create')
      return overrides.micOwner ?? micOwner
    }),
    createPlaybackTransport: vi.fn(async () => {
      order.push('playback-create')
      return overrides.playbackTransport ?? playbackTransport
    }),
    createCleanup: vi.fn(async () => {
      order.push('cleanup-create')
      return overrides.cleanup ?? cleanup
    }),
    eventSink: (event) => {
      events.push(event)
    },
  }
  return {
    dependencies,
    stream: streamFixture.stream,
    tracks: streamFixture.tracks,
    audioOutput,
    session,
    micOwner,
    playbackTransport,
    cleanup,
    order,
    events,
  }
}

async function startActive(
  owner: ReturnType<typeof createRealtimeRuntimeOwner>,
  bundle = makeBundle(),
): Promise<RealtimeRuntimeOutcome> {
  const result = await owner.start(bundle)
  expect(result.status).toBe('success')
  expect(owner.getSnapshot().state).toBe('active')
  return result
}

describe('createRealtimeRuntimeOwner', () => {
  it('passes the exact bundle object and constructs one generation in order', async () => {
    const fixture = makeFixture()
    const bundle = makeBundle()
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)

    await owner.start(bundle)

    expect(fixture.dependencies.createSession).toHaveBeenCalledWith(
      bundle,
      fixture.stream,
      fixture.audioOutput.audioElement,
    )
    expect(fixture.order).toEqual([
      'stream',
      'audio-create',
      'session-create',
      'mic-create',
      'mic-acquire',
      'playback-create',
      'cleanup-create',
      'connect',
    ])
    expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)
  })

  it('rejects stale and duplicate generations and never replays a generation', async () => {
    const fixture = makeFixture()
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)

    await owner.start(makeBundle('runtime-1', 2))
    await owner.stop()

    const duplicate = await owner.start(makeBundle('runtime-1', 2))
    const stale = await owner.start(makeBundle('runtime-0', 1))

    expect(duplicate).toMatchObject({ status: 'ignored', reason: 'duplicate_generation' })
    expect(stale).toMatchObject({ status: 'ignored', reason: 'stale_generation' })
    expect(fixture.dependencies.acquireMediaStream).toHaveBeenCalledTimes(1)
  })

  it('shares identical concurrent starts while a different racing start is ignored', async () => {
    const fixture = makeFixture()
    const gate = deferred<MediaStream>()
    vi.mocked(fixture.dependencies.acquireMediaStream).mockReturnValueOnce(gate.promise)
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    const firstBundle = makeBundle('runtime-1', 1)
    const racingBundle = makeBundle('runtime-2', 2)

    const first = owner.start(firstBundle)
    const identical = owner.start(firstBundle)
    const different = await owner.start(racingBundle)

    expect(identical).toBe(first)
    expect(different).toMatchObject({ status: 'ignored', reason: 'start_in_flight' })
    expect(fixture.dependencies.acquireMediaStream).toHaveBeenCalledTimes(1)
    gate.resolve(fixture.stream)
    await first
  })

  it('cancels a pending start when disposal races acquisition', async () => {
    const fixture = makeFixture()
    const gate = deferred<MediaStream>()
    vi.mocked(fixture.dependencies.acquireMediaStream).mockReturnValueOnce(gate.promise)
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    const startPromise = owner.start(makeBundle())
    const disposePromise = owner.dispose()

    expect(owner.getSnapshot()).toEqual({
      state: 'stopping',
      currentIdentity: { realtimeSessionId: 'runtime-1', sessionGeneration: 1 },
    })
    expect(owner.dispose()).toBe(disposePromise)
    expect(fixture.dependencies.createAudioOutput).not.toHaveBeenCalled()
    expect(fixture.dependencies.createSession).not.toHaveBeenCalled()
    expect(fixture.dependencies.createMicOwner).not.toHaveBeenCalled()
    expect(fixture.dependencies.createPlaybackTransport).not.toHaveBeenCalled()
    expect(fixture.dependencies.createCleanup).not.toHaveBeenCalled()

    gate.resolve(fixture.stream)
    const [startResult, disposeResult] = await Promise.all([startPromise, disposePromise])

    expect(startResult).toMatchObject({
      status: 'failed',
      operation: 'start',
      reason: 'start_failed',
      cleanup: 'attempted',
    })
    expect(disposeResult).toMatchObject({
      status: 'success',
      operation: 'dispose',
      reason: 'disposed',
    })
    expect(fixture.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createAudioOutput).not.toHaveBeenCalled()
    expect(fixture.dependencies.createSession).not.toHaveBeenCalled()
    expect(owner.getSnapshot()).toEqual({ state: 'disposed' })
  })

  it('rejects active and terminal disposed starts synchronously without factories', async () => {
    const fixture = makeFixture()
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const active = await owner.start(makeBundle('runtime-2', 2))
    expect(active).toMatchObject({ status: 'ignored', reason: 'active' })

    await owner.dispose()
    const disposed = await owner.start(makeBundle('runtime-3', 3))
    expect(disposed).toMatchObject({ status: 'ignored', reason: 'already_disposed' })
    expect(fixture.dependencies.acquireMediaStream).toHaveBeenCalledTimes(1)
  })

  it('marks the active identity inactive before stop awaits and continues every stage in order', async () => {
    const fixture = makeFixture()
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const stopPromise = owner.stop('offline_loop')
    expect(owner.getSnapshot()).toEqual({
      state: 'stopping',
      currentIdentity: { realtimeSessionId: 'runtime-1', sessionGeneration: 1 },
    })
    const result = await stopPromise

    expect(result).toMatchObject({ status: 'success', operation: 'stop', reason: 'stopped', cleanup: 'attempted' })
    expect(fixture.order.slice(-4)).toEqual([
      'playback-dispose',
      'audio-dispose',
      'mic-release',
      'cleanup',
    ])
    expect(fixture.session.close).not.toHaveBeenCalled()
    expect(owner.getSnapshot()).toEqual({ state: 'idle' })
  })

  it('shares identical concurrent stops while cleanup is pending', async () => {
    const fixture = makeFixture()
    const playbackGate = deferred<void>()
    fixture.playbackTransport.dispose.mockImplementationOnce(() => playbackGate.promise)
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const first = owner.stop()
    const identical = owner.stop()

    expect(identical).toBe(first)
    expect(fixture.playbackTransport.dispose).toHaveBeenCalledTimes(1)

    playbackGate.resolve()
    const result = await first

    expect(result).toMatchObject({
      status: 'success',
      operation: 'stop',
      reason: 'stopped',
      cleanup: 'attempted',
    })
    expect(fixture.playbackTransport.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.audioOutput.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.cleanup.run).toHaveBeenCalledTimes(1)
    expect(owner.getSnapshot()).toEqual({ state: 'idle' })
  })

  it('shares cleanup when disposal races an in-flight stop', async () => {
    const fixture = makeFixture()
    const playbackGate = deferred<void>()
    fixture.playbackTransport.dispose.mockImplementationOnce(() => playbackGate.promise)
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const stopPromise = owner.stop()
    const disposePromise = owner.dispose()

    expect(fixture.playbackTransport.dispose).toHaveBeenCalledTimes(1)

    playbackGate.resolve()
    const [stopResult, disposeResult] = await Promise.all([stopPromise, disposePromise])

    expect(stopResult).toMatchObject({
      status: 'success',
      operation: 'stop',
      reason: 'stopped',
    })
    expect(disposeResult).toMatchObject({
      status: 'success',
      operation: 'dispose',
      reason: 'disposed',
    })
    expect(fixture.playbackTransport.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.audioOutput.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.cleanup.run).toHaveBeenCalledTimes(1)
    expect(owner.getSnapshot()).toEqual({ state: 'disposed' })
  })

  it('interrupts only the active session and never performs cleanup or changes state', async () => {
    const fixture = makeFixture()
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const result = await owner.interrupt()

    expect(result).toMatchObject({ status: 'success', operation: 'interrupt', reason: 'interrupted' })
    expect(fixture.session.interrupt).toHaveBeenCalledTimes(1)
    expect(fixture.playbackTransport.dispose).not.toHaveBeenCalled()
    expect(fixture.audioOutput.dispose).not.toHaveBeenCalled()
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.cleanup.run).not.toHaveBeenCalled()
    expect(owner.getSnapshot().state).toBe('active')

    await owner.stop()
    const ignored = await owner.interrupt()
    expect(ignored).toMatchObject({ status: 'ignored', reason: 'not_active' })
  })

  it('returns a failed interrupt without cleanup or lifecycle mutation', async () => {
    const fixture = makeFixture()
    fixture.session.interrupt.mockRejectedValueOnce(new Error('opaque'))
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const result = await owner.interrupt()

    expect(result).toMatchObject({ status: 'failed', operation: 'interrupt', reason: 'interrupt_failed' })
    expect(result).not.toHaveProperty('error')
    expect(owner.getSnapshot().state).toBe('active')
    expect(fixture.cleanup.run).not.toHaveBeenCalled()
  })

  it('continues stop after failures and retries only failed stages', async () => {
    const fixture = makeFixture()
    fixture.playbackTransport.dispose.mockRejectedValueOnce(new Error('opaque'))
    fixture.audioOutput.dispose.mockRejectedValueOnce(new Error('opaque'))
    fixture.micOwner.release.mockRejectedValueOnce(new Error('opaque'))
    fixture.cleanup.run.mockRejectedValueOnce(new Error('opaque'))
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const failed = await owner.stop()

    expect(failed.status).toBe('failed')
    expect(failed).toMatchObject({ operation: 'stop', reason: 'stop_failed', cleanup: 'attempted' })
    expect(fixture.playbackTransport.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.audioOutput.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.cleanup.run).toHaveBeenCalledTimes(1)
    expect(owner.getSnapshot().state).toBe('stopping')

    const retry = await owner.stop('close')

    expect(retry.status).toBe('success')
    expect(fixture.playbackTransport.dispose).toHaveBeenCalledTimes(2)
    expect(fixture.audioOutput.dispose).toHaveBeenCalledTimes(2)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(2)
    expect(fixture.cleanup.run).toHaveBeenCalledTimes(2)
    expect(retry.attemptedSteps).toEqual([
      'playback_dispose',
      'audio_output_dispose',
      'mic_release',
      'cleanup_run',
    ])
    expect(owner.getSnapshot().state).toBe('idle')
  })

  it('closes a non-acquired session and stops loose tracks without double-closing', async () => {
    const fixture = makeFixture()
    const micOwner = {
      acquire: vi.fn(async () => {
        throw new Error('opaque')
      }),
      release: vi.fn(async () => {}),
    }
    const owner = createRealtimeRuntimeOwner({
      ...fixture.dependencies,
      createMicOwner: vi.fn(async () => micOwner),
    })

    const result = await owner.start(makeBundle())

    expect(result.status).toBe('failed')
    expect(fixture.session.close).toHaveBeenCalledTimes(1)
    expect(micOwner.release).not.toHaveBeenCalled()
    expect(fixture.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(fixture.cleanup.run).toHaveBeenCalledWith('close')
    expect(owner.getSnapshot().state).toBe('idle')
  })

  it('preserves loose-stream progress and retries only unfinished track cleanup', async () => {
    const fixture = makeFixture()
    const secondTrack = { stop: vi.fn() }
    const tracks = [fixture.tracks[0], secondTrack]
    fixture.dependencies.acquireMediaStream = vi.fn(async () => ({
      getTracks: vi.fn(() => tracks),
    } as unknown as MediaStream))
    fixture.session.close.mockRejectedValueOnce(new Error('opaque'))
    const owner = createRealtimeRuntimeOwner({
      ...fixture.dependencies,
      createMicOwner: vi.fn(async () => ({
        acquire: vi.fn(async () => {
          throw new Error('opaque')
        }),
        release: vi.fn(async () => {}),
      })),
    })

    const failed = await owner.start(makeBundle())
    expect(failed.status).toBe('failed')
    expect(fixture.session.close).toHaveBeenCalledTimes(1)

    const retry = await owner.stop()
    expect(retry.status).toBe('success')
    expect(fixture.session.close).toHaveBeenCalledTimes(2)
    expect(fixture.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(secondTrack.stop).toHaveBeenCalledTimes(1)
  })

  it('reports RAM cleanup as attempted and isolates event-sink failures', async () => {
    const fixture = makeFixture()
    fixture.dependencies.eventSink = () => {
      throw new Error('opaque')
    }
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const result = await owner.stop()

    expect(result).toMatchObject({ status: 'success', cleanup: 'attempted' })
    expect(result).not.toHaveProperty('cleanupSucceeded')
    expect(result).not.toHaveProperty('bundle')
    expect(result).not.toHaveProperty('clientSecret')
    expect(result).not.toHaveProperty('snapshot')
    expect(result).not.toHaveProperty('session')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.attemptedSteps)).toBe(true)
    expect(Object.isFrozen(result.failedSteps)).toBe(true)
  })

  it('retries failed disposal and becomes terminal, while repeated disposal is idempotently ignored', async () => {
    const fixture = makeFixture()
    fixture.audioOutput.dispose.mockRejectedValueOnce(new Error('opaque'))
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)
    await startActive(owner)

    const failed = await owner.dispose()
    expect(failed).toMatchObject({ status: 'failed', operation: 'dispose', reason: 'dispose_failed' })
    expect(owner.getSnapshot().state).toBe('stopping')

    const disposed = await owner.dispose()
    expect(disposed).toMatchObject({ status: 'success', operation: 'dispose', reason: 'disposed' })
    expect(owner.getSnapshot()).toEqual({ state: 'disposed' })
    expect(fixture.audioOutput.dispose).toHaveBeenCalledTimes(2)

    const repeat = await owner.dispose()
    expect(repeat).toMatchObject({ status: 'ignored', reason: 'already_disposed' })
    expect(fixture.audioOutput.dispose).toHaveBeenCalledTimes(2)
  })

  it('disposes idle owners terminally and freezes metadata snapshots', async () => {
    const fixture = makeFixture()
    const owner = createRealtimeRuntimeOwner(fixture.dependencies)

    const result = await owner.dispose()
    const snapshot: RealtimeRuntimeSnapshot = owner.getSnapshot()

    expect(result).toMatchObject({ status: 'success', operation: 'dispose', reason: 'disposed' })
    expect(snapshot).toEqual({ state: 'disposed' })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(fixture.dependencies.acquireMediaStream).not.toHaveBeenCalled()
  })
})
