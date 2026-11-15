import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Phase4QaInput } from '../../../src/main/phase4-qa'
import type { startCameraTracking } from '../../../src/main/camera/tracker'

const mocks = vi.hoisted(() => ({ granted: true, owner: false, externalOwner: false, decoded: true,
  width: 640, height: 480,
  writes: [] as string[], start: vi.fn<typeof startCameraTracking>(), spawn: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => '/camera/user-data', getAppPath: () => '/app' },
  nativeImage: { createFromDataURL: () => ({ isEmpty: () => !mocks.decoded, getSize: () => ({ width: mocks.width, height: mocks.height }) }) },
  systemPreferences: { askForMediaAccess: async () => mocks.granted } }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn,
  execFileSync: () => mocks.owner || mocks.externalOwner ? '/app/out/native/camera-tracker\n' : '' }))
vi.mock('node:fs/promises', () => ({ writeFile: async (_path: string, body: string) => { mocks.writes.push(body) } }))
vi.mock('../../../src/main/camera/tracker', () => ({ startCameraTracking: mocks.start }))
import { runCameraAvailabilityQa } from '../../../src/main/camera/availability-qa'

function fixture(kind = 'steady', check = 'screen') {
  vi.useFakeTimers({ loopLimit: 100000 }); vi.stubEnv('MIRROR_CAMERA_QA_CASE', 'baseline'); vi.stubEnv('MIRROR_CAMERA_QA_CHECK', check)
  mocks.granted = true; mocks.owner = false; mocks.externalOwner = false; mocks.decoded = kind !== 'decode'
  const fullHd = kind.startsWith('fullhd'), hd5 = kind.startsWith('fullhd5')
  const fps = hd5 && kind !== 'fullhd5_wrong_rate' ? 5 : 15
  if (kind.startsWith('minimum')) vi.stubEnv('MIRROR_CAMERA_QA_CASE', 'minimum')
  mocks.width = fullHd ? kind === 'fullhd_resized' ? 1280 : kind === 'fullhd5_buffer_resized' ? 96 : 1920 : 640
  mocks.height = fullHd ? kind === 'fullhd_resized' ? 720 : kind === 'fullhd5_buffer_resized' ? 96 : 1080 : 480
  if (fullHd) vi.stubEnv('MIRROR_CAMERA_QA_CASE', 'mjpeg1080')
  mocks.writes = []; mocks.start.mockReset()
  mocks.start.mockImplementation(input => {
    mocks.owner = true; let sequence = 0
    // Capability metadata is independent from sample metadata; mismatches must fail.
    if (kind !== 'minimum_missing') {
      input.onQaFormat?.({ width: 1920, height: 1080, pixelFormat: 2037741171, fps: 30 })
      input.onQaFormat?.({ width: kind === 'minimum_wrong' ? 800 : 640,
        height: 480, pixelFormat: 2037741171, fps: kind === 'minimum_wrong_rate' ? 10 : 15 })
    }
    const sample = () => { sequence++; input.onQaSample?.({ sequence,
      sourceSeconds: sequence / fps + (kind === 'startup_gap' && sequence >= 3 || kind === 'observation_gap' && sequence >= 100 ? 0.9 : 0),
      width: fullHd ? kind === 'fullhd5_buffer_resized' ? 96 : 1920 : kind === 'wrong_format' ? 320 : 640,
      height: fullHd ? kind === 'fullhd5_buffer_resized' ? 96 : 1080 : 480, pixelFormat: 875704438,
      inputWidth: fullHd ? 1920 : 640, inputHeight: fullHd ? 1080 : 480, inputPixelFormat: 2037741171, frameDurationSeconds: 1 / fps }) }
    const timer = kind === 'empty' ? null : setInterval(sample, 1000 / fps)
    if (kind === 'reset') setTimeout(() => input.onStatus('degraded', 'camera_usb_reset_requested'), 2000)
    if (kind === 'terminal') setTimeout(() => input.onStatus('degraded', 'camera_usb_recovery_exhausted'), 2000)
    if (kind === 'api_rejected') setTimeout(() => {
      input.onQaRateProbe?.({ fps: 1, advertised: 0, minimumResult: 1, maximumResult: 1,
        restoreResult: 0, minimumSeconds: 1 / 15, maximumSeconds: 1 / 15 })
      input.onStatus('degraded', 'camera_qa_rate_api_rejected')
    }, 100)
    if (kind === 'stale') setTimeout(() => input.onStatus('degraded', 'camera_qa_frame_timestamp_stale'), 2000)
    return { stop: async () => { if (timer) clearInterval(timer); mocks.owner = false }, republishTarget() {},
      capture: async () => { sample(); return { dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: mocks.width, height: mocks.height } } }
  })
  return { outputDir: '/camera/screenshots', runtime: { snapshot: () => ({ lifecycle: 'dormant' }) }, onEvidence: vi.fn() } as unknown as Phase4QaInput
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe.skipIf(process.platform !== 'darwin')('camera availability QA gates', () => {
  it.each(['steady', 'empty', 'reset', 'terminal', 'stale', 'wrong_format', 'api_rejected'])('screen: %s', async kind => {
    const input = fixture(kind), pending = runCameraAvailabilityQa(input)
    const outcome = kind === 'steady' ? expect(pending).resolves.toMatchObject({ screenshotCount: 0 })
      : expect(pending).rejects.toThrow('camera_qa_availability_failed')
    await vi.runAllTimersAsync(); await outcome
    const result = JSON.parse(mocks.writes[0]!)
    expect(result.passed).toBe(kind === 'steady'); expect(mocks.owner).toBe(false)
    if (kind === 'api_rejected') {
      expect(result.elapsedMs).toBeLessThan(1000)
      expect(result.trials[0].rateProbes[0]).toMatchObject({ fps: 1, minimumResult: 1 })
    }
    expect(result).toMatchObject({ imageRetention: 'none', daysLongAvailability: 'not_executed', videoEncoding: 'not_executed' })
    expect(mocks.writes[0]).not.toContain('data:image')
  })
  it.each(['steady', 'decode'])('cycles require decoded snapshots: %s', async kind => {
    const pending = runCameraAvailabilityQa(fixture(kind, 'cycles'))
    const outcome = kind === 'steady' ? expect(pending).resolves.toMatchObject({ consoleCheckCount: 20 })
      : expect(pending).rejects.toThrow('camera_qa_availability_failed')
    await vi.runAllTimersAsync(); await outcome
    expect(mocks.start).toHaveBeenCalledTimes(kind === 'steady' ? 20 : 1)
    expect(mocks.writes[0]).not.toContain('/9j/')
  })
  it.each(['minimum', 'minimum_wrong', 'minimum_wrong_rate', 'minimum_missing'])('minimum derives expectations from descriptors: %s', async kind => {
    const pending = runCameraAvailabilityQa(fixture(kind))
    const outcome = kind === 'minimum' ? expect(pending).resolves.toMatchObject({ consoleCheckCount: 1 })
      : expect(pending).rejects.toThrow('camera_qa_availability_failed')
    await vi.runAllTimersAsync(); await outcome
    const result = JSON.parse(mocks.writes[0]!)
    expect(result.passed).toBe(kind === 'minimum')
    if (kind === 'minimum') expect(result.trials[0].expected).toEqual([640, 480, 15])
    expect(mocks.start.mock.calls[0]![0].cameraName).toBe('')
  })
  it.each(['permission', 'owner', 'active', 'user_data'])('rejects %s before capture', async kind => {
    const input = fixture()
    if (kind === 'permission') mocks.granted = false
    if (kind === 'owner') mocks.externalOwner = true
    if (kind === 'active') input.runtime.snapshot = () => ({ lifecycle: 'active' }) as ReturnType<typeof input.runtime.snapshot>
    if (kind === 'user_data') Object.assign(input, { outputDir: '/operator/screenshots' })
    await expect(runCameraAvailabilityQa(input)).rejects.toThrow()
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it.each(['fullhd', 'fullhd_resized'])('full-resolution cycles validate delivered dimensions: %s', async kind => {
    const pending = runCameraAvailabilityQa(fixture(kind, 'cycles'))
    const outcome = kind === 'fullhd' ? expect(pending).resolves.toMatchObject({ consoleCheckCount: 20 })
      : expect(pending).rejects.toThrow('camera_qa_availability_failed')
    await vi.runAllTimersAsync(); await outcome
    const result = JSON.parse(mocks.writes[0]!)
    expect(result.trials[0].formatVerified).toBe(true)
    expect(result.passed).toBe(kind === 'fullhd')
    expect(mocks.owner).toBe(false)
  })
  it.each(['mjpeg10805_size', 'nv1210805_size'])('validates actual full-HD buffers at 5 FPS: %s', async mode => {
    for (const kind of ['fullhd5', 'fullhd5_buffer_resized', 'fullhd5_wrong_rate']) {
      const input = fixture(kind)
      vi.stubEnv('MIRROR_CAMERA_QA_CASE', mode)
      const pending = runCameraAvailabilityQa(input)
      const outcome = kind === 'fullhd5' ? expect(pending).resolves.toMatchObject({ consoleCheckCount: 1 })
        : expect(pending).rejects.toThrow('camera_qa_availability_failed')
      await vi.runAllTimersAsync(); await outcome
      const result = JSON.parse(mocks.writes[0]!)
      expect(result.trials[0].expected).toEqual([1920, 1080, 5])
      expect(result.passed).toBe(kind === 'fullhd5')
      mocks.start.mock.calls[0]![0].spawn?.('/helper', [], { stdio: 'pipe', env: {} })
      expect(mocks.spawn).toHaveBeenLastCalledWith('/helper', expect.arrayContaining([
        '--qa-observe', '--qa-output-size', mode === 'mjpeg10805_size' ? '--qa-mode=mjpeg10805' : '--qa-mode=nv1210805',
      ]), { stdio: 'pipe', env: {} })
    }
  })
  it.each(['startup_gap', 'observation_gap'])('locates source gaps without relaxing acceptance: %s', async kind => {
    const pending = runCameraAvailabilityQa(fixture(kind))
    const outcome = expect(pending).rejects.toThrow('camera_qa_availability_failed')
    await vi.runAllTimersAsync(); await outcome
    const result = JSON.parse(mocks.writes[0]!), trial = result.trials[0]
    expect(trial.maxSourceGapMs).toBeGreaterThan(900)
    expect(trial[kind === 'startup_gap' ? 'observationGaps' : 'startupGaps'].maxSourceGapMs).toBeLessThan(70)
    expect(trial[kind === 'startup_gap' ? 'startupGaps' : 'observationGaps'].maxSourceGapMs).toBeGreaterThan(900)
    expect(result.passed).toBe(false)
  })

  it.each(['steady', 'startup_gap', 'decode', 'reset', 'observation_gap'])('soak runs 30 minutes of production processing with periodic RAM-only snapshots: %s', async kind => {
    const input = fixture(kind, 'soak'), pending = runCameraAvailabilityQa(input)
    const success = ['steady', 'startup_gap'].includes(kind)
    const outcome = success ? expect(pending).resolves.toMatchObject({ consoleCheckCount: 1 })
      : expect(pending).rejects.toThrow('camera_qa_availability_failed')
    await vi.runAllTimersAsync(); await outcome
    const result = JSON.parse(mocks.writes[0]!), trial = result.trials[0]
    expect(result.durationMs).toBe(1800000)
    expect(result.processing).toBe('production')
    expect(result.imageRetention).toBe('none')
    expect(trial.cadenceScope).toBe('after_warmup')
    expect(trial.sourceGapLimit).toBe(250)
    expect(trial.receiptGapLimit).toBe(500)
    expect(result.passed).toBe(success)
    if (success) {
      expect(result.elapsedMs).toBeGreaterThanOrEqual(1805000)
      expect(trial.snapshots).toHaveLength(30)
      expect(trial.snapshots[0].elapsedMs).toBe(5000)
      expect(trial.snapshots[1].elapsedMs - trial.snapshots[0].elapsedMs).toBe(60000)
      const progress = vi.mocked(input.onEvidence).mock.calls.map(([item]) => item).filter(item => item.step === 'camera_soak_progress')
      expect(progress).toHaveLength(30)
      expect(progress[0].item).toMatch(/^elapsed_seconds=60;samples=\d+;decoded_snapshots=2;resets=0;restarts=0$/)
    }
    mocks.start.mock.calls[0]![0].spawn?.('/helper', [], { stdio: 'pipe', env: {} })
    const args = mocks.spawn.mock.calls.at(-1)![1]
    expect(args).toContain('--qa-observe')
    expect(args).not.toContain('--qa-delivery-only')
    expect(mocks.writes[0]).not.toContain('data:image')
  })

  it('accepts the soak runner argument and budgets more than its full observation', () => {
    const runner = readFileSync(new URL('../../../scripts/run-raven-conversation-qa.mjs', import.meta.url), 'utf8')
    const validation = runner.split('\n').find(line => line.includes("throw Error('camera_qa_check_invalid')"))!
    const validate = new Function('cameraCheck', validation)
    expect(() => validate('soak')).not.toThrow()
    expect(() => validate('unknown')).toThrow('camera_qa_check_invalid')
    const smoke = runner.match(/MIRROR_SMOKE_MS: (.+), MIRROR_DEVELOPER_MODE:/)![1]!
    const budget = new Function('selected', 'cameraCheck', `return ${smoke}`)
    expect(Number(budget('camera_availability', 'soak'))).toBeGreaterThan(1805000)
    expect(budget('camera_availability', 'screen')).toBe('1800000')
  })

})
