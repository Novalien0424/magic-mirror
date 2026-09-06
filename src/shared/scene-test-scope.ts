export interface SceneTestScope { readonly stageId: string; readonly actionId?: string }
export function parseSceneTestScope(value: unknown): SceneTestScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(k => k !== 'stageId' && k !== 'actionId')) return null
  const id = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9][a-z0-9._-]{0,95}$/.test(s)
  if (!id(v.stageId) || 'actionId' in v && !id(v.actionId)) return null
  return { stageId: v.stageId, ...(typeof v.actionId === 'string' ? { actionId: v.actionId } : {}) }
}
