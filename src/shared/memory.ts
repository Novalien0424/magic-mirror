/** Private content crosses only authorized, transient IPC. Never log these values. */
export interface MemoryEntry { id: string; topic: string; text: string; updatedAt: string }
export type MemoryAction = 'identify' | 'remember' | 'recall' | 'forget'
export interface MemoryRequest { action: MemoryAction; name: string; topic: string; text: string; query: string }
export interface MemoryReply {
  status: 'accepted' | 'rejected' | 'failed'
  code: string
  name?: string
  entries?: MemoryEntry[]
}
export interface MemoryConsoleRequest {
  action: 'list' | 'save' | 'delete'
  avatarId: string
  name: string
  topic: string
  text: string
  query: string
}
export interface MemoryConsoleReply extends MemoryReply { names?: string[] }
export const MEMORY_TEXT_MAX = 1000
export const MEMORY_CONTEXT_BYTES = 4500
export function validMemoryText(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value)
    && (empty || value.trim().length > 0)
}
export function parseMemoryRequest(value: unknown): MemoryRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).length !== 5 || !['identify', 'remember', 'recall', 'forget'].includes(v.action as string)
    || !validMemoryText(v.name, 80, true) || !validMemoryText(v.topic, 120, true)
    || !validMemoryText(v.text, MEMORY_TEXT_MAX, true) || !validMemoryText(v.query, 200, true)) return null
  if (v.action === 'identify' && !v.name.trim() || v.action === 'remember' && (!v.topic.trim() || !v.text.trim())
    || v.action === 'forget' && !v.topic.trim()) return null
  return v as unknown as MemoryRequest
}
