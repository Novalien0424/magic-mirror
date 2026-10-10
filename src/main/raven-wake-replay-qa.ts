import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { app, systemPreferences } from 'electron'
import { File, Speaker } from 'decibri'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import type { WakeWorkerPackage } from './wake/protocol'
import type { WakeCapture } from './wake/capture'
import type { WakeScore } from '../shared/wake-score'
import { openWakeCapture } from './wake/capture'
import { createConfiguredSherpaDetector } from './wake/sherpa-detector'
import { getAudioPreferences } from './audio-preferences'
import { synthesize } from './raven-conversation-qa'

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
  const hashes = Object.fromEntries(await Promise.all(Object.entries(pack.artifactPaths).map(async ([role, path]) =>
    [role, createHash('sha256').update(await readFile(path)).digest('hex')])))
  const waves = (await synthesize(['今天的天氣很好', pack.phrase])).map(value => Buffer.from(value, 'base64'))
  const trials: Record<string, unknown>[] = []
  let capture: WakeCapture | null = null
  const persist = (finished: boolean) => writeFile(join(input.outputDir, '../wake-replay.json'), JSON.stringify({
    finished, route: 'worker_release_then_main_same_capture_implementation_then_ram_replay',
    permission: 'granted', input: preference.inputLabel || 'system_default', output: output.name,
    engine: pack.engineVersion, model: pack.modelVersion, tuning: pack.tuning, hashes, trials,
    captureProcess: 'electron_main', audioRetention: 'none', humanAcceptance: 'not_executed',
  }, null, 2))
  const released = await owner.release()
  if (released.status !== 'success') throw Error('raven_qa_worker_release_failed')
  try {
    await input.mirror.webContents.executeJavaScript(`document.querySelector('[data-presentation-ambience]')?.pause()`)
    for (let index = 0; index < waves.length; index++) {
      const chunks: Int16Array[] = [], live = probe(pack)
      let total = 0, peak = 0, squares = 0, fault: string | null = null, limited = false
      let firstBlockAt = 0, lastBlockAt = 0, lastChunkSize = 0, drainMs = 0
      const openedAt = performance.now()
      try {
        capture = await openWakeCapture({ inputLabel: preference.inputLabel,
          onError: reason => { fault = reason ?? 'wake_microphone_failed' },
          onSamples: samples => {
            if (total + samples.length > 16000 * 15) { limited = true; return }
            lastBlockAt = performance.now(); if (!firstBlockAt) firstBlockAt = lastBlockAt
            lastChunkSize = samples.length
            chunks.push(samples.slice()); total += samples.length
            for (const value of samples) { peak = Math.max(peak, Math.abs(value) / 32768); squares += (value / 32768) ** 2 }
            live.feed(samples)
          } })
        await delay(750)
        const wave = waves[index]!, sampleRate = wave.readUInt32LE(24)
        const speaker = await Speaker.open({ device: { id: output.id }, sampleRate, channels: 1, dtype: 'int16' })
        const playbackAt = performance.now()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([(async () => { await speaker.writeAsync(wave.subarray(44)); await speaker.drainAsync() })(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(Error('raven_qa_playback_timeout')), 10000) })])
          drainMs = performance.now() - playbackAt
          // Keep the device open through the acoustic tail; compare against the
          // earlier immediate-stop run instead of assuming native drain means
          // every device's physical output pipeline has finished.
          await delay(2500)
        } finally { clearTimeout(timer); speaker.stop() }
        const statistics = capture.statistics?.(), elapsedMs = performance.now() - openedAt
        capture.stop(); capture = null
        const combined = new Int16Array(total); let offset = 0
        for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length }
        const replay = (values: readonly Int16Array[], score = pack.tuning.score) => {
          const candidate = probe({ ...pack, tuning: { ...pack.tuning, score } })
          try { for (const value of values) candidate.feed(value); return candidate.result() }
          finally { candidate.close() }
        }
        const fixed: Int16Array[] = []
        for (let at = 0; at < total; at += 1600) fixed.push(combined.subarray(at, at + 1600))
        const gain = peak ? Math.min(8, 0.65 / peak) : 1
        const amplified = fixed.map(chunk => Int16Array.from(chunk, value => Math.max(-32768, Math.min(32767, Math.round(value * gain)))))
        const source = Float32Array.from({ length: (wave.length - 44) / 2 }, (_, i) => wave.readInt16LE(44 + i * 2) / 32768)
        const clean = probe(pack)
        try {
          for await (const chunk of File.buffer(source, { inputRate: sampleRate, sampleRate: 16000, channels: 1, dtype: 'int16', vad: false, dcRemoval: true, highpass: 80 })) {
            const pcm = Int16Array.from({ length: chunk.length / 2 }, (_, i) => chunk.readInt16LE(i * 2))
            for (let at = 0; at < pcm.length; at += 1600) clean.feed(pcm.subarray(at, at + 1600))
            pcm.fill(0)
          }
          for (let i = 0; i < 25; i++) clean.feed(new Int16Array(1600))
          trials.push({ stimulus: index ? 'wake_phrase' : 'unrelated_speech', totalSamples: total, elapsedMs,
            sourceSampleRate: sampleRate, sourceDurationMs: (wave.length - 44) / 2 / sampleRate * 1000, drainMs, outputTailHoldMs: 2500,
            firstBlockDelayMs: firstBlockAt - openedAt, deliveredSpanMs: lastBlockAt - firstBlockAt,
            measuredRateHz: lastBlockAt > firstBlockAt ? (total - lastChunkSize) / ((lastBlockAt - firstBlockAt) / 1000) : null,
            deliveredAudioMs: total / 16, chunks: chunks.length, chunkSizes: [...new Set(chunks.map(c => c.length))],
            peak, rms: total ? Math.sqrt(squares / total) : 0, statistics, fault, limited,
            live: live.result(), originalChunkReplay: replay(chunks), fixedChunkReplay: replay(fixed),
            // Offline comparison only: keyword bias may retain a candidate that
            // the search otherwise prunes. Never publish this experimental tuning.
            keywordBiasComparison: [2, 4].map(score => ({ score, ...replay(fixed, score) })),
            gainComparison: { gain, ...replay(amplified) }, cleanSource: clean.result() })
        } finally { clean.close(); source.fill(0); combined.fill(0); amplified.forEach(c => c.fill(0)) }
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
