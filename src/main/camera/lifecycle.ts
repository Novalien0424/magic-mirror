import type { LifecycleState } from '../../shared/types'
import type { CameraTrackingService } from './tracker'

export interface CameraLifecycleService extends CameraTrackingService {
  update(lifecycle: LifecycleState, rendererReady: boolean): void
}

/** Console camera status for a lifecycle report; null keeps the report informational. */
export function cameraLifecycleStatus(reason: string): 'ready' | 'degraded' | null {
  if (['camera_permission_denied', 'camera_start_failed', 'camera_release_failed'].includes(reason)) return 'degraded'
  // A stopped tracker publishes nothing, so a deliberate Dormant release must
  // replace the last Active status (which may be a stale stream fault).
  return reason === 'camera_avatar_inactive' ? 'ready' : null
}

/** Camera capture and its watchdog exist only while the visitor avatar is awake. */
export function createCameraLifecycle(input: {
  requestPermission(): Promise<boolean>
  start(): CameraTrackingService
  report(reason: string): void
}): CameraLifecycleService {
  let service: CameraTrackingService | null = null
  let active: boolean | null = null
  let generation = 0
  let closed = false
  let releaseFailed = false
  let release: Promise<void> = Promise.resolve()
  const current = (owner: number) => !closed && active === true && generation === owner && !releaseFailed
  const releaseCurrent = () => {
    const old = service
    service = null
    if (!old) return
    // Stop synchronously disarms the tracker timers and cancels pending images;
    // its promise confirms child exit before another activation may acquire it.
    try {
      release = old.stop().then(() => input.report('camera_worker_released'), () => {
        releaseFailed = true; input.report('camera_release_failed')
      })
    } catch { releaseFailed = true; input.report('camera_release_failed') }
  }
  return {
    update(lifecycle, rendererReady) {
      const next = rendererReady && (lifecycle === 'activating' || lifecycle === 'active')
      if (closed || next === active) return
      active = next
      const owner = ++generation
      releaseCurrent()
      if (!next) { input.report('camera_avatar_inactive'); return }
      void (async () => {
        await release
        if (!current(owner)) return
        const granted = await input.requestPermission()
        if (!current(owner)) return
        if (!granted) { input.report('camera_permission_denied'); return }
        service = input.start()
      })().catch(() => { if (current(owner)) input.report('camera_start_failed') })
    },
    capture: () => active && !closed && service ? service.capture() : Promise.resolve(null),
    republishTarget() { if (active && !closed) service?.republishTarget() },
    stop() {
      if (!closed) { closed = true; active = false; ++generation; releaseCurrent() }
      // An unresolved OS permission prompt owns no device and cannot delay quit.
      return release
    },
  }
}
