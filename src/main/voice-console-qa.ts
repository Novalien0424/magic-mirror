import { dialog } from 'electron'
import { resolve } from 'node:path'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'
export async function runVoiceConsoleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let checks = 0, screenshots = 0
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim()===text && b.getClientRects().length);
    const click = text => {const b=button(text);if(!b||b.disabled)throw Error('voice_qa_control_'+text);b.click()};
    const set = (el,value) => { const proto = el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); };
    ${source}})()`, true) as Promise<T>
  const wait = async (source: string, reason: string, ms = 15000): Promise<void> => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (await evaluate<boolean>(source)) return; await new Promise(r => setTimeout(r, 80)) }
    throw Error(`voice_qa_${reason}`)
  }
  const edit = async (source: string): Promise<void> => { await evaluate(source); await new Promise(r => setTimeout(r, 100)) }
  const pass = (step: string): void => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const shot = async (file: string): Promise<void> => { const image = await capture(input.console, input.outputDir, file); screenshots++; input.onEvidence({ step: 'voice_screenshot', status: 'captured', file, sha256: image.sha256 }) }
  const picker = dialog.showOpenDialog
  try {
    await wait("return !!button('Voice Studio')", 'page_ready')
    const before = await input.runtime.console.getConfig(); if (!before.ok) throw Error('voice_qa_config')
    const activeBefore = JSON.stringify(before.value.active)
    await edit("click('Voice Studio')")
    await wait("return !!button('Default · Ethereal') && !button('Default · Ethereal').disabled", 'editor_ready')
    await edit("click('Default · Ethereal')")
    await wait("return document.querySelector('[aria-label=\"Pitch · semitones\"]').value==='1'", 'default_preset')
    pass('voice_default_preset')
    for (const label of ['Pitch · semitones','Body / formant · semitones','Warmth · dB','Brightness · dB','Grit','Room mix','Output trim · dB']) {
      await edit(`const el=document.querySelector('[aria-label=${JSON.stringify(label)}]');set(el,Number(el.min)+(Number(el.max)-Number(el.min))/2);`)
    }
    await edit("click('Default · Ethereal')"); await edit("click('Save Draft')")
    await wait("return !button('Save Draft').disabled && !button('Validate draft').disabled", 'save')
    pass('voice_controls_saved')
    await shot('voice-default.png')
    await edit("document.querySelector('.voice-studio fieldset:nth-of-type(2)').scrollIntoView({block:'start'})")
    await shot('voice-default-controls.png')
    // Synthetic file selection; actual DOM change/decoder/graph remain production.
    await edit(`const rate=48000,n=rate*2,bytes=new ArrayBuffer(44+n*2),v=new DataView(bytes);
      const str=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
      str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);
      for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(2*Math.PI*440*i/rate)*2000,true);
      const dt=new DataTransfer();dt.items.add(new File([bytes],'synthetic-voice.wav',{type:'audio/wav'}));const el=document.querySelector('.voice-studio input[type=file]');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));`)
    await edit("document.querySelector('.voice-studio__preview input[type=checkbox]').click();click('Play local fixture')")
    await wait("return document.querySelector('.voice-studio [role=status]').textContent.includes('Local fixture playing')", 'local_playback')
    await edit("click('Original')"); await edit("click('Processed')"); await edit("click('Stop')")
    pass('voice_local_loop_ab_stop')
    await edit("click('New avatar')"); await edit("click('Raven · Dark oracle')")
    await edit("click('Avatar / Audio')"); await edit("click('Appearance')")
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [resolve('resources/avatar/Raven/v10/runtime/raven-lord.model3.json')] })) as typeof dialog.showOpenDialog
    await edit("const d=[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='Cubism model');d.open=true;click('Browse & import Cubism…')")
    await wait("return !button('Save Draft').disabled", 'raven_import')
    await edit("click('Voice Studio')")
    await wait("return document.querySelector('[aria-label=\"Pitch · semitones\"]').value==='-3'", 'rig_keeps_effect')
    await edit("click('Save Draft')"); await wait("return !button('Validate draft').disabled", 'raven_save')
    await edit("document.querySelector('.voice-studio').scrollIntoView({block:'start'})")
    await new Promise(r => setTimeout(r, 1200)); await shot('voice-raven.png')
    pass('voice_raven_rig_preserves_settings')
    const saved = await input.runtime.console.getConfig(); if (!saved.ok) throw Error('voice_qa_saved_config')
    if (JSON.stringify(saved.value.active) !== activeBefore) throw Error('voice_qa_active_changed')
    const avatars = saved.value.draft.avatarCatalog!.avatars
    if (avatars.length !== 2 || avatars[0]!.voiceEffects?.pitchSemitones !== 1 || avatars[1]!.voiceEffects?.pitchSemitones !== -3) throw Error('voice_qa_avatar_isolation')
    pass('voice_draft_active_isolation')
    if (process.env['MIRROR_VOICE_QA_LIVE'] === '1') {
      for (const speed of [0.75, 1, 1.25]) {
        await edit(`set(document.querySelector('.voice-studio input[min="0.5"]'),${speed})`); await edit("click('Generate test voice')")
        await wait("return document.querySelector('.voice-studio [role=status]').textContent.includes('Generating one audition')", 'provider_started', 18000)
        await wait("return !button('Generate test voice').disabled", 'provider_finished', 22000)
        const status = await evaluate<string>("return document.querySelector('.voice-studio [role=status]').textContent")
        if (/failed|timeout|limit|rejected/i.test(status)) throw Error('voice_qa_provider_failed')
        pass(`voice_provider_speed_${speed}`)
      }
    }
    await edit("click('Overview')"); pass('voice_page_leave')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, visualCount: 0, musicAnalyser: 'not_executed', screenshotCount: screenshots, consoleCheckCount: checks }
  } catch (error) {
    input.onEvidence({ step: 'voice_failure', status: 'failed', item: error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 120) : 'unknown' })
    await shot('voice-failure.png'); throw error
  } finally { dialog.showOpenDialog = picker }
}
