import { mkdtemp, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  VisualAssetError,
  createVisualAssetManager,
  verifyManagedVisualAsset,
} from '../../../src/main/scenes/visual-assets'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function harness(now: () => number = () => 1000) {
  const root = await mkdtemp(join(tmpdir(), 'magic-mirror-visual-'))
  roots.push(root)
  const manager = createVisualAssetManager({
    storageDir: join(root, 'managed'),
    now,
    tokenFactory: () => '0123456789abcdef01234567',
  })
  await manager.initialize()
  return { root, manager }
}

describe('managed visual import', () => {
  it('keeps a selected file pending until a bounded Chromium probe finalizes it', async () => {
    const { root, manager } = await harness()
    const sourcePath = join(root, 'operator portrait.png')
    const bytes = Buffer.from('synthetic-png-bytes')
    await writeFile(sourcePath, bytes)

    const pending = await manager.import({ sourcePath })

    expect(pending).toEqual({
      token: '0123456789abcdef01234567',
      assetId: expect.stringMatching(/^visual-[a-f0-9]{24}$/),
      name: 'operator portrait',
      kind: 'image',
      mimeType: 'image/png',
      byteLength: bytes.length,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(pending)).not.toContain(sourcePath)
    expect(await manager.resolvePendingPath(pending.token)).toMatch(/\.pending[\\/]0123456789abcdef01234567\.png$/)

    const asset = await manager.finalize({
      token: pending.token,
      probe: { width: 1080, height: 1920, audioTrack: 'absent' },
    })

    expect(asset).toEqual({
      id: pending.assetId,
      name: 'operator portrait',
      kind: 'image',
      fileName: `${pending.assetId}.png`,
      mimeType: 'image/png',
      byteLength: bytes.length,
      sha256: pending.sha256,
      width: 1080,
      height: 1920,
      orientation: 'portrait',
      audioTrack: 'absent',
      windowsDecode: 'passed',
    })
    expect(await readFile(join(root, 'managed', asset.fileName))).toEqual(bytes)
    expect(await manager.resolvePendingPath(pending.token)).toBeNull()
  })

  it('accepts unknown video audio without pretending the browser proved track presence', async () => {
    const { root, manager } = await harness()
    const sourcePath = join(root, 'ceremony.webm')
    await writeFile(sourcePath, Buffer.from('synthetic-webm-bytes'))

    const pending = await manager.import({ sourcePath })
    const asset = await manager.finalize({
      token: pending.token,
      probe: { width: 1920, height: 1080, durationMs: 12_345, audioTrack: 'unknown' },
    })

    expect(asset).toMatchObject({
      kind: 'video',
      mimeType: 'video/webm',
      durationMs: 12_345,
      audioTrack: 'unknown',
      orientation: 'landscape',
    })
  })

  it('deduplicates identical managed bytes without relying on platform rename behavior', async () => {
    const { root, manager } = await harness()
    const sourcePath = join(root, 'same.png')
    await writeFile(sourcePath, Buffer.from('same-image'))
    const firstPending = await manager.import({ sourcePath })
    const first = await manager.finalize({
      token: firstPending.token, probe: { width: 10, height: 20, audioTrack: 'absent' },
    })
    const secondPending = await manager.import({ sourcePath })
    const second = await manager.finalize({
      token: secondPending.token, probe: { width: 10, height: 20, audioTrack: 'absent' },
    })
    expect(second).toEqual(first)
    expect(await readFile(join(root, 'managed', first.fileName))).toEqual(Buffer.from('same-image'))
  })

  it.each([
    ['unsupported format', 'clip.exe', 'visual_asset_format_unsupported'],
    ['empty file', 'clip.mp4', 'visual_asset_empty'],
  ] as const)('rejects %s with a stable path-free code', async (_label, name, code) => {
    const { root, manager } = await harness()
    const sourcePath = join(root, name)
    await writeFile(sourcePath, Buffer.alloc(0))

    await expect(manager.import({ sourcePath })).rejects.toMatchObject({ code })
    try {
      await manager.import({ sourcePath })
    } catch (error) {
      expect(String(error)).not.toContain(sourcePath)
    }
  })

  it('checks image and video size limits before reading the file', async () => {
    const { root, manager } = await harness()
    const imagePath = join(root, 'oversize.png')
    const videoPath = join(root, 'oversize.webm')
    await writeFile(imagePath, Buffer.from([0]))
    await writeFile(videoPath, Buffer.from([0]))
    await truncate(imagePath, 25 * 1024 * 1024 + 1)
    await truncate(videoPath, 250 * 1024 * 1024 + 1)

    await expect(manager.import({ sourcePath: imagePath })).rejects.toMatchObject({ code: 'visual_asset_too_large' })
    await expect(manager.import({ sourcePath: videoPath })).rejects.toMatchObject({ code: 'visual_asset_too_large' })
  })

  it('removes rejected, cancelled, and expired pending files', async () => {
    let now = 1000
    const { root, manager } = await harness(() => now)
    const sourcePath = join(root, 'portrait.webp')
    await writeFile(sourcePath, Buffer.from('synthetic-webp'))
    const pending = await manager.import({ sourcePath })
    const pendingPath = await manager.resolvePendingPath(pending.token)
    expect(pendingPath).not.toBeNull()

    await expect(manager.finalize({
      token: pending.token,
      probe: { width: 5000, height: 100, audioTrack: 'absent' },
    })).rejects.toMatchObject({ code: 'visual_asset_probe_invalid' })
    await expect(stat(pendingPath as string)).rejects.toBeDefined()

    const second = await manager.import({ sourcePath })
    await manager.cancel(second.token)
    expect(await manager.resolvePendingPath(second.token)).toBeNull()

    const expiring = await manager.import({ sourcePath })
    now += 10 * 60_000 + 1
    expect(await manager.resolvePendingPath(expiring.token)).toBeNull()
  })

  it('detects a published file hash mismatch before playback', async () => {
    const { root, manager } = await harness()
    const sourcePath = join(root, 'portrait.jpg')
    await writeFile(sourcePath, Buffer.from('original-jpeg'))
    const pending = await manager.import({ sourcePath })
    const asset = await manager.finalize({
      token: pending.token,
      probe: { width: 100, height: 100, audioTrack: 'absent' },
    })
    await writeFile(join(root, 'managed', asset.fileName), Buffer.from('tampered-jpeg'))

    let caught: unknown
    try {
      await verifyManagedVisualAsset({ asset, storageDir: join(root, 'managed') })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(VisualAssetError)
    expect((caught as VisualAssetError).code).toBe('visual_asset_hash_mismatch')
    expect(JSON.stringify(caught)).not.toContain(join(root, 'managed'))
  })
})
