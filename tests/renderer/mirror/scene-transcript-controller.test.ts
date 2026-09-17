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
  it('waits for the incantation before dispatching the skill and never plays after cancellation', async () => {
    for (const status of ['completed', 'failed'] as const) {
      const h = harness()
      let finish!: (value: { status: 'completed' } | { status: 'failed'; reason: string }) => void
      const announce = vi.fn(() => new Promise<{ status: 'completed' } | { status: 'failed'; reason: string }>(resolve => { finish = resolve }))
      const controller = createSceneTranscriptController({ bridge: h.bridge, interrupt: h.interrupt, announceSpell: announce })
      controller.handleInputItemCreated('cast')
      const pending = controller.handleCompletedTranscript({ itemId: 'cast', transcript: 'Begin the show', realtimeSessionId: 'test' })
      await vi.waitFor(() => expect(announce).toHaveBeenCalledTimes(1))
      expect(h.bridge.triggerScene).not.toHaveBeenCalled()
      finish(status === 'completed' ? { status } : { status, reason: 'spell_announcement_cancelled' })
      const result = await pending
      expect(result.decision).toBe(status === 'completed' ? 'triggered' : 'failed')
      expect(h.bridge.triggerScene).toHaveBeenCalledTimes(status === 'completed' ? 1 : 0)
    }
  })
  it('runs the short rain command once across punctuation, spaces and prefix script variants', async () => {
    for (const transcript of ['施放咒語，下雨！', '施放咒語 下雨', '施放咒语，下雨。']) {
      const h = harness()
      h.bridge.getSceneCatalog.mockResolvedValue({ configVersion: 8, stopPhrase: '魔鏡阿魔鏡',
        spells: [{ id: 'rain', phrase: '施放咒語，下雨' }] })
      h.controller.handleInputItemCreated('rain-item', 'rain-turn')
      const input = { itemId: 'rain-item', transcript, realtimeSessionId: 'synthetic-session' }
      expect(await h.controller.handleCompletedTranscript(input)).toMatchObject({ decision: 'triggered', result: { status: 'accepted' } })
      expect(await h.controller.handleCompletedTranscript(input)).toMatchObject({ decision: 'ignored', reason: 'duplicate_turn' })
      expect(h.bridge.triggerScene).toHaveBeenCalledExactlyOnceWith({ spellId: 'rain', turnId: 'rain-turn' })
    }
  })

  it('reports an unknown short command without interrupting ordinary conversation', async () => {
    const h = harness()
    h.bridge.getSceneCatalog.mockResolvedValue({ configVersion: 8, stopPhrase: '魔鏡阿魔鏡',
      spells: [{ id: 'rain', phrase: '施放咒語，下雨' }] })
    for (const [index, transcript] of ['施放咒語，下雪', '下雨', '不要施放咒語，下雨', '他說施放咒語，下雨', '施放咒語，下雨然後停止'].entries()) {
      const itemId = `negative-${index}`
      h.controller.handleInputItemCreated(itemId)
      expect(await h.controller.handleCompletedTranscript({ itemId, transcript, realtimeSessionId: 'synthetic-session' }))
        .toMatchObject({ decision: 'ignored' })
    }
    expect(h.metadata).toContain('spell_command_not_recognized')
    expect(h.bridge.triggerScene).not.toHaveBeenCalled()
    expect(h.interrupt).not.toHaveBeenCalled()
  })

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
