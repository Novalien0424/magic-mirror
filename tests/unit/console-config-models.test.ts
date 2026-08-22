import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

import { createConsoleConfigController } from '../../src/main/console-config'
import {
  ConfigServiceError,
  createConfigService,
  type ConfigAtomicWriter,
  type ConfigEventSink,
  type ConfigFileOperations,
  type ConfigService,
} from '../../src/main/config-service'
import {
  resolveModelSettings,
  type ModelSettingsResolution,
} from '../../src/main/model-settings'
import {
  CONSOLE_IPC_CHANNELS,
  MIRROR_IPC_CHANNELS,
  registerIpcHandlers,
} from '../../src/main/ipc'
import type {
  ConsoleConfigDiff,
  ConsoleConfigDraftInput,
  ConsoleConfigPayload,
  ConsoleDiffConfirmation,
  ConsoleModelRole,
  ConsoleModelsPayload,
  ConsoleResponse,
} from '../../src/shared/console-types'
import type {
  AppSnapshot,
  MirrorConfig,
  MirrorEvent,
} from '../../src/shared/types'

const TEST_TRANSCRIPT_SENTINEL = '__TEST_TRANSCRIPT_SENTINEL__'
const TEST_AUDIO_SENTINEL = '__TEST_AUDIO_SENTINEL__'
const TEST_PRIVATE_MEMORY_SENTINEL = '__TEST_PRIVATE_MEMORY_SENTINEL__'
const TEST_CREDENTIAL_SENTINEL = '__TEST_CREDENTIAL_SENTINEL__'
const TEST_IMAGE_SENTINEL = '__TEST_IMAGE_SENTINEL__'
const TEST_EMBEDDING_SENTINEL = '__TEST_EMBEDDING_SENTINEL__'
const TEST_CONFIGURED_VALUE_SENTINEL = '__TEST_CONFIGURED_VALUE_SENTINEL__'
const TEST_SERVICE_SENTINEL = '__TEST_SERVICE_SENTINEL__'

const PRIVACY_SENTINELS = [
  TEST_TRANSCRIPT_SENTINEL,
  TEST_AUDIO_SENTINEL,
  TEST_PRIVATE_MEMORY_SENTINEL,
  TEST_CREDENTIAL_SENTINEL,
  TEST_IMAGE_SENTINEL,
  TEST_EMBEDDING_SENTINEL,
  TEST_CONFIGURED_VALUE_SENTINEL,
  TEST_SERVICE_SENTINEL,
] as const

const MODEL_ROLES: readonly ConsoleModelRole[] = [
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
]

const MODEL_PATHS = [
  'aiModels.realtimeDialogue.modelId',
  'aiModels.inputTranscription.modelId',
  'aiModels.memoryExtractor.modelId',
] as const

const METADATA_EVENT_KEYS = new Set([
  'module',
  'event',
  'status',
  'source',
  'reason',
  'error_code',
  'slot',
  'revision',
  'count',
  'config_version',
  'duration_ms',
  'session_id',
  'scene_id',
])

type ConfigEvent = Omit<MirrorEvent, 'time'>

type DraftProbeResult = {
  readonly result: 'mock_passed' | 'failed'
  readonly reason: 'cause=all_configured_ids_observed' | 'cause=mock_probe_failed' | 'cause=draft_invalid'
}

type RefreshResult =
  | { readonly ok: true; readonly configVersion: number; readonly resolution: ModelSettingsResolution }
  | { readonly ok: false; readonly error: 'console_config_refresh_failed'; readonly reason: 'cause=refresh_failed' }

