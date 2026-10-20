import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { parseYoutubeSearchRequest, parseYoutubeSearchReply, type YoutubeSearchReply, type YoutubeSearchRequest } from '../../shared/youtube-search'

/** Optional, separate YouTube key. Main reads only the ignored root file; no env fallback. */
export function createYoutubeCredentialSource(read: (path: string) => Promise<string> = path => readFile(path, 'utf8')) {
  return { async get(): Promise<string | null> {
    try { return parseEnv(await read(resolve(process.cwd(), '.env'))).YOUTUBE_API_KEY?.trim() || null }
    catch { return null }
  } }
}

export type YoutubeSearch = (request: YoutubeSearchRequest) => Promise<YoutubeSearchReply>

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 32768) { await reader.cancel(); return null }
      chunks.push(part.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch { return null }
  finally { reader.releaseLock() }
}

export function createYoutubeSearch(options: { credentialSource: { get(): Promise<string | null> }; fetchImpl?: typeof fetch }): YoutubeSearch {
  let busy = false
  return async request => {
    const failure = (code: YoutubeSearchReply['code']): YoutubeSearchReply => ({ status: 'failed', code, videos: [] })
    const parsed = parseYoutubeSearchRequest(request)
    if (!parsed) return { status: 'rejected', code: 'youtube_search_invalid', videos: [] }
    if (busy) return failure('youtube_search_unavailable')
    busy = true
    try {
      const key = await options.credentialSource.get()
      if (!key) return failure('youtube_search_not_configured')
      const url = new URL('https://www.googleapis.com/youtube/v3/search')
      url.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '5', q: parsed.query,
        videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'moderate',
        fields: 'items(id/videoId,snippet(title,channelTitle))' }).toString()
      const response = await (options.fetchImpl ?? fetch)(url, { headers: { 'X-Goog-Api-Key': key },
        signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' })
      const body = await readBoundedJson(response) as { items?: unknown; error?: { errors?: { reason?: unknown }[] } } | null
      if (!response.ok) {
        const quota = response.status === 429 || response.status === 403 && Array.isArray(body?.error?.errors)
          && body.error.errors.some(error => error?.reason === 'quotaExceeded' || error?.reason === 'dailyLimitExceeded')
        return failure(quota ? 'youtube_search_quota_exceeded'
          : response.status === 401 || response.status === 403 ? 'youtube_search_access_denied' : 'youtube_search_unavailable')
      }
      if (!Array.isArray(body?.items) || body.items.length > 5) return failure('youtube_search_unavailable')
      const videos = body.items.map((item: { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown } }) => ({
        url: `https://www.youtube.com/watch?v=${item.id?.videoId}`, title: item.snippet?.title, channel: item.snippet?.channelTitle,
      }))
      return parseYoutubeSearchReply({ status: 'accepted', code: 'youtube_search_results', videos }) ?? failure('youtube_search_unavailable')
    } catch { return failure('youtube_search_unavailable') }
    finally { busy = false }
  }
}
