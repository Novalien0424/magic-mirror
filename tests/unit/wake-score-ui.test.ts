import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WakeScoreMeter } from '../../src/renderer/console/WakeCalibrationPanel'
import { wakeScoreSchema } from '../../src/shared/wake-score'
import { WakeRecoveryStatus } from '../../src/renderer/console/WakeRecoveryStatus'

describe('native wake score display', () => {
  it('keeps failed recovery and successful restarts explicit in the Console', () => {
    const render = (state: 'failed' | 'restarting' | 'recovered') => renderToStaticMarkup(createElement(WakeRecoveryStatus,
      { recovery: { state, attempts: 2, reason: 'wake_audio_stalled' } }))
    expect(render('failed')).toContain('Start live test')
    expect(render('failed')).toContain('close and restart Magic Mirror')
    expect(render('failed')).toContain('wake_audio_stalled')
    expect(render('restarting')).toContain('Restarting wake listener')
    expect(render('recovered')).toContain('Audio resumed after')
    expect(render('recovered')).toContain('2')
  })
  it('shows the measured decimal score and partial phrase progress independently', () => {
    const html = renderToStaticMarkup(createElement(WakeScoreMeter, { testing: true, threshold: 0.18,
      score: { acousticScore: 0.723, matchedTokens: 4, totalTokens: 9, trailingBlanks: 0, decodedSteps: 7 } }))
    expect(html).toContain('value="0.723"')
    expect(html).toContain('0.723 / 1.000')
    expect(html).toContain('4 / 9 sound tokens')
    expect(html).toContain('0.180')
    expect(html).not.toContain('72.3%')
  })
  it('does not invent a zero score when native measurement is unavailable or stopped', () => {
    const html = renderToStaticMarkup(createElement(WakeScoreMeter, { testing: true, threshold: 0.18, score: null }))
    expect(html).toContain('No native score available')
    expect(html).not.toContain('<meter')
  })
  it('rejects malformed or content-bearing detector measurements', () => {
    const valid = { acousticScore: 0.8, matchedTokens: 4, totalTokens: 9, trailingBlanks: 0, decodedSteps: 5 }
    expect(wakeScoreSchema.safeParse(valid).success).toBe(true)
    for (const extra of [{ acousticScore: NaN }, { matchedTokens: 10 }, { tokens: ['private'] }]) {
      expect(wakeScoreSchema.safeParse({ ...valid, ...extra }).success).toBe(false)
    }
  })
})
