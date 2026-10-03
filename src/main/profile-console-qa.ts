import { runPromptInspectorQa } from './prompt-inspector-qa'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'
import { runVoiceConsoleQa } from './voice-console-qa'

/** Real controls + production IPC. Synthetic userData is supplied by the runner. */
export async function runProfileConsoleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const voice = await runVoiceConsoleQa(input)
  let checks = voice.consoleCheckCount ?? 0, screenshots = voice.screenshotCount, step = 'profile_ready'
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{
    const visible = e => !!e && e.getClientRects().length && !e.closest('[hidden]');
    const button = name => [...document.querySelectorAll('button')].find(e=>visible(e) && (e.getAttribute('aria-label')||e.textContent.trim())===name);
    const click = name => {const e=button(name); if(!e||e.disabled)throw Error('profile_control_'+name);e.click()};
    const control = name => [...document.querySelectorAll('label')].find(e=>visible(e) && [...e.childNodes].filter(n=>n.nodeType===3||n.nodeName==='SPAN').map(n=>n.textContent).join('').trim()===name)?.querySelector('input,textarea,select');
    const set = (e,value) => {if(!e)throw Error('profile_field_missing');const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    const status = () => document.querySelector('.console__publish-bar [role=status]')?.textContent;
    ${source}})()`, true) as Promise<T>
  const edit = async (source: string): Promise<void> => { await evaluate(source); await new Promise(r=>setTimeout(r,80)) }
  const wait = async (source: string, ms=15000): Promise<void> => {
    const end=Date.now()+ms
    while(Date.now()<end) { if(await evaluate<boolean>(source))return; await new Promise(r=>setTimeout(r,80)) }
    throw Error('profile_qa_'+step)
  }
  const pass = (name: string): void => { checks++; input.onEvidence({step:name,status:'passed'}) }
  const shot = async (name: string, target?: string): Promise<void> => {
    input.console.webContents.sendInputEvent({type:'mouseMove',x:1,y:1})
    await evaluate(target ? `document.querySelector(${JSON.stringify(target)})?.scrollIntoView({block:'center'})` : 'window.scrollTo(0,0)'); await new Promise(r=>setTimeout(r,180))
    const result=await capture(input.console,input.outputDir,name,name==='profile-live-wake-calibration.png'); screenshots++
    input.onEvidence({step,status:'captured',file:name,sha256:result.sha256})
  }
  const save = async (): Promise<void> => {
    await edit("click('Save all changes')")
    await wait("return status()==='Saved and checked. Ready to publish.' && !document.querySelector('.profile-publish-status').textContent.includes('Unsaved changes') && !button('Save all changes').disabled")
  }
  const reload = async (): Promise<void> => {
    await wait("return !document.querySelector('.profile-publish-status').textContent.includes('Unsaved changes') && !button('Save all changes').disabled")
    await new Promise<void>(resolve=>{input.console.webContents.once('did-finish-load',()=>resolve());input.console.webContents.reload()})
    await wait("return !!button('Avatars')")
    await edit("click('Avatars')")
    await wait("return !!control('Editing avatar') && !button('Save all changes').disabled")
  }
  try {
    await edit("click('Avatars')"); await edit("click('Persona')")
    step='profile_wake_actual_defaults'
    await edit("document.querySelector('.avatar-wake-tuning').open=true")
    await wait("const fields=['Wake threshold override','Wake score override','Wake trailing blanks override'];return fields.every(label=>document.querySelector('[aria-label=\"'+label+'\"]').value!=='')")
    const defaults=await input.runtime.console.getConfig()
    if(!defaults.ok||!defaults.value.wakeTuningDefaults)throw Error('wake_defaults_unavailable')
    await wait(`return document.querySelector('[aria-label="Wake threshold override"]').value===${JSON.stringify(String(defaults.value.wakeTuningDefaults.threshold))} && document.querySelector('[aria-label="Wake score override"]').value===${JSON.stringify(String(defaults.value.wakeTuningDefaults.score))} && document.querySelector('[aria-label="Wake trailing blanks override"]').value===${JSON.stringify(String(defaults.value.wakeTuningDefaults.numTrailingBlanks))}`)
    await shot('profile-wake-package-values.png','.avatar-wake-tuning');pass(step)
    step='profile_live_wake_calibration'
    await edit("click('Start live test')")
    await wait("const meter=document.querySelector('[aria-label=\"Wake match score\"]');return !!meter && Number.isFinite(meter.value) && /Decoder steps: [1-9]/.test(document.querySelector('.wake-calibration').textContent)")
    await wait("return document.querySelector('[aria-label=\"Live detector settings\"]')?.textContent.includes('Input signal') || document.querySelector('[aria-label=\"Live detector settings\"]')?.textContent.includes('Input silent')",20000)
    await edit("set(document.querySelector('[aria-label=\"Live wake threshold\"]'),0.23)")
    await wait("const text=document.querySelector('[aria-label=\"Live detector settings\"]')?.textContent;return text?.includes('Testing threshold 0.23') && (text.includes('Input signal') || text.includes('Input silent'))")
    await wait("return !!document.querySelector('[aria-label=\"Wake match score\"]') && /Decoder steps: [1-9]/.test(document.querySelector('.wake-calibration').textContent)")
    if(input.runtime.snapshot().lifecycle!=='dormant')throw Error('calibration_left_dormant')
    await shot('profile-live-wake-calibration.png','.wake-calibration')
    await edit("click('Stop test')")
    await wait("return document.querySelector('.wake-calibration [role=status]')?.textContent==='Test stopped'")
    const afterCalibration=await input.runtime.console.getConfig()
    if(!afterCalibration.ok||JSON.stringify(afterCalibration.value.active)!==JSON.stringify(defaults.value.active))throw Error('calibration_changed_published_config')
    pass(step)
    const before=await input.runtime.console.getConfig(); if(!before.ok)throw Error('profile_config_unavailable')
    const activeBefore=JSON.stringify(before.value.active)
    const original=await evaluate<string>("return control('Editing avatar').options[0].value")
    step='profile_duplicate_opens_name'
    await edit("click('Appearance')")
    await edit("click('Duplicate')")
    await wait("return !!control('Avatar name') && !control('Avatar name').matches(':disabled')", 2500)
    const duplicateId=await evaluate<string>("return control('Editing avatar').value")
    await wait("return document.activeElement===control('Avatar name') && control('Avatar name').selectionStart===0 && control('Avatar name').selectionEnd===control('Avatar name').value.length")
    for(const keyCode of 'Keyboard renamed copy') input.console.webContents.sendInputEvent({type:'char',keyCode})
    await wait("return control('Avatar name').value==='Keyboard renamed copy' && document.querySelector('.profile-editing-header h2').textContent==='Keyboard renamed copy'")
    await edit(`set(control('Editing avatar'),${JSON.stringify(original)})`)
    await edit(`set(control('Editing avatar'),${JSON.stringify(duplicateId)})`)
    await wait("return control('Avatar name').value==='Keyboard renamed copy'")
    step='profile_duplicate_save'
    await save()
    step='profile_duplicate_reload'
    await reload()
    await edit(`set(control('Editing avatar'),${JSON.stringify(duplicateId)})`)
    await wait("return control('Avatar name').value==='Keyboard renamed copy'")
    step='profile_duplicate_delete'
    await edit("click('Delete avatar')")
    await edit("click('Confirm deletion')")
    await wait("return !document.querySelector('dialog') && !button('New avatar').disabled")
    pass('profile_duplicate_opens_name')
    step='profile_create_neutral'
    await edit("click('New avatar')")
    const id=await evaluate<string>("return control('Editing avatar').value")
    await edit("set(control('Avatar name'),'Orion · Museum Guide')")
    await edit("set(control('Personality'),'A patient museum guide. Explain one idea at a time.')")
    await edit("set(control('Wake phrase'),'Hello Ren')")
    await edit("document.querySelector('.avatar-wake-tuning').open=true;document.querySelector('[aria-label=\"Enable avatar wake tuning\"]').click()")
    await edit("set(document.querySelector('[aria-label=\"Wake threshold override\"]'),0.37)")
    await edit("set(document.querySelector('[aria-label=\"Wake score override\"]'),1.7)")
    await edit("set(document.querySelector('[aria-label=\"Wake trailing blanks override\"]'),2)")
    await edit("set(control('Sleep phrase'),'Orion goodnight')")
    await edit("set(control('Wake greeting'),'Welcome to the museum.')")
    await edit("set(control('Sleep farewell (verbatim)'),'See you next time.')")
    pass(step)
    step='profile_rig_assignment'
    await edit("click('Appearance')")
    await wait("return control('Model bundle').options.length>1")
    await edit("const e=control('Model bundle');set(e,[...e.options].find(o=>o.value.startsWith('model-')).value)")
    const rig=await evaluate<string>("return control('Model bundle').value")
    await edit("const d=[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='Advanced rig preview · local only');d.open=true")
    await wait("return document.querySelector('.cubism-studio [aria-label=\"Loaded avatar model\"]').textContent.includes('Loaded:') && !button('Stop / reset').disabled",25000)
    if(await evaluate<boolean>("return [...document.querySelectorAll('.cubism-studio select')].some(visible)"))throw Error('profile_second_rig_selector')
    await edit("click('Stop / reset')"); pass(step)
    step='profile_voice_and_scene'
    await edit("click('Voice')"); await edit("click('Raven · Dark oracle')")
    await edit("set(control('Base voice'),'cedar')")
    await edit("set(control('Delivery style'),'Warm, clear and concise.')")
    await edit("set(document.querySelector('.voice-studio input[min=\"0.5\"]'),1.1)")
    await edit("click('Spells & scenes')"); await edit("click('Add scene')")
    await edit("set(control('Scene name'),'Museum reveal')")
    await edit("set(control('Trigger Phrase'),'施放咒語，下雨')")
    await edit("set(control('Duration seconds'),0.5)")
    await edit("click('+ Lighting')")
    await edit("set(control('Name'),'Museum glow')")
    await edit("click('Action library')")
    await edit("document.querySelector('.profile-workspace__editor details').open=true")
    await wait("return document.querySelector('.profile-workspace__editor').textContent.includes('Used by: Orion')")
    pass(step)
    step='profile_unsaved_round_trip'
    await edit("click('Persona')")
    await edit(`set(control('Editing avatar'),${JSON.stringify(original)})`)
    await edit("set(control('Avatar name'),'Luna · Welcome Host')")
    await edit("set(control('Sleep phrase'),'Luna goodnight')")
    await edit(`set(control('Editing avatar'),${JSON.stringify(id)})`)
    await edit("click('Mirror')"); await edit("click('System')"); await edit("click('Advanced config')")
    await wait("return document.querySelector('[role=alert]')?.textContent.includes('unfinished changes')")
    await edit("click('Return to unfinished changes')")
    await wait("return control('Avatar name').value==='Orion · Museum Guide' && control('Wake greeting').value==='Welcome to the museum.' && control('Wake phrase').value==='Hello Ren' && control('Sleep phrase').value==='Orion goodnight'")
    if(!await evaluate<boolean>("const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented"))throw Error('profile_reload_guard_missing')
    pass(step)
    step='profile_invalid_save'
    await edit("set(control('Avatar name'),'')"); await edit("click('Save all changes')")
    await wait("return status()?.includes('avatarCatalog') && !button('Save all changes').disabled")
    if(!await evaluate<boolean>("return button('Publish all changes').disabled"))throw Error('profile_invalid_publish_enabled')
    await shot('profile-invalid-save.png', '.console__publish-bar')
    await edit("set(control('Avatar name'),'Orion · Museum Guide')"); await save(); pass(step)
    const saved=await input.runtime.console.getConfig(); if(!saved.ok||JSON.stringify(saved.value.active)!==activeBefore)throw Error('profile_save_changed_active')
    const profile=saved.value.draft.avatarCatalog?.avatars.find(a=>a.id===id)
    if(!profile||profile.modelId!==rig||profile.voice!=='cedar'||profile.voiceSpeed!==1.1||profile.voiceEffects?.pitchSemitones!==-3||profile.scenes.length!==1||profile.spells.length!==1)throw Error('profile_settings_not_isolated')
    if(profile.wakePhrase!=='Hello Ren'||profile.sleepPhrase!=='Orion goodnight'
      ||saved.value.draft.avatarCatalog?.avatars.find(a=>a.id===original)?.sleepPhrase!=='Luna goodnight')throw Error('profile_commands_not_isolated')
    if(!profile.wakeTuning?.enabled||profile.wakeTuning.phrase!=='Hello Ren'||profile.wakeTuning.threshold!==0.37
      ||profile.wakeTuning.score!==1.7||profile.wakeTuning.numTrailingBlanks!==2)throw Error('profile_wake_tuning_not_saved')
    pass('profile_saved_independent_settings')
    step='profile_save_inflight_edit'
    await edit("click('Persona')")
    await edit("set(control('Avatar name'),'Orion saved snapshot')")
    await evaluate("click('Save all changes'); set(control('Avatar name'),'Orion newer edit')")
    await wait("return !button('Save all changes').disabled && control('Avatar name').value==='Orion newer edit' && button('Publish all changes').disabled")
    const inflight=await input.runtime.console.getConfig()
    if(!inflight.ok || inflight.value.draft.avatarCatalog?.avatars.find(a=>a.id===id)?.name!=='Orion saved snapshot')throw Error('profile_save_snapshot_lost')
    await shot('profile-inflight-edit.png','.console__publish-bar'); pass(step)
    await edit("set(control('Avatar name'),'Orion · Museum Guide')"); await save()
    step='profile_save_abort'
    await evaluate("click('Save all changes'); await new Promise(r=>setTimeout(r,0)); const abort=button('Abort check'); if(abort)abort.click()")
    await wait("return !button('Save all changes').disabled")
    await save(); pass(step)
    step='profile_reload_publish_scope'
    await reload(); await edit(`set(control('Editing avatar'),${JSON.stringify(id)})`)
    await wait("return control('Avatar name').value==='Orion · Museum Guide' && document.querySelector('.profile-change-scope').textContent.includes('Luna') && document.querySelector('.profile-change-scope').textContent.includes('Orion')")
    await edit("click('Save all changes')"); await wait("return !button('Publish all changes').disabled")
    await edit("click('Publish all changes')")
    await wait("return document.querySelector('[aria-label=\"Confirm publication\"]').textContent.includes('Shared actions')")
    await shot('profile-publish-scope.png', '.profile-publish-confirmation')
    await edit("click('Confirm publish')"); await wait("return !button('Use on Mirror').disabled")
    pass(step)
    step='profile_activate_and_reload'
    await edit("click('Use on Mirror')")
    await wait(`const r=await window.magicMirror.getConfig();return r.ok&&r.value.active.avatarCatalog.activeAvatarId===${JSON.stringify(id)}&&r.value.active.voice==='cedar'`)
    await reload(); await wait(`return control('Editing avatar').value===${JSON.stringify(id)}`)
    await wait("return control('Wake phrase').value==='Hello Ren'&&control('Sleep phrase').value==='Orion goodnight'")
    const prompts = await runPromptInspectorQa(input, 'Orion goodnight', 'profile')
    checks += prompts.checks; screenshots += prompts.screenshots
    const activated=await input.runtime.console.getConfig()
    if(!activated.ok||activated.value.active.wake.phrase!=='Hello Ren')throw Error('profile_wake_projection_missing')
    const loadedWake=await input.runtime.getPublishedWakeConfigForRuntime()
    if(!loadedWake.tuning?.enabled||loadedWake.tuning.phrase!=='Hello Ren'||loadedWake.tuning.threshold!==0.37
      ||loadedWake.tuning.score!==1.7||loadedWake.tuning.numTrailingBlanks!==2)throw Error('profile_wake_tuning_not_loaded')
    await edit("document.querySelector('.avatar-wake-tuning').open=true")
    await wait("return document.querySelector('[aria-label=\"Enable avatar wake tuning\"]').checked && document.querySelector('[aria-label=\"Wake threshold override\"]').value==='0.37'")
    await shot('profile-wake-tuning.png','.avatar-wake-tuning')
    pass('profile_wake_tuning_saved_published_loaded')
    const wakeEvents=input.runtime.console.getEvents({limit:100,module:'wake',source:'runtime'})
    const wakeReasons=wakeEvents.ok?wakeEvents.value.events.map(e=>e.reason):[]
    if(!wakeReasons.includes('wake_worker_released')||wakeReasons.filter(r=>r==='wake_worker_ready').length<2
      ||wakeReasons.filter(r=>r==='wake_worker_listening').length<2)throw Error('profile_wake_worker_not_reconfigured')
    pass('profile_wake_worker_reconfigured')
    pass('profile_commands_saved_published_activated')
    step='profile_short_spell_runtime'
    const inject = (text: string, turn: string): Promise<{decision: string; reason?: string; result?: {status: string}}> =>
      input.mirror.webContents.executeJavaScript(`window.magicMirrorPhase4Qa.injectFinalTranscript(${JSON.stringify(text)},${JSON.stringify(turn)})`,true)
    const negative=await inject('不要施放咒語，下雨','qa-short-negative')
    if(negative.decision!=='ignored')throw Error('profile_short_spell_negation')
    const unknown=await inject('施放咒語，下雪','qa-short-unknown')
    if(unknown.decision!=='ignored'||unknown.reason!=='spell_command_not_recognized')throw Error('profile_short_spell_feedback')
    const rain=await inject('施放咒语， 下雨！','qa-short-rain')
    if(rain.decision!=='triggered'||rain.result?.status!=='completed')throw Error('profile_short_spell_execution')
    const duplicate=await inject('施放咒語，下雨','qa-short-rain')
    if(duplicate.decision!=='ignored'||duplicate.reason!=='duplicate_turn')throw Error('profile_short_spell_duplicate')
    pass('profile_short_spell_completed_once')
    await edit("click('Appearance')"); await wait(`return control('Model bundle').value===${JSON.stringify(rig)}`)
    pass(step)
    step='profile_visual_matrix'
    for(const [width,height] of [[1440,900],[1024,768]]) {
      input.console.setSize(width!,height!); await new Promise(r=>setTimeout(r,150))
      let sectionTop: number | undefined
      for(const section of ['Persona','Appearance','Voice','Spells & scenes','Media library']) {
        await edit(`click(${JSON.stringify(section)})`)
        await new Promise(r=>setTimeout(r,350))
        if(await evaluate<boolean>('return document.documentElement.scrollWidth>innerWidth'))throw Error('profile_horizontal_overflow_'+section)
        await shot(`profile-${width}-${section.replaceAll(/[^a-z]/gi,'-').toLowerCase()}.png`)
        if (section === 'Persona') {
          await edit("document.querySelector('.avatar-wake-tuning').open=true")
          await shot(`profile-${width}-wake-tuning.png`, '.avatar-wake-tuning')
        }
        const top=await evaluate<number>("return document.querySelector('.profile-sections').getBoundingClientRect().top+scrollY")
        if(sectionTop!==undefined && Math.abs(top-sectionTop)>1)throw Error('profile_section_navigation_shift_'+section)
        sectionTop=top
        if (section === 'Voice') await shot(`profile-${width}-voice-controls.png`, '.voice-file-picker')
      }
      await edit("click('Mirror')");await shot(`profile-${width}-mirror.png`)
      await edit("click('System')");await shot(`profile-${width}-system.png`)
      await edit("click('Avatars')")
    }
    await edit("click('Persona');document.activeElement?.blur()")
    input.console.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'}); input.console.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'})
    await wait("return document.activeElement!==document.body && getComputedStyle(document.activeElement).outlineStyle!=='none'")
    pass('profile_keyboard_focus'); pass(step)
    step='profile_mirror_avatar_selection'
    await edit("click('Mirror')")
    await wait(`return control('Choose active avatar')?.value===${JSON.stringify(id)}`)
    await edit(`set(control('Choose active avatar'),${JSON.stringify(original)})`)
    await edit("click('Activate avatar')")
    await wait(`const r=await window.magicMirror.getConfig();return r.ok&&r.value.active.avatarCatalog.activeAvatarId===${JSON.stringify(original)}&&document.querySelector('#active-avatar-heading').textContent==='Luna · Welcome Host'`)
    await shot('profile-mirror-active-selection.png', '.console__active-avatar'); pass(step)
    step='profile_editing_identity'
    await edit("click('Manage avatars')");await edit("click('Persona')")
    await edit(`set(control('Editing avatar'),${JSON.stringify(id)})`)
    await wait("return document.querySelector('.profile-editing-header h2').textContent==='Orion · Museum Guide' && document.querySelector('.profile-editing-header').textContent.includes('Luna · Welcome Host')")
    await shot('profile-editing-identity.png', '.profile-editing-header'); pass(step)
    step='profile_delete_active_guard'
    await edit(`set(control('Editing avatar'),${JSON.stringify(original)})`)
    if(!await evaluate<boolean>("return button('Delete avatar').disabled && document.querySelector('#avatar-delete-reason').textContent.includes('Switch')"))throw Error('active_avatar_delete_enabled')
    pass(step)
    await edit("set(control('Avatar name'),'Luna unfinished edit')")
    step='profile_delete_confirmation'
    await edit(`set(control('Editing avatar'),${JSON.stringify(id)})`)
    await edit("click('Delete avatar')")
    await wait("return document.querySelector('dialog')?.open && !button('Confirm deletion').disabled")
    await shot('profile-delete-confirmation.png', 'dialog')
    input.console.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); input.console.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
    await wait(`return !document.querySelector('dialog') && control('Editing avatar').value===${JSON.stringify(id)}`)
    await edit("click('Delete avatar')")
    await edit("click('Cancel')")
    await wait(`return !document.querySelector('dialog') && control('Editing avatar').value===${JSON.stringify(id)}`)
    await edit("click('Delete avatar')")
    await edit("click('Confirm deletion')")
    await wait(`return !document.querySelector('dialog') && ![...control('Editing avatar').options].some(o=>o.value===${JSON.stringify(id)})`)
    pass(step)
    step='profile_delete_immediate_and_reload'
    await wait("return control('Avatar name').value==='Luna unfinished edit'")
    const deleted=await input.runtime.console.getConfig()
    if(!deleted.ok||deleted.value.active.avatarCatalog?.avatars.some(a=>a.id===id)||deleted.value.draft.avatarCatalog?.avatars.some(a=>a.id===id))throw Error('avatar_delete_not_immediate')
    if(deleted.value.active.avatarCatalog?.avatars.find(a=>a.id===original)?.name!=='Luna · Welcome Host')throw Error('avatar_delete_published_unrelated_edit')
    await edit("click('Mirror')")
    await wait(`return ![...control('Choose active avatar').options].some(o=>o.value===${JSON.stringify(id)})`)
    await edit("click('Avatars')");await save()
    await reload();await edit("click('Mirror')")
    await wait(`return control('Choose active avatar').value===${JSON.stringify(original)}&&![...control('Choose active avatar').options].some(o=>o.value===${JSON.stringify(id)})`)
    await shot('profile-avatar-deleted.png', '.console__active-avatar');pass(step)
    return {...voice,screenshotCount:screenshots,consoleCheckCount:checks}
  } catch(error) {
    input.onEvidence({step,status:'failed',item:error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_ -]/g,'_').slice(0,160) : 'unknown'})
    const diagnostic=await evaluate<string>("return JSON.stringify({model:control('Model bundle')?.value,models:document.querySelectorAll('select').length,preview:document.querySelector('.cubism-studio__status')?.textContent,fault:document.querySelector('.cubism-studio .console__fault')?.textContent})")
    input.onEvidence({step:'profile_failure_diagnostic',status:'measured',item:diagnostic})
    await shot('profile-failure.png'); throw error
  }
}
