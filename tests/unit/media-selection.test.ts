import { describe, expect, it } from 'vitest'
import { addAvatarMedia } from '../../src/renderer/console/media-selection'
import { newAvatar } from '../../src/renderer/console/profile-workspace'
import type { ImportedMedia } from '../../src/shared/media-import'

describe('avatar media selection', () => {
  const asset = (id: string, name: string) => ({ id, name } as ImportedMedia)
  it('deduplicates imports and gives colliding spoken names distinct defaults', () => {
    const avatar = newAvatar('guide')
    avatar.mediaSkill!.resources = [{ kind: 'video', assetId: 'clip', name: 'Night', aliases: ['Rain'] }]
    const next = addAvatarMedia(avatar, [asset('a', 'RAIN'), asset('a', 'RAIN'), asset('b', 'Night')])
    expect(next.mediaSkill!.resources.map(r => r.name)).toEqual(['Night', 'RAIN (2)', 'Night (2)'])
    expect(avatar.mediaSkill!.resources).toHaveLength(1)
  })
  it('excludes still images and media locked to another avatar', () => {
    const avatar = newAvatar('guide')
    const catalog = { avatars: [avatar, newAvatar('host')], activeAvatarId: 'guide', models: [], locks: [{ kind: 'music' as const, resourceId: 'locked', avatarId: 'host' }] }
    expect(addAvatarMedia(avatar, [asset('locked', 'Locked'), { ...asset('still', 'Still'), kind: 'image' } as ImportedMedia], catalog).mediaSkill!.resources).toEqual([])
  })
})
