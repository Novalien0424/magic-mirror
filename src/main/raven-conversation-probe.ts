/** Isolated QA instrumentation. All generated dialogue, tool payloads and audio
 * remain in RAM. Only the microphone source is substituted; no user text,
 * transcript, tool result, or model response request is injected. */
export function ravenConversationProbe(speech: string[], physical = false): string {
  return `
  const q=window.__ravenQa={stage:'greeting',visit:0,records:[],tools:[],usage:[],errors:[],errorStages:[],deleteKinds:new Map(),deleteEvents:new Map(),serverItems:new Set(),serverDeleted:new Set(),connections:[],tracks:[],
    active:0,audio:false,stops:0,interrupts:0,asr:0,inputText:0,last:Date.now(),media:false,mediaEvents:[],scenes:[],privateContexts:[],mic:[],speech:${JSON.stringify(speech)}};
  q.audibleResponses=new Set();q.continuedAudioResponses=new Set();q.applicationResponses=new Set();q.transcriptionConfigs=[];q.transcriptionRequests=[];
  q.calls=new Map();q.responses=new Map();q.inputs=new Map();q.openCalls=new Set();q.pendingResponses=0;q.inputTiming=[];q.audioTiming=[];q.promptHashes=[];q.promptHashJobs=[];q.images=[];q.phases=[];
  q.eventOrder=0;q.transcriptItems=new Set();q.duplicateTranscriptEvents=0;q.studioReveals=0;q.studioRevealSteps=new Set();q.studioCues=[];q.studioStops=[];q.imageReveals=[];q.imageRevealRequests=0;q.imageAttachments=0;q.deletes=[];q.speechPlayback=[];
  q.toolTiming=stages=>stages.map(stage=>{
    const calls=q.tools.filter(c=>c.stage===stage&&c.direction==='call'),quick=calls.filter(c=>!['search_youtube','find_media','memory'].includes(c.name)||c.name==='memory'&&c.args?.action==='identify');
    return {stage,quickToolCalls:quick.length,unattributedQuickToolCalls:quick.filter(c=>!c.responseId).length,
      quickToolPreambles:quick.filter(c=>c.responseId&&calls.find(v=>v.responseId===c.responseId)===c&&
        q.audioTiming.some(a=>a.responseId===c.responseId&&!a.applicationOwned&&a.order<c.order)).length};
  });
  const resetConnectionState=()=>{q.active=0;q.pendingResponses=0;q.openCalls.clear();q.transcriptItems.clear();q.audio=false;q.last=Date.now()};
  const Peer=window.RTCPeerConnection;
  window.RTCPeerConnection=class extends Peer {
    constructor(...args){super(...args);q.connections.push(this);resetConnectionState();this.addEventListener('connectionstatechange',()=>{if(this.connectionState==='closed'&&q.connections.at(-1)===this)resetConnectionState()})}
    close(){super.close();if(q.connections.at(-1)===this)resetConnectionState()}
    createDataChannel(...args){const c=super.createDataChannel(...args),send=c.send.bind(c);let initialPromptSeen=false;
      c.send=data=>{const e=JSON.parse(data);
        if(e.type==='session.update'&&!initialPromptSeen&&typeof e.session?.instructions==='string'){
          initialPromptSeen=true;
          // Hash only the initial public session prompt. Later private-context
          // updates are neither hashed nor retained in provenance.
          if(!e.session.instructions.includes('Identity: verbally confirmed.'))q.promptHashJobs.push(crypto.subtle.digest('SHA-256',new TextEncoder().encode(e.session.instructions)).then(bytes=>q.promptHashes.push(Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''))));
        }
        if(e.type==='session.update')q.transcriptionRequests.push(e.session?.audio?.input?.transcription??e.session?.input_audio_transcription??null);
        if(e.type==='response.create'){q.pendingResponses++;q.last=Date.now();if(e.response?.metadata?.mirror_image==='reveal')q.imageRevealRequests++}
        if(e.type==='conversation.item.create'&&e.item?.role==='user'&&e.item.content?.some(x=>x.type==='input_text'))q.inputText++;
        if(e.type==='conversation.item.delete'&&typeof e.item_id==='string'){q.deletes.push(e.item_id);q.deleteKinds.set(e.item_id,/^delete_([a-z_]+)_\\d+$/.exec(e.event_id??'')?.[1]??'unlabelled');if(typeof e.event_id==='string')q.deleteEvents.set(e.event_id,e.item_id)}
        if(e.type==='conversation.item.create')for(const part of e.item?.content??[])if(part.type==='input_image'&&typeof part.image_url==='string'){q.images.push({stage:q.stage,image:part.image_url});if(e.item.id?.startsWith('image_'))q.imageAttachments++;if(q.images.length>2)q.images.shift()}
        if(e.type==='session.update'&&e.session?.instructions?.includes('Identity: verbally confirmed.'))q.privateContexts.push({stage:q.stage,visit:q.visit,at:Date.now()});
        if(e.type==='conversation.item.create'&&e.item?.type==='function_call_output'){
          q.openCalls.delete(e.item.call_id);
          let result;try{result=JSON.parse(e.item.output)}catch{};q.tools.push({stage:q.calls.get(e.item.call_id)?.stage??q.stage,direction:'result',callId:e.item.call_id,result,at:Date.now()});q.last=Date.now();
        }send(data)};
      c.addEventListener('message',m=>{const e=JSON.parse(m.data),base={visit:q.visit,stage:q.responses.get(e.response_id)??q.stage,at:Date.now(),order:++q.eventOrder};
        if(e.type==='session.updated')q.transcriptionConfigs.push(e.session?.audio?.input?.transcription??e.session?.input_audio_transcription??null);
        if(e.type==='input_audio_buffer.speech_started')q.inputs.set(e.item_id,q.stage);
        if(['input_audio_buffer.committed','conversation.item.input_audio_transcription.delta','conversation.item.input_audio_transcription.completed'].includes(e.type))q.inputTiming.push({stage:q.inputs.get(e.item_id)??q.stage,kind:e.type.split('.').at(-1),at:Date.now()});
        if(e.type==='response.output_item.added'&&e.item?.type==='function_call')q.calls.set(e.item.call_id,{name:e.item.name,stage:base.stage,responseId:e.response_id});
        if(e.type==='response.output_item.added')q.phases.push({stage:base.stage,phase:['commentary','final_answer'].includes(e.item?.phase)?e.item.phase:'unknown',at:Date.now()});
        if(e.type==='conversation.item.input_audio_transcription.completed'){q.asr++;q.records.push({...base,stage:q.inputs.get(e.item_id)??q.stage,role:'visitor',text:e.transcript});q.last=Date.now()}
        if(e.type==='response.output_audio_transcript.done'||e.type==='response.audio_transcript.done'){
          const key=typeof e.response_id==='string'&&typeof e.item_id==='string'&&Number.isInteger(e.content_index)?JSON.stringify([e.response_id,e.item_id,e.content_index]):null;
          if(key&&q.transcriptItems.has(key)){q.duplicateTranscriptEvents++;return}if(key)q.transcriptItems.add(key);
          // WebRTC can keep one output buffer playing across a tool result and
          // its follow-up response. No second start event does not prove silence.
          if(q.audio&&!q.media)q.continuedAudioResponses.add(e.response_id);
          q.records.push({...base,role:'avatar',text:e.transcript,responseId:e.response_id});q.last=Date.now()}
        if(e.type==='response.function_call_arguments.done'){q.openCalls.add(e.call_id);let a;try{a=JSON.parse(e.arguments)}catch{};const call=q.calls.get(e.call_id);q.tools.push({...base,stage:call?.stage??base.stage,responseId:e.response_id??call?.responseId,direction:'call',callId:e.call_id,name:e.name??call?.name,args:a});q.last=Date.now()}
        if(e.type==='response.created'){q.pendingResponses=Math.max(0,q.pendingResponses-1);q.responses.set(e.response?.id,q.stage);if(['mirror_scene_cue','mirror_sleep_cue','mirror_sleep_part','mirror_memory_question','mirror_studio','mirror_image'].some(k=>typeof e.response?.metadata?.[k]==='string'))q.applicationResponses.add(e.response.id);
          const step=e.response?.metadata?.mirror_studio_step,kind=e.response?.metadata?.mirror_studio;
          if(kind)q.studioCues.push({responseId:e.response.id,kind,step,at:Date.now()});
          if(kind==='reveal'&&(!step||!q.studioRevealSteps.has(step))){q.studioReveals++;if(step)q.studioRevealSteps.add(step)}
          if(e.response?.metadata?.mirror_image==='reveal')q.imageReveals.push(e.response.id);q.active++;q.last=Date.now()}
        if(e.type==='response.done'){q.active=Math.max(0,q.active-1);q.last=Date.now();q.usage.push({stage:q.stage,status:e.response?.status,tokens:e.response?.usage?.total_tokens??0})}
        if(e.type==='output_audio_buffer.started'){q.audio=true;q.last=Date.now();q.audioTiming.push({stage:base.stage,at:Date.now(),order:base.order,responseId:e.response_id,applicationOwned:q.applicationResponses.has(e.response_id)});if(!q.media)q.audibleResponses.add(e.response_id)}
        if(e.type==='output_audio_buffer.stopped'||e.type==='output_audio_buffer.cleared'){q.audio=false;q.stops++;q.last=Date.now()}if((e.type==='conversation.item.added'||e.type==='conversation.item.created')&&typeof e.item?.id==='string')q.serverItems.add(e.item.id);if(e.type==='conversation.item.deleted'&&typeof e.item_id==='string')q.serverDeleted.add(e.item_id);
        if(e.type==='output_audio_buffer.stopped'&&q.studioCues.some(c=>c.responseId===e.response_id))q.studioStops.push({responseId:e.response_id,at:Date.now()});
        if(e.type==='output_audio_buffer.cleared')q.interrupts++;
        if(e.type==='error'){q.pendingResponses=Math.max(0,q.pendingResponses-1);const c=e.error?.code,t=e.error?.type,id=v=>typeof v==='string'&&/^[a-z0-9_.]{1,64}$/.test(v);const msg=String(e.error?.message??''),gone=c==='item_delete_invalid_item_id'?q.deleteEvents.get(e.error?.event_id)??[...q.deleteKinds.keys()].find(k=>msg.includes(k)):undefined;const path=gone?q.deleteKinds.get(gone)+(q.serverItems.has(gone)?'.listed':'.unlisted')+(q.serverDeleted.has(gone)?'.removed':''):/^delete_([a-z_]+)_\\d+$/.exec(e.error?.event_id??'')?.[1];q.errors.push((['response_cancel_not_active','conversation_already_has_active_response','server_error','rate_limit_exceeded','invalid_request_error','session_expired','input_audio_buffer_commit_empty'].includes(c)?c:id(c)?'provider_error:'+c:id(t)?'provider_error_type:'+t:'provider_error')+(path?'@'+path:''));q.errorStages.push(q.stage)}
      });return c}
  };
  const getUserMedia=navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{
    if(${physical}){
      const stream=await getUserMedia(constraints);
      if(!stream.getAudioTracks().every(t=>/Jabra Speak2 75/i.test(t.label))){stream.getTracks().forEach(t=>t.stop());throw Error('raven_qa_physical_input_mismatch')}
      q.mic.push({type:'acquired',at:Date.now(),route:'jabra'});
      for(const track of stream.getTracks()){q.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{stop();q.mic.push({type:'released',at:Date.now()})}}
      return stream;
    }
    const context=new AudioContext(),sink=context.createMediaStreamDestination(),silence=context.createOscillator(),gain=context.createGain();
    gain.gain.value=0;silence.connect(gain).connect(sink);silence.start();await context.resume();q.input={context,sink};
    q.mic.push({type:'acquired',at:Date.now()});
    for(const track of sink.stream.getTracks()){q.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{stop();q.mic.push({type:'released',at:Date.now()});void context.close()}}
    return sink.stream;
  };
  q.speak=async(index,acoustic=false)=>{
    acoustic=acoustic||${physical};
    const context=acoustic?new AudioContext():q.input.context,sink=acoustic?context.destination:q.input.sink;
    if(acoustic&&q.wakeOutputId){if(typeof context.setSinkId!=='function')throw Error('raven_qa_wake_output_unavailable');await context.setSinkId(q.wakeOutputId)}
    await context.resume();const bytes=Uint8Array.from(atob(q.speech[index]),c=>c.charCodeAt(0));
    const audio=await context.decodeAudioData(bytes.buffer),source=context.createBufferSource();source.buffer=audio;source.connect(sink);
    const started=Date.now(),clockStart=context.currentTime??0;let ended=false;
    try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('raven_qa_speech_interrupted')),audio.duration*1000+3000);source.onended=()=>{ended=true;clearTimeout(timer);resolve()};source.start()})}
    finally{q.speechPlayback.push({stage:q.stage,expectedMs:Math.round(audio.duration*1000),wallMs:Date.now()-started,clockMs:Math.round(((context.currentTime??0)-clockStart)*1000),state:context.state??'unknown',ended});source.disconnect();try{source.stop()}catch{};if(acoustic)await context.close()}return audio.duration;
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
  q.dispose=()=>{q.unsubscribe();q.unsubscribeScenes();q.speech=[];q.records=[];q.tools=[];q.scenes=[];q.transcriptionConfigs=[];q.transcriptionRequests=[];q.inputTiming=[];q.audioTiming=[];q.images=[];q.deletes=[];q.music=null;HTMLMediaElement.prototype.play=play;window.RTCPeerConnection=Peer;navigator.mediaDevices.getUserMedia=getUserMedia;delete window.__ravenQa};
  `
}
