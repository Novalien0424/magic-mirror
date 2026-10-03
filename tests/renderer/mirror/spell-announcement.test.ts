import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpellAnnouncement } from '../../../src/renderer/mirror/spell-announcement'

describe('spell incantation playback ordering', () => {
  afterEach(() => vi.useRealTimers())
  it('speaks only the prefix and completes only after output starts then finishes', async () => {
    const speak = vi.fn(() => true)
    const a = createSpellAnnouncement({ speak })
    const done = vi.fn()
    const pending = a.run().then(done)
    expect(speak).toHaveBeenCalledExactlyOnceWith('施放咒語')
    a.handleActivity('output_stopped')
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    a.handleActivity('output_started')
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    a.handleActivity('output_stopped')
    await pending
    expect(done).toHaveBeenCalledWith({ status: 'completed' })
  })
  it('cancels on new visitor speech or teardown and ignores late completion', async () => {
    for (const cancel of ['speech', 'dispose'] as const) {
      const a = createSpellAnnouncement({ speak: () => true })
      const pending = a.run()
      a.handleActivity('output_started')
      if (cancel === 'speech') a.handleActivity('speech_started'); else a.dispose()
      a.handleActivity('output_stopped')
      expect(await pending).toMatchObject({ status: 'failed', reason: cancel === 'speech' ? 'spell_announcement_visitor_speech' : 'spell_announcement_cancelled' })
    }
  })
  it('fails locally when speech is unavailable or no audio completes before the bound', async () => {
    vi.useFakeTimers()
    expect(await createSpellAnnouncement({ speak: () => false }).run()).toMatchObject({ status: 'failed' })
    const a = createSpellAnnouncement({ speak: () => true })
    const pending = a.run()
    await vi.advanceTimersByTimeAsync(12_000)
    expect(await pending).toMatchObject({ status: 'failed', reason: 'spell_announcement_timeout' })
  })
})
