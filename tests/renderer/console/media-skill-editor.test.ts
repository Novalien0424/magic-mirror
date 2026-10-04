import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MediaSkillEditor } from '../../../src/renderer/console/MediaSkillEditor'
import { newAvatar } from '../../../src/renderer/console/profile-workspace'
import type { AvatarProfile } from '../../../src/shared/avatar-profiles'
import { DEFAULT_MEDIA_SKILL } from '../../../src/shared/media-skill'
import type { ManagedVisualAsset } from '../../../src/shared/types'

type Props = React.ComponentProps<typeof MediaSkillEditor>
type Element = React.ReactElement<Record<string, unknown>>
function elements(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : [])
}
function fixture(avatar: AvatarProfile): Props['draft'] {
  const clip: ManagedVisualAsset = { id: 'clip', name: 'Library clip', kind: 'video', fileName: 'managed-clip.mp4', mimeType: 'video/mp4',
    durationMs: 2000, byteLength: 100, sha256: 'a'.repeat(64), width: 1080, height: 1920, orientation: 'portrait', windowsDecode: 'passed', audioTrack: 'absent' }
  return {
    avatarCatalog: { activeAvatarId: avatar.id, avatars: [avatar, newAvatar('host')], locks: [
      { kind: 'visual', resourceId: 'locked-clip', avatarId: 'host' },
      { kind: 'music', resourceId: 'locked-track', avatarId: 'host' },
    ], models: [] },
    visualAssets: [clip, { ...clip, id: 'locked-clip', name: 'Locked clip' },
      { id: 'still', name: 'Library image', kind: 'image', fileName: 'managed-still.png', mimeType: 'image/png',
        byteLength: 100, sha256: 'b'.repeat(64), width: 1080, height: 1920, orientation: 'portrait', windowsDecode: 'passed', audioTrack: 'absent' }],
    musicAssets: [{ id: 'track', name: 'Library track', fileName: 'managed-track.wav', mimeType: 'audio/wav', byteLength: 100, sha256: 'c'.repeat(64) },
      { id: 'locked-track', name: 'Locked track', fileName: 'managed-locked.wav', mimeType: 'audio/wav', byteLength: 100, sha256: 'd'.repeat(64) }],
  }
}
function editor(options: { avatar?: AvatarProfile; disabled?: boolean; emptyLibrary?: boolean } = {}) {
  let avatar = options.avatar ?? newAvatar('guide')
  const library = fixture(avatar)
  const draft = options.emptyLibrary ? { ...library, visualAssets: [], musicAssets: [] } : library
  const changes: AvatarProfile[] = []
  const props = (): Props => ({ avatar, draft, disabled: options.disabled ?? false, onChange(next) { avatar = next; changes.push(next) } })
  const tree = () => MediaSkillEditor(props())
  const control = (label: string): Element => {
    const element = elements(tree()).find(element => element.props['aria-label'] === label)
    expect(element, `Missing control: ${label}`).toBeDefined()
    return element!
  }
  return {
    get avatar() { return avatar }, draft, changes, control,
    render: () => renderToStaticMarkup(React.createElement(MediaSkillEditor, props())),
    change(label: string, value: string, checked = false) {
      const onChange = control(label).props.onChange as React.ChangeEventHandler<HTMLInputElement>
      onChange({ currentTarget: { value, checked } } as React.ChangeEvent<HTMLInputElement>)
    },
    click(label: string) {
      const onClick = control(label).props.onClick as () => void
      onClick()
    },
  }
}

