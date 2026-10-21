import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createNearestFaceTracker, parseCameraFrame } from './nearest-face'
import { CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES, isCameraSnapshot, isCameraSnapshotDimensions, type CameraSnapshot, type CameraTarget } from '../../shared/camera-tracking'

export interface CameraTrackingService {
  stop(): Promise<void>
  capture(): Promise<CameraSnapshot | null>
  republishTarget(): void
}

/** Allowlisted numeric instrumentation, enabled only by the isolated native QA caller. */
export interface CameraQaSample {
  sequence: number; sourceSeconds: number; width: number; height: number; pixelFormat: number
  inputWidth: number; inputHeight: number; inputPixelFormat: number; frameDurationSeconds: number
}
export function parseCameraQaSample(value: unknown): CameraQaSample | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).sort().join(',') !== 'frameDurationSeconds,height,inputHeight,inputPixelFormat,inputWidth,pixelFormat,sequence,sourceSeconds,type,width'
    || v.type !== 'qa_sample') return null
  for (const key of ['sequence', 'sourceSeconds', 'width', 'height', 'pixelFormat', 'inputWidth', 'inputHeight', 'inputPixelFormat', 'frameDurationSeconds']) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < 0) return null
  }
  for (const key of ['sequence', 'width', 'height', 'pixelFormat', 'inputWidth', 'inputHeight', 'inputPixelFormat']) {
    if (!Number.isSafeInteger(v[key]) || (v[key] as number) <= 0) return null
  }
  if ((v.width as number) > 8192 || (v.height as number) > 8192 || (v.inputWidth as number) > 8192 || (v.inputHeight as number) > 8192
    || (v.frameDurationSeconds as number) <= 0 || (v.frameDurationSeconds as number) > 1) return null
  const { type: _type, ...sample } = v
  return sample as unknown as CameraQaSample
}

export interface CameraQaRateProbe {
  fps: number; advertised: number; minimumResult: number; maximumResult: number
  restoreResult: number; minimumSeconds: number; maximumSeconds: number
}
export function parseCameraQaRateProbe(value: unknown): CameraQaRateProbe | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).sort().join(',') !== 'advertised,fps,maximumResult,maximumSeconds,minimumResult,minimumSeconds,restoreResult,type'
    || v.type !== 'qa_rate_probe' || ![1, 2, 5].includes(v.fps as number) || ![0, 1].includes(v.advertised as number)) return null
  for (const key of ['minimumResult', 'maximumResult', 'restoreResult']) if (![0, 1, 2].includes(v[key] as number)) return null
  for (const key of ['minimumSeconds', 'maximumSeconds']) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < 0 || v[key] > 10) return null
  }
  const { type: _type, ...probe } = v
  return probe as unknown as CameraQaRateProbe
}

/** Conversation input: the selected device, else the system default ('default' follows it). */
export function effectiveMicrophoneName(preferences: { inputId: string; inputLabel: string },
  devices: () => readonly { name: string; isDefault: boolean }[]): string {
  return preferences.inputId && preferences.inputId !== 'default' ? preferences.inputLabel
    : devices().find(device => device.isDefault)?.name ?? ''
}

