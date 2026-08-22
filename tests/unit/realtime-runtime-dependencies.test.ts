import { describe, expect, it, vi } from 'vitest'

import type { RealtimeSessionStartBundleValue } from '../../src/shared/bridge'
import type {
  PlaybackCompletionAnalyser,
  PlaybackCompletionInput,
  PlaybackCompletionMetadataEvent,
  PlaybackCompletionMetadataEventSink,
  PlaybackCompletionScheduler,
  PlaybackCompletionTransport,
} from '../../src/renderer/realtime/playback-completion'
import type {
  RealtimeRuntimeAudioOutput,
  RealtimeRuntimeCleanup,
  RealtimeRuntimeOwnerDependencies,
  RealtimeRuntimePlaybackTransport,
  RealtimeRuntimeSession,
} from '../../src/renderer/realtime/realtime-runtime-owner'
import {
  createBrowserRealtimeRuntimeOwner,
  createRealtimeRuntimeOwnerDependencies,
} from '../../src/renderer/realtime/realtime-runtime-dependencies'

type RuntimeDependencyInput = Parameters<
  typeof createRealtimeRuntimeOwnerDependencies
>[0]

type DependencyFixture = {
  readonly input: RuntimeDependencyInput
  readonly runtimeEventSink: ReturnType<typeof vi.fn>
  readonly sessionEventSink: ReturnType<typeof vi.fn>
  readonly micEventSink: ReturnType<typeof vi.fn>
  readonly onFailure: ReturnType<typeof vi.fn>
  readonly getUserMedia: ReturnType<typeof vi.fn>
  readonly createSession: ReturnType<typeof vi.fn>
  readonly createMicOwner: ReturnType<typeof vi.fn>
  readonly cleanupFactory: ReturnType<typeof vi.fn>
  readonly createAudioOutput: ReturnType<typeof vi.fn>
  readonly createPlaybackTransport: ReturnType<typeof vi.fn>
  readonly stream: MediaStream
  readonly audioElement: HTMLAudioElement
  readonly session: RealtimeRuntimeSession
  readonly cleanup: RealtimeRuntimeCleanup
  readonly playbackTransport: RealtimeRuntimePlaybackTransport
}

function makeBundle(): Readonly<RealtimeSessionStartBundleValue> {
  const snapshot = Object.freeze({
    configVersion: 7,
    fingerprint: 'snapshot-fingerprint',
    sdkVersion: '0.16.1',
    realtimeDialogue: 'configured-realtime-model',
    inputTranscription: 'configured-transcription-model',
    memoryExtractor: 'configured-memory-model',
    voice: 'configured-voice',
    turnDetectionProfile: 'semantic-vad-interruptible',
    reasoningEffort: 'medium',
    takenAt: '2026-08-21T00:00:00.000Z',
  }) as RealtimeSessionStartBundleValue['snapshot']

  return Object.freeze({
    snapshot,
    identity: Object.freeze({
      realtimeSessionId: 'runtime-session-42',
      sessionGeneration: 42,
    }),
    clientSecret:
      'opaque-transient-client-secret' as RealtimeSessionStartBundleValue['clientSecret'],
  })
}

function makeSession(): RealtimeRuntimeSession {
  return {
    realtimeSessionId: 'runtime-session-42',
    sessionGeneration: 42,
    connect: vi.fn(async () => undefined),
    interrupt: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    onOutputAudioBufferStopped: vi.fn(() => () => undefined),
  }
}