interface ConsoleConfigController {
  getConfig(): Promise<ConsoleResponse<ConsoleConfigPayload>>
  getModels(): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveModelDraft(input: unknown): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveDraft(input: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  testDraft(): Promise<ConsoleResponse<unknown>>
  publish(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  rollback(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  createNextRuntimeSnapshots(): Promise<ConsoleResponse<unknown>>
  createInitialRuntimeSnapshotsForTest(): Promise<unknown>
}

interface ControllerOptions {
  readonly getConfigService: () => ConfigService
  readonly getModelSettings: () => ModelSettingsResolution
  readonly refreshConfig: () => Promise<RefreshResult>
  readonly getDeveloperMode: () => boolean
  readonly emit: (event: ConfigEvent) => void
  readonly now: () => string
  readonly mockDraftProbe?: (...args: readonly unknown[]) => DraftProbeResult | PromiseLike<DraftProbeResult>
}

type ControllerFactory = (options: ControllerOptions) => ConsoleConfigController

const controllerFactory = createConsoleConfigController as unknown as ControllerFactory

function fixtureModelValue(role: ConsoleModelRole): string {
  return `fixture-console-${role}-v2`
}

function fixtureModelId(role: ConsoleModelRole, suffix: string): string {
  return `${fixtureModelValue(role)}-${suffix}`
}

function fixtureConfig(configVersion: number, suffix: string): MirrorConfig {
  return {
    configVersion,
    persona: {
      name: `fixture-persona-${suffix}`,
      instructions: `fixture-persona-instructions-${suffix}`,
    },
    voice: `fixture-voice-${suffix}`,
    reasoningEffort: 'low',
    turnDetectionProfile: 'semantic-vad-interruptible',
    idleSeconds: 300,
    aiModels: {
      realtimeDialogue: { modelId: fixtureModelId('realtimeDialogue', suffix) },
      inputTranscription: { modelId: fixtureModelId('inputTranscription', suffix) },
      memoryExtractor: { modelId: fixtureModelId('memoryExtractor', suffix) },
    },
    wake: {
      phrase: `fixture-wake-${suffix}`,
      modelVersion: `fixture-wake-model-${suffix}`,
    },
    faceModel: {
      detectorId: `fixture-face-detector-${suffix}`,
      recognizerId: `fixture-face-recognizer-${suffix}`,
    },
    assets: {
      offlineLoopVideo: `fixture-offline-loop-${suffix}.mp4`,
      avatarDir: `fixture-avatar-${suffix}`,
      musicDir: `fixture-music-${suffix}`,
    },
    spells: [],
    scenes: [],
    adapters: {
      lighting: 'mock',
      fog: 'mock',
      music: 'mock',
    },
  }
}

function fixtureSlots(): { active: MirrorConfig; draft: MirrorConfig; previous: MirrorConfig } {
  const active = fixtureConfig(7, 'active')
  const draft = {
    ...active,
    persona: { ...active.persona, name: 'fixture-persona-draft' },
    voice: 'fixture-voice-draft',
    aiModels: {
      ...active.aiModels,
      realtimeDialogue: {
        ...active.aiModels.realtimeDialogue,
        modelId: fixtureModelId('realtimeDialogue', 'draft'),
      },
      inputTranscription: {
        ...active.aiModels.inputTranscription,
        modelId: fixtureModelId('inputTranscription', 'draft'),
      },
      memoryExtractor: {
        ...active.aiModels.memoryExtractor,
        modelId: fixtureModelId('memoryExtractor', 'draft'),
      },
    },
    adapters: { ...active.adapters, fog: 'physical' as const },
  }
  return {
    active,
    draft,
    previous: fixtureConfig(6, 'previous'),
  }
}

function encode(config: MirrorConfig): string {
  return JSON.stringify(config, null, 2) + '\n'
}

function slotPath(configDir: string, slot: 'active' | 'draft' | 'previous'): string {
  return join(configDir, `${slot}.json`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface MemoryHarnessOptions {
  readonly previousAvailable?: boolean
  readonly failPublish?: boolean
  readonly failRollback?: boolean
}

interface MemoryMetrics {
  draftSaveCalls: number
  modelDraftCalls: number
  publishCalls: number
  rollbackCalls: number
  refreshCalls: number
  mockProbeCalls: number
}

interface MemoryHarness {
  readonly configDir: string
  readonly defaultConfigPath: string
  readonly store: Map<string, string>
  readonly events: ConfigEvent[]
  readonly writer: ConfigAtomicWriter & { writeCount: number; writePaths: string[]; failWrites: Set<number> }
  readonly service: ConfigService
  readonly initialSlots: { active: MirrorConfig; draft: MirrorConfig; previous: MirrorConfig }
  readonly metrics: MemoryMetrics
}

function makeMemoryHarness(options: MemoryHarnessOptions = {}): MemoryHarness {
  const configDir = 'fixture-memory-config'
  const defaultConfigPath = 'fixture-memory-default.json'
  const initialSlots = fixtureSlots()
  const store = new Map<string, string>()
  const events: ConfigEvent[] = []
  const metrics: MemoryMetrics = {
    draftSaveCalls: 0,
    modelDraftCalls: 0,
    publishCalls: 0,
    rollbackCalls: 0,
    refreshCalls: 0,
    mockProbeCalls: 0,
  }

  store.set(slotPath(configDir, 'active'), encode(initialSlots.active))
  store.set(slotPath(configDir, 'draft'), encode(initialSlots.draft))
  if (options.previousAvailable !== false) {
    store.set(slotPath(configDir, 'previous'), encode(initialSlots.previous))
  }
  store.set(defaultConfigPath, encode(initialSlots.active))

  const files: ConfigFileOperations = {
    async ensureDirectory() {},
    async readText(filePath) {
      return store.get(filePath) ?? null
    },
    async remove(filePath) {
      store.delete(filePath)
    },
  }

  const writer: MemoryHarness['writer'] = {
    writeCount: 0,
    writePaths: [],
    failWrites: new Set<number>(),
    async write(filePath, contents) {
      this.writeCount += 1
      this.writePaths.push(filePath)
      if (this.failWrites.has(this.writeCount)) throw new Error(TEST_SERVICE_SENTINEL)
      store.set(filePath, contents)
    },
  }

  const serviceEvents: ConfigEventSink = {
    emit(event) {
      events.push({ ...event })
    },
  }
  const rawService = createConfigService({
    configDir,
    defaultConfigPath,
    files,
    atomicWriter: writer,
    events: serviceEvents,
  })

  const service: ConfigService = {
    initialize: () => rawService.initialize(),
    read: () => rawService.read(),
    saveDraft: async (candidate) => {
      metrics.draftSaveCalls += 1
      const before = await rawService.read()
      if (isRecord(candidate) && isRecord(candidate.aiModels)) {
        const candidateModels = candidate.aiModels
        const modelChanged = MODEL_ROLES.some((role) => {
          const candidateRole = candidateModels[role]
          if (!isRecord(candidateRole)) return true
          return candidateRole.modelId !== before.draft.aiModels[role].modelId
        })
        if (modelChanged) metrics.modelDraftCalls += 1
      }
      return rawService.saveDraft(candidate)
    },
    publish: async () => {
      metrics.publishCalls += 1
      if (options.failPublish === true) throw new ConfigServiceError('config_write_failed')
      return rawService.publish()
    },
    rollback: async () => {
      metrics.rollbackCalls += 1
      if (options.failRollback === true) throw new ConfigServiceError('config_write_failed')
      return rawService.rollback()
    },
    diff: (from, to) => rawService.diff(from, to),
  }

  return {
    configDir,
    defaultConfigPath,
    store,
    events,
    writer,
    service,
    initialSlots,
    metrics,
  }
}

interface ControllerOverrides extends MemoryHarnessOptions {
  readonly developerMode?: boolean
  readonly refreshFails?: boolean
  readonly mockDraftProbe?: () => DraftProbeResult | PromiseLike<DraftProbeResult>
}

interface ControllerHarness extends MemoryHarness {
  readonly controller: ConsoleConfigController
}

function makeController(overrides: ControllerOverrides = {}): ControllerHarness {
  const harness = makeMemoryHarness(overrides)
  let resolution = resolveModelSettings(harness.initialSlots)

  const controller = controllerFactory({
    getConfigService: () => harness.service,
    getModelSettings: () => resolution,
    refreshConfig: async () => {
      harness.metrics.refreshCalls += 1
      if (overrides.refreshFails === true) {
        return { ok: false, error: 'console_config_refresh_failed', reason: 'cause=refresh_failed' }
      }
      const slots = await harness.service.read()
      resolution = resolveModelSettings(slots)
      return { ok: true, configVersion: slots.active.configVersion, resolution }
    },
    getDeveloperMode: () => overrides.developerMode !== false,
    emit(event) {
      harness.events.push({ ...event })
    },
    now: () => '2026-08-19T00:00:00.000Z',
    mockDraftProbe: async (...args) => {
      void args
      harness.metrics.mockProbeCalls += 1
      if (overrides.mockDraftProbe !== undefined) return overrides.mockDraftProbe()
      return { result: 'mock_passed', reason: 'cause=all_configured_ids_observed' }
    },
  })

  return { ...harness, controller }
}

function safeDraftInput(config: MirrorConfig): ConsoleConfigDraftInput {
  return {
    personaName: config.persona.name,
    voice: config.voice,
    idleSeconds: config.idleSeconds,
    wake: { ...config.wake },
    faceModel: { ...config.faceModel },
    assets: { ...config.assets },
    adapters: { ...config.adapters },
  }
}

async function readConfigPayload(controller: ConsoleConfigController): Promise<ConsoleConfigPayload> {
  const result = await controller.getConfig()
  expect(result.ok).toBe(true)
  return result.ok ? result.value : ({} as ConsoleConfigPayload)
}

async function readDiff(
  controller: ConsoleConfigController,
  operation: 'publish' | 'rollback',
): Promise<ConsoleConfigDiff> {
  const payload = await readConfigPayload(controller)
  return operation === 'publish' ? payload.publishDiff : payload.rollbackDiff
}

function diffConfirmation(diff: ConsoleConfigDiff): ConsoleDiffConfirmation {
  return {
    operation: diff.operation,
    expectedActiveVersion: diff.expectedActiveVersion,
    changedPaths: diff.changed.map((entry) => entry.path).slice().sort(),
    nonModelChanges: diff.nonModelChanges,
    confirmationDigest: diff.confirmationDigest,
  }
}

async function activeRevision(harness: MemoryHarness): Promise<number> {
  return (await harness.service.read()).active.configVersion
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
    return keys
  }
  if (!isRecord(value)) return keys
  for (const [key, child] of Object.entries(value)) {
    keys.push(key)
    collectKeys(child, keys)
  }
  return keys
}

function expectNoSensitiveOutput(value: unknown, allowModels = false): void {
  const serialized = (JSON.stringify(value) ?? '')
    .replace(/aiModels\.(?:realtimeDialogue|inputTranscription|memoryExtractor)\.modelId/g, '')
  for (const sentinel of PRIVACY_SENTINELS) expect(serialized).not.toContain(sentinel)
  expect(serialized).not.toContain('contract_passed')
  if (!allowModels) expect(serialized).not.toContain('modelId')
  const forbidden = collectKeys(value).some((key) => /^(?:guestId|candidateProfileId|activeProfileId|profileId|credential|credentials|apiKey|clientSecret|transcript|audio|privateContext|image|embedding)$/i.test(key))
  expect(forbidden).toBe(false)
}

function expectMetadataOnly(events: readonly unknown[]): void {
  for (const event of events) {
    expect(collectKeys(event).every((key) => METADATA_EVENT_KEYS.has(key))).toBe(true)
    expectNoSensitiveOutput(event)
  }
}

function expectEvent(events: readonly ConfigEvent[], event: string, reason?: string): void {
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      event,
      ...(reason === undefined ? {} : { reason }),
    }),
  ]))
}

