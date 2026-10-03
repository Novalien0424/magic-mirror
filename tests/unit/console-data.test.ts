import { describe, expect, it, vi } from 'vitest'

import {
  createConsoleDataPlane,
  resolveDeveloperMode,
} from '../../src/main/console-data'
import type {
  AppSnapshot,
  IdentityStatus,
  MirrorEvent,
  ModuleId,
  ModuleStatus,
  SimulatorResult,
} from '../../src/shared/types'

const TEST_TRANSCRIPT_SENTINEL = '__TEST_TRANSCRIPT_SENTINEL__'
const TEST_AUDIO_SENTINEL = '__TEST_AUDIO_SENTINEL__'
const TEST_PRIVATE_MEMORY_SENTINEL = '__TEST_PRIVATE_MEMORY_SENTINEL__'
const TEST_CREDENTIAL_SENTINEL = '__TEST_CREDENTIAL_SENTINEL__'
const TEST_IMAGE_SENTINEL = '__TEST_IMAGE_SENTINEL__'
const TEST_EMBEDDING_SENTINEL = '__TEST_EMBEDDING_SENTINEL__'
const TEST_CONFIGURED_VALUE_SENTINEL = '__TEST_CONFIGURED_VALUE_SENTINEL__'

const PRIVACY_SENTINELS = [
  TEST_TRANSCRIPT_SENTINEL,
  TEST_AUDIO_SENTINEL,
  TEST_PRIVATE_MEMORY_SENTINEL,
  TEST_CREDENTIAL_SENTINEL,
  TEST_IMAGE_SENTINEL,
  TEST_EMBEDDING_SENTINEL,
  TEST_CONFIGURED_VALUE_SENTINEL,
] as const

const MODULE_IDS: readonly ModuleId[] = [
  'app',
  'openai',
  'wake',
  'audio',
  'camera',
  'identity',
  'memory',
  'avatar',
  'lighting',
  'fog',
  'music',
  'sqlite',
  'config',
  'telemetry',
]

const EVENT_SUMMARY_KEYS = new Set([
  'time',
  'module',
  'event',
  'status',
  'duration_ms',
  'error_code',
  'session_id',
  'scene_id',
  'reason',
  'source',
])

const FORBIDDEN_OUTPUT_KEY = /^(?:activeProfileId|candidateProfileId|guestId|profileId|modelId|credentials?|rawException|transcript|audio|privateContext|image|embedding|configuredValue)$/i

interface KeyPath {
  readonly key: string
  readonly path: readonly string[]
}

function collectKeyPaths(
  value: unknown,
  path: readonly string[] = [],
  keys: KeyPath[] = [],
): KeyPath[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeyPaths(item, [...path, '[]'], keys)
    return keys
  }
  if (typeof value !== 'object' || value === null) return keys
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key]
    keys.push({ key, path: childPath })
    collectKeyPaths(child, childPath, keys)
  }
  return keys
}

function expectMetadataOnly(value: unknown): void {
  const serialized = JSON.stringify(value) ?? ''
  for (const sentinel of PRIVACY_SENTINELS) {
    expect(serialized).not.toContain(sentinel)
  }
  expect(collectKeyPaths(value).some(({ key, path }) => (
    FORBIDDEN_OUTPUT_KEY.test(key)
    && !(key === 'audio' && path.length === 2 && path[0] === 'modules' && path[1] === 'audio')
  ))).toBe(false)
}

function makeSnapshot(): Record<string, unknown> {
  const modules = Object.fromEntries(
    MODULE_IDS.map((module) => [module, module === 'camera' ? 'degraded' : 'ready']),
  ) as Record<ModuleId, ModuleStatus>

  return {
    lifecycle: 'active',
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    configVersion: 7,
    modules,
    identityStatus: 'unassigned' satisfies IdentityStatus,
    realtimeSessionId: 'session-metadata-1',
    sessionGeneration: 3,
    lastError: null,
    maintenance: null,
    activeProfileId: TEST_PRIVATE_MEMORY_SENTINEL,
    guestId: TEST_PRIVATE_MEMORY_SENTINEL,
    candidateProfileId: TEST_PRIVATE_MEMORY_SENTINEL,
    profileId: TEST_PRIVATE_MEMORY_SENTINEL,
    modelId: TEST_CONFIGURED_VALUE_SENTINEL,
    credentials: TEST_CREDENTIAL_SENTINEL,
    transcript: TEST_TRANSCRIPT_SENTINEL,
    audio: TEST_AUDIO_SENTINEL,
    privateContext: TEST_PRIVATE_MEMORY_SENTINEL,
    image: TEST_IMAGE_SENTINEL,
    embedding: TEST_EMBEDDING_SENTINEL,
    configuredValue: TEST_CONFIGURED_VALUE_SENTINEL,
  }
}

