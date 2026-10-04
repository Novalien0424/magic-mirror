import { BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { mkdir, copyFile, unlink } from 'node:fs/promises'
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
    const button=name=>[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&(e.getAttribute('aria-label')||e.textContent.trim())===name);
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
  const shot = async (name: string, mirror = false) => {
    if (!mirror) {
      await evaluate(`document.querySelector(${JSON.stringify(step.startsWith('media_folder') ? '[aria-label="Avatar folder library"], [aria-label="Global media folders"]' : 'fieldset[aria-label="Media skill"]')})?.scrollIntoView({block:'start',behavior:'instant'}); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
      await delay(200)
    }
    const result = await capture(mirror ? input.mirror : input.console, input.outputDir, name)
    screenshots++; input.onEvidence({ step, status: 'captured', file: name, sha256: result.sha256 })
  }
  try {
    await wait(() => evaluate("return !!button('Avatars')"))
    await edit("click('Avatars')"); await edit("click('Music & video')")
    await edit("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Playback settings and previously imported files').click()")
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [
      join(process.cwd(), 'resources/phase4-trial-assets/phase4-finite-silent.webm'),
      join(input.outputDir, '../user-data/assets/music/phase4-qa-tone.wav'),
    ] })) as typeof dialog.showOpenDialog
    await edit("click('Upload music or video…')")
    await wait(() => evaluate("return document.querySelector('.console__publish-bar [role=status]')?.textContent.includes('Imported 2 file(s)') && !button('Upload music or video…').disabled"))
    dialog.showOpenDialog = picker
    step = 'media_console_authoring'
    await edit("field('Playback settings').open=true")
    await edit("set('Media fade duration','400')")
    videoId = await evaluate("return document.querySelector('[data-media-kind=video]').dataset.assetId")
    musicId = await evaluate("return document.querySelector('[data-media-kind=music]').dataset.assetId")
    if (!await evaluate("return [...document.querySelectorAll('[data-media-kind]')].length===2 && [...document.querySelectorAll('[data-media-kind]')].every(e=>e.checked)")) throw Error('media_upload_not_selected')
    await edit("document.querySelector('[data-media-kind=video]').click()")
    if (await evaluate("return !!document.querySelector('[aria-label^=\"Spoken name for video\"]')")) throw Error('media_unselect_failed')
    await edit("document.querySelector('[data-media-kind=video]').click()")
    await edit("set(document.querySelector('[aria-label^=\"Spoken name for video\"]').getAttribute('aria-label'),'Northern sky')")
    await edit("set(document.querySelector('[aria-label^=\"Aliases for video\"]').getAttribute('aria-label'),'Aurora\\n')")
    await edit("set(document.querySelector('[aria-label^=\"Spoken name for music\"]').getAttribute('aria-label'),'Evening song')")
    await shot('media-skills-console.png')
    await edit("click('Save & apply all changes')")
    await wait(async () => {
      const result = await input.runtime.console.getConfig()
      const skill = result.ok && result.value.active.avatarCatalog?.avatars[0]?.mediaSkill
      return !!skill && skill.resources.length === 2 && skill.resources.find(r=>r.kind==='video')?.aliases.join() === 'Aurora'
    })
    pass()
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('Avatars')")); await edit("click('Avatars')"); await edit("click('Music & video')")
    await edit("[...document.querySelectorAll('summary')].find(e=>e.textContent==='Playback settings and previously imported files').click()")
    await wait(() => evaluate("return field('Media fade duration')?.value==='400' && document.querySelector('[aria-label^=\"Spoken name for video\"]')?.value==='Northern sky'"))
    step = 'media_console_persisted'; pass()
    step = 'media_console_preview'
    await edit("document.querySelector('video[data-media-preview]').closest('details').open=true; await document.querySelector('video[data-media-preview]').play()")
    await wait(() => evaluate("return document.querySelector('video[data-media-preview]').currentTime>.1"))
    await shot('media-preview-console.png')
    await edit("document.querySelector('audio[data-media-preview]').closest('details').open=true; await document.querySelector('audio[data-media-preview]').play()")
    if (!await evaluate("return document.querySelector('video[data-media-preview]').paused && !document.querySelector('audio[data-media-preview]').paused")) throw Error('media_preview_overlap')
    await edit("document.querySelector('audio[data-media-preview]').closest('details').open=false")
    if (!await evaluate("return document.querySelector('audio[data-media-preview]').paused")) throw Error('media_preview_close_failed')
    pass()
    await input.runtime.handleSimulator({ type: 'wake' })
    await wait(async () => input.runtime.snapshot().lifecycle === 'active')
    step = 'media_video_fade_and_once'
    await play('video', videoId, 'once')
    await delay(170)
    const fading = await state()
    if (!(fading.opacity > 0 && fading.opacity < 1) || fading.video) throw Error('media_qa_avatar_fade_missing')
    await wait(async () => { const s = await state(); return s.opacity === 0 && !!s.video && s.video.time > .2 && s.video.frames > 0 })
    const before = (await state()).video!.frames
    await delay(250)
    if ((await state()).video!.frames <= before) throw Error('media_qa_video_not_advancing')
    await shot('media-video-playing.png', true)
    await wait(async () => { const s = await state(); return s.opacity === 1 && s.video === null })
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
    step = 'media_folder_link_and_discovery'
    const ownFolder = join(input.outputDir, '../folder-fixtures/own'), sharedFolder = join(input.outputDir, '../folder-fixtures/shared')
    await mkdir(ownFolder, { recursive: true }); await mkdir(sharedFolder, { recursive: true })
    await copyFile(join(process.cwd(), 'resources/phase4-trial-assets/phase4-finite-silent.webm'), join(ownFolder, 'Sky.webm'))
    await copyFile(join(input.outputDir, '../user-data/assets/music/phase4-qa-tone.wav'), join(sharedFolder, 'Rain.wav'))
    await edit("click('System')"); await edit("click('Media folders')")
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [sharedFolder] })) as typeof dialog.showOpenDialog
    await wait(() => evaluate("return !button('Choose shared folder')?.disabled"))
    await edit("click('Choose shared folder')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===1 && !button('Choose shared folder').disabled"))
    await shot('media-folder-global.png')
    await edit("click('Avatars')")
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [ownFolder] })) as typeof dialog.showOpenDialog
    await wait(() => evaluate("return !button('Choose avatar folder')?.disabled"))
    await edit("click('Choose avatar folder')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===2 && !button('Choose avatar folder').disabled"))
    dialog.showOpenDialog = picker
    const folderVideo = await evaluate<string>("return document.querySelector('[data-folder-media-kind=video]').dataset.folderMediaId")
    const folderMusic = await evaluate<string>("return document.querySelector('[data-folder-media-kind=music]').dataset.folderMediaId")
    await shot('media-folder-avatar.png'); pass()
    step = 'media_folder_persistence_and_prompt'
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('Avatars')")); await edit("click('Avatars')"); await edit("click('Music & video')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===2"))
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
    step = 'media_folder_removal_revokes_playback'
    await unlink(join(ownFolder, 'Sky.webm'))
    await edit("click('Refresh files')")
    await wait(() => evaluate("return document.querySelectorAll('[data-folder-media-id]').length===1 && !button('Refresh files').disabled"))
    if (await request({ action: 'play', kind: 'video', assetId: folderVideo, mode: 'once' }) !== 'rejected') throw Error('media_folder_removed_still_authorized')
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
