import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { avatarCatalogFor, projectActiveAvatar } from '../../src/shared/avatar-profiles'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { applyVoiceProfile, matchingVoiceProfile, VOICE_PROFILES } from '../../src/shared/voice-profiles'
import type { MirrorConfig } from '../../src/shared/types'

const config = (): MirrorConfig => {
  const { schemaVersion: _version, ...value } = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
  return value as MirrorConfig
}

describe('named voice profiles', () => {
  it('applies complete voice settings without changing character, media or commands', () => {
    const original = avatarCatalogFor(config()).avatars[0]!
    for (const profile of VOICE_PROFILES) {
      const result = applyVoiceProfile(original, profile)
      expect(result).toEqual({ ...original, voice: profile.voice, voiceSpeed: profile.voiceSpeed,
        speakingStyle: profile.speakingStyle, voiceEffects: profile.voiceEffects })
      expect(result.voiceEffects).not.toBe(profile.voiceEffects)
      expect(matchingVoiceProfile(result)?.id).toBe(profile.id)
      expect(matchingVoiceProfile({ ...result, voiceSpeed: 1.25 })).toBeUndefined()
      expect(matchingVoiceProfile({ ...result, voiceEffects: { ...result.voiceEffects!, enabled: false } })).toBeUndefined()
    }
    expect(original.voiceEffects?.enabled).not.toBe(true)
  })

  it('persists independent profiles through validation and active-avatar projection', () => {
    const value = config(), catalog = avatarCatalogFor(value), original = catalog.avatars[0]!
    catalog.avatars = VOICE_PROFILES.map(profile => applyVoiceProfile({ ...original, id: profile.id, name: profile.name }, profile))
    catalog.activeAvatarId = catalog.avatars[0]!.id
    value.avatarCatalog = catalog
    const saved = mirrorConfigSchema.parse(JSON.parse(JSON.stringify(projectActiveAvatar(value)))) as MirrorConfig
    expect(saved.avatarCatalog!.avatars.map(a => matchingVoiceProfile(a)?.id)).toEqual(['talos-priestess', 'talos-god'])
    saved.avatarCatalog!.activeAvatarId = 'talos-god'
    expect(projectActiveAvatar(saved).voice).toBe('cedar')
    expect(saved.avatarCatalog!.avatars[0]!.voice).toBe('marin')
  })
})
