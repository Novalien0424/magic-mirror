import { describe, expect, it } from 'vitest'
import type { MirrorEvent, ModuleId, ModuleStatus } from '../../src/shared/types'
import {
  DEFAULT_MODULE_STATUSES,
  MODULE_IDS,
  ModuleRegistryError,
  createModuleRegistry,
  type ModuleAdapter,
  type ModuleEventSink,
  type ModuleEventSource,
  type ModuleProbeResult,
  type ModuleRegistry,
  type ModuleRegistryErrorCode,
} from '../../src/main/module-registry'
import {
  createMockModuleFactory,
  type MockModuleAdapter,
  type MockProbeOutcome,
} from '../../src/main/module-mocks'

const EXPECTED_MODULE_IDS = [
  'app', 'openai', 'wake', 'audio', 'camera', 'identity', 'memory',
  'avatar', 'lighting', 'fog', 'music', 'sqlite', 'config', 'telemetry',
] as const

const STABLE_REGISTRY_ERROR_MESSAGE = 'Module registry configuration is invalid'
const RAW_SYNC_ERROR_SENTINEL = 'opaque-sync-probe-error-sentinel'
const RAW_ASYNC_ERROR_SENTINEL = 'opaque-async-probe-error-sentinel'
const RAW_SINK_THROW_SENTINEL = 'opaque-sink-throw-error-sentinel'
const RAW_SINK_REJECTION_SENTINEL = 'opaque-sink-rejection-error-sentinel'
const INVALID_PROBE_SENTINEL = 'opaque-invalid-probe-sentinel'
const PRIVATE_FIELD_SENTINEL = 'opaque-private-field-sentinel'
const INVALID_INPUT_SENTINEL = 'opaque-invalid-input-sentinel'

const FORBIDDEN_CONTENT_KEYS = [
  'transcript',
  'audio',
  'prompt',
  'private_context',
  'memory_value',
  'image',
  'frame',
  'embedding',
  'credential',
  'credentials',
  'model',
  'modelId',
] as const

type CapturedEvent = Omit<MirrorEvent, 'time'>

function capture(events: CapturedEvent[]): ModuleEventSink {
  return {
    emit(event) {
      events.push({ ...event })
    },
  }
}

function captureWithFreeze(events: CapturedEvent[]): {
  sink: ModuleEventSink
  wasFrozen: () => boolean
} {
  let lastEventWasFrozen = false
  return {
    sink: {
      emit(event) {
        lastEventWasFrozen = Object.isFrozen(event)
        events.push({ ...event })
      },
    },
    wasFrozen: () => lastEventWasFrozen,
  }
}

function makeRegistry(
  events: CapturedEvent[],
  options: {
    source?: ModuleEventSource
    adapters?: readonly ModuleAdapter[]
  } = {},
): ModuleRegistry {
  return createModuleRegistry({ events: capture(events), ...options })
}

function makeCountedAdapter(adapter: ModuleAdapter): {
  adapter: ModuleAdapter
  calls: () => number
} {
  let callCount = 0
  return {
    adapter: {
      id: adapter.id,
      initialStatus: adapter.initialStatus,
      probe: () => {
        callCount += 1
        return adapter.probe()
      },
    },
    calls: () => callCount,
  }
}

function makeLocalAdapter(
  id: ModuleId,
  initialStatus: ModuleStatus,
  probe: ModuleAdapter['probe'],
): ModuleAdapter {
  return { id, initialStatus, probe }
}

function makeInvalidAdapter(id: ModuleId, value: unknown): ModuleAdapter {
  const probe = (() => value) as unknown as ModuleAdapter['probe']
  return makeLocalAdapter(id, 'not_implemented', probe)
}

function captureThrown(operation: () => unknown): unknown {
  try {
    return operation()
  } catch (error) {
    return error
  }
}

function expectRegistryError(
  error: unknown,
  expectedCode: ModuleRegistryErrorCode,
): void {
  expect(error).toBeInstanceOf(ModuleRegistryError)
  const registryError = error as ModuleRegistryError
  expect(registryError.code).toBe(expectedCode)
  expect(registryError.message).toBe(STABLE_REGISTRY_ERROR_MESSAGE)
}

function expectNoOpaqueDiagnostics(
  value: unknown,
  sentinels: readonly string[],
): void {
  const serialized = JSON.stringify(value)
  for (const sentinel of sentinels) {
    expect(serialized).not.toContain(sentinel)
  }
}

