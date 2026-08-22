import { describe, expect, it, vi } from 'vitest'
import type { RealtimeSessionStartBundleValue } from '../../src/shared/bridge'
import type { PlaybackCompletionResult } from '../../src/renderer/realtime/playback-completion'
import {
  createRealtimeRuntimeOwner,
  type RealtimeRuntimeAudioOutput,
  type RealtimeRuntimeCleanup,
  type RealtimeRuntimeMicOwner,
  type RealtimeRuntimeOutcome,
  type RealtimeRuntimeOwnerDependencies,
  type RealtimeRuntimePlaybackCompletion,
  type RealtimeRuntimePlaybackTransport,
  type RealtimeRuntimeSession,
} from '../../src/renderer/realtime/realtime-runtime-owner'

type Deferred<T> = {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

type SliceAAudioOutput = RealtimeRuntimeAudioOutput & {
  readonly analyser: NonNullable<RealtimeRuntimeAudioOutput['analyser']>
}

type SliceAMicOwner = RealtimeRuntimeMicOwner & {
  readonly rollover: NonNullable<RealtimeRuntimeMicOwner['rollover']>
}

type SliceADependencies = Omit<
  RealtimeRuntimeOwnerDependencies,
  'createAudioOutput' | 'createMicOwner' | 'createPlaybackCompletion'
> & {
  readonly createAudioOutput: () => Promise<SliceAAudioOutput>
  readonly createMicOwner: () => Promise<SliceAMicOwner>
  readonly createPlaybackCompletion: NonNullable<
    RealtimeRuntimeOwnerDependencies['createPlaybackCompletion']
  >
}

type CleanupTarget = Parameters<RealtimeRuntimeOwnerDependencies['createCleanup']>[0]

type LabeledAudioOutput = SliceAAudioOutput & { readonly label: string }
type LabeledSession = RealtimeRuntimeSession & { readonly label: string }
type LabeledPlayback = RealtimeRuntimePlaybackTransport & { readonly label: string }
type LabeledCleanup = RealtimeRuntimeCleanup & { readonly label: string }

function makeBundle(
  realtimeSessionId: string,
  sessionGeneration: number,
): Readonly<RealtimeSessionStartBundleValue> {
  return Object.freeze({
    snapshot: Object.freeze({}) as RealtimeSessionStartBundleValue['snapshot'],
    identity: Object.freeze({ realtimeSessionId, sessionGeneration }),
    clientSecret: undefined as unknown as RealtimeSessionStartBundleValue['clientSecret'],
  })
}

function makeStream(): {
  readonly stream: MediaStream
  readonly track: { readonly stop: ReturnType<typeof vi.fn> }
} {
  const track = { stop: vi.fn() }
  const getTracks = vi.fn(() => [track])
  return {
    stream: { getTracks } as unknown as MediaStream,
    track,
  }
}

function makeAudioOutput(
  label: string,
  order: string[],
): LabeledAudioOutput {
  return {
    label,
    audioElement: {} as HTMLAudioElement,
    analyser: { readPeakLevel: vi.fn(() => 0) },
    dispose: vi.fn(async () => {
      order.push(`${label}-audio-dispose`)
    }),
  }
}

function makeSession(label: string, generation: number, order: string[]): LabeledSession {
  return {
    label,
    realtimeSessionId: `runtime-${generation}`,
    sessionGeneration: generation,
    connect: vi.fn(async () => {
      order.push(`${label}-connect`)
    }),
    interrupt: vi.fn(async () => {}),
    close: vi.fn(async () => {
      order.push(`${label}-session-close`)
    }),
    onOutputAudioBufferStopped: vi.fn(() => () => {}),
  }
}

function makePlayback(label: string, order: string[]): LabeledPlayback {
  return {
    label,
    dispose: vi.fn(async () => {
      order.push(`${label}-playback-dispose`)
    }),
  }
}

function makeCleanup(label: string, order: string[]): LabeledCleanup {
  return {
    label,
    run: vi.fn(async (boundary) => {
      order.push(`${label}-cleanup-${boundary}`)
    }),
  }
}

function makeFixture(): {
  readonly dependencies: SliceADependencies
  readonly owner: ReturnType<typeof createRealtimeRuntimeOwner>
  readonly bundle1: Readonly<RealtimeSessionStartBundleValue>
  readonly stream: MediaStream
  readonly track: { readonly stop: ReturnType<typeof vi.fn> }
  readonly oldAudio: LabeledAudioOutput
  readonly nextAudio: LabeledAudioOutput
  readonly futureAudio: LabeledAudioOutput
  readonly oldSession: LabeledSession
  readonly nextSession: LabeledSession
  readonly futureSession: LabeledSession
  readonly oldPlayback: LabeledPlayback
  readonly nextPlayback: LabeledPlayback
  readonly futurePlayback: LabeledPlayback
  readonly oldCleanup: LabeledCleanup
  readonly nextCleanup: LabeledCleanup
  readonly futureCleanup: LabeledCleanup
  readonly micOwner: SliceAMicOwner
  readonly oldCompletionGate: Deferred<PlaybackCompletionResult>
  readonly nextCompletionGate: Deferred<PlaybackCompletionResult>
  readonly micRolloverGates: readonly Deferred<void>[]
  readonly micRolloverStarted: readonly Deferred<void>[]
  readonly order: string[]
  readonly events: RealtimeRuntimeOutcome[]
  readonly sessionCalls: readonly {
    readonly bundle: Readonly<RealtimeSessionStartBundleValue>
    readonly stream: MediaStream
    readonly audioElement: HTMLAudioElement
  }[]
  readonly playbackCalls: readonly RealtimeRuntimeSession[]
  readonly cleanupCalls: readonly CleanupTarget[]
  readonly completionCalls: readonly {
    readonly playback: RealtimeRuntimePlaybackTransport
    readonly analyser: object
  }[]
} {
  const order: string[] = []
  const events: RealtimeRuntimeOutcome[] = []
  const streamFixture = makeStream()
  const oldAudio = makeAudioOutput('old', order)
  const nextAudio = makeAudioOutput('next', order)
  const futureAudio = makeAudioOutput('future', order)
  const oldSession = makeSession('old', 1, order)
  const nextSession = makeSession('next', 2, order)
  const futureSession = makeSession('future', 3, order)
  const oldPlayback = makePlayback('old', order)
  const nextPlayback = makePlayback('next', order)
  const futurePlayback = makePlayback('future', order)
  const oldCleanup = makeCleanup('old', order)
  const nextCleanup = makeCleanup('next', order)
  const futureCleanup = makeCleanup('future', order)
  const oldCompletionGate = deferred<PlaybackCompletionResult>()
  const nextCompletionGate = deferred<PlaybackCompletionResult>()
  const completionGates = new Map<RealtimeRuntimePlaybackTransport, Deferred<PlaybackCompletionResult>>([
    [oldPlayback, oldCompletionGate],
    [nextPlayback, nextCompletionGate],
  ])
  const micRolloverGates = [deferred<void>(), deferred<void>()]
  const micRolloverStarted = [deferred<void>(), deferred<void>()]
  const sessionCalls: {
    bundle: Readonly<RealtimeSessionStartBundleValue>
    stream: MediaStream
    audioElement: HTMLAudioElement
  }[] = []
  const playbackCalls: RealtimeRuntimeSession[] = []
  const cleanupCalls: CleanupTarget[] = []
  const completionCalls: {
    playback: RealtimeRuntimePlaybackTransport
    analyser: object
  }[] = []
  let audioIndex = 0
  let sessionIndex = 0
  let playbackIndex = 0
  let cleanupIndex = 0
  let micRolloverIndex = 0
  const audioOutputs = [oldAudio, nextAudio, futureAudio]
  const sessions = [oldSession, nextSession, futureSession]
  const playbacks = [oldPlayback, nextPlayback, futurePlayback]
  const cleanups = [oldCleanup, nextCleanup, futureCleanup]

  const micOwner: SliceAMicOwner = {
    acquire: vi.fn(async () => {
      order.push('mic-acquire')
    }),
    rollover: vi.fn(async () => {
      const index = micRolloverIndex
      micRolloverIndex += 1
      order.push('mic-rollover')
      micRolloverStarted[index].resolve()
      await micRolloverGates[index].promise
      return streamFixture.stream
    }),
    release: vi.fn(async () => {
      order.push('mic-release')
    }),
  }

  const dependencies: SliceADependencies = {
    acquireMediaStream: vi.fn(async () => {
      order.push('acquire-stream')
      return streamFixture.stream
    }),
    createAudioOutput: vi.fn(async () => {
      const output = audioOutputs[audioIndex]
      audioIndex += 1
      order.push(`${output.label}-audio-create`)
      return output
    }),
    createSession: vi.fn(async (bundle, stream, audioElement) => {
      sessionCalls.push({ bundle, stream, audioElement })
      const session = sessions[sessionIndex]
      sessionIndex += 1
      order.push(`${session.label}-session-create`)
      return session
    }),
    createMicOwner: vi.fn(async () => micOwner),
    createPlaybackTransport: vi.fn(async (session) => {
      playbackCalls.push(session)
      const playback = playbacks[playbackIndex]
      playbackIndex += 1
      order.push(`${playback.label}-playback-create`)
      return playback
    }),
    createPlaybackCompletion: vi.fn((playback, analyser) => {
      completionCalls.push({ playback, analyser })
      const gate = completionGates.get(playback)
      if (gate === undefined) {
        throw new Error('missing completion gate')
      }
      const waiter: RealtimeRuntimePlaybackCompletion = {
        waitForActualEnd: vi.fn(() => gate.promise),
      }
      return waiter
    }),
    createCleanup: vi.fn(async (session) => {
      cleanupCalls.push(session)
      const cleanup = cleanups[cleanupIndex]
      cleanupIndex += 1
      order.push(`${cleanup.label}-cleanup-create`)
      return cleanup
    }),
    eventSink: vi.fn((outcome) => {
      events.push(outcome)
      if (outcome.status !== 'ignored') {
        order.push('publish')
      }
    }),
  }
  const owner = createRealtimeRuntimeOwner(dependencies)

  return {
    dependencies,
    owner,
    bundle1: makeBundle('runtime-1', 1),
    stream: streamFixture.stream,
    track: streamFixture.track,
    oldAudio,
    nextAudio,
    futureAudio,
    oldSession,
    nextSession,
    futureSession,
    oldPlayback,
    nextPlayback,
    futurePlayback,
    oldCleanup,
    nextCleanup,
    futureCleanup,
    micOwner,
    oldCompletionGate,
    nextCompletionGate,
    micRolloverGates,
    micRolloverStarted,
    order,
    events,
    sessionCalls,
    playbackCalls,
    cleanupCalls,
    completionCalls,
  }
}

async function startActive(fixture: ReturnType<typeof makeFixture>): Promise<void> {
  const result = await fixture.owner.start(fixture.bundle1)
  expect(result.status).toBe('success')
  fixture.order.splice(0)
  fixture.events.splice(0)
}

function expectFrozenMetadataOutcome(outcome: RealtimeRuntimeOutcome): void {
  expect(Object.isFrozen(outcome)).toBe(true)
  for (const field of ['bundle', 'clientSecret', 'snapshot', 'session', 'stream']) {
    expect(outcome).not.toHaveProperty(field)
  }
}

function makeAbortAwarePlaybackCompletion(
  waitStarted: Deferred<AbortSignal>,
  abortObserved: Deferred<void>,
): RealtimeRuntimePlaybackCompletion {
  return {
    waitForActualEnd: vi.fn(
      (signal: AbortSignal) =>
        new Promise<PlaybackCompletionResult>((_resolve, reject) => {
          waitStarted.resolve(signal)
          const rejectWithAbort = (): void => {
            abortObserved.resolve()
            const error = new Error()
            error.name = 'AbortError'
            reject(error)
          }
          if (signal.aborted) {
            rejectWithAbort()
            return
          }
          signal.addEventListener('abort', rejectWithAbort, { once: true })
        }),
    ),
  }
}

describe('createRealtimeRuntimeOwner rollover Slice A', () => {
  it('waits for actual output, shares concurrent identity, and rolls over on the same stream', async () => {
    const fixture = makeFixture()
    const bundle2 = makeBundle('runtime-2', 2)
    await startActive(fixture)

    const rolloverPromise = fixture.owner.rollover(bundle2)
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'rolling_over',
      currentIdentity: fixture.bundle1.identity,
    })

    const sameIdentity = fixture.owner.rollover(makeBundle('runtime-2', 2))
    expect(sameIdentity).toBe(rolloverPromise)

    const racing = (await fixture.owner.rollover(makeBundle('runtime-3', 3))) as RealtimeRuntimeOutcome
    expectFrozenMetadataOutcome(racing)
    expect(racing).toMatchObject({
      status: 'ignored',
      operation: 'rollover',
      reason: 'rollover_in_flight',
    })
    expect(fixture.dependencies.createAudioOutput).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createPlaybackTransport).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)
    expect(fixture.oldSession.connect).toHaveBeenCalledTimes(1)
    expect(fixture.oldPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.oldAudio.dispose).not.toHaveBeenCalled()
    expect(fixture.micOwner.rollover).not.toHaveBeenCalled()

    expect(fixture.dependencies.createPlaybackCompletion).toHaveBeenCalledWith(
      fixture.oldPlayback,
      fixture.oldAudio.analyser,
    )
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    await fixture.micRolloverStarted[0].promise

    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.order).toEqual([
      'next-audio-create',
      'next-session-create',
      'next-playback-create',
      'next-cleanup-create',
      'mic-rollover',
    ])

    fixture.micRolloverGates[0].resolve()
    const result = (await rolloverPromise) as RealtimeRuntimeOutcome
    expect(result).toMatchObject({
      status: 'success',
      operation: 'rollover',
      reason: 'rolled_over',
      playbackSource: 'output_audio_buffer.stopped',
    })
    expect(result.playbackReason).toBeUndefined()
    expectFrozenMetadataOutcome(result)
    expect(fixture.order).toEqual([
      'next-audio-create',
      'next-session-create',
      'next-playback-create',
      'next-cleanup-create',
      'mic-rollover',
      'old-playback-dispose',
      'old-audio-dispose',
      'old-cleanup-rollover',
      'next-connect',
      'publish',
    ])
    expect(fixture.sessionCalls[1]).toEqual({
      bundle: bundle2,
      stream: fixture.stream,
      audioElement: fixture.nextAudio.audioElement,
    })
    expect(fixture.sessionCalls[1].bundle).toBe(bundle2)
    expect(fixture.playbackCalls[1]).toBe(fixture.nextSession)
    expect(fixture.cleanupCalls[1]).toBe(fixture.nextSession)
    expect(fixture.nextSession.connect).toHaveBeenCalledTimes(1)
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'active',
      currentIdentity: bundle2.identity,
    })
    expect(fixture.dependencies.acquireMediaStream).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.acquire).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
  })

  it('completes with bounded analyser fallback and publishes the degraded metadata outcome', async () => {
    const fixture = makeFixture()
    await startActive(fixture)

    const rolloverPromise = fixture.owner.rollover(makeBundle('runtime-2', 2))
    expect(fixture.owner.getSnapshot().state).toBe('rolling_over')
    expect(fixture.dependencies.createAudioOutput).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createPlaybackTransport).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.rollover).not.toHaveBeenCalled()

    fixture.oldCompletionGate.resolve({
      source: 'bounded_analyser_fallback',
      reason: 'tail_silence_detected',
    })
    await fixture.micRolloverStarted[0].promise
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    fixture.micRolloverGates[0].resolve()

    const result = (await rolloverPromise) as RealtimeRuntimeOutcome
    expect(result).toMatchObject({
      status: 'degraded',
      operation: 'rollover',
      reason: 'rolled_over_with_fallback',
      playbackSource: 'bounded_analyser_fallback',
      playbackReason: 'tail_silence_detected',
    })
    expectFrozenMetadataOutcome(result)
    expect(fixture.events).toEqual([result])
    expect(fixture.oldPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledWith('rollover')
    expect(fixture.nextSession.connect).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.acquireMediaStream).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.acquire).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
  })

  it('rejects settled generations without work while allowing a higher future generation', async () => {
    const fixture = makeFixture()
    await startActive(fixture)

    const generation2 = fixture.owner.rollover(makeBundle('runtime-2', 2))
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    await fixture.micRolloverStarted[0].promise
    fixture.micRolloverGates[0].resolve()
    await generation2

    const completionCallsAfterGeneration2 = fixture.completionCalls.length
    const audioCallsAfterGeneration2 = fixture.dependencies.createAudioOutput
    const sessionCallsAfterGeneration2 = fixture.dependencies.createSession
    const playbackCallsAfterGeneration2 = fixture.dependencies.createPlaybackTransport
    const cleanupCallsAfterGeneration2 = fixture.dependencies.createCleanup

    const duplicate = (await fixture.owner.rollover(makeBundle('runtime-2', 2))) as RealtimeRuntimeOutcome
    const stale = (await fixture.owner.rollover(makeBundle('runtime-1', 1))) as RealtimeRuntimeOutcome
    expectFrozenMetadataOutcome(duplicate)
    expectFrozenMetadataOutcome(stale)
    expect(duplicate).toMatchObject({
      status: 'ignored',
      operation: 'rollover',
      reason: 'duplicate_generation',
    })
    expect(stale).toMatchObject({
      status: 'ignored',
      operation: 'rollover',
      reason: 'stale_generation',
    })
    expect(fixture.completionCalls).toHaveLength(completionCallsAfterGeneration2)
    expect(audioCallsAfterGeneration2).toHaveBeenCalledTimes(2)
    expect(sessionCallsAfterGeneration2).toHaveBeenCalledTimes(2)
    expect(playbackCallsAfterGeneration2).toHaveBeenCalledTimes(2)
    expect(cleanupCallsAfterGeneration2).toHaveBeenCalledTimes(2)

    const higher = fixture.owner.rollover(makeBundle('runtime-3', 3))
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'rolling_over',
      currentIdentity: {
        realtimeSessionId: 'runtime-2',
        sessionGeneration: 2,
      },
    })
    fixture.nextCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    await fixture.micRolloverStarted[1].promise
    expect(fixture.completionCalls.length).toBeGreaterThan(completionCallsAfterGeneration2)
    fixture.micRolloverGates[1].resolve()
    const futureResult = (await higher) as RealtimeRuntimeOutcome
    expect(futureResult).toMatchObject({
      status: 'success',
      operation: 'rollover',
      reason: 'rolled_over',
      playbackSource: 'output_audio_buffer.stopped',
    })
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'active',
      currentIdentity: {
        realtimeSessionId: 'runtime-3',
        sessionGeneration: 3,
      },
    })
  })

  it('restores the old owner when playback completion rejects before preparation', async () => {
    const fixture = makeFixture()
    const bundle2 = makeBundle('runtime-2', 2)
    await startActive(fixture)

    vi.mocked(fixture.dependencies.createPlaybackCompletion).mockImplementationOnce(() => ({
      waitForActualEnd: vi.fn(async () => {
        throw new Error('opaque playback wait failure')
      }),
    }))

    const result = (await fixture.owner.rollover(bundle2)) as RealtimeRuntimeOutcome

    expect(result).toEqual({
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_playback_failed',
      attemptedSteps: [],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(result)
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'active',
      currentIdentity: fixture.bundle1.identity,
    })
    expect(fixture.dependencies.createPlaybackCompletion).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createAudioOutput).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createPlaybackTransport).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.rollover).not.toHaveBeenCalled()
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.oldPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.oldAudio.dispose).not.toHaveBeenCalled()
    expect(fixture.oldCleanup.run).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()

    const duplicate = (await fixture.owner.rollover(bundle2)) as RealtimeRuntimeOutcome
    expect(duplicate).toEqual({
      status: 'ignored',
      operation: 'rollover',
      reason: 'duplicate_generation',
      attemptedSteps: [],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(duplicate)
  })

  it('cleans prepared audio and session when next playback creation rejects', async () => {
    const fixture = makeFixture()
    const bundle2 = makeBundle('runtime-2', 2)
    await startActive(fixture)

    vi.mocked(fixture.dependencies.createPlaybackTransport).mockImplementationOnce(async () => {
      fixture.order.push('next-playback-create')
      throw new Error('opaque next playback factory failure')
    })

    const rolloverPromise = fixture.owner.rollover(bundle2)
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    const result = (await rolloverPromise) as RealtimeRuntimeOutcome

    expect(result).toEqual({
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_prepare_failed',
      cleanup: 'attempted',
      attemptedSteps: ['next_audio_output_dispose', 'next_session_close'],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(result)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.close).toHaveBeenCalledWith('rollover_pre_handoff_failed')
    expect(fixture.nextPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.nextCleanup.run).not.toHaveBeenCalled()
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.oldPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.oldAudio.dispose).not.toHaveBeenCalled()
    expect(fixture.oldCleanup.run).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.micOwner.rollover).not.toHaveBeenCalled()
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.dependencies.acquireMediaStream).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.acquire).toHaveBeenCalledTimes(1)
    expect(fixture.track.stop).not.toHaveBeenCalled()
    expect(fixture.order).toEqual([
      'next-audio-create',
      'next-session-create',
      'next-playback-create',
      'next-audio-dispose',
      'next-session-close',
      'publish',
    ])
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'active',
      currentIdentity: fixture.bundle1.identity,
    })

    const duplicate = (await fixture.owner.rollover(bundle2)) as RealtimeRuntimeOutcome
    expect(duplicate).toEqual({
      status: 'ignored',
      operation: 'rollover',
      reason: 'duplicate_generation',
      attemptedSteps: [],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(duplicate)
  })

  it('cleans every prepared next resource when mic rollover rejects before handoff', async () => {
    const fixture = makeFixture()
    const bundle2 = makeBundle('runtime-2', 2)
    await startActive(fixture)

    vi.mocked(fixture.micOwner.rollover).mockRejectedValueOnce(
      new Error('opaque mic handoff failure'),
    )

    const rolloverPromise = fixture.owner.rollover(bundle2)
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    const result = (await rolloverPromise) as RealtimeRuntimeOutcome

    expect(result).toEqual({
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_handoff_failed',
      cleanup: 'attempted',
      attemptedSteps: [
        'next_playback_dispose',
        'next_audio_output_dispose',
        'next_session_close',
        'next_cleanup_run',
      ],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(result)
    expect(fixture.nextPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.close).toHaveBeenCalledWith('rollover_pre_handoff_failed')
    expect(fixture.nextCleanup.run).toHaveBeenCalledWith('close')
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.oldPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.oldAudio.dispose).not.toHaveBeenCalled()
    expect(fixture.oldCleanup.run).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.dependencies.acquireMediaStream).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.acquire).toHaveBeenCalledTimes(1)
    expect(fixture.track.stop).not.toHaveBeenCalled()
    expect(fixture.order).toEqual([
      'next-audio-create',
      'next-session-create',
      'next-playback-create',
      'next-cleanup-create',
      'next-playback-dispose',
      'next-audio-dispose',
      'next-session-close',
      'next-cleanup-close',
      'publish',
    ])
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'active',
      currentIdentity: fixture.bundle1.identity,
    })

    const duplicate = (await fixture.owner.rollover(bundle2)) as RealtimeRuntimeOutcome
    expect(duplicate).toEqual({
      status: 'ignored',
      operation: 'rollover',
      reason: 'duplicate_generation',
      attemptedSteps: [],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(duplicate)
  })

  it.each(['stop', 'dispose'] as const)(
    'C1 aborts the playback wait before %s tears down the old owner',
    async (operation) => {
      const fixture = makeFixture()
      await startActive(fixture)

      const waitStarted = deferred<AbortSignal>()
      const abortObserved = deferred<void>()
      vi.mocked(fixture.dependencies.createPlaybackCompletion).mockImplementationOnce(
        () => makeAbortAwarePlaybackCompletion(waitStarted, abortObserved),
      )

      const rolloverPromise = fixture.owner.rollover(makeBundle('runtime-2', 2))
      const signal = await waitStarted.promise
      expect(signal.aborted).toBe(false)
      expect(fixture.dependencies.createAudioOutput).toHaveBeenCalledTimes(1)
      expect(fixture.dependencies.createSession).toHaveBeenCalledTimes(1)
      expect(fixture.dependencies.createPlaybackTransport).toHaveBeenCalledTimes(1)
      expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)
      expect(fixture.micOwner.rollover).not.toHaveBeenCalled()

      const lifecyclePromise =
        operation === 'stop' ? fixture.owner.stop() : fixture.owner.dispose()
      expect(signal.aborted).toBe(true)
      await abortObserved.promise

      const rolloverResult = (await rolloverPromise) as RealtimeRuntimeOutcome
      const lifecycleResult = (await lifecyclePromise) as RealtimeRuntimeOutcome
      expect(rolloverResult).toEqual({
        status: 'ignored',
        operation: 'rollover',
        reason:
          operation === 'stop'
            ? 'rollover_aborted_by_stop'
            : 'rollover_aborted_by_dispose',
        attemptedSteps: [],
        failedSteps: [],
      })
      expectFrozenMetadataOutcome(rolloverResult)
      expect(fixture.events).toContain(rolloverResult)
      expect(lifecycleResult).toMatchObject({
        status: 'success',
        operation,
        reason: operation === 'stop' ? 'stopped' : 'disposed',
      })
      expectFrozenMetadataOutcome(lifecycleResult)
      expect(fixture.owner.getSnapshot()).toMatchObject({
        state: operation === 'stop' ? 'idle' : 'disposed',
      })

      expect(fixture.dependencies.createAudioOutput).toHaveBeenCalledTimes(1)
      expect(fixture.dependencies.createSession).toHaveBeenCalledTimes(1)
      expect(fixture.dependencies.createPlaybackTransport).toHaveBeenCalledTimes(1)
      expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)
      expect(fixture.micOwner.rollover).not.toHaveBeenCalled()
      expect(fixture.nextPlayback.dispose).not.toHaveBeenCalled()
      expect(fixture.nextAudio.dispose).not.toHaveBeenCalled()
      expect(fixture.nextSession.connect).not.toHaveBeenCalled()
      expect(fixture.nextSession.close).not.toHaveBeenCalled()
      expect(fixture.nextCleanup.run).not.toHaveBeenCalled()
      expect(fixture.oldPlayback.dispose).toHaveBeenCalledTimes(1)
      expect(fixture.oldAudio.dispose).toHaveBeenCalledTimes(1)
      expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
      expect(fixture.oldCleanup.run).toHaveBeenCalledTimes(1)
      expect(fixture.oldCleanup.run).toHaveBeenCalledWith(operation)
      expect(fixture.oldSession.close).not.toHaveBeenCalled()
      expect(fixture.track.stop).not.toHaveBeenCalled()
    },
  )

  it('C1 aborts the playback wait before interrupting the old active session', async () => {
    const fixture = makeFixture()
    await startActive(fixture)

    const waitStarted = deferred<AbortSignal>()
    const abortObserved = deferred<void>()
    vi.mocked(fixture.dependencies.createPlaybackCompletion).mockImplementationOnce(
      () => makeAbortAwarePlaybackCompletion(waitStarted, abortObserved),
    )

    const rolloverPromise = fixture.owner.rollover(makeBundle('runtime-2', 2))
    const signal = await waitStarted.promise
    expect(signal.aborted).toBe(false)
    expect(fixture.dependencies.createAudioOutput).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createPlaybackTransport).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)

    const interruptPromise = fixture.owner.interrupt()
    expect(signal.aborted).toBe(true)
    await abortObserved.promise

    const rolloverResult = (await rolloverPromise) as RealtimeRuntimeOutcome
    const interruptResult = (await interruptPromise) as RealtimeRuntimeOutcome
    expect(rolloverResult).toEqual({
      status: 'ignored',
      operation: 'rollover',
      reason: 'rollover_aborted_by_interrupt',
      attemptedSteps: [],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(rolloverResult)
    expect(fixture.events).toContain(rolloverResult)
    expect(interruptResult).toMatchObject({
      status: 'success',
      operation: 'interrupt',
      reason: 'interrupted',
    })
    expectFrozenMetadataOutcome(interruptResult)
    expect(fixture.oldSession.interrupt).toHaveBeenCalledTimes(1)
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'active',
      currentIdentity: fixture.bundle1.identity,
    })
    expect(fixture.dependencies.createAudioOutput).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createPlaybackTransport).toHaveBeenCalledTimes(1)
    expect(fixture.dependencies.createCleanup).toHaveBeenCalledTimes(1)
    expect(fixture.nextPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.nextAudio.dispose).not.toHaveBeenCalled()
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.nextSession.close).not.toHaveBeenCalled()
    expect(fixture.nextCleanup.run).not.toHaveBeenCalled()
    expect(fixture.oldPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.oldAudio.dispose).not.toHaveBeenCalled()
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.micOwner.rollover).not.toHaveBeenCalled()
    expect(fixture.oldCleanup.run).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
  })

  it('C1 retries only failed pre-handoff cleanup before stop tears down the old owner', async () => {
    const fixture = makeFixture()
    await startActive(fixture)

    vi.mocked(fixture.micOwner.rollover).mockRejectedValueOnce(new Error())
    vi.mocked(fixture.nextPlayback.dispose).mockImplementationOnce(async () => {
      fixture.order.push('next-playback-dispose')
      throw new Error()
    })

    const rolloverPromise = fixture.owner.rollover(makeBundle('runtime-2', 2))
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    const rolloverResult = (await rolloverPromise) as RealtimeRuntimeOutcome
    expect(rolloverResult).toEqual({
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_handoff_failed',
      cleanup: 'attempted',
      attemptedSteps: [
        'next_playback_dispose',
        'next_audio_output_dispose',
        'next_session_close',
        'next_cleanup_run',
      ],
      failedSteps: ['next_playback_dispose'],
    })
    expectFrozenMetadataOutcome(rolloverResult)
    expect(fixture.nextPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.close).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.close).toHaveBeenCalledWith('rollover_pre_handoff_failed')
    expect(fixture.nextCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledWith('close')
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.owner.getSnapshot()).toMatchObject({
      state: 'active',
      currentIdentity: fixture.bundle1.identity,
    })
    expect(fixture.oldPlayback.dispose).not.toHaveBeenCalled()
    expect(fixture.oldAudio.dispose).not.toHaveBeenCalled()
    expect(fixture.micOwner.release).not.toHaveBeenCalled()
    expect(fixture.oldCleanup.run).not.toHaveBeenCalled()

    const stopResult = (await fixture.owner.stop()) as RealtimeRuntimeOutcome
    expect(stopResult).toMatchObject({
      status: 'success',
      operation: 'stop',
      reason: 'stopped',
    })
    expectFrozenMetadataOutcome(stopResult)
    expect(fixture.nextPlayback.dispose).toHaveBeenCalledTimes(2)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.close).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.oldPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledWith('stop')
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
    expect(fixture.order.lastIndexOf('next-playback-dispose')).toBeLessThan(
      fixture.order.lastIndexOf('old-playback-dispose'),
    )
    expect(fixture.owner.getSnapshot()).toMatchObject({ state: 'idle' })
  })

  it('C2 cleans the transferred owner when next connect fails', async () => {
    const fixture = makeFixture()
    await startActive(fixture)

    vi.mocked(fixture.nextSession.connect).mockImplementationOnce(async () => {
      fixture.order.push('next-connect')
      throw new Error()
    })

    const rolloverPromise = fixture.owner.rollover(makeBundle('runtime-2', 2))
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    await fixture.micRolloverStarted[0].promise
    fixture.micRolloverGates[0].resolve()

    const result = (await rolloverPromise) as RealtimeRuntimeOutcome

    expect(result).toEqual({
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_connect_failed',
      cleanup: 'attempted',
      attemptedSteps: [
        'old_playback_dispose',
        'old_audio_output_dispose',
        'old_cleanup_run',
        'next_connect',
        'next_playback_dispose',
        'next_audio_output_dispose',
        'next_mic_release',
        'next_cleanup_run',
      ],
      failedSteps: ['next_connect'],
    })
    expectFrozenMetadataOutcome(result)
    expect(fixture.events).toEqual([result])
    expect(fixture.order).toEqual([
      'next-audio-create',
      'next-session-create',
      'next-playback-create',
      'next-cleanup-create',
      'mic-rollover',
      'old-playback-dispose',
      'old-audio-dispose',
      'old-cleanup-rollover',
      'next-connect',
      'next-playback-dispose',
      'next-audio-dispose',
      'mic-release',
      'next-cleanup-close',
      'publish',
    ])
    expect(fixture.oldPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledWith('rollover')
    expect(fixture.nextSession.connect).toHaveBeenCalledTimes(1)
    expect(fixture.nextPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledWith('close')
    expect(fixture.nextSession.close).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
    expect(fixture.owner.getSnapshot()).toMatchObject({ state: 'idle' })
  })

  it('C2 retains only failed old playback retirement for stop retry', async () => {
    const fixture = makeFixture()
    await startActive(fixture)

    vi.mocked(fixture.oldPlayback.dispose).mockImplementationOnce(async () => {
      fixture.order.push('old-playback-dispose')
      throw new Error()
    })

    const rolloverPromise = fixture.owner.rollover(makeBundle('runtime-2', 2))
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    await fixture.micRolloverStarted[0].promise
    fixture.micRolloverGates[0].resolve()

    const rolloverResult = (await rolloverPromise) as RealtimeRuntimeOutcome

    expect(rolloverResult).toEqual({
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_post_handoff_failed',
      cleanup: 'attempted',
      attemptedSteps: [
        'old_playback_dispose',
        'old_audio_output_dispose',
        'old_cleanup_run',
        'next_playback_dispose',
        'next_audio_output_dispose',
        'next_mic_release',
        'next_cleanup_run',
      ],
      failedSteps: ['old_playback_dispose'],
    })
    expectFrozenMetadataOutcome(rolloverResult)
    expect(fixture.events).toEqual([rolloverResult])
    expect(fixture.order).toEqual([
      'next-audio-create',
      'next-session-create',
      'next-playback-create',
      'next-cleanup-create',
      'mic-rollover',
      'old-playback-dispose',
      'old-audio-dispose',
      'old-cleanup-rollover',
      'next-playback-dispose',
      'next-audio-dispose',
      'mic-release',
      'next-cleanup-close',
      'publish',
    ])
    expect(fixture.oldPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.nextPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledWith('close')
    expect(fixture.nextSession.close).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
    expect(fixture.owner.getSnapshot()).toMatchObject({ state: 'stopping' })

    const stopResult = (await fixture.owner.stop()) as RealtimeRuntimeOutcome

    expect(stopResult).toEqual({
      status: 'success',
      operation: 'stop',
      reason: 'stopped',
      cleanup: 'attempted',
      attemptedSteps: ['old_playback_dispose'],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(stopResult)
    expect(fixture.events).toEqual([rolloverResult, stopResult])
    expect(fixture.oldPlayback.dispose).toHaveBeenCalledTimes(2)
    expect(fixture.oldAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.nextSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
    expect(fixture.owner.getSnapshot()).toMatchObject({ state: 'idle' })
  })

  it('C2 rejects a different rollover stream without direct next teardown', async () => {
    const fixture = makeFixture()
    const mismatchedStream = makeStream()
    await startActive(fixture)

    vi.mocked(fixture.micOwner.rollover).mockImplementationOnce(async () => {
      fixture.order.push('mic-rollover')
      fixture.micRolloverStarted[0].resolve()
      await fixture.micRolloverGates[0].promise
      return mismatchedStream.stream
    })

    const rolloverPromise = fixture.owner.rollover(makeBundle('runtime-2', 2))
    fixture.oldCompletionGate.resolve({ source: 'output_audio_buffer.stopped' })
    await fixture.micRolloverStarted[0].promise
    fixture.micRolloverGates[0].resolve()

    const result = (await rolloverPromise) as RealtimeRuntimeOutcome

    expect(result).toEqual({
      status: 'failed',
      operation: 'rollover',
      reason: 'rollover_stream_mismatch',
      cleanup: 'attempted',
      attemptedSteps: [
        'old_playback_dispose',
        'old_audio_output_dispose',
        'old_cleanup_run',
        'next_playback_dispose',
        'next_audio_output_dispose',
        'next_mic_release',
        'next_cleanup_run',
      ],
      failedSteps: [],
    })
    expectFrozenMetadataOutcome(result)
    expect(fixture.events).toEqual([result])
    expect(fixture.order).toEqual([
      'next-audio-create',
      'next-session-create',
      'next-playback-create',
      'next-cleanup-create',
      'mic-rollover',
      'old-playback-dispose',
      'old-audio-dispose',
      'old-cleanup-rollover',
      'next-playback-dispose',
      'next-audio-dispose',
      'mic-release',
      'next-cleanup-close',
      'publish',
    ])
    expect(fixture.oldPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.oldCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextSession.connect).not.toHaveBeenCalled()
    expect(fixture.nextPlayback.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.nextAudio.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.micOwner.release).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledTimes(1)
    expect(fixture.nextCleanup.run).toHaveBeenCalledWith('close')
    expect(fixture.nextSession.close).not.toHaveBeenCalled()
    expect(fixture.oldSession.close).not.toHaveBeenCalled()
    expect(fixture.track.stop).not.toHaveBeenCalled()
    expect(mismatchedStream.track.stop).not.toHaveBeenCalled()
    expect(fixture.owner.getSnapshot()).toMatchObject({ state: 'idle' })
  })
})
