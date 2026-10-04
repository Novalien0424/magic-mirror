import { createHash } from 'node:crypto'
import { dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

type QaWindow = Phase4QaInput['mirror']
type Phase = 'asleep' | 'entering' | 'awake' | 'exiting'
interface RitualState {
  mode: string | null
  phase: string
  elapsedMs: number
  avatarOpacity: number
  background: string | null
  renderer: string | null
  video: null | {
    role: string; assetId: string; host: string; muted: boolean; loop: boolean
    paused: boolean; timeMs: number; frames: number; dropped: number; opacity: number; blend: string
  }
  audio: null | { loop: boolean; paused: boolean; timeMs: number; volume: number }
  history: { phase: string; at: number }[]
  retainedMedia: number
  playingMedia: number
  connectedMedia: number
}

const BLACK_HOLD_MS = 400
const REVEAL_START_MS = 1500
const ENTRANCE_MS = 4000
const EXIT_MS = 2400
const DOM = `
  const visible = el => !!el && !!el.getClientRects().length && !el.closest('[hidden]');
  const button = name => [...document.querySelectorAll('button')].find(el => visible(el)
    && (el.getAttribute('aria-label') || el.textContent.trim()) === name);
  const control = prefix => [...document.querySelectorAll('.console__scenes label')]
    .find(el => visible(el) && el.textContent.trim().startsWith(prefix))?.querySelector('input,select,textarea');
  const click = name => {
    const el = button(name);
    if (!el || el.matches(':disabled')) throw Error('phase4_qa_ritual_button_unavailable');
    el.scrollIntoView({block:'center'}); el.click();
  };
  const set = (el, value) => {
    if (!el || el.matches(':disabled')) throw Error('phase4_qa_ritual_field_unavailable');
    const prototype = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
  };
  const status = () => document.querySelector('.console__publish-bar [role=status]');
`

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
function fail(reason: string): never { throw Error('phase4_qa_ritual_' + reason) }
const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const matches = (value: unknown, expected: Record<string, string | number>): boolean => !!value
  && typeof value === 'object' && Object.entries(expected).every(([key, item]) => (value as Record<string, unknown>)[key] === item)

/** Production DOM/import/publication; only the native picker return is substituted. */
export async function runReflectiveRitualQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (!input.consoleOnly || input.editorOnly || input.live || input.lifecycleLive) fail('mode_invalid')
  let step = 'ritual_ready', checks = 0, screenshots = 0
  const originalSize = input.console.getSize()
  const picker = dialog.showOpenDialog
  let selection: string[] = []
  dialog.showOpenDialog = (async () => ({ canceled: selection.length === 0, filePaths: [...selection] })) as typeof dialog.showOpenDialog
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(
    `(async()=>{${DOM}${source}})()`, true,
  ) as Promise<T>
  const edit = async (source: string): Promise<void> => { await evaluate(source); await delay(60) }
  const wait = async (probe: () => Promise<boolean>, timeoutMs = 15000): Promise<void> => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) { if (await probe()) return; await delay(30) }
    fail('timeout_' + step)
  }
  const pass = (): void => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const measured = (item: unknown): void => { input.onEvidence({ step, status: 'measured', item: JSON.stringify(item) }) }
  const getConfig = async () => {
    const response = await input.runtime.console.getConfig()
    if (!response.ok) fail('config_unavailable')
    return response.value
  }
  // Observation is RAM-only. Retaining synthetic media elements lets Stop prove
  // playback is paused after React removes them, rather than only checking DOM.
  const observe = async (win: QaWindow, selector: string): Promise<void> => {
    await win.webContents.executeJavaScript(`(()=>{
      window.__reflectiveRitualQa?.observer.disconnect();
      const q={selector:${JSON.stringify(selector)},phase:null,phaseAt:performance.now(),history:[],media:new Set()};
      q.sample=()=>{
        const p=document.querySelector(q.selector), phase=p?.dataset.phase || 'stopped';
        if(phase!==q.phase){q.phase=phase;q.phaseAt=performance.now();q.history.push({phase,at:q.phaseAt});}
        for(const el of p?.querySelectorAll('video,audio') || [])q.media.add(el);
        return p;
      };
      q.observer=new MutationObserver(q.sample);
      q.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-phase','data-mode']});
      window.__reflectiveRitualQa=q;q.sample();
    })()`, true)
  }
  const state = (win: QaWindow): Promise<RitualState> => win.webContents.executeJavaScript(`(()=>{
    const q=window.__reflectiveRitualQa,p=q.sample(),v=p?.querySelector('.presentation__ritual-video'),a=p?.querySelector('[data-presentation-ambience]');
    const effectiveOpacity=el=>{let n=1;for(let e=el;e&&e!==p;e=e.parentElement){
      const css=getComputedStyle(e);if(css.visibility!=='visible'||css.display==='none')return 0;n*=Number(css.opacity);
    }return n;};
    const quality=v?.getVideoPlaybackQuality();let url=null;
    if(v?.getAttribute('src')){try{url=new URL(v.currentSrc || v.src)}catch{}}
    return {mode:p?.dataset.mode || null,phase:q.phase,elapsedMs:performance.now()-q.phaseAt,
      avatarOpacity:p ? Number(getComputedStyle(p.querySelector('.presentation__avatar')).opacity) : 0,
      background:p ? getComputedStyle(p).backgroundColor : null,renderer:p?.querySelector('.avatar-stage')?.dataset.rendererState || null,
      video:v ? {role:v.dataset.ritualVideo,assetId:url ? decodeURIComponent(url.pathname.slice(1)) : '',host:url?.host || '',
        muted:v.muted,loop:v.loop,paused:v.paused,timeMs:v.currentTime*1000,frames:quality.totalVideoFrames,
        dropped:quality.droppedVideoFrames,opacity:effectiveOpacity(v),blend:getComputedStyle(v).mixBlendMode} : null,
      audio:a ? {loop:a.loop,paused:a.paused,timeMs:a.currentTime*1000,volume:a.volume} : null,
      history:q.history.slice(-12),retainedMedia:q.media.size,playingMedia:[...q.media].filter(el=>!el.paused).length,
      connectedMedia:[...q.media].filter(el=>el.isConnected).length};
  })()`, true) as Promise<RitualState>
  const phase = async (win: QaWindow, expected: Phase, timeoutMs = 10000): Promise<RitualState> => {
    let latest: RitualState | undefined
    await wait(async () => { latest = await state(win); return latest.mode === 'reflective' && latest.phase === expected }, timeoutMs)
    return latest!
  }
  const shot = async (win: QaWindow, name: string): Promise<void> => {
    const result = await capture(win, input.outputDir, name)
    screenshots++
    input.onEvidence({ step, status: 'captured', file: name, sha256: result.sha256, nonblack_pixels: result.nonblackPixels })
  }
  // Expected-black captures have a separate strict RGB path. Generic capture()
  // continues to reject black frames for all ordinary visual QA screenshots.
  const rawMirrorShot = async (name: string): Promise<number> => {
    const image = await input.mirror.capturePage(), size = image.getSize(), bitmap = image.toBitmap()
    let nonzeroPixels = 0, maxRgb = 0
    for (let i = 0; i + 3 < bitmap.length; i += 4) {
      const max = Math.max(bitmap[i]!, bitmap[i + 1]!, bitmap[i + 2]!)
      if (max !== 0) nonzeroPixels++
      maxRgb = Math.max(maxRgb, max)
    }
    const png = image.toPNG()
    await writeFile(join(input.outputDir, name), png)
    screenshots++
    input.onEvidence({ step, status: 'captured', file: name, sha256: createHash('sha256').update(png).digest('hex'),
      nonblack_pixels: nonzeroPixels, item: JSON.stringify({ width: size.width, height: size.height, pixels: bitmap.length / 4, maxRgb }) })
    if (size.width <= 0 || size.height <= size.width || bitmap.length < 4 || bitmap.length % 4 !== 0) fail('portrait_capture_invalid')
    return nonzeroPixels
  }
  const blackShot = async (name: string, expected: 'asleep' | 'entering'): Promise<void> => {
    let before = await state(input.mirror)
    if (expected === 'entering' && before.phase === expected && before.elapsedMs < 140) {
      await delay(140 - before.elapsedMs)
      before = await state(input.mirror)
    }
    if (before.mode !== 'reflective' || before.phase !== expected
      || expected === 'entering' && before.elapsedMs >= BLACK_HOLD_MS) fail('black_capture_window_missed')
    const nonzero = await rawMirrorShot(name), after = await state(input.mirror)
    measured({ phase: expected, beforeMs: Math.round(before.elapsedMs), afterMs: Math.round(after.elapsedMs), nonzeroPixels: nonzero })
    if (after.phase !== expected || expected === 'entering' && after.elapsedMs >= BLACK_HOLD_MS) fail('black_capture_window_missed')
    if (nonzero !== 0) fail('rgb_not_exact_black')
  }
  const progressing = async (win: QaWindow, role: 'entrance' | 'exit', assetId: string, host: string): Promise<void> => {
    let first: RitualState | undefined
    await wait(async () => {
      first = await state(win)
      return first.video?.role === role && !first.video.paused && first.video.timeMs > 0 && first.video.frames > 0
    }, 2000)
    const start = first!, v = start.video!
    if (!v.muted || v.loop || v.assetId !== assetId || v.host !== host
      || start.phase !== (role === 'entrance' ? 'entering' : 'exiting')
      || v.timeMs > start.elapsedMs + 150 || start.elapsedMs >= 1200) fail('video_not_restarted')
    if (role === 'entrance' && v.opacity > 0 && start.elapsedMs < BLACK_HOLD_MS - 30) fail('black_hold_ended_early')
    await delay(600)
    const end = await state(win), next = end.video
    const frames = (next?.frames ?? 0) - v.frames, dropped = (next?.dropped ?? 0) - v.dropped
    measured({ role, elapsedMs: Math.round(end.elapsedMs - start.elapsedMs), startMs: Math.round(v.timeMs), endMs: Math.round(next?.timeMs ?? 0), frames, dropped })
    if (!next || next.role !== role || next.paused || !next.muted || next.loop || next.opacity === 0 || next.timeMs <= v.timeMs + 200
      // Startup drops remain measured evidence; a short startup sample cannot
      // establish sustained smoothness. Require actual rendered progression.
      || frames - dropped < 6) fail('video_playback_stalled')
  }
  const reveal = async (win: QaWindow): Promise<void> => {
    await wait(async () => {
      const s = await state(win)
      return s.phase === 'entering' && s.elapsedMs >= REVEAL_START_MS - 300 && s.elapsedMs < REVEAL_START_MS - 75 && s.avatarOpacity === 0
    }, 1500)
    let start: RitualState | undefined
    await wait(async () => {
      start = await state(win)
      return start.phase === 'entering' && start.elapsedMs >= REVEAL_START_MS + 150 && start.elapsedMs <= REVEAL_START_MS + 325
        && start.avatarOpacity > 0 && start.avatarOpacity < 1
    }, 1800)
    await delay(250)
    const end = await state(win)
    measured({ revealStartMs: Math.round(start!.elapsedMs), firstOpacity: start!.avatarOpacity, nextOpacity: end.avatarOpacity })
    if (end.phase !== 'entering' || end.avatarOpacity <= start!.avatarOpacity) fail('reveal_not_increasing')
  }
  const awake = async (win: QaWindow): Promise<void> => {
    await phase(win, 'awake')
    await wait(async () => {
      const s = await state(win)
      return s.avatarOpacity === 1 && s.renderer === 'ready' && (!s.video || s.video.paused)
        && !!s.audio && !s.audio.paused && Math.abs(s.audio.volume - 0.1) < 0.001
    }, 2000)
    const s = await state(win), index = s.history.findLastIndex(item => item.phase === 'awake')
    const duration = s.history[index]!.at - s.history[index - 1]!.at
    measured({ entranceMs: Math.round(duration) })
    if (s.history[index - 1]?.phase !== 'entering' || duration < ENTRANCE_MS - 80 || duration > ENTRANCE_MS + 1000) fail('entrance_timing')
  }
  const asleep = async (win: QaWindow): Promise<void> => {
    await phase(win, 'asleep')
    await wait(async () => {
      const s = await state(win)
      return s.avatarOpacity === 0 && (!s.video || s.video.paused) && !!s.audio && s.audio.loop && !s.audio.paused
        && Math.abs(s.audio.volume - 0.35) < 0.001 && s.audio.timeMs > 0
    }, 2000)
  }
  const stopPreview = async (): Promise<void> => {
    await edit("click('Stop preview')")
    await wait(async () => {
      const s = await state(input.console)
      return s.phase === 'stopped' && s.retainedMedia > 0 && s.playingMedia === 0 && s.connectedMedia === 0
        && await evaluate<boolean>("return button('Stop preview')?.disabled && !document.querySelector('.presentation-preview video,.presentation-preview audio,.presentation-preview .presentation')")
    }, 2000)
  }
  const save = async (): Promise<void> => {
    await wait(() => evaluate("return !!button('Save all changes') && !button('Save all changes').matches(':disabled')"))
    await edit("click('Save all changes')")
    await wait(() => evaluate("return status()?.textContent === 'Saved and checked. Ready to publish.' && !button('Save all changes').matches(':disabled') && !button('Publish all changes').matches(':disabled')"))
  }
  const reload = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const loaded = (): void => { clearTimeout(timer); resolve() }
      const timer = setTimeout(() => {
        input.console.webContents.removeListener('did-finish-load', loaded)
        reject(Error('phase4_qa_ritual_reload_timeout'))
      }, 15000)
      input.console.webContents.once('did-finish-load', loaded)
      input.console.webContents.reload()
    })
    await wait(() => evaluate("return !!button('Avatars')"))
    await edit("click('Avatars')")
    await wait(() => evaluate("return !!button('Appearance') && !button('Save all changes').matches(':disabled')"))
    await edit("click('Appearance')")
  }
  try {
    const baseline = await getConfig(), activeHash = fingerprint(baseline.active), draftHash = fingerprint(baseline.draft)
    const lifecycle = input.runtime.snapshot().lifecycle
    if (lifecycle !== 'dormant' || input.runtime.snapshot().realtimeSessionId !== null) fail('isolated_dormant_required')
    await wait(() => evaluate("return !!button('Avatars')"))
    await edit("click('Avatars')")
    await wait(() => evaluate("return !!control('Editing avatar') && !!button('Media library')"))
    const avatarId = await evaluate<string>("return control('Editing avatar').value")
    if (avatarId !== 'qa-ritual' || baseline.active.avatarCatalog?.activeAvatarId !== avatarId) fail('fixture_avatar_invalid')
    const legacy = baseline.active.avatarCatalog.avatars.filter(a => a.id !== avatarId)
    if (legacy.length !== 2 || !legacy.some(a => a.presentation.mode === 'always_visible') || !legacy.some(a => a.presentation.mode === 'emerge')) fail('legacy_fixtures_missing')

    step = 'ritual_production_media_import'
    await edit("click('Media library')")
    selection = [join(process.cwd(), 'sample', '_media', 'raven', 'fog.webm'),
      join(process.cwd(), 'resources', 'phase4-trial-assets', 'phase4-still.png')]
    await wait(() => evaluate("return !!button('Browse & upload media…') && !button('Browse & upload media…').matches(':disabled')"))
    await edit("click('Browse & upload media…')")
    await wait(() => evaluate("return status()?.textContent.includes('Imported 2 file(s)') && !button('Browse & upload media…').matches(':disabled') && document.querySelectorAll('.media-card video,.media-card img').length === 2"))
    const imported = await evaluate<{ id: string; kind: string }[]>(`return [...document.querySelectorAll('.media-card .media-thumbnail')].map(el=>{
      const media=el.querySelector('video,img');return {id:decodeURIComponent(new URL(media.src).pathname.slice(1)),kind:media.tagName==='VIDEO'?'video':'image'};});`)
    const videoId = imported.find(a => a.kind === 'video')?.id, imageId = imported.find(a => a.kind === 'image')?.id
    if (!videoId || !imageId || ![videoId, imageId].every(id => /^[a-z0-9][a-z0-9._-]{0,95}$/.test(id))) fail('managed_import_ids')
    measured({ visuals: imported.length, videos: 1, images: 1 }); pass()

    step = 'ritual_per_avatar_preset_and_fields'
    await edit("click('Appearance')")
    await wait(() => evaluate("return !!button('Quiet, ceremonial dread') && !!control('Visibility mode')"))
    await evaluate("const modes=[...control('Visibility mode').options].map(o=>o.value);if(!['always_visible','emerge','reflective'].every(m=>modes.includes(m)))throw Error('phase4_qa_ritual_legacy_options_missing')")
    await edit("set(control('Visibility mode'),'reflective')")
    await edit("click('Quiet, ceremonial dread')")
    await wait(() => evaluate("return control('Visibility mode')?.value==='reflective' && control('Black hold seconds')?.value==='0.4' && control('Reveal starts at seconds')?.value==='1.5' && control('Entrance seconds')?.value==='4' && control('Exit seconds')?.value==='2.4'"))
    await evaluate(`for(const name of ['Entrance mist video','Exit mist video']){
      const s=control(name), ids=[...s.options].map(o=>o.value).filter(Boolean);
      if(ids.length!==1 || ids[0]!==${JSON.stringify(videoId)} || ids.includes(${JSON.stringify(imageId)}))throw Error('phase4_qa_ritual_video_only_selector');
    }for(const name of ['Entrance video background','Exit video background']){
      if(JSON.stringify([...control(name).options].map(o=>o.value).sort())!==JSON.stringify(['normal','screen']))throw Error('phase4_qa_ritual_blend_options');
    }`)
    const fields = [
      ['Entrance mist video', videoId], ['Exit mist video', videoId], ['Entrance video background', 'screen'], ['Exit video background', 'normal'],
      ['Dormant music (loops)', 'music-qa-tone'], ['Dormant music volume', '0.35'], ['Active BGM volume', '0.1'],
      ['Black hold seconds', '0.4'], ['Reveal starts at seconds', '1.5'], ['Entrance seconds', '4'], ['Exit seconds', '2.4'],
    ]
    for (const [name, value] of fields) await edit(`set(control(${JSON.stringify(name)}),${JSON.stringify(value)})`)
    const uiMatches = `return control('Editing avatar')?.value===${JSON.stringify(avatarId)} && control('Visibility mode')?.value==='reflective'
      && ${JSON.stringify(fields)}.every(([name,value])=>control(name)?.value===value);`
    const expected = { mode: 'reflective', entranceVideoId: videoId, exitVideoId: videoId, entranceBlend: 'screen', exitBlend: 'normal',
      ambienceId: 'music-qa-tone', ambienceGain: 0.35, activeAmbienceGain: 0.1, blackHoldMs: BLACK_HOLD_MS, revealStartMs: REVEAL_START_MS,
      entranceMs: ENTRANCE_MS, exitMs: EXIT_MS }
    const assertSlot = (slot: typeof baseline.active): void => {
      if (slot.avatarCatalog?.activeAvatarId !== avatarId || !matches(slot.presentation, expected)
        || !matches(slot.avatarCatalog.avatars.find(a => a.id === avatarId)?.presentation, expected)) fail('per_avatar_roundtrip')
      for (const id of [expected.entranceVideoId, expected.exitVideoId]) {
        if (!slot.visualAssets.some(a => a.id === id && a.kind === 'video')) fail('selected_asset_not_video')
      }
      if (!slot.musicAssets.some(a => a.id === expected.ambienceId)) fail('selected_music_missing')
      if (fingerprint(slot.avatarCatalog.avatars.filter(a => a.id !== avatarId)) !== fingerprint(legacy)) fail('legacy_avatar_changed')
    }
    for (const [width, height, label] of [[originalSize[0], originalSize[1], 'regular'], [1024, 768, '1024']] as const) {
      input.console.setSize(width, height); await delay(180)
      await evaluate("document.querySelector('.presentation-editor').scrollIntoView({block:'start'})")
      input.console.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 }); await delay(100)
      await shot(input.console, `console-ritual-setup-${label}.png`)
      await evaluate("control('Entrance mist video').scrollIntoView({block:'start'})"); await delay(100)
      await shot(input.console, `console-ritual-fields-${label}.png`)
      if (await evaluate<boolean>('return document.documentElement.scrollWidth>innerWidth')) fail('console_horizontal_overflow')
    }
    input.console.setSize(originalSize[0]!, originalSize[1]!); pass()

    step = 'ritual_invalid_reveal_visibly_rejected'
    for (const invalid of ['0.2', '4']) {
      await edit(`set(control('Reveal starts at seconds'),${JSON.stringify(invalid)})`)
      await wait(() => evaluate(`const alert=document.querySelector('.presentation-editor [role=alert]');
        return visible(alert) && /black hold|reveal/i.test(alert.textContent)
          && ['Preview entrance','Preview exit','Preview full cycle','Save all changes','Publish all changes'].every(name=>button(name)?.matches(':disabled'));`))
      const rejected = await getConfig()
      if (fingerprint(rejected.active) !== activeHash || fingerprint(rejected.draft) !== draftHash) fail('invalid_save_persisted')
      if (!await evaluate<boolean>(`return control('Reveal starts at seconds').value===${JSON.stringify(invalid)}`)) fail('invalid_edit_lost')
      await evaluate("document.querySelector('.presentation-editor [role=alert]').scrollIntoView({block:'center'})"); await delay(100)
      await shot(input.console, `console-ritual-invalid-reveal-${invalid === '4' ? 'late' : 'early'}.png`)
    }
    await edit("set(control('Reveal starts at seconds'),'1.5')"); pass()

    step = 'ritual_draft_full_cycle'
    await observe(input.console, '.presentation-preview .presentation')
    await edit("control('Visibility mode').scrollIntoView({block:'start'});click('Preview full cycle')")
    await asleep(input.console)
    const hold = await phase(input.console, 'entering', 4000)
    if (hold.elapsedMs >= BLACK_HOLD_MS || hold.avatarOpacity !== 0 || hold.background !== 'rgb(0, 0, 0)' || hold.video && hold.video.opacity !== 0) fail('preview_black_hold')
    await progressing(input.console, 'entrance', videoId, 'visual-draft')
    await reveal(input.console); await awake(input.console)
    await phase(input.console, 'exiting', 5000)
    await progressing(input.console, 'exit', videoId, 'visual-draft')
    await asleep(input.console)
    const cycle = await state(input.console), sequence = cycle.history.slice(-5).map(item => item.phase)
    const exitDuration = cycle.history.at(-1)!.at - cycle.history.at(-2)!.at
    measured({ sequence, exitMs: Math.round(exitDuration) })
    if (sequence.join(',') !== 'asleep,entering,awake,exiting,asleep' || exitDuration < EXIT_MS - 80 || exitDuration > EXIT_MS + 1000) fail('preview_cycle_timing')
    await stopPreview()
    if (input.runtime.snapshot().lifecycle !== lifecycle || fingerprint((await getConfig()).active) !== activeHash) fail('preview_changed_active_or_lifecycle')
    pass()
    step = 'ritual_draft_entrance_exit_stop_cleanup'
    await observe(input.console, '.presentation-preview .presentation')
    await edit("click('Preview entrance')")
    await phase(input.console, 'entering'); await progressing(input.console, 'entrance', videoId, 'visual-draft'); await awake(input.console)
    await edit("click('Preview exit')")
    await phase(input.console, 'exiting'); await progressing(input.console, 'exit', videoId, 'visual-draft'); await stopPreview()
    if (input.runtime.snapshot().lifecycle !== lifecycle || fingerprint((await getConfig()).active) !== activeHash) fail('preview_changed_active_or_lifecycle')
    pass()

    step = 'ritual_save_reload_publish_roundtrip'
    await save()
    const saved = await getConfig(); assertSlot(saved.draft)
    if (fingerprint(saved.active) !== activeHash) fail('save_changed_active')
    await reload(); await wait(() => evaluate(uiMatches))
    if (fingerprint((await getConfig()).active) !== activeHash) fail('reload_changed_active')
    await save(); await edit("click('Publish all changes')")
    await wait(() => evaluate("return !!button('Confirm publish') && !button('Confirm publish').matches(':disabled')"))
    await edit("click('Confirm publish')")
    await wait(() => evaluate("return status()?.textContent==='Draft published.' && !button('Save all changes').matches(':disabled') && button('Publish all changes').matches(':disabled')"))
    const published = await getConfig(); assertSlot(published.active); assertSlot(published.draft)
    if (published.active.configVersion === baseline.active.configVersion) fail('publish_version_unchanged')
    await reload(); await wait(() => evaluate(uiMatches)); assertSlot((await getConfig()).active)
    for (const avatar of legacy) {
      await edit(`set(control('Editing avatar'),${JSON.stringify(avatar.id)})`)
      await wait(() => evaluate(`return control('Visibility mode')?.value===${JSON.stringify(avatar.presentation.mode)}`))
    }
    await edit(`set(control('Editing avatar'),${JSON.stringify(avatarId)})`); await wait(() => evaluate(uiMatches)); pass()

    step = 'ritual_portrait_dormant_exact_black'
    await observe(input.mirror, '.presentation')
    await asleep(input.mirror); await blackShot('mirror-ritual-asleep.png', 'asleep')
    const dormantTime = (await state(input.mirror)).audio!.timeMs
    await delay(200)
    if ((await state(input.mirror)).audio!.timeMs <= dormantTime) fail('dormant_music_stalled')
    pass()
    for (const cycleNumber of [1, 2]) {
      step = cycleNumber === 1 ? 'ritual_portrait_wake_black_hold' : 'ritual_portrait_entrance_restarts'
      if ((await input.runtime.handleSimulator({ type: 'wake' })).op !== 'success') fail('wake_simulator_failed')
      const initial = await phase(input.mirror, 'entering', 2000)
      if (initial.avatarOpacity !== 0) fail('initial_avatar_visible')
      await blackShot(`mirror-ritual-black-hold-${cycleNumber}.png`, 'entering'); pass()
      step = 'ritual_portrait_entering_video_and_reveal'
      await progressing(input.mirror, 'entrance', videoId, 'visual')
      if ((await state(input.mirror)).video?.blend !== 'screen') fail('entrance_blend')
      await reveal(input.mirror)
      if (cycleNumber === 1) await shot(input.mirror, 'mirror-ritual-entering.png')
      await awake(input.mirror)
      if (input.runtime.snapshot().lifecycle !== 'active') fail('wake_lifecycle')
      if (cycleNumber === 1) await shot(input.mirror, 'mirror-ritual-awake.png')
      pass()
      step = 'ritual_portrait_sleep_exit_then_exact_black'
      if ((await input.runtime.handleSimulator({ type: 'sleep' })).op !== 'success') fail('sleep_simulator_failed')
      await phase(input.mirror, 'exiting', 2000)
      await progressing(input.mirror, 'exit', videoId, 'visual')
      if ((await state(input.mirror)).video?.blend !== 'normal') fail('exit_blend')
      // Main may already be dormant during this bounded renderer exit. Black is
      // required only after the actual presentation reaches settled asleep.
      await asleep(input.mirror)
      const settled = await state(input.mirror), duration = settled.history.at(-1)!.at - settled.history.at(-2)!.at
      measured({ cycle: cycleNumber, exitMs: Math.round(duration) })
      if (duration < EXIT_MS - 80 || duration > EXIT_MS + 1000 || input.runtime.snapshot().lifecycle !== 'dormant') fail('exit_timing_or_lifecycle')
      await blackShot(`mirror-ritual-return-${cycleNumber}.png`, 'asleep'); pass()
    }
    input.onEvidence({ step: 'ritual_manual_acceptance', status: 'not_executed',
      item: 'physical_black_level,sound,Raven_artistic_acceptance' })
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, visualCount: 1, musicAnalyser: 'not_executed',
      screenshotCount: screenshots, consoleCheckCount: checks }
  } catch (error) {
    const reason = error instanceof Error && /^phase4_qa_[a-z0-9_]+$/.test(error.message) ? error.message : 'phase4_qa_ritual_unexpected_failure'
    const consoleState = await state(input.console).catch(() => null)
    const mirrorState = await state(input.mirror).catch(() => null)
    input.onEvidence({ step, status: 'failed', item: JSON.stringify({ reason, console: consoleState, mirror: mirrorState }) })
    await shot(input.console, 'console-ritual-failure.png').catch(() => input.onEvidence({ step: 'ritual_console_failure_capture', status: 'failed' }))
    await rawMirrorShot('mirror-ritual-failure.png').catch(() => input.onEvidence({ step: 'ritual_mirror_failure_capture', status: 'failed' }))
    throw Error(reason)
  } finally {
    dialog.showOpenDialog = picker
    input.console.setSize(originalSize[0]!, originalSize[1]!)
    for (const win of [input.console, input.mirror]) {
      await win.webContents.executeJavaScript('window.__reflectiveRitualQa?.observer.disconnect(); delete window.__reflectiveRitualQa').catch(() => undefined)
    }
  }
}
