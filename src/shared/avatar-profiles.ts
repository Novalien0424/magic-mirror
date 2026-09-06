import { DEFAULT_PRESENTATION, type PresentationConfig } from './presentation'
import type { MirrorConfig, SceneActionDefinition, SceneDefinition, SpellConfig } from './types'

// Built-in Realtime voices; model IDs remain exclusively in versioned config.
export const AVATAR_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const
export interface AvatarProfile {
  id: string
  name: string
  personality: string
  speakingStyle: string
  voice: string
  idleSeconds: number
  modelId: string
  presentation: PresentationConfig
  scenes: SceneDefinition[]
  spells: SpellConfig[]
}
export interface AvatarResourceLock {
  kind: 'visual' | 'music' | 'action'
  resourceId: string
  avatarId: string
}
export interface AvatarModel {
  id: string
  name: string
  manifestFileName: string
  files: string[]
}
export interface AvatarModelReference { id: string; manifestFileName: string }
export function parseAvatarModelReference(value: unknown): AvatarModelReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).length !== 2 || typeof v.id !== 'string' || !/^model-[a-z0-9-]{1,80}$/.test(v.id)
    || typeof v.manifestFileName !== 'string' || v.manifestFileName.length > 256
    || !/^[a-zA-Z0-9_][a-zA-Z0-9_. -]*\.model3\.json$/.test(v.manifestFileName)) return null
  return { id: v.id, manifestFileName: v.manifestFileName }
}
export interface AvatarCatalog {
  activeAvatarId: string
  avatars: AvatarProfile[]
  locks: AvatarResourceLock[]
  models: AvatarModel[]
}

export function avatarCatalogFor(config: MirrorConfig): AvatarCatalog {
  if (config.avatarCatalog) return structuredClone(config.avatarCatalog)
  return { activeAvatarId: 'default-avatar', locks: [], models: [], avatars: [{
    id: 'default-avatar', name: config.persona.name, personality: config.persona.instructions,
    speakingStyle: '', voice: config.voice, idleSeconds: config.idleSeconds, modelId: 'builtin-ren',
    presentation: { ...DEFAULT_PRESENTATION, ...config.presentation },
    scenes: structuredClone(config.scenes), spells: structuredClone(config.spells),
  }] }
}

/** Root fields are compatibility projections, never a second source of truth. */
export function projectActiveAvatar<T extends MirrorConfig>(config: T): T {
  const catalog = config.avatarCatalog
  if (!catalog) return config
  const avatar = catalog.avatars.find(item => item.id === catalog.activeAvatarId)
  if (!avatar) throw new Error('avatar_active_unknown')
  return { ...config, persona: { name: avatar.name, instructions: avatar.personality },
    voice: avatar.voice, idleSeconds: avatar.idleSeconds, presentation: avatar.presentation,
    scenes: avatar.scenes, spells: avatar.spells }
}

export function canUseAvatarResource(catalog: AvatarCatalog, avatarId: string,
  kind: AvatarResourceLock['kind'], resourceId: string): boolean {
  const lock = catalog.locks.find(item => item.kind === kind && item.resourceId === resourceId)
  return lock === undefined || lock.avatarId === avatarId
}

export function canUseAvatarAction(catalog: AvatarCatalog | undefined, avatarId: string, action: SceneActionDefinition): boolean {
  if (!catalog) return true
  return canUseAvatarResource(catalog, avatarId, 'action', action.id)
    && (action.kind !== 'visual' || canUseAvatarResource(catalog, avatarId, 'visual', action.assetId))
    && (action.kind !== 'music' || action.command !== 'play' || canUseAvatarResource(catalog, avatarId, 'music', action.assetId))
}
