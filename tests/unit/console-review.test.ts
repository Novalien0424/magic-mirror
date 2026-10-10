import { describe, expect, it } from 'vitest'
import { clampNumber } from '../../src/renderer/console/NumberInput'
import { operatorMessageText, reasonCopy } from '../../src/renderer/console/reason-copy'
import { createConsoleRuntimeStore } from '../../src/renderer/console/runtime-store'

describe('operator review fixes', () => {
  it('keeps blanks and non-finite numbers from silently becoming zero, and enforces bounds', () => {
    expect(clampNumber('', 5, 0, 10)).toBe(5)
    expect(clampNumber('Infinity', 5, 0, 10)).toBe(5)
    expect(clampNumber('-3', 5, 0, 10)).toBe(0)
    expect(clampNumber('20', 5, 0, 10)).toBe(10)
    expect(clampNumber('0.25', 5, 0, 10)).toBe(.25)
  })
  it('gives useful failure recovery without marking successful metadata as failure', () => {
    expect(reasonCopy('youtube_search_not_configured').recovery).toContain('API key')
    expect(operatorMessageText('Cannot save (console_config_invalid): avatarCatalog: invalid_avatar_catalog.')).toContain('highlighted fields')
    expect(operatorMessageText('voice_preview_stopped')).toBe('Voice preview stopped. ')
    expect(operatorMessageText('Saved.')).toBe('Saved.')
  })
  it('notifies runtime subscribers only when a snapshot changes', () => {
    const store = createConsoleRuntimeStore(); let count = 0
    const unsubscribe = store.subscribe(() => count++)
    const next = { status: 'failure' as const, error: 'unavailable', reason: 'console_data_plane_unavailable' }
    store.set(next); store.set({ ...next }); expect(count).toBe(1)
    unsubscribe(); store.set({ status: 'loading' }); expect(count).toBe(1)
  })
})
