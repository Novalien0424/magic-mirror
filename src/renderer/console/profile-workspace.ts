import type { AvatarProfile } from '../../shared/avatar-profiles'
import type { ConsoleConfigDraftInput, ConsoleConfigPayload } from '../../shared/console-types'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'
import { DEFAULT_VOICE_EFFECTS } from '../../shared/voice-effects'
import { draftFingerprint } from './scene-editor-model'

export const PROFILE_SECTIONS = ['Persona', 'Appearance', 'Voice', 'Spells & scenes'] as const
export const LIBRARY_SECTIONS = ['Rig library', 'Media library', 'Action library'] as const
export type ProfileSection = typeof PROFILE_SECTIONS[number] | typeof LIBRARY_SECTIONS[number]

export function draftRefreshDecision(previous: ConsoleConfigDraftInput | null, incoming: ConsoleConfigDraftInput,
  local: ConsoleConfigDraftInput | null, expected: boolean): 'accept' | 'retain' | 'conflict' {
  if (expected || !previous || !local || draftFingerprint(previous) === draftFingerprint(local)) return 'accept'
  return draftFingerprint(previous) === draftFingerprint(incoming) ? 'retain' : 'conflict'
}

export function newAvatar(id: string): AvatarProfile {
  return { id, name: 'New avatar', personality: 'You are a friendly conversational companion.',
    speakingStyle: '', voice: 'alloy', idleSeconds: 120, modelId: 'builtin-ren',
    presentation: { ...DEFAULT_PRESENTATION }, scenes: [], spells: [],
    voiceSpeed: 1, voiceEffects: { ...DEFAULT_VOICE_EFFECTS } }
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
  if (dirty) return 'Save all changes first.'
  if (payload.publishDiff.changed.length) return 'Publish saved changes first. See the full scope below.'
  if (!payload.active.avatarCatalog?.avatars.some(a => a.id === avatarId)) return 'Publish this new avatar first.'
  if (payload.active.avatarCatalog.activeAvatarId === avatarId) return 'Already on the Mirror.'
  if (lifecycle !== 'dormant') return 'End the conversation and wait for Dormant before switching avatars.'
  return ''
}
