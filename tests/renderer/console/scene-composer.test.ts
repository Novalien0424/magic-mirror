import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SceneComposer } from '../../../src/renderer/console/SceneComposer'

it('exposes trigger settings without expanding options and names the icon-only removal control', () => {
  const props = {
    draft: { scenes: [{ id: 'scene', name: 'Show', enabled: true, stages: [] }],
      spells: [{ id: 'trigger', sceneId: 'scene', name: 'Legacy name', phrase: 'Start show', enabled: true, cooldownMs: 1200 }],
      sceneActions: [], musicAssets: [], visualAssets: [] },
    active: { scenes: [] }, disabled: false,
    onChange() {}, onRun() {}, onImport() {}, onSave() {}, onTest() {}, onStop() {},
    isSaved: () => true, saveUnavailableReason: '', testUnavailableReason: '', result: '',
  } as unknown as ComponentProps<typeof SceneComposer>
  const html = renderToStaticMarkup(createElement(SceneComposer, props))
  const triggers = html.match(/<section aria-label="Trigger Phrases"[^>]*>([\s\S]*?)<\/section>/)?.[1]
  expect(triggers).toBeDefined()
  expect(triggers).not.toContain('<details')
  expect(triggers).toMatch(/Trigger Phrase<input[^>]*value="Start show"/)
  expect(triggers).toMatch(/type="checkbox"[^>]*checked=""/)
  expect(triggers).toMatch(/Cooldown \(s\)<input[^>]*value="1.2"/)
  expect(triggers).toContain('aria-label="Remove Trigger Phrase"')
  expect(triggers).toContain('aria-hidden="true"')
  expect(triggers).toContain('Add Trigger Phrase')
})
