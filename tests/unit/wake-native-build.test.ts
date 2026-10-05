import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { beginBuild, finishBuild, verifyBuild } from '../../scripts/qa-build.mjs'

const require = createRequire(import.meta.url)
const { getWakeNativeBuildPlan, verifyWakeNativeSourceArchive, wakeNativeSourceSha256 } =
  await import(new URL('../../scripts/build-wake-score-native.mjs', import.meta.url).href)

const temporaryRoots: string[] = []
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('wake native platform build', () => {
  it('forwards Windows arguments to the unchanged PowerShell launcher', () => {
    const plan = getWakeNativeBuildPlan({ platform: 'win32', arch: 'x64', root: '/checkout', args: ['-Parallel', '3'] })
    expect(plan.command).toBe('pwsh')
    expect(plan.args).toEqual(['-NoProfile', '-File', join('/checkout', 'scripts/build-wake-score-native.ps1'), '-Parallel', '3'])
  })

  it('pins the Mac archive and builds only the shared arm64 C API', () => {
    const plan = getWakeNativeBuildPlan({ platform: 'darwin', arch: 'arm64', root: '/checkout', args: ['--parallel', '3'],
      sdkPath: '/Xcode/SDKs/MacOSX.sdk' })
    expect(wakeNativeSourceSha256).toBe('78f5d10f957d2de1867a1e08395e9ec2ec388911c853dd141887396667f3ff34')
    expect(plan.nativeRoot).toBe(join('/checkout', '.artifacts/sherpa-score-native-mac'))
    expect(plan.configureArgs).toEqual(expect.arrayContaining(['-DCMAKE_OSX_ARCHITECTURES=arm64', '-DBUILD_SHARED_LIBS=ON',
      '-DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF', '-DSHERPA_ONNX_ENABLE_BINARY=OFF', '-DCMAKE_OSX_SYSROOT=/Xcode/SDKs/MacOSX.sdk']))
    expect(plan.buildArgs).toEqual(['--build', join(plan.nativeRoot, 'build'), '--config', 'Release',
      '--target', 'sherpa-onnx-c-api', '--parallel', '3'])
  })

  it('rejects unsupported platforms and invalid Mac concurrency instead of substituting a build', () => {
    expect(() => getWakeNativeBuildPlan({ platform: 'darwin', arch: 'x64' })).toThrow('wake_native_platform_unsupported')
    expect(() => getWakeNativeBuildPlan({ platform: 'darwin', arch: 'arm64', args: ['--parallel', '0'] }))
      .toThrow('wake_native_arguments_invalid')
  })

  it('rejects an altered source archive before extraction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-native-archive-'))
    temporaryRoots.push(root)
    const archive = join(root, 'synthetic.tar.gz')
    await writeFile(archive, 'synthetic-tamper')
    await expect(verifyWakeNativeSourceArchive(archive)).rejects.toThrow('wake_native_source_hash_mismatch')
  })
})

