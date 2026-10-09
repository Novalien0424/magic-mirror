import { youtubeVideoId } from './youtube-media'

/** Operator-curated local resources available to an avatar's conversational media skill. */
export interface AvatarMediaResource {
  kind: 'video' | 'music'
  assetId: string
  name: string
  aliases: string[]
}

export interface AvatarMediaSkill {
  enabled: boolean
  fadeMs: number
  gain: number
  resources: AvatarMediaResource[]
}

export const DEFAULT_MEDIA_SKILL: AvatarMediaSkill = {
  enabled: true, fadeMs: 800, gain: 0.7, resources: [],
}

/** Dependency-free boundary validation for the sandboxed preload. */
export function parseMediaSkill(value: unknown): AvatarMediaSkill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).length !== 4 || typeof v.enabled !== 'boolean' || typeof v.fadeMs !== 'number'
    || !Number.isInteger(v.fadeMs) || v.fadeMs < 0 || v.fadeMs > 10000 || typeof v.gain !== 'number'
    || !Number.isFinite(v.gain) || v.gain < 0 || v.gain > 1 || !Array.isArray(v.resources) || v.resources.length > 512) return null
  const keys = new Set<string>()
  for (const r of v.resources) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).length !== 4
      || !['video', 'music'].includes(r.kind) || typeof r.assetId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(r.assetId)
      || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 120 || !Array.isArray(r.aliases)
      || r.aliases.length > 16 || !r.aliases.every((a: unknown) => typeof a === 'string' && a.trim().length > 0 && a.length <= 120)
      || keys.has(`${r.kind}:${r.assetId}`)) return null
    keys.add(`${r.kind}:${r.assetId}`)
  }
  return structuredClone(value) as AvatarMediaSkill
}

export type MediaSkillRequest =
  | { action: 'play'; kind: 'video' | 'music'; assetId: string; mode: 'once' | 'loop' }
  | { action: 'play_youtube'; kind: 'video' | 'music'; url: string; mode: 'once' | 'loop' }
  | { action: 'stop' }

export function parseMediaSkillRequest(value: unknown): MediaSkillRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (v.action === 'stop' && Object.keys(v).length === 1) return { action: 'stop' }
  if (v.action === 'play_youtube' && Object.keys(v).length === 4 && typeof v.url === 'string' && youtubeVideoId(v.url)
    && (v.kind === 'video' || v.kind === 'music') && (v.mode === 'once' || v.mode === 'loop')) {
    return { action: 'play_youtube', kind: v.kind, url: v.url, mode: v.mode }
  }
  if (Object.keys(v).length !== 4 || v.action !== 'play' || (v.kind !== 'video' && v.kind !== 'music')
    || typeof v.assetId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(v.assetId)
    || (v.mode !== 'once' && v.mode !== 'loop')) return null
  return { action: 'play', kind: v.kind, assetId: v.assetId, mode: v.mode }
}