describe('Phase 0 Task 9B Gate 9B.1 Config + Models controller RED contract', () => {
  it('exposes safe Active, Draft, Previous views and a complete value-free diff', async () => {
    const harness = makeController()
    const payload = await readConfigPayload(harness.controller)

    expect(Object.keys(payload.active).sort()).toEqual([
      'adapters',
      'assets',
      'configVersion',
      'faceModel',
      'idleSeconds',
      'personaName',
      'voice',
      'wake',
    ])
    expect(payload.previous).toBeDefined()
    expect(payload.publishDiff.changed.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        'persona.name',
        'voice',
        ...MODEL_PATHS,
      ]),
    )
    expect(payload.publishDiff.nonModelChanges).toBe(true)
    expect(payload.publishDiff.changed.every((entry) => Object.keys(entry).sort().every((key) => ['change', 'kind', 'path'].includes(key)))).toBe(true)
    expect(payload.publishDiff.confirmationDigest).toMatch(/^[A-Za-z0-9:_-]+$/)
    expectNoSensitiveOutput(payload)
    expectMetadataOnly(harness.events)
  })

  it('saves only Phase 0-safe Config Draft fields and preserves Active and model roles', async () => {
    const harness = makeController()
    const before = await harness.service.read()
    const input = safeDraftInput({
      ...before.draft,
      persona: { ...before.draft.persona, name: 'fixture-persona-safe-edit' },
      voice: 'fixture-voice-safe-edit',
      idleSeconds: 301,
    })

    const result = await harness.controller.saveDraft(input)

    expect(result).toMatchObject({ ok: true })
    const after = await harness.service.read()
    expect(after.active).toEqual(before.active)
    expect(after.draft.persona.name).toBe('fixture-persona-safe-edit')
    expect(after.draft.voice).toBe('fixture-voice-safe-edit')
    expect(after.draft.idleSeconds).toBe(301)
    expect(after.draft.aiModels).toEqual(before.draft.aiModels)
    expect(harness.metrics.draftSaveCalls).toBe(1)
    expect(harness.metrics.modelDraftCalls).toBe(0)
    expectEvent(harness.events, 'config_draft_saved')
    expectNoSensitiveOutput(result)
    expectMetadataOnly(harness.events)
  })

  it('rejects an unsafe Draft input with exact fields and leaves Active unchanged', async () => {
    const harness = makeController()
    const before = await harness.controller.getConfig()
    const activeBefore = await activeRevision(harness)

    const result = await harness.controller.saveDraft({ unexpected: TEST_CONFIGURED_VALUE_SENTINEL })

    expect(result).toEqual({
      ok: false,
      error: 'console_config_invalid',
      reason: 'cause=payload_schema_invalid',
      fields: [{ path: '$', message: 'unrecognized_keys' }],
    })
    const after = await harness.controller.getConfig()
    expect(after).toEqual(before)
    expect(await activeRevision(harness)).toBe(activeBefore)
    expectEvent(harness.events, 'config_draft_rejected', 'cause=payload_schema_invalid')
    expectNoSensitiveOutput({ result, before, after, events: harness.events })
    expectMetadataOnly(harness.events)
  })

  it('updates all three Draft model roles only through the Models action', async () => {
    const harness = makeController()
    const input = {
      realtimeDialogue: fixtureModelValue('realtimeDialogue'),
      inputTranscription: fixtureModelValue('inputTranscription'),
      memoryExtractor: fixtureModelValue('memoryExtractor'),
    }

    const result = await harness.controller.saveModelDraft(input)

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.value.cards).toHaveLength(3)
      expect(result.value.cards.map((card) => card.role)).toEqual(MODEL_ROLES)
      expect(result.value.cards.every((card) => card.draft.modelId === fixtureModelValue(card.role))).toBe(true)
    }
    const config = await harness.controller.getConfig()
    expect(config.ok).toBe(true)
    if (config.ok) {
      const safeConfig = JSON.stringify({
        active: config.value.active,
        draft: config.value.draft,
        previous: config.value.previous,
      }) ?? ''
      expect(safeConfig).not.toContain('modelId')
      expect(safeConfig).not.toContain(fixtureModelValue('realtimeDialogue'))
    }
    expect(harness.metrics.draftSaveCalls).toBe(1)
    expect(harness.metrics.modelDraftCalls).toBe(1)
    expect(await activeRevision(harness)).toBe(7)

    const configActionAttempt = await harness.controller.saveDraft(input)
    expect(configActionAttempt).toMatchObject({
      ok: false,
      error: 'console_config_invalid',
      reason: 'cause=payload_schema_invalid',
    })
    expect(harness.metrics.modelDraftCalls).toBe(1)
    expectNoSensitiveOutput(result, true)
    expectNoSensitiveOutput(config)
    expectNoSensitiveOutput(configActionAttempt)
    expectNoSensitiveOutput(harness.events)
    expectMetadataOnly(harness.events)
  })

  it('blocks Publish until a successful mock Draft test matches the current Draft', async () => {
    const harness = makeController()
    const diff = await readDiff(harness.controller, 'publish')
    const confirmation = diffConfirmation(diff)

    const blocked = await harness.controller.publish(confirmation)

    expect(blocked).toMatchObject({
      ok: false,
      error: 'console_config_not_tested',
      reason: 'cause=draft_not_tested',
    })
    expect(await activeRevision(harness)).toBe(7)
    expect(harness.metrics.publishCalls).toBe(0)

    const tested = await harness.controller.testDraft()
    expect(tested).toMatchObject({
      ok: true,
      value: {
        result: 'mock_passed',
        source: 'simulator',
        roleCount: 3,
      },
    })
    const published = await harness.controller.publish(diffConfirmation(await readDiff(harness.controller, 'publish')))

    expect(published).toMatchObject({ ok: true })
    expect(await activeRevision(harness)).toBeGreaterThan(7)
    expect(harness.metrics.publishCalls).toBe(1)
    expect(harness.metrics.refreshCalls).toBe(1)
    expectEvent(harness.events, 'model_settings_simulated')
    expectEvent(harness.events, 'config_publish_requested')
    expectNoSensitiveOutput({ blocked, tested, published, events: harness.events })
    expectMetadataOnly(harness.events)
  })

  it('rejects a stale full diff confirmation before calling ConfigService.publish', async () => {
    const harness = makeController()
    const diff = await readDiff(harness.controller, 'publish')
    const stale = { ...diffConfirmation(diff), changedPaths: [] }

    const result = await harness.controller.publish(stale)

    expect(result).toMatchObject({
      ok: false,
      error: 'console_config_diff_stale',
      reason: 'cause=diff_stale',
    })
    expect(harness.metrics.publishCalls).toBe(0)
    expect(await activeRevision(harness)).toBe(7)
    expectEvent(harness.events, 'config_diff_rejected', 'cause=diff_stale')
    expectNoSensitiveOutput({ result, events: harness.events })
    expectMetadataOnly(harness.events)
  })

  it('rejects a partial confirmation without trusting a renderer boolean or revision alone', async () => {
    const harness = makeController()
    const diff = await readDiff(harness.controller, 'publish')
    const partial = {
      operation: diff.operation,
      expectedActiveVersion: diff.expectedActiveVersion,
      changedPaths: diff.changed.map((entry) => entry.path),
      nonModelChanges: diff.nonModelChanges,
    }

    const result = await harness.controller.publish(partial)

    expect(result).toMatchObject({
      ok: false,
      error: 'console_config_confirmation_invalid',
      reason: 'cause=confirmation_invalid',
    })
    expect(harness.metrics.publishCalls).toBe(0)
    expect(await activeRevision(harness)).toBe(7)
    expectNoSensitiveOutput({ result, events: harness.events })
    expectMetadataOnly(harness.events)
  })

  it('refreshes Main resolution after Publish and Rollback while preserving old snapshots', async () => {
    const harness = makeController()
    const old = await harness.controller.createInitialRuntimeSnapshotsForTest()

    await harness.controller.testDraft()
    await harness.controller.publish(diffConfirmation(await readDiff(harness.controller, 'publish')))

    const afterPublish = await harness.controller.getModels()
    expect(afterPublish).toMatchObject({ ok: true, value: { runtime: { old: expect.anything(), new: null } } })
    if (!afterPublish.ok) return
    expect(JSON.stringify(afterPublish.value.runtime.old)).toBe(JSON.stringify(old))
    expect(afterPublish.value.cards.every((card) => card.publishedActive.configVersion > 7)).toBe(true)

    const next = await harness.controller.createNextRuntimeSnapshots()
    expect(next).toMatchObject({
      ok: true,
      value: { result: 'mock_passed', source: 'simulator', reason: 'cause=next_snapshot_created' },
    })
    const afterNext = await harness.controller.getModels()
    expect(afterNext).toMatchObject({ ok: true, value: { runtime: { new: expect.objectContaining({ label: 'new', source: 'simulator' }) } } })
    if (!afterNext.ok) return
    expect(JSON.stringify(afterNext.value.runtime.old)).toBe(JSON.stringify(old))
    const currentBeforeRollback = JSON.stringify(afterNext.value.runtime.current)

    const rollbackDiff = await readDiff(harness.controller, 'rollback')
    expect(rollbackDiff.operation).toBe('rollback')
    expect(rollbackDiff.from).toBe('previous')
    expect(rollbackDiff.to).toBe('active')
    expect(rollbackDiff.changed.map((entry) => entry.path)).toEqual(expect.arrayContaining([...MODEL_PATHS]))
    expect(rollbackDiff.nonModelChanges).toBe(true)

    const partialRollback = {
      ...diffConfirmation(rollbackDiff),
      changedPaths: diffConfirmation(rollbackDiff).changedPaths.slice(0, -1),
    }
    const rejectedRollback = await harness.controller.rollback(partialRollback)
    expect(rejectedRollback).toMatchObject({
      ok: false,
      error: 'console_config_diff_stale',
      reason: 'cause=diff_stale',
    })
    expect(harness.metrics.rollbackCalls).toBe(0)

    const rolledBack = await harness.controller.rollback(diffConfirmation(await readDiff(harness.controller, 'rollback')))
    expect(rolledBack).toMatchObject({ ok: true })
    expect(harness.metrics.rollbackCalls).toBe(1)
    expect(harness.metrics.refreshCalls).toBe(2)
    const afterRollback = await harness.controller.getModels()
    expect(afterRollback).toMatchObject({ ok: true, value: { runtime: { new: null } } })
    if (afterRollback.ok) {
      expect(JSON.stringify(afterRollback.value.runtime.current)).toBe(currentBeforeRollback)
      expect(JSON.stringify(afterRollback.value.runtime.old)).toBe(currentBeforeRollback)
      expect(afterRollback.value.cards.every((card) => card.publishedActive.configVersion > 7)).toBe(true)
    }
    expectNoSensitiveOutput(afterPublish, true)
    expectNoSensitiveOutput(next)
    expectNoSensitiveOutput(afterNext, true)
    expectNoSensitiveOutput(rejectedRollback)
    expectNoSensitiveOutput(rolledBack)
    expectNoSensitiveOutput(afterRollback, true)
    expectMetadataOnly(harness.events)
  })

  it('returns failed mock Draft evidence and keeps Active unchanged', async () => {
    const harness = makeController({
      mockDraftProbe: () => ({ result: 'failed', reason: 'cause=mock_probe_failed' }),
    })

    const tested = await harness.controller.testDraft()
    expect(tested).toMatchObject({
      ok: true,
      value: { result: 'failed', source: 'simulator', reason: 'cause=mock_probe_failed' },
    })
    const blocked = await harness.controller.publish(diffConfirmation(await readDiff(harness.controller, 'publish')))

    expect(blocked).toMatchObject({
      ok: false,
      error: 'console_config_test_failed',
      reason: 'cause=draft_test_failed',
    })
    expect(harness.metrics.publishCalls).toBe(0)
    expect(await activeRevision(harness)).toBe(7)
    expectEvent(harness.events, 'model_settings_simulated')
    expectNoSensitiveOutput({ tested, blocked, events: harness.events })
    expectMetadataOnly(harness.events)
  })

  it('rejects rollback when Previous is unavailable without changing Active', async () => {
    const harness = makeController({ previousAvailable: false })
    const before = await activeRevision(harness)
    const rollbackDiff = await readDiff(harness.controller, 'rollback')

    const result = await harness.controller.rollback(diffConfirmation(rollbackDiff))

    expect(result).toMatchObject({
      ok: false,
      error: 'console_config_previous_unavailable',
      reason: 'cause=previous_unavailable',
    })
    expect(await activeRevision(harness)).toBe(before)
    expectNoSensitiveOutput({ result, events: harness.events })
    expectMetadataOnly(harness.events)
  })

  it('maps ConfigService failure and refresh failure to visible non-fallback outcomes', async () => {
    const failedService = makeController({ failPublish: true })
    await failedService.controller.testDraft()
    const failedPublish = await failedService.controller.publish(
      diffConfirmation(await readDiff(failedService.controller, 'publish')),
    )
    expect(failedPublish).toMatchObject({
      ok: false,
      error: 'console_config_publish_failed',
      reason: 'cause=atomic_publish_failed',
    })
    expect(await activeRevision(failedService)).toBe(7)
    expect(failedService.metrics.publishCalls).toBe(1)

    const failedRefresh = makeController({ refreshFails: true })
    await failedRefresh.controller.testDraft()
    const refreshResult = await failedRefresh.controller.publish(
      diffConfirmation(await readDiff(failedRefresh.controller, 'publish')),
    )
    expect(refreshResult).toMatchObject({
      ok: false,
      error: 'console_config_refresh_failed',
      reason: 'cause=refresh_failed',
    })
    expect(await activeRevision(failedRefresh)).toBeGreaterThan(7)
    expectEvent(failedRefresh.events, 'config_refresh_failed', 'cause=refresh_failed')
    expectNoSensitiveOutput({ failedPublish, refreshResult, failedEvents: failedService.events, refreshEvents: failedRefresh.events })
    expectMetadataOnly([...failedService.events, ...failedRefresh.events])
  })

  it('gates explicit next snapshots on Developer Mode and preserves immutable current evidence', async () => {
    const disabled = makeController({ developerMode: false })
    const result = await disabled.controller.createNextRuntimeSnapshots()

    expect(result).toMatchObject({
      ok: true,
      value: { result: 'failed', source: 'simulator', reason: 'cause=developer_mode_disabled' },
    })
    expectEvent(disabled.events, 'runtime_snapshot_created', 'cause=developer_mode_disabled')
    expectNoSensitiveOutput({ result, events: disabled.events })
    expectMetadataOnly(disabled.events)
  })

  it('emits every 9B action event with metadata-only status, reason, and source', async () => {
    const harness = makeController()
    const safeInput = safeDraftInput(harness.initialSlots.draft)
    await harness.controller.saveDraft(safeInput)
    await harness.controller.saveDraft({ unexpected: TEST_CONFIGURED_VALUE_SENTINEL })
    await harness.controller.publish({
      ...diffConfirmation(await readDiff(harness.controller, 'publish')),
      changedPaths: [],
    })
    await harness.controller.testDraft()
    await harness.controller.publish(diffConfirmation(await readDiff(harness.controller, 'publish')))
    await harness.controller.createInitialRuntimeSnapshotsForTest()
    await harness.controller.createNextRuntimeSnapshots()
    await harness.controller.rollback(diffConfirmation(await readDiff(harness.controller, 'rollback')))

    const refreshFailure = makeController({ refreshFails: true })
    await refreshFailure.controller.testDraft()
    await refreshFailure.controller.publish(diffConfirmation(await readDiff(refreshFailure.controller, 'publish')))

    const eventNames = new Set([...harness.events, ...refreshFailure.events].map((event) => event.event))
    const requiredEvents = [
      'config_draft_saved',
      'config_draft_rejected',
      'config_diff_rejected',
      'config_publish_requested',
      'config_rollback_requested',
      'config_refresh_failed',
      'model_settings_simulated',
      'runtime_snapshot_created',
    ] as const
    for (const event of requiredEvents) expect(eventNames.has(event)).toBe(true)
    expectMetadataOnly([...harness.events, ...refreshFailure.events])
  })
})

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

