import { describe, expect, it, vi } from 'vitest'
import { createSceneTranscriptController } from '../../../src/renderer/mirror/scene-transcript-controller'
import type { SceneStatusEvent } from '../../../src/shared/types'

function harness() {
  const statuses: SceneStatusEvent[] = []
  const metadata: string[] = []
  const bridge = {
    getSceneCatalog: vi.fn(async () => ({
      configVersion: 7,
      stopPhrase: 'Magic mirror',
      spells: [{ id: 'spell-opening', phrase: 'Begin the show' }],
    })),
    triggerScene: vi.fn(async () => ({
      runId: 'scene-run-next', sceneId: 'scene-opening', status: 'accepted' as const,
    })),
    stopScene: vi.fn(async () => 'stale' as const),
  }
  const interrupt = vi.fn(async () => undefined)
  const controller = createSceneTranscriptController({
    bridge,
    interrupt,
    metadataSink: (reason) => metadata.push(reason),
  })
  return { bridge, controller, interrupt, metadata, statuses }
}

describe('Scene transcript control boundary', () => {
  it('stops the run snapshotted at item creation and cannot also trigger a spell', async () => {
    const h = harness()
    h.controller.handleStatus({
      type: 'started', runId: 'scene-run-old', sceneId: 'scene-old', stageId: 'stage-old',
    })
    h.controller.handleInputItemCreated('item-one')
    h.controller.handleStatus({
      type: 'finished',
      result: { runId: 'scene-run-old', sceneId: 'scene-old', status: 'completed', durationMs: 1, actions: [] },
    })
    h.controller.handleStatus({
      type: 'started', runId: 'scene-run-new', sceneId: 'scene-new', stageId: 'stage-new',
    })

    const result = await h.controller.handleCompletedTranscript({
      itemId: 'item-one', transcript: '  Magic mirror!  ', realtimeSessionId: 'session-one',
    })

    expect(result).toMatchObject({ decision: 'stopped', result: 'stale' })
    expect(h.bridge.stopScene).toHaveBeenCalledWith({ runId: 'scene-run-old', turnId: 'scene-turn-1' })
    expect(h.bridge.triggerScene).not.toHaveBeenCalled()
    expect(h.interrupt).toHaveBeenCalledTimes(1)
  })

  it('triggers one normalized exact spell and consumes the input item once', async () => {
    const h = harness()
    h.controller.handleInputItemCreated('item-spell')
    const input = {
      itemId: 'item-spell', transcript: 'Begin the show.', realtimeSessionId: 'session-one',
    }

    expect(await h.controller.handleCompletedTranscript(input)).toMatchObject({ decision: 'triggered' })
    expect(await h.controller.handleCompletedTranscript(input)).toEqual({
      decision: 'ignored', reason: 'duplicate_turn',
    })
    expect(h.bridge.triggerScene).toHaveBeenCalledTimes(1)
  })

  it('makes transcript and target absence visible without fuzzy fallback', async () => {
    const h = harness()
    h.controller.handleInputItemCreated('item-empty')
    expect(await h.controller.handleCompletedTranscript({
      itemId: 'item-empty', transcript: ' ', realtimeSessionId: 'session-one',
    })).toEqual({ decision: 'ignored', reason: 'transcript_unavailable' })

    h.controller.handleInputItemCreated('item-no-target')
    expect(await h.controller.handleCompletedTranscript({
      itemId: 'item-no-target', transcript: 'Magic mirror', realtimeSessionId: 'session-one',
    })).toEqual({ decision: 'ignored', reason: 'stale_scene_stop' })
    expect(h.bridge.stopScene).not.toHaveBeenCalled()
    expect(h.metadata).toEqual(['transcript_unavailable', 'stale_scene_stop'])
  })
})
