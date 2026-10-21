import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectiveMicrophoneName, startCameraTracking } from '../../../src/main/camera/tracker'
import { CAMERA_SNAPSHOT_MAX_JPEG_BYTES, CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES } from '../../../src/shared/camera-tracking'

function fixture(extra: Partial<Parameters<typeof startCameraTracking>[0]> = {}) {
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
    spawn: spawn as never, onTarget, onStatus, ...extra })
  return { children, spawn, onTarget, onStatus, service }
}
afterEach(() => vi.useRealTimers())

describe('Main camera snapshot bounds', () => {
  function jpeg(byteLength = 4): string {
    const bytes = Buffer.alloc(byteLength, 0xff)
    bytes.set([0xff, 0xd8, 0xff])
    bytes.set([0xff, 0xd9], byteLength - 2)
    return bytes.toString('base64')
  }
  function reply(id: number, image = jpeg(), width = 1920, height = 1080): string {
    return JSON.stringify({ type: 'snapshot', id, jpeg: image, width, height })
  }

  it.each([[1920, 1080], [1080, 1920]])('preserves a chunked 4 MiB JPEG at %sx%s', async (width, height) => {
    const f = fixture(), worker = f.children[0]!, result = f.service.capture()
    const { id } = JSON.parse(worker.stdin.read().toString())
    const image = jpeg(CAMERA_SNAPSHOT_MAX_JPEG_BYTES), line = reply(id, image, width, height) + '\n'
    for (let offset = 0; offset < line.length; offset += 65536) worker.stdout.write(line.slice(offset, offset + 65536))
    const frame = await result
    expect(frame?.width).toBe(width)
    expect(frame?.height).toBe(height)
    expect(frame?.dataUrl === `data:image/jpeg;base64,${image}`).toBe(true)
    expect(JSON.stringify(f.onStatus.mock.calls).includes('data:image')).toBe(false)
    expect(f.onStatus).not.toHaveBeenCalledWith('degraded', 'camera_worker_message_oversized')
    await f.service.stop()
  })

  it.each([[1921, 1080], [1080, 1921], [1920, 1081], [1081, 1920], [0, 1080], [1920, 1.5]])(
    'rejects snapshot dimensions %sx%s with a metadata-only reason', async (width, height) => {
      const f = fixture(), worker = f.children[0]!, result = f.service.capture()
      const { id } = JSON.parse(worker.stdin.read().toString())
      worker.stdout.write(reply(id, jpeg(), width, height) + '\n')
      expect(await result).toBeNull()
      expect(f.onStatus).toHaveBeenCalledWith('degraded', 'camera_snapshot_dimensions_invalid')
      expect(worker.kill).not.toHaveBeenCalled()
      await f.service.stop()
    })

  it.each(['oversized', 'malformed', 'missing_end_marker'])('rejects a %s JPEG without stopping the worker', async kind => {
    const f = fixture(), worker = f.children[0]!, result = f.service.capture()
    const { id } = JSON.parse(worker.stdin.read().toString())
    const image = kind === 'oversized' ? jpeg(CAMERA_SNAPSHOT_MAX_JPEG_BYTES + 1)
      : kind === 'malformed' ? '/9j/2R==' : '/9j/AAAA'
    worker.stdout.write(reply(id, image) + '\n')
    expect(await result).toBeNull()
    expect(f.onStatus).toHaveBeenCalledWith('degraded', 'camera_snapshot_invalid')
    expect(worker.kill).not.toHaveBeenCalled()
    await f.service.stop()
  })

  it('accepts the exact 6 MiB framed-message bound including the newline', async () => {
    const f = fixture(), worker = f.children[0]!, result = f.service.capture()
    const { id } = JSON.parse(worker.stdin.read().toString()), line = reply(id)
    worker.stdout.write(line + ' '.repeat(CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES - line.length - 1))
    worker.stdout.write('\n')
    expect((await result)?.width).toBe(1920)
    expect(f.onStatus).not.toHaveBeenCalledWith('degraded', 'camera_worker_message_oversized')
    await f.service.stop()
  })

  it.each(['ascii', 'utf8'])('rejects a framed message above 6 MiB (%s), then accepts a fresh frame', async encoding => {
    const f = fixture(), worker = f.children[0]!, result = f.service.capture(), resolved = vi.fn()
    void result.then(resolved)
    const { id } = JSON.parse(worker.stdin.read().toString()), line = reply(id)
    const oversized = encoding === 'ascii'
      ? line + ' '.repeat(CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES - line.length) + '\n'
      : JSON.stringify({ ...JSON.parse(line), padding: 'é'.repeat(CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES / 2) }) + '\n'
    worker.stdout.write(oversized)
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).not.toHaveBeenCalled()
    expect(f.onStatus).toHaveBeenCalledWith('degraded', 'camera_worker_message_oversized')
    worker.stdout.write(line + '\n')
    expect((await result)?.height).toBe(1080)
    await f.service.stop()
  })

  it('discards an oversized partial frame through its newline instead of accepting its suffix', async () => {
    const f = fixture(), worker = f.children[0]!, result = f.service.capture(), resolved = vi.fn()
    void result.then(resolved)
    const { id } = JSON.parse(worker.stdin.read().toString()), line = reply(id) + '\n'
    worker.stdout.write(' '.repeat(CAMERA_SNAPSHOT_MAX_MESSAGE_BYTES))
    worker.stdout.write(line)
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).not.toHaveBeenCalled()
    expect(f.onStatus).toHaveBeenCalledWith('degraded', 'camera_worker_message_oversized')
    worker.stdout.write(line)
    expect((await result)?.width).toBe(1920)
    await f.service.stop()
  })

  it('bounds each frame rather than rejecting coalesced valid messages above the aggregate cap', async () => {
    const f = fixture(), worker = f.children[0]!, result = f.service.capture()
    const { id } = JSON.parse(worker.stdin.read().toString()), line = reply(id, jpeg(CAMERA_SNAPSHOT_MAX_JPEG_BYTES)) + '\n'
    worker.stdout.write(line + line)
    expect((await result)?.width).toBe(1920)
    expect(f.onStatus).not.toHaveBeenCalledWith('degraded', 'camera_worker_message_oversized')
    await f.service.stop()
  })
})

