import { WAKE_DETECTED, WAKE_LISTENING, type WakeDetector, type WakeDetectorResult } from './detector'
import type { WakeWorkerPackage } from './protocol'

export interface PorcupineEngine {
  readonly frameLength: number
  readonly sampleRate: number
  process(frame: Int16Array): number
  release(): void
}

export function createPorcupineDetector(engine: PorcupineEngine): WakeDetector {
  if (!Number.isSafeInteger(engine.frameLength) || engine.frameLength < 1 || engine.sampleRate !== 16_000) {
    throw new Error('wake_detector_configuration_invalid')
  }
  let pending: number[] = []
  let closed = false

  function process(samples: Int16Array): WakeDetectorResult {
    if (closed) throw new Error('wake_detector_closed')
    pending.push(...samples)
    while (pending.length >= engine.frameLength) {
      const frame = Int16Array.from(pending.slice(0, engine.frameLength))
      pending = pending.slice(engine.frameLength)
      if (engine.process(frame) >= 0) {
        pending = []
        return WAKE_DETECTED
      }
    }
    return WAKE_LISTENING
  }

  return {
    sampleRateHz: 16_000,
    process,
    reset() {
      pending = []
    },
    close() {
      if (closed) return
      closed = true
      pending = []
      engine.release()
    },
  }
}

export function createConfiguredPorcupineDetector(
  wakePackage: WakeWorkerPackage,
  accessKey: string | undefined,
): WakeDetector {
  const keywordPath = wakePackage.artifactPaths['keyword']
  const parametersPath = wakePackage.artifactPaths['parameters']
  const sensitivity = wakePackage.tuning.sensitivity
  if (
    wakePackage.engine !== 'porcupine'
    || accessKey === undefined
    || keywordPath === undefined
    || parametersPath === undefined
    || sensitivity === undefined
  ) throw new Error('wake_detector_configuration_invalid')

  const module = require('@picovoice/porcupine-node') as {
    Porcupine: new (
      accessKey: string,
      keywordPaths: string[],
      sensitivities: number[],
      options: { modelPath: string },
    ) => PorcupineEngine
  }
  return createPorcupineDetector(new module.Porcupine(
    accessKey,
    [keywordPath],
    [sensitivity],
    { modelPath: parametersPath },
  ))
}
