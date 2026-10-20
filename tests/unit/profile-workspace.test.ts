import { describe, expect, it } from 'vitest'
import { newAvatar, workspaceChanges, avatarActivationReason, draftRefreshDecision } from '../../src/renderer/console/profile-workspace'
import type { ConsoleConfigDraftInput, ConsoleConfigPayload } from '../../src/shared/console-types'
import { avatarCatalogSchema } from '../../src/main/avatar/avatar-config'
import { projectAvatarDraft } from '../../src/renderer/console/avatar-editor'
import { buildSceneDraftSave, draftFingerprint } from '../../src/renderer/console/scene-editor-model'

function syntheticDraft(): ConsoleConfigDraftInput {
  const avatar = newAvatar('synthetic-avatar')
  avatar.name = 'Synthetic'
  avatar.presentation = { mode: 'always_visible', backgroundId: '', ambienceId: '', ambienceGain: 0.25,
    entranceMs: 1800, exitMs: 1800 }
  delete avatar.voiceSpeed
  delete avatar.voiceEffects
  return projectAvatarDraft({ avatarCatalog: { activeAvatarId: avatar.id, avatars: [avatar], locks: [], models: [] },
    personaName: avatar.name, voice: avatar.voice, idleSeconds: avatar.idleSeconds,
    wake: { phrase: 'Synthetic wake', modelVersion: 'synthetic', packageId: 'synthetic' },
    faceModel: { detectorId: 'synthetic', recognizerId: 'synthetic' },
    assets: { offlineLoopVideo: '', avatarDir: '', musicDir: '' },
    adapters: { lighting: 'mock', fog: 'mock', music: 'mock' },
    visualAssets: [], musicAssets: [], sceneActions: [], scenes: [], spells: [] })
}

function canonicalDraft(submitted: ConsoleConfigDraftInput): ConsoleConfigDraftInput {
  return projectAvatarDraft({ ...submitted, avatarCatalog: avatarCatalogSchema.parse(submitted.avatarCatalog) })
}

function savedRefresh(submitted: ConsoleConfigDraftInput, saved: ConsoleConfigDraftInput) {
  return { submittedFingerprint: draftFingerprint(submitted), savedFingerprint: draftFingerprint(saved) }
}

describe('profile workspace ownership', () => {
  it('clears dirty state after accepting the canonical save of the submitted presentation and avatar defaults', () => {
    const baseline = syntheticDraft(), submitted = structuredClone(baseline)
    submitted.avatarCatalog!.avatars[0]!.presentation.ambienceGain = 0.5
    const canonical = canonicalDraft(submitted)
    expect(canonical.avatarCatalog!.avatars[0]!.voiceSpeed).toBe(1)
    expect(canonical.avatarCatalog!.avatars[0]!.voiceEffects?.enabled).toBe(false)
    expect(canonical.presentation!.activeAmbienceGain).toBe(0)
    expect(draftFingerprint(submitted) === draftFingerprint(canonical)).toBe(false)
    const decision = draftRefreshDecision(baseline, canonical, submitted, false, savedRefresh(submitted, canonical))
    expect(decision).toBe('accept')
    const local = decision === 'accept' ? canonical : submitted
    expect(draftFingerprint(local) !== draftFingerprint(canonical)).toBe(false)
    expect(draftRefreshDecision(canonical, structuredClone(canonical), local, false)).toBe('accept')
  })
  it('retains edits made after submission or while waiting for the canonical refresh', () => {
    const baseline = syntheticDraft(), submitted = structuredClone(baseline)
    submitted.avatarCatalog!.avatars[0]!.presentation.ambienceGain = 0.5
    const canonical = canonicalDraft(submitted), newer = structuredClone(submitted)
    newer.avatarCatalog!.avatars[0]!.voice = 'cedar'
    const expected = savedRefresh(submitted, canonical)
    expect(draftRefreshDecision(baseline, canonical, newer, false, expected)).toBe('retain')
    expect(draftRefreshDecision(canonical, structuredClone(canonical), newer, false, expected)).toBe('retain')
    expect(draftRefreshDecision(baseline, canonical, structuredClone(baseline), false, expected)).toBe('retain')
    expect(draftRefreshDecision(baseline, canonical, null, false, expected)).toBe('retain')
    expect(draftFingerprint(newer) !== draftFingerprint(canonical)).toBe(true)
  })
  it('does not accept unrelated concurrent refreshes as the saved snapshot', () => {
    const baseline = syntheticDraft(), submitted = structuredClone(baseline)
    submitted.avatarCatalog!.avatars[0]!.presentation.ambienceGain = 0.5
    const canonical = canonicalDraft(submitted), external = canonicalDraft(baseline)
    external.avatarCatalog!.avatars[0]!.voice = 'cedar'
    const expected = savedRefresh(submitted, canonical)
    expect(draftRefreshDecision(baseline, structuredClone(baseline), submitted, false, expected)).toBe('retain')
    expect(draftRefreshDecision(baseline, external, submitted, false, expected)).toBe('conflict')
    // An unrelated conflict cancels the pending acceptance; a late save refresh keeps the local edit.
    expect(draftRefreshDecision(external, canonical, submitted, false)).toBe('conflict')
  })
  it('does not replace unrelated workspace edits with a canonical partial step save', () => {
    const baseline = { ...syntheticDraft(), sceneActions: [{ id: 'synthetic-action', name: 'Synthetic action',
      enabled: true, kind: 'music' as const, command: 'stop' as const, fadeDurationMs: 0 }] }
    baseline.avatarCatalog!.avatars[0]!.scenes = [{ id: 'synthetic-scene', name: 'Synthetic scene', enabled: true,
      stages: ['first', 'second'].map(id => ({ id, name: id, actionIds: ['synthetic-action'],
        endCondition: { kind: 'duration' as const, durationMs: 1000 } })) }]
    const local = structuredClone(baseline)
    local.avatarCatalog!.avatars[0]!.name = 'Unsaved name'
    local.avatarCatalog!.avatars[0]!.scenes[0]!.stages[0]!.name = 'Selected edit'
    local.avatarCatalog!.avatars[0]!.scenes[0]!.stages[1]!.name = 'Other edit'
    const partial = buildSceneDraftSave(baseline, local, 'synthetic-avatar', 'synthetic-scene', 'first')
    const canonical = canonicalDraft(partial)
    expect(canonical.avatarCatalog!.avatars[0]!.scenes[0]!.stages.map(stage => stage.name)).toEqual(['Selected edit', 'second'])
    expect(draftRefreshDecision(baseline, canonical, local, false, savedRefresh(partial, canonical))).toBe('retain')
    expect(local.avatarCatalog!.avatars[0]!.name).toBe('Unsaved name')
    expect(local.avatarCatalog!.avatars[0]!.scenes[0]!.stages[1]!.name).toBe('Other edit')
  })
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
    const pending = { ...payload, publishDiff: { ...payload.publishDiff, changed: [{} as never] } }
    expect(avatarActivationReason(pending, 'a', true, 'dormant')).toBe('Already on the Mirror.')
    expect(avatarActivationReason(pending, 'b', false, 'dormant')).toContain('Avatars')
  })
})
type AvatarProfileScenes = ReturnType<typeof newAvatar>['scenes']