describe('wake native bundle integrity', () => {
  async function bundle(platform: string, arch: string) {
    const { getWakeNativeLayout, validateWakeNativeBundle } =
      await import(new URL('../../scripts/prepare-wake-score-native.mjs', import.meta.url).href)
    const root = await mkdtemp(join(tmpdir(), 'mm-native-build-'))
    temporaryRoots.push(root)
    const target = join(root, 'bundle')
    await mkdir(target)
    const patch = join(root, 'patch')
    await writeFile(patch, 'synthetic-patch')
    const layout = getWakeNativeLayout(platform, arch)
    const files: Record<string, string> = {}
    for (const name of layout.filenames) {
      const bytes = Buffer.from(`synthetic-${name}`)
      await writeFile(join(target, name), bytes)
      files[name] = createHash('sha256').update(bytes).digest('hex')
    }
    const manifest = { version: 1, engineVersion: '1.13.6', platform: layout.platform,
      sourceSha256: wakeNativeSourceSha256, patchSha256: createHash('sha256').update('synthetic-patch').digest('hex'), files }
    const save = () => writeFile(join(target, 'manifest.json'), JSON.stringify(manifest))
    await save()
    return { target, patch, layout, manifest, save, validate: () => validateWakeNativeBundle(target, layout, patch) }
  }

  it.each([['win32', 'x64'], ['darwin', 'arm64']])('hashes the full %s-%s bundle including its runtime', async (platform, arch) => {
    const item = await bundle(platform, arch)
    await expect(item.validate()).resolves.toBeUndefined()
    const library = platform === 'darwin' ? 'libsherpa-onnx-c-api.dylib' : 'sherpa-onnx-c-api.dll'
    expect(item.layout.filenames).toContain(library)
    expect(item.layout.filenames).toContain(platform === 'darwin' ? 'libonnxruntime.dylib' : 'onnxruntime.dll')
    await writeFile(join(item.target, library), 'synthetic-tamper')
    await expect(item.validate()).rejects.toThrow('wake_native_hash_mismatch')
  })

  it('rejects stale source, patch and platform metadata', async () => {
    const item = await bundle('darwin', 'arm64')
    item.manifest.sourceSha256 = '0'.repeat(64)
    await item.save()
    await expect(item.validate()).rejects.toThrow('wake_native_build_stale')
    item.manifest.sourceSha256 = wakeNativeSourceSha256
    item.manifest.platform = 'win32-x64'
    await item.save()
    await expect(item.validate()).rejects.toThrow('wake_native_build_stale')
    item.manifest.platform = item.layout.platform
    await item.save()
    await writeFile(item.patch, 'synthetic-patch-change')
    await expect(item.validate()).rejects.toThrow('wake_native_build_stale')
  })

  it('accepts the existing Windows manifest format without a platform field', async () => {
    const item = await bundle('win32', 'x64')
    await writeFile(join(item.target, 'manifest.json'), JSON.stringify({ ...item.manifest, platform: undefined }))
    await expect(item.validate()).resolves.toBeUndefined()
    await rm(join(item.target, 'onnxruntime.dll'))
    await expect(item.validate()).rejects.toThrow('wake_native_build_required')
  })

  it('packages native bundles under the matching platform instead of globally copying Windows DLLs', async () => {
    const yaml = await readFile(new URL('../../electron-builder.yml', import.meta.url), 'utf8')
    const config = require('js-yaml').load(yaml)
    const { getFileMatchers } = require('app-builder-lib/out/fileMatcher.js')
    const checkout = resolve('synthetic-build-checkout')
    for (const [platform, directory] of [['mac', 'darwin-arm64'], ['win', 'win32-x64']]) {
      const matchers = getFileMatchers(config, 'extraResources', '/app/resources', {
        defaultSrc: checkout, globalOutDir: join(checkout, 'dist'), customBuildOptions: config[platform],
        macroExpander: (value: string) => value,
      })
      const native = matchers.filter((item: { to: string }) => item.to.endsWith('wake-score-native'))
      expect(native.map((item: { from: string }) => item.from)).toEqual([join(checkout, 'resources/wake-native', directory)])
      expect(matchers.map((item: { from: string }) => item.from)).toContain(join(checkout, 'resources/config/default.json'))
      expect(matchers.map((item: { from: string }) => item.from)).toContain(join(checkout, 'resources/wake-models'))
    }
  })
})

describe('wake native build provenance', () => {
  it('invalidates QA stamps when the cross-platform launcher is added, changed or removed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-native-qa-stamp-'))
    temporaryRoots.push(root)
    for (const directory of ['src', 'resources/generated', 'resources/avatar', 'resources/config',
      'resources/wake-native', 'resources/offline-loop', 'scripts/native']) await mkdir(join(root, directory), { recursive: true })
    for (const file of ['package.json', 'package-lock.json', 'electron.vite.config.ts', 'tsconfig.json',
      'tsconfig.node.json', 'tsconfig.web.json', 'scripts/generate-offline-loop.mjs', 'scripts/prepare-avatar-assets.mjs',
      'scripts/generate-avatar-audio.mjs', 'scripts/build-wake-score-native.ps1', 'scripts/prepare-wake-score-native.mjs',
      'scripts/prepare-camera-tracker.mjs', 'deploy/macos/camera-tracker.swift', 'scripts/memory-qa-speech.swift',
      'out/main/index.js', 'out/preload/mirror.js', 'out/preload/console.js',
      'out/renderer/mirror/index.html', 'out/renderer/console/index.html']) {
      await mkdir(join(root, file, '..'), { recursive: true })
      await writeFile(join(root, file), 'synthetic')
    }
    await beginBuild(root)
    await finishBuild(root)
    await expect(verifyBuild(root)).resolves.toMatchObject({ status: 'complete' })
    const launcher = join(root, 'scripts/build-wake-score-native.mjs')
    await writeFile(launcher, 'synthetic-launcher')
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_stale')
    await beginBuild(root); await finishBuild(root)
    await writeFile(launcher, 'synthetic-launcher-changed')
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_stale')
    await beginBuild(root); await finishBuild(root)
    await rm(launcher)
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_stale')
  })
})
