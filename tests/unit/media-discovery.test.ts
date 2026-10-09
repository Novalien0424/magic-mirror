import { describe, expect, it } from 'vitest'
import { parseMediaDiscoveryReply, parseMediaDiscoveryRequest, rankMediaResources,
  type MediaDiscoveryReply, type MediaDiscoveryRequest } from '../../src/shared/media-discovery'
import type { AvatarMediaResource } from '../../src/shared/media-skill'
import { DEFAULT_MEDIA_SKILL } from '../../src/shared/media-skill'
import { folderMediaSkill } from '../../src/shared/media-folders'

const resource = (assetId: string, name: string, aliases: string[] = [], kind: 'music' | 'video' = 'music'): AvatarMediaResource =>
  ({ kind, assetId, name, aliases })
const request = (query = '', kind: MediaDiscoveryRequest['kind'] = 'all'): MediaDiscoveryRequest => ({ query, kind })
const reply = (patch: Partial<MediaDiscoveryReply> = {}): MediaDiscoveryReply =>
  ({ status: 'accepted', code: 'media_discovery_matches', resources: [resource('rain', 'Rain')], total: 1, ...patch })
const ids = (value: MediaDiscoveryReply): string[] => value.resources.map(candidate => candidate.assetId)

describe('media discovery request boundary', () => {
  it('accepts exactly the two fields, empty queries, CJK and the 200-character boundary without changing text', () => {
    for (const kind of ['all', 'music', 'video'] as const) {
      for (const query of ['', '   ', '  雨夜・鋼琴  ', 'a'.repeat(200)]) {
        expect(parseMediaDiscoveryRequest({ query, kind })).toEqual({ query, kind })
      }
    }
  })
  it.each([
    null, [], 'rain', {}, { query: 'rain' }, { kind: 'all' }, { query: 1, kind: 'all' },
    { query: 'rain', kind: 'image' }, { query: 'a'.repeat(201), kind: 'all' },
    { query: 'rain', kind: 'all', path: '/private/media' },
    { query: 'rain', kind: 'all', action: 'play' },
    ...['\u0000', '\t', '\n', '\u001f', '\u007f', '\u0085', '\u009f', '\u202e', '\u200b']
      .map(control => ({ query: `rain${control}night`, kind: 'all' })),
  ])('rejects malformed requests and controls: %j', value => {
    expect(parseMediaDiscoveryRequest(value)).toBeNull()
  })
  it('rejects inherited fields even when the enumerable key count matches', () => {
    expect(parseMediaDiscoveryRequest(Object.assign(Object.create({ kind: 'all' }), { query: '', extra: true }))).toBeNull()
  })
})

