import { describe, expect, it, vi } from 'vitest'
import { AudioDeviceRouter } from '../../src/renderer/audio-devices'
import { DEFAULT_AUDIO_PREFERENCES, parseAudioPreferences, matchMicrophoneName } from '../../src/shared/audio-devices'

const preferences = { inputId: 'mic-1', inputLabel: 'Headset (2-SRS-NB10)', outputId: 'speaker-1' }

describe('audio device selection', () => {
  it('applies saved and live volumes without rerouting speakers, and releases listeners', async () => {
    const saved = { ...preferences, volumes: { bgm: 0.3, avatar: 0.7, effects: 0 } }
    const router = new AudioDeviceRouter(async () => saved, async () => [])
    const changed = vi.fn()
    const stop = router.watchVolumes(changed)
    const sink = { setSinkId: vi.fn(async () => undefined) }
    await router.attach(sink)
    expect(changed).toHaveBeenLastCalledWith(saved.volumes)
    await router.select({ ...saved, volumes: { bgm: 0, avatar: 0.6, effects: 1 } })
    expect(changed).toHaveBeenLastCalledWith({ bgm: 0, avatar: 0.6, effects: 1 })
    expect(sink.setSinkId).toHaveBeenCalledTimes(1)
    stop()
    await router.select(preferences)
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('uses unity volumes for legacy settings and ignores listeners disposed during startup', async () => {
    const router = new AudioDeviceRouter(async () => preferences, async () => [])
    const changed = vi.fn(), disposed = vi.fn()
    router.watchVolumes(changed)
    router.watchVolumes(disposed)()
    await router.inputConstraints()
    expect(changed).toHaveBeenLastCalledWith({ bgm: 1, avatar: 1, effects: 1 })
    expect(disposed).not.toHaveBeenCalled()
    expect(parseAudioPreferences({ ...preferences, volumes: { bgm: 1, avatar: 1 } })).toBeNull()
    expect(parseAudioPreferences({ ...preferences, volumes: { bgm: 1, avatar: 1, effects: 1, extra: 1 } })).toBeNull()
  })
  it('does not register an audio graph disposed while preferences are loading', async () => {
    const router = new AudioDeviceRouter(async () => DEFAULT_AUDIO_PREFERENCES, async () => [])
    const sink = { setSinkId: vi.fn(async () => undefined) }
    await router.attach(sink, () => true)
    await router.select(preferences)
    expect(sink.setSinkId).not.toHaveBeenCalled()
  })
  it('defaults to the operating system and never acquires a mic to enumerate', async () => {
    const enumerate = vi.fn(async () => [])
    const router = new AudioDeviceRouter(async () => DEFAULT_AUDIO_PREFERENCES, enumerate)
    expect(await router.inputConstraints()).toBe(true)
    await router.refresh()
    expect(enumerate).toHaveBeenCalledOnce()
    const sink = { setSinkId: vi.fn(async () => undefined) }
    await router.attach(sink)
    expect(sink.setSinkId).toHaveBeenCalledWith('')
  })

  it('routes all attached output paths and uses exact input constraints on next acquisition', async () => {
    const router = new AudioDeviceRouter(async () => preferences, async () => [])
    const dialogue = { setSinkId: vi.fn(async () => undefined) }
    const media = { setSinkId: vi.fn(async () => undefined) }
    const detach = await router.attach(dialogue)
    await router.attach(media)
    expect(dialogue.setSinkId).toHaveBeenCalledWith('speaker-1')
    expect(await router.inputConstraints()).toEqual({ deviceId: { exact: 'mic-1' } })
    detach()
    await router.select(DEFAULT_AUDIO_PREFERENCES)
    expect(media.setSinkId).toHaveBeenLastCalledWith('')
    expect(dialogue.setSinkId).toHaveBeenCalledTimes(1)
  })

  it('reports an unavailable output and explicitly falls back to the system default', async () => {
    const router = new AudioDeviceRouter(async () => preferences, async () => [])
    const changed = vi.fn()
    router.subscribe(changed)
    const sink = { setSinkId: vi.fn(async (id: string) => { if (id) throw new Error('private device detail') }) }
    await router.attach(sink)
    expect(sink.setSinkId).toHaveBeenLastCalledWith('')
    expect(router.snapshot().reason).toBe('audio_output_unavailable_using_default')
    expect(JSON.stringify(changed.mock.calls)).not.toContain('private device detail')
  })

  it('rejects malformed preference payloads and never chooses an ambiguous native input', () => {
    expect(parseAudioPreferences({ ...preferences, secret: 'no' })).toBeNull()
    expect(parseAudioPreferences({ ...preferences, inputId: '' })).toBeNull()
    expect(matchMicrophoneName('Headset (2-SRS-NB10)', ['Headset (2-SRS-NB10)'])).toBe('Headset (2-SRS-NB10)')
    expect(matchMicrophoneName('Unknown', ['Headset'])).toBeNull()
    expect(matchMicrophoneName('Headset', ['Headset', 'Headset'])).toBeNull()
    expect(matchMicrophoneName('Headset (2- SRS-NB10) (Bluetooth)', ['Headset', 'Microphone'])).toBe('Headset')
    expect(matchMicrophoneName('Headset (2- SRS-NB10) (Bluetooth)', ['Headset', 'Headset'])).toBeNull()
  })
})
