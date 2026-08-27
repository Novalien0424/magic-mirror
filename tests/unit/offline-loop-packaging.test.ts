import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')
const PACKAGE_LOCK_PATH = join(REPO_ROOT, 'package-lock.json')
const BUILDER_CONFIG_PATH = join(REPO_ROOT, 'electron-builder.yml')
const VITE_CONFIG_PATH = join(REPO_ROOT, 'electron.vite.config.ts')
const GITIGNORE_PATH = join(REPO_ROOT, '.gitignore')
const APP_PATH = join(REPO_ROOT, 'src/renderer/mirror/App.tsx')
const BOOT_PATH = join(REPO_ROOT, 'src/main/boot.ts')
const INDEX_PATH = join(REPO_ROOT, 'src/main/index.ts')
const CRASH_RECOVERY_PATH = join(REPO_ROOT, 'src/main/crash-recovery.ts')
const INFO_PLIST_PATH = join(REPO_ROOT, 'resources/macos/Info.plist.additions.xml')
const ENTITLEMENTS_PATH = join(REPO_ROOT, 'resources/macos/entitlements.plist')
const LAUNCH_AGENT_PATH = join(REPO_ROOT, 'resources/macos/com.magicmirror.launchagent.plist')
const SOURCE_PATH = join(REPO_ROOT, 'resources/offline-loop/offline-loop-v1.mp4.base64')
const GENERATOR_PATH = join(REPO_ROOT, 'scripts/generate-offline-loop.mjs')

const GENERATED_OUTPUT_RELATIVE = 'resources/generated/mock/offline-loop-v1.mp4'
const PACKAGED_VIDEO_RELATIVE = 'app.asar.unpacked/out/renderer/mock/offline-loop-v1.mp4'

interface GeneratorContract {
  readonly sha256: string
  readonly byteLength: number
}

interface GenerationResult {
  readonly sourceSha256: string
  readonly outputSha256: string
  readonly byteLength: number
  readonly outputPath: string
}

interface GeneratorModule {
  readonly OFFLINE_LOOP_ASSET_CONTRACT?: unknown
  readonly decodeStrictBase64?: (source: string) => Uint8Array
  readonly generateOfflineLoop?: (options: {
    readonly sourcePath?: string
    readonly outputPath?: string
  }) => Promise<GenerationResult> | GenerationResult
}

interface MetadataEvent {
  readonly [key: string]: unknown
}

interface BootModule {
  readonly preflightOfflineLoopAsset?: (options: {
    readonly assetPath: string
    readonly emit: (event: MetadataEvent) => void
    readonly onUnrelatedModuleGate?: () => void
    readonly acquireMicrophone?: () => void
  }) => Promise<AssetPreflightResult> | AssetPreflightResult
}

interface CrashRecoveryModule {
  readonly createCrashRecovery?: () => {
    readonly decide: (rendererGone: unknown) => unknown
  }
}

interface MirrorModule {
  readonly projectMirrorSnapshot?: (snapshot: unknown) => {
    readonly state: string
    readonly className: string
    readonly title: string
    readonly detail: string
  }
}

interface AssetPreflightResult {
  readonly status: 'ready' | 'unavailable'
  readonly reason: string
  readonly fallback?: {
    readonly state: 'maintenance'
    readonly visible: boolean
    readonly nonblack: boolean
  }
}

const STRICT_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const METADATA_EVENT_KEYS = new Set([
  'time',
  'module',
  'event',
  'status',
  'duration_ms',
  'error_code',
  'session_id',
  'scene_id',
  'reason',
  'source',
])
const SAFE_METADATA_STRING = /^[A-Za-z0-9._:=;,+/?-]{1,128}$/

