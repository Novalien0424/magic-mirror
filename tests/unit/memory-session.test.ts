import { describe, it, expect, vi } from 'vitest'
import { MemorySession } from '../../src/main/memory/session'

// Inject semantic decisions: this suite checks Main ownership and playback binding.
function answer(session: MemorySession, state: Parameters<MemorySession['transcript']>[0], item: string, text: string) {
  const q = session.confirmation(state, item)
  return session.transcript(state, item, text, q ? { token: q.token, decision: text === 'yes' || text === '是的' ? 'yes' : 'unclear' } : undefined)
}
const state = { avatarId: 'avatar-a', realtimeSessionId: 'session-a', sessionGeneration: 1, active: true }
const request = (action: 'identify' | 'remember' | 'recall' | 'forget', extra = {}) => ({ action, name: '', topic: '', text: '', query: '', ...extra })
function setup() {
  const store = { recall: vi.fn(() => []), save: vi.fn(), forget: vi.fn(() => true) }
  return { store, session: new MemorySession(store) }
}
describe('private memory session', () => {
  it('does not retrieve or write until a separate contextual verbal confirmation', () => {
    const { session, store } = setup()
    expect(session.request(state, request('recall')).code).toBe('memory_identity_required')
    const first = session.request(state, request('identify', { name: 'Fixture Person' })).confirmation!
    session.delivery(state, first.token, first.text, true)
    expect(store.recall).not.toHaveBeenCalled()
    session.turnStart(state, 'item-1')
    expect(answer(session, state, 'item-1', 'Yes, but not me').code).toBe('memory_confirmation_unclear')
    const again = session.request(state, request('identify', { name: 'Fixture Person' })).confirmation!
    session.delivery(state, again.token, again.text, true)
    session.turnStart(state, 'item-2')
    expect(answer(session, state, 'item-2', '是的').code).toBe('memory_identity_confirmed')
    expect(session.request(state, request('remember', { topic: 'Fixture', text: 'Synthetic value' })).code).toBe('memory_saved')
    expect(store.save).toHaveBeenCalledWith('avatar-a', 'Fixture Person', 'Fixture', 'Synthetic value')
  })
  it('rejects stale confirmations and never silently switches a confirmed owner', () => {
    const { session, store } = setup()
    { const q = session.request(state, request('identify', { name: 'Fixture A' })).confirmation!; session.delivery(state, q.token, q.text, true) }
    session.turnStart(state, 'item-1')
    answer(session, state, 'item-1', 'yes')
    expect(session.request(state, request('identify', { name: 'Fixture B' })).code).toBe('memory_clean_session_required')
    expect(session.request(state, request('recall')).status).toBe('rejected')
    session.reset()
    expect(answer(session, { ...state, realtimeSessionId: 'session-b' }, 'item-1', 'yes').code).toBe('memory_no_pending_confirmation')
    expect(store.recall).toHaveBeenCalledTimes(0)
  })
  it('clears confirmation on sleep, new session and avatar change; failed storage is content-free', () => {
    const { session, store } = setup()
    { const q = session.request(state, request('identify', { name: 'Fixture A' })).confirmation!; session.delivery(state, q.token, q.text, true) }
    session.turnStart(state, 'item-1')
    answer(session, state, 'item-1', 'yes')
    expect(session.request({ ...state, avatarId: 'avatar-b' }, request('recall')).code).toBe('memory_identity_required')
    { const q = session.request(state, request('identify', { name: 'Fixture A' })).confirmation!; session.delivery(state, q.token, q.text, true) }
    session.turnStart(state, 'item-2')
    answer(session, state, 'item-2', 'yes')
    store.save.mockImplementation(() => { throw new Error('PRIVATE synthetic detail') })
    expect(session.request(state, request('remember', { topic: 'Fixture', text: 'Synthetic' }))).toEqual({ status: 'failed', code: 'memory_storage_unavailable' })
    session.observe({ ...state, active: false })
    expect(session.request(state, request('recall')).code).toBe('memory_identity_required')
  })
  it('deletion blocks old-context reads until the application replaces the session', () => {
    const { session, store } = setup()
    { const q = session.request(state, request('identify', { name: 'Fixture A' })).confirmation!; session.delivery(state, q.token, q.text, true) }
    session.turnStart(state, 'item-1')
    answer(session, state, 'item-1', 'yes')
    expect(session.request(state, request('forget', { topic: 'Fixture' })).code).toBe('memory_forgotten')
    expect(session.request(state, request('remember', { topic: 'Fixture', text: 'Old value' })).status).toBe('rejected')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('uses monotonic confirmation deadlines across forward and backward wall-clock steps', () => {
    let elapsed = 1000
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(0)
    try {
      const { session } = setup()
      const q = session.request(state, request('identify', { name: 'Fixture' })).confirmation!
      wallClock.mockReturnValue(9_000_000)
      elapsed += 100
      expect(session.delivery(state, q.token, q.text, true).code).toBe('memory_question_delivered')
      session.turnStart(state, 'answer')
      wallClock.mockReturnValue(-9_000_000)
      elapsed += 59_999
      expect(session.confirmation(state, 'answer')).toEqual(q)
      elapsed += 2
      expect(session.confirmation(state, 'answer')).toBeUndefined()
      expect(answer(session, state, 'answer', 'yes').code).toBe('memory_confirmation_expired')
    } finally { clock.mockRestore(); wallClock.mockRestore() }
  })
})
