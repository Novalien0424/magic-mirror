import { describe, expect, it } from 'vitest'
import { MediaSearchContext } from '../../src/renderer/realtime/media-search-context'
import type { MediaDiscoveryReply } from '../../src/shared/media-discovery'
const request = { query: 'Night', kind: 'music' as const }
const resources = ['piano', 'strings'].map(assetId => ({ assetId, kind: 'music' as const, name: assetId, aliases: [] }))
const ambiguous: MediaDiscoveryReply = { status: 'accepted', code: 'media_discovery_ambiguous', resources, total: 2 }

describe('pending media search', () => {
  it('requires a later visitor choice for ambiguity and rejects invented or stale assets', () => {
    const context = new MediaSearchContext()
    context.remember(request, ambiguous, 1, false)
    expect(context.selection('music', 'piano', 1)).toBe('clarify')
    expect(context.selection('music', 'piano', 2)).toBe('ready')
    expect(context.selection('video', 'piano', 2)).toBe('missing')
    expect(context.selection('music', 'invented', 2)).toBe('missing')
    expect(context.selection('music', 'piano', 3)).toBe('missing')
  })
  it('refines only the previous shortlist against fresh authorized results', () => {
    const context = new MediaSearchContext()
    context.remember(request, ambiguous, 1, false)
    const next = context.prepare({ query: 'piano', kind: 'all' }, 'refine', 2)!
    expect(next).toEqual({ query: 'piano', kind: 'music' })
    const found = context.remember(next, { ...ambiguous, resources: [resources[0]!, { ...resources[0]!, assetId: 'different-song' }] }, 2, true)
    expect(found).toMatchObject({ code: 'media_discovery_matches', total: 1, resources: [resources[0]] })
    expect(context.selection('music', 'piano', 2)).toBe('ready')
  })
  it('carries a miss into refinement but replaces clues for a new/corrected title', () => {
    const context = new MediaSearchContext()
    context.remember(request, { ...ambiguous, resources: [], total: 0, code: 'media_discovery_no_match' }, 1, false)
    expect(context.prepare({ query: 'piano', kind: 'all' }, 'refine', 2)).toEqual({ query: 'Night piano', kind: 'music' })
    expect(context.prepare({ query: 'Rain', kind: 'video' }, 'new', 2)).toEqual({ query: 'Rain', kind: 'video' })
    expect(context.selection('music', 'piano', 2)).toBe('missing')
  })
  it('clears on cancellation/topic replies and explicit close, not its own clarification', () => {
    const context = new MediaSearchContext()
    context.remember(request, ambiguous, 1, false); context.endReply(1)
    expect(context.selection('music', 'piano', 1)).toBe('clarify')
    context.endReply(2)
    expect(context.prepare(request, 'refine', 2)).toEqual(request)
    expect(context.selection('music', 'piano', 2)).toBe('missing')
    context.remember(request, ambiguous, 3, false); context.clear()
    expect(context.selection('music', 'piano', 3)).toBe('missing')
  })
  it('searches complete fresh clues when the model labels an expired request refine', () => {
    const context = new MediaSearchContext()
    context.remember(request, ambiguous, 1, false)
    const replacement = { query: '天使 葛麗果女祭司版本', kind: 'music' as const }
    expect(context.prepare(replacement, 'refine', 4)).toEqual(replacement)
    expect(context.selection('music', 'piano', 4)).toBe('missing')
  })
  it('replays a successful resource on a later turn, never through a conflicting pending search or after reset', () => {
    const context = new MediaSearchContext()
    context.played('music', 'piano', 1)
    expect(context.selection('music', 'piano', 1)).toBe('missing')
    expect(context.selection('music', 'piano', 2)).toBe('ready')
    expect(context.selection('video', 'piano', 2)).toBe('missing')
    context.remember({ ...request, query: 'Night jazz' }, { ...ambiguous, resources: [], total: 0, code: 'media_discovery_no_match' }, 2, false)
    expect(context.selection('music', 'piano', 2)).toBe('missing')
    context.endReply(3)
    expect(context.selection('music', 'piano', 4)).toBe('ready')
    context.reset()
    expect(context.selection('music', 'piano', 4)).toBe('missing')
  })
})