function readRequired(filePath: string): string {
  expect(existsSync(filePath), `missing required contract file: ${filePath}`).toBe(true)
  return readFileSync(filePath, 'utf8')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function contractOf(module: GeneratorModule): GeneratorContract {
  const candidate = module.OFFLINE_LOOP_ASSET_CONTRACT
  expect(isRecord(candidate)).toBe(true)
  expect(Object.isFrozen(candidate)).toBe(true)

  const record = isRecord(candidate) ? candidate : {}
  expect(Object.keys(record).sort()).toEqual(['byteLength', 'sha256'])
  const sha = record.sha256
  const byteLength = record.byteLength
  expect(typeof sha).toBe('string')
  expect(sha).toMatch(/^[a-f0-9]{64}$/)
  expect(typeof byteLength).toBe('number')
  expect(Number.isSafeInteger(byteLength)).toBe(true)
  expect(byteLength).toBeGreaterThan(0)

  return { sha256: sha as string, byteLength: byteLength as number }
}

async function loadGenerator(): Promise<{ readonly module: GeneratorModule; readonly source: string }> {
  const source = readRequired(GENERATOR_PATH)
  const module = await import(pathToFileURL(GENERATOR_PATH).href) as unknown as GeneratorModule
  return { module, source }
}

async function loadBoot(): Promise<{ readonly module: BootModule; readonly source: string }> {
  const source = readRequired(BOOT_PATH)
  const module = await import('../../src/main/boot') as unknown as BootModule
  return { module, source }
}

async function loadMirror(): Promise<{ readonly module: MirrorModule; readonly source: string }> {
  const source = readRequired(APP_PATH)
  const module = await import('../../src/renderer/mirror/App') as unknown as MirrorModule
  return { module, source }
}

async function loadCrashRecovery(): Promise<{ readonly module: CrashRecoveryModule; readonly source: string }> {
  const source = readRequired(CRASH_RECOVERY_PATH)
  const module = await import('../../src/main/crash-recovery') as unknown as CrashRecoveryModule
  return { module, source }
}

function assertMetadataEvent(event: unknown, eventName: string): void {
  const record = event
  expect(isRecord(record)).toBe(true)
  if (!isRecord(record)) return

  expect(record.event === eventName).toBe(true)
  expect(typeof record.status === 'string').toBe(true)
  expect(typeof record.reason === 'string').toBe(true)
  expect(typeof record.reason === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(record.reason)).toBe(true)

  for (const [key, value] of Object.entries(record)) {
    expect(METADATA_EVENT_KEYS.has(key)).toBe(true)
    expect(
      value === null
      || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && SAFE_METADATA_STRING.test(value)),
    ).toBe(true)
  }
}

function hasEventName(event: unknown, eventName: string): boolean {
  return isRecord(event) && event.event === eventName
}

function readTrackedBase64Source(): { readonly encoded: string; readonly bytes: Uint8Array } {
  const file = readRequired(SOURCE_PATH)
  const lineEnding = file.endsWith('\r\n') ? '\r\n' : file.endsWith('\n') ? '\n' : ''
  const encoded = lineEnding === '' ? file : file.slice(0, -lineEnding.length)
  const paddingIndex = encoded.indexOf('=')
  const paddingIsValid = paddingIndex === -1 || /^={1,2}$/.test(encoded.slice(paddingIndex))

  expect(encoded.length > 0).toBe(true)
  expect(encoded.length % 4).toBe(0)
  expect(STRICT_BASE64_PATTERN.test(encoded)).toBe(true)
  expect(paddingIsValid).toBe(true)
  expect(file === `${encoded}${lineEnding}`).toBe(true)

  const bytes = Buffer.from(encoded, 'base64')
  expect(bytes.byteLength > 0).toBe(true)
  return { encoded, bytes }
}

function sectionLines(text: string, key: string): string[] {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `${key}:`)
  expect(start, `missing electron-builder section: ${key}`).toBeGreaterThanOrEqual(0)

  const first = lines[start] ?? ''
  const indent = first.length - first.trimStart().length
  const section = [first.trim()]
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    const lineIndent = line.length - line.trimStart().length
    if (lineIndent <= indent) break
    section.push(line.trim())
  }
  return section
}

function sectionOrScalarLines(text: string, key: string): string[] {
  const scalar = text
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith(`${key}:`) && line.trim() !== `${key}:`)
  return scalar === undefined ? sectionLines(text, key) : [scalar.trim()]
}

