import type { RealtimeSessionStartBundleValue } from '../../shared/bridge'
import type { AudioDeviceRouter } from '../audio-devices'
import { createProcessedRealtimeAudioOutput } from './processed-audio-output'
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
  waitForTail?: (signal: AbortSignal) => Promise<void>
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
  onDisposed?: (output: RealtimeAudioOutput) => void,
): RealtimeRuntimeAudioOutput {
  let analyserTapAttempted = false
  let analyserTapAttached = false

  const analyser: RealtimeRuntimeAnalyser = Object.freeze({
    ...(output.waitForTail ? { waitForTail: output.waitForTail } : {}),
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
        const node = output.completionAnalyser ?? output.analyser
        const samples = new Float32Array(safeAnalyserSampleSize(node))
        node.getFloatTimeDomainData(samples)

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

  let disposePromise: Promise<void> | null = null
  const dispose = onDisposed === undefined
    ? output.dispose
    : (): Promise<void> => {
        if (disposePromise !== null) return disposePromise
        disposePromise = Promise.resolve(output.dispose()).finally(() => {
          try {
            onDisposed(output)
          } catch {
            // Avatar observation cannot change audio cleanup.
          }
        })
        return disposePromise
      }

  return Object.freeze({
    audioElement: output.audioElement,
    analyser,
    dispose,
  })
}

export interface CreateRealtimeRuntimeOwnerDependenciesInput {
  readonly onAudioDegraded?: (reason: string) => void
  readonly audioDevices?: AudioDeviceRouter
  readonly eventSink: RealtimeRuntimeEventSink
  readonly sessionEventSink: RealtimeMetadataEventSink
  readonly micEventSink: MicOwnerMetadataEventSink
  readonly createCleanup: RealtimeRuntimeOwnerDependencies['createCleanup']
  readonly onFailure?: RealtimeFailureCallback
  readonly onReturnToDormant?: CreateRealtimeSessionInput['onReturnToDormant']
  readonly getAvatarDialogue?: () => Promise<{ wakeGreeting?: string; sleepFarewell?: string }>
  readonly onAudioActivity?: CreateRealtimeSessionInput['onAudioActivity']
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
  readonly onAudioOutputAvailable?: (output: RealtimeAudioOutput) => void
  readonly onAudioOutputDisposed?: (output: RealtimeAudioOutput) => void
  readonly createPlaybackTransport?: (
    session: RealtimeRuntimeSession,
  ) => MaybePromise<RealtimeRuntimePlaybackTransport>
  readonly playbackCompletion: Omit<
    PlaybackCompletionInput,
    'transport' | 'analyser'
  >
  readonly createPlaybackCompletion?: RealtimeRuntimeOwnerDependencies['createPlaybackCompletion']
  readonly onInputItemCreated?: RealtimeRuntimeOwnerDependencies['onInputItemCreated']
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
  const audioOutputFactory = input.createAudioOutput ?? createProcessedRealtimeAudioOutput
  const outputs = new WeakMap<HTMLAudioElement, RealtimeAudioOutput>()
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

      const completion = new PlaybackCompletion({
        ...input.playbackCompletion,
        transport: playbackTransport,
        analyser,
      })
      return { async waitForActualEnd(signal: AbortSignal) {
        const result = await completion.waitForActualEnd(signal)
        await (analyser as RealtimeRuntimeAnalyser).waitForTail?.(signal)
        return result
      } }
    })

  return {
    acquireMediaStream: (): PromiseLike<MediaStream> => {
      const mediaDevices = input.mediaDevices ?? navigator.mediaDevices
      if (input.audioDevices) return input.audioDevices.inputConstraints().then((audio) => mediaDevices.getUserMedia({ audio, video: false }))
      return mediaDevices.getUserMedia({ audio: true, video: false })
    },
    createAudioOutput: (bundle): MaybePromise<RealtimeRuntimeAudioOutput> => {
      const output = audioOutputFactory({ voiceEffects: bundle.snapshot.voiceEffects, onDegraded: input.onAudioDegraded })
      const adapt = (resolved: RealtimeAudioOutput): RealtimeRuntimeAudioOutput => {
        outputs.set(resolved.audioElement, resolved)
        try {
          input.onAudioOutputAvailable?.(resolved)
        } catch {
          // Avatar observation cannot change Realtime output ownership.
        }
        return adaptRealtimeAudioOutput(resolved, input.onAudioOutputDisposed)
      }
      if (input.audioDevices) return Promise.resolve(output).then(async (resolved) => {
        outputs.set(resolved.audioElement, resolved)
        const detach = await input.audioDevices!.attach(resolved.sink ?? resolved.audioElement)
        try { input.onAudioOutputAvailable?.(resolved) } catch { /* observation cannot gate audio */ }
        return adaptRealtimeAudioOutput(resolved, (disposed) => {
          detach()
          input.onAudioOutputDisposed?.(disposed)
        })
      })
      return isPromiseLike(output) ? output.then(adapt) : adapt(output)
    },
    createSession: async (
      bundle: Readonly<RealtimeSessionStartBundleValue>,
      stream: MediaStream,
      audioElement: HTMLAudioElement,
      greet = false,
    ): Promise<RealtimeRuntimeSession> => {
      const sessionGeneration = bundle.identity.sessionGeneration
      if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration <= 0) {
        throw new Error('invalid_session_generation')
      }

      const dialogue = bundle.avatar ?? await input.getAvatarDialogue?.()
      return sessionFactory({
        ...(bundle.avatar ? { avatar: bundle.avatar } : {}),
        ...(greet && dialogue?.wakeGreeting !== undefined ? { wakeGreeting: dialogue.wakeGreeting } : {}),
        ...(dialogue?.sleepFarewell !== undefined ? { sleepFarewell: dialogue.sleepFarewell } : {}),
        snapshot: bundle.snapshot,
        clientSecret: bundle.clientSecret,
        mediaStream: stream,
        audioElement,
        sessionId: bundle.identity.realtimeSessionId,
        sessionGeneration,
        eventSink: input.sessionEventSink,
        onFailure: input.onFailure,
        onReturnToDormant: input.onReturnToDormant,
        onAudioActivity: activity => {
          const output = outputs.get(audioElement)
          const notify = input.onAudioActivity ?? (() => undefined)
          if (output?.handleActivity) output.handleActivity(activity, notify)
          else notify(activity)
        },
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
    onInputItemCreated: input.onInputItemCreated,
    onCompletedInputTranscript: input.onCompletedInputTranscript,
  }
}

export function createBrowserRealtimeRuntimeOwner(
  input: CreateRealtimeRuntimeOwnerDependenciesInput,
): RealtimeRuntimeOwner {
  let owner: RealtimeRuntimeOwner
  owner = createRealtimeRuntimeOwner(createRealtimeRuntimeOwnerDependencies({
    ...input,
    onFailure: async failure => {
      const current = owner.getSnapshot().currentIdentity
      if (current && current.realtimeSessionId !== failure.realtimeSessionId) {
        await input.onFailure?.(failure)
        return
      }
      // Main may reacquire the wake microphone after this report. Release all
      // renderer-owned media first, including a still-connected failed session.
      const cleanup = await owner.stop('close')
      await input.onFailure?.(cleanup.status === 'failed'
        ? { ...failure, reason: 'realtime_cleanup_failed' } : failure)
    },
  }))
  return owner
}
