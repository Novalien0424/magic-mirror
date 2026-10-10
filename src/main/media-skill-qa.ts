import { dialog, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, copyFile, unlink, writeFile } from 'node:fs/promises'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'
import type { MediaSkillRequest } from '../shared/media-skill'
import type { MediaDiscoveryReply, MediaDiscoveryRequest } from '../shared/media-discovery'
import type { ToolOutcome } from '../shared/realtime-tools'

interface MediaPlaybackState {
  time: number; duration: number; loop: boolean; paused: boolean; ready: number; frames?: number
}
interface MediaQaState {
  active: boolean; hidden?: string; phase?: string; mode?: string; opacity: number; avatarVisible: boolean
  video: MediaPlaybackState | null; music: MediaPlaybackState | null
}

/** Isolated local fixture: production Console authoring, IPC and actual decoded media. No provider call. */
export async function runMediaSkillQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let step = 'media_ready', checks = 0, screenshots = 0
  const picker = dialog.showOpenDialog
  let videoId = '', musicId = ''
  let probeInstalled = false, musicAnalyserActive = false
  const reports: { runId: string; status: string }[] = [], visualReports: { runId: string; type: string }[] = []
  const listener = (event: Electron.IpcMainEvent, report: { sceneId?: string; runId?: string; status?: string }) => {
    if (event.sender === input.mirror.webContents && report.sceneId === 'media-skill' && typeof report.runId === 'string' && typeof report.status === 'string') reports.push({ runId: report.runId, status: report.status })
  }
  const visualListener = (event: Electron.IpcMainEvent, report: { sceneId?: string; runId?: string; type?: string }) => {
    if (event.sender === input.mirror.webContents && report.sceneId === 'media-skill' && typeof report.runId === 'string' && typeof report.type === 'string') visualReports.push({ runId: report.runId, type: report.type })
  }
  const metadataListener = (event: Electron.IpcMainEvent, report: { kind?: string; reason?: string }) => {
    if (event.sender === input.mirror.webContents && report.kind === 'avatar' && report.reason === 'avatar_music_analyser_active') musicAnalyserActive = true
  }
  ipcMain.on('mirror:report-scene-action', listener)
  ipcMain.on('mirror:report-scene-visual', visualListener)
  ipcMain.on('mirror:report-realtime-metadata', metadataListener)
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{
    const button=name=>[...document.querySelectorAll('button')].find(e=>e.checkVisibility()&&(e.getAttribute('aria-label')||e.textContent.trim())===name);
    const click=name=>{const e=button(name);if(!e||e.disabled)throw Error('media_control_unavailable');e.click()};
    const field=name=>document.querySelector('[aria-label="'+name+'"]');
    const set=(name,value)=>{const e=field(name);if(!e||e.disabled)throw Error('media_field_unavailable_'+name);const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    ${source}})()`, true) as Promise<T>
  const edit = async (source: string) => { await evaluate(source); await delay(80) }
  const wait = async (probe: () => Promise<boolean>, ms = 15000) => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (await probe()) return; await delay(40) }
    throw Error('media_qa_timeout_' + step)
  }
  const pass = () => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const state = () => input.mirror.webContents.executeJavaScript(`(()=>{
    const p=document.querySelector('.mirror-presentation'),a=p?.querySelector('.presentation__avatar'),canvas=a?.querySelector('.avatar-stage__canvas'),v=document.querySelector('.scene-visual video');
    const probe=window.magicMirrorMediaSkillQa.snapshot();
    return {...probe,hidden:p?.dataset.mediaVideo,phase:p?.dataset.phase,mode:p?.querySelector('.presentation')?.dataset.mode,opacity:p?Number(getComputedStyle(p.querySelector('.presentation')).opacity):-1,
      avatarVisible:!!a&&p.dataset.loading==='false'&&a.querySelector('.avatar-stage')?.dataset.rendererState==='ready'&&Number(getComputedStyle(a).opacity)===1&&getComputedStyle(a).visibility==='visible'&&!!canvas&&canvas.width>0&&canvas.height>0&&canvas.getBoundingClientRect().height>0,
      video:v?{time:v.currentTime,duration:v.duration,loop:v.loop,paused:v.paused,ready:v.readyState,frames:v.getVideoPlaybackQuality().totalVideoFrames}:null};})()`, true) as Promise<MediaQaState>
  const session = () => {
    const snapshot = input.runtime.snapshot()
    if (snapshot.lifecycle !== 'active' || !snapshot.realtimeSessionId) throw Error('media_qa_session_unavailable')
    return { realtimeSessionId: snapshot.realtimeSessionId, sessionGeneration: snapshot.sessionGeneration }
  }
  const request = (value: MediaSkillRequest) => input.mirror.webContents.executeJavaScript(
    `window.magicMirror.requestMedia(${JSON.stringify(value)},${JSON.stringify(session())})`, true) as Promise<ToolOutcome>
  const find = (query: string, kind: MediaDiscoveryRequest['kind'] = 'all') => input.mirror.webContents.executeJavaScript(
    `window.magicMirror.findMedia(${JSON.stringify({ query, kind })},${JSON.stringify(session())})`, true) as Promise<MediaDiscoveryReply>
  const found = async (query: string, kind: MediaDiscoveryRequest['kind'], assetIds: string[]) => {
    const reply = await find(query, kind)
    if (reply.status !== 'accepted' || reply.total !== assetIds.length || reply.resources.length !== assetIds.length
      || !assetIds.every(id => reply.resources.some(resource => resource.assetId === id))) throw Error('media_qa_discovery_mismatch')
  }
  const wake = async () => {
    const before = input.runtime.snapshot()
    if (before.lifecycle !== 'dormant') throw Error('media_qa_wake_requires_dormant')
    if ((await evaluate<{ op: string }>("return await window.magicMirror.simulate({type:'wake'})")).op !== 'success') throw Error('media_qa_wake_failed')
    await wait(async () => input.runtime.snapshot().lifecycle === 'active' && !!input.runtime.snapshot().realtimeSessionId && (await state()).phase === 'awake')
    if (session().sessionGeneration <= before.sessionGeneration) throw Error('media_qa_wake_session_not_fresh')
  }
  const play = async (kind: 'video' | 'music', assetId: string, mode: 'once' | 'loop') => {
    if (await request({ action: 'play', kind, assetId, mode }) !== 'accepted') throw Error('media_qa_request_rejected')
  }
  const returned = async () => {
    const s = await state()
    return !s.active && s.hidden === 'false' && s.opacity === 1 && s.avatarVisible && s.video === null && (!s.music || s.music.paused)
  }
  const loopBoundary = async (kind: 'video' | 'music') => {
    await wait(async () => input.runtime.snapshot().lifecycle === 'dormant' && input.runtime.snapshot().realtimeSessionId === null && (await state()).active)
    let previous = -1, crossed = false, firstFrames = -1
    await wait(async () => {
      const snapshot = input.runtime.snapshot(), s = await state(), media = s[kind]
      if (snapshot.lifecycle !== 'dormant' || snapshot.realtimeSessionId !== null || !s.active
        || !media || !media.loop || media.paused
        || (kind === 'video' ? s.hidden !== 'true' || s.opacity !== 0 : !s.avatarVisible || s.opacity !== 1)) {
        throw Error(`media_qa_dormant_loop_lost_${snapshot.lifecycle}_${s.active}_${s.hidden}_${s.opacity}_${media?.loop}_${media?.paused}_${media?.ready}`)
      }
      // The loop's seek can temporarily drop readyState. Require advancing
      // frames across the boundary below, within the existing bounded wait.
      if (media.ready < 2 || !Number.isFinite(media.duration) || media.duration <= 0) return false
      if (firstFrames < 0) firstFrames = media.frames ?? 0
      if (previous > media.time + .2) crossed = true
      previous = media.time
      return crossed && media.time > .25 && (kind === 'music' || (media.frames ?? 0) > firstFrames)
    }, 12000)
  }
  const bgm = () => input.mirror.webContents.executeJavaScript("(()=>{const a=document.querySelector('audio[data-presentation-ambience]');return a?{paused:a.paused,time:a.currentTime,volume:a.volume}:null})()") as Promise<{paused:boolean;time:number;volume:number}|null>
  const captureEvidence = async (win: typeof input.mirror, name: string) => {
    try {
      const result = await capture(win, input.outputDir, name)
      screenshots++; input.onEvidence({ step, status: 'captured', file: name, sha256: result.sha256 })
    } catch (error) {
      if (process.env['MIRROR_MEDIA_SKILL_QA_FUNCTIONAL'] !== '1' || !(error instanceof Error)
        || !['phase4_qa_black_frame', 'Current display surface not available for capture'].includes(error.message)) throw error
      input.onEvidence({ step, status: 'visual_not_executed', item: 'capture_surface_unavailable' })
    }
  }
  const shot = async (name: string, mirror = false) => {
    if (!mirror) {
      await evaluate(`document.querySelector(${JSON.stringify(step.startsWith('media_folder') || step === 'media_compact_file_list' ? '[aria-label="Avatar folder library"], [aria-label="Global media folders"]' : 'fieldset[aria-label="Media skill"]')})?.scrollIntoView({block:'start',behavior:'instant'}); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
      await delay(200)
    }
    await captureEvidence(mirror ? input.mirror : input.console, name)
  }
  try {
    // Observe the controller's detached managed Audio without changing playback or exposing its URL.
    await input.mirror.webContents.executeJavaScript(`(()=>{
      if(window.magicMirrorMediaSkillQa)throw Error('media_qa_probe_already_installed');
      const original=HTMLMediaElement.prototype.play;let music=null,active=false;
      const play=function(...args){if(this instanceof HTMLAudioElement&&!this.isConnected&&this.src.startsWith('blob:'))music=this;return original.apply(this,args)};
      const unsubscribe=window.magicMirror.onAvatarControl(c=>{if(c.type==='media_skill_state')active=c.active});
      HTMLMediaElement.prototype.play=play;
      window.magicMirrorMediaSkillQa={snapshot:()=>({active,music:music?{time:music.currentTime,duration:music.duration,loop:music.loop,paused:music.paused,ready:music.readyState}:null}),
        dispose:()=>{if(HTMLMediaElement.prototype.play===play)HTMLMediaElement.prototype.play=original;unsubscribe();delete window.magicMirrorMediaSkillQa}};
    })()`, true)
    probeInstalled = true
    await wait(() => evaluate("return !!button('Avatars')"))
    step = 'system_device_save_and_scroll'
    await edit("click('System')")
    if (!await evaluate("return !document.querySelector('.console__advanced-nav').open && !button('Models') && ![...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='Diagnostics')?.open")) throw Error('system_not_compact')
    await wait(() => evaluate("return !field('BGM volume')?.disabled"))
    const audioBefore = await evaluate<string>("return JSON.stringify((await window.magicMirror.getAvatarRuntime()).value.audioDevices.preferences)")
    await edit("set('BGM volume','37')")
    if (await evaluate<string>("return JSON.stringify((await window.magicMirror.getAvatarRuntime()).value.audioDevices.preferences)") !== audioBefore) throw Error('device_changed_before_save')
    await edit("click('Save device settings')")
    await wait(() => evaluate("return document.querySelector('.console__device-save [role=status]')?.textContent==='Device settings saved.'"))
    if (!await evaluate("return (await window.magicMirror.getAvatarRuntime()).value.audioDevices.preferences.volumes.bgm===.37")) throw Error('device_save_not_applied')
    await edit("window.scrollTo(0,document.documentElement.scrollHeight)")
    if (!await evaluate("const e=button('Save device settings'),r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&Math.abs(scrollY+innerHeight-document.documentElement.scrollHeight)<3")) throw Error('system_scroll_or_save_unreachable')
    await captureEvidence(input.console, 'system-save-bottom.png')
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('System')")); await edit("click('System')")
    await wait(() => evaluate("return field('BGM volume')?.value==='37'")); pass()
    await edit("click('Avatars')"); await edit("click('Music & video')")
    step = 'media_folder_link_and_discovery'
    const ownFolder = join(input.outputDir, '../folder-fixtures/own'), sharedFolder = join(input.outputDir, '../folder-fixtures/shared')
    await mkdir(ownFolder, { recursive: true }); await mkdir(sharedFolder, { recursive: true })
    await copyFile(join(process.cwd(), 'resources/phase4-trial-assets/phase4-finite-silent.webm'), join(ownFolder, 'Sky.webm'))
    await copyFile(join(input.outputDir, '../user-data/assets/music/phase4-qa-tone.wav'), join(sharedFolder, 'Rain.wav'))
    await copyFile(join(input.outputDir, '../user-data/assets/music/phase4-qa-tone.wav'), join(ownFolder, 'Own rain tune.wav'))
    await edit("click('System')"); await edit("click('Media folders')")
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [sharedFolder] })) as typeof dialog.showOpenDialog
    await wait(() => evaluate("return !button('Choose shared folder')?.disabled"))
    await edit("click('Choose shared folder')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===1 && !button('Choose shared folder').disabled"))
    await edit("click('Save folder settings')")
    await wait(() => evaluate("return document.querySelector('[aria-label=\"Global media folders\"] [role=status]')?.textContent.includes('Folder settings saved')"))
    await shot('media-folder-global.png')
    await edit("click('Avatars')")
    await edit("document.querySelector('.media-folder-settings summary').click()")
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [ownFolder] })) as typeof dialog.showOpenDialog
    await wait(() => evaluate("return !button('Choose avatar folder')?.disabled"))
    await edit("click('Choose avatar folder')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===3 && !button('Choose avatar folder').disabled"))
    dialog.showOpenDialog = picker
    const folderVideo = await evaluate<string>("return document.querySelector('[data-folder-media-kind=video]').dataset.folderMediaId")
    const folderMusic = await evaluate<string>("return [...document.querySelectorAll('[data-folder-media-kind=music]')].find(e=>e.textContent==='Rain').dataset.folderMediaId")
    const ownMusic = await evaluate<string>("return [...document.querySelectorAll('[data-folder-media-kind=music]')].find(e=>e.textContent==='Own rain tune').dataset.folderMediaId")
    await edit("document.querySelector('.media-folder-settings summary').click()")
    await shot('media-folder-avatar.png'); pass()

    step = 'media_large_file_transfer'
    await writeFile(join(sharedFolder, 'Transfer.wav'), Buffer.alloc(8 * 1024 * 1024, 37))
    await edit("click('Refresh files')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===4"))
    const transferId = await evaluate<string>("return [...document.querySelectorAll('[data-folder-media-id]')].find(e=>e.textContent==='Transfer').dataset.folderMediaId")
    const transferred = await input.mirror.webContents.executeJavaScript(`(async()=>{try{const r=await fetch('magic-mirror-media://music/${transferId}');return (await r.arrayBuffer()).byteLength}catch{return -1}})()`)
    if (transferred !== 8 * 1024 * 1024) throw Error('media_large_file_transfer_incomplete')
    const rangeResult = await input.mirror.webContents.executeJavaScript(`(async()=>{for(const range of ['bytes=4194300-4194310','bytes=-7']){const r=await fetch('magic-mirror-media://music/${transferId}',{headers:{Range:range}});const b=new Uint8Array(await r.arrayBuffer());if(r.status!==206||b.length!==(range==='bytes=-7'?7:11)||!b.every(v=>v===37))return {status:r.status,bytes:b.length}}return null})()`)
    if (rangeResult) throw Error('media_large_file_range_failed_' + JSON.stringify(rangeResult))
    await unlink(join(sharedFolder, 'Transfer.wav'))
    await edit("click('Refresh files')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===3")); pass()

    step = 'media_console_authoring'
    await edit("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Playback settings').click()")
    if (await evaluate("return !!field('Media skill').querySelector('input[type=checkbox]')")) throw Error('media_redundant_checkbox')
    await edit("set('Media fade duration','400')")
    videoId = folderVideo; musicId = folderMusic
    await edit("click('Save & apply all changes')")
    await wait(async () => {
      const result = await input.runtime.console.getConfig()
      return result.ok && result.value.active.avatarCatalog?.avatars[0]?.mediaSkill?.fadeMs === 400
    })
    await shot('media-skills-console.png'); pass()
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('Avatars')")); await edit("click('Avatars')"); await edit("click('Music & video')")
    await edit("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Playback settings').click()")
    await wait(() => evaluate("return field('Media fade duration')?.value==='400'"))
    step = 'media_console_persisted'; pass()
    step = 'media_compact_file_list'
    await edit("document.querySelector('.media-playback-settings summary').click()")
    if (!await evaluate("return [...document.querySelectorAll('[data-folder-media-id]')].every(e=>e.tagName==='LI'&&e.children.length===0)&&!document.querySelector('.media-folder-settings').open&&!document.querySelector('.media-playback-settings').open")) throw Error('media_list_not_filenames_only')
    await edit("set('Find folder media','Sky')")
    if (!await evaluate("return document.querySelectorAll('[data-folder-media-id]').length===1&&document.querySelector('[data-folder-media-id]').textContent==='Sky'")) throw Error('media_filename_search_failed')
    await edit("set('Find folder media','')")
    await shot('media-file-list.png')
    pass()
    await edit("click('Appearance')")
    await wait(() => evaluate(`return !!field('Dormant music').querySelector('option[value="${folderMusic}"]')`))
    await edit(`set('Dormant music',${JSON.stringify(folderMusic)});set('Active BGM volume','0.2')`)
    await edit("click('Save & apply all changes')")
    await wait(async () => (await bgm())?.paused === false)
    await edit("click('Music & video')")
    await wake()
    step = 'media_authenticated_local_discovery'
    await found('', 'all', [folderVideo, ownMusic, folderMusic])
    await found('Rain', 'music', [ownMusic, folderMusic])
    await found('Sky', 'video', [folderVideo])
    await found('Rain', 'video', [])
    if (!await returned()) throw Error('media_qa_discovery_started_playback')
    pass()
    step = 'media_video_fade_and_once'
    visualReports.length = 0
    const starting = play('video', videoId, 'once')
    await delay(170)
    const fading = await state()
    if (!(fading.opacity > 0 && fading.opacity < 1) || fading.video) throw Error('media_qa_avatar_fade_missing')
    if ((await bgm())?.paused !== true || (await bgm())?.volume !== 0) throw Error('media_qa_bgm_not_paused')
    await starting
    await wait(async () => { const s = await state(); return s.active && s.opacity === 0 && !!s.video && !s.video.loop && !s.video.paused && s.video.time > .2 && (s.video.frames ?? 0) > 0 })
    await wait(async () => { const b = await bgm(); return !!b && !b.paused && b.volume > 0 })
    const bgmPosition = (await bgm())!.time
    if (!await input.mirror.webContents.executeJavaScript("(()=>{const v=document.querySelector('.scene-visual video'),r=v.getBoundingClientRect();return getComputedStyle(v).objectFit==='cover'&&r.width===innerWidth&&r.height===innerHeight})()")) throw Error('media_video_not_fullscreen')
    const before = (await state()).video!.frames ?? 0
    await delay(250)
    if (((await state()).video?.frames ?? 0) <= before) throw Error('media_qa_video_not_advancing')
    if ((await bgm())!.time === bgmPosition) throw Error('media_qa_silent_video_bgm_not_advancing')
    await shot('media-video-playing.png', true)
    const videoRun = visualReports.find(r => r.type === 'playing')?.runId
    if (!videoRun) throw Error('media_qa_video_start_report_missing')
    await wait(async () => visualReports.some(r => r.runId === videoRun && r.type === 'ended'))
    await wait(returned)
    await wait(async () => { const b=await bgm();return !!b&&!b.paused&&b.volume>0 })
    session()
    pass()
    step = 'media_video_loop_dormant_and_wake_stop'
    await play('video', videoId, 'loop')
    await wait(async () => { const b = await bgm(); return !!b && !b.paused && b.volume > 0 })
    await loopBoundary('video')
    if ((await bgm())?.paused !== false || (await bgm())!.volume <= 0) throw Error('media_qa_loop_bgm_stopped')
    await shot('media-video-loop-dormant.png', true)
    // Simulator wake supplies a fresh session; interrupt through its authenticated production Stop route.
    await wake()
    if (await request({ action: 'stop' }) !== 'accepted') throw Error('media_qa_stop_failed')
    await wait(returned)
    await wait(async () => { const b=await bgm();return !!b&&!b.paused&&b.volume>0 })
    session()
    await shot('media-video-wake-return.png', true)
    pass()
    step = 'media_embedded_audio_suppresses_bgm'
    await copyFile(join(process.cwd(), 'resources/phase4-trial-assets/phase4-finite-embedded-audio.webm'), join(ownFolder, 'Sky.webm'))
    await evaluate("return window.magicMirror.mediaFolders({action:'refresh'})")
    await play('video', videoId, 'once')
    await wait(async () => { const v = (await state()).video; return !!v && !v.paused && v.time > .2 })
    if ((await bgm())?.paused !== true || (await bgm())?.volume !== 0) throw Error('media_qa_embedded_audio_bgm_overlap')
    await wait(returned)
    await copyFile(join(process.cwd(), 'resources/phase4-trial-assets/phase4-finite-silent.webm'), join(ownFolder, 'Sky.webm'))
    await evaluate("return window.magicMirror.mediaFolders({action:'refresh'})")
    await wait(async () => { const b = await bgm(); return !!b && !b.paused && b.volume > 0 })
    pass()
    step = 'media_music_once_visible'
    reports.length = 0; musicAnalyserActive = false
    await play('music', musicId, 'once')
    await wait(async () => { const s=await state();return s.active&&!!s.music&&!s.music.loop&&!s.music.paused&&s.music.ready>=2&&s.music.time>.2 })
    await wait(async () => musicAnalyserActive)
    const musicRun = reports.find(r => r.status === 'acknowledged')?.runId
    if (!musicRun) throw Error('media_qa_music_start_report_missing')
    if ((await state()).opacity !== 1 || !(await state()).avatarVisible) throw Error('media_qa_music_hid_avatar')
    await shot('media-music-avatar-visible.png', true)
    await wait(async () => reports.some(r => r.runId === musicRun && r.status === 'completed'))
    await wait(returned)
    await wait(async () => { const b=await bgm();return !!b&&!b.paused&&b.volume>0 })
    session()
    pass()
    step = 'media_music_loop_dormant_and_console_stop'
    reports.length = 0
    await play('music', musicId, 'loop')
    await loopBoundary('music')
    if (reports.some(r => r.status === 'completed')) throw Error('media_qa_music_loop_ended')
    await shot('media-music-loop-dormant.png', true)
    await edit("click('Stop All')")
    await wait(async () => {
      const s = await state()
      return !s.active && s.hidden === 'false' && s.phase === 'asleep' && s.opacity === 1
        && s.video === null && (!s.music || s.music.paused)
        && (s.mode === 'reflective' ? !s.avatarVisible : s.avatarVisible)
    })
    if (input.runtime.snapshot().lifecycle !== 'dormant' || input.runtime.snapshot().realtimeSessionId !== null) throw Error('media_qa_console_stop_changed_lifecycle')
    await wait(async () => { const b=await bgm();return !!b&&!b.paused&&b.volume>0 })
    if ((await state()).mode === 'reflective') {
      const image = await input.mirror.webContents.capturePage(), pixels = image.toBitmap()
      if (!pixels.length) throw Error('media_qa_dormant_capture_unavailable')
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i+1] || pixels[i+2]) throw Error('media_qa_stopped_dormant_not_black')
      const png = image.toPNG(), file = 'media-music-console-stop.png'
      await writeFile(join(input.outputDir, file), png)
      screenshots++; input.onEvidence({ step, status: 'captured', file, sha256: createHash('sha256').update(png).digest('hex') })
    } else await shot('media-music-console-stop.png', true)
    pass()
    step = 'media_folder_persistence_and_discovery'
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('Avatars')")); await edit("click('Avatars')"); await edit("click('Music & video')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===3"))
    await wake()
    await found('own rain', 'music', [ownMusic])
    await found('Rain', 'music', [ownMusic, folderMusic])
    await found('Sky', 'video', [folderVideo])
    pass()
    step = 'media_folder_runtime_playback'
    visualReports.length = 0
    await play('video', folderVideo, 'once')
    await wait(async () => { const s = await state(); return s.opacity === 0 && !!s.video && s.video.time > .2 })
    const persistedVideoRun = visualReports.find(r => r.type === 'playing')?.runId
    await wait(async () => !!persistedVideoRun && visualReports.some(r => r.runId === persistedVideoRun && r.type === 'ended'))
    await wait(returned)
    reports.length = 0
    await play('music', ownMusic, 'once')
    await wait(async () => { const s=await state();return s.active&&!!s.music&&!s.music.loop&&!s.music.paused&&s.music.time>.2 })
    const persistedMusicRun = reports.find(r => r.status === 'acknowledged')?.runId
    if ((await state()).opacity !== 1 || !(await state()).avatarVisible) throw Error('media_folder_music_hid_avatar')
    await wait(async () => !!persistedMusicRun && reports.some(r => r.runId === persistedMusicRun && r.status === 'completed'))
    await wait(returned); pass()
    step = 'media_failed_file_returns_failure'
    await writeFile(join(ownFolder, 'Sky.webm'), 'synthetic invalid video')
    await edit("click('Refresh files')")
    await wait(() => evaluate("return !button('Refresh files').disabled"))
    if (await request({ action: 'play', kind: 'video', assetId: folderVideo, mode: 'once' }) !== 'failed') throw Error('media_failed_file_reported_success')
    await wait(async () => { const s=await state(),b=await bgm();return s.opacity===1&&s.video===null&&!!b&&!b.paused&&b.volume>0 })
    pass()
    step = 'media_folder_removal_revokes_playback'
    await unlink(join(ownFolder, 'Sky.webm'))
    await edit("click('Refresh files')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===2 && !button('Refresh files').disabled"))
    if (await request({ action: 'play', kind: 'video', assetId: folderVideo, mode: 'once' }) !== 'rejected') throw Error('media_folder_removed_still_authorized')
    await found('Sky', 'video', [])
    await wait(returned); pass()
    step = 'folder_bgm_selection_and_black_dormant'
    if ((await evaluate<{ op: string }>("return await window.magicMirror.simulate({type:'sleep'})")).op !== 'success') throw Error('media_qa_sleep_failed')
    await wait(async () => input.runtime.snapshot().lifecycle === 'dormant')
    await edit("click('Appearance')")
    await wait(() => evaluate("return field('Dormant music')?.querySelector('optgroup[label=\"Avatar folder\"] option') && field('Dormant music')?.querySelector('optgroup[label=\"Common / shared folder\"] option')"))
    const bgmId = await evaluate<string>("return field('Dormant music').querySelector('optgroup[label=\"Common / shared folder\"] option').value")
    await edit("click('Quiet, ceremonial dread')")
    await edit(`set('Dormant music',${JSON.stringify(bgmId)})`)
    await edit("click('Save & apply all changes')")
    await wait(async () => {
      const config = await input.runtime.console.getConfig()
      return config.ok && config.value.active.presentation?.ambienceId === bgmId
    })
    await wait(() => input.mirror.webContents.executeJavaScript("(()=>{const a=document.querySelector('audio[data-presentation-ambience]');return !!a&&!a.paused&&a.currentTime>.2&&a.loop})()"))
    const pixels = (await input.mirror.webContents.capturePage()).toBitmap()
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i+1] || pixels[i+2]) throw Error('folder_bgm_dormant_not_black')
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('Avatars')")); await edit("click('Avatars')"); await edit("click('Appearance')")
    await wait(() => evaluate(`return field('Dormant music')?.value===${JSON.stringify(bgmId)}`)); pass()
    step = 'media_folder_unlink'
    await edit("click('Music & video')")
    await edit("document.querySelector('.media-folder-settings summary').click()")
    await wait(() => evaluate("return !button('Unlink avatar folder')?.disabled"))
    await edit("click('Unlink avatar folder')")
    await wait(() => evaluate("return document.querySelector('[aria-label=\"Avatar media folder\"]').textContent.includes('No folder linked.')"))
    pass()
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: screenshots, musicAnalyser: 'active', visualCount: 2, consoleCheckCount: checks }
  } catch (error) {
    input.onEvidence({ step, status: 'failed', item: error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,160) : 'unknown' })
    await shot('media-failure.png')
    throw error
  } finally {
    dialog.showOpenDialog = picker
    ipcMain.removeListener('mirror:report-scene-action', listener)
    ipcMain.removeListener('mirror:report-scene-visual', visualListener)
    ipcMain.removeListener('mirror:report-realtime-metadata', metadataListener)
    if (probeInstalled) await input.mirror.webContents.executeJavaScript('window.magicMirrorMediaSkillQa?.dispose()', true)
  }
}
