import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { importAvatarModel, verifyAvatarModel, safeAvatarFile } from '../../src/main/avatar/model-import'

describe('managed Cubism import', () => {
  it('rejects junction roots and missing bundle files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-paths-'))
    try {
      const source = resolve('resources/avatar/Ren')
      const link = join(root, 'linked')
      await symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(safeAvatarFile(link, 'Ren.model3.json')).rejects.toThrow('avatar_asset_path_invalid')
      const manifest = join(root, 'missing.model3.json')
      await writeFile(manifest, await readFile(join(source, 'Ren.model3.json')))
      await expect(importAvatarModel(manifest, join(root, 'managed'))).rejects.toThrow()
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('copies and validates a complete real model without linking source files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-import-'))
    try {
      const model = await importAvatarModel(resolve('resources/avatar/Ren/Ren.model3.json'), root)
      expect(model.files).toContain('Ren.model3.json')
      expect(model.files.some(f => f.endsWith('.moc3'))).toBe(true)
      expect(await verifyAvatarModel(model, root)).toBe(true)
      await writeFile(join(root, model.id, model.manifestFileName), '{}')
      expect(await verifyAvatarModel(model, root)).toBe(false)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('rejects traversal before copying any referenced file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-invalid-'))
    try {
      const manifest = JSON.parse(await readFile('resources/avatar/Ren/Ren.model3.json', 'utf8'))
      manifest.FileReferences.Moc = '../outside.moc3'
      const path = join(root, 'invalid.model3.json')
      await writeFile(path, JSON.stringify(manifest))
      await expect(importAvatarModel(path, join(root, 'managed'))).rejects.toThrow('avatar_asset_path_invalid')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
