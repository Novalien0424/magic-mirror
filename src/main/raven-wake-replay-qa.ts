import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { app, systemPreferences } from 'electron'
import { File, Microphone, Speaker } from 'decibri'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import type { WakeWorkerPackage } from './wake/protocol'
import type { WakeCapture } from './wake/capture'
import type { WakeScore } from '../shared/wake-score'
import { openWakeCapture } from './wake/capture'
import { createConfiguredSherpaDetector, createSherpaDetector, WAKE_MAX_ACTIVE_PATHS, type SherpaKeywordSpotter } from './wake/sherpa-detector'
import { getAudioPreferences } from './audio-preferences'
import { synthesize } from './raven-conversation-qa'
import { compareWakeQaAsr, convertWakeQaPcm, convertWakeQaPcmWithApple } from './raven-wake-asr-qa'
import { matchMicrophoneName } from '../shared/audio-devices'

function probe(pack: WakeWorkerPackage) {
  const detector = createConfiguredSherpaDetector(pack)
  let detections = 0, candidate: WakeScore | null = null, maxProcessMs = 0
  return {
    feed(pcm: Int16Array) {
      const before = performance.now()
      if (detector.process(pcm).status === 'detected') detections++
      maxProcessMs = Math.max(maxProcessMs, performance.now() - before)
      const score = detector.measurement?.()
      if (score && (!candidate || score.matchedTokens > candidate.matchedTokens
        || score.matchedTokens === candidate.matchedTokens && score.acousticScore > candidate.acousticScore)) candidate = { ...score }
    },
    result: () => ({ detections, candidate, maxProcessMs }),
    close: () => detector.close(),
  }
}

function stockProbe(pack: WakeWorkerPackage, chunks: readonly Int16Array[], maxActivePaths = 4, score = pack.tuning.score): number {
  const native = require('sherpa-onnx-node') as { KeywordSpotter: new (config: object) => SherpaKeywordSpotter }
  const { encoder, decoder, joiner, tokens, keywords } = pack.artifactPaths
  const detector = createSherpaDetector(new native.KeywordSpotter({ featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { transducer: { encoder, decoder, joiner }, tokens, numThreads: 2, debug: 0, provider: 'cpu' },
    maxActivePaths, numTrailingBlanks: pack.tuning.numTrailingBlanks ?? 1, keywordsScore: score,
    keywordsThreshold: pack.tuning.threshold, keywordsFile: keywords }), 16000)
  let detections = 0
  try { for (const chunk of chunks) if (detector.process(chunk).status === 'detected') detections++; return detections }
  finally { detector.close() }
}

/** Exact delivered PCM stays bounded in Main RAM. Worker release precedes this
 * diagnostic capture; this capture closes before the worker can reacquire. */
