/** Operator-owned capabilities. Missing assignments retain pre-selector behavior. */
export interface AvatarSkills { imageGeneration: boolean }
export type AvatarSkillId = keyof AvatarSkills
export const DEFAULT_AVATAR_SKILLS: Readonly<AvatarSkills> = Object.freeze({ imageGeneration: true })
export const AVATAR_SKILLS = Object.freeze([{
  id: 'imageGeneration' as const,
  name: 'Image generation',
  description: 'Create, show and revise images in Conversation and Interactive Studio. Guest photos always require a separate request and permission.',
}])
export function parseAvatarSkills(value: unknown): AvatarSkills | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 1 && typeof record.imageGeneration === 'boolean'
    ? { imageGeneration: record.imageGeneration } : null
}
export function imageGenerationEnabled(avatar?: { skills?: AvatarSkills }): boolean {
  return (avatar?.skills ?? DEFAULT_AVATAR_SKILLS).imageGeneration
}
export function avatarAllowsTool(avatar: { skills?: AvatarSkills } | undefined, tool: { requiredSkill?: AvatarSkillId }): boolean {
  return !tool.requiredSkill || (avatar?.skills ?? DEFAULT_AVATAR_SKILLS)[tool.requiredSkill]
}
