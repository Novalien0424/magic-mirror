import { REALTIME_PROMPTS } from '../../shared/realtime-prompts'
import type { AvatarProfile } from '../../shared/avatar-profiles'
import type { ConsoleConfigDraftInput, ConsoleConfigPayload, ConsoleResponse } from '../../shared/console-types'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'
import { DEFAULT_VOICE_EFFECTS } from '../../shared/voice-effects'
import { DEFAULT_MEDIA_SKILL } from '../../shared/media-skill'
import { DEFAULT_AVATAR_SKILLS } from '../../shared/avatar-skills'
import { defaultExperience } from '../../shared/portrait-studio'
import { DEFAULT_CLOUD_SEARCH_PHRASE, DEFAULT_SLEEP_PHRASE, DEFAULT_WAKE_PHRASE } from '../../shared/avatar-commands'
import { draftFingerprint } from './scene-editor-model'

export const PROFILE_SECTIONS = ['Persona', 'Appearance', 'Voice', 'Skills', 'Media', 'Interactive Studio', 'Memories', 'Spells & scenes'] as const
export const LIBRARY_SECTIONS = ['Rig library', 'Media library', 'Action library'] as const
export type ProfileSection = typeof PROFILE_SECTIONS[number] | typeof LIBRARY_SECTIONS[number]

export interface SavedDraftRefresh {
  readonly submittedFingerprint: string
  readonly savedFingerprint: string
}

export function draftRefreshDecision(previous: ConsoleConfigDraftInput | null, incoming: ConsoleConfigDraftInput,
  local: ConsoleConfigDraftInput | null, expected: boolean, saved: SavedDraftRefresh | null = null): 'accept' | 'retain' | 'conflict' {
  if (saved && draftFingerprint(incoming) === saved.savedFingerprint) {
    return local && draftFingerprint(local) === saved.submittedFingerprint ? 'accept' : 'retain'
  }
  if (expected || !previous || !local || draftFingerprint(previous) === draftFingerprint(local)) return 'accept'
  return draftFingerprint(previous) === draftFingerprint(incoming) ? 'retain' : 'conflict'
}

/** The editable draft fields of a saved Config view (drops configVersion and read-only extras). */
export function safeDraftFromConfig(value: ConsoleConfigDraftInput): ConsoleConfigDraftInput {
  return {
    ...(value.avatarCatalog ? { avatarCatalog: structuredClone(value.avatarCatalog) } : {}),
    ...(value.presentation ? { presentation: structuredClone(value.presentation) } : {}),
    personaName: value.personaName,
    voice: value.voice,
    idleSeconds: value.idleSeconds,
    wake: { ...value.wake },
    faceModel: { ...value.faceModel },
    assets: { ...value.assets },
    adapters: { ...value.adapters },
    visualAssets: structuredClone(value.visualAssets),
    musicAssets: structuredClone(value.musicAssets),
    sceneActions: structuredClone(value.sceneActions),
    spells: structuredClone(value.spells),
    scenes: structuredClone(value.scenes),
  }
}

export const DRAFT_CONFLICT_MESSAGE = 'The draft was changed in another Console while you were editing. Your edits are kept here; saving is blocked so they cannot overwrite the newer draft.'

/** Main refused a save or publish made from an outdated read; read Config again (unsaved edits stay). */
export const isStaleConfigFailure = (error: string): boolean =>
  error === 'console_config_draft_conflict' || error === 'console_config_diff_stale'

export function consoleFailureText(response: Extract<ConsoleResponse<unknown>, { ok: false }>): string {
  return `${response.error}: ${response.reason}${response.fields?.length
    ? ` · ${response.fields.map(field => `${field.path}: ${field.message}`).join(' · ')}` : ''}`
}

/** A Config/Models read replaces an editor only when it holds no unsaved edits (or after its own save). */
export function acceptsEditorRefresh<T>(base: T | null, local: T | null, accept: boolean): boolean {
  return accept || base === null || local === null || same(base, local)
}

