import type {
  MirrorEvent,
  ModuleId,
  ModuleStatus,
  OpStatus,
} from '../shared/types'

const MODULE_ID_VALUES = [
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
] as const

export const MODULE_IDS: readonly ModuleId[] = Object.freeze([...MODULE_ID_VALUES])

const DEFAULT_STATUS_VALUES: Record<ModuleId, ModuleStatus> = {
  app: 'not_implemented',
  openai: 'not_implemented',
  wake: 'not_implemented',
  audio: 'not_implemented',
  camera: 'not_implemented',
  identity: 'not_implemented',
  memory: 'not_implemented',
  avatar: 'not_implemented',
  lighting: 'not_implemented',
  fog: 'not_implemented',
  music: 'not_implemented',
  sqlite: 'not_implemented',
  config: 'not_implemented',
  telemetry: 'not_implemented',
}

export const DEFAULT_MODULE_STATUSES: Readonly<Record<ModuleId, ModuleStatus>> =
  Object.freeze({ ...DEFAULT_STATUS_VALUES })

const MODULE_ID_SET: ReadonlySet<ModuleId> = new Set(MODULE_IDS)
const MODULE_STATUS_VALUES: ReadonlySet<ModuleStatus> = new Set([
  'not_implemented',
  'ready',
  'degraded',
  'failed',
])
const MODULE_SOURCE_VALUES: ReadonlySet<ModuleEventSource> = new Set([
  'runtime',
  'simulator',
  'contract_test',
])

export type ModuleEventSource = NonNullable<MirrorEvent['source']>
export type ModuleProbeOutcome = Extract<OpStatus, 'success' | 'degraded' | 'failed'>
export type ModuleEventDelivery = 'emitted' | 'failed'

export type ModuleProbeReason =
  | 'probe_success'
  | 'probe_degraded'
  | 'probe_failed'
  | 'probe_threw'
  | 'probe_invalid'
  | 'module_missing'

export type ModuleProbeErrorCode =
  | 'module_probe_degraded'
  | 'module_probe_failed'
  | 'module_probe_threw'
  | 'module_probe_invalid'
  | 'module_adapter_missing'

type ModuleProbeResultBase = {
  readonly module: ModuleId
  readonly eventDelivery: ModuleEventDelivery
}

export type ModuleProbeResult =
  | (ModuleProbeResultBase & {
      readonly kind: 'success'
      readonly status: 'ready'
      readonly opStatus: 'success'
      readonly reason: 'probe_success'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'degraded'
      readonly status: 'degraded'
      readonly opStatus: 'degraded'
      readonly reason: 'probe_degraded'
      readonly errorCode: 'module_probe_degraded'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'failed'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly reason: 'probe_failed'
      readonly errorCode: 'module_probe_failed'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'throw'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly reason: 'probe_threw'
      readonly errorCode: 'module_probe_threw'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'invalid'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly reason: 'probe_invalid'
      readonly errorCode: 'module_probe_invalid'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'missing'
      readonly status: 'not_implemented'
      readonly opStatus: 'info'
      readonly reason: 'module_missing'
      readonly errorCode: 'module_adapter_missing'
    })

export interface ModuleAdapter {
  readonly id: ModuleId
  readonly initialStatus: ModuleStatus
  readonly probe: () => ModuleProbeOutcome | PromiseLike<ModuleProbeOutcome>
}

export interface ModuleEventSink {
  emit(event: Omit<MirrorEvent, 'time'>): void | PromiseLike<void>
}

export interface ModuleRegistryOptions {
  readonly events: ModuleEventSink
  readonly source?: ModuleEventSource
  readonly adapters?: readonly ModuleAdapter[]
}

export type ModuleRegistryErrorCode =
  | 'module_id_invalid'
  | 'module_adapter_invalid'
  | 'module_adapter_duplicate'
  | 'module_event_sink_invalid'
  | 'module_source_invalid'

const MODULE_REGISTRY_ERROR_MESSAGE = 'Module registry configuration is invalid'

