import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { MirrorConfig } from '../../shared/types'
import { compileWakePhrase } from './custom-keywords'

const safeId = z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,95}$/)
const artifactFile = z.string().trim().min(1).max(160).refine((value) => {
  if (isAbsolute(value) || value.includes('\\')) return false
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
})

const wakeModelPackageSchema = z.object({
  schemaVersion: z.literal(1),
  packageId: safeId,
  engine: z.literal('sherpa'),
  engineVersion: z.string().trim().min(1).max(48),
  modelVersion: z.string().trim().min(1).max(96),
  phrase: z.string().trim().min(1).max(96),
  locale: z.literal('zh-CN'),
  platform: z.string().regex(/^[a-z0-9]+-[a-z0-9]+$/),
  artifacts: z.array(z.object({
    role: safeId,
    file: artifactFile,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(16),
  tuning: z.object({
    sampleRateHz: z.literal(16_000),
    threshold: z.number().min(0).max(1).optional(),
    score: z.number().positive().max(100).optional(),
    numTrailingBlanks: z.number().int().min(1).max(100).optional(),
  }).strict(),
  provenance: z.object({
    method: z.enum(['sherpa-text2token', 'icefall-training']),
    sourceId: safeId,
    createdAt: z.string().datetime({ offset: true }),
  }).strict(),
  corpusResultId: safeId,
}).strict().superRefine((manifest, context) => {
  const files = new Set<string>()
  const roles = new Set<string>()
  for (const artifact of manifest.artifacts) {
    if (files.has(artifact.file) || roles.has(artifact.role)) {
      context.addIssue({ code: 'custom', path: ['artifacts'], message: 'duplicate_artifact' })
    }
    files.add(artifact.file)
    roles.add(artifact.role)
  }
  if (manifest.tuning.threshold === undefined || manifest.tuning.score === undefined) {
    context.addIssue({ code: 'custom', path: ['tuning'], message: 'sherpa_tuning_required' })
  }
})

export type WakeModelPackageManifest = z.infer<typeof wakeModelPackageSchema>
export type WakeModelPackageReason =
  | 'wake_package_manifest_invalid'
  | 'wake_package_reference_mismatch'
  | 'wake_package_phrase_mismatch'
  | 'wake_package_platform_mismatch'
  | 'wake_package_artifact_missing'
  | 'wake_package_hash_mismatch'
  | 'wake_phrase_unsupported'
  | 'wake_phrase_token_unavailable'
  | 'wake_keywords_write_failed'

export type WakeModelPackageValidation =
  | { readonly ok: true; readonly manifest: Readonly<WakeModelPackageManifest> }
  | { readonly ok: false; readonly reason: WakeModelPackageReason }

export interface ValidateWakeModelPackageInput {
  readonly manifest: unknown
  readonly wake: MirrorConfig['wake']
  readonly platform: string
  readonly artifacts: ReadonlyMap<string, Uint8Array>
}

function failure(reason: WakeModelPackageReason): { readonly ok: false; readonly reason: WakeModelPackageReason } {
  return Object.freeze({ ok: false, reason })
}

export function validateWakeModelPackage(
  input: ValidateWakeModelPackageInput,
): WakeModelPackageValidation {
  const parsed = wakeModelPackageSchema.safeParse(input.manifest)
  if (!parsed.success) return failure('wake_package_manifest_invalid')
  const manifest = parsed.data
  if (manifest.packageId !== input.wake.packageId || manifest.modelVersion !== input.wake.modelVersion) {
    return failure('wake_package_reference_mismatch')
  }
  if (manifest.phrase !== input.wake.phrase) return failure('wake_package_phrase_mismatch')
  if (manifest.platform !== input.platform) return failure('wake_package_platform_mismatch')

  for (const artifact of manifest.artifacts) {
    const contents = input.artifacts.get(artifact.file)
    if (contents === undefined) return failure('wake_package_artifact_missing')
    const actualHash = createHash('sha256').update(contents).digest('hex')
    if (actualHash !== artifact.sha256) return failure('wake_package_hash_mismatch')
  }
  return Object.freeze({ ok: true, manifest: Object.freeze(manifest) })
}

export type LoadedWakeModelPackage =
  | {
      readonly ok: true
      readonly manifest: Readonly<WakeModelPackageManifest>
      readonly directory: string
      readonly artifactPaths: ReadonlyMap<string, string>
    }
  | { readonly ok: false; readonly reason: WakeModelPackageReason }

function remainsInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target)
  return pathFromRoot !== '..' && !pathFromRoot.startsWith('../') && !isAbsolute(pathFromRoot)
}

const numericDirective = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)$/u

