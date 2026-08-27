import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { MirrorConfig } from '../../shared/types'

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

export async function loadWakeModelPackage(input: {
  readonly rootDirectory: string
  readonly wake: MirrorConfig['wake']
  readonly platform: string
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

  const validation = validateWakeModelPackage({ ...input, manifest: manifestValue, artifacts })
  if (!validation.ok) return validation
  return Object.freeze({
    ok: true,
    manifest: validation.manifest,
    directory: packageDirectory,
    artifactPaths,
  })
}
