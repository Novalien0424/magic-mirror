import type { RealtimeSessionStartBundleValue } from '../../shared/bridge'
import type {
  RealtimeFailureCallback,
  RealtimeMetadataEventSink,
} from '../../shared/realtime-events'
import {
  createMicOwner,
  type CreateMicOwnerInput,
  type MicOwner,
  type MicOwnerMetadataEventSink,
} from './mic-owner'
import {
  createPlaybackCompletionTransport,
  type PlaybackCompletionTransportAdapter,
} from './playback-transport-adapter'
import {
  PlaybackCompletion,
  type PlaybackCompletionAnalyser,
  type PlaybackCompletionInput,
  type PlaybackCompletionTransport,
} from './playback-completion'
import {
  createRealtimeAudioOutput,
  type CreateRealtimeAudioOutputInput,
  type RealtimeAudioOutput,
} from './realtime-audio-output'
import {
  createRealtimeSession,
  type CreateRealtimeSessionInput,
  type RealtimeSessionHandle,
} from './realtime-session-adapter'
import {
  createRealtimeRuntimeOwner,
  type RealtimeRuntimeAudioOutput,
  type RealtimeRuntimeEventSink,
  type RealtimeRuntimeMicOwner,
  type RealtimeRuntimeOwner,
  type RealtimeRuntimeOwnerDependencies,
  type RealtimeRuntimePlaybackTransport,
  type RealtimeRuntimeSession,
} from './realtime-runtime-owner'

type MaybePromise<T> = T | PromiseLike<T>

const MAX_REALTIME_ANALYSER_SAMPLE_SIZE = 32768

type RealtimeRuntimeAnalyser = Readonly<{
  readPeakLevel: () => number
}>

function isPlaybackCompletionTransport(
  value: unknown,
): value is PlaybackCompletionTransport {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PlaybackCompletionTransport).on === 'function' &&
    typeof (value as PlaybackCompletionTransport).off === 'function'
  )
}

function isPlaybackCompletionAnalyser(
  value: unknown,
): value is PlaybackCompletionAnalyser {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PlaybackCompletionAnalyser).readPeakLevel === 'function'
  )
}

