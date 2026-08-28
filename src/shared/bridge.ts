import type {
  AppSnapshot,
  SessionModelSnapshot,
  SimulatorCommand,
  SimulatorResult,
} from './types'
import type {
  ConsoleConfigDraftInput,
  ConsoleConfigPayload,
  ConsoleDiffConfirmation,
  ConsoleEventsPage,
  ConsoleEventsQuery,
  ConsoleDraftTestResult,
  ConsoleLifecycleActionResult,
  ConsoleModelDraftInput,
  ConsoleModelsPayload,
  ConsoleOverviewPayload,
  ConsolePhaseTestsPayload,
  ConsoleResponse,
  ConsoleRuntimeSnapshotResult,
  PhaseTestPhase,
} from './console-types'
import type { RealtimeFailureInput } from './realtime-recovery'

declare const transientRealtimeSecretBrand: unique symbol

export type TransientRealtimeSecretInput = string & {
  readonly [transientRealtimeSecretBrand]: true
}

export interface RealtimeSessionIdentity {
  readonly realtimeSessionId: string
  readonly sessionGeneration: number
}

/** The single atomic value crossing the existing Mirror IPC channel. */
export interface RealtimeSessionStartBundleValue {
  readonly snapshot: Readonly<SessionModelSnapshot>
  readonly identity: Readonly<RealtimeSessionIdentity>
  readonly clientSecret: TransientRealtimeSecretInput
  readonly expiresAt?: number
}

export type TransientRealtimeSecretResult =
  | {
    readonly status: 'accepted'
    readonly reason: 'mirror_authorized'
    readonly value: RealtimeSessionStartBundleValue
  }
  | {
    readonly status: 'rejected'
    readonly reason:
      | 'unauthorized_sender'
      | 'broker_unavailable'
      | 'broker_failed'
      | 'session_unavailable'
      | 'invalid_payload'
  }

export type MirrorWindowKind = 'mirror' | 'console'

export type RealtimeFailureReport = RealtimeFailureInput

export type RealtimeRendererMetadataKind =
  | 'session'
  | 'mic'
  | 'playback'
  | 'transcript'
  | 'cleanup'
  | 'avatar'

export type RealtimeRendererMetadataStatus = 'success' | 'degraded' | 'failed' | 'info'

export interface RealtimeRendererMetadataReport {
  readonly kind: RealtimeRendererMetadataKind
  readonly status: RealtimeRendererMetadataStatus
  readonly reason: string
  readonly durationMs?: number
  readonly sessionId?: string
}

export const AVATAR_RUNTIME_STATES = [
  'Dormant',
  'Waking',
  'Listening',
  'Thinking',
  'Speaking',
  'Scene',
  'Suspending',
  'OfflineLoop',
] as const

export type AvatarRuntimeState = (typeof AVATAR_RUNTIME_STATES)[number]

export type AvatarControlCommand =
  | Readonly<{ type: 'state'; state: AvatarRuntimeState }>
  | Readonly<{ type: 'expression'; name: string }>
  | Readonly<{ type: 'recorded_audio'; action: 'play' | 'stop' }>
  | Readonly<{ type: 'music'; action: 'play' | 'stop' }>
  | Readonly<{ type: 'voice_gain'; value: number }>
  | Readonly<{ type: 'music_gain'; value: number }>

export interface AvatarRuntimeSnapshot {
  readonly status: 'not_ready' | 'ready' | 'degraded' | 'failed'
  readonly reason: string
  readonly state: AvatarRuntimeState
  readonly fps: number
  readonly waveform: number
  readonly mouthOpen: number
  readonly audioUnderruns: number
  readonly voiceGain: number
  readonly musicGain: number
}

export type BootChannel = 'boot:renderer-ready'
export const BOOT_RENDERER_READY_CHANNEL: BootChannel = 'boot:renderer-ready'

export interface MirrorChannelMap {
  readonly getSnapshot: 'mirror:get-snapshot'
  readonly snapshot: 'mirror:snapshot'
  readonly requestRealtimeClientSecret: 'mirror:request-realtime-client-secret'
  readonly realtimeRuntimeCommand: 'mirror:realtime-runtime-command'
  readonly interrupt: 'mirror:interrupt'
  readonly reportRealtimeRuntimeOutcome: 'mirror:report-realtime-runtime-outcome'
  readonly reportRealtimeFailure: 'mirror:report-realtime-failure'
  readonly reportRealtimeMetadata: 'mirror:report-realtime-metadata'
  readonly sleepRequest: 'mirror:sleep-request'
  readonly avatarControl: 'mirror:avatar-control'
  readonly reportAvatarRuntime: 'mirror:report-avatar-runtime'
  readonly ready: BootChannel
}

