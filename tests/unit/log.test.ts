import { describe, expect, it } from 'vitest'
import { formatMarker } from '../../src/main/log'

describe('formatMarker', () => {
  it('emits a bare name when there are no fields', () => {
    expect(formatMarker('MAIN_READY')).toBe('MAIN_READY\n')
  })

  it('emits parseable key=value pairs in insertion order', () => {
    expect(formatMarker('SMOKE_RESULT', { exit: 2, reason: 'lifecycle_still_starting' })).toBe(
      'SMOKE_RESULT exit=2 reason=lifecycle_still_starting\n'
    )
  })

  it('collapses whitespace so a value can never break the key=value grammar', () => {
    expect(formatMarker('PRELOAD_ERROR', { reason: 'boom\nsecond line' })).toBe(
      'PRELOAD_ERROR reason=boom_second_line\n'
    )
  })

  it('truncates a runaway value instead of flooding the boot log', () => {
    const line = formatMarker('PRELOAD_ERROR', { reason: 'x'.repeat(5_000) })

    expect(line.length).toBeLessThan(300)
    expect(line.endsWith('…\n')).toBe(true)
  })
})
