import { app, systemPreferences } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Microphone, Speaker } from 'decibri'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import { createConfiguredSherpaDetector, WAKE_MAX_ACTIVE_PATHS } from './wake/sherpa-detector'
import { synthesize } from './raven-conversation-qa'
import { convertWakeQaPcm } from './raven-wake-asr-qa'

/** Isolated acoustic experiment. The normal owner releases first. Only the
 * played background enters the AEC reference; visitor speech never does.
 * This does not add an AEC/reference path to the production wake worker. */
export async function runRavenWakeAecQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const scenario = process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] ?? ''
  const nativePlayback = scenario === 'wake_aec_alignment_native'
  const alignmentOnly = scenario === 'wake_aec_alignment' || nativePlayback
  if (process.platform !== 'darwin' || !['wake_aec', 'wake_aec_alignment', 'wake_aec_alignment_native'].includes(scenario)
    || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || !resolve(input.outputDir).startsWith(join(process.cwd(), '.artifacts/phase4-qa/')))
    throw Error('raven_qa_isolation_required')
  if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') throw Error('raven_qa_microphone_permission_unavailable')
  const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms))
  const ready = Date.now() + 10000
  while (!input.wakeOwner?.()?.configuration() && Date.now() < ready) await delay(100)
  const owner = input.wakeOwner?.(), configuration = owner?.configuration()
  if (!owner || !configuration || input.runtime.snapshot().lifecycle !== 'dormant') throw Error('raven_qa_wake_owner_unavailable')
  const pack = { ...configuration, calibration: true }
  const device = Microphone.devices().find(d => d.name === 'Jabra Speak2 75')
  const outputs = Speaker.devices(), visitorOutput = outputs.find(d => d.name === 'Mac mini Speakers'), bedOutput = outputs.find(d => d.name === 'Jabra Speak2 75')
  if (!device || !visitorOutput || !bedOutput) throw Error('raven_qa_acoustic_route_unavailable')
  const waves = (await synthesize([pack.phrase, '有請其他大人', '渡鴉大人今天很忙', '今天的天氣很好',
    '今天的旅行從海邊開始。我們走過市場，看見新鮮水果，然後坐在樹下休息。午後的風很舒服，明天再去山上散步。']))
    .map(encoded => Buffer.from(encoded, 'base64'))
  const decode = (wave: Buffer) => {
    if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 36, 40) !== 'data') throw Error('raven_qa_wave_invalid')
    return { rate: wave.readUInt32LE(24), pcm: wave.subarray(44) }
  }
  const speech = waves.map(decode), bedSource = speech[4]!
  const bedPcm = Buffer.from(bedSource.pcm)
  // Match the existing -20 dB speech-bed cell, which repeatedly missed wakes.
  for (let at = 0; at < bedPcm.length; at += 2) bedPcm.writeInt16LE(Math.round(bedPcm.readInt16LE(at) * .07), at)
  const rows: Record<string, unknown>[] = []
  let failure: string | null = null, microphone: Microphone | undefined
  const persist = (finished: boolean) => writeFile(join(input.outputDir, '../wake-aec.json'), JSON.stringify({
    finished, failure, mode: nativePlayback ? 'far_end_alignment_native_output' : alignmentOnly ? 'far_end_alignment_only' : 'wake_trials', route: 'mac_speaker_visitor_jabra_bed_and_capture', captureProcess: 'electron_main',
    ownerProtocol: 'release_before_capture_close_before_restore', maxActivePaths: WAKE_MAX_ACTIVE_PATHS,
    reference: 'actual_post_gain_background_pcm_only', backgroundGain: .07, rows,
    audioRetention: 'none', operatorSettingsChanged: false, productionAecEnabled: false, humanAcceptance: 'not_executed',
  }, null, 2))
  if ((await owner.release()).status !== 'success') throw Error('raven_qa_worker_release_failed')
  try {
    await input.mirror.webContents.executeJavaScript(`document.querySelector('[data-presentation-ambience]')?.pause()`)
    const cells = alignmentOnly ? [
      { name: 'jabra_16k_alignment', aec: true, background: true, count: 0, rate: 16000, output: bedOutput },
      { name: 'mac_16k_alignment', aec: true, background: true, count: 0, rate: 16000, output: visitorOutput },
      { name: 'jabra_32k_alignment', aec: true, background: true, count: 0, rate: 32000, output: bedOutput },
    ] : [{ name: 'quiet', aec: false, background: false, count: 10 },
      { name: 'speech_without_aec', aec: false, background: true, count: 20 },
      { name: 'speech_with_aec', aec: true, background: true, count: 20 }]
    for (const cell of cells) {
      const captureRate = 'rate' in cell ? cell.rate : 16000
      const output = 'output' in cell ? cell.output : bedOutput
      const playbackRate = nativePlayback ? output.defaultSampleRate : bedSource.rate
      const playbackChannels = nativePlayback ? output.maxOutputChannels : 1
      let playbackPcm = bedPcm
      if (nativePlayback) {
        const source = Int16Array.from({ length: bedPcm.length / 2 }, (_, i) => bedPcm.readInt16LE(i * 2))
        const mono = await convertWakeQaPcm(source, bedSource.rate, playbackRate)
        playbackPcm = Buffer.alloc(mono.length * playbackChannels * 2)
        for (let i = 0; i < mono.length; i++) for (let c = 0; c < playbackChannels; c++) playbackPcm.writeInt16LE(mono[i]!, (i * playbackChannels + c) * 2)
        source.fill(0); mono.fill(0)
      }
      const detector = createConfiguredSherpaDetector(pack)
      let detections = 0, samples = 0, blocks = 0, lastBlockAt = 0, peak = 0, maxProcessMs = 0, backpressure = 0
      let captureFault = false, playing = false, bedFault = false, referenceSamples = 0
      let alignmentSeen = false, maxErleDb = 0
      let bed: Speaker | undefined, playback = Promise.resolve()
      const trials: Record<string, unknown>[] = []
      const row = { cell: cell.name, captureRate, playbackRate, playbackChannels, bedOutput: output === visitorOutput ? 'mac' : 'jabra', trials, passed: false, input: {} as Record<string, unknown>, aec: null as unknown }
      rows.push(row); await persist(false)
      try {
        microphone = await Microphone.open({ device: { id: device.id }, sampleRate: captureRate, channels: 1, framesPerBuffer: 1600,
          dtype: 'int16', vad: false, dcRemoval: true, highpass: 80,
          ...(cell.aec ? { aec: { model: 'tau' as const, referenceSampleRate: playbackRate, referenceChannels: playbackChannels } } : {}) })
        const capture = microphone
        capture.on('error', () => { captureFault = true })
        capture.on('backpressure', () => { backpressure++ })
        capture.on('data', (chunk: Buffer) => {
          if (chunk.length % 2) { captureFault = true; return }
          const pcm = Int16Array.from({ length: chunk.length / 2 }, (_, i) => chunk.readInt16LE(i * 2))
          blocks++; samples += pcm.length; lastBlockAt = Date.now()
          for (const n of pcm) peak = Math.max(peak, Math.abs(n) / 32768)
          const at = performance.now()
          try { if (!alignmentOnly && detector.process(pcm).status === 'detected') detections++ }
          catch { captureFault = true }
          finally { pcm.fill(0) }
          maxProcessMs = Math.max(maxProcessMs, performance.now() - at)
          const metrics = capture.aecMetrics()
          if (metrics) { alignmentSeen ||= metrics.delaySamples !== null; maxErleDb = Math.max(maxErleDb, metrics.erleDb) }
        })
        const captureReady = Date.now() + 5000
        while (samples < 16000 && !captureFault && Date.now() < captureReady) await delay(25)
        if (samples < 16000 || captureFault) throw Error('raven_qa_capture_not_ready')
        if (cell.background) {
          bed = await Speaker.open({ device: { id: output.id }, sampleRate: playbackRate, channels: playbackChannels, dtype: 'int16' })
          const sink = bed, began = performance.now(), chunkBytes = Math.floor(playbackRate / 10) * playbackChannels * 2
          let queued = 0; playing = true
          playback = (async () => {
            try {
              while (playing) for (let at = 0; playing && at < playbackPcm.length; at += chunkBytes) {
                // Bound lead to 100 ms instead of filling an arbitrary native queue.
                await delay(Math.max(0, began + queued / playbackRate * 1000 - performance.now() - 100))
                if (!playing) break
                const chunk = playbackPcm.subarray(at, at + chunkBytes)
                if (cell.aec) { capture.pushAecReference(chunk); referenceSamples += chunk.length / (2 * playbackChannels) }
                await sink.writeAsync(chunk); queued += chunk.length / (2 * playbackChannels)
              }
            } catch { if (playing) bedFault = true }
          })()
          await delay(alignmentOnly ? 24000 : 10000)
        }
        if (captureFault || bedFault || Date.now() - lastBlockAt > 1000) throw Error('raven_qa_acoustic_delivery_failed')
        const beforeTrials = detections
        for (let trial = 0; trial < cell.count; trial++) {
          const positive = trial % 2 === 0, source = speech[positive ? 0 : 1 + Math.floor(trial / 2) % 3]!
          const before = { detections, blocks, samples }; peak = 0
          const speaker = await Speaker.open({ device: { id: visitorOutput.id }, sampleRate: source.rate, channels: 1, dtype: 'int16' })
          let expired = false
          const timeout = setTimeout(() => { expired = true; speaker.stop() }, 15000)
          try { await speaker.writeAsync(source.pcm); await speaker.drainAsync(); await delay(1500) }
          finally { clearTimeout(timeout); speaker.stop() }
          if (expired || captureFault || bedFault || Date.now() - lastBlockAt > 1000) throw Error('raven_qa_acoustic_delivery_failed')
          trials.push({ trial, positive, detections: detections - before.detections, blocks: blocks - before.blocks,
            samples: samples - before.samples, peak, fresh: true })
          await persist(false)
        }
        row.aec = cell.aec ? { ...capture.aecMetrics(), alignmentSeen, maxErleDb } : null
        row.input = { blocks, samples, referenceSamples, peak, lastBlockAgeMs: Date.now() - lastBlockAt, maxProcessMs, backpressure, overruns: capture.overrunCount, priorDetections: beforeTrials }
        row.passed = alignmentOnly ? alignmentSeen : (!cell.aec || alignmentSeen) && beforeTrials === 0 && trials.filter(t => t.positive && Number(t.detections) > 0).length >= (cell.count === 10 ? 5 : 9)
          && trials.every(t => (t.positive || t.detections === 0) && Number(t.blocks) > 0 && Number(t.peak) > 0)
        input.onEvidence({ step: 'wake_aec_' + cell.name, status: row.passed ? 'passed' : 'failed' })
      } finally {
        playing = false; bed?.stop(); await Promise.race([playback, delay(1000)])
        if (microphone) {
          const ended = new Promise<void>(done => { microphone!.once('end', done); microphone!.once('close', done) })
          microphone.stop(); await Promise.race([ended, delay(2000)]); microphone = undefined
        }
        detector.close()
        if (playbackPcm !== bedPcm) playbackPcm.fill(0)
      }
      await persist(false)
    }
    if (!rows[0]?.passed || !alignmentOnly && !rows[2]?.passed) throw Error(alignmentOnly ? 'raven_qa_aec_reference_unaligned' : 'raven_qa_aec_not_qualified')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0 }
  } catch (error) {
    failure = error instanceof Error && /^raven_qa_[a-z_]+$/.test(error.message) ? error.message : 'raven_qa_aec_failed'
    throw Error(failure)
  } finally {
    microphone?.stop(); bedPcm.fill(0); waves.forEach(wave => wave.fill(0))
    await persist(true)
    if (input.runtime.snapshot().lifecycle !== 'dormant' || (await owner.acquire()).status !== 'success') throw Error('raven_qa_worker_restore_failed')
  }
}
