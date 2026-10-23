import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsoleBridge, AvatarRuntimeSnapshot } from '../../../src/shared/bridge'
import type { WakeInputSnapshot } from '../../../src/shared/wake-input'
import { getAvatarRuntimeWithTimeout } from '../../../src/renderer/console/runtime-poll'
import { RuntimeStatusStrip } from '../../../src/renderer/console/RuntimeStatusStrip'
import { createConsoleRuntimeStore } from '../../../src/renderer/console/runtime-store'
import { WakeRecoveryStatus } from '../../../src/renderer/console/WakeRecoveryStatus'
import { OperatorMessage, operatorMessageText } from '../../../src/renderer/console/reason-copy'
import { DEFAULT_LOOP_VIDEO } from '../../../src/shared/operator-loop'

beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const success = { ok: true as const, value: { status: 'ready', reason: 'avatar_ready', state: 'Listening', fps: 30,
  waveform: 0, mouthOpen: 0, audioUnderruns: 0, voiceGain: 1, musicGain: 1 } satisfies AvatarRuntimeSnapshot }

describe('bounded Console status polling', () => {
  it('distinguishes a paused Desktop from a failed input release', () => {
    const strip = (status: 'idle' | 'failed') => renderToStaticMarkup(createElement(RuntimeStatusStrip, {
      store: createConsoleRuntimeStore(), operatorLoop: { mode: 'desktop', status, generation: 1,
        reason: 'operator_loop_desktop', settings: { ...DEFAULT_LOOP_VIDEO } },
    }))
    expect(strip('idle')).toContain('Voice, wake listening and camera are off.')
    expect(strip('failed')).toContain('Could not fully pause the Mirror')
    expect(strip('failed')).not.toContain('camera are off')
  })
  it('shows unavailable at two seconds, ignores a late healthy result and allows the next poll', async () => {
    vi.useFakeTimers()
    let finish!: (value: typeof success) => void
    const bridge: Pick<ConsoleBridge, 'getAvatarRuntime'> = { getAvatarRuntime: vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(success) }
    const store = createConsoleRuntimeStore()
    store.set({ status: 'success', value: success.value })
    const request = getAvatarRuntimeWithTimeout(bridge).then(result => {
      if (result.ok) store.set({ status: 'success', value: result.value })
    }).catch(() => store.set({ status: 'failure', error: 'unavailable', reason: 'console_runtime_timeout' }))
    await vi.advanceTimersByTimeAsync(1999)
    expect(store.snapshot().status).toBe('success')
    await vi.advanceTimersByTimeAsync(1)
    await request
    expect(store.snapshot().status).toBe('failure')
    const html = renderToStaticMarkup(createElement(RuntimeStatusStrip, { store, lifecycle: 'dormant' }))
    expect(html).toContain('Status unavailable')
    finish(success)
    await Promise.resolve()
    expect(store.snapshot().status).toBe('failure')
    expect(await getAvatarRuntimeWithTimeout(bridge)).toBe(success)
    expect(bridge.getAvatarRuntime).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('shows a starting wake listener calmly and keeps the microphone warning for a stalled one', () => {
    const strip = (state: WakeInputSnapshot['state']) => {
      const wakeInput: WakeInputSnapshot = { state, blocks: 0, peak: 0, rms: 0, lastBlockAgeMs: null, detections: 0 }
      const store = createConsoleRuntimeStore()
      store.set({ status: 'success', value: { ...success.value, wakeInput } })
      return renderToStaticMarkup(createElement(RuntimeStatusStrip, { store, lifecycle: 'dormant', phrase: '魔鏡阿魔鏡' }))
    }
    expect(strip('waiting')).toContain('Starting the wake listener…')
    expect(strip('waiting')).not.toContain('runtime-status--attention')
    expect(strip('stalled')).toContain('Check the microphone connection')
    expect(strip('stalled')).toContain('runtime-status--attention')
    expect(strip('signal')).toContain('Listening for')
  })
  it('releases the timeout on success, rejection and synchronous bridge failure', async () => {
    vi.useFakeTimers()
    expect(await getAvatarRuntimeWithTimeout({ getAvatarRuntime: async () => success })).toBe(success)
    await expect(getAvatarRuntimeWithTimeout({ getAvatarRuntime: async () => { throw Error('synthetic') } })).rejects.toThrow('synthetic')
    await expect(getAvatarRuntimeWithTimeout({ getAvatarRuntime: () => { throw Error('synthetic') } })).rejects.toThrow('synthetic')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('visible and accessible Console outcomes', () => {
  it('preserves the scene outcome and completed-action count outside technical detail', () => {
    const text = 'Synthetic scene: partial. Reason: avatar_music_play_failed. 2 actions completed.'
    const message = operatorMessageText(text)
    expect(message).toContain('Synthetic scene: partial.')
    expect(message).toContain('2 actions completed.')
    const html = renderToStaticMarkup(createElement(OperatorMessage, { text }))
    const visible = html.split('<details>')[0]!
    expect(visible).toContain('Synthetic scene: partial.')
    expect(visible).toContain('2 actions completed.')
    expect(html).toContain(text)
  })
  it.each(['failed', 'restarting', 'recovered'] as const)('announces wake recovery %s appropriately', state => {
    const recovery = { state, reason: 'wake_worker_stalled', attempts: 1 } as WakeInputSnapshot['recovery']
    const html = renderToStaticMarkup(createElement(WakeRecoveryStatus, { recovery }))
    expect(html).toContain(`role="${state === 'failed' ? 'alert' : 'status'}"`)
    expect(html).toContain('Listener restart attempts: 1')
    expect(html).toContain('wake_worker_stalled')
  })
})
