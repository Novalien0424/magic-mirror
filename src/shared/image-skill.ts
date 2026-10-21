import source from '../../resources/config/prompts/image-skill.v1.json' with { type: 'json' }
import type { StudioLanguage, StudioPictureType } from './portrait-studio'
import type { ToolOutcome } from './realtime-tools'

export const IMAGE_SKILL_SOURCE = 'resources/config/prompts/image-skill.v1.json'
export const IMAGE_SKILL = Object.freeze(source)
export const IMAGE_SKILL_CHANNEL = 'mirror:image-skill'
export type ImageSkillRequest =
  | { action: 'generate'; prompt: string; picture: StudioPictureType; source: 'description' | 'photo'; language: StudioLanguage }
  | { action: 'edit'; prompt: string; language: StudioLanguage }
  | { action: 'studio_photo'; language: StudioLanguage }
  | { action: 'camera_permission'; language: StudioLanguage }
  | { action: 'consent_ready'; ticket: string }
  | { action: 'photo_reply'; ticket: string; text: string; itemId: string }
  | { action: 'dismiss' }
export interface ImageSkillReply { status: ToolOutcome; code: string; next?: string }
export type ImageSkillPhase = 'consent' | 'countdown' | 'capturing' | 'painting' | 'revising' | 'ready' | 'failed'
export interface ImageSkillView {
  id: string; phase: ImageSkillPhase; language: StudioLanguage; target: 'conversation' | 'studio' | 'camera'; picture: StudioPictureType
  imageUrl?: string; countdownEndsAt?: number
}
export type ImageSkillEvent =
  | { event: 'consent'; id: string; ticket: string; line: string }
  | { event: 'line'; id: string; line: string }
  | { event: 'ready'; id: string; imageUrl: string; language: StudioLanguage }
  | { event: 'closed'; id: string; outcome?: 'photo_attached' }
  | { event: 'camera_approved'; id: string }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k))
const text = (v: unknown, max: number) => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v)
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(v)
const language = (v: unknown) => v === 'en' || v === 'zh'
const picture = (v: unknown) => v === 'portrait' || v === 'sticker'
export const imageSkillUrl = (v: unknown): v is string => typeof v === 'string' && /^magic-mirror-media:\/\/image-skill\/[a-z0-9-]{8,64}$/.test(v)
export function parseImageSkillRequest(v: unknown): ImageSkillRequest | null {
  if (!record(v)) return null
  const ok = v.action === 'dismiss' ? keys(v, ['action'])
    : v.action === 'generate' ? keys(v, ['action', 'prompt', 'picture', 'source', 'language']) && text(v.prompt, 2000) && picture(v.picture) && ['description', 'photo'].includes(v.source as string) && language(v.language)
      : v.action === 'edit' ? keys(v, ['action', 'prompt', 'language']) && text(v.prompt, 2000) && language(v.language)
        : v.action === 'studio_photo' || v.action === 'camera_permission' ? keys(v, ['action', 'language']) && language(v.language)
          : v.action === 'consent_ready' ? keys(v, ['action', 'ticket']) && id(v.ticket)
            : v.action === 'photo_reply' && keys(v, ['action', 'ticket', 'text', 'itemId']) && id(v.ticket) && id(v.itemId) && text(v.text, 1000)
  return ok ? structuredClone(v) as ImageSkillRequest : null
}
export function parseImageSkillReply(v: unknown): ImageSkillReply | null {
  return record(v) && keys(v, ['status', 'code', ...('next' in v ? ['next'] : [])]) && ['accepted', 'ignored', 'rejected', 'failed'].includes(v.status as string)
    && typeof v.code === 'string' && /^image_[a-z0-9_]{1,70}$/.test(v.code) && (!('next' in v) || text(v.next, 2000)) ? v as unknown as ImageSkillReply : null
}
export function parseImageSkillView(v: unknown): ImageSkillView | null {
  return record(v) && keys(v, ['id', 'phase', 'language', 'target', 'picture', ...('imageUrl' in v ? ['imageUrl'] : []), ...('countdownEndsAt' in v ? ['countdownEndsAt'] : [])])
    && id(v.id) && ['consent', 'countdown', 'capturing', 'painting', 'revising', 'ready', 'failed'].includes(v.phase as string)
    && language(v.language) && picture(v.picture) && ['conversation', 'studio', 'camera'].includes(v.target as string)
    && (!('imageUrl' in v) || imageSkillUrl(v.imageUrl)) && (!('countdownEndsAt' in v) || typeof v.countdownEndsAt === 'number' && Number.isFinite(v.countdownEndsAt)) ? v as unknown as ImageSkillView : null
}
export function parseImageSkillEvent(v: unknown): ImageSkillEvent | null {
  if (!record(v) || !id(v.id)) return null
  const ok = v.event === 'closed' ? keys(v, ['event', 'id', ...('outcome' in v ? ['outcome'] : [])]) && (!('outcome' in v) || v.outcome === 'photo_attached')
    : v.event === 'camera_approved' ? keys(v, ['event', 'id'])
    : v.event === 'ready' ? keys(v, ['event', 'id', 'imageUrl', 'language']) && imageSkillUrl(v.imageUrl) && language(v.language)
      : v.event === 'line' ? keys(v, ['event', 'id', 'line']) && text(v.line, 2000)
        : v.event === 'consent' && keys(v, ['event', 'id', 'ticket', 'line']) && id(v.ticket) && text(v.line, 2000)
  return ok ? v as unknown as ImageSkillEvent : null
}

export function buildImageSkillPrompt(prompt: string, kind: 'generate' | 'edit', type: StudioPictureType, photo = false): string {
  return [IMAGE_SKILL[kind], ...(photo ? [IMAGE_SKILL.photo] : []), ...(type === 'sticker' ? [IMAGE_SKILL.sticker] : []), JSON.stringify(prompt)].join('\n\n')
}
