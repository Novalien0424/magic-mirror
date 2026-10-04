import { canUseAvatarResource, type AvatarCatalog, type AvatarProfile } from '../../shared/avatar-profiles'
import type { ImportedMedia } from '../../shared/media-import'
import { DEFAULT_MEDIA_SKILL } from '../../shared/media-skill'

const normalized = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()

/** Select only playable, permitted imports; keep spoken names unambiguous by default. */
export function addAvatarMedia(avatar: AvatarProfile, assets: ImportedMedia[], catalog?: AvatarCatalog): AvatarProfile {
  const skill = avatar.mediaSkill ?? DEFAULT_MEDIA_SKILL
  const resources = [...skill.resources]
  const names = new Set(resources.flatMap(r => [r.name, ...r.aliases]).map(normalized))
  for (const asset of assets) {
    if ('kind' in asset && asset.kind !== 'video') continue
    const kind = 'kind' in asset ? 'video' : 'music'
    if (resources.length >= 512 || resources.some(r => r.kind === kind && r.assetId === asset.id)
      || catalog && !canUseAvatarResource(catalog, avatar.id, kind === 'video' ? 'visual' : 'music', asset.id)) continue
    const base = asset.name.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, 110) || (kind === 'video' ? 'Video' : 'Music')
    let name = base, suffix = 2
    while (names.has(normalized(name))) name = `${base} (${suffix++})`
    names.add(normalized(name))
    resources.push({ kind, assetId: asset.id, name, aliases: [] })
  }
  return { ...avatar, mediaSkill: { ...skill, resources } }
}