function makeFixture(): DependencyFixture {
  const stream = { getTracks: vi.fn(() => []) } as unknown as MediaStream
  const audioElement = {} as HTMLAudioElement
  const session = makeSession()
  const cleanup = { run: vi.fn(async () => undefined) } as RealtimeRuntimeCleanup
  const playbackTransport = {
    dispose: vi.fn(async () => undefined),
  } as RealtimeRuntimePlaybackTransport
  const audioOutput = {
    audioElement,
    dispose: vi.fn(async () => undefined),
  } as RealtimeRuntimeAudioOutput

  const runtimeEventSink = vi.fn()
  const sessionEventSink = vi.fn()
  const micEventSink = vi.fn()
  const onFailure = vi.fn()
  const getUserMedia = vi.fn(async () => stream)
  const createSession = vi.fn(() => session)
  const createMicOwner = vi.fn()
  const cleanupFactory = vi.fn(() => cleanup)
  const createAudioOutput = vi.fn(() => audioOutput)
  const createPlaybackTransport = vi.fn(() => playbackTransport)

  const input = {
    eventSink: runtimeEventSink,
    sessionEventSink,
    micEventSink,
    onFailure,
    mediaDevices: { getUserMedia },
    createSession,
    createMicOwner,
    createCleanup: cleanupFactory,
    createAudioOutput,
    createPlaybackTransport,
  } as unknown as RuntimeDependencyInput

  return {
    input,
    runtimeEventSink,
    sessionEventSink,
    micEventSink,
    onFailure,
    getUserMedia,
    createSession,
    createMicOwner,
    cleanupFactory,
    createAudioOutput,
    createPlaybackTransport,
    stream,
    audioElement,
    session,
    cleanup,
    playbackTransport,
  }
}

type AudioAnalyserFixture = {
  readonly output: RealtimeRuntimeAudioOutput
  readonly audioElement: HTMLAudioElement
  readonly analyser: AnalyserNode & {
    readonly connect: ReturnType<typeof vi.fn>
  }
  readonly attachAnalyserTap: ReturnType<typeof vi.fn>
  readonly getFloatTimeDomainData: ReturnType<typeof vi.fn>
  readonly source: {
    readonly connect: ReturnType<typeof vi.fn>
  }
  readonly audioContext: {
    readonly destination: object
  }
  readonly dispose: ReturnType<typeof vi.fn>
}

type PublicPlaybackTransport = PlaybackCompletionTransport &
  Pick<RealtimeRuntimePlaybackTransport, 'dispose'>

type PlaybackCompletionConfiguration = Omit<
  PlaybackCompletionInput,
  'transport' | 'analyser'
>

type CompositionRuntimeDependencyInput = RuntimeDependencyInput & {
  readonly playbackCompletion: PlaybackCompletionConfiguration
}

type ComposedRuntimeDependencies = Omit<
  ReturnType<typeof createRealtimeRuntimeOwnerDependencies>,
  'createPlaybackCompletion'
> & {
  readonly createPlaybackCompletion: NonNullable<
    RealtimeRuntimeOwnerDependencies['createPlaybackCompletion']
  >
}

type PublicOutputSignalFixture = {
  readonly session: RealtimeRuntimeSession
  readonly listeners: Set<() => void>
  readonly onOutputAudioBufferStopped: ReturnType<typeof vi.fn>
  readonly providerDisposers: Array<ReturnType<typeof vi.fn>>
}

function makePublicOutputSignalFixture(): PublicOutputSignalFixture {
  const listeners = new Set<() => void>()
  const providerDisposers: Array<ReturnType<typeof vi.fn>> = []
  const onOutputAudioBufferStopped = vi.fn((listener: () => void) => {
    listeners.add(listener)
    const disposer = vi.fn(() => {
      listeners.delete(listener)
    })
    providerDisposers.push(disposer)
    return disposer
  })
  const session = {
    ...makeSession(),
    onOutputAudioBufferStopped,
  } as RealtimeRuntimeSession

  return {
    session,
    listeners,
    onOutputAudioBufferStopped,
    providerDisposers,
  }
}

type PlaybackSchedulerFixture = {
  readonly scheduler: PlaybackCompletionScheduler
  readonly callbacks: Map<number, () => void>
  readonly setNow: (value: number) => void
}

