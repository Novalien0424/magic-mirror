import { describe, expect, it, vi } from 'vitest'
import { mergedMediaTool } from '../../src/renderer/realtime/merged-media-tool'

const args = { source: 'auto', query: 'Rain', assetId: '', url: '', kind: 'music', mode: 'once' }
function setup(source: 'auto' | 'local' | 'youtube' = 'auto') {
  const api = {
    current: vi.fn(() => true), source: () => source,
    restriction: vi.fn(async () => undefined as 'media_source_restricted' | 'media_source_unconfirmed' | undefined),
    find: vi.fn(async () => ({ status: 'accepted' as const, code: 'media_discovery_no_match', resources: [] as { kind: 'music'; assetId: string; name: string; aliases: string[] }[], total: 0 })),
    search: vi.fn(async () => ({ status: 'accepted' as const, code: 'youtube_search_results' as const, videos: [{ url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Rain', channel: 'Fixture' }] })),
    play: vi.fn(async () => 'accepted' as const),
  }
  return { api, run: mergedMediaTool(api) }
}
describe('QA merged media tool', () => {
  it('keeps a transcript local restriction even when model arguments request YouTube', async () => {
    const { api, run } = setup('local')
    expect(await run({ ...args, source: 'youtube' })).toMatchObject({ outcome: 'rejected', code: 'media_not_found' })
    expect(api.search).not.toHaveBeenCalled(); expect(api.play).not.toHaveBeenCalled()
  })
  it('selects the unique local match and keeps explicit loop mode', async () => {
    const { api, run } = setup()
    api.find.mockResolvedValue({ status: 'accepted', code: 'media_discovery_matches', resources: [{ kind: 'music', assetId: 'rain', name: 'Rain', aliases: [] }], total: 1 })
    expect(await run({ ...args, mode: 'loop' })).toMatchObject({ outcome: 'accepted', playback: { assetId: 'rain', mode: 'loop' } })
    expect(api.search).not.toHaveBeenCalled()
  })
  it('returns ambiguous local candidates without playback or online fallback', async () => {
    const { api, run } = setup()
    api.find.mockResolvedValue({ status: 'accepted', code: 'media_discovery_ambiguous', resources: [{ kind: 'music', assetId: 'rain', name: 'Rain', aliases: [] }], total: 1 })
    expect(await run(args)).toMatchObject({ outcome: 'accepted', next: 'ask' })
    expect(api.play).not.toHaveBeenCalled(); expect(api.search).not.toHaveBeenCalled()
  })
  it('falls back only after a local miss, retaining actual discovery evidence', async () => {
    const { api, run } = setup()
    expect(await run(args)).toMatchObject({ outcome: 'accepted', media: { code: 'media_discovery_no_match' }, youtube: { status: 'accepted' }, playback: { action: 'play_youtube', mode: 'once' } })
    expect(api.find.mock.invocationCallOrder[0]).toBeLessThan(api.search.mock.invocationCallOrder[0]!)
  })
  it('waits for selection among multiple YouTube results', async () => {
    const { api, run } = setup('youtube')
    api.search.mockResolvedValue({ status: 'accepted', code: 'youtube_search_results', videos: [1, 2].map(n => ({ url: 'https://www.youtube.com/watch?v=abcdefghij' + n, title: 'Rain', channel: 'Fixture' })) })
    expect(await run(args)).toMatchObject({ next: 'ask' })
    expect(api.play).not.toHaveBeenCalled()
  })
  it('never sends an unconfirmed source query or acts after turn ownership changes', async () => {
    const { api, run } = setup()
    api.restriction.mockResolvedValue('media_source_unconfirmed')
    expect(await run(args)).toMatchObject({ code: 'media_source_unconfirmed' })
    expect(api.search).not.toHaveBeenCalled()
    api.restriction.mockResolvedValue(undefined)
    api.find.mockImplementation(async () => { api.current.mockReturnValue(false); return { status: 'accepted', code: 'media_discovery_no_match', resources: [], total: 0 } })
    expect(await run(args)).toBe('ignored')
    expect(api.search).not.toHaveBeenCalled()
  })
})
