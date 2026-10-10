import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ open: vi.fn(), devices: vi.fn() }))
vi.mock('decibri', () => ({ Microphone: native }))
import { openWakeCapture } from '../../../src/main/wake/capture'

describe('wake native capture boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads native drop counters before stream release without retaining audio', async () => {
    const stream = Object.assign(new EventEmitter(), { overrunCount: 0, stop: vi.fn(() => { stream.overrunCount = 0 }) })
    native.open.mockResolvedValue(stream)
    const capture = await openWakeCapture({ onSamples: vi.fn(), onError: vi.fn() })
    stream.overrunCount = 2
    stream.emit('backpressure')
    expect(capture.statistics?.()).toEqual({ overruns: 2, backpressure: 1 })
    capture.stop()
    expect(capture.statistics?.()).toEqual({ overruns: 0, backpressure: 1 })
  })

  it('preserves allowlisted device failures without forwarding arbitrary error content', async () => {
    const stream = Object.assign(new EventEmitter(), { stop: vi.fn() })
    native.open.mockResolvedValue(stream)
    const onError = vi.fn()
    await openWakeCapture({ onSamples: vi.fn(), onError })
    stream.emit('error', Object.assign(new Error('private device details'), { code: 'DEVICE_FAILED' }))
    stream.emit('close')
    expect(onError).toHaveBeenCalledExactlyOnceWith('wake_microphone_device_failed')
  })

  it('reports unexpected stream end and ignores expected close after stop', async () => {
    const stream = Object.assign(new EventEmitter(), { stop: vi.fn(() => stream.emit('close')) })
    native.open.mockResolvedValue(stream)
    const onError = vi.fn()
    const capture = await openWakeCapture({ onSamples: vi.fn(), onError })
    capture.stop()
    expect(onError).not.toHaveBeenCalled()
    const second = await openWakeCapture({ onSamples: vi.fn(), onError })
    stream.emit('end')
    expect(onError).toHaveBeenCalledExactlyOnceWith('wake_microphone_stream_closed')
    second.stop()
  })

  it('reports malformed PCM separately and stops delivering after closure', async () => {
    const stream = Object.assign(new EventEmitter(), { stop: vi.fn() })
    native.open.mockResolvedValue(stream)
    const onError = vi.fn()
    const onSamples = vi.fn()
    const capture = await openWakeCapture({ onSamples, onError })
    stream.emit('data', Buffer.from([1]))
    expect(onError).toHaveBeenCalledExactlyOnceWith('wake_microphone_invalid_pcm')
    capture.stop()
    stream.emit('data', Buffer.from([1, 0]))
    expect(onSamples).not.toHaveBeenCalled()
  })
})