describe('media discovery reply boundary', () => {
  it('accepts bounded public DTOs, detached copies and empty rejected/failed results', () => {
    const value = reply({ resources: [resource('clip', '雨夜', ['Rainy night'], 'video')] })
    const parsed = parseMediaDiscoveryReply(value)!
    expect(parsed).toEqual(value)
    parsed.resources[0]!.aliases.push('Different')
    expect(value.resources[0]!.aliases).toEqual(['Rainy night'])
    for (const status of ['accepted', 'rejected', 'failed'] as const) {
      expect(parseMediaDiscoveryReply(reply({ status, resources: [], total: 0 }))).toEqual(reply({ status, resources: [], total: 0 }))
    }
    const bounded = reply({ code: 'a'.repeat(80), total: 512,
      resources: Array.from({ length: 20 }, (_, index) => resource(`track-${index}`, 'a'.repeat(120), Array(16).fill('b'.repeat(120)))) })
    expect(parseMediaDiscoveryReply(bounded)).toEqual(bounded)
  })
  it.each([
    null, [], {}, { ...reply(), query: 'private query' }, { ...reply(), personId: 'private' },
    reply({ status: 'ignored' as MediaDiscoveryReply['status'] }),
    ...['', 'BadCode', 'with space', 'with\ncontrol', '/private/media', 'a'.repeat(81)].map(code => reply({ code })),
    ...[-1, 0, .5, 513, Infinity, NaN, '1'].map(total => ({ ...reply(), total })),
    { ...reply(), resources: {} },
    reply({ resources: Array.from({ length: 21 }, (_, index) => resource(`track-${index}`, 'Rain')), total: 21 }),
    reply({ resources: [resource('rain', 'Rain'), resource('rain', 'Other')], total: 2 }),
    reply({ status: 'rejected' }), reply({ status: 'failed' }),
    ...[
      null, [], { ...resource('rain', 'Rain'), path: '/private/media' },
      { ...resource('rain', 'Rain'), profileId: 'private' },
      { ...resource('rain', 'Rain'), kind: 'image' },
      resource('/private/rain.mp3', 'Rain'), resource('https://example.invalid/rain', 'Rain'),
      resource('a'.repeat(97), 'Rain'), resource('rain', ''), resource('rain', ' '), resource('rain', 'a'.repeat(121)),
      resource('rain', 'Bad\nname'), resource('rain', 'Rain\u0085'),
      resource('rain', 'Rain', ['']), resource('rain', 'Rain', ['a'.repeat(121)]),
      resource('rain', 'Rain', ['Bad\u202ealias']), resource('rain', 'Rain', Array(17).fill('Alias')),
      { ...resource('rain', 'Rain'), aliases: ['Rain', 1] }, { ...resource('rain', 'Rain'), aliases: 'Rain' },
    ].map(candidate => ({ ...reply(), resources: [candidate] })),
  ])('rejects malformed, unbounded or private reply fields: %j', value => {
    expect(parseMediaDiscoveryReply(value)).toBeNull()
  })
  it('rejects inherited resource fields substituted with an unknown own field', () => {
    const candidate = Object.assign(Object.create({ kind: 'music' }), { assetId: 'rain', name: 'Rain', aliases: [], path: '/private/media' })
    expect(parseMediaDiscoveryReply(reply({ resources: [candidate] }))).toBeNull()
  })
})

