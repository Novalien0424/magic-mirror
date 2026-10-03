import { describe, expect, it } from 'vitest'
import { createAvatarMvp } from '../../../src/renderer/avatar/avatar-framing'
import { CubismModelMatrix } from '../../../src/vendor/live2d/Framework/dist/math/cubismmodelmatrix'

describe('fixed height and authored Layout avatar framing', () => {
  it('keeps Raven v07 and width-padded v08 at the same scale', () => {
    const v07 = new CubismModelMatrix(941 / 941, 1672 / 941)
    const v08 = new CubismModelMatrix(1280 / 941, 1672 / 941)
    const first = createAvatarMvp(1080, 1920, v07)
    const second = createAvatarMvp(1080, 1920, v08)
    expect([...second.getArray()]).toEqual([...first.getArray()])
    expect(second.transformY(100 / 941)).toBeCloseTo(200 / 1672, 6)
  })

  it.each([0.999, 1, 1.001, 1280 / 941])('preserves equivalent physical vertices at widthUnits=%s', widthUnits => {
    const ppu = 1280 / widthUnits
    const model = new CubismModelMatrix(1280 / ppu, 1672 / ppu)
    const mvp = createAvatarMvp(1080, 1920, model)
    expect(mvp.transformX(200 / ppu)).toBeCloseTo(400 / 1672 * 16 / 9, 6)
    expect(mvp.transformY(100 / ppu)).toBeCloseTo(200 / 1672, 6)
  })

  it.each(['height', 'width'] as const)('preserves explicit %s Layout through repeated draws and resize', dimension => {
    const model = new CubismModelMatrix(1.5, 2)
    model.setupFromLayout(new Map([[dimension, 1.2], ['x', 0.15], ['y', -0.2]]))
    const before = [...model.getArray()]
    const scale = dimension === 'height' ? 0.6 : 0.8
    for (let frame = 0; frame < 100; frame++) {
      const [width, height] = frame % 2 ? [540, 960] : [1080, 1920]
      const mvp = createAvatarMvp(width, height, model)
      expect(mvp.getScaleX()).toBeCloseTo(scale * 16 / 9, 6)
      expect(mvp.getScaleY()).toBeCloseTo(scale, 6)
      expect(mvp.transformX(0)).toBeCloseTo(0.15 * 16 / 9, 6)
      expect(mvp.transformY(0)).toBeCloseTo(-0.2, 6)
      expect([...model.getArray()]).toEqual(before)
    }
  })

  it.each([[540, 960], [1080, 1920], [2160, 3840], [329, 584]])('keeps equal model displacements isotropic at %sx%s', (width, height) => {
    const model = new CubismModelMatrix(1280 / 941, 1672 / 941)
    const mvp = createAvatarMvp(width, height, model)
    const dx = (mvp.transformX(0.1) - mvp.transformX(0)) * width / 2
    const dy = (mvp.transformY(0.1) - mvp.transformY(0)) * height / 2
    expect(dx).toBeCloseTo(dy, 4)
    expect(mvp.transformY(0.1)).toBeCloseTo(0.2 * 941 / 1672, 6)
  })
})
