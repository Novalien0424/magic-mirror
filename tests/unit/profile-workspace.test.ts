import { describe, expect, it } from 'vitest'
import { newAvatar, workspaceChanges, avatarActivationReason, draftRefreshDecision } from '../../src/renderer/console/profile-workspace'
import type { ConsoleConfigDraftInput, ConsoleConfigPayload } from '../../src/shared/console-types'

describe('profile workspace ownership', () => {
  it('retains unsaved edits on identical refresh and conflicts on a newer saved revision', () => {
    const saved = {personaName:'Saved', sceneActions:[]} as unknown as ConsoleConfigDraftInput
    const local = {...saved, personaName:'Unsaved'}
    const newer = {...saved, personaName:'External revision'}
    expect(draftRefreshDecision(saved, structuredClone(saved), local, false)).toBe('retain')
    expect(draftRefreshDecision(saved, newer, local, false)).toBe('conflict')
    expect(draftRefreshDecision(saved, newer, saved, false)).toBe('accept')
    expect(draftRefreshDecision(saved, local, local, true)).toBe('accept')
  })
  it('creates an independent valid neutral profile without inherited resource links', () => {
    const a = newAvatar('a'), b = newAvatar('b')
    a.presentation.backgroundId = 'private-resource'
    expect(b.presentation.backgroundId).toBe('')
    expect(b.presentation.sleepFarewell).toBeTruthy()
    expect(b.modelId).toBe('builtin-ren')
    expect(b.scenes).toEqual([])
    expect(b.voiceEffects?.enabled).toBe(false)
  })
  it('derives scope after reload from snapshots and names shared action consumers', () => {
    const a = newAvatar('avatar-a'), b = newAvatar('avatar-b')
    a.name = 'First'; b.name = 'Second'
    a.scenes = [{ id: 's', stages: [{ actionIds: ['x'] }] }] as AvatarProfileScenes
    const before = { avatarCatalog: { avatars: [a, b], models: [], locks: [] }, sceneActions: [{id:'x', name:'Before'}] } as unknown as ConsoleConfigDraftInput
    const after = structuredClone(before)
    ;(after.sceneActions[0] as { name: string }).name = 'After'
    const scope = workspaceChanges(before, after)
    expect(scope).toContain('First · avatar-a')
    expect(scope).not.toContain('Second · avatar-b')
    expect(scope).toContain('Shared actions')
  })
  it('explains global unpublished changes and non-Dormant switching', () => {
    const payload = { active: { avatarCatalog: { activeAvatarId:'a', avatars: [newAvatar('a'), newAvatar('b')] } }, publishDiff: { changed: [] } } as unknown as ConsoleConfigPayload
    expect(avatarActivationReason(payload, 'b', false, 'active')).toContain('End the conversation')
    expect(avatarActivationReason(payload, 'b', false, 'dormant')).toBe('')
    expect(avatarActivationReason(payload, 'a', false, 'dormant')).toBe('Already on the Mirror.')
    expect(avatarActivationReason(payload, 'b', true, 'dormant')).toContain('Save all')
  })
})
type AvatarProfileScenes = ReturnType<typeof newAvatar>['scenes']
