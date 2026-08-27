import { describe, expect, it } from 'vitest'
import {
  ConfigServiceError,
  createConfigService,
  type ConfigAtomicWriter,
  type ConfigEventSink,
  type ConfigFileOperations,
  type ConfigService,
  type ConfigSlots,
} from '../../src/main/config-service'
import type { MirrorConfig, MirrorEvent } from '../../src/shared/types'
import {
  MODEL_SETTINGS_ROLES,
  buildModelSettingsSimulatorEvidence,
  createJobModelSnapshot,
  createSessionModelSnapshot,
  resolveModelSettings,
  type ModelSettingsSimulatorObservation,
} from '../../src/main/model-settings'

type ConfigEvent = Omit<MirrorEvent, 'time'>

const FORBIDDEN_METADATA_KEYS = [
  'transcript',
  'audio',
  'memory_value',
  'private_context',
  'prompt',
  'image',
  'embedding',
  'guestId',
  'candidateProfileId',
  'profileId',
  'credential',
  'credentials',
  'safeStorage',
  'apiKey',
] as const

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
      realtimeDialogue: { modelId: `fixture-realtime-${suffix}` },
      inputTranscription: { modelId: `fixture-transcription-${suffix}` },
      memoryExtractor: { modelId: `fixture-memory-${suffix}` },
    },
    wake: {
      phrase: `fixture-wake-${suffix}`,
      modelVersion: `fixture-wake-model-${suffix}`,
      packageId: `fixture-wake-package-${suffix}`,
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

function fixtureSlots(): ConfigSlots {
  return {
    active: fixtureConfig(7, 'active'),
    draft: fixtureConfig(7, 'draft'),
    previous: fixtureConfig(6, 'previous'),
  }
}

function encode(config: MirrorConfig): string {
  return JSON.stringify(config, null, 2) + '\n'
}

type ConfigBoundaryHarness = {
  store: Map<string, string>
  events: ConfigEvent[]
  writer: ConfigAtomicWriter & { writePaths: string[] }
  service: ConfigService
}

function makeConfigBoundaryHarness(): ConfigBoundaryHarness {
  const store = new Map<string, string>()
  const events: ConfigEvent[] = []
  const files: ConfigFileOperations = {
    async ensureDirectory() {},
    async readText(filePath) {
      return store.get(filePath) ?? null
    },
    async remove(filePath) {
      store.delete(filePath)
    },
  }
  const writer: ConfigBoundaryHarness['writer'] = {
    writePaths: [],
    async write(filePath, contents) {
      this.writePaths.push(filePath)
      store.set(filePath, contents)
    },
  }
  const sink: ConfigEventSink = {
    emit(event) {
      events.push({ ...event })
    },
  }

  return {
    store,
    events,
    writer,
    service: createConfigService({
      configDir: 'boundary-config',
      defaultConfigPath: 'boundary-default',
      files,
      atomicWriter: writer,
      events: sink,
    }),
  }
}

function expectMetadataOnly(value: unknown): void {
  const serialized = JSON.stringify(value)
  for (const key of FORBIDDEN_METADATA_KEYS) {
    expect(serialized).not.toContain(key)
  }
}

describe('model settings resolver core', () => {
  it('resolves exactly the three configured roles from all three slots', () => {
    const slots = fixtureSlots(); const resolved = resolveModelSettings(slots)
    expect(MODEL_SETTINGS_ROLES).toEqual(['realtimeDialogue', 'inputTranscription', 'memoryExtractor'])
    expect(resolved.active.slot).toBe('active'); expect(resolved.draft.slot).toBe('draft'); expect(resolved.previous.slot).toBe('previous')
    expect(resolved.active.realtimeDialogue).toBe('fixture-realtime-active')
    expect(resolved.draft.inputTranscription).toBe('fixture-transcription-draft')
    expect(resolved.previous.memoryExtractor).toBe('fixture-memory-previous')
    expect(resolved.active.voice).toBe('fixture-voice-active')
    expect(resolved.active.fingerprint).not.toBe(resolved.draft.fingerprint)
  })

  it('freezes session and job snapshots at their explicit active boundaries', () => {
    const resolved = resolveModelSettings(fixtureSlots())
    const session = createSessionModelSnapshot(resolved.active, '2026-08-19T00:00:00.000Z')
    const job = createJobModelSnapshot(resolved.active, '2026-08-19T00:00:01.000Z')
    expect(session).toEqual({ configVersion: resolved.active.configVersion, fingerprint: resolved.active.fingerprint, sdkVersion: '0.16.1', realtimeDialogue: 'fixture-realtime-active', inputTranscription: 'fixture-transcription-active', memoryExtractor: 'fixture-memory-active', voice: 'fixture-voice-active', reasoningEffort: 'low', turnDetectionProfile: 'semantic-vad-interruptible', takenAt: '2026-08-19T00:00:00.000Z' })
    expect(job).toEqual({ configVersion: resolved.active.configVersion, fingerprint: resolved.active.fingerprint, memoryExtractor: 'fixture-memory-active', takenAt: '2026-08-19T00:00:01.000Z' })
    expect(Object.isFrozen(session)).toBe(true); expect(Object.isFrozen(job)).toBe(true)
    expect(() => Object.defineProperty(session, 'realtimeDialogue', { value: 'fixture-realtime-other' })).toThrow()
  })

  it('rejects an invalid configured role instead of substituting another slot', () => {
    const slots = fixtureSlots(); const invalidDraft: MirrorConfig = { ...slots.draft, aiModels: { ...slots.draft.aiModels, inputTranscription: { modelId: '' } } }
    expect(() => resolveModelSettings({ ...slots, draft: invalidDraft })).toThrowError(expect.objectContaining({ name: 'ModelSettingsError', code: 'model_settings_invalid_role', slot: 'draft', role: 'inputTranscription' }))
  })
})

describe('model settings ConfigService boundary', () => {
  it('tests whole-config publish and rollback at the ConfigService boundary', async () => {
    const harness = makeConfigBoundaryHarness(); const initial = fixtureConfig(7, 'active')
    harness.store.set('boundary-default', encode(initial)); await harness.service.initialize()
    const draft = fixtureConfig(7, 'published'); await harness.service.saveDraft(draft)
    const beforePublish = await harness.service.read(); const beforeResolution = resolveModelSettings(beforePublish)
    const oldSession = createSessionModelSnapshot(beforeResolution.active, '2026-08-19T00:01:00.000Z')
    const oldJob = createJobModelSnapshot(beforeResolution.active, '2026-08-19T00:01:01.000Z')
    const draftDiff = await harness.service.diff('active', 'draft')
    expect(draftDiff.nonModelChanges).toBe(true)
    expect(draftDiff.changed.map((change) => change.path)).toEqual(expect.arrayContaining(['aiModels.realtimeDialogue.modelId', 'aiModels.inputTranscription.modelId', 'aiModels.memoryExtractor.modelId', 'persona.name', 'voice']))
    const published = await harness.service.publish(); const afterPublish = await harness.service.read()
    expect(afterPublish.active).toEqual(published); expect(afterPublish.previous).toEqual(initial); expect(afterPublish.draft).toEqual(published)
    expect(published.persona.name).toBe(draft.persona.name); expect(published.voice).toBe(draft.voice); expect(published.aiModels).toEqual(draft.aiModels)
    const afterResolution = resolveModelSettings(afterPublish)
    expect(oldSession.realtimeDialogue).toBe('fixture-realtime-active'); expect(oldSession.inputTranscription).toBe('fixture-transcription-active'); expect(oldJob.memoryExtractor).toBe('fixture-memory-active')
    expect(afterResolution.active.realtimeDialogue).toBe('fixture-realtime-published'); expect(afterResolution.active.inputTranscription).toBe('fixture-transcription-published'); expect(afterResolution.active.memoryExtractor).toBe('fixture-memory-published'); expect(afterResolution.active.configVersion).toBe(published.configVersion)
    const rollbackDiff = await harness.service.diff('active', 'previous'); expect(rollbackDiff.nonModelChanges).toBe(true)
    const rolledBack = await harness.service.rollback(); const afterRollback = await harness.service.read()
    expect({ ...rolledBack, configVersion: initial.configVersion }).toEqual(initial); expect(afterRollback.active).toEqual(rolledBack); expect(afterRollback.draft).toEqual(rolledBack); expect(afterRollback.previous).toEqual(published)
  })

  it('preserves Active and performs no partial publish when Draft is invalid', async () => {
    const harness = makeConfigBoundaryHarness(); const initial = fixtureConfig(7, 'active')
    harness.store.set('boundary-default', encode(initial)); await harness.service.initialize()
    const before = await harness.service.read()
    const beforeStore = new Map(harness.store)
    const beforeWrites = [...harness.writer.writePaths]
    const invalidDraft: MirrorConfig = {
      ...fixtureConfig(7, 'invalid'),
      aiModels: {
        ...fixtureConfig(7, 'invalid').aiModels,
        inputTranscription: { modelId: '' },
      },
    }

    let caught: unknown
    try {
      await harness.service.saveDraft(invalidDraft)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConfigServiceError)
    expect((caught as ConfigServiceError).code).toBe('config_schema_invalid')
    const after = await harness.service.read()
    expect(after.active).toEqual(before.active)
    expect(after.draft).toEqual(before.draft)
    expect(after.previous).toEqual(before.previous)
    expect(harness.store).toEqual(beforeStore)
    expect(harness.writer.writePaths).toEqual(beforeWrites)
    expect(harness.events.some((event) => event.event === 'config_published')).toBe(false)
    expect(harness.events).toContainEqual(expect.objectContaining({
      module: 'config',
      event: 'config_operation_failed',
      status: 'failed',
      error_code: 'config_schema_invalid',
      reason: 'operation=save_draft;slot=draft;action=reject;cause=schema_invalid;issue_count=1',
    }))
    expectMetadataOnly(harness.events)
  })
})

describe('model settings simulator evidence', () => {
  it('returns metadata-only simulator evidence with source and reason', () => {
    const resolved = resolveModelSettings(fixtureSlots()); const session = createSessionModelSnapshot(resolved.active, '2026-08-19T00:02:00.000Z'); const job = createJobModelSnapshot(resolved.active, '2026-08-19T00:02:01.000Z')
    const observed: ModelSettingsSimulatorObservation = { session: { realtimeDialogue: session.realtimeDialogue, inputTranscription: session.inputTranscription, voice: session.voice }, job: { memoryExtractor: job.memoryExtractor } }
    const evidence = buildModelSettingsSimulatorEvidence(resolved.active, session, job, observed)
    expect(evidence.result).toBe('mock_passed'); expect(evidence.source).toBe('simulator'); expect(evidence.roleCount).toBe(3)
    expect(evidence.reason).toBe('operation=simulate;result=mock_passed;role_count=3;config_version=7;session_config_version=7;job_config_version=7;cause=all_configured_ids_observed')
    expect(evidence.event).toMatchObject({ module: 'openai', event: 'model_settings_simulated', status: 'success', source: 'simulator', reason: evidence.reason })
    expect(Object.keys(evidence.event).sort()).toEqual(['event', 'module', 'reason', 'source', 'status'])
    expect(JSON.stringify(evidence)).not.toContain('fixture-realtime-active'); expect(JSON.stringify(evidence)).not.toContain('fixture-transcription-active'); expect(JSON.stringify(evidence)).not.toContain('fixture-memory-active')
    expectMetadataOnly(evidence)
    expect(Object.isFrozen(evidence)).toBe(true); expect(Object.isFrozen(evidence.event)).toBe(true)
  })

  it('returns failed simulator metadata for a mismatched role without fallback', () => {
    const resolved = resolveModelSettings(fixtureSlots()); const session = createSessionModelSnapshot(resolved.active, '2026-08-19T00:03:00.000Z'); const job = createJobModelSnapshot(resolved.active, '2026-08-19T00:03:01.000Z')
    const evidence = buildModelSettingsSimulatorEvidence(resolved.active, session, job, { session: { realtimeDialogue: session.realtimeDialogue, inputTranscription: 'fixture-transcription-wrong', voice: session.voice }, job: { memoryExtractor: job.memoryExtractor } })
    expect(evidence.result).toBe('failed'); expect(evidence.source).toBe('simulator'); expect(evidence.reason).toContain('cause=capture_mismatch'); expect(evidence.reason).toContain('role=inputTranscription')
    expect(evidence.event).toMatchObject({ status: 'failed', source: 'simulator', error_code: 'model_settings_simulator_mismatch' })
    expect(JSON.stringify(evidence)).not.toContain('fixture-transcription-wrong')
    expectMetadataOnly(evidence)
    expect(Object.isFrozen(evidence)).toBe(true); expect(Object.isFrozen(evidence.event)).toBe(true)
  })
})
