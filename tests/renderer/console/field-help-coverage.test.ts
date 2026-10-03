import React, { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AvatarCharacterEditor } from '../../../src/renderer/console/AvatarCharacterEditor'
import { PresentationEditor } from '../../../src/renderer/console/PresentationEditor'
import { SceneActionFields, newSceneAction } from '../../../src/renderer/console/SceneActionFields'
import { DEFAULT_PRESENTATION } from '../../../src/shared/presentation'
import type { AvatarProfile } from '../../../src/shared/avatar-profiles'
import type { ConsoleConfigDraftInput } from '../../../src/shared/console-types'
import type { SceneActionDefinition } from '../../../src/shared/types'

function expectDescriptions(element: ReactElement): void {
  const html = renderToStaticMarkup(element)
  const controls = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)]
  expect(controls.length).toBeGreaterThan(0)
  for (const [control] of controls) {
    const ids = control.match(/aria-describedby="([^"]+)"/)?.[1].split(' ')
    expect(ids, control).toBeDefined()
    for (const id of ids ?? []) {
      const description = html.slice(html.indexOf(`id="${id}"`)).match(/^[^>]*>([^<]+)/)?.[1]
      expect(description?.length ?? 0, control).toBeGreaterThan(40)
    }
  }
}
const noop = () => undefined
const draft = { presentation: DEFAULT_PRESENTATION, musicAssets: [], visualAssets: [] } as unknown as ConsoleConfigDraftInput

describe('rendered field descriptions', () => {
  // The app uses Vite's automatic JSX runtime; the Node runner uses classic JSX.
  beforeAll(() => {
    vi.stubGlobal('React', React)
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 })
  })
  afterAll(() => vi.unstubAllGlobals())
  it('describes persona fields even when editing is disabled', () => {
    const avatar = { name: 'Host', personality: 'A friendly host', idleSeconds: 300,
      speakingStyle: 'Clear', presentation: DEFAULT_PRESENTATION } as AvatarProfile
    expectDescriptions(createElement(AvatarCharacterEditor, { avatar, disabled: true, onChange: noop }))
  })
  it('describes every presentation choice and range', () => {
    expectDescriptions(createElement(PresentationEditor, { draft, disabled: false, onChange: noop }))
  })
  const base = { id: 'action', name: 'Action', enabled: true }
  const actions: SceneActionDefinition[] = [
    ...(['avatar_dialogue', 'avatar_motion', 'avatar_expression', 'lighting', 'fog'] as const).map(kind => newSceneAction(kind, 0)),
    { ...base, kind: 'lighting', command: 'value', value: 0.5, presetId: 'default' },
    { ...base, kind: 'fog', command: 'off', presetId: 'default' },
    { ...base, kind: 'music', command: 'play', assetId: '', gain: 1, loop: true },
    { ...base, kind: 'music', command: 'stop', fadeDurationMs: 0 },
    { ...base, kind: 'music', command: 'fade', targetGain: 0.5, durationMs: 1000 },
    { ...base, kind: 'visual', assetId: '', fit: 'contain', playback: 'still', audio: 'muted', gain: 0 },
    { ...base, kind: 'visual', assetId: '', fit: 'cover', playback: 'once', audio: 'embedded', gain: 1 },
    { ...base, kind: 'visual', assetId: '', fit: 'cover', playback: 'loop', audio: 'muted', gain: 0 },
  ]
  it.each(actions)('describes conditional action fields: $kind $command $playback $audio', action => {
    expectDescriptions(createElement(SceneActionFields, { action, draft, onChange: noop }))
  })
})