function makePlaybackScheduler(startedAt = 100): PlaybackSchedulerFixture {
  let nowValue = startedAt
  let nextHandle = 1
  const callbacks = new Map<number, () => void>()
  const scheduler = {
    now: vi.fn(() => nowValue),
    setTimeout: vi.fn((callback: () => void, _delayMs: number): number => {
      const handle = nextHandle
      nextHandle += 1
      callbacks.set(handle, callback)
      return handle
    }),
    clearTimeout: vi.fn((handle: number): void => {
      callbacks.delete(handle)
    }),
  } satisfies PlaybackCompletionScheduler

  return {
    scheduler,
    callbacks,
    setNow: (value: number): void => {
      nowValue = value
    },
  }
}

function makePlaybackCompletionConfiguration(
  scheduler: PlaybackCompletionScheduler,
  eventSink: PlaybackCompletionMetadataEventSink,
  overrides: Partial<PlaybackCompletionConfiguration> = {},
): PlaybackCompletionConfiguration {
  return {
    scheduler,
    fallbackAfterMs: 10,
    sampleIntervalMs: 5,
    maxFallbackMs: 50,
    silenceThreshold: 0.1,
    silentSamplesRequired: 1,
    eventSink,
    ...overrides,
  }
}

function makeComposedRuntimeDependencies(
  playbackCompletion: PlaybackCompletionConfiguration,
): {
  readonly fixture: DependencyFixture
  readonly dependencies: ComposedRuntimeDependencies
} {
  const fixture = makeFixture()
  const input = {
    ...fixture.input,
    createPlaybackTransport: undefined,
    createPlaybackCompletion: undefined,
    playbackCompletion,
  } as CompositionRuntimeDependencyInput

  return {
    fixture,
    dependencies: createRealtimeRuntimeOwnerDependencies(
      input,
    ) as ComposedRuntimeDependencies,
  }
}

function makeAudioAnalyserFixture(): AudioAnalyserFixture {
  const audioElement = {
    muted: false,
    volume: 1,
  } as unknown as HTMLAudioElement
  const audioContext = { destination: {} }
  const source = { connect: vi.fn() }
  const samples = [
    [Number.NaN, 2, -1.5, 0.25],
    [0.25, -0.5, Number.NaN, 0],
  ]
  let sampleIndex = 0
  const getFloatTimeDomainData = vi.fn((target: Float32Array) => {
    const sample = samples[Math.min(sampleIndex, samples.length - 1)] ?? []
    target.set(sample.slice(0, target.length))
    sampleIndex += 1
  })
  const analyser = {
    fftSize: 4,
    frequencyBinCount: 4,
    getFloatTimeDomainData,
    connect: vi.fn(),
  } as unknown as AudioAnalyserFixture['analyser']
  const attachAnalyserTap = vi.fn(() => {
    source.connect(analyser)
  })
  const disposeResult = Promise.resolve()
  const dispose = vi.fn(() => disposeResult)
  const output = {
    audioElement,
    analyser,
    attachAnalyserTap,
    dispose,
  } as unknown as RealtimeRuntimeAudioOutput

  return {
    output,
    audioElement,
    analyser,
    attachAnalyserTap,
    getFloatTimeDomainData,
    source,
    audioContext,
    dispose,
  }
}