interface IpcHarness {
  readonly handlers: Map<string, IpcHandler>
  readonly events: Array<Record<string, unknown>>
  readonly facade: Record<string, ReturnType<typeof vi.fn>>
  readonly consoleSender: Record<string, unknown>
  readonly consoleFrame: Record<string, unknown>
  readonly mirrorSender: Record<string, unknown>
  readonly mirrorFrame: Record<string, unknown>
}

interface IpcHarnessOptions {
  readonly destroyed?: boolean
  readonly mismatchedTrackedId?: boolean
}

function fixtureSafeConfigResponse(): ConsoleResponse<ConsoleConfigPayload> {
  const safe = {
    configVersion: 7,
    personaName: 'fixture-persona-safe',
    voice: 'fixture-voice-safe',
    idleSeconds: 300,
    wake: { phrase: 'fixture-wake-safe', modelVersion: 'fixture-wake-model-safe' },
    faceModel: { detectorId: 'fixture-detector-safe', recognizerId: 'fixture-recognizer-safe' },
    assets: { offlineLoopVideo: 'fixture-loop-safe.mp4', avatarDir: 'fixture-avatar-safe', musicDir: 'fixture-music-safe' },
    adapters: { lighting: 'mock' as const, fog: 'mock' as const, music: 'mock' as const },
  }
  const diff = {
    operation: 'publish' as const,
    from: 'active' as const,
    to: 'draft' as const,
    expectedActiveVersion: 7,
    changed: [{ path: 'persona.name', kind: 'non_model' as const, change: 'updated' as const }],
    nonModelChanges: true,
    confirmationDigest: 'fixture-digest-7',
  }
  return {
    ok: true,
    value: {
      active: safe,
      draft: safe,
      previous: safe,
      publishDiff: diff,
      rollbackDiff: { ...diff, operation: 'rollback', from: 'previous', to: 'active' },
      draftTest: null,
    },
  }
}

