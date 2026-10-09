import { session, WebContentsView, type BrowserWindow } from 'electron'
import type { YoutubePlayback, YoutubePlayer } from '../../shared/youtube-media'
import type { AudioPreferences } from '../../shared/audio-devices'

// The installed application's ID, used as YouTube's required desktop Referer.
export const YOUTUBE_PLAYER_ORIGIN = 'https://com.magicmirror.app'
const PLAYER_URL = `${YOUTUBE_PLAYER_ORIGIN}/youtube-player`

export function youtubePlayerHtml(request: YoutubePlayback): string {
  if (!/^[A-Za-z0-9_-]{11}$/.test(request.videoId) || !Number.isFinite(request.gain)
    || request.gain < 0 || request.gain > 1 || !['once', 'loop'].includes(request.mode)) throw Error('youtube_request_invalid')
  const config = JSON.stringify({ videoId: request.videoId, volume: Math.round(request.gain * 100),
    playerVars: { autoplay: 1, controls: 1, playsinline: 1, origin: YOUTUBE_PLAYER_ORIGIN,
      loop: request.mode === 'loop' ? 1 : 0, ...(request.mode === 'loop' ? { playlist: request.videoId } : {}) } })
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com; style-src 'unsafe-inline'; connect-src https://www.youtube.com; base-uri 'none'; form-action 'none'">
<style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id="player"></div><script>
const config=${config}; let player; let error=0;
window.youtubePlaybackState=()=>({state:player?.getPlayerState?.()??-1,time:player?.getCurrentTime?.()??0,error});
window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('player',{videoId:config.videoId,playerVars:config.playerVars,events:{
onReady:e=>{e.target.setVolume(config.volume);e.target.playVideo()},onError:e=>{error=e.data},onAutoplayBlocked:()=>{error=-1}}})};
</script><script src="https://www.youtube.com/iframe_api"></script></body></html>`
}

/** Separate in-memory session and sandbox: no microphone, files, prompts or IPC. */
export function createYoutubePlayer(getWindow: () => BrowserWindow | undefined, options: {
  preferences?: () => AudioPreferences; report?: (reason: string) => void
} = {}): YoutubePlayer {
  const isolated = session.fromPartition('magic-mirror-youtube', { cache: false })
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  isolated.setPermissionCheckHandler(() => false)
  isolated.on('will-download', event => event.preventDefault())
  let html = ''
  isolated.protocol.handle('https', request => {
    if (request.url === PLAYER_URL) return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
    if (new URL(request.url).origin === YOUTUBE_PLAYER_ORIGIN) return new Response(null, { status: 404 })
    return isolated.fetch(request, { bypassCustomProtocolHandlers: true })
  })
  isolated.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(https:|data:|blob:)/.test(details.url) })
  })
  // Chromium's forwarded custom-protocol fetch does not preserve the embed's
  // automatic Referer. YouTube requires the installed app ID for desktop clients.
  isolated.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/embed/*'] }, (details, callback) => {
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).filter(([name]) => name.toLowerCase() !== 'referer'))
    callback({ requestHeaders: { ...headers, Referer: `${YOUTUBE_PLAYER_ORIGIN}/` } })
  })
  let dispose: (() => void) | undefined
  return {
    stop() { dispose?.(); dispose = undefined; html = '' },
    play(request, report) {
      this.stop()
      const parent = getWindow()
      if (!parent || parent.isDestroyed() || !parent.isVisible() || parent.isMinimized()) return false
      const volume = () => Math.round(request.gain * (options.preferences?.().volumes?.[request.kind === 'music' ? 'bgm' : 'effects'] ?? 1) * 100)
      let appliedVolume = volume(), outputId = options.preferences?.().outputId ?? ''
      if (outputId) options.report?.('youtube_system_audio_output')
      html = youtubePlayerHtml({ ...request, gain: appliedVolume / 100 })
      const view = new WebContentsView({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true,
        nodeIntegration: false, webSecurity: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } })
      const contents = view.webContents
      let stopped = false, started = false, polling = false, lastPosition = -1, lastProgress = Date.now()
      let failureCode = 'youtube_playback_failed'
      const emit = (status: 'acknowledged' | 'completed' | 'failed') => report({ ...request.context, status,
        ...(status === 'failed' ? { errorCode: failureCode } : {}) })
      const fail = () => { if (!stopped) { cleanup(); emit('failed') } }
      const layout = () => {
        const [width, height] = parent.getContentSize()
        if (width < 200 || height < 200) { fail(); return }
        // Music keeps the avatar visible above a real, unobscured YouTube player.
        const playerHeight = request.kind === 'music' ? Math.min(height, Math.max(200, Math.round(width * 9 / 16))) : height
        view.setBounds({ x: 0, y: height - playerHeight, width, height: playerHeight })
      }
      const cleanup = () => {
        if (stopped) return
        stopped = true
        clearInterval(timer)
        parent.off('resize', layout); parent.off('closed', fail); parent.off('hide', fail); parent.off('minimize', fail)
        if (!parent.isDestroyed()) parent.contentView.removeChildView(view)
        if (!contents.isDestroyed()) contents.close()
      }
      const poll = async () => {
        if (stopped) return
        if (Date.now() - lastProgress > (started ? 30000 : 60000)) { failureCode = 'youtube_playback_timeout'; fail(); return }
        if (polling) return
        polling = true
        try {
          const nextVolume = volume(), nextOutput = options.preferences?.().outputId ?? ''
          if (nextOutput !== outputId) { outputId = nextOutput; if (outputId) options.report?.('youtube_system_audio_output') }
          if (nextVolume !== appliedVolume) {
            await contents.executeJavaScript(`void player?.setVolume(${nextVolume})`)
            appliedVolume = nextVolume
          }
          const value: unknown = await contents.executeJavaScript('window.youtubePlaybackState?.()')
          if (stopped) return
          const state = value as { state?: unknown; time?: unknown; error?: unknown } | null
          if (state?.error === true || typeof state?.error === 'number' && state.error !== 0) {
            if (typeof state.error === 'number' && [-1, 2, 5, 100, 101, 150, 153].includes(state.error)) failureCode = state.error === -1 ? 'youtube_autoplay_blocked' : `youtube_player_error_${state.error}`
            fail(); return
          }
          if (state?.state === 1 && typeof state.time === 'number' && Number.isFinite(state.time)) {
            if (!started) { started = true; emit('acknowledged') }
            if (lastPosition !== state.time) { lastPosition = state.time; lastProgress = Date.now() }
          } else if (started && state?.state === 2) lastProgress = Date.now() // Viewer paused using YouTube's controls.
          else if (started && state?.state === 0 && request.mode === 'once') { cleanup(); emit('completed') }
        } catch { fail() } finally { polling = false }
      }
      const timer = setInterval(() => { void poll() }, 500)
      dispose = cleanup
      contents.setWindowOpenHandler(() => ({ action: 'deny' }))
      contents.on('will-navigate', event => event.preventDefault())
      contents.on('will-frame-navigate', event => {
        if (event.isMainFrame || !event.url.startsWith('https://www.youtube.com/embed/')) event.preventDefault()
      })
      contents.on('render-process-gone', fail)
      contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) fail() })
      parent.on('resize', layout); parent.on('closed', fail); parent.on('hide', fail); parent.on('minimize', fail)
      parent.contentView.addChildView(view)
      layout()
      if (stopped) return false
      void contents.loadURL(PLAYER_URL).catch(fail)
      return true
    },
  }
}
