import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { parseAudioPreferences } from '../shared/audio-devices'
import { parsePresentation } from '../shared/presentation'
import type {
  AppSnapshot,
  SceneActionCommandContext,
  SceneActionRendererReport,
  ScenePublicCatalog,
  SceneStartResult,
  SceneStatusEvent,
  SceneVisualPlaybackReport,
} from '../shared/types'
import type {
  MirrorBridge,
  AvatarControlCommand,
  AvatarRuntimeSnapshot,
  RealtimeFailureReport,
  RealtimeRendererMetadataReport,
  RealtimeRuntimeCommand,
  RealtimeRuntimeCommandListener,
  RealtimeRuntimeOutcomeReport,
  RealtimeSessionStartBundleValue,
  SnapshotListener,
  TransientRealtimeSecretResult,
} from '../shared/bridge'
import { AVATAR_RUNTIME_STATES } from '../shared/bridge'

// Smoke-contract failure switch: a missing bridge remains visible in the renderer.
if (process.env['MIRROR_FORCE_RENDERER_FAIL'] === '1') {
  throw new Error('MIRROR_FORCE_RENDERER_FAIL=1 mirror preload aborted deliberately')
}

const READY_CHANNEL = 'boot:renderer-ready' as const
const SNAPSHOT_CHANNEL = 'mirror:snapshot' as const
const GET_SNAPSHOT_CHANNEL = 'mirror:get-snapshot' as const
const REQUEST_REALTIME_CLIENT_SECRET_CHANNEL = 'mirror:request-realtime-client-secret' as const
const REALTIME_RUNTIME_COMMAND_CHANNEL = 'mirror:realtime-runtime-command' as const
const INTERRUPT_CHANNEL = 'mirror:interrupt' as const
const REPORT_REALTIME_RUNTIME_OUTCOME_CHANNEL = 'mirror:report-realtime-runtime-outcome' as const
const REPORT_REALTIME_FAILURE_CHANNEL = 'mirror:report-realtime-failure' as const
const REPORT_REALTIME_METADATA_CHANNEL = 'mirror:report-realtime-metadata' as const
const SLEEP_REQUEST_CHANNEL = 'mirror:sleep-request' as const
const AVATAR_CONTROL_CHANNEL = 'mirror:avatar-control' as const
const REPORT_AVATAR_RUNTIME_CHANNEL = 'mirror:report-avatar-runtime' as const
const REPORT_SCENE_ACTION_CHANNEL = 'mirror:report-scene-action' as const
const REPORT_SCENE_VISUAL_CHANNEL = 'mirror:report-scene-visual' as const
const GET_SCENE_CATALOG_CHANNEL = 'mirror:get-scene-catalog' as const
const TRIGGER_SCENE_CHANNEL = 'mirror:trigger-scene' as const
const STOP_SCENE_CHANNEL = 'mirror:stop-scene' as const
const SCENE_STATUS_CHANNEL = 'mirror:scene-status' as const

