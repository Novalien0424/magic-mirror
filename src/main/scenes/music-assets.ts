import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ManagedMusicAsset } from '../../shared/types'

const MAX_MUSIC_ASSET_BYTES = 100 * 1024 * 1024
const FORMAT_BY_EXTENSION: Readonly<Record<string, ManagedMusicAsset['mimeType']>> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
}

export type MusicAssetImportErrorCode =
  | 'music_asset_format_unsupported'
  | 'music_asset_empty'
  | 'music_asset_too_large'
  | 'music_asset_read_failed'
  | 'music_asset_write_failed'

export class MusicAssetImportError extends Error {
  readonly code: MusicAssetImportErrorCode

  constructor(code: MusicAssetImportErrorCode) {
    super(code)
    this.name = 'MusicAssetImportError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'EEXIST'
}

export async function importManagedMusicAsset(input: {
  readonly sourcePath: string
  readonly storageDir: string
}): Promise<ManagedMusicAsset> {
  const extension = extname(input.sourcePath).toLowerCase()
  const mimeType = FORMAT_BY_EXTENSION[extension]
  if (mimeType === undefined) throw new MusicAssetImportError('music_asset_format_unsupported')

  let byteLength: number
  let bytes: Buffer
  try {
    const sourceStat = await stat(input.sourcePath)
    byteLength = sourceStat.size
    if (!sourceStat.isFile()) throw new MusicAssetImportError('music_asset_read_failed')
    if (byteLength === 0) throw new MusicAssetImportError('music_asset_empty')
    if (byteLength > MAX_MUSIC_ASSET_BYTES) throw new MusicAssetImportError('music_asset_too_large')
    bytes = await readFile(input.sourcePath)
  } catch (error) {
    if (error instanceof MusicAssetImportError) throw error
    throw new MusicAssetImportError('music_asset_read_failed')
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const id = 'music-' + sha256.slice(0, 24)
  const fileName = id + extension
  try {
    await mkdir(input.storageDir, { recursive: true })
    await writeFile(join(input.storageDir, fileName), bytes, { flag: 'wx' })
  } catch (error) {
    if (!isAlreadyExists(error)) throw new MusicAssetImportError('music_asset_write_failed')
  }

  return Object.freeze({
    id,
    name: basename(input.sourcePath, extension).slice(0, 120),
    fileName,
    mimeType,
    byteLength,
    sha256,
  })
}
