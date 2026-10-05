import { describe, it, expect, vi } from 'vitest'
import { MemorySession } from '../../src/main/memory/session'
const state = { active: true, avatarId: 'a', realtimeSessionId: 's', sessionGeneration: 1 }
const identify = { action: 'identify', name: 'Alex', topic: '', text: '', query: '' }
function setup() {
  const session = new MemorySession({ save: vi.fn(), recall: vi.fn(() => []), forget: vi.fn() })
  const proposal = session.request(state, identify)
  return { session, proposal }
}
describe('delivered identity question', () => {
  it('never accepts yes before the intended question was delivered', () => {
    const { session } = setup()
    session.turnStart(state, 'early')
    expect(session.transcript(state, 'early', 'yes').code).not.toBe('memory_identity_confirmed')
    expect(session.currentOwner(state)).toBe('')
  })
  it('requires matching delivery and a new answer, never a wrong question or stale token', () => {
    const { session, proposal } = setup()
    const q = proposal.confirmation!
    expect(session.delivery(state, q.token, 'Would you like to talk?', true).code).toBe('memory_question_rejected')
    session.turnStart(state, 'answer')
    expect(session.transcript(state, 'answer', 'yes').code).not.toBe('memory_identity_confirmed')
    const next = session.request(state, identify).confirmation!
    expect(session.delivery(state, q.token, q.text, true).status).toBe('rejected')
    session.turnStart(state, 'before-delivery')
    expect(session.delivery(state, next.token, next.text, true).code).toBe('memory_question_delivered')
    expect(session.transcript(state, 'before-delivery', 'yes').code).toBe('memory_confirmation_stale')
    session.turnStart(state, 'after-delivery')
    expect(session.transcript(state, 'after-delivery', 'yes').code).toBe('memory_identity_confirmed')
  })
  it('cancellation, an unrelated answer, expiry and session changes keep memory locked', () => {
    vi.useFakeTimers()
    try {
      for (const reason of ['cancel', 'unrelated', 'expiry', 'session']) {
        const { session, proposal } = setup(), q = proposal.confirmation!
        session.delivery(state, q.token, q.text, true)
        if (reason === 'cancel') session.delivery(state, q.token, '', false)
        if (reason === 'unrelated') { session.turnStart(state, 'other'); session.transcript(state, 'other', 'Tell me about the weather') }
        if (reason === 'expiry') vi.advanceTimersByTime(60001)
        const current = reason === 'session' ? { ...state, realtimeSessionId: 'new' } : state
        session.turnStart(current, 'yes')
        expect(session.transcript(current, 'yes', 'yes').code).not.toBe('memory_identity_confirmed')
      }
    } finally { vi.useRealTimers() }
  })
})
