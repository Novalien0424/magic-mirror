import { describe, expect, it } from 'vitest'
import { estimateSceneMaximumMs } from '../../../src/renderer/console/scene-estimate'
import type { ManagedVisualAsset, SceneActionDefinition, SceneDefinition } from '../../../src/shared/types'

describe('Console Scene maximum estimate', () => {
  it('adds duration, imported once-video duration, and until-stopped maximum', () => {
    const actions: SceneActionDefinition[] = [{
      id: 'visual', name: 'Visual', enabled: true, kind: 'visual', assetId: 'asset',
      fit: 'contain', playback: 'once', audio: 'muted', gain: 0,
    }]
    const assets: ManagedVisualAsset[] = [{
      id: 'asset', name: 'Asset', kind: 'video', fileName: 'asset.webm', mimeType: 'video/webm',
      byteLength: 100, sha256: 'a'.repeat(64), width: 360, height: 640, orientation: 'portrait',
      durationMs: 3000, audioTrack: 'absent', windowsDecode: 'passed',
    }]
    const scene: SceneDefinition = {
      id: 'scene', name: 'Scene', enabled: true, stages: [
        { id: 'one', name: 'One', endCondition: { kind: 'duration', durationMs: 500 }, actionIds: [] },
        { id: 'two', name: 'Two', endCondition: { kind: 'video_complete', visualActionId: 'visual' }, actionIds: ['visual'] },
        { id: 'three', name: 'Three', endCondition: { kind: 'until_stopped', maxRuntimeMs: 10_000 }, actionIds: [] },
      ],
    }
    expect(estimateSceneMaximumMs(scene, actions, assets)).toBe(13_500)
  })
})
