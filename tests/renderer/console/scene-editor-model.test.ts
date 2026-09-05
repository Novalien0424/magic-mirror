import { expect, it } from 'vitest'
import { duplicateStage } from '../../../src/renderer/console/scene-editor-model'

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
