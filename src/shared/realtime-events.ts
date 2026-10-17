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
  'sleep_farewell_completed',
  'tool_arguments_rejected',
  'tool_execution_failed',
  'media_source_restricted',
  'media_source_unconfirmed',
  'media_online_unlocked',
  'media_discovery_visitor_clue',
  'camera_result_stale',
  'memory_brief_oversized',
  'memory_brief_unacknowledged',
  'memory_brief_installed',
  'memory_question_delivered',
  'memory_dialogue_failed',
  'memory_input_unavailable',
  'sleep_nonfarewell_output_suppressed',
  'wake_greeting_failed',
  'wake_greeting_cancelled_close',
  'wake_greeting_cancelled_interrupt',
  'wake_greeting_cancelled_visitor_speech',
  'wake_greeting_cancelled_failure',
  'wake_greeting_gate_cancelled',
  'wake_greeting_gate_failed',
  'wake_greeting_gate_timeout',
  'microphone_recovery_started',
  'microphone_recovery_ready',
  'microphone_recovery_waiting',
  'realtime_request_rejected',
  'realtime_request_rejected_response_cancel_not_active',
  'realtime_request_rejected_conversation_already_has_active_response',
  'realtime_request_rejected_item_not_found',
  'realtime_request_rejected_invalid_value',
  'realtime_request_rejected_unknown_parameter',
  'command_reply_suppressed',
  'command_prefix_pending',
  'command_prefix_revised',
  'command_prefix_final_timeout',
  'command_reply_resumed',
  'command_reply_resume_failed',
  'transcript_duplicate_ignored',
  'media_wake_matched',
  'media_wake_not_matched',
  'scene_dialogue_cancel_pending',
  'scene_dialogue_cancel_failed',
  'avatar_audio_activity_listener_failed',
  'cause=output_started',
  'cause=output_stopped',
  'cause=output_interrupted',
  'studio_default_unavailable',
  'studio_agent_swap_failed',
  'studio_speech_forced',
  'studio_image_prepare_failed',
  'studio_reveal_failed',
  'studio_identity_question_pending',
  'studio_event_stale',
  'studio_speech_failed',
  'realtime_tool_not_found',
] as const)

export const OBSERVED_TOOL_NAMES = ['return_to_dormant', 'find_media', 'play_media', 'search_youtube', 'play_youtube', 'play', 'capture_camera', 'memory', 'stop_media',
  'start_portrait_studio', 'studio_set_name', 'studio_answer', 'studio_revise', 'studio_finish', 'studio_exit'] as const
export type RealtimeMetadataReason = (typeof REALTIME_METADATA_REASONS)[number]
  | `tool_${typeof OBSERVED_TOOL_NAMES[number]}_${'accepted' | 'ignored' | 'rejected' | 'failed'}_preamble_${'yes' | 'no'}`
  | `reply_language_${'match' | 'mismatch' | 'unknown'}`

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
