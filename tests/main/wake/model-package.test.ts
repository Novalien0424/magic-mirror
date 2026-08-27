import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { validateWakeModelPackage } from '../../../src/main/wake/model-package'

const artifact = Buffer.from('deterministic-wake-model-fixture', 'utf8')

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    packageId: 'magic-mirror-zh-test-v1',
    engine: 'sherpa',
    engineVersion: '1.13.6',
    modelVersion: 'test-v1',
    phrase: '魔鏡阿魔鏡',
    locale: 'zh-CN',
    platform: 'darwin-arm64',
    artifacts: [{
      role: 'model',
      file: 'model.onnx',
      sha256: createHash('sha256').update(artifact).digest('hex'),
    }],
    tuning: {
      sampleRateHz: 16_000,
      threshold: 0.25,
      score: 1.5,
    },
    provenance: {
      method: 'sherpa-text2token',
      sourceId: 'fixture-source-v1',
      createdAt: '2026-08-27T00:00:00.000Z',
    },
    corpusResultId: 'not-evaluated',
    ...overrides,
  }
}

describe('wake model package', () => {
  it('accepts a hand-hashed replaceable package matching config and target platform', () => {
    const result = validateWakeModelPackage({
      manifest: manifest(),
      wake: {
        phrase: '魔鏡阿魔鏡',
        modelVersion: 'test-v1',
        packageId: 'magic-mirror-zh-test-v1',
      },
      platform: 'darwin-arm64',
      artifacts: new Map([['model.onnx', artifact]]),
    })

    expect(result.ok).toBe(true)
  })

  it('keeps sherpa trailing-blank tuning inside the immutable package', () => {
    const result = validateWakeModelPackage({
      manifest: manifest({
        tuning: {
          sampleRateHz: 16_000,
          threshold: 0.45,
          score: 1,
          numTrailingBlanks: 2,
        },
      }),
      wake: {
        phrase: '魔鏡阿魔鏡',
        modelVersion: 'test-v1',
        packageId: 'magic-mirror-zh-test-v1',
      },
      platform: 'darwin-arm64',
      artifacts: new Map([['model.onnx', artifact]]),
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest.tuning.numTrailingBlanks).toBe(2)
  })

  it.each([
    ['wake_package_phrase_mismatch', { phrase: '魔鏡啊魔鏡' }],
    ['wake_package_platform_mismatch', { platform: 'win32-x64' }],
    ['wake_package_hash_mismatch', {
      artifacts: [{ role: 'model', file: 'model.onnx', sha256: '0'.repeat(64) }],
    }],
  ])('rejects %s without raw artifact data', (reason, overrides) => {
    const result = validateWakeModelPackage({
      manifest: manifest(overrides),
      wake: {
        phrase: '魔鏡阿魔鏡',
        modelVersion: 'test-v1',
        packageId: 'magic-mirror-zh-test-v1',
      },
      platform: 'darwin-arm64',
      artifacts: new Map([['model.onnx', artifact]]),
    })

    expect(result).toEqual({ ok: false, reason })
    expect(JSON.stringify(result)).not.toContain(artifact.toString('utf8'))
  })
})
