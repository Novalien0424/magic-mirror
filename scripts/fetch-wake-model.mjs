import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const url = argument('url')
const expectedHash = argument('sha256')
const output = argument('output')
if (
  typeof url !== 'string'
  || !url.startsWith('https://')
  || typeof expectedHash !== 'string'
  || !/^[a-f0-9]{64}$/u.test(expectedHash)
  || typeof output !== 'string'
  || output.trim() === ''
) {
  process.stderr.write('usage: --url https://... --sha256 <64 lowercase hex> --output <path>\n')
  process.exit(2)
}

const outputPath = resolve(output)
const temporaryPath = `${outputPath}.partial-${process.pid}`
try {
  await mkdir(dirname(outputPath), { recursive: true })
  try {
    await access(outputPath)
    throw new Error('output_exists')
  } catch (error) {
    if (error instanceof Error && error.message === 'output_exists') throw error
    if (
      typeof error !== 'object'
      || error === null
      || !('code' in error)
      || error.code !== 'ENOENT'
    ) throw error
  }
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || response.body === null) throw new Error('download_failed')
  const hash = createHash('sha256')
  const hashStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(
    Readable.fromWeb(response.body),
    hashStream,
    createWriteStream(temporaryPath, { flags: 'wx' }),
  )
  const actualHash = hash.digest('hex')
  if (actualHash !== expectedHash) throw new Error('hash_mismatch')
  await rename(temporaryPath, outputPath)
  process.stdout.write('WAKE_MODEL_FETCH status=passed reason=hash_verified\n')
} catch (error) {
  await rm(temporaryPath, { force: true }).catch(() => {})
  const reason = error instanceof Error && error.message === 'hash_mismatch'
    ? 'hash_mismatch'
    : 'fetch_failed'
  process.stderr.write(`WAKE_MODEL_FETCH status=failed reason=${reason}\n`)
  process.exit(1)
}