function fixtureModelsResponse(): ConsoleResponse<ConsoleModelsPayload> {
  const slot = (role: ConsoleModelRole, suffix: string) => ({
    configVersion: suffix === 'previous' ? 6 : 7,
    fingerprint: `fixture-fingerprint-${role}-${suffix}`,
    modelId: fixtureModelId(role, suffix),
  })
  const cards = MODEL_ROLES.map((role) => ({
    role,
    label: role === 'realtimeDialogue'
      ? 'Realtime Dialogue' as const
      : role === 'inputTranscription'
        ? 'Input Transcription' as const
        : 'Memory Extractor' as const,
    draft: slot(role, 'draft'),
    publishedActive: slot(role, 'active'),
    runtimeLoaded: slot(role, 'active'),
    previous: slot(role, 'previous'),
    pending: 'none' as const,
  }))
  return {
    ok: true,
    value: {
      cards,
      runtime: { current: null, old: null, new: null },
      latestTest: null,
    },
  }
}

function fixtureOverviewResponse(): ConsoleResponse<unknown> {
  return {
    ok: true,
    value: {
      lifecycle: 'dormant',
      appVersion: 'fixture-app-version',
      buildCommit: 'fixture-build-commit',
      configVersion: 7,
      identityStatus: 'unassigned',
      realtimeSessionId: null,
      sessionGeneration: 0,
      uptimeSeconds: 0,
      developerMode: true,
      developerModeSource: 'packaging_default',
      modules: {},
      audioTcc: 'not_checked',
      cameraTcc: 'not_checked',
    },
  }
}