describe('Realtime runtime dependency composition core', () => {
  it('constructs dependencies and a browser owner purely, leaving the owner idle', () => {
    const fixture = makeFixture()

    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)
    const owner = createBrowserRealtimeRuntimeOwner(fixture.input)

    expect(owner.getSnapshot()).toEqual({ state: 'idle' })
    expect(fixture.getUserMedia).not.toHaveBeenCalled()
    expect(fixture.createSession).not.toHaveBeenCalled()
    expect(fixture.createMicOwner).not.toHaveBeenCalled()
    expect(fixture.createAudioOutput).not.toHaveBeenCalled()
    expect(fixture.createPlaybackTransport).not.toHaveBeenCalled()
    expect(fixture.cleanupFactory).not.toHaveBeenCalled()
    expect(fixture.runtimeEventSink).not.toHaveBeenCalled()
    expect(fixture.sessionEventSink).not.toHaveBeenCalled()
    expect(fixture.micEventSink).not.toHaveBeenCalled()
    expect(dependencies.createCleanup).toBe(fixture.cleanupFactory)
    expect(dependencies.eventSink).toBe(fixture.runtimeEventSink)
  })

  it('acquires media lazily once with audio-only constraints', async () => {
    const fixture = makeFixture()
    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)

    await expect(dependencies.acquireMediaStream()).resolves.toBe(fixture.stream)

    expect(fixture.getUserMedia).toHaveBeenCalledTimes(1)
    expect(fixture.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false })
  })

  it('maps the exact bundle and sinks into the injected session factory without credential metadata', async () => {
    const fixture = makeFixture()
    const bundle = makeBundle()
    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)
    const sessionMetadata = {
      event: 'realtime_session_created',
      status: 'info',
      realtimeSessionId: bundle.identity.realtimeSessionId,
      sessionGeneration: bundle.identity.sessionGeneration,
      reason: 'test',
    }

    fixture.createSession.mockImplementationOnce((sessionInput: unknown) => {
      const input = sessionInput as {
        readonly eventSink: (event: unknown) => void
      }
      input.eventSink(sessionMetadata)
      return fixture.session
    })

    expect(
      await Promise.resolve(
        dependencies.createSession(bundle, fixture.stream, fixture.audioElement),
      ),
    ).toBe(fixture.session)

    const [sessionInput] = fixture.createSession.mock.calls[0] as [
      Record<string, unknown>,
    ]
    expect(sessionInput.snapshot).toBe(bundle.snapshot)
    expect(Object.isFrozen(sessionInput.snapshot)).toBe(true)
    expect(sessionInput.clientSecret).toBe(bundle.clientSecret)
    expect(sessionInput.sessionId).toBe(bundle.identity.realtimeSessionId)
    expect(sessionInput.sessionGeneration).toBe(bundle.identity.sessionGeneration)
    expect(sessionInput.mediaStream).toBe(fixture.stream)
    expect(sessionInput.audioElement).toBe(fixture.audioElement)
    expect(sessionInput.eventSink).toBe(fixture.sessionEventSink)
    expect(sessionInput.onFailure).toBe(fixture.onFailure)
    expect(JSON.stringify(fixture.sessionEventSink.mock.calls)).not.toContain(
      bundle.clientSecret,
    )
  })

  it('rejects invalid session generations before invoking the injected session factory', async () => {
    const fixture = makeFixture()
    const bundle = makeBundle()
    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)
    const invalidGenerations = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ]

    for (const sessionGeneration of invalidGenerations) {
      const invalidBundle = Object.freeze({
        ...bundle,
        identity: Object.freeze({
          ...bundle.identity,
          sessionGeneration,
        }),
      })

      await expect(
        Promise.resolve().then(() =>
          dependencies.createSession(
            invalidBundle,
            fixture.stream,
            fixture.audioElement,
          ),
        ),
      ).rejects.toEqual(new Error('invalid_session_generation'))
    }

    expect(fixture.createSession).not.toHaveBeenCalled()
  })

  it('binds the exact created session, uses the stable cleanup release reason, and preserves rollover identity', async () => {
    const fixture = makeFixture()
    const bundle = makeBundle()
    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)
    const createdSession = await dependencies.createSession(
      bundle,
      fixture.stream,
      fixture.audioElement,
    )
    const rolloverStream = { id: 'same-stream-after-rollover' } as unknown as MediaStream
    const nextSession = {
      ...fixture.session,
      realtimeSessionId: 'runtime-session-next',
      sessionGeneration: 43,
    } as RealtimeRuntimeSession
    const existingMicOwner = {
      owner: 'realtime',
      mediaStream: fixture.stream,
      acquire: vi.fn(async () => undefined),
      release: vi.fn(async (_reason: string) => undefined),
      rollover: vi.fn(async () => rolloverStream),
    }
    fixture.createMicOwner.mockReturnValueOnce(existingMicOwner)

    const runtimeMicOwner = await dependencies.createMicOwner(createdSession)

    const [micInput] = fixture.createMicOwner.mock.calls[0] as [
      Record<string, unknown>,
    ]
    expect(micInput.session).toBe(createdSession)
    expect(micInput.eventSink).toBe(fixture.micEventSink)

    await runtimeMicOwner.release()
    expect(existingMicOwner.release).toHaveBeenCalledWith('realtime_session_cleanup')

    expect(runtimeMicOwner.rollover).toBeDefined()
    await expect(
      runtimeMicOwner.rollover!(nextSession, 'generation_rollover'),
    ).resolves.toBe(rolloverStream)
    expect(existingMicOwner.rollover).toHaveBeenCalledWith(
      nextSession,
      'generation_rollover',
    )
  })

  it('passes the required cleanup factory and runtime event sink through unchanged', () => {
    const fixture = makeFixture()

    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)

    expect(dependencies.createCleanup).toBe(fixture.cleanupFactory)
    expect(dependencies.eventSink).toBe(fixture.runtimeEventSink)
  })
})

