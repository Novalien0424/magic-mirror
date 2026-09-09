import { describe, it, expect, vi } from 'vitest'
import { createVoicePreviewLease } from '../../src/main/realtime/voice-preview'
import { DEFAULT_VOICE_EFFECTS } from '../../src/shared/voice-effects'
import type { SessionModelSnapshot } from '../../src/shared/types'
const request = { kind: 'local', voice: 'cedar', voiceSpeed: 1, speakingStyle: '', voiceEffects: DEFAULT_VOICE_EFFECTS }
describe('voice preview output lease', () => {
  function setup() {
    let dormant = true
    const broker = { issue: vi.fn().mockResolvedValue({ value: 'synthetic-ephemeral' }) }
    const suppressOutput = vi.fn(), enableOutput = vi.fn(), notify = vi.fn()
    const lease = createVoicePreviewLease({ isDormant: () => dormant, broker,
      snapshot: async () => ({ realtimeDialogue: 'configured-test-model' } as SessionModelSnapshot), suppressOutput, enableOutput, notify })
    return { lease, broker, suppressOutput, enableOutput, notify, active: () => { dormant = false } }
  }
  it('local preview reserves one output without credentials; invalid/cross-owner release fails', async () => {
    const x = setup(), result = await x.lease.acquire(request)
    expect(result.ok).toBe(true); expect(x.broker.issue).not.toHaveBeenCalled()
    expect((await x.lease.acquire(request)).ok).toBe(false)
    expect(x.lease.release('wrong')).toBe(false)
    if (result.ok) expect(x.lease.release(result.token)).toBe(true)
  })
  it('rejects private/extra fields and active conversations', async () => {
    const x = setup()
    expect((await x.lease.acquire({ ...request, guestId: 'synthetic' })).ok).toBe(false)
    x.active(); expect((await x.lease.acquire(request)).ok).toBe(false)
  })
  it('keeps preempted output suppressed until cleanup acknowledgment, then restores Console audio', async () => {
    const x = setup(), result = await x.lease.acquire(request)
    if (!result.ok) throw Error('fixture lease rejected')
    x.enableOutput.mockClear(); x.lease.preempt()
    expect(x.suppressOutput).toHaveBeenCalledOnce()
    expect((await x.lease.acquire(request)).ok).toBe(false)
    expect(x.lease.release('wrong')).toBe(false); expect(x.enableOutput).not.toHaveBeenCalled()
    expect(x.lease.release(result.token)).toBe(true); expect(x.enableOutput).toHaveBeenCalledOnce()
    const next = await x.lease.acquire(request)
    expect(next.ok).toBe(true); if (next.ok) x.lease.release(next.token)
  })
  it('live preemption rejects a late credential result before any output is exposed', async () => {
    const x = setup()
    let complete!: (value: { value: string }) => void
    x.broker.issue.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const pending = x.lease.acquire({ ...request, kind: 'generated' })
    await Promise.resolve(); x.lease.preempt(); x.active(); complete({ value: 'synthetic-ephemeral' })
    expect(await pending).toEqual({ ok: false, reason: 'voice_preview_preempted' })
    expect(x.suppressOutput).not.toHaveBeenCalled(); expect(x.enableOutput).not.toHaveBeenCalled()
  })
})
