import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../deploy/macos/camera-tracker.swift', import.meta.url), 'utf8')

describe.skipIf(process.platform !== 'darwin')('native camera source freshness', () => {
  it('rejects repeated, backwards and invalid source times in production and QA before counting a frame', () => {
    const callback = source.slice(source.indexOf('func captureOutput(_ output: AVCaptureOutput, didOutput'))
    const start = callback.indexOf('let sourceTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)')
    const end = callback.indexOf('if qaObserve, let pixels', start)
    const gate = callback.slice(start, end)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeLessThan(callback.indexOf('lastFrame = now'))
    expect(callback.slice(0, start)).not.toContain('if qaDeliveryOnly || qaObserve')
    expect(source).toContain('lastSourceTime = .invalid')
    // Execute the actual native gate with CoreMedia timestamps, without opening a device.
    const result = spawnSync('xcrun', ['swift', '-e', `
import CoreMedia
var lastSourceTime = CMTime.invalid
var qaDeliveryOnly = false, qaObserve = false
var accepted = 0
var reasons: [String] = []
func status(_ reason: String) { reasons.append(reason) }
func CMSampleBufferGetPresentationTimeStamp(_ time: CMTime) -> CMTime { time }
func receive(_ sampleBuffer: CMTime) {
${gate}
  accepted += 1
}
for mode in 0...2 {
  qaDeliveryOnly = mode == 1; qaObserve = mode == 2
  lastSourceTime = .invalid; accepted = 0; reasons = []
  for time in [CMTime.invalid, .indefinite, .positiveInfinity, .negativeInfinity,
    CMTime(value: 0, timescale: 30), CMTime(value: 0, timescale: 30),
    CMTime(value: -1, timescale: 30), CMTime(value: 1, timescale: 30)] { receive(time) }
  precondition(accepted == 2)
  precondition(reasons.count == 6)
  precondition(reasons.allSatisfy { $0 == (mode == 0 ? "camera_frame_timestamp_stale" : "camera_qa_frame_timestamp_stale") })
  lastSourceTime = .invalid
  receive(CMTime(value: 0, timescale: 30))
  precondition(accepted == 3)
}
`], { encoding: 'utf8', timeout: 20_000 })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  }, 25_000)
  it('selects the best supported resolution before nearest supported 5 FPS and native NV12', () => {
    const start = source.indexOf('func preferredCameraMode(')
    const selection = source.slice(start, source.indexOf('final class CameraTracker:', start))
    const result = spawnSync('xcrun', ['swift', '-e', `
import CoreVideo
${selection}
let nv12 = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
let yuv = kCVPixelFormatType_422YpCbCr8
let modes: [(Int32, Int32, UInt32, Double)] = [(96, 96, nv12, 5), (1920, 1080, yuv, 5),
  (1920, 1080, nv12, 30), (1920, 1080, nv12, 5)]
let chosen = preferredCameraMode(modes)!
precondition(chosen.0 == 1920 && chosen.1 == 1080 && chosen.2 == nv12 && chosen.3 == 5)
// A mode above the snapshot limit is passed over, not a reason to refuse the camera.
let capped = preferredCameraMode(modes + [(3840, 2160, yuv, 30)])!
precondition(capped.0 == 1920 && capped.1 == 1080 && capped.2 == nv12 && capped.3 == 5)
// A camera whose best mode is below full HD is used at its best.
let smaller = preferredCameraMode([(640, 480, yuv, 5), (1280, 720, yuv, 30), (1280, 720, nv12, 10)])!
precondition(smaller.0 == 1280 && smaller.1 == 720 && smaller.3 == 10)
let portrait = preferredCameraMode([(1080, 1920, nv12, 5), (640, 480, nv12, 5)])!
precondition(portrait.0 == 1080 && portrait.1 == 1920)
precondition(preferredCameraMode([(3840, 2160, yuv, 30)]) == nil)
let nearest = preferredCameraMode([(1920, 1080, yuv, 4), (1920, 1080, nv12, 10)])!
precondition(nearest.3 == 4)
precondition(preferredCameraMode([]) == nil)
for size in [(96, 96), (640, 480), (1280, 720)] {
  precondition(!cameraFrameDimensionsMatch(size.0, size.1, 1920, 1080, 1920, 1080))
}
precondition(cameraFrameDimensionsMatch(1920, 1080, 1920, 1080, 1920, 1080))
precondition(!cameraFrameDimensionsMatch(1920, 1080, 640, 480, 1920, 1080))
precondition(cameraFrameDimensionsMatch(1280, 720, 1280, 720, 1280, 720))
`], { encoding: 'utf8', timeout: 20_000 })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(source).toContain('qaMode == "minimum" ? minimum : modes[qaMode ?? "vga15"] : maximum')
    expect(source).toContain('if !qaObserve || CommandLine.arguments.contains("--qa-output-size")')
    expect(source).toContain('status(qaObserve ? "camera_qa_mode_invalid" : "camera_mode_unsupported")')
    expect(source).not.toContain('productionCameraDimensions')
    expect(source).not.toContain('source.transformed(')
    expect(source.indexOf('cameraFrameDimensionsMatch(CVPixelBufferGetWidth')).toBeLessThan(source.indexOf('lastFrame = now\n'))
  }, 25_000)

})
