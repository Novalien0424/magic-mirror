import type {
  IdentityStatus,
  JobModelSnapshot,
  LifecycleState,
  MirrorEvent,
  ModuleId,
  ModuleStatus,
  SessionModelSnapshot,
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
  | 'console_lifecycle_action_failed'

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
  | 'cause=runtime_action_failed'
  | 'cause=action_result_invalid'

export type ConsoleLifecycleAction = 'start_conversation' | 'disconnect' | 'interrupt'

export interface ConsoleLifecycleActionResult {
  readonly action: ConsoleLifecycleAction
  readonly status: 'success' | 'degraded' | 'failed'
  readonly reason: string
}

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

export interface ConsoleCurrentSessionTranscriptEntry {
  readonly itemId: string
  readonly turnId: string
  readonly transcript: string
}

export interface ConsoleCurrentSessionTranscriptProjection {
  readonly realtimeSessionId: string
  readonly entries: readonly ConsoleCurrentSessionTranscriptEntry[]
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

export type PhaseTestPhase = '0' | '1'

type Phase0TestRecord = {
  readonly phase: '0'
  readonly demoId: 'P0-D1' | 'P0-D2' | 'P0-D3' | 'P0-D4' | 'P0-D5'
  readonly build: string
  readonly time: string
  readonly result: 'passed' | 'failed' | 'mock_passed'
  readonly note: string
}

type Phase1TestRecord = {
  readonly phase: '1'
  readonly demoId: 'P1-D1' | 'P1-D2' | 'P1-D3' | 'P1-D4' | 'P1-D5' | 'P1-D6'
  readonly build: string
  readonly time: string
  readonly result: 'passed' | 'failed' | 'mock_passed' | 'not_executed'
  readonly note: string
}

export type PhaseTestRecord = Phase0TestRecord | Phase1TestRecord

export interface PhaseTestRecordReader {
  read(phase: PhaseTestPhase): readonly PhaseTestRecord[] | PromiseLike<readonly PhaseTestRecord[]>
}

export interface ConsolePhaseTestsPayload {
  readonly phase: PhaseTestPhase
  readonly source: 'empty' | 'reader'
  readonly latest: PhaseTestRecord | null
  readonly records: readonly PhaseTestRecord[]
}

export interface DeveloperModeDecision {
  readonly enabled: boolean
  readonly source: 'packaging_default' | 'startup_override'
}

export interface ConsoleConfigSafeView {
  readonly configVersion: number
  readonly personaName: string
  readonly voice: string
  readonly idleSeconds: number
  readonly wake: { readonly phrase: string; readonly modelVersion: string; readonly packageId: string }
  readonly faceModel: { readonly detectorId: string; readonly recognizerId: string }
  readonly assets: {
    readonly offlineLoopVideo: string
    readonly avatarDir: string
    readonly musicDir: string
  }
  readonly adapters: {
    readonly lighting: 'mock' | 'physical'
    readonly fog: 'mock' | 'physical'
    readonly music: 'mock' | 'physical'
  }
}

export interface ConsoleConfigDraftInput {
  readonly personaName: string
  readonly voice: string
  readonly idleSeconds: number
  readonly wake: { readonly phrase: string; readonly modelVersion: string; readonly packageId: string }
  readonly faceModel: { readonly detectorId: string; readonly recognizerId: string }
  readonly assets: {
    readonly offlineLoopVideo: string
    readonly avatarDir: string
    readonly musicDir: string
  }
  readonly adapters: {
    readonly lighting: 'mock' | 'physical'
    readonly fog: 'mock' | 'physical'
    readonly music: 'mock' | 'physical'
  }
}

export interface ConsoleConfigDiffEntry {
  readonly path: string
  readonly kind: 'model' | 'non_model'
  readonly change: 'added' | 'removed' | 'updated'
}

export interface ConsoleConfigDiff {
  readonly operation: 'publish' | 'rollback'
  readonly from: 'active' | 'previous'
  readonly to: 'draft' | 'active'
  readonly expectedActiveVersion: number
  readonly changed: readonly ConsoleConfigDiffEntry[]
  readonly nonModelChanges: boolean
  readonly confirmationDigest: string
}

export interface ConsoleDiffConfirmation {
  readonly operation: 'publish' | 'rollback'
  readonly expectedActiveVersion: number
  readonly changedPaths: readonly string[]
  readonly nonModelChanges: boolean
  readonly confirmationDigest: string
}

export interface ConsoleDraftTestResult {
  readonly result: 'mock_passed' | 'failed'
  readonly source: 'simulator'
  readonly configVersion: number
  readonly fingerprint: string
  readonly roleCount: 3
  readonly reason: 'cause=all_configured_ids_observed' | 'cause=mock_probe_failed' | 'cause=draft_invalid'
}

export type ConsoleModelRole = 'realtimeDialogue' | 'inputTranscription' | 'memoryExtractor'

export interface ConsoleModelSlot {
  readonly configVersion: number
  readonly fingerprint: string
  readonly modelId: string
}

export interface ConsoleModelDraftInput {
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
}

export interface ConsoleModelCard {
  readonly role: ConsoleModelRole
  readonly label: 'Realtime Dialogue' | 'Input Transcription' | 'Memory Extractor'
  readonly draft: ConsoleModelSlot
  readonly publishedActive: ConsoleModelSlot
  readonly runtimeLoaded: ConsoleModelSlot
  readonly previous: ConsoleModelSlot
  readonly pending: 'none' | 'next_session' | 'next_job'
}

export interface ConsoleRuntimeSnapshot {
  readonly label: 'current' | 'old' | 'new'
  readonly source: 'simulator'
  readonly session: Readonly<SessionModelSnapshot> | null
  readonly job: Readonly<JobModelSnapshot> | null
}

export interface ConsoleModelsPayload {
  readonly cards: readonly ConsoleModelCard[]
  readonly runtime: {
    readonly current: ConsoleRuntimeSnapshot | null
    readonly old: ConsoleRuntimeSnapshot | null
    readonly new: ConsoleRuntimeSnapshot | null
  }
  readonly latestTest: ConsoleDraftTestResult | null
}

export interface ConsoleRuntimeSnapshotResult {
  readonly result: 'mock_passed' | 'failed'
  readonly source: 'simulator'
  readonly reason: 'cause=next_snapshot_created' | 'cause=developer_mode_disabled' | 'cause=refresh_failed'
}

export interface ConsoleConfigPayload {
  readonly active: ConsoleConfigSafeView
  readonly draft: ConsoleConfigSafeView
  readonly previous: ConsoleConfigSafeView
  readonly publishDiff: ConsoleConfigDiff
  readonly rollbackDiff: ConsoleConfigDiff
  readonly draftTest: ConsoleDraftTestResult | null
}
