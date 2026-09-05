import type {
  ManagedVisualAsset,
  SceneActionDefinition,
  SceneActionFeedbackStatus,
  SceneActionRendererReport,
  SceneActionRunResult,
  SceneDefinition,
  SceneRunResult,
  SceneRunSkipReason,
  SceneStartResult,
  SceneVisualPlaybackReport,
  SpellConfig,
} from '../../shared/types'

export type SceneResourceCategory = 'visual' | 'music' | 'lighting' | 'fog'

export interface SceneActionContext {
  runId: string
  sceneId: string
  stageId: string
}

export interface SceneActionFeedback {
  status: SceneActionFeedbackStatus
  errorCode?: string
}

export interface SceneActionDispatch extends SceneActionFeedback {
  feedback?: Promise<SceneActionFeedback>
}

export interface SceneActionExecutor {
  dispatch(
    action: SceneActionDefinition,
    context: SceneActionContext,
    signal: AbortSignal,
  ): SceneActionDispatch
  release(
    category: SceneResourceCategory,
    context: Readonly<{ runId: string; sceneId: string }>,
    signal: AbortSignal,
  ): Promise<void>
  stopAll(): Promise<void>
}

export interface SceneRuntimeScheduler {
  now(): number
  schedule(callback: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export type SceneRuntimeEvent =
  | Readonly<{ type: 'started'; runId: string; sceneId: string; stageId: string }>
  | Readonly<{ type: 'stage_started'; runId: string; sceneId: string; stageId: string }>
  | Readonly<{ type: 'finished'; result: SceneRunResult }>
  | Readonly<{
      type: 'diagnostic'
      reason: string
      sceneId?: string
      category?: SceneResourceCategory
    }>

export interface SceneRuntimeOptions {
  spells: readonly SpellConfig[]
  scenes: readonly SceneDefinition[]
  actions: readonly SceneActionDefinition[]
  visualAssets?: readonly ManagedVisualAsset[]
  executor: SceneActionExecutor
  scheduler?: SceneRuntimeScheduler
  eventSink?: (event: SceneRuntimeEvent) => void
}

export interface SceneRuntime {
  triggerSpell(trigger: { spellId: string; turnId: string }): Promise<SceneStartResult>
  runScene(sceneId: string): Promise<SceneStartResult>
  reportAction(report: SceneActionRendererReport): Promise<'accepted' | 'stale'>
  reportVisual(report: SceneVisualPlaybackReport): Promise<'accepted' | 'stale' | 'invalid'>
  stopRun(target: { runId: string; turnId: string }): Promise<'stopped' | 'stale'>
  stopAll(): Promise<void>
  activeRunId(): string | null
}

interface VisualState {
  readonly action: Extract<SceneActionDefinition, { kind: 'visual' }>
  readonly context: SceneVisualPlaybackReport
  readonly asset?: ManagedVisualAsset
  playing: boolean
  lastCurrentTimeMs: number
  startTimer: unknown | null
  progressTimer: unknown | null
  absoluteTimer: unknown | null
}

interface ActiveRun {
  readonly runId: string
  readonly scene: SceneDefinition
  readonly startedAt: number
  readonly abortController: AbortController
  readonly actionResults: SceneActionRunResult[]
  readonly resources: Set<SceneResourceCategory>
  readonly stageTimers: Set<unknown>
  status: 'starting' | 'running' | 'cleaning'
  stageIndex: number
  stageId: string
  visual: VisualState | null
  fogSafetyTimer: unknown | null
  cleanupAttempted: boolean
}

type TerminalReason = 'completed' | 'replaced' | 'stopped' | 'maximum_runtime'

const VISUAL_START_TIMEOUT_MS = 10_000
const VISUAL_PROGRESS_TIMEOUT_MS = 10_000
const VISUAL_ABSOLUTE_GRACE_MS = 15_000
const RESOURCE_CLEANUP_TIMEOUT_MS = 3_000
const FOG_MAX_ON_MS = 10 * 60_000
const CONSUMED_TURN_LIMIT = 2048

const defaultScheduler: SceneRuntimeScheduler = Object.freeze({
  now: Date.now,
  schedule: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
  clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
})

function safeFeedback(value: SceneActionFeedback): SceneActionFeedback {
  if (value.status === 'failed' || value.status === 'timeout') {
    return { status: value.status, errorCode: value.errorCode ?? 'scene_action_failed' }
  }
  return { status: value.status }
}

function categoryOf(action: SceneActionDefinition): SceneResourceCategory | null {
  if (action.kind === 'visual' || action.kind === 'music' || action.kind === 'lighting' || action.kind === 'fog') {
    return action.kind
  }
  return null
}

function isFailure(result: SceneActionRunResult): boolean {
  return result.status === 'failed' || result.status === 'timeout'
}

function leaseMatches(run: ActiveRun, report: SceneVisualPlaybackReport): boolean {
  return run.runId === report.runId
    && run.scene.id === report.sceneId
    && run.stageId === report.stageId
    && run.visual?.action.id === report.actionId
}

export function createSceneRuntime(options: SceneRuntimeOptions): SceneRuntime {
  const scheduler = options.scheduler ?? defaultScheduler
  const spells = new Map(options.spells.map((spell) => [spell.id, spell]))
  const scenes = new Map(options.scenes.map((scene) => [scene.id, scene]))
  const actions = new Map(options.actions.map((action) => [action.id, action]))
  const visualAssets = new Map((options.visualAssets ?? []).map((asset) => [asset.id, asset]))
  const consumedTurnIds = new Set<string>()
  const consumedTurnOrder: string[] = []
  const lastStartedBySpell = new Map<string, number>()
  const blockedResources = new Set<SceneResourceCategory>()
  let runSequence = 0
  let barrierVersion = 0
  let activeRun: ActiveRun | null = null
  let queueTail: Promise<void> = Promise.resolve()

  const emit = (event: SceneRuntimeEvent): void => {
    try { options.eventSink?.(event) } catch { /* diagnostics cannot gate Scenes */ }
  }

  const diagnostic = (
    reason: string,
    sceneId?: string,
    category?: SceneResourceCategory,
  ): void => emit({ type: 'diagnostic', reason, ...(sceneId === undefined ? {} : { sceneId }), ...(category === undefined ? {} : { category }) })

  const enqueue = <T>(operation: () => T | Promise<T>): Promise<T> => {
    const result = queueTail.then(operation, operation)
    queueTail = result.then(() => undefined, () => undefined)
    return result
  }

  const clearTimer = (run: ActiveRun, handle: unknown | null): void => {
    if (handle === null) return
    scheduler.clear(handle)
    run.stageTimers.delete(handle)
  }

  const clearStageTimers = (run: ActiveRun): void => {
    for (const handle of run.stageTimers) scheduler.clear(handle)
    run.stageTimers.clear()
    if (run.visual !== null) {
      run.visual.startTimer = null
      run.visual.progressTimer = null
      run.visual.absoluteTimer = null
    }
  }

  const clearVisualTimers = (run: ActiveRun): void => {
    const visual = run.visual
    if (visual === null) return
    clearTimer(run, visual.startTimer)
    clearTimer(run, visual.progressTimer)
    clearTimer(run, visual.absoluteTimer)
    visual.startTimer = null
    visual.progressTimer = null
    visual.absoluteTimer = null
  }

  const scheduleForRun = (run: ActiveRun, delayMs: number, callback: () => void | Promise<void>): unknown => {
    let handle: unknown
    handle = scheduler.schedule(() => {
      run.stageTimers.delete(handle)
      void enqueue(async () => {
        if (activeRun !== run || run.status !== 'running') return
        await callback()
      })
    }, delayMs)
    run.stageTimers.add(handle)
    return handle
  }

  const bounded = async (operation: (signal: AbortSignal) => Promise<void>): Promise<boolean> => {
    const controller = new AbortController()
    return new Promise((resolve) => {
      let settled = false
      const timeout = scheduler.schedule(() => {
        if (settled) return
        settled = true
        controller.abort()
        resolve(false)
      }, RESOURCE_CLEANUP_TIMEOUT_MS)
      void Promise.resolve().then(() => operation(controller.signal)).then(() => {
        if (settled) return
        settled = true
        scheduler.clear(timeout)
        resolve(true)
      }, () => {
        if (settled) return
        settled = true
        scheduler.clear(timeout)
        resolve(false)
      })
    })
  }

  const releaseCategory = async (run: ActiveRun, category: SceneResourceCategory): Promise<boolean> => {
    const released = await bounded((signal) => options.executor.release(category, {
      runId: run.runId,
      sceneId: run.scene.id,
    }, signal))
    if (released) blockedResources.delete(category)
    else {
      blockedResources.add(category)
      diagnostic('resource_cleanup_timeout', run.scene.id, category)
    }
    return released
  }

  const terminalStatus = (
    run: ActiveRun,
    reason: TerminalReason,
    cleanupFailed: boolean,
  ): SceneRunResult['status'] => {
    if (reason === 'replaced' || reason === 'stopped' || reason === 'maximum_runtime') return 'stopped'
    const failures = run.actionResults.filter(isFailure).length
    if (failures === 0) return cleanupFailed ? 'partial_failure' : 'completed'
    return failures === run.actionResults.length ? 'failed' : 'partial_failure'
  }

  const terminate = async (run: ActiveRun, reason: TerminalReason): Promise<void> => {
    if (run.cleanupAttempted) return
    run.cleanupAttempted = true
    run.status = 'cleaning'
    const endedAt = scheduler.now()
    run.abortController.abort()
    clearStageTimers(run)
    if (run.fogSafetyTimer !== null) scheduler.clear(run.fogSafetyTimer)
    run.fogSafetyTimer = null

    const categories = [...run.resources]
    const released = await Promise.all(categories.map((category) => releaseCategory(run, category)))
    const cleanupFailed = released.some((value) => !value)
    if (activeRun === run) activeRun = null
    const result: SceneRunResult = {
      runId: run.runId,
      sceneId: run.scene.id,
      status: terminalStatus(run, reason, cleanupFailed),
      durationMs: Math.max(0, endedAt - run.startedAt),
      actions: run.actionResults.map((value) => ({ ...value })),
    }
    emit({ type: 'finished', result })
  }

  const setResult = (result: SceneActionRunResult, feedback: SceneActionFeedback): void => {
    Object.assign(result, safeFeedback(feedback))
  }

  const resetProgressWatchdog = (run: ActiveRun): void => {
    const visual = run.visual
    if (visual === null) return
    clearTimer(run, visual.progressTimer)
    visual.progressTimer = scheduleForRun(run, VISUAL_PROGRESS_TIMEOUT_MS, async () => {
      await failVisual(run, 'visual_progress_timeout')
    })
  }

  const advanceStage = async (run: ActiveRun): Promise<void> => {
    if (activeRun !== run || run.status !== 'running') return
    clearStageTimers(run)
    run.visual = null
    const nextIndex = run.stageIndex + 1
    if (nextIndex >= run.scene.stages.length) {
      await terminate(run, 'completed')
      return
    }
    if (run.resources.has('visual') && await releaseCategory(run, 'visual')) {
      run.resources.delete('visual')
    }
    beginStage(run, nextIndex)
  }

  const failVisual = async (run: ActiveRun, errorCode: string): Promise<void> => {
    const visual = run.visual
    if (visual === null) return
    const result = run.actionResults.find((candidate) =>
      candidate.actionId === visual.action.id && candidate.stageId === run.stageId)
    if (result !== undefined) setResult(result, { status: 'failed', errorCode })
    diagnostic(errorCode, run.scene.id, 'visual')
    clearVisualTimers(run)
    run.visual = null
    const stage = run.scene.stages[run.stageIndex]
    if (stage?.endCondition.kind === 'video_complete') {
      await advanceStage(run)
      return
    }
    if (await releaseCategory(run, 'visual')) run.resources.delete('visual')
  }

  const setFogSafety = (run: ActiveRun, action: SceneActionDefinition): void => {
    if (action.kind !== 'fog') return
    if (action.command === 'off') {
      if (run.fogSafetyTimer !== null) scheduler.clear(run.fogSafetyTimer)
      run.fogSafetyTimer = null
      return
    }
    // ON/value updates do not interrupt continuous fog exposure.
    if (run.fogSafetyTimer !== null) return
    run.fogSafetyTimer = scheduler.schedule(() => {
      void enqueue(async () => {
        if (activeRun !== run || run.status !== 'running') return
        run.fogSafetyTimer = null
        const released = await releaseCategory(run, 'fog')
        if (released) run.resources.delete('fog')
        diagnostic(released ? 'fog_safety_released' : 'fog_safety_release_failed', run.scene.id, 'fog')
      })
    }, FOG_MAX_ON_MS)
  }

  const installVisualState = (
    run: ActiveRun,
    action: Extract<SceneActionDefinition, { kind: 'visual' }>,
  ): void => {
    const asset = visualAssets.get(action.assetId)
    const context = {
      runId: run.runId,
      sceneId: run.scene.id,
      stageId: run.stageId,
      actionId: action.id,
      type: 'ready' as const,
    }
    const visual: VisualState = {
      action,
      context,
      asset,
      playing: false,
      lastCurrentTimeMs: 0,
      startTimer: null,
      progressTimer: null,
      absoluteTimer: null,
    }
    run.visual = visual
    visual.startTimer = scheduleForRun(run, VISUAL_START_TIMEOUT_MS, async () => {
      await failVisual(run, 'visual_start_timeout')
    })
  }

  const beginStage = (run: ActiveRun, stageIndex: number): void => {
    if (activeRun !== run || run.status === 'cleaning') return
    const stage = run.scene.stages[stageIndex]
    if (stage === undefined) {
      void enqueue(() => terminate(run, 'completed'))
      return
    }
    run.status = 'running'
    run.stageIndex = stageIndex
    run.stageId = stage.id
    emit({ type: stageIndex === 0 ? 'started' : 'stage_started', runId: run.runId, sceneId: run.scene.id, stageId: stage.id })

    for (const actionId of stage.actionIds) {
      const action = actions.get(actionId)
      const result: SceneActionRunResult = { actionId, stageId: stage.id, status: 'dispatched' }
      run.actionResults.push(result)
      if (action === undefined || !action.enabled) {
        setResult(result, {
          status: 'failed',
          errorCode: action === undefined ? 'scene_action_missing' : 'scene_action_disabled',
        })
        continue
      }
      const category = categoryOf(action)
      if (category !== null && blockedResources.has(category)) {
        setResult(result, { status: 'failed', errorCode: 'resource_handover_failed' })
        diagnostic('resource_handover_failed', run.scene.id, category)
        continue
      }
      try {
        const dispatch = options.executor.dispatch(action, {
          runId: run.runId,
          sceneId: run.scene.id,
          stageId: stage.id,
        }, run.abortController.signal)
        setResult(result, dispatch)
        if (category !== null && !isFailure(result)) run.resources.add(category)
        if (!isFailure(result)) setFogSafety(run, action)
        if (action.kind === 'visual' && !isFailure(result)) installVisualState(run, action)
        if (dispatch.feedback !== undefined) {
          void dispatch.feedback.then((feedback) => enqueue(() => {
            if (activeRun !== run || run.status === 'cleaning') {
              diagnostic('stale_scene_feedback', run.scene.id, category ?? undefined)
              return
            }
            setResult(result, feedback)
          }), () => enqueue(() => {
            if (activeRun === run && run.status !== 'cleaning') {
              setResult(result, { status: 'failed', errorCode: 'scene_action_feedback_failed' })
            }
          }))
        }
      } catch {
        setResult(result, { status: 'failed', errorCode: 'scene_action_dispatch_failed' })
      }
    }

    if (stage.endCondition.kind === 'duration') {
      scheduleForRun(run, stage.endCondition.durationMs, () => advanceStage(run))
    } else if (stage.endCondition.kind === 'until_stopped') {
      scheduleForRun(run, stage.endCondition.maxRuntimeMs, () => terminate(run, 'maximum_runtime'))
    } else if (run.visual === null) {
      void enqueue(() => advanceStage(run))
    }
  }

  const skipped = (
    reason: SceneRunSkipReason | 'stopped_before_start',
  ): SceneStartResult => ({
    runId: 'scene-skip-' + String(++runSequence),
    status: 'skipped',
    skipReason: reason,
  })

  const startScene = (
    scene: SceneDefinition,
    submittedBarrier: number,
    beforeStart?: () => SceneRunSkipReason | null,
  ): Promise<SceneStartResult> => enqueue(async () => {
    if (submittedBarrier !== barrierVersion) return skipped('stopped_before_start')
    const gate = beforeStart?.() ?? null
    if (gate !== null) return skipped(gate)
    if (activeRun !== null) await terminate(activeRun, 'replaced')
    if (submittedBarrier !== barrierVersion) return skipped('stopped_before_start')

    const firstStage = scene.stages[0]
    if (firstStage === undefined) return skipped('invalid_config')
    const run: ActiveRun = {
      runId: 'scene-run-' + String(++runSequence),
      scene,
      startedAt: scheduler.now(),
      abortController: new AbortController(),
      actionResults: [],
      resources: new Set(),
      stageTimers: new Set(),
      status: 'starting',
      stageIndex: 0,
      stageId: firstStage.id,
      visual: null,
      fogSafetyTimer: null,
      cleanupAttempted: false,
    }
    activeRun = run
    beginStage(run, 0)
    return { runId: run.runId, sceneId: scene.id, status: 'accepted' }
  })

  return Object.freeze({
    triggerSpell(trigger: { spellId: string; turnId: string }): Promise<SceneStartResult> {
      const submittedBarrier = barrierVersion
      const spell = spells.get(trigger.spellId)
      const scene = spell === undefined ? undefined : scenes.get(spell.sceneId)
      if (spell === undefined || !spell.enabled) return enqueue(() => skipped('disabled'))
      if (scene === undefined || !scene.enabled) return enqueue(() => skipped('invalid_config'))
      return startScene(scene, submittedBarrier, () => {
        if (consumedTurnIds.has(trigger.turnId)) return 'duplicate_turn'
        consumedTurnIds.add(trigger.turnId)
        consumedTurnOrder.push(trigger.turnId)
        if (consumedTurnOrder.length > CONSUMED_TURN_LIMIT) {
          const expired = consumedTurnOrder.shift()
          if (expired !== undefined) consumedTurnIds.delete(expired)
        }
        const startedAt = scheduler.now()
        const lastStartedAt = lastStartedBySpell.get(spell.id)
        if (lastStartedAt !== undefined && startedAt - lastStartedAt < spell.cooldownMs) return 'cooldown'
        lastStartedBySpell.set(spell.id, startedAt)
        return null
      })
    },

    runScene(sceneId: string): Promise<SceneStartResult> {
      const submittedBarrier = barrierVersion
      const scene = scenes.get(sceneId)
      return scene === undefined || !scene.enabled
        ? enqueue(() => skipped('disabled'))
        : startScene(scene, submittedBarrier)
    },

    reportAction(report: SceneActionRendererReport): Promise<'accepted' | 'stale'> {
      return enqueue(() => {
        const run = activeRun
        const result = run?.actionResults.find((candidate) =>
          candidate.actionId === report.actionId && candidate.stageId === report.stageId)
        if (
          run === null
          || run.status !== 'running'
          || run.runId !== report.runId
          || run.scene.id !== report.sceneId
          || run.stageId !== report.stageId
          || result === undefined
        ) {
          diagnostic('stale_scene_feedback', report.sceneId)
          return 'stale'
        }
        setResult(result, report.errorCode === undefined
          ? { status: report.status }
          : { status: report.status, errorCode: report.errorCode })
        return 'accepted'
      })
    },

    reportVisual(report: SceneVisualPlaybackReport): Promise<'accepted' | 'stale' | 'invalid'> {
      return enqueue(async () => {
        const run = activeRun
        if (run === null || run.status !== 'running' || !leaseMatches(run, report)) {
          diagnostic('stale_scene_event', report.sceneId, 'visual')
          return 'stale'
        }
        const visual = run.visual
        if (visual === null) return 'stale'
        const result = run.actionResults.find((candidate) =>
          candidate.actionId === visual.action.id && candidate.stageId === run.stageId)

        if (report.type === 'ready') {
          if (visual.asset?.kind === 'image') {
            clearTimer(run, visual.startTimer)
            visual.startTimer = null
            if (result !== undefined) setResult(result, { status: 'acknowledged' })
          }
          return 'accepted'
        }
        if (report.type === 'playing') {
          if (visual.asset?.kind === 'image' || !Number.isFinite(report.durationMs) || report.durationMs < 1) return 'invalid'
          if (visual.playing) return 'accepted'
          clearTimer(run, visual.startTimer)
          visual.startTimer = null
          const importedDuration = visual.asset?.durationMs
          if (importedDuration !== undefined) {
            const tolerance = Math.max(1000, Math.round(importedDuration * 0.02))
            if (Math.abs(report.durationMs - importedDuration) > tolerance) {
              await failVisual(run, 'visual_duration_mismatch')
              return 'accepted'
            }
          }
          visual.playing = true
          if (result !== undefined) setResult(result, { status: 'acknowledged' })
          resetProgressWatchdog(run)
          if (visual.action.playback === 'once') {
            visual.absoluteTimer = scheduleForRun(run, report.durationMs + VISUAL_ABSOLUTE_GRACE_MS, async () => {
              await failVisual(run, 'visual_absolute_timeout')
            })
          }
          return 'accepted'
        }
        if (report.type === 'progress') {
          if (!visual.playing || !Number.isFinite(report.currentTimeMs) || report.currentTimeMs < 0) return 'invalid'
          if (report.currentTimeMs !== visual.lastCurrentTimeMs) {
            visual.lastCurrentTimeMs = report.currentTimeMs
            resetProgressWatchdog(run)
          }
          return 'accepted'
        }
        if (report.type === 'failed') {
          await failVisual(run, report.errorCode || 'visual_playback_failed')
          return 'accepted'
        }
        if (!visual.playing || visual.action.playback !== 'once') return 'invalid'
        if (result !== undefined) setResult(result, { status: 'completed' })
        const stage = run.scene.stages[run.stageIndex]
        clearVisualTimers(run)
        run.visual = null
        if (stage?.endCondition.kind === 'video_complete') await advanceStage(run)
        else if (await releaseCategory(run, 'visual')) run.resources.delete('visual')
        return 'accepted'
      })
    },

    stopRun(target: { runId: string; turnId: string }): Promise<'stopped' | 'stale'> {
      return enqueue(async () => {
        if (activeRun === null || activeRun.runId !== target.runId) {
          diagnostic('stale_scene_stop')
          return 'stale'
        }
        await terminate(activeRun, 'stopped')
        return 'stopped'
      })
    },

    stopAll(): Promise<void> {
      barrierVersion += 1
      return enqueue(async () => {
        if (activeRun !== null) await terminate(activeRun, 'stopped')
        const released = await bounded(() => options.executor.stopAll())
        if (released) blockedResources.clear()
        else diagnostic('stop_all_cleanup_timeout')
      })
    },

    activeRunId: (): string | null => activeRun?.runId ?? null,
  })
}
