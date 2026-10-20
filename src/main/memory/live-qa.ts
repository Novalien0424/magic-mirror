import { createMemoryRepository } from './repository'
import { MemoryLearning } from './learning'
import { RelationshipMemory } from './relationship'
import type { MemoryEmbedder } from './contracts'
import type { MemoryExtractor } from './extractor'

/** Isolated synthetic real-provider contract check. Only case names/boolean outcomes leave Main. */
export async function runMemoryLiveQa(options: { path: string; model: string; extract: MemoryExtractor; embedder: MemoryEmbedder; evidence(step: string): void }): Promise<void> {
  let repository = createMemoryRepository(options.path)
  let learning: MemoryLearning | undefined
  let step = 'memory_live_extraction'
  let learningReason = 'not_started'
  const check = (condition: boolean) => { if (!condition) throw Error('phase4_qa_' + step); options.evidence(step) }
  try {
    learning = new MemoryLearning({ repository, extract: async (input, signal) => {
      try { return await options.extract(input, signal) } catch (error) {
        learningReason = error instanceof Error && ['memory_extraction_invalid', 'memory_extraction_unavailable'].includes(error.message) ? error.message : 'extract_failed'
        throw error
      }
    }, model: async () => options.model, report: reason => { if (!learningReason.startsWith('memory_extraction_')) learningReason = reason } })
    await learning.observe({ avatarId: 'raven-synthetic', name: 'Synthetic Guest', itemId: 'synthetic-turn',
      text: 'For our art exhibition, I decided to use soft warm lighting so visitors can see the paintings without harsh glare. This is our final lighting plan.', observedAt: new Date().toISOString() })
    await learning.flush()
    const entries = await repository.list('raven-synthetic', 'Synthetic Guest')
    if (!entries.length) throw Error('phase4_qa_memory_live_extraction_' + learningReason)
    check(entries.every(e => e.text.length <= 1000))
    step = 'memory_live_local_index'
    const pending = await repository.pendingIndex(options.embedder.version, 16)
    for (const record of pending) {
      const vector = await options.embedder.embed(`${record.entry.topic}: ${record.entry.text}`, 'document')
      await repository.setEmbedding(record.avatarId, record.name, record.entry.id, record.revision, vector)
    }
    check((await repository.pendingIndex(options.embedder.version, 16)).length === 0)
    step = 'memory_live_restart'
    await learning.close(); await repository.close()
    repository = createMemoryRepository(options.path)
    check((await repository.list('raven-synthetic', 'Synthetic Guest')).length === entries.length)
    learning = new MemoryLearning({ repository, extract: options.extract, model: async () => options.model, report: () => {} })
    const session = new RelationshipMemory({ repository, learning, embedder: options.embedder, report: () => {}, controlPhrases: async () => [] })
    const state = { active: true, avatarId: 'raven-synthetic', realtimeSessionId: 'synthetic-session', sessionGeneration: 1 }
    const recall = { action: 'recall', name: '', topic: '', text: '', query: '怎樣讓展出的作品看起來舒服、不刺眼？' }
    step = 'memory_live_locked_before_confirmation'
    check((await session.request(state, recall)).code === 'memory_identity_required')
    await session.request(state, { ...recall, action: 'identify', name: 'Synthetic Guest', query: '' })
    await session.input(state, 'speech', 'confirm', '')
    const confirmed = await session.input(state, 'complete', 'confirm', 'yes')
    step = 'memory_live_confirmed_brief'; check(!!confirmed.entries?.length)
    step = 'memory_live_cross_language_recall'
    const found = await session.request(state, recall)
    check(found.code === 'memory_recalled' && !!found.entries?.some(e => entries.some(original => original.id === e.id)))
    step = 'memory_live_guest_avatar_isolation'
    const query = await options.embedder.embed(recall.query, 'query')
    check((await repository.hybridRecall('owl-synthetic', 'Synthetic Guest', recall.query, query)).entries.length === 0
      && (await repository.hybridRecall('raven-synthetic', 'Other Guest', recall.query, query)).entries.length === 0)
    step = 'memory_live_forget'
    for (const entry of entries) await repository.forget('raven-synthetic', 'Synthetic Guest', entry.topic)
    await repository.setCleanupRequired('raven-synthetic', 'Synthetic Guest', false)
    check((await repository.hybridRecall('raven-synthetic', 'Synthetic Guest', recall.query, query)).entries.length === 0)
    session.close()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('phase4_qa_memory_')) throw error
    throw Error('phase4_qa_' + step)
  } finally { await learning?.close(); await repository.close() }
}
