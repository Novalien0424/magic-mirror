import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createYoutubePlayer, youtubePlayerHtml } from '../../src/main/avatar/youtube-player'
import type { YoutubePlayback } from '../../src/shared/youtube-media'

const f = vi.hoisted(() => ({ views: [] as any[], partitions: [] as any[], state: { state: -1, time: 0, error: false } }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    session: { fromPartition: vi.fn((partition, options) => {
      const value = Object.assign(new EventEmitter(), { partition, options, setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
        protocol: { handle: vi.fn() }, webRequest: { onBeforeRequest: vi.fn(), onBeforeSendHeaders: vi.fn() }, fetch: vi.fn() })
      f.partitions.push(value); return value
    }) },
    WebContentsView: class {
      webContents = Object.assign(new EventEmitter(), { isDestroyed: vi.fn(() => false), close: vi.fn(),
        executeJavaScript: vi.fn(async () => f.state), loadURL: vi.fn(async () => {}), setWindowOpenHandler: vi.fn() })
      setBounds = vi.fn()
      constructor(readonly options: unknown) { f.views.push(this) }
    },
  }
})
const request: YoutubePlayback = { videoId: 'abcdefghijk', kind: 'video', mode: 'once', gain: .5,
  context: { runId: 'media-1', sceneId: 'media-skill', stageId: 'media-1', actionId: 'media-1' } }
const parent = () => Object.assign(new EventEmitter(), { isDestroyed: () => false, isVisible: () => true, isMinimized: () => false,
  getContentSize: () => [1080, 1920], contentView: { addChildView: vi.fn(), removeChildView: vi.fn() } })
afterEach(() => { vi.useRealTimers(); f.views.length = 0; f.partitions.length = 0; f.state = { state: -1, time: 0, error: false } })

describe('isolated visible YouTube player', () => {
  it('uses elapsed playback progress across NTP jumps and still times out a stuck player', async () => {
    vi.useFakeTimers()
    const win = parent(), report = vi.fn(), player = createYoutubePlayer(() => win as never)
    player.play(request, report)
    vi.setSystemTime(Date.now() + 3_600_000)
    f.state = { state: 1, time: 1, error: false }
    await vi.advanceTimersByTimeAsync(500)
    expect(report).toHaveBeenLastCalledWith({ ...request.context, status: 'acknowledged' })
    vi.setSystemTime(Date.now() - 7_200_000)
    await vi.advanceTimersByTimeAsync(30_500)
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', errorCode: 'youtube_playback_timeout' }))
    player.stop()
  })
  it('keeps YouTube controls visible and configures single-video looping with the required app origin', () => {
    const html = youtubePlayerHtml({ ...request, mode: 'loop' })
    expect(html).toContain('"loop":1,"playlist":"abcdefghijk"')
    expect(html).toContain('"origin":"https://com.magicmirror.app"')
    expect(html).toContain('"controls":1')
    expect(html).toContain('onAutoplayBlocked')
    expect(youtubePlayerHtml(request)).not.toContain('"playlist"')
    expect(() => youtubePlayerHtml({ ...request, videoId: '</script>' })).toThrow('youtube_request_invalid')
  })
  it('acknowledges actual playing, reports once completion, and owns sandbox/permissions/cleanup', async () => {
    vi.useFakeTimers()
    const win = parent(), report = vi.fn(), player = createYoutubePlayer(() => win as never)
    expect(player.play(request, report)).toBe(true)
    const view = f.views[0], isolated = f.partitions[0]
    expect(view.options.webPreferences).toMatchObject({ session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true })
    expect(view.options.webPreferences.preload).toBeUndefined()
    expect(isolated.partition).not.toMatch(/^persist:/)
    expect(isolated.options.cache).toBe(false)
    const permission = vi.fn()
    isolated.setPermissionRequestHandler.mock.calls[0][0](null, 'media', permission)
    expect(permission).toHaveBeenCalledWith(false)
    const headers = vi.fn()
    expect(isolated.webRequest.onBeforeSendHeaders.mock.calls[0][0]).toEqual({ urls: ['https://www.youtube.com/embed/*'] })
    isolated.webRequest.onBeforeSendHeaders.mock.calls[0][1]({ requestHeaders: { referer: 'untrusted', Accept: '*/*' } }, headers)
    expect(headers).toHaveBeenCalledWith({ requestHeaders: { Accept: '*/*', Referer: 'https://com.magicmirror.app/' } })
    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 1080, height: 1920 })
    await vi.advanceTimersByTimeAsync(500)
    expect(report).not.toHaveBeenCalled()
    f.state = { state: 1, time: 1, error: false }
    await vi.advanceTimersByTimeAsync(500)
    expect(report).toHaveBeenCalledWith({ ...request.context, status: 'acknowledged' })
    f.state = { state: 0, time: 10, error: false }
    await vi.advanceTimersByTimeAsync(500)
    expect(report).toHaveBeenLastCalledWith({ ...request.context, status: 'completed' })
    expect(view.webContents.close).toHaveBeenCalledOnce()
    expect(win.contentView.removeChildView).toHaveBeenCalledWith(view)
    player.stop()
    expect(view.webContents.close).toHaveBeenCalledOnce()
  })
  it('preserves a visible looping music player until Stop and fails when hidden or blocked', async () => {
    vi.useFakeTimers()
    const win = parent(), report = vi.fn(), player = createYoutubePlayer(() => win as never)
    player.play({ ...request, mode: 'loop', kind: 'music' }, report)
    expect(f.views[0].setBounds).toHaveBeenCalledWith({ x: 0, y: 1312, width: 1080, height: 608 })
    f.state = { state: 1, time: 1, error: false }
    await vi.advanceTimersByTimeAsync(500)
    f.state = { state: 0, time: 10, error: false }
    await vi.advanceTimersByTimeAsync(500)
    expect(report).toHaveBeenCalledTimes(1)
    player.stop()
    expect(f.views[0].webContents.close).toHaveBeenCalledOnce()
    player.play(request, report)
    win.emit('hide')
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }))
    player.play(request, report)
    f.state = { state: -1, time: 0, error: true }
    await vi.advanceTimersByTimeAsync(500)
    expect(f.views[2].webContents.close).toHaveBeenCalledOnce()
    player.stop()
  })
  it('applies live music volume and reports a configured-output fallback without exposing device IDs', async () => {
    vi.useFakeTimers()
    const win = parent(), report = vi.fn(), preferences = { inputId: '', inputLabel: '', outputId: 'synthetic-device', volumes: { bgm: .5, avatar: 1, effects: 1 } }
    const player = createYoutubePlayer(() => win as never, { preferences: () => preferences, report })
    player.play({ ...request, kind: 'music' }, vi.fn())
    expect(report).toHaveBeenCalledExactlyOnceWith('youtube_system_audio_output')
    preferences.volumes.bgm = .2
    await vi.advanceTimersByTimeAsync(500)
    expect(f.views[0].webContents.executeJavaScript).toHaveBeenCalledWith('void player?.setVolume(10)')
    player.stop()
  })
})
