import { describe, it, expect, vi } from 'vitest'
import { RelationshipMemory } from '../../src/main/memory/relationship'
import type { MemoryRepository, MemoryEmbedder } from '../../src/main/memory/contracts'
import type { MemoryIntentInput, MemoryIntentResult } from '../../src/main/memory/intent'
const state = { active: true, avatarId: 'raven', realtimeSessionId: 'session-a', sessionGeneration: 1 }
const request = (action: string, extra = {}) => ({ action, name: '', topic: '', text: '', query: '', ...extra })
function setup(embedder?: MemoryEmbedder) {
  let mode = 'automatic', epoch = 1
  const repository = {
    names: vi.fn(async (): Promise<string[]> => []),
    policy: vi.fn(async () => ({ mode, epoch, cleanupRequired: false })),
    brief: vi.fn(async () => [{ id: 'record', topic: 'Exhibition', text: 'Synthetic exhibition is upcoming.', updatedAt: '2026-10-05' }]),
    hybridRecall: vi.fn(async () => ({ entries: [], incomplete: false })),
    list: vi.fn(async () => []),
    save: vi.fn(async () => { epoch++; return { id: 'saved' } }), forget: vi.fn(async () => { epoch++; return true }),
    setPolicy: vi.fn(async (_a, _n, value) => { mode = value; return { mode, epoch: ++epoch, cleanupRequired: false } }),
    setCleanupRequired: vi.fn(async () => {}),
  }
  const learning = { observe: vi.fn(async (_item: { observedAt: string }) => {}), flush: vi.fn(async () => {}), invalidate: vi.fn(), exclude: vi.fn() }, report = vi.fn()
  // Stub semantic decisions; these tests prove application boundaries, not model accuracy.
  const interpret = vi.fn(async (input: MemoryIntentInput): Promise<MemoryIntentResult> => ({
    confirmation: input.task === 'confirmation' ? 'yes' : 'unclear', language: 'en',
    authorized: input.task === 'introduction' || input.request?.action === 'identify' || input.request?.action === 'forget' || input.request?.action === 'temporary',
    name: input.task === 'introduction' || input.request?.action === 'identify' ? 'Alice' : '',
  }))
  const memory = new RelationshipMemory({ repository: repository as unknown as MemoryRepository, learning, report, interpret, embedder, controlPhrases: async () => ['exact spell'] })
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
  it.each(['identify', 'recall'])('proposes a unique stored spacing variant through %s without loading private facts', async action => {
    const p = setup(); p.repository.names.mockResolvedValue(['Alice Smith', 'Unrelated Person'])
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is AliceSmith.')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: 'AliceSmith', language: 'en' })
    const proposal = await p.memory.request(state, request(action, { name: action === 'identify' ? 'AliceSmith' : '' }))
    expect(proposal).toMatchObject({ code: 'memory_confirmation_required', name: 'Alice Smith' })
    expect(p.repository.names).toHaveBeenCalledWith('raven')
    expect(p.repository.brief).not.toHaveBeenCalled()
    expect(p.repository.hybridRecall).not.toHaveBeenCalled()
  })
  it.each([
    [['AliceSmith', 'Alice Smith'], 'AliceSmith', 'AliceSmith'],
    [['Alyce Smith'], 'AliceSmith', 'AliceSmith'],
    [['AliceSmith', 'AliceSmith.'], 'AliceSmith.', 'AliceSmith.'],
  ] as const)('prefers exact labels and never guesses between formatting candidates or changes letters %#', async (names, supplied, expected) => {
    const p = setup(); p.repository.names.mockResolvedValue([...names])
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is AliceSmith.')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: supplied, language: 'en' })
    expect(await p.memory.request(state, request('identify', { name: supplied })))
      .toMatchObject({ code: 'memory_confirmation_required', name: expected })
    expect(p.repository.brief).not.toHaveBeenCalled()
  })
  it('drops a delayed formatting candidate after a session change', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice.')
    let finish!: (names: string[]) => void
    p.repository.names.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = p.memory.request(state, request('identify', { name: 'Alice' }))
    await vi.waitFor(() => expect(p.repository.names).toHaveBeenCalledOnce())
    p.memory.observe({ ...state, realtimeSessionId: 'replacement' })
    finish(['Alice'])
    expect((await pending).code).toBe('memory_result_stale')
    expect(p.repository.brief).not.toHaveBeenCalled()
  })
  it('derives a candidate from Main introduction when the audio model spells the name differently', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice.')
    const proposal = await p.memory.request(state, request('identify', { name: 'Alyce' }))
    expect(p.interpret).toHaveBeenLastCalledWith({ task: 'introduction', text: 'My name is Alice.' }, expect.any(AbortSignal))
    expect(proposal).toMatchObject({ code: 'memory_confirmation_required', name: 'Alice' })
    expect(p.repository.brief).not.toHaveBeenCalled()
    await p.memory.input(state, 'question_played', proposal.confirmation!.token, proposal.confirmation!.text)
    expect(p.repository.brief).not.toHaveBeenCalled()
    await p.memory.input(state, 'speech', 'answer', '')
    expect((await p.memory.input(state, 'complete', 'answer', "That's me.")).code).toBe('memory_identity_confirmed')
    expect(p.repository.brief).toHaveBeenCalledWith('raven', 'Alice')
  })
  it('ignores a fabricated identify name when the visitor did not introduce themselves', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'story', '')
    await p.memory.input(state, 'complete', 'story', 'Alice is my neighbor.')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: false, name: '', language: 'en' })
    expect((await p.memory.request(state, request('identify', { name: 'Alice' }))).code).toBe('memory_action_not_requested')
    expect(p.repository.brief).not.toHaveBeenCalled()
    expect(p.repository.save).not.toHaveBeenCalled()
  })
  it('rejects an introduction result after newer visitor speech', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice.')
    let finish!: (value: MemoryIntentResult) => void
    p.interpret.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = p.memory.request(state, request('identify', { name: 'Alyce' }))
    await p.memory.input(state, 'speech', 'correction', '')
    finish({ confirmation: 'unclear', authorized: true, name: 'Alice', language: 'en' })
    expect((await pending).code).toBe('memory_result_stale')
    expect(p.repository.brief).not.toHaveBeenCalled()
  })
  it.each([
    ['Alice', 'Unrelated tool name', 'memory_identity_confirmed'],
    ['Bob', 'Alice', 'memory_clean_session_required'],
  ])('uses the Main-derived %s candidate for an already confirmed owner', async (name, toolName, code) => {
    const p = setup(); await p.confirm(); p.repository.brief.mockClear()
    await p.memory.input(state, 'speech', 'next-intro', '')
    await p.memory.input(state, 'complete', 'next-intro', `My name is ${name}.`)
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name, language: 'en' })
    const result = await p.memory.request(state, request('identify', { name: toolName }))
    expect(result.code).toBe(code)
    expect(result.confirmation).toBeUndefined()
    expect(p.learning.exclude).toHaveBeenCalledWith('raven', 'Alice', 'next-intro')
    expect(p.repository.brief).not.toHaveBeenCalled()
    if (name !== 'Alice') expect((await p.memory.request(state, request('recall'))).code).toBe('memory_clean_session_required')
  })
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
  it.each([1, 2])('retains committed correction cleanup after a new utterance (revision %i)', async revision => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'speech', 'correction', '')
    await p.memory.input(state, 'complete', 'correction', 'Keep the updated preference: mint tea.')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: '', language: 'en' })
    let finish!: (entry: { id: string; revision: number }) => void
    p.repository.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = p.memory.request(state, request('remember', { topic: 'Tea', text: 'Prefers mint tea.' }))
    await vi.waitFor(() => expect(p.repository.save).toHaveBeenCalledOnce())
    await p.memory.input(state, 'speech', 'new-turn', '')
    finish({ id: 'saved', revision })
    expect(await pending).toMatchObject({ code: revision === 2 ? 'memory_corrected' : 'memory_result_stale' })
    if (revision === 2) {
      expect(p.repository.setCleanupRequired).toHaveBeenCalledWith('raven', 'Alice', true)
      expect((await p.memory.request(state, request('recall'))).code).toBe('memory_clean_session_required')
      await p.memory.reset()
      expect(p.repository.setCleanupRequired).toHaveBeenLastCalledWith('raven', 'Alice', false)
    } else expect(p.repository.setCleanupRequired).not.toHaveBeenCalled()
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
  it.each(['timeout', 'http', 'schema', 'cancelled', 'PRIVATE FIXTURE'])('cancels an unavailable confirmation without interpreting failure as ambiguity: %s', async cause => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice.')
    const q = (await p.memory.request(state, request('identify', { name: 'Alice' }))).confirmation!
    await p.memory.input(state, 'question_played', q.token, q.text)
    await p.memory.input(state, 'speech', 'answer', '')
    p.interpret.mockRejectedValueOnce(Error(cause === 'PRIVATE FIXTURE' ? cause : `memory_interpretation_${cause}`))
    expect(await p.memory.input(state, 'complete', 'answer', 'yes')).toEqual({ status: 'failed', code: 'memory_confirmation_unavailable' })
    expect(p.report).toHaveBeenCalledWith(cause === 'PRIVATE FIXTURE' ? 'memory_interpretation_unavailable' : `memory_interpretation_${cause}`)
    await p.memory.input(state, 'speech', 'late-answer', '')
    expect((await p.memory.input(state, 'complete', 'late-answer', 'yes')).code).toBe('memory_no_pending_confirmation')
    expect(p.repository.brief).not.toHaveBeenCalled()
    expect(p.repository.policy).not.toHaveBeenCalled()
    expect(JSON.stringify(p.report.mock.calls)).not.toContain('PRIVATE')
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

  it.each([false, true])('clears temporary mode on active → suspending → dormant for the next encounter (owned=%s)', async owned => {
    const p = setup()
    if (owned) await p.confirm()
    await p.memory.input(state, 'speech', 'temporary', '')
    await p.memory.input(state, 'complete', 'temporary', 'Let us talk off the record.')
    expect((await p.memory.request(state, request('temporary'))).code).toBe('memory_temporary')
    await p.memory.reset()
    expect((await p.memory.request(state, request('recall'))).code).toBe('memory_disabled')
    p.memory.observe({ ...state, active: false, lifecycle: 'suspending' })
    p.memory.observe({ ...state, active: false, lifecycle: 'dormant' })
    const confirmed = await p.confirm()
    expect(confirmed).toMatchObject({ code: 'memory_identity_confirmed', temporary: false, mode: 'automatic' })
    await p.memory.input(state, 'speech', 'ordinary-next-visitor', '')
    await p.memory.input(state, 'complete', 'ordinary-next-visitor', 'Synthetic ordinary evidence.')
    await p.memory.input(state, 'settled', 'ordinary-next-visitor', '')
    expect(p.learning.observe).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'ordinary-next-visitor' }))
  })

  it('captures Taiwan-local observation time at speech onset, before a later midnight-crossing policy reply', async () => {
    const p = setup(); await p.confirm()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-09T16:30:00Z'))
      let finish!: (policy: { mode: string; epoch: number; cleanupRequired: boolean }) => void
      p.repository.policy.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      const speech = p.memory.input(state, 'speech', 'relative-day', '')
      vi.setSystemTime(new Date('2026-10-10T16:30:00Z'))
      finish({ mode: 'automatic', epoch: 1, cleanupRequired: false }); await speech
      await p.memory.input(state, 'complete', 'relative-day', 'Tomorrow is the planned visit.')
      await p.memory.input(state, 'settled', 'relative-day', '')
      expect(p.learning.observe).toHaveBeenCalledWith(expect.objectContaining({ observedAt: '2026-10-10T00:30:00.000+08:00' }))
      expect(Date.parse(p.learning.observe.mock.calls[0][0].observedAt)).toBe(Date.parse('2026-10-09T16:30:00Z'))
    } finally { vi.useRealTimers() }
  })

  it.each(['identify', 'recall'])('proposes the unique stored Traditional label through %s, then waits for spoken confirmation', async action => {
    const p = setup(); p.repository.names.mockResolvedValue(['陳小華'])
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is 陈小华.')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: '陈小华', language: 'zh-TW' })
    const proposal = await p.memory.request(state, request(action, { name: '陈小华' }))
    expect(proposal).toMatchObject({ code: 'memory_confirmation_required', name: '陳小華' })
    expect(p.repository.brief).not.toHaveBeenCalled()
    expect(p.repository.policy).not.toHaveBeenCalled()
    expect(JSON.stringify(p.report.mock.calls)).not.toMatch(/陳|陈|raven/)
    await p.memory.input(state, 'question_played', proposal.confirmation!.token, proposal.confirmation!.text)
    await p.memory.input(state, 'speech', 'answer', '')
    await p.memory.input(state, 'complete', 'answer', 'yes')
    expect(p.repository.brief).toHaveBeenCalledWith('raven', '陳小華')
  })
  it.each([
    [['發', '髮'], '发'],
    [['Alice Smith', 'Ali ceSmith'], 'AliceSmith'],
  ])('does not guess or create a scope when folded candidates are ambiguous %#', async (names, supplied) => {
    const p = setup(); p.repository.names.mockResolvedValue(names as string[])
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'Synthetic self-introduction')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: supplied as string, language: 'zh-TW' })
    expect(await p.memory.request(state, request('identify', { name: supplied }))).toEqual({ status: 'rejected', code: 'memory_identity_name_ambiguous' })
    expect(p.report).toHaveBeenCalledWith('memory_identity_name_ambiguous')
    expect(p.repository.brief).not.toHaveBeenCalled()
    expect(p.repository.policy).not.toHaveBeenCalled()
    expect(p.repository.save).not.toHaveBeenCalled()
  })
  it('preserves an exact stored script label when another existing owner folds to it', async () => {
    const p = setup(); p.repository.names.mockResolvedValue(['陳小華', '陈小华'])
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'Synthetic self-introduction')
    p.interpret.mockResolvedValueOnce({ confirmation: 'unclear', authorized: true, name: '陈小华', language: 'zh-TW' })
    expect(await p.memory.request(state, request('identify', { name: '陈小华' }))).toMatchObject({ code: 'memory_confirmation_required', name: '陈小华' })
    expect(p.repository.brief).not.toHaveBeenCalled()
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
  it('excludes only a control item and preserves earlier eligible learning before flush', async () => {
    const p = setup(); await p.confirm()
    await p.memory.input(state, 'speech', 'ordinary', '')
    await p.memory.input(state, 'complete', 'ordinary', 'My synthetic exhibition opens tomorrow.')
    await p.memory.input(state, 'settled', 'ordinary', '')
    await p.memory.input(state, 'speech', 'media-control', '')
    await p.memory.input(state, 'complete', 'media-control', 'Play the fixture music.')
    await p.memory.input(state, 'control', 'media-control', '')
    await p.memory.input(state, 'settled', 'media-control', '')
    expect(p.learning.exclude).toHaveBeenCalledWith('raven', 'Alice', 'media-control')
    expect(p.learning.invalidate).not.toHaveBeenCalled()
    expect(p.learning.observe).toHaveBeenCalledOnce()
    p.memory.observe({ ...state, active: false })
    expect(p.learning.flush).toHaveBeenCalledOnce()
  })
  it.each(['timeout', 'stale'] as const)('falls back after semantic timeout but never after stale-turn cancellation: %s', async cause => {
    const embed = vi.fn(async (_text: string, _purpose: 'query' | 'document', signal?: AbortSignal): Promise<never> => new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(Error('PRIVATE FIXTURE')), { once: true })
    }))
    const p = setup({ version: 'configured-local', embed, close: async () => {} }); await p.confirm()
    p.repository.hybridRecall.mockResolvedValueOnce({ entries: [{ id: 'keyword-hit', topic: 'Tea', text: 'Synthetic tea preference', updatedAt: '' }], incomplete: true } as any)
    vi.useFakeTimers()
    try {
      const pending = p.memory.request(state, request('recall', { query: 'tea' }))
      await vi.advanceTimersByTimeAsync(0)
      expect(embed).toHaveBeenCalledOnce()
      if (cause === 'stale') await p.memory.input(state, 'speech', 'replacement', '')
      else await vi.advanceTimersByTimeAsync(1501)
      const found = await pending
      if (cause === 'timeout') {
        expect(found).toMatchObject({ status: 'accepted', code: 'memory_recalled', coverage: 'incomplete', entries: [{ id: 'keyword-hit' }] })
        expect(p.repository.hybridRecall).toHaveBeenCalledWith('raven', 'Alice', 'tea', undefined)
        expect(p.report).toHaveBeenCalledWith('memory_semantic_timeout')
      } else {
        expect(found.code).toBe('memory_result_stale')
        expect(p.repository.hybridRecall).not.toHaveBeenCalled()
      }
      expect(JSON.stringify(p.report.mock.calls)).not.toContain('PRIVATE')
    } finally { vi.useRealTimers() }
  })
  it('bounds semantic and keyword waits even when an adapter ignores cancellation', async () => {
    const embed = vi.fn(() => new Promise<never>(() => {}))
    const p = setup({ version: 'configured-local', embed, close: async () => {} }); await p.confirm()
    p.repository.hybridRecall.mockImplementation(() => new Promise(() => {}))
    vi.useFakeTimers()
    try {
      const pending = p.memory.request(state, request('recall', { query: 'tea' }))
      await vi.advanceTimersByTimeAsync(1501)
      expect(p.repository.hybridRecall).toHaveBeenCalledWith('raven', 'Alice', 'tea', undefined)
      await vi.advanceTimersByTimeAsync(1501)
      expect(await pending).toEqual({ status: 'failed', code: 'memory_recall_unavailable', coverage: 'unavailable' })
      expect(p.report).toHaveBeenCalledWith('memory_semantic_timeout')
    } finally { vi.useRealTimers() }
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
