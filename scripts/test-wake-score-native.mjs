import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit synthetic fixture only. Never opens a microphone or saves audio.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const bundle = join(root, 'resources/wake-native/win32-x64')
const { KeywordSpotter } = require(join(bundle, 'keyword-spotter.js'))
const addon = require(join(bundle, 'addon.js'))
const model = resolve(process.argv[2] ?? 'resources/wake-models/sherpa-magic-mirror-win-v2')
const fixture = process.argv[3]
assert(fixture, 'Provide an existing synthetic 16 kHz wake WAV fixture')
const audio = addon.readWave(resolve(fixture))
assert.equal(audio.sampleRate, 16000)
const manifest = JSON.parse(await readFile(join(model, 'manifest.json'), 'utf8'))
const files = Object.fromEntries(manifest.artifacts.map(item => [item.role, join(model, item.file)]))
const temporary = await mkdtemp(join(tmpdir(), 'mm-wake-native-'))
const keywords = join(temporary, 'keywords.txt')
await writeFile(keywords, (await readFile(files.keywords, 'utf8')).split(/\r?\n/)
  .map(line => line.split(/\s+/).filter(token => !/^[:#]/.test(token)).join(' ')).join('\n'))
try {
  const positive = new Float32Array(audio.samples.length + 32000)
  positive.set(audio.samples)
  const repeated = new Float32Array(positive.length * 3)
  for (let i = 0; i < 3; i++) repeated.set(positive, i * positive.length)
  const cases = [
    { name: 'positive', pcm: positive, threshold: 0.18, chunk: 1600, expected: 1 },
    { name: 'below_threshold', pcm: positive, threshold: 1, chunk: 1600, expected: 0 },
    { name: 'coalesced_audio', pcm: positive, threshold: 0.18, chunk: positive.length, expected: 1 },
    { name: 'repeated', pcm: repeated, threshold: 0.18, chunk: 1600, expected: 3 },
    { name: 'silence', pcm: new Float32Array(64000), threshold: 0.18, chunk: 1600, expected: 0 },
  ]
  for (const item of cases) {
    const spotter = new KeywordSpotter({ featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: { transducer: { encoder: files.encoder, decoder: files.decoder, joiner: files.joiner },
        tokens: files.tokens, numThreads: 2, debug: 0, provider: 'cpu' },
      maxActivePaths: 4, numTrailingBlanks: 1, keywordsScore: 1, keywordsThreshold: item.threshold, keywordsFile: keywords })
    const stream = spotter.createStream()
    let detections = 0, partial = 0, complete = 0, fullScore = null
    for (let offset = 0; offset < item.pcm.length; offset += item.chunk) {
      stream.acceptWaveform({ samples: item.pcm.subarray(offset, offset + item.chunk), sampleRate: 16000 })
      while (spotter.isReady(stream)) {
        spotter.decode(stream)
        const result = spotter.getResult(stream)
        assert.equal(result.wake_score_version, 1)
        assert(Number.isFinite(result.acoustic_score) && result.acoustic_score >= 0 && result.acoustic_score <= 1)
        assert(result.matched_tokens >= 0 && result.matched_tokens <= result.keyword_tokens)
        if (result.matched_tokens > 0 && result.matched_tokens < result.keyword_tokens) partial++
        if (result.matched_tokens === result.keyword_tokens) { complete++; fullScore = result.acoustic_score }
        if (result.keyword) { detections++; spotter.reset(stream) }
      }
    }
    assert.equal(detections, item.expected, item.name)
    if (item.name !== 'silence') assert(partial > 0 && complete > 0, item.name)
    if (item.name === 'below_threshold') assert(fullScore > 0 && fullScore < 1)
    console.log(JSON.stringify({ case: item.name, status: 'passed', threshold: item.threshold,
      detections, partialMeasurements: partial, completeMeasurements: complete, fullScore }))
  }
} finally {
  await unlink(keywords)
  await rmdir(temporary)
}
