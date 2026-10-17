import { app, systemPreferences } from 'electron'
import { spawn } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Speaker } from 'decibri'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import type { WakeCalibrationCommand, WakeCalibrationSnapshot } from '../shared/wake-calibration'
import { synthesize } from './raven-conversation-qa'
import { DORMANT_MEDIA_GAIN } from '../shared/media-volume'

type Wave = { rate: number; pcm: Buffer }
const wave = (encoded: string): Wave => {
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 36, 40) !== 'data') throw Error('wake_media_qa_wave_invalid')
  return { rate: bytes.readUInt32LE(24), pcm: bytes.subarray(44) }
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function sharedMusic(onDecodeFailure: () => void): Promise<Wave> {
  const folders = JSON.parse(await readFile(join(homedir(), 'Library/Application Support/magic-mirror/media-folders.json'), 'utf8'))
  const folder = folders.links?.shared
  if (typeof folder !== 'string') throw Error('wake_media_qa_music_unavailable')
  const names = (await readdir(folder)).filter(name => /\.(mp3|m4a|aac|wav)$/i.test(name)).sort()
  if (!names.length) throw Error('wake_media_qa_music_unavailable')
  // Decode the existing operator-linked music in RAM; no asset name or PCM is logged.
  for (const name of names) {
    try {
      return await new Promise<Wave>((resolveWave, reject) => {
        const child = spawn('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-i', join(folder, name), '-t', '60', '-ar', '16000', '-ac', '1', '-f', 's16le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] })
        const chunks: Buffer[] = []; let bytes = 0
        const timer = setTimeout(() => child.kill(), 15000)
        child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2000000) child.kill(); else chunks.push(chunk) })
        child.once('error', () => { clearTimeout(timer); reject(Error('wake_media_qa_music_decode_failed')) })
        child.once('close', code => {
          clearTimeout(timer)
          if (code || bytes < 32000 || bytes > 2000000) reject(Error('wake_media_qa_music_decode_failed'))
          else resolveWave({ rate: 16000, pcm: Buffer.concat(chunks) })
        })
      })
    } catch { onDecodeFailure() }
  }
  throw Error('wake_media_qa_music_decode_failed')
}

/** Controlled speaker-to-microphone matrix using the production calibration owner.
 * Source and capture PCM stay in RAM. This is not representative human acceptance. */
export async function runRavenWakeMediaQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  try { return await measureWakeMedia(input) }
  catch (error) {
    const reason = error instanceof Error && /^(?:wake_media_qa|raven_qa)_[a-z_]+$/.test(error.message) ? error.message : 'wake_media_qa_setup_failed'
    input.onEvidence({ step: 'wake_media', status: 'failed', item: reason })
    throw Error(reason)
  }
}

