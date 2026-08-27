import { mkdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { ConfigDiff, FieldError, MirrorConfig, MirrorEvent } from '../shared/types'

type WriteFileAtomic = (
  fileName: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding },
) => Promise<void>
const writeFileAtomic = require('write-file-atomic') as WriteFileAtomic

export type ConfigSlot = 'active' | 'draft' | 'previous'

export interface ConfigSlots {
  active: MirrorConfig
  draft: MirrorConfig
  previous: MirrorConfig
}

export interface ConfigFileOperations {
  ensureDirectory(directoryPath: string): Promise<void>
  readText(filePath: string): Promise<string | null>
  remove(filePath: string): Promise<void>
}

export interface ConfigAtomicWriter {
  write(filePath: string, contents: string): Promise<void>
}

export interface ConfigEventSink {
  emit(event: Omit<MirrorEvent, 'time'>): void
}

export interface ConfigServiceOptions {
  configDir: string
  defaultConfigPath: string
  files?: ConfigFileOperations
  atomicWriter?: ConfigAtomicWriter
  events: ConfigEventSink
}

export interface ConfigService {
  initialize(): Promise<ConfigSlots>
  read(): Promise<ConfigSlots>
  saveDraft(candidate: unknown): Promise<MirrorConfig>
  publish(): Promise<MirrorConfig>
  rollback(): Promise<MirrorConfig>
  diff(from: ConfigSlot, to: ConfigSlot): Promise<ConfigDiff>
}

export type ConfigErrorCode =
  | 'config_schema_invalid'
  | 'config_schema_unsupported'
  | 'config_schema_migration_failed'
  | 'config_read_failed'
  | 'config_write_failed'
  | 'config_default_invalid'
  | 'config_previous_unavailable'
  | 'config_revision_exhausted'
  | 'config_compensation_failed'

export type ConfigRecoveryTelemetryCode =
  | 'config_slot_missing'
  | 'config_slot_invalid'
  | 'config_slot_unreadable'

export type ConfigAuxiliaryTelemetryCode =
  | 'config_spell_container_invalid'
  | 'config_scene_container_invalid'
  | 'config_spell_entry_invalid'
  | 'config_scene_entry_invalid'

export type ConfigTelemetryErrorCode =
  | ConfigErrorCode
  | ConfigRecoveryTelemetryCode
  | ConfigAuxiliaryTelemetryCode

export class ConfigServiceError extends Error {
  readonly code: ConfigErrorCode
  readonly fields: readonly FieldError[]

