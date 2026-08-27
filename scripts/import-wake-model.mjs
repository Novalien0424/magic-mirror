import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function argumentsFor(name) {
  const values = []
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === `--${name}` && process.argv[index + 1] !== undefined) {
      values.push(process.argv[index + 1])
      index += 1
    }
  }
  return values
}

function argument(name) {
  return argumentsFor(name)[0]
}

const packageId = argument('package-id')
const engine = argument('engine')
const engineVersion = argument('engine-version')
const modelVersion = argument('model-version')
const phrase = argument('phrase')
const platform = argument('platform')
const outputRoot = argument('output-root')
const method = argument('method')
const sourceId = argument('source-id')
const corpusResultId = argument('corpus-result-id') ?? 'not-evaluated'
const tuningText = argument('tuning')
const artifactArgs = argumentsFor('artifact')
const safeId = /^[a-z0-9][a-z0-9._-]{0,95}$/u

if (
  typeof packageId !== 'string' || !safeId.test(packageId)
  || (engine !== 'porcupine' && engine !== 'sherpa')
  || typeof engineVersion !== 'string' || engineVersion.trim() === ''
  || typeof modelVersion !== 'string' || modelVersion.trim() === ''
  || typeof phrase !== 'string' || phrase.trim() === ''
  || typeof platform !== 'string' || !/^[a-z0-9]+-[a-z0-9]+$/u.test(platform)
  || (outputRoot !== undefined && outputRoot.trim() === '')
  || !['picovoice-console', 'sherpa-text2token', 'icefall-training'].includes(method)
  || typeof sourceId !== 'string' || !safeId.test(sourceId)
  || !safeId.test(corpusResultId)
  || typeof tuningText !== 'string'
  || artifactArgs.length === 0
) {
  process.stderr.write('WAKE_MODEL_IMPORT status=failed reason=invalid_arguments\n')
  process.exit(2)
}

let tuning
try {
  tuning = JSON.parse(tuningText)
} catch {
  process.stderr.write('WAKE_MODEL_IMPORT status=failed reason=invalid_tuning\n')
  process.exit(2)
}

const modelRoot = outputRoot === undefined
  ? join(repositoryRoot, 'resources', 'wake-models')
  : resolve(outputRoot)
const targetDirectory = join(modelRoot, packageId)
const temporaryDirectory = `${targetDirectory}.partial-${process.pid}`
try {
  await mkdir(modelRoot, { recursive: true })
  await mkdir(temporaryDirectory, { recursive: false })
  const artifacts = []
  const roles = new Set()
  const files = new Set()
  for (const value of artifactArgs) {
    const separator = value.indexOf('=')
    const role = value.slice(0, separator)
    const sourcePath = resolve(value.slice(separator + 1))
    const file = basename(sourcePath)
    if (separator <= 0 || !safeId.test(role) || roles.has(role) || files.has(file)) {
      throw new Error('invalid_artifact')
    }
    roles.add(role)
    files.add(file)
    const contents = await readFile(sourcePath)
    artifacts.push({
      role,
      file,
      sha256: createHash('sha256').update(contents).digest('hex'),
    })
    await copyFile(sourcePath, join(temporaryDirectory, file))
  }

  const manifest = {
    schemaVersion: 1,
    packageId,
    engine,
    engineVersion,
    modelVersion,
    phrase: phrase.trim(),
    locale: 'zh-CN',
    platform,
    artifacts,
    tuning,
    provenance: {
      method,
      sourceId,
      createdAt: new Date().toISOString(),
    },
    corpusResultId,
  }
  await writeFile(join(temporaryDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  await rename(temporaryDirectory, targetDirectory)
  process.stdout.write(`WAKE_MODEL_IMPORT status=passed package_id=${packageId}\n`)
} catch {
  await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {})
  process.stderr.write('WAKE_MODEL_IMPORT status=failed reason=import_failed\n')
  process.exit(1)
}
