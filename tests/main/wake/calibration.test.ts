import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWakeCalibration } from '../../../src/main/wake/calibration'
import { wakeCalibrationCommandSchema } from '../../../src/shared/wake-calibration'
import type { WakeSupervisor } from '../../../src/main/wake/supervisor'
import type { WakeWorkerPackage } from '../../../src/main/wake/protocol'

const settings = { avatarId: 'ren', phrase: '魔鏡阿魔鏡', threshold: 0.3, score: 1.5, numTrailingBlanks: 1 }
const original: WakeWorkerPackage = { packageId: 'test', engine: 'sherpa', engineVersion: '1', modelVersion: '1',
  phrase: settings.phrase, sampleRateHz: 16000, artifactPaths: {}, tuning: { threshold: 0.45, score: 1, numTrailingBlanks: 1 } }
function harness() {
  let config = original
  let canListen = true
  let detections = 0
  const calls: string[] = []
  const success = { status: 'success' as const, reason: 'ok' }
  const supervisor = {
    release: vi.fn(async () => { calls.push('release'); return success }),
    updateConfig: vi.fn(async ({ package: value }: { package: WakeWorkerPackage }) => { calls.push(value.calibration ? 'test' : 'restore'); config = value; return success }),
    acquire: vi.fn(async () => { calls.push('acquire'); return success }),
    configuration: () => config,
    snapshot: () => ({ status: 'listening', reason: null, input: { state: 'signal', blocks: 5, peak: 0.5, rms: 0.2,
      lastBlockAgeMs: 0, detections, lastDetectionAgeMs: detections ? 100 : null } }),
  } as unknown as WakeSupervisor
  const load = vi.fn(async (): Promise<WakeWorkerPackage> => ({ ...original, tuning: {
    threshold: settings.threshold, score: settings.score, numTrailingBlanks: settings.numTrailingBlanks } }))
  const controller = createWakeCalibration({ supervisor: () => supervisor, canListen: () => canListen, load })
  return { controller, calls, load, supervisor, setActive: () => { canListen = false }, detect: () => { detections++ } }
}
describe('live wake calibration ownership', () => {
  it('provides stopped-test health without acquiring a microphone or renewing a lease', async () => {
    const h = harness()
    expect(wakeCalibrationCommandSchema.safeParse({ type: 'status' }).success).toBe(true)
    expect(await h.controller.command({ type: 'status' })).toMatchObject({ status: 'stopped', input: { state: 'signal' } })
    expect(h.calls).toEqual([])
  })
  it('does not restart a missing worker after a concurrent ownership handoff', async () => {
    const h = harness()
    const start = vi.fn()
    h.supervisor.start = start
    vi.mocked(h.supervisor.updateConfig).mockImplementationOnce(async () => {
      h.setActive()
      return { status: 'failed', reason: 'wake_worker_unavailable' }
    })
    await h.controller.command({ type: 'start', settings })
    expect(start).not.toHaveBeenCalled()
    expect(h.supervisor.acquire).not.toHaveBeenCalled()
    await h.controller.stop(false)
  })
  it('keeps the specific missing native-score reason visible to the Console', async () => {
    const h = harness()
    h.load.mockRejectedValueOnce(new Error('wake_native_score_unavailable'))
    expect(await h.controller.command({ type: 'start', settings })).toMatchObject({
      status: 'failed', reason: 'wake_native_score_unavailable',
    })
    await h.controller.stop(false)
  })
  afterEach(() => vi.useRealTimers())
  it('uses real detection counts, applies temporary tuning, then restores the published configuration', async () => {
    const h = harness()
    const started = await h.controller.command({ type: 'start', settings })
    expect(started.status).toBe('testing')
    expect(h.calls).toEqual(['release', 'test', 'acquire'])
    h.detect()
    const read = await h.controller.command({ type: 'read', sessionId: started.sessionId! })
    expect(read).toMatchObject({ detections: 1, lastDetectionAgeMs: 100, settings })
    await h.controller.command({ type: 'update', sessionId: started.sessionId!, settings: { ...settings, threshold: 0.2 } })
    expect((await h.controller.command({ type: 'read', sessionId: started.sessionId! })).detections).toBe(0)
    await h.controller.command({ type: 'stop', sessionId: started.sessionId! })
    expect(h.supervisor.configuration()).toEqual(original)
    expect(h.calls.slice(-3)).toEqual(['release', 'restore', 'acquire'])
  })
  it('never reacquires after conversation takes ownership, including a pending model load', async () => {
    const h = harness()
    let resolve!: (value: WakeWorkerPackage) => void
    h.load.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const starting = h.controller.command({ type: 'start', settings })
    await vi.waitFor(() => expect(h.load).toHaveBeenCalled())
    h.setActive()
    const stopped = h.controller.stop(false)
    resolve(original)
    await starting; await stopped
    expect(h.calls).toEqual([])
  })
  it('restores on lost Console heartbeat and rejects stale session commands', async () => {
    vi.useFakeTimers()
    const h = harness()
    const started = await h.controller.command({ type: 'start', settings })
    await vi.advanceTimersByTimeAsync(4000)
    expect(await h.controller.command({ type: 'status' })).toMatchObject({ status: 'stopped', sessionId: null })
    await vi.advanceTimersByTimeAsync(1001)
    expect(h.supervisor.configuration()).toEqual(original)
    expect(h.controller.isActive()).toBe(false)
    const later = await h.controller.command({ type: 'start', settings })
    expect(later.sessionId).not.toBe(started.sessionId)
    await h.controller.command({ type: 'stop', sessionId: started.sessionId! })
    expect(h.controller.isActive()).toBe(true)
    await h.controller.stop(false)
  })
  it('refuses testing while conversation owns the microphone', async () => {
    const h = harness(); h.setActive()
    expect(await h.controller.command({ type: 'start', settings })).toMatchObject({ status: 'failed', reason: 'wake_calibration_requires_sleep' })
    expect(h.calls).toEqual([])
  })
  it('lets a handoff cancel reacquisition from an already queued Stop test', async () => {
    const h = harness()
    await h.controller.command({ type: 'start', settings })
    const restoring = h.controller.stop(true)
    const handoff = h.controller.stop(false)
    await restoring; await handoff
    expect(h.calls).toEqual(['release', 'test', 'acquire', 'release', 'restore'])
    expect(h.supervisor.configuration()).toEqual(original)
  })
  it('reports ownership until a pending restoration finishes so a config refresh can reacquire', async () => {
    const h = harness()
    await h.controller.command({ type: 'start', settings })
    const stopping = h.controller.stop(true)
    expect(h.controller.isActive()).toBe(true)
    await stopping
    expect(h.controller.isActive()).toBe(false)
  })
  it('validates numeric bounds and rejects unknown payload fields', () => {
    expect(wakeCalibrationCommandSchema.safeParse({ type: 'start', settings }).success).toBe(true)
    for (const invalid of [{ ...settings, threshold: 2 }, { ...settings, score: 0 }, { ...settings, numTrailingBlanks: 0.5 }, { ...settings, transcript: 'private' }]) {
      expect(wakeCalibrationCommandSchema.safeParse({ type: 'start', settings: invalid }).success).toBe(false)
    }
  })
})
