import type {
  RealtimeSessionIdentity,
  RealtimeSessionStartBundleValue,
} from '../../../src/shared/bridge'
import type { PlaybackCompletionResult } from './playback-completion'
import type { RealtimeSessionHandle } from './realtime-session-adapter'

type MaybePromise<T> = T | PromiseLike<T>

const START_FAILURE_CLOSE_REASON = 'start_failed'

type RealtimeRuntimeStartStage =
  | 'media_stream'
  | 'audio_output'
  | 'session_create'
  | 'mic_owner_create'
  | 'mic_acquire'
  | 'playback_transport'
  | 'cleanup_factory'
  | 'connect'

const START_FAILURE_REASON_BY_STAGE: Readonly<
  Record<RealtimeRuntimeStartStage, string>
> = Object.freeze({
  media_stream: 'start_media_stream_failed',
  audio_output: 'start_audio_output_failed',
  session_create: 'start_session_create_failed',
  mic_owner_create: 'start_mic_owner_create_failed',
  mic_acquire: 'start_mic_acquire_failed',
  playback_transport: 'start_playback_transport_failed',
  cleanup_factory: 'start_cleanup_factory_failed',
  connect: 'start_connect_failed',
})

const START_CONNECT_FAILURE_TOKENS = Object.freeze([
  'start_connect_credential_missing',
  'start_connect_ephemeral_key_required',
  'start_connect_setup_closed',
  'start_connect_sdp_offer_failed',
  'start_connect_sdp_answer_failed',
  'start_connect_bad_request',
  'start_connect_auth_failed',
  'start_connect_permission_failed',
  'start_connect_not_found',
  'start_connect_rate_limited',
  'start_connect_service_unavailable',
  'start_connect_network_failed',
  'start_connect_transport_failed',
] as const)

export type RealtimeRuntimeState =
  | 'idle'
  | 'starting'
  | 'active'
  | 'rolling_over'
  | 'stopping'
  | 'disposed'

export type RealtimeRuntimeCleanupBoundary =
  | 'close'
  | 'stop'
  | 'dispose'
  | 'rollover'
  | 'offline_loop'

export type RealtimeRuntimeStep =
  | 'playback_dispose'
  | 'audio_output_dispose'
  | 'next_playback_dispose'
  | 'next_audio_output_dispose'
  | 'next_session_close'
  | 'next_cleanup_run'
  | 'mic_release'
  | 'session_close'
  | 'stream_track_stop'
  | 'cleanup_run'

export interface RealtimeRuntimeAudioOutput {
  readonly audioElement: HTMLAudioElement
  readonly analyser?: object
  readonly dispose: () => MaybePromise<void>
}

export type RealtimeRuntimeSession = RealtimeSessionHandle

function readValidatedConnectFailureToken(
  session: RealtimeRuntimeSession,
): string | undefined {
  try {
    const getToken = session.getLastConnectFailureToken
    if (typeof getToken !== 'function') return undefined
    const token = getToken()
    return typeof token === 'string' &&
      (START_CONNECT_FAILURE_TOKENS as readonly string[]).includes(token)
      ? token
      : undefined
  } catch {
    return undefined
  }
}

export interface RealtimeRuntimeMicOwner {
  readonly acquire: (stream: MediaStream) => MaybePromise<void>
  readonly release: () => MaybePromise<void>
  readonly rollover?: (
    nextSession: RealtimeRuntimeSession,
    reason: 'generation_rollover',
  ) => MaybePromise<MediaStream>
}

export interface RealtimeRuntimePlaybackTransport {
  readonly dispose: () => MaybePromise<void>
}

export interface RealtimeRuntimePlaybackCompletion {
  readonly waitForActualEnd: (
    signal: AbortSignal,
  ) => MaybePromise<PlaybackCompletionResult>
}

export interface RealtimeRuntimeCleanup {
  readonly run: (boundary: RealtimeRuntimeCleanupBoundary) => MaybePromise<void>
}

export type RealtimeRuntimeEventSink = (
  outcome: RealtimeRuntimeOutcome,
) => void | PromiseLike<void>