function expectFrozenResult(result: ModuleProbeResult): void {
  expect(Object.isFrozen(result)).toBe(true)
  expect(['emitted', 'failed']).toContain(result.eventDelivery)
}

describe('Main-owned module registry and deterministic mock contract', () => {
  it('enumerates every ModuleId and initializes the runtime-exhaustive default record', () => {
    const events: CapturedEvent[] = []
    const registry = makeRegistry(events)
    const snapshot = registry.snapshot()

    expect(MODULE_IDS).toEqual(EXPECTED_MODULE_IDS)
    expect(Object.isFrozen(MODULE_IDS)).toBe(true)
    expect(DEFAULT_MODULE_STATUSES).toEqual(
      Object.fromEntries(EXPECTED_MODULE_IDS.map((module) => [module, 'not_implemented'])),
    )
    expect(Object.isFrozen(DEFAULT_MODULE_STATUSES)).toBe(true)
    expect(Object.keys(snapshot).sort()).toEqual([...EXPECTED_MODULE_IDS].sort())
    expect(Object.values(snapshot).every((status) => status === 'not_implemented')).toBe(true)
    expect(events).toEqual([])
  })

  it('applies each injected adapter initialStatus without probing or changing siblings', () => {
    const events: CapturedEvent[] = []
    const factory = createMockModuleFactory()
    const ready = makeCountedAdapter(factory.create('openai', { initialStatus: 'ready' }))
    const degraded = makeCountedAdapter(factory.create('wake', { initialStatus: 'degraded' }))
    const failed = makeCountedAdapter(factory.create('camera', { initialStatus: 'failed' }))
    const registry = makeRegistry(events, {
      adapters: [ready.adapter, degraded.adapter, failed.adapter],
    })
    const injected = new Set<ModuleId>(['openai', 'wake', 'camera'])

    expect(registry.getStatus('openai')).toBe('ready')
    expect(registry.getStatus('wake')).toBe('degraded')
    expect(registry.getStatus('camera')).toBe('failed')
    for (const module of EXPECTED_MODULE_IDS) {
      if (!injected.has(module)) expect(registry.getStatus(module)).toBe('not_implemented')
    }
    expect(ready.calls()).toBe(0)
    expect(degraded.calls()).toBe(0)
    expect(failed.calls()).toBe(0)
    expect(events).toEqual([])
  })

  it('rejects duplicate adapter IDs with a stable domain error and no partial registry', () => {
    const events: CapturedEvent[] = []
    const factory = createMockModuleFactory()
    const first = makeCountedAdapter(factory.create('audio'))
    const second = makeCountedAdapter(factory.create('audio'))
    let registry: ModuleRegistry | undefined
    const error = captureThrown(() => {
      registry = createModuleRegistry({
        events: capture(events),
        adapters: [first.adapter, second.adapter],
      })
    })

    expectRegistryError(error, 'module_adapter_duplicate')
    expect(registry).toBeUndefined()
    expect(first.calls()).toBe(0)
    expect(second.calls()).toBe(0)
    expect(events).toEqual([])
  })

  it('returns a stable missing result and one exact info metadata event', async () => {
    const events: CapturedEvent[] = []
    const registry = makeRegistry(events, { source: 'contract_test' })
    const before = registry.snapshot()

    const result = await registry.probe('wake')

    expect(result).toEqual({
      module: 'wake',
      eventDelivery: 'emitted',
      kind: 'missing',
      status: 'not_implemented',
      opStatus: 'info',
      reason: 'module_missing',
      errorCode: 'module_adapter_missing',
    })
    expectFrozenResult(result)
    expect(events).toEqual([{
      module: 'wake',
      event: 'module_probe',
      status: 'info',
      error_code: 'module_adapter_missing',
      reason: 'module_missing',
      source: 'contract_test',
    }])
    expect(registry.snapshot()).toEqual(before)
  })

  it('maps synchronous success to ready and probes only the selected module', async () => {
    const events: CapturedEvent[] = []
    const factory = createMockModuleFactory()
    const lighting = makeCountedAdapter(factory.create('lighting'))
    const fog = makeCountedAdapter(factory.create('fog'))
    const registry = makeRegistry(events, { adapters: [lighting.adapter, fog.adapter] })

    const result = await registry.probe('lighting')

    expect(result).toEqual({
      module: 'lighting',
      eventDelivery: 'emitted',
      kind: 'success',
      status: 'ready',
      opStatus: 'success',
      reason: 'probe_success',
    })
    expectFrozenResult(result)
    expect(lighting.calls()).toBe(1)
    expect(fog.calls()).toBe(0)
    expect(registry.getStatus('lighting')).toBe('ready')
    expect(registry.getStatus('fog')).toBe('not_implemented')
    expect(events).toEqual([{
      module: 'lighting',
      event: 'module_probe',
      status: 'success',
      reason: 'probe_success',
      source: 'runtime',
    }])
  })

  it('maps asynchronous degraded to degraded after Promise normalization', async () => {
    const events: CapturedEvent[] = []
    const adapter = makeLocalAdapter(
      'audio',
      'not_implemented',
      () => Promise.resolve('degraded' as const),
    )
    const registry = makeRegistry(events, { adapters: [adapter] })

    const result = await registry.probe('audio')

    expect(result).toEqual({
      module: 'audio',
      eventDelivery: 'emitted',
      kind: 'degraded',
      status: 'degraded',
      opStatus: 'degraded',
      reason: 'probe_degraded',
      errorCode: 'module_probe_degraded',
    })
    expectFrozenResult(result)
    expect(events).toEqual([{
      module: 'audio',
      event: 'module_probe',
      status: 'degraded',
      error_code: 'module_probe_degraded',
      reason: 'probe_degraded',
      source: 'runtime',
    }])
  })

  it('maps valid failed to failed without retry or sibling gating', async () => {
    const events: CapturedEvent[] = []
    const factory = createMockModuleFactory()
    const music = makeCountedAdapter(factory.create('music', { outcome: 'failed' }))
    const fog = makeCountedAdapter(factory.create('fog', { initialStatus: 'ready' }))
    const registry = makeRegistry(events, { adapters: [music.adapter, fog.adapter] })

    const result = await registry.probe('music')

    expect(result).toEqual({
      module: 'music',
      eventDelivery: 'emitted',
      kind: 'failed',
      status: 'failed',
      opStatus: 'failed',
      reason: 'probe_failed',
      errorCode: 'module_probe_failed',
    })
    expectFrozenResult(result)
    expect(music.calls()).toBe(1)
    expect(fog.calls()).toBe(0)
    expect(registry.getStatus('music')).toBe('failed')
    expect(registry.getStatus('fog')).toBe('ready')
    expect(events).toEqual([{
      module: 'music',
      event: 'module_probe',
      status: 'failed',
      error_code: 'module_probe_failed',
      reason: 'probe_failed',
      source: 'runtime',
    }])
  })

  it('maps synchronous and asynchronous throws to stable failed results', async () => {
    const events: CapturedEvent[] = []
    const synchronous = makeLocalAdapter('app', 'not_implemented', () => {
      throw new Error(RAW_SYNC_ERROR_SENTINEL)
    })
    const asynchronous = makeLocalAdapter(
      'openai',
      'not_implemented',
      () => Promise.reject(new Error(RAW_ASYNC_ERROR_SENTINEL)),
    )
    const registry = makeRegistry(events, { adapters: [synchronous, asynchronous] })

    const results = await Promise.all([
      registry.probe('app'),
      registry.probe('openai'),
    ])

    expect(results).toEqual([
      {
        module: 'app',
        eventDelivery: 'emitted',
        kind: 'throw',
        status: 'failed',
        opStatus: 'failed',
        reason: 'probe_threw',
        errorCode: 'module_probe_threw',
      },
      {
        module: 'openai',
        eventDelivery: 'emitted',
        kind: 'throw',
        status: 'failed',
        opStatus: 'failed',
        reason: 'probe_threw',
        errorCode: 'module_probe_threw',
      },
    ])
    for (const result of results) expectFrozenResult(result)
    expect(events).toEqual([
      {
        module: 'app',
        event: 'module_probe',
        status: 'failed',
        error_code: 'module_probe_threw',
        reason: 'probe_threw',
        source: 'runtime',
      },
      {
        module: 'openai',
        event: 'module_probe',
        status: 'failed',
        error_code: 'module_probe_threw',
        reason: 'probe_threw',
        source: 'runtime',
      },
    ])
    expectNoOpaqueDiagnostics(
      { results, events },
      [RAW_SYNC_ERROR_SENTINEL, RAW_ASYNC_ERROR_SENTINEL],
    )
  })

  it('maps null undefined unknown and object probe values to invalid without forwarding them', async () => {
    const invalidCases: Array<{
      module: ModuleId
      value: unknown
      forbidden: readonly string[]
    }> = [
      { module: 'app', value: null, forbidden: [] },
      { module: 'openai', value: undefined, forbidden: [] },
      { module: 'wake', value: 'info', forbidden: ['info'] },
      { module: 'audio', value: INVALID_PROBE_SENTINEL, forbidden: [INVALID_PROBE_SENTINEL] },
      {
        module: 'camera',
        value: { raw_error: PRIVATE_FIELD_SENTINEL },
        forbidden: ['raw_error', PRIVATE_FIELD_SENTINEL],
      },
    ]
    const events: CapturedEvent[] = []

    for (const invalidCase of invalidCases) {
      const registry = makeRegistry(events, {
        adapters: [makeInvalidAdapter(invalidCase.module, invalidCase.value)],
      })
      const result = await registry.probe(invalidCase.module)
      const event = events[events.length - 1]

      expect(result).toEqual({
        module: invalidCase.module,
        eventDelivery: 'emitted',
        kind: 'invalid',
        status: 'failed',
        opStatus: 'failed',
        reason: 'probe_invalid',
        errorCode: 'module_probe_invalid',
      })
      expectFrozenResult(result)
      expect(event).toEqual({
        module: invalidCase.module,
        event: 'module_probe',
        status: 'failed',
        error_code: 'module_probe_invalid',
        reason: 'probe_invalid',
        source: 'runtime',
      })
      expectNoOpaqueDiagnostics(result, invalidCase.forbidden)
      expectNoOpaqueDiagnostics(event, invalidCase.forbidden)
    }
  })

  it('changes only the probed module', async () => {
    const events: CapturedEvent[] = []
    const factory = createMockModuleFactory()
    const selected = makeCountedAdapter(factory.create('app', {
      initialStatus: 'ready',
      outcome: 'degraded',
    }))
    const openai = makeCountedAdapter(factory.create('openai', { initialStatus: 'degraded' }))
    const wake = makeCountedAdapter(factory.create('wake', { initialStatus: 'failed' }))
    const audio = makeCountedAdapter(factory.create('audio'))
    const registry = makeRegistry(events, {
      adapters: [selected.adapter, openai.adapter, wake.adapter, audio.adapter],
    })
    const before = registry.snapshot()

    expect(before.app).toBe('ready')
    const result = await registry.probe('app')
    const after = registry.snapshot()
    const changedModules = EXPECTED_MODULE_IDS.filter((module) => before[module] !== after[module])

    expect(result.kind).toBe('degraded')
    expect(result.status).toBe('degraded')
    expect(changedModules).toEqual(['app'])
    expect(selected.calls()).toBe(1)
    expect(openai.calls()).toBe(0)
    expect(wake.calls()).toBe(0)
    expect(audio.calls()).toBe(0)
    expect(after.openai).toBe('degraded')
    expect(after.wake).toBe('failed')
    expect(after.audio).toBe('not_implemented')
  })

  it('returns defensive frozen status snapshots and reports', async () => {
    const events: CapturedEvent[] = []
    const inspected = captureWithFreeze(events)
    const factory = createMockModuleFactory()
    const adapter = factory.create('app')
    const registry = createModuleRegistry({
      events: inspected.sink,
      adapters: [adapter],
    })
    const firstSnapshot = registry.snapshot()
    const secondSnapshot = registry.snapshot()

    expect(firstSnapshot).not.toBe(secondSnapshot)
    expect(Object.isFrozen(firstSnapshot)).toBe(true)
    expect(Object.isFrozen(secondSnapshot)).toBe(true)
    expect(Reflect.set(firstSnapshot, 'app', 'ready')).toBe(false)
    expect(registry.getStatus('app')).toBe('not_implemented')

    const result = await registry.probe('app')
    const laterSnapshot = registry.snapshot()

    expect(Object.isFrozen(result)).toBe(true)
    expect(Reflect.set(result, 'status', 'failed')).toBe(false)
    expect(Reflect.set(laterSnapshot, 'app', 'failed')).toBe(false)
    expect(registry.getStatus('app')).toBe('ready')
    expect(registry.snapshot().app).toBe('ready')
    expect(inspected.wasFrozen()).toBe(true)
  })

  it('isolates an event sink throw after committing the selected status', async () => {
    const thrownEvents: CapturedEvent[] = []
    const rejectedEvents: CapturedEvent[] = []
    const throwingSink: ModuleEventSink = {
      emit(event) {
        thrownEvents.push({ ...event })
        throw new Error(RAW_SINK_THROW_SENTINEL)
      },
    }
    const rejectedSink: ModuleEventSink = {
      emit(event) {
        rejectedEvents.push({ ...event })
        return Promise.reject(new Error(RAW_SINK_REJECTION_SENTINEL))
      },
    }
    const firstAdapter = createMockModuleFactory().create('app')
    const secondAdapter = createMockModuleFactory().create('app')
    const firstRegistry = createModuleRegistry({
      events: throwingSink,
      adapters: [firstAdapter],
    })
    const secondRegistry = createModuleRegistry({
      events: rejectedSink,
      adapters: [secondAdapter],
    })

    const firstResult = await firstRegistry.probe('app')
    const secondResult = await secondRegistry.probe('app')

    expect(firstResult.status).toBe('ready')
    expect(secondResult.status).toBe('ready')
    expect(firstResult.eventDelivery).toBe('failed')
    expect(secondResult.eventDelivery).toBe('failed')
    expect(firstRegistry.getStatus('app')).toBe('ready')
    expect(secondRegistry.getStatus('app')).toBe('ready')
    expect(thrownEvents).toHaveLength(1)
    expect(rejectedEvents).toHaveLength(1)
    expectNoOpaqueDiagnostics(
      { firstResult, secondResult, thrownEvents, rejectedEvents },
      [RAW_SINK_THROW_SENTINEL, RAW_SINK_REJECTION_SENTINEL],
    )
  })

  it('accepts only runtime simulator and contract_test sources and defaults to runtime', async () => {
    const sourceCases: Array<{
      source?: ModuleEventSource
      expected: ModuleEventSource
    }> = [
      { expected: 'runtime' },
      { source: 'runtime', expected: 'runtime' },
      { source: 'simulator', expected: 'simulator' },
      { source: 'contract_test', expected: 'contract_test' },
    ]

    for (const sourceCase of sourceCases) {
      const events: CapturedEvent[] = []
      const adapter = createMockModuleFactory().create('app')
      const registry = sourceCase.source === undefined
        ? createModuleRegistry({ events: capture(events), adapters: [adapter] })
        : createModuleRegistry({
          events: capture(events),
          source: sourceCase.source,
          adapters: [adapter],
        })
      await registry.probe('app')
      expect(events).toHaveLength(1)
      expect(events[0].source).toBe(sourceCase.expected)
    }

    const invalidEvents: CapturedEvent[] = []
    const invalidSource = INVALID_INPUT_SENTINEL as unknown as ModuleEventSource
    const error = captureThrown(() => createModuleRegistry({
      events: capture(invalidEvents),
      source: invalidSource,
    }))

    expectRegistryError(error, 'module_source_invalid')
    expect(invalidEvents).toEqual([])
    expectNoOpaqueDiagnostics(invalidEvents, [INVALID_INPUT_SENTINEL])
  })

  it('rejects runtime-invalid module IDs and malformed adapters with closed configuration codes', () => {
    const events: CapturedEvent[] = []
    const invalidModuleId = INVALID_INPUT_SENTINEL as unknown as ModuleId
    const validRegistry = makeRegistry(events)
    const malformedAdapter = {
      private_context: PRIVATE_FIELD_SENTINEL,
    } as unknown as ModuleAdapter
    const badInitialStatus = {
      id: 'openai',
      initialStatus: INVALID_INPUT_SENTINEL,
      probe: () => 'success',
    } as unknown as ModuleAdapter
    const badSink = {
      emit: { private_context: PRIVATE_FIELD_SENTINEL },
    } as unknown as ModuleEventSink

    const errors = [
      captureThrown(() => validRegistry.getStatus(invalidModuleId)),
      captureThrown(() => createModuleRegistry({
        events: capture(events),
        adapters: [malformedAdapter],
      })),
      captureThrown(() => createModuleRegistry({
        events: capture(events),
        adapters: [badInitialStatus],
      })),
      captureThrown(() => createModuleRegistry({ events: badSink })),
    ]

    expectRegistryError(errors[0], 'module_id_invalid')
    expectRegistryError(errors[1], 'module_adapter_invalid')
    expectRegistryError(errors[2], 'module_adapter_invalid')
    expectRegistryError(errors[3], 'module_event_sink_invalid')
    for (const error of errors) {
      expectNoOpaqueDiagnostics(error, [INVALID_INPUT_SENTINEL, PRIVATE_FIELD_SENTINEL])
    }
    expect(events).toEqual([])
    expectNoOpaqueDiagnostics(events, [INVALID_INPUT_SENTINEL, PRIVATE_FIELD_SENTINEL])
  })

  it('keeps mock outcomes settable, deterministic, and independent', () => {
    const factory = createMockModuleFactory()
    const first: MockModuleAdapter = factory.create('lighting', { initialStatus: 'ready' })
    const second: MockModuleAdapter = factory.create('fog', { initialStatus: 'degraded' })

    expect(first.probe()).toBe('success')
    expect(second.probe()).toBe('success')
    first.setOutcome('degraded')
    expect(first.probe()).toBe('degraded')
    first.setOutcome('failed')
    expect(first.probe()).toBe('failed')
    first.setOutcome('throw')
    expect(() => first.probe()).toThrow()
    first.setOutcome('invalid')
    expect(first.probe()).toBeNull()

    const newHandle = factory.create('lighting')
    expect(newHandle.initialStatus).toBe('not_implemented')
    expect(newHandle.probe()).toBe('success')
    expect(first.initialStatus).toBe('ready')
    expect(second.initialStatus).toBe('degraded')
    expect(second.probe()).toBe('success')
    expect(Object.keys(first).sort()).toEqual(['id', 'initialStatus', 'probe', 'setOutcome'].sort())
    expect(Object.keys(second).sort()).toEqual(['id', 'initialStatus', 'probe', 'setOutcome'].sort())
    for (const adapter of [first, second, newHandle]) {
      for (const key of FORBIDDEN_CONTENT_KEYS) {
        expect(Object.prototype.hasOwnProperty.call(adapter, key)).toBe(false)
      }
    }
  })

  it('uses the exact metadata-only event key set for all six outcomes', async () => {
    const scenarios: Array<{
      module: ModuleId
      outcome?: MockProbeOutcome
      kind: ModuleProbeResult['kind']
      eventStatus: CapturedEvent['status']
      reason: string
      errorCode?: string
    }> = [
      {
        module: 'app',
        outcome: 'success',
        kind: 'success',
        eventStatus: 'success',
        reason: 'probe_success',
      },
      {
        module: 'openai',
        outcome: 'degraded',
        kind: 'degraded',
        eventStatus: 'degraded',
        reason: 'probe_degraded',
        errorCode: 'module_probe_degraded',
      },
      {
        module: 'wake',
        outcome: 'failed',
        kind: 'failed',
        eventStatus: 'failed',
        reason: 'probe_failed',
        errorCode: 'module_probe_failed',
      },
      {
        module: 'audio',
        outcome: 'throw',
        kind: 'throw',
        eventStatus: 'failed',
        reason: 'probe_threw',
        errorCode: 'module_probe_threw',
      },
      {
        module: 'camera',
        outcome: 'invalid',
        kind: 'invalid',
        eventStatus: 'failed',
        reason: 'probe_invalid',
        errorCode: 'module_probe_invalid',
      },
      {
        module: 'identity',
        kind: 'missing',
        eventStatus: 'info',
        reason: 'module_missing',
        errorCode: 'module_adapter_missing',
      },
    ]

    for (const scenario of scenarios) {
      const events: CapturedEvent[] = []
      const inspected = captureWithFreeze(events)
      const factory = createMockModuleFactory()
      const adapters = scenario.outcome === undefined
        ? []
        : [factory.create(scenario.module, { outcome: scenario.outcome })]
      const registry = createModuleRegistry({
        events: inspected.sink,
        adapters,
      })
      const result = await registry.probe(scenario.module)
      const event = events[0]
      const expectedEventKeys = ['module', 'event', 'status', 'reason', 'source']
      if (scenario.errorCode !== undefined) expectedEventKeys.push('error_code')
      const expectedResultKeys = [
        'module',
        'eventDelivery',
        'kind',
        'status',
        'opStatus',
        'reason',
      ]
      if (scenario.errorCode !== undefined) expectedResultKeys.push('errorCode')

      expect(result.kind).toBe(scenario.kind)
      expect(result.eventDelivery).toBe('emitted')
      expect(Object.keys(result).sort()).toEqual(expectedResultKeys.sort())
      expectFrozenResult(result)
      expect(event).toEqual({
        module: scenario.module,
        event: 'module_probe',
        status: scenario.eventStatus,
        reason: scenario.reason,
        source: 'runtime',
        ...(scenario.errorCode === undefined ? {} : { error_code: scenario.errorCode }),
      })
      expect(Object.keys(event).sort()).toEqual(expectedEventKeys.sort())
      expect(Object.prototype.hasOwnProperty.call(event, 'time')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(event, 'eventDelivery')).toBe(false)
      expect(inspected.wasFrozen()).toBe(true)
    }
  })
})
