import { parseMemoryRequest, validMemoryText, type MemoryReply, type MemoryEntry } from '../../shared/memory'

export interface MemoryState { active: boolean; avatarId: string; realtimeSessionId: string; sessionGeneration: number }
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
  private attempts = 0
  private blocked = false
  private seen = new Set<string>()
  private inputOrder = new Map<string, number>()
  private sequence = 0
  private pendingAfter = 0
  constructor(private readonly store: Store) {}
  reset(): void { this.key = ''; this.name = ''; this.pending = ''; this.attempts = 0; this.blocked = false; this.seen.clear(); this.inputOrder.clear(); this.sequence = 0 }
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
  request(state: MemoryState, raw: unknown): MemoryReply {
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
      this.pending = request.name.trim(); this.attempts = 0; this.pendingAfter = this.sequence
      return { ...reply('memory_confirmation_required', 'accepted'), name: this.pending }
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
  transcript(state: MemoryState, itemId: string, transcript: string): MemoryReply {
    this.observe(state)
    if (!state.active || this.blocked || !this.pending) return reply('memory_no_pending_confirmation')
    if ((this.inputOrder.get(itemId) ?? 0) <= this.pendingAfter) return reply('memory_confirmation_stale')
    if (!validMemoryText(itemId, 128) || this.seen.has(itemId)) return reply('memory_confirmation_duplicate')
    this.seen.add(itemId)
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!)
    const value = normalize(transcript)
    if (['yes', 'yes it is me', 'correct', '是', '是的', '對', '对', '對的', '对的', '沒錯', '没错', '我是本人'].includes(value)) {
      this.name = this.pending; this.pending = ''; return reply('memory_identity_confirmed', 'accepted')
    }
    if (['no', '不是', '不對', '不对'].includes(value) || ++this.attempts >= 2) {
      this.pending = ''; return reply('memory_confirmation_cancelled')
    }
    return reply('memory_confirmation_unclear')
  }
}