export interface ConsoleChannelMap {
  readonly getSnapshot: 'console:get-snapshot'
  readonly snapshot: 'console:snapshot'
  readonly simulate: 'console:simulate'
  readonly startConversation: 'console:start-conversation'
  readonly disconnect: 'console:disconnect'
  readonly interrupt: 'console:interrupt'
  readonly overview: 'console:get-overview'
  readonly events: 'console:get-events'
  readonly config: 'console:get-config'
  readonly models: 'console:get-models'
  readonly saveModelDraft: 'console:save-model-draft'
  readonly saveDraft: 'console:save-draft'
  readonly testDraft: 'console:test-draft'
  readonly publish: 'console:publish'
  readonly rollback: 'console:rollback'
  readonly nextRuntime: 'console:create-next-runtime'
  readonly phaseTests: 'console:get-phase-tests'
  readonly avatarRuntime: 'console:get-avatar-runtime'
  readonly avatarControl: 'console:avatar-control'
  readonly ready: BootChannel
}

export type SnapshotListener = (snapshot: AppSnapshot) => void

export type RealtimeRuntimeCommand =
  | Readonly<{ operation: 'start'; reason: 'manual_start' }>
  | Readonly<{ operation: 'stop'; reason: 'manual_stop' }>
  | Readonly<{ operation: 'rollover'; reason: 'session_limit' }>

export type RealtimeRuntimeCommandListener = (command: RealtimeRuntimeCommand) => void
export type AvatarControlCommandListener = (command: AvatarControlCommand) => void

interface SharedRendererBridge {
  notifyReady(): void
  getSnapshot(): Promise<AppSnapshot>
  onSnapshot(listener: SnapshotListener): () => void
}

export interface MirrorBridge extends SharedRendererBridge {
  requestRealtimeClientSecret(): Promise<TransientRealtimeSecretResult>
  reportRealtimeRuntimeOutcome(report: RealtimeRuntimeOutcomeReport): void
  reportRealtimeFailure(report: RealtimeFailureReport): void
  reportRealtimeMetadata(report: RealtimeRendererMetadataReport): void
  requestSleep(): void
  reportAvatarRuntime(snapshot: AvatarRuntimeSnapshot): void
  onAvatarControl(listener: AvatarControlCommandListener): () => void
  onRealtimeRuntimeCommand(listener: RealtimeRuntimeCommandListener): () => void
  onInterrupt(listener: () => void): () => void
}

export interface ConsoleBridge extends SharedRendererBridge {
  simulate(command: SimulatorCommand): Promise<SimulatorResult>
  startConversation(): Promise<ConsoleResponse<ConsoleLifecycleActionResult>>
  disconnect(): Promise<ConsoleResponse<ConsoleLifecycleActionResult>>
  interrupt(): Promise<ConsoleResponse<ConsoleLifecycleActionResult>>
  getOverview(): Promise<ConsoleResponse<ConsoleOverviewPayload>>
  getEvents(request?: ConsoleEventsQuery): Promise<ConsoleResponse<ConsoleEventsPage>>
  getConfig(): Promise<ConsoleResponse<ConsoleConfigPayload>>
  getModels(): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveModelDraft(input: ConsoleModelDraftInput): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveDraft(input: ConsoleConfigDraftInput): Promise<ConsoleResponse<ConsoleConfigPayload>>
  testDraft(): Promise<ConsoleResponse<ConsoleDraftTestResult>>
  publish(confirmation: ConsoleDiffConfirmation): Promise<ConsoleResponse<ConsoleConfigPayload>>
  rollback(confirmation: ConsoleDiffConfirmation): Promise<ConsoleResponse<ConsoleConfigPayload>>
  createNextRuntimeSnapshots(): Promise<ConsoleResponse<ConsoleRuntimeSnapshotResult>>
  getPhaseTests(phase?: PhaseTestPhase): Promise<ConsoleResponse<ConsolePhaseTestsPayload>>
  getAvatarRuntime(): Promise<ConsoleResponse<AvatarRuntimeSnapshot>>
  controlAvatar(command: AvatarControlCommand): Promise<ConsoleResponse<AvatarRuntimeSnapshot>>
}

/** Compatibility alias for code that only needs the shared renderer surface. */
export type BootBridge = MirrorBridge | ConsoleBridge

declare global {
  interface Window {
    /** Absent when the preload failed; renderers must keep a visible fallback. */
    readonly magicMirror?: BootBridge
  }
}
export const REALTIME_RUNTIME_OUTCOME_STATUSES = [
  'success',
  'degraded',
  'failed',
  'ignored',
] as const

export type RealtimeRuntimeOutcomeStatus =
  (typeof REALTIME_RUNTIME_OUTCOME_STATUSES)[number]

export const REALTIME_RUNTIME_OUTCOME_OPERATIONS = [
  'start',
  'stop',
  'dispose',
  'interrupt',
  'rollover',
] as const

export type RealtimeRuntimeOutcomeOperation =
  (typeof REALTIME_RUNTIME_OUTCOME_OPERATIONS)[number]

export type RealtimeRuntimeOutcomeReport = {
  readonly status: RealtimeRuntimeOutcomeStatus
  readonly operation: RealtimeRuntimeOutcomeOperation
  readonly reason: string
}
