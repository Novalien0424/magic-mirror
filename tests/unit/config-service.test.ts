import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ConfigServiceError,
  createConfigService,
  mirrorConfigSchema,
  type ConfigAtomicWriter,
  type ConfigEventSink,
  type ConfigFileOperations,
  type ConfigService,
  type ConfigSlot,
} from '../../src/main/config-service'
import type { ConfigDiff, MirrorConfig, MirrorEvent } from '../../src/shared/types'

type ConfigEvent = Omit<MirrorEvent, 'time'>
type SlotFailure = 'missing' | 'invalid' | 'unreadable'

const MODEL_PATHS = [
  'aiModels.realtimeDialogue.modelId',
  'aiModels.inputTranscription.modelId',
  'aiModels.memoryExtractor.modelId',
] as const

const CONFIG_EVENT_NAMES = new Set([
  'config_seeded',
  'config_loaded',
  'config_recovered',
  'config_auxiliary_degraded',
  'config_draft_saved',
  'config_published',
  'config_rolled_back',
  'config_diff_computed',
  'config_operation_failed',
  'config_transaction_compensated',
])

const CONFIG_EVENT_STATUS: Record<string, ConfigEvent['status']> = {
  config_seeded: 'success',
  config_loaded: 'success',
  config_recovered: 'degraded',
  config_auxiliary_degraded: 'degraded',
  config_draft_saved: 'success',
  config_published: 'success',
  config_rolled_back: 'success',
  config_diff_computed: 'info',
  config_operation_failed: 'failed',
  config_transaction_compensated: 'info',
}

const CONFIG_ERROR_EVENTS = new Set([
  'config_recovered',
  'config_auxiliary_degraded',
  'config_operation_failed',
])

const CONFIG_ERROR_CODES = new Set([
  'config_schema_invalid',
  'config_read_failed',
  'config_write_failed',
  'config_default_invalid',
  'config_previous_unavailable',
  'config_revision_exhausted',
  'config_compensation_failed',
  'config_slot_missing',
  'config_slot_invalid',
  'config_slot_unreadable',
  'config_spell_container_invalid',
  'config_scene_container_invalid',
  'config_spell_entry_invalid',
  'config_scene_entry_invalid',
])

const observedEvents: ConfigEvent[] = []
const temporaryDirectories: string[] = []

function baseConfig(configVersion = 7): MirrorConfig {
  return {
    configVersion,
    persona: {
      name: 'mock-persona-v1',
      instructions: 'mock-persona-instructions-v1',
    },
    voice: 'mock-voice-v1',
    idleSeconds: 300,
    aiModels: {
      realtimeDialogue: { modelId: 'mock-realtime-dialogue-v1' },
      inputTranscription: { modelId: 'mock-input-transcription-v1' },
      memoryExtractor: { modelId: 'mock-memory-extractor-v1' },
    },
    wake: {
      phrase: 'mock-wake-phrase-v1',
      modelVersion: 'mock-wake-model-v1',
    },

    faceModel: {
      detectorId: 'mock-face-detector-v1',
      recognizerId: 'mock-face-recognizer-v1',
    },
    assets: {
      offlineLoopVideo: 'mock/offline-loop-v1.mp4',
      avatarDir: 'mock/avatar-v1',
      musicDir: 'mock/music-v1',
    },
    spells: [
      {
        id: 'mock-spell-1',
        phrase: 'mock-spell-phrase-1',
        sceneId: 'mock-scene-1',
        enabled: true,
      },
    ],
    scenes: [
      {
        id: 'mock-scene-1',
        enabled: true,
        cues: ['mock-cue-v1'],
      },
    ],
    adapters: {
      lighting: 'mock',
      fog: 'physical',
      music: 'mock',
    },
  }
}

function encode(config: MirrorConfig): string {
  return JSON.stringify(config, null, 2) + '\n'
}

