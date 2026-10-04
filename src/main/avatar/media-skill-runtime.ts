import type { AvatarControlCommand } from '../../shared/bridge'
import type { AvatarMediaSkill, MediaSkillRequest } from '../../shared/media-skill'
import type { ToolOutcome } from '../../shared/realtime-tools'
import type { SceneActionCommandContext, SceneActionRendererReport, SceneVisualPlaybackReport } from '../../shared/types'

/** One local media owner; no dialogue, identity, spell, or hardware authority. */
export function createMediaSkillRuntime(input: {
  dispatch(command: AvatarControlCommand): boolean
  report(reason: string): void
  activity?(kind: 'started' | 'finished', runId: string): void
}) {
  let sequence = 0
  let active: { context: SceneActionCommandContext; kind: 'music' | 'video'; mode: 'once' | 'loop'; fadeMs: number; position?: number; started: boolean; completeStart?: (outcome: ToolOutcome) => void } | null = null
  let launch: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const clear = () => { clearTimeout(launch); clearTimeout(watchdog); launch = watchdog = undefined }
  const stop = (reason = 'media_stopped'): ToolOutcome => {
    if (!active) return 'ignored'
    const old = active
    active = null
    clear()
    old.completeStart?.(/failed|timeout|unavailable/.test(reason) ? 'failed' : 'ignored')
    // Immediate release avoids old audio/fade timers leaking into the next item.
    input.dispatch(old.kind === 'video'
      ? { type: 'scene_visual', action: 'stop', runId: old.context.runId, sceneId: old.context.sceneId }
      : { type: 'scene_music', action: 'stop', fadeDurationMs: 0 })
    input.dispatch({ type: 'media_skill_state', active: false, hideAvatar: false, fadeMs: old.fadeMs })
    input.report(reason)
    input.activity?.('finished', old.context.runId)
    return 'accepted'
  }
  const watch = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => stop('media_playback_timeout'), 15000)
  }
  const matches = (report: SceneActionCommandContext) => active && Object.entries(active.context).every(([key, value]) => report[key as keyof SceneActionCommandContext] === value)
  return {
    isActive: () => active !== null,
    stop,
    playConfirmed(request: Extract<MediaSkillRequest, { action: 'play' }>, skill: AvatarMediaSkill): Promise<ToolOutcome> {
      const outcome = this.play(request, skill)
      if (outcome !== 'accepted' || !active || active.started) return Promise.resolve(outcome)
      return new Promise(resolve => { active!.completeStart = resolve })
    },
    play(request: Extract<MediaSkillRequest, { action: 'play' }>, skill: AvatarMediaSkill): ToolOutcome {
      if (!skill.enabled || !skill.resources.some(r => r.kind === request.kind && r.assetId === request.assetId)) return 'rejected'
      stop('media_replaced')
      const id = `media-${++sequence}`
      const context = { runId: id, sceneId: 'media-skill', stageId: id, actionId: id }
      active = { context, kind: request.kind, mode: request.mode, fadeMs: skill.fadeMs, started: false }
      input.activity?.('started', id)
      if (!input.dispatch({ type: 'media_skill_state', active: true, hideAvatar: request.kind === 'video', fadeMs: skill.fadeMs })) {
        stop('media_renderer_unavailable'); return 'failed'
      }
      const start = () => {
        launch = undefined
        if (active?.context !== context) return
        const sent = input.dispatch(request.kind === 'video'
          ? { type: 'scene_visual', action: 'start', assetId: request.assetId, fit: 'cover', playback: request.mode,
              audio: 'embedded', gain: skill.gain, fadeInMs: skill.fadeMs, fadeOutMs: 0, context }
          : { type: 'scene_music', action: 'play', assetId: request.assetId, gain: skill.gain, loop: request.mode === 'loop', context })
        if (!sent) stop('media_renderer_unavailable')
        else watch()
      }
      if (request.kind === 'video' && skill.fadeMs > 0) launch = setTimeout(start, skill.fadeMs)
      else start()
      input.report('media_requested')
      return active ? 'accepted' : 'failed'
    },
    reportAction(report: SceneActionRendererReport): boolean {
      if (!matches(report)) return false
      if (report.status === 'failed') stop('media_playback_failed')
      else if (report.status === 'acknowledged' && active) { active.started = true; active.completeStart?.('accepted'); active.completeStart = undefined; clearTimeout(watchdog); input.report('media_playing') }
      else if (report.status === 'completed' && active?.mode === 'once') stop('media_completed')
      return true
    },
    reportVisual(report: SceneVisualPlaybackReport): boolean {
      if (!matches(report)) return false
      if (report.type === 'failed') stop('media_playback_failed')
      else if (report.type === 'ended' && active?.mode === 'once') stop('media_completed')
      else if (report.type === 'playing' && active) { active.started = true; active.completeStart?.('accepted'); active.completeStart = undefined; watch(); input.report('media_playing') }
      else if (report.type === 'progress' && active && active.position !== report.currentTimeMs) {
        active.position = report.currentTimeMs; watch()
      }
      return true
    },
  }
}
