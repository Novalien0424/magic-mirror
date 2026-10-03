import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MusicAssetImportError,
  importManagedMusicAsset,
} from '../../../src/main/scenes/music-assets'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('managed music import', () => {
  it('copies an allowlisted audio file under a hash-derived asset ID', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-mirror-music-'))
    roots.push(root)
    const sourcePath = join(root, 'operator bells.mp3')
    const storageDir = join(root, 'managed')
    await writeFile(sourcePath, Buffer.from('synthetic-mp3-bytes'))

    const asset = await importManagedMusicAsset({ sourcePath, storageDir })

    expect(asset.id).toMatch(/^music-[a-f0-9]{24}$/)
    expect(asset.fileName).toBe(`${asset.id}.mp3`)
    expect(asset.name).toBe('operator bells')
    expect(asset.mimeType).toBe('audio/mpeg')
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(await readFile(join(storageDir, asset.fileName))).toEqual(Buffer.from('synthetic-mp3-bytes'))
    expect(JSON.stringify(asset)).not.toContain(sourcePath)
  })

  it('deduplicates the same bytes to the same managed asset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-mirror-music-'))
    roots.push(root)
    const first = join(root, 'first.wav')
    const second = join(root, 'second.wav')
    const storageDir = join(root, 'managed')
    await writeFile(first, Buffer.from('synthetic-wav-bytes'))
    await writeFile(second, Buffer.from('synthetic-wav-bytes'))

    const left = await importManagedMusicAsset({ sourcePath: first, storageDir })
    const right = await importManagedMusicAsset({ sourcePath: second, storageDir })

    expect(right.id).toBe(left.id)
    expect(right.fileName).toBe(left.fileName)
  })

  it('rejects unsupported formats with a stable path-free code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-mirror-music-'))
    roots.push(root)
    const sourcePath = join(root, 'secret-location.exe')
    await writeFile(sourcePath, Buffer.from('not-audio'))

    let caught: unknown
    try {
      await importManagedMusicAsset({ sourcePath, storageDir: join(root, 'managed') })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(MusicAssetImportError)
    expect((caught as MusicAssetImportError).code).toBe('music_asset_format_unsupported')
    expect(String(caught)).not.toContain(sourcePath)
  })
})
