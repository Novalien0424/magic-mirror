import { z } from 'zod'
import { normalizeTranscript } from './spell-trigger'
import { REN_EXPRESSION_NAMES, REN_MOTION_GROUPS } from '../../shared/types'

const idSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,95}$/)
const nameSchema = z.string().trim().min(1).max(120)

export const managedMusicAssetSchema = z.object({
  id: idSchema,
  name: nameSchema,
  fileName: z.string().trim().regex(/^[^/\\]{1,180}$/),
  mimeType: z.enum(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4']),
  byteLength: z.number().int().positive().max(100 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

const visualAssetBase = {
  id: idSchema,
  name: nameSchema,
  fileName: z.string().trim().regex(/^[^/\\]{1,180}$/),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  orientation: z.enum(['portrait', 'landscape', 'square']),
  windowsDecode: z.literal('passed'),
} as const

export const managedVisualAssetSchema = z.discriminatedUnion('kind', [
  z.object({
    ...visualAssetBase,
    kind: z.literal('image'),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    byteLength: visualAssetBase.byteLength.max(25 * 1024 * 1024),
    audioTrack: z.literal('absent'),
  }).strict(),
  z.object({
    ...visualAssetBase,
    kind: z.literal('video'),
    mimeType: z.enum(['video/mp4', 'video/webm']),
    byteLength: visualAssetBase.byteLength.max(250 * 1024 * 1024),
    durationMs: z.number().int().min(1).max(10 * 60_000),
    audioTrack: z.enum(['present', 'absent', 'unknown']),
  }).strict(),
]).superRefine((asset, context) => {
  const expected = asset.width === asset.height
    ? 'square'
    : asset.width > asset.height ? 'landscape' : 'portrait'
  if (asset.orientation !== expected) {
    context.addIssue({ code: 'custom', path: ['orientation'], message: 'orientation_mismatch' })
  }
})

const actionBase = {
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
} as const

const physicalActionSchemas = (kind: 'lighting' | 'fog') => [
  z.object({
    ...actionBase,
    kind: z.literal(kind),
    command: z.enum(['on', 'off']),
    presetId: idSchema,
  }).strict(),
  z.object({
    ...actionBase,
    kind: z.literal(kind),
    command: z.literal('value'),
    presetId: idSchema,
    value: z.number().min(0).max(1),
  }).strict(),
] as const

const [lightingSwitchSchema, lightingValueSchema] = physicalActionSchemas('lighting')
const [fogSwitchSchema, fogValueSchema] = physicalActionSchemas('fog')

export const sceneActionSchema = z.union([
  z.object({
    ...actionBase,
    kind: z.literal('visual'),
    assetId: idSchema,
    fit: z.enum(['contain', 'cover']),
    playback: z.enum(['still', 'once', 'loop']),
    audio: z.enum(['muted', 'embedded']),
    gain: z.number().min(0).max(1),
  }).strict(),
  z.object({
    ...actionBase,
    kind: z.literal('avatar_dialogue'),
    text: z.string().trim().min(1).max(1000),
  }).strict(),
  z.object({
    ...actionBase,
    kind: z.literal('avatar_motion'),
    motionGroup: z.enum(REN_MOTION_GROUPS),
  }).strict(),
  z.object({
    ...actionBase,
    kind: z.literal('avatar_expression'),
    expression: z.enum(REN_EXPRESSION_NAMES),
  }).strict(),
  lightingSwitchSchema,
  lightingValueSchema,
  fogSwitchSchema,
  fogValueSchema,
  z.object({
    ...actionBase,
    kind: z.literal('music'),
    command: z.literal('play'),
    assetId: idSchema,
    gain: z.number().min(0).max(1),
    loop: z.boolean(),
  }).strict(),
  z.object({
    ...actionBase,
    kind: z.literal('music'),
    command: z.literal('stop'),
    fadeDurationMs: z.number().int().min(0).max(60_000),
  }).strict(),
  z.object({
    ...actionBase,
    kind: z.literal('music'),
    command: z.literal('fade'),
    targetGain: z.number().min(0).max(1),
    durationMs: z.number().int().min(1).max(60_000),
  }).strict(),
])

export const stageEndConditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('duration'),
    durationMs: z.number().int().min(1).max(10 * 60_000),
  }).strict(),
  z.object({
    kind: z.literal('video_complete'),
    visualActionId: idSchema,
  }).strict(),
  z.object({
    kind: z.literal('until_stopped'),
    maxRuntimeMs: z.number().int().min(1000).max(24 * 60 * 60_000),
  }).strict(),
])

export const sceneStageSchema = z.object({
  id: idSchema,
  name: nameSchema,
  endCondition: stageEndConditionSchema,
  actionIds: z.array(idSchema).min(1).max(32),
}).strict()

export const sceneDefinitionSchema = z.object({
  id: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  stages: z.array(sceneStageSchema).min(1).max(64),
}).strict()

export const spellConfigSchema = z.object({
  id: idSchema,
  name: nameSchema,
  phrase: z.string().trim().min(1).max(240),
  sceneId: idSchema,
  enabled: z.boolean(),
  cooldownMs: z.number().int().min(0).max(24 * 60 * 60_000),
}).strict()

function addDuplicateIssues(
  values: readonly { id: string }[],
  path: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      context.addIssue({
        code: 'custom',
        path: [path, index, 'id'],
        message: 'duplicate_id',
      })
    }
    seen.add(value.id)
  })
}