/**
 * Save & apply may publish only this save's own changes: the live config must equal the saved draft
 * the edits started from. Earlier saved-but-unpublished or model changes go through the whole-draft review.
 */
export function saveApplyDecision(savedBefore: ConsoleConfigDraftInput, fresh: ConsoleConfigPayload):
  'publish' | 'up_to_date' | 'models_pending' | 'other_pending' {
  if (!fresh.publishDiff.changed.length) return 'up_to_date'
  if (fresh.publishDiff.changed.some(change => change.kind === 'model')) return 'models_pending'
  return draftFingerprint(safeDraftFromConfig(fresh.active)) === draftFingerprint(safeDraftFromConfig(savedBefore))
    ? 'publish' : 'other_pending'
}

export function newAvatar(id: string): AvatarProfile {
  return { id, name: REALTIME_PROMPTS.authoring.newAvatarName, personality: REALTIME_PROMPTS.authoring.newAvatarPersonality,
    speakingStyle: '', voice: 'alloy', idleSeconds: 120, modelId: 'builtin-ren',
    presentation: { ...DEFAULT_PRESENTATION }, scenes: [], spells: [],
    voiceSpeed: 1, voiceEffects: { ...DEFAULT_VOICE_EFFECTS },
    mediaSkill: structuredClone(DEFAULT_MEDIA_SKILL),
    skills: { ...DEFAULT_AVATAR_SKILLS },
    experience: defaultExperience(),
    wakePhrase: DEFAULT_WAKE_PHRASE, sleepPhrase: DEFAULT_SLEEP_PHRASE, cloudSearchPhrase: DEFAULT_CLOUD_SEARCH_PHRASE }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
export function workspaceChanges(before: ConsoleConfigDraftInput, after: ConsoleConfigDraftInput): string[] {
  const old = before.avatarCatalog?.avatars ?? [], next = after.avatarCatalog?.avatars ?? []
  const changedActions = new Set([...before.sceneActions, ...after.sceneActions].filter(a =>
    !same(before.sceneActions.find(b => b.id === a.id), after.sceneActions.find(b => b.id === a.id))).map(a => a.id))
  const profiles = [...new Map([...old, ...next].map(a => [a.id, a])).values()].filter(a =>
    !same(old.find(b => b.id === a.id), next.find(b => b.id === a.id))
    || [...old, ...next].filter(b => b.id === a.id).some(b => b.scenes.some(s => s.stages.some(st => st.actionIds.some(id => changedActions.has(id))))))
  const result = profiles.map(a => `${a.name} · ${a.id.slice(-8)}`)
  for (const [key, label] of [['sceneActions', 'Shared actions'], ['visualAssets', 'Shared visuals'], ['musicAssets', 'Shared audio'],
    ['wake', 'Wake settings'], ['faceModel', 'Face settings'], ['assets', 'System assets'], ['adapters', 'Devices & adapters']] as const) {
    if (!same(before[key], after[key])) result.push(label)
  }
  if (!same(before.avatarCatalog?.locks, after.avatarCatalog?.locks)) result.push('Resource access')
  if (!same(before.avatarCatalog?.models, after.avatarCatalog?.models)) result.push('Rig catalog')
  return result
}

export function avatarActivationReason(payload: ConsoleConfigPayload | null, avatarId: string, dirty: boolean, lifecycle?: string): string {
  if (!payload) return 'Waiting for configuration.'
  if (payload.active.avatarCatalog?.activeAvatarId === avatarId) return 'Already on the Mirror.'
  if (dirty) return 'Save all changes first.'
  if (payload.publishDiff.changed.length) return 'Open Avatars to review and publish saved changes first.'
  if (!payload.active.avatarCatalog?.avatars.some(a => a.id === avatarId)) return 'Publish this new avatar first.'
  if (lifecycle !== 'dormant') return 'End the conversation and wait for Dormant before switching avatars.'
  return ''
}
