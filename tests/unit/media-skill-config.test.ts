import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { avatarCatalogSchema } from '../../src/main/avatar/avatar-config'
import { newAvatar, PROFILE_SECTIONS, workspaceChanges } from '../../src/renderer/console/profile-workspace'
import { mergeAvatarDraft, projectAvatarDraft } from '../../src/renderer/console/avatar-editor'
import { avatarCatalogFor, projectActiveAvatar } from '../../src/shared/avatar-profiles'
import type { ConsoleConfigDraftInput } from '../../src/shared/console-types'
import { DEFAULT_MEDIA_SKILL, type AvatarMediaResource } from '../../src/shared/media-skill'
import type { MirrorConfig } from '../../src/shared/types'

const video: AvatarMediaResource = { kind: 'video', assetId: 'clip', name: 'Lantern show', aliases: ['Lanterns'] }
const music: AvatarMediaResource = { kind: 'music', assetId: 'track', name: 'Quiet melody', aliases: ['Evening song'] }
function fixture(): MirrorConfig {
  const { schemaVersion: _version, ...baseline } = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
  return { ...baseline, avatarCatalog: { activeAvatarId: 'guide', avatars: [newAvatar('guide'), newAvatar('host')], locks: [], models: [] },
    visualAssets: [
      { id: 'clip', name: 'Library clip', kind: 'video', fileName: 'clip.mp4', mimeType: 'video/mp4', durationMs: 2000,
        byteLength: 100, sha256: 'a'.repeat(64), width: 1080, height: 1920, orientation: 'portrait', windowsDecode: 'passed', audioTrack: 'absent' },
      { id: 'still', name: 'Library image', kind: 'image', fileName: 'still.png', mimeType: 'image/png',
        byteLength: 100, sha256: 'b'.repeat(64), width: 1080, height: 1920, orientation: 'portrait', windowsDecode: 'passed', audioTrack: 'absent' },
    ],
    musicAssets: [{ id: 'track', name: 'Library track', fileName: 'track.wav', mimeType: 'audio/wav', byteLength: 100, sha256: 'c'.repeat(64) }],
  }
}
const skill = (config: MirrorConfig, index = 0) => config.avatarCatalog!.avatars[index]!.mediaSkill!
function errors(config: MirrorConfig): { path: PropertyKey[]; message: string }[] {
  const result = mirrorConfigSchema.safeParse(config)
  expect(result.success).toBe(false)
  return result.success ? [] : result.error.issues
}

