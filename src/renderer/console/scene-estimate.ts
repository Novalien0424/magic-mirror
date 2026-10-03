import type { ManagedVisualAsset, SceneActionDefinition, SceneDefinition } from '../../shared/types'

export function estimateSceneMaximumMs(
  scene: SceneDefinition,
  actions: readonly SceneActionDefinition[],
  assets: readonly ManagedVisualAsset[],
): number | null {
  const actionById = new Map(actions.map((action) => [action.id, action]))
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  let total = 0
  for (const stage of scene.stages) {
    if (stage.endCondition.kind === 'duration') total += stage.endCondition.durationMs
    else if (stage.endCondition.kind === 'until_stopped') total += stage.endCondition.maxRuntimeMs
    else {
      const action = actionById.get(stage.endCondition.visualActionId)
      if (action?.kind !== 'visual') return null
      const asset = assetById.get(action.assetId)
      if (asset?.kind !== 'video') return null
      total += asset.durationMs
    }
  }
  return total
}
