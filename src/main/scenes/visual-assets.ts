import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ManagedVisualAsset, PendingVisualAsset, VisualAssetProbe } from '../../shared/types'
import { managedVisualAssetSchema } from './scene-config'

const IMAGE_LIMIT = 25 * 1024 * 1024
const VIDEO_LIMIT = 250 * 1024 * 1024
const DEFAULT_PENDING_TTL_MS = 10 * 60_000
const SAFE_TOKEN = /^[a-f0-9]{24}$/

const FORMAT_BY_EXTENSION = Object.freeze({
  '.png': { kind: 'image', mimeType: 'image/png', limit: IMAGE_LIMIT },
  '.jpg': { kind: 'image', mimeType: 'image/jpeg', limit: IMAGE_LIMIT },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg', limit: IMAGE_LIMIT },
  '.webp': { kind: 'image', mimeType: 'image/webp', limit: IMAGE_LIMIT },
  '.mp4': { kind: 'video', mimeType: 'video/mp4', limit: VIDEO_LIMIT },
  '.webm': { kind: 'video', mimeType: 'video/webm', limit: VIDEO_LIMIT },
} as const)

type VisualFormat = (typeof FORMAT_BY_EXTENSION)[keyof typeof FORMAT_BY_EXTENSION]

export type VisualAssetErrorCode =
  | 'visual_asset_format_unsupported'
  | 'visual_asset_empty'
  | 'visual_asset_too_large'
  | 'visual_asset_read_failed'
  | 'visual_asset_write_failed'
  | 'visual_asset_pending_missing'
  | 'visual_asset_pending_expired'
  | 'visual_asset_probe_invalid'
  | 'visual_asset_hash_mismatch'

export class VisualAssetError extends Error {
  readonly code: VisualAssetErrorCode

  constructor(code: VisualAssetErrorCode) {
    super(code)
    this.name = 'VisualAssetError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

interface PendingEntry {
  readonly candidate: PendingVisualAsset
  readonly extension: string
  readonly path: string
  readonly createdAt: number
}

export interface VisualAssetManager {
  initialize(): Promise<void>
  import(input: { readonly sourcePath: string }): Promise<PendingVisualAsset>
  finalize(input: { readonly token: string; readonly probe: VisualAssetProbe }): Promise<ManagedVisualAsset>
  cancel(token: string): Promise<void>
  resolvePendingPath(token: string): Promise<string | null>
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error
      && (error as { code?: unknown }).code === 'ENOENT')) throw error
  }
}

function formatFor(extension: string): VisualFormat | undefined {
  return FORMAT_BY_EXTENSION[extension as keyof typeof FORMAT_BY_EXTENSION]
}

function orientation(width: number, height: number): ManagedVisualAsset['orientation'] {
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait'
}

