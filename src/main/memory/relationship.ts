import { MemorySession, type MemoryState } from './session'
import { parseMemoryRequest, type MemoryReply, type MemoryInputPhase, type MemoryMode, MEMORY_CONTEXT_BYTES } from '../../shared/memory'
import type { MemoryRepository, MemoryEmbedder } from './contracts'
import type { MemoryLearning } from './learning'

interface Turn { name: string; avatarId: string; epoch: number; text: string; settled: boolean; control: boolean; observedAt: string; submitted: boolean }
interface Options {
  repository: MemoryRepository
  learning: Pick<MemoryLearning, 'observe' | 'flush' | 'invalidate'>
  embedder?: MemoryEmbedder
  report(reason: string): void
  controlPhrases(): Promise<string[]>
  onChanged?(): void
}
const result = (code: string, status: MemoryReply['status'] = 'accepted'): MemoryReply => ({ code, status })
const normalize = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/[。.!！?？\s]+$/u, '')
const management = /(?:remember|forget|recall|memory|memories|temporary|off the record|don't remember|do not remember|記住|记住|忘記|忘记|記憶|记忆|暫時|临时|別記|别记|不要記|不要记|更正|改正|correct|update my)/iu
const control = /(?:my name is|i am called|call me|我是|我叫|叫我|換人|换人|切換|切换|我們是|我们是|go to sleep|晚安|睡覺|睡觉)/iu
/** Main-only coordinator. Only content/result codes leave this boundary. */
export class RelationshipMemory {
  private readonly identity = new MemorySession({ save: () => {}, recall: () => [], forget: () => false })
  private key = ''
  private turns = new Map<string, Turn>()
  private latest = ''
  private generation = 0
  private blocked = false
  private temporary = false
  private closed = false
  private recalls = new Set<AbortController>()
  private cleanup: { avatarId: string; name: string } | undefined
  constructor(private readonly options: Options) {}
  invalidateLoaded(state: MemoryState, avatarId: string, name: string): boolean {
    this.observe(state)
    if (!state.active || state.avatarId !== avatarId || this.identity.currentOwner(state) !== name) return false
    this.blocked = true; this.generation++; this.cleanup = { avatarId, name }
    for (const abort of this.recalls) abort.abort()
    return true
  }
  observe(state: MemoryState): void {
    const key = state.active ? JSON.stringify([state.avatarId, state.realtimeSessionId, state.sessionGeneration]) : ''
    if (this.key !== key) {
      if (this.key) void this.options.learning.flush()
      this.key = key; this.turns.clear(); this.latest = ''; this.blocked = false; this.generation++
      for (const abort of this.recalls) abort.abort()
      this.identity.reset()
      if (!state.active && (!state.lifecycle || state.lifecycle === 'dormant')) this.temporary = false
    }
    this.identity.observe(state)
  }
  async reset(): Promise<void> {
    this.generation++; this.turns.clear(); this.latest = ''; this.identity.reset(); this.blocked = false
    for (const abort of this.recalls) abort.abort()
    // Reset is called only after the old transport is closed/replacement dispatched.
    if (this.cleanup) {
      const scope = this.cleanup
      await this.options.repository.setCleanupRequired(scope.avatarId, scope.name, false)
      this.cleanup = undefined
    }
  }
  private async finish(itemId: string, turn: Turn): Promise<void> {
    if (turn.submitted || !turn.settled || !turn.text || turn.control || !turn.name || this.temporary) return
    turn.submitted = true
    await this.options.learning.observe({ avatarId: turn.avatarId, name: turn.name, epoch: turn.epoch, itemId,
      text: turn.text, observedAt: turn.observedAt })
  }
  async input(state: MemoryState, phase: MemoryInputPhase, itemId: string, text: string): Promise<MemoryReply> {
    this.observe(state)
    if (!state.active || this.closed) return result('memory_session_unavailable', 'rejected')
    if (phase === 'question_played' || phase === 'question_cancelled') return this.identity.delivery(state, itemId, text, phase === 'question_played')
    if (phase === 'speech') {
      this.generation++; for (const abort of this.recalls) abort.abort()
      const generation = this.generation
      const name = this.identity.currentOwner(state)
      this.identity.turnStart(state, itemId); this.latest = itemId
      if (this.turns.has(itemId)) return result('memory_turn_duplicate')
      if (this.blocked || this.temporary) return result('memory_turn_unowned')
      if (!name) {
        this.turns.clear()
        this.turns.set(itemId, { name: '', avatarId: state.avatarId, epoch: 0, text: '', settled: false, control: true, submitted: false, observedAt: new Date().toISOString() })
        return result('memory_turn_unowned')
      }
      const policy = await this.options.repository.policy(state.avatarId, name)
      if (generation !== this.generation) return result('memory_turn_stale')
      this.turns.set(itemId, { name, avatarId: state.avatarId, epoch: policy.epoch, text: '', settled: false,
        control: policy.cleanupRequired, submitted: false, observedAt: new Date().toISOString() })
      if (this.turns.size > 128) { this.turns.delete(this.turns.keys().next().value!); this.options.report('memory_turn_evicted') }
      return result('memory_turn_observed')
    }
    if (phase === 'start') { this.identity.turnStart(state, itemId); return result('memory_turn_observed') }
    const turn = this.turns.get(itemId)
    if (phase === 'control') {
      if (turn) { turn.control = true; this.options.learning.invalidate(turn.avatarId, turn.name) }
      return result('memory_control_excluded')
    }
    if (phase === 'settled') { if (turn) { turn.settled = true; await this.finish(itemId, turn) }; return result('memory_turn_settled') }
    const confirmed = this.identity.transcript(state, itemId, text)
    if (confirmed.code === 'memory_identity_confirmed') {
      const name = this.identity.currentOwner(state), generation = this.generation
      let policy = await this.options.repository.policy(state.avatarId, name)
      // A newly confirmed clean session has never received private context. Recover a persisted cleanup tombstone.
      if (policy.cleanupRequired) {
        if (generation !== this.generation) return result('memory_result_stale', 'rejected')
        await this.options.repository.setCleanupRequired(state.avatarId, name, false)
        policy = await this.options.repository.policy(state.avatarId, name)
        this.options.onChanged?.()
      }
      const entries = policy.mode === 'off' || this.temporary ? [] : await this.options.repository.brief(state.avatarId, name)
      if (generation !== this.generation || this.identity.currentOwner(state) !== name) return result('memory_result_stale', 'rejected')
      return { ...confirmed, entries, mode: this.temporary ? 'off' : policy.mode, temporary: this.temporary }
    }
    if (turn) {
      if (turn.text) return result('memory_transcript_duplicate')
      const phrases = await this.options.controlPhrases()
      turn.text = text.slice(0, 4000)
      turn.control ||= management.test(text) || control.test(text) || phrases.some(p => normalize(p) === normalize(text))
      if (turn.control) this.options.report('memory_control_excluded')
      if (text.length > 4000) { turn.control = true; this.options.report('memory_evidence_oversized') }
      await this.finish(itemId, turn)
    }
    return confirmed
  }
  async request(state: MemoryState, raw: unknown): Promise<MemoryReply> {
    this.observe(state)
    const request = parseMemoryRequest(raw)
    if (!state.active || this.closed || !request) return result('memory_request_rejected', 'rejected')
    if (this.blocked) return result('memory_clean_session_required', 'rejected')
    if (request.action === 'identify') return this.identity.request(state, request)
    const name = this.identity.currentOwner(state)
    if (this.temporary) return result('memory_disabled', 'rejected')
    if (!name && request.action === 'temporary') {
      const source = this.turns.get(this.latest)
      if (!source?.text || !management.test(source.text)) return result('memory_source_pending', 'rejected')
      this.temporary = true; this.turns.clear(); return result('memory_temporary')
    }
    if (!name) {
      const locked = this.identity.request(state, { action: 'recall', name: '', topic: '', text: '', query: '' })
      if (locked.code === 'memory_identity_required' && request.action === 'recall') {
        const source = this.turns.get(this.latest)
        if (source && !source.text) return result('memory_source_pending', 'rejected')
        // A narrow spoken self-introduction can propose a label, never unlock it.
        const supplied = /^(?:my name is|call me|我叫|請叫我|请叫我)\s*([^.!?。！？,，\n]{1,80})(?:[.!?。！？,，\n]|$)/iu.exec(source?.text.trim() ?? '')?.[1]?.trim()
        if (supplied) return this.identity.request(state, { action: 'identify', name: supplied, topic: '', text: '', query: '' })
      }
      return locked
    }
    const generation = this.generation, avatarId = state.avatarId
    const policy = await this.options.repository.policy(avatarId, name)
    if (policy.cleanupRequired) { this.blocked = true; this.cleanup = { avatarId, name }; return result('memory_clean_session_required', 'rejected') }
    if (generation !== this.generation) return result('memory_result_stale', 'rejected')
    if (request.action === 'recall') {
      if (policy.mode === 'off' || this.temporary) return result('memory_disabled', 'rejected')
      const abort = new AbortController(); this.recalls.add(abort)
      const timer = setTimeout(() => abort.abort(), 1500)
      try {
        let embedding
        if (request.query.trim() && this.options.embedder) {
          try { embedding = await this.options.embedder.embed(request.query, 'query', abort.signal) }
          catch { if (!abort.signal.aborted) this.options.report('memory_semantic_unavailable') }
        }
        if (abort.signal.aborted) return result(generation !== this.generation ? 'memory_result_stale' : 'memory_recall_unavailable', 'rejected')
        const found = await this.options.repository.hybridRecall(avatarId, name, request.query, embedding)
        const current = await this.options.repository.policy(avatarId, name)
        if (generation !== this.generation || current.epoch !== policy.epoch || current.mode === 'off' || current.cleanupRequired) return result('memory_result_stale', 'rejected')
        if (abort.signal.aborted) return result('memory_recall_unavailable', 'failed')
        const entries = [...found.entries]
        while (Buffer.byteLength(JSON.stringify(entries)) > MEMORY_CONTEXT_BYTES) entries.pop()
        return { ...result(entries.length ? 'memory_recalled' : 'memory_no_match'), entries,
          coverage: found.incomplete || !embedding && !!request.query.trim() ? 'incomplete' : 'complete' }
      } finally { clearTimeout(timer); this.recalls.delete(abort) }
    }
    const turn = this.turns.get(this.latest)
    if (!turn?.text || turn.name !== name) return result('memory_source_pending', 'rejected')
    if (!management.test(turn.text)) return { ...result('memory_action_not_requested', 'ignored'), mode: policy.mode }
    turn.control = true
    this.options.learning.invalidate(avatarId, name)
    if (request.action === 'remember') {
      if (policy.mode === 'off' || this.temporary) return result('memory_disabled', 'rejected')
      const existing = await this.options.repository.list(avatarId, name, request.topic)
      if (generation !== this.generation || this.identity.currentOwner(state) !== name) return result('memory_result_stale', 'rejected')
      await this.options.repository.save(avatarId, name, request.topic, request.text)
      this.options.onChanged?.()
      if (!existing.some(entry => normalize(entry.topic) === normalize(request.topic))) return result('memory_saved')
      this.blocked = true; this.cleanup = { avatarId, name }
      await this.options.repository.setCleanupRequired(avatarId, name, true)
      return result('memory_corrected')
    }
    this.blocked = true; this.cleanup = { avatarId, name }
    await this.options.repository.setCleanupRequired(avatarId, name, true)
    if (request.action === 'forget') {
      const removed = await this.options.repository.forget(avatarId, name, request.topic)
      if (!removed) { await this.options.repository.setCleanupRequired(avatarId, name, false); this.blocked = false; this.cleanup = undefined; return result('memory_not_found') }
      this.turns.clear(); return result('memory_forgotten')
    }
    if (request.action === 'temporary') { this.temporary = true; this.turns.clear(); return result('memory_temporary') }
    await this.options.repository.setPolicy(avatarId, name, request.text as MemoryMode)
    this.turns.clear(); return result('memory_policy_changed')
  }
  close(): void { this.closed = true; this.generation++; for (const abort of this.recalls) abort.abort(); this.turns.clear(); this.identity.reset() }
}
