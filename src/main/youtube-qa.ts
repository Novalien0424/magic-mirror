/** Isolated Mac/player QA entry. Never starts Raven, microphone, memory or OpenAI. */
import { app, BrowserWindow, webContents } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createYoutubePlayer } from './avatar/youtube-player'
import { createYoutubeCredentialSource, createYoutubeSearch } from './avatar/youtube-search'
import type { SceneActionRendererReport } from '../shared/types'

const evidenceRoot = resolve(process.argv[2] ?? '.artifacts/youtube-qa')
app.setPath('userData', join(evidenceRoot, 'user-data'))
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.on('window-all-closed', () => {}) // Persist the result before explicitly exiting.
const checks: { name: string; passed: boolean; reason?: string }[] = []
let step = 'search'
let capture: { status: 'saved' | 'unavailable'; reason?: string } | undefined
let lastReport: SceneActionRendererReport | undefined
const reportStatus = () => lastReport?.status
let cleanup = () => {}
const timeout = setTimeout(() => { void finish(2, 'qa_timeout') }, 90000)
let finished = false
async function finish(exit: number, reason?: string) {
  if (finished) return
  finished = true; clearTimeout(timeout); cleanup()
  if (reason) checks.push({ name: 'execution', passed: false, reason })
  await mkdir(evidenceRoot, { recursive: true })
  await writeFile(join(evidenceRoot, 'evidence.json'), JSON.stringify({ timestamp: new Date().toISOString(), checks, capture,
    exclusions: ['Raven runtime', 'spoken clue interpretation', 'microphone wake detection', 'physical speaker acceptance'] }, null, 2))
  console.log(JSON.stringify({ event: 'youtube_qa_complete', exit, checks }))
  app.exit(exit)
}
const waitFor = async (condition: () => boolean | Promise<boolean>, timeoutMs = 20000) => {
  const until = Date.now() + timeoutMs
  while (!await condition()) {
    if (Date.now() > until || lastReport?.status === 'failed') throw Error(lastReport?.errorCode ?? 'qa_condition_timeout')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}
app.whenReady().then(async () => {
  const search = createYoutubeSearch({ credentialSource: createYoutubeCredentialSource() })
  const result = await search({ query: 'YouTube Developers IFrame Player API demo' })
  checks.push({ name: 'configured_search_returns_candidates', passed: result.status === 'accepted' && result.videos.length > 0, reason: result.code })
  step = 'player_start'
  const win = new BrowserWindow({ width: 540, height: 960, show: true, title: 'Magic Mirror — isolated YouTube QA',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  await win.loadURL('data:text/html,<html><body style="background:%23000;color:white">Isolated YouTube QA</body></html>')
  const player = createYoutubePlayer(() => win)
  cleanup = () => { player.stop(); if (!win.isDestroyed()) win.destroy() }
  const context = { runId: 'youtube-qa', sceneId: 'media-skill', stageId: 'youtube-qa', actionId: 'youtube-qa' }
  const started = player.play({ videoId: 'M7lc1UVf-VE', kind: 'video', mode: 'once', gain: 0, context }, report => { lastReport = report })
  if (!started) throw Error('youtube_player_unavailable')
  await waitFor(() => lastReport?.status === 'acknowledged')
  const contents = webContents.getAllWebContents().find(contents => contents.getURL() === 'https://com.magicmirror.app/youtube-player')!
  const initial = await contents.executeJavaScript('window.youtubePlaybackState().time') as number
  await waitFor(async () => await contents.executeJavaScript('window.youtubePlaybackState().time') > initial + 1)
  checks.push({ name: 'official_player_reports_advancing', passed: win.isVisible() && !win.isMinimized() })
  await mkdir(evidenceRoot, { recursive: true })
  // Display sleep can make native capture unavailable while playback still runs.
  // Record that limitation separately; never label it a visual acceptance pass.
  try {
    const image = await contents.capturePage()
    if (image.isEmpty()) capture = { status: 'unavailable', reason: 'capture_empty' }
    else {
      await writeFile(join(evidenceRoot, 'youtube-player.png'), image.toPNG())
      capture = { status: 'saved' }
    }
  } catch (error) {
    capture = { status: 'unavailable', reason: error instanceof Error && error.message === 'Current display surface not available for capture'
      ? 'display_surface_unavailable' : 'capture_failed' }
  }
  step = 'once_completion'
  await contents.executeJavaScript('void player.seekTo(Math.max(0,player.getDuration()-2),true)')
  await waitFor(() => lastReport?.status === 'completed')
  checks.push({ name: 'once_end_closes_player', passed: contents.isDestroyed() })
  step = 'loop_start'
  lastReport = undefined
  player.play({ videoId: 'M7lc1UVf-VE', kind: 'music', mode: 'loop', gain: 0, context }, report => { lastReport = report })
  await waitFor(() => lastReport?.status === 'acknowledged')
  const loop = webContents.getAllWebContents().find(contents => contents.getURL() === 'https://com.magicmirror.app/youtube-player')!
  const duration = await loop.executeJavaScript('player.getDuration()') as number
  step = 'loop_boundary'
  await loop.executeJavaScript('void player.seekTo(Math.max(0,player.getDuration()-2),true)')
  await waitFor(async () => await loop.executeJavaScript('window.youtubePlaybackState().time') > duration - 4)
  await waitFor(async () => { const state = await loop.executeJavaScript('window.youtubePlaybackState()'); return state.state === 1 && state.time < duration - 5 })
  checks.push({ name: 'loop_crosses_end_without_completion', passed: reportStatus() === 'acknowledged' })
  step = 'loop_stop'
  player.stop()
  await waitFor(() => loop.isDestroyed(), 2000)
  checks.push({ name: 'stop_releases_loop', passed: loop.isDestroyed() })
  await finish(checks.every(check => check.passed) ? 0 : 2)
}).catch(error => { void finish(2, /^youtube_[a-z0-9_]+$|^qa_[a-z0-9_]+$/.test(error?.message) ? error.message : `qa_${step}_failed`) })
