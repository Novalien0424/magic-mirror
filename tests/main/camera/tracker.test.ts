import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startCameraTracking } from '../../../src/main/camera/tracker'

function fixture() {
  vi.useFakeTimers()
  type Child = EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: ReturnType<typeof vi.fn<(_signal?: string) => boolean>> }
  const children: Child[] = []
  function child(): Child {
    const value = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
      kill: vi.fn((_signal?: string) => { value.emit('close', 0); return true }),
    })
    children.push(value)
    return value
  }
  const spawn = vi.fn(child), onTarget = vi.fn(), onStatus = vi.fn()
  const service = startCameraTracking({ executable: '/synthetic/camera', cameraName: 'Synthetic',
    spawn: spawn as never, onTarget, onStatus })
  return { children, spawn, onTarget, onStatus, service }
}
afterEach(() => vi.useRealTimers())

describe('Main-owned camera recovery', () => {
  it('captures only on request, rejects overlap, and cancels on stop without logging frames', async () => {
    const f = fixture(), worker = f.children[0]!
    const result = f.service.capture()
    const command = JSON.parse(worker.stdin.read().toString())
    expect(command.type).toBe('capture')
    expect(await f.service.capture()).toBeNull()
    worker.stdout.write(JSON.stringify({ type: 'snapshot', id: command.id, jpeg: '/9j/2Q==', width: 640, height: 480 }) + '\n')
    expect(await result).toEqual({ dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 640, height: 480 })
    expect(JSON.stringify(f.onStatus.mock.calls)).not.toContain('/9j/')
    const pending = f.service.capture()
    await f.service.stop()
    expect(await pending).toBeNull()
    expect(await f.service.capture()).toBeNull()
  })

  it('times out capture while keeping gaze tracking alive', async () => {
    const f = fixture(), result = f.service.capture()
    await vi.advanceTimersByTimeAsync(3000)
    expect(await result).toBeNull()
    expect(f.spawn).toHaveBeenCalledOnce()
    await f.service.stop()
  })
  it('launches with a minimal environment instead of inheriting application credentials', async () => {
    const f = fixture()
    expect(f.spawn).toHaveBeenCalledWith('/synthetic/camera', ['Synthetic'], {
      stdio: 'pipe', env: { PATH: '/usr/bin:/bin' },
    })
    await f.service.stop()
  })

  it('clears stale gaze and restarts a stuck child without overlapping workers', async () => {
    const f = fixture()
    f.children[0]!.stdout.write(JSON.stringify({ type: 'faces', faces: [
      { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
    ] }) + '\n')
    expect(f.onTarget.mock.lastCall?.[0]).not.toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.onTarget).toHaveBeenLastCalledWith(null)
    await vi.advanceTimersByTimeAsync(12000)
    expect(f.children[0]!.kill).toHaveBeenCalledWith('SIGKILL')
    expect(f.spawn).toHaveBeenCalledTimes(2)
    await f.service.stop()
    await vi.advanceTimersByTimeAsync(120000)
    expect(f.spawn).toHaveBeenCalledTimes(2)
  })

  it('leaves an unplugged but responsive worker alive to detect reconnection', async () => {
    const f = fixture()
    f.children[0]!.stdout.write('{"type":"status","status":"degraded","reason":"camera_device_absent"}\n')
    for (let i = 0; i < 20; i++) {
      f.children[0]!.stdout.write('{"type":"heartbeat"}\n')
      await vi.advanceTimersByTimeAsync(2000)
    }
    expect(f.spawn).toHaveBeenCalledOnce()
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_device_absent')
    await f.service.stop()
  })
})
