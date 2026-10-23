import { describe, it, expect, vi, afterEach } from 'vitest'
import { createMediaSkillRuntime } from '../../src/main/avatar/media-skill-runtime'
import { DEFAULT_MEDIA_SKILL, MEDIA_IMAGE_DURATION_MS } from '../../src/shared/media-skill'
import type { AvatarControlCommand } from '../../src/shared/bridge'

describe('avatar media playback ownership', () => {
  afterEach(() => vi.useRealTimers())
  function setup() {
    vi.useFakeTimers()
    const commands: AvatarControlCommand[] = [], reasons: string[] = []
    const runtime = createMediaSkillRuntime({ dispatch: command => { commands.push(command); return true }, report: reason => reasons.push(reason) })
    const skill = { ...DEFAULT_MEDIA_SKILL, resources: [{ kind: 'video' as const, assetId: 'fog', name: 'Mist', aliases: [] }, { kind: 'music' as const, assetId: 'song', name: 'Song', aliases: [] }, { kind: 'image' as const, assetId: 'sky', name: 'Night sky', aliases: [] }] }
    return { runtime, commands, reasons, skill }
  }
  it('waits for picture decode, shows it uncropped and silent, then returns after 15 seconds of display', async () => {
    const { runtime, commands, reasons, skill } = setup()
    let settled = false
    const result = runtime.playConfirmed({ action: 'play', kind: 'image', assetId: 'sky', mode: 'once' }, skill)
    void result.then(() => { settled = true })
    expect(commands.at(-1)).toMatchObject({ type: 'media_skill_state', active: true, hideAvatar: true })
    await vi.advanceTimersByTimeAsync(skill.fadeMs + 5000)
    expect(settled).toBe(false)
    const image = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>
    expect(image).toMatchObject({ playback: 'still', fit: 'contain', audio: 'muted' })
    runtime.reportVisual({ ...image.context, type: 'ready' })
    await expect(result).resolves.toBe('accepted')
    await vi.advanceTimersByTimeAsync(MEDIA_IMAGE_DURATION_MS - 1)
    expect(runtime.isActive()).toBe(true)
    // Duplicate ready must not extend the display duration.
    runtime.reportVisual({ ...image.context, type: 'ready' })
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.isActive()).toBe(false)
    expect(commands.at(-2)).toMatchObject({ type: 'scene_visual', action: 'stop', runId: image.context.runId })
    expect(commands.at(-1)).toMatchObject({ active: false, hideAvatar: false })
    expect(reasons).toContain('media_completed')
  })
  it('holds a looping picture without a progress watchdog; replacement cancels the old timer', async () => {
    const { runtime, commands, reasons, skill } = setup()
    const start = async (mode: 'once' | 'loop') => {
      const result = runtime.playConfirmed({ action: 'play', kind: 'image', assetId: 'sky', mode }, skill)
      await vi.advanceTimersByTimeAsync(skill.fadeMs)
      const image = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>
      runtime.reportVisual({ ...image.context, type: 'ready' })
      await expect(result).resolves.toBe('accepted')
      return image
    }
    const old = await start('once')
    await vi.advanceTimersByTimeAsync(5000)
    await start('loop')
    runtime.reportVisual({ ...old.context, type: 'ready' })
    await vi.advanceTimersByTimeAsync(60000)
    expect(runtime.isActive()).toBe(true)
    expect(reasons).not.toContain('media_playback_timeout')
    expect(reasons).toContain('media_report_stale')
    runtime.stop()
    expect(runtime.isActive()).toBe(false)
  })
  it('returns a failed picture load without claiming display and cancels pending startup on Stop', async () => {
    const { runtime, commands, skill } = setup()
    const result = runtime.playConfirmed({ action: 'play', kind: 'image', assetId: 'sky', mode: 'once' }, skill)
    await vi.advanceTimersByTimeAsync(skill.fadeMs)
    const image = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>
    runtime.reportVisual({ ...image.context, type: 'failed', errorCode: 'visual_image_decode_failed' })
    await expect(result).resolves.toBe('failed')
    expect(runtime.isActive()).toBe(false)
    const pending = runtime.playConfirmed({ action: 'play', kind: 'image', assetId: 'sky', mode: 'loop' }, skill)
    runtime.stop()
    await expect(pending).resolves.toBe('ignored')
    await vi.advanceTimersByTimeAsync(20000)
    expect(commands.filter(c => c.type === 'scene_visual' && c.action === 'start')).toHaveLength(1)
  })
  it('uses the same once/loop ownership for YouTube and releases the isolated player on Stop', async () => {
    const { commands, reasons, skill } = setup()
    let report!: (value: import('../../src/shared/types').SceneActionRendererReport) => void
    let context!: import('../../src/shared/types').SceneActionCommandContext
    const youtube = { play: vi.fn((request, callback) => { context = request.context; report = callback; return true }), stop: vi.fn() }
    const runtime = createMediaSkillRuntime({ youtube, dispatch: command => { commands.push(command); return true }, report: reason => reasons.push(reason) })
    const once = runtime.playConfirmed({ action: 'play_youtube', kind: 'music', url: 'https://youtu.be/abcdefghijk', mode: 'once' }, skill)
    report({ ...context, status: 'acknowledged' })
    expect(await once).toBe('accepted')
    report({ ...context, status: 'completed' })
    expect(runtime.isActive()).toBe(false)
    expect(commands.at(-1)).toMatchObject({ active: false, hideAvatar: false })
    expect(youtube.stop).toHaveBeenCalledOnce()
    const loop = runtime.playConfirmed({ action: 'play_youtube', kind: 'music', url: 'https://youtu.be/abcdefghijk', mode: 'loop' }, skill)
    report({ ...context, status: 'acknowledged' }); await loop
    report({ ...context, status: 'completed' })
    expect(runtime.isActive()).toBe(true)
    runtime.stop()
    expect(youtube.stop).toHaveBeenCalledTimes(2)
  })
  it('copies cloud media before the player starts, cancels on Stop and reports a failed copy', async () => {
    const { runtime, commands, reasons, skill } = setup()
    let finish!: (ready: boolean) => void
    const copy = () => new Promise<boolean>(resolve => { finish = resolve })
    const pending = runtime.playConfirmed({ action: 'play', kind: 'music', assetId: 'song', mode: 'once' }, skill, copy)
    // A slow Drive download never trips the player watchdog, and the avatar stays visible meanwhile.
    await vi.advanceTimersByTimeAsync(60000)
    expect(commands.some(c => c.type === 'scene_music' || c.type === 'media_skill_state')).toBe(false)
    expect(runtime.isActive()).toBe(true)
    finish(true); await vi.advanceTimersByTimeAsync(0)
    const music = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_music'; action: 'play' }>
    expect(commands.at(-2)).toMatchObject({ type: 'media_skill_state', active: true })
    expect(music).toMatchObject({ type: 'scene_music', action: 'play', assetId: 'song' })
    runtime.reportAction({ ...music.context!, status: 'acknowledged' })
    expect(await pending).toBe('accepted')
    const stopped = runtime.playConfirmed({ action: 'play', kind: 'music', assetId: 'song', mode: 'once' }, skill, copy)
    runtime.stop()
    expect(await stopped).toBe('ignored')
    finish(true); await vi.advanceTimersByTimeAsync(0)
    expect(commands.filter(c => c.type === 'scene_music' && c.action === 'play')).toHaveLength(1)
    expect(await runtime.playConfirmed({ action: 'play', kind: 'music', assetId: 'song', mode: 'once' }, skill, async () => false)).toBe('failed')
    expect(reasons).toContain('media_file_unavailable')
    expect(runtime.isActive()).toBe(false)
  })
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
  it('confirms video only after the player starts, uses full-screen cover, and reports load failures', async () => {
    const { runtime, commands, skill } = setup()
    let settled = false
    const result = runtime.playConfirmed({ action: 'play', kind: 'video', assetId: 'fog', mode: 'loop' }, skill)
    void result.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(skill.fadeMs)
    expect(settled).toBe(false)
    const video = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_visual'; action: 'start' }>
    expect(video.fit).toBe('cover')
    runtime.reportVisual({ ...video.context, type: 'playing', durationMs: 8000 })
    await expect(result).resolves.toBe('accepted')
    const failed = runtime.playConfirmed({ action: 'play', kind: 'video', assetId: 'fog', mode: 'once' }, skill)
    await vi.advanceTimersByTimeAsync(skill.fadeMs)
    const next = commands.at(-1) as typeof video
    runtime.reportVisual({ ...next.context, type: 'failed', errorCode: 'visual_video_decode_failed' })
    await expect(failed).resolves.toBe('failed')
    expect(commands.at(-1)).toMatchObject({ type: 'media_skill_state', active: false, hideAvatar: false })
  })
  it('settles a cancelled or timed-out startup without accepting a stale player report', async () => {
    const { runtime, commands, skill, reasons } = setup()
    const cancelled = runtime.playConfirmed({ action: 'play', kind: 'music', assetId: 'song', mode: 'loop' }, skill)
    const old = commands.at(-1) as Extract<AvatarControlCommand, { type: 'scene_music'; action: 'play' }>
    runtime.stop()
    await expect(cancelled).resolves.toBe('ignored')
    const pending = runtime.playConfirmed({ action: 'play', kind: 'music', assetId: 'song', mode: 'once' }, skill)
    runtime.reportAction({ ...old.context!, status: 'acknowledged' })
    expect(reasons).toContain('media_report_stale')
    await vi.advanceTimersByTimeAsync(15001)
    await expect(pending).resolves.toBe('failed')
  })
})
