import { describe, expect, it, vi } from 'vitest'
import { createPorcupineDetector } from '../../../src/main/wake/porcupine-detector'
import { createSherpaDetector } from '../../../src/main/wake/sherpa-detector'
import { createConfiguredWakeDetector } from '../../../src/main/wake/detector'

describe('wake detector adapters', () => {
  it('creates only the configured engine and never falls back on failure', () => {
    const sherpaDetector = { sampleRateHz: 16_000, process: vi.fn(), reset: vi.fn(), close: vi.fn() } as const
    const createSherpa = vi.fn(() => sherpaDetector)
    const createPorcupine = vi.fn(() => { throw new Error('porcupine_failed') })

    expect(createConfiguredWakeDetector({
      package: { engine: 'sherpa' },
      createSherpa,
      createPorcupine,
    })).toBe(sherpaDetector)
    expect(createSherpa).toHaveBeenCalledTimes(1)
    expect(createPorcupine).not.toHaveBeenCalled()

    expect(() => createConfiguredWakeDetector({
      package: { engine: 'porcupine' },
      createSherpa,
      createPorcupine,
    })).toThrow('porcupine_failed')
    expect(createSherpa).toHaveBeenCalledTimes(1)
  })

  it('feeds Porcupine exact frames, retains a partial frame, and releases explicitly', () => {
    const processed: number[][] = []
    const engine = {
      frameLength: 4,
      sampleRate: 16_000,
      process(frame: Int16Array) {
        processed.push([...frame])
        return processed.length === 2 ? 0 : -1
      },
      release: vi.fn(),
    }
    const detector = createPorcupineDetector(engine)

    expect(detector.process(new Int16Array([1, 2, 3, 4, 5, 6]))).toEqual({ status: 'listening' })
    expect(detector.process(new Int16Array([7, 8, 9, 10]))).toEqual({ status: 'detected' })
    expect(processed).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]])

    detector.close()
    detector.close()
    expect(engine.release).toHaveBeenCalledTimes(1)
  })

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
