import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'

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
    window.__lifecycleQa = {channels: [], peers: [], tracks: [], lines: [], errors: [], stops: 0, settings: []};
    const q = window.__lifecycleQa; const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(...args) { super(...args); q.peers.push(this); }
      createDataChannel(...args) {
        const channel = super.createDataChannel(...args); q.channels.push(channel);
        channel.addEventListener('message', message => {
          const event = JSON.parse(message.data);
          if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done') {
            const words = event.transcript.replace(/[\\s\\p{P}]/gu, '').toLowerCase().replaceAll('请','請').replaceAll('说','說').replaceAll('愿','願').replaceAll('会','會');
            if (words) {
              const line = words === '我在請說' ? 'greeting_1' : words === '如你所願再會' ? 'farewell_1' : words === 'theguideisready' ? 'greeting_2' : words === 'goodbye' ? 'farewell_2' : 'unexpected';
              q.lines.push(line);
              if (line === 'unexpected') q.errors.push(words.includes('如你所願再會') || words.includes('goodbye') ? 'farewell_extra_words' : words.replaceAll('您','你') === '如你所願再會' ? 'farewell_pronoun_changed' : 'dialogue_not_verbatim');
            }
          }
          if (event.type === 'session.updated') {
            const s = event.session, voice = s.audio?.output?.voice ?? s.voice;
            q.settings.push({ host: voice === 'coral' && s.instructions?.includes('QA warm host'), guide: voice === 'cedar' && s.instructions?.includes('QA calm guide') });
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
  let checks = 0
  for (let cycle = 0; cycle < 2; cycle++) {
    if (cycle === 1) {
      await input.console.webContents.executeJavaScript(`document.querySelectorAll('.console__tab').forEach(b => { if(b.textContent==='Avatar / Audio') b.click(); })`, true)
      await wait(() => input.console.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Editing avatar"]')`), 'avatar_selector_ready')
      await input.console.webContents.executeJavaScript(`const s=document.querySelector('[aria-label="Editing avatar"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'qa-guide'); s.dispatchEvent(new Event('change',{bubbles:true}));`, true)
      await wait(() => input.console.webContents.executeJavaScript(`[...document.querySelectorAll('.console__scenes button')].some(b=>b.textContent==='Load avatar' && !b.disabled)`), 'avatar_load_ready')
      await input.console.webContents.executeJavaScript(`[...document.querySelectorAll('.console__scenes button')].find(b=>b.textContent==='Load avatar').click()`, true)
      await wait(async () => { const c = await input.runtime.console.getConfig(); return c.ok && c.value.active.avatarCatalog?.activeAvatarId === 'qa-guide' }, 'avatar_loaded')
    }
    await input.console.webContents.executeJavaScript(`document.querySelector('[aria-label="Conversation lifecycle controls"] button').click()`, true)
    await wait(() => input.runtime.snapshot().lifecycle === 'active', 'live_activation')
    await wait(() => evaluate<boolean>(`return window.__lifecycleQa.lines.includes('greeting_${cycle + 1}') && window.__lifecycleQa.stops >= ${cycle * 2 + 1}`), 'live_greeting')
    await wait(() => evaluate<boolean>(`return window.__lifecycleQa.settings.some(s=>s.${cycle === 0 ? 'host' : 'guide'})`), 'live_avatar_settings')
    await wait(() => evaluate<boolean>(`const p=document.querySelector('.presentation'); const a=p?.querySelector('audio'); const v=p?.querySelector('video');
      return p?.dataset.phase === 'awake' && getComputedStyle(p.querySelector('.presentation__avatar')).opacity === '1' && (!a || a.paused) && (!v || v.paused);`), 'live_avatar_visible')
    await evaluate(`const c=window.__lifecycleQa.channels.at(-1); c.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'恭送渡鴨大人'}]}})); c.send(JSON.stringify({type:'response.create'}));`)
    await wait(() => {
      if (input.runtime.snapshot().lifecycle === 'offlineLoop') throw new Error('phase4_qa_sleep_entered_offline_loop')
      return input.runtime.snapshot().lifecycle === 'dormant'
    }, 'live_sleep')
    const observation = await evaluate<{ valid: boolean; released: boolean; errors: string[]; lines: string[] }>(`const q=window.__lifecycleQa; return {
      valid: q.lines.includes('farewell_${cycle + 1}') && !q.lines.includes('unexpected') && q.stops >= ${(cycle + 1) * 2},
      released: q.tracks.every(t=>t.readyState==='ended'), errors:q.errors, lines:q.lines };`)
    for (const code of observation.errors) input.onEvidence({ step: 'lifecycle_request_error', item: code, status: 'observed' })
    if (!observation.valid) {
      input.onEvidence({ step: 'live_dialogue_comparison', item: observation.lines.join('_'), status: 'failed' })
      throw new Error('phase4_qa_sleep_dialogue_mismatch')
    }
    if (!observation.released) throw new Error('phase4_qa_sleep_tracks_not_released')
    input.onEvidence({ step: 'live_greeting_sleep_cycle', item: String(cycle + 1), status: 'passed' }); checks++
  }
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, visualCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', consoleCheckCount: checks }
}
