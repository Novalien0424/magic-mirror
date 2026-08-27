import { describe, expect, it } from 'vitest'
import { parseWakeWorkerCommand, parseWakeWorkerOutcome } from '../../../src/main/wake/protocol'

const initialization = {
  type: 'initialize',
  requestId: 'request-1',
  package: {
    packageId: 'magic-mirror-zh-test-v1',
    engine: 'sherpa',
    engineVersion: '1.13.6',
    modelVersion: 'test-v1',
    phrase: '魔鏡阿魔鏡',
    sampleRateHz: 16_000,
    artifactPaths: {
      encoder: 'fixture/encoder.onnx',
      decoder: 'fixture/decoder.onnx',
      joiner: 'fixture/joiner.onnx',
      tokens: 'fixture/tokens.txt',
      keywords: 'fixture/keywords.txt',
    },
    tuning: { threshold: 0.25, score: 1.5 },
  },
}

describe('wake worker protocol', () => {
  it('accepts bounded commands and outcomes without audio or transcript payloads', () => {
    expect(parseWakeWorkerCommand(initialization)).toEqual({ ok: true, value: initialization })
    expect(parseWakeWorkerCommand({ type: 'acquire_microphone', requestId: 'request-2' }).ok).toBe(true)
    expect(parseWakeWorkerCommand({ type: 'release_microphone', requestId: 'request-3' }).ok).toBe(true)
    expect(parseWakeWorkerCommand({ type: 'shutdown', requestId: 'request-4' }).ok).toBe(true)
    expect(parseWakeWorkerOutcome({
      type: 'wake_detected',
      packageId: 'magic-mirror-zh-test-v1',
      modelVersion: 'test-v1',
    }).ok).toBe(true)
  })

  it.each([
    null,
    { type: 'acquire_microphone', requestId: '../escape' },
    { ...initialization, audio: [1, 2, 3] },
    { ...initialization, package: { ...initialization.package, engine: 'fallback' } },
    { type: 'failed', reason: 'raw provider error with spaces' },
    { type: 'wake_detected', transcript: 'private speech' },
  ])('rejects malformed or content-bearing messages', (message) => {
    const command = parseWakeWorkerCommand(message)
    const outcome = parseWakeWorkerOutcome(message)
    expect(command.ok || outcome.ok).toBe(false)
    expect(JSON.stringify(command)).not.toContain('private speech')
    expect(JSON.stringify(outcome)).not.toContain('private speech')
  })
})
