import { describe, it, expect, vi } from 'vitest'
import { RelationshipMemory } from '../../src/main/memory/relationship'
import type { MemoryRepository } from '../../src/main/memory/contracts'
import type { MemoryIntentInput, MemoryIntentResult } from '../../src/main/memory/intent'
const state = { active: true, avatarId: 'raven', realtimeSessionId: 'session-a', sessionGeneration: 1 }
const request = (action: string, extra = {}) => ({ action, name: '', topic: '', text: '', query: '', ...extra })
function setup() {
  let mode = 'automatic', epoch = 1
  const repository = {
    policy: vi.fn(async () => ({ mode, epoch, cleanupRequired: false })),
    brief: vi.fn(async () => [{ id: 'record', topic: 'Exhibition', text: 'Synthetic exhibition is upcoming.', updatedAt: '2026-10-05' }]),
    hybridRecall: vi.fn(async () => ({ entries: [], incomplete: false })),
    list: vi.fn(async () => []),
    save: vi.fn(async () => { epoch++; return { id: 'saved' } }), forget: vi.fn(async () => { epoch++; return true }),
    setPolicy: vi.fn(async (_a, _n, value) => { mode = value; return { mode, epoch: ++epoch, cleanupRequired: false } }),
    setCleanupRequired: vi.fn(async () => {}),
  }
  const learning = { observe: vi.fn(async () => {}), flush: vi.fn(async () => {}), invalidate: vi.fn() }, report = vi.fn()
  // Stub semantic decisions; these tests prove application boundaries, not model accuracy.
  const interpret = vi.fn(async (input: MemoryIntentInput): Promise<MemoryIntentResult> => ({
    confirmation: input.task === 'confirmation' ? 'yes' : 'unclear', language: 'en',
    authorized: input.task === 'introduction' || input.request?.action === 'identify' || input.request?.action === 'forget' || input.request?.action === 'temporary',
    name: input.task === 'introduction' || input.request?.action === 'identify' ? 'Alice' : '',
  }))
  const memory = new RelationshipMemory({ repository: repository as unknown as MemoryRepository, learning, report, interpret, controlPhrases: async () => ['exact spell'] })
  const confirm = async () => {
    await memory.input(state, 'speech', 'intro', '')
    await memory.input(state, 'complete', 'intro', 'My name is Alice.')
    const q = (await memory.request(state, request('identify', { name: 'Alice' }))).confirmation!
    await memory.input(state, 'question_played', q.token, q.text)
    await memory.input(state, 'speech', 'confirmation', '')
    return memory.input(state, 'complete', 'confirmation', 'yes')
  }
  return { repository, learning, memory, confirm, report, interpret }
}
describe('Realtime relationship memory integration', () => {
  it.each(['I remember building theater sets.', '我是博物館設計師。'])('keeps ordinary biographical evidence: %s', async text => {
    const p = setup(); await p.confirm()
    p.interpret.mockClear()
    await p.memory.input(state, 'speech', 'biography', '')
    await p.memory.input(state, 'complete', 'biography', text)
    await p.memory.input(state, 'settled', 'biography', '')
    expect(p.learning.observe).toHaveBeenCalledWith(expect.objectContaining({ text }))
    expect(p.interpret).not.toHaveBeenCalled()
  })
  it('accepts a natural confirmation judgment and ignores delayed judgments after session replacement', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice.')
    const q = (await p.memory.request(state, request('identify', { name: 'Alice' }))).confirmation!
    await p.memory.input(state, 'question_played', q.token, q.text)
    await p.memory.input(state, 'speech', 'answer', '')
    let finish!: (result: MemoryIntentResult) => void
    p.interpret.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = p.memory.input(state, 'complete', 'answer', 'Yes, that’s me.')
    p.memory.observe({ ...state, realtimeSessionId: 'replacement' })
    finish({ confirmation: 'yes', authorized: false, name: '', language: 'en' })
    expect((await pending).code).toBe('memory_result_stale')
    expect(p.repository.brief).not.toHaveBeenCalled()
  })
  it.each(['Yes, that’s me.', '對呀，就是我。'])('uses the delivered question to interpret a natural answer: %s', async text => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', '我是 Alice。')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: 'Alice', language: 'zh-TW' })
    const q = (await p.memory.request(state, request('identify', { name: 'Alice' }))).confirmation!
    expect(q.text).toBe('你是Alice嗎？')
    await p.memory.input(state, 'question_played', q.token, q.text)
    await p.memory.input(state, 'speech', 'answer', '')
    expect(await p.memory.input(state, 'complete', 'answer', text)).toMatchObject({ code: 'memory_identity_confirmed', language: 'zh-TW' })
    expect(p.interpret).toHaveBeenLastCalledWith({ task: 'confirmation', text, question: q.text }, expect.any(AbortSignal))
    expect(p.repository.brief).toHaveBeenCalledOnce()
  })
  it('does not authorize a write merely because a story mentions remember', async () => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'speech', 'story', '')
    await p.memory.input(state, 'complete', 'story', 'I remember painting the sets.')
    expect((await p.memory.request(state, request('remember', { topic: 'Unrelated', text: 'Fabricated' }))).code).toBe('memory_action_not_requested')
    expect(p.repository.save).not.toHaveBeenCalled()
  })
  it('accepts a contextual save request without requiring a command keyword', async () => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'speech', 'write', '')
    await p.memory.input(state, 'complete', 'write', 'Please keep this for next time: I prefer mint tea.')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: '', language: 'en' })
    expect((await p.memory.request(state, request('remember', { topic: 'Tea', text: 'Prefers mint tea.' }))).code).toBe('memory_saved')
    expect(p.repository.save).toHaveBeenCalledWith('raven', 'Alice', 'Tea', 'Prefers mint tea.')
    await p.memory.input(state, 'settled', 'write', '')
    expect(p.learning.observe).not.toHaveBeenCalled()
  })
  it('refreshes private context when the atomic save reports an older existing record', async () => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'speech', 'correction', '')
    await p.memory.input(state, 'complete', 'correction', 'Keep the updated preference: mint tea.')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: '', language: 'en' })
    p.repository.save.mockResolvedValueOnce({ id: 'old-record', revision: 2 } as { id: string })
    expect((await p.memory.request(state, request('remember', { topic: 'Tea', text: 'Prefers mint tea.' }))).code).toBe('memory_corrected')
    expect(p.repository.list).not.toHaveBeenCalled()
    expect((await p.memory.request(state, request('recall'))).code).toBe('memory_clean_session_required')
  })
  it('ignores authorization arriving after a new utterance and fails closed without an interpreter result', async () => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'speech', 'write', '')
    await p.memory.input(state, 'complete', 'write', 'Please keep this for next time.')
    let finish!: (result: MemoryIntentResult) => void
    p.interpret.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = p.memory.request(state, request('remember', { topic: 'Work', text: 'Synthetic fact.' }))
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await p.memory.input(state, 'speech', 'replacement', '')
    finish({ confirmation: 'unclear', authorized: true, name: '', language: 'en' })
    expect((await pending).code).toBe('memory_result_stale')
    await p.memory.input(state, 'complete', 'replacement', 'Remember this instead.')
    p.interpret.mockRejectedValueOnce(Error('PRIVATE FIXTURE'))
    expect((await p.memory.request(state, request('remember', { topic: 'Work', text: 'Synthetic fact.' }))).code).toBe('memory_interpretation_unavailable')
    expect(p.repository.save).not.toHaveBeenCalled()
    expect(JSON.stringify(p.report.mock.calls)).not.toContain('PRIVATE')
  })
  it.each(['no', 'unclear'] as const)('keeps memory locked after a %s judgment', async decision => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice.')
    const q = (await p.memory.request(state, request('identify', { name: 'Alice' }))).confirmation!
    await p.memory.input(state, 'question_played', q.token, q.text)
    await p.memory.input(state, 'speech', 'answer', '')
    p.interpret.mockResolvedValueOnce({ confirmation: decision, authorized: false, name: '', language: 'en' })
    expect((await p.memory.input(state, 'complete', 'answer', 'A quoted or conflicting reply.')).code).toBe(decision === 'no' ? 'memory_confirmation_cancelled' : 'memory_confirmation_unclear')
    await p.memory.input(state, 'speech', 'unrelated', '')
    await p.memory.input(state, 'complete', 'unrelated', 'yes')
    expect(p.repository.brief).not.toHaveBeenCalled()
  })
  it('treats an unsolicited save as unrequested, preserves actual policy and continues ordinary learning', async () => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'speech', 'story', '')
    await p.memory.input(state, 'complete', 'story', 'I design museum exhibits.')
    expect(await p.memory.request(state, request('remember', { topic: 'Work', text: 'Designs exhibits' })))
      .toMatchObject({ status: 'ignored', code: 'memory_action_not_requested', mode: 'automatic' })
    expect(p.repository.save).not.toHaveBeenCalled()
    expect(p.learning.invalidate).not.toHaveBeenCalled()
    await p.memory.input(state, 'settled', 'story', '')
    expect(p.learning.observe).toHaveBeenCalledOnce()
  })
  it('uses a spoken self-introduction as a candidate when the model attempts recall first, never as confirmation', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice. What did we discuss?')
    const proposal = await p.memory.request(state, request('recall'))
    expect(proposal).toMatchObject({ code: 'memory_confirmation_required', name: 'Alice' })
    await p.memory.input(state, 'question_played', proposal.confirmation!.token, proposal.confirmation!.text)
    expect(p.repository.brief).not.toHaveBeenCalled()
    await p.memory.input(state, 'speech', 'yes', '')
    expect((await p.memory.input(state, 'complete', 'yes', 'yes')).code).toBe('memory_identity_confirmed')
    expect(p.repository.brief).toHaveBeenCalledOnce()
  })
  it('allows an anonymous visitor to choose a temporary encounter without identifying themselves', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'temporary', '')
    await p.memory.input(state, 'complete', 'temporary', 'Let us talk off the record.')
    expect((await p.memory.request(state, request('temporary'))).code).toBe('memory_temporary')
    await p.memory.reset()
    expect((await p.memory.request(state, request('recall'))).code).toBe('memory_disabled')
    expect(p.repository.policy).not.toHaveBeenCalled()
    expect(p.learning.observe).not.toHaveBeenCalled()
  })
  it('loads a bounded brief only after separate confirmation and never exposes an owner ID', async () => {
    const p = setup()
    expect((await p.memory.request(state, request('recall'))).code).toBe('memory_identity_required')
    expect(p.repository.brief).not.toHaveBeenCalled()
    const confirmed = await p.confirm()
    expect(confirmed.entries).toHaveLength(1)
    expect(JSON.stringify(confirmed)).not.toMatch(/owner|profile|Alice/)
    expect(p.learning.observe).not.toHaveBeenCalled()
  })
  it('requires speech-start attribution and completed ordinary evidence, excluding controls', async () => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'start', 'unbound', '')
    await p.memory.input(state, 'complete', 'unbound', 'Synthetic unbound speech')
    await p.memory.input(state, 'settled', 'unbound', '')
    expect(p.learning.observe).not.toHaveBeenCalled()
    await p.memory.input(state, 'speech', 'ordinary', '')
    await p.memory.input(state, 'settled', 'ordinary', '')
    await p.memory.input(state, 'complete', 'ordinary', 'My synthetic exhibition opens tomorrow.')
    expect(p.learning.observe).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice', avatarId: 'raven', itemId: 'ordinary' }))
    await p.memory.input(state, 'speech', 'control', '')
    await p.memory.input(state, 'complete', 'control', 'exact spell')
    await p.memory.input(state, 'settled', 'control', '')
    expect(p.learning.observe).toHaveBeenCalledOnce()
  })
  it('rejects a delayed recall after a new utterance even within the same session', async () => {
    const p = setup(); await p.confirm()
    let finish!: (result: { entries: never[]; incomplete: boolean }) => void
    p.repository.hybridRecall.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = p.memory.request(state, request('recall', { query: 'old discussion' }))
    await vi.waitFor(() => expect(p.repository.hybridRecall).toHaveBeenCalledOnce())
    await p.memory.input(state, 'speech', 'new-turn', '')
    finish({ entries: [], incomplete: false })
    expect((await pending).code).toBe('memory_result_stale')
  })
  it('does not accept a fabricated save without a source request and invalidates work before forgetting', async () => {
    const p = setup(); await p.confirm()
    expect((await p.memory.request(state, request('remember', { topic: 'Tea', text: 'Synthetic' }))).status).toBe('rejected')
    expect(p.repository.save).not.toHaveBeenCalled()
    await p.memory.input(state, 'speech', 'forget', '')
    await p.memory.input(state, 'complete', 'forget', 'Forget my synthetic tea preference.')
    expect((await p.memory.request(state, request('forget', { topic: 'Tea' }))).code).toBe('memory_forgotten')
    expect(p.learning.invalidate).toHaveBeenCalledWith('raven', 'Alice')
    expect((await p.memory.request(state, request('recall'))).code).toBe('memory_clean_session_required')
  })
  it('clears private state and flushes the captured old owner on session end', async () => {
    const p = setup(); await p.confirm()
    p.memory.observe({ ...state, active: false })
    expect(p.learning.flush).toHaveBeenCalled()
    expect((await p.memory.request({ ...state, realtimeSessionId: 'session-b' }, request('recall'))).code).toBe('memory_identity_required')
  })
})
