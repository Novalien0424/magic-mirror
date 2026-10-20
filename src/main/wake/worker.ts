import type { WakeDetector } from './detector'
import type { WakeScore } from '../../shared/wake-score'
import { createConfiguredSherpaDetector } from './sherpa-detector'
import { openWakeCapture, wakeMicrophoneFailureReason, type WakeCapture } from './capture'
import {
  parseWakeWorkerCommand,
  type WakeWorkerCommand,
  type WakeWorkerOutcome,
} from './protocol'

interface WorkerPort {
  postMessage(message: WakeWorkerOutcome): void
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): void
}

export interface WakeWorkerDependencies {
  readonly now?: () => number
  readonly createDetector?: (
    wakePackage: Extract<WakeWorkerCommand, { type: 'initialize' }>['package'],
  ) => WakeDetector
  readonly openCapture?: typeof openWakeCapture
}

function defaultCreateDetector(
  wakePackage: Extract<WakeWorkerCommand, { type: 'initialize' }>['package'],
): WakeDetector {
  return createConfiguredSherpaDetector(wakePackage)
}

export function startWakeWorker(port: WorkerPort, dependencies: WakeWorkerDependencies = {}): void {
  const createDetector = dependencies.createDetector ?? defaultCreateDetector
  const openCapture = dependencies.openCapture ?? openWakeCapture
  const now = dependencies.now ?? Date.now
  let detector: WakeDetector | null = null
  let capture: WakeCapture | null = null
  let captureGeneration = 0
  let activePackage: Extract<WakeWorkerCommand, { type: 'initialize' }>['package'] | null = null
  let stopped = false
  let commandQueue = Promise.resolve()

  const post = (outcome: WakeWorkerOutcome): void => {
    try {
      port.postMessage(outcome)
    } catch {
      // The parent owns restart policy; the worker has no second diagnostics channel.
    }
  }

  const releaseCapture = (): void => {
    const current = capture
    capture = null
    captureGeneration += 1
    try {
      current?.stop()
    } catch {
      // Release remains idempotent and its bounded command outcome stays visible.
    }
  }

  const acquire = async (requestId: string, inputLabel?: string): Promise<void> => {
    if (capture !== null) {
      post({ type: 'microphone_acquired', requestId })
      return
    }
    if (detector === null || activePackage === null) throw new Error('wake_not_initialized')
    let lastReport = now()
    let blocks = 0
    let peak = 0
    let squares = 0
    let count = 0
    let windowScore: WakeScore | null = null
    const generation = ++captureGeneration
    const opened = await openCapture({
      ...(inputLabel ? { inputLabel } : {}),
      onSamples(samples) {
        if (generation !== captureGeneration || capture === null || detector === null || activePackage === null) return
        try {
          const result = detector.process(samples)
          const score = activePackage.calibration ? detector.measurement?.() ?? null : null
          if (score) {
            if (!windowScore || score.matchedTokens > windowScore.matchedTokens
              || (score.matchedTokens === windowScore.matchedTokens && score.acousticScore >= windowScore.acousticScore)) {
              windowScore = score
            } else windowScore = { ...windowScore, decodedSteps: score.decodedSteps }
          }
          if (samples.length > 0) {
            blocks += 1
            for (const sample of samples) {
              const value = sample / 32768
              peak = Math.max(peak, Math.abs(value))
              squares += value * value
            }
            count += samples.length
            if (blocks === 1 || now() - lastReport >= 500) {
              post({ type: 'input_activity', blocks, peak, rms: Math.sqrt(squares / count),
                ...(activePackage.calibration ? { detector: windowScore } : {}) })
              lastReport = now()
              peak = squares = count = 0
              windowScore = null
            }
          }
          if (result.status !== 'detected') return
          if (activePackage.calibration !== true) releaseCapture()
          detector.reset()
          post({
            type: 'wake_detected',
            packageId: activePackage.packageId,
            modelVersion: activePackage.modelVersion,
          })
        } catch {
          releaseCapture()
          post({ type: 'failed', reason: 'wake_detector_failed' })
        }
      },
      onError(reason) {
        if (generation !== captureGeneration) return
        releaseCapture()
        post({ type: 'failed', reason: reason ?? 'wake_microphone_failed' })
      },
    })
    if (generation !== captureGeneration) {
      opened.stop()
      return
    }
    capture = opened
    post({ type: 'microphone_acquired', requestId })
  }

  const handleCommand = async (command: WakeWorkerCommand): Promise<void> => {
    if (stopped) return
    if (command.type === 'initialize' || command.type === 'update_config') {
      if (capture !== null) throw new Error('wake_microphone_owned')
      const nextDetector = createDetector(command.package)
      detector?.close()
      detector = nextDetector
      activePackage = command.package
      post({ type: 'ready', requestId: command.requestId, packageId: command.package.packageId })
      return
    }
    if (command.type === 'acquire_microphone') {
      await acquire(command.requestId, command.inputLabel)
      return
    }
    if (command.type === 'release_microphone') {
      releaseCapture()
      detector?.reset()
      post({ type: 'microphone_released', requestId: command.requestId })
      return
    }
    releaseCapture()
    detector?.close()
    detector = null
    activePackage = null
    stopped = true
    post({ type: 'stopped', requestId: command.requestId })
  }

  port.on('message', (event) => {
    const parsed = parseWakeWorkerCommand(event.data)
    if (!parsed.ok) {
      post({ type: 'failed', reason: parsed.reason })
      return
    }
    commandQueue = commandQueue
      .then(() => handleCommand(parsed.value))
      .catch((error: unknown) => {
        post({ type: 'failed', requestId: parsed.value.requestId,
          reason: error instanceof Error && error.message === 'wake_native_score_unavailable' ? 'wake_native_score_unavailable'
            : parsed.value.type === 'acquire_microphone' ? wakeMicrophoneFailureReason(error) : 'wake_command_failed' })
      })
  })
}

if (process.parentPort !== undefined) startWakeWorker(process.parentPort)
