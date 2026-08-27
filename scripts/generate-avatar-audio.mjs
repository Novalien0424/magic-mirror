import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SAMPLE_RATE = 44_100
const OUTPUT = resolve('resources/generated/audio')

function pcm16Wave(seconds, sampleAt) {
  const sampleCount = Math.floor(seconds * SAMPLE_RATE)
  const dataBytes = sampleCount * 2
  const wav = Buffer.alloc(44 + dataBytes)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataBytes, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(SAMPLE_RATE, 24)
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataBytes, 40)
  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.max(-1, Math.min(1, sampleAt(index / SAMPLE_RATE)))
    wav.writeInt16LE(Math.round(value * 32767), 44 + index * 2)
  }
  return wav
}

function recordedOutput(time) {
  const syllable = Math.floor(time / 0.34)
  const local = time % 0.34
  if (syllable >= 11 || local >= 0.24) return 0
  const envelope = Math.sin(Math.PI * local / 0.24) ** 0.7
  const fundamental = 150 + (syllable % 4) * 22
  return envelope * (
    Math.sin(2 * Math.PI * fundamental * time) * 0.22
    + Math.sin(2 * Math.PI * fundamental * 2.15 * time) * 0.12
    + Math.sin(2 * Math.PI * fundamental * 3.9 * time) * 0.06
  )
}

const CHORDS = [
  [220, 277.18, 329.63],
  [196, 246.94, 329.63],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66],
]

function music(time) {
  const chord = CHORDS[Math.floor(time / 2) % CHORDS.length]
  const pulse = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.5 * time) ** 2
  return chord.reduce((sum, frequency, index) => (
    sum + Math.sin(2 * Math.PI * frequency * time + index * 0.7) * 0.07
  ), 0) * pulse
}

async function writeFileIfChanged(path, bytes) {
  try {
    if ((await readFile(path)).equals(bytes)) return
  } catch {
    // Missing or unreadable output is replaced by the deterministic fixture.
  }
  await writeFile(path, bytes)
}

await mkdir(OUTPUT, { recursive: true })
await Promise.all([
  writeFileIfChanged(resolve(OUTPUT, 'recorded-ai-test.wav'), pcm16Wave(4.2, recordedOutput)),
  writeFileIfChanged(resolve(OUTPUT, 'test-music.wav'), pcm16Wave(12, music)),
])
process.stdout.write('[audio] generated recorded-output and music fixtures\n')
