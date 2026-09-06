import type { SceneActionDefinition, SceneStageDefinition } from '../../shared/types'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'
import { mergeAvatarDraft, projectAvatarDraft } from './avatar-editor'

export function draftFingerprint(draft: ConsoleConfigDraftInput): string {
  return JSON.stringify(projectAvatarDraft(draft), (_key, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
  })
}

export function isSceneDraftSaved(saved: ConsoleConfigDraftInput, edited: ConsoleConfigDraftInput,
  avatarId: string, sceneId: string, stepId?: string): boolean {
  const scene = projectAvatarDraft(saved, avatarId).scenes.find(s => s.id === sceneId)
  if (!scene || stepId && !scene.stages.some(s => s.id === stepId)) return false
  // Normalize both sides through the same projection (legacy drafts may omit
  // root presentation while their synthesized avatar already has defaults).
  return draftFingerprint(buildSceneDraftSave(saved, edited, avatarId, sceneId, stepId))
    === draftFingerprint(buildSceneDraftSave(saved, saved, avatarId, sceneId, stepId))
}

/** Save only this scene/step and its dependencies, preserving other draft edits. */
export function buildSceneDraftSave(saved: ConsoleConfigDraftInput, edited: ConsoleConfigDraftInput,
  avatarId: string, sceneId: string, stepId?: string): ConsoleConfigDraftInput {
  if (saved.avatarCatalog && !saved.avatarCatalog.avatars.some(a => a.id === avatarId)) throw new Error('Save Draft to create this avatar first.')
  const base = projectAvatarDraft(saved, avatarId)
  const current = projectAvatarDraft(edited, avatarId)
  const scene = current.scenes.find(s => s.id === sceneId)
  if (!scene) throw new Error('Scene no longer exists.')
  const old = base.scenes.find(s => s.id === sceneId)
  const selected = scene.stages.find(s => s.id === stepId)
  if (stepId && !selected) throw new Error('Step no longer exists.')
  const stages = selected ? (old ? old.stages.map(s => s.id === stepId ? selected : s) : []) : scene.stages
  if (selected && !stages.some(s => s.id === stepId)) {
    const preceding = new Set(scene.stages.slice(0, scene.stages.indexOf(selected)).map(s => s.id))
    const position = stages.reduce((last, s, i) => preceding.has(s.id) ? i + 1 : last, 0)
    stages.splice(position, 0, selected)
  }
  const nextScene = { ...(old ?? scene), ...(stepId ? {} : scene), stages }
  const actionIds = new Set((selected ? [selected] : stages).flatMap(s => s.actionIds))
  const actions = current.sceneActions.filter(a => actionIds.has(a.id))
  const assetIds = new Set(actions.flatMap(a => 'assetId' in a ? [a.assetId] : []))
  const merge = <T extends { id: string }>(all: readonly T[], updates: readonly T[]): T[] =>
    [...all.map(a => updates.find(b => b.id === a.id) ?? a), ...updates.filter(a => !all.some(b => b.id === a.id))]
  const projected = { ...base,
    scenes: merge(base.scenes, [nextScene]),
    spells: old && stepId ? base.spells : merge(base.spells.filter(s => s.sceneId !== sceneId || current.spells.some(c => c.id === s.id)), current.spells.filter(s => s.sceneId === sceneId)),
    sceneActions: merge(base.sceneActions, actions),
    visualAssets: merge(base.visualAssets, current.visualAssets.filter(a => assetIds.has(a.id))),
    musicAssets: merge(base.musicAssets, current.musicAssets.filter(a => assetIds.has(a.id))),
  }
  return structuredClone(mergeAvatarDraft(saved, projected, avatarId))
}

export function duplicateStage(stage: SceneStageDefinition, actions: readonly SceneActionDefinition[],
  nextId: () => string = () => crypto.randomUUID()): { stage: SceneStageDefinition; actions: SceneActionDefinition[] } {
  const ids = new Map(stage.actionIds.map(id => [id, nextId()]))
  return {
    actions: actions.filter(action => ids.has(action.id)).map(action => ({ ...structuredClone(action), id: ids.get(action.id)! })),
    stage: { ...structuredClone(stage), id: nextId(), name: `${stage.name} copy`,
      actionIds: stage.actionIds.map(id => ids.get(id)!),
      endCondition: stage.endCondition.kind === 'video_complete'
        ? { kind: 'video_complete', visualActionId: ids.get(stage.endCondition.visualActionId) ?? stage.endCondition.visualActionId }
        : { ...stage.endCondition } },
  }
}
