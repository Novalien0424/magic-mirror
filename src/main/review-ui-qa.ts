import { app, BrowserWindow, ipcMain } from 'electron'
import { CONSOLE_IPC_CHANNELS } from './ipc'
import { resolve } from 'node:path'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

/** Isolated Raven UI or Main-owned synthetic calendar checks. No visitor data. */
export async function runReviewUiQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (app.getPath('userData') !== resolve(input.outputDir, '../user-data')) throw Error('review_qa_isolation_required')
  let step = 'review_console_ready', checks = 0, screenshots = 0
  let mirrorWindow = input.mirror
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const evaluate = <T>(source: string) => input.console.webContents.executeJavaScript(`(async()=>{
    const button=name=>[...document.querySelectorAll('button')].find(b=>b.checkVisibility()&&(b.getAttribute('aria-label')||b.textContent.trim())===name);
    const click=name=>{const b=button(name);if(!b||b.matches(':disabled'))throw Error('review_qa_button_'+name);b.click()};
    const field=name=>[...document.querySelectorAll('label')].find(l=>l.checkVisibility()&&l.textContent.trim().startsWith(name))?.querySelector('input,select,textarea');
    const set=(el,value)=>{if(!el)throw Error('review_qa_field_missing');const p=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    ${source}})()`, true) as Promise<T>
  const mirror = <T>(source: string) => mirrorWindow.webContents.executeJavaScript(`(async()=>{${source}})()`, true) as Promise<T>
  const wait = async (probe: () => Promise<boolean>) => {
    const end = performance.now() + 15000
    while (performance.now() < end) { if (await probe()) return; await delay(60) }
    throw Error('review_qa_timeout_' + step)
  }
  const edit = async (code: string) => { await evaluate(code); await delay(90) }
  const pass = () => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const shot = async (target: 'mirror' | 'console', file: string) => {
    const result = await capture(target === 'mirror' ? mirrorWindow : input.console, input.outputDir, file); screenshots++
    input.onEvidence({ step, status: 'captured', file, sha256: result.sha256, nonblack_pixels: result.nonblackPixels })
  }
  try {
    if (process.env['MIRROR_MEMORY_CALENDAR_QA'] === '1') {
      step = 'review_memory_calendar_provider'
      if (!input.memoryPipeline) throw Error('review_qa_memory_calendar_unavailable')
      await input.memoryPipeline(item => { input.onEvidence({ step: item, status: 'passed' }); checks++ })
      return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: checks }
    }
    await wait(() => evaluate("return !!button('Avatars') && !!document.querySelector('.runtime-status')"))
    await evaluate("if(document.documentElement.lang!=='en')throw Error('review_qa_console_language')")
    pass()

    step = 'review_console_1024_fields'
    input.console.setSize(1024, 768); await edit("click('Avatars')")
    await wait(() => evaluate("return !!field('Avatar name')"))
    await evaluate("const w=field('Avatar name').getBoundingClientRect().width;if(w<240||document.documentElement.scrollWidth>innerWidth+2)throw Error('review_qa_narrow_fields');if(!button('Stop All')||button('Stop All').matches(':disabled'))throw Error('review_qa_stop_missing')")
    await shot('console', 'review-console-1024.png'); pass()

    step = 'review_numeric_bounds'
    await edit("window.__reviewIdle=field('Sleep after inactivity').value;set(field('Sleep after inactivity'),'-5')")
    await evaluate("if(field('Sleep after inactivity').getAttribute('aria-invalid')!=='true')throw Error('review_qa_invalid_not_announced');click('Save all changes')")
    await delay(80)
    await evaluate("if(document.activeElement!==field('Sleep after inactivity'))throw Error('review_qa_invalid_not_focused');field('Sleep after inactivity').dispatchEvent(new FocusEvent('focusout',{bubbles:true}))")
    await delay(80)
    await evaluate("if(field('Sleep after inactivity').value!=='1')throw Error('review_qa_not_clamped');set(field('Sleep after inactivity'),window.__reviewIdle)")
    pass()

    step = 'review_voice_preset_undo'
    await edit("click('Voice')")
    await wait(() => evaluate("return !!button('Default · Ethereal')"))
    const before = await evaluate<string>("return field('Base voice').value+'|'+field('Speech speed').value+'|'+field('Delivery style').value")
    await edit("click('Default · Ethereal')")
    await edit("click('Undo voice preset')")
    const after = await evaluate<string>("return field('Base voice').value+'|'+field('Speech speed').value+'|'+field('Delivery style').value")
    if (before !== after) throw Error('review_qa_voice_undo_mismatch')
    await shot('console', 'review-voice-undo.png'); pass()

    step = 'review_stop_available_memories'
    await edit("click('Memories')")
    await evaluate("if(!button('Stop All')||button('Stop All').matches(':disabled'))throw Error('review_qa_stop_hidden')")
    pass()

    step = 'review_model_changes_require_publish_review'
    await evaluate("const r=await window.magicMirror.getModels();if(!r.ok)throw Error('review_qa_models_unavailable');const next=Object.fromEntries(r.value.cards.map(c=>[c.role,c.draft.modelId]));next.realtimeDialogue='gpt-review-unpublished';const saved=await window.magicMirror.saveModelDraft(next);if(!saved.ok)throw Error('review_qa_model_draft_rejected')")
    input.console.webContents.reload()
    await wait(() => evaluate("return !!button('Avatars')")); await edit("click('Avatars')")
    await edit("click('Appearance')")
    await evaluate("if(button('Save & apply all changes')||!button('Save all changes'))throw Error('review_qa_model_review_bypassed');if(!document.querySelector('.profile-change-scope')?.textContent.includes('AI model:'))throw Error('review_qa_model_scope_hidden')")
    await shot('console', 'review-model-publish-scope.png'); pass()

    step = 'review_hidden_raven_paused'
    await wait(() => mirror("return document.querySelector('.presentation')?.dataset.phase==='asleep' && document.querySelector('.avatar-stage')?.dataset.paused==='true'"))
    await delay(700)
    await evaluate("const r=await window.magicMirror.getAvatarRuntime();if(!r.ok||r.value.fps!==0)throw Error('review_qa_hidden_fps')")
    pass()

    step = 'review_visible_raven_resumes'
    await mirror(`const q=window.__reviewCue={phaseAt:0,startedAt:0,context:null};
      const observe=()=>{if(!q.phaseAt&&document.querySelector('.presentation')?.dataset.phase==='entering')q.phaseAt=performance.now()};
      q.observer=new MutationObserver(observe);q.observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-phase']});
      q.original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){
        const oscillator=q.original.call(this),start=oscillator.start.bind(oscillator);q.context=this;
        oscillator.start=(...args)=>{q.startedAt=performance.now();return start(...args)};return oscillator};`)
    if ((await input.runtime.handleSimulator({ type: 'wake' })).op !== 'success') throw Error('review_qa_wake_failed')
    await wait(() => mirror("return document.querySelector('.presentation')?.dataset.phase==='awake' && document.querySelector('.avatar-stage')?.dataset.paused==='false'"))
    await wait(() => evaluate("const r=await window.magicMirror.getAvatarRuntime();return r.ok&&r.value.fps>10"))
    const cue = await mirror<{ latency: number; closed: boolean }>("const q=window.__reviewCue;q.observer.disconnect();AudioContext.prototype.createOscillator=q.original;return {latency:q.phaseAt&&q.startedAt?Math.max(0,q.startedAt-q.phaseAt):-1,closed:q.context?.state==='closed'}")
    input.onEvidence({ step: 'review_wake_cue', status: 'measured', item: JSON.stringify(cue) })
    if (cue.latency < 0 || cue.latency > 150 || !cue.closed) throw Error('review_qa_wake_cue_deadline_or_cleanup')
    const win = BrowserWindow.fromWebContents(input.mirror.webContents)
    win?.setFullScreen(false); input.mirror.setSize(720, 1280); await delay(600)
    await shot('mirror', 'review-raven-portrait.png'); pass()

    step = 'review_landscape_feather'
    input.mirror.setSize(1280, 720)
    await wait(() => mirror("const s=document.querySelector('.avatar-stage');return s?.dataset.landscape==='true'&&getComputedStyle(s.querySelector('canvas')).maskImage!=='none'"))
    await shot('mirror', 'review-raven-landscape.png'); pass()

    step = 'review_active_renderer_recovery'
    const oldContents = mirrorWindow.webContents.id
    mirrorWindow.webContents.forcefullyCrashRenderer()
    await wait(async () => {
      const replacement = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.webContents.id !== oldContents && window.webContents.getURL().includes('/mirror/'))
      if (!replacement) return false
      mirrorWindow = replacement
      return input.runtime.snapshot().lifecycle === 'dormant' && await mirror("return document.querySelector('.avatar-stage')?.dataset.rendererState==='ready'")
    })
    if ((await input.runtime.handleSimulator({ type: 'wake' })).op !== 'success') throw Error('review_qa_recovered_wake_failed')
    await wait(() => mirror("return document.querySelector('.presentation')?.dataset.phase==='awake' && document.querySelector('.avatar-stage')?.dataset.paused==='false'"))
    await shot('mirror', 'review-raven-recovered.png'); pass()

    step = 'review_offline_chinese'
    await input.runtime.handleSimulator({ type: 'cloud_failure' })
    await wait(() => mirror("return document.body.textContent.includes('魔鏡暫時失聯')"))
    await mirror("const s=document.querySelector('.mirror__state-title');if(document.body.textContent.includes('offline_loop_asset_unavailable'))throw Error('review_qa_raw_reason')")
    BrowserWindow.fromWebContents(mirrorWindow.webContents)?.setFullScreen(false)
    mirrorWindow.setSize(720, 1280); await delay(300)
    await shot('mirror', 'review-offline-portrait.png'); pass()

    step = 'review_maintenance_chinese'
    // UI-only snapshot injection; Main's lifecycle is intentionally unchanged.
    mirrorWindow.webContents.send('mirror:snapshot', { ...input.runtime.snapshot(), lifecycle: 'maintenance', maintenanceReason: 'synthetic_review_failure' })
    await wait(() => mirror("return document.body.textContent.includes('魔鏡休息中')"))
    await mirror("if(document.body.textContent.includes('synthetic_review_failure'))throw Error('review_qa_raw_maintenance')")
    await shot('mirror', 'review-maintenance-portrait.png'); pass()

    step = 'review_server_field_error'
    await edit("click('Persona')")
    await wait(() => evaluate("return !!field('Avatar name')"))
    // Fault injection into the isolated editor: native typing is maxlength-bound,
    // but Main must reject malformed values and the UI must locate its error.
    await edit("window.__reviewName=field('Avatar name').value;set(field('Avatar name'),'A'.repeat(100))")
    await edit("click('Save all changes')")
    await wait(() => evaluate("return field('Avatar name')?.getAttribute('aria-invalid')==='true' && document.activeElement===field('Avatar name')"))
    await evaluate("if(!field('Avatar name').getAttribute('aria-describedby')||!document.querySelector('.field-error'))throw Error('review_qa_inline_error_missing')")
    await evaluate("const heading=document.querySelector('.profile-section-heading');if(heading.scrollWidth>heading.clientWidth+1)throw Error('review_qa_invalid_name_overflow')")
    await shot('console', 'review-server-field-error.png'); pass()
    await edit("set(field('Avatar name'),window.__reviewName)")

    step = 'review_status_survives_poll_failure'
    ipcMain.removeHandler(CONSOLE_IPC_CHANNELS.avatarRuntime)
    ipcMain.handle(CONSOLE_IPC_CHANNELS.avatarRuntime, () => ({ ok: false, error: 'console_runtime_unavailable', reason: 'synthetic_runtime_unavailable' }))
    await wait(() => evaluate("return document.querySelector('.runtime-status')?.textContent.includes('Status unavailable')===true"))
    await shot('console', 'review-runtime-poll-failure.png'); pass()
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: screenshots, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: checks }
  } catch (error) {
    input.onEvidence({ step, status: 'failed', item: error instanceof Error ? error.message : 'review_qa_failed' })
    await shot('console', 'review-failure-console.png').catch(() => {})
    await shot('mirror', 'review-failure-mirror.png').catch(() => {})
    throw error
  }
}