function makeTelemetryPage(): readonly MirrorEvent[] {
  return [
    {
      time: '2026-08-19T00:00:01.000Z',
      module: 'camera',
      event: 'camera_probe',
      status: 'success',
      duration_ms: 12,
      session_id: 'session-metadata-1',
      source: 'simulator',
      transcript: TEST_TRANSCRIPT_SENTINEL,
      privateContext: TEST_PRIVATE_MEMORY_SENTINEL,
    },
    {
      time: '2026-08-19T00:00:02.000Z',
      module: 'camera',
      event: 'camera_probe_failed',
      status: 'failed',
      error_code: 'camera_probe_failed',
      reason: 'probe_failed',
      source: 'runtime',
      rawException: TEST_CREDENTIAL_SENTINEL,
      profileId: TEST_PRIVATE_MEMORY_SENTINEL,
    },
    {
      time: '2026-08-19T00:00:03.000Z',
      module: 'camera',
      event: 'camera_mock_fallback',
      status: 'degraded',
      scene_id: 'scene-metadata-1',
      reason: 'mock_fallback',
      source: 'simulator',
      configuredValue: TEST_CONFIGURED_VALUE_SENTINEL,
      audio: TEST_AUDIO_SENTINEL,
    },
  ] as unknown as readonly MirrorEvent[]
}

function makePlane(
  developerMode: boolean,
  runtimeResult: SimulatorResult = { op: 'success' },
): {
  plane: ReturnType<typeof createConsoleDataPlane>
  snapshot: Record<string, unknown>
  readPage: ReturnType<typeof vi.fn>
  handleSimulator: ReturnType<typeof vi.fn>
  emitted: Array<Record<string, unknown>>
} {
  const snapshot = makeSnapshot()
  const emitted: Array<Record<string, unknown>> = []
  const readPage = vi.fn((_request?: unknown) => ({
    events: makeTelemetryPage(),
    nextBeforeSequence: 17,
  }))
  const emit = vi.fn((event: unknown) => {
    if (typeof event === 'object' && event !== null && !Array.isArray(event)) {
      emitted.push({ ...(event as Record<string, unknown>) })
    }
  })
  const handleSimulator = vi.fn(async (_command: unknown) => runtimeResult)

  const plane = createConsoleDataPlane({
    getSnapshot: () => snapshot as unknown as AppSnapshot,
    getTelemetry: () => ({ readPage, emit }),
    getDeveloperMode: () => ({
      enabled: developerMode,
      source: 'packaging_default',
    }),
    getStartedAt: () => Date.now(),
    handleSimulator,
  })

  return { plane, snapshot, readPage, handleSimulator, emitted }
}

