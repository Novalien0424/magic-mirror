import { isCameraTarget, type CameraTarget } from '../../shared/camera-tracking'

/** Frame-rate independent, bounded head/eye movement; stale data fades to neutral. */
export function createGazeSmoother(): {
  setTarget(value: CameraTarget | null, now: number): void
  step(deltaSeconds: number, now: number, active: boolean): CameraTarget
} {
  let target: CameraTarget | null = null
  let receivedAt = -Infinity
  let x = 0, y = 0
  return {
    setTarget(value, now) {
      target = isCameraTarget(value) ? value : null
      receivedAt = Number.isFinite(now) ? now : -Infinity
    },
    step(deltaSeconds, now, active) {
      const valid = active && Number.isFinite(now) && now - receivedAt <= 900 && now >= receivedAt
      const desired = valid ? target : null
      const dt = Number.isFinite(deltaSeconds) ? Math.min(0.1, Math.max(0, deltaSeconds)) : 0
      const alpha = 1 - Math.exp(-dt / 0.22)
      x += ((desired?.x ?? 0) - x) * alpha
      y += ((desired?.y ?? 0) - y) * alpha
      return { x, y }
    },
  }
}
