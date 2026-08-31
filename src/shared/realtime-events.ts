import type { RealtimeFailureInput } from './realtime-recovery'

export const REALTIME_METADATA_EVENT_NAMES = Object.freeze([
  'realtime_session_created',
  'realtime_connect_started',
  'realtime_ready',
  'realtime_connect_failed',
  'realtime_stale_event',
  'realtime_disconnect',
  'realtime_observer_event',
] as const)

export type RealtimeMetadataEventName =
  (typeof REALTIME_METADATA_EVENT_NAMES)[number]

export const REALTIME_METADATA_REASONS = Object.freeze([
  'cause=session_created',
  'cause=connect_started',
  'cause=connect_succeeded',
  'cause=connect_failed',
  'cause=transport_error',
  'cause=transport_disconnected',
  'cause=close',
  'cause=close_failed',
  'stale_realtime_session',
  'unknown_turn_detection_profile',
  'user_requested',
  'output_playback_listener_failed',
  'output_playback_subscription_closed',
  'transcript_listener_failed',
  'input_item_listener_failed',
  'transcript_unavailable',
  'sleep_request_unavailable',
  'sleep_request_failed',
  'avatar_audio_activity_listener_failed',
] as const)

export type RealtimeMetadataReason = (typeof REALTIME_METADATA_REASONS)[number]

export type RealtimeMetadataStatus = 'success' | 'degraded' | 'failed' | 'info'

export interface RealtimeMetadataEvent {
  readonly event: RealtimeMetadataEventName
  readonly realtimeSessionId: string
  readonly sessionGeneration: number
  readonly configVersion: number
  readonly fingerprint: string
  readonly sdkVersion: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
  readonly reasoningEffort: string
  readonly turnDetectionProfile: string
  readonly status: RealtimeMetadataStatus
  readonly reason: RealtimeMetadataReason
  readonly duration_ms?: number
}

export type RealtimeMetadataEventSink = (event: RealtimeMetadataEvent) => void

export type RealtimeFailureCallback = (
  failure: RealtimeFailureInput,
) => void | PromiseLike<void>