function slotPath(configDir: string, slot: ConfigSlot): string {
  return join(configDir, slot + '.json')
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function makeSink(events: ConfigEvent[]): ConfigEventSink {
  return {
    emit(event) {
      events.push(event)
      observedEvents.push(event)
    },
  }
}

type MemoryHarness = {
  store: Map<string, string>
  unreadable: Set<string>
  events: ConfigEvent[]
  files: ConfigFileOperations
  writer: ConfigAtomicWriter & {
    writeCount: number
    writePaths: string[]
    failWrites: Set<number>
  }
  removePaths: string[]
  service: (configDir?: string, defaultConfigPath?: string) => ConfigService
}

function makeMemoryHarness(): MemoryHarness {
  const store = new Map<string, string>()
  const unreadable = new Set<string>()
  const events: ConfigEvent[] = []
  const removePaths: string[] = []

  const files: ConfigFileOperations = {
    async ensureDirectory() {},
    async readText(filePath) {
      if (unreadable.has(filePath)) throw new Error('synthetic-read-adapter-detail')
      return store.get(filePath) ?? null
    },
    async remove(filePath) {
      removePaths.push(filePath)
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
      if (this.failWrites.has(this.writeCount)) {
        throw new Error('synthetic-write-adapter-detail')
      }

      store.set(filePath, contents)
    },
  }

  return {
    store,
    unreadable,
    events,
    files,
    writer,
    removePaths,
    service(configDir = 'mock-config', defaultConfigPath = 'mock-default') {
      return createConfigService({
        configDir,
        defaultConfigPath,
        files,
        atomicWriter: writer,
        events: makeSink(events),
      })
    },
  }
}

function seedSlots(
  harness: MemoryHarness,
  configDir: string,
  active: MirrorConfig,
  draft: MirrorConfig = active,
  previous: MirrorConfig | null = active,
): void {
  const values: Record<ConfigSlot, MirrorConfig | null> = { active, draft, previous }
  for (const slot of ['active', 'draft', 'previous'] as const) {
    const path = slotPath(configDir, slot)
    const value = values[slot]
    if (value === null) harness.store.delete(path)
    else harness.store.set(path, encode(value))
  }
}

function applyFailure(harness: MemoryHarness, path: string, failure: SlotFailure): void {
  harness.unreadable.delete(path)
  if (failure === 'missing') {
    harness.store.delete(path)
  } else if (failure === 'invalid') {
    harness.store.set(path, '{"configVersion":0}')
  } else {
    harness.store.set(path, encode(baseConfig()))
    harness.unreadable.add(path)
  }
}

function expectEvent(
  events: ConfigEvent[],
  event: string,
  status: ConfigEvent['status'],
  reason: string,
  errorCode?: string,
): void {
  const expected: ConfigEvent = {
    module: 'config',
    event,
    status,
    source: 'runtime',
    reason,
  }
  if (errorCode !== undefined) expected.error_code = errorCode
  expect(events).toContainEqual(expected)
}

function assertConfigEvents(events: readonly ConfigEvent[]): void {
  for (const event of events) {
    expect(CONFIG_EVENT_NAMES.has(event.event)).toBe(true)
    expect(event.module).toBe('config')
    expect(event.source).toBe('runtime')
    expect(event.status).toBe(CONFIG_EVENT_STATUS[event.event])
    expect(Object.keys(event).every((key) =>
      ['module', 'event', 'status', 'source', 'reason', 'error_code'].includes(key),
    )).toBe(true)
    expect(Object.keys(event)).not.toContain('time')
    expect(event.reason).toMatch(/^[A-Za-z0-9_=;.-]+$/)
    if (CONFIG_ERROR_EVENTS.has(event.event)) {
      expect(typeof event.error_code).toBe('string')
      expect(CONFIG_ERROR_CODES.has(event.error_code as string)).toBe(true)
    } else {
      expect(event.error_code).toBeUndefined()
    }
    const serialized = JSON.stringify(event)
    for (const modelPath of MODEL_PATHS) {
      void modelPath
    }
    expect(serialized).not.toContain('mock-realtime-dialogue-v1')
    expect(serialized).not.toContain('mock-input-transcription-v1')
    expect(serialized).not.toContain('mock-memory-extractor-v1')
    expect(serialized).not.toContain('synthetic-read-adapter-detail')
    expect(serialized).not.toContain('synthetic-write-adapter-detail')
  }
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-task3-'))

  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  assertConfigEvents(observedEvents)
  observedEvents.length = 0
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('ConfigService contract', () => {
  it('validates the strict core without deciding auxiliary Phase 4 shape', () => {
    expect(mirrorConfigSchema.safeParse(baseConfig()).success).toBe(true)
    expect(
      mirrorConfigSchema.safeParse({
        ...baseConfig(),
        unexpected: 'mock-extra-v1',
      }).success,
    ).toBe(false)
    expect(
      mirrorConfigSchema.safeParse({
        ...baseConfig(),
        aiModels: {
          ...baseConfig().aiModels,
          realtimeDialogue: { modelId: ' ' },
        },
      }).success,
    ).toBe(false)
  })

  it('keeps the versioned resource mock-only and free of forbidden content fields', async () => {
    const resourcePath = resolve(process.cwd(), 'resources/config/default.json')
    const resource = JSON.parse(await readFile(resourcePath, 'utf8')) as Record<string, unknown>
    expect(resource).toEqual({
      configVersion: 1,
      persona: {
        name: 'mock-persona-v1',
        instructions: 'mock-persona-instructions-v1',
      },
      voice: 'mock-voice-v1',
      idleSeconds: 300,
      aiModels: {
        realtimeDialogue: { modelId: 'mock-realtime-dialogue-v1' },
        inputTranscription: { modelId: 'mock-input-transcription-v1' },
        memoryExtractor: { modelId: 'mock-memory-extractor-v1' },
      },
      wake: {
        phrase: 'mock-wake-phrase-v1',
        modelVersion: 'mock-wake-model-v1',
      },
      faceModel: {
        detectorId: 'mock-face-detector-v1',
        recognizerId: 'mock-face-recognizer-v1',
      },
      assets: {
        offlineLoopVideo: 'mock/offline-loop-v1.mp4',
        avatarDir: 'mock/avatar-v1',
        musicDir: 'mock/music-v1',
      },
      spells: [],
      scenes: [],
      adapters: {
        lighting: 'mock',
        fog: 'mock',
        music: 'mock',
      },
    })
    const forbiddenKeys = new Set([
      'credential',
      'credentials',
      'transcript',
      'audio',
      'privateContext',
      'image',
      'embedding',
      'prompt',
    ])
    const walkKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walkKeys(item)
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          expect(forbiddenKeys.has(key)).toBe(false)
          walkKeys(child)
        }
      }
    }
    walkKeys(resource)
    const roleValues = Object.values(resource.aiModels as Record<string, { modelId: string }>)
    expect(roleValues.every((role) => role.modelId.startsWith('mock-'))).toBe(true)
    const production = await Promise.all([
      readFile(resolve(process.cwd(), 'src/main/config-service.ts'), 'utf8'),
      readFile(resolve(process.cwd(), 'src/main/credential-store.ts'), 'utf8'),
    ])
    const productionText = production.join('\n')
    expect(productionText).not.toMatch(/modelId\s*:\s*['"]/)
    expect(productionText).not.toMatch(/(?:mock|candidate|fallback)[A-Za-z-]*(?:model|id)/i)
  })


  it('seeds all three slots from the caller-supplied default and preserves its version', async () => {
    const harness = makeMemoryHarness()
    const config = baseConfig(7)
    harness.store.set('mock-default', encode(config))

    const result = await harness.service().initialize()

    expect(result).toEqual({ active: config, draft: config, previous: config })
    expect(harness.store.get(slotPath('mock-config', 'active'))).toBe(encode(config))
    expect(harness.store.get(slotPath('mock-config', 'draft'))).toBe(encode(config))
    expect(harness.store.get(slotPath('mock-config', 'previous'))).toBe(encode(config))
    expect(harness.events).toEqual([
      {
        module: 'config',
        event: 'config_seeded',
        status: 'success',
        source: 'runtime',
        reason: 'operation=initialize;action=seed;config_version=7',
      },
    ])
  })

  it('resolves files-only and atomic-only mixed optional adapter seams', async () => {
    const firstRoot = await makeTemporaryDirectory()
    const firstConfigDir = join(firstRoot, 'config')
    const firstDefaultPath = join(firstRoot, 'default.json')
    await mkdir(firstConfigDir, { recursive: true })
    await writeFile(firstDefaultPath, encode(baseConfig(4)), 'utf8')
    const fileReads: string[] = []
    const injectedFiles: ConfigFileOperations = {
      async ensureDirectory(path) {
        await mkdir(path, { recursive: true })
      },
      async readText(path) {
        fileReads.push(path)
        try {
          return await readFile(path, 'utf8')
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      async remove(path) {
        try {
          await unlink(path)
        } catch (error) {
          if (!isNotFound(error)) throw error
        }
      },
    }
    const firstEvents: ConfigEvent[] = []
    await createConfigService({
      configDir: firstConfigDir,
      defaultConfigPath: firstDefaultPath,
      files: injectedFiles,
      events: makeSink(firstEvents),
    }).initialize()
    expect(fileReads).toContain(firstDefaultPath)
    expect(await readFile(slotPath(firstConfigDir, 'active'), 'utf8')).toBe(
      encode(baseConfig(4)),
    )

    const secondRoot = await makeTemporaryDirectory()
    const secondConfigDir = join(secondRoot, 'config')
    const secondDefaultPath = join(secondRoot, 'default.json')
    await mkdir(secondConfigDir, { recursive: true })
    await writeFile(secondDefaultPath, encode(baseConfig(5)), 'utf8')
    const atomicPaths: string[] = []
    const injectedAtomicWriter: ConfigAtomicWriter = {
      async write(path, contents) {
        atomicPaths.push(path)
        await writeFile(path, contents, 'utf8')
      },
    }
    const secondEvents: ConfigEvent[] = []
    await createConfigService({
      configDir: secondConfigDir,
      defaultConfigPath: secondDefaultPath,
      atomicWriter: injectedAtomicWriter,
      events: makeSink(secondEvents),
    }).initialize()
    expect(atomicPaths).toEqual([
      slotPath(secondConfigDir, 'previous'),
      slotPath(secondConfigDir, 'active'),
      slotPath(secondConfigDir, 'draft'),
    ])
    expect(await readFile(slotPath(secondConfigDir, 'draft'), 'utf8')).toBe(
      encode(baseConfig(5)),
    )
  })

  const directFallbackCases: Array<{
    slot: 'draft' | 'previous'
    failure: SlotFailure
    errorCode: string
    cause: string
  }> = [
    { slot: 'draft', failure: 'missing', errorCode: 'config_slot_missing', cause: 'missing' },
    { slot: 'draft', failure: 'invalid', errorCode: 'config_slot_invalid', cause: 'invalid' },

    { slot: 'draft', failure: 'unreadable', errorCode: 'config_slot_unreadable', cause: 'unreadable' },
    { slot: 'previous', failure: 'missing', errorCode: 'config_slot_missing', cause: 'missing' },
    { slot: 'previous', failure: 'invalid', errorCode: 'config_slot_invalid', cause: 'invalid' },
    { slot: 'previous', failure: 'unreadable', errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ]

  it.each(directFallbackCases)(
    'falls back from $slot when the physical slot is $failure',
    async ({ slot, failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      const active = baseConfig(7)
      const draft = baseConfig(7)
      const previous = baseConfig(7)
      seedSlots(harness, 'mock-config', active, draft, previous)
      applyFailure(harness, slotPath('mock-config', slot), failure)

      const result = await harness.service().read()

      expect(result.active).toEqual(active)
      expect(result[slot]).toEqual(active)
      expectEvent(
        harness.events,
        'config_recovered',
        'degraded',
        'slot=' + slot + ';source=active;action=use_active;cause=' + cause,
        errorCode,
      )
    },
  )

  it.each([
    { failure: 'missing' as const, errorCode: 'config_slot_missing', cause: 'missing' },
    { failure: 'invalid' as const, errorCode: 'config_slot_invalid', cause: 'invalid' },
    { failure: 'unreadable' as const, errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ])(
    'falls back from physical Active to physical Previous when Active is $failure',
    async ({ failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      const previous = baseConfig(6)
      seedSlots(harness, 'mock-config', baseConfig(7), baseConfig(7), previous)
      applyFailure(harness, slotPath('mock-config', 'active'), failure)

      const result = await harness.service().read()

      expect(result.active).toEqual(previous)
      expect(result.previous).toEqual(previous)
      expectEvent(
        harness.events,
        'config_recovered',
        'degraded',
        'slot=active;source=previous;action=use_previous;cause=' + cause,
        errorCode,
      )
    },
  )

  it.each([
    { failure: 'missing' as const, errorCode: 'config_slot_missing', cause: 'missing' },
    { failure: 'invalid' as const, errorCode: 'config_slot_invalid', cause: 'invalid' },
    { failure: 'unreadable' as const, errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ])(
    'falls back from unavailable Active and Previous to the versioned default for Active $failure',
    async ({ failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      const defaultConfig = baseConfig(3)
      seedSlots(harness, 'mock-config', baseConfig(7), baseConfig(7), baseConfig(7))
      applyFailure(harness, slotPath('mock-config', 'active'), failure)
      applyFailure(harness, slotPath('mock-config', 'previous'), 'missing')
      harness.store.set('mock-default', encode(defaultConfig))

      const result = await harness.service().read()

      expect(result.active).toEqual(defaultConfig)
      expect(result.previous).toEqual(defaultConfig)
      expectEvent(
        harness.events,
        'config_recovered',
        'degraded',
        'slot=active;source=default;action=use_default;cause=' + cause,
        errorCode,
      )
    },
  )

  it('fails visibly when Active, Previous, and the default have no valid core', async () => {
    const harness = makeMemoryHarness()
    const invalid = JSON.stringify({ ...baseConfig(1), configVersion: 0 })
    harness.store.set(slotPath('mock-config', 'active'), invalid)
    harness.store.set(slotPath('mock-config', 'previous'), invalid)
    harness.store.set(slotPath('mock-config', 'draft'), encode(baseConfig(7)))
    harness.store.set('mock-default', invalid)

    let caught: unknown
    try {
      await harness.service().read()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConfigServiceError)

    expect((caught as ConfigServiceError).code).toBe('config_default_invalid')
    expect((caught as ConfigServiceError).fields).toEqual([
      { path: 'configVersion', message: 'too_small' },
    ])
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=read;slot=active;action=read;cause=schema_invalid;issue_count=1',
      'config_default_invalid',
    )
  })

  it('degrades malformed auxiliary containers without blocking the valid core', async () => {
    const harness = makeMemoryHarness()
    const malformed = baseConfig(7)
    malformed.spells = null as unknown as unknown[]
    malformed.scenes = [
      { id: 'mock-scene-valid', enabled: true, cues: [] },
      { id: 7, enabled: true, cues: [] },
    ]
    seedSlots(harness, 'mock-config', malformed, malformed, malformed)

    const result = await harness.service().read()

    expect(result.active.voice).toBe('mock-voice-v1')
    expect(result.active.spells).toEqual([])
    expect(result.active.scenes).toEqual([
      { id: 'mock-scene-valid', enabled: true, cues: [] },
      { id: 'disabled-scene-1', enabled: false, cues: [] },
    ])
    expectEvent(
      harness.events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=active;field=spells;index=container;action=empty;cause=not_array',
      'config_spell_container_invalid',
    )
    expectEvent(
      harness.events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=active;field=scenes;index=1;action=disabled;cause=schema_invalid',
      'config_scene_entry_invalid',
    )
  })

  it('maps malformed spell entries to disabled envelopes and preserves valid future fields', async () => {
    const harness = makeMemoryHarness()
    const malformed = baseConfig(7)
    malformed.spells = [
      {
        id: 'mock-spell-valid',
        phrase: 'mock-spell-phrase-valid',
        sceneId: 'mock-scene-1',
        enabled: true,
        futureField: 'mock-future-v1',
      },
      { id: 3, phrase: '', sceneId: '', enabled: 'yes' },
    ]
    seedSlots(harness, 'mock-config', malformed, malformed, malformed)

    const result = await harness.service().read()

    expect(result.active.spells).toEqual([
      {
        id: 'mock-spell-valid',
        phrase: 'mock-spell-phrase-valid',
        sceneId: 'mock-scene-1',
        enabled: true,
        futureField: 'mock-future-v1',
      },
      {
        id: 'disabled-spell-1',
        phrase: '',
        sceneId: '',
        enabled: false,
      },
    ])
    expectEvent(
      harness.events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=active;field=spells;index=1;action=disabled;cause=schema_invalid',
      'config_spell_entry_invalid',
    )
  })

  it('saves a Draft at the current Active revision and writes only draft.json', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    seedSlots(harness, 'mock-config', active)
    const beforeActive = harness.store.get(slotPath('mock-config', 'active'))
    const beforePrevious = harness.store.get(slotPath('mock-config', 'previous'))
    const candidate = baseConfig(999)
    candidate.voice = 'mock-voice-v2'
    candidate.aiModels.realtimeDialogue.modelId = 'mock-realtime-dialogue-v2'

    const saved = await harness.service().saveDraft(candidate)


    expect(saved.configVersion).toBe(7)
    expect(saved.voice).toBe('mock-voice-v2')
    expect(harness.store.get(slotPath('mock-config', 'active'))).toBe(beforeActive)
    expect(harness.store.get(slotPath('mock-config', 'previous'))).toBe(beforePrevious)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'draft')) as string)).toMatchObject({
      configVersion: 7,
      voice: 'mock-voice-v2',
    })
    expect(harness.writer.writePaths).toEqual([slotPath('mock-config', 'draft')])
    expectEvent(
      harness.events,
      'config_draft_saved',
      'success',
      'operation=save_draft;slot=draft;config_version=7',
    )
  })

  it('rejects malformed core Draft input with safe fields and an issue count', async () => {
    const harness = makeMemoryHarness()
    seedSlots(harness, 'mock-config', baseConfig(7))
    const candidate = { ...baseConfig(7), voice: '' }

    let caught: unknown
    try {
      await harness.service().saveDraft(candidate)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConfigServiceError)
    expect((caught as ConfigServiceError).code).toBe('config_schema_invalid')
    expect((caught as ConfigServiceError).fields).toEqual([
      { path: 'voice', message: 'too_small' },
    ])
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=save_draft;slot=draft;action=reject;cause=schema_invalid;issue_count=1',
      'config_schema_invalid',
    )
  })

  it('reports a Draft write failure without exposing the adapter error', async () => {
    const harness = makeMemoryHarness()
    seedSlots(harness, 'mock-config', baseConfig(7))
    harness.writer.failWrites.add(1)

    let caught: unknown
    try {
      await harness.service().saveDraft(baseConfig(7))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConfigServiceError)
    expect((caught as ConfigServiceError).code).toBe('config_write_failed')
    expect((caught as Error).message).toBe('Config operation failed')
    expect(Object.prototype.hasOwnProperty.call(caught, 'cause')).toBe(false)
    expect(String(caught)).not.toContain('synthetic-write-adapter-detail')
    expect(JSON.stringify(harness.events)).not.toContain('synthetic-write-adapter-detail')
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=save_draft;slot=draft;action=reject;cause=io_failure',
      'config_write_failed',
    )
  })

  it('computes deterministic model and non-model diffs, including array paths', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    const draft = baseConfig(7)
    draft.aiModels.realtimeDialogue.modelId = 'mock-realtime-dialogue-v2'
    draft.voice = 'mock-voice-v2'
    draft.scenes = [{ id: 'mock-scene-1', enabled: true, cues: ['mock-cue-v2'] }]
    seedSlots(harness, 'mock-config', active, draft, active)

    const diff = await harness.service().diff('active', 'draft')

    const expected: ConfigDiff = {
      changed: [
        {
          path: 'aiModels.realtimeDialogue.modelId',
          from: 'mock-realtime-dialogue-v1',
          to: 'mock-realtime-dialogue-v2',
        },
        {
          path: 'scenes[0].cues[0]',
          from: 'mock-cue-v1',
          to: 'mock-cue-v2',
        },
        {
          path: 'voice',
          from: 'mock-voice-v1',
          to: 'mock-voice-v2',
        },
      ],
      nonModelChanges: true,

    }
    expect(diff).toEqual(expected)
    expectEvent(
      harness.events,
      'config_diff_computed',
      'info',
      'operation=diff;from=active;to=draft;changed_count=3;non_model_changes=true',
    )
  })

  it('marks model-only and empty diffs as non-model false', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    const modelDraft = baseConfig(7)
    modelDraft.aiModels.memoryExtractor.modelId = 'mock-memory-extractor-v2'
    seedSlots(harness, 'mock-config', active, modelDraft, active)

    expect(await harness.service().diff('active', 'draft')).toEqual({
      changed: [
        {
          path: 'aiModels.memoryExtractor.modelId',
          from: 'mock-memory-extractor-v1',
          to: 'mock-memory-extractor-v2',
        },
      ],
      nonModelChanges: false,
    })
    expect(await harness.service().diff('active', 'active')).toEqual({
      changed: [],
      nonModelChanges: false,
    })
    expectEvent(
      harness.events,
      'config_diff_computed',
      'info',
      'operation=diff;from=active;to=active;changed_count=0;non_model_changes=false',
    )
  })

  it('publishes a deterministic revision and keeps the old Active as Previous', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    const draft = baseConfig(7)
    draft.voice = 'mock-voice-v2'
    seedSlots(harness, 'mock-config', active, draft, active)

    const published = await harness.service().publish()

    expect(published.configVersion).toBe(8)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'previous')) as string)).toEqual(active)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'active')) as string)).toEqual({
      ...draft,
      configVersion: 8,
    })
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'draft')) as string)).toEqual({
      ...draft,
      configVersion: 8,
    })
    expect(harness.writer.writePaths.slice(-3)).toEqual([
      slotPath('mock-config', 'previous'),
      slotPath('mock-config', 'active'),
      slotPath('mock-config', 'draft'),
    ])
    expectEvent(
      harness.events,
      'config_published',
      'success',
      'operation=publish;active_version=8;previous_version=7',
    )
  })

  it('rejects a publish revision at Number.MAX_SAFE_INTEGER without writing', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(Number.MAX_SAFE_INTEGER)
    seedSlots(harness, 'mock-config', active)
    const before = new Map(harness.store)

    let caught: unknown
    try {
      await harness.service().publish()
    } catch (error) {
      caught = error
    }

    expect((caught as ConfigServiceError).code).toBe('config_revision_exhausted')
    expect(harness.writer.writePaths).toEqual([])
    expect(harness.store).toEqual(before)
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=publish;slot=all;action=reject;cause=revision_exhausted',
      'config_revision_exhausted',
    )
  })

  const transactionCases: Array<{ operation: 'publish' | 'rollback'; name: string }> = [
    { operation: 'publish', name: 'publish' },
    { operation: 'rollback', name: 'rollback' },
  ]


  it.each(transactionCases)(
    '$name restores exact bytes and absence after a one-shot transaction failure',
    async ({ operation }) => {
      const harness = makeMemoryHarness()
      const active = baseConfig(8)
      const draft = baseConfig(8)
      const previous = operation === 'rollback' ? baseConfig(7) : null
      seedSlots(harness, 'mock-config', active, draft, previous)
      const before = new Map(harness.store)
      harness.writer.failWrites.add(2)

      let caught: unknown
      try {
        if (operation === 'publish') await harness.service().publish()
        else await harness.service().rollback()
      } catch (error) {
        caught = error
      }

      expect((caught as ConfigServiceError).code).toBe('config_write_failed')
      for (const slot of ['active', 'draft', 'previous'] as const) {
        const path = slotPath('mock-config', slot)
        if (!before.has(path)) expect(harness.store.has(path)).toBe(false)
        else expect(harness.store.get(path)).toBe(before.get(path))
      }
      if (operation === 'publish') {
        expect(harness.removePaths).toContain(slotPath('mock-config', 'previous'))
      } else {
        expect(harness.removePaths).toEqual([])
      }
      expectEvent(
        harness.events,
        'config_operation_failed',
        'failed',
        'operation=' + operation + ';slot=all;action=failed;cause=io_failure',
        'config_write_failed',
      )
      expectEvent(
        harness.events,
        'config_transaction_compensated',
        'info',
        'operation=' + operation + ';action=restore;cause=io_failure',
      )
      expect(JSON.stringify(harness.events)).not.toContain('synthetic-write-adapter-detail')
    },
  )

  it('reports a distinct compensation failure when restoration itself fails', async () => {
    const harness = makeMemoryHarness()
    seedSlots(harness, 'mock-config', baseConfig(8), baseConfig(8), baseConfig(7))
    harness.writer.failWrites.add(2)
    harness.writer.failWrites.add(4)

    let caught: unknown
    try {
      await harness.service().publish()
    } catch (error) {
      caught = error
    }

    expect((caught as ConfigServiceError).code).toBe('config_compensation_failed')
    expect((caught as Error).message).toBe('Config operation failed')
    expect(Object.prototype.hasOwnProperty.call(caught, 'cause')).toBe(false)
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=publish;slot=all;action=failed;cause=io_failure',
      'config_write_failed',
    )
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=publish;slot=all;action=restore;cause=compensation_failure',
      'config_compensation_failed',
    )
    expect(harness.events.some((event) => event.event === 'config_transaction_compensated')).toBe(false)
  })

  const physicalPreviousCases: Array<{
    failure: SlotFailure
    errorCode: string
    cause: string
  }> = [
    { failure: 'missing', errorCode: 'config_slot_missing', cause: 'missing' },
    { failure: 'invalid', errorCode: 'config_slot_invalid', cause: 'invalid' },
    { failure: 'unreadable', errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ]

  it.each(physicalPreviousCases)(
    'rejects rollback when the physical Previous is $failure instead of using read fallback',
    async ({ failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      seedSlots(harness, 'mock-config', baseConfig(8), baseConfig(8), baseConfig(7))
      applyFailure(harness, slotPath('mock-config', 'previous'), failure)

      let caught: unknown
      try {
        await harness.service().rollback()
      } catch (error) {
        caught = error
      }


      expect((caught as ConfigServiceError).code).toBe('config_previous_unavailable')
      expect(harness.writer.writePaths).toEqual([])
      expectEvent(
        harness.events,
        'config_operation_failed',
        'failed',
        'operation=rollback;slot=previous;action=reject;cause=' + cause,
        'config_previous_unavailable',
      )
      expect(errorCode).toMatch(/^config_slot_/)
    },
  )

  it('rolls back from physical Previous with the next deterministic revision', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(8)
    const previous = baseConfig(7)
    previous.voice = 'mock-voice-previous-v1'
    seedSlots(harness, 'mock-config', active, active, previous)

    const rolledBack = await harness.service().rollback()

    expect(rolledBack).toEqual({ ...previous, configVersion: 9 })
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'previous')) as string)).toEqual(active)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'active')) as string)).toEqual({
      ...previous,
      configVersion: 9,
    })
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'draft')) as string)).toEqual({
      ...previous,
      configVersion: 9,
    })
    expectEvent(
      harness.events,
      'config_rolled_back',
      'success',
      'operation=rollback;active_version=9;previous_version=8',
    )
  })

  it('rejects rollback revision exhaustion before any write', async () => {
    const harness = makeMemoryHarness()
    seedSlots(
      harness,
      'mock-config',
      baseConfig(Number.MAX_SAFE_INTEGER),
      baseConfig(Number.MAX_SAFE_INTEGER),
      baseConfig(7),
    )

    let caught: unknown
    try {
      await harness.service().rollback()
    } catch (error) {
      caught = error
    }

    expect((caught as ConfigServiceError).code).toBe('config_revision_exhausted')
    expect(harness.writer.writePaths).toEqual([])
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=rollback;slot=all;action=reject;cause=revision_exhausted',
      'config_revision_exhausted',
    )
  })
})
