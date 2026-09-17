import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { AvatarCharacterEditor } from '../../src/renderer/console/AvatarCharacterEditor'
import { newAvatar } from '../../src/renderer/console/profile-workspace'

const defaults = { packageId: 'test-package', threshold: 0.27, score: 2.5, numTrailingBlanks: 3 }
function render(enabled: boolean, phraseMatches = true, available = true) {
  const avatar = newAvatar('a')
  avatar.wakeTuning = { enabled, phrase: phraseMatches ? avatar.wakePhrase! : 'old phrase', threshold: 0.18 }
  return renderToStaticMarkup(createElement(AvatarCharacterEditor, {
    avatar, disabled: false, onChange: () => undefined, wakeDefaults: available ? defaults : null,
  }))
}
describe('effective wake tuning values', () => {
  it('shows actual inherited values in disabled inputs, without hard-coded package numbers', () => {
    const html = render(false)
    expect(html).toMatch(/aria-label="Wake threshold override"[^>]*value="0.27"/)
    expect(html).toMatch(/aria-label="Wake score override"[^>]*value="2.5"/)
    expect(html).toMatch(/aria-label="Wake trailing blanks override"[^>]*value="3"/)
    expect(html).toContain('0.27 (package)')
  })
  it('resolves partial overrides independently and ignores stale phrase tuning', () => {
    expect(render(true)).toContain('0.18 (override)')
    expect(render(true)).toContain('2.5 (package)')
    expect(render(true, false)).toContain('0.27 (package)')
  })
  it('shows unavailable package data honestly while retaining explicit overrides', () => {
    const html = render(true, true, false)
    expect(html).toContain('Package values unavailable')
    expect(html).toContain('0.18 (override)')
    expect(html).toContain('score unavailable (package)')
  })
})
