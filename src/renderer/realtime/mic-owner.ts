import type { RealtimeSessionHandle } from './realtime-session-adapter'

export type MicOwnerState = 'none' | 'realtime'

export type MicOwnerMetadataEventName =
  | 'mic_acquired'
  | 'mic_released'
  | 'mic_handoff_failed'
  | 'mic_rollover_succeeded'

export type MicOwnerFailureReason =
  | 'owner_realtime'
  | 'owner_none'
  | 'session_close_failed'
  | 'track_enumeration_failed'
  | 'track_stop_failed'
  | 'release_in_progress'
  | 'release_incomplete'
  | 'rollover_in_progress'
  | 'rollover_succeeded'

export interface MicOwnerMetadataEvent {
  readonly event: MicOwnerMetadataEventName
  readonly owner: MicOwnerState
  readonly status: 'success' | 'failed'
  readonly reason: string
  readonly count: 1
  readonly track_count?: number
  readonly stopped_count?: number
  readonly classification?: 'Maintenance'
}

export type MicOwnerMetadataEventSink = (event: MicOwnerMetadataEvent) => void

export interface CreateMicOwnerInput {
  readonly session: RealtimeSessionHandle
  readonly eventSink: MicOwnerMetadataEventSink
}

export interface MicOwner {
  readonly owner: MicOwnerState
  readonly mediaStream: MediaStream | null
  acquire(stream: MediaStream): Promise<void>
  release(reason: string): Promise<void>
  rollover(nextSession: RealtimeSessionHandle, reason: string): Promise<MediaStream>
}

export class MicHandoffError extends Error {
  readonly classification = 'Maintenance' as const
  readonly reason: string

