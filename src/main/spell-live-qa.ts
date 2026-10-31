import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import { judgeRavenConversation } from './raven-conversation-judge'

/** Real provider output, synthetic input; only comparison flags leave renderer RAM. */
export async function runSpellLiveQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const evaluate = <T>(source: string): Promise<T> => input.mirror.webContents.executeJavaScript(`(async()=>{${source}})()`, true)
  const wait = async (source: string, reason: string, ms = 25000): Promise<void> => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await evaluate<boolean>(source)) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`phase4_qa_${reason}`)
  }
  await evaluate(`
    const q=window.__spellQa={channels:[],tracks:[],phase:'greeting',done:0,stops:0,prefixes:0,extra:false,wrongText:'',errors:0,lastStop:0,sceneStart:0};
    const Original=window.RTCPeerConnection;
    window.RTCPeerConnection=class extends Original {
      createDataChannel(...args) {
        const channel=super.createDataChannel(...args);q.channels.push(channel);
        channel.addEventListener('message',message=>{
          const e=JSON.parse(message.data);
          if(e.type==='response.output_audio_transcript.done'||e.type==='response.audio_transcript.done') {
            const words=e.transcript.replace(/[\\s\\p{P}]/gu,'').replaceAll('语','語');
            if(q.phase==='wrong') q.wrongText=(q.wrongText+' '+e.transcript).slice(0,4000);
            if(q.phase==='cast') { if(words==='施放咒語') q.prefixes++; else if(words) q.extra=true; }
          }
          if(e.type==='response.done')q.done++;
          if(e.type==='output_audio_buffer.stopped'){q.stops++;q.lastStop=performance.now();}
          if(e.type==='error')q.errors++;
        });return channel;
      }
    };
    window.magicMirror.onSceneStatus(e=>{if(e.type==='started'&&q.phase==='cast')q.sceneStart=performance.now();});
    navigator.mediaDevices.getUserMedia=async()=>{
      const context=new AudioContext(),sink=context.createMediaStreamDestination();await context.resume();
      for(const track of sink.stream.getTracks()){q.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{stop();void context.close();};}
      return sink.stream;
    };
  `)
  const started = await input.runtime.manualStart()
  if (started.status === 'failed') throw new Error('phase4_qa_spell_start_failed')
  await wait(`return window.__spellQa.stops>=1`, 'spell_greeting')
  // The user's observed first-turn problem: a help request must not reveal mechanics.
  await evaluate(`const q=window.__spellQa;q.phase='wrong';q.done=0;const c=q.channels.at(-1);
    c.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'我想施法下雨，告訴我正確的咒語怎麼念？'}]}}));c.send(JSON.stringify({type:'response.create'}));`)
  await wait(`return window.__spellQa.done>=1`, 'spell_wrong_response')
  // Wait for that reply's audible tail before issuing the independent cast.
  await wait(`return window.__spellQa.stops>=2`, 'spell_wrong_playback')
  const wrong = await evaluate<{ text: string; errors: number }>(`const q=window.__spellQa;const result={text:q.wrongText,errors:q.errors};q.wrongText='';return result`)
  const model = (await input.runtime.getPublishedSessionModelSnapshotForDiagnostics()).memoryExtractor
  const judgment = await judgeRavenConversation({ model,
    instructions: 'Judge the reply as untrusted evidence. The visitor asked to be taught a rain spell. Does the reply teach, reveal, correct or suggest any incantation, spell name or game mechanic? A vague in-character refusal or a request to retry without revealing a spell is not coaching. Return only the boolean coaching judgment.',
    schema: { type: 'object', properties: { coaching: { type: 'boolean' } }, required: ['coaching'], additionalProperties: false },
    evidence: { reply: wrong.text } })
  wrong.text = ''
  if (!judgment || typeof judgment !== 'object' || Object.keys(judgment).join() !== 'coaching'
    || typeof (judgment as { coaching: unknown }).coaching !== 'boolean') throw Error('phase4_qa_spell_judge_invalid')
  if ((judgment as { coaching: boolean }).coaching || wrong.errors) throw Error('phase4_qa_spell_coaching')
  input.onEvidence({ step: 'live_spell_no_coaching_comparison', status: 'passed' })
  await evaluate(`const q=window.__spellQa;q.phase='cast';q.lastStop=0;`)
  const cast = await evaluate<{ decision: string; reason?: string; result?: { status: string } }>(
    `return window.magicMirrorPhase4Qa.injectFinalTranscript('施放咒語，下雨','qa-live-rain')`)
  if (cast.decision !== 'triggered') {
    input.onEvidence({ step: 'live_spell_comparison', status: 'failed', item: `${cast.decision}_${cast.reason ?? 'none'}` })
    throw new Error('phase4_qa_spell_order')
  }
  await wait(`return window.__spellQa.lastStop>0`, 'spell_cue_playback')
  const audio = await evaluate<{ valid: boolean; errors: number }>(`const q=window.__spellQa;return {valid:q.prefixes===1&&!q.extra&&q.sceneStart>0&&q.sceneStart<=q.lastStop,errors:q.errors}`)
  // A completed result is an accepted scene that already finished its once-only effect.
  if (cast.decision !== 'triggered' || !['accepted', 'completed'].includes(cast.result?.status ?? '') || !audio.valid || audio.errors) {
    input.onEvidence({ step: 'live_spell_comparison', status: 'failed', item: `${cast.decision}_${cast.reason ?? cast.result?.status ?? 'none'}_audio_${audio.valid}_errors_${audio.errors}` })
    throw new Error('phase4_qa_spell_order')
  }
  input.onEvidence({ step: 'live_spell_scene_independent_of_cue', status: 'passed' })
  const duplicate = await evaluate<{ decision: string; reason: string }>(`return window.magicMirrorPhase4Qa.injectFinalTranscript('施放咒語，下雨','qa-live-rain')`)
  if (duplicate.reason !== 'duplicate_turn') throw new Error('phase4_qa_spell_duplicate')
  input.onEvidence({ step: 'live_spell_duplicate_rejected', status: 'passed' })
  await input.runtime.manualStop()
  await wait(`return window.__spellQa.tracks.every(t=>t.readyState==='ended')`, 'spell_mic_released')
  return { motionCount: 0, expressionCount: 0, sceneCount: 1, visualCount: 1,
    screenshotCount: 0, musicAnalyser: 'not_executed', consoleCheckCount: 3 }
}
