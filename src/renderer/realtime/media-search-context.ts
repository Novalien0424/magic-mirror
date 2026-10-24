import { mediaDiscoveryNext, type MediaDiscoveryReply, type MediaDiscoveryRequest } from '../../shared/media-discovery'

/** Session RAM only. A pending choice lasts through the immediately following
 * visitor turn. The model labels new/refining intent; code owns result identity. */
export class MediaSearchContext {
  private pending?: { generation: number; request: MediaDiscoveryRequest; media: MediaDiscoveryReply }
  private playedResources = new Map<string, number>()
  clear(): void { this.pending = undefined }
  reset(): void { this.clear(); this.playedResources.clear() }
  played(kind: string, assetId: string, generation: number): void {
    this.clear()
    const key = `${kind}:${assetId}`
    this.playedResources.delete(key); this.playedResources.set(key, generation)
    if (this.playedResources.size > 512) this.playedResources.delete(this.playedResources.keys().next().value!)
  }
  expire(generation: number): void { if (this.pending && generation > this.pending.generation + 1) this.clear() }
  prepare(request: MediaDiscoveryRequest, context: 'new' | 'refine', generation: number): MediaDiscoveryRequest | null {
    this.expire(generation)
    if (context === 'new') { this.clear(); return request }
    // The model can call a complete replacement request a refinement after a
    // conversational detour. With no pending context, search these clues fresh
    // instead of requiring another model/tool round just to change the enum.
    if (!this.pending) return request
    const query = this.pending.media.resources.length ? request.query : `${this.pending.request.query} ${request.query}`.trim()
    if (query.length > 200) { this.clear(); return null }
    return { kind: request.kind === 'all' ? this.pending.request.kind : request.kind,
      // A returned shortlist can be intersected with a fresh lookup. A miss
      // has no shortlist, so carry its earlier clues into the refinement.
      query }
  }
  remember(request: MediaDiscoveryRequest, media: MediaDiscoveryReply, generation: number, refine: boolean): MediaDiscoveryReply {
    if (refine && this.pending?.media.resources.length && media.status === 'accepted') {
      const ids = new Set(this.pending.media.resources.map(resource => `${resource.kind}:${resource.assetId}`))
      const resources = media.resources.filter(resource => ids.has(`${resource.kind}:${resource.assetId}`))
      media = { ...media, resources, total: resources.length, code: !resources.length ? 'media_discovery_no_match'
        : resources.length === 1 && media.code === 'media_discovery_ambiguous' ? 'media_discovery_matches' : media.code }
    }
    this.pending = { generation, request, media }
    return media
  }
  selection(kind: string, assetId: string, generation: number): 'ready' | 'clarify' | 'missing' {
    this.expire(generation)
    const pending = this.pending
    // A new explicit play request can reuse a successful asset already known
    // to the model. Main still checks its current scope and availability.
    // An unresolved search (including a conflicting version) cannot use this
    // shortcut, nor can a duplicate tool call within the same visitor turn.
    if (!pending) {
      const playedAt = this.playedResources.get(`${kind}:${assetId}`)
      return playedAt !== undefined && generation > playedAt ? 'ready' : 'missing'
    }
    if (!pending.media.resources.some(resource => resource.kind === kind && resource.assetId === assetId)) return 'missing'
    if (generation <= pending.generation && (mediaDiscoveryNext(pending.media) !== 'play_media'
      || pending.media.resources[0]?.assetId !== assetId)) return 'clarify'
    return 'ready'
  }
  endReply(generation: number): void {
    // A conversational reply to the follow-up (including cancel/topic change)
    // consumes the choice. A search result's own clarification does not.
    if (this.pending && generation > this.pending.generation) this.clear()
  }
}
