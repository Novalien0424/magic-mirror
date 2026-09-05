export type LifecycleState =
  | 'starting' | 'dormant' | 'activating' | 'active'
  | 'suspending' | 'offlineLoop' | 'maintenance';

export type ModuleId =
  | 'app' | 'openai' | 'wake' | 'audio' | 'camera' | 'identity' | 'memory'
  | 'avatar' | 'lighting' | 'fog' | 'music' | 'sqlite' | 'config' | 'telemetry';

export type ModuleStatus = 'not_implemented' | 'ready' | 'degraded' | 'failed';
export type OpStatus = 'success' | 'degraded' | 'failed';
export type IdentityStatus = 'unassigned' | 'confirming' | 'active' | 'anonymous' | 'group';

export interface MirrorEvent {
  time: string;                 // ISO-8601, set by Telemetry.emit
  module: ModuleId;
  event: string;                // snake_case, e.g. 'lifecycle_transition'
  status: OpStatus | 'info';
  duration_ms?: number;
  error_code?: string;
  session_id?: string;
  scene_id?: string;
  reason?: string;
  source?: 'runtime' | 'simulator' | 'contract_test';
}

export interface AiModelRoleConfig { modelId: string; note?: string }
export interface AiModelsConfig {
  realtimeDialogue: AiModelRoleConfig;
  inputTranscription: AiModelRoleConfig;
  memoryExtractor: AiModelRoleConfig;
}

export type SceneFeedbackCapability = 'dispatch_only' | 'acknowledgement' | 'completion';
export type SceneActionFeedbackStatus =
  | 'dispatched' | 'acknowledged' | 'completed' | 'failed' | 'timeout';

interface SceneActionBase {
  id: string;
  name: string;
  enabled: boolean;
}

interface ManagedVisualAssetBase {
  id: string;
  name: string;
  fileName: string;
  byteLength: number;
  sha256: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
  windowsDecode: 'passed';
}

export type ManagedVisualAsset = ManagedVisualAssetBase & (
  | {
      kind: 'image';
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
      audioTrack: 'absent';
    }
  | {
      kind: 'video';
      mimeType: 'video/mp4' | 'video/webm';
      durationMs: number;
      audioTrack: 'present' | 'absent' | 'unknown';
    }
);

export interface PendingVisualAsset {
  readonly token: string;
  readonly assetId: string;
  readonly name: string;
  readonly kind: 'image' | 'video';
  readonly mimeType: ManagedVisualAsset['mimeType'];
  readonly byteLength: number;
  readonly sha256: string;
}

export type VisualAssetProbe =
  | Readonly<{ width: number; height: number; audioTrack: 'absent' }>
  | Readonly<{
      width: number;
      height: number;
      durationMs: number;
      audioTrack: 'present' | 'absent' | 'unknown';
    }>;

export type PhysicalSceneActionDefinition<K extends 'lighting' | 'fog'> =
  | (SceneActionBase & {
      kind: K;
      command: 'on' | 'off';
      presetId: string;
    })
  | (SceneActionBase & {
      kind: K;
      command: 'value';
      presetId: string;
      value: number;
    });

export type SceneActionDefinition =
  | (SceneActionBase & {
      kind: 'visual';
      assetId: string;
      fit: 'contain' | 'cover';
      playback: 'still' | 'once' | 'loop';
      audio: 'muted' | 'embedded';
      gain: number;
    })
  | (SceneActionBase & { kind: 'avatar_dialogue'; text: string })
  | (SceneActionBase & { kind: 'avatar_motion'; motionGroup: string })
  | (SceneActionBase & { kind: 'avatar_expression'; expression: string })
  | PhysicalSceneActionDefinition<'lighting'>
  | PhysicalSceneActionDefinition<'fog'>
  | (SceneActionBase & {
      kind: 'music';
      command: 'play';
      assetId: string;
      gain: number;
      loop: boolean;
    })
  | (SceneActionBase & {
      kind: 'music';
      command: 'stop';
      fadeDurationMs: number;
    })
  | (SceneActionBase & {
      kind: 'music';
      command: 'fade';
      targetGain: number;
      durationMs: number;
    });

/** Current Ren Cubism manifest capabilities exposed to Phase 4 authoring. */
export const REN_MOTION_GROUPS = [
  'Dormant', 'Waking', 'Listening', 'Thinking', 'Speaking', 'Scene', 'Suspending',
] as const;
export const REN_EXPRESSION_NAMES = ['exp_01', 'exp_02', 'exp_03', 'exp_04', 'exp_05'] as const;

export type StageEndCondition =
  | { kind: 'duration'; durationMs: number }
  | { kind: 'video_complete'; visualActionId: string }
  | { kind: 'until_stopped'; maxRuntimeMs: number };

export interface SceneStageDefinition {
  id: string;
  name: string;
  endCondition: StageEndCondition;
  actionIds: string[];
}

