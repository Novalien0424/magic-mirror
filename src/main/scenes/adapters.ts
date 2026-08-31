import type {
  SceneActionDefinition,
  SceneActionFeedbackStatus,
  SceneFeedbackCapability,
} from '../../shared/types'

export type PhysicalAdapterKind = 'lighting' | 'fog'
export type PhysicalSceneAction = Extract<
  SceneActionDefinition,
  { kind: PhysicalAdapterKind }
>

export interface SceneAdapterHealth {
  status: 'ready' | 'degraded' | 'failed'
  capability: SceneFeedbackCapability
  transport: 'mock' | 'physical'
  reason?: string
}

export interface SceneAdapterResult {
  status: SceneActionFeedbackStatus
  errorCode?: string
}

export interface PhysicalSceneAdapter {
  readonly kind: PhysicalAdapterKind
  readonly capability: SceneFeedbackCapability
  health(): Promise<SceneAdapterHealth>
  execute(action: PhysicalSceneAction, signal: AbortSignal): Promise<SceneAdapterResult>
  stopAll(): Promise<void>
}

export type MockPhysicalBehavior = 'success' | 'failure' | 'timeout'

export function createMockPhysicalAdapter(
  kind: PhysicalAdapterKind,
  options: { behavior: MockPhysicalBehavior },
): PhysicalSceneAdapter {
  return {
    kind,
    capability: 'acknowledgement',
    async health() {
      return {
        status: 'ready',
        capability: 'acknowledgement',
        transport: 'mock',
      }
    },
    async execute(action) {
      if (action.kind !== kind) {
        return { status: 'failed', errorCode: 'adapter_action_kind_mismatch' }
      }
      if (options.behavior === 'failure') {
        return { status: 'failed', errorCode: 'mock_' + kind + '_failure' }
      }
      if (options.behavior === 'timeout') {
        return { status: 'timeout', errorCode: 'mock_' + kind + '_timeout' }
      }
      return { status: 'acknowledged' }
    },
    async stopAll() {},
  }
}

export function createUnavailablePhysicalAdapter(
  kind: PhysicalAdapterKind,
): PhysicalSceneAdapter {
  return {
    kind,
    capability: 'dispatch_only',
    async health() {
      return {
        status: 'degraded',
        capability: 'dispatch_only',
        transport: 'physical',
        reason: 'not_connected',
      }
    },
    async execute(action) {
      if (action.kind !== kind) {
        return { status: 'failed', errorCode: 'adapter_action_kind_mismatch' }
      }
      return { status: 'failed', errorCode: kind + '_not_connected' }
    },
    async stopAll() {},
  }
}
