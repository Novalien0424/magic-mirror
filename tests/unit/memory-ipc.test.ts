import { describe, expect, it, vi } from 'vitest'
import { registerMemoryIpc } from '../../src/main/memory/ipc'
import type { MemoryRepository } from '../../src/main/memory/contracts'

function setup() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  let active = true
  const state = () => ({ active, avatarId: 'fixture-avatar', realtimeSessionId: 'session', sessionGeneration: 1 })
  const store = { save: vi.fn(), list: vi.fn(() => []), hybridRecall: vi.fn(async () => ({ entries: [], incomplete: false })), recall: vi.fn(() => []), names: vi.fn(() => []), forget: vi.fn(() => true),
    policy: vi.fn(async () => ({ mode: 'automatic', epoch: 1, cleanupRequired: false })), brief: vi.fn(async () => []), setCleanupRequired: vi.fn(async () => {}) }
  const reset = vi.fn(async () => undefined), report = vi.fn()
  registerMemoryIpc({ handle: (key, handler) => handlers.set(key, handler), authorize: (event, kind) => event === kind,
    interpret: async input => ({ confirmation: input.task === 'confirmation' ? 'yes' : 'unclear', authorized: true,
      name: input.task === 'introduction' ? 'Synthetic Person' : input.request?.name ?? '', language: 'en' }),
    store: () => store as unknown as MemoryRepository, learning: { observe: vi.fn(async () => {}), flush: vi.fn(async () => {}), invalidate: vi.fn(), exclude: vi.fn() },
    state, canEdit: () => !active, knownAvatar: async id => id === 'fixture-avatar', resetConversation: reset, report })
  const identity = { realtimeSessionId: 'session', sessionGeneration: 1 }
  const call = async (key: string, event: string, value: unknown) => await handlers.get(key)!(event, value) as any
  const request = (action: string, extra = {}) => ({ request: { action, name: '', topic: '', text: '', query: '', ...extra }, identity })
  return { store, reset, report, call, request, identity, dormant: () => { active = false } }
}
describe('memory IPC authorization and lifecycle', () => {
  it('rejects cross-window requests, forged ownership and stale sessions before storage', async () => {
    const p = setup()
    expect((await p.call('mirror:memory', 'console', p.request('recall'))).status).toBe('rejected')
    expect((await p.call('mirror:memory', 'mirror', { ...p.request('recall'), identity: { ...p.identity, sessionGeneration: 2 } })).status).toBe('rejected')
    expect((await p.call('mirror:memory', 'mirror', p.request('identify', { name: 'Fixture', ownerId: 'forged' }))).status).toBe('rejected')
    expect(p.store.recall).not.toHaveBeenCalled()
  })
  it('joins input start and completion, scopes recall in Main and logs only result codes', async () => {
    const p = setup()
    await p.call('mirror:memory-input', 'mirror', { identity: p.identity, phase: 'speech', itemId: 'first', transcript: '' })
    await p.call('mirror:memory-input', 'mirror', { identity: p.identity, phase: 'complete', itemId: 'first', transcript: 'My name is Synthetic Person.' })
    const q = (await p.call('mirror:memory', 'mirror', p.request('identify', { name: 'Synthetic Person' }))).confirmation
    await p.call('mirror:memory-input', 'mirror', { identity: p.identity, phase: 'question_played', itemId: q.token, transcript: q.text })
    expect((await p.call('mirror:memory-input', 'mirror', { identity: p.identity, phase: 'complete', itemId: 'first', transcript: 'yes' })).code).toBe('memory_transcript_duplicate')
    await p.call('mirror:memory-input', 'mirror', { identity: p.identity, phase: 'start', itemId: 'second', transcript: '' })
    await p.call('mirror:memory-input', 'mirror', { identity: p.identity, phase: 'complete', itemId: 'second', transcript: 'yes' })
    await p.call('mirror:memory', 'mirror', p.request('recall', { name: 'Wrong Person', query: 'tea' }))
    expect(p.store.hybridRecall).toHaveBeenCalledWith('fixture-avatar', 'Synthetic Person', 'tea', undefined)
    expect(JSON.stringify(p.report.mock.calls)).not.toMatch(/Synthetic|Wrong|tea/)
    await p.call('mirror:memory-reset', 'mirror', p.identity)
    expect(p.reset).toHaveBeenCalledOnce()
    expect((await p.call('mirror:memory', 'mirror', p.request('recall'))).code).toBe('memory_identity_required')
  })
  it('allows only Console mutations in Dormant for a known avatar', async () => {
    const p = setup(), command = { action: 'save', avatarId: 'fixture-avatar', name: 'Synthetic', topic: 'Tea', text: 'Synthetic tea fact', query: '' }
    expect((await p.call('console:memory', 'mirror', command)).status).toBe('rejected')
    expect((await p.call('console:memory', 'console', command)).code).toBe('memory_end_conversation_first')
    expect(p.store.save).not.toHaveBeenCalled()
    p.dormant()
    expect((await p.call('console:memory', 'console', { ...command, avatarId: 'other' })).code).toBe('memory_avatar_unavailable')
    expect((await p.call('console:memory', 'console', command)).status).toBe('accepted')
    expect(p.store.save).toHaveBeenCalledExactlyOnceWith('fixture-avatar', 'Synthetic', 'Tea', 'Synthetic tea fact')
  })
})
