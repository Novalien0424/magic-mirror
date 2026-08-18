import { createHash } from 'node:crypto'
import type { ConfigSlot, ConfigSlots } from './config-service'
import type {
  JobModelSnapshot,
  MirrorConfig,
  MirrorEvent,
  SessionModelSnapshot,
} from '../shared/types'

export type ModelSettingsRole =
  | 'realtimeDialogue'
  | 'inputTranscription'
  | 'memoryExtractor'

export const MODEL_SETTINGS_ROLES: readonly ModelSettingsRole[] = Object.freeze([
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
])

export type ActiveModelSettings = Readonly<{
  readonly slot: 'active'
  readonly configVersion: number
  readonly fingerprint: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
}>

export type DraftModelSettings = Readonly<{
  readonly slot: 'draft'
  readonly configVersion: number
  readonly fingerprint: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
}>

export type PreviousModelSettings = Readonly<{
  readonly slot: 'previous'
  readonly configVersion: number
  readonly fingerprint: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
}>

export interface ModelSettingsResolution {
  readonly active: ActiveModelSettings
  readonly draft: DraftModelSettings
  readonly previous: PreviousModelSettings
}

export type ModelSettingsErrorCode =
  | 'model_settings_invalid_config'
  | 'model_settings_invalid_role'
  | 'model_settings_snapshot_not_active'
  | 'model_settings_invalid_taken_at'

export class ModelSettingsError extends Error {
  readonly code: ModelSettingsErrorCode
  readonly slot: ConfigSlot | null
  readonly role: ModelSettingsRole | null

  constructor(
    code: ModelSettingsErrorCode,
    slot: ConfigSlot | null = null,
    role: ModelSettingsRole | null = null,
  ) {
    super('Model settings operation failed')
    this.name = 'ModelSettingsError'
    this.code = code
    this.slot = slot
    this.role = role
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface ModelSettingsSimulatorObservation {
  readonly session: Readonly<{
    readonly realtimeDialogue: string
    readonly inputTranscription: string
    readonly voice: string
  }>
  readonly job: Readonly<{ readonly memoryExtractor: string }>
}

export interface ModelSettingsSimulatorEvidence {
  readonly result: 'mock_passed' | 'failed'
  readonly source: 'simulator'
  readonly configVersion: number
  readonly fingerprint: string
  readonly roleCount: 3
  readonly reason: string
  readonly event: Readonly<Omit<MirrorEvent, 'time'>>
}

type ModelSettingsView =
  | ActiveModelSettings
  | DraftModelSettings
  | PreviousModelSettings

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidConfigVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function isConfigSlot(value: unknown): value is ConfigSlot {
  return value === 'active' || value === 'draft' || value === 'previous'
}

function invalidConfig(slot: ConfigSlot | null): ModelSettingsError {
  return new ModelSettingsError('model_settings_invalid_config', slot, null)
}

function invalidRole(slot: ConfigSlot, role: ModelSettingsRole): ModelSettingsError {
  return new ModelSettingsError('model_settings_invalid_role', slot, role)
}

function stableConfigValue(
  value: unknown,
  ancestors: Set<object> = new Set<object>(),
): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError()
    ancestors.add(value)
    try {
      return value.map((item) => stableConfigValue(item, ancestors))
    } finally {
      ancestors.delete(value)
    }
  }

  if (typeof value === 'object' && value !== null) {
    if (ancestors.has(value)) throw new TypeError()
    ancestors.add(value)
    try {
      const sorted: Record<string, unknown> = {}
      for (const key of Object.keys(value).sort()) {
        sorted[key] = stableConfigValue(
          (value as Record<string, unknown>)[key],
          ancestors,
        )
      }
      return sorted
    } finally {
      ancestors.delete(value)
    }
  }

  return value
}

function fingerprintConfig(config: MirrorConfig, slot: ConfigSlot): string {
  try {
    const serialized = JSON.stringify(stableConfigValue(config))
    if (serialized === undefined) throw new TypeError()
    return createHash('sha256').update(serialized, 'utf8').digest('hex')
  } catch {
    throw invalidConfig(slot)
  }
}

function hasExactModelRoles(aiModels: Record<string, unknown>): boolean {
  const keys = Object.keys(aiModels)
  return keys.length === MODEL_SETTINGS_ROLES.length
    && MODEL_SETTINGS_ROLES.every((role) => Object.prototype.hasOwnProperty.call(aiModels, role))
    && keys.every((key) => MODEL_SETTINGS_ROLES.some((role) => role === key))
}

function resolveSlot(slot: 'active', config: MirrorConfig): ActiveModelSettings
function resolveSlot(slot: 'draft', config: MirrorConfig): DraftModelSettings
function resolveSlot(slot: 'previous', config: MirrorConfig): PreviousModelSettings
function resolveSlot(slot: ConfigSlot, config: MirrorConfig): ModelSettingsView
function resolveSlot(slot: ConfigSlot, config: MirrorConfig): ModelSettingsView {
  try {
    if (!isRecord(config)) throw invalidConfig(slot)

    const configVersion = config.configVersion
    const voice = config.voice
    if (!isValidConfigVersion(configVersion) || !isNonEmptyString(voice)) {
      throw invalidConfig(slot)
    }

    const aiModels = config.aiModels
    if (!isRecord(aiModels) || !hasExactModelRoles(aiModels)) {
      throw invalidConfig(slot)
    }

    const modelIds = {} as Record<ModelSettingsRole, string>
    for (const role of MODEL_SETTINGS_ROLES) {
      const roleConfig = aiModels[role]
      if (!isRecord(roleConfig) || !isNonEmptyString(roleConfig.modelId)) {
        throw invalidRole(slot, role)
      }
      modelIds[role] = roleConfig.modelId
    }

    const fingerprint = fingerprintConfig(config as MirrorConfig, slot)
    return Object.freeze({
      slot,
      configVersion,
      fingerprint,
      realtimeDialogue: modelIds.realtimeDialogue,
      inputTranscription: modelIds.inputTranscription,
      memoryExtractor: modelIds.memoryExtractor,
      voice,
    }) as ModelSettingsView
  } catch (error) {
    if (error instanceof ModelSettingsError) throw error
    throw invalidConfig(slot)
  }
}