/**
 * Retain verified keyword phonemes and labels while removing inline boost and
 * threshold directives that would override worker-level tuning.
 */
export function stripInlineKeywordTuning(contents: string): string {
  const lines = contents.split(/\r?\n/u).map(line => {
    const tokens = line.trim().split(/\s+/u).filter(token => {
      if (token.length < 2 || (token[0] !== ':' && token[0] !== '#')) return true
      return !numericDirective.test(token.slice(1))
    })
    return tokens.join(' ')
  }).filter(Boolean)
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

export async function loadWakeModelPackage(input: {
  readonly rootDirectory: string
  readonly wake: MirrorConfig['wake']
  readonly platform: string
  readonly customKeywordsDirectory?: string
  /** Derive a clean keyword line when runtime overrides must beat inline defaults. */
  readonly forceCustomKeywords?: boolean
}): Promise<LoadedWakeModelPackage> {
  if (!safeId.safeParse(input.wake.packageId).success) return failure('wake_package_reference_mismatch')
  const rootDirectory = resolve(input.rootDirectory)
  const packageDirectory = resolve(rootDirectory, input.wake.packageId)
  if (!remainsInside(rootDirectory, packageDirectory)) return failure('wake_package_reference_mismatch')

  let manifestValue: unknown
  try {
    manifestValue = JSON.parse(await readFile(resolve(packageDirectory, 'manifest.json'), 'utf8')) as unknown
  } catch {
    return failure('wake_package_manifest_invalid')
  }
  const parsed = wakeModelPackageSchema.safeParse(manifestValue)
  if (!parsed.success) return failure('wake_package_manifest_invalid')

  const artifacts = new Map<string, Uint8Array>()
  const artifactPaths = new Map<string, string>()
  for (const artifact of parsed.data.artifacts) {
    const artifactPath = resolve(packageDirectory, artifact.file)
    if (!remainsInside(packageDirectory, artifactPath)) return failure('wake_package_manifest_invalid')
    try {
      artifacts.set(artifact.file, await readFile(artifactPath))
      artifactPaths.set(artifact.role, artifactPath)
    } catch {
      return failure('wake_package_artifact_missing')
    }
  }

  // Verify the original package completely before deriving a phrase-specific
  // keyword file. Customization never changes model files or package tuning.
  const validation = validateWakeModelPackage({ ...input,
    wake: input.customKeywordsDirectory ? { ...input.wake, phrase: parsed.data.phrase } : input.wake,
    manifest: manifestValue, artifacts })
  if (!validation.ok) return validation
  if (input.customKeywordsDirectory && (
    input.forceCustomKeywords === true || input.wake.phrase !== validation.manifest.phrase
  )) {
    try {
      const tokenFile = artifactPaths.get('tokens')
      if (!tokenFile) return failure('wake_package_artifact_missing')
      const encoded = input.wake.phrase === validation.manifest.phrase
        ? stripInlineKeywordTuning(await readFile(artifactPaths.get('keywords')!, 'utf8'))
        : compileWakePhrase(input.wake.phrase, await readFile(tokenFile, 'utf8'))
      const hash = createHash('sha256').update(input.wake.packageId).update(encoded).digest('hex')
      const file = resolve(input.customKeywordsDirectory, `${hash}.txt`)
      await mkdir(input.customKeywordsDirectory, { recursive: true })
      await writeFile(file, encoded, 'utf8')
      artifactPaths.set('keywords', file)
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      return failure(code === 'wake_phrase_unsupported' || code === 'wake_phrase_token_unavailable'
        ? code : 'wake_keywords_write_failed')
    }
  }
  return Object.freeze({
    ok: true,
    manifest: validation.manifest,
    directory: packageDirectory,
    artifactPaths,
  })
}
