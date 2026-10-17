// Generates synthetic stimuli and media beds with macOS `say` (written to files,
// never played), then checks them offline with the production detector.
// Env: MM_REPO, MM_WAKE_WORK (audio, keyword file, lib.cjs), MM_WAKE_OUT (metadata JSON).
const { execFileSync } = require('child_process')
const fs = require('fs'), path = require('path')
const { readWav, writeWav, rms, loudest, db } = require('./wav.cjs')
const W = process.env.MM_WAKE_WORK, R = process.env.MM_WAKE_OUT, A = path.join(W, 'audio')
const lib = require(path.join(W, 'lib.cjs'))
const say = (voice, rate, text, out) => execFileSync('say', ['-v', voice, ...(rate ? ['-r', String(rate)] : []),
  '--file-format=WAVE', '--data-format=LEI16@16000', '-o', out, text])

const zh = ['今天我們來聊一聊城市裡的咖啡文化，很多人每天早上都會先去巷口的小店買一杯拿鐵，再搭捷運去上班。',
  '這家店的老闆說，好的咖啡豆要放在陰涼的地方保存，研磨之後最好在十五分鐘之內沖煮完畢。',
  '接下來為大家介紹週末的天氣，北部地區午後可能有短暫陣雨，出門記得帶把傘。']
const en = ['Welcome back to the channel. Today we are reviewing three budget headphones and comparing their battery life.',
  'The second model surprised us with clear vocals, although the bass felt a little thin on electronic music.',
  'If you enjoyed this video, please remember to subscribe and leave a comment below.']

;(async () => {
  fs.mkdirSync(A, { recursive: true })
  const pack = await lib.loadPackage(process.env.MM_REPO, path.join(W, 'kw'))
  const stimuli = [
    ['pos_r150', 'pos', 150, pack.phrase], ['pos_r200', 'pos', 200, pack.phrase],
    ['neg_other_r150', 'neg', 150, '有請其他大人'], ['neg_busy_r150', 'neg', 150, '渡鴉大人今天很忙'],
    ['neg_weather_r150', 'neg', 150, '今天的天氣很好'], ['neg_other_r200', 'neg', 200, '有請其他大人'],
    ['neg_busy_r200', 'neg', 200, '渡鴉大人今天很忙'],
  ]
  const meta = { phrase: pack.phrase, stimuli: {}, beds: {} }
  for (const [id, kind, r, text] of stimuli) {
    const f = path.join(A, `${id}.wav`); say('Meijia', r, text, f)
    const { x } = readWav(f); meta.stimuli[id] = { kind, rate: r, durS: +(x.length / 16000).toFixed(3), rmsDb: +db(rms(x)).toFixed(1), loud500Db: +db(loudest(x)).toFixed(1) }
  }
  // Spoken-media bed: alternate zh (Tingting) / en (Samantha) until >= 60 s.
  const parts = []; let n = 0, k = 0
  while (n < 60 * 16000) {
    const f = path.join(A, `tmp_${k}.wav`)
    if (k % 2 === 0) say('Tingting', 0, zh[(k / 2) % zh.length], f); else say('Samantha', 0, en[((k - 1) / 2) % en.length], f)
    const { x } = readWav(f); fs.unlinkSync(f); parts.push(x, new Float32Array(4000)); n += x.length + 4000; k++
  }
  const bed = new Float32Array(60 * 16000); let o = 0
  for (const p of parts) { const m = Math.min(p.length, bed.length - o); bed.set(p.subarray(0, m), o); o += m; if (o >= bed.length) break }
  meta.beds.speech = { durS: 60, clip: writeWav(path.join(A, 'bed_speech.wav'), bed), rmsDb: +db(rms(bed)).toFixed(1), voices: 'Tingting zh_CN + Samantha en_US' }
  // The earlier QA "loud media": 330 Hz sine.
  const tone = Float32Array.from({ length: 160000 }, (_, i) => 0.0754 * Math.SQRT2 * Math.sin(2 * Math.PI * 330 * i / 16000))
  meta.beds.tone = { clip: writeWav(path.join(A, 'bed_tone.wav'), tone), rmsDb: +db(rms(tone)).toFixed(2) }
  writeWav(path.join(A, 'bed_silence.wav'), new Float32Array(160000)); meta.beds.silence = { rmsDb: null }
  const t1k = Float32Array.from({ length: 160000 }, (_, i) => 0.25 * Math.sin(2 * Math.PI * 1000 * i / 16000))
  writeWav(path.join(A, 'tone1k.wav'), t1k); meta.beds.tone1k = { rmsDb: +db(rms(t1k)).toFixed(1) }

  // Offline sanity: 1 s lead, 3 s tail. Positives must detect once, negatives never.
  meta.tuning = { threshold: pack.tuning.threshold, score: pack.tuning.score, numTrailingBlanks: pack.tuning.numTrailingBlanks, paths: lib.paths }
  const runDet = (x) => { const d = lib.createDetector(pack); const pcm = Int16Array.from(x, v => Math.max(-32768, Math.min(32767, Math.round(v * 32768)))); let c = 0
    try { for (let i = 0; i < pcm.length; i += 1600) if (d.process(pcm.subarray(i, i + 1600)).status === 'detected') c++ } finally { d.close() } return c }
  const padded = (x, g = 1) => { const p = new Float32Array(16000 + x.length + 48000); p.set(g === 1 ? x : x.map(v => v * g), 16000); return p }
  meta.offline = {}
  for (const [id] of stimuli) meta.offline[id] = runDet(padded(readWav(path.join(A, `${id}.wav`)).x))
  for (const [id] of stimuli.filter(s => s[1] === 'pos')) meta.offline[`${id}@-20dB`] = runDet(padded(readWav(path.join(A, `${id}.wav`)).x, 0.1))
  meta.offline.bed_speech_alone = runDet(bed)
  fs.writeFileSync(path.join(R, 'stimuli.json'), JSON.stringify(meta, null, 1))
  const ok = stimuli.every(([id, kind]) => meta.offline[id] === (kind === 'pos' ? 1 : 0)) && meta.offline.bed_speech_alone === 0
  console.log(`offline sanity ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(meta.offline)}`)
  if (!ok) process.exit(6)
})().catch(e => { console.error('ERR', e.stack); process.exit(1) })
