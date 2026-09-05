import type { SceneActionDefinition, SceneStageDefinition } from '../../shared/types'

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
