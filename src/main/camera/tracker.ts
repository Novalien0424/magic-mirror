import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createNearestFaceTracker, parseCameraFrame } from './nearest-face'
import type { CameraTarget } from '../../shared/camera-tracking'

export interface CameraTrackingService { stop(): Promise<void> }

/** Main alone owns the native capture child. Its private pipe is never copied to telemetry. */
export function startCameraTracking(input: {
  spawn?: (executable: string, args: string[], options: { stdio: 'pipe'; env: Record<string, string> }) => ChildProcessWithoutNullStreams
  executable: string
  cameraName: string
  onTarget(target: CameraTarget | null): void
  onStatus(status: 'ready' | 'degraded', reason: string): void
}): CameraTrackingService {
  const selector = createNearestFaceTracker()
  let child: ChildProcessWithoutNullStreams | null = null
  let stopped = false
  let restart: NodeJS.Timeout | undefined
  let retryDelay = 1000
  let lastFrameAt = 0
  let lastMessageAt = Date.now()
  let statusKey = ''
  let stale = true
  const status = (state: 'ready' | 'degraded', reason: string): void => {
    const key = `${state}:${reason}`
    if (key !== statusKey && !stopped) { statusKey = key; input.onStatus(state, reason) }
  }
  const clear = (): void => { selector.reset(); input.onTarget(null); stale = true }
  const launch = (): void => {
    if (stopped) return
    status('degraded', 'camera_worker_starting')
    const current = (input.spawn ?? spawn)(input.executable, [input.cameraName], {
      stdio: 'pipe', env: { PATH: '/usr/bin:/bin' },
    })
    lastMessageAt = Date.now()
    child = current
    let pending = ''
    let diagnosticReported = false
    current.stderr.on('data', () => {
      if (!diagnosticReported) { diagnosticReported = true; status('degraded', 'camera_worker_diagnostic') }
    })
    current.stdout.setEncoding('utf8')
    current.stdout.on('data', (chunk: string) => {
      if (stopped || child !== current) return
      pending += chunk
      if (pending.length > 16384) {
        pending = ''; clear(); status('degraded', 'camera_worker_message_oversized'); return
      }
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
        let value: unknown
        try { value = JSON.parse(line) } catch { status('degraded', 'camera_worker_message_invalid'); continue }
        lastMessageAt = Date.now()
        if (value && typeof value === 'object' && Object.keys(value).join(',') === 'type'
          && (value as { type: unknown }).type === 'heartbeat') continue
        const faces = parseCameraFrame(value)
        if (faces !== null) {
          lastFrameAt = Date.now(); stale = false; retryDelay = 1000
          input.onTarget(selector.update(faces, lastFrameAt))
          status('ready', 'camera_tracking_ready')
          continue
        }
        const event = value as Record<string, unknown> | null
        if (event && typeof event === 'object' && Object.keys(event).sort().join(',') === 'reason,status,type'
          && event.type === 'status' && (event.status === 'ready' || event.status === 'degraded')
          && typeof event.reason === 'string' && /^camera_[a-z_]{1,64}$/.test(event.reason)) {
          if (event.status !== 'ready') clear()
          status(event.status, event.reason)
        } else status('degraded', 'camera_worker_message_invalid')
      }
    })
    current.once('error', () => status('degraded', 'camera_worker_unavailable'))
    current.once('close', () => {
      if (child !== current) return
      child = null
      clear()
      if (stopped) return
      status('degraded', 'camera_worker_restarting')
      restart = setTimeout(launch, retryDelay)
      restart.unref()
      retryDelay = Math.min(60000, retryDelay * 2)
    })
  }
  const watchdog = setInterval(() => {
    if (child && Date.now() - lastMessageAt > 12000) {
      status('degraded', 'camera_worker_unresponsive')
      child.kill('SIGKILL')
      lastMessageAt = Date.now()
    }
    if (!stale && Date.now() - lastFrameAt > 1500) {
      clear(); status('degraded', 'camera_frames_stale')
    }
  }, 500)
  watchdog.unref()
  launch()
  return {
    async stop() {
      if (stopped) return
      stopped = true
      clearTimeout(restart); clearInterval(watchdog); clear()
      const current = child
      if (!current) return
      await new Promise<void>(resolve => {
        const deadline = setTimeout(() => { current.kill('SIGKILL') }, 2000)
        current.once('close', () => { clearTimeout(deadline); resolve() })
        current.kill('SIGTERM')
      })
    },
  }
}
