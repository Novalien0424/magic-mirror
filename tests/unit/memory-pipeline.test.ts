import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect } from 'vitest'
import { MemoryStore } from '../../src/main/memory/store'
import { MemoryImporter } from '../../src/main/memory/import'
import { MemoryLearning } from '../../src/main/memory/learning'
import { RelationshipMemory } from '../../src/main/memory/relationship'
import type { MemoryRepository } from '../../src/main/memory/contracts'

const asyncStore = (store: MemoryStore) => new Proxy(store, { get(target, key) {
  const value = Reflect.get(target, key)
  return typeof value === 'function' ? async (...args: unknown[]) => value.apply(target, args) : value
} }) as unknown as MemoryRepository

describe('memory pipeline with real private SQLite', () => {
  it('imports a large mixed document as summaries, reloads, confirms, recalls, isolates, corrects and forgets', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-pipeline-'))
    const path = join(directory, 'memory.sqlite')
    let store = new MemoryStore(path)
    try {
      let sequence = 0
      const repository = asyncStore(store)
      await repository.setPolicy('raven', 'Synthetic Person', 'explicit')
      const importer = new MemoryImporter({ repository, model: async () => 'configured', canRun: () => true, report: () => {},
        extract: async () => [{ topic: `episode-${++sequence}`, text: `Distilled outcome ${sequence}.`, kind: 'episode', state: 'active', eventAt: '', sources: [], expectedRevision: null, keepInMind: false }] })
      const staged = importer.stage('raven', 'Synthetic Person', '# Persona\nSynthetic persona stays separate.\n# History\n' + 'RAW_SOURCE_MARKER synthetic historical conversation.\n'.repeat(21000))
      expect(staged.chunks).toBeGreaterThan(80)
      importer.start(); await importer.idle()
      expect(importer.status()).toMatchObject({ state: 'complete', processed: staged.chunks, saved: staged.chunks })
      store.close(); store = new MemoryStore(path)
      expect(readFileSync(path).includes(Buffer.from('RAW_SOURCE_MARKER'))).toBe(false)
      expect(readFileSync(path).includes(Buffer.from('Synthetic persona stays separate'))).toBe(false)
      const reopened = asyncStore(store)
      const learning = new MemoryLearning({ repository: reopened, extract: async () => [], model: async () => 'configured', report: () => {} })
      const relationship = new RelationshipMemory({ repository: reopened, learning, report: () => {}, controlPhrases: async () => ['EXACT SPELL'],
        interpret: async input => ({ confirmation: input.task === 'confirmation' ? 'yes' : 'unclear', authorized: true,
          name: input.task === 'introduction' ? 'SyntheticPerson' : input.request?.name ?? '', language: 'en' }) })
      const state = { active: true, avatarId: 'raven', realtimeSessionId: 'session-one', sessionGeneration: 1 }
      const request = (action: any, extra = {}) => ({ action, name: '', topic: '', text: '', query: '', ...extra })
      expect((await relationship.request(state, request('recall'))).code).toBe('memory_identity_required')
      await relationship.input(state, 'speech', 'intro', '')
      await relationship.input(state, 'complete', 'intro', 'My name is Synthetic Person.')
      const q = (await relationship.request(state, request('identify', { name: 'Synthetic Person' }))).confirmation!
      expect(q.text.toLowerCase()).toContain('synthetic person')
      await relationship.input(state, 'question_played', q.token, q.text)
      await relationship.input(state, 'speech', 'confirm', '')
      const confirmed = await relationship.input(state, 'complete', 'confirm', 'yes')
      expect(confirmed.entries?.length).toBeGreaterThan(0)
      expect((await relationship.request(state, request('recall', { query: 'Distilled' }))).entries?.length).toBeGreaterThan(0)
      expect(await reopened.recall('owl', 'Synthetic Person', 'Distilled')).toEqual([])
      expect(await reopened.recall('raven', 'Other Person', 'Distilled')).toEqual([])
      await relationship.input(state, 'speech', 'correction', '')
      await relationship.input(state, 'complete', 'correction', 'Remember the corrected outcome.')
      expect((await relationship.request(state, request('remember', { topic: 'episode-1', text: 'Corrected outcome.' }))).code).toBe('memory_corrected')
      expect((await relationship.request(state, request('recall'))).code).toBe('memory_clean_session_required')
      await relationship.reset()
      await reopened.forget('raven', 'Synthetic Person', 'episode-1')
      await reopened.setCleanupRequired('raven', 'Synthetic Person', false)
      expect(await reopened.recall('raven', 'Synthetic Person', 'Corrected')).toEqual([])
      relationship.close(); await learning.close()
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('guards independent source revisions and accepts unknown dates without inventing them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-source-'))
    const store = new MemoryStore(join(directory, 'memory.sqlite'))
    try {
      const source = store.save('raven', 'Alice', 'source', 'Original source.')
      const epoch = store.policy('raven', 'Alice').epoch
      const record = { topic: 'derived', text: 'Derived summary.', kind: 'episode' as const, state: 'active' as const, eventAt: '', sources: ['source'], expectedRevision: null, keepInMind: false }
      expect(store.commitLearning('raven', 'Alice', { operationId: 'bad', epoch, records: [record] })).toBe('stale')
      expect(store.commitLearning('raven', 'Alice', { operationId: 'good', epoch, records: [record], sourceRevisions: { source: source.revision! } })).toBe('committed')
      expect(store.list('raven', 'Alice').find(e => e.topic === 'derived')?.eventAt).toBe('')
      store.forget('raven', 'Alice', 'source')
      expect(store.list('raven', 'Alice')).toEqual([])
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('accepts measured semantic similarity and ranks semantic relevance before unrelated exact keywords', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-ranking-'))
    const store = new MemoryStore(join(directory, 'memory.sqlite'))
    try {
      const semantic = store.save('raven', 'Alice', 'exhibit', 'Warm light avoids glare.')
      const keyword = store.save('raven', 'Alice', 'exact keyword', 'Unrelated synthetic content.')
      store.setEmbedding('raven', 'Alice', semantic.id, semantic.revision!, { version: 'fixture', values: [0.61, Math.sqrt(1 - 0.61 ** 2)] })
      store.setEmbedding('raven', 'Alice', keyword.id, keyword.revision!, { version: 'fixture', values: [0.17, -Math.sqrt(1 - 0.17 ** 2)] })
      expect(store.hybridRecall('raven', 'Alice', 'exact keyword', { version: 'fixture', values: [1, 0] }).entries[0]?.id).toBe(semantic.id)
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
  })
})
