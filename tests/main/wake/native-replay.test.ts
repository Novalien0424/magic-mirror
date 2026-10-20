import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadWakeModelPackage } from '../../../src/main/wake/model-package'
import { createWakeWorkerPackage } from '../../../src/main/wake/runtime-config'
import { createConfiguredSherpaDetector, WAKE_MAX_ACTIVE_PATHS } from '../../../src/main/wake/sherpa-detector'

// Explicit Node/native replay only. The existing generated fixture is read-only;
// no Electron, microphone, provider, or retained PCM is involved.
describe.skipIf(process.env['MIRROR_WAKE_NATIVE_REPLAY'] !== '1')('one-thread native wake replay', () => {
  it('recognizes the synthetic package phrase and rejects silence and an unrelated tone at full search width', async () => {
    const packageId = 'sherpa-magic-mirror-mac-v1'
    const manifest = JSON.parse(await readFile(resolve('resources/wake-models', packageId, 'manifest.json'), 'utf8'))
    const wake = { phrase: manifest.phrase, modelVersion: manifest.modelVersion, packageId }
    const loaded = await loadWakeModelPackage({ rootDirectory: resolve('resources/wake-models'), wake, platform: 'darwin-arm64' })
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw Error(loaded.reason)
    const addon = require(resolve('resources/wake-native/darwin-arm64/addon.js')) as {
      readWave(file: string): { sampleRate: number; samples: Float32Array }
    }
    const audio = addon.readWave(resolve('.artifacts/sherpa-score-native-mac/synthetic-wake.wav'))
    expect(audio.sampleRate).toBe(16000)
    const positive = new Int16Array(audio.samples.length + 32_000)
    for (let i = 0; i < audio.samples.length; i++) positive[i] = Math.max(-32768, Math.min(32767, Math.round(audio.samples[i]! * 32768)))
    const silence = new Int16Array(64_000)
    const tone = Int16Array.from({ length: 64_000 }, (_, i) => Math.round(3276 * Math.sin(2 * Math.PI * 440 * i / 16000)))
    const counts: number[] = []
    try {
      for (const pcm of [positive, silence, tone]) {
        const detector = createConfiguredSherpaDetector(createWakeWorkerPackage(loaded, wake))
        let detections = 0
        try {
          for (let offset = 0; offset < pcm.length; offset += 1600) {
            if (detector.process(pcm.subarray(offset, offset + 1600)).status === 'detected') detections++
          }
        } finally { detector.close() }
        counts.push(detections)
      }
      expect(WAKE_MAX_ACTIVE_PATHS).toBe(32)
      expect(counts).toEqual([1, 0, 0])
      console.log(`NATIVE_WAKE_REPLAY threads=1 paths=${WAKE_MAX_ACTIVE_PATHS} positive=${counts[0]} silence=${counts[1]} tone=${counts[2]}`)
    } finally { audio.samples.fill(0); positive.fill(0); silence.fill(0); tone.fill(0) }
  })
})
