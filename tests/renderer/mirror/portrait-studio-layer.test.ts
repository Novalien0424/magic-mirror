import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PortraitStudioLayer, studioCoversAvatar } from '../../../src/renderer/mirror/portrait-studio-layer'
import type { StudioPhase, StudioView } from '../../../src/shared/portrait-studio'
import { studioScreenView } from '../../../src/shared/portrait-studio-config'

const IMAGE = 'magic-mirror-media://studio/abcd1234-ef56'
const view = (patch: Partial<StudioView> = {}): StudioView => {
  const base = { phase: 'name' as const, language: 'zh' as const, questionCount: 4, answered: 0, chips: [], lettering: 'nameplate' as const,
    picture: 'portrait' as const, revisionsLeft: 1, askName: true, ...patch }
  return { ...base, text: patch.text ?? studioScreenView(undefined, base.language, Math.min(base.answered + 1, base.questionCount), base.questionCount) }
}
const render = (value: StudioView | null) => renderToStaticMarkup(createElement(PortraitStudioLayer, { view: value }))
const visibleText = (html: string) => html.replace(/<[^>]*>/g, '')
const feathers = (html: string) => [...html.matchAll(/data-state="(lit|current|unlit)"/g)].map(match => match[1])
const phases: StudioPhase[] = ['name', 'confirm', 'question', 'painting', 'reveal', 'revising', 'keepsake']

describe('PortraitStudioLayer', () => {
  it('renders nothing without a visit', () => expect(render(null)).toBe(''))

  it.each(phases)('shows only the name when appropriate, never captions or answers, in %s', phase => {
    for (const language of ['zh', 'en'] as const) {
      const html = render(view({ phase, language, name: '王曉明', prompt: 'A spoken question', chips: ['Private answer'],
        change: 'Make it snow', holdEndsAt: Date.now() + 38000, imageUrl: IMAGE,
        text: { ...studioScreenView(undefined, language, 2, 4), captions: ['Custom painting caption'], questionLabel: 'Custom question label' } }))
      expect(visibleText(html)).toBe(['confirm', 'reveal', 'keepsake'].includes(phase) ? '王曉明' : '')
      expect(html).not.toContain('role="timer"')
      expect(html).toContain(`lang="${language === 'en' ? 'en' : 'zh-Hant'}"`)
    }
  })

  it('escapes exact name spelling and accommodates long names', () => {
    expect(visibleText(render(view({ phase: 'confirm', name: '<Amy & Chen>' })))).toBe('&lt;Amy &amp; Chen&gt;')
    expect(render(view({ phase: 'confirm', name: '歐陽娜娜與林曉明' }))).toContain('data-long="true">歐陽娜娜與林曉明</p>')
  })

  it('keeps progress graphical with configurable question count and optional name', () => {
    expect(feathers(render(view({ phase: 'name' })))).toEqual(['current', 'unlit', 'unlit', 'unlit', 'unlit'])
    expect(feathers(render(view({ phase: 'question', askName: false })))).toEqual(['current', 'unlit', 'unlit', 'unlit'])
    expect(feathers(render(view({ phase: 'question', answered: 2 })))).toEqual(['lit', 'lit', 'lit', 'current', 'unlit'])
    expect(feathers(render(view({ phase: 'question', questionCount: 8 })))).toHaveLength(9)
  })

  it('shows ink without an image at first, then dims the existing image during revision', () => {
    const first = render(view({ phase: 'painting', imageUrl: IMAGE }))
    expect(first).toContain('portrait-studio__ink')
    expect(first).not.toContain('<img')
    const revision = render(view({ phase: 'revising', imageUrl: IMAGE }))
    expect(revision).toContain('portrait-studio__ink')
    expect(revision).toContain('data-dim="true"')
  })

  it('shows the whole artwork, with a nameplate only when the name was not painted into the image', () => {
    for (const picture of ['portrait', 'sticker'] as const) {
      const html = render(view({ phase: 'reveal', name: '王曉明', picture, imageUrl: IMAGE }))
      expect(html).toContain(`data-picture="${picture}"`)
      expect(html).toContain(`src="${IMAGE}"`)
      expect(html).toContain('data-dim="false"')
      expect(html).not.toContain('portrait-studio__ink')
      expect(visibleText(html)).toBe('王曉明')
      expect(visibleText(render(view({ phase: 'reveal', name: '王曉明', lettering: 'painted', imageUrl: IMAGE })))).toBe('')
    }
  })
})

it('covers the avatar only while displaying the portrait frame', () => {
  expect(studioCoversAvatar(null)).toBe(false)
  for (const phase of phases) expect(studioCoversAvatar(view({ phase }))).toBe(['painting', 'reveal', 'revising', 'keepsake'].includes(phase))
})
