import { getAudioPreferences } from '../audio-preferences'
import type { WakeInputSnapshot } from '../../shared/wake-input'
import {
  parseWakeWorkerOutcome,
  type WakeWorkerCommand,
  type WakeWorkerOutcome,
  type WakeWorkerPackage,
} from './protocol'

export interface WakeWorkerChild {
  postMessage(command: WakeWorkerCommand): void
  on(event: 'message' | 'exit', listener: (value: unknown) => void): void
  kill(): void
}

export type WakeSupervisorStatus =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'acquiring'
  | 'listening'
  | 'released'
  | 'failed'

export interface WakeSupervisorSnapshot {
  readonly input: WakeInputSnapshot
  readonly status: WakeSupervisorStatus
  readonly packageId: string | null
  readonly engine: 'sherpa' | null
  readonly restartCount: 0 | 1
  readonly reason: string | null
}

export type WakeSupervisorResult = Readonly<{
  status: 'success' | 'failed'
  reason: string
}>

interface PendingRequest {
  readonly expectedType: WakeWorkerOutcome['type']
  readonly resolve: (result: WakeSupervisorResult) => void
  readonly timeout: unknown
}

export interface WakeSupervisorOptions {
  readonly now?: () => number
  readonly spawn: () => WakeWorkerChild
  readonly onWake: (packageId: string) => void
  readonly onStatus?: (snapshot: WakeSupervisorSnapshot) => void
  readonly requestTimeoutMs?: number
  readonly scheduleTimeout?: (callback: () => void, delayMs: number) => unknown
  readonly clearScheduledTimeout?: (handle: unknown) => void
}

const successReason: Partial<Record<WakeWorkerOutcome['type'], string>> = {
  ready: 'wake_worker_ready',
  microphone_acquired: 'wake_microphone_acquired',
  microphone_released: 'wake_microphone_released',
  stopped: 'wake_worker_stopped',
}

export interface WakeSupervisor {
  start(input: { readonly package: WakeWorkerPackage }): Promise<WakeSupervisorResult>
  acquire(): Promise<WakeSupervisorResult>
  release(): Promise<WakeSupervisorResult>
  updateConfig(input: { readonly package: WakeWorkerPackage }): Promise<WakeSupervisorResult>
  shutdown(): Promise<WakeSupervisorResult>
  snapshot(): WakeSupervisorSnapshot
  configuration(): WakeWorkerPackage | null
}

