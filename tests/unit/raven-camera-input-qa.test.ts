import { readFileSync } from 'node:fs'
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


describe('native camera conversation journey routing', () => {
  const runner = readFileSync(new URL('../../scripts/run-raven-conversation-qa.mjs', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../../src/main/index.ts', import.meta.url), 'utf8')
  const qa = readFileSync(new URL('../../src/main/raven-conversation-qa.ts', import.meta.url), 'utf8')
  it('accepts camera with native capture but prohibits native transcript retention and unrelated scenarios', () => {
    const line = runner.split('\n').find(line => line.includes("throw Error('raven_qa_native_camera_journey_invalid')"))!
    const validate = new Function('nativeCameraJourney', 'selected', 'keepTranscript', line)
    expect(() => validate(true, 'camera', false)).not.toThrow()
    expect(() => validate(true, 'camera', true)).toThrow('raven_qa_native_camera_journey_invalid')
    expect(() => validate(true, 'additional_capabilities', false)).toThrow('raven_qa_native_camera_journey_invalid')
  })
  it('enables the Main native owner for the flagged camera scenario and bypasses synthetic capture', () => {
    const expression = main.match(/const nativeCameraJourneyQa = ([\s\S]*?)\n  let qaPortraitFixture/)![1]!
    const enabled = new Function('phase4QaEnabled', 'process', `return ${expression}`)
    const environment = { env: { MIRROR_RAVEN_CONVERSATION_QA: '1', MIRROR_QA_NATIVE_CAMERA: '1', MIRROR_RAVEN_CONVERSATION_QA_SCENARIO: 'camera' } }
    expect(enabled(true, environment)).toBe(true)
    expect(enabled(false, environment)).toBe(false)
    environment.env.MIRROR_QA_NATIVE_CAMERA = '0'
    expect(enabled(true, environment)).toBe(false)
    expect(main).toContain('|| physicalDeviceQa || nativeCameraJourneyQa))')
    expect(main).toContain('&& !physicalDeviceQa && !nativeCameraJourneyQa')
  })
  it('uses the live image judge and camera lifecycle checks without retaining native imagery', () => {
    expect(qa).toContain('const liveCamera = physical || nativeCameraJourney')
    for (const step of ['camera_asleep_released', 'camera_awake_owned', 'camera_sleep_released']) {
      expect(qa).toContain(`if (liveCamera && selection === 'camera') await check('${step}'`)
    }
    expect(qa).toContain("if (liveCamera) {\n        const image =")
    expect(qa).toContain("liveCamera ? 'Look through the camera and describe clearly visible objects in two sentences")
    expect(qa).toContain("await evaluate('window.__ravenQa.images=[]')")
    expect(qa).toContain('&& !nativeCameraJourney\n  const persist')
    expect(runner).toContain("imageRetention: nativeCameraJourney && !portraitFixtureBytes ? 'none_including_derived_artwork_and_screenshots'")
  })
})