export class ModuleRegistryError extends Error {
  readonly code: ModuleRegistryErrorCode

  constructor(code: ModuleRegistryErrorCode) {
    super(MODULE_REGISTRY_ERROR_MESSAGE)
    this.name = 'ModuleRegistryError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface ModuleRegistry {
  getStatus(module: ModuleId): ModuleStatus
  snapshot(): Readonly<Record<ModuleId, ModuleStatus>>
  probe(module: ModuleId): Promise<ModuleProbeResult>
}

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && MODULE_ID_SET.has(value as ModuleId)
}

type ModuleEventInput = Omit<MirrorEvent, 'time'>

type ProbeDescriptor =
  | {
      readonly kind: 'success'
      readonly status: 'ready'
      readonly opStatus: 'success'
      readonly eventStatus: 'success'
      readonly reason: 'probe_success'
    }
  | {
      readonly kind: 'degraded'
      readonly status: 'degraded'
      readonly opStatus: 'degraded'
      readonly eventStatus: 'degraded'
      readonly reason: 'probe_degraded'
      readonly errorCode: 'module_probe_degraded'
    }
  | {
      readonly kind: 'failed'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly eventStatus: 'failed'
      readonly reason: 'probe_failed'
      readonly errorCode: 'module_probe_failed'
    }
  | {
      readonly kind: 'throw'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly eventStatus: 'failed'
      readonly reason: 'probe_threw'
      readonly errorCode: 'module_probe_threw'
    }
  | {
      readonly kind: 'invalid'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly eventStatus: 'failed'
      readonly reason: 'probe_invalid'
      readonly errorCode: 'module_probe_invalid'
    }
  | {
      readonly kind: 'missing'
      readonly status: 'not_implemented'
      readonly opStatus: 'info'
      readonly eventStatus: 'info'
      readonly reason: 'module_missing'
      readonly errorCode: 'module_adapter_missing'
    }

type ValidatedAdapter = {
  readonly id: ModuleId
  readonly initialStatus: ModuleStatus
  readonly probe: ModuleAdapter['probe']
}

type ResolvedRegistryOptions = {
  readonly eventOwner: object
  readonly emit: ModuleEventSink['emit']
  readonly source: ModuleEventSource
  readonly adapters: readonly unknown[]
}

const PROPERTY_READ_FAILED = Symbol('module_registry_property_read_failed')

function isObjectRecord(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false

  try {
    return !Array.isArray(value)
  } catch {
    return false
  }
}

function isArrayValue(value: unknown): value is readonly unknown[] {
  try {
    return Array.isArray(value)
  } catch {
    return false
  }
}

function readProperty(value: object, property: string): unknown | typeof PROPERTY_READ_FAILED {
  try {
    return Reflect.get(value, property)
  } catch {
    return PROPERTY_READ_FAILED
  }
}

function isModuleStatus(value: unknown): value is ModuleStatus {
  return typeof value === 'string' && MODULE_STATUS_VALUES.has(value as ModuleStatus)
}

function isModuleEventSource(value: unknown): value is ModuleEventSource {
  return typeof value === 'string' && MODULE_SOURCE_VALUES.has(value as ModuleEventSource)
}

function resolveRegistryOptions(options: ModuleRegistryOptions): ResolvedRegistryOptions {
  if (!isObjectRecord(options)) {
    throw new ModuleRegistryError('module_event_sink_invalid')
  }

  const eventValue = readProperty(options, 'events')
  if (!isObjectRecord(eventValue)) {
    throw new ModuleRegistryError('module_event_sink_invalid')
  }

  const emitValue = readProperty(eventValue, 'emit')
  if (typeof emitValue !== 'function') {
    throw new ModuleRegistryError('module_event_sink_invalid')
  }

  const sourceValue = readProperty(options, 'source')
  if (sourceValue === PROPERTY_READ_FAILED) {
    throw new ModuleRegistryError('module_source_invalid')
  }
  let source: ModuleEventSource = 'runtime'
  if (sourceValue !== undefined) {
    if (!isModuleEventSource(sourceValue)) {
      throw new ModuleRegistryError('module_source_invalid')
    }
    source = sourceValue
  }

  const adaptersValue = readProperty(options, 'adapters')
  if (adaptersValue === PROPERTY_READ_FAILED) {
    throw new ModuleRegistryError('module_adapter_invalid')
  }
  if (adaptersValue !== undefined && !isArrayValue(adaptersValue)) {
    throw new ModuleRegistryError('module_adapter_invalid')
  }

  return {
    eventOwner: eventValue,
    emit: emitValue as ModuleEventSink['emit'],
    source,
    adapters: adaptersValue === undefined ? [] : adaptersValue,
  }
}