describe('Main-owned camera recovery', () => {
  it('bounds the whole visitor request to 15 seconds, including the final snapshot after recovery', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    const pending = f.service.capture(), resolved = vi.fn()
    void pending.then(resolved)
    worker.stdin.read()
    // A reset is pending; heartbeats keep the worker responsive without frames.
    await vi.advanceTimersByTimeAsync(2500)
    worker.stdin.read()
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n')
    for (let i = 0; i < 11; i++) {
      worker.stdout.write('{"type":"heartbeat"}\n')
      await vi.advanceTimersByTimeAsync(1000)
    }
    worker.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.stdin.read()?.toString()).toContain('capture')
    await vi.advanceTimersByTimeAsync(1499)
    expect(resolved).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toBeNull()
    expect(resolved).toHaveBeenCalledOnce()
    await f.service.stop()
  })
  it('does not reset the composite USB device when the microphone route is empty', async () => {
    const f = fixture({ microphoneName: () => '' }), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(2500)
    expect(worker.stdin.read()).toBeNull()
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_reset_microphone_unknown')
    await f.service.stop()
  })
  it('defers a late watchdog check after a Main stall instead of judging unread helper output', async () => {
    let stall = 0
    const f = fixture({ now: () => performance.now() + stall }), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(500)
    stall += 13000 // Main was blocked; the helper's frames are still queued in the pipe.
    await vi.advanceTimersByTimeAsync(500)
    worker.stdout.write('{"type":"heartbeat"}\n{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(500)
    expect(worker.stdin.read()).toBeNull()
    expect(worker.kill).not.toHaveBeenCalled()
    expect(f.onStatus).not.toHaveBeenCalledWith('degraded', 'camera_frames_stale')
    // A stream that really stops is still reset at its normal deadline.
    for (let i = 0; i < 5; i++) { worker.stdout.write('{"type":"heartbeat"}\n'); await vi.advanceTimersByTimeAsync(500) }
    expect(worker.stdin.read()?.toString()).toBe('{"type":"reset_usb"}\n')
    await f.service.stop()
  })
  it('fails a snapshot fast while the helper is retiring and joins the bounded recovery', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.kill.mockImplementation(() => true) // A wedged helper may take time to exit after SIGKILL.
    worker.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(2500)
    expect(worker.stdin.read().toString()).toBe('{"type":"reset_usb"}\n')
    await vi.advanceTimersByTimeAsync(4000)
    expect(worker.kill).toHaveBeenCalledWith('SIGKILL')
    const pending = f.service.capture()
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.stdin.read()).toBeNull()
    expect(f.onStatus).toHaveBeenCalledWith('degraded', 'camera_snapshot_worker_retiring')
    await vi.advanceTimersByTimeAsync(3000)
    expect(f.onStatus).not.toHaveBeenCalledWith('degraded', 'camera_snapshot_timeout')
    worker.emit('close', 1)
    await vi.advanceTimersByTimeAsync(3000)
    const replacement = f.children[1]!
    replacement.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(0)
    const request = JSON.parse(replacement.stdin.read().toString())
    replacement.stdout.write(JSON.stringify({ type: 'snapshot', id: request.id, jpeg: '/9j/2Q==', width: 640, height: 480 }) + '\n')
    expect(await pending).toMatchObject({ width: 640, height: 480 })
    await f.service.stop()
  })
  it('defers USB reset while the conversation microphone is the camera itself, without spending budget', async () => {
    let microphone = 'Synthetic 1080P Low Light'
    const f = fixture({ microphoneName: () => microphone }), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(2500)
    expect(worker.stdin.read()).toBeNull()
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_reset_deferred_microphone')
    // Without a reset the stalled stream cannot recover; do not hold a visitor request.
    expect(await f.service.capture()).toBeNull()
    expect(worker.stdin.read()).toBeNull()
    microphone = 'Jabra Speak2 75'
    for (let i = 0; i < 19; i++) { worker.stdout.write('{"type":"heartbeat"}\n'); await vi.advanceTimersByTimeAsync(500) }
    expect(worker.stdin.read()).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(worker.stdin.read()?.toString()).toBe('{"type":"reset_usb"}\n')
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_reset_requested')
    await f.service.stop()
  })
  it('replaces a wedged helper without the USB reset while the camera microphone owns input', async () => {
    const f = fixture({ microphoneName: () => { throw new Error('enumeration failed') } }), worker = f.children[0]!
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_starting"}\n')
    await vi.advanceTimersByTimeAsync(12500)
    expect(worker.kill).toHaveBeenCalledWith('SIGKILL')
    await vi.advanceTimersByTimeAsync(1000)
    expect((f.spawn.mock.calls[1] as unknown as [string, string[]])[1]).toEqual(['Synthetic'])
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_reset_microphone_unknown')
    await f.service.stop()
  })
  it('resolves the conversation microphone from the selection, else the system default', () => {
    const devices = () => [{ name: 'Jabra Speak2 75', isDefault: false }, { name: 'Arducam 1080P Low Light', isDefault: true }]
    expect(effectiveMicrophoneName({ inputId: 'jabra', inputLabel: 'Jabra Speak2 75 (0b0e:24c8)' }, devices)).toBe('Jabra Speak2 75 (0b0e:24c8)')
    expect(effectiveMicrophoneName({ inputId: '', inputLabel: '' }, devices)).toBe('Arducam 1080P Low Light')
    expect(effectiveMicrophoneName({ inputId: 'default', inputLabel: 'Default - Jabra Speak2 75' }, devices)).toBe('Arducam 1080P Low Light')
    expect(effectiveMicrophoneName({ inputId: '', inputLabel: '' }, () => [])).toBe('')
  })
  it('degrades and retries with backoff when spawning the helper throws synchronously', async () => {
    vi.useFakeTimers()
    const onStatus = vi.fn(), child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
      kill: vi.fn((_signal?: string) => { child.emit('close', 0); return true }),
    })
    const spawn = vi.fn().mockImplementationOnce(() => { throw Object.assign(new Error('spawn ENOEXEC'), { code: 'ENOEXEC' }) })
      .mockImplementationOnce(() => child)
      .mockImplementationOnce(() => { throw Object.assign(new Error('spawn ENOMEM'), { code: 'ENOMEM' }) })
    const service = startCameraTracking({ executable: '/synthetic/camera', cameraName: 'Synthetic', spawn: spawn as never, onTarget: vi.fn(), onStatus })
    expect(onStatus).toHaveBeenCalledWith('degraded', 'camera_worker_unavailable')
    await vi.advanceTimersByTimeAsync(1000)
    expect(spawn).toHaveBeenCalledTimes(2)
    child.emit('close', 1)
    await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow()
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(onStatus).toHaveBeenLastCalledWith('degraded', 'camera_worker_restarting')
    await service.stop()
  })
  it('reaps a blocked reset queue before a fresh helper resets USB, preserving spacing and budget', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.kill.mockImplementation(() => true) // SIGKILL receipt is not proof of process exit.
    worker.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(2500)
    expect(worker.stdin.read().toString()).toBe('{"type":"reset_usb"}\n')
    for (let i = 0; i < 8; i++) {
      worker.stdout.write('{"type":"heartbeat"}\n')
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(worker.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    expect(f.onStatus).toHaveBeenCalledWith('degraded', 'camera_usb_reset_timeout')
    await vi.advanceTimersByTimeAsync(20000)
    expect(f.spawn).toHaveBeenCalledOnce()
    expect(worker.stdin.read()).toBeNull()
    worker.stdout.write('{"type":"frame"}\n{"type":"faces","faces":[]}\n')
    expect(f.onStatus).not.toHaveBeenCalledWith('ready', 'camera_tracking_ready')
    worker.emit('close', 1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.spawn).toHaveBeenLastCalledWith('/synthetic/camera', ['Synthetic', '--reset-usb-first'], {
      stdio: 'pipe', env: { PATH: '/usr/bin:/bin' },
    })
    const replacement = f.children[1]!
    replacement.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_releasing"}\n')
    replacement.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_resetting"}\n')
    expect(replacement.stdin.read()).toBeNull()
    replacement.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_failed"}\n')
    await vi.advanceTimersByTimeAsync(500)
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_recovery_exhausted')
    expect(replacement.stdin.read()).toBeNull()
    await f.service.stop()
  })
  it('holds the reset replacement until ten seconds after the previous request', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n')
    worker.stdin.read()
    await vi.advanceTimersByTimeAsync(4000)
    expect(worker.kill).toHaveBeenCalledWith('SIGKILL')
    await vi.advanceTimersByTimeAsync(5999)
    expect(f.spawn).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.spawn).toHaveBeenCalledTimes(2)
    expect(f.spawn.mock.calls[1]).toMatchObject({ 1: ['Synthetic', '--reset-usb-first'] })
    await f.service.stop()
  })
  it('keeps reset progress pending and ignores old frames until the reset completes', async () => {
    const f = fixture(), worker = f.children[0]!
    const capture = f.service.capture(); worker.stdin.read()
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n')
    worker.stdin.read()
    await vi.advanceTimersByTimeAsync(0)
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_releasing"}\n')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_resetting"}\n')
    worker.stdout.write('{"type":"status","status":"ready","reason":"camera_tracking_ready"}\n')
    worker.stdout.write('{"type":"frame"}\n{"type":"faces","faces":[]}\n')
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.stdin.read()).toBeNull()
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_reset_frame_ignored')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n')
    worker.stdout.write('{"type":"frame"}\n{"type":"faces","faces":[]}\n')
    await vi.advanceTimersByTimeAsync(0)
    const request = JSON.parse(worker.stdin.read().toString())
    worker.stdout.write(JSON.stringify({ type: 'snapshot', id: request.id, jpeg: '/9j/2Q==', width: 640, height: 480 }) + '\n')
    expect(await capture).toMatchObject({ width: 640, height: 480 })
    await f.service.stop()
  })
  it('starts USB recovery before capture when startup blocks without delivering any frame', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_starting"}\n')
    await vi.advanceTimersByTimeAsync(12500)
    expect(worker.kill).toHaveBeenCalledWith('SIGKILL')
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.spawn.mock.calls[1]).toMatchObject({ 1: ['Synthetic', '--reset-usb-first'] })
    expect(worker.stdin.read()).toBeNull()
    await f.service.stop()
  })
  it('exhausts and settles capture if the replacement reset also blocks', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    const capture = f.service.capture(); worker.stdin.read()
    await vi.advanceTimersByTimeAsync(2500); worker.stdin.read()
    await vi.advanceTimersByTimeAsync(14000)
    expect(await capture).toBeNull()
    expect(f.onStatus).toHaveBeenCalledWith('degraded', 'camera_usb_recovery_exhausted')
    expect(f.spawn.mock.calls.filter(call => (call as unknown as [string, string[]])[1].includes('--reset-usb-first'))).toHaveLength(1)
    expect(await f.service.capture()).toBeNull()
    await f.service.stop()
  })
  it('cancels a pending reset replacement when the awake camera owner stops', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n')
    worker.stdin.read()
    await vi.advanceTimersByTimeAsync(4000)
    await f.service.stop()
    await vi.advanceTimersByTimeAsync(60000)
    expect(f.spawn).toHaveBeenCalledOnce()
    expect(worker.stdin.read()).toBeNull()
  })
  it.each(['camera_permission_denied', 'camera_device_absent'])('retains %s across unrelated diagnostics until fresh frames', async reason => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write(JSON.stringify({ type: 'status', status: 'degraded', reason }) + '\n')
    worker.stderr.write('Synthetic native diagnostic')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_starting"}\n')
    const capture = f.service.capture()
    expect(worker.stdin.read()).toBeNull()
    expect(await capture).toBeNull()
    worker.stdout.write('{"type":"frame"}\n')
    const recovered = f.service.capture(), request = JSON.parse(worker.stdin.read().toString())
    worker.stdout.write(JSON.stringify({ type: 'snapshot', id: request.id, jpeg: '/9j/2Q==', width: 640, height: 480 }) + '\n')
    expect(await recovered).toMatchObject({ width: 640, height: 480 })
    await f.service.stop()
  })
  it('settles failed captures as soon as recovery is exhausted and permits fresh frames without another reset', async () => {
    const f = fixture(), worker = f.children[0]!
    const fault = '{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n'
    worker.stdout.write(fault); worker.stdin.read()
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_failed"}\n')
    for (let i = 0; i < 20; i++) { worker.stdout.write('{"type":"heartbeat"}\n'); await vi.advanceTimersByTimeAsync(500) }
    expect(worker.stdin.read().toString()).toContain('reset_usb')
    const pending = f.service.capture(); worker.stdin.read()
    await vi.advanceTimersByTimeAsync(3000)
    // The second reset is still pending, so the request joins recovery.
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_capture_waiting_recovery')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_failed"}\n')
    await vi.advanceTimersByTimeAsync(500)
    expect(await pending).toBeNull()
    expect(await f.service.capture()).toBeNull()
    expect(worker.stdin.read()).toBeNull()
    expect(f.onStatus).not.toHaveBeenCalledWith('degraded', 'camera_capture_recovery_timeout')
    worker.stdout.write('{"type":"frame"}\n')
    const fresh = f.service.capture(), request = JSON.parse(worker.stdin.read().toString())
    worker.stdout.write(JSON.stringify({ type: 'snapshot', id: request.id, jpeg: '/9j/2Q==', width: 640, height: 480 }) + '\n')
    expect(await fresh).toMatchObject({ width: 640, height: 480 })
    await vi.advanceTimersByTimeAsync(2500)
    expect(worker.stdin.read()).toBeNull() // A few frames do not replenish the USB budget.
    await f.service.stop()
  })
  it('holds a request arriving between worker exit and replacement until fresh delivery', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    worker.emit('close', 0)
    const pending = f.service.capture()
    let settled = false
    void pending.then(() => { settled = true })
    expect(await f.service.capture()).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(settled).toBe(false)
    const replacement = f.children[1]!
    expect(replacement.stdin.read()).toBeNull()
    replacement.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(0)
    const request = JSON.parse(replacement.stdin.read().toString())
    replacement.stdout.write(JSON.stringify({ type: 'snapshot', id: request.id, jpeg: '/9j/2Q==', width: 640, height: 480 }) + '\n')
    expect(await pending).toMatchObject({ width: 640, height: 480 })
    await f.service.stop()
  })
  it('reports dropped frames without discarding fresh gaze or resetting a delivering camera', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n{"type":"faces","faces":[{"x":0.2,"y":0.2,"width":0.3,"height":0.3}]}\n')
    const targetCount = f.onTarget.mock.calls.length
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_frame_dropped_late"}\n')
    expect(f.onTarget.mock.calls.length).toBe(targetCount)
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_frame_dropped_late')
    for (let i = 0; i < 6; i++) {
      worker.stdout.write('{"type":"frame"}\n')
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(worker.stdin.read()).toBeNull()
    await f.service.stop()
  })
  it('keeps capture healthy independently of slow face processing and still detects lost frames', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"faces","faces":[]}\n')
    for (let i = 0; i < 8; i++) {
      worker.stdout.write('{"type":"frame"}\n')
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(f.onStatus).not.toHaveBeenCalledWith('degraded', 'camera_frames_stale')
    expect(worker.stdin.read()).toBeNull()
    await vi.advanceTimersByTimeAsync(1500)
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_frames_stale')
    await f.service.stop()
  })
  it('resets after 2.5 seconds without native frames even when heartbeats and delayed Vision results continue', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(500)
      worker.stdout.write('{"type":"heartbeat"}\n{"type":"faces","faces":[]}\n')
    }
    expect(worker.stdin.read()).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(worker.stdin.read()?.toString()).toBe('{"type":"reset_usb"}\n')
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_reset_requested')
    expect(f.spawn).toHaveBeenCalledOnce()
    await f.service.stop()
  })
  it.each(['camera_permission_denied', 'camera_device_absent', 'camera_starting'])('disarms the old frame deadline on %s', async reason => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    worker.stdout.write(JSON.stringify({ type: 'status', status: 'degraded', reason }) + '\n')
    for (let i = 0; i < 6; i++) { worker.stdout.write('{"type":"heartbeat"}\n'); await vi.advanceTimersByTimeAsync(500) }
    expect(worker.stdin.read()).toBeNull()
    worker.stdout.write('{"type":"frame"}\n')
    await vi.advanceTimersByTimeAsync(2500)
    expect(worker.stdin.read()?.toString()).toBe('{"type":"reset_usb"}\n')
    await f.service.stop()
  })
  it('allows one retry at ten seconds without a reset storm', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n')
    expect(worker.stdin.read()?.toString()).toBe('{"type":"reset_usb"}\n')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_failed"}\n')
    for (let i = 0; i < 19; i++) { worker.stdout.write('{"type":"heartbeat"}\n'); await vi.advanceTimersByTimeAsync(500) }
    expect(worker.stdin.read()).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(worker.stdin.read()?.toString()).toBe('{"type":"reset_usb"}\n')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_failed"}\n')
    for (let i = 0; i < 40; i++) { worker.stdout.write('{"type":"heartbeat"}\n'); await vi.advanceTimersByTimeAsync(500) }
    expect(worker.stdin.read()).toBeNull()
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_recovery_exhausted')
    await f.service.stop()
  })
  it('keeps one snapshot request across automatic reset and requires a fresh frame before retrying', async () => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write('{"type":"frame"}\n')
    const pending = f.service.capture()
    worker.stdin.read()
    let settled = false
    void pending.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(2500)
    expect(settled).toBe(false)
    expect(worker.stdin.read().toString()).toBe('{"type":"reset_usb"}\n')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n')
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_reset_complete')
    expect(worker.stdin.read()).toBeNull()
    worker.stdout.write('{"type":"faces","faces":[]}\n')
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.stdin.read()).toBeNull()
    expect(settled).toBe(false)
    worker.stdout.write('{"type":"frame"}\n{"type":"faces","faces":[]}\n')
    expect(f.onStatus).toHaveBeenLastCalledWith('ready', 'camera_tracking_ready')
    await vi.advanceTimersByTimeAsync(0)
    const retried = JSON.parse(worker.stdin.read().toString())
    expect(retried).toMatchObject({ type: 'capture', id: 2 })
    worker.stdout.write(JSON.stringify({ type: 'snapshot', id: retried.id, jpeg: '/9j/2Q==', width: 640, height: 480 }) + '\n')
    expect(await pending).toMatchObject({ width: 640, height: 480 })
    await f.service.stop()
  })
  it('does not reset for frame gaps below the deadline', async () => {
    const f = fixture(), worker = f.children[0]!
    for (let i = 0; i < 20; i++) {
      worker.stdout.write('{"type":"frame"}\n')
      await vi.advanceTimersByTimeAsync(2000)
    }
    expect(worker.stdin.read()).toBeNull()
    expect(f.spawn).toHaveBeenCalledOnce()
    await f.service.stop()
  })
  it.each(['timeout', 'shutdown', 'camera_permission_denied', 'camera_device_absent'] as const)('ends a recovery-waiting capture on %s without allowing overlap or resetting again', async ending => {
    const f = fixture(), worker = f.children[0]!, pending = f.service.capture()
    worker.stdin.read()
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n')
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.stdin.read().toString()).toBe('{"type":"reset_usb"}\n')
    expect(await f.service.capture()).toBeNull()
    if (ending === 'shutdown') await f.service.stop()
    else if (ending !== 'timeout') worker.stdout.write(JSON.stringify({ type: 'status', status: 'degraded', reason: ending }) + '\n')
    else {
      worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n')
      for (let i = 0; i < 15; i++) { worker.stdout.write('{"type":"heartbeat"}\n'); await vi.advanceTimersByTimeAsync(1000) }
    }
    expect(await pending).toBeNull()
    expect(worker.stdin.read()).toBeNull()
    if (ending === 'timeout') expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_capture_recovery_timeout')
    await f.service.stop()
  })
  it.each(['camera_permission_denied', 'camera_device_absent'])('does not hold a capture open for %s', async reason => {
    const f = fixture(), worker = f.children[0]!
    worker.stdout.write(JSON.stringify({ type: 'status', status: 'degraded', reason }) + '\n')
    expect(await f.service.capture()).toBeNull()
    expect(worker.stdin.read()).toBeNull()
    await f.service.stop()
  })

  it('bounds reset attempts across worker replacement and holds backoff without restarting Electron', async () => {
    const f = fixture(), worker = f.children[0]!
    const fault = '{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n'
    worker.stdout.write(fault)
    expect(worker.stdin.read().toString()).toContain('reset_usb')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n')
    worker.stdout.write(fault)
    expect(worker.stdin.read()).toBeNull()
    worker.emit('close', 1)
    await vi.advanceTimersByTimeAsync(1000)
    const replacement = f.children[1]!
    let command: string | undefined
    for (let i = 0; i < 30; i++) {
      replacement.stdout.write('{"type":"heartbeat"}\n')
      await vi.advanceTimersByTimeAsync(1000)
      const pending = replacement.stdin.read()?.toString()
      if (pending) {
        command = pending
        replacement.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_failed"}\n')
      }
    }
    expect(command).toBe('{"type":"reset_usb"}\n')
    expect(f.onStatus).toHaveBeenLastCalledWith('degraded', 'camera_usb_recovery_exhausted')
    replacement.stdout.write(fault)
    expect(replacement.stdin.read()).toBeNull()
    await f.service.stop()
  })

  it('does not reset absent or permission-denied cameras and cancels backoff on shutdown', async () => {
    const f = fixture(), worker = f.children[0]!
    for (const reason of ['camera_permission_denied', 'camera_device_absent']) {
      worker.stdout.write(JSON.stringify({ type: 'status', status: 'degraded', reason }) + '\n')
      expect(worker.stdin.read()).toBeNull()
    }
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n')
    worker.stdin.read()
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_failed"}\n')
    await f.service.stop()
    await vi.advanceTimersByTimeAsync(120000)
    expect(worker.stdin.read()).toBeNull()
    expect(f.spawn).toHaveBeenCalledOnce()
  })

  it('rearms the reset budget only after thirty seconds of fresh frames', async () => {
    const f = fixture(), worker = f.children[0]!
    const fault = '{"type":"status","status":"degraded","reason":"camera_frames_missing"}\n'
    worker.stdout.write(fault); worker.stdin.read()
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n')
    for (let i = 0; i < 31; i++) {
      worker.stdout.write('{"type":"faces","faces":[]}\n')
      await vi.advanceTimersByTimeAsync(1000)
    }
    worker.stdout.write(fault)
    expect(worker.stdin.read().toString()).toBe('{"type":"reset_usb"}\n')
    worker.stdout.write('{"type":"status","status":"degraded","reason":"camera_usb_reset_complete"}\n')
    worker.stdout.write(fault)
    for (let i = 0; i < 31; i++) {
      worker.stdout.write('{"type":"heartbeat"}\n')
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(worker.stdin.read().toString()).toBe('{"type":"reset_usb"}\n')
    await f.service.stop()
  })

  it('sends only changed gaze targets, including one clear for repeated empty frames', async () => {
    const f = fixture(), worker = f.children[0]!
    const face = '{"type":"faces","faces":[{"x":0.2,"y":0.2,"width":0.3,"height":0.3}]}\n'
    worker.stdout.write(face); worker.stdout.write(face)
    expect(f.onTarget).toHaveBeenCalledOnce()
    worker.stdout.write('{"type":"faces","faces":[]}\n')
    worker.stdout.write('{"type":"faces","faces":[]}\n')
    expect(f.onTarget).toHaveBeenCalledTimes(2)
    expect(f.onTarget).toHaveBeenLastCalledWith(null)
    await f.service.stop()
    expect(f.onTarget).toHaveBeenCalledTimes(2)
  })
  it('uses elapsed time across wall-clock jumps without killing a responsive camera', async () => {
    const f = fixture(), worker = f.children[0]!
    for (let i = 0; i < 10; i++) {
      worker.stdout.write('{"type":"heartbeat"}\n')
      vi.setSystemTime(Date.now() + 600_000)
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(worker.kill).not.toHaveBeenCalled()
    await f.service.stop()
  })
  it('replays the current target once to a new renderer without restoring repeated frame sends', async () => {
    const f = fixture(), worker = f.children[0]!
    const face = '{"type":"faces","faces":[{"x":0.2,"y":0.2,"width":0.3,"height":0.3}]}\n'
    f.service.republishTarget()
    expect(f.onTarget).not.toHaveBeenCalled()
    worker.stdout.write(face)
    const target = f.onTarget.mock.lastCall?.[0]
    f.service.republishTarget()
    worker.stdout.write(face)
    expect(f.onTarget).toHaveBeenCalledTimes(2)
    expect(f.onTarget).toHaveBeenLastCalledWith(target)
    await f.service.stop()
    f.service.republishTarget()
    expect(f.onTarget).toHaveBeenCalledTimes(3)
    expect(f.onTarget).toHaveBeenLastCalledWith(null)
  })
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