describe('Realtime runtime dependency composition — playback completion', () => {
  it('uses only the public output-stop signal for the default transport and disposes subscriptions', async () => {
    const fixture = makeFixture()
    const signalFixture = makePublicOutputSignalFixture()
    const dependencies = createRealtimeRuntimeOwnerDependencies({
      ...fixture.input,
      createPlaybackTransport: undefined,
    })
    const transport = (await Promise.resolve(
      dependencies.createPlaybackTransport(signalFixture.session),
    )) as unknown as PublicPlaybackTransport
    const firstListener = vi.fn()

    expect('transport' in signalFixture.session).toBe(false)
    transport.on('output_audio_buffer.stopped', firstListener)

    expect(fixture.createPlaybackTransport).not.toHaveBeenCalled()
    expect(signalFixture.onOutputAudioBufferStopped).toHaveBeenCalledTimes(1)
    expect(signalFixture.onOutputAudioBufferStopped).toHaveBeenCalledWith(
      expect.any(Function),
    )

    for (const listener of [...signalFixture.listeners]) listener()
    expect(firstListener).toHaveBeenCalledTimes(1)

    transport.off('output_audio_buffer.stopped', firstListener)
    const firstProviderDisposer = signalFixture.providerDisposers[0]!
    expect(firstProviderDisposer).toHaveBeenCalledTimes(1)

    const secondListener = vi.fn()
    transport.on('output_audio_buffer.stopped', secondListener)
    const secondProviderDisposer = signalFixture.providerDisposers[1]!
    await Promise.resolve(transport.dispose())

    expect(secondProviderDisposer).toHaveBeenCalledTimes(1)
    expect(signalFixture.listeners.size).toBe(0)
    for (const listener of [...signalFixture.listeners]) listener()
    expect(firstListener).toHaveBeenCalledTimes(1)
    expect(secondListener).not.toHaveBeenCalled()
  })

  it('creates a real completion from nested configuration and resolves the public primary event', async () => {
    const scheduler = makePlaybackScheduler()
    const eventSink = vi.fn((event: PlaybackCompletionMetadataEvent) => {
      void event
    })
    const { fixture, dependencies } = makeComposedRuntimeDependencies(
      makePlaybackCompletionConfiguration(scheduler.scheduler, eventSink),
    )
    const signalFixture = makePublicOutputSignalFixture()
    const playbackTransport = (await Promise.resolve(
      dependencies.createPlaybackTransport(signalFixture.session),
    )) as unknown as PublicPlaybackTransport
    const analyser = {
      readPeakLevel: vi.fn(() => 1),
    } satisfies PlaybackCompletionAnalyser
    const completion = dependencies.createPlaybackCompletion(
      playbackTransport,
      analyser,
    )
    const resultPromise = completion.waitForActualEnd(
      new AbortController().signal,
    )

    expect(fixture.createPlaybackTransport).not.toHaveBeenCalled()
    for (const listener of [...signalFixture.listeners]) listener()

    await expect(resultPromise).resolves.toEqual({
      source: 'output_audio_buffer.stopped',
    })
    expect(eventSink).toHaveBeenCalledTimes(1)
    expect(eventSink).toHaveBeenCalledWith({
      event: 'playback_completed',
      source: 'output_audio_buffer.stopped',
      duration_ms: 0,
      status: 'success',
      reason: 'primary_event_received',
      count: 1,
    })
  })

  it('delegates bounded analyser fallback through the same real completion composition', async () => {
    const scheduler = makePlaybackScheduler()
    const eventSink = vi.fn((event: PlaybackCompletionMetadataEvent) => {
      void event
    })
    const { dependencies } = makeComposedRuntimeDependencies(
      makePlaybackCompletionConfiguration(scheduler.scheduler, eventSink, {
        fallbackAfterMs: 10,
        sampleIntervalMs: 5,
        maxFallbackMs: 20,
        silenceThreshold: 0.1,
        silentSamplesRequired: 1,
      }),
    )
    const signalFixture = makePublicOutputSignalFixture()
    const playbackTransport = (await Promise.resolve(
      dependencies.createPlaybackTransport(signalFixture.session),
    )) as unknown as PublicPlaybackTransport
    const analyser = {
      readPeakLevel: vi.fn(() => 0),
    } satisfies PlaybackCompletionAnalyser
    const completion = dependencies.createPlaybackCompletion(
      playbackTransport,
      analyser,
    )
    const resultPromise = completion.waitForActualEnd(
      new AbortController().signal,
    )
    const [fallbackCallback] = [...scheduler.callbacks.values()]

    expect(fallbackCallback).toEqual(expect.any(Function))
    scheduler.setNow(110)
    fallbackCallback?.()

    await expect(resultPromise).resolves.toEqual({
      source: 'bounded_analyser_fallback',
      reason: 'tail_silence_detected',
    })
    expect(analyser.readPeakLevel).toHaveBeenCalledTimes(1)
    expect(eventSink).toHaveBeenCalledTimes(1)
    expect(eventSink).toHaveBeenCalledWith({
      event: 'playback_completion_fallback',
      source: 'bounded_analyser_fallback',
      duration_ms: 10,
      status: 'degraded',
      reason: 'tail_silence_detected',
      count: 1,
    })
  })

  it('throws synchronously with metadata-free reasons for invalid public transport and analyser shapes', () => {
    const scheduler = makePlaybackScheduler()
    const eventSink = vi.fn((event: PlaybackCompletionMetadataEvent) => {
      void event
    })
    const { dependencies } = makeComposedRuntimeDependencies(
      makePlaybackCompletionConfiguration(scheduler.scheduler, eventSink),
    )
    const validAnalyser = {
      readPeakLevel: vi.fn(() => 0),
    } satisfies PlaybackCompletionAnalyser
    const invalidTransport = {} as unknown as PublicPlaybackTransport
    const validTransport = {
      on: vi.fn(),
      off: vi.fn(),
      dispose: vi.fn(),
    } satisfies PublicPlaybackTransport
    const invalidAnalyser = {} as unknown as PlaybackCompletionAnalyser

    expect(() =>
      dependencies.createPlaybackCompletion(
        invalidTransport,
        validAnalyser,
      ),
    ).toThrowError(new Error('invalid_playback_transport'))
    expect(() =>
      dependencies.createPlaybackCompletion(
        validTransport,
        invalidAnalyser,
      ),
    ).toThrowError(new Error('invalid_playback_analyser'))
    expect(eventSink).not.toHaveBeenCalled()
  })
})