function readConfigSlot(slots: ConfigSlots, slot: ConfigSlot): MirrorConfig {
  try {
    return slots[slot]
  } catch {
    throw invalidConfig(slot)
  }
}

export function resolveModelSettings(slots: ConfigSlots): ModelSettingsResolution {
  if (!isRecord(slots)) throw invalidConfig(null)

  const active = resolveSlot('active', readConfigSlot(slots, 'active'))
  const draft = resolveSlot('draft', readConfigSlot(slots, 'draft'))
  const previous = resolveSlot('previous', readConfigSlot(slots, 'previous'))

  return Object.freeze({ active, draft, previous })
}

function assertActive(active: ActiveModelSettings): void {
  let slot: unknown
  try {
    slot = (active as unknown as { slot?: unknown }).slot
  } catch {
    slot = null
  }
  if (slot !== 'active') {
    throw new ModelSettingsError(
      'model_settings_snapshot_not_active',
      isConfigSlot(slot) ? slot : null,
      null,
    )
  }
}

function assertTakenAt(takenAt: string): void {
  if (!isNonEmptyString(takenAt)) {
    throw new ModelSettingsError('model_settings_invalid_taken_at', 'active', null)
  }
}

export function createSessionModelSnapshot(
  active: ActiveModelSettings,
  takenAt: string,
): Readonly<SessionModelSnapshot> {
  assertActive(active)
  assertTakenAt(takenAt)
  return Object.freeze({
    configVersion: active.configVersion,
    fingerprint: active.fingerprint,
    realtimeDialogue: active.realtimeDialogue,
    inputTranscription: active.inputTranscription,
    voice: active.voice,
    takenAt,
  })
}

export function createJobModelSnapshot(
  active: ActiveModelSettings,
  takenAt: string,
): Readonly<JobModelSnapshot> {
  assertActive(active)
  assertTakenAt(takenAt)
  return Object.freeze({
    configVersion: active.configVersion,
    fingerprint: active.fingerprint,
    memoryExtractor: active.memoryExtractor,
    takenAt,
  })
}

function findSimulatorMismatch(
  active: ActiveModelSettings,
  session: Readonly<SessionModelSnapshot>,
  job: Readonly<JobModelSnapshot>,
  observed: ModelSettingsSimulatorObservation,
): string | null {
  try {
    const checks: readonly (readonly [string, boolean])[] = [
      [
        'realtimeDialogue',
        observed.session.realtimeDialogue === session.realtimeDialogue
          && session.realtimeDialogue === active.realtimeDialogue,
      ],
      [
        'inputTranscription',
        observed.session.inputTranscription === session.inputTranscription
          && session.inputTranscription === active.inputTranscription,
      ],
      [
        'memoryExtractor',
        observed.job.memoryExtractor === job.memoryExtractor
          && job.memoryExtractor === active.memoryExtractor,
      ],
      [
        'voice',
        observed.session.voice === session.voice && session.voice === active.voice,
      ],
      [
        'session_config_version',
        session.configVersion === active.configVersion,
      ],
      [
        'session_fingerprint',
        session.fingerprint === active.fingerprint,
      ],
      [
        'job_config_version',
        job.configVersion === active.configVersion,
      ],
      [
        'job_fingerprint',
        job.fingerprint === active.fingerprint,
      ],
    ]

    for (const [role, matches] of checks) {
      if (!matches) return role
    }
    return null
  } catch {
    return 'realtimeDialogue'
  }
}

export function buildModelSettingsSimulatorEvidence(
  active: ActiveModelSettings,
  session: Readonly<SessionModelSnapshot>,
  job: Readonly<JobModelSnapshot>,
  observed: ModelSettingsSimulatorObservation,
): ModelSettingsSimulatorEvidence {
  const mismatchRole = findSimulatorMismatch(active, session, job, observed)
  const result: 'mock_passed' | 'failed' = mismatchRole === null ? 'mock_passed' : 'failed'
  const reason = mismatchRole === null
    ? 'operation=simulate;result=mock_passed;role_count=3;config_version='
      + String(active.configVersion)
      + ';session_config_version='
      + String(session.configVersion)
      + ';job_config_version='
      + String(job.configVersion)
      + ';cause=all_configured_ids_observed'
    : 'operation=simulate;result=failed;role_count=3;config_version='
      + String(active.configVersion)
      + ';session_config_version='
      + String(session.configVersion)
      + ';job_config_version='
      + String(job.configVersion)
      + ';cause=capture_mismatch;role='
      + mismatchRole

  const event: Omit<MirrorEvent, 'time'> = {
    module: 'openai',
    event: 'model_settings_simulated',
    status: mismatchRole === null ? 'success' : 'failed',
    source: 'simulator',
    reason,
  }
  if (mismatchRole !== null) event.error_code = 'model_settings_simulator_mismatch'

  return Object.freeze({
    result,
    source: 'simulator',
    configVersion: active.configVersion,
    fingerprint: active.fingerprint,
    roleCount: 3 as const,
    reason,
    event: Object.freeze(event),
  })
}
