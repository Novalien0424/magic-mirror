import { app, systemPreferences } from 'electron'
import { execFileSync, spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Phase4QaInput, Phase4QaResult } from '../phase4-qa'
import { startCameraTracking } from './tracker'

/** Same helper/launch route, counting timestamp-advancing receipts without image processing. */
export async function runNativeCameraDeliveryQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || input.runtime.snapshot().lifecycle !== 'dormant') throw Error('camera_qa_isolation_required')
  const executable = join(app.getAppPath(), 'out/native/camera-tracker')
  const initialPermission = systemPreferences.getMediaAccessStatus('camera')
  const granted = await systemPreferences.askForMediaAccess('camera')
  if (input.runtime.snapshot().lifecycle !== 'dormant' || execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' })
    .split('\n').some(line => line.trim() === executable)) throw Error('camera_qa_owner_present')
  const startupMs = 5000, observationMs = 60000, windowMs = 5000, started = performance.now()
  const frameReceiptsByWindow = Array<number>(observationMs / windowMs).fill(0)
  const statuses: { status: string; reason: string; elapsedMs: number }[] = []
  let frameReceipts = 0, lastReceiptMs = startupMs, maxReceiptGapMs = 0, resets = 0, restarts = 0, observedMs = 0, completed = false, passed = false
  const service = granted ? startCameraTracking({ executable, cameraName: 'Arducam',
    spawn: (file, args, options) => spawn(file, [...args, '--qa-delivery-only'], options),
    onTarget: () => {}, onFrame: () => {
      const at = performance.now() - started
      if (at >= startupMs + observationMs) return
      frameReceipts++
      if (at >= startupMs) {
        frameReceiptsByWindow[Math.floor((at - startupMs) / windowMs)]!++
        maxReceiptGapMs = Math.max(maxReceiptGapMs, at - Math.max(lastReceiptMs, startupMs))
      }
      lastReceiptMs = at
    }, onStatus: (status, reason) => {
      if (reason === 'camera_usb_reset_requested') resets++
      if (reason === 'camera_worker_restarting') restarts++
      statuses.push({ status, reason, elapsedMs: Math.round(performance.now() - started) })
    },
  }) : null
  try {
    if (service) for (let i = 0; i <= frameReceiptsByWindow.length; i++) {
      await new Promise(resolve => setTimeout(resolve, windowMs))
      if (input.runtime.snapshot().lifecycle !== 'dormant') throw Error('camera_qa_isolation_required')
    }
    completed = true
  } finally {
    observedMs = service ? Math.min(observationMs, Math.max(0, performance.now() - started - startupMs)) : 0
    maxReceiptGapMs = Math.round(Math.max(maxReceiptGapMs, startupMs + observedMs - Math.max(lastReceiptMs, startupMs)))
    passed = completed && granted && systemPreferences.getMediaAccessStatus('camera') === 'granted'
      && observedMs === observationMs && frameReceiptsByWindow.every(count => count > 0)
      && resets === 0 && restarts === 0 && maxReceiptGapMs < 2500
    await service?.stop()
    await writeFile(join(input.outputDir, '../camera-delivery.json'), JSON.stringify({ initialPermission,
      permission: systemPreferences.getMediaAccessStatus('camera'), startupMs, observationMs, observedMs, completed, windowMs,
      frameReceiptThrottleMs: 500, freshness: 'advancing_source_timestamp', frameReceipts, frameReceiptsByWindow,
      maxReceiptGapMs, resets, restarts, statuses, passed, imageRetention: 'none',
      cloudTransmission: 'none', humanAcceptance: 'not_executed', processing: 'bypassed', callbackQueue: 'production',
    }, null, 2))
  }
  input.onEvidence({ step: 'native_camera_delivery', status: passed ? 'passed' : 'failed' })
  if (!passed) throw Error('camera_qa_delivery_unavailable')
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: 1 }
}

