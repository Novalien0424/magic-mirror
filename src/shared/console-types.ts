import type {
  IdentityStatus,
  LifecycleState,
  MirrorEvent,
  ModuleId,
  ModuleStatus,
} from './types'

export type ConsoleResponse<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: ConsoleErrorCode
      readonly reason: ConsoleReason
      readonly fields?: readonly ConsoleFieldError[]
    }

export type ConsoleErrorCode =
  | 'console_not_ready'
  | 'console_request_invalid'
  | 'console_request_rejected'
  | 'developer_mode_disabled'
  | 'console_events_query_invalid'
  | 'console_config_invalid'
  | 'console_config_not_tested'
  | 'console_config_test_failed'
  | 'console_config_diff_stale'
  | 'console_config_confirmation_invalid'
  | 'console_config_publish_failed'
  | 'console_config_rollback_failed'
  | 'console_config_previous_unavailable'
  | 'console_config_refresh_failed'
  | 'console_model_test_failed'
  | 'console_phase_tests_read_failed'

export type ConsoleReason =
  | 'cause=developer_mode_disabled'
  | 'cause=console_data_plane_unavailable'
  | 'cause=payload_schema_invalid'
  | 'cause=query_bounds_invalid'
  | 'cause=sender_rejected'
  | 'cause=config_service_unavailable'
  | 'cause=config_schema_invalid'
  | 'cause=draft_not_tested'
  | 'cause=draft_test_failed'
  | 'cause=diff_stale'
  | 'cause=confirmation_invalid'
  | 'cause=atomic_publish_failed'
  | 'cause=atomic_rollback_failed'
  | 'cause=previous_unavailable'
  | 'cause=refresh_failed'
  | 'cause=mock_probe_failed'
  | 'cause=reader_failed'
  | 'cause=record_invalid'

export interface ConsoleFieldError {
  readonly path: string
  readonly message: string
}

export interface ConsoleEventSummary {
  readonly time: string
  readonly module: ModuleId
  readonly event: string
  readonly status: MirrorEvent['status']
  readonly duration_ms?: number
  readonly error_code?: string
  readonly session_id?: string
  readonly scene_id?: string
  readonly reason?: string
  readonly source?: NonNullable<MirrorEvent['source']>
}

export interface ConsoleModuleObservation {
  readonly status: ModuleStatus
  readonly readiness: 'mock' | 'not_checked'
  readonly lastSuccess: ConsoleEventSummary | null
  readonly lastError: ConsoleEventSummary | null
  readonly lastFallback: ConsoleEventSummary | null
}

export interface ConsoleOverviewPayload {
  readonly lifecycle: LifecycleState
  readonly appVersion: string
  readonly buildCommit: string
  readonly configVersion: number | null
  readonly identityStatus: IdentityStatus
  readonly realtimeSessionId: string | null
  readonly sessionGeneration: number
  readonly uptimeSeconds: number
  readonly developerMode: boolean
  readonly developerModeSource: 'packaging_default' | 'startup_override'
  readonly modules: Readonly<Record<ModuleId, ConsoleModuleObservation>>
  readonly audioTcc: 'not_checked'
  readonly cameraTcc: 'not_checked'
}

export interface ConsoleEventsQuery {
  readonly limit?: number
  readonly beforeSequence?: number
  readonly module?: ModuleId
  readonly status?: MirrorEvent['status']
  readonly source?: NonNullable<MirrorEvent['source']>
}

export interface ConsoleEventsPage {
  readonly events: readonly ConsoleEventSummary[]
  readonly nextBeforeSequence: number | null
}

export interface DeveloperModeDecision {
  readonly enabled: boolean
  readonly source: 'packaging_default' | 'startup_override'
}