  constructor(reason: string) {
    super('Microphone handoff failed')
    this.name = 'MicHandoffError'
    this.reason = reason
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export { MicHandoffError as MicOwnershipError }

interface ReleaseProgress {
  readonly stream: MediaStream
  readonly session: RealtimeSessionHandle
  sessionClosed: boolean
  tracks: readonly MediaStreamTrack[] | null
  readonly stoppedTracks: Set<MediaStreamTrack>
}

interface RolloverInFlight {
  readonly nextSession: RealtimeSessionHandle
  readonly reason: string
  readonly promise: Promise<MediaStream>
}

function emitMetadata(
  eventSink: MicOwnerMetadataEventSink,
  event: MicOwnerMetadataEvent,
): void {
  try {
    eventSink(event)
  } catch {
    // Metadata delivery must not create a second mic owner or mask the handoff result.
  }
}

function handoffFailure(
  eventSink: MicOwnerMetadataEventSink,
  reason: MicOwnerFailureReason,
  trackCount?: number,
  stoppedCount?: number,
): MicHandoffError {
  emitMetadata(eventSink, {
    event: 'mic_handoff_failed',
    owner: 'realtime',
    status: 'failed',
    reason,
    count: 1,
    ...(trackCount === undefined ? {} : { track_count: trackCount }),
    ...(stoppedCount === undefined ? {} : { stopped_count: stoppedCount }),
    classification: 'Maintenance',
  })
  return new MicHandoffError(reason)
}

export function createMicOwner(input: CreateMicOwnerInput): MicOwner {
  let ownerState: MicOwnerState = 'none'
  let mediaStream: MediaStream | null = null
  let currentSession: RealtimeSessionHandle | null = null
  let releaseProgress: ReleaseProgress | null = null
  let releaseInFlight: Promise<void> | null = null
  let rolloverInFlight: RolloverInFlight | null = null
  let releaseCompleted = false

  const acquire = async (stream: MediaStream): Promise<void> => {
    if (
      ownerState !== 'none' ||
      mediaStream !== null ||
      currentSession !== null ||
      releaseProgress !== null ||
      releaseInFlight !== null ||
      rolloverInFlight !== null
    ) {
      throw handoffFailure(
        input.eventSink,
        ownerState === 'none' ? 'release_in_progress' : 'owner_realtime',
      )
    }

    ownerState = 'realtime'
    mediaStream = stream
    currentSession = input.session
    releaseCompleted = false
    emitMetadata(input.eventSink, {
      event: 'mic_acquired',
      owner: ownerState,
      status: 'success',
      reason: 'acquired',
      count: 1,
    })
  }

  const release = (reason: string): Promise<void> => {
    if (releaseInFlight !== null) return releaseInFlight

    if (rolloverInFlight !== null) {
      return Promise.reject(
        handoffFailure(input.eventSink, 'rollover_in_progress'),
      )
    }

    if (ownerState !== 'realtime' || mediaStream === null || currentSession === null) {
      if (releaseCompleted) return Promise.resolve()
      return Promise.reject(handoffFailure(input.eventSink, 'owner_none'))
    }

    const ownedStream = mediaStream
    const ownedSession = currentSession
    const progress = releaseProgress ?? {
      stream: ownedStream,
      session: ownedSession,
      sessionClosed: false,
      tracks: null,
      stoppedTracks: new Set<MediaStreamTrack>(),
    }
    releaseProgress = progress

    const operation = Promise.resolve().then(async () => {
      if (!progress.sessionClosed) {
        try {
          await progress.session.close(reason)
          progress.sessionClosed = true
        } catch {
          throw handoffFailure(input.eventSink, 'session_close_failed')
        }
      }

      if (progress.tracks === null) {
        try {
          progress.tracks = ownedStream.getTracks()
        } catch {
          throw handoffFailure(input.eventSink, 'track_enumeration_failed')
        }
      }

      let stopFailed = false
      for (const track of progress.tracks) {
        if (progress.stoppedTracks.has(track)) continue
        try {
          track.stop()
          progress.stoppedTracks.add(track)
        } catch {
          stopFailed = true
        }
      }

      if (stopFailed) {
        throw handoffFailure(
          input.eventSink,
          'track_stop_failed',
          progress.tracks.length,
          progress.stoppedTracks.size,
        )
      }

      ownerState = 'none'
      mediaStream = null
      currentSession = null
      releaseProgress = null
      releaseCompleted = true
      emitMetadata(input.eventSink, {
        event: 'mic_released',
        owner: ownerState,
        status: 'success',
        reason,
        count: 1,
        track_count: progress.tracks.length,
        stopped_count: progress.stoppedTracks.size,
      })
    })

    releaseInFlight = operation
    void operation.then(
      () => {
        if (releaseInFlight === operation) releaseInFlight = null
      },
      () => {
        if (releaseInFlight === operation) releaseInFlight = null
      },
    )
    return operation
  }

  const rollover = (
    nextSession: RealtimeSessionHandle,
    reason: string,
  ): Promise<MediaStream> => {
    if (rolloverInFlight !== null) {
      if (
        rolloverInFlight.nextSession === nextSession &&
        rolloverInFlight.reason === reason
      ) {
        return rolloverInFlight.promise
      }
      return Promise.reject(
        handoffFailure(input.eventSink, 'rollover_in_progress'),
      )
    }

    if (releaseInFlight !== null) {
      return Promise.reject(
        handoffFailure(input.eventSink, 'release_in_progress'),
      )
    }

    if (releaseProgress !== null) {
      return Promise.reject(
        handoffFailure(input.eventSink, 'release_incomplete'),
      )
    }

    if (ownerState !== 'realtime' || mediaStream === null || currentSession === null) {
      return Promise.reject(handoffFailure(input.eventSink, 'owner_none'))
    }

    const oldSession = currentSession
    const ownedStream = mediaStream
    const operation = Promise.resolve().then(async () => {
      try {
        await oldSession.close(reason)
      } catch {
        throw handoffFailure(input.eventSink, 'session_close_failed')
      }

      currentSession = nextSession
      emitMetadata(input.eventSink, {
        event: 'mic_rollover_succeeded',
        owner: 'realtime',
        status: 'success',
        reason: 'rollover_succeeded',
        count: 1,
      })
      return ownedStream
    })

    const inFlight: RolloverInFlight = {
      nextSession,
      reason,
      promise: operation,
    }
    rolloverInFlight = inFlight
    void operation.then(
      () => {
        if (rolloverInFlight === inFlight) rolloverInFlight = null
      },
      () => {
        if (rolloverInFlight === inFlight) rolloverInFlight = null
      },
    )
    return operation
  }

  return Object.freeze({
    get owner(): MicOwnerState {
      return ownerState
    },
    get mediaStream(): MediaStream | null {
      return mediaStream
    },
    acquire,
    release,
    rollover,
  })
}
