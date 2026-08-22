import type {
  RealtimeSessionIdentity,
  RealtimeSessionStartBundleValue,
} from '../../../src/shared/bridge'
import type { PlaybackCompletionResult } from './playback-completion'

type MaybePromise<T> = T | PromiseLike<T>

const START_FAILURE_CLOSE_REASON = 'start_failed'

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
  | 'old_playback_dispose'
  | 'old_audio_output_dispose'
  | 'old_cleanup_run'
  | 'next_connect'
  | 'next_playback_dispose'
  | 'next_audio_output_dispose'
  | 'next_mic_release'
  | 'next_session_close'
  | 'next_cleanup_run'
  | 'mic_release'
  | 'cleanup_factory_create'
  | 'session_close'
  | 'stream_track_stop'
  | 'cleanup_run'

export interface RealtimeRuntimeAudioOutput {
  readonly audioElement: HTMLAudioElement
  readonly analyser?: object
  readonly dispose: () => MaybePromise<void>
}

export interface RealtimeRuntimeSession extends RealtimeSessionIdentity {
  readonly connect: () => MaybePromise<void>
  readonly interrupt: () => MaybePromise<void>
  readonly close: (reason: string) => MaybePromise<void>
  readonly onOutputAudioBufferStopped: (listener: () => void) => void | (() => void)
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
  readonly createMicOwner: () => MaybePromise<RealtimeRuntimeMicOwner>
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

interface LooseTrackProgress {
  readonly track: MediaStreamTrack
  stopped: boolean
}

interface OwnedResources {
  readonly stream: MediaStream
  audioOutput?: RealtimeRuntimeAudioOutput
  session?: RealtimeRuntimeSession
  micOwner?: RealtimeRuntimeMicOwner
  micAcquired?: boolean
  playbackTransport?: RealtimeRuntimePlaybackTransport
  cleanup?: RealtimeRuntimeCleanup
  cleanupBoundary?: RealtimeRuntimeCleanupBoundary
  cleanupFactoryAttempted?: boolean
  cleanupFactoryFailed?: boolean
  cleanupFactoryTarget?: Readonly<RealtimeSessionIdentity>
  looseTracks?: LooseTrackProgress[]
  micTeardown?: 'acquired' | 'loose' | 'complete'
  sessionCloseCompleted?: boolean
}

interface CleanupReport {
  readonly succeeded: boolean
  readonly attemptedSteps: readonly RealtimeRuntimeStep[]
  readonly failedSteps: readonly RealtimeRuntimeStep[]
}

interface StartControl {
  readonly identity: Readonly<RealtimeSessionIdentity>
  cancelled: boolean
}

interface RolloverControl {
  readonly identity: Readonly<RealtimeSessionIdentity>
  readonly abortController: AbortController
  abortIntent?: 'stop' | 'dispose' | 'interrupt'
  phase: RolloverPhase
  handoffCompleted: boolean
}

type RolloverPhase =
  | 'playback_wait'
  | 'preparing'
  | 'mic_handoff'
  | 'post_handoff'

interface PendingPreHandoffCleanup {
  readonly oldIdentity: Readonly<RealtimeSessionIdentity>
  readonly failedSteps: readonly RealtimeRuntimeStep[]
  readonly nextAudioOutput?: RealtimeRuntimeAudioOutput
  readonly nextSession?: RealtimeRuntimeSession
  readonly nextPlaybackTransport?: RealtimeRuntimePlaybackTransport
  readonly nextCleanup?: RealtimeRuntimeCleanup
}

interface PendingPostHandoffCleanup {
  readonly oldIdentity: Readonly<RealtimeSessionIdentity>
  readonly oldPlaybackTransport?: RealtimeRuntimePlaybackTransport
  readonly oldAudioOutput?: RealtimeRuntimeAudioOutput
  readonly oldCleanup?: RealtimeRuntimeCleanup
}

interface CleanupInFlight {
  readonly operation: 'stop' | 'dispose'
  readonly promise: Promise<RealtimeRuntimeOutcome>
}

interface LifecycleAfterRolloverInFlight {
  readonly operation: 'stop' | 'dispose' | 'interrupt'
  readonly promise: Promise<RealtimeRuntimeOutcome>
}

function identityKey(identity: Readonly<RealtimeSessionIdentity>): string {
  return `${identity.realtimeSessionId}\u0000${identity.sessionGeneration}`
}

function sameIdentity(
  left: Readonly<RealtimeSessionIdentity>,
  right: Readonly<RealtimeSessionIdentity>,
): boolean {
  return (
    left.realtimeSessionId === right.realtimeSessionId &&
    left.sessionGeneration === right.sessionGeneration
  )
}

function freezeIdentity(
  identity: Readonly<RealtimeSessionIdentity>,
): Readonly<RealtimeSessionIdentity> {
  return Object.freeze({
    realtimeSessionId: identity.realtimeSessionId,
    sessionGeneration: identity.sessionGeneration,
  })
}

function freezeSnapshot(
  state: RealtimeRuntimeState,
  currentIdentity?: Readonly<RealtimeSessionIdentity>,
): RealtimeRuntimeSnapshot {
  if (currentIdentity === undefined) {
    return Object.freeze({ state })
  }
  return Object.freeze({
    state,
    currentIdentity: freezeIdentity(currentIdentity),
  })
}

function freezeOutcome(input: {
  readonly status: RealtimeRuntimeOutcome['status']
  readonly operation: RealtimeRuntimeOutcome['operation']
  readonly reason: string
  readonly cleanup?: RealtimeRuntimeOutcome['cleanup']
  readonly playbackSource?: RealtimeRuntimeOutcome['playbackSource']
  readonly playbackReason?: RealtimeRuntimeOutcome['playbackReason']
  readonly attemptedSteps?: readonly RealtimeRuntimeStep[]
  readonly failedSteps?: readonly RealtimeRuntimeStep[]
}): RealtimeRuntimeOutcome {
  const attemptedSteps = Object.freeze([...(input.attemptedSteps ?? [])])
  const failedSteps = Object.freeze([...(input.failedSteps ?? [])])
  return Object.freeze({
    status: input.status,
    operation: input.operation,
    reason: input.reason,
    ...(input.cleanup === undefined ? {} : { cleanup: input.cleanup }),
    ...(input.playbackSource === undefined
      ? {}
      : { playbackSource: input.playbackSource }),
    ...(input.playbackReason === undefined
      ? {}
      : { playbackReason: input.playbackReason }),
    attemptedSteps,
    failedSteps,
  })
}

export function createRealtimeRuntimeOwner(
  dependencies: RealtimeRuntimeOwnerDependencies,
): RealtimeRuntimeOwner {
  let state: RealtimeRuntimeState = 'idle'
  let snapshot = freezeSnapshot(state)
  let currentIdentity: Readonly<RealtimeSessionIdentity> | undefined
  let ownedResources: OwnedResources | undefined
  let highestReservedGeneration = Number.NEGATIVE_INFINITY
  let inFlightIdentity: Readonly<RealtimeSessionIdentity> | undefined
  let inFlightStart: Promise<RealtimeRuntimeOutcome> | undefined
  let inFlightStartControl: StartControl | undefined
  let inFlightRollover: Promise<RealtimeRuntimeOutcome> | undefined
  let inFlightRolloverControl: RolloverControl | undefined
  let pendingPreHandoffCleanup: PendingPreHandoffCleanup | undefined
  let pendingPostHandoffCleanup: PendingPostHandoffCleanup | undefined
  let cleanupInFlight: CleanupInFlight | undefined
  let lifecycleAfterRolloverInFlight: LifecycleAfterRolloverInFlight | undefined
  let pendingStartDispose: Promise<RealtimeRuntimeOutcome> | undefined
  let disposeAfterStop: Promise<RealtimeRuntimeOutcome> | undefined
  const reservedIdentityKeys = new Set<string>()

  function emit(outcome: RealtimeRuntimeOutcome): void {
    if (dependencies.eventSink === undefined) {
      return
    }
    try {
      const result = dependencies.eventSink(outcome)
      if (result !== undefined) {
        void Promise.resolve(result).catch(() => undefined)
      }
    } catch {
      // Event delivery must not change the runtime-owner result.
    }
  }

  function resultPromise(outcome: RealtimeRuntimeOutcome): Promise<RealtimeRuntimeOutcome> {
    emit(outcome)
    return Promise.resolve(outcome)
  }

  function setState(
    nextState: RealtimeRuntimeState,
    nextIdentity?: Readonly<RealtimeSessionIdentity>,
  ): void {
    state = nextState
    currentIdentity = nextIdentity === undefined ? undefined : freezeIdentity(nextIdentity)
    snapshot = freezeSnapshot(state, currentIdentity)
  }

  async function runCleanup(
    resources: OwnedResources | undefined,
    boundary: RealtimeRuntimeCleanupBoundary,
    startFailure: boolean,
  ): Promise<CleanupReport> {
    const attemptedSteps: RealtimeRuntimeStep[] = []
    const failedSteps: RealtimeRuntimeStep[] = []

    if (resources === undefined) {
      return { succeeded: true, attemptedSteps, failedSteps }
    }

    if (startFailure) {
      resources.cleanupBoundary = 'close'
      if (resources.micTeardown === undefined) {
        resources.micTeardown = resources.micAcquired === true ? 'acquired' : 'loose'
      }
    }

    if (resources.playbackTransport !== undefined) {
      const step: RealtimeRuntimeStep = 'playback_dispose'
      attemptedSteps.push(step)
      try {
        await resources.playbackTransport.dispose()
        resources.playbackTransport = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (resources.audioOutput !== undefined) {
      const step: RealtimeRuntimeStep = 'audio_output_dispose'
      attemptedSteps.push(step)
      try {
        await resources.audioOutput.dispose()
        resources.audioOutput = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (resources.micTeardown === 'acquired') {
      if (resources.micAcquired === true) {
        const step: RealtimeRuntimeStep = 'mic_release'
        attemptedSteps.push(step)
        try {
          if (resources.micOwner === undefined) {
            throw new Error('mic_owner_missing')
          }
          await resources.micOwner.release()
          resources.micAcquired = false
          resources.micOwner = undefined
          resources.micTeardown = 'complete'
        } catch {
          failedSteps.push(step)
        }
      } else {
        resources.micTeardown = 'complete'
      }
    } else if (resources.micTeardown === 'loose') {
      if (resources.session !== undefined && resources.sessionCloseCompleted !== true) {
        const step: RealtimeRuntimeStep = 'session_close'
        attemptedSteps.push(step)
        try {
          await resources.session.close(START_FAILURE_CLOSE_REASON)
          resources.sessionCloseCompleted = true
        } catch {
          failedSteps.push(step)
        }
      }

      if (resources.looseTracks === undefined) {
        try {
          resources.looseTracks = resources.stream
            .getTracks()
            .map((track) => ({ track, stopped: false }))
        } catch {
          const step: RealtimeRuntimeStep = 'stream_track_stop'
          attemptedSteps.push(step)
          failedSteps.push(step)
        }
      }

      if (resources.looseTracks !== undefined) {
        for (const progress of resources.looseTracks) {
          if (progress.stopped) {
            continue
          }
          const step: RealtimeRuntimeStep = 'stream_track_stop'
          attemptedSteps.push(step)
          try {
            await progress.track.stop()
            progress.stopped = true
          } catch {
            failedSteps.push(step)
          }
        }
      }

      const tracksStopped =
        resources.looseTracks !== undefined &&
        resources.looseTracks.every((progress) => progress.stopped)
      const sessionClosed =
        resources.session === undefined || resources.sessionCloseCompleted === true
      if (tracksStopped && sessionClosed) {
        resources.micTeardown = 'complete'
      }
    }

    if (
      startFailure &&
      resources.cleanupFactoryFailed === true &&
      resources.cleanup === undefined
    ) {
      const step: RealtimeRuntimeStep = 'cleanup_factory_create'
      attemptedSteps.push(step)
      failedSteps.push(step)
    } else if (
      resources.cleanup === undefined &&
      resources.cleanupFactoryTarget !== undefined &&
      (!startFailure || resources.cleanupFactoryAttempted !== true)
    ) {
      const step: RealtimeRuntimeStep = 'cleanup_factory_create'
      attemptedSteps.push(step)
      resources.cleanupFactoryAttempted = true
      try {
        resources.cleanup = await dependencies.createCleanup(resources.cleanupFactoryTarget)
        resources.cleanupFactoryFailed = false
      } catch {
        resources.cleanupFactoryFailed = true
        failedSteps.push(step)
      }
    }

    if (resources.cleanup !== undefined) {
      const step: RealtimeRuntimeStep = 'cleanup_run'
      attemptedSteps.push(step)
      try {
        await resources.cleanup.run(resources.cleanupBoundary ?? boundary)
        resources.cleanup = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    const pending =
      resources.playbackTransport !== undefined ||
      resources.audioOutput !== undefined ||
      resources.micTeardown === 'acquired' ||
      resources.micTeardown === 'loose' ||
      resources.cleanup !== undefined ||
      (resources.cleanupFactoryTarget !== undefined &&
        resources.cleanup === undefined &&
        (resources.cleanupFactoryAttempted !== true || resources.cleanupFactoryFailed === true))

    return {
      succeeded: failedSteps.length === 0 && !pending,
      attemptedSteps,
      failedSteps,
    }
  }

  async function retryPendingPreHandoffCleanup(): Promise<CleanupReport> {
    const pending = pendingPreHandoffCleanup
    const attemptedSteps: RealtimeRuntimeStep[] = []
    const failedSteps: RealtimeRuntimeStep[] = []

    if (pending === undefined) {
      return { succeeded: true, attemptedSteps, failedSteps }
    }

    let nextPlaybackTransport = pending.nextPlaybackTransport
    let nextAudioOutput = pending.nextAudioOutput
    let nextSession = pending.nextSession
    let nextCleanup = pending.nextCleanup

    if (nextPlaybackTransport !== undefined) {
      const step: RealtimeRuntimeStep = 'next_playback_dispose'
      attemptedSteps.push(step)
      try {
        await nextPlaybackTransport.dispose()
        nextPlaybackTransport = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (nextAudioOutput !== undefined) {
      const step: RealtimeRuntimeStep = 'next_audio_output_dispose'
      attemptedSteps.push(step)
      try {
        await nextAudioOutput.dispose()
        nextAudioOutput = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (nextSession !== undefined) {
      const step: RealtimeRuntimeStep = 'next_session_close'
      attemptedSteps.push(step)
      try {
        await nextSession.close('rollover_pre_handoff_failed')
        nextSession = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (nextCleanup !== undefined) {
      const step: RealtimeRuntimeStep = 'next_cleanup_run'
      attemptedSteps.push(step)
      try {
        await nextCleanup.run('close')
        nextCleanup = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (
      nextPlaybackTransport === undefined &&
      nextAudioOutput === undefined &&
      nextSession === undefined &&
      nextCleanup === undefined
    ) {
      pendingPreHandoffCleanup = undefined
    } else {
      pendingPreHandoffCleanup = Object.freeze({
        oldIdentity: pending.oldIdentity,
        failedSteps: Object.freeze([...failedSteps]),
        ...(nextAudioOutput === undefined ? {} : { nextAudioOutput }),
        ...(nextSession === undefined ? {} : { nextSession }),
        ...(nextPlaybackTransport === undefined
          ? {}
          : { nextPlaybackTransport }),
        ...(nextCleanup === undefined ? {} : { nextCleanup }),
      })
    }

    return {
      succeeded: pendingPreHandoffCleanup === undefined,
      attemptedSteps,
      failedSteps,
    }
  }

  async function retryPendingPostHandoffCleanup(): Promise<CleanupReport> {
    const pending = pendingPostHandoffCleanup
    const attemptedSteps: RealtimeRuntimeStep[] = []
    const failedSteps: RealtimeRuntimeStep[] = []

    if (pending === undefined) {
      return { succeeded: true, attemptedSteps, failedSteps }
    }

    let oldPlaybackTransport = pending.oldPlaybackTransport
    let oldAudioOutput = pending.oldAudioOutput
    let oldCleanup = pending.oldCleanup

    if (oldPlaybackTransport !== undefined) {
      const step: RealtimeRuntimeStep = 'old_playback_dispose'
      attemptedSteps.push(step)
      try {
        await oldPlaybackTransport.dispose()
        oldPlaybackTransport = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (oldAudioOutput !== undefined) {
      const step: RealtimeRuntimeStep = 'old_audio_output_dispose'
      attemptedSteps.push(step)
      try {
        await oldAudioOutput.dispose()
        oldAudioOutput = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (oldCleanup !== undefined) {
      const step: RealtimeRuntimeStep = 'old_cleanup_run'
      attemptedSteps.push(step)
      try {
        await oldCleanup.run('rollover')
        oldCleanup = undefined
      } catch {
        failedSteps.push(step)
      }
    }

    if (
      oldPlaybackTransport === undefined &&
      oldAudioOutput === undefined &&
      oldCleanup === undefined
    ) {
      pendingPostHandoffCleanup = undefined
    } else {
      pendingPostHandoffCleanup = Object.freeze({
        oldIdentity: pending.oldIdentity,
        ...(oldPlaybackTransport === undefined ? {} : { oldPlaybackTransport }),
        ...(oldAudioOutput === undefined ? {} : { oldAudioOutput }),
        ...(oldCleanup === undefined ? {} : { oldCleanup }),
      })
    }

    return {
      succeeded: pendingPostHandoffCleanup === undefined,
      attemptedSteps,
      failedSteps,
    }
  }

  async function performStart(
    bundle: Readonly<RealtimeSessionStartBundleValue>,
    control: StartControl,
  ): Promise<RealtimeRuntimeOutcome> {
    let resources: OwnedResources | undefined

    try {
      const stream = await dependencies.acquireMediaStream()
      resources = { stream }
      ownedResources = resources
      if (control.cancelled) {
        throw new Error('start_cancelled')
      }

      const audioOutput = await dependencies.createAudioOutput()
      resources.audioOutput = audioOutput
      if (control.cancelled) {
        throw new Error('start_cancelled')
      }

      const session = await dependencies.createSession(
        bundle,
        resources.stream,
        audioOutput.audioElement,
      )
      resources.session = session
      resources.cleanupFactoryTarget = freezeIdentity(session)
      if (control.cancelled) {
        throw new Error('start_cancelled')
      }

      const micOwner = await dependencies.createMicOwner()
      resources.micOwner = micOwner
      if (control.cancelled) {
        throw new Error('start_cancelled')
      }

      await micOwner.acquire(resources.stream)
      resources.micAcquired = true
      resources.micTeardown = 'acquired'
      if (control.cancelled) {
        throw new Error('start_cancelled')
      }

      const playbackTransport = await dependencies.createPlaybackTransport(session)
      resources.playbackTransport = playbackTransport
      if (control.cancelled) {
        throw new Error('start_cancelled')
      }

      resources.cleanupFactoryAttempted = true
      try {
        resources.cleanup = await dependencies.createCleanup(session)
        resources.cleanupFactoryFailed = false
      } catch {
        resources.cleanupFactoryFailed = true
        throw new Error('cleanup_factory_failed')
      }
      if (control.cancelled) {
        throw new Error('start_cancelled')
      }

      await session.connect()

      if (control.cancelled || state === 'disposed') {
        throw new Error('start_cancelled')
      }

      setState('active', resources.session)
      const outcome = freezeOutcome({
        status: 'success',
        operation: 'start',
        reason: 'started',
      })
      emit(outcome)
      return outcome
    } catch {
      const cleanupReport = await runCleanup(resources, 'close', true)
      if (cleanupReport.succeeded) {
        ownedResources = undefined
        if (state === 'disposed') {
          setState('disposed')
        } else if (control.cancelled) {
          setState('stopping', currentIdentity ?? control.identity)
        } else {
          setState('idle')
        }
      } else {
        const stoppingIdentity =
          resources?.session ??
          resources?.cleanupFactoryTarget ??
          currentIdentity ??
          control.identity
        setState('stopping', stoppingIdentity)
      }
      const outcome = freezeOutcome({
        status: 'failed',
        operation: 'start',
        reason: 'start_failed',
        cleanup: 'attempted',
        attemptedSteps: cleanupReport.attemptedSteps,
        failedSteps: cleanupReport.failedSteps,
      })
      emit(outcome)
      return outcome
    }
  }

  async function performRollover(
    bundle: Readonly<RealtimeSessionStartBundleValue>,
    control: RolloverControl,
    resources: OwnedResources,
    oldIdentity: Readonly<RealtimeSessionIdentity>,
  ): Promise<RealtimeRuntimeOutcome> {
    const attemptedSteps: RealtimeRuntimeStep[] = []
    const failedSteps: RealtimeRuntimeStep[] = []

    let nextAudioOutput: RealtimeRuntimeAudioOutput | undefined
    let nextSession: RealtimeRuntimeSession | undefined
    let nextPlaybackTransport: RealtimeRuntimePlaybackTransport | undefined
    let nextCleanup: RealtimeRuntimeCleanup | undefined
    let nextOwnedResources: OwnedResources | undefined

    const cleanupPreparedNextResources = async (): Promise<void> => {
      if (nextPlaybackTransport !== undefined) {
        const step: RealtimeRuntimeStep = 'next_playback_dispose'
        attemptedSteps.push(step)
        try {
          await nextPlaybackTransport.dispose()
          nextPlaybackTransport = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      if (nextAudioOutput !== undefined) {
        const step: RealtimeRuntimeStep = 'next_audio_output_dispose'
        attemptedSteps.push(step)
        try {
          await nextAudioOutput.dispose()
          nextAudioOutput = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      if (nextSession !== undefined) {
        const step: RealtimeRuntimeStep = 'next_session_close'
        attemptedSteps.push(step)
        try {
          await nextSession.close('rollover_pre_handoff_failed')
          nextSession = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      if (nextCleanup !== undefined) {
        const step: RealtimeRuntimeStep = 'next_cleanup_run'
        attemptedSteps.push(step)
        try {
          await nextCleanup.run('close')
          nextCleanup = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      if (failedSteps.length === 0) {
        pendingPreHandoffCleanup = undefined
        return
      }

      pendingPreHandoffCleanup = Object.freeze({
        oldIdentity: freezeIdentity(oldIdentity),
        failedSteps: Object.freeze([...failedSteps]),
        ...(nextAudioOutput === undefined ? {} : { nextAudioOutput }),
        ...(nextSession === undefined ? {} : { nextSession }),
        ...(nextPlaybackTransport === undefined
          ? {}
          : { nextPlaybackTransport }),
        ...(nextCleanup === undefined ? {} : { nextCleanup }),
      })
    }

    const cleanupTransferredNextResources = async (
      transferredResources: OwnedResources,
    ): Promise<boolean> => {
      if (transferredResources.playbackTransport !== undefined) {
        const step: RealtimeRuntimeStep = 'next_playback_dispose'
        attemptedSteps.push(step)
        try {
          await transferredResources.playbackTransport.dispose()
          transferredResources.playbackTransport = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      if (transferredResources.audioOutput !== undefined) {
        const step: RealtimeRuntimeStep = 'next_audio_output_dispose'
        attemptedSteps.push(step)
        try {
          await transferredResources.audioOutput.dispose()
          transferredResources.audioOutput = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      if (transferredResources.micTeardown === 'acquired') {
        const step: RealtimeRuntimeStep = 'next_mic_release'
        attemptedSteps.push(step)
        try {
          if (transferredResources.micOwner === undefined) {
            throw new Error('mic_owner_missing')
          }
          await transferredResources.micOwner.release()
          transferredResources.micAcquired = false
          transferredResources.micOwner = undefined
          transferredResources.micTeardown = 'complete'
          transferredResources.session = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      if (transferredResources.cleanup !== undefined) {
        const step: RealtimeRuntimeStep = 'next_cleanup_run'
        attemptedSteps.push(step)
        try {
          await transferredResources.cleanup.run('close')
          transferredResources.cleanup = undefined
          transferredResources.cleanupFactoryAttempted = false
          transferredResources.cleanupFactoryFailed = false
          transferredResources.cleanupFactoryTarget = undefined
        } catch {
          failedSteps.push(step)
        }
      }

      return (
        transferredResources.playbackTransport === undefined &&
        transferredResources.audioOutput === undefined &&
        transferredResources.micTeardown !== 'acquired' &&
        transferredResources.cleanup === undefined
      )
    }

    const throwIfAbortRequestedBeforeHandoff = (): void => {
      if (control.abortIntent !== undefined && !control.handoffCompleted) {
        throw new Error('rollover_aborted')
      }
    }

    try {
      const oldAudioOutput = resources.audioOutput
      const oldSession = resources.session
      const oldMicOwner = resources.micOwner
      const oldPlaybackTransport = resources.playbackTransport
      const oldCleanup = resources.cleanup
      const analyser = oldAudioOutput?.analyser
      const createPlaybackCompletion = dependencies.createPlaybackCompletion

      if (
        oldAudioOutput === undefined ||
        oldSession === undefined ||
        oldMicOwner?.rollover === undefined ||
        oldPlaybackTransport === undefined ||
        oldCleanup === undefined ||
        analyser === undefined ||
        createPlaybackCompletion === undefined
      ) {
        throw new Error('rollover_unavailable')
      }

      control.phase = 'playback_wait'
      const playbackCompletion = createPlaybackCompletion(
        oldPlaybackTransport,
        analyser,
      )
      const playbackResult = await playbackCompletion.waitForActualEnd(
        control.abortController.signal,
      )
      throwIfAbortRequestedBeforeHandoff()

      control.phase = 'preparing'
      nextAudioOutput = await dependencies.createAudioOutput()
      throwIfAbortRequestedBeforeHandoff()
      nextSession = await dependencies.createSession(
        bundle,
        resources.stream,
        nextAudioOutput.audioElement,
      )
      throwIfAbortRequestedBeforeHandoff()
      nextPlaybackTransport = await dependencies.createPlaybackTransport(
        nextSession,
      )
      throwIfAbortRequestedBeforeHandoff()
      nextCleanup = await dependencies.createCleanup(nextSession)
      throwIfAbortRequestedBeforeHandoff()

      control.phase = 'mic_handoff'
      const returnedStream = await oldMicOwner.rollover(
        nextSession,
        'generation_rollover',
      )
      control.handoffCompleted = true
      control.phase = 'post_handoff'
      const originalStream = resources.stream

      // micOwner.rollover closes the old session and transfers mic ownership.
      // The old container must not remain a second closer after that boundary.
      resources.session = undefined
      resources.sessionCloseCompleted = true
      resources.micOwner = undefined
      resources.micAcquired = false
      resources.micTeardown = 'complete'

      nextOwnedResources = {
        stream: originalStream,
        audioOutput: nextAudioOutput,
        session: nextSession,
        micOwner: oldMicOwner,
        micAcquired: true,
        micTeardown: 'acquired',
        playbackTransport: nextPlaybackTransport,
        cleanup: nextCleanup,
        cleanupFactoryAttempted: true,
        cleanupFactoryFailed: false,
        cleanupFactoryTarget: freezeIdentity(nextSession),
      }
      ownedResources = nextOwnedResources

      const returnedStreamMismatch = returnedStream !== originalStream
      let failedOldPlayback: RealtimeRuntimePlaybackTransport | undefined
      let failedOldAudio: RealtimeRuntimeAudioOutput | undefined
      let failedOldCleanup: RealtimeRuntimeCleanup | undefined

      const oldPlaybackStep: RealtimeRuntimeStep = 'old_playback_dispose'
      attemptedSteps.push(oldPlaybackStep)
      try {
        await oldPlaybackTransport.dispose()
      } catch {
        failedSteps.push(oldPlaybackStep)
        failedOldPlayback = oldPlaybackTransport
      }
      resources.playbackTransport = undefined

      const oldAudioStep: RealtimeRuntimeStep = 'old_audio_output_dispose'
      attemptedSteps.push(oldAudioStep)
      try {
        await oldAudioOutput.dispose()
      } catch {
        failedSteps.push(oldAudioStep)
        failedOldAudio = oldAudioOutput
      }
      resources.audioOutput = undefined

      const oldCleanupStep: RealtimeRuntimeStep = 'old_cleanup_run'
      attemptedSteps.push(oldCleanupStep)
      try {
        await oldCleanup.run('rollover')
      } catch {
        failedSteps.push(oldCleanupStep)
        failedOldCleanup = oldCleanup
      }
      resources.cleanup = undefined

      pendingPostHandoffCleanup =
        failedOldPlayback === undefined &&
        failedOldAudio === undefined &&
        failedOldCleanup === undefined
          ? undefined
          : Object.freeze({
              oldIdentity: freezeIdentity(oldIdentity),
              ...(failedOldPlayback === undefined
                ? {}
                : { oldPlaybackTransport: failedOldPlayback }),
              ...(failedOldAudio === undefined
                ? {}
                : { oldAudioOutput: failedOldAudio }),
              ...(failedOldCleanup === undefined
                ? {}
                : { oldCleanup: failedOldCleanup }),
            })

      let failureReason: string | undefined
      if (returnedStreamMismatch) {
        failureReason = 'rollover_stream_mismatch'
      } else if (pendingPostHandoffCleanup !== undefined) {
        failureReason = 'rollover_post_handoff_failed'
      } else {
        const nextConnectStep: RealtimeRuntimeStep = 'next_connect'
        attemptedSteps.push(nextConnectStep)
        try {
          await nextSession.connect()
        } catch {
          failedSteps.push(nextConnectStep)
          failureReason = 'rollover_connect_failed'
        }
      }

      if (failureReason !== undefined) {
        const nextTeardownSucceeded = await cleanupTransferredNextResources(
          nextOwnedResources,
        )
        if (nextTeardownSucceeded && pendingPostHandoffCleanup === undefined) {
          ownedResources = undefined
          setState('idle')
        } else {
          ownedResources = nextOwnedResources
          setState('stopping', nextSession)
        }

        const outcome = freezeOutcome({
          status: 'failed',
          operation: 'rollover',
          reason: failureReason,
          cleanup: 'attempted',
          attemptedSteps,
          failedSteps,
        })
        emit(outcome)
        return outcome
      }

      setState('active', nextSession)

      const fallback = playbackResult.source === 'bounded_analyser_fallback'
      const outcome = freezeOutcome({
        status: fallback ? 'degraded' : 'success',
        operation: 'rollover',
        reason: fallback ? 'rolled_over_with_fallback' : 'rolled_over',
        cleanup: 'attempted',
        playbackSource: playbackResult.source,
        ...(fallback ? { playbackReason: playbackResult.reason } : {}),
        attemptedSteps,
        failedSteps,
      })
      emit(outcome)
      return outcome
    } catch {
      if (!control.handoffCompleted && control.abortIntent !== undefined) {
        if (control.phase !== 'playback_wait') {
          await cleanupPreparedNextResources()
        }
        setState('active', oldIdentity)
        const outcome = freezeOutcome({
          status: 'ignored',
          operation: 'rollover',
          reason: `rollover_aborted_by_${control.abortIntent}`,
          ...(control.phase === 'playback_wait'
            ? {}
            : { cleanup: 'attempted' as const }),
          attemptedSteps,
          failedSteps,
        })
        emit(outcome)
        return outcome
      }

      if (control.handoffCompleted && nextOwnedResources !== undefined) {
        const nextTeardownSucceeded = await cleanupTransferredNextResources(
          nextOwnedResources,
        )
        if (nextTeardownSucceeded && pendingPostHandoffCleanup === undefined) {
          ownedResources = undefined
          setState('idle')
        } else {
          ownedResources = nextOwnedResources
          setState('stopping', nextSession ?? oldIdentity)
        }
        const outcome = freezeOutcome({
          status: 'failed',
          operation: 'rollover',
          reason: 'rollover_post_handoff_failed',
          cleanup: 'attempted',
          attemptedSteps,
          failedSteps,
        })
        emit(outcome)
        return outcome
      }

      if (control.handoffCompleted) {
        setState('stopping', currentIdentity ?? oldIdentity)
        const outcome = freezeOutcome({
          status: 'failed',
          operation: 'rollover',
          reason: 'rollover_post_handoff_failed',
          cleanup: 'attempted',
          attemptedSteps,
          failedSteps,
        })
        emit(outcome)
        return outcome
      }

      if (control.phase === 'playback_wait') {
        setState('active', oldIdentity)
        const outcome = freezeOutcome({
          status: 'failed',
          operation: 'rollover',
          reason: 'rollover_playback_failed',
        })
        emit(outcome)
        return outcome
      }

      await cleanupPreparedNextResources()
      setState('active', oldIdentity)
      const outcome = freezeOutcome({
        status: 'failed',
        operation: 'rollover',
        reason:
          control.phase === 'mic_handoff'
            ? 'rollover_handoff_failed'
            : 'rollover_prepare_failed',
        cleanup: 'attempted',
        attemptedSteps,
        failedSteps,
      })
      emit(outcome)
      return outcome
    }
  }

  function combineCleanupReports(
    ...reports: readonly CleanupReport[]
  ): CleanupReport {
    const attemptedSteps: RealtimeRuntimeStep[] = []
    const failedSteps: RealtimeRuntimeStep[] = []
    for (const report of reports) {
      attemptedSteps.push(...report.attemptedSteps)
      failedSteps.push(...report.failedSteps)
    }
    return {
      succeeded: reports.every((report) => report.succeeded),
      attemptedSteps,
      failedSteps,
    }
  }

  function start(
    bundle: Readonly<RealtimeSessionStartBundleValue>,
  ): Promise<RealtimeRuntimeOutcome> {
    const requestedIdentity = bundle.identity

    if (
      inFlightStart !== undefined &&
      inFlightIdentity !== undefined &&
      sameIdentity(inFlightIdentity, requestedIdentity)
    ) {
      return inFlightStart
    }

    if (state === 'disposed') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'start',
          reason: 'already_disposed',
        }),
      )
    }
    if (state === 'active') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'start',
          reason: 'active',
        }),
      )
    }
    if (state === 'rolling_over') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'start',
          reason: 'rollover_in_flight',
        }),
      )
    }
    if (inFlightStart !== undefined || state === 'starting') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'start',
          reason: 'start_in_flight',
        }),
      )
    }
    if (state === 'stopping') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'start',
          reason: 'stopping',
        }),
      )
    }

    const requestedGeneration = requestedIdentity.sessionGeneration
    if (requestedGeneration < highestReservedGeneration) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'start',
          reason: 'stale_generation',
        }),
      )
    }
    if (
      requestedGeneration <= highestReservedGeneration ||
      reservedIdentityKeys.has(identityKey(requestedIdentity))
    ) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'start',
          reason: 'duplicate_generation',
        }),
      )
    }

    // Reserve before invoking the async pipeline so a racing start cannot
    // allocate a second stream or session for this generation.
    highestReservedGeneration = requestedGeneration
    reservedIdentityKeys.add(identityKey(requestedIdentity))
    inFlightIdentity = freezeIdentity(requestedIdentity)
    setState('starting', requestedIdentity)

    const control: StartControl = {
      identity: freezeIdentity(requestedIdentity),
      cancelled: false,
    }
    inFlightStartControl = control
    const promise = performStart(bundle, control)
    inFlightStart = promise
    void promise.then(
      () => {
        if (inFlightStart === promise) {
          inFlightStart = undefined
          inFlightIdentity = undefined
          inFlightStartControl = undefined
        }
      },
      () => {
        if (inFlightStart === promise) {
          inFlightStart = undefined
          inFlightIdentity = undefined
          inFlightStartControl = undefined
        }
      },
    )
    return promise
  }

  function rollover(
    bundle: Readonly<RealtimeSessionStartBundleValue>,
  ): Promise<RealtimeRuntimeOutcome> {
    const requestedIdentity = bundle.identity

    if (
      inFlightRollover !== undefined &&
      inFlightRolloverControl !== undefined &&
      sameIdentity(inFlightRolloverControl.identity, requestedIdentity)
    ) {
      return inFlightRollover
    }

    if (inFlightRollover !== undefined) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'rollover',
          reason: 'rollover_in_flight',
        }),
      )
    }

    if (state !== 'active') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'rollover',
          reason: state === 'disposed' ? 'already_disposed' : 'not_active',
        }),
      )
    }

    const requestedGeneration = requestedIdentity.sessionGeneration
    if (requestedGeneration < highestReservedGeneration) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'rollover',
          reason: 'stale_generation',
        }),
      )
    }
    if (
      requestedGeneration <= highestReservedGeneration ||
      reservedIdentityKeys.has(identityKey(requestedIdentity))
    ) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'rollover',
          reason: 'duplicate_generation',
        }),
      )
    }

    if (
      pendingPreHandoffCleanup !== undefined ||
      pendingPostHandoffCleanup !== undefined
    ) {
      return resultPromise(
        freezeOutcome({
          status: 'failed',
          operation: 'rollover',
          reason: 'rollover_cleanup_pending',
        }),
      )
    }

    const resources = ownedResources
    const analyser = resources?.audioOutput?.analyser
    if (
      resources === undefined ||
      currentIdentity === undefined ||
      resources.stream === undefined ||
      resources.session === undefined ||
      resources.audioOutput === undefined ||
      typeof analyser !== 'object' ||
      analyser === null ||
      resources.micOwner === undefined ||
      typeof resources.micOwner.rollover !== 'function' ||
      resources.playbackTransport === undefined ||
      resources.cleanup === undefined ||
      typeof dependencies.createPlaybackCompletion !== 'function'
    ) {
      return resultPromise(
        freezeOutcome({
          status: 'failed',
          operation: 'rollover',
          reason: 'rollover_unavailable',
        }),
      )
    }

    // Reserve synchronously before any rollover factory work so a higher
    // generation cannot race this request into a second stream or session.
    highestReservedGeneration = requestedGeneration
    reservedIdentityKeys.add(identityKey(requestedIdentity))
    setState('rolling_over', currentIdentity)

    const control: RolloverControl = {
      identity: freezeIdentity(requestedIdentity),
      abortController: new AbortController(),
      phase: 'playback_wait',
      handoffCompleted: false,
    }
    inFlightRolloverControl = control
    const promise = performRollover(bundle, control, resources, currentIdentity)
    inFlightRollover = promise
    void promise.then(
      () => {
        if (inFlightRollover === promise) {
          inFlightRollover = undefined
          inFlightRolloverControl = undefined
        }
      },
      () => {
        if (inFlightRollover === promise) {
          inFlightRollover = undefined
          inFlightRolloverControl = undefined
        }
      },
    )
    return promise
  }

  async function performCleanup(
    operation: 'stop' | 'dispose',
    boundary: RealtimeRuntimeCleanupBoundary,
    terminalState: 'idle' | 'disposed',
  ): Promise<RealtimeRuntimeOutcome> {
    const pendingPreReport =
      pendingPreHandoffCleanup === undefined
        ? { succeeded: true, attemptedSteps: [], failedSteps: [] }
        : await retryPendingPreHandoffCleanup()
    const pendingPostReport =
      pendingPostHandoffCleanup === undefined
        ? { succeeded: true, attemptedSteps: [], failedSteps: [] }
        : await retryPendingPostHandoffCleanup()
    const resources = ownedResources
    const cleanupReport = await runCleanup(resources, boundary, false)
    const combinedReport = combineCleanupReports(
      pendingPreReport,
      pendingPostReport,
      cleanupReport,
    )
    if (combinedReport.succeeded) {
      ownedResources = undefined
      setState(terminalState)
    }

    const outcome = freezeOutcome({
      status: combinedReport.succeeded ? 'success' : 'failed',
      operation,
      reason: combinedReport.succeeded
        ? terminalState === 'disposed'
          ? 'disposed'
          : 'stopped'
        : operation === 'dispose'
          ? 'dispose_failed'
          : 'stop_failed',
      ...(resources === undefined &&
      pendingPreReport.attemptedSteps.length === 0 &&
      pendingPostReport.attemptedSteps.length === 0
        ? {}
        : { cleanup: 'attempted' as const }),
      attemptedSteps: combinedReport.attemptedSteps,
      failedSteps: combinedReport.failedSteps,
    })
    emit(outcome)
    return outcome
  }

  function beginCleanup(
    operation: 'stop' | 'dispose',
    boundary: RealtimeRuntimeCleanupBoundary,
    terminalState: 'idle' | 'disposed',
  ): Promise<RealtimeRuntimeOutcome> {
    let resolveCleanup!: (outcome: RealtimeRuntimeOutcome) => void
    const promise = new Promise<RealtimeRuntimeOutcome>((resolve) => {
      resolveCleanup = resolve
    })
    cleanupInFlight = { operation, promise }
    void promise.then(
      () => {
        if (cleanupInFlight?.promise === promise) {
          cleanupInFlight = undefined
        }
      },
      () => {
        if (cleanupInFlight?.promise === promise) {
          cleanupInFlight = undefined
        }
      },
    )
    void performCleanup(operation, boundary, terminalState).then(
      resolveCleanup,
      () => {
        if (operation === 'stop') {
          setState('stopping', currentIdentity)
        }
        const outcome = freezeOutcome({
          status: 'failed',
          operation,
          reason: operation === 'dispose' ? 'dispose_failed' : 'stop_failed',
          ...(ownedResources === undefined ? {} : { cleanup: 'attempted' as const }),
        })
        emit(outcome)
        resolveCleanup(outcome)
      },
    )
    return promise
  }

  function makePendingStartDispose(
    startPromise: Promise<RealtimeRuntimeOutcome>,
    identity: Readonly<RealtimeSessionIdentity>,
  ): Promise<RealtimeRuntimeOutcome> {
    const promise = startPromise.then((startOutcome) => {
      if (ownedResources !== undefined || startOutcome.failedSteps.length > 0) {
        setState('stopping', currentIdentity ?? identity)
        const outcome = freezeOutcome({
          status: 'failed',
          operation: 'dispose',
          reason: 'dispose_failed',
          cleanup: 'attempted',
          attemptedSteps: startOutcome.attemptedSteps,
          failedSteps: startOutcome.failedSteps,
        })
        emit(outcome)
        return outcome
      }

      setState('disposed')
      const outcome = freezeOutcome({
        status: 'success',
        operation: 'dispose',
        reason: 'disposed',
      })
      emit(outcome)
      return outcome
    })
    pendingStartDispose = promise
    void promise.then(
      () => {
        if (pendingStartDispose === promise) {
          pendingStartDispose = undefined
        }
      },
      () => {
        if (pendingStartDispose === promise) {
          pendingStartDispose = undefined
        }
      },
    )
    return promise
  }

  function makeDisposeAfterStop(
    stopPromise: Promise<RealtimeRuntimeOutcome>,
  ): Promise<RealtimeRuntimeOutcome> {
    const promise = stopPromise.then((stopOutcome) => {
      if (stopOutcome.status === 'success') {
        setState('disposed')
        const outcome = freezeOutcome({
          status: 'success',
          operation: 'dispose',
          reason: 'disposed',
        })
        emit(outcome)
        return outcome
      }

      return beginCleanup('dispose', 'dispose', 'disposed')
    })
    disposeAfterStop = promise
    void promise.then(
      () => {
        if (disposeAfterStop === promise) {
          disposeAfterStop = undefined
        }
      },
      () => {
        if (disposeAfterStop === promise) {
          disposeAfterStop = undefined
        }
      },
    )
    return promise
  }

  async function performLifecycleAfterRolloverCleanup(
    operation: 'stop' | 'dispose',
    boundary: RealtimeRuntimeCleanupBoundary,
    terminalState: 'idle' | 'disposed',
    rolloverPromise: Promise<RealtimeRuntimeOutcome>,
    oldIdentity: Readonly<RealtimeSessionIdentity>,
  ): Promise<RealtimeRuntimeOutcome> {
    let rolloverFailed = false
    try {
      await rolloverPromise
    } catch {
      rolloverFailed = true
    }

    const pendingPreReport =
      pendingPreHandoffCleanup === undefined
        ? { succeeded: true, attemptedSteps: [], failedSteps: [] }
        : await retryPendingPreHandoffCleanup()
    const pendingPostReport =
      pendingPostHandoffCleanup === undefined
        ? { succeeded: true, attemptedSteps: [], failedSteps: [] }
        : await retryPendingPostHandoffCleanup()
    setState('stopping', currentIdentity ?? oldIdentity)
    const resources = ownedResources
    const cleanupReport = await runCleanup(resources, boundary, false)
    const combinedReport = combineCleanupReports(
      pendingPreReport,
      pendingPostReport,
      cleanupReport,
    )
    const succeeded = !rolloverFailed && combinedReport.succeeded
    if (succeeded) {
      ownedResources = undefined
      setState(terminalState)
    }

    const outcome = freezeOutcome({
      status: succeeded ? 'success' : 'failed',
      operation,
      reason: succeeded
        ? terminalState === 'disposed'
          ? 'disposed'
          : 'stopped'
        : operation === 'dispose'
          ? 'dispose_failed'
          : 'stop_failed',
      ...(resources === undefined &&
      pendingPreReport.attemptedSteps.length === 0 &&
      pendingPostReport.attemptedSteps.length === 0
        ? {}
        : { cleanup: 'attempted' as const }),
      attemptedSteps: combinedReport.attemptedSteps,
      failedSteps: combinedReport.failedSteps,
    })
    emit(outcome)
    return outcome
  }

  async function interruptActiveSession(): Promise<RealtimeRuntimeOutcome> {
    if (state !== 'active' || ownedResources?.session === undefined) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'interrupt',
          reason: 'not_active',
        }),
      )
    }

    try {
      await ownedResources.session.interrupt()
      const outcome = freezeOutcome({
        status: 'success',
        operation: 'interrupt',
        reason: 'interrupted',
      })
      emit(outcome)
      return outcome
    } catch {
      const outcome = freezeOutcome({
        status: 'failed',
        operation: 'interrupt',
        reason: 'interrupt_failed',
      })
      emit(outcome)
      return outcome
    }
  }

  async function performInterruptAfterRollover(
    rolloverPromise: Promise<RealtimeRuntimeOutcome>,
  ): Promise<RealtimeRuntimeOutcome> {
    try {
      await rolloverPromise
    } catch {
      // The active-session guard below maps an unexpected rollover rejection
      // to the existing metadata-only interrupt outcome.
    }
    return interruptActiveSession()
  }

  function beginLifecycleAfterRollover(
    operation: 'stop' | 'dispose' | 'interrupt',
    boundary: RealtimeRuntimeCleanupBoundary = 'stop',
    terminalState: 'idle' | 'disposed' = 'idle',
  ): Promise<RealtimeRuntimeOutcome> {
    const rolloverPromise = inFlightRollover
    const rolloverControl = inFlightRolloverControl
    const oldIdentity = currentIdentity
    if (
      rolloverPromise === undefined ||
      rolloverControl === undefined ||
      oldIdentity === undefined
    ) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation,
          reason: 'lifecycle_in_flight',
        }),
      )
    }

    const promise =
      operation === 'interrupt'
        ? performInterruptAfterRollover(rolloverPromise)
        : performLifecycleAfterRolloverCleanup(
            operation,
            boundary,
            terminalState,
            rolloverPromise,
            oldIdentity,
          )
    lifecycleAfterRolloverInFlight = { operation, promise }
    rolloverControl.abortIntent = operation
    rolloverControl.abortController.abort()
    void promise.then(
      () => {
        if (lifecycleAfterRolloverInFlight?.promise === promise) {
          lifecycleAfterRolloverInFlight = undefined
        }
      },
      () => {
        if (lifecycleAfterRolloverInFlight?.promise === promise) {
          lifecycleAfterRolloverInFlight = undefined
        }
      },
    )
    return promise
  }

  function stop(
    boundary: RealtimeRuntimeCleanupBoundary = 'stop',
  ): Promise<RealtimeRuntimeOutcome> {
    if (lifecycleAfterRolloverInFlight !== undefined) {
      if (lifecycleAfterRolloverInFlight.operation === 'stop') {
        return lifecycleAfterRolloverInFlight.promise
      }
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'stop',
          reason: 'lifecycle_in_flight',
        }),
      )
    }
    if (state === 'rolling_over' && inFlightRollover !== undefined) {
      return beginLifecycleAfterRollover('stop', boundary, 'idle')
    }
    if (pendingStartDispose !== undefined || disposeAfterStop !== undefined) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'stop',
          reason: 'dispose_in_flight',
        }),
      )
    }
    if (cleanupInFlight !== undefined) {
      if (cleanupInFlight.operation === 'stop') {
        return cleanupInFlight.promise
      }
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'stop',
          reason: 'dispose_in_flight',
        }),
      )
    }
    if (state === 'disposed') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'stop',
          reason: 'already_disposed',
        }),
      )
    }
    if (state !== 'active' && state !== 'stopping') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'stop',
          reason: state === 'starting' ? 'start_in_flight' : 'not_active',
        }),
      )
    }

    if (state === 'active') {
      const stoppingIdentity = currentIdentity
      setState('stopping', stoppingIdentity)
    }
    return beginCleanup('stop', boundary, 'idle')
  }

  function dispose(): Promise<RealtimeRuntimeOutcome> {
    if (lifecycleAfterRolloverInFlight !== undefined) {
      if (lifecycleAfterRolloverInFlight.operation === 'dispose') {
        return lifecycleAfterRolloverInFlight.promise
      }
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'dispose',
          reason: 'lifecycle_in_flight',
        }),
      )
    }
    if (state === 'rolling_over' && inFlightRollover !== undefined) {
      return beginLifecycleAfterRollover('dispose', 'dispose', 'disposed')
    }
    if (pendingStartDispose !== undefined) {
      return pendingStartDispose
    }
    if (disposeAfterStop !== undefined) {
      return disposeAfterStop
    }
    if (cleanupInFlight !== undefined) {
      if (cleanupInFlight.operation === 'dispose') {
        return cleanupInFlight.promise
      }
      return makeDisposeAfterStop(cleanupInFlight.promise)
    }
    if (state === 'disposed') {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'dispose',
          reason: 'already_disposed',
        }),
      )
    }

    if (state === 'idle') {
      ownedResources = undefined
      setState('disposed')
      return resultPromise(
        freezeOutcome({
          status: 'success',
          operation: 'dispose',
          reason: 'disposed',
        }),
      )
    }

    if (state === 'starting') {
      const disposingIdentity = currentIdentity
      if (inFlightStartControl !== undefined) {
        inFlightStartControl.cancelled = true
      }
      setState('stopping', disposingIdentity)
      if (inFlightStart === undefined) {
        return resultPromise(
          freezeOutcome({
            status: 'failed',
            operation: 'dispose',
            reason: 'dispose_failed',
          }),
        )
      }
      return makePendingStartDispose(
        inFlightStart,
        disposingIdentity ?? inFlightStartControl?.identity ?? inFlightIdentity!,
      )
    }

    if (state === 'active') {
      const disposingIdentity = currentIdentity
      setState('stopping', disposingIdentity)
    }
    return beginCleanup('dispose', 'dispose', 'disposed')
  }

  async function interrupt(): Promise<RealtimeRuntimeOutcome> {
    if (lifecycleAfterRolloverInFlight !== undefined) {
      return resultPromise(
        freezeOutcome({
          status: 'ignored',
          operation: 'interrupt',
          reason: 'lifecycle_in_flight',
        }),
      )
    }
    if (state === 'rolling_over' && inFlightRollover !== undefined) {
      return beginLifecycleAfterRollover('interrupt')
    }
    return interruptActiveSession()
  }

  return {
    start,
    rollover,
    stop,
    dispose,
    interrupt,
    getSnapshot: () => snapshot,
  }
}
