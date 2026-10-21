import { describe, expect, it } from 'vitest'
import { cameraSampleMetrics } from '../../../src/main/camera/availability-metrics'
import { parseCameraQaRateProbe, parseCameraQaSample } from '../../../src/main/camera/tracker'

const sample = { type: 'qa_sample', sequence: 1, sourceSeconds: 1, width: 1280, height: 720,
  inputWidth: 1280, inputHeight: 720, pixelFormat: 875704438, inputPixelFormat: 846624121, frameDurationSeconds: 1 / 15 }
describe('camera availability measurement', () => {
  it('keeps rate API exceptions numeric and rejects private or malformed probe fields', () => {
    const probe = { type: 'qa_rate_probe', fps: 1, advertised: 0, minimumResult: 1, maximumResult: 1,
      restoreResult: 0, minimumSeconds: 0.2, maximumSeconds: 0.2 }
    expect(parseCameraQaRateProbe(probe)).toMatchObject({ fps: 1, minimumResult: 1 })
    for (const change of [{ exception: 'private message' }, { fps: 3 }, { advertised: true }, { minimumResult: 3 },
      { maximumSeconds: NaN }, { minimumSeconds: -1 }]) expect(parseCameraQaRateProbe({ ...probe, ...change })).toBeNull()
  })
  it('accepts only finite numeric metadata with an exact schema', () => {
    expect(parseCameraQaSample(sample)?.width).toBe(1280)
    for (const change of [{ privateContext: 'no' }, { dataUrl: 'no' }, { width: 0 }, { sourceSeconds: NaN },
      { frameDurationSeconds: 0 }, { inputWidth: 10000 }, { sequence: 0.5 }]) {
      expect(parseCameraQaSample({ ...sample, ...change })).toBeNull()
    }
  })
  it('measures native samples rather than throttled heartbeat receipts', () => {
    const metrics = cameraSampleMetrics(5000, 30000)
    for (let i = 0; i <= 525; i++) metrics.add({ ...sample, sequence: i + 1, sourceSeconds: 10 + i / 15 }, i * 1000 / 15)
    const result = metrics.result(35000)
    expect(result.deliveredFps).toBeCloseTo(15)
    expect(result.windows).toHaveLength(6)
    expect(result.windows.every(n => n >= 74)).toBe(true)
    expect(result.maxSourceGapMs).toBeCloseTo(1000 / 15)
    expect(result.formats).toHaveLength(1)
  })
  it('retains empty windows, stale timestamps, changed formats and the trailing stall', () => {
    const metrics = cameraSampleMetrics(5000, 30000)
    metrics.add(sample, 1000); metrics.add(sample, 1100)
    metrics.add({ ...sample, sourceSeconds: 3, width: 640 }, 3000)
    expect(metrics.result(35000)).toMatchObject({ staleSamples: 1, windows: [0, 0, 0, 0, 0, 0],
      maxSourceGapMs: 2000, maxReceiptGapMs: 30000 })
    expect(metrics.result(35000).formats).toHaveLength(2)
  })
  it('does not count JSON key ordering as a format change', () => {
    const metrics = cameraSampleMetrics(0, 5000)
    const parsed = parseCameraQaSample(sample)!
    metrics.add(parsed, 0)
    metrics.add(Object.fromEntries(Object.entries(parsed).reverse()) as typeof parsed, 50)
    expect(metrics.result(100).formats).toHaveLength(1)
  })
})