describe('public local media ranking', () => {
  it('finds literal aliases inside a request without confusing a title with a longer word', () => {
    const resources = [resource('sky', 'Night Sky', ['northern lights clip'], 'video'), resource('rain', 'Rain')]
    expect(ids(rankMediaResources(resources, request('Please show the northern lights clip', 'video')))).toEqual(['sky'])
    expect(ids(rankMediaResources(resources, request('play rainbow')))).toEqual([])
    expect(ids(rankMediaResources([resource('cloud', '雲海')], request('請播放雲海')))).toEqual(['cloud'])
  })
  it('marks equal best matches as ambiguous and retains all candidates', () => {
    const resources = [resource('piano', 'Rain — Piano'), resource('violin', 'Rain — Violin')]
    expect(rankMediaResources(resources, request('Rain'))).toMatchObject({ code: 'media_discovery_ambiguous', total: 2 })
    expect(rankMediaResources(resources, request('Rain Piano'))).toMatchObject({ code: 'media_discovery_matches', total: 1 })
  })
  it('preserves synthetic imported aliases and Rain ambiguity alongside folder resources', () => {
    const imported = [resource('qa-rain-piano', 'Rain — Fixture Pianist', ['雨聲鋼琴', '雨天鋼琴']),
      resource('qa-rain-violin', 'Rain — Fixture Violinist', ['雨聲小提琴']),
      resource('qa-small-cloud', 'Small Cloud', ['little cloud clip', '小雲片'], 'video')]
    const skill = folderMediaSkill({ ...DEFAULT_MEDIA_SKILL, resources: imported }, [
      { ...resource('folder-beacon', 'Folder Beacon'), origin: 'own' },
      { ...resource('shared-lantern', 'Shared Lantern'), origin: 'shared' },
    ])
    expect(parseMediaDiscoveryReply(rankMediaResources(skill.resources, request('little cloud clip', 'video'))))
      .toEqual(reply({ resources: [imported[2]!] }))
    expect(ids(rankMediaResources(skill.resources, request('小雲片', 'video')))).toEqual(['qa-small-cloud'])
    expect(ids(rankMediaResources(skill.resources, request('Rain', 'music')))).toEqual(['qa-rain-piano', 'qa-rain-violin'])
    expect(ids(rankMediaResources(skill.resources, request('rain fixture pianist', 'music')))).toEqual(['qa-rain-piano'])
    expect(rankMediaResources(skill.resources, request('Distant Harbor'))).toMatchObject({ total: 0, code: 'media_discovery_no_match' })
  })
  it('ranks exact names, exact aliases, partial names, partial aliases and multi-part clues without selecting one', () => {
    const resources = [resource('alias-partial', 'Zither', ['Rain at night']), resource('name-partial', 'Rain at night'),
      resource('alias-exact', 'Evening', ['Rain']), resource('name-exact', 'Rain'), resource('unrelated', 'Sunshine')]
    const result = rankMediaResources(resources, request('RAIN'))
    expect(ids(result)).toEqual(['name-exact', 'alias-exact', 'name-partial', 'alias-partial'])
    expect(result).toMatchObject({ status: 'accepted', code: 'media_discovery_matches', total: 4 })
    expect(ids(rankMediaResources(resources, request('night rain')))).toEqual(['name-partial', 'alias-partial'])
    expect(ids(rankMediaResources(resources, request('nig')))).toEqual(['name-partial', 'alias-partial'])
  })
  it('normalizes Unicode case, width, composition, punctuation and spacing', () => {
    const resources = [resource('cafe', 'Café—Moon’s Ｓｏｎｇ'), resource('other', 'Other')]
    for (const query of ['ＣＡＦÉ，ｍｏｏｎ’ｓ—ｓｏｎｇ', 'Cafe\u0301 / Moon\'s song', 'moon s', 'moon’s song']) {
      expect(ids(rankMediaResources(resources, request(query)))).toEqual(['cafe'])
    }
    expect(ids(rankMediaResources([resource('moon', 'Moon-light')], request('moonlight')))).toEqual(['moon'])
  })
  it('preserves literal CJK substring and spaced clue matching across titles and aliases', () => {
    const resources = [resource('piano', '雨夜・鋼琴曲'), resource('forest', '森林裡的雨夜', ['深夜森林']),
      resource('japanese', '月明かりの音楽'), resource('korean', '조용한 밤의 음악')]
    expect(ids(rankMediaResources(resources, request('雨夜')))).toEqual(['forest', 'piano'])
    expect(ids(rankMediaResources(resources, request('夜鋼琴')))).toEqual(['piano'])
    expect(ids(rankMediaResources(resources, request('鋼琴 雨夜')))).toEqual(['piano'])
    expect(ids(rankMediaResources(resources, request('深夜')))).toEqual(['forest'])
    expect(ids(rankMediaResources(resources, request('明かり')))).toEqual(['japanese'])
    expect(ids(rankMediaResources(resources, request('밤')))).toEqual(['korean'])
  })
  it('keeps ambiguous candidates and applies the requested kind filter', () => {
    const resources = [resource('rain-video', 'Rain', [], 'video'), resource('rain-music', 'Rain'), resource('river', 'River', ['Rain'])]
    expect(ids(rankMediaResources(resources, request('rain')))).toEqual(['rain-music', 'rain-video', 'river'])
    expect(ids(rankMediaResources(resources, request('rain', 'video')))).toEqual(['rain-video'])
    expect(ids(rankMediaResources(resources, request('rain', 'music')))).toEqual(['rain-music', 'river'])
  })
  it('lists an empty query, bounds replies to 20 candidates, and reports the full filtered total', () => {
    const resources = Array.from({ length: 30 }, (_, index) => resource(`rain-${String(index).padStart(2, '0')}`, 'Rain', [], index < 5 ? 'video' : 'music'))
    for (const query of ['', '  ', 'rain']) {
      const result = rankMediaResources(resources, request(query))
      expect(result).toMatchObject({ status: 'accepted', code: 'media_discovery_truncated', total: 30 })
      expect(result.resources).toHaveLength(20)
      expect(parseMediaDiscoveryReply(result)).toEqual(result)
    }
    expect(rankMediaResources(resources, request('', 'video'))).toMatchObject({ code: 'media_discovery_listed', total: 5 })
    expect(rankMediaResources(resources, request('', 'music'))).toMatchObject({ code: 'media_discovery_truncated', total: 25 })
    const fullCatalog = Array.from({ length: 512 }, (_, index) => resource(`rain-${index}`, 'Rain'))
    expect(parseMediaDiscoveryReply(rankMediaResources(fullCatalog, request('rain')))?.total).toBe(512)
  })
  it('returns empty results for absent clues, punctuation-only queries, and empty catalogs without inventing metadata', () => {
    const resources = [resource('secret-id', 'Quiet melody', ['Evening song'])]
    for (const query of ['missing', 'secret-id', '。。。', 'quiet ocean', 'quiet evening']) {
      expect(rankMediaResources(resources, request(query))).toEqual({ status: 'accepted', code: 'media_discovery_no_match', resources: [], total: 0 })
    }
    expect(rankMediaResources([], request('rain'))).toEqual({ status: 'accepted', code: 'media_discovery_no_match', resources: [], total: 0 })
    expect(rankMediaResources([], request())).toEqual({ status: 'accepted', code: 'media_discovery_listed', resources: [], total: 0 })
  })
  it('orders ties deterministically across input order without mutating the catalog or sharing result arrays', () => {
    const resources = [resource('z', 'Ａ Rain', ['Shower']), resource('a', 'a rain'), resource('b', 'B Rain')]
    const original = structuredClone(resources)
    const result = rankMediaResources(resources, request('rain'))
    expect(ids(result)).toEqual(['a', 'z', 'b'])
    expect(rankMediaResources([...resources].reverse(), request('rain'))).toEqual(result)
    result.resources[1]!.aliases.push('Changed')
    expect(resources).toEqual(original)
  })
  it('projects only public fields from enriched entries and never echoes queries, paths, identity or playback data', () => {
    const enriched = { ...resource('rain', 'Rain', ['Storm']), path: '/private/media/rain.mp3', personId: 'private-person',
      profileId: 'private-profile', origin: 'own', action: 'play' }
    const result = rankMediaResources([enriched], request('storm'))
    expect(result).toEqual(reply({ resources: [resource('rain', 'Rain', ['Storm'])] }))
    expect(Object.keys(result).sort()).toEqual(['code', 'resources', 'status', 'total'])
    expect(Object.keys(result.resources[0]!).sort()).toEqual(['aliases', 'assetId', 'kind', 'name'])
  })
  it('uses metadata-only rejection/failure reasons rather than silently skipping invalid input', () => {
    expect(rankMediaResources([], request('bad\nquery'))).toEqual({ status: 'rejected', code: 'media_discovery_invalid_request', resources: [], total: 0 })
    const invalidCatalogs = [null, [resource('rain', 'Bad\nname')], [resource('/private/rain', 'Rain')],
      [resource('rain', 'Rain'), resource('rain', 'Other')],
      Array.from({ length: 513 }, (_, index) => resource(`rain-${index}`, 'Rain'))]
    for (const catalog of invalidCatalogs) {
      const result = rankMediaResources(catalog as AvatarMediaResource[], request())
      expect(result).toEqual({ status: 'failed', code: 'media_discovery_invalid_resources', resources: [], total: 0 })
      expect(parseMediaDiscoveryReply(result)).toEqual(result)
    }
  })
})
