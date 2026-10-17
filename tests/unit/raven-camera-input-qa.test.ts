import { describe, expect, it } from 'vitest'
import { diagnoseRavenCameraInput } from '../../src/main/raven-camera-input-qa'

describe('camera ASR diagnostic evidence', () => {
  it('retains a negative ASR verdict without blocking tool/image assessment', async () => {
    const result = await diagnoseRavenCameraInput('synthetic unclear input', async () => ({
      cameraRequestRecognized: false, objectsRequestRecognized: false,
    }))
    expect(result).toEqual({ judged: true, cameraRequestRecognized: false, objectsRequestRecognized: false })
  })
  it('retains positive recognition separately from visual success', async () => {
    expect(await diagnoseRavenCameraInput('synthetic camera request', async () => ({
      cameraRequestRecognized: true, objectsRequestRecognized: true,
    }))).toEqual({ judged: true, cameraRequestRecognized: true, objectsRequestRecognized: true })
  })
  it('makes unavailable, malformed and extra-content judgments unknown without exposing their content', async () => {
    for (const value of [null, [], { cameraRequestRecognized: true },
      { cameraRequestRecognized: 'true', objectsRequestRecognized: true },
      { cameraRequestRecognized: true, objectsRequestRecognized: true, transcript: 'must not escape' }]) {
      expect(await diagnoseRavenCameraInput('synthetic', async () => value)).toEqual({ judged: false })
    }
    expect(await diagnoseRavenCameraInput('synthetic', async () => { throw Error('must not escape') })).toEqual({ judged: false })
  })
})
