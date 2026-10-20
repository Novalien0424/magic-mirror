import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

import { evaluateWakeCorpus, type WakeCorpusSample } from './corpus-evaluator'
import { createConfiguredSherpaDetector } from './sherpa-detector'
import { loadWakeModelPackage } from './model-package'
import { createWakeWorkerPackage, wakeTuningIsActive } from './runtime-config'
import { validSpokenPhrase } from '../../shared/avatar-commands'
import type { WakeRuntimeConfig } from '../../shared/avatar-profiles'
import { resolveWakeRuntimePlatform } from './runtime-platform'

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
  const runtimePlatform = resolveWakeRuntimePlatform(process.platform, process.arch)
  if (runtimePlatform === null) throw new Error('wake_evaluation_platform_unsupported')
  const corpusPath = argumentsFor('corpus')[0]
  const packageIds = argumentsFor('package')
  const outputPath = argumentsFor('output')[0]
  const phraseOverride = argumentsFor('phrase')[0]
  if (phraseOverride !== undefined && !validSpokenPhrase(phraseOverride)) throw new Error('wake_phrase_unsupported')
  const tuningInput = {
    threshold: argumentsFor('threshold')[0], score: argumentsFor('score')[0], numTrailingBlanks: argumentsFor('trailing-blanks')[0],
  }
  const parsedTuning = z.object({ threshold: z.coerce.number().finite().min(0).max(1).optional(),
    score: z.coerce.number().finite().positive().max(100).optional(),
    numTrailingBlanks: z.coerce.number().int().min(1).max(100).optional() }).safeParse(tuningInput)
  if (!parsedTuning.success) throw new Error('wake_evaluation_tuning_invalid')
  const hasOverrides = Object.values(tuningInput).some(value => value !== undefined)
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
    const keywordEndMs = record['keywordEndMs']
    if (keywordEndMs !== undefined && typeof keywordEndMs !== 'number') throw new Error('wake_corpus_annotation_invalid')
    samples.push({ id, category, pcm: pcm16Mono16k(await readFile(resolve(dirname(corpusFile), file))),
      ...(keywordEndMs === undefined ? {} : { keywordEndMs }) })
  }

  const modelRoot = resolve('resources', 'wake-models')
  const candidates = []
  const evaluatedSettings: Array<{ packageId: string; phrase: string; tuning: unknown }> = []
  for (const packageId of packageIds) {
    if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(packageId)) throw new Error('wake_evaluation_arguments_invalid')
    const manifest = JSON.parse(await readFile(resolve(modelRoot, packageId, 'manifest.json'), 'utf8')) as Record<string, unknown>
    const phrase = manifest['phrase']
    const modelVersion = manifest['modelVersion']
    if (typeof phrase !== 'string' || typeof modelVersion !== 'string') throw new Error('wake_package_manifest_invalid')
    const selectedPhrase = phraseOverride ?? phrase
    const wake: WakeRuntimeConfig = { phrase: selectedPhrase, modelVersion, packageId,
      ...(hasOverrides ? { tuning: { phrase: selectedPhrase, enabled: true, ...parsedTuning.data } } : {}) }
    const loaded = await loadWakeModelPackage({ rootDirectory: modelRoot, wake, platform: runtimePlatform,
      customKeywordsDirectory: resolve(dirname(corpusFile), '.wake-keywords'), forceCustomKeywords: wakeTuningIsActive(wake) })
    if (!loaded.ok) throw new Error(loaded.reason)
    const workerPackage = createWakeWorkerPackage(loaded, wake)
    evaluatedSettings.push({ packageId, phrase: selectedPhrase, tuning: workerPackage.tuning })
    candidates.push({
      packageId,
      createDetector: () => createConfiguredSherpaDetector(workerPackage),
    })
  }

  const aggregate = evaluateWakeCorpus({ samples, candidates })
  const result = {
    ...aggregate,
    corpusResultId: createHash('sha256').update(JSON.stringify(aggregate)).digest('hex').slice(0, 24),
    platform: runtimePlatform,
    evaluatedSettings,
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