async function measureWakeMedia(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')) throw Error('wake_media_qa_isolation_required')
  const soak = ['wake_soak', 'wake_soak_mac'].includes(process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] ?? '')
  const macSoak = process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] === 'wake_soak_mac'
  const alternateRoutes = process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] === 'wake_media_routes'
  const macDormant = process.env['MIRROR_RAVEN_CONVERSATION_QA_SCENARIO'] === 'wake_media_mac'
  const permission = systemPreferences.getMediaAccessStatus('microphone')
  if (permission !== 'granted') throw Error('wake_media_qa_permission_unavailable')
  input.onEvidence({ step: 'wake_media_permission', status: 'passed' })
  const config = await input.runtime.console.getConfig()
  if (!config.ok) throw Error('wake_media_qa_config_unavailable')
  const catalog = config.value.active.avatarCatalog
  const avatar = catalog?.avatars.find(a => a.id === catalog.activeAvatarId)
  if (!avatar) throw Error('wake_media_qa_avatar_unavailable')
  const wake = await input.runtime.getPublishedWakeConfigForRuntime()
  const manifest = JSON.parse(await readFile(join(app.getAppPath(), 'resources/wake-models', wake.packageId, 'manifest.json'), 'utf8'))
  const tuning = { ...manifest.tuning, ...(wake.tuning?.enabled && wake.tuning.phrase === wake.phrase ? wake.tuning : {}) }
  const settings = { avatarId: avatar.id, phrase: wake.phrase, threshold: tuning.threshold as number, score: tuning.score as number, numTrailingBlanks: tuning.numTrailingBlanks as number }
  const outputs = Speaker.devices(), stimulus = outputs.find(d => d.name === 'Mac mini Speakers'), bedDevice = outputs.find(d => d.name === 'Jabra Speak2 75')
  if (!stimulus || !bedDevice) throw Error('wake_media_qa_output_unavailable')
  input.onEvidence({ step: 'wake_media_routes', status: 'passed' })
  // The published Raven has a Dormant ambience loop. Silence that isolated
  // element so the quiet/digital-silence controls contain only the named bed.
  const ambience = await input.mirror.webContents.executeJavaScript(`(()=>{const a=document.querySelector('[data-presentation-ambience]');if(!a)return {present:false};const before={present:true,paused:a.paused,volume:a.volume};a.pause();a.muted=true;return before})()`)
  input.onEvidence({ step: 'wake_media_ambience', status: 'paused', item: JSON.stringify(ambience) })
  const sources = (await synthesize([wake.phrase, '有請其他大人', '渡鴉大人今天很忙', '今天的天氣很好',
    '今天的旅行從海邊開始。我們走過市場，看見新鮮水果，然後坐在樹下休息。午後的風很舒服，明天再去山上散步。'])).map(wave)
  const music = await sharedMusic(() => input.onEvidence({ step: 'wake_media_music_source', status: 'degraded', item: 'source_decode_failed_try_next' }))
  input.onEvidence({ step: 'wake_media_sources', status: 'passed' })
  const silence: Wave = { rate: 16000, pcm: Buffer.alloc(32000) }
  const cells: { name: string; bed: Wave | null; gain: number; output?: 'mac' }[] = soak ? [{ name: 'spoken_dormant_soak', bed: sources[4]!, gain: 0.7 * DORMANT_MEDIA_GAIN, ...(macSoak ? { output: 'mac' as const } : {}) }]
    : macDormant ? [{ name: 'music_mac_dormant', bed: music, gain: 0.14 * DORMANT_MEDIA_GAIN, output: 'mac' },
      { name: 'spoken_mac_dormant', bed: sources[4]!, gain: 0.7 * DORMANT_MEDIA_GAIN, output: 'mac' }]
    : alternateRoutes ? [{ name: 'music_jabra_minus20', bed: music, gain: 0.014 }, { name: 'spoken_jabra_minus20', bed: sources[4]!, gain: 0.07 },
      { name: 'music_mac_normal', bed: music, gain: 0.14, output: 'mac' }, { name: 'spoken_mac_normal', bed: sources[4]!, gain: 0.7, output: 'mac' }]
    : [{ name: 'quiet', bed: null, gain: 0 }, { name: 'jabra_digital_silence', bed: silence, gain: 1 },
      { name: 'music_normal', bed: music, gain: 0.14 }, { name: 'music_dormant', bed: music, gain: 0.14 * DORMANT_MEDIA_GAIN },
      { name: 'spoken_normal', bed: sources[4]!, gain: 0.7 }, { name: 'spoken_dormant', bed: sources[4]!, gain: 0.7 * DORMANT_MEDIA_GAIN }]
  const results: Record<string, unknown>[] = []
  let sessionId: string | null = null, failure: string | null = null
  const command = async (value: WakeCalibrationCommand) => {
    const response = await input.console.webContents.executeJavaScript(`window.magicMirror.wakeCalibration(${JSON.stringify(value)})`) as { ok: boolean; value?: WakeCalibrationSnapshot }
    if (!response.ok || !response.value) throw Error('wake_media_qa_calibration_unavailable')
    return response.value
  }
  const persist = (finished: boolean) => writeFile(join(input.outputDir, '../wake-media.json'), JSON.stringify({
    finished, failure, mode: soak ? 'soak' : macDormant ? 'mac_dormant' : alternateRoutes ? 'alternate_routes' : 'matrix', permission,
    route: 'mac_speaker_stimulus_jabra_capture',
    settings: { threshold: settings.threshold, score: settings.score, numTrailingBlanks: settings.numTrailingBlanks },
    musicSource: 'configured_shared_folder', operatorSettingsChanged: false, results, audioRetention: 'none', humanAcceptance: 'not_executed',
  }, null, 2))
  try {
    for (const cell of cells) {
      const start = await command({ type: 'start', settings }); sessionId = start.sessionId
      if (start.status !== 'testing' || !sessionId) throw Error('wake_media_qa_calibration_unavailable')
      await delay(1500)
      const initial = await command({ type: 'read', sessionId })
      if ((initial.input?.blocks ?? 0) < 4 || (initial.input?.lastBlockAgeMs ?? Infinity) > 1000) throw Error('wake_media_qa_capture_not_fresh')
      let bed: Speaker | null = null, playing = true, bedFailure = false
      let playback = Promise.resolve()
      if (cell.bed) {
        const device = cell.output === 'mac' ? stimulus : bedDevice
        bed = await Speaker.open({ device: device.id ? { id: device.id } : device.index, sampleRate: cell.bed.rate, channels: 1, dtype: 'int16' })
        const scaled = Buffer.from(cell.bed.pcm)
        for (let i = 0; i < scaled.length; i += 2) scaled.writeInt16LE(Math.round(scaled.readInt16LE(i) * cell.gain), i)
        const output = bed
        playback = (async () => {
          try { while (playing) for (let offset = 0; playing && offset < scaled.length; offset += 6400) await output.writeAsync(scaled.subarray(offset, offset + 6400)) }
          catch { if (playing) bedFailure = true }
        })()
      }
      const trials: Record<string, unknown>[] = []
      const row = { cell: cell.name, bedOutput: cell.bed ? cell.output === 'mac' ? 'mac' : 'jabra' : 'none', gain: cell.gain, trials, passed: false }
      results.push(row)
      await persist(false)
      try {
        await delay(2000)
        if (soak) {
          const before = await command({ type: 'read', sessionId }), began = performance.now()
          for (let minute = 1; minute <= 30; minute++) {
            // Reading renews the production calibration lease. A minute-long
            // sleep lets that lease expire and would invalidate the soak.
            while (performance.now() < began + minute * 60000) {
              await delay(1000)
              const keepalive = await command({ type: 'read', sessionId })
              if (keepalive.status !== 'testing' || (keepalive.input?.lastBlockAgeMs ?? Infinity) > 1000 || bedFailure) throw Error('wake_media_qa_capture_lost')
            }
            const negative = sources[1 + (minute - 1) % 3]!
            const speaker = await Speaker.open({ device: stimulus.id ? { id: stimulus.id } : stimulus.index,
              sampleRate: negative.rate, channels: 1, dtype: 'int16' })
            let expired = false
            const timeout = setTimeout(() => { expired = true; speaker.stop() }, 15000)
            try { await speaker.writeAsync(negative.pcm); await speaker.drainAsync() }
            finally { clearTimeout(timeout); speaker.stop() }
            if (expired) throw Error('wake_media_qa_playback_failed')
            await delay(1500)
            const current = await command({ type: 'read', sessionId })
            const sample = { minute, elapsedMs: Math.round(performance.now() - began), detections: current.detections - before.detections,
              negativePlayed: true, fresh: (current.input?.lastBlockAgeMs ?? Infinity) < 1000,
              blocks: (current.input?.blocks ?? 0) - (before.input?.blocks ?? 0) }
            trials.push(sample); await persist(false)
            input.onEvidence({ step: 'wake_media_soak_minute', status: sample.fresh ? 'measured' : 'failed', item: String(minute) })
            if (!sample.fresh || bedFailure || current.status !== 'testing') throw Error('wake_media_qa_capture_lost')
          }
          row.passed = trials.every(t => t.detections === 0 && t.fresh === true)
        } else {
          for (let trial = 0; trial < 20; trial++) {
            const positive = trial % 2 === 0, source = sources[positive ? 0 : 1 + Math.floor(trial / 2) % 3]!
            const before = await command({ type: 'read', sessionId })
            const output = await Speaker.open({ device: stimulus.id ? { id: stimulus.id } : stimulus.index, sampleRate: source.rate, channels: 1, dtype: 'int16' })
            let done = false, playbackFailed = false, peak = 0, freshPolls = 0
            const delivery = (async () => { try { await output.writeAsync(source.pcm); await output.drainAsync() } catch { playbackFailed = true } finally { output.stop(); done = true } })()
            const deadline = performance.now() + 15000
            let tail = 0
            try {
              while (performance.now() < deadline && (!done || tail++ < 15)) {
                const current = await command({ type: 'read', sessionId })
                if (current.status !== 'testing' || bedFailure) throw Error('wake_media_qa_capture_lost')
                peak = Math.max(peak, current.input?.peak ?? 0)
                if ((current.input?.lastBlockAgeMs ?? Infinity) < 1000) freshPolls++
                await delay(100)
              }
            } finally {
              output.stop(); await Promise.race([delivery, delay(1000)])
            }
            if (playbackFailed || !done) throw Error('wake_media_qa_playback_failed')
            const after = await command({ type: 'read', sessionId })
            const sample = { trial, positive, detections: after.detections - before.detections, peak, freshPolls, blocks: (after.input?.blocks ?? 0) - (before.input?.blocks ?? 0) }
            trials.push(sample); await persist(false)
          }
          row.passed = trials.filter(t => t.positive && Number(t.detections) > 0).length >= 9
            && trials.every(t => (t.positive || t.detections === 0) && Number(t.freshPolls) > 0 && Number(t.blocks) > 0 && Number(t.peak) > 0)
        }
      } finally {
        playing = false; bed?.stop(); await Promise.race([playback, delay(1000)])
        await command({ type: 'stop', sessionId }); sessionId = null
      }
      input.onEvidence({ step: 'wake_media_' + cell.name, status: row.passed ? 'passed' : 'failed' })
      await persist(false)
    }
    if (results.some(r => !r.passed)) throw Error('wake_media_qa_acceptance_failed')
  } catch (error) {
    failure = error instanceof Error && /^wake_media_qa_[a-z_]+$/.test(error.message) ? error.message : 'wake_media_qa_failed'
    throw Error(failure)
  } finally {
    if (sessionId) await command({ type: 'stop', sessionId }).catch(() => {})
    await persist(true)
  }
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0 }
}
