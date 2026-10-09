/** Isolated QA instrumentation. All generated dialogue, tool payloads and audio
 * remain in RAM. Only the microphone source is substituted; no user text,
 * transcript, tool result, or model response request is injected. */
export function ravenConversationProbe(speech: string[]): string {
  return `
  const q=window.__ravenQa={stage:'greeting',visit:0,records:[],tools:[],usage:[],errors:[],connections:[],tracks:[],
    active:0,audio:false,stops:0,interrupts:0,asr:0,inputText:0,last:Date.now(),media:false,mediaEvents:[],scenes:[],privateContexts:[],mic:[],speech:${JSON.stringify(speech)}};
  q.audibleResponses=new Set();
  q.calls=new Map();q.responses=new Map();q.inputs=new Map();q.openCalls=new Set();q.pendingResponses=0;
  const Peer=window.RTCPeerConnection;
  window.RTCPeerConnection=class extends Peer {
    constructor(...args){super(...args);q.connections.push(this);this.addEventListener('connectionstatechange',()=>{if(this.connectionState==='closed'&&q.connections.at(-1)===this){q.active=0;q.pendingResponses=0;q.openCalls.clear();q.audio=false;q.last=Date.now()}})}
    createDataChannel(...args){const c=super.createDataChannel(...args),send=c.send.bind(c);
      c.send=data=>{const e=JSON.parse(data);
        if(e.type==='response.create'){q.pendingResponses++;q.last=Date.now()}
        if(e.type==='conversation.item.create'&&e.item?.role==='user'&&e.item.content?.some(x=>x.type==='input_text'))q.inputText++;
        if(e.type==='session.update'&&e.session?.instructions?.includes('Identity: verbally confirmed.'))q.privateContexts.push({stage:q.stage,visit:q.visit,at:Date.now()});
        if(e.type==='conversation.item.create'&&e.item?.type==='function_call_output'){
          q.openCalls.delete(e.item.call_id);
          let result;try{result=JSON.parse(e.item.output)}catch{};q.tools.push({stage:q.calls.get(e.item.call_id)?.stage??q.stage,direction:'result',callId:e.item.call_id,result,at:Date.now()});q.last=Date.now();
        }send(data)};
      c.addEventListener('message',m=>{const e=JSON.parse(m.data),base={visit:q.visit,stage:q.responses.get(e.response_id)??q.stage,at:Date.now()};
        if(e.type==='input_audio_buffer.speech_started')q.inputs.set(e.item_id,q.stage);
        if(e.type==='response.output_item.added'&&e.item?.type==='function_call')q.calls.set(e.item.call_id,{name:e.item.name,stage:base.stage});
        if(e.type==='conversation.item.input_audio_transcription.completed'){q.asr++;q.records.push({...base,stage:q.inputs.get(e.item_id)??q.stage,role:'visitor',text:e.transcript});q.last=Date.now()}
        if(e.type==='response.output_audio_transcript.done'||e.type==='response.audio_transcript.done'){q.records.push({...base,role:'avatar',text:e.transcript,responseId:e.response_id});q.last=Date.now()}
        if(e.type==='response.function_call_arguments.done'){q.openCalls.add(e.call_id);let a;try{a=JSON.parse(e.arguments)}catch{};const call=q.calls.get(e.call_id);q.tools.push({...base,stage:call?.stage??base.stage,direction:'call',callId:e.call_id,name:e.name??call?.name,args:a});q.last=Date.now()}
        if(e.type==='response.created'){q.pendingResponses=Math.max(0,q.pendingResponses-1);q.responses.set(e.response?.id,q.stage);q.active++;q.last=Date.now()}
        if(e.type==='response.done'){q.active=Math.max(0,q.active-1);q.last=Date.now();q.usage.push({stage:q.stage,status:e.response?.status,tokens:e.response?.usage?.total_tokens??0})}
        if(e.type==='output_audio_buffer.started'){q.audio=true;q.last=Date.now();if(!q.media)q.audibleResponses.add(e.response_id)}
        if(e.type==='output_audio_buffer.stopped'||e.type==='output_audio_buffer.cleared'){q.audio=false;q.stops++;q.last=Date.now()}
        if(e.type==='output_audio_buffer.cleared')q.interrupts++;
        if(e.type==='error'){q.pendingResponses=Math.max(0,q.pendingResponses-1);q.errors.push(['response_cancel_not_active','conversation_already_has_active_response','server_error','rate_limit_exceeded','invalid_request_error','session_expired','input_audio_buffer_commit_empty'].includes(e.error?.code)?e.error.code:'provider_error')}
      });return c}
  };
  navigator.mediaDevices.getUserMedia=async()=>{
    const context=new AudioContext(),sink=context.createMediaStreamDestination(),silence=context.createOscillator(),gain=context.createGain();
    gain.gain.value=0;silence.connect(gain).connect(sink);silence.start();await context.resume();q.input={context,sink};
    q.mic.push({type:'acquired',at:Date.now()});
    for(const track of sink.stream.getTracks()){q.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{stop();q.mic.push({type:'released',at:Date.now()});void context.close()}}
    return sink.stream;
  };
  q.speak=async(index,acoustic=false)=>{
    const context=acoustic?new AudioContext():q.input.context,sink=acoustic?context.destination:q.input.sink;
    if(acoustic&&q.wakeOutputId){if(typeof context.setSinkId!=='function')throw Error('raven_qa_wake_output_unavailable');await context.setSinkId(q.wakeOutputId)}
    await context.resume();const bytes=Uint8Array.from(atob(q.speech[index]),c=>c.charCodeAt(0));
    const audio=await context.decodeAudioData(bytes.buffer),source=context.createBufferSource();source.buffer=audio;source.connect(sink);
    try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('raven_qa_speech_interrupted')),audio.duration*1000+3000);source.onended=()=>{clearTimeout(timer);resolve()};source.start()})}
    finally{source.disconnect();if(acoustic)await context.close()}return audio.duration;
  };
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){if(this instanceof HTMLAudioElement&&!this.isConnected&&this.src.startsWith('blob:'))q.music=this;return play.apply(this,args)};
  q.unsubscribe=window.magicMirror.onAvatarControl(c=>{if(c.type==='media_skill_state'){q.media=c.active;q.mediaEvents.push({stage:q.stage,at:Date.now(),active:c.active,hideAvatar:c.hideAvatar})}});
  q.unsubscribeScenes=window.magicMirror.onSceneStatus(e=>{q.scenes.push({stage:q.stage,at:Date.now(),...e})});
  q.state=()=>{const p=document.querySelector('.mirror-presentation'),a=p?.querySelector('.presentation__avatar'),v=document.querySelector('.scene-visual video');
    const media=e=>e?{time:e.currentTime,duration:Number.isFinite(e.duration)?e.duration:null,loop:e.loop,paused:e.paused,ready:e.readyState}:null;
    return {media:q.media,music:media(q.music),video:media(v),hidden:p?.dataset.mediaVideo,phase:p?.dataset.phase,opacity:p?.querySelector('.presentation')?Number(getComputedStyle(p.querySelector('.presentation')).opacity):0,
      avatarReady:a?.querySelector('.avatar-stage')?.dataset.rendererState==='ready',avatarVisible:!!a&&getComputedStyle(a).visibility==='visible'&&Number(getComputedStyle(a).opacity)===1,
      audio:q.audio,active:q.active+q.pendingResponses+q.openCalls.size,stops:q.stops,interrupts:q.interrupts,asr:q.asr,last:q.last,connections:q.connections.length,
      released:q.tracks.every(t=>t.readyState==='ended')&&q.connections.every(c=>c.connectionState==='closed')};
  };
  q.dispose=()=>{q.unsubscribe();q.unsubscribeScenes();q.speech=[];q.records=[];q.tools=[];q.scenes=[];q.music=null;HTMLMediaElement.prototype.play=play;window.RTCPeerConnection=Peer;delete window.__ravenQa};
  `
}
