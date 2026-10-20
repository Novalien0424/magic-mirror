import { describe, expect, it, vi } from 'vitest'
import { needsWakeMicrophonePermission, requestWakeMicrophonePermission } from '../../../src/main/wake/microphone-permission'

describe('native wake microphone permission', () => {
  it('checks real Mac capture even when the QA runner also sets a smoke timeout', () => {
    expect(needsWakeMicrophonePermission({ platform: 'darwin', smoke: true, isolatedQa: true, nativeWakeQa: true })).toBe(true)
    expect(needsWakeMicrophonePermission({ platform: 'darwin', smoke: false, isolatedQa: false, nativeWakeQa: false })).toBe(true)
    expect(needsWakeMicrophonePermission({ platform: 'darwin', smoke: true, isolatedQa: true, nativeWakeQa: false })).toBe(false)
    expect(needsWakeMicrophonePermission({ platform: 'win32', smoke: false, isolatedQa: false, nativeWakeQa: true })).toBe(false)
  })
  it('requests permission before allowing native capture', async () => {
    let resolve!: (allowed: boolean) => void
    const request = vi.fn(() => new Promise<boolean>(done => { resolve = done }))
    const result = requestWakeMicrophonePermission({ required: true, request, stopping: () => false })
    expect(request).toHaveBeenCalledOnce()
    resolve(true)
    expect(await result).toBe('granted')
  })

  it('reports denial and request errors without allowing capture', async () => {
    expect(await requestWakeMicrophonePermission({ required: true, request: async () => false, stopping: () => false })).toBe('denied')
    expect(await requestWakeMicrophonePermission({ required: true, request: async () => { throw new Error('private OS detail') }, stopping: () => false })).toBe('unavailable')
  })

  it('does not start after a permission prompt outlives shutdown', async () => {
    let stopping = false
    let resolve!: (allowed: boolean) => void
    const result = requestWakeMicrophonePermission({ required: true,
      request: () => new Promise<boolean>(done => { resolve = done }), stopping: () => stopping })
    stopping = true
    resolve(true)
    expect(await result).toBe('stopped')
  })

  it('does not prompt when native Mac capture is not required, or after shutdown', async () => {
    const request = vi.fn(async () => true)
    expect(await requestWakeMicrophonePermission({ required: false, request, stopping: () => false })).toBe('granted')
    expect(await requestWakeMicrophonePermission({ required: true, request, stopping: () => true })).toBe('stopped')
    expect(request).not.toHaveBeenCalled()
  })
})
