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
  | 'listening'
  | 'released'
  | 'failed'

export interface WakeSupervisorSnapshot {
  readonly status: WakeSupervisorStatus
  readonly packageId: string | null
  readonly engine: 'porcupine' | 'sherpa' | null
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
  start(input: { readonly package: WakeWorkerPackage; readonly accessKey?: string }): Promise<WakeSupervisorResult>
  acquire(): Promise<WakeSupervisorResult>
  release(): Promise<WakeSupervisorResult>
  updateConfig(input: { readonly package: WakeWorkerPackage; readonly accessKey?: string }): Promise<WakeSupervisorResult>
  shutdown(): Promise<WakeSupervisorResult>
  snapshot(): WakeSupervisorSnapshot
}

export function createWakeSupervisor(options: WakeSupervisorOptions): WakeSupervisor {
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) && (options.requestTimeoutMs ?? 0) > 0
    ? Math.floor(options.requestTimeoutMs ?? 0)
    : 5_000
  const scheduleTimeout = options.scheduleTimeout
    ?? ((callback: () => void, delayMs: number): unknown => setTimeout(callback, delayMs))
  const clearScheduledTimeout = options.clearScheduledTimeout
    ?? ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let child: WakeWorkerChild | null = null
  let initialization: { readonly package: WakeWorkerPackage; readonly accessKey?: string } | null = null
  let status: WakeSupervisorStatus = 'stopped'
  let reason: string | null = null
  let restartCount: 0 | 1 = 0
  let requestSequence = 0
  let shouldListen = false
  let shuttingDown = false
  const pending = new Map<string, PendingRequest>()

  function snapshot(): WakeSupervisorSnapshot {
    return Object.freeze({
      status,
      packageId: initialization?.package.packageId ?? null,
      engine: initialization?.package.engine ?? null,
      restartCount,
      reason,
    })
  }

  function publishStatus(nextStatus: WakeSupervisorStatus, nextReason: string | null = null): void {
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
        resolve(action('failed', 'wake_worker_timer_failed'))
        return
      }
      pending.set(requestId, { expectedType, resolve, timeout })
      try {
        currentChild.postMessage({ ...command, requestId } as WakeWorkerCommand)
      } catch {
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
    if (outcome.type === 'wake_detected') {
      if (
        status !== 'listening'
        || initialization === null
        || outcome.packageId !== initialization.package.packageId
        || outcome.modelVersion !== initialization.package.modelVersion
      ) return
      shouldListen = false
      publishStatus('released')
      try {
        options.onWake(outcome.packageId)
      } catch {
        publishStatus('failed', 'wake_callback_failed')
      }
      return
    }
    if (outcome.type === 'failed') {
      publishStatus('failed', outcome.reason)
      if (outcome.requestId !== undefined) settlePending(outcome.requestId, action('failed', outcome.reason))
      else failAllPending(outcome.reason)
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
    if (outcome.type === 'ready') publishStatus('ready')
    else if (outcome.type === 'microphone_acquired') publishStatus('listening')
    else if (outcome.type === 'microphone_released') publishStatus('released')
    else if (outcome.type === 'stopped') publishStatus('stopped')
    settlePending(
      outcome.requestId,
      action('success', successReason[outcome.type] ?? 'wake_worker_command_completed'),
    )
  }

  function spawnAndInitialize(): Promise<WakeSupervisorResult> {
    if (initialization === null) return Promise.resolve(action('failed', 'wake_worker_not_configured'))
    publishStatus('starting')
    let nextChild: WakeWorkerChild
    try {
      nextChild = options.spawn()
    } catch {
      publishStatus('failed', 'wake_worker_spawn_failed')
      return Promise.resolve(action('failed', 'wake_worker_spawn_failed'))
    }
    child = nextChild
    nextChild.on('message', handleOutcome)
    nextChild.on('exit', () => {
      if (child !== nextChild) return
      child = null
      failAllPending('wake_worker_exited')
      if (shuttingDown) {
        publishStatus('stopped')
        return
      }
      if (restartCount === 1) {
        publishStatus('failed', 'wake_worker_exit_repeated')
        return
      }
      restartCount = 1
      const reacquire = shouldListen
      void spawnAndInitialize().then(async (result) => {
        if (result.status === 'success' && reacquire) await acquire()
      })
    })
    return request({ type: 'initialize', ...initialization }, 'ready')
  }

  async function start(
    input: { readonly package: WakeWorkerPackage; readonly accessKey?: string },
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
    const result = await request({ type: 'acquire_microphone' }, 'microphone_acquired')
    if (result.status === 'failed' && status !== 'starting') shouldListen = false
    return result
  }

  async function release(): Promise<WakeSupervisorResult> {
    shouldListen = false
    return request({ type: 'release_microphone' }, 'microphone_released')
  }

  async function updateConfig(
    input: { readonly package: WakeWorkerPackage; readonly accessKey?: string },
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

  return { start, acquire, release, updateConfig, shutdown, snapshot }
}