async function withTempDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'magic-mirror-offline-loop-'))
  try {
    return await callback(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('Task 10B OfflineLoop source and packaging contract', () => {
  it('keeps one tracked base64 source and generator while ignoring only generated output', () => {
    const { encoded } = readTrackedBase64Source()
    const generator = readRequired(GENERATOR_PATH)
    const sourceAssetFiles = readdirSync(dirname(SOURCE_PATH))
      .filter((fileName) => fileName.endsWith('.mp4') || fileName.endsWith('.mp4.base64'))
    const gitignoreLines = readRequired(GITIGNORE_PATH)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))

    expect(encoded.length > 0).toBe(true)
    expect(sourceAssetFiles).toEqual(['offline-loop-v1.mp4.base64'])
    expect(generator.includes('OFFLINE_LOOP_ASSET_CONTRACT')).toBe(true)
    expect(generator.includes('resources/generated/mock/offline-loop-v1.mp4')).toBe(true)
    expect(gitignoreLines.filter((line) => line === 'resources/generated/')).toHaveLength(1)
    expect(gitignoreLines.some((line) => line.startsWith('resources/generated/') && line !== 'resources/generated/')).toBe(false)
    expect(gitignoreLines).toContain('.superpowers/')
    expect(gitignoreLines).not.toContain('resources/offline-loop/')
    expect(gitignoreLines.some((line) => line.startsWith('.superpowers/') && line !== '.superpowers/')).toBe(false)
  })

  it('requires a literal exported fixed hash and byte-length contract independent of generated output', async () => {
    const { module, source } = await loadGenerator()
    const contract = contractOf(module)

    expect(
      /export\s+const\s+OFFLINE_LOOP_ASSET_CONTRACT\s*=\s*Object\.freeze\s*\(\s*\{\s*sha256\s*:\s*['"][a-f0-9]{64}['"]\s*,\s*byteLength\s*:\s*\d+\s*\}\s*\)/.test(source),
    ).toBe(true)
    expect(contract.byteLength).toBeGreaterThan(0)
  })

  it('decodes valid base64 and rejects invalid alphabet, whitespace, and padding', async () => {
    const { module } = await loadGenerator()
    expect(typeof module.decodeStrictBase64).toBe('function')
    const decode = module.decodeStrictBase64 as (source: string) => Uint8Array

    expect(decode('TQ==').byteLength).toBe(1)
    expect(sha256(decode('TQ=='))).toBe(sha256(Buffer.from('M', 'utf8')))
    for (const invalid of ['TQ', 'TQ=', 'TQ===', 'T=Q=', 'TQ$=', 'TQ==A', 'TQ==\n', 'TQ==\r\n', ' TQ==']) {
      expect(() => decode(invalid), `accepted invalid base64 fixture: ${invalid.length}`).toThrow()
    }
  })

  it('checks the fixed hash before and after an atomic sibling-temp write and leaves no temp sibling', async () => {
    const { module, source } = await loadGenerator()
    const contract = contractOf(module)
    expect(typeof module.decodeStrictBase64).toBe('function')
    expect(typeof module.generateOfflineLoop).toBe('function')

    const sourceBytes = readTrackedBase64Source().bytes
    expect(sha256(sourceBytes)).toBe(contract.sha256)
    expect(sourceBytes.byteLength).toBe(contract.byteLength)
    expect(/rename/i.test(source)).toBe(true)
    expect(/(?:tmp|temp|sibling)/i.test(source)).toBe(true)
    expect(source.includes(GENERATED_OUTPUT_RELATIVE)).toBe(true)

    await withTempDirectory(async (directory) => {
      const outputDirectory = join(directory, 'mock')
      mkdirSync(outputDirectory, { recursive: true })
      const outputPath = join(outputDirectory, 'offline-loop-v1.mp4')
      const generate = module.generateOfflineLoop as NonNullable<GeneratorModule['generateOfflineLoop']>
      const result = await Promise.resolve(generate({ sourcePath: SOURCE_PATH, outputPath }))
      const outputBytes = readFileSync(outputPath)
      const metadata = result as GenerationResult

      expect(metadata.sourceSha256).toBe(contract.sha256)
      expect(metadata.outputSha256).toBe(contract.sha256)
      expect(metadata.byteLength).toBe(contract.byteLength)
      expect(metadata.outputPath).toBe(outputPath)
      expect(sha256(outputBytes)).toBe(contract.sha256)
      expect(outputBytes.byteLength).toBe(contract.byteLength)

      const repeatedResult = await Promise.resolve(generate({ sourcePath: SOURCE_PATH, outputPath }))
      const repeatedBytes = readFileSync(outputPath)
      expect(repeatedResult).toEqual(metadata)
      expect(repeatedBytes.equals(outputBytes)).toBe(true)
      expect(readdirSync(outputDirectory)).toEqual(['offline-loop-v1.mp4'])
    })
  })

  it('rejects a corrupt source without replacing valid output or leaving an atomic sibling', async () => {
    const { module } = await loadGenerator()
    const contract = contractOf(module)
    expect(typeof module.generateOfflineLoop).toBe('function')

    await withTempDirectory(async (directory) => {
      const sourcePath = join(directory, 'corrupt.mp4.base64')
      const outputDirectory = join(directory, 'mock')
      const outputPath = join(outputDirectory, 'offline-loop-v1.mp4')
      mkdirSync(outputDirectory, { recursive: true })
      const priorOutput = Buffer.from(readTrackedBase64Source().bytes)
      writeFileSync(outputPath, priorOutput)
      writeFileSync(sourcePath, 'TQ===', 'utf8')
      const generate = module.generateOfflineLoop as NonNullable<GeneratorModule['generateOfflineLoop']>

      await expect(Promise.resolve().then(() => generate({ sourcePath, outputPath }))).rejects.toThrow()
      expect(existsSync(outputPath)).toBe(true)
      const retainedOutput = readFileSync(outputPath)
      expect(retainedOutput.equals(priorOutput)).toBe(true)
      expect(sha256(retainedOutput)).toBe(contract.sha256)
      expect(retainedOutput.byteLength).toBe(contract.byteLength)
      expect(readdirSync(outputDirectory)).toEqual(['offline-loop-v1.mp4'])
    })
  })

  it('does not invoke ffmpeg, network, provider, environment, or model fallback behavior', () => {
    const generator = readRequired(GENERATOR_PATH).toLowerCase()
    const runtimeText = [readRequired(BOOT_PATH), readRequired(INDEX_PATH), readRequired(APP_PATH)].join('\n')

    for (const forbidden of [
      'ffmpeg',
      'fetch(',
      'http://',
      'https://',
      'openai',
      'provider',
      'credential',
      'safestorage',
      'keytar',
      'api_key',
      'authorization',
      'dotenv',
      '.env',
      'process.env',
      'child_process',
      'spawn(',
      'fork(',
      'exec(',
      'execfile',
    ]) {
      expect(generator.includes(forbidden)).toBe(false)
    }
    expect(/gpt-\d|fallback[_-]?model|auto[-_]?latest/i.test(runtimeText)).toBe(false)
  })

  it('resolves the renderer public directory and the one accepted Mirror video source', () => {
    const vite = readRequired(VITE_CONFIG_PATH)
    const app = readRequired(APP_PATH)

    expect(/renderer:\s*\{[\s\S]*publicDir:\s*resolve\(__dirname,\s*['"]resources\/generated['"]\)/.test(vite)).toBe(true)
    expect(app.includes('../mock/offline-loop-v1.mp4')).toBe(true)
    expect(app.includes('resources/mock/offline-loop-v1.mp4')).toBe(false)
    expect(app.includes('screen--maintenance')).toBe(true)
    expect(app.includes('screen__offline-fallback')).toBe(true)
  })

  it('runs Starting asset preflight with metadata-only ready/unavailable outcomes', async () => {
    const { module, source: bootSource } = await loadBoot()
    expect(typeof module.preflightOfflineLoopAsset).toBe('function')
    expect(bootSource.includes('asset_ready')).toBe(true)
    expect(bootSource.includes('asset_unavailable')).toBe(true)
    expect(bootSource.includes('preflightOfflineLoopAsset')).toBe(true)
    expect(/starting/i.test(bootSource)).toBe(true)

    const preflight = module.preflightOfflineLoopAsset as NonNullable<BootModule['preflightOfflineLoopAsset']>
    const events: unknown[] = []

    await withTempDirectory(async (directory) => {
      const validPath = join(directory, 'offline-loop-v1.mp4')
      writeFileSync(validPath, readTrackedBase64Source().bytes)

      const result = await Promise.resolve(preflight({
        assetPath: validPath,
        emit: (event) => events.push(event),
      })) as unknown

      expect(isRecord(result)).toBe(true)
      if (!isRecord(result)) return
      expect(result.status === 'ready').toBe(true)
      expect(typeof result.reason === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(result.reason)).toBe(true)
      expect(events).toHaveLength(1)
      expect(events.filter((event) => hasEventName(event, 'asset_ready'))).toHaveLength(1)
      expect(events.some((event) => hasEventName(event, 'asset_unavailable'))).toBe(false)
      assertMetadataEvent(events[0], 'asset_ready')
      expect(isRecord(events[0]) && events[0].reason === result.reason).toBe(true)
    })
  })

  it('maps missing and corrupt assets to visible nonblack Maintenance without gating modules or acquiring mic', async () => {
    const { module } = await loadBoot()
    expect(typeof module.preflightOfflineLoopAsset).toBe('function')
    const preflight = module.preflightOfflineLoopAsset as NonNullable<BootModule['preflightOfflineLoopAsset']>

    await withTempDirectory(async (directory) => {
      const reasons: Record<string, string> = {}
      for (const fixture of ['missing', 'corrupt']) {
        const assetPath = join(directory, `${fixture}.mp4`)
        if (fixture === 'corrupt') writeFileSync(assetPath, 'metadata-fixture', 'utf8')

        const run = async (): Promise<{
          readonly result: unknown
          readonly events: readonly unknown[]
          readonly unrelatedModuleGates: number
          readonly microphoneAcquisitions: number
        }> => {
          const events: unknown[] = []
          let unrelatedModuleGates = 0
          let microphoneAcquisitions = 0
          const result = await Promise.resolve(preflight({
            assetPath,
            emit: (event) => events.push(event),
            onUnrelatedModuleGate: () => { unrelatedModuleGates += 1 },
            acquireMicrophone: () => { microphoneAcquisitions += 1 },
          })) as unknown
          return { result, events, unrelatedModuleGates, microphoneAcquisitions }
        }

        const outcomes = [await run(), await run()]
        for (const outcome of outcomes) {
          const { result, events, unrelatedModuleGates, microphoneAcquisitions } = outcome
          expect(isRecord(result)).toBe(true)
          if (!isRecord(result)) continue

          expect(result.status === 'unavailable').toBe(true)
          expect(typeof result.reason === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(result.reason)).toBe(true)
          expect(isRecord(result.fallback)).toBe(true)
          if (!isRecord(result.fallback)) continue
          expect(result.fallback.state === 'maintenance').toBe(true)
          expect(result.fallback.visible === true).toBe(true)
          expect(result.fallback.nonblack === true).toBe(true)
          expect(events).toHaveLength(1)
          const unavailable = events.filter((event) => hasEventName(event, 'asset_unavailable'))
          expect(unavailable).toHaveLength(1)
          expect(events.some((event) => hasEventName(event, 'asset_ready'))).toBe(false)
          expect(unrelatedModuleGates).toBe(0)
          expect(microphoneAcquisitions).toBe(0)
          assertMetadataEvent(unavailable[0], 'asset_unavailable')
          expect(isRecord(unavailable[0])).toBe(true)
          if (isRecord(unavailable[0])) {
            expect(unavailable[0].reason === result.reason).toBe(true)
          }
        }

        const firstResult = outcomes[0]?.result
        const secondResult = outcomes[1]?.result
        expect(
          isRecord(firstResult)
          && isRecord(secondResult)
          && typeof firstResult.reason === 'string'
          && firstResult.reason === secondResult.reason,
        ).toBe(true)
        if (isRecord(firstResult) && typeof firstResult.reason === 'string') {
          reasons[fixture] = firstResult.reason
        }
      }

      expect(
        typeof reasons.missing === 'string'
        && typeof reasons.corrupt === 'string'
        && reasons.missing !== ''
        && reasons.corrupt !== ''
      ).toBe(true)
    })

    const { module: mirror, source: appSource } = await loadMirror()
    expect(typeof mirror.projectMirrorSnapshot).toBe('function')
    if (typeof mirror.projectMirrorSnapshot !== 'function') return

    const view = mirror.projectMirrorSnapshot({
      lifecycle: 'maintenance',
      maintenance: { code: 'offline_loop_asset_missing' },
    })
    expect(view.state).toBe('maintenance')
    expect(view.className).toBe('screen screen--maintenance')
    expect(view.title).toBe('Maintenance')
    expect(view.detail).toBe('offline_loop_asset_missing')
    expect(/getUserMedia|mediaDevices|AudioContext/i.test(appSource)).toBe(false)
  })

  it('pins the exact Electron/package scripts and package-lock versions', () => {
    const packageJson = JSON.parse(readRequired(PACKAGE_JSON_PATH)) as {
      readonly dependencies: Record<string, string>
      readonly devDependencies: Record<string, string>
      readonly scripts: Record<string, string>
    }
    const packageLock = JSON.parse(readRequired(PACKAGE_LOCK_PATH)) as {
      readonly packages: Record<string, {
        readonly dependencies?: Record<string, string>
        readonly devDependencies?: Record<string, string>
        readonly version?: string
      }>
    }

    expect(packageJson.devDependencies.electron).toBe('43.4.1')
    expect(packageJson.devDependencies['electron-builder']).toBe('26.15.3')
    expect(packageJson.dependencies['@picovoice/porcupine-node']).toBe('4.0.2')
    expect(packageJson.dependencies['sherpa-onnx-node']).toBe('1.13.6')
    expect(packageJson.dependencies.decibri).toBe('5.7.0')
    expect(packageJson.scripts['generate:offline-loop']).toBe('node scripts/generate-offline-loop.mjs')
    expect(packageJson.scripts.predev).toBe('npm run generate:offline-loop')
    expect(packageJson.scripts.prebuild).toBe('npm run generate:offline-loop')
    expect(packageJson.scripts.package).toBe('electron-builder --dir --publish never')
    expect(packageJson.scripts.smoke).toBe('electron .')

    expect(packageLock.packages['']?.devDependencies?.electron).toBe('43.4.1')
    expect(packageLock.packages['']?.devDependencies?.['electron-builder']).toBe('26.15.3')
    expect(packageLock.packages['']?.dependencies?.['@picovoice/porcupine-node']).toBe('4.0.2')
    expect(packageLock.packages['']?.dependencies?.['sherpa-onnx-node']).toBe('1.13.6')
    expect(packageLock.packages['']?.dependencies?.decibri).toBe('5.7.0')
    expect(packageLock.packages['node_modules/electron']?.version).toBe('43.4.1')
    expect(packageLock.packages['node_modules/electron-builder']?.version).toBe('26.15.3')
  })

  it('keeps the exact builder identity, file sets, unpack rule, macOS metadata, and versioned extra resources', () => {
    const builder = readRequired(BUILDER_CONFIG_PATH)
    const files = sectionLines(builder, 'files')
    const asarUnpack = sectionOrScalarLines(builder, 'asarUnpack')
    const extraResources = sectionLines(builder, 'extraResources')
    const mac = sectionLines(builder, 'mac').join('\n')

    expect(builder).toContain('appId: com.magicmirror.app')
    expect(builder).toContain('productName: Magic Mirror')
    expect(files).toEqual(['files:', '- out/**/*', '- package.json'])
    expect(builder).toMatch(/^asar:\s*true\s*$/m)
    expect(
      asarUnpack.length === 1
        ? asarUnpack[0] === 'asarUnpack: out/renderer/mock/*.mp4'
        : asarUnpack.join('\n') === 'asarUnpack:\n- out/renderer/mock/*.mp4',
    ).toBe(true)
    expect(extraResources).toEqual([
      'extraResources:',
      '- from: resources/config/default.json',
      'to: config/default.json',
      '- from: resources/wake-models',
      'to: wake-models',
    ])
    expect(extraResources.join('\n')).not.toMatch(/\.mp4|offline-loop/i)

    expect(mac.includes('hardenedRuntime: true')).toBe(true)
    expect(mac.includes('extendInfo: resources/macos/Info.plist.additions.xml')).toBe(true)
    expect(mac.includes('entitlements: resources/macos/entitlements.plist')).toBe(true)
    expect(mac.includes('entitlementsInherit: resources/macos/entitlements.plist')).toBe(true)
    expect(builder).toMatch(/target:\s*dir/)
    expect(builder).toMatch(/arch:\s*(?:x64|\r?\n\s*-\s*x64)/)
    expect(readRequired(INFO_PLIST_PATH)).toContain('NSMicrophoneUsageDescription')
    expect(readRequired(INFO_PLIST_PATH)).toContain('NSCameraUsageDescription')
    expect(readRequired(ENTITLEMENTS_PATH)).toContain('com.apple.security.device.audio-input')
    expect(readRequired(ENTITLEMENTS_PATH)).toContain('com.apple.security.device.camera')
  })

  it('asserts exactly one packaged renderer video and preserves the LaunchAgent sole restart owner', () => {
    const builder = readRequired(BUILDER_CONFIG_PATH)
    const index = readRequired(INDEX_PATH)
    const launchAgent = readRequired(LAUNCH_AGENT_PATH)
    const extraResources = sectionLines(builder, 'extraResources')
    const asarUnpack = sectionOrScalarLines(builder, 'asarUnpack')

    expect(PACKAGED_VIDEO_RELATIVE).toBe('app.asar.unpacked/out/renderer/mock/offline-loop-v1.mp4')
    expect(
      asarUnpack.length === 1
        ? asarUnpack[0] === 'asarUnpack: out/renderer/mock/*.mp4'
        : asarUnpack.join('\n') === 'asarUnpack:\n- out/renderer/mock/*.mp4',
    ).toBe(true)
    expect((builder.match(/out\/renderer\/mock\/\*\.mp4/g) ?? []).length).toBe(1)
    expect(extraResources.join('\n')).not.toMatch(/\.mp4|offline-loop/i)
    expect(index.includes('render-process-gone')).toBe(true)
    expect(index.includes('crashRecovery')).toBe(true)
    expect(index.includes('createWindow(kind)')).toBe(true)
    expect(index.includes('WINDOW_RECREATED')).toBe(true)
    expect(/\bapp\.relaunch\b/.test(index)).toBe(false)
    expect(/app\.exit\(1\)/.test(index)).toBe(true)
    expect(launchAgent).toContain('<string>com.magicmirror.launchagent</string>')
    expect(launchAgent).toContain('<string>/Applications/Magic Mirror.app/Contents/MacOS/Magic Mirror</string>')
    expect(launchAgent).toMatch(/<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/s)
    expect(launchAgent).toContain('SINGLE restart owner')
  })

  it('allows one renderer recreation, then delegates restart through exit code 1', async () => {
    const { module, source } = await loadCrashRecovery()
    const createCrashRecovery = module.createCrashRecovery
    expect(typeof createCrashRecovery).toBe('function')
    expect(source).toMatch(/DEFAULT_MAX_RECREATES\s*=\s*1/)
    if (typeof createCrashRecovery !== 'function') return

    const recovery = createCrashRecovery()
    const rendererGone = { window: 'mirror', reason: 'crashed', exitCode: 1 }
    expect(recovery.decide(rendererGone)).toEqual({ action: 'recreate', attempt: 1 })
    expect(recovery.decide(rendererGone)).toEqual({
      action: 'give_up',
      attempt: 2,
      reason: 'recreate_limit_exhausted',
    })
    expect(recovery.decide({ ...rendererGone, reason: 'clean-exit' })).toEqual({ action: 'ignore' })
  })
})
