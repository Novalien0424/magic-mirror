export type LifecycleState =
  | 'starting' | 'dormant' | 'activating' | 'active'
  | 'suspending' | 'offlineLoop' | 'maintenance';

export type ModuleId =
  | 'app' | 'openai' | 'wake' | 'audio' | 'camera' | 'identity' | 'memory'
  | 'avatar' | 'lighting' | 'fog' | 'music' | 'sqlite' | 'config' | 'telemetry';

export type ModuleStatus = 'not_implemented' | 'ready' | 'degraded' | 'failed';
export type OpStatus = 'success' | 'degraded' | 'failed';

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

export interface MirrorConfig {
  configVersion: number;                     // bumped on every publish
  persona: { name: string; instructions: string };
  voice: string;
  idleSeconds: number;                       // 300 in production config
  aiModels: AiModelsConfig;
  wake: { phrase: string; modelVersion: string };
  faceModel: { detectorId: string; recognizerId: string };
  assets: { offlineLoopVideo: string; avatarDir: string; musicDir: string };
  spells: unknown[];                         // Phase 4 owns the shape
  scenes: unknown[];
  adapters: { lighting: 'mock' | 'physical'; fog: 'mock' | 'physical'; music: 'mock' | 'physical' };
}

export interface FieldError { path: string; message: string }
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface ConfigDiff { changed: Array<{ path: string; from: unknown; to: unknown }>; nonModelChanges: boolean }

export interface SessionModelSnapshot {
  configVersion: number; fingerprint: string;
  realtimeDialogue: string; inputTranscription: string; voice: string;
  takenAt: string;
}
export interface JobModelSnapshot {
  configVersion: number; fingerprint: string; memoryExtractor: string; takenAt: string;
}

export interface AppSnapshot {
  lifecycle: LifecycleState;
  appVersion: string; buildCommit: string; configVersion: number;
  modules: Record<ModuleId, ModuleStatus>;
  activeProfileId: string | 'anonymous' | null;
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

export interface PhaseTestRecord {
  demoId: string;               // 'P0-D1' ...
  build: string; time: string; result: 'passed' | 'failed' | 'mock_passed';
  note?: string;
}