/** Real permission, helper and camera frames. Images remain in RAM and are discarded. */
export async function runNativeCameraQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')) throw Error('camera_qa_isolation_required')
  const statuses: { phase: string; status: string; reason: string; elapsedMs: number }[] = []
  const started = performance.now()
  const initialPermission = systemPreferences.getMediaAccessStatus('camera')
  const granted = await systemPreferences.askForMediaAccess('camera')
  let ready = false, targets = 0, snapshot = false
  const snapshotFaces: (number | null)[] = []
  const checks: { phase: string; ready: boolean; snapshots: number; stableSnapshots: boolean; resetsDuringSnapshots: number; maxSnapshotReceiptGapMs: number; dimensions: { width: number; height: number }[]; usbResetCompleted: boolean; frameReceipts: number; maxReceiptGapMs: number; injectedStallToResetMs: number | null; lastFrameToResetMs: number | null; resetToFreshFrameMs: number | null; resets: { requestedAtMs: number; releaseAfterMs: number | null; nativeResetAfterMs: number | null; completeAfterMs: number | null; freshFrameAfterMs: number | null; workerRetired: boolean }[] }[] = []
  try {
    for (const phase of ['capture', 'automatic_usb_recovery']) {
      ready = false
      let snapshots = 0, usbResetCompleted = false
      let frameReceipts = 0, previousReceipt = 0, maxReceiptGapMs = 0
      let injectedStallAt: number | null = null, resetRequestedAt: number | null = null
      let injectedStallToResetMs: number | null = null, lastFrameToResetMs: number | null = null, resetToFreshFrameMs: number | null = null
      const resets: typeof checks[number]['resets'] = []
      let resetsBeforeSnapshots = 0
      let snapshotReceiptAt: number | null = null, maxSnapshotReceiptGapMs = 0
      const expectedSnapshots = 6
      const dimensions: { width: number; height: number }[] = []
      const service = granted ? startCameraTracking({
        executable: join(app.getAppPath(), 'out/native/camera-tracker'), cameraName: 'Arducam',
        spawn: (executable, args, options) => spawn(executable,
          phase === 'automatic_usb_recovery' ? [...args, '--qa-stall-once'] : args, options),
        onTarget: () => { targets++ },
        onFrame: () => {
          const at = performance.now()
          if (resetRequestedAt !== null && resetToFreshFrameMs === null) resetToFreshFrameMs = Math.round(at - resetRequestedAt)
          const reset = resets.at(-1)
          if (reset && reset.completeAfterMs !== null && reset.freshFrameAfterMs === null) {
            reset.freshFrameAfterMs = Math.round(at - started) - reset.requestedAtMs
          }
          if (previousReceipt) maxReceiptGapMs = Math.max(maxReceiptGapMs, Math.round(at - previousReceipt))
          if (snapshotReceiptAt !== null) {
            maxSnapshotReceiptGapMs = Math.max(maxSnapshotReceiptGapMs, Math.round(at - snapshotReceiptAt))
            snapshotReceiptAt = at
          }
          previousReceipt = at; frameReceipts++
        },
        onStatus: (status, reason) => {
          ready = status === 'ready'
          const at = performance.now()
          if (reason === 'camera_qa_frames_halted') injectedStallAt = at
          if (reason === 'camera_usb_reset_requested') {
            resets.push({ requestedAtMs: Math.round(at - started), releaseAfterMs: null,
              nativeResetAfterMs: null, completeAfterMs: null, freshFrameAfterMs: null, workerRetired: false })
            if (resetRequestedAt === null) {
              resetRequestedAt = at
              if (injectedStallAt !== null) injectedStallToResetMs = Math.round(at - injectedStallAt)
              if (previousReceipt) lastFrameToResetMs = Math.round(at - previousReceipt)
            }
          }
          if (reason === 'camera_usb_reset_complete') usbResetCompleted = true
          const reset = resets.at(-1)
          if (reset) {
            const elapsed = Math.round(at - started) - reset.requestedAtMs
            if (reason === 'camera_usb_reset_releasing') reset.releaseAfterMs = elapsed
            if (reason === 'camera_usb_resetting') reset.nativeResetAfterMs = elapsed
            if (reason === 'camera_usb_reset_complete') reset.completeAfterMs = elapsed
            if (reason === 'camera_usb_reset_timeout' || reason === 'camera_worker_unresponsive') reset.workerRetired = true
          }
          statuses.push({ phase, status, reason, elapsedMs: Math.round(performance.now() - started) })
        },
      }) : null
      try {
        const deadline = performance.now() + 50000
        while (service && (!ready || phase === 'automatic_usb_recovery' && !usbResetCompleted)
          && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
        // Multiple fresh requested frames prove that one early buffer was not
        // mistaken for a recovered stream. No frame leaves RAM.
        resetsBeforeSnapshots = resets.length
        snapshotReceiptAt = previousReceipt || performance.now()
        if (ready && service && (phase !== 'automatic_usb_recovery' || usbResetCompleted)) for (let i = 0; i < expectedSnapshots; i++) {
          const frame = await service.capture()
          if (frame) { snapshots++; dimensions.push({ width: frame.width, height: frame.height }); snapshotFaces.push(frame.faceCount ?? null) }
          else break // Six successes are required; another timed-out request cannot rescue this phase.
          if (i < expectedSnapshots - 1) await new Promise(resolve => setTimeout(resolve, 5000))
        }
        const resetsDuringSnapshots = resets.length - resetsBeforeSnapshots
        maxSnapshotReceiptGapMs = Math.max(maxSnapshotReceiptGapMs, Math.round(performance.now() - snapshotReceiptAt))
        checks.push({ phase, ready, snapshots, stableSnapshots: snapshots === expectedSnapshots && resetsDuringSnapshots === 0
          && maxSnapshotReceiptGapMs < 2500,
          resetsDuringSnapshots, maxSnapshotReceiptGapMs, dimensions, usbResetCompleted, frameReceipts, maxReceiptGapMs,
          injectedStallToResetMs, lastFrameToResetMs, resetToFreshFrameMs, resets })
      } finally { await service?.stop() }
      if (!ready || !checks.at(-1)!.stableSnapshots || phase === 'automatic_usb_recovery' && !usbResetCompleted) break
    }
    snapshot = checks.length === 2 && checks.every(check => check.ready && check.stableSnapshots)
      && checks[1]!.usbResetCompleted
      && checks[1]!.injectedStallToResetMs !== null && checks[1]!.injectedStallToResetMs! <= 3500
      && checks[1]!.lastFrameToResetMs !== null && checks[1]!.lastFrameToResetMs! <= 3500
      && checks[1]!.resetToFreshFrameMs !== null
  } finally {
    await writeFile(join(input.outputDir, '../camera-native.json'), JSON.stringify({
      initialPermission, permission: systemPreferences.getMediaAccessStatus('camera'), ready, targets, snapshot,
      statuses, checks, snapshotFaces, imageRetention: 'none', cloudTransmission: 'none', humanAcceptance: 'not_executed',
    }, null, 2))
  }
  input.onEvidence({ step: 'native_camera', status: ready && snapshot ? 'passed' : 'failed' })
  if (!ready || !snapshot) throw Error('camera_qa_capture_unavailable')
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: 2 }
}