function isPromiseLike<T>(value: MaybePromise<T>): value is PromiseLike<T> {
  return (
    ((typeof value === 'object' && value !== null) ||
      typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  )
}

function safeAnalyserSampleSize(analyser: AnalyserNode): number {
  const fftSize = analyser.fftSize
  if (!Number.isFinite(fftSize)) return 1
  return Math.min(
    MAX_REALTIME_ANALYSER_SAMPLE_SIZE,
    Math.max(1, Math.floor(fftSize)),
  )
}

function adaptRealtimeAudioOutput(
  output: RealtimeAudioOutput,
): RealtimeRuntimeAudioOutput {
  let analyserTapAttempted = false
  let analyserTapAttached = false

  const analyser: RealtimeRuntimeAnalyser = Object.freeze({
    readPeakLevel: (): number => {
      if (!analyserTapAttempted) {
        analyserTapAttempted = true
        try {
          output.attachAnalyserTap()
          analyserTapAttached = true
        } catch {
          return 0
        }
      }

      if (!analyserTapAttached) return 0

      try {
        const samples = new Float32Array(safeAnalyserSampleSize(output.analyser))
        output.analyser.getFloatTimeDomainData(samples)

        let peakLevel = 0
        for (const sample of samples) {
          if (!Number.isFinite(sample)) continue
          peakLevel = Math.max(peakLevel, Math.abs(sample))
        }

        return Math.min(1, Math.max(0, peakLevel))
      } catch {
        return 0
      }
    },
  })

  return Object.freeze({
    audioElement: output.audioElement,
    analyser,
    dispose: output.dispose,
  })
}

export interface CreateRealtimeRuntimeOwnerDependenciesInput {
  readonly eventSink: RealtimeRuntimeEventSink
  readonly sessionEventSink: RealtimeMetadataEventSink
  readonly micEventSink: MicOwnerMetadataEventSink
  readonly createCleanup: RealtimeRuntimeOwnerDependencies['createCleanup']
  readonly onFailure?: RealtimeFailureCallback
  readonly mediaDevices?: Pick<MediaDevices, 'getUserMedia'>
  readonly createSession?: (
    input: CreateRealtimeSessionInput,
  ) => MaybePromise<RealtimeSessionHandle>
  readonly createMicOwner?: (
    input: CreateMicOwnerInput,
  ) => MaybePromise<MicOwner>
  readonly createAudioOutput?: (
    input?: CreateRealtimeAudioOutputInput,
  ) => MaybePromise<RealtimeAudioOutput>
  readonly createPlaybackTransport?: (
    session: RealtimeRuntimeSession,
  ) => MaybePromise<RealtimeRuntimePlaybackTransport>
  readonly playbackCompletion: Omit<
    PlaybackCompletionInput,
    'transport' | 'analyser'
  >
  readonly createPlaybackCompletion?: RealtimeRuntimeOwnerDependencies['createPlaybackCompletion']
  readonly onCompletedInputTranscript?: RealtimeRuntimeOwnerDependencies['onCompletedInputTranscript']
}

function wrapMicOwner(micOwner: MicOwner): RealtimeRuntimeMicOwner {
  return Object.freeze({
    acquire: (stream: MediaStream): Promise<void> => micOwner.acquire(stream),
    release: (): Promise<void> => micOwner.release('realtime_session_cleanup'),
    rollover: (
      nextSession: RealtimeRuntimeSession,
      reason: 'generation_rollover',
    ): Promise<MediaStream> =>
      micOwner.rollover(nextSession, reason),
  })
}

export function createRealtimeRuntimeOwnerDependencies(
  input: CreateRealtimeRuntimeOwnerDependenciesInput,
): RealtimeRuntimeOwnerDependencies {
  const sessionFactory = input.createSession ?? createRealtimeSession
  const micOwnerFactory = input.createMicOwner ?? createMicOwner
  const audioOutputFactory = input.createAudioOutput ?? createRealtimeAudioOutput
  const playbackTransportFactory =
    input.createPlaybackTransport ??
    ((session: RealtimeRuntimeSession): PlaybackCompletionTransportAdapter =>
      createPlaybackCompletionTransport(session))
  const playbackCompletionFactory =
    input.createPlaybackCompletion ??
    ((
      playbackTransport: RealtimeRuntimePlaybackTransport,
      analyser: object,
    ) => {
      if (!isPlaybackCompletionTransport(playbackTransport)) {
        throw new Error('invalid_playback_transport')
      }
      if (!isPlaybackCompletionAnalyser(analyser)) {
        throw new Error('invalid_playback_analyser')
      }
      if (
        input.playbackCompletion === undefined ||
        input.playbackCompletion === null
      ) {
        throw new Error('invalid_playback_completion_configuration')
      }

      return new PlaybackCompletion({
        ...input.playbackCompletion,
        transport: playbackTransport,
        analyser,
      })
    })

  return {
    acquireMediaStream: (): PromiseLike<MediaStream> => {
      const mediaDevices = input.mediaDevices ?? navigator.mediaDevices
      return mediaDevices.getUserMedia({ audio: true, video: false })
    },
    createAudioOutput: (): MaybePromise<RealtimeRuntimeAudioOutput> => {
      const output = audioOutputFactory()
      return isPromiseLike(output)
        ? output.then(adaptRealtimeAudioOutput)
        : adaptRealtimeAudioOutput(output)
    },
    createSession: (
      bundle: Readonly<RealtimeSessionStartBundleValue>,
      stream: MediaStream,
      audioElement: HTMLAudioElement,
    ): MaybePromise<RealtimeRuntimeSession> => {
      const sessionGeneration = bundle.identity.sessionGeneration
      if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration <= 0) {
        throw new Error('invalid_session_generation')
      }

      return sessionFactory({
        snapshot: bundle.snapshot,
        clientSecret: bundle.clientSecret,
        mediaStream: stream,
        audioElement,
        sessionId: bundle.identity.realtimeSessionId,
        sessionGeneration,
        eventSink: input.sessionEventSink,
        onFailure: input.onFailure,
      })
    },
    createMicOwner: (
      session: RealtimeRuntimeSession,
    ): Promise<RealtimeRuntimeMicOwner> =>
      Promise.resolve(
        micOwnerFactory({
          session,
          eventSink: input.micEventSink,
        }),
      ).then(wrapMicOwner),
    createPlaybackTransport: (
      session: RealtimeRuntimeSession,
    ): MaybePromise<RealtimeRuntimePlaybackTransport> =>
      playbackTransportFactory(session),
    createCleanup: input.createCleanup,
    createPlaybackCompletion: playbackCompletionFactory,
    eventSink: input.eventSink,
    onCompletedInputTranscript: input.onCompletedInputTranscript,
  }
}

export function createBrowserRealtimeRuntimeOwner(
  input: CreateRealtimeRuntimeOwnerDependenciesInput,
): RealtimeRuntimeOwner {
  return createRealtimeRuntimeOwner(
    createRealtimeRuntimeOwnerDependencies(input),
  )
}
