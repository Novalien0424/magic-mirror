import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvatarMediaController } from '../../../src/renderer/avatar/audio/avatar-media-controller'
import { getAudioDeviceRouter } from '../../../src/renderer/audio-devices'
import { DEFAULT_AUDIO_PREFERENCES } from '../../../src/shared/audio-devices'
import type { SceneActionCommandContext } from '../../../src/shared/types'

class FakeNode {
  readonly connections: FakeNode[] = []
  readonly disconnect = vi.fn()
  connect(node: FakeNode): FakeNode {
    this.connections.push(node)
    return node
  }
}

class FakeGain extends FakeNode {
  readonly ramps: number[] = []
  readonly gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((value: number) => { this.gain.value = value }),
    linearRampToValueAtTime: vi.fn((value: number) => {
      this.gain.value = value
      this.ramps.push(value)
    }),
  }
}

class FakeAnalyser extends FakeNode {
  fftSize = 0
  frequencyBinCount = 8
  getByteTimeDomainData(values: Uint8Array): void { values.fill(128) }
}

class FakeAudio {
  crossOrigin = ''
  private source = ''
  get src(): string { return this.source }
  set src(value: string) {
    this.source = value
    this.currentTime = 0
    this.ended = false
    this.error = null
  }
  preload = ''
  loop = false
  duration = 5
  currentTime = 0
  ended = false
  paused = true
  networkState = 1
  readyState = 4
  error: { code: number } | null = null
  volume = 1
  readonly play = vi.fn(async () => { this.paused = false })
  readonly pause = vi.fn(() => { if (!this.paused) { this.paused = true; this.emit('pause') } })
  readonly listeners = new Map<string, Set<() => void>>()
  addEventListener(type: string, callback: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(callback)
  }
  removeEventListener(type: string, callback: () => void): void {
    this.listeners.get(type)?.delete(callback)
  }
  emit(type: string): void {
    for (const callback of [...this.listeners.get(type) ?? []]) callback()
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setupMusicController() {
  vi.useFakeTimers()
  const audioElements: FakeAudio[] = []
  const contexts: FakeAudioContext[] = []
  class FakeAudioContext {
    constructor() { contexts.push(this) }
    currentTime = 0
    destination = new FakeNode()
    createAnalyser = () => new FakeAnalyser()
    createGain = () => new FakeGain()
    createMediaElementSource = () => new FakeNode()
    resume = vi.fn(async () => undefined)
    suspend = vi.fn(async () => undefined)
    setSinkId = vi.fn(async () => undefined)
    close = vi.fn(async () => undefined)
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('Audio', class extends FakeAudio { constructor() { super(); audioElements.push(this) } })
  vi.stubGlobal('window', { setTimeout, clearTimeout })
  let objectUrl = 0
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:music-${++objectUrl}`), revokeObjectURL: vi.fn() })
  const fetchMedia = vi.fn(async () => ({ ok: true, blob: async () => new Blob() }))
  vi.stubGlobal('fetch', fetchMedia)
  const eventSink = vi.fn()
  const controller = createAvatarMediaController({
    onRecordedOutput: vi.fn(), onActivity: vi.fn(), onChanged: vi.fn(), eventSink,
  })
  return { controller, music: audioElements[0]!, context: contexts[0]!, eventSink, fetchMedia }
}

const sceneContext = (actionId: string): SceneActionCommandContext => ({
  runId: 'run', sceneId: 'scene', stageId: 'stage', actionId,
})

async function flushMusicTasks(): Promise<void> {
  for (let task = 0; task < 20; task += 1) await Promise.resolve()
}

async function playSceneMusic(
  fixture: ReturnType<typeof setupMusicController>,
  actionContext = sceneContext('play'),
  loop = false,
): Promise<void> {
  fixture.controller.handleCommand({
    type: 'scene_music', action: 'play', assetId: actionContext.actionId, gain: 0.5, loop, context: actionContext,
  })
  await flushMusicTasks()
  expect(fixture.eventSink).toHaveBeenCalledWith('avatar_music_started', actionContext)
}

describe('Avatar shared background audio bus', () => {
  it('suspends the idle media graph and resumes only for attached playback', async () => {
    const f = setupMusicController()
    await flushMusicTasks()
    expect(f.music.preload).toBe('none')
    expect(f.context.suspend).toHaveBeenCalledOnce()
    await playSceneMusic(f, sceneContext('play'))
    expect(f.context.resume).toHaveBeenCalled()
    const before = f.context.suspend.mock.calls.length
    f.controller.handleCommand({ type: 'scene_music', action: 'stop', fadeDurationMs: 0 })
    await flushMusicTasks()
    expect(f.context.suspend.mock.calls.length).toBeGreaterThan(before)
    f.controller.dispose()
  })
  it('feeds authored music and embedded video through one duck gain and uses explicit draft media', async () => {
    const audioElements: FakeAudio[] = []
    const sources: FakeNode[] = []
    const gains: FakeGain[] = []
    class FakeAudioContext {
      currentTime = 0
      destination = new FakeNode()
      createAnalyser = () => new FakeAnalyser()
      createGain = () => { const gain = new FakeGain(); gains.push(gain); return gain }
      createMediaElementSource = () => { const source = new FakeNode(); sources.push(source); return source }
      createBufferSource = () => new FakeNode()
      decodeAudioData = vi.fn()
      resume = vi.fn(async () => undefined)
      suspend = vi.fn(async () => undefined)
      setSinkId = vi.fn(async () => undefined)
      close = vi.fn(async () => undefined)
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('Audio', class extends FakeAudio { constructor() { super(); audioElements.push(this) } })
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
    const fetchMedia = vi.fn(async () => ({ ok: true, blob: async () => new Blob() }))
    vi.stubGlobal('fetch', fetchMedia)

    const controller = createAvatarMediaController({
      onRecordedOutput: vi.fn(), onActivity: vi.fn(), onChanged: vi.fn(), eventSink: vi.fn(),
    })
    const video = new FakeAudio() as unknown as HTMLVideoElement
    controller.setLifecycle('dormant')
    controller.setSceneVideoAudio(video, 0.4)

    const musicSource = sources[0]!
    const videoSource = sources[1]!
    const musicAnalyser = musicSource.connections[0]!
    const musicAuthoredGain = musicAnalyser.connections[0]!
    const musicMaster = musicAuthoredGain.connections[0] as FakeGain
    const sharedAnalyser = musicMaster.connections[0]!
    expect((sharedAnalyser.connections[0] as FakeGain).gain.value).toBe(1)
    const videoAuthoredGain = videoSource.connections[0]!
    const effectsMaster = videoAuthoredGain.connections[0] as FakeGain
    expect(effectsMaster.connections[0]).toBe(sharedAnalyser)
    controller.setSceneVideoAudio(video, 0.4, 120)
    expect(sources).toHaveLength(2)
    expect((videoAuthoredGain as FakeGain).ramps.at(-1)).toBe(0.4)

    const realtime = { setVolume: vi.fn(), audioElement: new FakeAudio() }
    controller.setRealtimeOutput(realtime as never)
    await getAudioDeviceRouter().select({ ...DEFAULT_AUDIO_PREFERENCES, volumes: { bgm: 0.3, avatar: 0.7, effects: 0 } })
    expect(musicMaster.gain.value).toBe(0.3)
    expect(effectsMaster.gain.value).toBe(0)
    expect((videoAuthoredGain as FakeGain).gain.value).toBe(0.4)
    expect(realtime.setVolume).toHaveBeenLastCalledWith(0.7)

    controller.handleActivity('output_started')
    const sharedDuckGain = sharedAnalyser.connections[0] as FakeGain
    expect(sharedDuckGain.ramps.at(-1)).toBe(0.22)
    controller.handleCommand({ type: 'music', action: 'stop' })
    expect(sharedDuckGain.gain.value).toBe(0.22)
    expect(gains).toContain(sharedDuckGain)
    controller.handleCommand({ type: 'scene_music', action: 'fade', targetGain: 0.5, durationMs: 100 })
    expect((musicAuthoredGain as FakeGain).gain.value).toBe(0.5)
    expect(musicMaster.gain.value).toBe(0.3)
    expect(sharedDuckGain.gain.value).toBe(0.22)
    expect(controller.snapshot().musicGain).toBeCloseTo(0.033)

    await getAudioDeviceRouter().select({ ...DEFAULT_AUDIO_PREFERENCES, volumes: { bgm: 0, avatar: 0, effects: 0.8 } })
    expect(musicMaster.gain.value).toBe(0)
    expect(effectsMaster.gain.value).toBe(0.8)
    expect(realtime.setVolume).toHaveBeenLastCalledWith(0)
    controller.handleActivity('output_stopped')
    expect(musicMaster.gain.value).toBe(0)
    expect(sharedDuckGain.ramps.at(-1)).toBe(1)

    controller.setSceneVideoAudio(null)
    expect(videoSource.disconnect).toHaveBeenCalledTimes(1)
    expect(musicSource.disconnect).not.toHaveBeenCalled()
    controller.handleCommand({ type: 'scene_music', action: 'play', assetId: 'preview-audio', gain: 0.5, loop: false, preview: true })
    await vi.waitFor(() => expect(fetchMedia).toHaveBeenCalledWith('magic-mirror-media://music-draft/preview-audio'))
    await vi.waitFor(() => expect(audioElements[0]!.play).toHaveBeenCalledTimes(1))
    let completeFetch!: (value: { ok: boolean; blob: () => Promise<Blob> }) => void
    fetchMedia.mockImplementationOnce(() => new Promise(resolve => { completeFetch = resolve }))
    controller.handleCommand({ type: 'scene_music', action: 'play', assetId: 'late-audio', gain: 0.5, loop: false })
    controller.setLifecycle('offlineLoop')
    completeFetch({ ok: true, blob: async () => new Blob() })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(audioElements[0]!.play).toHaveBeenCalledTimes(1)
    controller.dispose()
    await getAudioDeviceRouter().select(DEFAULT_AUDIO_PREFERENCES)
    expect(musicMaster.gain.value).toBe(0)
  })
})

describe('Scene music playback ownership', () => {
  it.each(['ended', 'error'] as const)('reports %s once using the playback context', async (event) => {
    const fixture = setupMusicController()
    const { controller, music, eventSink } = fixture
    const actionContext = sceneContext('owner')
    await playSceneMusic(fixture, actionContext)
    const callback = [...music.listeners.get(event)!][0]!
    music.ended = event === 'ended'
    music.error = event === 'error' ? { code: 3 } : null
    music.emit(event)
    callback()
    music.emit(event)
    const reason = event === 'ended'
      ? 'avatar_music_completed'
      : 'avatar_music_play_failed:code_3:network_1:ready_4'
    expect(eventSink.mock.calls.filter(([value]) => value === reason)).toEqual([[reason, actionContext]])
    expect(vi.getTimerCount()).toBe(0)
    controller.dispose()
  })

  it('pauses immediately on replacement and cancels the old fade and media callbacks', async () => {
    const fixture = setupMusicController()
    const { controller, music, eventSink, fetchMedia } = fixture
    await playSceneMusic(fixture, sceneContext('old-play'))
    const oldEnded = [...music.listeners.get('ended')!][0]!
    const oldError = [...music.listeners.get('error')!][0]!
    controller.handleCommand({ type: 'scene_music', action: 'fade', targetGain: 0, durationMs: 1_000, context: sceneContext('old-fade') })
    let finishFetch!: (value: { ok: boolean; blob: () => Promise<Blob> }) => void
    fetchMedia.mockImplementationOnce(() => new Promise(resolve => { finishFetch = resolve }))
    const newContext = sceneContext('replacement')
    controller.handleCommand({ type: 'scene_music', action: 'play', assetId: 'new', gain: 0.5, loop: false, context: newContext })
    expect(music.paused).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    music.ended = true
    music.error = { code: 3 }
    oldEnded()
    oldError()
    finishFetch({ ok: true, blob: async () => new Blob() })
    await flushMusicTasks()
    expect(eventSink).toHaveBeenCalledWith('avatar_music_started', newContext)
    oldEnded()
    oldError()
    // A queued event on the reused element must also reflect the new resource's state.
    music.emit('ended')
    music.emit('error')
    music.currentTime = 0.5
    await vi.advanceTimersByTimeAsync(1_000)
    expect(music.paused).toBe(false)
    expect(eventSink.mock.calls.some(([reason]) => /completed|play_failed|stopped/.test(reason))).toBe(false)
    controller.dispose()
  })

  it.each([0, 400])('cancels an old fade on a %ims stop and preserves the stop context', async (fadeDurationMs) => {
    const fixture = setupMusicController()
    const { controller, music, eventSink } = fixture
    await playSceneMusic(fixture)
    controller.handleCommand({ type: 'scene_music', action: 'fade', targetGain: 0.2, durationMs: 1_000, context: sceneContext('fade') })
    const stopContext = sceneContext('stop')
    controller.handleCommand({ type: 'scene_music', action: 'stop', fadeDurationMs, context: stopContext })
    music.ended = true
    music.error = { code: 3 }
    music.emit('ended')
    music.emit('error')
    await vi.advanceTimersByTimeAsync(16_000)
    expect(eventSink.mock.calls.filter(([reason]) => /completed|play_failed|stopped/.test(reason))).toEqual([
      ['avatar_music_stopped', stopContext],
    ])
    expect(music.paused).toBe(true)
    expect(music.currentTime).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    controller.dispose()
  })

  it('completes only the newest fade with its own command context', async () => {
    const fixture = setupMusicController()
    const { controller, eventSink } = fixture
    await playSceneMusic(fixture)
    controller.handleCommand({ type: 'scene_music', action: 'fade', targetGain: 0.2, durationMs: 500, context: sceneContext('old-fade') })
    const fadeContext = sceneContext('new-fade')
    controller.handleCommand({ type: 'scene_music', action: 'fade', targetGain: 0.3, durationMs: 100, context: fadeContext })
    await vi.advanceTimersByTimeAsync(500)
    expect(eventSink.mock.calls.filter(([reason]) => reason === 'avatar_music_fade_completed')).toEqual([
      ['avatar_music_fade_completed', fadeContext],
    ])
    controller.dispose()
  })

  it.each(['load', 'play'] as const)('ignores a replaced asynchronous %s failure', async (stage) => {
    const fixture = setupMusicController()
    const { controller, music, eventSink, fetchMedia } = fixture
    let rejectOld!: (reason: Error) => void
    if (stage === 'load') fetchMedia.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    else music.play.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    controller.handleCommand({ type: 'scene_music', action: 'play', assetId: 'old', gain: 1, loop: false, context: sceneContext('old') })
    await flushMusicTasks()
    const newContext = sceneContext('new')
    await playSceneMusic(fixture, newContext)
    rejectOld(new Error('obsolete'))
    await flushMusicTasks()
    expect(eventSink.mock.calls.filter(([reason]) => /started|play_failed/.test(reason))).toEqual([
      ['avatar_music_started', newContext],
    ])
    controller.dispose()
  })

  it('keeps a pending play failure contextual and suppresses a late play acknowledgement', async () => {
    const fixture = setupMusicController()
    const { controller, music, eventSink } = fixture
    let finishPlay!: () => void
    music.play.mockImplementationOnce(() => new Promise(resolve => { finishPlay = resolve }))
    const actionContext = sceneContext('pending-play')
    controller.handleCommand({ type: 'scene_music', action: 'play', assetId: 'pending', gain: 1, loop: false, context: actionContext })
    await flushMusicTasks()
    music.error = { code: 4 }
    music.emit('error')
    finishPlay()
    await flushMusicTasks()
    expect(eventSink.mock.calls).toEqual([
      ['avatar_music_play_failed:code_4:network_1:ready_4', actionContext],
    ])
    expect(vi.getTimerCount()).toBe(0)
    controller.dispose()
  })

  it('fails stalled music after 15 seconds once, while analyser silence remains diagnostic', async () => {
    const fixture = setupMusicController()
    const { controller, music, eventSink } = fixture
    const actionContext = sceneContext('stalled')
    await playSceneMusic(fixture, actionContext, true)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(eventSink).toHaveBeenCalledWith('avatar_music_analyser_inactive', undefined)
    expect(eventSink.mock.calls.some(([reason]) => reason.startsWith('avatar_music_play_failed'))).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(eventSink).toHaveBeenCalledWith('avatar_music_play_failed:progress_timeout', actionContext)
    expect(music.paused).toBe(true)
    music.error = { code: 3 }
    music.emit('error')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(eventSink.mock.calls.filter(([reason]) => reason.startsWith('avatar_music_play_failed'))).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    controller.dispose()
  })

  it('allows silent advancing music and loop wraparound beyond the stall limit', async () => {
    const fixture = setupMusicController()
    const { controller, music, eventSink } = fixture
    await playSceneMusic(fixture, sceneContext('loop'), true)
    // A short loop can revisit the same position at every watchdog poll.
    music.duration = 1
    for (let second = 0; second < 40; second += 1) {
      music.currentTime = 0.5
      music.emit('timeupdate')
      await vi.advanceTimersByTimeAsync(500)
      music.currentTime = 0
      music.emit('timeupdate')
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(eventSink).toHaveBeenCalledWith('avatar_music_analyser_inactive', undefined)
    expect(eventSink.mock.calls.some(([reason]) => reason.startsWith('avatar_music_play_failed'))).toBe(false)
    expect(music.paused).toBe(false)
    controller.dispose()
  })

  it.each(['dormant', 'suspending', 'offlineLoop'] as const)('cleans playback timers on %s', async (state) => {
    const fixture = setupMusicController()
    const { controller, music, eventSink } = fixture
    await playSceneMusic(fixture)
    controller.handleCommand({ type: 'scene_music', action: 'fade', targetGain: 0.2, durationMs: 10_000, context: sceneContext('fade') })
    controller.setLifecycle(state)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(vi.getTimerCount()).toBe(0)
    expect(music.paused).toBe(true)
    expect(eventSink.mock.calls.some(([reason]) => /completed|play_failed/.test(reason))).toBe(false)
    controller.dispose()
  })

  it('disposes every music timer and event listener and ignores late callbacks', async () => {
    const fixture = setupMusicController()
    const { controller, music, eventSink } = fixture
    await playSceneMusic(fixture)
    const oldEnded = [...music.listeners.get('ended')!][0]!
    const oldError = [...music.listeners.get('error')!][0]!
    controller.handleCommand({ type: 'scene_music', action: 'fade', targetGain: 0.2, durationMs: 10_000, context: sceneContext('fade') })
    expect(vi.getTimerCount()).toBe(3)
    controller.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect([...music.listeners.values()].every(listeners => listeners.size === 0)).toBe(true)
    const eventsAtDispose = eventSink.mock.calls.length
    music.ended = true
    music.error = { code: 3 }
    oldEnded()
    oldError()
    controller.setLifecycle('dormant')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(eventSink).toHaveBeenCalledTimes(eventsAtDispose)
    expect(vi.getTimerCount()).toBe(0)
  })
})
