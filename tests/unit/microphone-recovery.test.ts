import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchMicrophone } from '../../src/renderer/realtime/microphone-recovery'

class Track extends EventTarget {
  kind = 'audio'
  readyState = 'live'
  enabled = true
  constructor(readonly id: string, private order: string[]) { super() }
  stop() { this.order.push(`stop:${this.id}`); this.readyState = 'ended' }
  getSettings() { return { deviceId: this.id } }
}
function stream(track: Track) {
  const tracks = [track]
  return { getTracks: () => [...tracks], getAudioTracks: () => [...tracks],
    addTrack: (value: Track) => tracks.push(value),
    removeTrack: (value: Track) => { const i = tracks.indexOf(value); if (i >= 0) tracks.splice(i, 1) },
  } as unknown as MediaStream
}
function fixture() {
  vi.useFakeTimers()
  const order: string[] = []
  const old = new Track('old', order), next = new Track('jabra', order)
  const owned = stream(old)
  const devices = new EventTarget() as MediaDevices
  devices.enumerateDevices = vi.fn(async () => [
    { kind: 'audioinput', deviceId: 'default', groupId: 'jabra-group' },
    { kind: 'audioinput', deviceId: 'jabra', groupId: 'jabra-group' },
  ] as MediaDeviceInfo[])
  devices.getUserMedia = vi.fn(async () => { order.push('acquire'); return stream(next) })
  const replace = vi.fn(async () => { order.push('replace') })
  const status = vi.fn()
  const watch = watchMicrophone({ stream: owned, mediaDevices: devices,
    getConstraints: async () => true, replaceTrack: replace, onStatus: status })
  return { order, old, next, owned, devices, replace, status, watch }
}
afterEach(() => vi.useRealTimers())

describe('active microphone hotplug', () => {
  it('releases the old capture before acquiring and replacing the sender track', async () => {
    const f = fixture()
    f.old.dispatchEvent(new Event('ended'))
    await vi.advanceTimersByTimeAsync(1300)
    expect(f.order).toEqual(['stop:old', 'acquire', 'replace'])
    expect(f.owned.getAudioTracks()).toEqual([f.next])
    expect(f.status).toHaveBeenLastCalledWith('microphone_recovery_ready')
    await f.watch.stop()
  })

  it('ignores unrelated device changes when the current default mic is unchanged', async () => {
    const f = fixture()
    f.devices.enumerateDevices = vi.fn(async () => [
      { kind: 'audioinput', deviceId: 'default', groupId: 'old-group' },
      { kind: 'audioinput', deviceId: 'old', groupId: 'old-group' },
      { kind: 'videoinput', deviceId: 'camera', groupId: 'camera-group' },
    ] as MediaDeviceInfo[])
    f.devices.dispatchEvent(new Event('devicechange'))
    await vi.advanceTimersByTimeAsync(1500)
    expect(f.devices.getUserMedia).not.toHaveBeenCalled()
    expect(f.old.readyState).toBe('live')
    await f.watch.stop()
  })

  it('stops a late acquisition during close without attaching it to the old session', async () => {
    const f = fixture()
    let resolve!: (value: MediaStream) => void
    f.devices.getUserMedia = vi.fn(() => new Promise<MediaStream>(r => { resolve = r }))
    f.old.dispatchEvent(new Event('ended'))
    await vi.advanceTimersByTimeAsync(1300)
    const stopped = f.watch.stop()
    resolve(stream(f.next))
    await stopped
    expect(f.next.readyState).toBe('ended')
    expect(f.replace).not.toHaveBeenCalled()
    f.devices.dispatchEvent(new Event('devicechange'))
    await vi.advanceTimersByTimeAsync(20000)
    expect(f.devices.getUserMedia).toHaveBeenCalledOnce()
  })

  it('keeps failures content-free and retries when a microphone returns', async () => {
    const f = fixture()
    f.devices.getUserMedia = vi.fn().mockRejectedValueOnce(new Error('private native detail'))
      .mockResolvedValueOnce(stream(f.next))
    f.old.dispatchEvent(new Event('ended'))
    await vi.advanceTimersByTimeAsync(1300)
    expect(f.status).toHaveBeenLastCalledWith('microphone_recovery_waiting')
    f.devices.dispatchEvent(new Event('devicechange'))
    await vi.advanceTimersByTimeAsync(1300)
    expect(f.replace).toHaveBeenCalledOnce()
    expect(JSON.stringify(f.status.mock.calls)).not.toContain('private native detail')
    await f.watch.stop()
  })
})
