import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConsoleBridge } from '../../src/shared/bridge'
import type { AvatarProfile } from '../../src/shared/avatar-profiles'
const mocks = vi.hoisted(() => ({ createOutput: vi.fn(), attach: vi.fn() }))
vi.mock('../../src/renderer/realtime/processed-audio-output', () => ({ createProcessedRealtimeAudioOutput: mocks.createOutput }))
vi.mock('../../src/renderer/audio-devices', () => ({ getAudioDeviceRouter: () => ({ attach: mocks.attach }) }))
import { startVoiceAudition } from '../../src/renderer/console/voice-preview'

describe('audition cleanup across asynchronous cancellation', () => {
  afterEach(() => vi.clearAllMocks())
  function setup() {
    const release = vi.fn().mockResolvedValue(undefined), status = vi.fn(), abort = new AbortController()
    const bridge = { acquireVoicePreview: vi.fn().mockResolvedValue({ ok: true, token: 'synthetic-token', clientSecret: 'synthetic-secret', snapshot: {} }), releaseVoicePreview: release } as unknown as ConsoleBridge
    const output = { setMuted: vi.fn(), dispose: vi.fn().mockResolvedValue(undefined), sink: {} }
    const start = () => startVoiceAudition({ bridge, avatar: { voice: 'cedar', speakingStyle: '' } as AvatarProfile,
      loop: false, signal: abort.signal, onAnalyser: vi.fn(), onStatus: status, onEnded: vi.fn() })
    return { release, status, abort, output, start }
  }
  it('disposes output arriving after Stop and releases the lease once', async () => {
    const x = setup(); let resolve!: (value: typeof x.output) => void
    mocks.createOutput.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = x.start(); await Promise.resolve(); x.abort.abort(); resolve(x.output)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(x.output.setMuted).toHaveBeenCalledWith(true)
    expect(x.output.dispose).toHaveBeenCalledOnce(); expect(x.release).toHaveBeenCalledOnce()
    expect(mocks.attach).not.toHaveBeenCalled()
  })
  it('continues cleanup when a late device detach throws', async () => {
    const x = setup(), detach = vi.fn(() => { throw Error('synthetic detach failure') })
    mocks.createOutput.mockResolvedValue(x.output)
    let resolve!: (value: typeof detach) => void
    mocks.attach.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = x.start(); await Promise.resolve(); await Promise.resolve()
    x.abort.abort(); resolve(detach)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(detach).toHaveBeenCalledOnce(); expect(x.release).toHaveBeenCalledOnce()
    expect(x.output.dispose).toHaveBeenCalledOnce(); expect(x.status).toHaveBeenCalledWith('voice_preview_cleanup_failed')
  })
})
