import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { avatarCatalogFor, projectActiveAvatar } from '../../src/shared/avatar-profiles'
import { avatarSessionSettings, buildAvatarPrompt, parseAvatarSessionSettings } from '../../src/shared/avatar-prompt'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { matchExactSpell } from '../../src/main/scenes/spell-trigger'

describe('avatar-owned spoken commands', () => {
  it('preserves independent phrases, including a shared wake phrase', () => {
    const base = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
    delete base.schemaVersion
    const catalog = avatarCatalogFor(base)
    const ren = { ...catalog.avatars[0]!, id: 'ren', name: 'Ren', wakePhrase: '你好小蓮', sleepPhrase: '小蓮休息吧' }
    const raven = { ...ren, id: 'raven', name: 'Raven', sleepPhrase: '渡鴉晚安' }
    const config = { ...base, avatarCatalog: { ...catalog, activeAvatarId: 'ren', avatars: [ren, raven] } }
    expect(mirrorConfigSchema.safeParse(config).success).toBe(true)
    expect(projectActiveAvatar(config).wake.phrase).toBe(ren.wakePhrase)
    const settings = avatarSessionSettings(config)
    expect(parseAvatarSessionSettings(settings)).toEqual(settings)
    const prompt = buildAvatarPrompt(settings)
    expect(prompt).toContain(ren.sleepPhrase)
    expect(prompt).not.toContain('恭送渡鴨大人')
    config.avatarCatalog.activeAvatarId = 'raven'
    expect(avatarSessionSettings(config).sleepPhrase).toBe(raven.sleepPhrase)
  })

  it('matches Ren Chinese punctuation/spacing variants without matching extra words', () => {
    const spell = { spellId: 'rain', phrase: '天氣熱，能不能下雨呢?' }
    for (const transcript of ['天氣熱 能不能下雨呢?', '天氣熱， 能不能下雨呢？', '天氣熱能不能下雨呢']) {
      expect(matchExactSpell({ status: 'final', turnId: 'turn', transcript }, spell).matched).toBe(true)
    }
    expect(matchExactSpell({ status: 'final', turnId: 'turn', transcript: '我說天氣熱能不能下雨呢' }, spell).matched).toBe(false)
    expect(matchExactSpell({ status: 'final', turnId: 'turn', transcript: 'rainbow' }, { spellId: 'rain', phrase: 'rain bow' }).matched).toBe(false)
  })

  it('keeps wake tuning bound to its avatar phrase and rejects stale bindings', () => {
    const base = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
    delete base.schemaVersion
    const catalog = avatarCatalogFor(base)
    const ren = {
      ...catalog.avatars[0]!,
      id: 'ren',
      wakePhrase: '你好小蓮',
      wakeTuning: { phrase: '你好小蓮', enabled: true, threshold: 0.32, score: 1.4, numTrailingBlanks: 2 },
    }
    const raven = { ...ren, id: 'raven', wakePhrase: 'Hello Raven', wakeTuning: undefined }
    const config = { ...base, avatarCatalog: { ...catalog, activeAvatarId: 'ren', avatars: [ren, raven] } }
    expect(mirrorConfigSchema.safeParse(config).success).toBe(true)
    const stale = { ...ren, wakeTuning: { ...ren.wakeTuning, phrase: 'Hello Raven' } }
    expect(mirrorConfigSchema.safeParse({ ...config, avatarCatalog: { ...config.avatarCatalog, avatars: [stale, raven] } }).success).toBe(false)
    const outOfBounds = { ...ren, wakeTuning: { ...ren.wakeTuning, threshold: 1.01 } }
    expect(mirrorConfigSchema.safeParse({ ...config, avatarCatalog: { ...config.avatarCatalog, avatars: [outOfBounds, raven] } }).success).toBe(false)
  })
})
