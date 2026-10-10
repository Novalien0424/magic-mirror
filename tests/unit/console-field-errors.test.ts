import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { FieldErrorsContext, focusInvalidField, resolveFieldErrors } from '../../src/renderer/console/field-errors'
import { HelpField } from '../../src/renderer/console/HelpField'
import { NumberInput } from '../../src/renderer/console/NumberInput'
import { AvatarCharacterEditor } from '../../src/renderer/console/AvatarCharacterEditor'
import { SceneActionFields } from '../../src/renderer/console/SceneActionFields'
import { SceneComposer } from '../../src/renderer/console/SceneComposer'
import { PresentationEditor } from '../../src/renderer/console/PresentationEditor'
import type { ConsoleConfigDraftInput, ConsoleConfigSafeView } from '../../src/shared/console-types'
import type { AvatarProfile } from '../../src/shared/avatar-profiles'

const noop = () => undefined
function fixtureDraft(): ConsoleConfigDraftInput {
  const avatar = (id: string): AvatarProfile => ({ id, name: 'Fixture avatar', personality: 'Fixture character',
    speakingStyle: '', voice: 'alloy', modelId: 'builtin-ren', idleSeconds: 300,
    presentation: { mode: 'always_visible', backgroundId: '', ambienceId: '', ambienceGain: .25,
      entranceMs: 1800, exitMs: 1800, sleepFarewell: 'Fixture farewell' },
    scenes: [{ id: `${id}-scene`, name: 'Fixture scene', enabled: true, stages: [{
      id: `${id}-step`, name: 'Fixture step', actionIds: ['linked-action'], endCondition: { kind: 'duration', durationMs: 3000 },
    }] }],
    spells: [{ id: `${id}-trigger`, name: 'Fixture trigger', phrase: 'Fixture phrase', enabled: true, sceneId: `${id}-scene`, cooldownMs: 5000 }],
  })
  const first = avatar('first'), second = avatar('second')
  return { avatarCatalog: { activeAvatarId: first.id, avatars: [first, second], models: [], locks: [] },
    personaName: first.name, voice: first.voice, idleSeconds: first.idleSeconds,
    scenes: first.scenes, spells: first.spells, presentation: first.presentation,
    sceneActions: [{ id: 'unlinked-action', name: 'Fixture action', enabled: true, kind: 'music', command: 'stop', fadeDurationMs: 0 },
      { id: 'linked-action', name: 'Fixture dialogue', enabled: true, kind: 'avatar_dialogue', text: 'Fixture line' }],
    visualAssets: [], musicAssets: [], wake: { phrase: 'Fixture wake', modelVersion: 'fixture', packageId: 'fixture' },
    faceModel: { detectorId: 'fixture', recognizerId: 'fixture' },
    assets: { offlineLoopVideo: 'fixture.mp4', avatarDir: 'fixture', musicDir: 'fixture' },
    adapters: { lighting: 'mock', fog: 'mock', music: 'mock' } }
}
function inputAt(html: string, path: string): string {
  return [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map(match => match[0])
    .find(control => control.includes(`data-field-path="${path}"`)) ?? ''
}
function withErrors(element: React.ReactElement, fields: readonly { path: string; message: string }[]): string {
  return renderToStaticMarkup(createElement(FieldErrorsContext.Provider, { value: { errors: fields, focus: fields[0] ?? null } }, element))
}

describe('CX-07 inline field validation', () => {
  beforeAll(() => {
    vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 })
  })
  afterAll(() => vi.unstubAllGlobals())

  it('routes errors for a non-active avatar, trigger and step to their actual editor fields', () => {
    const targets = resolveFieldErrors([
      { path: 'avatarCatalog.avatars[1].name', message: 'too_small' },
      { path: 'avatarCatalog.avatars.1.spells.0.phrase', message: 'too_small' },
      { path: 'avatarCatalog.avatars[1].scenes[0].stages[0].endCondition.durationMs', message: 'too_small' },
    ], fixtureDraft(), 'first')
    expect(targets[0]).toMatchObject({ path: 'avatar.second.name', avatarId: 'second', section: 'Persona' })
    expect(targets[1]).toMatchObject({ path: 'avatar.second.spells.second-trigger.phrase', avatarId: 'second', sceneId: 'second-scene', section: 'Spells & scenes' })
    expect(targets[2]).toMatchObject({ path: 'avatar.second.scenes.second-scene.stages.second-step.endCondition.durationMs', sceneId: 'second-scene', stepId: 'second-step' })
  })

  it('uses global action IDs despite filtering, and finds the preferred avatar’s linked step', () => {
    for (const path of ['sceneActions[1].text', 'avatarCatalog.avatars[1].sceneActions[1].text']) {
      expect(resolveFieldErrors([{ path, message: 'too_small' }], fixtureDraft(), 'second')[0]).toMatchObject({
        path: 'sceneActions.linked-action.text', avatarId: 'second', sceneId: 'second-scene', stepId: 'second-step', actionId: 'linked-action', section: 'Spells & scenes',
      })
    }
    expect(resolveFieldErrors([{ path: 'sceneActions[0]', message: 'invalid_union' }], fixtureDraft(), 'second')[0])
      .toMatchObject({ path: 'sceneActions.unlinked-action.kind', section: 'Action library' })
  })

  it('keeps partial-save scene and step identities when array order differs from the editor', () => {
    const submitted = fixtureDraft()
    const second = submitted.avatarCatalog!.avatars[1]!
    second.scenes[0]!.stages.unshift({ id: 'partial-save-step', name: 'Fixture step', actionIds: [], endCondition: { kind: 'duration', durationMs: 1000 } })
    expect(resolveFieldErrors([{ path: 'avatarCatalog.avatars[1].scenes[0].stages[0].actionIds', message: 'too_small' }], submitted, 'second')[0])
      .toMatchObject({ path: 'avatar.second.scenes.second-scene.stages.partial-save-step.actionIds', stepId: 'partial-save-step' })
    expect(resolveFieldErrors([{ path: 'scenes[0].stages[0].endCondition', message: 'stage_end_condition_invalid' }], submitted, 'second')[0])
      .toMatchObject({ path: 'avatar.first.scenes.first-scene.stages.first-step.endCondition.kind', avatarId: 'first' })
  })

  it('links server errors to native fields and preserves numeric invalid state with valid local bounds', () => {
    const html = withErrors(createElement(HelpField, { help: 'Fixture explanation', fieldPath: 'duration' },
      'Duration', createElement(NumberInput, { value: 3, min: 1, max: 10, 'aria-describedby': 'existing' })), [{ path: 'duration', message: 'too_small' }])
    const input = inputAt(html, 'duration')
    const errorId = input.match(/aria-errormessage="([^"]+)"/)![1]
    expect(input).toContain('aria-invalid="true"')
    expect(input).toMatch(/aria-describedby="existing [^"]+"/)
    expect(input).toContain(errorId)
    expect(html).toContain(`id="${errorId}" class="field-error"`)
    expect(html).toContain('required text cannot be empty')
  })

  it('shows selected-avatar and action errors beside the exact textarea/input', () => {
    const draft = fixtureDraft(), avatar = draft.avatarCatalog!.avatars[1]!
    const html = withErrors(createElement(AvatarCharacterEditor, { avatar, disabled: false, onChange: noop }),
      resolveFieldErrors([{ path: 'avatarCatalog.avatars[1].personality', message: 'too_big' }], draft, 'first'))
    expect(inputAt(html, 'avatar.second.personality')).toContain('aria-invalid="true"')
    expect(inputAt(html, 'avatar.second.name')).not.toContain('aria-invalid="true"')
    const actionHtml = withErrors(createElement(SceneActionFields, { action: draft.sceneActions[1]!, draft, onChange: noop }),
      resolveFieldErrors([{ path: 'sceneActions[1].text', message: 'too_small' }], draft, 'second'))
    expect(inputAt(actionHtml, 'sceneActions.linked-action.text')).toContain('aria-invalid="true"')
    avatar.name = ''
    const blank = withErrors(createElement(AvatarCharacterEditor, { avatar, disabled: false, onChange: noop }), [])
    expect(inputAt(blank, 'avatar.second.name')).toContain('aria-errormessage=')
    expect(blank).toContain('Enter an avatar name.')
  })

  it('renders trigger, duration and action-link errors inline in the scene composer', () => {
    const draft = fixtureDraft()
    const errors = resolveFieldErrors([
      { path: 'spells[0].phrase', message: 'normalized_spell_collision' },
      { path: 'scenes[0].stages[0].endCondition.durationMs', message: 'too_small' },
      { path: 'scenes[0].stages[0].actionIds', message: 'too_small' },
    ], draft, 'first')
    const html = withErrors(createElement(SceneComposer, { draft, avatarId: 'first', active: { ...draft, configVersion: 1 } as ConsoleConfigSafeView,
      disabled: false, onChange: noop, onRun: noop, onImport: noop, onSave: noop, onTest: noop, onStop: noop,
      isSaved: () => false, saveUnavailableReason: '', testUnavailableReason: '', result: '' }), errors)
    expect(inputAt(html, errors[0]!.path)).toContain('aria-invalid="true"')
    expect(inputAt(html, errors[1]!.path)).toContain('aria-invalid="true"')
    expect(html).toContain('Use a trigger phrase that is different')
    expect(html).toContain('Add or link at least one action')
    expect(html).toMatch(/role="group"[^>]*tabindex="-1"[^>]*aria-invalid="true"/)
  })

  it('marks presentation timing locally and routes a parent schema error to the offending field', () => {
    const draft = fixtureDraft(), avatar = draft.avatarCatalog!.avatars[1]!
    avatar.presentation = { ...avatar.presentation, mode: 'reflective', blackHoldMs: 2000, revealStartMs: 1000 }
    const errors = resolveFieldErrors([{ path: 'avatarCatalog.avatars[1].presentation', message: 'custom' }], draft, 'first')
    expect(errors[0]).toMatchObject({ path: 'avatar.second.presentation.blackHoldMs', section: 'Appearance' })
    const html = withErrors(createElement(PresentationEditor, { draft: { ...draft, presentation: avatar.presentation }, avatarId: 'second', disabled: false, onChange: noop }), errors)
    expect(inputAt(html, errors[0]!.path)).toContain('aria-invalid="true"')
    expect(html).toContain('Black hold must finish at or before the reveal starts.')
    avatar.presentation.sleepFarewell = ''
    expect(resolveFieldErrors([{ path: 'avatarCatalog.avatars[1].presentation', message: 'custom' }], draft, 'first')[0])
      .toMatchObject({ path: 'avatar.second.presentation.sleepFarewell', section: 'Persona' })
  })

  it('focuses the requested enabled field, opens collapsed details, and leaves unrelated controls alone', () => {
    const details = { tagName: 'DETAILS', open: false, parentElement: null }
    const control = (path: string, disabled = false) => ({ dataset: { fieldPath: path }, parentElement: details,
      matches: () => disabled, closest: () => null, focus: vi.fn(), scrollIntoView: vi.fn() })
    const disabled = control('second', true), first = control('first'), second = control('second')
    const root = { querySelectorAll: () => [disabled, first, second] } as unknown as ParentNode
    expect(focusInvalidField(root, 'second')).toBe(true)
    expect(details.open).toBe(true)
    expect(second.focus).toHaveBeenCalledOnce()
    expect(second.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(first.focus).not.toHaveBeenCalled()
    expect(disabled.focus).not.toHaveBeenCalled()
    expect(focusInvalidField(root, 'missing')).toBe(false)
    expect(focusInvalidField(root)).toBe(true)
    expect(first.focus).toHaveBeenCalledOnce()
  })
})