export interface SceneDefinition {
  id: string;
  name: string;
  enabled: boolean;
  stages: SceneStageDefinition[];
}

export interface SpellConfig {
  id: string;
  name: string;
  phrase: string;
  sceneId: string;
  enabled: boolean;
  cooldownMs: number;
}

export interface ManagedMusicAsset {
  id: string;
  name: string;
  fileName: string;
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/mp4';
  byteLength: number;
  sha256: string;
}

export interface ScenePublicCatalog {
  configVersion: number;
  stopPhrase: string;
  spells: Array<Pick<SpellConfig, 'id' | 'phrase'>>;
}

export type SceneRunSkipReason =
  | 'duplicate_turn' | 'cooldown' | 'disabled' | 'invalid_config';

export interface SceneActionRunResult {
  actionId: string;
  stageId: string;
  status: SceneActionFeedbackStatus;
  errorCode?: string;
}

export interface SceneActionCommandContext {
  runId: string;
  sceneId: string;
  stageId: string;
  actionId: string;
}

export interface SceneActionRendererReport extends SceneActionCommandContext {
  status: 'acknowledged' | 'completed' | 'failed' | 'timeout';
  errorCode?: string;
}

export type SceneVisualPlaybackReport = SceneActionCommandContext & (
  | { type: 'ready' }
  | { type: 'playing'; durationMs: number }
  | { type: 'progress'; currentTimeMs: number }
  | { type: 'ended' }
  | { type: 'failed'; errorCode: string }
);

export type SceneStartResult =
  | Readonly<{ runId: string; sceneId: string; status: 'accepted' }>
  | Readonly<{
      runId: string;
      status: 'skipped';
      skipReason: SceneRunSkipReason | 'stopped_before_start';
    }>;

export type SceneStatusEvent =
  | Readonly<{ type: 'started' | 'stage_started'; runId: string; sceneId: string; stageId: string }>
  | Readonly<{ type: 'finished'; result: SceneRunResult }>;

export interface SceneRunResult {
  runId: string;
  sceneId?: string;
  status: 'completed' | 'partial_failure' | 'failed' | 'stopped' | 'skipped';
  durationMs: number;
  skipReason?: SceneRunSkipReason;
  actions: SceneActionRunResult[];
}

export interface MirrorConfig {
  presentation?: import('./presentation').PresentationConfig;
  configVersion: number;                     // bumped on every publish
  persona: { name: string; instructions: string };
  voice: string;
  reasoningEffort: string;
  turnDetectionProfile: string;
  idleSeconds: number;                       // 300 in production config
  aiModels: AiModelsConfig;
  wake: { phrase: string; modelVersion: string; packageId: string };
  faceModel: { detectorId: string; recognizerId: string };
  assets: { offlineLoopVideo: string; avatarDir: string; musicDir: string };
  visualAssets: ManagedVisualAsset[];
  musicAssets: ManagedMusicAsset[];
  sceneActions: SceneActionDefinition[];
  spells: SpellConfig[];
  scenes: SceneDefinition[];
  adapters: { lighting: 'mock' | 'physical'; fog: 'mock' | 'physical'; music: 'mock' | 'physical' };
}

export interface FieldError { path: string; message: string }
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface ConfigDiff { changed: Array<{ path: string; from: unknown; to: unknown }>; nonModelChanges: boolean }

export interface SessionModelSnapshot {
  configVersion: number; fingerprint: string;
  sdkVersion: '0.16.1';
  realtimeDialogue: string; inputTranscription: string; memoryExtractor: string;
  voice: string; reasoningEffort: string; turnDetectionProfile: string;
  takenAt: string;
}
export interface JobModelSnapshot {
  configVersion: number; fingerprint: string; memoryExtractor: string; takenAt: string;
}

export interface AppSnapshot {
  lifecycle: LifecycleState;
  appVersion: string; buildCommit: string; configVersion: number | null;
  modules: Record<ModuleId, ModuleStatus>;
  identityStatus: IdentityStatus;
  realtimeSessionId: string | null;
  sessionGeneration: number;
  lastError: { module: ModuleId; error_code: string; time: string } | null;
  maintenance: { code: string; detail: string } | null;   // set when lifecycle==='maintenance'
}

export type SimulatorCommand =
  | { type: 'wake' }
  | { type: 'cloud_failure' } | { type: 'cloud_recovery' }
  | { type: 'camera_result'; faces: 0 | 1 | 'multiple' }
  | { type: 'avatar_state'; state: string }
  | { type: 'scene_result'; sceneId: string; status: OpStatus }
  | { type: 'sqlite_failure' }
  | { type: 'sleep' };

export interface SimulatorResult {
  readonly op: OpStatus;
  readonly lifecycleEvent?: string;
}

export interface PhaseTestRecord {
  demoId: string;               // 'P0-D1' ...
  build: string; time: string; result: 'passed' | 'failed' | 'mock_passed';
  note?: string;
}
