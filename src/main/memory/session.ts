import { parseMemoryRequest, validMemoryText, type MemoryReply, type MemoryEntry, type MemoryLanguage } from '../../shared/memory'
import { randomUUID } from 'node:crypto'
import { buildMemoryQuestion, sameSpokenQuestion } from '../../shared/realtime-prompts'

export interface MemoryState { active: boolean; avatarId: string; realtimeSessionId: string; sessionGeneration: number; lifecycle?: string }
interface Store {
  save(avatar: string, name: string, topic: string, text: string): unknown
  recall(avatar: string, name: string, query: string): MemoryEntry[]
  forget(avatar: string, name: string, topic: string): boolean
}
const reply = (code: string, status: MemoryReply['status'] = 'rejected'): MemoryReply => ({ status, code })
const normalize = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase().replace(/[。.!！?？\s]+$/u, '')
/** Main-only identity state. No person identifier is exposed to renderer or model. */
export class MemorySession {
  private key = ''
  private name = ''
  private pending = ''
  private language: MemoryLanguage = 'zh-TW'
  private question?: { token: string; text: string; delivered: boolean; expires: number }
  private blocked = false
  private seen = new Set<string>()
  private inputOrder = new Map<string, number>()
  private sequence = 0
  private pendingAfter = 0
  constructor(private readonly store: Store) {}
  currentOwner(state: MemoryState): string { this.observe(state); return this.name }
  reset(): void { this.key = ''; this.name = ''; this.pending = ''; this.question = undefined; this.blocked = false; this.seen.clear(); this.inputOrder.clear(); this.sequence = 0 }
  delivery(state: MemoryState, token: string, text: string, completed: boolean): MemoryReply {
    this.observe(state)
    const q = this.question
    if (!q || q.token !== token || !this.pending || !state.active) return reply('memory_question_stale')
    if (!completed || performance.now() > q.expires || !sameSpokenQuestion(q.text, text)) {
      this.pending = ''; this.question = undefined; return reply('memory_question_rejected')
    }
    if (q.delivered) return reply('memory_question_duplicate')
    q.delivered = true; q.expires = performance.now() + 60000; this.pendingAfter = this.sequence
    return reply('memory_question_delivered', 'accepted')
  }
  turnStart(state: MemoryState, itemId: string): void {
    this.observe(state)
    if (!state.active || !validMemoryText(itemId, 128) || this.inputOrder.has(itemId)) return
    this.inputOrder.set(itemId, ++this.sequence)
    if (this.inputOrder.size > 128) this.inputOrder.delete(this.inputOrder.keys().next().value!)
  }
  observe(state: MemoryState): void {
    const key = JSON.stringify([state.avatarId, state.realtimeSessionId, state.sessionGeneration])
    if (!state.active || this.key !== key) { this.reset(); if (state.active) this.key = key }
  }
  request(state: MemoryState, raw: unknown, language: MemoryLanguage = 'zh-TW'): MemoryReply {
    this.observe(state)
    const request = parseMemoryRequest(raw)
    if (!state.active || !request) return reply('memory_request_rejected')
    if (this.blocked) return reply('memory_clean_session_required')
    if (request.action === 'identify') {
      if (this.name && normalize(this.name) !== normalize(request.name)) {
        this.blocked = true; this.name = ''; this.pending = ''
        return reply('memory_clean_session_required')
      }
      if (this.name) return reply('memory_identity_confirmed', 'accepted')
      this.pending = request.name.trim(); this.pendingAfter = this.sequence
      this.language = language
      this.question = { token: randomUUID(), text: buildMemoryQuestion(this.pending, language), delivered: false, expires: performance.now() + 60000 }
      return { ...reply('memory_confirmation_required', 'accepted'), name: this.pending,
        confirmation: { token: this.question.token, text: this.question.text } }
    }
    if (!this.name) return reply(this.pending ? 'memory_confirmation_pending' : 'memory_identity_required')
    try {
      if (request.action === 'recall') return { ...reply('memory_recalled', 'accepted'), entries: this.store.recall(state.avatarId, this.name, request.query) }
      if (request.action === 'remember') {
        this.store.save(state.avatarId, this.name, request.topic, request.text)
        return reply('memory_saved', 'accepted')
      }
      const removed = this.store.forget(state.avatarId, this.name, request.topic)
      if (removed) this.blocked = true
      return reply(removed ? 'memory_forgotten' : 'memory_not_found', 'accepted')
    } catch { return reply('memory_storage_unavailable', 'failed') }
  }
  confirmation(state: MemoryState, itemId: string): { token: string; text: string } | undefined {
    this.observe(state)
    const q = this.question
    if (!state.active || this.blocked || !this.pending || !q?.delivered || performance.now() > q.expires
      || (this.inputOrder.get(itemId) ?? 0) <= this.pendingAfter || this.seen.has(itemId)) return undefined
    return { token: q.token, text: q.text }
  }
  transcript(state: MemoryState, itemId: string, _transcript: string, judgment?: { token: string; decision: 'yes' | 'no' | 'unclear' }): MemoryReply {
    this.observe(state)
    if (!state.active || this.blocked || !this.pending) return reply('memory_no_pending_confirmation')
    if (!this.question?.delivered) return reply('memory_question_not_delivered')
    if (performance.now() > this.question.expires) { this.pending = ''; this.question = undefined; return reply('memory_confirmation_expired') }
    if ((this.inputOrder.get(itemId) ?? 0) <= this.pendingAfter) return reply('memory_confirmation_stale')
    if (!validMemoryText(itemId, 128) || this.seen.has(itemId)) return reply('memory_confirmation_duplicate')
    if (judgment && judgment.token !== this.question.token) return reply('memory_confirmation_stale')
    this.seen.add(itemId)
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!)
    if (judgment?.decision === 'yes') {
      this.name = this.pending; this.pending = ''; this.question = undefined
      return { ...reply('memory_identity_confirmed', 'accepted'), language: this.language }
    }
    this.pending = ''; this.question = undefined
    return reply(judgment?.decision === 'no' ? 'memory_confirmation_cancelled' : 'memory_confirmation_unclear')
  }
}
