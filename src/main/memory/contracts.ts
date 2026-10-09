import type { MemoryEntry, MemoryMode } from '../../shared/memory'

/** Private storage contracts. Owner identifiers never leave Electron Main. */
export interface MemoryPolicy { mode: MemoryMode; epoch: number; cleanupRequired: boolean }
export interface LearningRecord {
  topic: string
  text: string
  kind: 'episode' | 'fact' | 'commitment'
  state: 'active' | 'resolved' | 'superseded'
  eventAt: string
  sources: string[]
  expectedRevision: number | null
  keepInMind: boolean
}
export interface LearningCommit { operationId: string; epoch: number; records: LearningRecord[]; origin?: 'import'; sourceRevisions?: Record<string, number> }
export interface MemoryEmbedding { version: string; values: number[] }
export interface IndexRecord { avatarId: string; name: string; entry: MemoryEntry; revision: number }
export interface MemoryRepository {
  names(avatarId: string): Promise<string[]>
  save(avatarId: string, name: string, topic: string, text: string): Promise<MemoryEntry>
  list(avatarId: string, name: string, query?: string): Promise<MemoryEntry[]>
  /** Main-only exact normalized-topic retrieval across the entire readable scope. */
  lookupTopics(avatarId: string, name: string, topics: string[]): Promise<MemoryEntry[]>
  recall(avatarId: string, name: string, query: string): Promise<MemoryEntry[]>
  forget(avatarId: string, name: string, topic: string): Promise<boolean>
  policy(avatarId: string, name: string): Promise<MemoryPolicy>
  setPolicy(avatarId: string, name: string, mode: MemoryMode): Promise<MemoryPolicy>
  brief(avatarId: string, name: string): Promise<MemoryEntry[]>
  commitLearning(avatarId: string, name: string, commit: LearningCommit): Promise<'committed' | 'duplicate' | 'stale'>
  hybridRecall(avatarId: string, name: string, query: string, embedding?: MemoryEmbedding): Promise<{ entries: MemoryEntry[]; incomplete: boolean }>
  pendingIndex(version: string, limit: number): Promise<IndexRecord[]>
  setEmbedding(avatarId: string, name: string, id: string, revision: number, embedding: MemoryEmbedding): Promise<boolean>
  setCleanupRequired(avatarId: string, name: string, required: boolean): Promise<void>
  close(): Promise<void>
}
export interface MemoryEmbedder {
  readonly version: string
  embed(text: string, purpose: 'query' | 'document', signal?: AbortSignal): Promise<MemoryEmbedding>
  close(): Promise<void>
}
