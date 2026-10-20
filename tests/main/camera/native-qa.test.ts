import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Phase4QaInput } from '../../../src/main/phase4-qa'
import type { startCameraTracking } from '../../../src/main/camera/tracker'

const mocks = vi.hoisted(() => ({
  granted: true,
  writes: [] as string[],
  owners: '', spawn: vi.fn(),
  start: vi.fn<typeof startCameraTracking>(),
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/synthetic-camera/user-data', getAppPath: () => '/synthetic-app' },
  systemPreferences: {
    getMediaAccessStatus: () => mocks.granted ? 'granted' : 'denied',
    askForMediaAccess: async () => mocks.granted,
  },
}))
vi.mock('node:fs/promises', () => ({ writeFile: async (_path: string, body: string) => { mocks.writes.push(body) } }))
vi.mock('node:child_process', () => ({ execFileSync: () => mocks.owners, spawn: mocks.spawn }))
vi.mock('../../../src/main/camera/tracker', () => ({ startCameraTracking: mocks.start }))
import { runNativeCameraDeliveryQa, runNativeCameraQa } from '../../../src/main/camera/native-qa'

function fixture(resetDuringSnapshots = false, continuousFrames = true, receiptInterval = 500) {
  vi.useFakeTimers()
  mocks.granted = true; mocks.writes = []; mocks.owners = ''; mocks.spawn.mockReset(); mocks.start.mockReset()
  const stops = vi.fn()
  mocks.start.mockImplementation(input => {
    const phase = mocks.start.mock.calls.length
    const reset = () => {
      input.onStatus('degraded', 'camera_usb_reset_requested')
      input.onStatus('degraded', 'camera_usb_reset_releasing')
      input.onStatus('degraded', 'camera_usb_resetting')
      input.onStatus('degraded', 'camera_usb_reset_complete')
      input.onFrame?.()
      input.onStatus('ready', 'camera_tracking_ready')
    }
    setTimeout(() => {
      input.onFrame?.()
      if (phase === 2) {
        input.onStatus('degraded', 'camera_qa_frames_halted')
        reset()
      } else input.onStatus('ready', 'camera_tracking_ready')
    }, 100)
    const ticker = continuousFrames ? setInterval(() => input.onFrame?.(), receiptInterval) : null
    let captures = 0
    return {
      async stop() { if (ticker) clearInterval(ticker); return stops() }, republishTarget() {},
      capture: vi.fn(async () => {
        captures++
        if (resetDuringSnapshots && captures === 3) reset()
        input.onFrame?.()
        return { dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 640, height: 480 }
      }),
    }
  })
  const onEvidence = vi.fn()
  const input = { outputDir: '/synthetic-camera/results', onEvidence, runtime: { snapshot: () => ({ lifecycle: 'dormant' }) } } as unknown as Phase4QaInput
  return { input, onEvidence, stops }
}
afterEach(() => vi.useRealTimers())

