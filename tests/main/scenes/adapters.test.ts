import { describe, expect, it } from 'vitest'
import {
  createMockPhysicalAdapter,
  createUnavailablePhysicalAdapter,
} from '../../../src/main/scenes/adapters'
import type { SceneActionDefinition } from '../../../src/shared/types'

const fogOn: Extract<SceneActionDefinition, { kind: 'fog' }> = {
  id: 'fog-on',
  name: 'Fog on',
  enabled: true,
  kind: 'fog',
  command: 'on',
  presetId: 'soft',
}

describe('physical scene adapters', () => {
  it('reports deterministic mock acknowledgement without claiming physical evidence', async () => {
    const adapter = createMockPhysicalAdapter('fog', { behavior: 'success' })

    expect(await adapter.health()).toEqual({
      status: 'ready',
      capability: 'acknowledgement',
      transport: 'mock',
    })
    expect(await adapter.execute(fogOn, new AbortController().signal)).toEqual({
      status: 'acknowledged',
    })
  })

  it.each([
    ['failure', { status: 'failed', errorCode: 'mock_fog_failure' }],
    ['timeout', { status: 'timeout', errorCode: 'mock_fog_timeout' }],
  ] as const)('can deterministically simulate %s', async (behavior, expected) => {
    const adapter = createMockPhysicalAdapter('fog', { behavior })

    expect(await adapter.execute(fogOn, new AbortController().signal)).toEqual(expected)
  })

  it('keeps an absent physical transport visibly degraded and fails closed', async () => {
    const adapter = createUnavailablePhysicalAdapter('fog')

    expect(await adapter.health()).toEqual({
      status: 'degraded',
      capability: 'dispatch_only',
      transport: 'physical',
      reason: 'not_connected',
    })
    expect(await adapter.execute(fogOn, new AbortController().signal)).toEqual({
      status: 'failed',
      errorCode: 'fog_not_connected',
    })
  })

  it('rejects an action for the wrong physical adapter without exposing its payload', async () => {
    const adapter = createMockPhysicalAdapter('lighting', { behavior: 'success' })

    expect(await adapter.execute(fogOn, new AbortController().signal)).toEqual({
      status: 'failed',
      errorCode: 'adapter_action_kind_mismatch',
    })
  })
})