/** Main alone owns the native capture child. Its private pipe is never copied to telemetry. */
export function startCameraTracking(input: {
  now?: () => number
  spawn?: (executable: string, args: string[], options: { stdio: 'pipe'; env: Record<string, string> }) => ChildProcessWithoutNullStreams
  executable: string
  cameraName: string
  onTarget(target: CameraTarget | null): void
  onStatus(status: 'ready' | 'degraded', reason: string): void
  onFrame?(): void
  onQaSample?(sample: CameraQaSample): void
  onQaRateProbe?(probe: CameraQaRateProbe): void
  /** Device name of the conversation microphone; a camera USB reset also resets its built-in microphone. */
  microphoneName?(): string
}): CameraTrackingService {
  const selector = createNearestFaceTracker()
  const now = input.now ?? (() => performance.now())
  let child: ChildProcessWithoutNullStreams | null = null
  let stopped = false
  let restart: NodeJS.Timeout | undefined
  let retryDelay = 1000
  let lastFrameAt = 0
  let lastDetectionAt = 0
  let lastMessageAt = now()
  let lastTarget: CameraTarget | null | undefined
  const sendTarget = (target: CameraTarget | null): void => {
    if (lastTarget !== undefined && lastTarget?.x === target?.x && lastTarget?.y === target?.y) return
    lastTarget = target
    input.onTarget(target)
  }
  let statusKey = ''
  // Diagnostics describe events; they do not grant camera availability.
  let unavailableReason: 'camera_permission_denied' | 'camera_device_absent' | null = null
  let stale = true
  let captureSequence = 0
  let capturePending: { id: number; finish(value: CameraSnapshot | null): void } | null = null
  let captureBusy = false
  let recoveryWait: { finish(ready: boolean): void } | null = null
  let hasFrame = false
  let nativeFramesSeen = false
  let frameWatchArmed = false
  let resetNeeded = false
  let resetPending = false
  let resetPendingAt = 0
  let resetBeforeLaunch = false
  let terminating: ChildProcessWithoutNullStreams | null = null
  let resetAttempts = 0
  let resetExhausted = false
  let lastResetAt = -Infinity
  let healthySince: number | null = null
  let resetHeld: string | null = null
  let microphoneCheckedAt = -Infinity
  const status = (state: 'ready' | 'degraded', reason: string): void => {
    const key = `${state}:${reason}`
    if (key !== statusKey && !stopped) { statusKey = key; input.onStatus(state, reason) }
  }
  const clear = (): void => { selector.reset(); sendTarget(null); stale = true }
  const frameReceived = (): void => {
    unavailableReason = null
    hasFrame = true
    frameWatchArmed = true
    lastFrameAt = now(); stale = false; retryDelay = 1000
    resetNeeded = false; resetPending = false
    resetExhausted = false; resetHeld = null
    healthySince ??= now()
    if (now() - healthySince >= 30000) resetAttempts = 0
    recoveryWait?.finish(true)
  }
  // Re-enumerating the camera also resets its built-in microphone, which can be
  // the conversation input when the Jabra is absent. Defer instead of cutting it;
  // an unknown input counts as shared. A held reset is re-checked every ten seconds.
  const microphoneHold = (): string | null => {
    if (!input.microphoneName) return null
    if (resetHeld !== null && now() - microphoneCheckedAt < 10000) return resetHeld
    microphoneCheckedAt = now()
    try {
      const name = input.microphoneName().trim()
      if (!name) return 'camera_usb_reset_microphone_unknown'
      return name.toLowerCase().includes(input.cameraName.toLowerCase())
        ? 'camera_usb_reset_deferred_microphone' : null
    } catch { return 'camera_usb_reset_microphone_unknown' }
  }
  const requestUsbReset = (): void => {
    const current = child
    if (stopped || !current || terminating === current || !resetNeeded || resetPending) return
    if (resetAttempts >= 2) {
      resetNeeded = false
      resetExhausted = true
      frameWatchArmed = false
      status('degraded', 'camera_usb_recovery_exhausted')
      capturePending?.finish(null)
      recoveryWait?.finish(false)
      return
    }
    if (now() - lastResetAt < 10000) {
      status('degraded', 'camera_usb_recovery_backoff')
      return
    }
    if ((resetHeld = microphoneHold())) {
      // Like exhaustion, a held reset cannot recover this stream; settle requests now.
      status('degraded', resetHeld)
      capturePending?.finish(null)
      recoveryWait?.finish(false)
      return
    }
    resetAttempts++; lastResetAt = now(); resetPendingAt = now(); resetPending = true; healthySince = null
    frameWatchArmed = false
    capturePending?.finish(null)
    clear()
    status('degraded', 'camera_usb_reset_requested')
    const failed = (): void => {
      if (child !== current || stopped) return
      resetPending = false
      status('degraded', 'camera_usb_reset_command_failed')
    }
    try { current.stdin.write('{"type":"reset_usb"}\n', error => { if (error) failed() }) }
    catch { failed() }
  }
  const relaunchLater = (): void => {
    resetBeforeLaunch = (resetBeforeLaunch || resetPending) && unavailableReason === null && resetAttempts < 2
    resetPending = false; healthySince = null
    capturePending?.finish(null)
    clear()
    if (stopped) return
    status('degraded', 'camera_worker_restarting')
    const delay = resetBeforeLaunch ? Math.max(retryDelay, 10000 - (now() - lastResetAt)) : retryDelay
    restart = setTimeout(launch, delay)
    restart.unref()
    retryDelay = Math.min(60000, retryDelay * 2)
  }
  const launch = (): void => {
    if (stopped) return
    status('degraded', 'camera_worker_starting')
    // A blocked native session cannot service its own reset queue. Only after
    // that process exits, spend the next bounded attempt before opening capture.
    let resetFirst = resetBeforeLaunch && resetAttempts < 2 && unavailableReason === null
    resetBeforeLaunch = false
    const held = resetFirst ? microphoneHold() : null
    // A fresh helper may still open the camera; its own stall re-requests recovery.
    if (held) { resetFirst = false; resetNeeded = false; status('degraded', held) }
    if (resetFirst) {
      resetAttempts++; lastResetAt = now(); resetPendingAt = now()
      resetPending = true; resetNeeded = true
      status('degraded', 'camera_usb_reset_requested')
    }
    let current: ChildProcessWithoutNullStreams
    try {
      current = (input.spawn ?? spawn)(input.executable,
        [input.cameraName, ...(resetFirst ? ['--reset-usb-first'] : [])], {
        stdio: 'pipe', env: { PATH: '/usr/bin:/bin' },
      })
    } catch {
      // ENOEXEC/ENOMEM-style failures throw synchronously; degrade the camera, never Main.
      status('degraded', 'camera_worker_unavailable')
      relaunchLater()
      return
    }
    lastMessageAt = now()
    nativeFramesSeen = false; frameWatchArmed = false
    child = current
    current.stdin.on('error', () => capturePending?.finish(null))
    let pending = ''
    let droppingMessage = false
    let diagnosticReported = false
    current.stderr.on('data', () => {
      if (!diagnosticReported) { diagnosticReported = true; status('degraded', 'camera_worker_diagnostic') }
    })
    current.stdout.setEncoding('utf8')
    current.stdout.on('data', (chunk: string) => {
      if (stopped || child !== current || terminating === current) return
      if (droppingMessage) {
        const newline = chunk.indexOf('\n')
        if (newline < 0) return
        chunk = chunk.slice(newline + 1)
        droppingMessage = false
      }
      pending += chunk
      let newline: number
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1)
        if (Buffer.byteLength(line, 'utf8') + 1 > CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES) {
          clear(); status('degraded', 'camera_worker_message_oversized'); continue
        }
        let value: unknown
        try { value = JSON.parse(line) } catch { status('degraded', 'camera_worker_message_invalid'); continue }
        lastMessageAt = now()
        if (input.onQaRateProbe) {
          const probe = parseCameraQaRateProbe(value)
          if (probe) { input.onQaRateProbe(probe); continue }
        }
        if (input.onQaSample) {
          const sample = parseCameraQaSample(value)
          if (sample) { input.onQaSample(sample); continue }
        }
        if (value && typeof value === 'object' && (value as { type?: unknown }).type === 'snapshot') {
          const frame = value as Record<string, unknown>
          const snapshot = { dataUrl: `data:image/jpeg;base64,${typeof frame.jpeg === 'string' ? frame.jpeg : ''}`, width: frame.width, height: frame.height,
            ...('faceCount' in frame ? { faceCount: frame.faceCount } : {}) }
          if (capturePending && capturePending.id === frame.id) {
            const valid = isCameraSnapshot(snapshot)
            if (!valid) status('degraded', !isCameraSnapshotDimensions(frame.width, frame.height)
              ? 'camera_snapshot_dimensions_invalid' : 'camera_snapshot_invalid')
            capturePending.finish(valid ? snapshot : null)
          }
          continue
        }
        if (value && typeof value === 'object' && Object.keys(value).join(',') === 'type') {
          if ((value as { type: unknown }).type === 'heartbeat') continue
          if ((value as { type: unknown }).type === 'frame') {
            if (resetPending) { status('degraded', 'camera_reset_frame_ignored'); continue }
            // Frame delivery is independent of Vision inference. Slow face
            // detection is not permission to reset a healthy USB stream.
            nativeFramesSeen = true; frameReceived()
            input.onFrame?.()
            continue
          }
        }
        const faces = parseCameraFrame(value)
        if (faces !== null) {
          if (resetPending) { status('degraded', 'camera_reset_frame_ignored'); continue }
          // A delayed Vision result must not extend the native-frame deadline.
          if (!nativeFramesSeen) frameReceived()
          if (stale) continue
          lastDetectionAt = now()
          // A few frames must not grant another reset storm. Require sustained
          // delivery before rearming, including across worker replacements.
          sendTarget(selector.update(faces, lastFrameAt))
          status('ready', 'camera_tracking_ready')
          continue
        }
        const event = value as Record<string, unknown> | null
        if (event && typeof event === 'object' && Object.keys(event).sort().join(',') === 'reason,status,type'
          && event.type === 'status' && (event.status === 'ready' || event.status === 'degraded')
          && typeof event.reason === 'string' && /^camera_[a-z_]{1,64}$/.test(event.reason)) {
          if (resetPending && event.status === 'ready') { status('degraded', 'camera_reset_frame_ignored'); continue }
          // A dropped-frame diagnostic is not proof that delivery stopped.
          // Only actual frame receipts control the stale/reset deadline.
          if (event.status !== 'ready' && !event.reason.startsWith('camera_frame_dropped_')) { clear(); healthySince = null }
          status(event.status, event.reason)
          if (event.reason === 'camera_starting') frameWatchArmed = false
          if (['camera_frames_missing', 'camera_stream_not_running', 'camera_capture_failed', 'camera_open_failed'].includes(event.reason)) {
            resetNeeded = true
            requestUsbReset()
          } else if (event.reason.startsWith('camera_usb_reset_')
            && !['camera_usb_reset_requested', 'camera_usb_reset_releasing'].includes(event.reason)) {
            resetPending = false
            // Completion permits rediscovery; a reset receipt alone is not ready.
            resetNeeded = event.reason !== 'camera_usb_reset_complete'
          } else if (event.reason === 'camera_permission_denied' || event.reason === 'camera_device_absent') {
            unavailableReason = event.reason
            frameWatchArmed = false
            resetNeeded = false
            resetPending = false
            capturePending?.finish(null)
            recoveryWait?.finish(false)
          }
        } else status('degraded', 'camera_worker_message_invalid')
      }
      if (Buffer.byteLength(pending, 'utf8') >= CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES) {
        pending = ''; droppingMessage = true
        clear(); status('degraded', 'camera_worker_message_oversized')
      }
    })
    current.on('error', () => status('degraded', 'camera_worker_unavailable'))
    current.once('close', () => {
      if (child !== current) return
      child = null
      terminating = null
      frameWatchArmed = false
      relaunchLater()
    })
  }
  const retireUnresponsive = (current: ChildProcessWithoutNullStreams, reason: string): void => {
    terminating = current
    // Process exit releases the capture owner even if stopRunning is stuck.
    // Never run USB recovery concurrently with the old worker or bypass backoff.
    resetBeforeLaunch = unavailableReason === null && resetAttempts < 2
    resetNeeded = resetBeforeLaunch
    resetPending = false; frameWatchArmed = false; healthySince = null
    capturePending?.finish(null)
    clear(); status('degraded', reason)
    if (resetAttempts >= 2) {
      resetExhausted = true
      status('degraded', 'camera_usb_recovery_exhausted')
      recoveryWait?.finish(false)
    }
    current.kill('SIGKILL')
  }
  let lastWatchAt = now()
  const watchdog = setInterval(() => {
    // After a Main stall or system sleep, this timer runs before the helper's
    // queued output is read. Skip one late check instead of judging stale input.
    const late = now() - lastWatchAt > 1000
    lastWatchAt = now()
    if (late) return
    if (lastTarget && now() - lastDetectionAt > 1500) {
      selector.reset(); sendTarget(null)
      status('degraded', 'camera_detection_stale')
    }
    if (child && terminating !== child) {
      if (resetPending && now() - resetPendingAt >= 4000) {
        retireUnresponsive(child, 'camera_usb_reset_timeout')
      } else if (now() - lastMessageAt > 12000) {
        retireUnresponsive(child, 'camera_worker_unresponsive')
      }
    }
    if (!stale && now() - lastFrameAt > 1500) {
      clear(); healthySince = null; status('degraded', 'camera_frames_stale')
    }
    // Do not wait for the slower native session watchdog or a visitor request.
    // Startup/re-enumeration and unavailable devices have separate deadlines.
    if (frameWatchArmed && now() - lastFrameAt >= 2500) resetNeeded = true
    requestUsbReset()
  }, 500)
  watchdog.unref()
  launch()
  const captureOnce = (deadline: number): Promise<CameraSnapshot | null> => {
    const current = child
    if (stopped || !current || capturePending || now() >= deadline) return Promise.resolve(null)
    if (terminating === current) {
      // A killed helper cannot answer; do not spend the snapshot timeout on it.
      status('degraded', 'camera_snapshot_worker_retiring')
      return Promise.resolve(null)
    }
    return new Promise(resolve => {
      const id = ++captureSequence
      const timer = setTimeout(() => {
        if (capturePending?.id !== id) return
        status('degraded', 'camera_snapshot_timeout')
        capturePending.finish(null)
      }, Math.min(3000, deadline - now()))
      capturePending = { id, finish(value) { clearTimeout(timer); capturePending = null; resolve(value) } }
      try { current.stdin.write(JSON.stringify({ type: 'capture', id }) + '\n', error => { if (error && capturePending?.id === id) capturePending.finish(null) }) }
      catch { capturePending?.finish(null) }
    })
  }
  const waitForRecovery = (deadline: number): Promise<boolean> => {
    if (now() >= deadline) return Promise.resolve(false)
    status('degraded', 'camera_capture_waiting_recovery')
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        status('degraded', 'camera_capture_recovery_timeout')
        recoveryWait?.finish(false)
      }, deadline - now())
      recoveryWait = { finish(ready) { clearTimeout(timer); recoveryWait = null; resolve(ready) } }
      if (child && !stale) recoveryWait.finish(true)
    })
  }
  return {
    republishTarget() {
      // A recreated renderer has lost its previous gaze state.
      if (!stopped && lastTarget !== undefined) input.onTarget(lastTarget)
    },
    async capture() {
      const unavailable = () => resetExhausted || resetHeld !== null || unavailableReason !== null
      if (stopped || captureBusy || unavailable()) return null
      captureBusy = true
      const deadline = now() + 15000
      try {
        // A request arriving between old-worker exit and replacement must join
        // the same bounded recovery as one already pending before the exit.
        if (!child) return await waitForRecovery(deadline) && !stopped ? await captureOnce(deadline) : null
        const frame = await captureOnce(deadline)
        if (frame || stopped || unavailable() || !(resetNeeded || resetPending || stale && hasFrame)) return frame
        // Keep the visitor's request through one existing recovery, without
        // granting extra USB attempts or returning a cached pre-reset frame.
        const recovered = await waitForRecovery(deadline)
        return recovered && !stopped ? await captureOnce(deadline) : null
      } finally { captureBusy = false }
    },
    async stop() {
      if (stopped) return
      stopped = true
      capturePending?.finish(null)
      recoveryWait?.finish(false)
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