export interface RealtimeRuntimeOwnerDependencies {
  readonly acquireMediaStream: () => MaybePromise<MediaStream>
  readonly createAudioOutput: () => MaybePromise<RealtimeRuntimeAudioOutput>
  readonly createSession: (
    bundle: Readonly<RealtimeSessionStartBundleValue>,
    stream: MediaStream,
    audioElement: HTMLAudioElement,
  ) => MaybePromise<RealtimeRuntimeSession>
  readonly createMicOwner: (
    session: RealtimeRuntimeSession,
  ) => MaybePromise<RealtimeRuntimeMicOwner>
  readonly createPlaybackTransport: (
    session: RealtimeRuntimeSession,
  ) => MaybePromise<RealtimeRuntimePlaybackTransport>
  readonly createCleanup: (
    session: RealtimeRuntimeSession | Readonly<RealtimeSessionIdentity>,
  ) => MaybePromise<RealtimeRuntimeCleanup>
  readonly createPlaybackCompletion?: (
    playbackTransport: RealtimeRuntimePlaybackTransport,
    analyser: object,
  ) => RealtimeRuntimePlaybackCompletion
  readonly eventSink?: RealtimeRuntimeEventSink
}

export interface RealtimeRuntimeSnapshot {
  readonly state: RealtimeRuntimeState
  readonly currentIdentity?: Readonly<RealtimeSessionIdentity>
}

export interface RealtimeRuntimeOutcome {
  readonly status: 'success' | 'ignored' | 'failed' | 'degraded'
  readonly operation: 'start' | 'stop' | 'dispose' | 'interrupt' | 'rollover'
  readonly reason: string
  readonly cleanup?: 'attempted'
  readonly playbackSource?: PlaybackCompletionResult['source']
  readonly playbackReason?: Extract<
    PlaybackCompletionResult,
    { readonly source: 'bounded_analyser_fallback' }
  >['reason']
  readonly attemptedSteps: readonly RealtimeRuntimeStep[]
  readonly failedSteps: readonly RealtimeRuntimeStep[]
}

export interface RealtimeRuntimeOwner {
  readonly start: (
    bundle: Readonly<RealtimeSessionStartBundleValue>,
  ) => Promise<RealtimeRuntimeOutcome>
  readonly rollover: (
    bundle: Readonly<RealtimeSessionStartBundleValue>,
  ) => Promise<RealtimeRuntimeOutcome>
  readonly stop: (
    boundary?: RealtimeRuntimeCleanupBoundary,
  ) => Promise<RealtimeRuntimeOutcome>
  readonly dispose: () => Promise<RealtimeRuntimeOutcome>
  readonly interrupt: () => Promise<RealtimeRuntimeOutcome>
  readonly getSnapshot: () => RealtimeRuntimeSnapshot
}

interface OwnedResources {
  readonly stream: MediaStream
  readonly audioOutput: RealtimeRuntimeAudioOutput
  readonly session: RealtimeRuntimeSession
  readonly micOwner: RealtimeRuntimeMicOwner
  readonly playbackTransport: RealtimeRuntimePlaybackTransport
  readonly cleanup: RealtimeRuntimeCleanup
  readonly identity: Readonly<RealtimeSessionIdentity>
}

interface CleanupReport {
  readonly attemptedSteps: RealtimeRuntimeStep[]
  readonly failedSteps: RealtimeRuntimeStep[]
}

interface PartialStartResources {
  stream?: MediaStream
  audioOutput?: RealtimeRuntimeAudioOutput
  session?: RealtimeRuntimeSession
  micOwner?: RealtimeRuntimeMicOwner
  micAcquired?: boolean
  playbackTransport?: RealtimeRuntimePlaybackTransport
  cleanup?: RealtimeRuntimeCleanup
}

function freezeIdentity(
  identity: Readonly<RealtimeSessionIdentity>,
): Readonly<RealtimeSessionIdentity> {
  return Object.freeze({
    realtimeSessionId: identity.realtimeSessionId,
    sessionGeneration: identity.sessionGeneration,
  })
}

function sameIdentity(
  left: Readonly<RealtimeSessionIdentity>,
  right: Readonly<RealtimeSessionIdentity>,
): boolean {
  return left.realtimeSessionId === right.realtimeSessionId
    && left.sessionGeneration === right.sessionGeneration
}