export function createVisualAssetManager(input: {
  readonly storageDir: string
  readonly now?: () => number
  readonly tokenFactory?: () => string
  readonly pendingTtlMs?: number
}): VisualAssetManager {
  const pendingDir = join(input.storageDir, '.pending')
  const now = input.now ?? Date.now
  const tokenFactory = input.tokenFactory ?? (() => randomBytes(12).toString('hex'))
  const pendingTtlMs = input.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS
  const pending = new Map<string, PendingEntry>()

  const cancel = async (token: string): Promise<void> => {
    const entry = pending.get(token)
    pending.delete(token)
    if (entry === undefined) return
    try {
      await safeUnlink(entry.path)
    } catch {
      throw new VisualAssetError('visual_asset_write_failed')
    }
  }

  const resolvePendingPath = async (token: string): Promise<string | null> => {
    if (!SAFE_TOKEN.test(token)) return null
    const entry = pending.get(token)
    if (entry === undefined) return null
    if (now() - entry.createdAt <= pendingTtlMs) return entry.path
    await cancel(token)
    return null
  }

  return Object.freeze({
    async initialize(): Promise<void> {
      try {
        await mkdir(pendingDir, { recursive: true })
        const entries = await readdir(pendingDir, { withFileTypes: true })
        await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => safeUnlink(join(pendingDir, entry.name))))
        pending.clear()
      } catch {
        throw new VisualAssetError('visual_asset_write_failed')
      }
    },

    async import({ sourcePath }: { readonly sourcePath: string }): Promise<PendingVisualAsset> {
      const extension = extname(sourcePath).toLowerCase()
      const format = formatFor(extension)
      if (format === undefined) throw new VisualAssetError('visual_asset_format_unsupported')

      let byteLength: number
      let sha256: string
      try {
        const sourceStat = await stat(sourcePath)
        if (!sourceStat.isFile()) throw new VisualAssetError('visual_asset_read_failed')
        byteLength = sourceStat.size
        if (byteLength === 0) throw new VisualAssetError('visual_asset_empty')
        if (byteLength > format.limit) throw new VisualAssetError('visual_asset_too_large')
        sha256 = await sha256File(sourcePath)
      } catch (error) {
        if (error instanceof VisualAssetError) throw error
        throw new VisualAssetError('visual_asset_read_failed')
      }

      const token = tokenFactory()
      if (!SAFE_TOKEN.test(token) || pending.has(token)) {
        throw new VisualAssetError('visual_asset_write_failed')
      }
      const assetId = 'visual-' + sha256.slice(0, 24)
      const candidate: PendingVisualAsset = Object.freeze({
        token,
        assetId,
        name: basename(sourcePath, extension).slice(0, 120) || assetId,
        kind: format.kind,
        mimeType: format.mimeType,
        byteLength,
        sha256,
      })
      const pendingPath = join(pendingDir, token + extension)
      try {
        await mkdir(pendingDir, { recursive: true })
        await copyFile(sourcePath, pendingPath)
      } catch {
        throw new VisualAssetError('visual_asset_write_failed')
      }
      pending.set(token, { candidate, extension, path: pendingPath, createdAt: now() })
      return candidate
    },

    async finalize({ token, probe }: { readonly token: string; readonly probe: VisualAssetProbe }): Promise<ManagedVisualAsset> {
      const entry = pending.get(token)
      if (entry === undefined || !SAFE_TOKEN.test(token)) {
        throw new VisualAssetError('visual_asset_pending_missing')
      }
      if (now() - entry.createdAt > pendingTtlMs) {
        await cancel(token)
        throw new VisualAssetError('visual_asset_pending_expired')
      }

      const { candidate } = entry
      const fileName = candidate.assetId + entry.extension
      const raw = candidate.kind === 'image'
        ? {
            id: candidate.assetId,
            name: candidate.name,
            kind: candidate.kind,
            fileName,
            mimeType: candidate.mimeType,
            byteLength: candidate.byteLength,
            sha256: candidate.sha256,
            width: probe.width,
            height: probe.height,
            orientation: orientation(probe.width, probe.height),
            audioTrack: probe.audioTrack,
            windowsDecode: 'passed',
          }
        : {
            id: candidate.assetId,
            name: candidate.name,
            kind: candidate.kind,
            fileName,
            mimeType: candidate.mimeType,
            byteLength: candidate.byteLength,
            sha256: candidate.sha256,
            width: probe.width,
            height: probe.height,
            orientation: orientation(probe.width, probe.height),
            durationMs: 'durationMs' in probe ? probe.durationMs : undefined,
            audioTrack: probe.audioTrack,
            windowsDecode: 'passed',
          }
      const parsed = managedVisualAssetSchema.safeParse(raw)
      if (!parsed.success) {
        await cancel(token)
        throw new VisualAssetError('visual_asset_probe_invalid')
      }

      const destination = join(input.storageDir, fileName)
      try {
        await mkdir(input.storageDir, { recursive: true })
        try {
          const existing = await stat(destination)
          if (!existing.isFile() || existing.size !== candidate.byteLength
            || await sha256File(destination) !== candidate.sha256) {
            throw new VisualAssetError('visual_asset_hash_mismatch')
          }
          await safeUnlink(entry.path)
        } catch (error) {
          const missing = typeof error === 'object' && error !== null && 'code' in error
            && (error as { code?: unknown }).code === 'ENOENT'
          if (!missing) throw error
          try {
            await rename(entry.path, destination)
          } catch (renameError) {
            const existing = await stat(destination)
            if (!existing.isFile() || existing.size !== candidate.byteLength
              || await sha256File(destination) !== candidate.sha256) throw renameError
            await safeUnlink(entry.path)
          }
        }
      } catch {
        throw new VisualAssetError('visual_asset_write_failed')
      }
      pending.delete(token)
      return Object.freeze(parsed.data)
    },

    cancel,
    resolvePendingPath,
  })
}

export async function verifyManagedVisualAsset(input: {
  readonly asset: ManagedVisualAsset
  readonly storageDir: string
}): Promise<void> {
  try {
    const filePath = join(input.storageDir, input.asset.fileName)
    const fileStat = await stat(filePath)
    if (!fileStat.isFile() || fileStat.size !== input.asset.byteLength) {
      throw new VisualAssetError('visual_asset_hash_mismatch')
    }
    if (await sha256File(filePath) !== input.asset.sha256) {
      throw new VisualAssetError('visual_asset_hash_mismatch')
    }
  } catch (error) {
    if (error instanceof VisualAssetError) throw error
    throw new VisualAssetError('visual_asset_read_failed')
  }
}

export function createVisualPlaybackVerifier(verify = verifyManagedVisualAsset) {
  const cache = new Map<string, { stamp: string; pending: Promise<void> }>()
  return async (input: Parameters<typeof verifyManagedVisualAsset>[0]): Promise<void> => {
    const path = join(input.storageDir, input.asset.fileName)
    let info: Awaited<ReturnType<typeof stat>>
    try { info = await stat(path) } catch { throw new VisualAssetError('visual_asset_read_failed') }
    const stamp = `${input.asset.sha256}:${input.asset.byteLength}:${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`
    const cached = cache.get(path)
    if (cached?.stamp === stamp) return cached.pending
    const entry = { stamp, pending: verify(input) }
    cache.delete(path); cache.set(path, entry)
    if (cache.size > 256) cache.delete(cache.keys().next().value!)
    try { await entry.pending }
    catch (error) { if (cache.get(path) === entry) cache.delete(path); throw error }
  }
}
