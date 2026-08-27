import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { evaluateWakeCorpus, type WakeCorpusSample } from './corpus-evaluator'
import { createConfiguredPorcupineDetector } from './porcupine-detector'
import { createConfiguredSherpaDetector } from './sherpa-detector'
import { loadWakeModelPackage } from './model-package'
import type { WakeWorkerPackage } from './protocol'

function argumentsFor(name: string): string[] {
  const values: string[] = []
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === `--${name}` && process.argv[index + 1] !== undefined) {
      values.push(process.argv[index + 1] as string)
      index += 1
    }
  }
  return values
}

function pcm16Mono16k(buffer: Buffer): Int16Array {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('wake_corpus_wav_invalid')
  }
  let offset = 12
  let format: { channels: number; sampleRate: number; bits: number; encoding: number } | null = null
  let data: Buffer | null = null
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > buffer.length) throw new Error('wake_corpus_wav_invalid')
    if (id === 'fmt ' && size >= 16) {
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      }
    } else if (id === 'data') data = buffer.subarray(start, start + size)
    offset = start + size + (size % 2)
  }
  if (format?.encoding !== 1 || format.channels !== 1 || format.sampleRate !== 16_000 || format.bits !== 16 || data === null) {
    throw new Error('wake_corpus_wav_format_unsupported')
  }
  const samples = new Int16Array(data.length / 2)
  for (let index = 0; index < samples.length; index += 1) samples[index] = data.readInt16LE(index * 2)
  return samples
}

async function main(): Promise<void> {
  if (`${process.platform}-${process.arch}` !== 'darwin-arm64') throw new Error('wake_evaluation_requires_target_mac')
  const corpusPath = argumentsFor('corpus')[0]
  const packageIds = argumentsFor('package')
  const outputPath = argumentsFor('output')[0]
  if (corpusPath === undefined || packageIds.length < 1) throw new Error('wake_evaluation_arguments_invalid')

  const corpusFile = resolve(corpusPath)
  const raw = JSON.parse(await readFile(corpusFile, 'utf8')) as {
    schemaVersion?: unknown
    samples?: unknown
  }
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.samples)) throw new Error('wake_corpus_manifest_invalid')
  const samples: WakeCorpusSample[] = []
  for (const value of raw.samples) {
    if (typeof value !== 'object' || value === null) throw new Error('wake_corpus_manifest_invalid')
    const record = value as Record<string, unknown>
    const id = record['id']
    const category = record['category']
    const file = record['file']
    if (
      typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(id)
      || (category !== 'positive' && category !== 'hard_negative' && category !== 'background')
      || typeof file !== 'string' || file.includes('..')
    ) throw new Error('wake_corpus_manifest_invalid')
    samples.push({ id, category, pcm: pcm16Mono16k(await readFile(resolve(dirname(corpusFile), file))) })
  }

  const modelRoot = resolve('resources', 'wake-models')
  const candidates = []
  for (const packageId of packageIds) {
    const manifest = JSON.parse(await readFile(resolve(modelRoot, packageId, 'manifest.json'), 'utf8')) as Record<string, unknown>
    const phrase = manifest['phrase']
    const modelVersion = manifest['modelVersion']
    if (typeof phrase !== 'string' || typeof modelVersion !== 'string') throw new Error('wake_package_manifest_invalid')
    const wake = { phrase, modelVersion, packageId }
    const loaded = await loadWakeModelPackage({ rootDirectory: modelRoot, wake, platform: 'darwin-arm64' })
    if (!loaded.ok) throw new Error(loaded.reason)
    const tuning = loaded.manifest.tuning
    const workerPackage: WakeWorkerPackage = {
      packageId,
      engine: loaded.manifest.engine,
      engineVersion: loaded.manifest.engineVersion,
      modelVersion: loaded.manifest.modelVersion,
      phrase: loaded.manifest.phrase,
      sampleRateHz: 16_000,
      artifactPaths: Object.fromEntries(loaded.artifactPaths),
      tuning: {
        ...(tuning.sensitivity === undefined ? {} : { sensitivity: tuning.sensitivity }),
        ...(tuning.threshold === undefined ? {} : { threshold: tuning.threshold }),
        ...(tuning.score === undefined ? {} : { score: tuning.score }),
      },
    }
    candidates.push({
      packageId,
      createDetector: () => workerPackage.engine === 'porcupine'
        ? createConfiguredPorcupineDetector(workerPackage, process.env['PICOVOICE_ACCESS_KEY']?.trim())
        : createConfiguredSherpaDetector(workerPackage),
    })
  }

  const aggregate = evaluateWakeCorpus({ samples, candidates })
  const result = {
    ...aggregate,
    corpusResultId: createHash('sha256').update(JSON.stringify(aggregate)).digest('hex').slice(0, 24),
    platform: 'darwin-arm64',
  }
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  if (outputPath !== undefined) await writeFile(resolve(outputPath), serialized, { encoding: 'utf8', flag: 'wx' })
  process.stdout.write(serialized)
}

void main().catch((error: unknown) => {
  const reason = error instanceof Error && /^[a-z][a-z0-9_]{0,95}$/.test(error.message)
    ? error.message
    : 'wake_evaluation_failed'
  process.stderr.write(`WAKE_EVALUATION status=failed reason=${reason}\n`)
  process.exitCode = 1
})
