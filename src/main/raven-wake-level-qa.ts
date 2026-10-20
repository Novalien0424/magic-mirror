import { app, systemPreferences } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Microphone, Speaker } from 'decibri'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import { synthesize } from './raven-conversation-qa'
import { compareWakeQaAsr, convertWakeQaPcm } from './raven-wake-asr-qa'
import { createConfiguredSherpaDetector } from './wake/sherpa-detector'
import { pcmLevels, scalePcm } from './wake/qa-levels'

/** Acoustic level comparison, not human acceptance. One native microphone;
 * RAM-only audio, unchanged detector/settings and no software AEC. */
export async function runRavenWakeLevelQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || systemPreferences.getMediaAccessStatus('microphone') !== 'granted') throw Error('raven_qa_isolation_required')
  const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms))
  const ready = Date.now() + 10000
  while (!input.wakeOwner?.()?.configuration() && Date.now() < ready) await wait(100)
  const owner = input.wakeOwner?.(), configuration = owner?.configuration()
  const micDevice = Microphone.devices().find(d => d.name === 'Jabra Speak2 75')
  const outputs = Speaker.devices(), visitorOutput = outputs.find(d => d.name === 'Mac mini Speakers'), bedOutput = outputs.find(d => d.name === 'Jabra Speak2 75')
  if (!owner || !configuration || !micDevice || !visitorOutput || !bedOutput || input.runtime.snapshot().lifecycle !== 'dormant') throw Error('raven_qa_acoustic_route_unavailable')
  const asrComparison = process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] === 'wake_levels_asr'
  const model = asrComparison ? (await input.runtime.getPublishedSessionModelSnapshotForDiagnostics()).inputTranscription : ''
  const tokens = asrComparison ? await readFile(configuration.artifactPaths.tokens!, 'utf8') : ''
  const waves = (await synthesize([configuration.phrase, '有請其他大人', '渡鴉大人今天很忙', '今天的天氣很好',
    '今天的旅行從海邊開始。我們走過市場，看見新鮮水果，然後坐在樹下休息。午後的風很舒服，明天再去山上散步。'])).map(s => Buffer.from(s, 'base64'))
  const sources: Int16Array[] = []
  for (const wave of waves) {
    if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 36, 40) !== 'data') throw Error('raven_qa_wave_invalid')
    const pcm = Int16Array.from({ length: (wave.length - 44) / 2 }, (_, i) => wave.readInt16LE(44 + i * 2))
    sources.push(await convertWakeQaPcm(pcm, wave.readUInt32LE(24), 48000)); pcm.fill(0); wave.fill(0)
  }
  const sourceLevels = sources.map(pcmLevels), rows: Record<string, unknown>[] = []
  const cleanAsr = asrComparison ? await compareWakeQaAsr(sources[0]!, 48000, model, configuration.phrase, { tokens }) : undefined
  let microphone: Microphone | undefined, failure: string | null = null, restored = false
  const persist = (finished: boolean) => writeFile(join(input.outputDir, '../wake-levels.json'), JSON.stringify({
    finished, failure, rows, sourceLevels, restored, route: 'native_mac_visitor_jabra_background_and_capture',
    outputFormat: { rate: 48000, channels: 2 }, captureFormat: { rate: 16000, channels: 1 },
    conditioning: 'production_dc_removal_highpass_no_aec', detectorChanged: false,
    replayContext: 'fresh_stream_trial_only_live_has_prior_audio_context', asrComparison, cleanAsr,
    levels: 'digital_dBFS_not_acoustic_SPL_or_simultaneous_SNR', audioRetention: 'none', humanAcceptance: 'not_executed',
  }, null, 2))
  const stereo = (pcm: Int16Array, padding: boolean) => {
    const offset = padding ? 48000 : 0, bytes = Buffer.alloc((pcm.length + offset * 2) * 4)
    for (let i = 0; i < pcm.length; i++) { bytes.writeInt16LE(pcm[i]!, (i + offset) * 4); bytes.writeInt16LE(pcm[i]!, (i + offset) * 4 + 2) }
    return bytes
  }
  if ((await owner.release()).status !== 'success') throw Error('raven_qa_worker_release_failed')
  try {
    await input.mirror.webContents.executeJavaScript(`document.querySelector('[data-presentation-ambience]')?.pause()`)
    const cells = [
      { name: 'quiet_original', raised: false, gain: null }, { name: 'quiet_raised', raised: true, gain: null },
      { name: 'jabra_digital_silence', raised: true, gain: 0 },
      { name: 'speech_original', raised: false, gain: .07 }, { name: 'speech_raised', raised: true, gain: .07 },
      { name: 'speech_quieter_bed', raised: true, gain: .007 },
    ]
    for (const cell of cells.filter(c => !asrComparison || ['quiet_original', 'speech_original', 'speech_quieter_bed'].includes(c.name))) {
      const detector = createConfiguredSherpaDetector({ ...configuration, calibration: true })
      let detections = 0, blocks = 0, lastBlock = 0, fault = false, collecting = true, capturing: Int16Array[] = []
      let playing = false, bed: Speaker | undefined, playback = Promise.resolve()
      const trials: Record<string, unknown>[] = [], row = { ...cell, trials, background: {} as unknown, passed: false }
      rows.push(row)
      try {
        microphone = await Microphone.open({ device: { id: micDevice.id }, sampleRate: 16000, channels: 1,
          framesPerBuffer: 1600, dtype: 'int16', vad: false, dcRemoval: true, highpass: 80 })
        microphone.on('error', () => { fault = true })
        microphone.on('data', (bytes: Buffer) => {
          if (bytes.length % 2) { fault = true; return }
          const pcm = Int16Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readInt16LE(i * 2))
          blocks++; lastBlock = Date.now()
          try { if (detector.process(pcm).status === 'detected') detections++ } catch { fault = true }
          if (!collecting) pcm.fill(0)
          else if (capturing.reduce((n, a) => n + a.length, 0) + pcm.length <= 16000 * 20) capturing.push(pcm)
          else { pcm.fill(0); fault = true }
        })
        await wait(1500)
        if (blocks < 5 || Date.now() - lastBlock > 1000 || fault) throw Error('raven_qa_capture_not_ready')
        const take = () => {
          const pcm = new Int16Array(capturing.reduce((n, a) => n + a.length, 0)); let at = 0
          for (const part of capturing) { pcm.set(part, at); at += part.length; part.fill(0) } capturing = []
          return pcm
        }
        take().fill(0)
        if (cell.gain !== null) {
          const scaled = scalePcm(sources[4]!, cell.gain), bedBytes = stereo(scaled.pcm, false); scaled.pcm.fill(0)
          bed = await Speaker.open({ device: { id: bedOutput.id }, sampleRate: 48000, channels: 2, dtype: 'int16' })
          const sink = bed, began = performance.now(); let queued = 0; playing = true
          playback = (async () => {
            try {
              while (playing) for (let at = 0; playing && at < bedBytes.length; at += 19200) {
                await wait(Math.max(0, began + queued / 48000 * 1000 - performance.now() - 100))
                if (!playing) break
                const chunk = bedBytes.subarray(at, at + 19200); await sink.writeAsync(chunk); queued += chunk.length / 4
              }
            } catch { if (playing) fault = true } finally { bedBytes.fill(0) }
          })()
        }
        await wait(3000)
        const background = take(); row.background = { ...pcmLevels(background), detections }; background.fill(0)
        for (let trial = 0; trial < 6; trial++) {
          detector.reset(); take().fill(0)
          const positive = trial % 2 === 0, index = positive ? 0 : 1 + Math.floor(trial / 2)
          const gain = cell.raised ? Math.min(4, .95 / Math.max(sourceLevels[index]!.peak, .001)) : 1
          const scaled = scalePcm(sources[index]!, gain), bytes = stereo(scaled.pcm, true); scaled.pcm.fill(0)
          const before = { detections, blocks }, speaker = await Speaker.open({ device: { id: visitorOutput.id }, sampleRate: 48000, channels: 2, dtype: 'int16' })
          let expired = false
          const timeout = setTimeout(() => { expired = true; speaker.stop() }, 15000)
          try { await speaker.writeAsync(bytes); await speaker.drainAsync(); await wait(1000) }
          finally { clearTimeout(timeout); speaker.stop(); bytes.fill(0) }
          if (expired || fault || Date.now() - lastBlock > 1000) throw Error('raven_qa_acoustic_delivery_failed')
          const received = take(), replay = createConfiguredSherpaDetector({ ...configuration, calibration: true })
          let replayDetections = 0
          try { for (let at = 0; at < received.length; at += 1600) if (replay.process(received.subarray(at, at + 1600)).status === 'detected') replayDetections++ }
          finally { replay.close() }
          const measured = { detections: detections - before.detections, blocks: blocks - before.blocks }
          let asr: Record<string, unknown> | undefined
          if (asrComparison && trial === 4) {
            collecting = false
            try { asr = await compareWakeQaAsr(received, 16000, model, configuration.phrase, { tokens }) }
            finally { collecting = true }
          }
          trials.push({ trial, positive, gain, sourceClipped: scaled.clipped, ...measured,
            replayDetections, capture: pcmLevels(received), fresh: true, ...(asr ? { asr } : {}) })
          received.fill(0); await persist(false)
        }
        row.passed = trials.every(t => t.positive ? Number(t.detections) > 0 : t.detections === 0)
        input.onEvidence({ step: 'wake_levels_' + cell.name, status: row.passed ? 'passed' : 'failed' })
      } finally {
        playing = false; bed?.stop(); await Promise.race([playback, wait(1000)])
        if (microphone) {
          const ended = new Promise<void>(done => { microphone!.once('end', done); microphone!.once('close', done) })
          microphone.stop(); await Promise.race([ended, wait(2000)]); microphone = undefined
        }
        capturing.forEach(p => p.fill(0)); detector.close(); await persist(false)
      }
    }
    // Completed measurements are useful even when wake is unqualified. Keep
    // failures explicit; never convert a missing positive into acceptance.
    if (!rows.every(r => r.passed)) throw Error('raven_qa_wake_levels_unqualified')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0 }
  } catch (error) {
    failure = error instanceof Error && /^raven_qa_[a-z_]+$/.test(error.message) ? error.message : 'raven_qa_wake_levels_failed'
    throw Error(failure)
  } finally {
    microphone?.stop(); sources.forEach(p => p.fill(0)); waves.forEach(w => w.fill(0))
    restored = (await owner.acquire()).status === 'success'; await persist(true)
    if (!restored) throw Error('raven_qa_worker_restore_failed')
  }
}
