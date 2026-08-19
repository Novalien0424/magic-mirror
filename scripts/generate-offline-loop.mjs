import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const OFFLINE_LOOP_ASSET_CONTRACT = Object.freeze({ sha256: '8cfb50f578dab21b75b6d5bfd7ae707494c77047735ae231c1a4e4ff2cfbff12', byteLength: 648 })

const STRICT_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SOURCE_PATH = resolve(REPOSITORY_ROOT, 'resources/offline-loop/offline-loop-v1.mp4.base64')
const DEFAULT_OUTPUT_PATH = resolve(REPOSITORY_ROOT, 'resources/generated/mock/offline-loop-v1.mp4')

function contractError(reason) {
  throw new Error(reason)
}

function assertAssetContract(bytes) {
  if (bytes.byteLength !== OFFLINE_LOOP_ASSET_CONTRACT.byteLength) contractError('asset_length_invalid')
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== OFFLINE_LOOP_ASSET_CONTRACT.sha256) contractError('asset_hash_invalid')
  return digest
}

export function decodeStrictBase64(source) {
  if (typeof source !== 'string' || source.length === 0) contractError('base64_empty')
  if (/\s/u.test(source)) contractError('base64_whitespace')
  if (!STRICT_BASE64_PATTERN.test(source)) contractError('base64_invalid')

  const bytes = Buffer.from(source, 'base64')
  if (bytes.toString('base64') !== source) contractError('base64_noncanonical')
  return bytes
}

function sourceWithoutOneFinalLineEnding(source) {
  if (source.endsWith('\r\n')) return source.slice(0, -2)
  if (source.endsWith('\n')) return source.slice(0, -1)
  return source
}

function removeTemporaryFile(path) {
  if (!existsSync(path)) return
  try {
    unlinkSync(path)
  } catch {
    // A later invocation can safely replace the same sibling.
  }
}

export function generateOfflineLoop({ sourcePath = DEFAULT_SOURCE_PATH, outputPath = DEFAULT_OUTPUT_PATH } = {}) {
  const encoded = sourceWithoutOneFinalLineEnding(readFileSync(sourcePath, 'utf8'))
  if (/\s/u.test(encoded)) contractError('base64_whitespace')
  const sourceBytes = decodeStrictBase64(encoded)
  const sourceSha256 = assertAssetContract(sourceBytes)

  mkdirSync(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`
  try {
    writeFileSync(temporaryPath, sourceBytes)
    assertAssetContract(readFileSync(temporaryPath))
    renameSync(temporaryPath, outputPath)
    const outputBytes = readFileSync(outputPath)
    const outputSha256 = assertAssetContract(outputBytes)
    return {
      sourceSha256,
      outputSha256,
      byteLength: outputBytes.byteLength,
      outputPath,
    }
  } finally {
    removeTemporaryFile(temporaryPath)
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && pathToFileURL(invokedPath).href === import.meta.url) {
  try {
    const result = generateOfflineLoop()
    console.log(JSON.stringify({
      status: 'ready',
      event: 'asset_ready',
      reason: 'asset_verified',
      source: result.sourceSha256,
      byteLength: result.byteLength,
      output: basename(result.outputPath),
    }))
  } catch {
    console.error(JSON.stringify({
      status: 'unavailable',
      event: 'asset_unavailable',
      reason: 'asset_generation_failed',
    }))
    process.exitCode = 1
  }
}
