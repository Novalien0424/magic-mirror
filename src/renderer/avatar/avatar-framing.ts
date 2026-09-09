import { CubismMatrix44 } from '../../vendor/live2d/Framework/dist/math/cubismmatrix44'

// Canvas dimensions come from the validated portrait layout. Model height is
// initialized by CubismModelMatrix; an authored Layout may override it once.
// Drawing/resizing must not mutate that model framing or depend on export PPU.
export function createAvatarMvp(
  width: number,
  height: number,
  modelMatrix: CubismMatrix44,
): CubismMatrix44 {
  const projection = new CubismMatrix44()
  projection.scale(height / width, 1)
  projection.multiplyByMatrix(modelMatrix)
  return projection
}