export const sceneCollectionsSchema = z.object({
  visualAssets: z.array(managedVisualAssetSchema).max(256),
  musicAssets: z.array(managedMusicAssetSchema).max(256),
  sceneActions: z.array(sceneActionSchema).max(512),
  scenes: z.array(sceneDefinitionSchema).max(128),
  spells: z.array(spellConfigSchema).max(128),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.visualAssets, 'visualAssets', context)
  addDuplicateIssues(value.musicAssets, 'musicAssets', context)
  addDuplicateIssues(value.sceneActions, 'sceneActions', context)
  addDuplicateIssues(value.scenes, 'scenes', context)
  addDuplicateIssues(value.spells, 'spells', context)

  const musicAssetIds = new Set(value.musicAssets.map((asset) => asset.id))
  const visualAssets = new Map(value.visualAssets.map((asset) => [asset.id, asset]))
  const actions = new Map(value.sceneActions.map((action) => [action.id, action]))
  const actionIds = new Set(value.sceneActions.map((action) => action.id))
  const enabledSceneIds = new Set(value.scenes.filter((scene) => scene.enabled).map((scene) => scene.id))
  const normalizedPhrases = new Set<string>()

  value.sceneActions.forEach((action, index) => {
    if (action.kind === 'music' && action.command === 'play' && !musicAssetIds.has(action.assetId)) {
      context.addIssue({
        code: 'custom',
        path: ['sceneActions', index, 'assetId'],
        message: 'missing_music_asset',
      })
    }
    if (action.kind === 'visual') {
      const asset = visualAssets.get(action.assetId)
      if (asset === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['sceneActions', index, 'assetId'],
          message: 'missing_visual_asset',
        })
        return
      }
      const validPlayback = asset.kind === 'image'
        ? action.playback === 'still'
        : action.playback === 'once' || action.playback === 'loop'
      if (!validPlayback) {
        context.addIssue({
          code: 'custom',
          path: ['sceneActions', index, 'playback'],
          message: 'visual_playback_invalid',
        })
      }
      if (
        (action.audio === 'embedded' && (asset.kind !== 'video' || asset.audioTrack === 'absent'))
        || (action.audio === 'muted' && action.gain !== 0)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sceneActions', index, action.audio === 'embedded' ? 'audio' : 'gain'],
          message: action.audio === 'embedded' ? 'visual_audio_unavailable' : 'muted_gain_nonzero',
        })
      }
    }
  })

  value.scenes.forEach((scene, sceneIndex) => {
    const stageIds = new Set<string>()
    scene.stages.forEach((stage, stageIndex) => {
      if (stageIds.has(stage.id)) {
        context.addIssue({
          code: 'custom',
          path: ['scenes', sceneIndex, 'stages', stageIndex, 'id'],
          message: 'duplicate_stage_id',
        })
      }
      stageIds.add(stage.id)
      const stageActionIds = new Set<string>()
      stage.actionIds.forEach((actionId, actionIndex) => {
        if (stageActionIds.has(actionId)) {
          context.addIssue({
            code: 'custom',
            path: ['scenes', sceneIndex, 'stages', stageIndex, 'actionIds', actionIndex],
            message: 'duplicate_stage_action',
          })
        }
        stageActionIds.add(actionId)
        if (!actionIds.has(actionId)) {
          context.addIssue({
            code: 'custom',
            path: ['scenes', sceneIndex, 'stages', stageIndex, 'actionIds', actionIndex],
            message: 'missing_scene_action',
          })
        }
      })
      const visualActions = stage.actionIds
        .map((actionId) => actions.get(actionId))
        .filter((action) => action?.kind === 'visual')
      if (visualActions.length > 1) {
        context.addIssue({
          code: 'custom',
          path: ['scenes', sceneIndex, 'stages', stageIndex, 'actionIds'],
          message: 'multiple_stage_visuals',
        })
      }

      const visual = visualActions[0]
      const visualAsset = visual?.kind === 'visual' ? visualAssets.get(visual.assetId) : undefined
      const endCondition = stage.endCondition
      const matrixValid = endCondition.kind === 'duration'
        || (endCondition.kind === 'until_stopped'
          ? visual === undefined || visualAsset?.kind === 'image' || visual?.playback === 'loop'
          : visual?.id === endCondition.visualActionId
            && visual.enabled
            && visual.playback === 'once'
            && visualAsset?.kind === 'video')
      if (!matrixValid) {
        context.addIssue({
          code: 'custom',
          path: ['scenes', sceneIndex, 'stages', stageIndex, 'endCondition'],
          message: 'stage_end_condition_invalid',
        })
      }
      if (endCondition.kind === 'until_stopped' && stageIndex !== scene.stages.length - 1) {
        context.addIssue({
          code: 'custom',
          path: ['scenes', sceneIndex, 'stages', stageIndex, 'endCondition'],
          message: 'until_stopped_must_be_final',
        })
      }
    })
  })

  value.spells.forEach((spell, index) => {
    const normalized = normalizeTranscript(spell.phrase)
    if (normalizedPhrases.has(normalized)) {
      context.addIssue({
        code: 'custom',
        path: ['spells', index, 'phrase'],
        message: 'normalized_spell_collision',
      })
    }
    normalizedPhrases.add(normalized)
    if (spell.enabled && !enabledSceneIds.has(spell.sceneId)) {
      context.addIssue({
        code: 'custom',
        path: ['spells', index, 'sceneId'],
        message: 'missing_enabled_scene',
      })
    }
  })
})

export type SceneCollections = z.infer<typeof sceneCollectionsSchema>
