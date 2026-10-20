import { app, systemPreferences } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Speaker } from 'decibri'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import { synthesize } from './raven-conversation-qa'
import { convertWakeQaPcm } from './raven-wake-asr-qa'
import { createConfiguredSherpaDetector } from './wake/sherpa-detector'

/** Isolated browser-AEC capture -> the same local detector. No provider, audio
 * retention or production ownership change. Native visitor playback is outside
 * Chromium's reference; browser background playback is inside it. */
export async function runRavenWakeBrowserQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || systemPreferences.getMediaAccessStatus('microphone') !== 'granted') throw Error('raven_qa_isolation_required')
  const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms))
  const ready = Date.now() + 10000
  while (!input.wakeOwner?.()?.configuration() && Date.now() < ready) await wait(100)
  const owner = input.wakeOwner?.(), configuration = owner?.configuration()
  const speakerDevice = Speaker.devices().find(device => device.name === 'Mac mini Speakers')
  if (!owner || !configuration || !speakerDevice || input.runtime.snapshot().lifecycle !== 'dormant') throw Error('raven_qa_wake_owner_unavailable')
  const waves = (await synthesize([configuration.phrase, '有請其他大人', '渡鴉大人今天很忙', '今天的天氣很好',
    '今天的旅行從海邊開始。我們走過市場，看見新鮮水果，然後坐在樹下休息。午後的風很舒服，明天再去山上散步。']))
    .map(encoded => Buffer.from(encoded, 'base64'))
  const visitor: Buffer[] = []
  for (const wav of waves.slice(0, 4)) {
    const source = Int16Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2))
    const mono = await convertWakeQaPcm(source, wav.readUInt32LE(24), speakerDevice.defaultSampleRate)
    const bytes = Buffer.alloc((mono.length + speakerDevice.defaultSampleRate * 2) * speakerDevice.maxOutputChannels * 2)
    for (let i = 0; i < mono.length; i++) for (let c = 0; c < speakerDevice.maxOutputChannels; c++) bytes.writeInt16LE(mono[i]!, ((i + speakerDevice.defaultSampleRate) * speakerDevice.maxOutputChannels + c) * 2)
    visitor.push(bytes); source.fill(0); mono.fill(0)
  }
  const evaluate = <T = unknown>(code: string): Promise<T> => input.mirror.webContents.executeJavaScript(`(async()=>{${code}})()`)
  const rows: Record<string, unknown>[] = []
  let failure: string | null = null, released = false, captureClosed = false
  const persist = (finished: boolean) => writeFile(join(input.outputDir, '../wake-browser.json'), JSON.stringify({
    finished, failure, rows, route: 'native_mac_visitor_browser_jabra_background_and_capture',
    detector: 'configured_sherpa', productionChanged: false, audioRetention: 'none', released, captureClosed, humanAcceptance: 'not_executed',
  }, null, 2))
  if ((await owner.release()).status !== 'success') throw Error('raven_qa_worker_release_failed')
  released = true
  try {
    await evaluate(`
      document.querySelector('[data-presentation-ambience]')?.pause();
      const devices=await navigator.mediaDevices.enumerateDevices();
      const mic=devices.find(d=>d.kind==='audioinput'&&/Jabra Speak2 75/i.test(d.label));
      const out=devices.find(d=>d.kind==='audiooutput'&&/Jabra Speak2 75/i.test(d.label));
      if(!mic||!out)throw Error('raven_qa_acoustic_route_unavailable');
      const q=window.__ravenBrowserWakeQa={chunks:[],count:0,overflows:0,blocks:0,last:0};
      q.stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:mic.deviceId},echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      q.context=new AudioContext({sampleRate:16000});if(q.context.sampleRate!==16000)throw Error('raven_qa_capture_rate_invalid');
      q.source=q.context.createMediaStreamSource(q.stream);q.processor=q.context.createScriptProcessor(1024,1,1);
      q.processor.onaudioprocess=e=>{const data=e.inputBuffer.getChannelData(0);q.blocks++;q.last=performance.now();
        if(q.count+data.length>16000){q.overflows++;return}q.chunks.push(Array.from(data));q.count+=data.length;e.outputBuffer.getChannelData(0).fill(0)};
      q.source.connect(q.processor);q.processor.connect(q.context.destination);await q.context.resume();
      const bytes=Uint8Array.from(atob('${waves[4]!.toString('base64')}'),c=>c.charCodeAt(0));
      q.bedUrl=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));bytes.fill(0);
      q.bed=new Audio(q.bedUrl);q.bed.loop=true;q.bed.volume=.07;await q.bed.setSinkId(out.deviceId);
      const ready=performance.now()+2000;while(!q.blocks&&performance.now()<ready)await new Promise(r=>setTimeout(r,20));
      if(!q.blocks)throw Error('raven_qa_capture_not_ready');
    `)
    for (const background of [false, true]) {
      const detector = createConfiguredSherpaDetector({ ...configuration, calibration: true })
      let detections = 0, samples = 0, peak = 0, lastFresh = 0, reading = true, captureFault = false
      const trials: { positive: boolean; detections: number; samples: number; peak: number }[] = []
      const row = { background, gain: background ? .07 : 0, priorDetections: 0, trials, passed: false }
      rows.push(row)
      const drain = (async () => {
        while (reading) {
          const chunk = await evaluate<{ samples: number[]; overflows: number; age: number }>(`const q=window.__ravenBrowserWakeQa;const samples=q.chunks.flat();q.chunks=[];q.count=0;return {samples,overflows:q.overflows,age:performance.now()-q.last}`)
          if (chunk.overflows || chunk.age > 2000 || chunk.samples.length > 16000) { captureFault = true; break }
          const pcm = Int16Array.from(chunk.samples, n => Math.max(-32768, Math.min(32767, Math.round(n * 32767))))
          if (pcm.length) {
            samples += pcm.length; lastFresh = Date.now()
            for (const n of pcm) peak = Math.max(peak, Math.abs(n) / 32768)
            if (detector.process(pcm).status === 'detected') detections++
          }
          pcm.fill(0); chunk.samples.fill(0); await wait(40)
        }
      })().catch(() => { captureFault = true })
      try {
        if (background) await evaluate('await window.__ravenBrowserWakeQa.bed.play()')
        await wait(4000)
        const priorDetections = detections
        row.priorDetections = priorDetections
        for (let trial = 0; trial < (background ? 20 : 10); trial++) {
          const positive = trial % 2 === 0, bytes = visitor[positive ? 0 : 1 + Math.floor(trial / 2) % 3]!
          const before = { detections, samples }; peak = 0
          const speaker = await Speaker.open({ device: { id: speakerDevice.id }, sampleRate: speakerDevice.defaultSampleRate, channels: speakerDevice.maxOutputChannels, dtype: 'int16' })
          let expired = false
          const deadline = setTimeout(() => { expired = true; speaker.stop() }, 15000)
          try { await speaker.writeAsync(bytes); await speaker.drainAsync(); await wait(1500) }
          finally { clearTimeout(deadline); speaker.stop() }
          if (expired || captureFault || Date.now() - lastFresh > 1000) throw Error('raven_qa_acoustic_delivery_failed')
          trials.push({ positive, detections: detections - before.detections, samples: samples - before.samples, peak })
          await persist(false)
        }
        const passed = priorDetections === 0 && trials.every(t => t.positive ? t.detections > 0 : t.detections === 0)
        row.passed = passed
        input.onEvidence({ step: background ? 'browser_aec_speech' : 'browser_aec_quiet', status: passed ? 'passed' : 'failed' })
      } finally { reading = false; await drain; detector.close(); await persist(false) }
    }
    if (!rows.every(row => row.passed)) throw Error('raven_qa_browser_wake_unqualified')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0 }
  } catch (error) {
    failure = error instanceof Error && /^raven_qa_[a-z_]+$/.test(error.message) ? error.message : 'raven_qa_browser_capture_failed'
    throw Error(failure)
  } finally {
    captureClosed = await evaluate<boolean>(`const q=window.__ravenBrowserWakeQa;if(!q)return true;q.bed?.pause();if(q.bed)q.bed.src='';if(q.bedUrl)URL.revokeObjectURL(q.bedUrl);
      q.processor?.disconnect();q.source?.disconnect();q.stream?.getTracks().forEach(t=>t.stop());if(q.context)await q.context.close();
      q.chunks=[];const closed=!q.stream||q.stream.getTracks().every(t=>t.readyState==='ended');delete window.__ravenBrowserWakeQa;return closed`).catch(() => false)
    visitor.forEach(bytes => bytes.fill(0)); waves.forEach(bytes => bytes.fill(0)); await persist(true)
    if (!captureClosed || (await owner.acquire()).status !== 'success') throw Error('raven_qa_worker_restore_failed')
  }
}
