import { mkdtemp, mkdir, writeFile, unlink, symlink, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MediaFolders } from '../../src/main/avatar/media-folders'
import { folderMediaSkill } from '../../src/shared/media-folders'
import { DEFAULT_MEDIA_SKILL } from '../../src/shared/media-skill'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mm-folders-')); roots.push(root)
  for (const folder of ['shared', 'raven', 'other']) await mkdir(join(root, folder))
  const store = new MediaFolders(join(root, 'links.json'))
  await store.load()
  return { root, store }
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
describe('linked media folders', () => {
  it('combines own and shared files, isolates avatars, and refreshes additions/removals', async () => {
    const { root, store } = await fixture()
    await writeFile(join(root, 'shared', 'Rain.mp3'), 'audio')
    await writeFile(join(root, 'raven', 'Mist.webm'), 'video')
    await writeFile(join(root, 'other', 'Secret.mp3'), 'audio')
    await store.link('shared', join(root, 'shared'))
    await store.link('avatar:raven', join(root, 'raven'))
    await store.link('avatar:other', join(root, 'other'))
    expect(store.resources('raven').map(r => r.name)).toEqual(['Mist', 'Rain'])
    expect(store.resources('other').map(r => r.name)).toEqual(['Secret', 'Rain'])
    const secret = store.resources('other')[0]!
    expect(await store.resolve(secret.assetId, 'raven')).toBeNull()
    await unlink(join(root, 'raven', 'Mist.webm'))
    await writeFile(join(root, 'raven', 'New.mp4'), 'video')
    await store.refresh()
    expect(store.resources('raven').map(r => r.name)).toEqual(['New', 'Rain'])
    const reloaded = new MediaFolders(join(root, 'links.json')); await reloaded.load()
    expect(reloaded.resources('raven')).toEqual(store.resources('raven'))
  })
  it('rejects overlapping ownership and symlink escapes; ignores nonmedia', async () => {
    const { root, store } = await fixture()
    await writeFile(join(root, 'other', 'Outside.mp3'), 'audio')
    await symlink(join(root, 'other', 'Outside.mp3'), join(root, 'raven', 'link.mp3'))
    await writeFile(join(root, 'raven', 'notes.txt'), 'ignored')
    await store.link('avatar:raven', join(root, 'raven'))
    await expect(store.link('shared', root)).rejects.toThrow('media_folder_overlap')
    expect(store.resources('raven')).toEqual([])
    expect(store.view('raven').own?.skipped).toBe(2)
  })
  it('rechecks access at playback, revokes removed links and exposes unavailable state', async () => {
    const { root, store } = await fixture()
    const path = join(root, 'raven', 'Mist.webm')
    await writeFile(path, 'video'); await store.link('avatar:raven', join(root, 'raven'))
    const id = store.resources('raven')[0]!.assetId
    expect((await store.resolve(id, 'raven'))?.path).toBe(await realpath(path))
    await unlink(path); await symlink(join(root, 'other', 'escape.webm'), path)
    expect(await store.resolve(id, 'raven')).toBeNull()
    await rm(join(root, 'raven'), { recursive: true })
    await store.refresh()
    expect(store.view('raven').own?.status).toBe('unavailable')
    expect(store.resources('raven')).toEqual([])
    await store.unlink('avatar:raven')
    expect(store.view('raven').own).toBeNull()
  })
  it('disambiguates equal filenames and keeps skill settings and legacy files', () => {
    const entries = ['own', 'shared'].map((origin, index) => ({ kind: 'music' as const, assetId: `folder-${index}`, name: 'Rain', aliases: [], origin: origin as 'own' | 'shared' }))
    const skill = folderMediaSkill({ ...DEFAULT_MEDIA_SKILL, enabled: false, gain: .4 }, entries)
    expect(skill.resources.map(r => r.name)).toEqual(['Rain', 'Rain (shared)'])
    expect(skill.enabled).toBe(false); expect(skill.gain).toBe(.4)
    expect(JSON.stringify(skill)).not.toContain('origin')
    const legacy = { ...DEFAULT_MEDIA_SKILL, resources: [{ kind: 'video' as const, assetId: 'old', name: 'a'.repeat(120), aliases: ['Alias'] }] }
    expect(folderMediaSkill(legacy, []).resources).toEqual(legacy.resources)
    expect(folderMediaSkill(legacy, entries).resources.at(-1)).toEqual(legacy.resources[0])
  })
})
