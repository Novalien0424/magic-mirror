import { describe, it, expect, vi } from 'vitest'
import { clampPreviewParameter, motionKey, configureMotionPlayback } from '../../../src/renderer/avatar/cubism-preview'
import { CubismMotion } from '../../../src/vendor/live2d/Framework/dist/motion/cubismmotion'
import { CubismExpressionMotion } from '../../../src/vendor/live2d/Framework/dist/motion/cubismexpressionmotion'
import { CubismMotionQueueEntry } from '../../../src/vendor/live2d/Framework/dist/motion/cubismmotionqueueentry'

describe('Cubism preview parameter boundary', () => {
  it('loops Console motions without re-fading each cycle and restores one-shot mode for normal playback', () => {
    const motion = new CubismMotion()
    Object.assign(motion, { _loopDurationSeconds: 3 })
    configureMotionPlayback(motion, true)
    expect(motion.getLoop()).toBe(true)
    expect(motion.getLoopFadeIn()).toBe(false)
    expect(motion.getDuration()).toBe(-1)
    configureMotionPlayback(motion, false)
    expect(motion.getLoop()).toBe(false)
    expect(motion.getLoopFadeIn()).toBe(true)
    expect(motion.getDuration()).toBe(3)
  })
  it('uses the SDK indefinite expression duration instead of restarting expression fades', () => {
    class ExpressionFixture extends CubismExpressionMotion { constructor() { super() } }
    expect(new ExpressionFixture().getDuration()).toBe(-1)
  })
  it('recognizes SDK V2 finished callbacks as loop boundaries, not playback completion', () => {
    const motion = new CubismMotion()
    const callback = vi.fn()
    configureMotionPlayback(motion, true)
    motion.setFinishedMotionHandler(callback)
    const entry = new CubismMotionQueueEntry()
    motion.updateForNextLoop(entry, 6.5, 0.5)
    expect(callback).toHaveBeenCalledOnce()
    expect(entry.isFinished()).toBe(false)
    expect(motion.getDuration()).toBe(-1)
  })
  const parameter = { id: 'ParamAngleX', index: 0, min: -30, max: 30, defaultValue: 0 }
  it('clamps to the loaded rig range and rejects unknown/non-finite writes', () => {
    expect(clampPreviewParameter(parameter, -90)).toBe(-30)
    expect(clampPreviewParameter(parameter, 90)).toBe(30)
    expect(clampPreviewParameter(parameter, 12)).toBe(12)
    expect(clampPreviewParameter(undefined, 0)).toBeNull()
    expect(clampPreviewParameter(parameter, NaN)).toBeNull()
    expect(clampPreviewParameter(parameter, Infinity)).toBeNull()
  })
  it('keeps every group/index distinct even for punctuation in group names', () => {
    expect(new Set([motionKey('Scene', 0), motionKey('Scene', 1), motionKey('Scene:1', 0)]).size).toBe(3)
  })
})
