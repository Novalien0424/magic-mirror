import { describe, expect, it, vi } from 'vitest'
import { createSherpaDetector } from '../../../src/main/wake/sherpa-detector'

describe('wake detector adapters', () => {
  it('converts sherpa input, resets after detection, and exposes no keyword text', () => {
    const accepted: Float32Array[] = []
    const stream = {
      acceptWaveform: ({ samples }: { samples: Float32Array; sampleRate: number }) => accepted.push(samples),
    }
    let ready = true
    const spotter = {
      createStream: () => stream,
      isReady: () => ready,
      decode: () => { ready = false },
      getResult: () => ({ keyword: '魔鏡阿魔鏡' }),
      reset: vi.fn(),
    }
    const detector = createSherpaDetector(spotter, 16_000)

    const result = detector.process(new Int16Array([-32768, 0, 32767]))

    expect(result).toEqual({ status: 'detected' })
    expect(Object.keys(result)).toEqual(['status'])
    expect([...accepted[0]]).toEqual([-1, 0, 32767 / 32768])
    expect(spotter.reset).toHaveBeenCalledWith(stream)
  })
})