export async function runRavenWakeReplayQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || !resolve(input.outputDir).startsWith(join(process.cwd(), '.artifacts/phase4-qa/'))) throw Error('raven_qa_isolation_required')
  if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') throw Error('raven_qa_microphone_permission_unavailable')
  const delay = (ms: number) => new Promise(done => setTimeout(done, ms))
  const deadline = Date.now() + 10000
  while (!input.wakeOwner?.()?.configuration() && Date.now() < deadline) await delay(100)
  const owner = input.wakeOwner?.(), original = owner?.configuration()
  if (!owner || !original || input.runtime.snapshot().lifecycle !== 'dormant') throw Error('raven_qa_wake_owner_unavailable')
  const pack = { ...original, calibration: true }
  const output = Speaker.devices().find(d => d.name === 'Mac mini Speakers')
  if (!output) throw Error('raven_qa_separate_speaker_unavailable')
  const preference = getAudioPreferences().preferences
  const providerComparison = process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] === 'wake_capture'
  const controlComparison = process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] === 'wake_control'
  const deepCapture = providerComparison || controlComparison
  const devices = Microphone.devices()
  const selectedName = preference.inputLabel ? matchMicrophoneName(preference.inputLabel, devices.map(d => d.name)) : undefined
  const device = preference.inputLabel ? devices.find(d => d.name === selectedName) : devices.find(d => d.isDefault)
  if (!device) throw Error('raven_qa_microphone_selection_unavailable')
  const transcriptionModel = providerComparison ? (await input.runtime.getPublishedSessionModelSnapshotForDiagnostics()).inputTranscription : ''
  const tokensText = providerComparison ? await readFile(pack.artifactPaths.tokens!, 'utf8') : ''
  const hashes = Object.fromEntries(await Promise.all(Object.entries(pack.artifactPaths).map(async ([role, path]) =>
    [role, createHash('sha256').update(await readFile(path)).digest('hex')])))
  const waves = (await synthesize(['今天的天氣很好', pack.phrase])).map(value => Buffer.from(value, 'base64'))
  const variants = [{ language: 'zh-TW' as const, rate: 0.4 }, { language: 'zh-CN' as const, rate: 0.51 }, { language: 'zh-CN' as const, rate: 0.4 }]
  if (providerComparison) for (const voice of variants) waves.push(Buffer.from((await synthesize([pack.phrase], voice))[0]!, 'base64'))
  let controlPack: WakeWorkerPackage | undefined
  if (controlComparison) {
    const manifest = JSON.parse(await readFile(join(process.cwd(), 'resources/wake-models', pack.packageId, 'manifest.json'), 'utf8'))
    const artifact = manifest.artifacts.find((a: { role: string }) => a.role === 'keywords')
    const keywords = join(dirname(pack.artifactPaths.encoder!), artifact.file)
    if (createHash('sha256').update(await readFile(keywords)).digest('hex') !== artifact.sha256) throw Error('raven_qa_control_keyword_hash_mismatch')
    controlPack = { ...pack, phrase: manifest.phrase, artifactPaths: { ...pack.artifactPaths, keywords } }
    waves.push(Buffer.from((await synthesize([controlPack.phrase]))[0]!, 'base64'))
    for (const wave of await synthesize(['有請其他大人', '渡鴉大人今天很忙'])) waves.push(Buffer.from(wave, 'base64'))
    for (const voice of variants) waves.push(Buffer.from((await synthesize([pack.phrase], voice))[0]!, 'base64'))
  }
  const trials: Record<string, unknown>[] = []
  let capture: WakeCapture | null = null
  const persist = (finished: boolean) => writeFile(join(input.outputDir, '../wake-replay.json'), JSON.stringify({
    finished, route: 'worker_release_then_main_same_capture_implementation_then_ram_replay',
    permission: 'granted', input: preference.inputLabel || 'system_default', output: output.name,
    engine: pack.engineVersion, model: pack.modelVersion, tuning: pack.tuning, maxActivePaths: WAKE_MAX_ACTIVE_PATHS, stockBaselineMaxActivePaths: 4, hashes, trials,
    captureProcess: 'electron_main', audioRetention: 'none', humanAcceptance: 'not_executed',
    resolvedInput: device.name, nativeInputRate: device.defaultSampleRate, providerComparison, controlComparison,
  }, null, 2))
  const released = await owner.release()
  if (released.status !== 'success') throw Error('raven_qa_worker_release_failed')
  try {
    await input.mirror.webContents.executeJavaScript(`document.querySelector('[data-presentation-ambience]')?.pause()`)
    const conditions = controlComparison ? [{ index: 0, raw: true }, { index: 1, raw: false }, { index: 1, raw: true }, { index: 2, raw: false }, { index: 2, raw: true },
      { index: 3, raw: false }, { index: 4, raw: false }, ...variants.map((_, i) => ({ index: i + 5, raw: false }))]
      : deepCapture ? [{ index: 0, raw: false }, { index: 1, raw: false }, { index: 1, raw: true },
      ...variants.map((_, i) => ({ index: i + 2, raw: false }))]
      : [{ index: 0, raw: false }, { index: 1, raw: false }]
    for (const { index, raw } of conditions) {
      const trialPack = controlPack && index === 2 ? controlPack : pack
      const chunks: Int16Array[] = [], live = probe(trialPack)
      const captureRate = raw ? device.defaultSampleRate : 16000
      let total = 0, peak = 0, squares = 0, fault: string | null = null, limited = false
      let firstBlockAt = 0, lastBlockAt = 0, lastChunkSize = 0, drainMs = 0
      let beforePlaybackSamples = 0, outputUnderrunsAtDrain = 0
      let captureEnd: Promise<void> | undefined
      const openedAt = performance.now()
      try {
        const onSamples = (samples: Int16Array) => {
            if (total + samples.length > captureRate * 15) { limited = true; return }
            lastBlockAt = performance.now(); if (!firstBlockAt) firstBlockAt = lastBlockAt
            lastChunkSize = samples.length
            chunks.push(samples.slice()); total += samples.length
            for (const value of samples) { peak = Math.max(peak, Math.abs(value) / 32768); squares += (value / 32768) ** 2 }
            if (!raw) live.feed(samples)
        }
        if (raw) {
          const microphone = await Microphone.open({ device: { id: device.id }, sampleRate: captureRate,
            channels: 1, framesPerBuffer: 1600, dtype: 'int16', vad: false, dcRemoval: false })
          let backpressure = 0
          captureEnd = new Promise(done => { microphone.once('end', done); microphone.once('close', done) })
          microphone.on('backpressure', () => { backpressure++ })
          microphone.on('error', () => { fault = 'wake_microphone_failed' })
          microphone.on('data', (chunk: Buffer) => onSamples(Int16Array.from({ length: chunk.length / 2 }, (_, i) => chunk.readInt16LE(i * 2))))
          capture = { stop: () => microphone.stop(), statistics: () => ({ overruns: microphone.overrunCount, backpressure }) }
        } else capture = await openWakeCapture({ inputLabel: device.name, onSamples,
          onError: reason => { fault = reason ?? 'wake_microphone_failed' } })
        if (deepCapture) {
          const readyDeadline = Date.now() + 5000
          while (total < captureRate && !fault && Date.now() < readyDeadline) await delay(25)
          if (total < captureRate || fault) throw Error('raven_qa_capture_not_ready')
        } else await delay(750)
        beforePlaybackSamples = total
        const wave = waves[index]!, sampleRate = wave.readUInt32LE(24)
        const playbackRate = deepCapture ? output.defaultSampleRate : sampleRate
        const playbackChannels = deepCapture ? output.maxOutputChannels : 1
        let outputBytes = wave.subarray(44)
        if (deepCapture) {
          const sourcePcm = Int16Array.from({ length: outputBytes.length / 2 }, (_, i) => outputBytes.readInt16LE(i * 2))
          const converted = await convertWakeQaPcm(sourcePcm, sampleRate, playbackRate)
          try {
            // Native output format with explicit leading/trailing silence avoids
            // putting the first phoneme in the device's initial callback.
            outputBytes = Buffer.alloc((converted.length + playbackRate * 2) * playbackChannels * 2)
            for (let i = 0; i < converted.length; i++) for (let c = 0; c < playbackChannels; c++)
              outputBytes.writeInt16LE(converted[i]!, ((i + playbackRate) * playbackChannels + c) * 2)
          } finally { sourcePcm.fill(0); converted.fill(0) }
        }
        const speaker = await Speaker.open({ device: { id: output.id }, sampleRate: playbackRate, channels: playbackChannels, dtype: 'int16' })
        const playbackAt = performance.now()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([(async () => { await speaker.writeAsync(outputBytes); await speaker.drainAsync() })(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(Error('raven_qa_playback_timeout')), 10000) })])
          drainMs = performance.now() - playbackAt
          outputUnderrunsAtDrain = speaker.underrunCount
          // Keep the device open through the acoustic tail; compare against the
          // earlier immediate-stop run instead of assuming native drain means
          // every device's physical output pipeline has finished.
          await delay(2500)
        } finally { clearTimeout(timer); speaker.stop(); if (deepCapture) outputBytes.fill(0) }
        const statistics = capture.statistics?.()
        capture.stop(); capture = null
        if (captureEnd) {
          let closeTimer: ReturnType<typeof setTimeout> | undefined
          try { await Promise.race([captureEnd, new Promise((_, reject) => { closeTimer = setTimeout(() => reject(Error('raven_qa_capture_close_timeout')), 2000) })]) }
          finally { clearTimeout(closeTimer) }
        }
        const elapsedMs = performance.now() - openedAt
        const delivered = new Int16Array(total); let offset = 0
        for (const chunk of chunks) { delivered.set(chunk, offset); offset += chunk.length }
        const combined = raw ? await convertWakeQaPcm(delivered, captureRate, 16000, true) : delivered
        const replay = (values: readonly Int16Array[], score = pack.tuning.score) => {
          const candidate = probe({ ...trialPack, tuning: { ...trialPack.tuning, score } })
          try { for (const value of values) candidate.feed(value); return candidate.result() }
          finally { candidate.close() }
        }
        const fixed: Int16Array[] = []
        for (let at = 0; at < combined.length; at += 1600) fixed.push(combined.subarray(at, at + 1600))
        const gain = peak ? Math.min(8, 0.65 / peak) : 1
        const amplified = fixed.map(chunk => Int16Array.from(chunk, value => Math.max(-32768, Math.min(32767, Math.round(value * gain)))))
        const source = Float32Array.from({ length: (wave.length - 44) / 2 }, (_, i) => wave.readInt16LE(44 + i * 2) / 32768)
        const clean = probe(trialPack), cleanChunks: Int16Array[] = []
        try {
          for await (const chunk of File.buffer(source, { inputRate: sampleRate, sampleRate: 16000, channels: 1, dtype: 'int16', vad: false, dcRemoval: true, highpass: 80 })) {
            const pcm = Int16Array.from({ length: chunk.length / 2 }, (_, i) => chunk.readInt16LE(i * 2))
            if (deepCapture) cleanChunks.push(pcm.slice())
            for (let at = 0; at < pcm.length; at += 1600) clean.feed(pcm.subarray(at, at + 1600))
            pcm.fill(0)
          }
          for (let i = 0; i < 25; i++) { const silence = new Int16Array(1600); clean.feed(silence); if (deepCapture) cleanChunks.push(silence) }
          let rawUnconditioned: ReturnType<typeof replay> | undefined
          let appleConversion: { samples: number; result: ReturnType<typeof replay>; stockDetections: number } | undefined
          if (raw) {
            const plain = await convertWakeQaPcm(delivered, captureRate, 16000)
            try { rawUnconditioned = replay([plain]) } finally { plain.fill(0) }
            if (controlComparison) {
              const apple = convertWakeQaPcmWithApple(delivered, captureRate)
              try { appleConversion = { samples: apple.length, result: replay([apple]), stockDetections: stockProbe(trialPack, [apple]) } }
              finally { apple.fill(0) }
            }
          }
          const expected = index ? trialPack.phrase : '今天的天氣很好'
          const stockDetections = deepCapture ? stockProbe(trialPack, fixed) : undefined
          const stockCleanDetections = deepCapture ? stockProbe(trialPack, cleanChunks) : undefined
          const searchComparison = controlComparison ? [
            { maxActivePaths: 8, score: 1 }, { maxActivePaths: 16, score: 1 }, { maxActivePaths: 32, score: 1 },
            { maxActivePaths: 8, score: 4 }, { maxActivePaths: 16, score: 4 }, { maxActivePaths: 4, score: 8 },
          ].map(config => ({ ...config, detections: stockProbe(trialPack, fixed, config.maxActivePaths, config.score) })) : undefined
          let asr: Record<string, unknown> | undefined
          if (providerComparison) {
            let cleanTranscript = ''
            const cleanPcm = Int16Array.from(source, x => Math.round(x * 32768))
            try {
              const cleanAsr = await compareWakeQaAsr(cleanPcm, sampleRate, transcriptionModel, expected,
                { tokens: tokensText, receive: text => { cleanTranscript = text } })
              const captured = await compareWakeQaAsr(delivered, captureRate, transcriptionModel, expected,
                { tokens: tokensText, ...(cleanTranscript ? { cleanTranscript } : {}) })
              asr = { clean: cleanAsr, captured }
            } finally { cleanPcm.fill(0); cleanTranscript = '' }
          }
          trials.push({ stimulus: controlComparison && (index === 3 || index === 4) ? 'near_phrase_negative_' + (index - 2)
            : index === 2 && controlComparison ? 'package_default_phrase' : index ? 'wake_phrase' : 'unrelated_speech', totalSamples: total, elapsedMs,
            synthesis: controlComparison && index >= 5 ? variants[index - 5]
              : index >= 2 && providerComparison ? variants[index - 2] : { language: 'zh-TW', rate: 0.51 },
            captureMode: raw ? 'native_rate_unfiltered' : 'production_16k_conditioned', captureRate, beforePlaybackSamples, asr, rawUnconditioned, appleConversion, stockDetections, stockCleanDetections, searchComparison,
            playbackRate, playbackChannels, outputPaddingMs: deepCapture ? 1000 : 0, outputUnderrunsAtDrain,
            sourceSampleRate: sampleRate, sourceDurationMs: (wave.length - 44) / 2 / sampleRate * 1000, drainMs, outputTailHoldMs: 2500,
            firstBlockDelayMs: firstBlockAt - openedAt, deliveredSpanMs: lastBlockAt - firstBlockAt,
            measuredRateHz: lastBlockAt > firstBlockAt ? (total - lastChunkSize) / ((lastBlockAt - firstBlockAt) / 1000) : null,
            deliveredAudioMs: total / captureRate * 1000, chunks: chunks.length, chunkSizes: [...new Set(chunks.map(c => c.length))],
            peak, rms: total ? Math.sqrt(squares / total) : 0, statistics, fault, limited,
            live: raw ? null : live.result(), originalChunkReplay: raw ? null : replay(chunks), fixedChunkReplay: replay(fixed),
            // Offline comparison only: keyword bias may retain a candidate that
            // the search otherwise prunes. Never publish this experimental tuning.
            keywordBiasComparison: [2, 4].map(score => ({ score, ...replay(fixed, score) })),
            gainComparison: { gain, ...replay(amplified) }, cleanSource: clean.result() })
        } finally { clean.close(); source.fill(0); delivered.fill(0); combined.fill(0); amplified.forEach(c => c.fill(0)); cleanChunks.forEach(c => c.fill(0)) }
      } finally { capture?.stop(); capture = null; live.close(); chunks.forEach(c => c.fill(0)); chunks.length = 0 }
      await persist(false)
    }
    await persist(true)
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0 }
  } finally {
    waves.forEach(w => w.fill(0)); waves.length = 0
    if ((await owner.acquire()).status !== 'success') throw Error('raven_qa_worker_restore_failed')
  }
}
