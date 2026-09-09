import { z } from 'zod'
import { AVATAR_VOICES, canUseAvatarResource, type AvatarCatalog } from '../../shared/avatar-profiles'
import { DEFAULT_VOICE_EFFECTS } from '../../shared/voice-effects'
import { voiceEffectsSchema } from '../../shared/voice-effects-schema'
import { parsePresentation, type PresentationConfig } from '../../shared/presentation'
import type { MirrorConfig } from '../../shared/types'
import { sceneCollectionsSchema, sceneDefinitionSchema, spellConfigSchema } from '../scenes/scene-config'

const id = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,95}$/)
const relativeFile = z.string().max(256).refine(value => value.split('/').every(
  part => /^[a-zA-Z0-9_][a-zA-Z0-9_. -]*$/.test(part) && !part.endsWith('.') && !part.endsWith(' '),
))
export const avatarCatalogSchema = z.object({
  activeAvatarId: id,
  avatars: z.array(z.object({
    id, name: z.string().trim().min(1).max(80), personality: z.string().min(1).max(12000),
    speakingStyle: z.string().max(2000), voice: z.enum(AVATAR_VOICES),
    idleSeconds: z.number().int().min(1).max(86400), modelId: id,
    presentation: z.custom<PresentationConfig>(value => value !== undefined && parsePresentation(value) !== null),
    scenes: z.array(sceneDefinitionSchema).max(128), spells: z.array(spellConfigSchema).max(128),
    voiceSpeed: z.number().finite().min(0.5).max(1.5).default(1),
    voiceEffects: voiceEffectsSchema.default(DEFAULT_VOICE_EFFECTS),
  }).strict()).min(1).max(32),
  locks: z.array(z.object({ kind: z.enum(['visual', 'music', 'action']), resourceId: id, avatarId: id }).strict()).max(1024),
  models: z.array(z.object({ id, name: z.string().trim().min(1).max(80),
    manifestFileName: relativeFile.refine(value => value.endsWith('.model3.json')),
    files: z.array(relativeFile).min(1).max(256),
  }).strict()).max(32),
}).strict().superRefine((value, context) => {
  const fail = (path: (string | number)[]) => context.addIssue({ code: 'custom', path, message: 'Invalid avatar reference' })
  const ids = new Set(value.avatars.map(a => a.id))
  if (ids.size !== value.avatars.length) fail(['avatars'])
  if (!ids.has(value.activeAvatarId)) fail(['activeAvatarId'])
  const models = new Set(['builtin-ren', ...value.models.map(model => model.id)])
  if (models.size !== value.models.length + 1) fail(['models'])
  value.models.forEach((model, index) => {
    if (!model.files.includes(model.manifestFileName) || new Set(model.files).size !== model.files.length) fail(['models', index, 'files'])
  })
  value.avatars.forEach((avatar, index) => { if (!models.has(avatar.modelId)) fail(['avatars', index, 'modelId']) })
  const locks = new Set<string>()
  value.locks.forEach((lock, index) => {
    const key = `${lock.kind}:${lock.resourceId}`
    if (!ids.has(lock.avatarId) || locks.has(key)) fail(['locks', index])
    locks.add(key)
  })
})

export function validateAvatarReferences(config: Pick<MirrorConfig, 'visualAssets' | 'musicAssets' | 'sceneActions'>,
  catalog: AvatarCatalog, context: z.RefinementCtx): void {
  const resources = { visual: config.visualAssets, music: config.musicAssets, action: config.sceneActions }
  const fail = (path: (string | number)[]) => context.addIssue({ code: 'custom', path: ['avatarCatalog', ...path], message: 'Unavailable avatar resource' })
  catalog.locks.forEach((lock, index) => {
    if (!resources[lock.kind].some(item => item.id === lock.resourceId)) fail(['locks', index])
  })
  catalog.avatars.forEach((avatar, index) => {
    const allowed = (kind: 'visual' | 'music' | 'action', resourceId: string) =>
      resources[kind].some(item => item.id === resourceId) && canUseAvatarResource(catalog, avatar.id, kind, resourceId)
    const p = avatar.presentation
    if (p.backgroundId && !allowed('visual', p.backgroundId)) fail(['avatars', index, 'presentation', 'backgroundId'])
    if (p.ambienceId && !allowed('music', p.ambienceId)) fail(['avatars', index, 'presentation', 'ambienceId'])
    const parsed = sceneCollectionsSchema.safeParse({ visualAssets: config.visualAssets,
      musicAssets: config.musicAssets, sceneActions: config.sceneActions, scenes: avatar.scenes, spells: avatar.spells })
    if (!parsed.success) for (const issue of parsed.error.issues) {
      context.addIssue({ code: 'custom', path: ['avatarCatalog', 'avatars', index, ...issue.path], message: issue.message })
    }
    for (const scene of avatar.scenes) for (const stage of scene.stages) for (const actionId of stage.actionIds) {
      const action = config.sceneActions.find(item => item.id === actionId)
      if (!allowed('action', actionId)
        || action?.kind === 'visual' && !allowed('visual', action.assetId)
        || action?.kind === 'music' && action.command === 'play' && !allowed('music', action.assetId)) {
        fail(['avatars', index, 'scenes'])
      }
    }
  })
}
