import { describe, it, expect, vi, afterEach } from 'vitest'
import { createMediaSkillRuntime } from '../../src/main/avatar/media-skill-runtime'
import { DEFAULT_MEDIA_SKILL } from '../../src/shared/media-skill'
import type { AvatarControlCommand } from '../../src/shared/bridge'

describe('avatar media playback ownership', () => {
  afterEach(() => vi.useRealTimers())
  function setup() {
    vi.useFakeTimers()
    const commands: AvatarControlCommand[] = [], reasons: string[] = []
    const runtime = createMediaSkillRuntime({ dispatch: command => { commands.push(command); return true }, report: reason => reasons.push(reason) })
    const skill = { ...DEFAULT_MEDIA_SKILL, resources: [{ kind: 'video' as const, assetId: 'fog', name: 'Mist', aliases: [] }, { kind: 'music' as const, assetId: 'song', name: 'Song', aliases: [] }] }
    return { runtime, commands, reasons, skill }
  }
  it('fades the avatar before video and returns it after once playback', async () => {
    const { runtime, commands, skill } = setup()
    expect(runtime.play({ action: 'play', kind: 'video', assetId: 'fog', mode: 'once' }, skill)).toBe('accepted')
    expect(commands.at(-1)).toMatchObject({ type: 'media_skill_state', active: true, hideAvatar: true })
    expect(commands.some(c => c.type === 'scene_visual')).toBe(false)
    await vi.advanceTimersByTimeAsync(skill.fadeMs)
    const video = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>
    expect(video).toMatchObject({ type: 'scene_visual', playback: 'once' })
    runtime.reportVisual({ ...video.context, type: 'ended' })
    expect(commands.at(-1)).toMatchObject({ type: 'media_skill_state', active: false, hideAvatar: false })
  })
  it('keeps music visible, loops until stopped, ignores obsolete completions', () => {
    const { runtime, commands, skill } = setup()
    runtime.play({ action: 'play', kind: 'music', assetId: 'song', mode: 'loop' }, skill)
    const music = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_music'; action: 'play' }>
    expect(commands.at(-2)).toMatchObject({ hideAvatar: false, active: true })
    expect(music.loop).toBe(true)
    runtime.reportAction({ ...music.context!, status: 'completed' })
    expect(runtime.isActive()).toBe(true)
    runtime.stop()
    runtime.reportAction({ ...music.context!, status: 'failed', errorCode: 'stale' })
    expect(runtime.isActive()).toBe(false)
  })
  it('cancels a pending video on replacement and recovers a failed load', async () => {
    const { runtime, commands, reasons, skill } = setup()
    runtime.play({ action: 'play', kind: 'video', assetId: 'fog', mode: 'loop' }, skill)
    runtime.play({ action: 'play', kind: 'music', assetId: 'song', mode: 'once' }, skill)
    await vi.advanceTimersByTimeAsync(16000)
    expect(commands.filter(c => c.type === 'scene_visual' && c.action === 'start')).toHaveLength(0)
    expect(runtime.isActive()).toBe(false)
    expect(reasons).toContain('media_playback_timeout')
  })
  it('rejects disabled, unlisted and traversal resources', () => {
    const { runtime, skill } = setup()
    expect(runtime.play({ action: 'play', kind: 'music', assetId: 'missing', mode: 'once' }, skill)).toBe('rejected')
    expect(runtime.play({ action: 'play', kind: 'music', assetId: 'song', mode: 'once' }, { ...skill, enabled: false })).toBe('rejected')
  })
})
