import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActiveAvatarPanel } from '../../src/renderer/console/ActiveAvatarPanel'
import { describe, expect, it } from 'vitest'
import { avatarDeletionReason, removeAvatarFromDraft } from '../../src/renderer/console/avatar-management'
import { newAvatar } from '../../src/renderer/console/profile-workspace'
import type { ConsoleConfigDraftInput, ConsoleConfigPayload } from '../../src/shared/console-types'

function draft(): ConsoleConfigDraftInput {
  return { avatarCatalog: { activeAvatarId: 'a', avatars: [newAvatar('a'), newAvatar('b')], models: [],
    locks: [{ kind: 'visual', resourceId: 'art', avatarId: 'b' }, { kind: 'music', resourceId: 'song', avatarId: 'a' }] },
    visualAssets: [{ id: 'art' }], musicAssets: [{ id: 'song' }], sceneActions: [] } as unknown as ConsoleConfigDraftInput
}

describe('avatar deletion from the draft', () => {
  it('protects the active avatar and the last avatar', () => {
    const value = draft()
    expect(avatarDeletionReason(value.avatarCatalog, 'a', 'a')).toContain('Switch')
    expect(() => removeAvatarFromDraft(value, 'a', 'a')).toThrow()
    value.avatarCatalog!.avatars = [newAvatar('b')]
    value.avatarCatalog!.activeAvatarId = 'b'
    expect(avatarDeletionReason(value.avatarCatalog, 'b', 'a')).toContain('at least one')
  })

  it('removes only the chosen profile and its access locks, retaining shared resources and other edits', () => {
    const value = draft()
    value.avatarCatalog!.avatars[0].name = 'Unsaved name'
    const before = structuredClone(value)
    const result = removeAvatarFromDraft(value, 'b', 'a')
    expect(result.avatarCatalog!.avatars.map(a => a.id)).toEqual(['a'])
    expect(result.avatarCatalog!.avatars[0].name).toBe('Unsaved name')
    expect(result.avatarCatalog!.activeAvatarId).toBe('a')
    expect(result.avatarCatalog!.locks).toEqual([before.avatarCatalog!.locks[1]])
    expect(result.visualAssets).toEqual(before.visualAssets)
    expect(result.musicAssets).toEqual(before.musicAssets)
    expect(result.sceneActions).toEqual(before.sceneActions)
    expect(value).toEqual(before)
  })

  it('rejects missing/stale selection and protects the draft active reference too', () => {
    expect(() => removeAvatarFromDraft(draft(), 'missing', 'a')).toThrow()
    expect(() => removeAvatarFromDraft(draft(), 'a', 'b')).toThrow()
  })
})

it('excludes previously deleted draft profiles from Mirror options while showing the current active avatar', () => {
  const active = draft()
  const savedDraft = removeAvatarFromDraft(active, 'b', 'a')
  const payload = { active, draft: savedDraft, publishDiff: { changed: [{}] } } as unknown as ConsoleConfigPayload
  const html = renderToStaticMarkup(createElement(ActiveAvatarPanel, { payload, bridge: null, editing: false,
    lifecycle: 'dormant', onChanged: () => undefined, onEdit: () => undefined }))
  expect(html).not.toContain('<option value="b"')
  expect(html).toContain('<option value="a"')
  expect(html).toContain('Already on the Mirror.')
})
