import type { AvatarCatalog } from '../../shared/avatar-profiles'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'

export function avatarDeletionReason(catalog: AvatarCatalog | undefined, id: string, activeId: string): string {
  if (!catalog?.avatars.some(avatar => avatar.id === id)) return 'This avatar is no longer available.'
  if (catalog.avatars.length <= 1) return 'Keep at least one avatar in the workspace.'
  if (id === activeId || id === catalog.activeAvatarId) return 'Switch to another avatar on Mirror before deleting this avatar.'
  return ''
}

/** Remove from the local editor while retaining unrelated unfinished edits. */
export function removeAvatarFromDraft(draft: ConsoleConfigDraftInput, id: string, activeId: string): ConsoleConfigDraftInput {
  const reason = avatarDeletionReason(draft.avatarCatalog, id, activeId)
  if (reason) throw new Error(reason)
  const catalog = draft.avatarCatalog!
  return { ...draft, avatarCatalog: { ...catalog,
    avatars: catalog.avatars.filter(avatar => avatar.id !== id),
    locks: catalog.locks.filter(lock => lock.avatarId !== id),
  } }
}