export function createWakeSupervisor(options: WakeSupervisorOptions): WakeSupervisor {
  const now = options.now ?? Date.now
  let acquiredAt = 0
  let lastBlockAt: number | null = null
  let blocks = 0
  let peak = 0
  let rms = 0
  let detections = 0
  let lastDetectionAt: number | null = null
  let detector: WakeInputSnapshot['detector'] = null
  let recovery: WakeInputSnapshot['recovery'] = null
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) && (options.requestTimeoutMs ?? 0) > 0
    ? Math.floor(options.requestTimeoutMs ?? 0)
    : 5_000
  const scheduleTimeout = options.scheduleTimeout
    ?? ((callback: () => void, delayMs: number): unknown => setTimeout(callback, delayMs))
  const clearScheduledTimeout = options.clearScheduledTimeout
    ?? ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let child: WakeWorkerChild | null = null
  let initialization: { readonly package: WakeWorkerPackage } | null = null
  let status: WakeSupervisorStatus = 'stopped'
  let reason: string | null = null
  let restartCount: 0 | 1 = 0
  let requestSequence = 0
  let shouldListen = false
  let shuttingDown = false
  let audioWatchdog: unknown = null
  const pending = new Map<string, PendingRequest>()

  function snapshot(): WakeSupervisorSnapshot {
    const age = lastBlockAt === null ? null : Math.max(0, now() - lastBlockAt)
    const stale = now() - (lastBlockAt ?? acquiredAt) > 3000
    const inputState = status === 'failed' ? 'failed'
      : status === 'starting' && restartCount > 0 ? 'recovering'
      : status !== 'listening' && status !== 'acquiring' ? 'inactive' : stale ? 'stalled'
      : lastBlockAt === null ? 'waiting' : peak < 0.001 ? 'silent' : 'signal'
    return Object.freeze({
      input: Object.freeze({ state: inputState, blocks,
        peak: inputState === 'signal' || inputState === 'silent' ? peak : 0,
        rms: inputState === 'signal' || inputState === 'silent' ? rms : 0, lastBlockAgeMs: age, detections,
        detector: inputState === 'signal' || inputState === 'silent' ? detector : null,
        recovery,
        lastDetectionAgeMs: lastDetectionAt === null ? null : Math.max(0, now() - lastDetectionAt) }),
      status,
      packageId: initialization?.package.packageId ?? null,
      engine: initialization?.package.engine ?? null,
      restartCount,
      reason,
    })
  }

  function publishStatus(nextStatus: WakeSupervisorStatus, nextReason: string | null = null): void {
    if (nextStatus === 'failed') recovery = { state: 'failed', attempts: recovery?.attempts ?? 0,
      reason: nextReason === 'wake_worker_exit_repeated' && recovery ? recovery.reason : nextReason ?? 'wake_worker_failed' }
    status = nextStatus
    reason = nextReason
    try {
      options.onStatus?.(snapshot())
    } catch {
      // Status projection cannot gate worker ownership or cleanup.
    }
  }

  function action(statusValue: WakeSupervisorResult['status'], reasonValue: string): WakeSupervisorResult {
    return Object.freeze({ status: statusValue, reason: reasonValue })
  }

  function cancelAudioWatchdog(): void {
    if (audioWatchdog !== null) clearScheduledTimeout(audioWatchdog)
    audioWatchdog = null
  }

  function armAudioWatchdog(): void {
    cancelAudioWatchdog()
    const owner = child
    audioWatchdog = scheduleTimeout(() => {
      audioWatchdog = null
      if (child !== owner || !shouldListen || shuttingDown) return
      if (status !== 'listening' && status !== 'acquiring') return
      publishStatus('failed', 'wake_audio_stalled')
      // Process exit confirms the old native stream is gone before reacquisition.
      try { owner?.kill() } catch { /* Failure remains visible; never open a second owner. */ }
    }, 3000)
    // Health monitoring must not keep a stopped application or isolated test alive.
    ;(audioWatchdog as { unref?: () => void } | null)?.unref?.()
  }

  function settlePending(requestId: string, result: WakeSupervisorResult): void {
    const request = pending.get(requestId)
    if (request === undefined) return
    pending.delete(requestId)
    try {
      clearScheduledTimeout(request.timeout)
    } catch {
      // The request is already settled exactly once.
    }
    request.resolve(result)
  }

  function failAllPending(failureReason: string): void {
    for (const requestId of [...pending.keys()]) {
      settlePending(requestId, action('failed', failureReason))
    }
  }

  function request(
    command: Omit<WakeWorkerCommand, 'requestId'>,
    expectedType: WakeWorkerOutcome['type'],
  ): Promise<WakeSupervisorResult> {
    const currentChild = child
    if (currentChild === null) return Promise.resolve(action('failed', 'wake_worker_unavailable'))
    requestSequence += 1
    const requestId = `wake-${requestSequence}`
    return new Promise((resolve) => {
      let timeout: unknown
      try {
        timeout = scheduleTimeout(() => {
          pending.delete(requestId)
          publishStatus('failed', 'wake_worker_timeout')
          resolve(action('failed', 'wake_worker_timeout'))
        }, requestTimeoutMs)
      } catch {
        publishStatus('failed', 'wake_worker_timer_failed')
        resolve(action('failed', 'wake_worker_timer_failed'))
        return
      }
      pending.set(requestId, { expectedType, resolve, timeout })
      try {
        currentChild.postMessage({ ...command, requestId } as WakeWorkerCommand)
      } catch {
        publishStatus('failed', 'wake_worker_send_failed')
        settlePending(requestId, action('failed', 'wake_worker_send_failed'))
      }
    })
  }

  function handleOutcome(value: unknown): void {
    const parsed = parseWakeWorkerOutcome(value)
    if (!parsed.ok) {
      publishStatus('failed', parsed.reason)
      failAllPending(parsed.reason)
      try {
        child?.kill()
      } catch {
        // The invalid message is already visible and pending ownership is released.
      }
      return
    }
    const outcome = parsed.value
    if (outcome.type === 'input_activity') {
      if (!shouldListen || (status !== 'listening' && status !== 'acquiring')) return
      if (outcome.blocks <= blocks) return
      lastBlockAt = now()
      blocks = outcome.blocks
      peak = outcome.peak
      rms = outcome.rms
      detector = outcome.detector ?? null
      if (recovery && recovery.state !== 'recovered') {
        recovery = { ...recovery, state: 'recovered' }
        publishStatus('listening', 'wake_audio_recovered')
      }
      armAudioWatchdog()
      if (status === 'acquiring') publishStatus('listening')
      return
    }
    if (outcome.type === 'wake_detected') {
      if (
        (status !== 'listening' && status !== 'acquiring')
        || !shouldListen
        || initialization === null
        || outcome.packageId !== initialization.package.packageId
        || outcome.modelVersion !== initialization.package.modelVersion
      ) return
      detections += 1
      lastDetectionAt = now()
      if (initialization.package.calibration === true) return
      shouldListen = false
      cancelAudioWatchdog()
      publishStatus('released')
      try {
        options.onWake(outcome.packageId)
      } catch {
        publishStatus('failed', 'wake_callback_failed')
      }
      return
    }
    if (outcome.type === 'failed') {
      cancelAudioWatchdog()
      publishStatus('failed', outcome.reason)
      if (outcome.requestId !== undefined) settlePending(outcome.requestId, action('failed', outcome.reason))
      else failAllPending(outcome.reason)
      if (outcome.reason.startsWith('wake_microphone_') && shouldListen) {
        try {
          child?.kill()
        } catch {
          // The microphone failure is already visible; process exit owns bounded recovery.
        }
      }
      return
    }

    const request = pending.get(outcome.requestId)
    if (request === undefined || request.expectedType !== outcome.type) return
    if (
      outcome.type === 'ready'
      && (initialization === null || outcome.packageId !== initialization.package.packageId)
    ) {
      settlePending(outcome.requestId, action('failed', 'wake_worker_package_mismatch'))
      publishStatus('failed', 'wake_worker_package_mismatch')
      return
    }
    if (outcome.type === 'microphone_acquired') {
      acquiredAt = now()
      lastBlockAt = null
      blocks = peak = rms = 0
      detector = null
    }
    if (outcome.type === 'ready') publishStatus('ready')
    else if (outcome.type === 'microphone_acquired') {
      publishStatus('acquiring')
      if (shouldListen) armAudioWatchdog()
    }
    else if (outcome.type === 'microphone_released') publishStatus('released')
    else if (outcome.type === 'stopped') publishStatus('stopped')
    settlePending(
      outcome.requestId,
      action('success', successReason[outcome.type] ?? 'wake_worker_command_completed'),
    )
  }

  function spawnAndInitialize(): Promise<WakeSupervisorResult> {
    if (initialization === null) return Promise.resolve(action('failed', 'wake_worker_not_configured'))
    if (recovery) recovery = { ...recovery, state: 'restarting', attempts: recovery.attempts + 1 }
    publishStatus('starting', recovery ? 'wake_worker_restarting' : null)
    let nextChild: WakeWorkerChild
    try {
      nextChild = options.spawn()
    } catch {
      publishStatus('failed', 'wake_worker_spawn_failed')
      return Promise.resolve(action('failed', 'wake_worker_spawn_failed'))
    }
    child = nextChild
    nextChild.on('message', (value) => { if (child === nextChild) handleOutcome(value) })
    nextChild.on('exit', () => {
      if (child !== nextChild) return
      cancelAudioWatchdog()
      child = null
      failAllPending('wake_worker_exited')
      if (shuttingDown) {
        publishStatus('stopped')
        return
      }
      if (status !== 'failed') publishStatus('failed', 'wake_worker_exited')
      if (restartCount === 1) {
        publishStatus('failed', 'wake_worker_exit_repeated')
        return
      }
      restartCount = 1
      void spawnAndInitialize().then(async (result) => {
        if (result.status === 'success' && shouldListen && !shuttingDown) await acquire()
      })
    })
    return request({ type: 'initialize', ...initialization }, 'ready')
  }

  async function start(
    input: { readonly package: WakeWorkerPackage },
  ): Promise<WakeSupervisorResult> {
    if (child !== null) return action('failed', 'wake_worker_already_started')
    initialization = input
    restartCount = 0
    shuttingDown = false
    shouldListen = false
    return spawnAndInitialize()
  }

  async function acquire(): Promise<WakeSupervisorResult> {
    shouldListen = true
    const inputLabel = getAudioPreferences().preferences.inputLabel
    const result = await request({ type: 'acquire_microphone', ...(inputLabel ? { inputLabel } : {}) }, 'microphone_acquired')
    if (result.status === 'failed' && status !== 'starting') shouldListen = false
    return result
  }

  async function release(): Promise<WakeSupervisorResult> {
    shouldListen = false
    cancelAudioWatchdog()
    if (child === null) {
      if (status !== 'failed') publishStatus('released')
      return action('success', 'wake_microphone_released')
    }
    return request({ type: 'release_microphone' }, 'microphone_released')
  }

  async function updateConfig(
    input: { readonly package: WakeWorkerPackage },
  ): Promise<WakeSupervisorResult> {
    const previous = initialization
    initialization = input
    const result = await request({ type: 'update_config', ...input }, 'ready')
    if (result.status === 'failed') initialization = previous
    return result
  }

  async function shutdown(): Promise<WakeSupervisorResult> {
    shuttingDown = true
    shouldListen = false
    cancelAudioWatchdog()
    if (child === null) {
      publishStatus('stopped')
      return action('success', 'wake_worker_stopped')
    }
    const currentChild = child
    const result = await request({ type: 'shutdown' }, 'stopped')
    child = null
    try {
      currentChild.kill()
    } catch {
      // The worker already acknowledged stopped; kill is best-effort process cleanup.
    }
    return result
  }

  return { start, acquire, release, updateConfig, shutdown, snapshot,
    configuration: () => initialization?.package ?? null }
}
