const fs = require('fs')
// Minimal 16-bit PCM WAV reader/writer (mono or first channel).
function readWav(file) {
  const b = fs.readFileSync(file)
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw Error('not riff')
  let o = 12, fmt = null, data = null
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4)
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }
    if (id === 'data') data = b.subarray(o + 8, o + 8 + sz)
    o += 8 + sz + (sz & 1)
  }
  if (!fmt || !data || fmt.bits !== 16) throw Error('unsupported wav')
  const n = data.length / 2 / fmt.ch, x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768
  return { rate: fmt.rate, x }
}
function writeWav(file, x, rate = 16000) {
  const b = Buffer.alloc(44 + x.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  let clip = 0
  for (let i = 0; i < x.length; i++) { let v = Math.round(x[i] * 32768); if (v > 32767) { v = 32767; clip++ } if (v < -32768) { v = -32768; clip++ } b.writeInt16LE(v, 44 + i * 2) }
  fs.writeFileSync(file, b)
  return clip
}
const rms = (x, a = 0, z = x.length) => { let s = 0; for (let i = a; i < z; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, z - a)) }
// Loudest window RMS (default 500 ms at 16 kHz), hop 10 ms.
function loudest(x, a = 0, z = x.length, win = 8000, hop = 160) {
  let best = 0
  if (z - a < win) return rms(x, a, z)
  for (let s = a; s + win <= z; s += hop) { const r = rms(x, s, s + win); if (r > best) best = r }
  return best
}
const db = (v) => 20 * Math.log10(Math.max(v, 1e-9))
module.exports = { readWav, writeWav, rms, loudest, db }