const SESSION_SNAPSHOT_KEYS = [
  'configVersion',
  'fingerprint',
  'sdkVersion',
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
  'voice',
  'reasoningEffort',
  'turnDetectionProfile',
  'takenAt',
] as const

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function readMetadataScalar(value: unknown, key: string): unknown {
  try {
    const property = readProperty(value, key)
    return property === null
      || typeof property === 'string'
      || typeof property === 'number'
      || typeof property === 'boolean'
      ? property
      : undefined
  } catch {
    return undefined
  }
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  if (!isRecord(value)) return false
  try {
    const keys = Reflect.ownKeys(value)
    return keys.length === expected.length
      && keys.every((key) => typeof key === 'string' && expected.includes(key))
      && expected.every((key) => keys.includes(key))
  } catch {
    return false
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function unitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function sanitizeSceneActionContext(value: unknown): SceneActionCommandContext | null {
  if (!exactKeys(value, ['runId', 'sceneId', 'stageId', 'actionId'])) return null
  const ids = ['runId', 'sceneId', 'stageId', 'actionId'] as const
  if (!ids.every((key) => {
    const id = readProperty(value, key)
    return typeof id === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(id)
  })) return null
  return Object.freeze({
    runId: readProperty(value, 'runId') as string,
    sceneId: readProperty(value, 'sceneId') as string,
    stageId: readProperty(value, 'stageId') as string,
    actionId: readProperty(value, 'actionId') as string,
  })
}

function sanitizeAvatarControl(value: unknown): AvatarControlCommand | null {
  if (!isRecord(value)) return null
  const type = readProperty(value, 'type')
  if (type === 'refresh_audio_devices' && exactKeys(value, ['type'])) return { type }
  if (type === 'audio_devices' && exactKeys(value, ['type', 'preferences'])) {
    const preferences = parseAudioPreferences(readProperty(value, 'preferences'))
    return preferences ? Object.freeze({ type, preferences }) : null
  }
  if (type === 'state' && exactKeys(value, ['type', 'state'])) {
    const state = readProperty(value, 'state')
    return AVATAR_RUNTIME_STATES.includes(state as AvatarRuntimeSnapshot['state'])
      ? Object.freeze({ type, state: state as AvatarRuntimeSnapshot['state'] })
      : null
  }
  if (type === 'asset_failure' && exactKeys(value, ['type', 'action'])) {
    const action = readProperty(value, 'action')
    return action === 'inject' || action === 'clear'
      ? Object.freeze({ type, action })
      : null
  }
  if (type === 'expression' && (
    exactKeys(value, ['type', 'name']) || exactKeys(value, ['type', 'name', 'context'])
  )) {
    const name = readProperty(value, 'name')
    const context = readProperty(value, 'context')
    const sanitizedContext = context === undefined ? undefined : sanitizeSceneActionContext(context)
    if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(name) || sanitizedContext === null) return null
    return Object.freeze({ type, name, ...(sanitizedContext === undefined ? {} : { context: sanitizedContext }) })
  }
  if (type === 'motion' && (
    exactKeys(value, ['type', 'group']) || exactKeys(value, ['type', 'group', 'context'])
  )) {
    const group = readProperty(value, 'group')
    const context = readProperty(value, 'context')
    const sanitizedContext = context === undefined ? undefined : sanitizeSceneActionContext(context)
    if (typeof group !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(group) || sanitizedContext === null) return null
    return Object.freeze({ type, group, ...(sanitizedContext === undefined ? {} : { context: sanitizedContext }) })
  }
  if (type === 'scene_dialogue' && exactKeys(value, ['type', 'text', 'context'])) {
    const text = readProperty(value, 'text')
    const context = sanitizeSceneActionContext(readProperty(value, 'context'))
    return typeof text === 'string' && text.trim().length > 0 && text.length <= 1000 && context !== null
      ? Object.freeze({ type, text, context })
      : null
  }
  if (type === 'scene_music') {
    const action = readProperty(value, 'action')
    const rawContext = readProperty(value, 'context')
    const context = rawContext === undefined ? undefined : sanitizeSceneActionContext(rawContext)
    if (context === null) return null
    if (action === 'play' && (
      exactKeys(value, ['type', 'action', 'assetId', 'gain', 'loop'])
      || exactKeys(value, ['type', 'action', 'assetId', 'gain', 'loop', 'context'])
    )) {
      const assetId = readProperty(value, 'assetId')
      const gain = readProperty(value, 'gain')
      const loop = readProperty(value, 'loop')
      return typeof assetId === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(assetId)
        && unitNumber(gain) && typeof loop === 'boolean'
        ? Object.freeze({ type, action, assetId, gain, loop, ...(context === undefined ? {} : { context }) })
        : null
    }
    if (action === 'stop' && (
      exactKeys(value, ['type', 'action', 'fadeDurationMs'])
      || exactKeys(value, ['type', 'action', 'fadeDurationMs', 'context'])
    )) {
      const fadeDurationMs = readProperty(value, 'fadeDurationMs')
      return typeof fadeDurationMs === 'number' && Number.isSafeInteger(fadeDurationMs)
        && fadeDurationMs >= 0 && fadeDurationMs <= 60_000
        ? Object.freeze({ type, action, fadeDurationMs, ...(context === undefined ? {} : { context }) })
        : null
    }
    if (action === 'fade' && (
      exactKeys(value, ['type', 'action', 'targetGain', 'durationMs'])
      || exactKeys(value, ['type', 'action', 'targetGain', 'durationMs', 'context'])
    )) {
      const targetGain = readProperty(value, 'targetGain')
      const durationMs = readProperty(value, 'durationMs')
      return unitNumber(targetGain) && typeof durationMs === 'number'
        && Number.isSafeInteger(durationMs) && durationMs >= 1 && durationMs <= 60_000
        ? Object.freeze({ type, action, targetGain, durationMs, ...(context === undefined ? {} : { context }) })
        : null
    }
  }
  if (type === 'scene_visual') {
    const action = readProperty(value, 'action')
    if (action === 'start' && exactKeys(value, [
      'type', 'action', 'assetId', 'fit', 'playback', 'audio', 'gain', 'context',
    ])) {
      const assetId = readProperty(value, 'assetId')
      const fit = readProperty(value, 'fit')
      const playback = readProperty(value, 'playback')
      const audio = readProperty(value, 'audio')
      const gain = readProperty(value, 'gain')
      const context = sanitizeSceneActionContext(readProperty(value, 'context'))
      return typeof assetId === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(assetId)
        && (fit === 'contain' || fit === 'cover')
        && (playback === 'still' || playback === 'once' || playback === 'loop')
        && (audio === 'muted' || audio === 'embedded')
        && unitNumber(gain) && context !== null
        ? Object.freeze({ type, action, assetId, fit, playback, audio, gain, context })
        : null
    }
    if (action === 'stop' && exactKeys(value, ['type', 'action', 'runId', 'sceneId'])) {
      const runId = readProperty(value, 'runId')
      const sceneId = readProperty(value, 'sceneId')
      return typeof runId === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(runId)
        && typeof sceneId === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(sceneId)
        ? Object.freeze({ type, action, runId, sceneId })
        : null
    }
  }
  if ((type === 'recorded_audio' || type === 'music') && exactKeys(value, ['type', 'action'])) {
    const action = readProperty(value, 'action')
    return action === 'play' || action === 'stop' ? Object.freeze({ type, action }) : null
  }
  if ((type === 'voice_gain' || type === 'music_gain') && exactKeys(value, ['type', 'value'])) {
    const next = readProperty(value, 'value')
    return unitNumber(next) ? Object.freeze({ type, value: next }) : null
  }
  return null
}

function sanitizeRealtimeRuntimeCommand(value: unknown): RealtimeRuntimeCommand | null {
  if (!isRecord(value) || !exactKeys(value, ['operation', 'reason'])) return null
  const operation = readProperty(value, 'operation')
  const reason = readProperty(value, 'reason')
  if (operation === 'start' && reason === 'manual_start') {
    return Object.freeze({ operation: 'start', reason: 'manual_start' })
  }
  if (operation === 'stop' && reason === 'manual_stop') {
    return Object.freeze({ operation: 'stop', reason: 'manual_stop' })
  }
  if (operation === 'rollover' && reason === 'session_limit') {
    return Object.freeze({ operation: 'rollover', reason: 'session_limit' })
  }
  return null
}

function isValidSessionStartBundleValue(value: unknown): value is RealtimeSessionStartBundleValue {
  if (!isRecord(value)) return false
  const hasExpiry = exactKeys(value, ['snapshot', 'identity', 'clientSecret', 'expiresAt'])
  if (!hasExpiry && !exactKeys(value, ['snapshot', 'identity', 'clientSecret'])) return false

  const snapshot = readProperty(value, 'snapshot')
  if (!isRecord(snapshot) || !exactKeys(snapshot, SESSION_SNAPSHOT_KEYS)) return false
  if (
    typeof readProperty(snapshot, 'configVersion') !== 'number'
    || !Number.isSafeInteger(readProperty(snapshot, 'configVersion'))
    || (readProperty(snapshot, 'configVersion') as number) < 1
    || !nonEmptyString(readProperty(snapshot, 'sdkVersion'))
  ) {
    return false
  }
  for (const key of SESSION_SNAPSHOT_KEYS) {
    if (key === 'configVersion' || key === 'sdkVersion') continue
    if (!nonEmptyString(readProperty(snapshot, key))) return false
  }

  const identity = readProperty(value, 'identity')
  if (
    !isRecord(identity)
    || !exactKeys(identity, ['realtimeSessionId', 'sessionGeneration'])
    || !nonEmptyString(readProperty(identity, 'realtimeSessionId'))
    || typeof readProperty(identity, 'sessionGeneration') !== 'number'
    || !Number.isSafeInteger(readProperty(identity, 'sessionGeneration'))
    || (readProperty(identity, 'sessionGeneration') as number) <= 0
  ) {
    return false
  }

  const clientSecret = readProperty(value, 'clientSecret')
  if (typeof clientSecret !== 'string' || !clientSecret.startsWith('ek_') || clientSecret.length <= 3) {
    return false
  }
  const expiresAt = readProperty(value, 'expiresAt')
  return !hasExpiry || (
    typeof expiresAt === 'number'
    && Number.isSafeInteger(expiresAt)
  )
}

function invalidRealtimeSecretResult(): TransientRealtimeSecretResult {
  return Object.freeze({ status: 'rejected', reason: 'invalid_payload' })
}

function sanitizeSessionStartBundleValue(value: unknown): RealtimeSessionStartBundleValue {
  const snapshot = readProperty(value, 'snapshot')
  const identity = readProperty(value, 'identity')
  const sanitizedSnapshot = Object.freeze({
    configVersion: readProperty(snapshot, 'configVersion') as number,
    fingerprint: readProperty(snapshot, 'fingerprint') as string,
    sdkVersion: readProperty(snapshot, 'sdkVersion') as RealtimeSessionStartBundleValue['snapshot']['sdkVersion'],
    realtimeDialogue: readProperty(snapshot, 'realtimeDialogue') as string,
    inputTranscription: readProperty(snapshot, 'inputTranscription') as string,
    memoryExtractor: readProperty(snapshot, 'memoryExtractor') as string,
    voice: readProperty(snapshot, 'voice') as string,
    reasoningEffort: readProperty(snapshot, 'reasoningEffort') as string,
    turnDetectionProfile: readProperty(snapshot, 'turnDetectionProfile') as string,
    takenAt: readProperty(snapshot, 'takenAt') as string,
  })
  const sanitizedIdentity = Object.freeze({
    realtimeSessionId: readProperty(identity, 'realtimeSessionId') as string,
    sessionGeneration: readProperty(identity, 'sessionGeneration') as number,
  })
  const clientSecret = readProperty(value, 'clientSecret') as RealtimeSessionStartBundleValue['clientSecret']
  const expiresAt = readProperty(value, 'expiresAt')
  const sanitizedValue = expiresAt === undefined
    ? { snapshot: sanitizedSnapshot, identity: sanitizedIdentity, clientSecret }
    : { snapshot: sanitizedSnapshot, identity: sanitizedIdentity, clientSecret, expiresAt: expiresAt as number }
  return Object.freeze(sanitizedValue)
}

function validateRealtimeSecretResult(value: unknown): TransientRealtimeSecretResult {
  const status = readProperty(value, 'status')
  if (status === 'accepted') {
    if (
      !exactKeys(value, ['status', 'reason', 'value'])
      || readProperty(value, 'reason') !== 'mirror_authorized'
      || !isValidSessionStartBundleValue(readProperty(value, 'value'))
    ) {
      return invalidRealtimeSecretResult()
    }
    return Object.freeze({
      status: 'accepted',
      reason: 'mirror_authorized',
      value: sanitizeSessionStartBundleValue(readProperty(value, 'value')),
    })
  }

  const rejectedReasons = new Set([
    'unauthorized_sender',
    'broker_unavailable',
    'broker_failed',
    'session_unavailable',
    'invalid_payload',
  ])
  if (
    status !== 'rejected'
    || !exactKeys(value, ['status', 'reason'])
    || !rejectedReasons.has(readProperty(value, 'reason') as string)
  ) {
    return invalidRealtimeSecretResult()
  }
  return Object.freeze({
    status: 'rejected',
    reason: readProperty(value, 'reason') as
      | 'unauthorized_sender'
      | 'broker_unavailable'
      | 'broker_failed'
      | 'session_unavailable'
      | 'invalid_payload',
  })
}

const bridge: MirrorBridge = {
  async getPresentation() {
    const value = await ipcRenderer.invoke('mirror:get-presentation')
    if (!isRecord(value) || !exactKeys(value, ['config', 'background'])) return null
    const config = parsePresentation(value.config)
    if (!config) return null
    const background = value.background
    if (background === null) return { config, background: null }
    if (!isRecord(background) || !exactKeys(background, ['id', 'kind'])
      || background.id !== config.backgroundId || (background.kind !== 'image' && background.kind !== 'video')) return null
    return { config, background: { id: config.backgroundId, kind: background.kind } }
  },
  async getAudioPreferences() {
    const result = await ipcRenderer.invoke('mirror:get-audio-preferences')
    const preferences = parseAudioPreferences(readProperty(result, 'preferences'))
    const reason = readProperty(result, 'reason')
    if (!preferences || typeof reason !== 'string' || !/^audio_[a-z_]{1,80}$/.test(reason)) throw new Error('audio_preferences_invalid')
    return { preferences, reason }
  },
  notifyReady(): void {
    ipcRenderer.send(READY_CHANNEL)
  },

  getSnapshot(): Promise<AppSnapshot> {
    return ipcRenderer.invoke(GET_SNAPSHOT_CHANNEL) as Promise<AppSnapshot>
  },

  async requestRealtimeClientSecret(): Promise<TransientRealtimeSecretResult> {
    const result: unknown = await ipcRenderer.invoke(REQUEST_REALTIME_CLIENT_SECRET_CHANNEL)
    return validateRealtimeSecretResult(result)
  },

  reportRealtimeRuntimeOutcome(report: RealtimeRuntimeOutcomeReport): void {
    const dto = Object.freeze({
      status: readProperty(report, 'status'),
      operation: readProperty(report, 'operation'),
      reason: readProperty(report, 'reason'),
    })
    ipcRenderer.send(REPORT_REALTIME_RUNTIME_OUTCOME_CHANNEL, dto)
  },

  reportRealtimeFailure(report: RealtimeFailureReport): void {
    const dto = Object.freeze({
      kind: readProperty(report, 'kind'),
      realtimeSessionId: readProperty(report, 'realtimeSessionId'),
      reason: readProperty(report, 'reason'),
    })
    ipcRenderer.send(REPORT_REALTIME_FAILURE_CHANNEL, dto)
  },

  reportRealtimeMetadata(report: RealtimeRendererMetadataReport): void {
    const dto: Record<string, unknown> = {
      kind: readMetadataScalar(report, 'kind'),
      status: readMetadataScalar(report, 'status'),
      reason: readMetadataScalar(report, 'reason'),
    }
    const durationMs = readMetadataScalar(report, 'durationMs')
    if (durationMs !== undefined) dto.durationMs = durationMs
    const sessionId = readMetadataScalar(report, 'sessionId')
    if (sessionId !== undefined) dto.sessionId = sessionId
    ipcRenderer.send(REPORT_REALTIME_METADATA_CHANNEL, Object.freeze(dto))
  },

  requestSleep(): void {
    ipcRenderer.send(SLEEP_REQUEST_CHANNEL)
  },

  reportAvatarRuntime(snapshot: AvatarRuntimeSnapshot): void {
    ipcRenderer.send(REPORT_AVATAR_RUNTIME_CHANNEL, Object.freeze({
      status: readProperty(snapshot, 'status'),
      reason: readProperty(snapshot, 'reason'),
      state: readProperty(snapshot, 'state'),
      fps: readProperty(snapshot, 'fps'),
      waveform: readProperty(snapshot, 'waveform'),
      mouthOpen: readProperty(snapshot, 'mouthOpen'),
      audioUnderruns: readProperty(snapshot, 'audioUnderruns'),
      voiceGain: readProperty(snapshot, 'voiceGain'),
      musicGain: readProperty(snapshot, 'musicGain'),
      ...(snapshot.audioDevices === undefined ? {} : { audioDevices: snapshot.audioDevices }),
    }))
  },

  reportSceneAction(report: SceneActionRendererReport): void {
    const dto: Record<string, unknown> = {
      runId: readProperty(report, 'runId'),
      sceneId: readProperty(report, 'sceneId'),
      stageId: readProperty(report, 'stageId'),
      actionId: readProperty(report, 'actionId'),
      status: readProperty(report, 'status'),
    }
    const errorCode = readProperty(report, 'errorCode')
    if (errorCode !== undefined) dto.errorCode = errorCode
    ipcRenderer.send(REPORT_SCENE_ACTION_CHANNEL, Object.freeze(dto))
  },

  reportSceneVisual(report: SceneVisualPlaybackReport): void {
    const dto: Record<string, unknown> = {
      runId: readProperty(report, 'runId'),
      sceneId: readProperty(report, 'sceneId'),
      stageId: readProperty(report, 'stageId'),
      actionId: readProperty(report, 'actionId'),
      type: readProperty(report, 'type'),
    }
    for (const key of ['durationMs', 'currentTimeMs', 'errorCode'] as const) {
      const value = readProperty(report, key)
      if (value !== undefined) dto[key] = value
    }
    ipcRenderer.send(REPORT_SCENE_VISUAL_CHANNEL, Object.freeze(dto))
  },

  getSceneCatalog(): Promise<ScenePublicCatalog> {
    return ipcRenderer.invoke(GET_SCENE_CATALOG_CHANNEL) as Promise<ScenePublicCatalog>
  },

  triggerScene(request): Promise<SceneStartResult> {
    return ipcRenderer.invoke(TRIGGER_SCENE_CHANNEL, Object.freeze({
      spellId: readProperty(request, 'spellId'),
      turnId: readProperty(request, 'turnId'),
    })) as Promise<SceneStartResult>
  },

  stopScene(request): Promise<'stopped' | 'stale'> {
    return ipcRenderer.invoke(STOP_SCENE_CHANNEL, Object.freeze({
      runId: readProperty(request, 'runId'),
      turnId: readProperty(request, 'turnId'),
    })) as Promise<'stopped' | 'stale'>
  },

  onSceneStatus(listener): () => void {
    const handler = (_event: IpcRendererEvent, value: SceneStatusEvent): void => {
      listener(value)
    }
    ipcRenderer.on(SCENE_STATUS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SCENE_STATUS_CHANNEL, handler)
  },

  onAvatarControl(listener): () => void {
    const handler = (_event: IpcRendererEvent, value: unknown): void => {
      const command = sanitizeAvatarControl(value)
      if (command !== null) listener(command)
    }
    ipcRenderer.on(AVATAR_CONTROL_CHANNEL, handler)
    return () => ipcRenderer.removeListener(AVATAR_CONTROL_CHANNEL, handler)
  },

  onRealtimeRuntimeCommand(listener: RealtimeRuntimeCommandListener): () => void {
    const handler = (_event: IpcRendererEvent, value: unknown): void => {
      const command = sanitizeRealtimeRuntimeCommand(value)
      if (command === null) return
      listener(command)
    }
    ipcRenderer.on(REALTIME_RUNTIME_COMMAND_CHANNEL, handler)
    return () => ipcRenderer.removeListener(REALTIME_RUNTIME_COMMAND_CHANNEL, handler)
  },

  onInterrupt(listener: () => void): () => void {
    const handler = (_event: IpcRendererEvent): void => {
      listener()
    }
    ipcRenderer.on(INTERRUPT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(INTERRUPT_CHANNEL, handler)
  },

  onSnapshot(listener: SnapshotListener): () => void {
    const handler = (_event: IpcRendererEvent, snapshot: AppSnapshot): void => {
      listener(snapshot)
    }
    ipcRenderer.on(SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SNAPSHOT_CHANNEL, handler)
  },
}

contextBridge.exposeInMainWorld('magicMirror', bridge)
