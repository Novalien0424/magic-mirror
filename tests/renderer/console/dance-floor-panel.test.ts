import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DanceFloorPanel, danceStopAvailable } from '../../../src/renderer/console/DanceFloorPanel'
import { DEFAULT_DANCE, type DanceFrame, type DanceView } from '../../../src/shared/dance-floor'

const view = (status: DanceFrame['status']): DanceView => ({ settings: { ...DEFAULT_DANCE }, tracks: [], outputs: { count: 0, controlled: 0, verified: false },
  frame: { generation: 1, trackId: 0, positionMs: 0, sentAt: 0, rate: 0, beats: [], energy: 0, settings: { ...DEFAULT_DANCE }, status, reason: 'dance_idle' } })

describe('Dance Floor Console panel', () => {
  it('offers Stop only while Dance owns the player, including a failed Dance', () => {
    expect(danceStopAvailable(undefined)).toBe(false)
    expect(danceStopAvailable(view('idle'))).toBe(false)
    for (const status of ['preparing', 'welcome', 'playing', 'failed'] as const) expect(danceStopAvailable(view(status))).toBe(true)
    const html = renderToStaticMarkup(createElement(DanceFloorPanel, { bridge: null, visible: true }))
    expect(html).toMatch(/<button disabled="">Stop Dance Floor<\/button>/)
  })
  it('describes the restore as the normal speaker levels, not a fixed Jabra percentage', () => {
    const html = renderToStaticMarkup(createElement(DanceFloorPanel, { bridge: null, visible: true }))
    expect(html).toContain('restores the speakers to their normal levels')
    expect(html).not.toContain('70%')
  })
})
