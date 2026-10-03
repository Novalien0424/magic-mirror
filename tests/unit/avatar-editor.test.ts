import { describe, expect, it } from 'vitest'
import { projectAvatarDraft, mergeAvatarDraft } from '../../src/renderer/console/avatar-editor'
import { avatarCatalogFor } from '../../src/shared/avatar-profiles'
import { readFileSync } from 'node:fs'
import type { ConsoleConfigDraftInput } from '../../src/shared/console-types'

describe('avatar editor ownership', () => {
  it('retains both characters edits and global resources without loading the editing avatar', () => {
    const config = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
    const catalog = avatarCatalogFor(config)
    catalog.avatars.push({ ...structuredClone(catalog.avatars[0]), id: 'second', name: 'Second', voice: 'cedar' })
    const raw = { ...config, personaName: config.persona.name, avatarCatalog: catalog } as ConsoleConfigDraftInput
    const second = projectAvatarDraft(raw, 'second')
    const changed = mergeAvatarDraft(raw, { ...second, personaName: 'Edited second', idleSeconds: 42 }, 'second')
    expect(changed.avatarCatalog?.activeAvatarId).toBe('default-avatar')
    expect(changed.avatarCatalog?.avatars[0].name).toBe(config.persona.name)
    expect(projectAvatarDraft(changed, 'second')).toMatchObject({ personaName: 'Edited second', idleSeconds: 42, voice: 'cedar' })
    expect(changed.personaName).toBe(config.persona.name)
  })
})
