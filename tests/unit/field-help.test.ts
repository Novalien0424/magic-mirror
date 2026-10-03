import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HelpField, placeFieldHelp } from '../../src/renderer/console/HelpField'

describe('field explanations', () => {
  it('keeps the input label and existing description, with help outside the label', () => {
    const html = renderToStaticMarkup(createElement(HelpField, { help: 'How long the step runs before moving on.' },
      'Duration seconds', createElement('input', { type: 'number', 'aria-describedby': 'validation', defaultValue: 3 })))
    const input = html.match(/<input[^>]+>/)![0]
    const tooltipId = html.match(/id="([^"]+)"[^>]*role="tooltip"/)![1]
    expect(input).toContain(`aria-describedby="validation ${tooltipId}"`)
    expect(html.match(/<label[^>]*>(.*?)<\/label>/)?.[1]).toContain('Duration seconds<input')
    expect(html.match(/<label[^>]*>(.*?)<\/label>/)?.[1]).not.toContain('role="button"')
    expect(html).toContain('aria-label="Help: Duration seconds"')
    expect(html).toContain('How long the step runs before moving on.')
  })

  it('keeps help keyboard reachable when the input is disabled', () => {
    const html = renderToStaticMarkup(createElement('fieldset', { disabled: true },
      createElement(HelpField, { help: 'Choose which video ends this step.' }, 'Completion video',
        createElement('select', null, createElement('option', null, 'Waterfall')))))
    expect(html).toMatch(/role="button"[^>]*tabindex="0"/)
    expect(html).toContain('aria-label="Help: Completion video"')
    expect(html).not.toContain('Help: Completion videoWaterfall')
  })

  it('flips above a bottom-edge trigger and stays inside a narrow viewport', () => {
    expect(placeFieldHelp({ left: 315, right: 359, top: 550, bottom: 594 }, { width: 320, height: 150 }, { width: 360, height: 640 }))
      .toEqual({ left: 28, top: 392 })
    const placement = placeFieldHelp({ left: 0, right: 44, top: 5, bottom: 49 }, { width: 250, height: 100 }, { width: 280, height: 480 })
    expect(placement).toEqual({ left: 12, top: 57 })
  })
})
