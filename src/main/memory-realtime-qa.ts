import type { Phase4QaInput } from './phase4-qa'

/** Real provider QA with a silent microphone, synthetic ASR and ordinary memory requests.
 * This bounded dialogue is not broad human/behavioral acceptance. */
export async function runMemoryRealtimeQa(input: Phase4QaInput, pass: (step: string) => void): Promise<void> {
  const evaluate = <T>(source: string) => input.mirror.webContents.executeJavaScript(`(async()=>{${source}})()`, true) as Promise<T>
  const wait = async (source: string, reason: string) => {
    const end = Date.now() + 35_000
    while (Date.now() < end) { if (await evaluate<boolean>(source)) return; await new Promise(resolve => setTimeout(resolve, 100)) }
    const flags = await evaluate<string>("const q=window.__memoryQa;return JSON.stringify({errors:q.errors,results:q.results,calls:q.calls,answers:q.answers,items:q.items.length,briefs:q.briefs.length,acked:q.acked.length,done:q.done,stops:q.stops})")
    input.onEvidence({ step: 'memory_realtime_failure_metadata', status: 'info', item: flags })
    throw Error('phase4_qa_memory_realtime_' + reason)
  }
  await evaluate(`
    const q=window.__memoryQa={channels:[],tracks:[],results:[],calls:[],answers:[],items:[],briefs:[],acked:[],errors:[],done:0,stops:0,active:false,audio:false,relevant:false,stage:'identity'};
    const Original=window.RTCPeerConnection;
    window.RTCPeerConnection=class extends Original {
      createDataChannel(...args){
        const c=super.createDataChannel(...args);q.channels.push(c);const send=c.send.bind(c);
        c.send=data=>{const e=JSON.parse(data);
          if(e.type==='conversation.item.create'&&e.item?.type==='function_call_output'){
            let r;try{r=JSON.parse(e.item.output)}catch{};if(r?.memory?.code||r?.code)q.results.push(r.memory?.code??r.code);
          }
          if(e.type==='conversation.item.create'&&e.item?.id?.startsWith('memory-brief-'))q.briefs.push(e.item.id);
          send(data);
        };
        c.addEventListener('message',m=>{const e=JSON.parse(m.data);
          if(e.type==='response.function_call_arguments.done'){let a;try{a=JSON.parse(e.arguments)}catch{};q.calls.push({memory:e.name==='memory',fields:['action','name','topic','text','query'].map(k=>typeof a?.[k]),count:a?Object.keys(a).length:0,actionValid:['identify','recall','remember','forget','policy','temporary'].includes(a?.action)})}
          if(['conversation.item.created','conversation.item.added','conversation.item.done'].includes(e.type)){q.items.push(e.item.id);if(q.briefs.includes(e.item.id))q.acked.push(e.item.id)}
          if(e.type==='response.created')q.active=true;
          if(e.type==='response.done'){q.done++;q.active=false}
          if(e.type==='output_audio_buffer.started')q.audio=true;
          if(e.type==='output_audio_buffer.stopped'){q.stops++;q.audio=false}
          if(e.type==='response.output_audio_transcript.done'||e.type==='response.audio_transcript.done'){
            const t=e.transcript??'',location=/botanic(?:al)?|植物園|植物园/i.test(t)||/garden/i.test(t)&&/shad/i.test(t);
            const uncertain=/(?:don't|do not|can't|cannot).{0,30}(?:remember|recall|have)|不記得|不记得|想不起|沒有.*記憶/i.test(t);
            q.answers.push({stage:q.stage,location,uncertain,characters:t.length});if(q.stage==='recall')q.relevant ||= location&&!uncertain;
          }
          if(e.type==='error')q.errors.push(/^[a-z_]{1,80}$/.test(e.error?.code)?e.error.code:'unknown');
        });return c;
      }
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      const context=new AudioContext(),sink=context.createMediaStreamDestination(),source=context.createOscillator(),gain=context.createGain();gain.gain.value=0;
      source.connect(gain).connect(sink);source.start();await context.resume();
      for(const track of sink.stream.getTracks()){q.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{stop();void context.close()}}
      return sink.stream;
    };
  `)
  const send = async (id: string, text: string) => {
    await wait("const q=window.__memoryQa;return q.stops>0&&!q.active&&!q.audio", 'response_boundary')
    await evaluate(`const q=window.__memoryQa;if(${JSON.stringify(id)}==='memory-qa-recall'){q.stage='recall';q.relevant=false}
      const c=q.channels.at(-1);c.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'input_audio_buffer.speech_started',event_id:'qa-speech',audio_start_ms:0,item_id:${JSON.stringify(id)}})}));
      c.send(JSON.stringify({type:'conversation.item.create',item:{id:${JSON.stringify(id)},type:'message',role:'user',content:[{type:'input_text',text:${JSON.stringify(text)}}]}}));`)
    await wait(`return window.__memoryQa.items.includes(${JSON.stringify(id)})`, 'input_ack')
    await evaluate(`const c=window.__memoryQa.channels.at(-1);c.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'conversation.item.input_audio_transcription.completed',event_id:'qa-transcript',content_index:0,item_id:${JSON.stringify(id)},transcript:${JSON.stringify(text)}})}));c.send(JSON.stringify({type:'response.create'}));`)
  }
  try {
    await input.console.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Start Conversation').click()`, true)
    await wait("return window.__memoryQa.channels.at(-1)?.readyState==='open'", 'connect')
    await wait("return window.__memoryQa.stops>0", 'greeting_finished')
    await send('memory-qa-identify', 'My name is Synthetic QA Person. Can you recall what we discussed before?')
    await wait("return window.__memoryQa.results.includes('memory_confirmation_required')&&window.__memoryQa.stops>0", 'identity_tool')
    pass('memory_realtime_identity_tool')
    await send('memory-qa-confirm', 'yes')
    await wait("return window.__memoryQa.acked.length>0", 'brief_ack')
    pass('memory_realtime_provider_brief_ack')
    await wait("return window.__memoryQa.done>=2", 'confirmation_response')
    await send('memory-qa-recall', 'What quiet Sunday outing had I settled on?')
    await wait("return window.__memoryQa.relevant", 'remembered_answer')
    pass('memory_realtime_remembered_answer')
    if (!await evaluate<boolean>('return window.__memoryQa.errors.length===0')) throw Error('phase4_qa_memory_realtime_provider_error')
  } finally {
    await input.runtime.manualStop()
    await wait("return window.__memoryQa.tracks.every(t=>t.readyState==='ended')", 'microphone_release')
  }
  pass('memory_realtime_microphone_release')
}
