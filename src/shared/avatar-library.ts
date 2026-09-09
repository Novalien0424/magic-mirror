import type { AvatarModel } from './avatar-profiles'

export interface AvatarLibraryLabel { name: string; version: string }
export interface AvatarLibraryLabelRequest extends AvatarLibraryLabel { id: string }
export interface AvatarLibrary {
  models: AvatarModel[]
  rejectedCount: number
  labels?: Record<string, AvatarLibraryLabel>
  labelWarningCount?: number
}

export function parseAvatarLibraryLabel(value: unknown): AvatarLibraryLabel | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).length !== 2 || typeof v.name !== 'string' || typeof v.version !== 'string'
    || v.name !== v.name.trim() || !v.name.length || v.name.length > 60
    || /[\u0000-\u001f\u007f-\u009f]/.test(v.name)
    || (v.version !== '' && !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,15}$/.test(v.version))) return null
  return { name: v.name, version: v.version }
}

export function parseAvatarLibraryLabelRequest(value: unknown): AvatarLibraryLabelRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).length !== 3 || typeof v.id !== 'string' || !/^model-[a-z0-9-]{1,80}$/.test(v.id)) return null
  const label = parseAvatarLibraryLabel({ name: v.name, version: v.version })
  return label ? { id: v.id, ...label } : null
}

export const avatarLibraryName = (label: AvatarLibraryLabel): string =>
  label.version ? `${label.name} · ${label.version}` : label.name