  constructor(code: ConfigErrorCode, fields: readonly FieldError[] = []) {
    super('Config operation failed')
    this.name = 'ConfigServiceError'
    this.code = code
    this.fields = [...fields]
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const CURRENT_CONFIG_SCHEMA_VERSION = 2

const V2_BASELINE = {
  reasoningEffort: 'low',
  turnDetectionProfile: 'semantic-vad-interruptible',
} as const

const reasoningEffortSchema = z.enum(['none', 'minimal', 'low', 'medium', 'high'])
const turnDetectionProfileSchema = z.enum([
  'semantic-vad-interruptible',
  'semantic-vad-strict',
  'server-vad-noisy',
])

const aiModelRoleSchema = z.object({
  modelId: z.string().trim().min(1),
  note: z.string().optional(),
}).strict()

const mirrorConfigBaseEnvelope = z.object({
  configVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  persona: z.object({
    name: z.string().trim().min(1),
    instructions: z.string().min(1),
  }).strict(),
  voice: z.string().trim().min(1),
  idleSeconds: z.number().int().min(1).max(86_400),
  aiModels: z.object({
    realtimeDialogue: aiModelRoleSchema,
    inputTranscription: aiModelRoleSchema,
    memoryExtractor: aiModelRoleSchema,
  }).strict(),
  wake: z.object({
    phrase: z.string().trim().min(1),
    modelVersion: z.string().trim().min(1),
  }).strict(),
  faceModel: z.object({
    detectorId: z.string().trim().min(1),
    recognizerId: z.string().trim().min(1),
  }).strict(),
  assets: z.object({
    offlineLoopVideo: z.string().trim().min(1),
    avatarDir: z.string().trim().min(1),
    musicDir: z.string().trim().min(1),
  }).strict(),
  spells: z.unknown(),
  scenes: z.unknown(),
  adapters: z.object({
    lighting: z.enum(['mock', 'physical']),
    fog: z.enum(['mock', 'physical']),
    music: z.enum(['mock', 'physical']),
  }).strict(),
}).strict()

const mirrorConfigCoreEnvelope = mirrorConfigBaseEnvelope.extend({
  reasoningEffort: reasoningEffortSchema,
  turnDetectionProfile: turnDetectionProfileSchema,
}).strict()

const mirrorConfigLegacyEnvelope = mirrorConfigBaseEnvelope.extend({
  reasoningEffort: reasoningEffortSchema.default(V2_BASELINE.reasoningEffort),
  turnDetectionProfile: turnDetectionProfileSchema.default(V2_BASELINE.turnDetectionProfile),
}).strict()

export const mirrorConfigSchema: z.ZodType<unknown> = mirrorConfigCoreEnvelope

type SlotInspection =
  | { status: 'missing'; raw: null }
  | { status: 'valid'; raw: string; value: MirrorConfig; schemaVersion: 0 | 1 | 2 }
  | { status: 'invalid'; raw: string; fields: readonly FieldError[] }
  | { status: 'unsupported'; raw: string; schemaVersion: number }
  | { status: 'unreadable'; raw: null }

type RawSlots = Record<ConfigSlot, string | null>

type AuxiliarySlot = 'spells' | 'scenes'

interface AuxiliaryEnvelope {
  id: string
  enabled: boolean
}

const SLOT_ORDER: readonly ConfigSlot[] = ['previous', 'active', 'draft']
const MODEL_PATHS: ReadonlySet<string> = new Set([
  'aiModels.realtimeDialogue.modelId',
  'aiModels.inputTranscription.modelId',
  'aiModels.memoryExtractor.modelId',
])

const SLOT_FILE_NAMES: Record<ConfigSlot, string> = {
  active: 'active.json',
  draft: 'draft.json',
  previous: 'previous.json',
}

interface ResolvedConfigServiceOptions {
  configDir: string
  defaultConfigPath: string
  files: ConfigFileOperations
  atomicWriter: ConfigAtomicWriter
  events: ConfigEventSink
}

interface SafeIssue {
  code?: unknown
  path?: readonly (string | number)[]
}

class SchemaFailure extends Error {
  readonly fields: readonly FieldError[]

  constructor(fields: readonly FieldError[]) {
    super('Config schema invalid')
    this.fields = [...fields]
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

class UnsupportedSchemaFailure extends Error {
  readonly schemaVersion: number

  constructor(schemaVersion: number) {
    super('Config schema unsupported')
    this.schemaVersion = schemaVersion
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

class AdapterReadFailure extends Error {
  constructor() {
    super('Config read failed')
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

class DefaultInvalidFailure extends Error {
  readonly fields: readonly FieldError[]

  constructor(fields: readonly FieldError[]) {
    super('Config default invalid')
    this.fields = [...fields]
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

class CompensationFailure extends Error {
  constructor() {
    super('Config compensation failed')
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const diskConfigFiles: ConfigFileOperations = {
  async ensureDirectory(directoryPath) {
    await mkdir(directoryPath, { recursive: true })
  },
  async readText(filePath) {
    try {
      return await readFile(filePath, 'utf8')
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  },
  async remove(filePath) {
    try {
      await unlink(filePath)
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
  },
}

const diskConfigAtomicWriter: ConfigAtomicWriter = {
  async write(filePath, contents) {
    await writeFileAtomic(filePath, contents, { encoding: 'utf8' })
  },
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function slotPath(configDir: string, slot: ConfigSlot): string {
  return join(configDir, SLOT_FILE_NAMES[slot])
}

function serializeConfig(config: MirrorConfig): string {
  const persisted = { ...config } as Record<string, unknown>
  delete persisted.schemaVersion
  return JSON.stringify({ schemaVersion: CURRENT_CONFIG_SCHEMA_VERSION, ...persisted }, null, 2) + '\n'
}

function emitConfigEvent(
  events: ConfigEventSink,
  event: string,
  status: 'success' | 'degraded' | 'failed' | 'info',
  reason: string,
  errorCode?: ConfigTelemetryErrorCode,
): void {
  const payload: Omit<MirrorEvent, 'time'> = {
    module: 'config',
    event,
    status,
    source: 'runtime',
    reason,
  }
  if (errorCode !== undefined) payload.error_code = errorCode
  events.emit(payload)
}

const safeIssueMessages: Record<string, string> = {
  invalid_type: 'invalid_type',
  too_small: 'too_small',
  too_big: 'too_big',
  invalid_value: 'invalid_value',
  unrecognized_keys: 'unrecognized_keys',
  invalid_format: 'invalid_format',
  invalid_union: 'invalid_union',
  invalid_key: 'invalid_key',
  invalid_element: 'invalid_element',
}

const allowedCorePaths = new Set([
  'configVersion',
  'persona',
  'persona.name',
  'persona.instructions',
  'voice',
  'reasoningEffort',
  'turnDetectionProfile',
  'idleSeconds',
  'aiModels',
  'aiModels.realtimeDialogue',
  'aiModels.realtimeDialogue.modelId',
  'aiModels.realtimeDialogue.note',
  'aiModels.inputTranscription',
  'aiModels.inputTranscription.modelId',
  'aiModels.inputTranscription.note',
  'aiModels.memoryExtractor',
  'aiModels.memoryExtractor.modelId',
  'aiModels.memoryExtractor.note',
  'wake',
  'wake.phrase',
  'wake.modelVersion',
  'faceModel',
  'faceModel.detectorId',
  'faceModel.recognizerId',
  'assets',
  'assets.offlineLoopVideo',
  'assets.avatarDir',
  'assets.musicDir',
  'spells',
  'scenes',
  'adapters',
  'adapters.lighting',
  'adapters.fog',
  'adapters.music',
])

function safePath(path: readonly (string | number)[] | undefined): string {
  if (path === undefined || path.length === 0) return '$'
  let result = ''
  for (const segment of path) {
    if (typeof segment === 'number') {
      result += '[' + String(segment) + ']'
    } else {
      result += result.length === 0 ? segment : '.' + segment
    }
  }
  return allowedCorePaths.has(result) ? result : '$'
}

function safeFields(issues: readonly SafeIssue[]): readonly FieldError[] {
  return issues.map((issue) => ({
    path: safePath(issue.path),
    message: safeIssueMessages[String(issue.code)] ?? 'schema_invalid',
  }))
}

const spellEnvelopeSchema = z.object({
  id: z.string().trim().min(1),
  phrase: z.string().trim().min(1),
  sceneId: z.string().trim().min(1),
  enabled: z.boolean(),
}).passthrough()

const sceneEnvelopeSchema = z.object({
  id: z.string().trim().min(1),
  enabled: z.boolean(),
  cues: z.array(z.unknown()),
}).passthrough()

function disabledSpell(index: number): AuxiliaryEnvelope & {
  phrase: string
  sceneId: string
} {
  return {
    id: 'disabled-spell-' + String(index),
    phrase: '',
    sceneId: '',
    enabled: false,
  }
}

function disabledScene(index: number): AuxiliaryEnvelope & {
  cues: unknown[]
} {
  return {
    id: 'disabled-scene-' + String(index),
    enabled: false,
    cues: [],
  }
}

function normalizeEntries(
  value: unknown,
  schema: z.ZodType<unknown>,
  disabled: (index: number) => unknown,
  field: AuxiliarySlot,
  slot: ConfigSlot,
  events: ConfigEventSink,
): unknown[] {
  if (!Array.isArray(value)) {
    const errorCode: ConfigAuxiliaryTelemetryCode = field === 'spells'
      ? 'config_spell_container_invalid'
      : 'config_scene_container_invalid'
    emitConfigEvent(
      events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=' + slot + ';field=' + field + ';index=container;action=empty;cause=not_array',
      errorCode,
    )
    return []
  }

  return value.map((entry, index) => {
    const parsed = schema.safeParse(entry)
    if (parsed.success) return parsed.data

    const errorCode: ConfigAuxiliaryTelemetryCode = field === 'spells'
      ? 'config_spell_entry_invalid'
      : 'config_scene_entry_invalid'
    emitConfigEvent(
      events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=' + slot + ';field=' + field + ';index=' + String(index) + ';action=disabled;cause=schema_invalid',
      errorCode,
    )
    return disabled(index)
  })
}

function normalizeAuxiliary(
  config: MirrorConfig,
  slot: ConfigSlot,
  events: ConfigEventSink,
): MirrorConfig {
  const spells = normalizeEntries(
    config.spells,
    spellEnvelopeSchema,
    disabledSpell,
    'spells',
    slot,
    events,
  )
  const scenes = normalizeEntries(
    config.scenes,
    sceneEnvelopeSchema,
    disabledScene,
    'scenes',
    slot,
    events,
  )
  return { ...config, spells, scenes }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseConfigEnvelope(decoded: unknown): {
  schemaVersion: 0 | 1 | 2
  config: unknown
} {
  if (!isRecord(decoded)) return { schemaVersion: 0, config: decoded }

  const hasSchemaVersion = Object.prototype.hasOwnProperty.call(decoded, 'schemaVersion')
  if (!hasSchemaVersion) return { schemaVersion: 0, config: decoded }

  const schemaVersion = decoded.schemaVersion
  if (typeof schemaVersion === 'number' && Number.isSafeInteger(schemaVersion)) {
    if (schemaVersion > CURRENT_CONFIG_SCHEMA_VERSION) {
      throw new UnsupportedSchemaFailure(schemaVersion)
    }
    if (schemaVersion >= 0 && schemaVersion <= CURRENT_CONFIG_SCHEMA_VERSION) {
      const config = { ...decoded }
      delete config.schemaVersion
      return { schemaVersion: schemaVersion as 0 | 1 | 2, config }
    }
  }

  throw new SchemaFailure([{ path: '$', message: 'schema_invalid' }])
}

function parseConfigText(
  contents: string,
  slot: ConfigSlot,
  events: ConfigEventSink,
): { value: MirrorConfig; schemaVersion: 0 | 1 | 2 } {
  let decoded: unknown
  try {
    decoded = JSON.parse(contents) as unknown
  } catch {
    throw new SchemaFailure([{ path: '$', message: 'invalid_json' }])
  }

  const envelope = parseConfigEnvelope(decoded)
  const schema = envelope.schemaVersion === CURRENT_CONFIG_SCHEMA_VERSION
    ? mirrorConfigSchema
    : mirrorConfigLegacyEnvelope
  const parsed = schema.safeParse(envelope.config)
  if (!parsed.success) {
    throw new SchemaFailure(safeFields(parsed.error.issues as readonly SafeIssue[]))
  }
  return {
    value: normalizeAuxiliary(parsed.data as MirrorConfig, slot, events),
    schemaVersion: envelope.schemaVersion,
  }
}

async function inspectSlot(
  options: ResolvedConfigServiceOptions,
  slot: ConfigSlot,
): Promise<SlotInspection> {
  let raw: string | null
  try {
    raw = await options.files.readText(slotPath(options.configDir, slot))
  } catch {
    return { status: 'unreadable', raw: null }
  }
  if (raw === null) return { status: 'missing', raw: null }

  try {
    const parsed = parseConfigText(raw, slot, options.events)
    return {
      status: 'valid',
      raw,
      value: parsed.value,
      schemaVersion: parsed.schemaVersion,
    }
  } catch (error) {
    if (error instanceof UnsupportedSchemaFailure) {
      return { status: 'unsupported', raw, schemaVersion: error.schemaVersion }
    }
    const fields = error instanceof SchemaFailure
      ? error.fields
      : [{ path: '$', message: 'schema_invalid' }]
    return { status: 'invalid', raw, fields }
  }
}

async function inspectAll(
  options: ResolvedConfigServiceOptions,
): Promise<Record<ConfigSlot, SlotInspection>> {
  const inspected = {} as Record<ConfigSlot, SlotInspection>
  for (const slot of ['active', 'previous', 'draft'] as const) {
    inspected[slot] = await inspectSlot(options, slot)
  }
  return inspected
}

function schemaReason(
  slot: string,
  from: number,
  to: number,
  action: string,
  cause: string,
): string {
  return 'slot=' + slot
    + ';from=' + String(from)
    + ';to=' + String(to)
    + ';action=' + action
    + ';cause=' + cause
}

function emitSchemaEvent(
  options: ResolvedConfigServiceOptions,
  event: 'config_schema_migrated' | 'config_schema_migration_failed' | 'config_schema_unsupported',
  status: 'success' | 'failed',
  slot: string,
  from: number,
  action: string,
  cause: string,
): void {
  const reason = schemaReason(slot, from, CURRENT_CONFIG_SCHEMA_VERSION, action, cause)
  if (event === 'config_schema_migrated') {
    emitConfigEvent(options.events, event, status, reason)
    return
  }
  emitConfigEvent(options.events, event, status, reason, event)
}

function rejectUnsupportedPhysical(
  options: ResolvedConfigServiceOptions,
  physical: Record<ConfigSlot, SlotInspection>,
): void {
  let found = false
  for (const slot of ['active', 'previous', 'draft'] as const) {
    const inspection = physical[slot]
    if (inspection.status !== 'unsupported') continue
    found = true
    emitSchemaEvent(
      options,
      'config_schema_unsupported',
      'failed',
      slot,
      inspection.schemaVersion,
      'reject',
      'unsupported',
    )
  }
  if (found) throw new ConfigServiceError('config_schema_unsupported')
}

type RawSlotSnapshot = Partial<Record<ConfigSlot, string | null>>

async function restoreMigratedSlots(
  options: ResolvedConfigServiceOptions,
  originals: RawSlotSnapshot,
  touched: readonly ConfigSlot[],
): Promise<void> {
  let failed = false
  for (const slot of SLOT_ORDER) {
    if (!touched.includes(slot)) continue
    try {
      const filePath = slotPath(options.configDir, slot)
      const contents = originals[slot]
      if (contents === null || contents === undefined) await options.files.remove(filePath)
      else await options.atomicWriter.write(filePath, contents)
    } catch {
      failed = true
    }
  }
  if (failed) throw new CompensationFailure()
}

async function migrateLegacySlots(
  options: ResolvedConfigServiceOptions,
  physical: Record<ConfigSlot, SlotInspection>,
): Promise<void> {
  const legacySlots = SLOT_ORDER.filter((slot) => {
    const inspection = physical[slot]
    return inspection.status === 'valid' && inspection.schemaVersion < CURRENT_CONFIG_SCHEMA_VERSION
  })
  if (legacySlots.length === 0) return

  const migrationFrom = Math.min(...legacySlots.map((slot) => {
    const inspection = physical[slot]
    return inspection.status === 'valid' ? inspection.schemaVersion : CURRENT_CONFIG_SCHEMA_VERSION
  }))

  const originals: RawSlotSnapshot = {}
  const touched: ConfigSlot[] = []
  try {
    await options.files.ensureDirectory(options.configDir)
    for (const slot of legacySlots) {
      const inspection = physical[slot]
      if (inspection.status !== 'valid') continue
      originals[slot] = inspection.raw
      touched.push(slot)
      await options.atomicWriter.write(
        slotPath(options.configDir, slot),
        serializeConfig(inspection.value),
      )
    }
  } catch {
    emitSchemaEvent(
      options,
      'config_schema_migration_failed',
      'failed',
      'all',
      migrationFrom,
      'materialize',
      'io_failure',
    )
    try {
      await restoreMigratedSlots(options, originals, touched)
    } catch {
      emitConfigEvent(
        options.events,
        'config_operation_failed',
        'failed',
        'operation=migrate;slot=all;action=restore;cause=compensation_failure',
        'config_compensation_failed',
      )
      throw new ConfigServiceError('config_compensation_failed')
    }
    emitConfigEvent(
      options.events,
      'config_transaction_compensated',
      'info',
      'operation=migrate;action=restore;cause=io_failure',
    )
    throw new ConfigServiceError('config_schema_migration_failed')
  }

  for (const slot of legacySlots) {
    emitSchemaEvent(
      options,
      'config_schema_migrated',
      'success',
      slot,
      (physical[slot] as Extract<SlotInspection, { status: 'valid' }>).schemaVersion,
      'materialize',
      'legacy',
    )
  }
}

async function readRawSlots(options: ResolvedConfigServiceOptions): Promise<RawSlots> {
  const raw = {} as RawSlots
  for (const slot of SLOT_ORDER) {
    try {
      raw[slot] = await options.files.readText(slotPath(options.configDir, slot))
    } catch {
      throw new AdapterReadFailure()
    }
  }
  return raw
}

async function restoreRawSlots(
  options: ResolvedConfigServiceOptions,
  raw: RawSlots,
): Promise<void> {
  let failed = false
  for (const slot of SLOT_ORDER) {
    try {
      const filePath = slotPath(options.configDir, slot)
      const contents = raw[slot]
      if (contents === null) await options.files.remove(filePath)
      else await options.atomicWriter.write(filePath, contents)
    } catch {
      failed = true
    }
  }
  if (failed) throw new CompensationFailure()
}

async function writeSlotTransaction(
  options: ResolvedConfigServiceOptions,
  next: RawSlots,
  before: RawSlots,
  operation: 'seed' | 'publish' | 'rollback',
): Promise<void> {
  try {
    await options.files.ensureDirectory(options.configDir)
    for (const slot of SLOT_ORDER) {
      const filePath = slotPath(options.configDir, slot)
      const contents = next[slot]
      if (contents === null) await options.files.remove(filePath)
      else await options.atomicWriter.write(filePath, contents)
    }
  } catch {
    emitConfigEvent(
      options.events,
      'config_operation_failed',
      'failed',
      'operation=' + operation + ';slot=all;action=failed;cause=io_failure',
      'config_write_failed',
    )
    try {
      await restoreRawSlots(options, before)
    } catch {
      emitConfigEvent(
        options.events,
        'config_operation_failed',
        'failed',
        'operation=' + operation + ';slot=all;action=restore;cause=compensation_failure',
        'config_compensation_failed',
      )
      throw new ConfigServiceError('config_compensation_failed')
    }
    emitConfigEvent(
      options.events,
      'config_transaction_compensated',
      'info',
      'operation=' + operation + ';action=restore;cause=io_failure',
    )
    throw new ConfigServiceError('config_write_failed')
  }
}

function resolveConfigOptions(options: ConfigServiceOptions): ResolvedConfigServiceOptions {
  return {
    configDir: options.configDir,
    defaultConfigPath: options.defaultConfigPath,
    files: options.files ?? diskConfigFiles,
    atomicWriter: options.atomicWriter ?? diskConfigAtomicWriter,
    events: options.events,
  }
}

function inspectionCause(inspection: SlotInspection): 'missing' | 'invalid' | 'unreadable' {
  if (inspection.status === 'missing') return 'missing'
  if (inspection.status === 'invalid') return 'invalid'
  return 'unreadable'
}

function inspectionErrorCode(inspection: SlotInspection): ConfigRecoveryTelemetryCode {
  if (inspection.status === 'missing') return 'config_slot_missing'
  if (inspection.status === 'invalid') return 'config_slot_invalid'
  return 'config_slot_unreadable'
}

function emitRecovery(
  options: ResolvedConfigServiceOptions,
  slot: ConfigSlot,
  inspection: SlotInspection,
  source: 'active' | 'previous' | 'default',
): void {
  const action = source === 'previous' ? 'use_previous' : source === 'default' ? 'use_default' : 'use_active'
  emitConfigEvent(
    options.events,
    'config_recovered',
    'degraded',
    'slot=' + slot + ';source=' + source + ';action=' + action + ';cause=' + inspectionCause(inspection),
    inspectionErrorCode(inspection),
  )
}

async function readDefaultConfig(
  options: ResolvedConfigServiceOptions,
  slot: ConfigSlot,
): Promise<MirrorConfig> {
  let raw: string | null
  try {
    raw = await options.files.readText(options.defaultConfigPath)
  } catch {
    throw new AdapterReadFailure()
  }
  if (raw === null) {
    throw new DefaultInvalidFailure([{ path: '$', message: 'missing' }])
  }
  try {
    return (parseConfigText(raw, slot, options.events)).value
  } catch (error) {
    if (error instanceof UnsupportedSchemaFailure) throw error
    if (error instanceof SchemaFailure) throw new DefaultInvalidFailure(error.fields)
    throw new DefaultInvalidFailure([{ path: '$', message: 'schema_invalid' }])
  }
}

function emitDefaultFailure(
  options: ResolvedConfigServiceOptions,
  operation: 'initialize' | 'read',
  failure: unknown,
): never {
  if (failure instanceof UnsupportedSchemaFailure) {
    emitSchemaEvent(
      options,
      'config_schema_unsupported',
      'failed',
      'default',
      failure.schemaVersion,
      'reject',
      'unsupported',
    )
    throw new ConfigServiceError('config_schema_unsupported')
  }
  if (failure instanceof DefaultInvalidFailure) {
    const issueCount = failure.fields.length
    emitConfigEvent(
      options.events,
      'config_operation_failed',
      'failed',
      'operation=' + operation + ';slot=active;action=' + (operation === 'initialize' ? 'seed' : 'read') + ';cause=schema_invalid;issue_count=' + String(issueCount),
      'config_default_invalid',
    )
    throw new ConfigServiceError('config_default_invalid', failure.fields)
  }
  emitConfigEvent(
    options.events,
    'config_operation_failed',
    'failed',
    'operation=' + operation + ';slot=active;action=' + (operation === 'initialize' ? 'seed' : 'read') + ';cause=io_failure',
    'config_read_failed',
  )
  throw new ConfigServiceError('config_read_failed')
}

async function resolveSlots(
  options: ResolvedConfigServiceOptions,
  inspected?: Record<ConfigSlot, SlotInspection>,
): Promise<ConfigSlots> {
  const physical = inspected ?? await inspectAll(options)
  rejectUnsupportedPhysical(options, physical)
  await migrateLegacySlots(options, physical)
  let active: MirrorConfig
  if (physical.active.status === 'valid') {
    active = physical.active.value
  } else if (physical.previous.status === 'valid') {
    active = physical.previous.value
    emitRecovery(options, 'active', physical.active, 'previous')
  } else {
    try {
      active = await readDefaultConfig(options, 'active')
    } catch (error) {
      return emitDefaultFailure(options, 'read', error)
    }
    emitRecovery(options, 'active', physical.active, 'default')
  }

  let previous: MirrorConfig
  if (physical.previous.status === 'valid') {
    previous = physical.previous.value
  } else {
    previous = active
    emitRecovery(options, 'previous', physical.previous, 'active')
  }

  let draft: MirrorConfig
  if (physical.draft.status === 'valid') {
    draft = physical.draft.value
  } else {
    draft = active
    emitRecovery(options, 'draft', physical.draft, 'active')
  }

  emitConfigEvent(
    options.events,
    'config_loaded',
    'success',
    'operation=read;active_version=' + String(active.configVersion) + ';draft_version=' + String(draft.configVersion) + ';previous_version=' + String(previous.configVersion),
  )
  return { active, draft, previous }
}

function nextRevision(
  options: ResolvedConfigServiceOptions,
  operation: 'publish' | 'rollback',
  version: number,
): number {
  if (version === Number.MAX_SAFE_INTEGER) {
    emitConfigEvent(
      options.events,
      'config_operation_failed',
      'failed',
      'operation=' + operation + ';slot=all;action=reject;cause=revision_exhausted',
      'config_revision_exhausted',
    )
    throw new ConfigServiceError('config_revision_exhausted')
  }
  return version + 1
}

function emitReadCaptureFailure(
  options: ResolvedConfigServiceOptions,
  operation: 'publish' | 'rollback',
): never {
  emitConfigEvent(
    options.events,
    'config_operation_failed',
    'failed',
    'operation=' + operation + ';slot=all;action=read;cause=io_failure',
    'config_read_failed',
  )
  throw new ConfigServiceError('config_read_failed')
}

function flattenJson(value: unknown, path: string, output: Map<string, unknown>): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      output.set(path, value)
      return
    }
    value.forEach((item, index) => {
      flattenJson(item, path + '[' + String(index) + ']', output)
    })
    return
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      output.set(path, value)
      return
    }
    entries.sort(([left], [right]) => compareLexicographically(left, right))
    for (const [key, item] of entries) {
      flattenJson(item, path.length === 0 ? key : path + '.' + key, output)
    }
    return
  }

  output.set(path, value)
}

function compareLexicographically(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function makeConfigDiff(from: MirrorConfig, to: MirrorConfig): ConfigDiff {
  const fromLeaves = new Map<string, unknown>()
  const toLeaves = new Map<string, unknown>()
  flattenJson(from, '', fromLeaves)
  flattenJson(to, '', toLeaves)

  const paths = new Set<string>([...fromLeaves.keys(), ...toLeaves.keys()])
  const changed = [...paths]
    .sort(compareLexicographically)
    .filter((path) => {
      const left = fromLeaves.get(path)
      const right = toLeaves.get(path)
      return !fromLeaves.has(path) || !toLeaves.has(path) || !jsonEqual(left, right)
    })
    .map((path) => ({
      path,
      from: fromLeaves.get(path),
      to: toLeaves.get(path),
    }))

  return {
    changed,
    nonModelChanges: changed.some((change) => !MODEL_PATHS.has(change.path)),
  }
}

export function createConfigService(options: ConfigServiceOptions): ConfigService {
  const resolved = resolveConfigOptions(options)

  return {
    async initialize(): Promise<ConfigSlots> {
      const inspected = await inspectAll(resolved)
      const allMissing = (['active', 'draft', 'previous'] as const)
        .every((slot) => inspected[slot].status === 'missing')

      if (!allMissing) return resolveSlots(resolved, inspected)

      let config: MirrorConfig
      try {
        config = await readDefaultConfig(resolved, 'active')
      } catch (error) {
        return emitDefaultFailure(resolved, 'initialize', error)
      }
      const serialized = serializeConfig(config)
      const empty: RawSlots = { active: null, draft: null, previous: null }
      const seeded: RawSlots = {
        active: serialized,
        draft: serialized,
        previous: serialized,
      }
      await writeSlotTransaction(resolved, seeded, empty, 'seed')
      emitConfigEvent(
        resolved.events,
        'config_seeded',
        'success',
        'operation=initialize;action=seed;config_version=' + String(config.configVersion),
      )
      return { active: config, draft: config, previous: config }
    },

    async read(): Promise<ConfigSlots> {
      return resolveSlots(resolved)
    },

    async saveDraft(candidate: unknown): Promise<MirrorConfig> {
      const slots = await resolveSlots(resolved)
      const parsed = mirrorConfigSchema.safeParse(candidate)
      if (!parsed.success) {
        const fields = safeFields(parsed.error.issues as readonly SafeIssue[])
        emitConfigEvent(
          resolved.events,
          'config_operation_failed',
          'failed',
          'operation=save_draft;slot=draft;action=reject;cause=schema_invalid;issue_count=' + String(fields.length),
          'config_schema_invalid',
        )
        throw new ConfigServiceError('config_schema_invalid', fields)
      }

      const normalized = normalizeAuxiliary(parsed.data as MirrorConfig, 'draft', resolved.events)
      const saved = { ...normalized, configVersion: slots.active.configVersion }
      try {
        await resolved.files.ensureDirectory(resolved.configDir)
        await resolved.atomicWriter.write(slotPath(resolved.configDir, 'draft'), serializeConfig(saved))
      } catch {
        emitConfigEvent(
          resolved.events,
          'config_operation_failed',
          'failed',
          'operation=save_draft;slot=draft;action=reject;cause=io_failure',
          'config_write_failed',
        )
        throw new ConfigServiceError('config_write_failed')
      }
      emitConfigEvent(
        resolved.events,
        'config_draft_saved',
        'success',
        'operation=save_draft;slot=draft;config_version=' + String(saved.configVersion),
      )
      return saved
    },

    async publish(): Promise<MirrorConfig> {
      const slots = await resolveSlots(resolved)
      let before: RawSlots
      try {
        before = await readRawSlots(resolved)
      } catch {
        return emitReadCaptureFailure(resolved, 'publish')
      }
      const revision = nextRevision(resolved, 'publish', slots.active.configVersion)
      const active = { ...slots.draft, configVersion: revision }
      const next: RawSlots = {
        previous: serializeConfig(slots.active),
        active: serializeConfig(active),
        draft: serializeConfig(active),
      }
      await writeSlotTransaction(resolved, next, before, 'publish')
      emitConfigEvent(
        resolved.events,
        'config_published',
        'success',
        'operation=publish;active_version=' + String(revision) + ';previous_version=' + String(slots.active.configVersion),
      )
      return active
    },

    async rollback(): Promise<MirrorConfig> {
      const physical = await inspectAll(resolved)
      rejectUnsupportedPhysical(resolved, physical)

      const physicalPrevious = physical.previous
      if (physicalPrevious.status !== 'valid') {
        emitConfigEvent(
          resolved.events,
          'config_operation_failed',
          'failed',
          'operation=rollback;slot=previous;action=reject;cause=' + inspectionCause(physicalPrevious),
          'config_previous_unavailable',
        )
        throw new ConfigServiceError('config_previous_unavailable')
      }

      const physicalActive = physical.active
      if (physicalActive.status !== 'valid') return emitReadCaptureFailure(resolved, 'rollback')

      await migrateLegacySlots(resolved, physical)

      let before: RawSlots
      try {
        before = await readRawSlots(resolved)
      } catch {
        return emitReadCaptureFailure(resolved, 'rollback')
      }
      if (before.previous === null || before.active === null) {
        return emitReadCaptureFailure(resolved, 'rollback')
      }

      const revision = nextRevision(resolved, 'rollback', physicalActive.value.configVersion)
      const active = { ...physicalPrevious.value, configVersion: revision }
      const next: RawSlots = {
        previous: serializeConfig(physicalActive.value),
        active: serializeConfig(active),
        draft: serializeConfig(active),
      }
      await writeSlotTransaction(resolved, next, before, 'rollback')
      emitConfigEvent(
        resolved.events,
        'config_rolled_back',
        'success',
        'operation=rollback;active_version=' + String(revision) + ';previous_version=' + String(physicalActive.value.configVersion),
      )
      return active
    },

    async diff(from: ConfigSlot, to: ConfigSlot): Promise<ConfigDiff> {
      const slots = await resolveSlots(resolved)
      const result = makeConfigDiff(slots[from], slots[to])
      emitConfigEvent(
        resolved.events,
        'config_diff_computed',
        'info',
        'operation=diff;from=' + from + ';to=' + to + ';changed_count=' + String(result.changed.length) + ';non_model_changes=' + String(result.nonModelChanges),
      )
      return result
    },
  }
}
