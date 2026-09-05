import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppSnapshot, ManagedMusicAsset, ManagedVisualAsset, PendingVisualAsset, SceneStartResult, SceneStatusEvent, SimulatorCommand, SimulatorResult, VisualAssetProbe } from '../shared/types'
import type {
  ConsoleConfigDraftInput,
  ConsoleConfigPayload,
  ConsoleDiffConfirmation,
  ConsoleDraftTestResult,
  ConsoleEventsPage,
  ConsoleEventsQuery,
  ConsoleLifecycleActionResult,
  ConsoleModelDraftInput,
  ConsoleModelsPayload,
  ConsoleOverviewPayload,
  ConsolePhaseTestsPayload,
  ConsoleResponse,
  ConsoleRuntimeSnapshotResult,
  PhaseTestPhase,
} from '../shared/console-types'
import type {
  AvatarControlCommand,
  AvatarRuntimeSnapshot,
  ConsoleBridge,
  SnapshotListener,
} from '../shared/bridge'

const READY_CHANNEL = 'boot:renderer-ready' as const
const SNAPSHOT_CHANNEL = 'console:snapshot' as const
const GET_SNAPSHOT_CHANNEL = 'console:get-snapshot' as const
const SIMULATE_CHANNEL = 'console:simulate' as const
const START_CONVERSATION_CHANNEL = 'console:start-conversation' as const
const DISCONNECT_CHANNEL = 'console:disconnect' as const
const INTERRUPT_CHANNEL = 'console:interrupt' as const
const GET_OVERVIEW_CHANNEL = 'console:get-overview' as const
const GET_EVENTS_CHANNEL = 'console:get-events' as const
const GET_CONFIG_CHANNEL = 'console:get-config' as const
const GET_MODELS_CHANNEL = 'console:get-models' as const
const SAVE_MODEL_DRAFT_CHANNEL = 'console:save-model-draft' as const
const SAVE_DRAFT_CHANNEL = 'console:save-draft' as const
const TEST_DRAFT_CHANNEL = 'console:test-draft' as const
const PUBLISH_CHANNEL = 'console:publish' as const
const ROLLBACK_CHANNEL = 'console:rollback' as const
const NEXT_RUNTIME_CHANNEL = 'console:create-next-runtime' as const
const GET_PHASE_TESTS_CHANNEL = 'console:get-phase-tests' as const
const GET_AVATAR_RUNTIME_CHANNEL = 'console:get-avatar-runtime' as const
const AVATAR_CONTROL_CHANNEL = 'console:avatar-control' as const
const RUN_SCENE_CHANNEL = 'console:run-scene' as const
const STOP_SCENES_CHANNEL = 'console:stop-scenes' as const
const SCENE_STATUS_CHANNEL = 'console:scene-status' as const
const UPLOAD_MUSIC_CHANNEL = 'console:upload-music' as const
const UPLOAD_VISUAL_CHANNEL = 'console:upload-visual' as const
const FINALIZE_VISUAL_CHANNEL = 'console:finalize-visual' as const
const CANCEL_VISUAL_CHANNEL = 'console:cancel-visual' as const