describe('per-avatar media skill configuration', () => {
  it('ignores blank lines in optional aliases while retaining validation', () => {
    const config = fixture()
    skill(config).resources = [{ ...video, aliases: [' Lanterns ', '', '   '] }]
    expect(skill(mirrorConfigSchema.parse(config) as MirrorConfig).resources[0]!.aliases).toEqual(['Lanterns'])
  })
  it('has an independent default for new profiles and fills omitted skill fields', () => {
    expect(PROFILE_SECTIONS).toContain('Music & video')
    const first = newAvatar('first'), second = newAvatar('second')
    expect(first.mediaSkill).toEqual(DEFAULT_MEDIA_SKILL)
    first.mediaSkill!.resources.push(structuredClone(video))
    expect(second.mediaSkill!.resources).toEqual([])
    expect(DEFAULT_MEDIA_SKILL.resources).toEqual([])
    const config = fixture()
    Object.assign(config.avatarCatalog!.avatars[0]!, { mediaSkill: { gain: 0.35 } })
    const catalog = avatarCatalogSchema.parse(config.avatarCatalog)
    expect(catalog.avatars[0]!.mediaSkill).toEqual({ ...DEFAULT_MEDIA_SKILL, gain: 0.35 })
  })
  it('round-trips names, aliases and independent skill settings across activation', () => {
    const config = fixture()
    skill(config).resources = [structuredClone(video), structuredClone(music)]
    skill(config).fadeMs = 1200
    skill(config).gain = 0.4
    skill(config, 1).enabled = false
    skill(config, 1).resources = [structuredClone(music)]
    const saved = mirrorConfigSchema.parse(JSON.parse(JSON.stringify(config))) as MirrorConfig
    expect(skill(saved)).toEqual(skill(config))
    saved.avatarCatalog!.activeAvatarId = 'host'
    const switched = projectActiveAvatar(saved)
    expect(skill(switched)).toEqual(skill(config))
    expect(skill(switched, 1)).toEqual(skill(config, 1))
    const copy = avatarCatalogFor(switched)
    copy.avatars[0]!.mediaSkill!.resources[0]!.aliases.push('Different alias')
    expect(skill(switched).resources[0]!.aliases).toEqual(['Lanterns'])
  })
  it.each([['video', 'missing'], ['video', 'still'], ['video', 'track'], ['music', 'missing'], ['music', 'clip']] as const)(
    'rejects unavailable or wrong-kind resources: %s %s', (kind, assetId) => {
      const config = fixture()
      skill(config).resources = [{ kind, assetId, name: 'Requested media', aliases: [] }]
      expect(errors(config)).toContainEqual(expect.objectContaining({ path: ['avatarCatalog', 'avatars', 0, 'mediaSkill', 'resources', 0, 'assetId'] }))
    },
  )
  it.each(['video', 'music'] as const)('honors %s locks even when the media skill is disabled', kind => {
    const config = fixture()
    const resource = structuredClone(kind === 'video' ? video : music)
    skill(config).resources = [resource]
    config.avatarCatalog!.locks = [{ kind: kind === 'video' ? 'visual' : 'music', resourceId: resource.assetId, avatarId: 'guide' }]
    expect(mirrorConfigSchema.safeParse(config).success).toBe(true)
    skill(config).enabled = false
    config.avatarCatalog!.locks[0]!.avatarId = 'host'
    expect(errors(config)).toContainEqual(expect.objectContaining({ message: 'Unavailable avatar resource' }))
  })
  it.each([
    [video, { ...video, name: 'Another show', aliases: [] }],
    [video, { ...music, name: '  LANTERN SHOW ', aliases: [] }],
    [video, { ...music, aliases: ['Ｌａｎｔｅｒｎｓ'] }],
    [{ ...video, aliases: ['lantern show'] }],
    [{ ...video, aliases: ['Evening   song', 'evening song'] }],
  ])('rejects duplicate references, spoken names and aliases within an avatar', (...resources) => {
    const config = fixture()
    skill(config).resources = resources
    expect(errors(config).some(issue => issue.message.startsWith('Duplicate media'))).toBe(true)
  })
  it.each([
    { fadeMs: -1 }, { fadeMs: 0.5 }, { fadeMs: 10001 }, { fadeMs: Infinity },
    { gain: -0.1 }, { gain: 1.1 }, { gain: NaN }, { enabled: 'yes' },
    { resources: [{ ...video, name: ' ' }] }, { resources: [{ ...video, name: 'a'.repeat(121) }] },
    { resources: [{ ...video, aliases: ['Bad\nname'] }] },
    { resources: [{ ...video, aliases: Array.from({ length: 17 }, (_, i) => `Alias ${i}`) }] },
    { resources: [{ ...video, assetId: '/tmp/clip.mp4' }] },
    { resources: [{ ...video, assetId: 'https://example.invalid/clip.mp4' }] },
    { resources: [{ ...video, url: 'https://example.invalid/clip.mp4' }] },
    { path: '/tmp/clip.mp4' },
  ])('rejects invalid fields and unmanaged sources: %j', patch => {
    const config = fixture()
    Object.assign(skill(config), patch)
    expect(mirrorConfigSchema.safeParse(config).success).toBe(false)
  })
  it('accepts zero fade and gain, trims spoken labels, and defaults omitted aliases', () => {
    const config = fixture()
    Object.assign(skill(config), { fadeMs: 0, gain: 0, resources: [{ kind: 'video', assetId: 'clip', name: ' Lantern show ' }] })
    const parsed = mirrorConfigSchema.parse(config) as MirrorConfig
    expect(skill(parsed)).toEqual({ enabled: true, fadeMs: 0, gain: 0, resources: [{ kind: 'video', assetId: 'clip', name: 'Lantern show', aliases: [] }] })
  })
  it('retains skill edits in the shared draft through other avatar edits and attributes change scope', () => {
    const config = fixture()
    const guide = config.avatarCatalog!.avatars[0]!, host = config.avatarCatalog!.avatars[1]!
    guide.name = 'Guide'; host.name = 'Host'
    const before = projectAvatarDraft({ ...config, personaName: guide.name } as ConsoleConfigDraftInput)
    const edited = structuredClone(before)
    edited.avatarCatalog!.avatars[1]!.mediaSkill!.resources = [structuredClone(music)]
    const hostDraft = projectAvatarDraft(edited, 'host')
    const merged = mergeAvatarDraft(edited, { ...hostDraft, voice: 'cedar' }, 'host')
    expect(merged.avatarCatalog!.avatars[1]!.mediaSkill!.resources).toEqual([music])
    expect(merged.avatarCatalog!.avatars[0]!.mediaSkill!.resources).toEqual([])
    expect(workspaceChanges(before, merged)).toEqual(['Host · host'])
  })
})
