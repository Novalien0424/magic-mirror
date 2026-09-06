import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { avatarCatalogFor, projectActiveAvatar } from '../../src/shared/avatar-profiles'
import type { MirrorConfig } from '../../src/shared/types'

const baseline = () => { const { schemaVersion: _v, ...config } = JSON.parse(readFileSync('resources/config/default.json', 'utf8')); return config }
const character = (id: string) => ({ id, name: id, personality: 'A patient guide.', speakingStyle: 'Calm, concise Traditional Chinese.',
  voice: 'cedar', idleSeconds: 300, modelId: 'builtin-ren',
  presentation: { mode: 'always_visible', backgroundId: '', ambienceId: '', ambienceGain: 0.25, entranceMs: 1800, exitMs: 1800 }, scenes: [], spells: [] })
function twoAvatars() { return { ...baseline(), avatarCatalog: { activeAvatarId: 'guide', avatars: [character('guide'), character('host')], locks: [], models: [] } } }

describe('avatar catalog configuration', () => {
  it('projects active settings and preserves legacy config without mutating it', () => {
    const legacy = baseline() as MirrorConfig
    const catalog = avatarCatalogFor(legacy)
    expect(catalog.avatars[0]?.personality).toBe(legacy.persona.instructions)
    catalog.avatars[0]!.name = 'Edited'
    expect(legacy.persona.name).not.toBe('Edited')
    const config = twoAvatars()
    config.avatarCatalog.activeAvatarId = 'host'
    const parsed = mirrorConfigSchema.parse(config) as MirrorConfig
    expect(parsed.persona.name).toBe('host')
    expect(parsed.voice).toBe('cedar')
    expect(projectActiveAvatar(parsed)).toEqual(parsed)
  })
  it('accepts two independent characters without losing legacy settings', () => {
    expect(mirrorConfigSchema.safeParse(twoAvatars()).success).toBe(true)
    expect(mirrorConfigSchema.safeParse(baseline()).success).toBe(true)
  })
  it('rejects duplicate avatars, unknown active avatar and unsupported voices', () => {
    for (const mutate of [
      (c: ReturnType<typeof twoAvatars>) => { c.avatarCatalog.avatars[1]!.id = 'guide' },
      (c: ReturnType<typeof twoAvatars>) => { c.avatarCatalog.activeAvatarId = 'missing' },
      (c: ReturnType<typeof twoAvatars>) => { c.avatarCatalog.avatars[0]!.voice = 'made-up-voice' },
    ]) { const c = twoAvatars(); mutate(c); expect(mirrorConfigSchema.safeParse(c).success).toBe(false) }
  })
  it('allows the same spell in different avatars but not duplicate spells within one', () => {
    const c = twoAvatars() as any
    c.sceneActions = [{id:'motion',name:'Motion',enabled:true,kind:'avatar_motion',motionGroup:'Waking'}]
    for (const a of c.avatarCatalog.avatars) {
      a.scenes = [{ id: 'reveal', name: 'Reveal', enabled: true, stages: [{id:'step',name:'Step',actionIds:['motion'],endCondition:{kind:'duration',durationMs:1000}}] }]
      a.spells = [{ id:'spell',name:'Spell',enabled:true,phrase:'Reveal the stars',sceneId:'reveal',cooldownMs:0 }]
    }
    expect(mirrorConfigSchema.safeParse(c).success).toBe(true)
    c.avatarCatalog.avatars[0].spells.push({...c.avatarCatalog.avatars[0].spells[0],id:'duplicate'})
    expect(mirrorConfigSchema.safeParse(c).success).toBe(false)
  })
  it('rejects indirect use of another avatar’s locked media through a shared action', () => {
    const c = twoAvatars() as any
    c.musicAssets = [{id:'tone',name:'Tone',fileName:'tone.wav',mimeType:'audio/wav',byteLength:100,sha256:'a'.repeat(64)}]
    c.sceneActions = [{id:'play-tone',name:'Play',enabled:true,kind:'music',command:'play',assetId:'tone',gain:0.5,loop:false}]
    c.avatarCatalog.locks = [{kind:'music',resourceId:'tone',avatarId:'guide'}]
    c.avatarCatalog.avatars[1].scenes = [{id:'scene',name:'Scene',enabled:true,stages:[{id:'s',name:'S',actionIds:['play-tone'],endCondition:{kind:'duration',durationMs:1000}}]}]
    expect(mirrorConfigSchema.safeParse(c).success).toBe(false)
    c.avatarCatalog.avatars[1].scenes = []
    expect(mirrorConfigSchema.safeParse(c).success).toBe(true)
    c.avatarCatalog.avatars[1].presentation.ambienceId = 'tone'
    expect(mirrorConfigSchema.safeParse(c).success).toBe(false)
  })
})
