import { describe, expect, it } from 'vitest'
import {
  createSceneRuntime,
  type SceneActionDispatch,
  type SceneActionExecutor,
  type SceneRuntimeEvent,
  type SceneRuntimeScheduler,
} from '../../../src/main/scenes/scene-runtime'
import type {
  SceneActionDefinition,
  SceneDefinition,
  SceneVisualPlaybackReport,
  SpellConfig,
} from '../../../src/shared/types'

class ManualClock implements SceneRuntimeScheduler {
  nowMs = 0
  #sequence = 0
  #tasks = new Map<number, { at: number; callback: () => void }>()

  now = (): number => this.nowMs
  schedule = (callback: () => void, delayMs: number): number => {
    const id = ++this.#sequence
    this.#tasks.set(id, { at: this.nowMs + delayMs, callback })
    return id
  }
  clear = (handle: unknown): void => {
    this.#tasks.delete(handle as number)
  }
  async advance(durationMs: number): Promise<void> {
    const target = this.nowMs + durationMs
    while (true) {
      const next = [...this.#tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0]
      if (next === undefined) break
      this.#tasks.delete(next[0])
      this.nowMs = next[1].at
      next[1].callback()
      await drain()
    }
    this.nowMs = target
    await drain()
  }
}

async function drain(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

const actions: SceneActionDefinition[] = [
  { id: 'light-on', name: 'Light on', enabled: true, kind: 'lighting', command: 'on', presetId: 'blue' },
  { id: 'fog-on', name: 'Fog on', enabled: true, kind: 'fog', command: 'on', presetId: 'soft' },
  { id: 'light-off', name: 'Light off', enabled: true, kind: 'lighting', command: 'off', presetId: 'blue' },
  {
    id: 'video-once', name: 'Once video', enabled: true, kind: 'visual', assetId: 'visual-video',
    fit: 'contain', playback: 'once', audio: 'muted', gain: 0,
  },
  {
    id: 'video-loop', name: 'Loop video', enabled: true, kind: 'visual', assetId: 'visual-video',
    fit: 'cover', playback: 'loop', audio: 'muted', gain: 0,
  },
]

const durationScene: SceneDefinition = {
  id: 'scene-duration', name: 'Duration scene', enabled: true,
  stages: [
    { id: 'stage-one', name: 'Start', endCondition: { kind: 'duration', durationMs: 100 }, actionIds: ['light-on', 'fog-on'] },
    { id: 'stage-two', name: 'End', endCondition: { kind: 'duration', durationMs: 250 }, actionIds: ['light-off'] },
  ],
}

const videoScene: SceneDefinition = {
  id: 'scene-video', name: 'Video scene', enabled: true,
  stages: [{
    id: 'stage-video', name: 'Video',
    endCondition: { kind: 'video_complete', visualActionId: 'video-once' },
    actionIds: ['video-once'],
  }],
}

const durationVisualScene: SceneDefinition = {
  id: 'scene-duration-visual', name: 'Timed visual scene', enabled: true,
  stages: [{
    id: 'stage-duration-visual', name: 'Timed visual',
    endCondition: { kind: 'duration', durationMs: 1000 },
    actionIds: ['video-once'],
  }],
}

const loopScene: SceneDefinition = {
  id: 'scene-loop', name: 'Loop scene', enabled: true,
  stages: [{
    id: 'stage-loop', name: 'Loop',
    endCondition: { kind: 'until_stopped', maxRuntimeMs: 60_000 },
    actionIds: ['video-loop'],
  }],
}

const spell: SpellConfig = {
  id: 'spell-one', name: 'Spell one', phrase: 'spell one',
  sceneId: durationScene.id, enabled: true, cooldownMs: 1000,
}

function createHarness(input: {
  readonly dispatch?: SceneActionExecutor['dispatch']
  readonly release?: SceneActionExecutor['release']
} = {}) {
  const clock = new ManualClock()
  const events: SceneRuntimeEvent[] = []
  const dispatches: Array<{ actionId: string; stageId: string; at: number }> = []
  const releases: string[] = []
  const executor: SceneActionExecutor = {
    dispatch(action, context, signal): SceneActionDispatch {
      dispatches.push({ actionId: action.id, stageId: context.stageId, at: clock.nowMs })
      return input.dispatch?.(action, context, signal) ?? { status: 'dispatched' }
    },
    async release(category, context, signal) {
      releases.push(`${context.runId}:${category}`)
      await input.release?.(category, context, signal)
    },
    async stopAll() {},
  }
  const runtime = createSceneRuntime({
    spells: [spell],
    scenes: [durationScene, videoScene, durationVisualScene, loopScene],
    actions,
    visualAssets: [{
      id: 'visual-video', name: 'Video', kind: 'video', fileName: 'visual-video.webm',
      mimeType: 'video/webm', byteLength: 1024, sha256: 'a'.repeat(64),
      width: 1920, height: 1080, orientation: 'landscape', durationMs: 5000,
      audioTrack: 'unknown', windowsDecode: 'passed',
    }],
    executor,
    scheduler: clock,
    eventSink: (event) => events.push(event),
  })
  return { clock, events, dispatches, releases, runtime }
}

function visualReport(
  runId: string,
  type: SceneVisualPlaybackReport['type'],
  fields: Partial<SceneVisualPlaybackReport> = {},
): SceneVisualPlaybackReport {
  return {
    runId, sceneId: videoScene.id, stageId: 'stage-video', actionId: 'video-once', type, ...fields,
  } as SceneVisualPlaybackReport
}

describe('SceneRuntime serialized owner', () => {
  it('returns an immediate start acknowledgement and preserves duration dispatch timing', async () => {
    const harness = createHarness()
    const start = await harness.runtime.triggerSpell({ spellId: spell.id, turnId: 'turn-one' })

    expect(start).toMatchObject({ status: 'accepted', sceneId: durationScene.id, runId: 'scene-run-1' })
    expect(harness.dispatches).toEqual([
      { actionId: 'light-on', stageId: 'stage-one', at: 0 },
      { actionId: 'fog-on', stageId: 'stage-one', at: 0 },
    ])
    await harness.clock.advance(100)
    expect(harness.dispatches[2]).toEqual({ actionId: 'light-off', stageId: 'stage-two', at: 100 })
    await harness.clock.advance(250)
    expect(harness.events.at(-1)).toMatchObject({
      type: 'finished', result: { runId: 'scene-run-1', status: 'completed', durationMs: 350 },
    })
    expect(harness.runtime.activeRunId()).toBeNull()
  })

  it('serializes replacement cleanup before the new first Stage', async () => {
    let releaseCleanup!: () => void
    const cleanup = new Promise<void>((resolve) => { releaseCleanup = resolve })
    const harness = createHarness({ release: () => cleanup })
    await harness.runtime.runScene(durationScene.id)

    const replacement = harness.runtime.runScene(videoScene.id)
    await drain()
    expect(harness.dispatches.some((item) => item.actionId === 'video-once')).toBe(false)
    releaseCleanup()
    const accepted = await replacement

    expect(accepted).toMatchObject({ status: 'accepted', sceneId: videoScene.id, runId: 'scene-run-2' })
    expect(harness.dispatches.at(-1)?.actionId).toBe('video-once')
    expect(harness.events).toContainEqual(expect.objectContaining({
      type: 'finished', result: expect.objectContaining({ runId: 'scene-run-1', status: 'stopped' }),
    }))
  })

  it('makes Stop All a barrier for starts already queued but admits a later start', async () => {
    let releaseCleanup!: () => void
    const cleanup = new Promise<void>((resolve) => { releaseCleanup = resolve })
    const harness = createHarness({ release: () => cleanup })
    await harness.runtime.runScene(durationScene.id)

    const beforeBarrier = harness.runtime.runScene(videoScene.id)
    const alsoBeforeBarrier = harness.runtime.runScene(loopScene.id)
    const stop = harness.runtime.stopAll()
    await drain()
    releaseCleanup()
    expect((await beforeBarrier).status).toBe('skipped')
    expect((await alsoBeforeBarrier).status).toBe('skipped')
    await stop
    expect(harness.dispatches.some((item) => item.actionId === 'video-once' || item.actionId === 'video-loop')).toBe(false)

    const afterBarrier = await harness.runtime.runScene(videoScene.id)
    expect(afterBarrier.status).toBe('accepted')
    expect(harness.dispatches.at(-1)?.actionId).toBe('video-once')
  })

  it('advances video_complete only for an active ended lease and ignores stale replacement events', async () => {
    const harness = createHarness()
    const first = await harness.runtime.runScene(videoScene.id)
    if (first.status !== 'accepted') throw new Error('fixture start rejected')

    expect(await harness.runtime.reportVisual(visualReport(first.runId, 'ready'))).toBe('accepted')
    expect(await harness.runtime.reportVisual(visualReport(first.runId, 'playing', { durationMs: 5000 }))).toBe('accepted')
    expect(harness.runtime.activeRunId()).toBe(first.runId)
    expect(await harness.runtime.reportVisual(visualReport(first.runId, 'ended'))).toBe('accepted')
    await drain()
    expect(harness.runtime.activeRunId()).toBeNull()

    const replacement = await harness.runtime.runScene(videoScene.id)
    expect(await harness.runtime.reportVisual(visualReport(first.runId, 'ended'))).toBe('stale')
    expect(harness.events.at(-1)).toMatchObject({
      type: 'diagnostic', reason: 'stale_scene_event', category: 'visual',
    })
    expect(harness.runtime.activeRunId()).toBe(replacement.runId)
  })

  it('keeps a duration Stage timer after its visual ends or fails early', async () => {
    for (const terminalType of ['ended', 'failed'] as const) {
      const harness = createHarness()
      const start = await harness.runtime.runScene(durationVisualScene.id)
      const report = (type: SceneVisualPlaybackReport['type'], fields: Partial<SceneVisualPlaybackReport> = {}) => ({
        runId: start.runId,
        sceneId: durationVisualScene.id,
        stageId: 'stage-duration-visual',
        actionId: 'video-once',
        type,
        ...fields,
      } as SceneVisualPlaybackReport)

      await harness.runtime.reportVisual(report('playing', { durationMs: 5000 }))
      await harness.clock.advance(100)
      await harness.runtime.reportVisual(report(terminalType, terminalType === 'failed' ? { errorCode: 'decode_failed' } : {}))
      await harness.clock.advance(899)
      expect(harness.runtime.activeRunId()).toBe(start.runId)
      await harness.clock.advance(1)
      expect(harness.runtime.activeRunId()).toBeNull()
    }
  })

  it('owns correlated renderer action feedback and rejects stale leases', async () => {
    const harness = createHarness()
    const start = await harness.runtime.runScene(durationScene.id)
    expect(await harness.runtime.reportAction({
      runId: start.runId,
      sceneId: durationScene.id,
      stageId: 'stage-one',
      actionId: 'light-on',
      status: 'failed',
      errorCode: 'renderer_failed',
    })).toBe('accepted')
    expect(await harness.runtime.reportAction({
      runId: 'stale-run',
      sceneId: durationScene.id,
      stageId: 'stage-one',
      actionId: 'light-on',
      status: 'completed',
    })).toBe('stale')
    await harness.clock.advance(350)
    expect(harness.events.at(-1)).toMatchObject({
      type: 'finished',
      result: {
        status: 'partial_failure',
        actions: expect.arrayContaining([expect.objectContaining({
          actionId: 'light-on', errorCode: 'renderer_failed',
        })]),
      },
    })
  })

  it('fails start, progress, and duration-consistency watchdogs without gating later runs', async () => {
    const startTimeout = createHarness()
    await startTimeout.runtime.runScene(videoScene.id)
    await startTimeout.clock.advance(10_000)
    expect(startTimeout.events.at(-1)).toMatchObject({
      type: 'finished', result: { status: 'failed', actions: [expect.objectContaining({ errorCode: 'visual_start_timeout' })] },
    })

    const mismatch = createHarness()
    const mismatchRun = await mismatch.runtime.runScene(videoScene.id)
    await mismatch.runtime.reportVisual(visualReport(mismatchRun.runId, 'playing', { durationMs: 7000 }))
    await drain()
    expect(mismatch.events.at(-1)).toMatchObject({
      type: 'finished', result: { status: 'failed', actions: [expect.objectContaining({ errorCode: 'visual_duration_mismatch' })] },
    })

    const progress = createHarness()
    const progressRun = await progress.runtime.runScene(videoScene.id)
    await progress.runtime.reportVisual(visualReport(progressRun.runId, 'playing', { durationMs: 5000 }))
    await progress.clock.advance(9000)
    await progress.runtime.reportVisual(visualReport(progressRun.runId, 'progress', { currentTimeMs: 1000 }))
    await progress.clock.advance(10_000)
    expect(progress.events.at(-1)).toMatchObject({
      type: 'finished', result: { status: 'failed', actions: [expect.objectContaining({ errorCode: 'visual_progress_timeout' })] },
    })
  })

  it('does not apply a once-video absolute watchdog to a loop and accepts loop wrap progress', async () => {
    const harness = createHarness()
    const start = await harness.runtime.runScene(loopScene.id)
    const report = (type: SceneVisualPlaybackReport['type'], fields: Partial<SceneVisualPlaybackReport> = {}) => ({
      runId: start.runId, sceneId: loopScene.id, stageId: 'stage-loop', actionId: 'video-loop', type, ...fields,
    } as SceneVisualPlaybackReport)
    await harness.runtime.reportVisual(report('playing', { durationMs: 5000 }))
    await harness.clock.advance(9000)
    await harness.runtime.reportVisual(report('progress', { currentTimeMs: 4500 }))
    await harness.clock.advance(9000)
    await harness.runtime.reportVisual(report('progress', { currentTimeMs: 100 }))
    await harness.clock.advance(9000)
    expect(harness.runtime.activeRunId()).toBe(start.runId)
    await harness.runtime.reportVisual(report('progress', { currentTimeMs: 4200 }))
    await harness.clock.advance(9000)
    await harness.runtime.reportVisual(report('progress', { currentTimeMs: 200 }))
    await harness.clock.advance(9000)
    await harness.runtime.reportVisual(report('progress', { currentTimeMs: 4100 }))
    await harness.clock.advance(9000)
    await harness.runtime.reportVisual(report('progress', { currentTimeMs: 150 }))
    await harness.clock.advance(6000)
    expect(harness.events.at(-1)).toMatchObject({
      type: 'finished', result: { status: 'stopped', durationMs: 60_000 },
    })
  })

  it('bounds resource cleanup per category and blocks only failed handovers', async () => {
    const harness = createHarness({ release: () => new Promise<void>(() => undefined) })
    await harness.runtime.runScene(durationScene.id)
    await harness.clock.advance(350)
    expect(harness.runtime.activeRunId()).toBe('scene-run-1')
    await harness.clock.advance(3000)
    expect(harness.runtime.activeRunId()).toBeNull()
    expect(harness.events.at(-1)).toMatchObject({ type: 'finished', result: { status: 'partial_failure' } })

    const next = await harness.runtime.runScene(durationScene.id)
    expect(next.status).toBe('accepted')
    expect(harness.dispatches.filter((item) => item.at === 3350)).toEqual([])
    expect(harness.events).toContainEqual(expect.objectContaining({
      type: 'diagnostic', reason: 'resource_handover_failed',
    }))
  })

  it('consumes a spell turn once and keeps cooldown checks in the serialized owner', async () => {
    const harness = createHarness()
    expect((await harness.runtime.triggerSpell({ spellId: spell.id, turnId: 'turn-a' })).status).toBe('accepted')
    expect(await harness.runtime.triggerSpell({ spellId: spell.id, turnId: 'turn-a' })).toMatchObject({ skipReason: 'duplicate_turn' })
    expect(await harness.runtime.triggerSpell({ spellId: spell.id, turnId: 'turn-b' })).toMatchObject({ skipReason: 'cooldown' })
    await harness.clock.advance(1000)
    expect((await harness.runtime.triggerSpell({ spellId: spell.id, turnId: 'turn-c' })).status).toBe('accepted')
  })
})
