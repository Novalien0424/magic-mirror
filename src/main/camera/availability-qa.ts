import { app, nativeImage, systemPreferences } from 'electron'
import { execFileSync, spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Phase4QaInput, Phase4QaResult } from '../phase4-qa'
import { startCameraTracking, type CameraQaFormat, type CameraQaRateProbe } from './tracker'
import { CAMERA_QA_CASES, isCameraQaCase } from './qa-cases'
import { cameraSampleMetrics } from './availability-metrics'

// Expectations follow the native mode argument, including size/preset variants.
const EXPECTED_MODES: Record<string, readonly [number, number, number]> = {
  low5: [320, 240, 5], low15: [320, 240, 15], vga5: [640, 480, 5], vga15: [640, 480, 15],
  mjpeg720: [1280, 720, 15], mjpeg7205: [1280, 720, 5], nv12720: [1280, 720, 15],
  mjpeg1080: [1920, 1080, 15], mjpeg10805: [1920, 1080, 5], nv1210805: [1920, 1080, 5],
  yuy210805: [1920, 1080, 5], yuy2720: [1280, 720, 5],
}

/** One signed production helper and launch context, with isolated, allowlisted experiment inputs. */
export async function runCameraAvailabilityQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const mode = process.env['MIRROR_CAMERA_QA_CASE'], check = process.env['MIRROR_CAMERA_QA_CHECK']
  if (!isCameraQaCase(mode) || !['screen', 'stable', 'cycles', 'soak'].includes(check ?? '')) throw Error('camera_qa_case_invalid')
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || input.runtime.snapshot().lifecycle !== 'dormant') throw Error('camera_qa_isolation_required')
  const executable = join(app.getAppPath(), 'out/native/camera-tracker')
  const owners = (): number => execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' })
    .split('\n').filter(line => line.trim() === executable).length
  if (owners()) throw Error('camera_qa_owner_present')
  const permission = await systemPreferences.askForMediaAccess('camera')
  const startupMs = 5000, snapshotIntervalMs = 60000, durationMs = check === 'soak' ? 1800000 : check === 'stable' ? 300000 : check === 'cycles' ? 10000 : 30000
  const statuses: { cycle: number; status: string; reason: string; elapsedMs: number }[] = []
  const trials: object[] = []
  let passed = permission, completed = false
  const started = performance.now()
  const wait = (ms: number): Promise<void> => new Promise(resolveWait => setTimeout(resolveWait, ms))
  try {
    for (let cycle = 0; permission && cycle < (check === 'cycles' ? 20 : 1); cycle++) {
      if (input.runtime.snapshot().lifecycle !== 'dormant' || owners()) throw Error('camera_qa_owner_present')
      const at = performance.now(), metrics = cameraSampleMetrics(startupMs, durationMs)
      const startupMetrics = cameraSampleMetrics(0, startupMs), observationMetrics = cameraSampleMetrics(0, durationMs)
      let resets = 0, restarts = 0, terminal = false, stale = false, maximumOwners = 0, sampleCount = 0
      const rateProbes: CameraQaRateProbe[] = []
      const advertisedFormats: CameraQaFormat[] = []
      const snapshots: { elapsedMs: number; requestMs: number; decoded: boolean; width: number; height: number }[] = []
      const service = startCameraTracking({ executable, cameraName: '', allowDiagnosticSnapshots: true,
        spawn: (file, args, options) => spawn(file, [...args, '--qa-observe', ...CAMERA_QA_CASES[mode],
          ...(['cycles', 'soak'].includes(check!) ? [] : ['--qa-delivery-only'])], options),
        onTarget: () => {},
        onQaFormat: format => {
          if (advertisedFormats.length < 512 && !advertisedFormats.some(value => JSON.stringify(value) === JSON.stringify(format))) advertisedFormats.push(format)
        },
        onQaSample: sample => {
          const elapsed = performance.now() - at
          sampleCount++
          metrics.add(sample, elapsed)
          if (elapsed < startupMs) startupMetrics.add(sample, elapsed)
          else observationMetrics.add(sample, elapsed - startupMs)
        },
        onQaRateProbe: probe => { if (rateProbes.length < 10) rateProbes.push(probe) },
        onStatus: (status, reason) => {
          if (reason === 'camera_usb_reset_requested') resets++
          if (reason === 'camera_worker_restarting') restarts++
          if (reason === 'camera_qa_frame_timestamp_stale') stale = true
          if (['camera_usb_recovery_exhausted', 'camera_permission_denied', 'camera_device_absent', 'camera_device_ambiguous',
            'camera_qa_format_unsupported', 'camera_qa_rate_unsupported', 'camera_qa_rate_api_rejected', 'camera_qa_mode_invalid', 'camera_worker_restarting'].includes(reason)) terminal = true
          if (statuses.length < 500) statuses.push({ cycle, status, reason, elapsedMs: Math.round(performance.now() - started) })
        },
      })
      const captureSnapshot = async () => {
        const requestedAt = performance.now()
        // The underlying owner is always stopped in finally, including deadline failure.
        let timer: ReturnType<typeof setTimeout> | undefined
        const snapshot = await Promise.race([service.capture(), new Promise<null>(resolveWait => {
          timer = setTimeout(() => resolveWait(null), 15000)
        })]).finally(() => clearTimeout(timer))
        const decoded = snapshot ? nativeImage.createFromDataURL(snapshot.dataUrl) : null
        const size = decoded?.getSize()
        const metadata = { elapsedMs: performance.now() - at, requestMs: performance.now() - requestedAt,
          decoded: !!decoded && !decoded.isEmpty() && size?.width === snapshot?.width && size?.height === snapshot?.height,
          width: size?.width ?? 0, height: size?.height ?? 0 }
        snapshots.push(metadata)
        return metadata
      }
      const ownerWatch = setInterval(() => { maximumOwners = Math.max(maximumOwners, owners()) }, 1000)
      try {
        if (check === 'cycles') {
          for (let index = 0; index < (cycle === 0 ? 8 : 1); index++) {
            const snapshot = await captureSnapshot()
            if (!snapshot.decoded || terminal) break
          }
          maximumOwners = Math.max(maximumOwners, owners())
        } else {
          let nextSnapshotAt = startupMs, nextProgressAt = startupMs + snapshotIntervalMs
          while (!terminal && performance.now() - at < startupMs + durationMs) {
            await wait(250)
            if (input.runtime.snapshot().lifecycle !== 'dormant') throw Error('camera_qa_isolation_required')
            if (maximumOwners === 0) maximumOwners = owners()
            const elapsed = performance.now() - at
            if (check === 'soak' && elapsed >= nextSnapshotAt && elapsed < startupMs + durationMs) {
              const snapshot = await captureSnapshot()
              if (!snapshot.decoded) { terminal = true; break }
              nextSnapshotAt += snapshotIntervalMs
            }
            if (check === 'soak' && elapsed >= nextProgressAt) {
              input.onEvidence({ step: 'camera_soak_progress', status: 'running',
                item: `elapsed_seconds=${Math.floor((elapsed - startupMs) / 1000)};samples=${sampleCount};decoded_snapshots=${snapshots.filter(s => s.decoded).length};resets=${resets};restarts=${restarts}` })
              nextProgressAt += snapshotIntervalMs
            }
          }
        }
      } finally { clearInterval(ownerWatch); await service.stop() }
      const elapsedMs = performance.now() - at, summary = metrics.result(elapsedMs), idleOwners = owners()
      const minimum = advertisedFormats.toSorted((a, b) => a.width * a.height - b.width * b.height || a.fps - b.fps)[0]
      const minimumVerified = !!minimum
      const nativeMode = CAMERA_QA_CASES[mode].find(flag => flag.startsWith('--qa-mode='))!.slice('--qa-mode='.length)
      const expected = mode === 'minimum' ? minimum ? [minimum.width, minimum.height, minimum.fps] : [0, 0, 0]
        : [...EXPECTED_MODES[nativeMode]!]
      const rateFlag = CAMERA_QA_CASES[mode].find(flag => flag.startsWith('--qa-rate='))
      if (rateFlag) expected[2] = Number(rateFlag.slice('--qa-rate='.length))
      const expectedRate = expected[2]!
      const observation = observationMetrics.result(Math.max(0, elapsedMs - startupMs))
      const acceptance = check === 'soak' ? observation : summary
      const sourceGapLimit = expectedRate > 0 && expectedRate < 5 ? 1000 / expectedRate + 250 : 250
      const receiptGapLimit = expectedRate > 0 && expectedRate < 5 ? sourceGapLimit + 250 : 500
      const formatVerified = (mode !== 'minimum' || minimumVerified) && summary.formats.length === 1 && summary.formats.every(f => f.width === expected[0]
        && f.height === expected[1] && f.inputWidth === expected[0] && f.inputHeight === expected[1]
        && Math.abs(1 / f.frameDurationSeconds - expected[2]!) < 0.1
        && (mode !== 'minimum' || f.inputPixelFormat === minimum!.pixelFormat))
      const trialPassed = !terminal && !stale && summary.staleSamples === 0 && formatVerified && maximumOwners === 1 && idleOwners === 0
        && (check === 'cycles'
          ? snapshots.length === (cycle === 0 ? 8 : 1) && snapshots.every(s => s.decoded
            && s.width === expected[0] && s.height === expected[1] && s.requestMs <= (resets ? 15000 : 3000))
            && (cycle !== 0 || snapshots.at(-1)!.elapsedMs <= 10000)
          : elapsedMs >= startupMs + durationMs && acceptance.windows.every(n => n > 0) && resets === 0 && restarts === 0
            && acceptance.maxSourceGapMs <= sourceGapLimit && acceptance.maxReceiptGapMs <= receiptGapLimit
            && acceptance.windows.reduce((sum, count) => sum + count, 0) >= expected[2]! * durationMs / 1000
            && (check !== 'soak' || snapshots.length >= Math.ceil(durationMs / snapshotIntervalMs)
              && snapshots.every(s => s.decoded && s.width === expected[0] && s.height === expected[1] && s.requestMs <= 15000)))
      const gaps = (value: ReturnType<typeof metrics.result>) => ({ maxSourceGapMs: value.maxSourceGapMs, maxReceiptGapMs: value.maxReceiptGapMs })
      trials.push({ cycle, elapsedMs, expected, advertisedFormats, ...summary,
        startupGaps: gaps(startupMetrics.result(Math.min(elapsedMs, startupMs))),
        observationGaps: gaps(observation), cadenceScope: check === 'soak' ? 'after_warmup' : 'including_startup',
        snapshotIntervalMs: check === 'soak' ? snapshotIntervalMs : null, formatVerified, rateProbes, sourceGapLimit, receiptGapLimit, resets, restarts, terminal, stale,
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
      processing: ['cycles', 'soak'].includes(check!) ? 'production' : 'bypassed', videoEncoding: 'not_executed',
      qualification: 'bounded_trial_only', daysLongAvailability: 'not_executed' }, null, 2))
  }
  input.onEvidence({ step: 'camera_availability', status: passed ? 'passed' : 'failed' })
  if (!passed) throw Error('camera_qa_availability_failed')
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: trials.length }
}
