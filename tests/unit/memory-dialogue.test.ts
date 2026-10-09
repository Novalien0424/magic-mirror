import { describe, it, expect, vi } from 'vitest'
import { MemoryDialogue } from '../../src/renderer/realtime/memory-dialogue'
import { buildMemoryState, buildMemoryQuestion, buildMemoryAcknowledgment } from '../../src/shared/realtime-prompts'
function setup() {
  const sent: any[] = [], receipt = vi.fn(async (_phase: string, _token: string, _text: string) => ({ status: 'accepted' as const, code: 'memory_question_delivered' }))
  const failed = vi.fn(), tail = vi.fn(async () => {})
  const dialogue = new MemoryDialogue({ send: e => sent.push(e), baseInstructions: 'Persona', turnDetection: { type: 'semantic_vad', interrupt_response: true },
    speakingStyle: '', input: receipt, tail, interrupt: vi.fn(async () => {}), failed, report: vi.fn() })
  const ack = () => { const e = sent.filter(e => e.type === 'session.update').at(-1); dialogue.event({ type: 'session.updated', session: e.session }) }
  const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
  return { dialogue, sent, receipt, failed, tail, ack, tick }
}
describe('ordered memory dialogue', () => {
  it('uses the selected disclosure language for both question and policy acknowledgment', () => {
    expect(buildMemoryQuestion('小林', 'zh-TW')).toBe('你是小林嗎？')
    expect(buildMemoryAcknowledgment({ status: 'accepted', code: 'memory_identity_confirmed', mode: 'explicit', language: 'zh-TW' }, '').instructions).toContain('我只會記住你明確請我保存的內容。')
  })
  it('projects all policy modes with no row identifiers, including empty and temporary contexts', () => {
    for (const mode of ['automatic', 'explicit', 'off'] as const) {
      const text = buildMemoryState({ status: 'accepted', code: 'memory_identity_confirmed', mode, entries: [] })
      expect(text).toContain('Identity: verbally confirmed')
      expect(text.toLowerCase()).toContain(mode === 'explicit' ? 'explicit-only' : mode)
    }
    const text = buildMemoryState({ status: 'accepted', code: 'memory_identity_confirmed', mode: 'off', temporary: true,
      entries: [{ id: 'private-row-id', topic: 'Plan', text: 'Tentative plan', state: 'active', updatedAt: '' }] })
    expect(text).toContain('Temporary encounter'); expect(text).not.toContain('private-row-id')
  })
  it('bounds missing acknowledgments and rejects a late acknowledgment after close', async () => {
    vi.useFakeTimers()
    try {
      const p = setup(); const ask = p.dialogue.ask({ token: 'q', text: 'Are you Alex?' })
      await vi.advanceTimersByTimeAsync(3001); await ask
      expect(p.failed).toHaveBeenCalledOnce()
      p.ack(); await p.tick()
      expect(p.sent.some(e => e.type === 'response.create')).toBe(false)
      expect(p.receipt.mock.calls.some(c => c[0] === 'question_played')).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it('waits for matching configuration and actual matching question playback before arming Main', async () => {
    const p = setup(); const started = p.dialogue.ask({ token: 'q', text: 'Are you Alex?' })
    p.dialogue.event({ type: 'session.updated', session: { instructions: 'old' } })
    expect(p.sent.some(e => e.type === 'response.create')).toBe(false)
    p.ack(); await started
    p.dialogue.event({ type: 'response.created', response: { id: 'r', metadata: { mirror_memory_question: 'q' } } })
    p.dialogue.event({ type: 'output_audio_buffer.started', response_id: 'r' })
    p.dialogue.event({ type: 'response.done', response: { id: 'r', status: 'completed', output: [{ content: [{ transcript: 'Are you Alex?' }] }] } })
    await p.tick(); expect(p.receipt).not.toHaveBeenCalled()
    p.dialogue.event({ type: 'output_audio_buffer.stopped', response_id: 'unrelated' })
    await p.tick(); expect(p.receipt).not.toHaveBeenCalled()
    p.dialogue.event({ type: 'output_audio_buffer.stopped', response_id: 'r' }); await p.tick()
    expect(p.tail).toHaveBeenCalledOnce()
    expect(p.receipt).toHaveBeenCalledWith('question_played', 'q', 'Are you Alex?')
    p.dialogue.close()
  })
  it('synchronizes empty-memory policy before exactly one follow-up and ignores duplicate acknowledgments', async () => {
    const p = setup(); const ask = p.dialogue.ask({ token: 'q', text: 'Are you Alex?' }); p.ack(); await ask
    p.dialogue.event({ type: 'response.created', response: { id: 'r', metadata: { mirror_memory_question: 'q' } } })
    p.dialogue.event({ type: 'output_audio_buffer.started', response_id: 'r' })
    p.dialogue.event({ type: 'response.done', response: { id: 'r', status: 'completed', output: [{ content: [{ transcript: 'Are you Alex?' }] }] } })
    p.dialogue.event({ type: 'output_audio_buffer.stopped', response_id: 'r' }); await p.tick()
    p.dialogue.speech()
    const done = p.dialogue.answer({ status: 'accepted', code: 'memory_identity_confirmed', mode: 'automatic', entries: [] })
    expect(p.sent.filter(e => e.type === 'response.create')).toHaveLength(1)
    expect(JSON.stringify(p.sent.at(-1))).toContain('Automatic:')
    p.ack(); await done; p.ack()
    expect(p.sent.filter(e => e.type === 'response.create')).toHaveLength(2)
    p.dialogue.close()
  })
  it('never reports mismatched, cancelled or interrupted questions as delivered', async () => {
    for (const reason of ['mismatch', 'cancelled', 'interrupted']) {
      const p = setup(); const ask = p.dialogue.ask({ token: 'q', text: 'Are you Alex?' }); p.ack(); await ask
      p.dialogue.event({ type: 'response.created', response: { id: 'r', metadata: { mirror_memory_question: 'q' } } })
      p.dialogue.event({ type: 'output_audio_buffer.started', response_id: 'r' })
      if (reason === 'interrupted') p.dialogue.speech()
      p.dialogue.event({ type: 'response.done', response: { id: 'r', status: reason === 'cancelled' ? 'cancelled' : 'completed', output: [{ content: [{ transcript: reason === 'mismatch' ? 'Would you like to talk?' : 'Are you Alex?' }] }] } })
      p.dialogue.event({ type: 'output_audio_buffer.stopped', response_id: 'r' }); await p.tick()
      expect(p.receipt.mock.calls.some(c => c[0] === 'question_played')).toBe(false)
      expect(p.failed).toHaveBeenCalledOnce()
      p.dialogue.close()
    }
  })
  it('bounds missing answer transcription and cancels on media ownership changes', async () => {
    vi.useFakeTimers()
    try {
      for (const media of [false, true]) {
        const p = setup(); const ask = p.dialogue.ask({ token: 'q', text: 'Are you Alex?' }); p.ack(); await ask
        p.dialogue.event({ type: 'response.created', response: { id: 'r', metadata: { mirror_memory_question: 'q' } } })
        p.dialogue.event({ type: 'output_audio_buffer.started', response_id: 'r' })
        p.dialogue.event({ type: 'response.done', response: { id: 'r', status: 'completed', output: [{ content: [{ transcript: 'Are you Alex?' }] }] } })
        p.dialogue.event({ type: 'output_audio_buffer.stopped', response_id: 'r' }); await p.tick()
        if (media) p.dialogue.cancel()
        else { p.dialogue.speech(); await vi.advanceTimersByTimeAsync(10001) }
        expect(p.failed).toHaveBeenCalledOnce(); expect(p.dialogue.active).toBe(false)
      }
    } finally { vi.useRealTimers() }
  })
})
