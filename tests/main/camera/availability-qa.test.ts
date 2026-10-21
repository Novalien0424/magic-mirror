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
  vi.useFakeTimers(); vi.stubEnv('MIRROR_CAMERA_QA_CASE', 'baseline'); vi.stubEnv('MIRROR_CAMERA_QA_CHECK', check)
  mocks.granted = true; mocks.owner = false; mocks.externalOwner = false; mocks.decoded = kind !== 'decode'
  const fullHd = kind.startsWith('fullhd')
  mocks.width = fullHd ? kind === 'fullhd_resized' ? 1280 : 1920 : 640
  mocks.height = fullHd ? kind === 'fullhd_resized' ? 720 : 1080 : 480
  if (fullHd) vi.stubEnv('MIRROR_CAMERA_QA_CASE', 'mjpeg1080')
  mocks.writes = []; mocks.start.mockReset()
  mocks.start.mockImplementation(input => {
    mocks.owner = true; let sequence = 0
    const sample = () => { sequence++; input.onQaSample?.({ sequence, sourceSeconds: sequence / 15,
      width: fullHd ? 1920 : kind === 'wrong_format' ? 320 : 640, height: fullHd ? 1080 : 480, pixelFormat: 875704438,
      inputWidth: fullHd ? 1920 : 640, inputHeight: fullHd ? 1080 : 480, inputPixelFormat: 2037741171, frameDurationSeconds: 1 / 15 }) }
    const timer = kind === 'empty' ? null : setInterval(sample, 1000 / 15)
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
})
