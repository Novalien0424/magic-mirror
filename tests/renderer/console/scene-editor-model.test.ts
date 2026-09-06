import { expect, it } from 'vitest'
import { duplicateStage, buildSceneDraftSave, draftFingerprint, isSceneDraftSaved } from '../../../src/renderer/console/scene-editor-model'
import type { ConsoleConfigDraftInput } from '../../../src/shared/console-types'

it('duplicates actions independently and remaps the video completion reference', () => {
  const action = { id: 'video', name: 'Video', enabled: true, kind: 'visual' as const,
    assetId: 'asset', fit: 'cover' as const, playback: 'once' as const, audio: 'muted' as const, gain: 0 }
  const original = { id: 'one', name: 'One', actionIds: ['video'],
    endCondition: { kind: 'video_complete' as const, visualActionId: 'video' } }
  let id = 0
  const copy = duplicateStage(original, [action], () => `copy-${++id}`)
  expect(copy.stage.actionIds).toEqual(['copy-1'])
  expect(copy.stage.endCondition).toEqual({ kind: 'video_complete', visualActionId: 'copy-1' })
  copy.actions[0]!.name = 'Edited'
  expect(action.name).toBe('Video')
  expect(original.actionIds).toEqual(['video'])
})

it('saves one step and its dependencies without saving other edits or switching avatars', () => {
  const stage = (id: string) => ({ id, name: id, actionIds: [id], endCondition: { kind: 'duration' as const, durationMs: 1000 } })
  const scene = { id: 'scene', name: 'Scene', enabled: true, stages: [stage('one'), stage('two')] }
  const saved = { scenes: [scene], spells: [], sceneActions: ['one', 'two'].map(id => ({ id, name: id, kind: 'music', command: 'play', assetId: id })),
    musicAssets: [{ id: 'one' }, { id: 'two' }], visualAssets: [], voice: 'coral',
    avatarCatalog: { activeAvatarId: 'a', avatars: [{ id: 'a', scenes: [scene], spells: [], name: 'A', voice: 'coral' }], locks: [], models: [] },
  } as unknown as ConsoleConfigDraftInput
  const edited = structuredClone(saved)
  edited.avatarCatalog!.avatars[0]!.scenes[0]!.stages[0]!.name = 'Saved change'
  edited.avatarCatalog!.avatars[0]!.scenes[0]!.stages[1]!.name = 'Keep unsaved'
  edited.sceneActions[0]!.name = 'Saved action'
  edited.sceneActions[1]!.name = 'Unsaved action'
  edited.avatarCatalog!.avatars[0]!.voice = 'cedar'
  const next = buildSceneDraftSave(saved, edited, 'a', 'scene', 'one')
  expect(next.scenes[0]!.stages.map(s => s.name)).toEqual(['Saved change', 'two'])
  expect(next.sceneActions.map(a => a.name)).toEqual(['Saved action', 'two'])
  expect(next.voice).toBe('coral')
  expect(next.avatarCatalog!.activeAvatarId).toBe('a')
  expect(saved.scenes[0]!.stages[0]!.name).toBe('one')
  expect(isSceneDraftSaved(saved, saved, 'a', 'scene', 'one')).toBe(true)
  expect(isSceneDraftSaved(saved, edited, 'a', 'scene', 'one')).toBe(false)
  expect(isSceneDraftSaved(next, edited, 'a', 'scene', 'one')).toBe(true)
  expect(isSceneDraftSaved(next, edited, 'a', 'scene', 'two')).toBe(false)
})

it('does not label legacy presentation defaults as unsaved scene edits', () => {
  const scene = { id: 's', name: 'Scene', enabled: true, stages: [{ id: 'one', name: 'One', actionIds: [], endCondition: { kind: 'duration', durationMs: 1000 } }] }
  const saved = { scenes: [scene], spells: [], sceneActions: [], musicAssets: [], visualAssets: [],
    avatarCatalog: { activeAvatarId: 'a', avatars: [{ id: 'a', scenes: [scene], spells: [], presentation: { mode: 'always_visible' } }] },
  } as unknown as ConsoleConfigDraftInput
  expect(isSceneDraftSaved(saved, saved, 'a', 's', 'one')).toBe(true)
  expect(isSceneDraftSaved(saved, saved, 'a', 's')).toBe(true)
  const persisted = buildSceneDraftSave(saved, saved, 'a', 's', 'one')
  // Validation may reorder object keys; only array ordering is meaningful.
  const reordered = JSON.parse(JSON.stringify(persisted, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).reverse()) : value))
  expect(draftFingerprint(saved)).toBe(draftFingerprint(reordered))
  reordered.avatarCatalog.avatars[0].scenes[0].name = 'Changed'
  expect(draftFingerprint(saved)).not.toBe(draftFingerprint(reordered))
})

it('creates a new scene with only the selected new step and its spell', () => {
  const saved = { scenes: [], spells: [], sceneActions: [], visualAssets: [], musicAssets: [] } as unknown as ConsoleConfigDraftInput
  const edited = { ...saved, scenes: [{ id: 's', name: 'New', enabled: true, stages: [
    { id: 'first', name: 'First', actionIds: [], endCondition: { kind: 'duration' as const, durationMs: 1000 } },
    { id: 'second', name: 'Second', actionIds: [], endCondition: { kind: 'duration' as const, durationMs: 2000 } },
  ] }], spells: [{ id: 'spell', sceneId: 's' }] } as unknown as ConsoleConfigDraftInput
  const next = buildSceneDraftSave(saved, edited, '', 's', 'second')
  expect(next.scenes[0]!.stages.map(s => s.id)).toEqual(['second'])
  expect(next.spells).toEqual(edited.spells)
  expect(buildSceneDraftSave(saved, edited, '', 's').scenes[0]!.stages).toHaveLength(2)
})

it('keeps a saved scene stable, and saves ordering only with Save scene', () => {
  const stage = (id: string) => ({ id, name: id, actionIds: [], endCondition: { kind: 'duration' as const, durationMs: 1000 } })
  const saved = { scenes: [{ id: 's', name: 'Scene', enabled: true, stages: [stage('one'), stage('two')] }],
    spells: [{ id: 'p', sceneId: 's' }, { id: 'other', sceneId: 'other' }], sceneActions: [], visualAssets: [], musicAssets: [],
  } as unknown as ConsoleConfigDraftInput
  expect(JSON.stringify(buildSceneDraftSave(saved, saved, '', 's'))).toBe(JSON.stringify(saved))
  const edited = { ...saved, scenes: [{ ...saved.scenes[0]!, stages: [stage('two'), stage('new'), stage('one')] }] }
  expect(buildSceneDraftSave(saved, edited, '', 's', 'two').scenes[0]!.stages.map(s => s.id)).toEqual(['one', 'two'])
  expect(buildSceneDraftSave(saved, edited, '', 's', 'new').scenes[0]!.stages.map(s => s.id)).toEqual(['one', 'two', 'new'])
  expect(buildSceneDraftSave(saved, edited, '', 's').scenes[0]!.stages.map(s => s.id)).toEqual(['two', 'new', 'one'])
})
