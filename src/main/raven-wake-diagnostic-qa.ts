import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { app, systemPreferences } from 'electron'
import { Microphone, Speaker } from 'decibri'
import type { Phase4QaInput, Phase4QaResult } from './phase4-qa'
import type { WakeCalibrationCommand, WakeCalibrationSnapshot } from '../shared/wake-calibration'
import { getAudioPreferences, saveAudioPreferences } from './audio-preferences'
import { synthesize } from './raven-conversation-qa'

/** Physical diagnostic, not human accuracy acceptance. Audio remains in RAM;
 * calibration keeps the sole wake owner and prevents unintended cloud sessions. */
export async function runRavenWakeDiagnosticQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  if (process.platform !== 'darwin' || app.getPath('userData') !== resolve(input.outputDir, '../user-data')
    || !resolve(input.outputDir).startsWith(join(process.cwd(), '.artifacts/phase4-qa/'))) throw Error('raven_qa_isolation_required')
  const original = getAudioPreferences().preferences
  const initialPermission = systemPreferences.getMediaAccessStatus('microphone')
  let permission = initialPermission
  const config = await input.runtime.console.getConfig()
  if (!config.ok) throw Error('raven_qa_config_unavailable')
  const catalog = config.value.active.avatarCatalog
  const avatar = catalog?.avatars.find(a => a.id === catalog.activeAvatarId)
  if (!avatar || avatar.name !== 'Raven') throw Error('raven_qa_published_raven_required')
  const wake = await input.runtime.getPublishedWakeConfigForRuntime()
  const manifest = JSON.parse(await readFile(join(app.getAppPath(), 'resources/wake-models', wake.packageId, 'manifest.json'), 'utf8'))
  const tuning = { ...manifest.tuning, ...(wake.tuning?.enabled && wake.tuning.phrase === wake.phrase ? wake.tuning : {}) }
  const settings = { avatarId: avatar.id, phrase: wake.phrase, threshold: tuning.threshold as number,
    score: tuning.score as number, numTrailingBlanks: tuning.numTrailingBlanks as number }
  const inputs = Microphone.devices(), outputs = Speaker.devices()
  const trials: Record<string, unknown>[] = []
  let sessionId: string | null = null
  const delay = (ms: number) => new Promise(done => setTimeout(done, ms))
  const command = async (value: WakeCalibrationCommand) => {
    const response = await input.console.webContents.executeJavaScript(`window.magicMirror.wakeCalibration(${JSON.stringify(value)})`) as { ok: boolean; value?: WakeCalibrationSnapshot }
    if (!response.ok || !response.value) throw Error('raven_qa_wake_calibration_unavailable')
    return response.value
  }
  const persist = (finished: boolean) => writeFile(join(input.outputDir, '../wake-diagnostic.json'), JSON.stringify({
    finished, initialPermission, permission, settings: { threshold: settings.threshold, score: settings.score, numTrailingBlanks: settings.numTrailingBlanks },
    inputs: inputs.map(({ name, isDefault, maxInputChannels, defaultSampleRate }) => ({ name, isDefault, maxInputChannels, defaultSampleRate })),
    outputs: outputs.map(({ name, isDefault, maxOutputChannels, defaultSampleRate }) => ({ name, isDefault, maxOutputChannels, defaultSampleRate })),
    trials, humanAcceptance: 'not_executed', audioRetention: 'none', operatorSettingsChanged: false,
  }, null, 2))
  try {
    await persist(false)
    // Startup requests TCC asynchronously. Do not race that request or start a
    // native capture under an unresolved permission result.
    const permissionDeadline = Date.now() + 30000
    while (permission === 'not-determined' && Date.now() < permissionDeadline) {
      await delay(250)
      permission = systemPreferences.getMediaAccessStatus('microphone')
    }
    await persist(false)
    if (permission !== 'granted') throw Error('raven_qa_physical_microphone_permission_unavailable')
    const speech = (await synthesize([wake.phrase, '今天的天氣很好'])).map(encoded => Buffer.from(encoded, 'base64'))
    // Pause only this isolated fixture's ambience; measure and retain its state.
    const ambience = await input.mirror.webContents.executeJavaScript(`(()=>{const a=document.querySelector('[data-presentation-ambience]');if(!a)return null;const before={paused:a.paused,volume:a.volume};a.pause();return before})()`)
    trials.push({ kind: 'ambience_before_diagnostic_pause', value: ambience })
    const routes = [{ name: 'system_default', id: '', label: '' }, ...inputs.map(d => ({ name: d.name, id: d.id, label: d.name }))]
    for (const route of routes) {
      saveAudioPreferences({ ...original, inputId: route.id, inputLabel: route.label })
      for (const output of outputs) {
        for (const index of [1, 0]) {
          // Each stimulus starts with a fresh detector/capture, so prior candidates
          // and a device's startup report cannot be attributed to this trial.
          const start = await command({ type: 'start', settings })
          sessionId = start.sessionId
          if (start.status !== 'testing' || !sessionId) {
            trials.push({ input: route.name, output: output.name, result: 'capture_unavailable', reason: start.reason })
            await persist(false)
            if (sessionId) await command({ type: 'stop', sessionId })
            sessionId = null
            continue
          }
          const readyDeadline = Date.now() + 4000
          while (Date.now() < readyDeadline) {
            const ready = await command({ type: 'read', sessionId })
            if ((ready.input?.blocks ?? 0) >= 4 && (ready.input?.lastBlockAgeMs ?? Infinity) < 1000) break
            await delay(150)
          }
          const baseline = await command({ type: 'read', sessionId })
          const sample = { input: route.name, output: output.name, stimulus: index === 0 ? 'wake_phrase' : 'unrelated_speech',
            playbackCompleted: false, blocks: 0, freshPolls: 0, peak: 0, rms: 0, detections: 0, matchedTokens: 0, maximumScore: 0,
            bestCandidate: null as { matchedTokens: number; acousticScore: number; trailingBlanks: number; totalTokens: number } | null,
            decodedSteps: 0, result: 'pending' }
          trials.push(sample)
          const wave = speech[index]!, sampleRate = wave.readUInt32LE(24)
          const speaker = await Speaker.open({ device: { id: output.id }, sampleRate, channels: 1, dtype: 'int16' })
          let playbackDone = false, playbackFailed = false
          const playback = (async () => {
            try { await speaker.writeAsync(wave.subarray(44)); await speaker.drainAsync(); sample.playbackCompleted = true }
            catch { playbackFailed = true }
            finally { speaker.stop(); playbackDone = true }
          })()
          const deadline = Date.now() + 15000
          let tail = 0
          try {
            while (Date.now() < deadline && (!playbackDone || tail++ < 14)) {
              const current = await command({ type: 'read', sessionId })
              if (current.status !== 'testing') throw Error('raven_qa_wake_calibration_lost')
              const capture = current.input
              if (capture && capture.blocks > (baseline.input?.blocks ?? 0)) {
                sample.blocks = Math.max(sample.blocks, capture.blocks - (baseline.input?.blocks ?? 0))
                if ((capture.lastBlockAgeMs ?? Infinity) < 1000) sample.freshPolls++
                sample.peak = Math.max(sample.peak, capture.peak); sample.rms = Math.max(sample.rms, capture.rms)
                sample.detections = Math.max(sample.detections, current.detections - baseline.detections)
                sample.matchedTokens = Math.max(sample.matchedTokens, capture.detector?.matchedTokens ?? 0)
                sample.maximumScore = Math.max(sample.maximumScore, capture.detector?.acousticScore ?? 0)
                sample.decodedSteps = Math.max(sample.decodedSteps, (capture.detector?.decodedSteps ?? 0) - (baseline.input?.detector?.decodedSteps ?? 0))
                const candidate = capture.detector
                if (candidate && (!sample.bestCandidate || candidate.matchedTokens > sample.bestCandidate.matchedTokens
                  || candidate.matchedTokens === sample.bestCandidate.matchedTokens && candidate.acousticScore > sample.bestCandidate.acousticScore)) {
                  sample.bestCandidate = { matchedTokens: candidate.matchedTokens, acousticScore: candidate.acousticScore,
                    trailingBlanks: candidate.trailingBlanks, totalTokens: candidate.totalTokens }
                }
              }
              await delay(150)
            }
          } finally { speaker.stop() }
          if (!playbackDone) throw Error('raven_qa_physical_playback_timeout')
          await playback
          if (playbackFailed) throw Error('raven_qa_physical_playback_failed')
          sample.result = sample.blocks === 0 ? 'capture_stalled' : sample.peak === 0 ? 'capture_all_zero'
            : index === 0 ? sample.detections > 0 ? 'wake_detected' : 'signal_without_wake'
              : sample.detections === 0 ? 'negative_not_detected' : 'false_wake'
          input.onEvidence({ step: 'wake_diagnostic_trial', status: sample.result, item: `${route.name}/${output.name}/${sample.stimulus}` })
          await persist(false)
          await command({ type: 'stop', sessionId }); sessionId = null
        }
      }
    }
    speech.length = 0
    await persist(true)
    const positives = trials.filter(t => t.stimulus === 'wake_phrase')
    if (!positives.some(t => t.result === 'wake_detected')) throw Error('raven_qa_physical_wake_not_detected')
    if (trials.some(t => t.result === 'false_wake')) throw Error('raven_qa_physical_false_wake')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: 0, musicAnalyser: 'not_executed', visualCount: 0 }
  } finally {
    saveAudioPreferences(original)
    if (sessionId) await command({ type: 'stop', sessionId }).catch(() => {})
  }
}