function validateAdapter(value: unknown): ValidatedAdapter {
  if (!isObjectRecord(value)) {
    throw new ModuleRegistryError('module_adapter_invalid')
  }

  const idValue = readProperty(value, 'id')
  const initialStatusValue = readProperty(value, 'initialStatus')
  const probeValue = readProperty(value, 'probe')
  if (
    idValue === PROPERTY_READ_FAILED
    || initialStatusValue === PROPERTY_READ_FAILED
    || probeValue === PROPERTY_READ_FAILED
    || !isModuleId(idValue)
    || !isModuleStatus(initialStatusValue)
    || typeof probeValue !== 'function'
  ) {
    throw new ModuleRegistryError('module_adapter_invalid')
  }

  return {
    id: idValue,
    initialStatus: initialStatusValue,
    probe: probeValue as ModuleAdapter['probe'],
  }
}

function validateAdapters(values: readonly unknown[]): Map<ModuleId, ValidatedAdapter> {
  let length: number
  try {
    length = values.length
  } catch {
    throw new ModuleRegistryError('module_adapter_invalid')
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new ModuleRegistryError('module_adapter_invalid')
  }

  const adapters = new Map<ModuleId, ValidatedAdapter>()
  for (let index = 0; index < length; index += 1) {
    let value: unknown
    try {
      value = values[index]
    } catch {
      throw new ModuleRegistryError('module_adapter_invalid')
    }

    const adapter = validateAdapter(value)
    if (adapters.has(adapter.id)) {
      throw new ModuleRegistryError('module_adapter_duplicate')
    }
    adapters.set(adapter.id, adapter)
  }
  return adapters
}

function descriptorForOutcome(value: unknown): ProbeDescriptor {
  if (value === 'success') {
    return {
      kind: 'success',
      status: 'ready',
      opStatus: 'success',
      eventStatus: 'success',
      reason: 'probe_success',
    }
  }
  if (value === 'degraded') {
    return {
      kind: 'degraded',
      status: 'degraded',
      opStatus: 'degraded',
      eventStatus: 'degraded',
      reason: 'probe_degraded',
      errorCode: 'module_probe_degraded',
    }
  }
  if (value === 'failed') {
    return {
      kind: 'failed',
      status: 'failed',
      opStatus: 'failed',
      eventStatus: 'failed',
      reason: 'probe_failed',
      errorCode: 'module_probe_failed',
    }
  }
  return {
    kind: 'invalid',
    status: 'failed',
    opStatus: 'failed',
    eventStatus: 'failed',
    reason: 'probe_invalid',
    errorCode: 'module_probe_invalid',
  }
}

function makeEvent(
  module: ModuleId,
  source: ModuleEventSource,
  descriptor: ProbeDescriptor,
): Readonly<ModuleEventInput> {
  if (descriptor.kind === 'success') {
    return Object.freeze({
      module,
      event: 'module_probe',
      status: descriptor.eventStatus,
      reason: descriptor.reason,
      source,
    })
  }

  return Object.freeze({
    module,
    event: 'module_probe',
    status: descriptor.eventStatus,
    error_code: descriptor.errorCode,
    reason: descriptor.reason,
    source,
  })
}

