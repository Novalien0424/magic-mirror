import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadWakeModelPackage, validateWakeModelPackage } from '../../../src/main/wake/model-package'

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
  it('derives a custom keyword only after verifying the original model and token artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mirror-keyword-test-'))
    try {
      const files = { 'model.onnx': artifact, 'tokens.txt': Buffer.from('n 1\nǐ 2\nh 3\nǎo 4\n'), 'keywords.txt': Buffer.from('original') }
      const spec = manifest({ artifacts: Object.entries(files).map(([file, contents]) => ({
        role: file === 'model.onnx' ? 'model' : file === 'tokens.txt' ? 'tokens' : 'keywords', file,
        sha256: createHash('sha256').update(contents).digest('hex'),
      })) })
      const directory = join(root, spec.packageId)
      await mkdir(directory)
      for (const [file, contents] of Object.entries(files)) await writeFile(join(directory, file), contents)
      await writeFile(join(directory, 'manifest.json'), JSON.stringify(spec))
      const input = { rootDirectory: root, platform: 'darwin-arm64', customKeywordsDirectory: join(root, 'derived'),
        wake: { phrase: '你好', packageId: spec.packageId, modelVersion: spec.modelVersion } }
      const result = await loadWakeModelPackage(input)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.reason)
      expect(await readFile(result.artifactPaths.get('keywords')!, 'utf8')).toBe('n ǐ h ǎo @avatar_wake\n')
      expect(result.manifest.phrase).toBe('魔鏡阿魔鏡')
      expect(await readFile(join(directory, 'keywords.txt'), 'utf8')).toBe('original')
      await writeFile(join(directory, 'model.onnx'), 'corrupted')
      expect(await loadWakeModelPackage(input)).toEqual({ ok: false, reason: 'wake_package_hash_mismatch' })
    } finally { await rm(root, { recursive: true, force: true }) }
  })

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

  it('derives the default phrase when per-avatar tuning is enabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mirror-keyword-tuning-test-'))
    try {
      const files = {
        'model.onnx': artifact,
        'tokens.txt': Buffer.from('n 1\nǐ 2\nh 3\nǎo 4\n'),
        'keywords.txt': Buffer.from('n ǐ h ǎo :1.0 #0.45 @avatar_wake\n'),
      }
      const spec = manifest({ phrase: '你好', artifacts: Object.entries(files).map(([file, contents]) => ({
        role: file === 'model.onnx' ? 'model' : file === 'tokens.txt' ? 'tokens' : 'keywords', file,
        sha256: createHash('sha256').update(contents).digest('hex'),
      })) })
      const directory = join(root, spec.packageId)
      await mkdir(directory)
      for (const [file, contents] of Object.entries(files)) await writeFile(join(directory, file), contents)
      await writeFile(join(directory, 'manifest.json'), JSON.stringify(spec))
      const result = await loadWakeModelPackage({
        rootDirectory: root,
        platform: 'darwin-arm64',
        customKeywordsDirectory: join(root, 'derived'),
        forceCustomKeywords: true,
        wake: { phrase: '你好', packageId: spec.packageId, modelVersion: spec.modelVersion },
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.reason)
      expect(await readFile(result.artifactPaths.get('keywords')!, 'utf8')).toBe('n ǐ h ǎo @avatar_wake\n')
      expect(result.artifactPaths.get('keywords')).not.toBe(join(directory, 'keywords.txt'))
    } finally { await rm(root, { recursive: true, force: true }) }
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
