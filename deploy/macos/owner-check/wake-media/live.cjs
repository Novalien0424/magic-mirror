// Audible wake-during-media matrix (report docs/testing/second-audit-remaining-failures-2026-10-11.md §5).
// Opens the default microphone with the production capture options, plays the wake phrase from the
// Mac mini speaker over media beds, and runs the production detector. Microphone samples stay in RAM;
// only metadata JSON is written. Raven must be stopped (single microphone owner).
// Env: MM_REPO, MM_WAKE_WORK, MM_WAKE_OUT, optional MM_WAKE_MUSIC.  Args: cells (C0..C7, TVPROBE).
const { spawn, execFileSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
const { Microphone } = require(path.join(process.env.MM_REPO, 'node_modules/decibri'))
const { readWav, writeWav, rms, loudest, db } = require('./wav.cjs')
const W = process.env.MM_WAKE_WORK, R = process.env.MM_WAKE_OUT, A = path.join(W, 'audio')
const lib = require(path.join(W, 'lib.cjs'))
const PLAY = path.join(W, 'play'), MUSIC = musicFile()
const JABRA = 'Jabra Speak2 75', MINI = 'Mac mini Speakers', TV = 'T749-fHD720'
const SR = 16000
// Bed gains match Dormant playback: music loop 0.14, video loop 0.7; C5 is the video loop capped by -12 dB.
const CELLS = {
  C0: { bed: null }, C1: { bed: [JABRA, path.join(A, 'bed_silence.wav'), 1.0] },
  C2: { bed: [JABRA, path.join(A, 'bed_tone.wav'), 0.14] }, C3: { bed: [JABRA, MUSIC, 0.14] },
  C4: { bed: [JABRA, path.join(A, 'bed_speech.wav'), 0.7] }, C5: { bed: [JABRA, path.join(A, 'bed_speech.wav'), 0.175] },
  C6: { bed: null, mixed: true }, C7: { bed: [TV, path.join(A, 'bed_speech.wav'), 0.7] },
}
// Music bed: MM_WAKE_MUSIC, else a track from the shared media folder linked in the Console.
function musicFile() {
  if (process.env.MM_WAKE_MUSIC) return process.env.MM_WAKE_MUSIC
  try {
    const dir = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library/Application Support/magic-mirror/media-folders.json'), 'utf8')).links.shared
    const files = fs.readdirSync(dir).filter(f => /\.(mp3|m4a|aac|wav)$/i.test(f)).sort()
    return path.join(dir, files.includes('天使_intro.mp3') ? '天使_intro.mp3' : files[0])
  } catch { return '' }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function appRunning() { try { return execFileSync('pgrep', ['-f', 'magic-mirror/node_modules/electron']).toString().trim().length > 0 } catch { return false } }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
const r1 = (v) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10

// ---- capture state (RAM only) ----
let micStopped = false
let buf = new Float32Array(SR * 400), n = 0, lastT = 0, detector = null, dets = [], scores = [], backpressure = 0
function nowIdx() { return n + Math.max(0, Math.round((performance.now() - lastT) * SR / 1000)) }
function onBlock(chunk) {
  if (micStopped || !buf) return
  const s = new Int16Array(chunk.length / 2)
  for (let i = 0; i < s.length; i++) s[i] = chunk.readInt16LE(i * 2)
  if (n + s.length > buf.length) { const nb = new Float32Array(buf.length * 2); nb.set(buf.subarray(0, n)); buf = nb }
  for (let i = 0; i < s.length; i++) buf[n + i] = s[i] / 32768
  n += s.length; lastT = performance.now()
  if (detector) {
    const res = detector.process(s)
    const m = detector.measurement()
    if (m) scores.push({ idx: n, matched: m.matchedTokens, total: m.totalTokens, ac: m.acousticScore })
    if (res.status === 'detected') dets.push(n)
  }
}

const players = new Set()
function startPlayer(dev, file, gain, loop, maxS) {
  return new Promise((resolve, reject) => {
    const p = spawn(PLAY, [dev, file, String(gain), loop ? '1' : '0', String(maxS)], { stdio: ['ignore', 'pipe', 'pipe'] })
    players.add(p); p.once('exit', () => players.delete(p))
    let err = '', started = false
    p.stderr.on('data', d => { err += d })
    p.stdout.on('data', d => { if (!started && String(d).includes('PLAYING')) { started = true; resolve({ p, idx: nowIdx(), exited: new Promise(r => p.once('exit', r)) }) } })
    p.once('exit', (code) => { if (!started) reject(Error(`player_exit_${code}:${err.trim().slice(0, 80)}`)) })
  })
}

// 10 positives (two speaking rates) and 5 near-phrase negatives, shuffled per cell.
function trialPlan(cellName) {
  const rand = rng([...cellName].reduce((a, c) => a * 31 + c.charCodeAt(0), 7))
  const t = [...Array(5).fill('pos_r150'), ...Array(5).fill('pos_r200'), 'neg_other_r150', 'neg_busy_r150', 'neg_weather_r150', 'neg_other_r200', 'neg_busy_r200']
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [t[i], t[j]] = [t[j], t[i]] }
  return { t, rand }
}

// C6: the speech bed mixed digitally into each stimulus at C4's measured voice-to-bed ratio,
// played from the Mac mini speaker with the Jabra idle (separates masking from Jabra processing).
function buildMixed(id, ratioDb, rand, k) {
  const { x: s } = readWav(path.join(A, `${id}.wav`)), { x: bed } = readWav(path.join(A, 'bed_speech.wav'))
  const lead = 1.5 * SR, tail = 1.0 * SR, L = lead + s.length + tail
  const off = Math.floor(rand() * (bed.length - L - 1)); const seg = bed.subarray(off, off + L)
  const g = loudest(s) / (10 ** (ratioDb / 20) * rms(seg, lead, lead + s.length))
  const mix = new Float32Array(L); for (let i = 0; i < L; i++) mix[i] = g * seg[i] + (i >= lead && i < lead + s.length ? s[i - lead] : 0)
  let peak = 0; for (const v of mix) peak = Math.max(peak, Math.abs(v)); const norm = peak > 0.95 ? 0.95 / peak : 1
  for (let i = 0; i < L; i++) mix[i] *= norm
  const f = path.join(A, `mix_${k}_${id}.wav`); writeWav(f, mix)
  return { file: f, leadS: 1.5, inFileRatioDb: r1(db(loudest(s)) - db(g * rms(seg, lead, lead + s.length))), normDb: r1(db(norm)) }
}

async function runCell(name, pack, mic) {
  if (appRunning()) throw Error('APP_RUNNING')
  const cfg = CELLS[name], stimMeta = JSON.parse(fs.readFileSync(path.join(R, 'stimuli.json'))).stimuli
  const out = { cell: name, bed: cfg.bed ? { device: cfg.bed[0], file: path.basename(cfg.bed[1]), gain: cfg.bed[2] } : null, trials: [], startedAt: new Date().toISOString() }
  let ratioDb = null
  if (cfg.mixed) {
    const c4 = JSON.parse(fs.readFileSync(path.join(R, 'cell_C4.json')))
    ratioDb = c4.summary.medianVoiceToBedDb; out.mixRatioDb = ratioDb
  }
  const ov0 = mic.overrunCount, bp0 = backpressure
  let bedP = null
  if (cfg.bed) { bedP = await startPlayer(cfg.bed[0], cfg.bed[1], cfg.bed[2], true, 600); await sleep(3000) } else await sleep(1500)
  detector = lib.createDetector(pack)
  const { t, rand } = trialPlan(name)
  try {
    for (let k = 0; k < t.length; k++) {
      if (appRunning()) throw Error('APP_RUNNING')
      const id = t[k]; let file = path.join(A, `${id}.wav`), leadS = 0, mixInfo = null
      if (cfg.mixed) { mixInfo = buildMixed(id, ratioDb, rand, k); file = mixInfo.file; leadS = mixInfo.leadS }
      detector.reset()
      const st = await startPlayer(MINI, file, 1.0, false, 10)
      await st.exited; await sleep(2500)
      const end = nowIdx(), p0 = st.idx, s0 = p0 + Math.round(leadS * SR), dur = Math.round(stimMeta[id].durS * SR)
      const bedA = cfg.mixed ? p0 + Math.round(0.2 * SR) : p0 - Math.round(1.1 * SR), bedZ = cfg.mixed ? s0 - Math.round(0.1 * SR) : p0 - Math.round(0.1 * SR)
      const stimRms = loudest(buf, s0, Math.min(n, s0 + dur + Math.round(0.7 * SR))), bedRms = rms(buf, Math.max(0, bedA), bedZ)
      const voice = Math.sqrt(Math.max(stimRms ** 2 - bedRms ** 2, 1e-12))
      const hit = dets.filter(d => d >= s0 && d <= end)
      const sc = scores.filter(x => x.idx >= s0 && x.idx <= end).sort((a, b) => b.matched - a.matched || b.ac - a.ac)[0]
      out.trials.push({ k, id, kind: id.startsWith('pos') ? 'pos' : 'neg', detected: hit.length > 0, detections: hit.length,
        latencyS: hit.length ? Math.round((hit[0] - s0) / SR * 100) / 100 : null, stimLoud500Db: r1(db(stimRms)), bedDb: r1(db(bedRms)),
        voiceEstDb: r1(db(voice)), voiceToBedDb: r1(db(voice) - db(bedRms)), bestTokens: sc ? `${sc.matched}/${sc.total}` : null,
        bestAcoustic: sc ? Math.round(sc.ac * 1000) / 1000 : null, ...(mixInfo ? { inFileRatioDb: mixInfo.inFileRatioDb, mixNormDb: mixInfo.normDb } : {}) })
      if (mixInfo) fs.unlinkSync(mixInfo.file)
      process.stdout.write(`  ${name} ${String(k + 1).padStart(2)}/${t.length} ${id.padEnd(16)} ${hit.length ? 'WAKE' : '-   '}\n`)
    }
  } finally {
    if (bedP) { bedP.p.kill('SIGTERM'); await bedP.exited }
    detector.close(); detector = null
  }
  const pos = out.trials.filter(x => x.kind === 'pos'), neg = out.trials.filter(x => x.kind === 'neg')
  out.summary = { posDetected: pos.filter(x => x.detected).length, posTotal: pos.length, falseWakes: neg.filter(x => x.detected).length, negTotal: neg.length,
    medianStimDb: r1(median(out.trials.map(x => x.stimLoud500Db))), medianBedDb: r1(median(out.trials.map(x => x.bedDb))),
    medianVoiceEstDb: r1(median(out.trials.map(x => x.voiceEstDb))), medianVoiceToBedDb: r1(median(out.trials.map(x => x.voiceToBedDb))),
    overruns: mic.overrunCount - ov0, backpressure: backpressure - bp0, trials: out.trials.length }
  out.endedAt = new Date().toISOString()
  fs.writeFileSync(path.join(R, `cell_${name}.json`), JSON.stringify(out, null, 1))
  console.log(`${name}: wake ${out.summary.posDetected}/${out.summary.posTotal}, false wakes ${out.summary.falseWakes}/${out.summary.negTotal}, voice-to-bed ${out.summary.medianVoiceToBedDb} dB`)
  buf.fill(0, 0, n); n = 0; dets = []; scores = []
}

function goertzelDb(x, a, z, hz) { // tone power relative to full scale, in dB
  const w = 2 * Math.PI * hz / SR, c = 2 * Math.cos(w); let s1 = 0, s2 = 0
  for (let i = a; i < z; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0 }
  const p = s1 * s1 + s2 * s2 - c * s1 * s2; return db(Math.sqrt(2 * p) / (z - a))
}
// Does the TV emit HDMI audio? 1 kHz tone on the TV vs quiet, with a Mac-speaker control.
async function tvProbe(mic) {
  if (appRunning()) throw Error('APP_RUNNING')
  await sleep(3500); const q0 = n - 3 * SR
  const quiet = { rmsDb: r1(db(rms(buf, q0, n))), tone1kDb: r1(goertzelDb(buf, q0, n, 1000)) }
  const p = await startPlayer(TV, path.join(A, 'tone1k.wav'), 1.0, true, 4)
  await sleep(500); const a = nowIdx(); await sleep(3000); const z = Math.min(n, nowIdx())
  const tone = { rmsDb: r1(db(rms(buf, a, z))), tone1kDb: r1(goertzelDb(buf, a, z, 1000)) }
  p.p.kill('SIGTERM'); await p.exited
  await sleep(1500)
  const p2 = await startPlayer(MINI, path.join(A, 'tone1k.wav'), 0.1, true, 3)
  await sleep(500); const b = nowIdx(); await sleep(2000); const y = Math.min(n, nowIdx())
  const ctrl = { rmsDb: r1(db(rms(buf, b, y))), tone1kDb: r1(goertzelDb(buf, b, y, 1000)) }
  p2.p.kill('SIGTERM'); await p2.exited
  const out = { quiet, tvTone: tone, miniToneGain0p1: ctrl, tvDeltaRmsDb: r1(tone.rmsDb - quiet.rmsDb), tvDelta1kDb: r1(tone.tone1kDb - quiet.tone1kDb), overruns: mic.overrunCount }
  fs.writeFileSync(path.join(R, 'tv_probe.json'), JSON.stringify(out, null, 1))
  console.log(`TVPROBE: TV 1 kHz tone ${out.tvDelta1kDb >= 6 ? 'HEARD' : 'not heard'} (+${out.tvDelta1kDb} dB over quiet)`)
  buf.fill(0, 0, n); n = 0
  return out
}

;(async () => {
  const cells = process.argv.slice(2)
  if (appRunning()) { console.error('ABORT: Raven is running'); process.exit(3) }
  const pack = await lib.loadPackage(process.env.MM_REPO, path.join(W, 'kw'))
  // Production capture options (src/main/wake/capture.ts); empty input label = system default device.
  const mic = await Microphone.open({ sampleRate: 16_000, channels: 1, framesPerBuffer: 1_600, dtype: 'int16', vad: false, dcRemoval: true, highpass: 80 })
  mic.on('backpressure', () => { backpressure++ })
  mic.on('error', (e) => { console.error('MIC_ERROR', e && e.code); process.exitCode = 4 })
  mic.on('data', onBlock)
  const t0 = Date.now()
  let tv = null
  // macOS hands an unauthorized process digital zeros. Wait for real input before playing anything.
  console.log('Checking microphone access. If macOS asks to let your terminal use the microphone, click Allow.')
  let peak = 0
  for (let waited = 0; waited < 30_000 && peak === 0; waited += 500) {
    await sleep(500); for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]))
  }
  if (n === 0 || peak === 0) {
    console.error('ABORT: the microphone returns silence. Enable your terminal app in System Settings > Privacy & Security > Microphone, quit and reopen it, then rerun.')
    micStopped = true; mic.stop(); process.exit(5)
  }
  buf.fill(0, 0, n); n = 0
  try {
    for (const c of cells) {
      if (c === 'TVPROBE') { tv = await tvProbe(mic); continue }
      if (c === 'C3' && !fs.existsSync(MUSIC)) { console.log('C3: skipped (music file not found)'); continue }
      if (c === 'C7' && !(tv && tv.tvDelta1kDb >= 6)) { console.log('C7: skipped (TV emits no audible HDMI audio)'); continue }
      await runCell(c, pack, mic)
    }
  } catch (e) { console.error('ERR', e.message); process.exitCode = 2 }
  finally {
    for (const p of players) p.kill('SIGTERM')
    const stats = { overruns: mic.overrunCount, backpressure, wallS: Math.round((Date.now() - t0) / 1000) }
    micStopped = true; mic.stop(); buf = null
    fs.writeFileSync(path.join(R, 'capture_stats.json'), JSON.stringify(stats))
    setTimeout(() => process.exit(), 300)
  }
})()
