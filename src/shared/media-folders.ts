import { DEFAULT_MEDIA_SKILL, type AvatarMediaResource, type AvatarMediaSkill } from './media-skill'

export interface FolderMediaEntry extends AvatarMediaResource { origin: 'own' | 'shared' }
export const isFolderMediaId = (id: string): boolean => /^folder-[a-f0-9]{40}$/.test(id)
export interface MediaFolderStatus {
  label: string
  path: string // Console only; never part of avatar settings or model prompts.
  status: 'ready' | 'partial' | 'unavailable'
  count: number
  skipped: number
  reason: string
  scannedAt: string
}
export interface MediaFoldersView {
  own: MediaFolderStatus | null
  shared: MediaFolderStatus | null
  entries: FolderMediaEntry[]
  reason?: string
}
export type MediaFolderCommand = { action: 'get' | 'refresh' | 'save' | 'choose' | 'unlink'; avatarId?: string; scope?: 'own' | 'shared' }
  | { action: 'aliases'; avatarId?: string; assetId: string; aliases: string[] }

export function validMediaAliases(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 16 && value.every(alias => typeof alias === 'string'
    && alias.trim().length > 0 && alias.length <= 120 && !/[\p{Cc}\p{Cf}]/u.test(alias))
}

/** Shared by Main authorization/session creation and the Console prompt inspector. */
export function folderMediaSkill(skill: AvatarMediaSkill = DEFAULT_MEDIA_SKILL, entries: readonly FolderMediaEntry[]): AvatarMediaSkill {
  if (!entries.length) return structuredClone(skill)
  const names = new Set<string>(), ids = new Set<string>()
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
  const resources: AvatarMediaResource[] = []
  for (const entry of [...entries, ...(skill.enabled ? skill.resources : [])]) {
    const key = `${entry.kind}:${entry.assetId}`
    if (ids.has(key) || resources.length >= 512) continue
    ids.add(key)
    const base = entry.name
    let name = base, suffix = 2
    if (names.has(normalize(name)) && 'origin' in entry) name = `${base.slice(0, 100)} (${entry.origin})`
    while (names.has(normalize(name))) name = `${base.slice(0, 100)} (${suffix++})`
    names.add(normalize(name))
    // An alias can intentionally describe several versions. Preserve that
    // ambiguity for discovery instead of silently hiding later candidates.
    const aliases = [...new Map(entry.aliases.filter(alias => alias.trim()).map(alias => [normalize(alias), alias])).values()]
    resources.push({ kind: entry.kind, assetId: entry.assetId, name, aliases })
  }
  return { ...skill, enabled: true, resources }
}
