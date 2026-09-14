import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvatarMediaController } from '../../../src/renderer/avatar/audio/avatar-media-controller'
import { getAudioDeviceRouter } from '../../../src/renderer/audio-devices'
import { DEFAULT_AUDIO_PREFERENCES } from '../../../src/shared/audio-devices'

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
  src = ''
  preload = ''
  loop = false
  duration = 5
  currentTime = 0
  networkState = 1
  readyState = 4
  error = null
  volume = 1
  readonly play = vi.fn(async () => undefined)
  readonly pause = vi.fn()
  addEventListener(): void {}
  removeEventListener(): void {}
}

afterEach(() => vi.unstubAllGlobals())

describe('Avatar shared background audio bus', () => {
  it('feeds authored music and embedded video through one duck gain and uses explicit draft media', async () => {
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
      setSinkId = vi.fn(async () => undefined)
      close = vi.fn(async () => undefined)
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
    const fetchMedia = vi.fn(async () => ({ ok: true, blob: async () => new Blob() }))
    vi.stubGlobal('fetch', fetchMedia)

    const controller = createAvatarMediaController({
      onRecordedOutput: vi.fn(), onActivity: vi.fn(), onChanged: vi.fn(), eventSink: vi.fn(),
    })
    const video = new FakeAudio() as unknown as HTMLVideoElement
    controller.setSceneVideoAudio(video, 0.4)

    const musicSource = sources[0]!
    const videoSource = sources[1]!
    const musicAnalyser = musicSource.connections[0]!
    const musicAuthoredGain = musicAnalyser.connections[0]!
    const musicMaster = musicAuthoredGain.connections[0] as FakeGain
    const sharedAnalyser = musicMaster.connections[0]!
    const videoAuthoredGain = videoSource.connections[0]!
    const effectsMaster = videoAuthoredGain.connections[0] as FakeGain
    expect(effectsMaster.connections[0]).toBe(sharedAnalyser)

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
    controller.dispose()
    await getAudioDeviceRouter().select(DEFAULT_AUDIO_PREFERENCES)
    expect(musicMaster.gain.value).toBe(0)
  })
})
