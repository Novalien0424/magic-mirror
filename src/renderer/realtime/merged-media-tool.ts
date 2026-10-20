import type { MediaDiscoveryReply, MediaDiscoveryRequest } from '../../shared/media-discovery'
import type { MediaSkillRequest, MediaSkillResult } from '../../shared/media-skill'
import type { YoutubeSearchReply } from '../../shared/youtube-search'
import type { RealtimeToolHandler } from './realtime-tool-bindings'

/** QA-only candidate. Application source restrictions survive model arguments,
 * and ambiguous candidates require a selection before playback. */
export function mergedMediaTool(input: {
  current(): boolean
  source(): 'auto' | 'local' | 'youtube'
  restriction(): Promise<'media_source_restricted' | 'media_source_unconfirmed' | undefined>
  find(request: MediaDiscoveryRequest): Promise<MediaDiscoveryReply>
  search(query: string): Promise<YoutubeSearchReply>
  play(request: MediaSkillRequest): Promise<MediaSkillResult>
}): RealtimeToolHandler {
  return async args => {
    const stale = () => !input.current()
    if (stale()) return 'ignored'
    const kind = args.kind as 'music' | 'video', mode = args.mode as 'once' | 'loop'
    const restriction = await input.restriction()
    if (stale()) return 'ignored'
    // Missing final ASR cannot authorize an online request. Local discovery is
    // still available, including when the model asks for auto fallback.
    const source = input.source() === 'local' || args.source === 'local' ? 'local'
      : input.source() === 'youtube' || args.source === 'youtube' ? 'youtube' : 'auto'
    let media: MediaDiscoveryReply | undefined, youtube: YoutubeSearchReply | undefined
    const start = async (request: MediaSkillRequest) => {
      if (stale()) return 'ignored' as const
      const result = await input.play(request)
      const outcome = typeof result === 'string' ? result : result.status
      return { outcome, ...(typeof result === 'string' ? {} : { code: result.code }),
        media, youtube, ...(outcome === 'accepted' ? { playback: request } : {}) }
    }
    if (args.assetId && (args.url || source === 'youtube')) return { outcome: 'rejected', code: 'media_request_rejected' }
    if (args.assetId) return start({ action: 'play', kind, mode, assetId: args.assetId as string })
    if (args.url) {
      if (source === 'local' || restriction) return { outcome: 'rejected', code: restriction ?? 'media_source_restricted' }
      return start({ action: 'play_youtube', kind, mode, url: args.url as string })
    }
    if (source !== 'youtube') {
      media = await input.find({ query: args.query as string, kind })
      if (stale()) return 'ignored'
      if (media.status !== 'accepted') return { outcome: media.status, media, next: 'explain' }
      if (media.code === 'media_discovery_matches' && media.resources[0]) {
        return start({ action: 'play', kind, mode, assetId: media.resources[0].assetId })
      }
      if (media.resources.length) return { outcome: 'accepted', media, next: 'ask' }
      if (source === 'local') return { outcome: 'rejected', code: 'media_not_found', media, next: 'explain' }
    }
    if (restriction) return { outcome: 'rejected', code: restriction }
    youtube = await input.search(args.query as string)
    if (stale()) return 'ignored'
    if (youtube.status !== 'accepted') return { outcome: youtube.status, media, youtube, next: 'explain' }
    if (youtube.videos.length === 1) return start({ action: 'play_youtube', kind, mode, url: youtube.videos[0]!.url })
    return { outcome: 'accepted', media, youtube, next: youtube.videos.length ? 'ask' : 'explain' }
  }
}
