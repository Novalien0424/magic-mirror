export type DisplaySleepBlockerStatus = 'not_started' | 'active' | 'degraded' | 'stopped'

export type DisplaySleepBlockerEvent = {
  readonly action: 'start' | 'status' | 'stop'
  readonly status: DisplaySleepBlockerStatus
  readonly reason?: string
}

export interface PowerSaveBlockerPort {
  start(type: 'prevent-display-sleep'): number
  isStarted(id: number): boolean
  stop(id: number): void
}

export interface DisplaySleepBlocker {
  start(): DisplaySleepBlockerStatus
  status(): DisplaySleepBlockerStatus
  stop(): DisplaySleepBlockerStatus
}

const START_FAILED = 'display_sleep_start_failed'
const NOT_ACTIVE = 'display_sleep_not_active'
const STATUS_FAILED = 'display_sleep_status_failed'
const STOP_FAILED = 'display_sleep_stop_failed'

export function createDisplaySleepBlocker(
  api: PowerSaveBlockerPort,
  emit: (event: DisplaySleepBlockerEvent) => void,
): DisplaySleepBlocker {
  let currentStatus: DisplaySleepBlockerStatus = 'not_started'
  let currentReason: string | undefined
  let startAttempted = false
  let stopAttempted = false
  let blockerId: number | null = null

  function publish(
    action: DisplaySleepBlockerEvent['action'],
    status: DisplaySleepBlockerStatus,
    reason?: string,
  ): void {
    const event: DisplaySleepBlockerEvent = reason === undefined
      ? { action, status }
      : { action, status, reason }
    try {
      emit(event)
    } catch {
      // The telemetry sink is observational; a sink failure cannot gate Main.
    }
  }

  function setStatus(status: DisplaySleepBlockerStatus, reason?: string): void {
    currentStatus = status
    currentReason = reason
  }

  function checkRetainedBlocker(): DisplaySleepBlockerStatus {
    const id = blockerId
    if (id === null) return currentStatus

    try {
      if (!api.isStarted(id)) {
        setStatus('degraded', NOT_ACTIVE)
        return currentStatus
      }
    } catch {
      setStatus('degraded', STATUS_FAILED)
      return currentStatus
    }

    setStatus('active')
    return currentStatus
  }

  function start(): DisplaySleepBlockerStatus {
    if (startAttempted || stopAttempted) return currentStatus
    startAttempted = true

    let id: number
    try {
      id = api.start('prevent-display-sleep')
    } catch {
      setStatus('degraded', START_FAILED)
      publish('start', currentStatus, currentReason)
      return currentStatus
    }

    if (!Number.isSafeInteger(id)) {
      setStatus('degraded', START_FAILED)
      publish('start', currentStatus, currentReason)
      return currentStatus
    }

    blockerId = id
    const status = checkRetainedBlocker()
    publish('start', status, currentReason)
    return status
  }

  function status(): DisplaySleepBlockerStatus {
    if (currentStatus !== 'stopped' && blockerId !== null && !stopAttempted) {
      checkRetainedBlocker()
    }
    publish('status', currentStatus, currentReason)
    return currentStatus
  }

  function stop(): DisplaySleepBlockerStatus {
    if (stopAttempted) return currentStatus
    stopAttempted = true

    const id = blockerId
    if (id === null) {
      setStatus('stopped')
      publish('stop', currentStatus)
      return currentStatus
    }

    try {
      api.stop(id)
      setStatus('stopped')
      publish('stop', currentStatus)
    } catch {
      setStatus('degraded', STOP_FAILED)
      publish('stop', currentStatus, currentReason)
    }
    return currentStatus
  }

  return { start, status, stop }
}
