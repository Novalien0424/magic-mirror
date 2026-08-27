import { describe, expect, it } from 'vitest'
import { selectPortraitDisplay } from '../../src/main/portrait-display'

describe('portrait mirror display selection', () => {
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
