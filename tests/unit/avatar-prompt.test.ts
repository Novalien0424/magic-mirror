import { describe, expect, it } from 'vitest'
import { buildAvatarPrompt, avatarSessionSettings, parseAvatarSessionSettings } from '../../src/shared/avatar-prompt'
import { readFileSync } from 'node:fs'
import type { MirrorConfig } from '../../src/shared/types'

describe('effective avatar prompt', () => {
  it('keeps the spell catalog out of roleplay and forbids coaching', () => {
    const prompt = buildAvatarPrompt({ name: 'Ren', personality: 'A proud rain spirit.', speakingStyle: 'Playful',
      wakeGreeting: 'Hello', sleepFarewell: 'Goodbye', spellPhrases: ['施放咒語，下雨'] })
    expect(prompt).not.toContain('施放咒語，下雨')
    expect(prompt).not.toContain('When explaining how to cast')
    expect(prompt).toContain('Never teach, reveal, correct or suggest incantations')
    expect(prompt).toContain('Stay in character')
  })
  it('includes the published character and sleep policy without inventing private context', () => {
    const config = JSON.parse(readFileSync('resources/config/default.json', 'utf8')) as MirrorConfig
    const settings = avatarSessionSettings(config)
    const prompt = buildAvatarPrompt(settings)
    expect(prompt).toContain(config.persona.instructions)
    expect(prompt).toContain(config.persona.name)
    expect(prompt).toContain('return_to_dormant')
    expect(prompt).not.toContain(settings.sleepFarewell)
    expect(prompt).toContain('the application supplies farewell audio')
    expect(prompt).not.toContain('guestId')
    config.persona.instructions = 'Later edit'
    expect(buildAvatarPrompt(settings)).toBe(prompt)
  })
  it('rejects extra private fields and unbounded text at the bridge boundary', () => {
    const settings = { name:'Guide', personality:'Patient guide', speakingStyle:'Calm', wakeGreeting:'Hello', sleepFarewell:'Goodbye' }
    expect(parseAvatarSessionSettings(settings)).toEqual(settings)
    expect(parseAvatarSessionSettings({...settings,guestId:'private'})).toBeNull()
    expect(parseAvatarSessionSettings({...settings,personality:'a'.repeat(12001)})).toBeNull()
    expect(parseAvatarSessionSettings({...settings,sleepFarewell:''})).toBeNull()
  })
})
