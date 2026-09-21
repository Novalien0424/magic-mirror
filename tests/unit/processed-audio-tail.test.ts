import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const graph = vi.hoisted(() => ({
  input: {}, output: { connect: vi.fn() }, speechAnalyser: {},
  completionAnalyser: { fftSize: 128, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0) },
  tailSeconds: 2.4, begin: vi.fn(async () => undefined), interrupt: vi.fn(),
  update: vi.fn(), setMuted: vi.fn(), setVolume: vi.fn(), dispose: vi.fn(),
}))
vi.mock('../../src/renderer/avatar/audio/voice-effects', () => ({ createVoiceEffectGraph: async () => graph }))
import { createProcessedRealtimeAudioOutput } from '../../src/renderer/realtime/processed-audio-output'

describe('processed speech completion with long effects', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
  async function setup() {
    const element = { autoplay: false, muted: false, volume: 1, srcObject: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), pause: vi.fn() } as unknown as HTMLAudioElement
    const context = { destination: {}, close: vi.fn(async () => undefined) } as unknown as AudioContext
    const output = await createProcessedRealtimeAudioOutput({ dependencies: {
      createAudioElement: () => element, createAudioContext: () => context,
    } })
    const notify = vi.fn()
    output.handleActivity!('output_started', notify)
    await Promise.resolve()
    return { output, notify }
  }
  it('does not restore speech-dependent BGM at generation end while the effect tail remains', async () => {
    const { output, notify } = await setup()
    output.handleActivity!('output_stopped', notify)
    await vi.advanceTimersByTimeAsync(2300)
    expect(notify.mock.calls.map(call => call[0])).toEqual(['output_started'])
    await vi.advanceTimersByTimeAsync(200)
    expect(notify.mock.calls.map(call => call[0])).toEqual(['output_started', 'output_stopped'])
    await output.dispose()
  })
  it('clears the tail on interruption and drops stale completion notifications', async () => {
    const { output, notify } = await setup()
    output.handleActivity!('output_stopped', notify)
    await vi.advanceTimersByTimeAsync(300)
    output.handleActivity!('interrupted', notify)
    expect(graph.interrupt).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(3000)
    expect(notify.mock.calls.map(call => call[0])).toEqual(['output_started', 'interrupted'])
    await output.dispose()
  })
})
