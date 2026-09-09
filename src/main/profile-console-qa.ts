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
    const status = () => document.querySelector('.console__scenes [role=status]')?.textContent;
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
    const result=await capture(input.console,input.outputDir,name); screenshots++
    input.onEvidence({step,status:'captured',file:name,sha256:result.sha256})
  }
  const save = async (): Promise<void> => {
    await edit("click('Save all changes')")
    await wait("return status()==='Draft saved.' && !button('Check saved changes').disabled")
  }
  const reload = async (): Promise<void> => {
    await new Promise<void>(resolve=>{input.console.webContents.once('did-finish-load',()=>resolve());input.console.webContents.reload()})
    await wait("return !!button('Avatars')")
    await edit("click('Avatars')")
    await wait("return !!control('Editing avatar') && !button('Save all changes').disabled")
  }
  try {
    await edit("click('Avatars')"); await edit("click('Persona')")
    const before=await input.runtime.console.getConfig(); if(!before.ok)throw Error('profile_config_unavailable')
    const activeBefore=JSON.stringify(before.value.active)
    const original=await evaluate<string>("return control('Editing avatar').options[0].value")
    step='profile_create_neutral'
    await edit("click('New avatar')")
    const id=await evaluate<string>("return control('Editing avatar').value")
    await edit("set(control('Avatar name'),'Orion · Museum Guide')")
    await edit("set(control('Personality'),'A patient museum guide. Explain one idea at a time.')")
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
    await edit("set(control('Trigger Phrase'),'Reveal the museum')")
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
    await edit(`set(control('Editing avatar'),${JSON.stringify(id)})`)
    await edit("click('Mirror')"); await edit("click('System')"); await edit("click('Advanced config')")
    await wait("return document.querySelector('[role=alert]')?.textContent.includes('unfinished changes')")
    await edit("click('Return to unfinished changes')")
    await wait("return control('Avatar name').value==='Orion · Museum Guide' && control('Wake greeting').value==='Welcome to the museum.'")
    if(!await evaluate<boolean>("const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented"))throw Error('profile_reload_guard_missing')
    pass(step)
    step='profile_invalid_save'
    await edit("set(control('Avatar name'),'')"); await edit("click('Save all changes')")
    await wait("return status()?.includes('avatarCatalog') && !button('Save all changes').disabled")
    if(!await evaluate<boolean>("return button('Publish all changes').disabled && button('Check saved changes').disabled"))throw Error('profile_invalid_publish_enabled')
    await shot('profile-invalid-save.png', '.console__publish-bar')
    await edit("set(control('Avatar name'),'Orion · Museum Guide')"); await save(); pass(step)
    const saved=await input.runtime.console.getConfig(); if(!saved.ok||JSON.stringify(saved.value.active)!==activeBefore)throw Error('profile_save_changed_active')
    const profile=saved.value.draft.avatarCatalog?.avatars.find(a=>a.id===id)
    if(!profile||profile.modelId!==rig||profile.voice!=='cedar'||profile.voiceSpeed!==1.1||profile.voiceEffects?.pitchSemitones!==-3||profile.scenes.length!==1||profile.spells.length!==1)throw Error('profile_settings_not_isolated')
    pass('profile_saved_independent_settings')
    step='profile_reload_publish_scope'
    await reload(); await edit(`set(control('Editing avatar'),${JSON.stringify(id)})`)
    await wait("return control('Avatar name').value==='Orion · Museum Guide' && document.querySelector('.profile-change-scope').textContent.includes('Luna') && document.querySelector('.profile-change-scope').textContent.includes('Orion')")
    await edit("click('Check saved changes')"); await wait("return !button('Publish all changes').disabled")
    await edit("click('Publish all changes')")
    await wait("return document.querySelector('[aria-label=\"Confirm publication\"]').textContent.includes('Shared actions')")
    await shot('profile-publish-scope.png', '.profile-publish-confirmation')
    await edit("click('Confirm publish')"); await wait("return !button('Use on Mirror').disabled")
    pass(step)
    step='profile_activate_and_reload'
    await edit("click('Use on Mirror')")
    await wait(`const r=await window.magicMirror.getConfig();return r.ok&&r.value.active.avatarCatalog.activeAvatarId===${JSON.stringify(id)}&&r.value.active.voice==='cedar'`)
    await reload(); await wait(`return control('Editing avatar').value===${JSON.stringify(id)}`)
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
    return {...voice,screenshotCount:screenshots,consoleCheckCount:checks}
  } catch(error) {
    input.onEvidence({step,status:'failed',item:error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_ -]/g,'_').slice(0,160) : 'unknown'})
    const diagnostic=await evaluate<string>("return JSON.stringify({model:control('Model bundle')?.value,models:document.querySelectorAll('select').length,preview:document.querySelector('.cubism-studio__status')?.textContent,fault:document.querySelector('.cubism-studio .console__fault')?.textContent})")
    input.onEvidence({step:'profile_failure_diagnostic',status:'measured',item:diagnostic})
    await shot('profile-failure.png'); throw error
  }
}
