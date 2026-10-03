import { describe, expect, it } from 'vitest'
import { computePortraitLayout } from '../../../src/renderer/avatar/portrait-layout'

describe('portrait avatar layout', () => {
  it('fills a 9:16 monitor exactly', () => {
    expect(computePortraitLayout(1080, 1920, 2)).toEqual({
      cssWidth: 1080,
      cssHeight: 1920,
      offsetX: 0,
      offsetY: 0,
      pixelWidth: 2160,
      pixelHeight: 3840,
      scale: 1,
    })
  })

  it('letterboxes the portrait composition on a landscape development monitor', () => {
    expect(computePortraitLayout(1920, 1080, 1)).toEqual({
      cssWidth: 607.5,
      cssHeight: 1080,
      offsetX: 656.25,
      offsetY: 0,
      pixelWidth: 608,
      pixelHeight: 1080,
      scale: 0.5625,
    })
  })

  it('pillarboxes an extra-tall viewport without stretching the avatar', () => {
    expect(computePortraitLayout(900, 2000, 1.25)).toEqual({
      cssWidth: 900,
      cssHeight: 1600,
      offsetX: 0,
      offsetY: 200,
      pixelWidth: 1125,
      pixelHeight: 2000,
      scale: 5 / 6,
    })
  })

  it('rejects non-positive or non-finite dimensions', () => {
    expect(() => computePortraitLayout(0, 1080, 1)).toThrow('portrait_layout_invalid')
    expect(() => computePortraitLayout(1080, Number.NaN, 1)).toThrow(
      'portrait_layout_invalid',
    )
    expect(() => computePortraitLayout(1080, 1920, 0)).toThrow(
      'portrait_layout_invalid',
    )
  })
})
