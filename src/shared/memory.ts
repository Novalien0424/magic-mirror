/** Private content crosses only authorized, transient IPC. Never log these values. */
export type MemoryMode = 'automatic' | 'explicit' | 'off'
export interface MemoryEntry { id: string; topic: string; text: string; updatedAt: string; kind?: 'episode' | 'fact' | 'commitment'; revision?: number; state?: 'active' | 'resolved' | 'superseded'; eventAt?: string; keepInMind?: boolean }
export type MemoryAction = 'identify' | 'remember' | 'recall' | 'forget' | 'policy' | 'temporary'
export type MemoryInputPhase = 'speech' | 'start' | 'complete' | 'settled' | 'control' | 'question_played' | 'question_cancelled'
export interface MemoryRequest { action: MemoryAction; name: string; topic: string; text: string; query: string }
export interface MemoryReply {
  status: 'accepted' | 'ignored' | 'rejected' | 'failed'
  code: string
  name?: string
  entries?: MemoryEntry[]
  mode?: MemoryMode
  temporary?: boolean
  confirmation?: { token: string; text: string }
  coverage?: 'complete' | 'incomplete' | 'unavailable'
}
export interface MemoryConsoleRequest {
  action: 'list' | 'save' | 'delete' | 'policy'
  avatarId: string
  name: string
  topic: string
  text: string
  query: string
}
export interface MemoryConsoleReply extends MemoryReply { names?: string[]; learning?: 'pending' | 'ready' | 'unavailable' }
export interface MemoryImportRequest { action: 'pick' | 'start' | 'status' | 'cancel'; avatarId: string; name: string }
export interface MemoryImportStatus { state: 'empty' | 'staged' | 'running' | 'complete' | 'cancelled' | 'failed'; chunks: number; processed: number; saved: number; persona: string; code: string }
export const MEMORY_RESET_CODES = ['memory_forgotten', 'memory_corrected', 'memory_policy_changed', 'memory_temporary', 'memory_clean_session_required'] as const
export const memoryNeedsReset = (code: string): boolean => (MEMORY_RESET_CODES as readonly string[]).includes(code)
export const MEMORY_TEXT_MAX = 1000
export const MEMORY_CONTEXT_BYTES = 4500
export function validMemoryText(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value)
    && (empty || value.trim().length > 0)
}
export function parseMemoryRequest(value: unknown): MemoryRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).length !== 5 || !['identify', 'remember', 'recall', 'forget', 'policy', 'temporary'].includes(v.action as string)
    || !validMemoryText(v.name, 80, true) || !validMemoryText(v.topic, 120, true)
    || !validMemoryText(v.text, MEMORY_TEXT_MAX, true) || !validMemoryText(v.query, 200, true)) return null
  if (v.action === 'identify' && !v.name.trim() || v.action === 'remember' && (!v.topic.trim() || !v.text.trim())
    || v.action === 'forget' && !v.topic.trim()
    || v.action === 'policy' && !['automatic', 'explicit', 'off'].includes(v.text)) return null
  return v as unknown as MemoryRequest
}
