import { describe, expect, it } from 'vitest'
import { selectConsoleMainDisplay, selectPortraitDisplay } from '../../src/main/portrait-display'

describe('portrait mirror display selection', () => {
  it('selects the rotated third display in a three-monitor desktop', () => {
    expect(selectPortraitDisplay([
      { id: 1, bounds: { x: 0, y: 0, width: 1707, height: 1067 } },
      { id: 2, bounds: { x: 1707, y: 0, width: 2560, height: 1440 } },
      { id: 3, bounds: { x: 4267, y: 0, width: 800, height: 1280 } },
    ], 1)?.id).toBe(3)
  })
  it('prefers the most portrait-shaped display over the primary display', () => {
    const selected = selectPortraitDisplay([
      { id: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } },
      { id: 2, bounds: { x: 2560, y: 0, width: 1080, height: 1920 } },
    ], 1)

    expect(selected?.id).toBe(2)
  })

  it('uses the primary display when no portrait display exists', () => {
    const selected = selectPortraitDisplay([
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 } },
    ], 1)

    expect(selected?.id).toBe(1)
  })

  it('returns null when Electron reports no displays', () => {
    expect(selectPortraitDisplay([], 1)).toBeNull()
  })
})

describe('Remote Console display selection', () => {
  const main = { id: 5, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
  const tv = { id: 3, bounds: { x: 1920, y: 0, width: 1080, height: 1920 } }

  it('uses the primary display beside the mirror', () => {
    expect(selectConsoleMainDisplay([main, tv], 5, 3)?.id).toBe(5)
  })

  it('never uses the mirror display, even when it is primary', () => {
    expect(selectConsoleMainDisplay([tv, main], 3, 3)?.id).toBe(5)
  })

  it('returns null when the mirror display is the only display', () => {
    expect(selectConsoleMainDisplay([tv], 3, 3)).toBeNull()
    expect(selectConsoleMainDisplay([], 3, 3)).toBeNull()
  })

  it('uses the primary display when no mirror window exists', () => {
    expect(selectConsoleMainDisplay([tv, main], 5, undefined)?.id).toBe(5)
  })
})
