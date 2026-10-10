import { MemorySession, type MemoryState } from './session'
import { parseMemoryRequest, type MemoryReply, type MemoryInputPhase, type MemoryMode, MEMORY_CONTEXT_BYTES } from '../../shared/memory'
import type { MemoryRepository, MemoryEmbedder } from './contracts'
import type { MemoryLearning } from './learning'
import { memoryInterpretationFailure, type MemoryInterpreter, type MemoryIntentInput, type MemoryIntentResult } from './intent'
import { venueObservedAt } from './calendar'
import { Converter } from 'opencc-js/t2cn'

// Candidate lookup only: storage keys and existing owner scopes never change.
// Traditional variants may collapse, so only a unique candidate can be proposed.
let foldScript: ReturnType<typeof Converter> | undefined
const nameKey = (value: string): string => (foldScript ??= Converter({ from: 't', to: 'cn' }))(value)
  .normalize('NFKC').trim().toLowerCase().replace(/\s/gu, '')

interface Turn { name: string; avatarId: string; epoch: number; text: string; settled: boolean; control: boolean; observedAt: string; submitted: boolean }
interface Options {
  repository: MemoryRepository
  learning: Pick<MemoryLearning, 'observe' | 'flush' | 'invalidate' | 'exclude'>
  embedder?: MemoryEmbedder
  interpret?: MemoryInterpreter
  report(reason: string): void
  controlPhrases(): Promise<string[]>
  onChanged?(): void
}
const result = (code: string, status: MemoryReply['status'] = 'accepted'): MemoryReply => ({ code, status })
const normalize = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/[。.!！?？\s]+$/u, '')
async function untilAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(Error('memory_operation_cancelled'))
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([operation, cancelled]) }
  finally { signal.removeEventListener('abort', onAbort) }
}
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
  private async interpret(input: MemoryIntentInput): Promise<MemoryIntentResult | undefined> {
    const abort = new AbortController(); this.recalls.add(abort)
    try {
      if (!this.options.interpret) throw Error()
      const result = await this.options.interpret(input, abort.signal)
      if (abort.signal.aborted) throw Error('memory_interpretation_cancelled')
      return result
    } catch (error) { this.options.report(abort.signal.aborted ? 'memory_interpretation_cancelled' : memoryInterpretationFailure(error)); return undefined }
    finally { this.recalls.delete(abort) }
  }
  private async candidateName(avatarId: string, supplied: string): Promise<string | undefined> {
    // Spoken spacing is not stable across ASR turns. Resolve only a unique
    // formatting candidate in Main; never merge records or load its facts.
    const canonical = (value: string) => value.normalize('NFKC').trim().toLowerCase()
    const names = await this.options.repository.names(avatarId), name = canonical(supplied)
    const exact = names.find(existing => canonical(existing) === name)
    if (exact) return exact
    const folded = nameKey(supplied)
    const candidates = names.filter(existing => nameKey(existing) === folded)
    if (candidates.length > 1) { this.options.report('memory_identity_name_ambiguous'); return undefined }
    if (names.length && !candidates.length) this.options.report('memory_identity_name_unmatched')
    return candidates.length === 1 ? candidates[0]! : supplied
  }
  invalidateLoaded(state: MemoryState, avatarId: string, name: string): boolean {
    this.observe(state)
    if (!state.active || state.avatarId !== avatarId || this.identity.currentOwner(state) !== name) return false
    this.blocked = true; this.generation++; this.cleanup = { avatarId, name }
    for (const abort of this.recalls) abort.abort()
    return true
  }
  observe(state: MemoryState): void {
    if (!state.active) this.temporary = false
    const key = state.active ? JSON.stringify([state.avatarId, state.realtimeSessionId, state.sessionGeneration]) : ''
    if (this.key !== key) {
      if (this.key) void this.options.learning.flush()
      this.key = key; this.turns.clear(); this.latest = ''; this.blocked = false; this.generation++
      for (const abort of this.recalls) abort.abort()
      this.identity.reset()
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
      const observedAt = venueObservedAt()
      this.identity.turnStart(state, itemId); this.latest = itemId
      if (this.turns.has(itemId)) return result('memory_turn_duplicate')
      if (this.blocked || this.temporary) return result('memory_turn_unowned')
      if (!name) {
        this.turns.clear()
        this.turns.set(itemId, { name: '', avatarId: state.avatarId, epoch: 0, text: '', settled: false, control: true, submitted: false, observedAt })
        return result('memory_turn_unowned')
      }
      const policy = await this.options.repository.policy(state.avatarId, name)
      if (generation !== this.generation) return result('memory_turn_stale')
      this.turns.set(itemId, { name, avatarId: state.avatarId, epoch: policy.epoch, text: '', settled: false,
        control: policy.cleanupRequired, submitted: false, observedAt })
      if (this.turns.size > 128) { this.turns.delete(this.turns.keys().next().value!); this.options.report('memory_turn_evicted') }
      return result('memory_turn_observed')
    }
    if (phase === 'start') { this.identity.turnStart(state, itemId); return result('memory_turn_observed') }
    const turn = this.turns.get(itemId)
    if (phase === 'control') {
      if (turn) { turn.control = true; this.options.learning.exclude(turn.avatarId, turn.name, itemId) }
      return result('memory_control_excluded')
    }
    if (phase === 'settled') { if (turn) { turn.settled = true; await this.finish(itemId, turn) }; return result('memory_turn_settled') }
    const question = this.identity.confirmation(state, itemId), generation = this.generation
    const judgment = question ? await this.interpret({ task: 'confirmation', text, question: question.text }) : undefined
    if (generation !== this.generation) return result('memory_result_stale', 'rejected')
    if (question && !judgment) {
      this.identity.delivery(state, question.token, '', false)
      return result('memory_confirmation_unavailable', 'failed')
    }
    const confirmed = this.identity.transcript(state, itemId, text, question
      ? { token: question.token, decision: judgment!.confirmation } : undefined)
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
      // Actual application controls are excluded here. The background extractor
      // interprets other control intent in context, without discarding word matches.
      turn.control ||= phrases.some(p => normalize(p) === normalize(text))
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
    if (request.action === 'identify') {
      const source = this.turns.get(this.latest), generation = this.generation
      if (!source?.text) return result('memory_source_pending', 'rejected')
      // Audio dialogue and final ASR can spell a spoken name differently.
      // Main derives only a candidate from the actual introduction; the
      // delivered question and a later answer still own confirmation.
      const intent = await this.interpret({ task: 'introduction', text: source.text })
      if (generation !== this.generation) return result('memory_result_stale', 'rejected')
      if (!intent) return result('memory_interpretation_unavailable', 'failed')
      if (!intent.authorized || !intent.name.trim()) return result('memory_action_not_requested', 'ignored')
      const candidate = await this.candidateName(state.avatarId, intent.name)
      if (generation !== this.generation) return result('memory_result_stale', 'rejected')
      source.control = true
      if (source.name) this.options.learning.exclude(source.avatarId, source.name, this.latest)
      if (!candidate) return result('memory_identity_name_ambiguous', 'rejected')
      return this.identity.request(state, { ...request, name: candidate }, intent.language)
    }
    const name = this.identity.currentOwner(state)
    if (this.temporary) return result('memory_disabled', 'rejected')
    if (!name && request.action === 'temporary') {
      const source = this.turns.get(this.latest)
      if (!source?.text) return result('memory_source_pending', 'rejected')
      const generation = this.generation, intent = await this.interpret({ task: 'request', text: source.text, request })
      if (generation !== this.generation) return result('memory_result_stale', 'rejected')
      if (!intent) return result('memory_interpretation_unavailable', 'failed')
      if (!intent.authorized) return result('memory_action_not_requested', 'ignored')
      this.temporary = true; this.turns.clear(); return result('memory_temporary')
    }
    if (!name) {
      const locked = this.identity.request(state, { action: 'recall', name: '', topic: '', text: '', query: '' })
      if (locked.code === 'memory_identity_required' && request.action === 'recall') {
        const source = this.turns.get(this.latest)
        if (source && !source.text) return result('memory_source_pending', 'rejected')
        if (source?.text) {
          const generation = this.generation, intent = await this.interpret({ task: 'introduction', text: source.text })
          if (generation !== this.generation) return result('memory_result_stale', 'rejected')
          if (!intent) return result('memory_interpretation_unavailable', 'failed')
          if (intent.authorized && intent.name.trim()) {
            const candidate = await this.candidateName(state.avatarId, intent.name)
            if (generation !== this.generation) return result('memory_result_stale', 'rejected')
            if (!candidate) return result('memory_identity_name_ambiguous', 'rejected')
            return this.identity.request(state, { action: 'identify', name: candidate, topic: '', text: '', query: '' }, intent.language)
          }
        }
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
      try {
        let embedding
        if (request.query.trim() && this.options.embedder) {
          const semantic = new AbortController(), timer = setTimeout(() => semantic.abort(), 1500)
          const signal = AbortSignal.any([abort.signal, semantic.signal])
          try { embedding = await untilAborted(this.options.embedder.embed(request.query, 'query', signal), signal) }
          catch { if (!abort.signal.aborted) this.options.report(semantic.signal.aborted ? 'memory_semantic_timeout' : 'memory_semantic_unavailable') }
          finally { clearTimeout(timer) }
        }
        if (abort.signal.aborted || generation !== this.generation) return result('memory_result_stale', 'rejected')
        // Keyword retrieval gets its own bounded budget after semantic degradation.
        const timer = setTimeout(() => abort.abort(), 1500)
        try {
          const found = await untilAborted(this.options.repository.hybridRecall(avatarId, name, request.query, embedding), abort.signal)
          const current = await untilAborted(this.options.repository.policy(avatarId, name), abort.signal)
          if (generation !== this.generation || current.epoch !== policy.epoch || current.mode === 'off' || current.cleanupRequired) return result('memory_result_stale', 'rejected')
          const entries = [...found.entries]
          while (Buffer.byteLength(JSON.stringify(entries)) > MEMORY_CONTEXT_BYTES) entries.pop()
          return { ...result(entries.length ? 'memory_recalled' : 'memory_no_match'), entries,
            coverage: found.incomplete || !embedding && !!request.query.trim() ? 'incomplete' : 'complete' }
        } catch (error) {
          if (abort.signal.aborted) return generation !== this.generation ? result('memory_result_stale', 'rejected')
            : { ...result('memory_recall_unavailable', 'failed'), coverage: 'unavailable' }
          throw error
        } finally { clearTimeout(timer) }
      } finally { this.recalls.delete(abort) }
    }
    const turn = this.turns.get(this.latest)
    if (!turn?.text || turn.name !== name) return result('memory_source_pending', 'rejected')
    const intent = await this.interpret({ task: 'request', text: turn.text, request })
    if (generation !== this.generation || this.identity.currentOwner(state) !== name) return result('memory_result_stale', 'rejected')
    if (!intent) return result('memory_interpretation_unavailable', 'failed')
    if (!intent.authorized) return { ...result('memory_action_not_requested', 'ignored'), mode: policy.mode }
    turn.control = true
    this.options.learning.invalidate(avatarId, name)
    if (request.action === 'remember') {
      if (policy.mode === 'off' || this.temporary) return result('memory_disabled', 'rejected')
      const saved = await this.options.repository.save(avatarId, name, request.topic, request.text)
      this.options.onChanged?.()
      // The atomic write knows whether this was a correction; a bounded UI
      // search can miss an old target and leave stale private context loaded.
      if ((saved.revision ?? 1) === 1) return generation !== this.generation || this.identity.currentOwner(state) !== name
        ? result('memory_result_stale', 'rejected') : result('memory_saved')
      // A committed correction still obliges the renderer to close old context,
      // even when newer speech makes its conversational result stale.
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
