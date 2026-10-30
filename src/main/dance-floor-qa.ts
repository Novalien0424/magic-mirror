import { readFile, readdir, writeFile, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'
import type { DanceView } from '../shared/dance-floor'

/** Production DOM controls, native playback/analysis and actual Raven Core writes. */
export async function runDanceFloorQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const userData = resolve(input.outputDir, '..', 'user-data')
  if (process.env['MIRROR_PHASE4_QA'] !== '1' || resolve(process.env['MIRROR_USER_DATA_DIR'] ?? '') !== userData) throw Error('dance_qa_isolation')
  let checks = 0, shots = 0
  const pass = (step: string, metrics: object = {}) => { checks++; input.onEvidence({ step, status: 'passed', item: JSON.stringify(metrics) }) }
  const ui = <T>(code: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{
    const bridge=window.mirrorConsole ?? window.magicMirror;
    const visible=e=>e && e.getClientRects().length && !e.closest('[hidden]');
    const button=s=>[...document.querySelectorAll('button')].find(e=>visible(e)&&e.textContent.trim()===s);
    const click=s=>{const e=button(s);if(!e||e.disabled)throw Error('dance_qa_button_'+s);e.click()};
    const field=s=>[...document.querySelectorAll('input,select')].find(e=>visible(e)&&e.getAttribute('aria-label')===s);
    const set=(s,v)=>{const e=field(s);if(!e)throw Error('dance_qa_field');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    ${code}})()`, true) as Promise<T>
  const mirror = <T>(code: string): Promise<T> => input.mirror.webContents.executeJavaScript(`(async()=>{${code}})()`, true) as Promise<T>
  const wait = async (probe: () => Promise<boolean>, ms=20000) => {
    const until=Date.now()+ms; while(Date.now()<until){if(await probe())return;await new Promise(r=>setTimeout(r,100))}throw Error('dance_qa_timeout')
  }
  const view = () => ui<DanceView>(`const r=await bridge.danceFloor({action:'get'});if(!r.ok)throw Error('dance_qa_view');return r.value`)
  const click = async (name: string) => {
    await wait(()=>ui(`return !!button(${JSON.stringify(name)})&&!button(${JSON.stringify(name)}).disabled`))
    await ui<void>(`click(${JSON.stringify(name)})`)
  }
  const save = async () => {await click('Save settings');await wait(()=>ui(`return button('Save settings').disabled`))}
  const playing = () => wait(async()=>{const v=await view();return v.frame.status==='playing'&&v.frame.rate===1},60000)
  const shot = async (name:string, onMirror=true) => {const result=await capture(onMirror?input.mirror:input.console,input.outputDir,name);shots++;input.onEvidence({step:'dance_visual',status:'captured',file:name,sha256:result.sha256,nonblack_pixels:result.nonblackPixels})}
  await wait(()=>ui(`return !!button('Dance Floor')`));await click('Dance Floor')
  await wait(async()=> (await view()).tracks.length===2)
  const initial=await view(), fixture=initial.tracks.find(t=>t.name.endsWith('.wav'))!, actual=initial.tracks.find(t=>t.name.endsWith('.m4a'))!
  if(!initial.settings.welcome||initial.settings.volume!==1||initial.settings.language!=='zh-TW')throw Error('dance_qa_defaults')
  pass('dance_defaults_and_tracks',{tracks:initial.tracks.length})
  await ui(`set('Dance Floor track',${JSON.stringify(fixture.id)})`);await save()
  await click('Start Dance Floor')
  await wait(async()=> (await view()).frame.status==='welcome')
  await wait(()=>mirror(`return document.querySelector('.avatar-stage')?.dataset.avatarState==='Speaking'`),14000)
  await playing()
  if (!await mirror(`const d=document.querySelector('.dance-floor')?.dataset;return d?.danceWelcomeCompleted==='true'&&+d.danceWelcomePeak>0.001`)) throw Error('dance_qa_welcome_incomplete')
  pass('dance_provider_welcome_before_music')
  await click('STOP · black screen');await wait(()=>ui(`return !button('Start Dance Floor').disabled`))
  await ui(`field('DJ welcome').click()`);await save()
  if((await view()).settings.track!==fixture.id||(await view()).settings.welcome)throw Error('dance_qa_save')
  pass('dance_ui_selection_and_save');await shot('dance-console.png',false)
  await click('Start Dance Floor');await playing()
  await wait(()=>mirror(`return document.querySelector('.dance-floor')?.dataset.danceSynchronized==='true'`))
  if(!(await view()).outputs.verified)throw Error('dance_qa_volume')
  pass('dance_native_playback',{outputs:(await view()).outputs})
  const samples=await mirror<Array<{p:number,y:number,b:number,t:number}>>(`return new Promise(resolve=>{const a=[],end=performance.now()+27000;const tick=()=>{
    const d=document.querySelector('.dance-floor')?.dataset;if(d?.danceSynchronized==='true')a.push({p:+d.dancePositionMs,y:+d.danceHeadY,b:+d.danceBeat,t:+d.danceImpactMs});
    if(performance.now()<end)requestAnimationFrame(tick);else resolve(a)};tick()})`)
  let wraps=0;const groups=new Map<string,typeof samples>();let previous=0
  for(const sample of samples){if(sample.p<previous-500)wraps++;previous=sample.p;const key=`${wraps}:${sample.b}`;const group=groups.get(key)??[];group.push(sample);groups.set(key,group)}
  const errors:number[]=[]
  for(const group of groups.values()){
    if(!group.some(s=>s.p<s.t-50)||!group.some(s=>s.p>s.t+50))continue
    const peak=group.reduce((a,b)=>a.y<b.y?a:b);errors.push(Math.abs(peak.p-peak.t))
  }
  errors.sort((a,b)=>a-b);const p95=errors[Math.floor(errors.length*.95)]??Infinity
  if(errors.length<20||p95>65||wraps<1)throw Error('dance_qa_sync')
  pass('dance_rendered_sync_and_loop',{samples:samples.length,beats:errors.length,wraps,medianMs:errors[Math.floor(errors.length/2)],p95Ms:p95})
  await writeFile(join(input.outputDir,'dance-sync.json'),JSON.stringify({samples: samples.length,beats:errors.length,wraps,errorsMs:errors}))
  const cache=join(userData,'dance-analysis-v1');let matched=false
  for(const name of await readdir(cache)){
    const a=JSON.parse(await readFile(join(cache,name),'utf8'));if(a.durationMs>13000)continue
    const beats=a.beats.filter((b:{timeMs:number})=>b.timeMs>1000&&b.timeMs<11000)
    const onsets=beats.map((b:{timeMs:number})=>Math.min(b.timeMs%500,500-b.timeMs%500))
    if(beats.length<17||onsets.some((e:number)=>e>45))throw Error('dance_qa_detector')
    matched=true;pass('dance_native_pcm_ground_truth',{beats:beats.length,maxOnsetErrorMs:Math.max(...onsets)})
  }
  if(!matched)throw Error('dance_qa_analysis_missing')
  for(let i=0;i<6;i++){
    await wait(()=>mirror(`const d=document.querySelector('.dance-floor')?.dataset;return d&&+d.danceHeadY<-${i%2?2:9}`))
    await shot(`dance-raven-${i}.png`);await new Promise(r=>setTimeout(r,180))
  }
  await ui(`set('Dance intensity','0');set('Dance timing offset','120');set('Dance volume','0.4');set('DJ language','en')`);await save()
  await wait(()=>mirror(`return +document.querySelector('.dance-floor')?.dataset.danceHeadY===0`))
  const edited = (await view()).settings
  if(edited.offsetMs!==120 || edited.volume!==0.4 || edited.language!=='en')throw Error('dance_qa_offset')
  pass('dance_live_controls');await click('STOP · black screen')
  await wait(async()=> (await view()).frame.status==='idle')
  await new Promise(r=>setTimeout(r,400));const image=await input.mirror.capturePage(), pixels=image.toBitmap()
  if(!pixels.length||pixels.some((v,i)=>i%4!==3&&v!==0))throw Error('dance_qa_black')
  pass('dance_stop_black');await writeFile(join(input.outputDir,'dance-stop-black.png'),image.toPNG());shots++
  await ui(`set('Dance Floor track',${JSON.stringify(actual.id)});set('Dance intensity','1');set('Dance timing offset','0');set('Dance volume','1');set('DJ language','zh-TW')`);await save()
  await click('Start Dance Floor');await playing();await wait(async()=> (await view()).frame.positionMs>8000)
  pass('dance_actual_m4a',{durationMs:2111900,outputs:(await view()).outputs.count,beatsInWindow:(await view()).frame.beats.length})
  await shot('dance-actual-track.png');await click('Stop All');await wait(async()=> (await view()).frame.status==='idle')
  await wait(()=>ui(`return document.querySelector('.live-bar__result')?.textContent.includes('Dance Floor stopped.')`))
  await wait(()=>ui(`return !button('Start Dance Floor').disabled`))
  pass('dance_global_stop_all')
  // Save a selected file, remove it, then start: deterministic visible recovery.
  const path=join(userData,'dance-shared','DanceFloor.m4a');await rename(path,path+'.held')
  await click('Start Dance Floor');await wait(async()=> (await view()).frame.reason==='dance_track_missing')
  pass('dance_missing_track_visible');await rename(path+'.held',path)
  await click('Refresh tracks');await click('Start Dance Floor');await click('STOP · black screen')
  await wait(async()=> (await view()).frame.status==='idle');await new Promise(r=>setTimeout(r,800))
  if((await view()).frame.status!=='idle')throw Error('dance_qa_late_start')
  pass('dance_stop_cancels_preparation')
  await ui(`set('Dance Floor track','');field('DJ welcome').click()`);await save()
  const final=await view();if(final.settings.volume!==1||final.settings.intensity!==1||final.settings.offsetMs!==0||!final.settings.welcome)throw Error('dance_qa_restore')
  pass('dance_defaults_restored')
  await click('Return to Avatar')
  await wait(()=>mirror(`return (await window.magicMirror.getOperatorLoop()).mode==='avatar'`))
  await wait(()=>ui(`return document.querySelector('.live-bar__result')?.textContent.includes('Back to the avatar.')`))
  if((await view()).frame.status!=='idle')throw Error('dance_qa_return')
  pass('dance_return_to_avatar')
  return {motionCount:6,expressionCount:0,sceneCount:0,screenshotCount:shots,musicAnalyser:'not_executed',visualCount:shots,consoleCheckCount:checks}
}
