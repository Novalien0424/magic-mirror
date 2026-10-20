import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoopVideoPanel, loopVideoValidation, sameLoopVideoSettings } from '../../../src/renderer/console/LoopVideoPanel'
import { DEFAULT_LOOP_VIDEO, type LoopVideoSettings } from '../../../src/shared/operator-loop'
import type { FolderMediaEntry } from '../../../src/shared/media-folders'

const videoId = `folder-${'a'.repeat(40)}`, musicId = `folder-${'b'.repeat(40)}`
const entries: FolderMediaEntry[] = [
  { assetId: videoId, kind: 'video', name: 'Shared video', origin: 'shared', aliases: [] },
  { assetId: musicId, kind: 'music', name: 'Shared music', origin: 'shared', aliases: [] },
]
const settings: LoopVideoSettings = { ...DEFAULT_LOOP_VIDEO, videoId }

describe('global Loop Video Console settings', () => {
  it('accepts embedded video alone or separate shared music', () => {
    expect(loopVideoValidation(settings, entries)).toBe('')
    expect(loopVideoValidation({ ...settings, audioMode: 'separate', audioId: musicId }, entries)).toBe('')
  })
  it('requires available shared entries of the selected type and rejects avatar media', () => {
    expect(loopVideoValidation(DEFAULT_LOOP_VIDEO, entries)).toContain('Select a video')
    expect(loopVideoValidation({ ...settings, videoId: musicId }, entries)).toContain('unavailable')
    expect(loopVideoValidation({ ...settings, audioMode: 'separate', audioId: videoId }, entries)).toContain('Select available music')
    expect(loopVideoValidation(settings, entries.map(entry => ({ ...entry, origin: 'own' })))).toContain('unavailable')
    expect(loopVideoValidation(settings, [])).toContain('unavailable')
  })
  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid volume %s', volume => {
    expect(loopVideoValidation({ ...settings, volume }, entries)).toContain('Check')
  })
  it('detects unsaved changes in every setting independent of property order', () => {
    expect(sameLoopVideoSettings(settings, { volume: settings.volume, fit: settings.fit, audioId: '', audioMode: 'embedded', videoId })).toBe(true)
    for (const patch of [{ volume: .2 }, { fit: 'cover' as const }, { videoId: musicId }, { audioMode: 'separate' as const }, { audioId: musicId }]) {
      expect(sameLoopVideoSettings(settings, { ...settings, ...patch })).toBe(false)
    }
  })
  it('provides bounded unavailable/loading states; Return to Avatar lives in the Console control bar', () => {
    const html = renderToStaticMarkup(createElement(LoopVideoPanel, { bridge: null, visible: true, onMediaFolders() {} }))
    expect(html).toContain('Loop Video is unavailable')
    expect(html).not.toContain('>Return to Avatar</button>')
    expect(html).toContain('Loading saved settings')
    expect(html).toContain('Help: Loop Video')
    expect(html).toMatch(/disabled=""[^>]*>Play on Mirror/)
    expect(html).toMatch(/>Play on Mirror<\/button><span role="tooltip"[^>]*>Loop Video is unavailable\. Reopen the updated Console\.</)
    expect(html).not.toContain('<audio'); expect(html).not.toContain('autoPlay')
  })
})
