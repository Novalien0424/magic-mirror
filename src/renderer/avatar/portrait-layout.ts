const PORTRAIT_WIDTH = 1080
const PORTRAIT_HEIGHT = 1920

export interface PortraitLayout {
  readonly cssWidth: number
  readonly cssHeight: number
  readonly offsetX: number
  readonly offsetY: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly scale: number
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

export function computePortraitLayout(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
): PortraitLayout {
  if (
    !positiveFinite(viewportWidth)
    || !positiveFinite(viewportHeight)
    || !positiveFinite(devicePixelRatio)
  ) {
    throw new Error('portrait_layout_invalid')
  }

  const scale = Math.min(
    viewportWidth / PORTRAIT_WIDTH,
    viewportHeight / PORTRAIT_HEIGHT,
  )
  const cssWidth = PORTRAIT_WIDTH * scale
  const cssHeight = PORTRAIT_HEIGHT * scale

  return Object.freeze({
    cssWidth,
    cssHeight,
    offsetX: (viewportWidth - cssWidth) / 2,
    offsetY: (viewportHeight - cssHeight) / 2,
    pixelWidth: Math.max(1, Math.round(cssWidth * devicePixelRatio)),
    pixelHeight: Math.max(1, Math.round(cssHeight * devicePixelRatio)),
    scale,
  })
}
