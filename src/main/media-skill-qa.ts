import { BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { mkdir, copyFile, unlink, writeFile } from 'node:fs/promises'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'
import type { MediaSkillRequest } from '../shared/media-skill'

/** Isolated local fixture: production Console authoring, IPC and actual decoded media. No provider call. */
export async function runMediaSkillQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let step = 'media_ready', checks = 0, screenshots = 0
  const picker = dialog.showOpenDialog
  let videoId = '', musicId = ''
  const reports: { status: string }[] = []
  const listener = (event: Electron.IpcMainEvent, report: { sceneId?: string; status?: string }) => {
    if (event.sender === input.mirror.webContents && report.sceneId === 'media-skill' && typeof report.status === 'string') reports.push({ status: report.status })
  }
  ipcMain.on('mirror:report-scene-action', listener)
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
    const p=document.querySelector('.mirror-presentation'),v=document.querySelector('.scene-visual video');
    return {hidden:p?.dataset.mediaVideo,opacity:p?Number(getComputedStyle(p.querySelector('.presentation')).opacity):-1,
      video:v?{time:v.currentTime,loop:v.loop,paused:v.paused,frames:v.getVideoPlaybackQuality().totalVideoFrames}:null};})()`, true) as Promise<{ hidden?: string; opacity: number; video: null | { time: number; loop: boolean; paused: boolean; frames: number } }>
  const request = async (value: MediaSkillRequest) => {
    const snapshot = input.runtime.snapshot()
    if (!snapshot.realtimeSessionId) throw Error('media_qa_session_unavailable')
    return input.mirror.webContents.executeJavaScript(`window.magicMirror.requestMedia(${JSON.stringify(value)},${JSON.stringify({ realtimeSessionId: snapshot.realtimeSessionId, sessionGeneration: snapshot.sessionGeneration })})`, true)
  }
  const play = async (kind: 'video' | 'music', assetId: string, mode: 'once' | 'loop') => {
    if (await request({ action: 'play', kind, assetId, mode }) !== 'accepted') throw Error('media_qa_request_rejected')
  }
  const bgm = () => input.mirror.webContents.executeJavaScript("(()=>{const a=document.querySelector('audio[data-presentation-ambience]');return a?{paused:a.paused,time:a.currentTime,volume:a.volume}:null})()") as Promise<{paused:boolean;time:number;volume:number}|null>
  const shot = async (name: string, mirror = false) => {
    if (!mirror) {
      await evaluate(`document.querySelector(${JSON.stringify(step.startsWith('media_folder') || step === 'media_compact_file_list' ? '[aria-label="Avatar folder library"], [aria-label="Global media folders"]' : 'fieldset[aria-label="Media skill"]')})?.scrollIntoView({block:'start',behavior:'instant'}); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
      await delay(200)
    }
    const result = await capture(mirror ? input.mirror : input.console, input.outputDir, name)
    screenshots++; input.onEvidence({ step, status: 'captured', file: name, sha256: result.sha256 })
  }
  try {
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
    const deviceShot = await capture(input.console, input.outputDir, 'system-save-bottom.png')
    screenshots++; input.onEvidence({ step, status: 'captured', file: 'system-save-bottom.png', sha256: deviceShot.sha256 })
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('System')")); await edit("click('System')")
    await wait(() => evaluate("return field('BGM volume')?.value==='37'")); pass()
    await edit("click('Avatars')"); await edit("click('Music & video')")
    step = 'media_folder_link_and_discovery'
    const ownFolder = join(input.outputDir, '../folder-fixtures/own'), sharedFolder = join(input.outputDir, '../folder-fixtures/shared')
    await mkdir(ownFolder, { recursive: true }); await mkdir(sharedFolder, { recursive: true })
    await copyFile(join(process.cwd(), 'resources/phase4-trial-assets/phase4-finite-silent.webm'), join(ownFolder, 'Sky.webm'))
    await copyFile(join(input.outputDir, '../user-data/assets/music/phase4-qa-tone.wav'), join(sharedFolder, 'Rain.wav'))
    await copyFile(join(input.outputDir, '../user-data/assets/music/phase4-qa-tone.wav'), join(ownFolder, 'Own tune.wav'))
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
    const folderMusic = await evaluate<string>("return document.querySelector('[data-folder-media-kind=music]').dataset.folderMediaId")
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
    await edit("set('Find folder media','Rain')")
    if (!await evaluate("return document.querySelectorAll('[data-folder-media-id]').length===1&&document.querySelector('[data-folder-media-id]').textContent==='Rain'")) throw Error('media_filename_search_failed')
    await edit("set('Find folder media','')")
    await shot('media-file-list.png')
    pass()
    await edit("click('Appearance')")
    await wait(() => evaluate(`return !!field('Dormant music').querySelector('option[value="${folderMusic}"]')`))
    await edit(`set('Dormant music',${JSON.stringify(folderMusic)});set('Active BGM volume','0.2')`)
    await edit("click('Save & apply all changes')")
    await wait(async () => (await bgm())?.paused === false)
    await edit("click('Music & video')")
    await input.runtime.handleSimulator({ type: 'wake' })
    await wait(async () => input.runtime.snapshot().lifecycle === 'active')
    step = 'media_video_fade_and_once'
    const starting = play('video', videoId, 'once')
    await delay(170)
    const fading = await state()
    if (!(fading.opacity > 0 && fading.opacity < 1) || fading.video) throw Error('media_qa_avatar_fade_missing')
    if ((await bgm())?.paused !== true || (await bgm())?.volume !== 0) throw Error('media_qa_bgm_not_paused')
    await starting
    await wait(async () => { const s = await state(); return s.opacity === 0 && !!s.video && s.video.time > .2 && s.video.frames > 0 })
    if (!await input.mirror.webContents.executeJavaScript("(()=>{const v=document.querySelector('.scene-visual video'),r=v.getBoundingClientRect();return getComputedStyle(v).objectFit==='cover'&&r.width===innerWidth&&r.height===innerHeight})()")) throw Error('media_video_not_fullscreen')
    const before = (await state()).video!.frames
    await delay(250)
    if ((await state()).video!.frames <= before) throw Error('media_qa_video_not_advancing')
    await shot('media-video-playing.png', true)
    await wait(async () => { const s = await state(); return s.opacity === 1 && s.video === null })
    await wait(async () => { const b=await bgm();return !!b&&!b.paused&&b.volume>0 })
    pass()
    step = 'media_video_loop_and_stop'
    await play('video', videoId, 'loop')
    await delay(4200)
    const loop = await state()
    if (loop.opacity !== 0 || !loop.video?.loop || loop.video.paused || loop.video.frames < 30) throw Error('media_qa_loop_failed')
    if (await request({ action: 'stop' }) !== 'accepted') throw Error('media_qa_stop_failed')
    await wait(async () => { const s = await state(); return s.opacity === 1 && s.video === null })
    pass()
    step = 'media_music_once_visible'
    reports.length = 0
    await play('music', musicId, 'once')
    await wait(async () => reports.some(r => r.status === 'acknowledged'))
    if ((await state()).opacity !== 1) throw Error('media_qa_music_hid_avatar')
    await shot('media-music-avatar-visible.png', true)
    await wait(async () => reports.some(r => r.status === 'completed'))
    pass()
    step = 'media_music_loop_and_console_stop'
    reports.length = 0
    await play('music', musicId, 'loop')
    await wait(async () => reports.some(r => r.status === 'acknowledged'))
    await delay(4800)
    if (reports.some(r => r.status === 'completed')) throw Error('media_qa_music_loop_ended')
    await edit("click('Stop All')")
    await wait(async () => reports.some(r => r.status === 'completed'))
    pass()
    step = 'media_dormant_cleanup'
    await play('video', videoId, 'loop')
    await wait(async () => !!(await state()).video)
    await input.runtime.handleSimulator({ type: 'sleep' })
    await wait(async () => (await state()).video === null)
    pass()
    step = 'media_folder_persistence_and_prompt'
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('Avatars')")); await edit("click('Avatars')"); await edit("click('Music & video')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===3"))
    await edit("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Advanced: prompts and tools').click()")
    await edit("click('Session ↗')")
    await wait(async () => {
      const inspector = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Magic Mirror Prompts · Session')
      if (!inspector) return false
      return inspector.webContents.executeJavaScript(`(()=>{ const text=document.body.textContent; return text.includes(${JSON.stringify(folderVideo)}) && text.includes(${JSON.stringify(folderMusic)}) && !text.includes(${JSON.stringify(ownFolder)}); })()`)
    })
    BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Magic Mirror Prompts · Session')?.close()
    pass()
    step = 'media_folder_runtime_playback'
    await input.runtime.handleSimulator({ type: 'wake' })
    await wait(async () => input.runtime.snapshot().lifecycle === 'active')
    await play('video', folderVideo, 'once')
    await wait(async () => { const s = await state(); return s.opacity === 0 && !!s.video && s.video.time > .2 })
    await wait(async () => { const s = await state(); return s.opacity === 1 && s.video === null })
    reports.length = 0
    await play('music', folderMusic, 'loop')
    await wait(async () => reports.some(r=>r.status==='acknowledged'))
    if ((await state()).opacity !== 1) throw Error('media_folder_music_hid_avatar')
    await request({ action: 'stop' }); pass()
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
    step = 'folder_bgm_selection_and_black_dormant'
    await input.runtime.handleSimulator({ type: 'sleep' })
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
    await edit("click('Music & video')")
    await edit("document.querySelector('.media-folder-settings summary').click()")
    await wait(() => evaluate("return !button('Unlink avatar folder')?.disabled"))
    await edit("click('Unlink avatar folder')")
    await wait(() => evaluate("return document.querySelector('[aria-label=\"Avatar media folder\"]').textContent.includes('No folder linked.')"))
    await input.runtime.handleSimulator({ type: 'sleep' }); pass()
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: screenshots, musicAnalyser: 'active', visualCount: 2, consoleCheckCount: checks }
  } catch (error) {
    input.onEvidence({ step, status: 'failed', item: error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,160) : 'unknown' })
    await shot('media-failure.png')
    throw error
  } finally { dialog.showOpenDialog = picker; ipcMain.removeListener('mirror:report-scene-action', listener) }
}