function freezeOutcome(input: {
  readonly status: RealtimeRuntimeOutcome['status']
  readonly operation: RealtimeRuntimeOutcome['operation']
  readonly reason: string
  readonly cleanup?: 'attempted'
  readonly playback?: PlaybackCompletionResult
  readonly attemptedSteps?: readonly RealtimeRuntimeStep[]
  readonly failedSteps?: readonly RealtimeRuntimeStep[]
}): RealtimeRuntimeOutcome {
  return Object.freeze({
    status: input.status,
    operation: input.operation,
    reason: input.reason,
    ...(input.cleanup === undefined ? {} : { cleanup: input.cleanup }),
    ...(input.playback === undefined
      ? {}
      : input.playback.source === 'bounded_analyser_fallback'
        ? {
            playbackSource: input.playback.source,
            playbackReason: input.playback.reason,
          }
        : { playbackSource: input.playback.source }),
    attemptedSteps: Object.freeze([...(input.attemptedSteps ?? [])]),
    failedSteps: Object.freeze([...(input.failedSteps ?? [])]),
  })
}

export function createRealtimeRuntimeOwner(
  dependencies: RealtimeRuntimeOwnerDependencies,
): RealtimeRuntimeOwner {
  let state: RealtimeRuntimeState = 'idle'
  let current: OwnedResources | undefined
  let startPromise: Promise<RealtimeRuntimeOutcome> | undefined
  let rolloverPromise: Promise<RealtimeRuntimeOutcome> | undefined
  let rolloverAbort: AbortController | undefined

  const publish = (outcome: RealtimeRuntimeOutcome): RealtimeRuntimeOutcome => {
    try {
      const delivered = dependencies.eventSink?.(outcome)
      if (typeof (delivered as PromiseLike<void> | undefined)?.then === 'function') {
        void Promise.resolve(delivered).catch(() => undefined)
      }
    } catch {
      // Outcome delivery cannot block resource cleanup or lifecycle progress.
    }
    return outcome
  }

  const result = (
    operation: RealtimeRuntimeOutcome['operation'],
    status: RealtimeRuntimeOutcome['status'],
    reason: string,
    details: {
      cleanup?: 'attempted'
      playback?: PlaybackCompletionResult
      attemptedSteps?: readonly RealtimeRuntimeStep[]
      failedSteps?: readonly RealtimeRuntimeStep[]
    } = {},
  ): RealtimeRuntimeOutcome => publish(freezeOutcome({
    operation,
    status,
    reason,
    ...details,
  }))

  const runStep = async (
    report: CleanupReport,
    step: RealtimeRuntimeStep,
    action: () => MaybePromise<void>,
  ): Promise<void> => {
    report.attemptedSteps.push(step)
    try {
      await action()
    } catch {
      report.failedSteps.push(step)
    }
  }

  const stopStream = async (
    stream: MediaStream,
    report: CleanupReport,
  ): Promise<void> => {
    let tracks: readonly MediaStreamTrack[]
    try {
      tracks = stream.getTracks()
    } catch {
      report.attemptedSteps.push('stream_track_stop')
      report.failedSteps.push('stream_track_stop')
      return
    }
    for (const track of tracks) {
      await runStep(report, 'stream_track_stop', () => track.stop())
    }
  }

  const cleanupResources = async (
    owned: OwnedResources,
    boundary: RealtimeRuntimeCleanupBoundary,
    releaseMic: boolean,
  ): Promise<CleanupReport> => {
    const report: CleanupReport = { attemptedSteps: [], failedSteps: [] }
    await runStep(report, 'playback_dispose', () => owned.playbackTransport.dispose())
    await runStep(report, 'audio_output_dispose', () => owned.audioOutput.dispose())
    if (releaseMic) {
      await runStep(report, 'mic_release', () => owned.micOwner.release())
    }
    await runStep(report, 'cleanup_run', () => owned.cleanup.run(boundary))
    return report
  }

  const cleanupPartialStart = async (
    partial: PartialStartResources,
  ): Promise<CleanupReport> => {
    const report: CleanupReport = { attemptedSteps: [], failedSteps: [] }
    if (partial.playbackTransport !== undefined) {
      await runStep(report, 'playback_dispose', () => partial.playbackTransport!.dispose())
    }
    if (partial.audioOutput !== undefined) {
      await runStep(report, 'audio_output_dispose', () => partial.audioOutput!.dispose())
    }
    if (partial.micOwner !== undefined && partial.micAcquired === true) {
      await runStep(report, 'mic_release', () => partial.micOwner!.release())
    } else {
      if (partial.session !== undefined) {
        await runStep(report, 'session_close', () => partial.session!.close(START_FAILURE_CLOSE_REASON))
      }
      if (partial.stream !== undefined) await stopStream(partial.stream, report)
    }
    if (partial.cleanup !== undefined) {
      await runStep(report, 'cleanup_run', () => partial.cleanup!.run('close'))
    }
    return report
  }

  const cleanupRolloverCandidate = async (
    partial: {
      readonly audioOutput?: RealtimeRuntimeAudioOutput
      readonly session?: RealtimeRuntimeSession
      readonly playbackTransport?: RealtimeRuntimePlaybackTransport
      readonly cleanup?: RealtimeRuntimeCleanup
    },
  ): Promise<CleanupReport> => {
    const report: CleanupReport = { attemptedSteps: [], failedSteps: [] }
    if (partial.playbackTransport !== undefined) {
      await runStep(report, 'next_playback_dispose', () => partial.playbackTransport!.dispose())
    }
    if (partial.audioOutput !== undefined) {
      await runStep(report, 'next_audio_output_dispose', () => partial.audioOutput!.dispose())
    }
    if (partial.session !== undefined) {
      await runStep(report, 'next_session_close', () => partial.session!.close('rollover_pre_handoff_failed'))
    }
    if (partial.cleanup !== undefined) {
      await runStep(report, 'next_cleanup_run', () => partial.cleanup!.run('close'))
    }
    return report
  }

  const performStart = async (
    bundle: Readonly<RealtimeSessionStartBundleValue>,
  ): Promise<RealtimeRuntimeOutcome> => {
    let stage: RealtimeRuntimeStartStage = 'media_stream'
    const partial: PartialStartResources = {}

    try {
      partial.stream = await dependencies.acquireMediaStream()
      stage = 'audio_output'
      partial.audioOutput = await dependencies.createAudioOutput()
      stage = 'session_create'
      partial.session = await dependencies.createSession(
        bundle,
        partial.stream,
        partial.audioOutput.audioElement,
      )
      stage = 'mic_owner_create'
      partial.micOwner = await dependencies.createMicOwner(partial.session)
      stage = 'mic_acquire'
      await partial.micOwner.acquire(partial.stream)
      partial.micAcquired = true
      stage = 'playback_transport'
      partial.playbackTransport = await dependencies.createPlaybackTransport(partial.session)
      stage = 'cleanup_factory'
      partial.cleanup = await dependencies.createCleanup(partial.session)
      stage = 'connect'
      await partial.session.connect()

      const identity = freezeIdentity(bundle.identity)
      current = {
        stream: partial.stream,
        audioOutput: partial.audioOutput,
        session: partial.session,
        micOwner: partial.micOwner,
        playbackTransport: partial.playbackTransport,
        cleanup: partial.cleanup,
        identity,
      }
      state = 'active'
      return result('start', 'success', 'started')
    } catch {
      const reason = stage === 'connect' && partial.session !== undefined
        ? readValidatedConnectFailureToken(partial.session)
          ?? START_FAILURE_REASON_BY_STAGE[stage]
        : START_FAILURE_REASON_BY_STAGE[stage]
      const cleanup = await cleanupPartialStart(partial)
      current = undefined
      if (state !== 'disposed') state = 'idle'
      return result('start', 'failed', reason, {
        cleanup: 'attempted',
        attemptedSteps: cleanup.attemptedSteps,
        failedSteps: cleanup.failedSteps,
      })
    }
  }

  const start = (
    bundle: Readonly<RealtimeSessionStartBundleValue>,
  ): Promise<RealtimeRuntimeOutcome> => {
    if (state === 'disposed') {
      return Promise.resolve(result('start', 'ignored', 'runtime_disposed'))
    }
    if (startPromise !== undefined) return startPromise
    if (state === 'active' && current !== undefined && sameIdentity(current.identity, bundle.identity)) {
      return Promise.resolve(result('start', 'ignored', 'duplicate_generation'))
    }
    if (state !== 'idle') {
      return Promise.resolve(result('start', 'ignored', 'start_requires_idle'))
    }

    state = 'starting'
    const operation = performStart(bundle)
    startPromise = operation
    void operation.finally(() => {
      if (startPromise === operation) startPromise = undefined
    }).catch(() => undefined)
    return operation
  }

  const performRollover = async (
    bundle: Readonly<RealtimeSessionStartBundleValue>,
    old: OwnedResources,
    signal: AbortSignal,
  ): Promise<RealtimeRuntimeOutcome> => {
    let playback: PlaybackCompletionResult
    const completionFactory = dependencies.createPlaybackCompletion
    if (
      completionFactory === undefined
      || old.audioOutput.analyser === undefined
    ) {
      state = 'active'
      return result('rollover', 'failed', 'rollover_playback_unavailable')
    }

    try {
      playback = await completionFactory(
        old.playbackTransport,
        old.audioOutput.analyser,
      ).waitForActualEnd(signal)
    } catch {
      state = 'active'
      return result(
        'rollover',
        signal.aborted ? 'ignored' : 'failed',
        signal.aborted ? 'rollover_aborted' : 'rollover_playback_failed',
      )
    }
    if (signal.aborted) {
      state = 'active'
      return result('rollover', 'ignored', 'rollover_aborted')
    }

    let nextAudio: RealtimeRuntimeAudioOutput | undefined
    let nextSession: RealtimeRuntimeSession | undefined
    let nextPlayback: RealtimeRuntimePlaybackTransport | undefined
    let nextCleanup: RealtimeRuntimeCleanup | undefined

    try {
      nextAudio = await dependencies.createAudioOutput()
      nextSession = await dependencies.createSession(bundle, old.stream, nextAudio.audioElement)
      nextPlayback = await dependencies.createPlaybackTransport(nextSession)
      nextCleanup = await dependencies.createCleanup(nextSession)
    } catch {
      const cleanup = await cleanupRolloverCandidate({
        audioOutput: nextAudio,
        session: nextSession,
        playbackTransport: nextPlayback,
        cleanup: nextCleanup,
      })
      state = 'active'
      return result('rollover', 'failed', 'rollover_setup_failed', {
        cleanup: 'attempted',
        playback,
        attemptedSteps: cleanup.attemptedSteps,
        failedSteps: cleanup.failedSteps,
      })
    }

    const rollover = old.micOwner.rollover
    if (rollover === undefined) {
      const cleanup = await cleanupRolloverCandidate({
        audioOutput: nextAudio,
        session: nextSession,
        playbackTransport: nextPlayback,
        cleanup: nextCleanup,
      })
      state = 'active'
      return result('rollover', 'failed', 'rollover_handoff_unavailable', {
        cleanup: 'attempted',
        playback,
        attemptedSteps: cleanup.attemptedSteps,
        failedSteps: cleanup.failedSteps,
      })
    }

    try {
      const returnedStream = await rollover(nextSession, 'generation_rollover')
      if (returnedStream !== old.stream) throw new Error('stream_mismatch')
    } catch {
      const cleanup = await cleanupRolloverCandidate({
        audioOutput: nextAudio,
        session: nextSession,
        playbackTransport: nextPlayback,
        cleanup: nextCleanup,
      })
      state = 'active'
      return result('rollover', 'failed', 'rollover_handoff_failed', {
        cleanup: 'attempted',
        playback,
        attemptedSteps: cleanup.attemptedSteps,
        failedSteps: cleanup.failedSteps,
      })
    }

    const oldCleanup = await cleanupResources(old, 'rollover', false)

    try {
      await nextSession.connect()
    } catch {
      const transferred: OwnedResources = {
        stream: old.stream,
        audioOutput: nextAudio,
        session: nextSession,
        micOwner: old.micOwner,
        playbackTransport: nextPlayback,
        cleanup: nextCleanup,
        identity: freezeIdentity(bundle.identity),
      }
      const nextReport = await cleanupResources(transferred, 'close', true)
      current = undefined
      state = 'idle'
      return result('rollover', 'failed', 'rollover_connect_failed', {
        cleanup: 'attempted',
        playback,
        attemptedSteps: [...oldCleanup.attemptedSteps, ...nextReport.attemptedSteps],
        failedSteps: [...oldCleanup.failedSteps, ...nextReport.failedSteps],
      })
    }

    current = {
      stream: old.stream,
      audioOutput: nextAudio,
      session: nextSession,
      micOwner: old.micOwner,
      playbackTransport: nextPlayback,
      cleanup: nextCleanup,
      identity: freezeIdentity(bundle.identity),
    }
    state = 'active'
    return result(
      'rollover',
      'success',
      oldCleanup.failedSteps.length === 0 ? 'rolled_over' : 'rolled_over_cleanup_degraded',
      {
        cleanup: oldCleanup.attemptedSteps.length === 0 ? undefined : 'attempted',
        playback,
        attemptedSteps: oldCleanup.attemptedSteps,
        failedSteps: oldCleanup.failedSteps,
      },
    )
  }

  const rollover = (
    bundle: Readonly<RealtimeSessionStartBundleValue>,
  ): Promise<RealtimeRuntimeOutcome> => {
    if (state === 'disposed') {
      return Promise.resolve(result('rollover', 'ignored', 'runtime_disposed'))
    }
    if (rolloverPromise !== undefined) return rolloverPromise
    if (state !== 'active' || current === undefined) {
      return Promise.resolve(result('rollover', 'ignored', 'rollover_requires_active'))
    }
    if (
      sameIdentity(current.identity, bundle.identity)
      || bundle.identity.sessionGeneration <= current.identity.sessionGeneration
    ) {
      return Promise.resolve(result('rollover', 'ignored', 'duplicate_generation'))
    }

    const old = current
    state = 'rolling_over'
    rolloverAbort = new AbortController()
    const operation = performRollover(bundle, old, rolloverAbort.signal)
    rolloverPromise = operation
    void operation.finally(() => {
      if (rolloverPromise === operation) {
        rolloverPromise = undefined
        rolloverAbort = undefined
      }
    }).catch(() => undefined)
    return operation
  }

  const stop = async (
    boundary: RealtimeRuntimeCleanupBoundary = 'stop',
  ): Promise<RealtimeRuntimeOutcome> => {
    if (state === 'disposed') return result('stop', 'ignored', 'runtime_disposed')
    if (rolloverPromise !== undefined) {
      rolloverAbort?.abort()
      await rolloverPromise
      return stop(boundary)
    }
    if (startPromise !== undefined) {
      await startPromise
      return stop(boundary)
    }
    if (current === undefined) return result('stop', 'ignored', 'stop_no_active_session')
    if (state === 'stopping') return result('stop', 'ignored', 'stop_in_progress')

    state = 'stopping'
    const owned = current
    const cleanup = await cleanupResources(owned, boundary, true)
    if (cleanup.failedSteps.length > 0) {
      state = 'active'
      return result('stop', 'failed', 'stop_cleanup_failed', {
        cleanup: 'attempted',
        attemptedSteps: cleanup.attemptedSteps,
        failedSteps: cleanup.failedSteps,
      })
    }

    current = undefined
    state = 'idle'
    return result('stop', 'success', 'stopped', {
      cleanup: 'attempted',
      attemptedSteps: cleanup.attemptedSteps,
    })
  }

  const dispose = async (): Promise<RealtimeRuntimeOutcome> => {
    if (state === 'disposed') return result('dispose', 'ignored', 'runtime_disposed')
    if (rolloverPromise !== undefined) {
      rolloverAbort?.abort()
      await rolloverPromise
    }
    if (startPromise !== undefined) await startPromise

    const owned = current
    if (owned === undefined) {
      state = 'disposed'
      return result('dispose', 'success', 'disposed')
    }

    state = 'stopping'
    const cleanup = await cleanupResources(owned, 'dispose', true)
    current = undefined
    state = 'disposed'
    return result(
      'dispose',
      cleanup.failedSteps.length === 0 ? 'success' : 'failed',
      cleanup.failedSteps.length === 0 ? 'disposed' : 'dispose_cleanup_failed',
      {
        cleanup: 'attempted',
        attemptedSteps: cleanup.attemptedSteps,
        failedSteps: cleanup.failedSteps,
      },
    )
  }

  const interrupt = async (): Promise<RealtimeRuntimeOutcome> => {
    if (rolloverPromise !== undefined) {
      rolloverAbort?.abort()
      await rolloverPromise
      return interrupt()
    }
    if (state !== 'active' || current === undefined) {
      return result('interrupt', 'ignored', 'interrupt_requires_active')
    }
    try {
      await current.session.interrupt()
      return result('interrupt', 'success', 'interrupted')
    } catch {
      return result('interrupt', 'failed', 'interrupt_failed')
    }
  }

  const getSnapshot = (): RealtimeRuntimeSnapshot => Object.freeze({
    state,
    ...(current === undefined ? {} : { currentIdentity: freezeIdentity(current.identity) }),
  })

  return Object.freeze({
    start,
    rollover,
    stop,
    dispose,
    interrupt,
    getSnapshot,
  })
}
