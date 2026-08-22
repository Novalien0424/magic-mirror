import type {
  RealtimeSessionIdentity,
  RealtimeSessionStartBundleValue,
} from '../../../src/shared/bridge'

type MaybePromise<T> = T | PromiseLike<T>

const START_FAILURE_CLOSE_REASON = 'start_failed'

export type RealtimeRuntimeState =
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'disposed'

export type RealtimeRuntimeCleanupBoundary =
  | 'close'
  | 'stop'
  | 'dispose'
  | 'offline_loop'

export type RealtimeRuntimeStep =
  | 'playback_dispose'
  | 'audio_output_dispose'
  | 'mic_release'
  | 'cleanup_factory_create'
  | 'session_close'
  | 'stream_track_stop'
  | 'cleanup_run'

export interface RealtimeRuntimeAudioOutput {
  readonly audioElement: HTMLAudioElement
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
}

export interface RealtimeRuntimePlaybackTransport {
  readonly dispose: () => MaybePromise<void>
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
  readonly eventSink?: RealtimeRuntimeEventSink
}

export interface RealtimeRuntimeSnapshot {
  readonly state: RealtimeRuntimeState
  readonly currentIdentity?: Readonly<RealtimeSessionIdentity>
}

export interface RealtimeRuntimeOutcome {
  readonly status: 'success' | 'ignored' | 'failed'
  readonly operation: 'start' | 'stop' | 'dispose' | 'interrupt'
  readonly reason: string
  readonly cleanup?: 'attempted'
  readonly attemptedSteps: readonly RealtimeRuntimeStep[]
  readonly failedSteps: readonly RealtimeRuntimeStep[]
}

export interface RealtimeRuntimeOwner {
  readonly start: (
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

interface CleanupInFlight {
  readonly operation: 'stop' | 'dispose'
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
  let cleanupInFlight: CleanupInFlight | undefined
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

  async function performCleanup(
    operation: 'stop' | 'dispose',
    boundary: RealtimeRuntimeCleanupBoundary,
    terminalState: 'idle' | 'disposed',
  ): Promise<RealtimeRuntimeOutcome> {
    const resources = ownedResources
    const cleanupReport = await runCleanup(resources, boundary, false)
    if (cleanupReport.succeeded) {
      ownedResources = undefined
      setState(terminalState)
    }

    const outcome = freezeOutcome({
      status: cleanupReport.succeeded ? 'success' : 'failed',
      operation,
      reason: cleanupReport.succeeded
        ? terminalState === 'disposed'
          ? 'disposed'
          : 'stopped'
        : operation === 'dispose'
          ? 'dispose_failed'
          : 'stop_failed',
      ...(resources === undefined ? {} : { cleanup: 'attempted' as const }),
      attemptedSteps: cleanupReport.attemptedSteps,
      failedSteps: cleanupReport.failedSteps,
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

  function stop(
    boundary: RealtimeRuntimeCleanupBoundary = 'stop',
  ): Promise<RealtimeRuntimeOutcome> {
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

  return {
    start,
    stop,
    dispose,
    interrupt,
    getSnapshot: () => snapshot,
  }
}
