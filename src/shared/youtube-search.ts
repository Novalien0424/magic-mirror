import { youtubeVideoId } from './youtube-media'

export interface YoutubeSearchRequest { query: string }
export interface YoutubeSearchResult { url: string; title: string; channel: string }
export interface YoutubeSearchReply {
  status: 'accepted' | 'rejected' | 'failed'
  code: 'youtube_search_results' | 'youtube_search_not_configured' | 'youtube_search_unavailable' | 'youtube_search_access_denied' | 'youtube_search_quota_exceeded' | 'youtube_search_stale' | 'youtube_search_invalid' | 'youtube_search_source_restricted' | 'youtube_search_source_pending' | 'youtube_search_local_lookup_required'
  videos: YoutubeSearchResult[]
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const label = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v)
export function parseYoutubeSearchRequest(value: unknown): YoutubeSearchRequest | null {
  return record(value) && Object.keys(value).length === 1 && label(value.query, 200) ? { query: value.query.trim() } : null
}
export function parseYoutubeSearchReply(value: unknown): YoutubeSearchReply | null {
  if (!record(value) || Object.keys(value).length !== 3 || !['accepted', 'rejected', 'failed'].includes(value.status as string)
    || !['youtube_search_results', 'youtube_search_not_configured', 'youtube_search_unavailable', 'youtube_search_access_denied', 'youtube_search_quota_exceeded', 'youtube_search_stale', 'youtube_search_invalid', 'youtube_search_source_restricted', 'youtube_search_source_pending', 'youtube_search_local_lookup_required'].includes(value.code as string)
    || !Array.isArray(value.videos) || value.videos.length > 5 || !value.videos.every(item => record(item) && Object.keys(item).length === 3
      && youtubeVideoId(item.url) && label(item.title, 200) && label(item.channel, 200))) return null
  return structuredClone(value) as unknown as YoutubeSearchReply
}