describe('MediaSkillEditor', () => {
  it('shows enabled defaults, once/loop/stop instructions, and an actionable empty list', () => {
    const avatar = newAvatar('guide')
    delete avatar.mediaSkill
    const ui = editor({ avatar, emptyLibrary: true })
    const html = ui.render()
    expect(html).toContain('No media selected. Upload music or video above, or check a file in the list.')
    expect(html).toContain('play [name] once')
    expect(html).toContain('loop [name]')
    expect(html).toContain('stop media')
    expect(html).toContain('Save &amp; apply all changes')
    expect(ui.control('Enable media skill').props.checked).toBe(true)
    expect(ui.control('Media fade duration').props.value).toBe(DEFAULT_MEDIA_SKILL.fadeMs)
    expect(ui.control('Media gain').props.value).toBe(DEFAULT_MEDIA_SKILL.gain)
    expect(avatar.mediaSkill).toBeUndefined()
    expect(html).not.toMatch(/<video|<audio|type="file"|https?:\/\/|managed-clip\.mp4/)
  })
  it('offers only available library videos and music, excluding images and cross-avatar locks', () => {
    const ui = editor()
    const html = ui.render()
    expect(html).toContain('data-asset-id="clip"')
    expect(html).toContain('data-asset-id="track"')
    expect(html).not.toContain('Library image')
    expect(html).not.toContain('Locked clip')
    expect(html).not.toContain('Locked track')
    expect(ui.changes).toEqual([])
    ui.draft.avatarCatalog!.locks[0]!.avatarId = 'guide'
    expect(ui.render()).toContain('data-asset-id="locked-clip"')
  })
  it('adds both media kinds once and removes entries without modifying the library or source avatar', () => {
    const source = newAvatar('guide'), ui = editor({ avatar: source })
    const library = structuredClone({ visualAssets: ui.draft.visualAssets, musicAssets: ui.draft.musicAssets })
    ui.change('Allow video Library clip', '', true)
    ui.change('Allow video Library clip', '', true)
    ui.change('Allow music Library track', '', true)
    expect(ui.avatar.mediaSkill!.resources).toEqual([
      { kind: 'video', assetId: 'clip', name: 'Library clip', aliases: [] },
      { kind: 'music', assetId: 'track', name: 'Library track', aliases: [] },
    ])
    expect(ui.avatar.mediaSkill!.resources).toHaveLength(2)
    ui.click('Remove Library clip from media skill')
    expect(ui.avatar.mediaSkill!.resources).toEqual([{ kind: 'music', assetId: 'track', name: 'Library track', aliases: [] }])
    expect(ui.control('Allow video Library clip').props.checked).toBe(false)
    expect({ visualAssets: ui.draft.visualAssets, musicAssets: ui.draft.musicAssets }).toEqual(library)
    expect(source.mediaSkill!.resources).toEqual([])
    expect(DEFAULT_MEDIA_SKILL.resources).toEqual([])
  })
  it('edits names, multiline aliases and per-avatar controls while retaining other profile settings', () => {
    const ui = editor()
    const before = structuredClone(ui.avatar)
    ui.change('Allow video Library clip', '', true)
    ui.change('Spoken name for video Library clip', 'Lantern show')
    ui.change('Aliases for video Library clip', 'Lanterns\nEvening lights\n')
    expect(ui.control('Aliases for video Library clip').props.value).toBe('Lanterns\nEvening lights\n')
    ui.change('Aliases for video Library clip', 'Lanterns\r\nEvening lights')
    ui.change('Media fade duration', '1400')
    ui.change('Media gain', '0.35')
    ui.change('Enable media skill', '', false)
    expect(ui.avatar.mediaSkill).toEqual({ enabled: false, fadeMs: 1400, gain: 0.35, resources: [
      { kind: 'video', assetId: 'clip', name: 'Lantern show', aliases: ['Lanterns', 'Evening lights'] },
    ] })
    const { mediaSkill: _before, ...otherBefore } = before
    const { mediaSkill: _after, ...otherAfter } = ui.avatar
    expect(otherAfter).toEqual(otherBefore)
    expect(ui.render()).toContain('Media skill is disabled for this avatar')
    ui.change('Aliases for video Library clip', '')
    expect(ui.avatar.mediaSkill!.resources[0]!.aliases).toEqual([])
  })
  it('makes unavailable configured resources visible and removable', () => {
    const avatar = newAvatar('guide')
    avatar.mediaSkill!.resources = [
      { kind: 'video', assetId: 'still', name: 'Wrong kind', aliases: [] },
      { kind: 'music', assetId: 'locked-track', name: 'Locked track', aliases: [] },
    ]
    const ui = editor({ avatar })
    expect(ui.render().match(/role="alert"/g)).toHaveLength(2)
    expect(ui.render()).toContain('Remove it or update its library access before saving.')
    ui.click('Remove Wrong kind from media skill')
    ui.click('Remove Locked track from media skill')
    expect(ui.avatar.mediaSkill!.resources).toEqual([])
  })
  it('blocks all mutations when the Console editor is disabled', () => {
    const avatar = newAvatar('guide')
    avatar.mediaSkill!.resources = [{ kind: 'video', assetId: 'clip', name: 'Library clip', aliases: [] }]
    const ui = editor({ avatar, disabled: true })
    expect(ui.render()).toMatch(/<fieldset disabled="" aria-label="Media skill"/)
    ui.change('Enable media skill', '', false)
    ui.change('Media fade duration', '1000')
    ui.change('Media gain', '0.5')
    ui.change('Allow music Library track', '', true)
    ui.change('Spoken name for video Library clip', 'Edited')
    ui.change('Aliases for video Library clip', 'Alias')
    ui.click('Remove Library clip from media skill')
    expect(ui.changes).toEqual([])
  })
  it('describes every editable field even when disabled', () => {
    const avatar = newAvatar('guide')
    avatar.mediaSkill!.resources = [{ kind: 'music', assetId: 'track', name: 'Library track', aliases: ['Tune'] }]
    const html = editor({ avatar, disabled: true }).render()
    const controls = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)]
    expect(controls).toHaveLength(7)
    for (const [control] of controls) {
      const id = control.match(/aria-describedby="([^"]+)"/)?.[1]
      expect(id, control).toBeDefined()
      const description = html.slice(html.indexOf(`id="${id}"`)).match(/^[^>]*>([^<]+)/)?.[1]
      expect(description?.length ?? 0, control).toBeGreaterThan(40)
    }
  })
})
