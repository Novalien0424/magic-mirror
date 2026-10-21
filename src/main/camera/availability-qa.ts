import { app, nativeImage, systemPreferences } from 'electron'
import { execFileSync, spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Phase4QaInput, Phase4QaResult } from '../phase4-qa'
import { startCameraTracking, type CameraQaRateProbe } from './tracker'
import { CAMERA_QA_CASES, isCameraQaCase } from './qa-cases'
import { cameraSampleMetrics } from './availability-metrics'

/** One signed production helper and launch context, with isolated, allowlisted experiment inputs. */
export async function runCameraAvailabilityQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const mode = process.env['MIRROR_CAMERA_QA_CASE'], check = process.env['MIRROR_CAMERA_QA_CHECK']
  if (!isCameraQaCase(mode) || !['screen', 'stable', 'cycles'].includes(check ?? '')) throw Error('camera_qa_case_invalid')
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || input.runtime.snapshot().lifecycle !== 'dormant') throw Error('camera_qa_isolation_required')
  const executable = join(app.getAppPath(), 'out/native/camera-tracker')
  const owners = (): number => execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' })
    .split('\n').filter(line => line.trim() === executable).length
  if (owners()) throw Error('camera_qa_owner_present')
  const permission = await systemPreferences.askForMediaAccess('camera')
  const startupMs = 5000, durationMs = check === 'stable' ? 300000 : check === 'cycles' ? 10000 : 30000
  const statuses: { cycle: number; status: string; reason: string; elapsedMs: number }[] = []
  const trials: object[] = []
  let passed = permission, completed = false
  const started = performance.now()
  const wait = (ms: number): Promise<void> => new Promise(resolveWait => setTimeout(resolveWait, ms))
  try {
    for (let cycle = 0; permission && cycle < (check === 'cycles' ? 20 : 1); cycle++) {
      if (input.runtime.snapshot().lifecycle !== 'dormant' || owners()) throw Error('camera_qa_owner_present')
      const at = performance.now(), metrics = cameraSampleMetrics(startupMs, durationMs)
      let resets = 0, restarts = 0, terminal = false, stale = false, maximumOwners = 0
      const rateProbes: CameraQaRateProbe[] = []
      const snapshots: { elapsedMs: number; requestMs: number; decoded: boolean; width: number; height: number }[] = []
      const service = startCameraTracking({ executable, cameraName: 'Arducam',
        spawn: (file, args, options) => spawn(file, [...args, '--qa-observe', ...CAMERA_QA_CASES[mode],
          ...(check === 'cycles' ? [] : ['--qa-delivery-only'])], options),
        onTarget: () => {},
        onQaSample: sample => metrics.add(sample, performance.now() - at),
        onQaRateProbe: probe => { if (rateProbes.length < 10) rateProbes.push(probe) },
        onStatus: (status, reason) => {
          if (reason === 'camera_usb_reset_requested') resets++
          if (reason === 'camera_worker_restarting') restarts++
          if (reason === 'camera_qa_frame_timestamp_stale') stale = true
          if (['camera_usb_recovery_exhausted', 'camera_permission_denied', 'camera_device_absent',
            'camera_qa_format_unsupported', 'camera_qa_rate_unsupported', 'camera_qa_rate_api_rejected', 'camera_qa_mode_invalid', 'camera_worker_restarting'].includes(reason)) terminal = true
          if (statuses.length < 500) statuses.push({ cycle, status, reason, elapsedMs: Math.round(performance.now() - started) })
        },
      })
      const ownerWatch = setInterval(() => { maximumOwners = Math.max(maximumOwners, owners()) }, 1000)
      try {
        if (check === 'cycles') {
          for (let index = 0; index < (cycle === 0 ? 8 : 1); index++) {
            const requestedAt = performance.now()
            // The underlying owner is always stopped in finally, including deadline failure.
            let timer: ReturnType<typeof setTimeout> | undefined
            const snapshot = await Promise.race([service.capture(), new Promise<null>(resolveWait => {
              timer = setTimeout(() => resolveWait(null), 15000)
            })]).finally(() => clearTimeout(timer))
            const decoded = snapshot ? nativeImage.createFromDataURL(snapshot.dataUrl) : null
            const size = decoded?.getSize()
            snapshots.push({ elapsedMs: performance.now() - at, requestMs: performance.now() - requestedAt,
              decoded: !!decoded && !decoded.isEmpty() && size?.width === snapshot?.width && size?.height === snapshot?.height,
              width: size?.width ?? 0, height: size?.height ?? 0 })
            if (!snapshot || terminal) break
          }
          maximumOwners = Math.max(maximumOwners, owners())
        } else {
          while (!terminal && performance.now() - at < startupMs + durationMs) {
            await wait(250)
            if (input.runtime.snapshot().lifecycle !== 'dormant') throw Error('camera_qa_isolation_required')
            if (maximumOwners === 0) maximumOwners = owners()
          }
        }
      } finally { clearInterval(ownerWatch); await service.stop() }
      const elapsedMs = performance.now() - at, summary = metrics.result(elapsedMs), idleOwners = owners()
      const expected = mode === 'minimum' ? [96, 96, 5] : mode.startsWith('low') ? [320, 240, mode === 'low15' ? 15 : 5] : /1080/.test(mode) ? [1920, 1080, mode === 'mjpeg1080' ? 15 : 5]
        : /720/.test(mode) ? [1280, 720, ['yuy2720', 'mjpeg7205'].includes(mode) ? 5 : 15] : [640, 480, mode === 'vga5' ? 5 : 15]
      const apiRate = Number(mode.match(/_api([125])$/)?.[1] ?? 0)
      if (apiRate) expected[2] = apiRate
      const sourceGapLimit = apiRate && apiRate < 5 ? 1000 / apiRate + 250 : 250
      const receiptGapLimit = apiRate && apiRate < 5 ? sourceGapLimit + 250 : 500
      const formatVerified = summary.formats.length === 1 && summary.formats.every(f => f.width === expected[0]
        && f.height === expected[1] && f.inputWidth === expected[0] && f.inputHeight === expected[1]
        && Math.abs(1 / f.frameDurationSeconds - expected[2]!) < 0.1)
      const trialPassed = !terminal && !stale && summary.staleSamples === 0 && formatVerified && maximumOwners === 1 && idleOwners === 0
        && (check === 'cycles'
          ? snapshots.length === (cycle === 0 ? 8 : 1) && snapshots.every(s => s.decoded
            && s.width === expected[0] && s.height === expected[1] && s.requestMs <= (resets ? 15000 : 3000))
            && (cycle !== 0 || snapshots.at(-1)!.elapsedMs <= 10000)
          : elapsedMs >= startupMs + durationMs && summary.windows.every(n => n > 0) && resets === 0 && restarts === 0
            && summary.maxSourceGapMs <= sourceGapLimit && summary.maxReceiptGapMs <= receiptGapLimit
            && summary.windows.reduce((sum, count) => sum + count, 0) >= expected[2]! * durationMs / 1000)
      trials.push({ cycle, elapsedMs, expected, ...summary, formatVerified, rateProbes, sourceGapLimit, receiptGapLimit, resets, restarts, terminal, stale,
        maximumOwners, idleOwners, snapshots, passed: trialPassed })
      if (!trialPassed) { passed = false; break }
      if (check === 'cycles' && cycle < 19) await wait([1000, 3000, 10000][cycle % 3]!)
    }
    completed = true
  } finally {
    passed = passed && completed
    await writeFile(join(input.outputDir, '../camera-availability.json'), JSON.stringify({ mode, check, permission,
      startupMs, durationMs, elapsedMs: performance.now() - started, trials, statuses, passed,
      imageRetention: 'none', cloudTransmission: 'none', humanAcceptance: 'not_executed',
      processing: check === 'cycles' ? 'production' : 'bypassed', videoEncoding: 'not_executed',
      qualification: 'bounded_trial_only', daysLongAvailability: 'not_executed' }, null, 2))
  }
  input.onEvidence({ step: 'camera_availability', status: passed ? 'passed' : 'failed' })
  if (!passed) throw Error('camera_qa_availability_failed')
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: trials.length }
}
