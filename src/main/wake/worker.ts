import type { WakeDetector } from './detector'
import { createConfiguredSherpaDetector } from './sherpa-detector'
import { openWakeCapture, type WakeCapture } from './capture'
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
  let detector: WakeDetector | null = null
  let capture: WakeCapture | null = null
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
    capture = await openCapture({
      ...(inputLabel ? { inputLabel } : {}),
      onSamples(samples) {
        if (capture === null || detector === null || activePackage === null) return
        try {
          if (detector.process(samples).status !== 'detected') return
          releaseCapture()
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
      onError() {
        releaseCapture()
        post({ type: 'failed', reason: 'wake_microphone_failed' })
      },
    })
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
      .catch(() => {
        post({ type: 'failed', requestId: parsed.value.requestId, reason: 'wake_command_failed' })
      })
  })
}

if (process.parentPort !== undefined) startWakeWorker(process.parentPort)
