import { describe, it, expect, vi } from 'vitest'
import { createYoutubeSearch, createYoutubeCredentialSource } from '../../src/main/avatar/youtube-search'
import { youtubeVideoId } from '../../src/shared/youtube-media'
import { parseMediaSkillRequest } from '../../src/shared/media-skill'
import { parseYoutubeSearchRequest, parseYoutubeSearchReply } from '../../src/shared/youtube-search'

describe('YouTube search and video boundary', () => {
  it('accepts public video links and rejects arbitrary origins, credentials, schemes and playlists', () => {
    for (const url of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk&list=ignored',
      'https://music.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/shorts/abcdefghijk', 'https://youtube.com/live/abcdefghijk']) {
      expect(youtubeVideoId(url)).toBe('abcdefghijk')
      expect(parseMediaSkillRequest({ action: 'play_youtube', kind: 'music', url, mode: 'once' })).not.toBeNull()
    }
    for (const url of ['file:///private', 'http://youtube.com/watch?v=abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk',
      'https://user:password@youtube.com/watch?v=abcdefghijk', 'https://youtube.com:444/watch?v=abcdefghijk',
      'https://youtube.com/playlist?list=abcdefghijk', 'https://youtu.be/abcdefghijk/other', 'javascript:alert(1)']) expect(youtubeVideoId(url)).toBeNull()
    expect(parseMediaSkillRequest({ action: 'play_youtube', kind: 'music', url: 'https://youtu.be/abcdefghijk', mode: 'forever' })).toBeNull()
  })
  it('reads only the separate root-file YouTube credential without altering process env', async () => {
    const read = vi.fn(async () => 'OPENAI_API_KEY=unrelated-synthetic\nYOUTUBE_API_KEY="synthetic-youtube"\n')
    const before = process.env.YOUTUBE_API_KEY
    expect(await createYoutubeCredentialSource(read).get()).toBe('synthetic-youtube')
    expect(read).toHaveBeenCalledWith(expect.stringMatching(/magic-mirror\/\.env$/))
    expect(process.env.YOUTUBE_API_KEY).toBe(before)
    expect(await createYoutubeCredentialSource(async () => 'OPENAI_API_KEY=unrelated-synthetic').get()).toBeNull()
    expect(await createYoutubeCredentialSource(async () => { throw Error('private-path') }).get()).toBeNull()
  })
  it('returns setup guidance without a network request when the key is missing', async () => {
    const fetchImpl = vi.fn()
    const search = createYoutubeSearch({ credentialSource: { get: async () => null }, fetchImpl })
    expect(await search({ query: 'rain piano' })).toEqual({ status: 'failed', code: 'youtube_search_not_configured', videos: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('sends only bounded search terms, filters for embeddable videos and returns public candidates', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'Rain piano', channelTitle: 'Fixture channel' } }] }))
    const search = createYoutubeSearch({ credentialSource: { get: async () => 'synthetic-key' }, fetchImpl })
    const result = await search({ query: '雨天 piano' })
    expect(result).toEqual({ status: 'accepted', code: 'youtube_search_results', videos: [{ url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Rain piano', channel: 'Fixture channel' }] })
    const [url, options] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.origin).toBe('https://www.googleapis.com')
    expect(url.searchParams.get('q')).toBe('雨天 piano')
    expect(url.searchParams.get('videoEmbeddable')).toBe('true')
    expect(url.searchParams.get('videoSyndicated')).toBe('true')
    expect(url.searchParams.get('key')).toBeNull()
    expect(options.headers).toEqual({ 'X-Goog-Api-Key': 'synthetic-key' })
    expect(options.redirect).toBe('error')
    expect(JSON.stringify(result)).not.toContain('synthetic-key')
  })
  it('bounds invalid queries/replies and reports provider failures without exception text or retries', async () => {
    expect(parseYoutubeSearchRequest({ query: '' })).toBeNull()
    expect(parseYoutubeSearchRequest({ query: 'a'.repeat(201) })).toBeNull()
    expect(parseYoutubeSearchRequest({ query: 'rain', history: 'private' })).toBeNull()
    expect(parseYoutubeSearchReply({ status: 'accepted', code: 'youtube_search_results', videos: [{ url: 'https://evil.test', title: 'x', channel: 'x' }] })).toBeNull()
    const fetchImpl = vi.fn(async () => { throw Error('synthetic-sensitive-error') })
    expect(await createYoutubeSearch({ credentialSource: { get: async () => 'synthetic' }, fetchImpl })({ query: 'rain' }))
      .toEqual({ status: 'failed', code: 'youtube_search_unavailable', videos: [] })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
  it('distinguishes YouTube HTTP 403 quota exhaustion from a denied key using only bounded reason codes', async () => {
    for (const [status, reason, expected] of [
      [403, 'quotaExceeded', 'youtube_search_quota_exceeded'],
      [403, 'dailyLimitExceeded', 'youtube_search_quota_exceeded'],
      [403, 'forbidden', 'youtube_search_access_denied'],
      [429, 'rateLimitExceeded', 'youtube_search_quota_exceeded'],
    ] as const) {
      const fetchImpl = vi.fn(async () => Response.json({ error: { message: 'synthetic-private-provider-message', errors: [{ reason }] } }, { status }))
      const result = await createYoutubeSearch({ credentialSource: { get: async () => 'synthetic' }, fetchImpl })({ query: 'rain' })
      expect(result).toEqual({ status: 'failed', code: expected, videos: [] })
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
  })
})
