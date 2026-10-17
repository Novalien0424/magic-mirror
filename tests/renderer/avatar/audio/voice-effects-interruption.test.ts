import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVoiceEffectGraph } from '../../../../src/renderer/avatar/audio/voice-effects'
import { DEFAULT_VOICE_EFFECTS } from '../../../../src/shared/voice-effects'

const worklet = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('signalsmith-stretch', () => ({ default: worklet.create }))

function audioContext(): AudioContext {
  const parameter = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() })
  const node = () => ({ gain: parameter(), frequency: parameter(), threshold: parameter(), knee: parameter(),
    ratio: parameter(), attack: parameter(), release: parameter(), connect: vi.fn(function (this: unknown, next: unknown) { return next }), disconnect: vi.fn() })
  return { currentTime: 0, sampleRate: 8000, createGain: node, createAnalyser: node, createBiquadFilter: node,
    createWaveShaper: node, createDynamicsCompressor: node, createConvolver: node,
    createBuffer: (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return { getChannelData: (channel: number) => data[channel] }
    },
  } as unknown as AudioContext
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('voice effect interruption generation', () => {
  it('keeps an awaited begin muted when a later interruption cancels it', async () => {
    const graph = await createVoiceEffectGraph(audioContext())
    try {
      graph.interrupt()
      const beginning = graph.begin()
      graph.interrupt()
      await beginning
      expect(graph.output.gain.value).toBe(0)
      await graph.begin()
      expect(graph.output.gain.value).toBe(1)
    } finally { graph.dispose() }
  })
  it('invalidates begin during a pending worklet reset without starting a second reset', async () => {
    // Redirect only the browser asset URL to the mocked installed worklet module.
    vi.stubGlobal('document', { baseURI: 'file:///synthetic/ui/index.html' })
    vi.stubGlobal('URL', class { readonly href = 'signalsmith-stretch' })
    const configure = vi.fn().mockResolvedValue(undefined)
    worklet.create.mockResolvedValue({ configure, schedule: vi.fn().mockResolvedValue(undefined), latency: async () => .1,
      connect: vi.fn(), disconnect: vi.fn(), port: { close: vi.fn() } })
    const degraded = vi.fn()
    const graph = await createVoiceEffectGraph(audioContext(), { ...DEFAULT_VOICE_EFFECTS, enabled: true }, degraded)
    try {
      expect(worklet.create).toHaveBeenCalledOnce()
      let reset!: () => void
      configure.mockImplementationOnce(() => new Promise<void>(resolve => { reset = resolve }))
      graph.interrupt()
      const beginning = graph.begin()
      graph.interrupt()
      expect(configure).toHaveBeenCalledTimes(2)
      reset()
      await beginning
      expect(graph.output.gain.value).toBe(0)
      expect(degraded).not.toHaveBeenCalled()
      await graph.begin()
      expect(graph.output.gain.value).toBeGreaterThan(0)
    } finally { graph.dispose() }
  })
  it('keeps disposed or explicitly muted output silent after a pending begin', async () => {
    const graph = await createVoiceEffectGraph(audioContext())
    graph.interrupt()
    graph.setMuted(true)
    await graph.begin()
    expect(graph.output.gain.value).toBe(0)
    const beginning = graph.begin()
    graph.dispose()
    await beginning
    expect(graph.output.gain.value).toBe(0)
  })
})
