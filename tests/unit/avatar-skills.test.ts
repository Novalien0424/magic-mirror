import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { newAvatar, workspaceChanges } from '../../src/renderer/console/profile-workspace'
import { avatarCatalogFor, type AvatarProfile } from '../../src/shared/avatar-profiles'
import { avatarProfileSessionSettings, avatarRealtimeTools, buildAvatarPrompt, buildStudioPrompt, parseAvatarSessionSettings, studioToolSpecs } from '../../src/shared/avatar-prompt'
import { parseAvatarSkills } from '../../src/shared/avatar-skills'
import { inspectAvatarPrompts } from '../../src/shared/prompt-inspection'
import type { MirrorConfig } from '../../src/shared/types'

describe('per-avatar image skill assignments', () => {
  it('migrates legacy avatars without disabling working modes and persists independent selections', () => {
    const { schemaVersion: _v, ...legacy } = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
    const avatars = [newAvatar('artist'), newAvatar('guide')]
    delete avatars[0]!.skills
    const config = mirrorConfigSchema.parse({ ...legacy, avatarCatalog: { activeAvatarId: 'artist', avatars, locks: [], models: [] } }) as MirrorConfig
    expect(config.avatarCatalog!.avatars[0]!.skills).toEqual({ imageGeneration: true })
    expect(avatarCatalogFor(legacy).avatars[0]!.skills).toEqual({ imageGeneration: true })
    const changed = structuredClone(config)
    changed.avatarCatalog!.avatars[1]!.skills!.imageGeneration = false
    const saved = mirrorConfigSchema.parse(JSON.parse(JSON.stringify(changed))) as MirrorConfig
    expect(saved.avatarCatalog!.avatars.map(a => a.skills!.imageGeneration)).toEqual([true, false])
    expect(config.avatarCatalog!.avatars[1]!.skills!.imageGeneration).toBe(true)
    expect(workspaceChanges({ ...config, personaName: config.persona.name }, { ...saved, personaName: saved.persona.name }))
      .toEqual([expect.stringContaining('guide')])
  })
  it.each([null, [], {}, { imageGeneration: 'false' }, { imageGeneration: true, anything: true }])('rejects malformed assignments %#', value => {
    expect(parseAvatarSkills(value)).toBeNull()
    const settings = avatarProfileSessionSettings(newAvatar('guide'), 'Hello')
    expect(parseAvatarSessionSettings({ ...settings, skills: value })).toBeNull()
  })
  it('uses the same selection for native tools, prompts and the draft inspector in both modes', () => {
    const avatar: AvatarProfile = { ...newAvatar('guide'), skills: { imageGeneration: false } }
    const settings = avatarProfileSessionSettings(avatar, 'Hello')
    const names = avatarRealtimeTools(settings).map(tool => tool.name)
    expect(names).toContain('look_at_surroundings')
    expect(names).toContain('return_to_dormant')
    for (const name of ['create_image', 'edit_image', 'dismiss_image', 'start_portrait_studio']) expect(names).not.toContain(name)
    expect(studioToolSpecs(settings)).toEqual([])
    expect(buildAvatarPrompt(settings)).not.toMatch(/create_image|edit_image|studio_use_photo/)
    expect(buildStudioPrompt(settings)).toBe(buildAvatarPrompt(settings))
    const inspector = inspectAvatarPrompts(avatar, [])
    expect(inspector.pages.Session[0]!.content).toContain('disabled')
    expect(inspector.pages['Tools & input'].some(s => /create_image|studio_use_photo/.test(s.title))).toBe(false)
    expect(inspector.pages.Session.some(s => s.title.includes('image prompt'))).toBe(false)
    avatar.skills!.imageGeneration = true
    const enabled = avatarProfileSessionSettings(avatar, 'Hello')
    expect(avatarRealtimeTools(enabled).map(tool => tool.name)).toContain('create_image')
    expect(studioToolSpecs(enabled).map(tool => tool.name)).toContain('studio_use_photo')
    expect(settings.skills!.imageGeneration).toBe(false)
  })
})
