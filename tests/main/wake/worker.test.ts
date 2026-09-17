import { describe, expect, it, vi } from 'vitest'
import { startWakeWorker } from '../../../src/main/wake/worker'
import type { WakeWorkerOutcome } from '../../../src/main/wake/protocol'

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('wake worker runtime', () => {
  it('reports a missing numerical native extension with a specific metadata-only reason', async () => {
    let receive!: (event: { readonly data: unknown }) => void
    const outcomes: WakeWorkerOutcome[] = []
    startWakeWorker({ postMessage: value => outcomes.push(value), on: (_, listener) => { receive = listener } }, {
      createDetector: () => { throw new Error('wake_native_score_unavailable') },
    })
    receive({ data: { type: 'initialize', requestId: 'init', package: {
      packageId: 'test', engine: 'sherpa', engineVersion: '1', modelVersion: 'test', phrase: 'test',
      sampleRateHz: 16000, artifactPaths: {}, tuning: {}, calibration: true,
    } } })
    await flush()
    expect(outcomes).toEqual([{ type: 'failed', requestId: 'init', reason: 'wake_native_score_unavailable' }])
  })
  it('reports numerical detector progress only during calibration without recognized content', async () => {
    let receive!: (event: { readonly data: unknown }) => void
    let onSamples!: (samples: Int16Array) => void
    const outcomes: WakeWorkerOutcome[] = []
    const measurement = { acousticScore: 0.72, matchedTokens: 4, totalTokens: 9, trailingBlanks: 0, decodedSteps: 1 }
    startWakeWorker({ postMessage: value => outcomes.push(value), on: (_, listener) => { receive = listener } }, {
      createDetector: () => ({ sampleRateHz: 16000, process: () => ({ status: 'listening' }),
        measurement: () => measurement, reset() {}, close() {} }),
      openCapture: async input => { onSamples = input.onSamples; return { stop() {} } },
    })
    receive({ data: { type: 'initialize', requestId: 'init', package: {
      packageId: 'test', engine: 'sherpa', engineVersion: '1', modelVersion: 'test', phrase: 'test',
      sampleRateHz: 16000, artifactPaths: {}, tuning: {}, calibration: true,
    } } })
    receive({ data: { type: 'acquire_microphone', requestId: 'acquire' } })
    await flush()
    onSamples(new Int16Array([100]))
    expect(outcomes.at(-1)).toMatchObject({ type: 'input_activity', detector: measurement })
    expect(JSON.stringify(outcomes)).not.toMatch(/private|tokens\"|transcript|samples/)
  })

  it('keeps the same microphone open for repeated calibration detections', async () => {
    let receive!: (event: { readonly data: unknown }) => void
    let onSamples!: (samples: Int16Array) => void
    const outcomes: WakeWorkerOutcome[] = []
    const stop = vi.fn()
    startWakeWorker({ postMessage: message => outcomes.push(message), on: (_, listener) => { receive = listener } }, {
      createDetector: () => ({ sampleRateHz: 16000, process: () => ({ status: 'detected' }), reset() {}, close() {} }),
      openCapture: async input => { onSamples = input.onSamples; return { stop } },
    })
    receive({ data: { type: 'initialize', requestId: 'init', package: {
      packageId: 'test', engine: 'sherpa', engineVersion: '1', modelVersion: 'test', phrase: 'test',
      sampleRateHz: 16000, artifactPaths: {}, tuning: {}, calibration: true,
    } } })
    receive({ data: { type: 'acquire_microphone', requestId: 'acquire' } })
    await flush()
    onSamples(new Int16Array([100])); onSamples(new Int16Array([100]))
    expect(outcomes.filter(value => value.type === 'wake_detected')).toHaveLength(2)
    expect(stop).not.toHaveBeenCalled()
    receive({ data: { type: 'release_microphone', requestId: 'release' } })
    await flush()
    expect(stop).toHaveBeenCalledOnce()
  })
  it('reports bounded input levels without audio and ignores callbacks after release', async () => {
    let receive!: (event: { readonly data: unknown }) => void
    let onSamples!: (samples: Int16Array) => void
    let now = 0
    const outcomes: unknown[] = []
    startWakeWorker({ postMessage: (message) => outcomes.push(message), on: (_, listener) => { receive = listener } }, {
      now: () => now,
      createDetector: () => ({ sampleRateHz: 16000, process: () => ({ status: 'listening' }), reset() {}, close() {} }),
      openCapture: async (input) => { onSamples = input.onSamples; return { stop() {} } },
    })
    receive({ data: { type: 'initialize', requestId: 'init', package: {
      packageId: 'test', engine: 'sherpa', engineVersion: '1', modelVersion: 'test', phrase: 'test',
      sampleRateHz: 16000, artifactPaths: {}, tuning: {},
    } } })
    receive({ data: { type: 'acquire_microphone', requestId: 'acquire' } })
    await flush()
    onSamples(new Int16Array([16384, -16384]))
    expect(outcomes[2]).toEqual({ type: 'input_activity', blocks: 1, peak: 0.5, rms: 0.5 })
    now = 500
    onSamples(new Int16Array([0, 0]))
    expect(outcomes[3]).toEqual({ type: 'input_activity', blocks: 2, peak: 0, rms: 0 })
    now = 1000
    onSamples(new Int16Array([0, 0]))
    expect(outcomes[4]).toEqual({ type: 'input_activity', blocks: 3, peak: 0, rms: 0 })
    receive({ data: { type: 'release_microphone', requestId: 'release' } })
    await flush()
    now = 2000
    onSamples(new Int16Array([32767]))
    expect(outcomes).toHaveLength(6)
  })
  it('initializes, acquires, detects locally, and releases capture without content output', async () => {
    let receive!: (event: { readonly data: unknown }) => void
    let onSamples!: (samples: Int16Array) => void
    const outcomes: WakeWorkerOutcome[] = []
    const stop = vi.fn()
    const detector = {
      sampleRateHz: 16_000 as const,
      process: vi.fn(() => ({ status: 'detected' as const })),
      reset: vi.fn(),
      close: vi.fn(),
    }
    startWakeWorker({
      postMessage: (message) => outcomes.push(message),
      on: (_event, listener) => { receive = listener },
    }, {
      createDetector: () => detector,
      openCapture: async (input) => {
        onSamples = input.onSamples
        return { stop }
      },
    })

    receive({ data: {
      type: 'initialize',
      requestId: 'init-1',
      package: {
        packageId: 'magic-mirror-zh-test-v1',
        engine: 'sherpa',
        engineVersion: '1.13.6',
        modelVersion: 'test-v1',
        phrase: '魔鏡阿魔鏡',
        sampleRateHz: 16_000,
        artifactPaths: { model: 'fixture/model.onnx' },
        tuning: { threshold: 0.25, score: 1.5 },
      },
    } })
    receive({ data: { type: 'acquire_microphone', requestId: 'acquire-1' } })
    await flush()
    await flush()
    onSamples(new Int16Array([1, 2, 3, 4]))

    expect(outcomes).toEqual([
      { type: 'ready', requestId: 'init-1', packageId: 'magic-mirror-zh-test-v1' },
      { type: 'microphone_acquired', requestId: 'acquire-1' },
      { type: 'input_activity', blocks: 1, peak: 4 / 32768, rms: Math.sqrt(7.5) / 32768 },
      {
        type: 'wake_detected',
        packageId: 'magic-mirror-zh-test-v1',
        modelVersion: 'test-v1',
      },
    ])
    expect(stop).toHaveBeenCalledTimes(1)
    expect(detector.reset).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(outcomes)).not.toMatch(/audio|transcript|sample/i)
  })

  it('ignores stale samples and errors from a capture released before reacquisition', async () => {
    let receive!: (event: { readonly data: unknown }) => void
    const captures: Parameters<NonNullable<import('../../../src/main/wake/worker').WakeWorkerDependencies['openCapture']>>[0][] = []
    const outcomes: WakeWorkerOutcome[] = []
    const stop = vi.fn()
    const process = vi.fn(() => ({ status: 'listening' as const }))
    startWakeWorker({ postMessage: message => outcomes.push(message), on: (_, listener) => { receive = listener } }, {
      createDetector: () => ({ sampleRateHz: 16000, process, reset() {}, close() {} }),
      openCapture: async input => { captures.push(input); return { stop } },
    })
    receive({ data: { type: 'initialize', requestId: 'init', package: {
      packageId: 'test', engine: 'sherpa', engineVersion: '1', modelVersion: 'test', phrase: 'test',
      sampleRateHz: 16000, artifactPaths: {}, tuning: {},
    } } })
    receive({ data: { type: 'acquire_microphone', requestId: 'first' } })
    await flush()
    receive({ data: { type: 'release_microphone', requestId: 'release' } })
    receive({ data: { type: 'acquire_microphone', requestId: 'second' } })
    await flush()
    captures[0].onSamples(new Int16Array([100]))
    captures[0].onError()
    expect(process).not.toHaveBeenCalled()
    expect(stop).toHaveBeenCalledOnce()
    captures[1].onSamples(new Int16Array([100]))
    expect(process).toHaveBeenCalledOnce()
    expect(outcomes.at(-1)).toMatchObject({ type: 'input_activity', blocks: 1 })
  })
})
