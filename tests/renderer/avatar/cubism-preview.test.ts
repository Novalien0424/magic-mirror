import { describe, it, expect } from 'vitest'
import { clampPreviewParameter, motionKey } from '../../../src/renderer/avatar/cubism-preview'

describe('Cubism preview parameter boundary', () => {
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
