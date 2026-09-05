import type { ManagedMusicAsset, ManagedVisualAsset, PendingVisualAsset } from './types'

export interface MediaImportRequest { kind: 'all' | 'visual' | 'music'; multiple: boolean }
export type ImportedMedia = ManagedMusicAsset | ManagedVisualAsset
export type MediaImportEntry = { kind: 'visual'; pending: PendingVisualAsset }
  | { kind: 'music'; asset: ManagedMusicAsset }
  | { kind: 'failed'; name: string; reason: string }
