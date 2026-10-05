import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import { MEMORY_CONVERSATION_FIXTURE as fixture } from './memory-conversation-fixture'

/** User-authorized synthetic transcript recording, isolated QA only.
 * Only the microphone source is substituted. No transcript events, user text,
 * tool results, memory writes, or response requests are injected. */
export async function runMemoryConversationQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.env['MIRROR_MEMORY_CONVERSATION_QA'] !== '1' || process.platform !== 'darwin') throw Error('memory_conversation_qa_unavailable')
  const root = join(input.outputDir, '..')
  const started = Date.now()
  let checks = 0, step = 'prepare', installed = false, learned = false
  const pass = (name: string) => { checks++; input.onEvidence({ step: name, status: 'passed' }) }
  const evaluate = <T>(source: string) => input.mirror.webContents.executeJavaScript(`(async()=>{${source}})()`, true) as Promise<T>
  const wait = async (predicate: () => Promise<boolean>, reason: string, timeout = 35000) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      if (await predicate()) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw Error('memory_conversation_' + reason)
  }
  const button = (name: string) => input.console.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)});if(!b||b.disabled)throw Error('memory_conversation_control_unavailable');b.click()})()`, true)
  const texts = [fixture.introduction, fixture.confirmation, fixture.background, fixture.decision,
    fixture.returnIntroduction, fixture.confirmation, ...fixture.questions]
  await writeFile(join(root, 'synthetic-character.json'), JSON.stringify(fixture, null, 2), { mode: 0o600 })
  const speech = await new Promise<string[]>((resolve, reject) => {
    const child = spawn('/usr/bin/swift', [join(process.cwd(), 'scripts/memory-qa-speech.swift')], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', HOME: process.env['HOME'] } })
    const buffers: Buffer[] = []; let length = 0
    const timer = setTimeout(() => { child.kill(); reject(Error('memory_conversation_synthesis_timeout')) }, 90000)
    child.stdout.on('data', (chunk: Buffer) => { length += chunk.length; if (length > 32 * 1024 * 1024) child.kill(); else buffers.push(chunk) })
    child.stderr.resume() // Native synthesizer diagnostics never become evidence.
    child.once('error', () => { clearTimeout(timer); reject(Error('memory_conversation_synthesis_failed')) })
    child.once('close', code => { clearTimeout(timer); try { if (code !== 0) throw Error(); resolve(JSON.parse(Buffer.concat(buffers).toString()) as string[]) } catch { reject(Error('memory_conversation_synthesis_failed')) } })
    child.stdin.end(JSON.stringify(texts))
  })
  try {
    await evaluate(`
      const q=window.__memoryConversationQa={records:[],tools:[],usage:[],errors:[],inputEvents:[],connections:[],tracks:[],stage:'prepare',visit:0,active:false,audio:false,stops:0,asr:0,answers:0,briefs:0,inputText:0};
      q.speech=${JSON.stringify(speech)};
      const Peer=window.RTCPeerConnection;
      window.RTCPeerConnection=class extends Peer {
        constructor(...args){super(...args);q.connections.push(this)}
        createDataChannel(...args){const c=super.createDataChannel(...args),send=c.send.bind(c);
          c.send=data=>{const e=JSON.parse(data);
            if(e.type==='conversation.item.create'&&e.item?.role==='user')q.inputText++;
            if(e.type==='conversation.item.create'&&e.item?.id?.startsWith('memory-brief-'))q.briefs++;
            if(e.type==='conversation.item.create'&&e.item?.type==='function_call_output'){
              let r;try{r=JSON.parse(e.item.output)}catch{};q.tools.push({visit:q.visit,stage:q.stage,direction:'result',code:r?.memory?.code??r?.code??'',at:Date.now()})
            }send(data)};
          c.addEventListener('message',m=>{const e=JSON.parse(m.data),base={visit:q.visit,stage:q.stage,at:Date.now()};
            if(['input_audio_buffer.speech_started','input_audio_buffer.speech_stopped','input_audio_buffer.committed'].includes(e.type))q.inputEvents.push({...base,event:e.type});
            if(e.type==='conversation.item.input_audio_transcription.completed'){q.asr++;q.records.push({...base,role:'visitor',text:e.transcript})}
            if(e.type==='response.output_audio_transcript.done'||e.type==='response.audio_transcript.done'){q.answers++;q.records.push({...base,role:'avatar',text:e.transcript})}
            if(e.type==='response.function_call_arguments.done'){let a;try{a=JSON.parse(e.arguments)}catch{};q.tools.push({...base,direction:'call',tool:e.name,action:a?.action??''})}
            if(e.type==='response.created')q.active=true;
            if(e.type==='response.done'){q.active=false;q.usage.push({...base,status:e.response?.status,usage:e.response?.usage})}
            if(e.type==='output_audio_buffer.started')q.audio=true;
            if(e.type==='output_audio_buffer.stopped'){q.audio=false;q.stops++}
            if(e.type==='error')q.errors.push(e.error?.code??'unknown');
          });return c}
      };
      navigator.mediaDevices.getUserMedia=async()=>{
        const context=new AudioContext(),sink=context.createMediaStreamDestination(),silence=context.createOscillator(),gain=context.createGain();
        gain.gain.value=0;silence.connect(gain).connect(sink);silence.start();await context.resume();q.input={context,sink};
        for(const track of sink.stream.getTracks()){q.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{stop();void context.close()}}
        return sink.stream;
      };
      q.speak=async index=>{const {context,sink}=q.input,bytes=Uint8Array.from(atob(q.speech[index]),c=>c.charCodeAt(0));
        const audio=await context.decodeAudioData(bytes.buffer),source=context.createBufferSource();source.buffer=audio;source.connect(sink);
        await new Promise(resolve=>{source.onended=resolve;source.start()});source.disconnect();return audio.duration;
      };
    `)
    installed = true
    const speak = async (index: number, stage: string) => {
      step = stage
      await evaluate(`window.__memoryConversationQa.stage=${JSON.stringify(stage)}`)
      const before = await evaluate<{ asr: number; stops: number }>('const q=window.__memoryConversationQa;return {asr:q.asr,stops:q.stops}')
      await evaluate(`return window.__memoryConversationQa.speak(${index})`)
      await wait(() => evaluate(`const q=window.__memoryConversationQa;return q.asr>${before.asr}&&q.stops>${before.stops}&&!q.active&&!q.audio`), stage + '_response')
      await new Promise(resolve => setTimeout(resolve, 600))
      input.onEvidence({ step: stage, status: 'completed' })
    }
    const start = async (visit: number) => {
      step = 'visit_' + visit + '_start'
      await evaluate(`const q=window.__memoryConversationQa;q.visit=${visit};q.stage='greeting';q.active=false;q.audio=false;q.stops=0`)
      await button('Start Conversation')
      await wait(() => evaluate('const q=window.__memoryConversationQa;return q.stops>0&&!q.active&&!q.audio'), 'greeting')
    }
    const stop = async () => {
      await button('Disconnect')
      await wait(async () => input.runtime.snapshot().lifecycle === 'dormant', 'disconnect')
      await wait(() => evaluate('return window.__memoryConversationQa.tracks.every(t=>t.readyState===\'ended\')&&window.__memoryConversationQa.connections.every(p=>p.connectionState===\'closed\')'), 'transport_release')
    }
    await start(1)
    await speak(0, 'first_identify')
    await speak(1, 'first_confirm')
    await wait(async () => { const e = input.runtime.console.getEvents({ limit: 100, module: 'memory', source: 'runtime' }); return e.ok && e.value.events.some(e => e.reason === 'memory_identity_confirmed') }, 'first_confirmation')
    pass('memory_conversation_first_confirmation')
    await speak(2, 'background')
    await speak(3, 'decision')
    await stop()
    pass('memory_conversation_first_closed')
    // Read-only verification waits for the decision's actual summary, not an
    // earlier background commit. Nothing is injected into the next conversation.
    let summaries: { topic: string; text: string; kind?: string }[] = []
    try {
      await wait(async () => {
        summaries = await input.console.webContents.executeJavaScript(`(async()=>{const r=await window.magicMirror.memory({action:'list',avatarId:'qa-memory-avatar',name:${JSON.stringify(fixture.name)},topic:'',text:'',query:''});return (r.entries??[]).map(({topic,text,kind})=>({topic,text,kind}))})()`, true)
        const text = summaries.map(s => s.text).join(' ')
        return /cork/i.test(text) && /sample/i.test(text)
      }, 'learning_commit', 40000)
      learned = true; pass('memory_conversation_automatic_learning')
    } catch { input.onEvidence({ step: 'memory_conversation_automatic_learning', status: 'failed', item: 'memory_conversation_learning_missing' }) }
    await writeFile(join(root, 'synthetic-learned-summaries.json'), JSON.stringify(summaries, null, 2), { mode: 0o600 })
    await start(2)
    await speak(4, 'return_identify')
    await speak(5, 'return_confirm')
    await speak(6, 'recall_material')
    await speak(7, 'recall_commitment')
    await stop()
    pass('memory_conversation_second_closed')
    const result = await evaluate<{ connections: number; inputText: number; asr: number; errors: string[]; material: boolean; commitment: boolean }>(`const q=window.__memoryConversationQa;
      const answer=stage=>q.records.filter(r=>r.visit===2&&r.stage===stage&&r.role==='avatar').map(r=>r.text).join(' ');
      const material=answer('recall_material'),commitment=answer('recall_commitment');
      return {connections:q.connections.length,inputText:q.inputText,asr:q.asr,errors:q.errors,
        material:/cork/i.test(material)&&/glare/i.test(material)&&/carry|light|weight/i.test(material),
        commitment:/two|2/i.test(commitment)&&/sample/i.test(commitment)&&/friday/i.test(commitment)&&/afternoon/i.test(commitment)};`)
    input.onEvidence({ step: 'memory_conversation_verdict', status: 'info', item: JSON.stringify(result) })
    if (result.connections !== 2 || result.inputText || result.asr < 8 || result.errors.length) throw Error('memory_conversation_real_route_failed')
    pass('memory_conversation_real_audio_route')
    if (!learned || !result.material || !result.commitment) throw Error('memory_conversation_recall_incomplete')
    pass('memory_conversation_material_recall')
    pass('memory_conversation_commitment_recall')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: checks }
  } catch (error) {
    input.onEvidence({ step, status: 'failed', item: error instanceof Error && /^memory_conversation_[a-z_]+$/.test(error.message) ? error.message : 'memory_conversation_failed' })
    throw error
  } finally {
    if (installed) {
      if (input.runtime.snapshot().lifecycle !== 'dormant') await button('Disconnect').catch(() => {})
      const record = await evaluate<Record<string, unknown>>('const q=window.__memoryConversationQa;return {records:q.records,tools:q.tools,usage:q.usage,errors:q.errors,inputEvents:q.inputEvents,asr:q.asr,connections:q.connections.length,inputText:q.inputText,briefs:q.briefs}')
      await writeFile(join(root, 'synthetic-conversation-transcript.json'), JSON.stringify({ recordingAuthority: 'User explicitly requested both synthetic session transcripts on 2026-10-05. No normal visitor logging.', elapsedMs: Date.now() - started, ...record }, null, 2), { mode: 0o600 })
      speech.length = 0
      await evaluate('window.__memoryConversationQa.speech=[]')
    }
  }
}