function makeResult(
  module: ModuleId,
  eventDelivery: ModuleEventDelivery,
  descriptor: ProbeDescriptor,
): ModuleProbeResult {
  switch (descriptor.kind) {
    case 'success':
      return Object.freeze({
        module,
        eventDelivery,
        kind: 'success',
        status: 'ready',
        opStatus: 'success',
        reason: 'probe_success',
      })
    case 'degraded':
      return Object.freeze({
        module,
        eventDelivery,
        kind: 'degraded',
        status: 'degraded',
        opStatus: 'degraded',
        reason: 'probe_degraded',
        errorCode: 'module_probe_degraded',
      })
    case 'failed':
      return Object.freeze({
        module,
        eventDelivery,
        kind: 'failed',
        status: 'failed',
        opStatus: 'failed',
        reason: 'probe_failed',
        errorCode: 'module_probe_failed',
      })
    case 'throw':
      return Object.freeze({
        module,
        eventDelivery,
        kind: 'throw',
        status: 'failed',
        opStatus: 'failed',
        reason: 'probe_threw',
        errorCode: 'module_probe_threw',
      })
    case 'invalid':
      return Object.freeze({
        module,
        eventDelivery,
        kind: 'invalid',
        status: 'failed',
        opStatus: 'failed',
        reason: 'probe_invalid',
        errorCode: 'module_probe_invalid',
      })
    case 'missing':
      return Object.freeze({
        module,
        eventDelivery,
        kind: 'missing',
        status: 'not_implemented',
        opStatus: 'info',
        reason: 'module_missing',
        errorCode: 'module_adapter_missing',
      })
  }
}

function makeSnapshot(
  statuses: Record<ModuleId, ModuleStatus>,
): Readonly<Record<ModuleId, ModuleStatus>> {
  const snapshot = {} as Record<ModuleId, ModuleStatus>
  for (const module of MODULE_IDS) snapshot[module] = statuses[module]
  return Object.freeze(snapshot)
}

async function deliverEvent(
  eventOwner: object,
  emit: ModuleEventSink['emit'],
  event: Readonly<ModuleEventInput>,
): Promise<ModuleEventDelivery> {
  try {
    await Promise.resolve().then(() => Reflect.apply(emit, eventOwner, [event]))
    return 'emitted'
  } catch {
    return 'failed'
  }
}

export function createModuleRegistry(options: ModuleRegistryOptions): ModuleRegistry {
  const resolved = resolveRegistryOptions(options)
  const validatedAdapters = validateAdapters(resolved.adapters)
  const statuses: Record<ModuleId, ModuleStatus> = { ...DEFAULT_STATUS_VALUES }

  for (const adapter of validatedAdapters.values()) {
    statuses[adapter.id] = adapter.initialStatus
  }

  return {
    getStatus(module: ModuleId): ModuleStatus {
      if (!isModuleId(module)) throw new ModuleRegistryError('module_id_invalid')
      return statuses[module]
    },

    snapshot(): Readonly<Record<ModuleId, ModuleStatus>> {
      return makeSnapshot(statuses)
    },

    async probe(module: ModuleId): Promise<ModuleProbeResult> {
      if (!isModuleId(module)) throw new ModuleRegistryError('module_id_invalid')

      const adapter = validatedAdapters.get(module)
      let descriptor: ProbeDescriptor
      if (adapter === undefined) {
        descriptor = {
          kind: 'missing',
          status: 'not_implemented',
          opStatus: 'info',
          eventStatus: 'info',
          reason: 'module_missing',
          errorCode: 'module_adapter_missing',
        }
      } else {
        try {
          const value = await Promise.resolve().then(() => adapter.probe())
          descriptor = descriptorForOutcome(value)
        } catch {
          descriptor = {
            kind: 'throw',
            status: 'failed',
            opStatus: 'failed',
            eventStatus: 'failed',
            reason: 'probe_threw',
            errorCode: 'module_probe_threw',
          }
        }
      }

      statuses[module] = descriptor.status
      const event = makeEvent(module, resolved.source, descriptor)
      const eventDelivery = await deliverEvent(resolved.eventOwner, resolved.emit, event)
      return makeResult(module, eventDelivery, descriptor)
    },
  }
}
