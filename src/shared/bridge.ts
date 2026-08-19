import type { AppSnapshot, SimulatorCommand, SimulatorResult } from './types'
import type {
  ConsoleConfigDraftInput,
  ConsoleConfigPayload,
  ConsoleDiffConfirmation,
  ConsoleEventsPage,
  ConsoleEventsQuery,
  ConsoleDraftTestResult,
  ConsoleModelDraftInput,
  ConsoleModelsPayload,
  ConsoleOverviewPayload,
  ConsolePhaseTestsPayload,
  ConsoleResponse,
  ConsoleRuntimeSnapshotResult,
} from './console-types'

export type MirrorWindowKind = 'mirror' | 'console'

export type BootChannel = 'boot:renderer-ready'
export const BOOT_RENDERER_READY_CHANNEL: BootChannel = 'boot:renderer-ready'

export interface MirrorChannelMap {
  readonly getSnapshot: 'mirror:get-snapshot'
  readonly snapshot: 'mirror:snapshot'
  readonly ready: BootChannel
}

export interface ConsoleChannelMap {
  readonly getSnapshot: 'console:get-snapshot'
  readonly snapshot: 'console:snapshot'
  readonly simulate: 'console:simulate'
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
  readonly ready: BootChannel
}

export type SnapshotListener = (snapshot: AppSnapshot) => void

export interface MirrorBridge {
  notifyReady(): void
  getSnapshot(): Promise<AppSnapshot>
  onSnapshot(listener: SnapshotListener): () => void
}

export interface ConsoleBridge extends MirrorBridge {
  simulate(command: SimulatorCommand): Promise<SimulatorResult>
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
  getPhaseTests(): Promise<ConsoleResponse<ConsolePhaseTestsPayload>>
}

/** Compatibility alias for code that only needs the shared renderer surface. */
export type BootBridge = MirrorBridge | ConsoleBridge

declare global {
  interface Window {
    /** Absent when the preload failed; renderers must keep a visible fallback. */
    readonly magicMirror?: BootBridge
  }
}
