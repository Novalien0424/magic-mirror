import { runPromptInspectorQa } from './prompt-inspector-qa'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import { resolveRealtimeTools, realtimeToolDefinition, REALTIME_TOOLS } from '../shared/realtime-tools'

// Isolated QA only: real SDK/provider/tool/playback path, synthetic text input.
// Keep provider text in renderer RAM; return only comparisons, counts and states.
export async function runPhase4LifecycleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const evaluate = <T>(source: string) => input.mirror.webContents.executeJavaScript(`(async()=>{${source}})()`, true) as Promise<T>
  const wait = async (condition: () => Promise<boolean> | boolean, reason: string, ms = 25000) => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (await condition()) return; await new Promise(r => setTimeout(r, 100)) }
    const observation = await evaluate<{ lines: string[]; errors: string[]; stops: number; settings: {host: boolean; guide: boolean}[] }>('const q=window.__lifecycleQa; return {lines:q.lines,errors:q.errors,stops:q.stops,settings:q.settings}')
    input.onEvidence({ step: 'live_timeout_comparison', item: `${observation.lines.join('_') || 'no_lines'}_stops_${observation.stops}_host_${observation.settings.some(s => s.host)}_guide_${observation.settings.some(s => s.guide)}`, status: 'failed' })
    for (const code of observation.errors) input.onEvidence({ step: 'lifecycle_request_error', item: code, status: 'observed' })
    throw new Error(`phase4_qa_${reason}`)
  }
  await evaluate(`
    window.__lifecycleQa = {channels: [], peers: [], tracks: [], lines: [], errors: [], stops: 0, settings: [], speechOnlyRequests: 0, toolCalls: 0, cycle: 0, farewellRequests: 0, toolDefinitions: [], toolResults: []};
    const q = window.__lifecycleQa; const Original = window.RTCPeerConnection;
    const expectedTools=${JSON.stringify(['恭送渡鴨大人','恭送渡鴉大人'].map(phrase => resolveRealtimeTools(phrase).map(realtimeToolDefinition)))};
    const expectedResult=${JSON.stringify(REALTIME_TOOLS.tools[0].results.accepted)};
    q.outputTaps=[]; q.monitor='idle'; q.preFarewellPeak=0; q.preFarewellSamples=0; q.farewellId=null; q.quietSince=performance.now();
    const connectNode=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination,...args) {
      const result=connectNode.call(this,destination,...args);
      if(this instanceof GainNode && destination instanceof AudioDestinationNode) {
        const analyser=this.context.createAnalyser(); analyser.fftSize=256;
        connectNode.call(this,analyser); q.outputTaps.push(analyser);
      }
      return result;
    };
    setInterval(()=>{
      const samples=new Float32Array(256);
      let peak=0;
      for(const analyser of q.outputTaps) {
        analyser.getFloatTimeDomainData(samples);
        for(const value of samples)peak=Math.max(peak,Math.abs(value));
      }
      if(peak>=0.001)q.quietSince=performance.now();
      if(q.monitor==='sleep' && q.outputTaps.length){q.preFarewellSamples++;q.preFarewellPeak=Math.max(q.preFarewellPeak,peak)}
    },10);
    window.RTCPeerConnection = class extends Original {
      constructor(...args) { super(...args); q.peers.push(this); }
      createDataChannel(...args) {
        const channel = super.createDataChannel(...args); q.channels.push(channel);
        const send = channel.send.bind(channel);
        channel.send = data => {
          const event = JSON.parse(data);
          if(event.type==='session.update' && event.session?.tools) {
            const actual=event.session.tools;
            q.toolDefinitions.push(actual.length===expectedTools[q.cycle].length && actual.every((t,i)=>{
              const e=expectedTools[q.cycle][i];
              return t.type===e.type && t.name===e.name && t.description===e.description && JSON.stringify(t.parameters)===JSON.stringify(e.parameters);
            }));
          }
          if(event.type==='conversation.item.create' && event.item?.type==='function_call_output') {
            let result;try{result=JSON.parse(event.item.output)}catch{}
            q.toolResults.push(!!result && Object.keys(result).length===3 && Object.entries(expectedResult).every(([k,v])=>result[k]===v));
          }
          if (event.type === 'response.create' && event.response?.tool_choice === 'none') q.speechOnlyRequests++;
          if (event.type === 'response.create' && event.response?.metadata?.mirror_sleep_cue
            && event.response.tool_choice === 'none' && event.response.input?.length === 0) q.farewellRequests++;
          send(data);
        };
        channel.addEventListener('message', message => {
          const event = JSON.parse(message.data);
          if(event.type==='response.created' && event.response?.metadata?.mirror_sleep_cue)q.farewellId=event.response.id;
          if(event.type==='output_audio_buffer.started' && event.response_id===q.farewellId)q.monitor='farewell';
          if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') q.toolCalls++;
          if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done') {
            const words = event.transcript.replace(/[\\s\\p{P}]/gu, '').toLowerCase().replaceAll('请','請').replaceAll('说','說').replaceAll('愿','願').replaceAll('会','會');
            if (words) {
              const line = words === '我在請說' ? 'greeting_1' : words === '來者何人所問何事' ? 'greeting_2' : words === '如你所願再會' && event.response_id===q.farewellId ? 'farewell_' + (q.cycle + 1) : q.monitor==='conversation' && ['四','four','4'].some(n=>words.includes(n)) ? 'followup_' + (q.cycle+1) : q.monitor==='sleep' ? 'pre_farewell_generated' : 'unexpected';
              q.lines.push(line);
              if (line === 'unexpected') q.errors.push(q.farewellRequests > q.cycle ? 'extra_during_farewell' : 'extra_before_farewell');
              if (line === 'unexpected') q.errors.push(words.includes('如你所願再會') || words.includes('goodbye') ? 'farewell_extra_words' : words.replaceAll('您','你') === '如你所願再會' ? 'farewell_pronoun_changed' : 'dialogue_not_verbatim');
            }
          }
          if (event.type === 'session.updated') {
            const s = event.session, voice = s.audio?.output?.voice ?? s.voice;
            q.settings.push({ host: voice === 'coral' && s.instructions?.includes('QA warm host'), guide: voice === 'cedar' && s.instructions?.includes('省話 帶點神祕感 睿智') });
          }
          if (event.type === 'output_audio_buffer.stopped') q.stops++;
          if (event.type === 'error') q.errors.push(/^[a-z_]{1,80}$/.test(event.error?.code) ? event.error.code : 'unknown');
        }); return channel;
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); const sink = context.createMediaStreamDestination();
      const source = context.createOscillator(); const gain = context.createGain(); gain.gain.value = 0;
      source.connect(gain).connect(sink); source.start(); await context.resume();
      for (const track of sink.stream.getTracks()) { q.tracks.push(track); const stop = track.stop.bind(track); track.stop = () => { stop(); void context.close(); }; }
      return sink.stream;
    };
  `)
  await input.console.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Avatars').click()`, true)
  await wait(() => input.console.webContents.executeJavaScript(`!!document.querySelector('.prompt-launcher button')`), 'prompt_launcher')
  const prompts = await runPromptInspectorQa(input, 'QA warm host', 'lifecycle')
  await input.console.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Mirror').click()`, true)
  let checks = prompts.checks
  for (let cycle = 0; cycle < 2; cycle++) {
    await evaluate(`window.__lifecycleQa.cycle=${cycle};window.__lifecycleQa.monitor='idle'`)
    if (cycle === 1) {
      await input.console.webContents.executeJavaScript(`document.querySelectorAll('.console__tab').forEach(b => { if(b.textContent==='Mirror') b.click(); })`, true)
      await wait(() => input.console.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Choose active avatar"]')`), 'avatar_selector_ready')
      await input.console.webContents.executeJavaScript(`const s=document.querySelector('[aria-label="Choose active avatar"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'qa-guide'); s.dispatchEvent(new Event('change',{bubbles:true}));`, true)
      await wait(() => input.console.webContents.executeJavaScript(`[...document.querySelectorAll('.console__active-avatar button')].some(b=>b.textContent==='Activate avatar' && !b.disabled)`), 'avatar_load_ready')
      await input.console.webContents.executeJavaScript(`[...document.querySelectorAll('.console__active-avatar button')].find(b=>b.textContent==='Activate avatar').click()`, true)
      await wait(async () => { const c = await input.runtime.console.getConfig(); return c.ok && c.value.active.avatarCatalog?.activeAvatarId === 'qa-guide' }, 'avatar_loaded')
    }
    await input.console.webContents.executeJavaScript(`document.querySelector('[aria-label="Conversation lifecycle controls"] button').click()`, true)
    await wait(() => input.runtime.snapshot().lifecycle === 'active', 'live_activation')
    await wait(() => evaluate<boolean>(`return window.__lifecycleQa.lines.includes('greeting_${cycle + 1}') && window.__lifecycleQa.stops >= ${cycle * 3 + 1}`), 'live_greeting')
    await wait(() => evaluate<boolean>(`return window.__lifecycleQa.settings.some(s=>s.${cycle === 0 ? 'host' : 'guide'})`), 'live_avatar_settings')
    await wait(() => evaluate<boolean>(`const p=document.querySelector('.presentation'); const a=p?.querySelector('audio'); const v=p?.querySelector('video');
      return p?.dataset.phase === 'awake' && getComputedStyle(p.querySelector('.presentation__avatar')).opacity === '1' && (!a || a.paused) && (!v || v.paused);`), 'live_avatar_visible')
    const greetingOnly = await evaluate<boolean>(`const q=window.__lifecycleQa; return q.speechOnlyRequests === ${cycle * 2 + 1} && q.toolCalls === ${cycle} && !q.lines.includes('farewell_${cycle + 1}')`)
    if (!greetingOnly || input.runtime.snapshot().lifecycle !== 'active') throw new Error('phase4_qa_greeting_triggered_sleep')
    input.onEvidence({ step: 'live_greeting_without_sleep', item: String(cycle + 1), status: 'passed' }); checks++
    if (!await evaluate<boolean>(`const q=window.__lifecycleQa;return q.toolDefinitions.length>0 && q.toolDefinitions.every(Boolean)`)) throw new Error('phase4_qa_tool_definition_mismatch')
    input.onEvidence({step:'live_tool_definition_parity',item:String(cycle+1),status:'passed'}); checks++
    await wait(() => evaluate<boolean>(`const q=window.__lifecycleQa;return q.outputTaps.length>0 && performance.now()-q.quietSince>=150`), 'greeting_tail_quiet')
    await evaluate(`const q=window.__lifecycleQa;q.monitor='conversation';const c=q.channels.at(-1);
      c.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'二加二是多少？'}]}}));c.send(JSON.stringify({type:'response.create'}));`)
    await wait(() => evaluate<boolean>(`const q=window.__lifecycleQa;return q.lines.includes('followup_${cycle+1}') && q.stops>=${cycle*3+2}`), 'live_followup')
    if (!await evaluate<boolean>(`return window.__lifecycleQa.lines.filter(line=>line==='greeting_${cycle+1}').length===1`)) throw new Error('phase4_qa_greeting_repeated')
    input.onEvidence({ step: 'live_followup_without_repeated_greeting', item: String(cycle+1), status: 'passed' }); checks++
    await wait(() => evaluate<boolean>(`return performance.now()-window.__lifecycleQa.quietSince>=150`), 'followup_tail_quiet')
    await evaluate(`const q=window.__lifecycleQa; q.monitor='sleep';q.preFarewellPeak=0;q.preFarewellSamples=0;q.farewellId=null;
      const c=q.channels.at(-1); c.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:${JSON.stringify(cycle === 0 ? '恭送渡鴨大人' : '恭送渡鴉大人')}}]}})); c.send(JSON.stringify({type:'response.create'}));`)
    await wait(() => {
      if (input.runtime.snapshot().lifecycle === 'offlineLoop') throw new Error('phase4_qa_sleep_entered_offline_loop')
      return input.runtime.snapshot().lifecycle === 'dormant'
    }, 'live_sleep')
    const toolResultValid=await evaluate<boolean>(`const q=window.__lifecycleQa;return q.toolResults.length===${cycle+1} && q.toolResults.every(Boolean)`)
    input.onEvidence({step:'live_structured_tool_result',item:String(cycle+1),status:toolResultValid?'passed':'failed'});
    if(!toolResultValid) throw new Error('phase4_qa_tool_result_mismatch')
    checks++
    const observation = await evaluate<{ valid: boolean; released: boolean; errors: string[]; lines: string[]; peak: number; samples: number }>(`const q=window.__lifecycleQa; return {
      valid: q.lines.includes('farewell_${cycle + 1}') && !q.lines.includes('unexpected') && q.stops >= ${(cycle + 1) * 3} && q.farewellRequests === ${cycle + 1}
        && q.preFarewellSamples>0 && q.preFarewellPeak<0.001,
      released: q.tracks.every(t=>t.readyState==='ended'), errors:q.errors, lines:q.lines, peak:q.preFarewellPeak, samples:q.preFarewellSamples };`)
    input.onEvidence({ step: 'sleep_output_before_farewell', item: `samples_${observation.samples}_peak_${observation.peak.toFixed(6)}`, status: observation.samples>0 && observation.peak<0.001 ? 'passed' : 'failed' })
    for (const code of observation.errors) input.onEvidence({ step: 'lifecycle_request_error', item: code, status: 'observed' })
    if (!observation.valid) {
      input.onEvidence({ step: 'live_dialogue_comparison', item: observation.lines.join('_'), status: 'failed' })
      throw new Error('phase4_qa_sleep_dialogue_mismatch')
    }
    if (!observation.released) throw new Error('phase4_qa_sleep_tracks_not_released')
    input.onEvidence({ step: 'live_greeting_sleep_cycle', item: String(cycle + 1), status: 'passed' }); checks++
  }
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, visualCount: 0, screenshotCount: prompts.screenshots, musicAnalyser: 'not_executed', consoleCheckCount: checks }
}
