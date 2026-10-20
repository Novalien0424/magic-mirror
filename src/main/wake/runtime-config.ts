import type { WakeRuntimeConfig } from '../../shared/avatar-profiles'
import type { LoadedWakeModelPackage } from './model-package'
import type { WakeWorkerPackage } from './protocol'

/** A phrase-bound override is active only when explicitly enabled and current. */
export function wakeTuningIsActive(wake: WakeRuntimeConfig): boolean {
  return wake.tuning?.enabled === true && wake.tuning.phrase === wake.phrase
}

/**
 * Build the worker payload from the verified package. Package tuning remains
 * the baseline; empty per-avatar fields intentionally inherit it.
 */
export function createWakeWorkerPackage(
  loaded: Extract<LoadedWakeModelPackage, { readonly ok: true }>,
  wake: WakeRuntimeConfig,
): WakeWorkerPackage {
  const override = wakeTuningIsActive(wake) ? wake.tuning : undefined
  const tuning = loaded.manifest.tuning
  return {
    packageId: loaded.manifest.packageId,
    engine: loaded.manifest.engine,
    engineVersion: loaded.manifest.engineVersion,
    modelVersion: loaded.manifest.modelVersion,
    phrase: wake.phrase,
    sampleRateHz: 16_000,
    artifactPaths: Object.fromEntries(loaded.artifactPaths),
    tuning: {
      ...(tuning.threshold === undefined ? {} : { threshold: tuning.threshold }),
      ...(tuning.score === undefined ? {} : { score: tuning.score }),
      ...(tuning.numTrailingBlanks === undefined ? {} : { numTrailingBlanks: tuning.numTrailingBlanks }),
      ...(override?.threshold === undefined ? {} : { threshold: override.threshold }),
      ...(override?.score === undefined ? {} : { score: override.score }),
      ...(override?.numTrailingBlanks === undefined ? {} : { numTrailingBlanks: override.numTrailingBlanks }),
    },
  }
}
