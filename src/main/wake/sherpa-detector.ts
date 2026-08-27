import { WAKE_DETECTED, WAKE_LISTENING, type WakeDetector, type WakeDetectorResult } from './detector'
import type { WakeWorkerPackage } from './protocol'

interface SherpaStream {
  acceptWaveform(input: { readonly samples: Float32Array; readonly sampleRate: number }): void
}

export interface SherpaKeywordSpotter {
  createStream(): SherpaStream
  isReady(stream: SherpaStream): boolean
  decode(stream: SherpaStream): void
  getResult(stream: SherpaStream): { readonly keyword?: unknown }
  reset(stream: SherpaStream): void
}

export function createSherpaDetector(
  spotter: SherpaKeywordSpotter,
  sampleRateHz: number,
): WakeDetector {
  if (sampleRateHz !== 16_000) throw new Error('wake_detector_configuration_invalid')
  const stream = spotter.createStream()
  let closed = false

  function process(samples: Int16Array): WakeDetectorResult {
    if (closed) throw new Error('wake_detector_closed')
    const normalized = Float32Array.from(samples, (sample) => sample / 32_768)
    stream.acceptWaveform({ samples: normalized, sampleRate: sampleRateHz })
    while (spotter.isReady(stream)) spotter.decode(stream)
    const result = spotter.getResult(stream)
    if (typeof result.keyword === 'string' && result.keyword.length > 0) {
      spotter.reset(stream)
      return WAKE_DETECTED
    }
    return WAKE_LISTENING
  }

  return {
    sampleRateHz: 16_000,
    process,
    reset() {
      if (!closed) spotter.reset(stream)
    },
    close() {
      if (closed) return
      closed = true
      spotter.reset(stream)
    },
  }
}

export function createConfiguredSherpaDetector(wakePackage: WakeWorkerPackage): WakeDetector {
  const { encoder, decoder, joiner, tokens, keywords } = wakePackage.artifactPaths
  if (
    wakePackage.engine !== 'sherpa'
    || encoder === undefined
    || decoder === undefined
    || joiner === undefined
    || tokens === undefined
    || keywords === undefined
    || wakePackage.tuning.threshold === undefined
    || wakePackage.tuning.score === undefined
  ) throw new Error('wake_detector_configuration_invalid')

  const module = require('sherpa-onnx-node') as {
    KeywordSpotter: new (config: Record<string, unknown>) => SherpaKeywordSpotter
  }
  const spotter = new module.KeywordSpotter({
    featConfig: { sampleRate: 16_000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder, decoder, joiner },
      tokens,
      numThreads: 2,
      debug: 0,
      provider: 'cpu',
    },
    maxActivePaths: 4,
    numTrailingBlanks: wakePackage.tuning.numTrailingBlanks ?? 1,
    keywordsScore: wakePackage.tuning.score,
    keywordsThreshold: wakePackage.tuning.threshold,
    keywordsFile: keywords,
  })
  return createSherpaDetector(spotter, wakePackage.sampleRateHz)
}
