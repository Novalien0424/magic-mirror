import { describe, it, expect, vi } from 'vitest'
import { RelationshipMemory } from '../../src/main/memory/relationship'
import type { MemoryRepository } from '../../src/main/memory/contracts'
const state = { active: true, avatarId: 'raven', realtimeSessionId: 'session-a', sessionGeneration: 1 }
const request = (action: string, extra = {}) => ({ action, name: '', topic: '', text: '', query: '', ...extra })
function setup() {
  let mode = 'automatic', epoch = 1
  const repository = {
    policy: vi.fn(async () => ({ mode, epoch, cleanupRequired: false })),
    brief: vi.fn(async () => [{ id: 'record', topic: 'Exhibition', text: 'Synthetic exhibition is upcoming.', updatedAt: '2026-10-05' }]),
    hybridRecall: vi.fn(async () => ({ entries: [], incomplete: false })),
    save: vi.fn(async () => { epoch++; return { id: 'saved' } }), forget: vi.fn(async () => { epoch++; return true }),
    setPolicy: vi.fn(async (_a, _n, value) => { mode = value; return { mode, epoch: ++epoch, cleanupRequired: false } }),
    setCleanupRequired: vi.fn(async () => {}),
  }
  const learning = { observe: vi.fn(async () => {}), flush: vi.fn(async () => {}), invalidate: vi.fn() }, report = vi.fn()
  const memory = new RelationshipMemory({ repository: repository as unknown as MemoryRepository, learning, report, controlPhrases: async () => ['exact spell'] })
  const confirm = async () => {
    await memory.request(state, request('identify', { name: 'Alice' }))
    await memory.input(state, 'speech', 'confirmation', '')
    return memory.input(state, 'complete', 'confirmation', 'yes')
  }
  return { repository, learning, memory, confirm, report }
}
describe('Realtime relationship memory integration', () => {
  it('uses a spoken self-introduction as a candidate when the model attempts recall first, never as confirmation', async () => {
    const p = setup()
    await p.memory.input(state, 'speech', 'intro', '')
    await p.memory.input(state, 'complete', 'intro', 'My name is Alice. What did we discuss?')
    expect(await p.memory.request(state, request('recall'))).toMatchObject({ code: 'memory_confirmation_required', name: 'Alice' })
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
