import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatHold, PortraitStudioLayer, studioCoversAvatar } from '../../../src/renderer/mirror/portrait-studio-layer'
import type { StudioPhase, StudioView } from '../../../src/shared/portrait-studio'

const IMAGE = 'magic-mirror-media://studio/abcd1234-ef56'
const view = (patch: Partial<StudioView> = {}): StudioView => ({
  phase: 'name', language: 'zh', questionCount: 4, answered: 0, chips: [], lettering: 'nameplate', revisionsLeft: 1, ...patch,
})
const render = (value: StudioView | null) => renderToStaticMarkup(createElement(PortraitStudioLayer, { view: value }))
const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const feathers = (html: string) => [...html.matchAll(/data-state="(lit|current|unlit)"/g)].map(match => match[1])
const chips = (html: string) => [...html.matchAll(/<li class="portrait-studio__chip">([^<]*)<\/li>/g)].map(match => text(match[1]))

afterEach(() => { vi.useRealTimers() })

describe('PortraitStudioLayer', () => {
  it('renders nothing without a studio view', () => {
    expect(render(null)).toBe('')
  })

  it('shows name + question feathers and lights completed steps', () => {
    expect(feathers(render(view({ phase: 'name' })))).toEqual(['current', 'unlit', 'unlit', 'unlit', 'unlit'])
    expect(feathers(render(view({ phase: 'confirm', name: '王曉明' })))).toEqual(['current', 'unlit', 'unlit', 'unlit', 'unlit'])
    expect(feathers(render(view({ phase: 'question', answered: 0 })))).toEqual(['lit', 'current', 'unlit', 'unlit', 'unlit'])
    expect(feathers(render(view({ phase: 'question', answered: 2, chips: ['貓頭鷹', '海邊'] })))).toEqual(['lit', 'lit', 'lit', 'current', 'unlit'])
    expect(feathers(render(view({ phase: 'question', questionCount: 1 })))).toHaveLength(2)
    expect(feathers(render(view({ phase: 'question', questionCount: 8, answered: 7 })))).toHaveLength(9)
    expect(render(view({ phase: 'question' }))).toContain('<svg')
    expect(render(view({ phase: 'question' }))).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('asks for the name on a bottom card', () => {
    const html = render(view({ phase: 'name', prompt: '先告訴我，畫上要寫什麼名字？' }))
    expect(html).toContain('lang="zh-Hant"')
    expect(html).toContain('data-cover="false"')
    expect(html).toContain('portrait-studio__scrim')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('<p class="portrait-studio__label">名字</p>')
    expect(html).toContain('<p class="portrait-studio__question">先告訴我，畫上要寫什麼名字？</p>')
    expect(html).not.toContain('portrait-studio__frame')
    expect(html).not.toContain('<img')
    const english = render(view({ phase: 'name', language: 'en', prompt: 'First, what name should I write on the portrait?' }))
    expect(english).toContain('lang="en"')
    expect(english).toContain('<p class="portrait-studio__label">Name</p>')
    expect(english).toContain('First, what name should I write on the portrait?')
  })

  it('confirms the exact name on a gold nameplate', () => {
    const html = render(view({ phase: 'confirm', name: '王曉明' }))
    expect(html).toContain('<p class="portrait-studio__label">我會寫上</p>')
    expect(html).toMatch(/<p class="portrait-studio__nameplate" data-long="false">王曉明<\/p>/)
    expect(html).toContain('對嗎？')
    expect(render(view({ phase: 'confirm', name: '歐陽娜娜與林曉明' }))).toContain('data-long="true">歐陽娜娜與林曉明</p>')
    const english = text(render(view({ phase: 'confirm', language: 'en', name: 'Mei-Ling' })))
    expect(english).toContain("<p class=\"portrait-studio__label\">I'll write</p>")
    expect(english).toContain('>Mei-Ling</p>')
    expect(english).toContain('Is that right?')
  })

  it('shows the question number, prompt and answered chips', () => {
    const html = render(view({ phase: 'question', answered: 1, chips: ['貓頭鷹'], prompt: '你最想待在哪裡？' }))
    expect(chips(html)).toEqual(['貓頭鷹'])
    expect(html).toContain('<p class="portrait-studio__label">問題 2 / 4</p>')
    expect(html).toContain('<p class="portrait-studio__question">你最想待在哪裡？</p>')
    expect(chips(render(view({ phase: 'question' })))).toEqual([])
    expect(render(view({ phase: 'question', language: 'en', answered: 2, chips: ['owl', 'seaside'] }))).toContain('Question 3 of 4')
  })

  it('paints inside an empty gilded frame with an app-drawn ink animation', () => {
    const html = render(view({ phase: 'painting', answered: 4, chips: ['貓頭鷹'], name: '王曉明', imageUrl: IMAGE }))
    expect(html).toContain('data-cover="true"')
    expect(html).toContain('portrait-studio__veil')
    expect(html).toContain('<div class="portrait-studio__frame" data-state="painting">')
    expect(html).toContain('portrait-studio__ink')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('portrait-studio__banner')
    expect(html).not.toContain('portrait-studio__feathers')
    expect(html).toContain('羽毛筆沾墨中……')
    expect(chips(html)).toEqual([])
    expect(render(view({ phase: 'painting', language: 'en' }))).toContain('Dipping the quill in ink…')
  })

  it('shows the requested change over the dimmed previous image while repainting', () => {
    const html = render(view({ phase: 'revising', change: '海邊換成雪地', imageUrl: IMAGE, revisionsLeft: 0 }))
    expect(chips(html)).toEqual(['修改：海邊換成雪地'])
    expect(html).toMatch(/<img class="portrait-studio__image" src="magic-mirror-media:\/\/studio\/abcd1234-ef56" alt="" draggable="false" data-dim="true"\/>/)
    expect(html).toContain('portrait-studio__ink')
    expect(html).toContain('羽毛筆沾墨中……')
    expect(render(view({ phase: 'revising', change: 'snow' }))).not.toContain('<img')
    expect(chips(render(view({ phase: 'revising', language: 'en', change: 'make it snow' })))).toEqual(['Change: make it snow'])
  })

  it('reveals the portrait with the exact name banner and change hints', () => {
    const html = render(view({ phase: 'reveal', name: '王曉明', imageUrl: IMAGE, revisionsLeft: 1 }))
    expect(html).toContain('<div class="portrait-studio__frame" data-state="done">')
    expect(html).toMatch(/<img class="portrait-studio__image" src="magic-mirror-media:\/\/studio\/abcd1234-ef56" alt="" draggable="false" data-dim="false"\/>/)
    expect(html).toMatch(/<p class="portrait-studio__banner" data-long="false">王曉明<\/p>/)
    expect(html).not.toContain('portrait-studio__ink')
    expect(html).toContain('portrait-studio__chips--hint')
    expect(chips(html)).toEqual(['想改：說出要改的地方', '完成：說「很好」'])
    expect(chips(render(view({ phase: 'reveal', name: '王曉明', imageUrl: IMAGE, revisionsLeft: 0 })))).toEqual(['這幅畫是你的了'])
    const painted = render(view({ phase: 'reveal', name: '王曉明', imageUrl: IMAGE, lettering: 'painted' }))
    expect(painted).not.toContain('portrait-studio__banner')
    expect(painted).not.toContain('王曉明')
    expect(chips(render(view({ phase: 'reveal', language: 'en', imageUrl: IMAGE, revisionsLeft: 1 }))))
      .toEqual(['Change it: say what to change', "Done: say 'perfect'"])
    expect(chips(render(view({ phase: 'reveal', language: 'en', imageUrl: IMAGE, revisionsLeft: 0 })))).toEqual(['This portrait is yours'])
  })

  it('holds the keepsake with a photo hint and countdown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const html = render(view({ phase: 'keepsake', name: '王曉明', imageUrl: IMAGE, revisionsLeft: 0, holdEndsAt: 1_038_000 }))
    expect(html).toMatch(/<p class="portrait-studio__banner" data-long="false">王曉明<\/p>/)
    expect(html).toContain('alt=""')
    expect(chips(html)).toEqual(['可以用手機拍下這幅畫'])
    expect(html).toContain('<p class="portrait-studio__countdown" role="timer">00:38</p>')
    const english = render(view({ phase: 'keepsake', language: 'en', imageUrl: IMAGE, lettering: 'painted' }))
    expect(chips(english)).toEqual(['Take a photo of your portrait'])
    expect(english).not.toContain('portrait-studio__countdown')
    expect(english).not.toContain('portrait-studio__banner')
  })

  it('formats the hold countdown as mm:ss', () => {
    expect(formatHold(-500)).toBe('00:00')
    expect(formatHold(0)).toBe('00:00')
    expect(formatHold(38_200)).toBe('00:39')
    expect(formatHold(125_000)).toBe('02:05')
  })
})

describe('studioCoversAvatar', () => {
  it('covers the avatar only while the portrait frame is shown', () => {
    expect(studioCoversAvatar(null)).toBe(false)
    const table: Record<StudioPhase, boolean> = {
      name: false, confirm: false, question: false, painting: true, reveal: true, revising: true, keepsake: true,
    }
    for (const [phase, covers] of Object.entries(table)) expect(studioCoversAvatar(view({ phase: phase as StudioPhase }))).toBe(covers)
  })
})
