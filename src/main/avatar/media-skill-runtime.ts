import type { AvatarControlCommand } from '../../shared/bridge'
import type { AvatarMediaSkill, MediaSkillRequest } from '../../shared/media-skill'
import type { ToolOutcome } from '../../shared/realtime-tools'
import type { SceneActionCommandContext, SceneActionRendererReport, SceneVisualPlaybackReport } from '../../shared/types'
import { youtubeVideoId, type YoutubePlayer } from '../../shared/youtube-media'

type PlaybackRequest = Exclude<MediaSkillRequest, { action: 'stop' }>

/** One local media owner; no dialogue, identity, spell, or hardware authority. */
export function createMediaSkillRuntime(input: {
  dispatch(command: AvatarControlCommand): boolean
  report(reason: string): void
  activity?(kind: 'started' | 'finished', runId: string): void
  youtube?: YoutubePlayer
}) {
  let sequence = 0
  let active: { context: SceneActionCommandContext; kind: 'music' | 'video'; youtube: boolean; mode: 'once' | 'loop'; fadeMs: number; position?: number; started: boolean; completeStart?: (outcome: ToolOutcome) => void } | null = null
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
    if (old.youtube) input.youtube?.stop()
    else input.dispatch(old.kind === 'video'
      ? { type: 'scene_visual', action: 'stop', runId: old.context.runId, sceneId: old.context.sceneId }
      : { type: 'scene_music', action: 'stop', fadeDurationMs: 0 })
    input.dispatch({ type: 'media_skill_state', active: false, hideAvatar: false, fadeMs: old.fadeMs })
    input.report(reason)
    input.activity?.('finished', old.context.runId)
    return 'accepted'
  }
  const watch = (timeoutMs = 15000) => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => stop('media_playback_timeout'), timeoutMs)
  }
  const matches = (report: SceneActionCommandContext) => active && Object.entries(active.context).every(([key, value]) => report[key as keyof SceneActionCommandContext] === value)
  return {
    isActive: () => active !== null,
    activeRunId: () => active?.context.runId,
    stop,
    playConfirmed(request: PlaybackRequest, skill: AvatarMediaSkill): Promise<ToolOutcome> {
      const outcome = this.play(request, skill)
      if (outcome !== 'accepted' || !active || active.started) return Promise.resolve(outcome)
      return new Promise(resolve => { active!.completeStart = resolve })
    },
    play(request: PlaybackRequest, skill: AvatarMediaSkill): ToolOutcome {
      const videoId = request.action === 'play_youtube' ? youtubeVideoId(request.url) : null
      if (!skill.enabled || (request.action === 'play'
        ? !skill.resources.some(r => r.kind === request.kind && r.assetId === request.assetId)
        : !videoId || !input.youtube)) return 'rejected'
      stop('media_replaced')
      const id = `media-${++sequence}`
      const context = { runId: id, sceneId: 'media-skill', stageId: id, actionId: id }
      active = { context, kind: request.kind, youtube: request.action === 'play_youtube', mode: request.mode, fadeMs: skill.fadeMs, started: false }
      input.activity?.('started', id)
      if (!input.dispatch({ type: 'media_skill_state', active: true, hideAvatar: request.kind === 'video', fadeMs: skill.fadeMs })) {
        stop('media_renderer_unavailable'); return 'failed'
      }
      const start = () => {
        launch = undefined
        if (active?.context !== context) return
        try {
          const sent = request.action === 'play_youtube'
            ? input.youtube!.play({ videoId: videoId!, kind: request.kind, mode: request.mode, gain: skill.gain, context }, report => { this.reportAction(report) })
            : input.dispatch(request.kind === 'video'
            ? { type: 'scene_visual', action: 'start', assetId: request.assetId, fit: 'cover', playback: request.mode,
                audio: 'embedded', gain: skill.gain, fadeInMs: skill.fadeMs, fadeOutMs: 0, context }
            : { type: 'scene_music', action: 'play', assetId: request.assetId, gain: skill.gain, loop: request.mode === 'loop', context })
          if (!sent) stop('media_renderer_unavailable')
          else if (active?.context === context && !active.started) watch(request.action === 'play_youtube' ? 60000 : 15000)
        } catch { stop('media_playback_failed') }
      }
      if (request.kind === 'video' && skill.fadeMs > 0) launch = setTimeout(start, skill.fadeMs)
      else start()
      input.report('media_requested')
      return active ? 'accepted' : 'failed'
    },
    reportAction(report: SceneActionRendererReport): boolean {
      if (!matches(report)) {
        if (report.sceneId !== 'media-skill') return false
        input.report('media_report_stale'); return true
      }
      if (report.status === 'failed') {
        if (active?.youtube && report.errorCode && /^youtube_(?:player_error_(?:2|5|100|101|150|153)|autoplay_blocked|playback_failed|playback_timeout)$/.test(report.errorCode)) input.report(report.errorCode)
        stop('media_playback_failed')
      }
      else if (report.status === 'acknowledged' && active) { active.started = true; active.completeStart?.('accepted'); active.completeStart = undefined; clearTimeout(watchdog); input.report('media_playing') }
      else if (report.status === 'completed' && active?.mode === 'once') stop('media_completed')
      return true
    },
    reportVisual(report: SceneVisualPlaybackReport): boolean {
      if (!matches(report)) {
        if (report.sceneId !== 'media-skill') return false
        input.report('media_report_stale'); return true
      }
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
