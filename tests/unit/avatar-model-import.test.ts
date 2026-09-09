import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { importAvatarModel, verifyAvatarModel, safeAvatarFile, listAvatarModels, saveAvatarModelLabel } from '../../src/main/avatar/model-import'

describe('managed Cubism import', () => {
  it('persists explicit name/version across rediscovery without changing rig files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-label-'))
    try {
      const model = await importAvatarModel(resolve('resources/avatar/Ren/Ren.model3.json'), root)
      const before = await readFile(join(root, model.id, model.manifestFileName))
      const saved = await saveAvatarModelLabel(root, { id: model.id, name: 'Raven', version: 'v8' })
      expect(saved.name).toBe('Raven · v8')
      const library = await listAvatarModels(root)
      expect(library.models[0].name).toBe('Raven · v8')
      expect(library.labels?.[model.id]).toEqual({ name: 'Raven', version: 'v8' })
      expect(await readFile(join(root, model.id, model.manifestFileName))).toEqual(before)
      expect(await verifyAvatarModel(model, root)).toBe(true)
      // The optional portable sidecar survives reimport; no UUID/path guessing.
      const again = await importAvatarModel(join(root, model.id, model.manifestFileName), join(root, 'second'))
      expect(again.name).toBe('Raven · v8')
      expect(again.id).not.toBe(model.id)
      await writeFile(join(root, model.id, 'avatar-label.json'), '{}')
      const degraded = await listAvatarModels(root)
      expect(degraded.models[0].name).toBe('Ren')
      expect(degraded.labelWarningCount).toBe(1)
      await saveAvatarModelLabel(root, { id: model.id, name: 'Ren', version: 'v10' })
      expect((await listAvatarModels(root)).labelWarningCount ?? 0).toBe(0)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('rejects invalid label IDs, payloads and symlink destinations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-label-path-'))
    try {
      const model = await importAvatarModel(resolve('resources/avatar/Ren/Ren.model3.json'), root)
      for (const request of [
        { id: '../escape', name: 'Raven', version: 'v8' },
        { id: model.id, name: '', version: 'v8' },
        { id: model.id, name: 'Raven', version: '../v8' },
        { id: model.id, name: 'Raven', version: 'v8', path: 'outside' },
      ]) await expect(saveAvatarModelLabel(root, request)).rejects.toThrow('avatar_label_invalid')
      const outside = join(root, 'outside.json')
      await writeFile(outside, 'untouched')
      await symlink(outside, join(root, model.id, 'avatar-label.json'), 'file')
      await expect(saveAvatarModelLabel(root, { id: model.id, name: 'Raven', version: 'v8' })).rejects.toThrow('avatar_asset_path_invalid')
      expect(await readFile(outside, 'utf8')).toBe('untouched')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('never overwrites a referenced rig file that collides with the label filename', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-label-collision-'))
    try {
      const model = await importAvatarModel(resolve('resources/avatar/Ren/Ren.model3.json'), root)
      const manifestPath = join(root, model.id, model.manifestFileName)
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      const physics = await readFile(join(root, model.id, manifest.FileReferences.Physics))
      manifest.FileReferences.Physics = 'avatar-label.json'
      await writeFile(join(root, model.id, 'avatar-label.json'), physics)
      await writeFile(manifestPath, JSON.stringify(manifest))
      await expect(saveAvatarModelLabel(root, { id: model.id, name: 'Ren', version: 'v1' })).rejects.toThrow('avatar_label_reserved_path')
      expect(await readFile(join(root, model.id, 'avatar-label.json'))).toEqual(physics)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('rediscovers unsaved imports after restart and reports corrupt bundles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-library-'))
    try {
      expect(await listAvatarModels(join(root, 'absent'))).toEqual({ models: [], rejectedCount: 0 })
      const model = await importAvatarModel(resolve('resources/avatar/Ren/Ren.model3.json'), root)
      expect(await listAvatarModels(root)).toEqual({ models: [model], rejectedCount: 0 })
      await writeFile(join(root, model.id, model.manifestFileName), '{}')
      expect(await listAvatarModels(root)).toEqual({ models: [], rejectedCount: 1 })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('rejects junction roots and missing bundle files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-avatar-paths-'))
    try {
      const source = resolve('resources/avatar/Ren')
      const link = join(root, 'linked')
      await symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(safeAvatarFile(link, 'Ren.model3.json')).rejects.toThrow('avatar_asset_path_invalid')
      await expect(listAvatarModels(link)).rejects.toThrow('avatar_asset_path_invalid')
      await symlink(source, join(root, 'model-linked'), process.platform === 'win32' ? 'junction' : 'dir')
      expect(await listAvatarModels(root)).toEqual({ models: [], rejectedCount: 1 })
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
