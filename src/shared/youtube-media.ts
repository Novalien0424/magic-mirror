import type { SceneActionCommandContext, SceneActionRendererReport } from './types'

/** Accept public YouTube video links only; never arbitrary network/file URLs. */
export function youtubeVideoId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    let id: string | null = null
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1)
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v')
      else id = /^\/(?:shorts|embed|live)\/([^/]+)$/.exec(url.pathname)?.[1] ?? null
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

export interface YoutubePlayback {
  videoId: string
  kind: 'video' | 'music'
  mode: 'once' | 'loop'
  gain: number
  context: SceneActionCommandContext
}

/** Main-only adapter; remote web content never receives a privileged preload. */
export interface YoutubePlayer {
  play(request: YoutubePlayback, report: (report: SceneActionRendererReport) => void): boolean
  stop(): void
}
