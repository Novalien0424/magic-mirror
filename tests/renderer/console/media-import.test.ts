import { describe, expect, it, vi } from 'vitest'
import { importMediaBatch } from '../../../src/renderer/console/media-import'

describe('media batch import', () => {
  it('keeps successful files when another visual fails decode, and cancels its pending copy', async () => {
    const cancelled: string[] = []
    const bridge = {
      importMedia: async () => ({ ok: true as const, value: [
        { kind: 'visual', pending: { token: 'bad', name: 'Bad video' } },
        { kind: 'music', asset: { id: 'music-one', name: 'Tone' } },
        { kind: 'visual', pending: { token: 'good', name: 'Image' } },
      ] }),
      finalizeVisual: async () => ({ ok: true as const, value: { id: 'visual-one', name: 'Image' } }),
      cancelVisual: async (token: string) => { cancelled.push(token); return { ok: true as const, value: { status: 'cancelled' as const } } },
    }
    const result = await importMediaBatch(bridge as never, { kind: 'all', multiple: true }, async p => {
      if (p.token === 'bad') throw new Error('visual_asset_decode_failed')
      return { width: 100, height: 100, audioTrack: 'absent' }
    })
    expect(result.assets.map(a => a.id)).toEqual(['music-one', 'visual-one'])
    expect(result.failures).toEqual([{ name: 'Bad video', reason: 'visual_asset_decode_failed' }])
    expect(cancelled).toEqual(['bad'])
  })
  it('reports cancellation without attempting decode or changing media', async () => {
    const probe = vi.fn()
    const result = await importMediaBatch({ importMedia: async () => ({ ok: true, value: [] }) } as never,
      { kind: 'all', multiple: true }, probe)
    expect(result).toEqual({ assets: [], failures: [], cancelled: true })
    expect(probe).not.toHaveBeenCalled()
  })
  it('does not expose arbitrary bridge exceptions', async () => {
    const result = await importMediaBatch({ importMedia: async () => { throw new Error('private path') } } as never,
      { kind: 'music', multiple: false })
    expect(result.failures).toEqual([{ name: 'Selection', reason: 'media_import_failed' }])
  })
})