describe('Realtime runtime dependency composition — audio analyser', () => {
  it('keeps audio output construction lazy and adapts the injected output once', async () => {
    const fixture = makeFixture()
    const audioFixture = makeAudioAnalyserFixture()
    fixture.createAudioOutput.mockReturnValue(audioFixture.output)

    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)

    expect(fixture.createAudioOutput).not.toHaveBeenCalled()

    const returnedAudioOutput = await Promise.resolve(dependencies.createAudioOutput())
    const returnedAnalyser = returnedAudioOutput.analyser as unknown as {
      readonly readPeakLevel: () => number
    }

    expect(fixture.createAudioOutput).toHaveBeenCalledTimes(1)
    expect(returnedAudioOutput.audioElement).toBe(audioFixture.audioElement)
    expect(returnedAudioOutput.audioElement.muted).toBe(false)
    expect(returnedAudioOutput.audioElement.volume).toBe(1)
    expect(returnedAnalyser.readPeakLevel).toEqual(expect.any(Function))
    expect(audioFixture.attachAnalyserTap).not.toHaveBeenCalled()
    expect(audioFixture.getFloatTimeDomainData).not.toHaveBeenCalled()
  })

  it('attaches the existing tap once and reads finite clamped peaks without destination routing', async () => {
    const fixture = makeFixture()
    const audioFixture = makeAudioAnalyserFixture()
    fixture.createAudioOutput.mockReturnValue(audioFixture.output)
    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)
    const returnedAudioOutput = await Promise.resolve(dependencies.createAudioOutput())
    const returnedAnalyser = returnedAudioOutput.analyser as unknown as {
      readonly readPeakLevel: () => number
    }

    const firstPeak = returnedAnalyser.readPeakLevel()
    const secondPeak = returnedAnalyser.readPeakLevel()

    expect(audioFixture.attachAnalyserTap).toHaveBeenCalledTimes(1)
    expect(audioFixture.getFloatTimeDomainData).toHaveBeenCalledTimes(2)
    expect(firstPeak).toBe(1)
    expect(secondPeak).toBe(0.5)
    for (const peak of [firstPeak, secondPeak]) {
      expect(Number.isFinite(peak)).toBe(true)
      expect(peak).toBeGreaterThanOrEqual(0)
      expect(peak).toBeLessThanOrEqual(1)
    }
    expect(audioFixture.source.connect).toHaveBeenCalledTimes(1)
    expect(audioFixture.source.connect).toHaveBeenCalledWith(audioFixture.analyser)
    expect(audioFixture.source.connect).not.toHaveBeenCalledWith(
      audioFixture.audioContext.destination,
    )
    expect(audioFixture.analyser.connect).not.toHaveBeenCalledWith(
      audioFixture.audioContext.destination,
    )
  })

  it('delegates disposal to the exact output and preserves its idempotent promise', async () => {
    const fixture = makeFixture()
    const audioFixture = makeAudioAnalyserFixture()
    fixture.createAudioOutput.mockReturnValue(audioFixture.output)
    const dependencies = createRealtimeRuntimeOwnerDependencies(fixture.input)
    const returnedAudioOutput = await Promise.resolve(dependencies.createAudioOutput())

    expect(returnedAudioOutput.dispose).toBe(audioFixture.dispose)

    const firstDispose = returnedAudioOutput.dispose()
    const secondDispose = returnedAudioOutput.dispose()

    expect(firstDispose).toBe(secondDispose)
    await Promise.all([firstDispose, secondDispose])
    expect(audioFixture.dispose).toHaveBeenCalledTimes(2)
  })
})
