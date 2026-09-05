import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'

// Isolated QA only: real SDK/provider/tool/playback path, synthetic text input.
// Keep provider text in renderer RAM; return only comparisons, counts and states.
export async function runPhase4LifecycleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const evaluate = <T>(source: string) => input.mirror.webContents.executeJavaScript(`(async()=>{${source}})()`, true) as Promise<T>
  const wait = async (condition: () => Promise<boolean> | boolean, reason: string, ms = 25000) => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (await condition()) return; await new Promise(r => setTimeout(r, 100)) }
    throw new Error(`phase4_qa_${reason}`)
  }
  await evaluate(`
    window.__lifecycleQa = {channels: [], peers: [], tracks: [], lines: [], errors: [], stops: 0};
    const q = window.__lifecycleQa; const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(...args) { super(...args); q.peers.push(this); }
      createDataChannel(...args) {
        const channel = super.createDataChannel(...args); q.channels.push(channel);
        channel.addEventListener('message', message => {
          const event = JSON.parse(message.data);
          if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done') {
            const words = event.transcript.replace(/[\\s，。！？,.!?]/g, '').replaceAll('请','請').replaceAll('说','說').replaceAll('愿','願').replaceAll('会','會');
            if (words) q.lines.push(words === '我在請說' ? 'greeting' : words === '如你所願再會' ? 'farewell' : 'unexpected');
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
    await input.console.webContents.executeJavaScript(`document.querySelector('[aria-label="Conversation lifecycle controls"] button').click()`, true)
    await wait(() => input.runtime.snapshot().lifecycle === 'active', 'live_activation')
    await wait(() => evaluate<boolean>(`return window.__lifecycleQa.lines.filter(x=>x==='greeting').length === ${cycle + 1} && window.__lifecycleQa.stops >= ${cycle * 2 + 1}`), 'live_greeting')
    await wait(() => evaluate<boolean>(`const p=document.querySelector('.presentation'); const a=p?.querySelector('audio'); const v=p?.querySelector('video');
      return p?.dataset.phase === 'awake' && getComputedStyle(p.querySelector('.presentation__avatar')).opacity === '1' && (!a || a.paused) && (!v || v.paused);`), 'live_avatar_visible')
    await evaluate(`const c=window.__lifecycleQa.channels.at(-1); c.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'恭送渡鴨大人'}]}})); c.send(JSON.stringify({type:'response.create'}));`)
    await wait(() => {
      if (input.runtime.snapshot().lifecycle === 'offlineLoop') throw new Error('phase4_qa_sleep_entered_offline_loop')
      return input.runtime.snapshot().lifecycle === 'dormant'
    }, 'live_sleep')
    const observation = await evaluate<{ valid: boolean; released: boolean; errors: string[]; lines: string[] }>(`const q=window.__lifecycleQa; return {
      valid: q.lines.filter(x=>x==='farewell').length === ${cycle + 1} && !q.lines.includes('unexpected') && q.stops >= ${(cycle + 1) * 2},
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