function fixtureEventsResponse(): ConsoleResponse<unknown> {
  return {
    ok: true,
    value: {
      events: [{
        time: '2026-08-19T00:00:00.000Z',
        module: 'app',
        event: 'console_ready',
        status: 'success',
        source: 'runtime',
        reason: 'fixture_ready',
      }],
      nextBeforeSequence: null,
    },
  }
}

function fixtureSnapshot(): AppSnapshot {
  return {
    lifecycle: 'dormant',
    appVersion: 'fixture-app-version',
    buildCommit: 'fixture-build-commit',
    configVersion: 7,
    modules: {
      app: 'ready',
      openai: 'ready',
      wake: 'ready',
      audio: 'ready',
      camera: 'ready',
      identity: 'ready',
      memory: 'ready',
      avatar: 'ready',
      lighting: 'ready',
      fog: 'ready',
      music: 'ready',
      sqlite: 'ready',
      config: 'ready',
      telemetry: 'ready',
    },
    identityStatus: 'unassigned',
    realtimeSessionId: null,
    sessionGeneration: 0,
    lastError: null,
    maintenance: null,
  }
}

function makeIpcHarness(options: IpcHarnessOptions = {}): IpcHarness {
  const handlers = new Map<string, IpcHandler>()
  const events: Array<Record<string, unknown>> = []
  const mirrorFrame: Record<string, unknown> = {}
  const consoleFrame: Record<string, unknown> = {}
  const mirrorSender: Record<string, unknown> = {
    id: 101,
    mainFrame: mirrorFrame,
    isDestroyed: () => false,
    send: vi.fn(),
  }
  const consoleSender: Record<string, unknown> = {
    id: 202,
    mainFrame: consoleFrame,
    isDestroyed: () => false,
    send: vi.fn(),
  }
  const facade: Record<string, ReturnType<typeof vi.fn>> = {
    getOverview: vi.fn(() => fixtureOverviewResponse()),
    getEvents: vi.fn(() => fixtureEventsResponse()),
    getConfig: vi.fn(() => fixtureSafeConfigResponse()),
    getModels: vi.fn(() => fixtureModelsResponse()),
    saveModelDraft: vi.fn(() => fixtureModelsResponse()),
    saveDraft: vi.fn(() => fixtureSafeConfigResponse()),
    testDraft: vi.fn(() => ({ ok: true, value: { result: 'mock_passed', source: 'simulator', roleCount: 3 } })),
    publish: vi.fn(() => fixtureSafeConfigResponse()),
    rollback: vi.fn(() => fixtureSafeConfigResponse()),
    createNextRuntimeSnapshots: vi.fn(() => ({ ok: true, value: { result: 'mock_passed', source: 'simulator', reason: 'cause=next_snapshot_created' } })),
    simulate: vi.fn(async () => ({ op: 'success' as const })),
  }
  const runtime = {
    snapshot: () => fixtureSnapshot(),
    handleSimulator: facade.simulate,
    console: facade,
  }
  const windows = {
    mirror: { webContents: mirrorSender, webContentsId: 101 },
    console: {
      webContents: consoleSender,
      webContentsId: options.mismatchedTrackedId ? 999 : 202,
      isDestroyed: () => options.destroyed === true,
    },
  }

  registerIpcHandlers({
    ipcMain: {
      handle(channel: string, handler: IpcHandler): void {
        handlers.set(channel, handler)
      },
      on(channel: string, handler: IpcHandler): void {
        handlers.set(channel, handler)
      },
    },
    runtime,
    console: facade,
    windows,
    telemetry: {
      emit(event: unknown): void {
        if (isRecord(event)) events.push({ ...event })
      },
    },
  } as never)

  return {
    handlers,
    events,
    facade,
    consoleSender,
    consoleFrame,
    mirrorSender,
    mirrorFrame,
  }
}

