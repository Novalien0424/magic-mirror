import { describe, expect, it } from 'vitest'
import packageLock from '../../package-lock.json'
import packageManifest from '../../package.json'
import { REALTIME_SDK_VERSION } from '../../src/main/model-settings'

type DependencyMap = Readonly<Record<string, string>>

type PackageManifestFixture = {
  readonly dependencies?: DependencyMap
  readonly devDependencies?: DependencyMap
}

type LockPackageEntry = {
  readonly version?: string
  readonly dependencies?: DependencyMap
  readonly devDependencies?: DependencyMap
}

type PackageLockFixture = {
  readonly packages?: Readonly<Record<string, LockPackageEntry>>
}

const EXPECTED_REALTIME_SDK_VERSIONS = {
  '@openai/agents': '0.20.0',
  '@openai/agents-realtime': '0.20.0',
} as const

describe('P1-U1 realtime SDK dependency contract', () => {
  it('keeps both SDK manifests in exact lockstep and preserves the Electron pins', () => {
    const manifest = packageManifest as PackageManifestFixture
    const lockfile = packageLock as PackageLockFixture
    const manifestDependencies = manifest.dependencies ?? {}
    expect(REALTIME_SDK_VERSION).toBe(manifestDependencies['@openai/agents-realtime'])
    const lockRoot = lockfile.packages?.[''] ?? {}
    const lockRootDependencies = lockRoot.dependencies ?? {}

    for (const [packageName, version] of Object.entries(EXPECTED_REALTIME_SDK_VERSIONS)) {
      expect(manifestDependencies[packageName]).toBe(version)
      expect(lockRootDependencies[packageName]).toBe(version)
      expect(lockfile.packages?.[`node_modules/${packageName}`]?.version).toBe(version)
    }

    expect(manifest.devDependencies?.electron).toBe('44.0.0')
    expect(manifest.devDependencies?.['electron-builder']).toBe('26.15.3')
    expect(lockRoot.devDependencies?.electron).toBe('44.0.0')
    expect(lockRoot.devDependencies?.['electron-builder']).toBe('26.15.3')
    expect(lockfile.packages?.['node_modules/electron']?.version).toBe('44.0.0')
    expect(lockfile.packages?.['node_modules/electron-builder']?.version).toBe('26.15.3')
  })
})
