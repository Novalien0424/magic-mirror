import { describe, expect, it } from 'vitest'
import { buildAvatarPrompt, buildStudioCommentPrompt, buildStudioPrompt, avatarSessionSettings, avatarRealtimeTools, parseAvatarSessionSettings } from '../../src/shared/avatar-prompt'
import { defaultExperience, sessionExperience } from '../../src/shared/portrait-studio'
import { readFileSync } from 'node:fs'
import type { MirrorConfig } from '../../src/shared/types'

describe('effective avatar prompt', () => {
  it('gives comments the chosen character and delivery without ordinary conversation length or tool instructions', () => {
    const experience = defaultExperience()
    experience.studio.character = 'An ancient guardian.'
    experience.studio.prompts = { comment: 'One sentence about {{answer}}.' }
    const prompt = buildStudioCommentPrompt({ name: 'Raven', personality: 'General personality.', speakingStyle: 'Calm and slow.',
      wakeGreeting: '', sleepFarewell: '', experience: sessionExperience(experience) }, 'I explored {{language}}.', 'en')
    expect(prompt).toContain('An ancient guardian.')
    expect(prompt).toContain('Calm and slow.')
    expect(prompt).toContain('One sentence about "I explored {{language}}.".')
    expect(prompt).toContain('Speak in English.')
    expect(prompt).not.toContain('General personality.')
    expect(prompt).not.toContain('1–3 short sentences')
    expect(prompt).not.toContain('studio_answer')
  })
  it('uses the studio character instead of the Persona personality only inside the studio', () => {
    const base = { name: 'Raven', personality: 'Persona personality text.', speakingStyle: 'Calm.', wakeGreeting: '', sleepFarewell: '' }
    const experience = defaultExperience()
    const inherited = buildStudioPrompt({ ...base, experience: sessionExperience(experience) })
    expect(inherited).toContain('Persona personality text.')
    const own = buildStudioPrompt({ ...base, experience: sessionExperience({ ...experience, studio: { ...experience.studio, character: '渡鴉使者：神秘、簡短。' } }) })
    expect(own).toContain('渡鴉使者：神秘、簡短。')
    expect(own).not.toContain('Persona personality text.')
    expect(buildAvatarPrompt(base)).toContain('Persona personality text.')
  })

  it('keeps media metadata in settings but discovers candidates on demand in the trimmed prompt', () => {
    const settings = { name: 'Guide', personality: 'Patient guide', speakingStyle: '', wakeGreeting: '', sleepFarewell: 'Goodbye',
      mediaSkill: { enabled: true, fadeMs: 800, gain: 0.7, resources: [{ kind: 'video' as const, assetId: 'clip', name: 'Northern sky', aliases: ['aurora'] }] } }
    expect(parseAvatarSessionSettings(settings)).toEqual(settings)
    expect(buildAvatarPrompt(settings)).not.toContain('Northern sky')
    expect(buildAvatarPrompt(settings)).not.toContain('aurora')
    expect(buildAvatarPrompt({ ...settings, qaPromptVariant: 'baseline' })).toContain('Northern sky')
    expect(buildAvatarPrompt({ ...settings, mediaSkill: { ...settings.mediaSkill, enabled: false } })).not.toContain('Northern sky')
    expect(buildAvatarPrompt({ ...settings, mediaSkill: { ...settings.mediaSkill, resources: [] } })).not.toContain('Media library')
    expect(parseAvatarSessionSettings({ ...settings, mediaSkill: { ...settings.mediaSkill, path: '/private' } })).toBeNull()
  })
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
    expect(avatarRealtimeTools(settings).find(tool => tool.name === 'return_to_dormant')?.description).toContain('application supplies farewell audio')
    expect(prompt).toContain('Only an explicit request to change the reply language')
    expect(prompt).not.toContain('latest complete English sentence')
    expect(prompt).not.toContain('guestId')
    config.persona.instructions = 'Later edit'
    expect(buildAvatarPrompt(settings)).toBe(prompt)
  })
  it('renders every authored rule of each enabled tool into the production prompt', () => {
    const settings = { name: 'Guide', personality: 'Patient guide', speakingStyle: '', wakeGreeting: '', sleepFarewell: 'Goodbye' }
    const prompt = buildAvatarPrompt(settings)
    for (const spec of avatarRealtimeTools(settings)) {
      for (const rule of [spec.rules.useWhen, spec.rules.avoidWhen, spec.rules.speech]) expect(prompt).toContain(rule)
    }
  })
  it('rejects extra private fields and unbounded text at the bridge boundary', () => {
    const settings = { name:'Guide', personality:'Patient guide', speakingStyle:'Calm', wakeGreeting:'Hello', sleepFarewell:'Goodbye' }
    expect(parseAvatarSessionSettings(settings)).toEqual(settings)
    expect(parseAvatarSessionSettings({...settings,guestId:'private'})).toBeNull()
    expect(parseAvatarSessionSettings({...settings,personality:'a'.repeat(12001)})).toBeNull()
    expect(parseAvatarSessionSettings({...settings,sleepFarewell:''})).toBeNull()
  })
})
