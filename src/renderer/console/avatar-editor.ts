import type { ConsoleConfigDraftInput } from '../../shared/console-types'

export function projectAvatarDraft(draft: ConsoleConfigDraftInput, avatarId?: string): ConsoleConfigDraftInput {
  const avatar = draft.avatarCatalog?.avatars.find(a => a.id === (avatarId ?? draft.avatarCatalog?.activeAvatarId))
  return avatar ? { ...draft, personaName: avatar.name, voice: avatar.voice, idleSeconds: avatar.idleSeconds,
    presentation: avatar.presentation, scenes: avatar.scenes, spells: avatar.spells } : draft
}

export function mergeAvatarDraft(current: ConsoleConfigDraftInput, edited: ConsoleConfigDraftInput,
  avatarId: string): ConsoleConfigDraftInput {
  if (!current.avatarCatalog) return edited
  return projectAvatarDraft({ ...edited, avatarCatalog: { ...current.avatarCatalog,
    avatars: current.avatarCatalog.avatars.map(a => a.id !== avatarId ? a : { ...a,
      name: edited.personaName, voice: edited.voice, idleSeconds: edited.idleSeconds,
      presentation: edited.presentation ?? a.presentation, scenes: [...edited.scenes], spells: [...edited.spells] }) } })
}
