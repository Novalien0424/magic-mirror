import type { RealtimeSessionHandle } from './realtime-session-adapter'

export type MicOwnerState = 'none' | 'realtime'

export type MicOwnerMetadataEventName =
  | 'mic_acquired'
  | 'mic_released'
  | 'mic_handoff_failed'

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
  reason: string,
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
  let releaseStarted = false

  const acquire = async (stream: MediaStream): Promise<void> => {
    if (ownerState !== 'none' || mediaStream !== null || releaseStarted) {
      throw handoffFailure(input.eventSink, 'owner_realtime')
    }

    ownerState = 'realtime'
    mediaStream = stream
    emitMetadata(input.eventSink, {
      event: 'mic_acquired',
      owner: ownerState,
      status: 'success',
      reason: 'acquired',
      count: 1,
    })
  }

  const release = async (reason: string): Promise<void> => {
    if (ownerState !== 'realtime' || mediaStream === null || releaseStarted) {
      throw handoffFailure(input.eventSink, 'owner_none')
    }

    releaseStarted = true
    const ownedStream = mediaStream

    try {
      await input.session.close(reason)
    } catch {
      throw handoffFailure(input.eventSink, 'session_close_failed')
    }

    let tracks: readonly MediaStreamTrack[]
    try {
      tracks = ownedStream.getTracks()
    } catch {
      throw handoffFailure(input.eventSink, 'track_enumeration_failed')
    }

    let stoppedCount = 0
    let stopFailed = false
    for (const track of tracks) {
      try {
        track.stop()
        stoppedCount += 1
      } catch {
        stopFailed = true
      }
    }

    if (stopFailed) {
      throw handoffFailure(
        input.eventSink,
        'track_stop_failed',
        tracks.length,
        stoppedCount,
      )
    }

    ownerState = 'none'
    mediaStream = null
    releaseStarted = false
    emitMetadata(input.eventSink, {
      event: 'mic_released',
      owner: ownerState,
      status: 'success',
      reason,
      count: 1,
      track_count: tracks.length,
      stopped_count: stoppedCount,
    })
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
  })
}
