import { afterEach, describe, expect, it, vi } from 'vitest'
import { cameraLifecycleStatus, createCameraLifecycle } from '../../../src/main/camera/lifecycle'
import type { LifecycleState } from '../../../src/shared/types'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture() {
  vi.useFakeTimers()
  const requestPermission = vi.fn(async () => true), report = vi.fn()
  const trackers: { stop: ReturnType<typeof vi.fn<() => Promise<void>>>; capture: ReturnType<typeof vi.fn>; republishTarget: ReturnType<typeof vi.fn> }[] = []
  const start = vi.fn(() => {
    const timer = setInterval(() => {}, 500)
    const tracker = { stop: vi.fn(async () => { clearInterval(timer) }), capture: vi.fn(async () => null), republishTarget: vi.fn() }
    trackers.push(tracker)
    return tracker
  })
  return { owner: createCameraLifecycle({ requestPermission, start, report }), requestPermission, start, report, trackers }
}
afterEach(() => vi.useRealTimers())

describe('avatar-owned camera lifecycle', () => {
  it('has no permission request, camera, watchdog or capture while asleep/offline', async () => {
    const f = fixture()
    for (const state of ['starting', 'dormant', 'suspending', 'offlineLoop', 'maintenance'] as LifecycleState[]) {
      f.owner.update(state, true)
      await vi.advanceTimersByTimeAsync(60000)
      expect(await f.owner.capture()).toBeNull()
      expect(vi.getTimerCount()).toBe(0)
    }
    expect(f.start).not.toHaveBeenCalled()
    expect(f.requestPermission).not.toHaveBeenCalled()
    expect(f.report).toHaveBeenCalledExactlyOnceWith('camera_avatar_inactive')
    await f.owner.stop()
  })
  it('starts once on wake, stops on sleep and starts a fresh worker on the next wake', async () => {
    const f = fixture()
    f.owner.update('activating', true)
    await vi.advanceTimersByTimeAsync(0)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).toHaveBeenCalledOnce()
    await f.owner.capture()
    expect(f.trackers[0]!.capture).toHaveBeenCalledOnce()
    f.owner.update('suspending', true)
    expect(f.trackers[0]!.stop).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(await f.owner.capture()).toBeNull()
    f.owner.update('dormant', true)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).toHaveBeenCalledTimes(2)
    await f.owner.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('requires a ready Mirror and releases capture during renderer replacement', async () => {
    const f = fixture()
    f.owner.update('active', false)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).not.toHaveBeenCalled()
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    f.owner.republishTarget()
    expect(f.trackers[0]!.republishTarget).toHaveBeenCalledOnce()
    f.owner.update('active', false)
    f.owner.republishTarget()
    expect(f.trackers[0]!.stop).toHaveBeenCalledOnce()
    expect(f.trackers[0]!.republishTarget).toHaveBeenCalledOnce()
    await f.owner.stop()
  })
  it('publishes an inactive camera status on sleep instead of keeping the last Active status', async () => {
    const f = fixture()
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    f.owner.update('dormant', true)
    await vi.advanceTimersByTimeAsync(0)
    const published = f.report.mock.calls.map(([reason]) => [cameraLifecycleStatus(reason), reason]).filter(([status]) => status)
    expect(published).toEqual([['ready', 'camera_avatar_inactive']])
    expect(cameraLifecycleStatus('camera_worker_released')).toBeNull()
    for (const reason of ['camera_permission_denied', 'camera_start_failed', 'camera_release_failed']) {
      expect(cameraLifecycleStatus(reason)).toBe('degraded')
    }
    await f.owner.stop()
  })
  it('does not acquire after sleep while permission is pending', async () => {
    const f = fixture(), permission = deferred<boolean>()
    f.requestPermission.mockReturnValue(permission.promise)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    f.owner.update('dormant', true)
    permission.resolve(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await f.owner.stop()
  })
  it('waits for the old worker to exit before a rapid wake can start another', async () => {
    const f = fixture(), exited = deferred<void>()
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    const stop = f.trackers[0]!.stop.getMockImplementation()!
    f.trackers[0]!.stop.mockImplementation(() => { void stop(); return exited.promise })
    f.owner.update('dormant', true)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).toHaveBeenCalledOnce()
    exited.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).toHaveBeenCalledTimes(2)
    await f.owner.stop()
  })
  it('blocks reacquisition when worker release fails', async () => {
    const f = fixture()
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    f.trackers[0]!.stop.mockRejectedValue(Error('synthetic failure'))
    f.owner.update('dormant', true)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).toHaveBeenCalledOnce()
    expect(f.report).toHaveBeenCalledWith('camera_release_failed')
    await f.owner.stop()
    vi.clearAllTimers()
  })
  it('does not let denied permission become a retry loop', async () => {
    const f = fixture()
    f.requestPermission.mockResolvedValue(false)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 5; i++) f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(60000)
    expect(f.requestPermission).toHaveBeenCalledOnce()
    expect(f.report).toHaveBeenCalledWith('camera_permission_denied')
    expect(f.start).not.toHaveBeenCalled()
    await f.owner.stop()
  })
  it('shutdown does not wait for a permission prompt or allow a late start', async () => {
    const f = fixture(), permission = deferred<boolean>()
    f.requestPermission.mockReturnValue(permission.promise)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    await f.owner.stop()
    permission.resolve(true)
    f.owner.update('active', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(f.start).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
