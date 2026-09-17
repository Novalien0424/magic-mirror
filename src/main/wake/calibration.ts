import { randomUUID } from 'node:crypto'
import type { WakeCalibrationCommand, WakeCalibrationSettings, WakeCalibrationSnapshot } from '../../shared/wake-calibration'
import type { WakeSupervisor, WakeSupervisorResult } from './supervisor'
import type { WakeWorkerPackage } from './protocol'

interface Trial {
  id: string
  original: WakeWorkerPackage
  settings: WakeCalibrationSettings
  baseline: number
  touched: boolean
}

export function createWakeCalibration(input: {
  supervisor(): WakeSupervisor | null
  canListen(): boolean
  load(settings: WakeCalibrationSettings): Promise<WakeWorkerPackage>
  leaseMs?: number
}) {
  let trial: Trial | null = null
  let queue: Promise<unknown> = Promise.resolve()
  let lease: ReturnType<typeof setTimeout> | undefined
  let restorationGeneration = 0
  let pendingRestorations = 0
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const task = queue.then(work)
    queue = task.catch(() => undefined)
    return task
  }
  const snapshot = (reason: string | null = null): WakeCalibrationSnapshot => {
    const current = input.supervisor()?.snapshot()
    const detections = trial ? Math.max(0, (current?.input.detections ?? 0) - trial.baseline) : 0
    return { status: reason || (trial && current?.status === 'failed') ? 'failed' : trial ? 'testing' : 'stopped',
      sessionId: trial?.id ?? null, settings: trial?.settings ?? null,
      input: current?.input ?? null, detections,
      lastDetectionAgeMs: detections > 0 ? current?.input.lastDetectionAgeMs ?? null : null,
      reason: reason ?? (trial ? current?.reason ?? null : null) }
  }
  const check = (result: WakeSupervisorResult): void => {
    if (result.status !== 'success') throw new Error(result.reason)
  }
  const stop = (reacquire: boolean): Promise<WakeCalibrationSnapshot> => {
    const generation = ++restorationGeneration
    const previous = trial
    trial = null
    clearTimeout(lease)
    if (previous?.touched) pendingRestorations++
    return enqueue(async () => {
      const supervisor = input.supervisor()
      if (previous?.touched && supervisor) {
        try {
          check(await supervisor.release())
          check(await supervisor.updateConfig({ package: previous.original }))
          if (reacquire && generation === restorationGeneration && input.canListen()) check(await supervisor.acquire())
        } catch { return snapshot('wake_calibration_restore_failed') }
        finally { pendingRestorations-- }
      } else if (previous?.touched) {
        pendingRestorations--
      }
      return snapshot()
    })
  }
  const renew = (): void => {
    clearTimeout(lease)
    lease = setTimeout(() => { void stop(true) }, input.leaseMs ?? 5000)
    lease.unref?.()
  }
  const apply = (current: Trial, settings: WakeCalibrationSettings): Promise<WakeCalibrationSnapshot> => enqueue(async () => {
    if (trial !== current) return snapshot()
    const supervisor = input.supervisor()
    if (!supervisor || !input.canListen()) return snapshot('wake_calibration_requires_sleep')
    try {
      const candidate = await input.load(settings)
      if (trial !== current || !input.canListen()) return snapshot('wake_calibration_cancelled')
      current.touched = true
      check(await supervisor.release())
      if (trial !== current || !input.canListen()) return snapshot('wake_calibration_cancelled')
      const configuration = { package: { ...candidate, calibration: true } }
      const configured = await supervisor.updateConfig(configuration)
      if (configured.status === 'failed' && configured.reason === 'wake_worker_unavailable') {
        // An explicit test can retry after bounded automatic recovery is exhausted.
        // Release above (or confirmed process exit) has removed the old mic owner.
        if (trial !== current || !input.canListen()) return snapshot('wake_calibration_cancelled')
        check(await supervisor.start(configuration))
      } else check(configured)
      if (trial !== current || !input.canListen()) return snapshot('wake_calibration_cancelled')
      current.settings = settings
      current.baseline = supervisor.snapshot().input.detections
      check(await supervisor.acquire())
      if (trial === current) renew()
      return snapshot()
    } catch (error) {
      // Queue restoration after this operation; never deadlock the serialized owner.
      void stop(true)
      return snapshot(error instanceof Error && error.message === 'wake_native_score_unavailable'
        ? 'wake_native_score_unavailable' : 'wake_calibration_failed')
    }
  })
  const command = async (request: WakeCalibrationCommand): Promise<WakeCalibrationSnapshot> => {
    if (request.type === 'status') return { ...snapshot(), status: 'stopped', sessionId: null,
      settings: null, detections: 0, lastDetectionAgeMs: null, reason: null }
    if (request.type === 'start') {
      await queue
      if (trial) return Promise.resolve(snapshot('wake_calibration_busy'))
      const supervisor = input.supervisor()
      const original = supervisor?.configuration()
      if (!original || !input.canListen()) return Promise.resolve(snapshot('wake_calibration_requires_sleep'))
      const current: Trial = { id: randomUUID(), original, settings: request.settings,
        baseline: supervisor!.snapshot().input.detections, touched: false }
      trial = current
      renew()
      return apply(current, request.settings)
    }
    if (!trial || request.sessionId !== trial.id) return Promise.resolve(snapshot('wake_calibration_expired'))
    if (request.type === 'stop') return stop(true)
    renew()
    if (request.type === 'read') return Promise.resolve(snapshot())
    return apply(trial, request.settings)
  }
  return { command, stop, isActive: () => trial !== null || pendingRestorations > 0 }
}
