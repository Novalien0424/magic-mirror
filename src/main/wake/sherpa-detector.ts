import { WAKE_DETECTED, WAKE_LISTENING, type WakeDetector, type WakeDetectorResult } from './detector'
import type { WakeWorkerPackage } from './protocol'
import { wakeScoreSchema, type WakeScore } from '../../shared/wake-score'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Paired Mac capture/replay showed four paths pruning Raven's wake candidate;
// 32 covered both tested voices/rates; eight and 16 still missed some positives.
// Keyword bias and acceptance threshold remain package-owned.
export const WAKE_MAX_ACTIVE_PATHS = process.platform === 'darwin' ? 32 : 4

interface SherpaStream {
  acceptWaveform(input: { readonly samples: Float32Array; readonly sampleRate: number }): void
}

export interface SherpaKeywordSpotter {
  createStream(): SherpaStream
  isReady(stream: SherpaStream): boolean
  decode(stream: SherpaStream): void
  getResult(stream: SherpaStream): { readonly keyword?: unknown; readonly [key: string]: unknown }
  reset(stream: SherpaStream): void
}

export function createSherpaDetector(
  spotter: SherpaKeywordSpotter,
  sampleRateHz: number,
): WakeDetector {
  if (sampleRateHz !== 16_000) throw new Error('wake_detector_configuration_invalid')
  const stream = spotter.createStream()
  let closed = false
  let measurement: WakeScore | null = null
  let decodedSteps = 0

  function process(samples: Int16Array): WakeDetectorResult {
    if (closed) throw new Error('wake_detector_closed')
    const normalized = Float32Array.from(samples, (sample) => sample / 32_768)
    stream.acceptWaveform({ samples: normalized, sampleRate: sampleRateHz })
    let detected = false
    const previousSteps = decodedSteps
    let batch: WakeScore | null = null
    while (spotter.isReady(stream)) {
      spotter.decode(stream)
      decodedSteps++
      // Sherpa consumes duplicate results on later decoding steps. Inspect each
      // step so a coalesced audio block cannot hide an earlier keyword match.
      const result = spotter.getResult(stream)
      if (result.wake_score_version === 1) {
        const parsed = wakeScoreSchema.safeParse({ acousticScore: result.acoustic_score,
          matchedTokens: result.matched_tokens, totalTokens: result.keyword_tokens,
          trailingBlanks: result.candidate_trailing_blanks, decodedSteps })
        if (parsed.success && (!batch || parsed.data.matchedTokens > batch.matchedTokens
          || (parsed.data.matchedTokens === batch.matchedTokens && parsed.data.acousticScore >= batch.acousticScore))) {
          batch = parsed.data
        }
      }
      if (typeof result.keyword === 'string' && result.keyword.length > 0) {
        spotter.reset(stream)
        detected = true
      }
    }
    if (decodedSteps !== previousSteps) measurement = batch ? { ...batch, decodedSteps } : null
    return detected ? WAKE_DETECTED : WAKE_LISTENING
  }

  return {
    sampleRateHz: 16_000,
    process,
    measurement: () => measurement,
    reset() {
      measurement = null
      if (!closed) spotter.reset(stream)
    },
    close() {
      if (closed) return
      closed = true
      measurement = null
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

  const modulePath = resolveSherpaModulePath({ platform: process.platform, arch: process.arch,
    resourcesPath: process.resourcesPath, developmentRoot: process.cwd(), calibration: wakePackage.calibration,
    exists: existsSync })
  const module = require(modulePath) as {
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
    maxActivePaths: WAKE_MAX_ACTIVE_PATHS,
    numTrailingBlanks: wakePackage.tuning.numTrailingBlanks ?? 1,
    keywordsScore: wakePackage.tuning.score,
    keywordsThreshold: wakePackage.tuning.threshold,
    keywordsFile: keywords,
  })
  return createSherpaDetector(spotter, wakePackage.sampleRateHz)
}

export function resolveSherpaModulePath(input: {
  readonly platform: string
  readonly arch: string
  readonly resourcesPath?: string
  readonly developmentRoot: string
  readonly calibration?: boolean
  readonly exists: (path: string) => boolean
}): string {
  // Separately built score extensions never replace installed npm binaries.
  const supported = (input.platform === 'win32' && input.arch === 'x64')
    || (input.platform === 'darwin' && input.arch === 'arm64')
  const extension = input.resourcesPath ? join(input.resourcesPath, 'wake-score-native/keyword-spotter.js') : ''
  const development = resolve(input.developmentRoot, 'resources/wake-native',
    `${input.platform}-${input.arch}`, 'keyword-spotter.js')
  const modulePath = supported && extension && input.exists(extension) ? extension
    : supported && input.exists(development) ? development : 'sherpa-onnx-node'
  if (input.calibration && modulePath === 'sherpa-onnx-node') throw new Error('wake_native_score_unavailable')
  return modulePath
}
