import { describe, expect, it } from 'vitest'
import { evaluateSmoke, parseSmokeMode, SMOKE_EXIT_FAILED, SMOKE_EXIT_OK } from '../../src/main/smoke'

describe('parseSmokeMode', () => {
  it('is off when MIRROR_SMOKE_MS is absent or blank', () => {
    expect(parseSmokeMode(undefined)).toEqual({ kind: 'off' })
    expect(parseSmokeMode('')).toEqual({ kind: 'off' })
    expect(parseSmokeMode('   ')).toEqual({ kind: 'off' })
  })

  it('is on for a positive duration', () => {
    expect(parseSmokeMode('8000')).toEqual({ kind: 'on', ms: 8000 })
    expect(parseSmokeMode(' 250 ')).toEqual({ kind: 'on', ms: 250 })
  })

  it('reports a set-but-unusable value instead of silently disabling smoke mode', () => {
    expect(parseSmokeMode('abc')).toEqual({ kind: 'invalid', raw: 'abc' })
    expect(parseSmokeMode('0')).toEqual({ kind: 'invalid', raw: '0' })
    expect(parseSmokeMode('-1')).toEqual({ kind: 'invalid', raw: '-1' })
  })
})

describe('evaluateSmoke', () => {
  const ready = { lifecycle: 'dormant', loaded: { mirror: true, console: true } } as const

  it('exits 0 when both windows loaded and lifecycle is dormant', () => {
    expect(evaluateSmoke(ready)).toEqual({ exitCode: SMOKE_EXIT_OK, reason: 'ok' })
  })

  it('exits 0 when both windows loaded and lifecycle is maintenance', () => {
    expect(evaluateSmoke({ ...ready, lifecycle: 'maintenance' })).toEqual({
      exitCode: SMOKE_EXIT_OK,
      reason: 'ok'
    })
  })

  it('exits 2 while the lifecycle is still starting', () => {
    const verdict = evaluateSmoke({ ...ready, lifecycle: 'starting' })
    expect(verdict.exitCode).toBe(SMOKE_EXIT_FAILED)
    expect(verdict.reason).toContain('lifecycle_still_starting')
  })

  it('exits 2 when both windows loaded but lifecycle is offlineLoop', () => {
    expect(evaluateSmoke({ ...ready, lifecycle: 'offlineLoop' })).toEqual({
      exitCode: SMOKE_EXIT_FAILED,
      reason: 'lifecycle_not_terminal'
    })
  })

  it('exits 2 when a window never loaded, naming which one', () => {
    expect(evaluateSmoke({ ...ready, loaded: { mirror: false, console: true } })).toEqual({
      exitCode: SMOKE_EXIT_FAILED,
      reason: 'mirror_window_not_loaded'
    })
    expect(evaluateSmoke({ ...ready, loaded: { mirror: true, console: false } })).toEqual({
      exitCode: SMOKE_EXIT_FAILED,
      reason: 'console_window_not_loaded'
    })
  })

  it('reports every unmet condition, not just the first', () => {
    const verdict = evaluateSmoke({ lifecycle: 'starting', loaded: { mirror: false, console: false } })
    expect(verdict.reason.split(',')).toEqual([
      'mirror_window_not_loaded',
      'console_window_not_loaded',
      'lifecycle_still_starting'
    ])
  })
})