function channelNames(): Record<string, string> {
  return CONSOLE_IPC_CHANNELS as unknown as Record<string, string>
}

function getHandler(harness: IpcHarness, channel: string): IpcHandler {
  const handler = harness.handlers.get(channel)
  expect(handler).toBeDefined()
  return handler as IpcHandler
}

function authorizedEvent(harness: IpcHarness): Record<string, unknown> {
  return { sender: harness.consoleSender, senderFrame: harness.consoleFrame }
}

function expectNoIpcSensitiveOutput(value: unknown, allowModels = false): void {
  const serialized = (JSON.stringify(value) ?? '')
    .replace(/aiModels\.(?:realtimeDialogue|inputTranscription|memoryExtractor)\.modelId/g, '')
  for (const sentinel of PRIVACY_SENTINELS) expect(serialized).not.toContain(sentinel)
  if (!allowModels) expect(serialized).not.toContain('modelId')
}

describe('Phase 0 Task 9B Console-only IPC/auth RED contract', () => {
  it('registers every 9B channel with exact methods and preserves the existing Console/Mirror channels', async () => {
    const harness = makeIpcHarness()
    const channels = channelNames()
    expect(channels).toEqual(expect.objectContaining({
      getSnapshot: 'console:get-snapshot',
      simulate: 'console:simulate',
      overview: 'console:get-overview',
      events: 'console:get-events',
      config: 'console:get-config',
      models: 'console:get-models',
      saveModelDraft: 'console:save-model-draft',
      saveDraft: 'console:save-draft',
      testDraft: 'console:test-draft',
      publish: 'console:publish',
      rollback: 'console:rollback',
      nextRuntime: 'console:create-next-runtime',
      ready: 'boot:renderer-ready',
    }))
    expect(MIRROR_IPC_CHANNELS).toEqual({
      reportRealtimeRuntimeOutcome: 'mirror:report-realtime-runtime-outcome',
      reportRealtimeFailure: 'mirror:report-realtime-failure',
      getSnapshot: 'mirror:get-snapshot',
      snapshot: 'mirror:snapshot',
      requestRealtimeClientSecret: 'mirror:request-realtime-client-secret',
      interrupt: 'mirror:interrupt',
      realtimeRuntimeCommand: 'mirror:realtime-runtime-command',
      ready: 'boot:renderer-ready',
    })

    const event = authorizedEvent(harness)
    const operations: readonly [string, readonly unknown[], string][] = [
      [channels.config, [], 'getConfig'],
      [channels.models, [], 'getModels'],
      [channels.saveModelDraft, [{ realtimeDialogue: fixtureModelValue('realtimeDialogue'), inputTranscription: fixtureModelValue('inputTranscription'), memoryExtractor: fixtureModelValue('memoryExtractor') }], 'saveModelDraft'],
      [channels.saveDraft, [safeDraftInput(fixtureConfig(7, 'ipc'))], 'saveDraft'],
      [channels.testDraft, [], 'testDraft'],
      [channels.publish, [diffConfirmation({
        operation: 'publish',
        from: 'active',
        to: 'draft',
        expectedActiveVersion: 7,
        changed: [{ path: 'persona.name', kind: 'non_model', change: 'updated' }],
        nonModelChanges: true,
        confirmationDigest: 'fixture-digest-7',
      })], 'publish'],
      [channels.rollback, [diffConfirmation({
        operation: 'rollback',
        from: 'previous',
        to: 'active',
        expectedActiveVersion: 7,
        changed: [{ path: 'persona.name', kind: 'non_model', change: 'updated' }],
        nonModelChanges: true,
        confirmationDigest: 'fixture-digest-7',
      })], 'rollback'],
      [channels.nextRuntime, [], 'createNextRuntimeSnapshots'],
    ]

    for (const [channel, args, method] of operations) {
      const result = await getHandler(harness, channel)(event, ...args)
      expect(result).toEqual(harness.facade[method].mock.results.at(-1)?.value)
      expectNoIpcSensitiveOutput(result, method === 'getModels' || method === 'saveModelDraft')
    }
    const snapshot = await getHandler(harness, channels.getSnapshot)(event)
    expect(snapshot).toEqual(expect.objectContaining({ lifecycle: 'dormant', configVersion: 7 }))
    expectNoIpcSensitiveOutput(snapshot)
    expectNoIpcSensitiveOutput(harness.events)
    expect(JSON.stringify(snapshot)).not.toContain(TEST_SERVICE_SENTINEL)
    expect(harness.facade.simulate).not.toHaveBeenCalled()
  })

  it('enforces exact argument counts and stable safe failures for every 9B action', async () => {
    const cases: readonly {
      readonly key: string
      readonly args: readonly unknown[]
      readonly method: string
    }[] = [
      { key: 'config', args: [TEST_CONFIGURED_VALUE_SENTINEL], method: 'getConfig' },
      { key: 'models', args: [TEST_CONFIGURED_VALUE_SENTINEL], method: 'getModels' },
      { key: 'saveModelDraft', args: [], method: 'saveModelDraft' },
      { key: 'saveModelDraft', args: [{ realtimeDialogue: fixtureModelValue('realtimeDialogue'), inputTranscription: fixtureModelValue('inputTranscription'), memoryExtractor: fixtureModelValue('memoryExtractor') }, TEST_PRIVATE_MEMORY_SENTINEL], method: 'saveModelDraft' },
      { key: 'saveDraft', args: [], method: 'saveDraft' },
      { key: 'saveDraft', args: [safeDraftInput(fixtureConfig(7, 'ipc')), TEST_PRIVATE_MEMORY_SENTINEL], method: 'saveDraft' },
      { key: 'testDraft', args: [TEST_CONFIGURED_VALUE_SENTINEL], method: 'testDraft' },
      { key: 'publish', args: [], method: 'publish' },
      { key: 'publish', args: [{}, TEST_PRIVATE_MEMORY_SENTINEL], method: 'publish' },
      { key: 'rollback', args: [], method: 'rollback' },
      { key: 'rollback', args: [{}, TEST_PRIVATE_MEMORY_SENTINEL], method: 'rollback' },
      { key: 'nextRuntime', args: [TEST_CONFIGURED_VALUE_SENTINEL], method: 'createNextRuntimeSnapshots' },
    ]

    for (const testCase of cases) {
      const harness = makeIpcHarness()
      const channel = channelNames()[testCase.key]
      const result = await getHandler(harness, channel)(authorizedEvent(harness), ...testCase.args)
      expect(result, testCase.key).toEqual({
        ok: false,
        error: 'console_request_invalid',
        reason: 'cause=payload_schema_invalid',
      })
      expect(harness.facade[testCase.method]).not.toHaveBeenCalled()
      expectNoIpcSensitiveOutput({ result, events: harness.events })
    }
  })

  it('authorizes the Console main frame and exact webContents id for all 9B handlers', async () => {
    const cases: readonly {
      readonly name: string
      readonly options?: IpcHarnessOptions
      readonly event: (harness: IpcHarness) => Record<string, unknown>
      readonly metadataReason: string
    }[] = [
      {
        name: 'Mirror sender',
        event: (harness) => ({ sender: harness.mirrorSender, senderFrame: harness.mirrorFrame }),
        metadataReason: 'web_contents_mismatch',
      },
      {
        name: 'unknown sender',
        event: () => ({ sender: { id: 303, mainFrame: {}, send: vi.fn() }, senderFrame: {} }),
        metadataReason: 'unknown_sender',
      },
      {
        name: 'destroyed Console window',
        options: { destroyed: true },
        event: authorizedEvent,
        metadataReason: 'window_destroyed',
      },
      {
        name: 'non-main frame',
        event: (harness) => ({ sender: harness.consoleSender, senderFrame: {} }),
        metadataReason: 'sender_frame_invalid',
      },
      {
        name: 'mismatched tracked id',
        options: { mismatchedTrackedId: true },
        event: authorizedEvent,
        metadataReason: 'web_contents_mismatch',
      },
    ]
    const channels = ['config', 'models', 'saveModelDraft', 'saveDraft', 'testDraft', 'publish', 'rollback', 'nextRuntime'] as const
    const safeResponse = fixtureSafeConfigResponse()
    const argumentsFor: Record<(typeof channels)[number], readonly unknown[]> = {
      config: [],
      models: [],
      saveModelDraft: [{ realtimeDialogue: fixtureModelValue('realtimeDialogue'), inputTranscription: fixtureModelValue('inputTranscription'), memoryExtractor: fixtureModelValue('memoryExtractor') }],
      saveDraft: [safeDraftInput(fixtureConfig(7, 'ipc-auth'))],
      testDraft: [],
      publish: [safeResponse.ok ? diffConfirmation(safeResponse.value.publishDiff) : {}],
      rollback: [safeResponse.ok ? diffConfirmation(safeResponse.value.rollbackDiff) : {}],
      nextRuntime: [],
    }

    for (const testCase of cases) {
      const harness = makeIpcHarness(testCase.options)
      for (const key of channels) {
        const result = await getHandler(harness, channelNames()[key])(
          testCase.event(harness),
          ...argumentsFor[key],
        )
        expect(result, `${testCase.name}:${key}`).toEqual({
          ok: false,
          error: 'console_request_rejected',
          reason: 'cause=sender_rejected',
        })
      }
      expect(harness.facade.getConfig, testCase.name).not.toHaveBeenCalled()
      expect(harness.facade.getModels, testCase.name).not.toHaveBeenCalled()
      expect(harness.facade.saveModelDraft, testCase.name).not.toHaveBeenCalled()
      expect(harness.facade.saveDraft, testCase.name).not.toHaveBeenCalled()
      expect(harness.facade.testDraft, testCase.name).not.toHaveBeenCalled()
      expect(harness.facade.publish, testCase.name).not.toHaveBeenCalled()
      expect(harness.facade.rollback, testCase.name).not.toHaveBeenCalled()
      expect(harness.facade.createNextRuntimeSnapshots, testCase.name).not.toHaveBeenCalled()
      expect(harness.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: 'ipc_sender_rejected', reason: testCase.metadataReason, source: 'runtime' }),
      ]))
      expectNoIpcSensitiveOutput(harness.events)
    }
  })

  it('keeps modelId confined to the Models response fixture and keeps all other Console results model-free', async () => {
    const harness = makeIpcHarness()
    const event = authorizedEvent(harness)
    const channels = channelNames()
    const config = await getHandler(harness, channels.config)(event)
    const models = await getHandler(harness, channels.models)(event)
    const overview = await getHandler(harness, channels.overview)(event)
    const events = await getHandler(harness, channels.events)(event)
    const snapshot = await getHandler(harness, channels.getSnapshot)(event)

    expect(JSON.stringify(config)).not.toContain('modelId')
    expect(JSON.stringify(overview)).not.toContain('modelId')
    expect(JSON.stringify(events)).not.toContain('modelId')
    expect(JSON.stringify(snapshot)).not.toContain('modelId')
    expect(JSON.stringify(models)).toContain('modelId')
    expectNoIpcSensitiveOutput({ config, overview, events, snapshot })
    expectNoIpcSensitiveOutput(models, true)
    expectNoIpcSensitiveOutput(harness.events)
    expect(collectKeys(harness.events).includes('modelId')).toBe(false)
    expect(collectKeys(harness.events).includes('credential')).toBe(false)
  })
})
