import {
  isModuleId,
  ModuleRegistryError,
} from './module-registry'
import type {
  ModuleId,
  ModuleStatus,
} from '../shared/types'
import type {
  ModuleAdapter,
  ModuleProbeOutcome,
} from './module-registry'

export type MockProbeOutcome =
  | 'success'
  | 'degraded'
  | 'failed'
  | 'throw'
  | 'invalid'

export interface MockModuleOptions {
  readonly initialStatus?: ModuleStatus
  readonly outcome?: MockProbeOutcome
}

export interface MockModuleAdapter extends ModuleAdapter {
  setOutcome(outcome: MockProbeOutcome): void
}

export interface ModuleMockFactory {
  create(id: ModuleId, options?: MockModuleOptions): MockModuleAdapter
}

const MOCK_PROBE_ERROR_MESSAGE = 'Mock module probe failed'

function isObjectRecord(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false

  try {
    return !Array.isArray(value)
  } catch {
    return false
  }
}

function readOption(value: object, property: 'initialStatus' | 'outcome'): unknown {
  try {
    return Reflect.get(value, property)
  } catch {
    throw new ModuleRegistryError('module_adapter_invalid')
  }
}

function isModuleStatus(value: unknown): value is ModuleStatus {
  return value === 'not_implemented'
    || value === 'ready'
    || value === 'degraded'
    || value === 'failed'
}

function isMockProbeOutcome(value: unknown): value is MockProbeOutcome {
  return value === 'success'
    || value === 'degraded'
    || value === 'failed'
    || value === 'throw'
    || value === 'invalid'
}

function resolveOptions(options: unknown): {
  readonly initialStatus: ModuleStatus
  readonly outcome: MockProbeOutcome
} {
  if (options === undefined) {
    return { initialStatus: 'not_implemented', outcome: 'success' }
  }
  if (!isObjectRecord(options)) {
    throw new ModuleRegistryError('module_adapter_invalid')
  }

  const initialStatus = readOption(options, 'initialStatus')
  const outcome = readOption(options, 'outcome')
  if (
    (initialStatus !== undefined && !isModuleStatus(initialStatus))
    || (outcome !== undefined && !isMockProbeOutcome(outcome))
  ) {
    throw new ModuleRegistryError('module_adapter_invalid')
  }

  return {
    initialStatus: initialStatus === undefined ? 'not_implemented' : initialStatus,
    outcome: outcome === undefined ? 'success' : outcome,
  }
}

export function createMockModuleFactory(): ModuleMockFactory {
  return {
    create(id: ModuleId, options?: MockModuleOptions): MockModuleAdapter {
      if (!isModuleId(id)) {
        throw new ModuleRegistryError('module_id_invalid')
      }

      const resolved = resolveOptions(options)
      let outcome = resolved.outcome

      return {
        id,
        initialStatus: resolved.initialStatus,
        probe(): ModuleProbeOutcome {
          switch (outcome) {
            case 'success':
            case 'degraded':
            case 'failed':
              return outcome
            case 'throw':
              throw new Error(MOCK_PROBE_ERROR_MESSAGE)
            case 'invalid':
              return null as unknown as ModuleProbeOutcome
          }
        },
        setOutcome(nextOutcome: MockProbeOutcome): void {
          if (!isMockProbeOutcome(nextOutcome)) {
            throw new ModuleRegistryError('module_adapter_invalid')
          }
          outcome = nextOutcome
        },
      }
    },
  }
}