const bridge: ConsoleBridge = {
  notifyReady(): void {
    ipcRenderer.send(READY_CHANNEL)
  },

  getSnapshot(): Promise<AppSnapshot> {
    return ipcRenderer.invoke(GET_SNAPSHOT_CHANNEL) as Promise<AppSnapshot>
  },

  onSnapshot(listener: SnapshotListener): () => void {
    const handler = (_event: IpcRendererEvent, snapshot: AppSnapshot): void => {
      listener(snapshot)
    }
    ipcRenderer.on(SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SNAPSHOT_CHANNEL, handler)
  },

  simulate(command: SimulatorCommand): Promise<SimulatorResult> {
    return ipcRenderer.invoke(SIMULATE_CHANNEL, command) as Promise<SimulatorResult>
  },

  startConversation(): Promise<ConsoleResponse<ConsoleLifecycleActionResult>> {
    return ipcRenderer.invoke(START_CONVERSATION_CHANNEL) as Promise<ConsoleResponse<ConsoleLifecycleActionResult>>
  },

  disconnect(): Promise<ConsoleResponse<ConsoleLifecycleActionResult>> {
    return ipcRenderer.invoke(DISCONNECT_CHANNEL) as Promise<ConsoleResponse<ConsoleLifecycleActionResult>>
  },

  interrupt(): Promise<ConsoleResponse<ConsoleLifecycleActionResult>> {
    return ipcRenderer.invoke(INTERRUPT_CHANNEL) as Promise<ConsoleResponse<ConsoleLifecycleActionResult>>
  },

  getOverview(): Promise<ConsoleResponse<ConsoleOverviewPayload>> {
    return ipcRenderer.invoke(GET_OVERVIEW_CHANNEL) as Promise<ConsoleResponse<ConsoleOverviewPayload>>
  },

  getEvents(request?: ConsoleEventsQuery): Promise<ConsoleResponse<ConsoleEventsPage>> {
    return ipcRenderer.invoke(GET_EVENTS_CHANNEL, request) as Promise<ConsoleResponse<ConsoleEventsPage>>
  },

  getConfig(): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    return ipcRenderer.invoke(GET_CONFIG_CHANNEL) as Promise<ConsoleResponse<ConsoleConfigPayload>>
  },

  getModels(): Promise<ConsoleResponse<ConsoleModelsPayload>> {
    return ipcRenderer.invoke(GET_MODELS_CHANNEL) as Promise<ConsoleResponse<ConsoleModelsPayload>>
  },

  saveModelDraft(input: ConsoleModelDraftInput): Promise<ConsoleResponse<ConsoleModelsPayload>> {
    return ipcRenderer.invoke(SAVE_MODEL_DRAFT_CHANNEL, input) as Promise<ConsoleResponse<ConsoleModelsPayload>>
  },

  saveDraft(input: ConsoleConfigDraftInput): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    return ipcRenderer.invoke(SAVE_DRAFT_CHANNEL, input) as Promise<ConsoleResponse<ConsoleConfigPayload>>
  },

  testDraft(): Promise<ConsoleResponse<ConsoleDraftTestResult>> {
    return ipcRenderer.invoke(TEST_DRAFT_CHANNEL) as Promise<ConsoleResponse<ConsoleDraftTestResult>>
  },

  publish(confirmation: ConsoleDiffConfirmation): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    return ipcRenderer.invoke(PUBLISH_CHANNEL, confirmation) as Promise<ConsoleResponse<ConsoleConfigPayload>>
  },

  rollback(confirmation: ConsoleDiffConfirmation): Promise<ConsoleResponse<ConsoleConfigPayload>> {
    return ipcRenderer.invoke(ROLLBACK_CHANNEL, confirmation) as Promise<ConsoleResponse<ConsoleConfigPayload>>
  },

  createNextRuntimeSnapshots(): Promise<ConsoleResponse<ConsoleRuntimeSnapshotResult>> {
    return ipcRenderer.invoke(NEXT_RUNTIME_CHANNEL) as Promise<ConsoleResponse<ConsoleRuntimeSnapshotResult>>
  },

  getPhaseTests(phase?: PhaseTestPhase): Promise<ConsoleResponse<ConsolePhaseTestsPayload>> {
    if (phase === undefined) {
      return ipcRenderer.invoke(GET_PHASE_TESTS_CHANNEL) as Promise<ConsoleResponse<ConsolePhaseTestsPayload>>
    }
    return ipcRenderer.invoke(GET_PHASE_TESTS_CHANNEL, phase) as Promise<ConsoleResponse<ConsolePhaseTestsPayload>>
  },

  getAvatarRuntime(): Promise<ConsoleResponse<AvatarRuntimeSnapshot>> {
    return ipcRenderer.invoke(GET_AVATAR_RUNTIME_CHANNEL) as Promise<ConsoleResponse<AvatarRuntimeSnapshot>>
  },

  controlAvatar(command: AvatarControlCommand): Promise<ConsoleResponse<AvatarRuntimeSnapshot>> {
    return ipcRenderer.invoke(AVATAR_CONTROL_CHANNEL, command) as Promise<ConsoleResponse<AvatarRuntimeSnapshot>>
  },

  runScene(sceneId: string): Promise<ConsoleResponse<SceneStartResult>> {
    return ipcRenderer.invoke(RUN_SCENE_CHANNEL, sceneId) as Promise<ConsoleResponse<SceneStartResult>>
  },

  stopScenes(): Promise<ConsoleResponse<{ readonly status: 'stopped' }>> {
    return ipcRenderer.invoke(STOP_SCENES_CHANNEL) as Promise<ConsoleResponse<{ readonly status: 'stopped' }>>
  },

  onSceneStatus(listener): () => void {
    const handler = (_event: IpcRendererEvent, value: SceneStatusEvent): void => {
      listener(value)
    }
    ipcRenderer.on(SCENE_STATUS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SCENE_STATUS_CHANNEL, handler)
  },

  uploadMusic(): Promise<ConsoleResponse<ManagedMusicAsset | null>> {
    return ipcRenderer.invoke(UPLOAD_MUSIC_CHANNEL) as Promise<ConsoleResponse<ManagedMusicAsset | null>>
  },
  importMedia(request) {
    return ipcRenderer.invoke('console:import-media', request)
  },

  uploadVisual(): Promise<ConsoleResponse<PendingVisualAsset | null>> {
    return ipcRenderer.invoke(UPLOAD_VISUAL_CHANNEL) as Promise<ConsoleResponse<PendingVisualAsset | null>>
  },

  finalizeVisual(input: Readonly<{ token: string; probe: VisualAssetProbe }>): Promise<ConsoleResponse<ManagedVisualAsset>> {
    return ipcRenderer.invoke(FINALIZE_VISUAL_CHANNEL, Object.freeze({
      token: input.token,
      probe: Object.freeze({ ...input.probe }),
    })) as Promise<ConsoleResponse<ManagedVisualAsset>>
  },

  cancelVisual(token: string): Promise<ConsoleResponse<{ readonly status: 'cancelled' }>> {
    return ipcRenderer.invoke(CANCEL_VISUAL_CHANNEL, Object.freeze({ token })) as Promise<ConsoleResponse<{ readonly status: 'cancelled' }>>
  },
}

contextBridge.exposeInMainWorld('magicMirror', bridge)
