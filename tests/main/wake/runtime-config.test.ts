import { describe, expect, it } from 'vitest'
import { createWakeWorkerPackage, wakeTuningIsActive } from '../../../src/main/wake/runtime-config'

const loaded = {
  ok: true as const,
  manifest: {
    schemaVersion: 1 as const,
    packageId: 'magic-mirror-zh-test-v1',
    engine: 'sherpa' as const,
    engineVersion: '1.13.6',
    modelVersion: 'test-v1',
    phrase: '魔鏡阿魔鏡',
    locale: 'zh-CN' as const,
    platform: 'win32-x64',
    artifacts: [],
    tuning: { sampleRateHz: 16_000 as const, threshold: 0.45, score: 1, numTrailingBlanks: 1 },
    provenance: { method: 'sherpa-text2token' as const, sourceId: 'fixture', createdAt: '2026-09-15T00:00:00.000Z' },
    corpusResultId: 'not-evaluated',
  },
  directory: 'fixture',
  artifactPaths: new Map([['keywords', 'fixture/keywords.txt']]),
}

describe('wake tuning activation', () => {
  it('uses package defaults when tuning is disabled or absent', () => {
    expect(wakeTuningIsActive({ phrase: '魔鏡阿魔鏡', packageId: 'magic-mirror-zh-test-v1', modelVersion: 'test-v1' })).toBe(false)
    expect(createWakeWorkerPackage(loaded, { phrase: '魔鏡阿魔鏡', packageId: 'magic-mirror-zh-test-v1', modelVersion: 'test-v1' }).tuning)
      .toEqual({ threshold: 0.45, score: 1, numTrailingBlanks: 1 })
  })

  it('applies only enabled, exact-phrase overrides to the worker payload', () => {
    const wake = {
      phrase: '你好小蓮', packageId: 'magic-mirror-zh-test-v1', modelVersion: 'test-v1',
      tuning: { phrase: '你好小蓮', enabled: true, threshold: 0.32, numTrailingBlanks: 2 },
    }
    expect(wakeTuningIsActive(wake)).toBe(true)
    expect(createWakeWorkerPackage(loaded, wake).tuning).toEqual({ threshold: 0.32, score: 1, numTrailingBlanks: 2 })
    expect(createWakeWorkerPackage(loaded, { ...wake, tuning: { ...wake.tuning, phrase: '另一個詞' } }).tuning)
      .toEqual({ threshold: 0.45, score: 1, numTrailingBlanks: 1 })
    expect(createWakeWorkerPackage(loaded, { ...wake, tuning: { ...wake.tuning, enabled: false } }).tuning)
      .toEqual({ threshold: 0.45, score: 1, numTrailingBlanks: 1 })
  })
})