describe.skipIf(process.platform !== 'darwin')('native camera QA acceptance and metadata', () => {
  it.each(['steady', 'empty_windows', 'gaps', 'reset', 'restart'] as const)('delivery-only QA: %s', async mode => {
    const f = fixture(false, mode !== 'empty_windows', mode === 'gaps' ? 5000 : 500)
    let finishClose = () => {}; const close = new Promise<void>(resolve => { finishClose = resolve })
    f.stops.mockImplementation(() => close)
    const pending = runNativeCameraDeliveryQa(f.input)
    const outcome = mode === 'steady' ? expect(pending).resolves.toMatchObject({ screenshotCount: 0 })
      : expect(pending).rejects.toThrow('camera_qa_delivery_unavailable')
    if (mode === 'reset') setTimeout(() => mocks.start.mock.calls[0]![0].onStatus('degraded', 'camera_usb_reset_requested'), 11000)
    if (mode === 'restart') setTimeout(() => mocks.start.mock.calls[0]![0].onStatus('degraded', 'camera_worker_restarting'), 11000)
    await vi.runAllTimersAsync()
    expect(mocks.writes).toHaveLength(0); expect(f.stops).toHaveBeenCalledOnce()
    finishClose(); await outcome
    const result = JSON.parse(mocks.writes[0]!)
    expect(result).toMatchObject({ observationMs: 60000, observedMs: 60000, completed: true, windowMs: 5000, passed: mode === 'steady', imageRetention: 'none', resets: mode === 'reset' ? 1 : 0 })
    expect(result.frameReceiptsByWindow).toHaveLength(12); expect(mocks.writes[0]).not.toContain('data:image')
    expect(result.frameReceiptsByWindow.every((count: number) => count > 0)).toBe(mode !== 'empty_windows')
    expect(mocks.start.mock.results[0]!.value.capture).not.toHaveBeenCalled()
    mocks.start.mock.calls[0]![0].spawn!('/helper', ['Arducam'], { stdio: 'pipe', env: {} })
    expect(mocks.spawn).toHaveBeenCalledWith('/helper', ['Arducam', '--qa-delivery-only'], expect.anything())
  })
  it.each(['permission', 'owner', 'active', 'user_data'] as const)('delivery-only QA rejects %s before acquisition', async mode => {
    const f = fixture(); mocks.granted = mode !== 'permission'
    if (mode === 'owner') mocks.owners = '/synthetic-app/out/native/camera-tracker\n'
    if (mode === 'active') f.input.runtime.snapshot = () => ({ lifecycle: 'active' }) as ReturnType<typeof f.input.runtime.snapshot>
    if (mode === 'user_data') Object.assign(f.input, { outputDir: '/operator-data/results' })
    await expect(runNativeCameraDeliveryQa(f.input)).rejects.toThrow(mode === 'permission' ? 'camera_qa_delivery_unavailable' : mode === 'owner' ? 'camera_qa_owner_present' : 'camera_qa_isolation_required')
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('requires stable snapshots after a real reset receipt and records recovery stages without image contents', async () => {
    const f = fixture(), pending = runNativeCameraQa(f.input)
    await vi.runAllTimersAsync()
    await pending
    const result = JSON.parse(mocks.writes[0]!)
    expect(result.snapshot).toBe(true)
    expect(result.checks).toHaveLength(2)
    expect(result.checks.every((check: { snapshots: number; stableSnapshots: boolean; resetsDuringSnapshots: number }) =>
      check.snapshots === 6 && check.stableSnapshots && check.resetsDuringSnapshots === 0)).toBe(true)
    expect(result.checks[1].resets).toEqual([{
      requestedAtMs: expect.any(Number), releaseAfterMs: 0, nativeResetAfterMs: 0,
      completeAfterMs: 0, freshFrameAfterMs: 0, workerRetired: false,
    }])
    expect(f.stops).toHaveBeenCalledTimes(2)
    expect(f.onEvidence).toHaveBeenCalledWith({ step: 'native_camera', status: 'passed' })
    expect(mocks.writes[0]).not.toContain('data:image')
    expect(mocks.writes[0]).not.toContain('/9j/')
    expect(result.imageRetention).toBe('none')
  })
  it('fails a six-snapshot window interrupted by another reset rather than calling repeated brief delivery sustained', async () => {
    const f = fixture(true), pending = runNativeCameraQa(f.input)
    const failure = expect(pending).rejects.toThrow('camera_qa_capture_unavailable')
    await vi.runAllTimersAsync()
    await failure
    const result = JSON.parse(mocks.writes[0]!)
    expect(result.snapshot).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({ snapshots: 6, stableSnapshots: false, resetsDuringSnapshots: 1 })
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(f.stops).toHaveBeenCalledOnce()
    expect(f.onEvidence).toHaveBeenCalledWith({ step: 'native_camera', status: 'failed' })
  })
  it('fails sporadic delivery even if six snapshots succeed and no new reset is issued', async () => {
    const f = fixture(false, false), pending = runNativeCameraQa(f.input)
    const failure = expect(pending).rejects.toThrow('camera_qa_capture_unavailable')
    await vi.runAllTimersAsync()
    await failure
    const result = JSON.parse(mocks.writes[0]!)
    expect(result.snapshot).toBe(false)
    expect(result.checks[0]).toMatchObject({ snapshots: 6, resetsDuringSnapshots: 0,
      stableSnapshots: false, maxSnapshotReceiptGapMs: 5000 })
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(f.stops).toHaveBeenCalledOnce()
  })
})
