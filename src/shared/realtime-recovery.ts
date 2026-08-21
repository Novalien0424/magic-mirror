export const RECOVERY_PROBE_DELAYS_MS = Object.freeze([
  5_000,
  15_000,
  30_000,
  60_000,
] as const)

export const REALTIME_ROLLOVER_AFTER_MS = 3_600_000

export type RealtimeRecoveryLifecycleState =
  | 'starting'
  | 'dormant'
  | 'activating'
  | 'active'
  | 'suspending'
  | 'offlineLoop'
  | 'maintenance'

export type RealtimeFailureKind = 'connect' | 'ice' | 'active_disconnect'

export interface RealtimeFailureInput {
  readonly kind: RealtimeFailureKind
  readonly realtimeSessionId: string
  readonly reason: string
}

export type RecoveryProbeStatus = 'success' | 'degraded' | 'failed'

export type RealtimeRecoveryEventName =
  | 'realtime_failure_entered'
  | 'realtime_cleanup_failed'
  | 'offline_loop_started'
  | 'recovery_probe'
  | 'recovery_dormant'
  | 'manual_realtime_start'
  | 'manual_realtime_stop'
  | 'realtime_rollover'

export interface RealtimeRecoveryMetadataEvent {
  readonly event: RealtimeRecoveryEventName
  readonly status: 'success' | 'degraded' | 'failed' | 'info'
  readonly reason: string
  readonly source: 'runtime'
  readonly session_id?: string
  readonly failure_kind?: RealtimeFailureKind
  readonly probe_delay_ms?: number
  readonly error_code?: string
  readonly classification?: 'Maintenance'
  readonly configRevision?: number
  readonly configFingerprint?: string
  readonly modelRoleIds?: Readonly<Record<string, string>>
  readonly oldRealtimeSessionId?: string
  readonly newRealtimeSessionId?: string
  readonly playbackSource?: string
  readonly count?: 1
  readonly durationMs?: number
}