describe('Phase 0 Task 9 Gate 9A.1 Console data RED contract', () => {
  it('defaults Developer Mode from unpackaged versus packaged Main state', () => {
    const sink = vi.fn()

    expect(resolveDeveloperMode(false, undefined, sink)).toEqual({
      enabled: true,
      source: 'packaging_default',
    })
    expect(resolveDeveloperMode(true, undefined, sink)).toEqual({
      enabled: false,
      source: 'packaging_default',
    })
    expect(sink).not.toHaveBeenCalled()
  })

  it('accepts only the bounded startup override and records invalid override metadata', () => {
    const events: Array<Record<string, unknown>> = []
    const sink = (event: Omit<MirrorEvent, 'time'>): void => {
      events.push({ ...event })
    }

    expect(resolveDeveloperMode(true, 'enabled', sink)).toEqual({
      enabled: true,
      source: 'startup_override',
    })
    expect(resolveDeveloperMode(false, 'disabled', sink)).toEqual({
      enabled: false,
      source: 'startup_override',
    })
    expect(resolveDeveloperMode(false, 'ENABLED', sink)).toEqual({
      enabled: true,
      source: 'packaging_default',
    })
    expect(resolveDeveloperMode(false, TEST_CONFIGURED_VALUE_SENTINEL, sink)).toEqual({
      enabled: true,
      source: 'packaging_default',
    })

    expect(events.at(-1)).toEqual(expect.objectContaining({
      event: 'developer_mode_override_invalid',
      reason: 'cause=payload_schema_invalid',
    }))
    expectMetadataOnly(events)
  })

  it('projects every module as observational mock health with explicit unverified TCC', () => {
    const harness = makePlane(true)
    const result = harness.plane.getOverview()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.value.modules).sort()).toEqual([...MODULE_IDS].sort())
      expect(Object.values(result.value.modules).every((card) => card.readiness === 'mock')).toBe(true)
      expect(result.value.modules.camera.status).toBe('degraded')
      expect(result.value.lifecycle).toBe('active')
      expect(result.value.identityStatus).toBe('unassigned')
      expect([
        'unassigned',
        'confirming',
        'active',
        'anonymous',
        'group',
      ]).toContain(result.value.identityStatus)
      expect(result.value.realtimeSessionId).toBe('session-metadata-1')
      expect(result.value.audioTcc).toBe('not_checked')
      expect(result.value.cameraTcc).toBe('not_checked')
      expect(result.value.modules.camera.lastSuccess).toEqual(expect.objectContaining({
        event: 'camera_probe',
        source: 'simulator',
        session_id: 'session-metadata-1',
      }))
      expect(result.value.modules.camera.lastError).toEqual(expect.objectContaining({
        event: 'camera_probe_failed',
        error_code: 'camera_probe_failed',
      }))
      expect(result.value.modules.camera.lastFallback).toEqual(expect.objectContaining({
        event: 'camera_mock_fallback',
        reason: 'mock_fallback',
      }))
      expect(harness.readPage).toHaveBeenCalledTimes(1)
      expect(harness.readPage).toHaveBeenCalledWith({ limit: 200 })
      expectMetadataOnly(result.value)
    }
  })

  it('validates bounded event pagination and forwards only accepted filters', () => {
    const harness = makePlane(true)
    const query = {
      limit: 2,
      beforeSequence: 9,
      module: 'camera',
      status: 'failed',
      source: 'simulator',
    } as const

    const result = harness.plane.getEvents(query)

    expect(harness.readPage).toHaveBeenCalledWith(query)
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ nextBeforeSequence: 17 }),
    })
    if (result.ok) {
      expect(result.value.events.every((event) => (
        Object.keys(event).every((key) => EVENT_SUMMARY_KEYS.has(key))
      ))).toBe(true)
      expect(result.value.events[0]).toEqual(expect.objectContaining({
        session_id: 'session-metadata-1',
      }))
      expectMetadataOnly(result.value)
    }

    harness.readPage.mockClear()
    expect(harness.plane.getEvents({
      limit: 1,
      beforeSequence: 0,
      module: 'app',
      status: 'info',
      source: 'runtime',
    }).ok).toBe(true)
    expect(harness.plane.getEvents({
      limit: 200,
      beforeSequence: Number.MAX_SAFE_INTEGER,
      module: 'telemetry',
      status: 'success',
      source: 'contract_test',
    }).ok).toBe(true)
    expect(harness.readPage).toHaveBeenCalledTimes(2)

    harness.readPage.mockClear()
    const acceptedUndefined = harness.plane.getEvents(undefined)
    expect(acceptedUndefined.ok).toBe(true)
    expect(harness.readPage).toHaveBeenCalledTimes(1)

    harness.readPage.mockClear()
    const invalid = harness.plane.getEvents({ limit: 201 })
    expect(invalid).toMatchObject({
      ok: false,
      error: 'console_events_query_invalid',
      reason: 'cause=query_bounds_invalid',
    })
    expect(harness.readPage).not.toHaveBeenCalled()
    expect(harness.emitted).toContainEqual(expect.objectContaining({
      event: 'console_events_query_invalid',
      reason: 'cause=query_bounds_invalid',
    }))
    expectMetadataOnly({ result, acceptedUndefined, invalid, events: harness.emitted })
  })

  it('rejects unknown and malformed event query fields with stable visible failures', () => {
    const harness = makePlane(true)
    const invalidQueries: readonly unknown[] = [
      { unexpected: TEST_PRIVATE_MEMORY_SENTINEL },
      { limit: 0 },
      { limit: 1.5 },
      { beforeSequence: -1 },
      { beforeSequence: Number.MAX_SAFE_INTEGER + 1 },
      { module: 'not-a-module' },
      { status: 'not-a-status' },
      { source: 'not-a-source' },
    ]

    for (const query of invalidQueries) {
      harness.readPage.mockClear()
      const result = harness.plane.getEvents(query)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('console_events_query_invalid')
        expect([
          'cause=payload_schema_invalid',
          'cause=query_bounds_invalid',
        ]).toContain(result.reason)
      }
      expect(harness.readPage).not.toHaveBeenCalled()
    }

    expect(harness.emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'console_events_query_invalid',
        reason: 'cause=payload_schema_invalid',
      }),
      expect.objectContaining({
        event: 'console_events_query_invalid',
        reason: 'cause=query_bounds_invalid',
      }),
    ]))
    expectMetadataOnly(harness.emitted)
  })

  it('keeps disabled simulation in the authoritative result shape and emits a reason', async () => {
    const harness = makePlane(false)
    const snapshotBefore = JSON.stringify(harness.snapshot)

    const result = await harness.plane.simulate({ type: 'wake' })

    expect(result).toEqual({ op: 'degraded' })
    expect(Object.keys(result)).toEqual(['op'])
    expect(harness.handleSimulator).not.toHaveBeenCalled()
    expect(JSON.stringify(harness.snapshot)).toBe(snapshotBefore)
    expect(harness.emitted).toContainEqual(expect.objectContaining({
      event: 'simulator_command_ignored',
      source: 'simulator',
      reason: 'cause=developer_mode_disabled',
    }))
    expectMetadataOnly({ result, events: harness.emitted })
  })

  it('delegates enabled simulation without inventing a command or result field', async () => {
    const runtimeResult: SimulatorResult = {
      op: 'success',
      lifecycleEvent: 'WAKE_DETECTED',
    }
    const harness = makePlane(true, runtimeResult)
    const command = { type: 'wake' } as const

    const result = await harness.plane.simulate(command)

    expect(harness.handleSimulator).toHaveBeenCalledWith(command)
    expect(result).toEqual(runtimeResult)
    expect(Object.keys(result).sort()).toEqual(['lifecycleEvent', 'op'])
    expect(JSON.stringify(result)).not.toContain('realtime_ready')
    expectMetadataOnly(result)
  })
})
