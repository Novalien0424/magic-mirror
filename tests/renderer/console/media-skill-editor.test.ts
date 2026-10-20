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
  it('uses folder authorization without redundant selection or enable checkboxes', () => {
    const ui = editor({ emptyLibrary: true })
    const html = ui.render()
    expect(html).toContain('<details class="media-playback-settings"><summary>Playback settings</summary>')
    expect(html).not.toMatch(/type="checkbox"|No media selected|Upload music|Enable media/)
    expect(ui.control('Media fade duration').props.value).toBe(DEFAULT_MEDIA_SKILL.fadeMs)
    expect(ui.control('Media gain').props.value).toBe(DEFAULT_MEDIA_SKILL.gain)
  })
  it('changes fade and volume while retaining imported entries and other avatar settings', () => {
    const avatar = newAvatar('guide')
    avatar.mediaSkill!.resources = [{ kind: 'video', assetId: 'clip', name: 'Old clip', aliases: ['Sky'] }]
    const ui = editor({ avatar })
    ui.change('Media fade duration', '1400'); ui.change('Media gain', '0.35')
    expect(ui.avatar).toEqual({ ...avatar, mediaSkill: { ...avatar.mediaSkill, fadeMs: 1400, gain: .35 } })
    expect(ui.render()).toContain('Previously imported files')
    ui.click('Remove Old clip from media skill')
    expect(ui.avatar.mediaSkill!.resources).toEqual([])
    expect(avatar.mediaSkill!.resources).toHaveLength(1)
  })
  it('preserves disabled editing and describes both playback controls', () => {
    const ui = editor({ disabled: true })
    ui.change('Media fade duration', '1000'); ui.change('Media gain', '0.5')
    expect(ui.changes).toEqual([])
    const html = ui.render()
    expect(html).toMatch(/<fieldset disabled="" aria-label="Media skill"/)
    const controls = [...html.matchAll(/<input\b[^>]*>/g)]
    expect(controls).toHaveLength(2)
    for (const [control] of controls) expect(control).toContain('aria-describedby=')
  })
})
