import { describe, expect, it, vi } from 'vitest'

import {
  isExactSleepCommand,
  requestSleepAfterPlayback,
} from '../../src/renderer/realtime/sleep-command'

describe('Realtime sleep command', () => {
  it.each([
    ['睡吧', true],
    ['  睡吧\n', true],
    ['睡吧。', false],
    ['請睡吧', false],
    ['睡吧謝謝', false],
    ['睡 吧', false],
    ['', false],
  ])('matches only the normalized full command %j', (transcript, expected) => {
    expect(isExactSleepCommand(transcript)).toBe(expected)
  })

  it('requests sleep only after actual playback completion', async () => {
    const order: string[] = []
    const waitForActualEnd = vi.fn(async () => {
      order.push('playback-ended')
    })
    const requestSleep = vi.fn(() => {
      order.push('sleep-requested')
    })

    await requestSleepAfterPlayback({
      transcript: '睡吧',
      waitForActualEnd,
      requestSleep,
    })

    expect(order).toEqual(['playback-ended', 'sleep-requested'])
  })

  it('does nothing for a non-command transcript', async () => {
    const waitForActualEnd = vi.fn()
    const requestSleep = vi.fn()

    await requestSleepAfterPlayback({
      transcript: '請睡吧',
      waitForActualEnd,
      requestSleep,
    })

    expect(waitForActualEnd).not.toHaveBeenCalled()
    expect(requestSleep).not.toHaveBeenCalled()
  })
})
