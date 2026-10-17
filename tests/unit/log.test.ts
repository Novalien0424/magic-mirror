import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMarker } from '../../src/main/log'

describe('formatMarker', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T08:00:00.000Z')) })
  afterEach(() => vi.useRealTimers())
  it('emits a bare name when there are no fields', () => {
    expect(formatMarker('MAIN_READY')).toBe('MAIN_READY at=2026-10-11T08:00:00.000Z\n')
  })

  it('emits parseable key=value pairs in insertion order', () => {
    expect(formatMarker('SMOKE_RESULT', { exit: 2, reason: 'lifecycle_still_starting' })).toBe(
      'SMOKE_RESULT exit=2 reason=lifecycle_still_starting at=2026-10-11T08:00:00.000Z\n'
    )
  })

  it('collapses whitespace so a value can never break the key=value grammar', () => {
    expect(formatMarker('PRELOAD_ERROR', { reason: 'boom\nsecond line' })).toBe(
      'PRELOAD_ERROR reason=boom_second_line at=2026-10-11T08:00:00.000Z\n'
    )
  })

  it('truncates a runaway value instead of flooding the boot log', () => {
    const line = formatMarker('PRELOAD_ERROR', { reason: 'x'.repeat(5_000) })

    expect(line.length).toBeLessThan(300)
    expect(line).toContain('… at=2026-10-11T08:00:00.000Z\n')
  })
})
