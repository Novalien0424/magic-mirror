import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

/** Isolated synthetic music and recorded speech; no provider or operator writes. */
export async function runActiveBgmQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let step = 'active_bgm_editor', checks = 0, screenshots = 0
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{
    const button=name=>[...document.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&(b.getAttribute('aria-label')||b.textContent.trim())===name);
    const control=prefix=>[...document.querySelectorAll('.presentation-editor label')].find(l=>l.textContent.startsWith(prefix))?.querySelector('input,select');
    const set=(el,value)=>{if(!el)throw Error('bgm_qa_control_missing');
      Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    const click=name=>{const b=button(name);if(!b||b.disabled)throw Error('bgm_qa_button_unavailable_'+name);b.click();};
    ${source}})()`, true) as Promise<T>
  const mirror = <T>(source: string): Promise<T> => input.mirror.webContents.executeJavaScript(`(()=>{
    const p=document.querySelector('.presentation'), a=p?.querySelector('audio'); ${source}})()`, true) as Promise<T>
  const wait = async (probe: () => Promise<boolean>): Promise<void> => {
    const until = Date.now() + 15000
    while (Date.now() < until) {
      if (await probe()) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw Error('phase4_qa_' + step)
  }
  const edit = async (source: string): Promise<void> => { await evaluate(source); await new Promise(resolve=>setTimeout(resolve, 75)) }
  const pass = () => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const shot = async (name: string): Promise<void> => {
    const evidence = await capture(input.console, input.outputDir, name)
    screenshots++; input.onEvidence({ step, status: 'captured', file: name, sha256: evidence.sha256, nonblack_pixels: evidence.nonblackPixels })
  }
  try {
    await wait(()=>evaluate("return !!button('Avatars')"))
    await edit("click('Avatars')")
    await wait(()=>evaluate("return !!button('Appearance')"))
    await edit("click('Appearance')")
    await wait(()=>evaluate("return !!control('Active BGM volume')"))
    await evaluate("const sliders=[...document.querySelectorAll('.presentation-editor input[type=range]')]; if(sliders.length!==2||sliders[1]!==control('Active BGM volume')||sliders[1].value!=='0')throw Error('active_bgm_slider_order_or_default')")
    await edit("const s=control('Sleep ambience');set(s,s.options[1].value)")
    await edit("set(control('Ambience volume'), '0.4')")
    await edit("set(control('Active BGM volume'), '0.2')")
    await edit("control('Active BGM volume').scrollIntoView({block:'center'})")
    await new Promise(resolve=>setTimeout(resolve,150))
    await shot('active-bgm-slider.png'); pass()

    step = 'active_bgm_preview'
    await edit("click('Preview entrance')")
    await wait(()=>evaluate("const p=document.querySelector('.presentation-editor .presentation'),a=p?.querySelector('audio');return p?.dataset.phase==='awake'&&a&&!a.paused&&Math.abs(a.volume-.2)<.001"))
    step = 'active_bgm_preview_stop'
    await edit("click('Stop preview')"); pass()

    step = 'active_bgm_saved_published'
    await edit("click('Save all changes')")
    await wait(()=>evaluate("return !button('Publish all changes').disabled"))
    await edit("click('Publish all changes')"); await edit("click('Confirm publish')")
    await wait(()=>evaluate("const r=await window.magicMirror.getConfig();return r.ok&&r.value.active.presentation.activeAmbienceGain===.2&&r.value.active.presentation.ambienceGain===.4"))
    input.console.webContents.reload()
    await wait(()=>evaluate("return !!button('Avatars')")); await edit("click('Avatars')")
    await wait(()=>evaluate("return !!button('Appearance')")); await edit("click('Appearance')")
    await wait(()=>evaluate("return control('Active BGM volume')?.value==='0.2'")); pass()

    step = 'active_bgm_sleep_and_wake'
    await wait(()=>mirror("return a&&!a.paused&&Math.abs(a.volume-.4)<.001"))
    await input.runtime.handleSimulator({ type: 'wake' })
    await wait(()=>mirror("return p?.dataset.phase==='awake'&&a&&!a.paused&&Math.abs(a.volume-.2)<.001"))
    const time = await mirror<number>('return a.currentTime')
    await new Promise(resolve=>setTimeout(resolve,200))
    if (await mirror<boolean>(`return a.currentTime === ${time}`)) throw Error('active_bgm_time_not_advancing')
    pass()

    step = 'active_bgm_speech_priority'
    await edit("click('System')")
    await wait(()=>evaluate("return !!button('Play recorded AI')"))
    await edit("const b=button('Play recorded AI');for(let p=b.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;click('Play recorded AI')")
    await wait(()=>mirror('return a&&!a.paused&&a.volume===0'))
    step = 'active_bgm_speech_audible'
    await wait(()=>evaluate("const r=await window.magicMirror.getAvatarRuntime();return r.ok&&r.value.mouthOpen>0&&r.value.voiceGain===1"))
    step = 'active_bgm_speech_restore'
    await wait(()=>mirror('return a&&!a.paused&&Math.abs(a.volume-.2)<.001')); pass()

    step = 'active_bgm_interrupted_speech'
    await edit("click('Play recorded AI')")
    await wait(()=>mirror('return a&&a.volume===0'))
    await edit("click('Stop recorded AI')")
    await wait(()=>mirror('return a&&!a.paused&&Math.abs(a.volume-.2)<.001')); pass()

    step = 'active_bgm_global_mute'
    await edit("set(document.querySelector('[aria-label=\"BGM volume\"]'),'0')")
    await wait(()=>mirror('return a&&a.paused&&a.volume===0'))
    await edit("set(document.querySelector('[aria-label=\"BGM volume\"]'),'100')")
    await wait(()=>mirror('return a&&!a.paused&&Math.abs(a.volume-.2)<.001')); pass()

    step = 'active_bgm_return_to_sleep'
    await input.runtime.handleSimulator({ type: 'sleep' })
    await wait(()=>mirror("return p?.dataset.phase==='asleep'&&a&&!a.paused&&Math.abs(a.volume-.4)<.001")); pass()
    return { motionCount:0,expressionCount:0,sceneCount:0,visualCount:0,musicAnalyser:'not_executed',screenshotCount:screenshots,consoleCheckCount:checks }
  } catch (error) {
    const state=await mirror('return {phase:p?.dataset.phase,paused:a?.paused,volume:a?.volume,time:a?.currentTime,ready:a?.readyState,error:a?.error?.code}')
    const failure = error instanceof Error ? error.message.slice(0,200) : 'unknown'
    input.onEvidence({step,status:'failed',item:JSON.stringify({state,failure})})
    await shot('active-bgm-failure.png').catch(()=>undefined)
    throw error
  }
}
