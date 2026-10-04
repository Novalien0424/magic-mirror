import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyWakeNativeSourceArchive, wakeNativeSourceSha256 } from './build-wake-score-native.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patch = join(root, 'scripts/native/sherpa-onnx-1.13.6-wake-score.patch')
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex')

export function getWakeNativeLayout(platform = process.platform, arch = process.arch) {
  const common = ['sherpa-onnx.node', 'keyword-spotter.js', 'streaming-asr.js', 'addon.js', 'LICENSE',
    'ONNXRUNTIME-LICENSE', 'ONNXRUNTIME-ThirdPartyNotices.txt']
  if (platform === 'win32' && arch === 'x64') {
    return { platform: 'win32-x64', packageName: 'sherpa-onnx-win-x64', nativeDirectory: 'sherpa-score-native',
      cApiBuildPath: 'bin/Release/sherpa-onnx-c-api.dll',
      libraries: ['onnxruntime.dll', 'onnxruntime_providers_shared.dll'],
      filenames: [...common, 'sherpa-onnx-c-api.dll', 'onnxruntime.dll', 'onnxruntime_providers_shared.dll'] }
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return { platform: 'darwin-arm64', packageName: 'sherpa-onnx-darwin-arm64', nativeDirectory: 'sherpa-score-native-mac',
      cApiBuildPath: 'lib/libsherpa-onnx-c-api.dylib', libraries: ['libonnxruntime.dylib'],
      filenames: [...common, 'libsherpa-onnx-c-api.dylib', 'libonnxruntime.dylib'] }
  }
  return null
}

export async function validateWakeNativeBundle(target, layout, patchPath = patch) {
  try {
    const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'))
    const legacyWindows = layout.platform === 'win32-x64' && manifest.platform === undefined
    if (manifest.version !== 1 || manifest.engineVersion !== '1.13.6'
      || (!legacyWindows && manifest.platform !== layout.platform)
      || manifest.sourceSha256 !== wakeNativeSourceSha256 || manifest.patchSha256 !== await sha(patchPath)) {
      throw new Error('wake_native_build_stale')
    }
    for (const name of layout.filenames) {
      if (manifest.files?.[name] !== await sha(join(target, name))) throw new Error('wake_native_hash_mismatch')
    }
  } catch (error) {
    throw new Error(/^wake_native_[a-z_]+$/.test(error.message) ? error.message : 'wake_native_build_required')
  }
}

export async function prepareWakeNative(install = false) {
  const layout = getWakeNativeLayout()
  if (!layout) { console.log('wake_native_score_platform_not_built'); return }
  const target = join(root, 'resources/wake-native', layout.platform)
  if (install) {
    const packageRoot = join(root, 'node_modules/sherpa-onnx-node')
    const platformRoot = join(root, 'node_modules', layout.packageName)
    const nativeRoot = join(root, '.artifacts', layout.nativeDirectory)
    const build = join(nativeRoot, 'build')
    await verifyWakeNativeSourceArchive(join(nativeRoot, 'sherpa-onnx-1.13.6.tar.gz'))
    for (const directory of [packageRoot, platformRoot]) {
      if (JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).version !== '1.13.6') {
        throw new Error('wake_native_version_mismatch')
      }
    }
    await mkdir(target, { recursive: true })
    for (const name of ['keyword-spotter.js', 'streaming-asr.js']) await copyFile(join(packageRoot, name), join(target, name))
    await copyFile(join(platformRoot, 'sherpa-onnx.node'), join(target, 'sherpa-onnx.node'))
    const cApiName = layout.cApiBuildPath.split('/').at(-1)
    await copyFile(join(build, layout.cApiBuildPath), join(target, cApiName))
    for (const name of layout.libraries) {
      await copyFile(join(build, '_deps/onnxruntime-src/lib', name), join(target, name))
    }
    await copyFile(join(build, '_deps/onnxruntime-src/LICENSE'), join(target, 'ONNXRUNTIME-LICENSE'))
    await copyFile(join(build, '_deps/onnxruntime-src/ThirdPartyNotices.txt'), join(target, 'ONNXRUNTIME-ThirdPartyNotices.txt'))
    await copyFile(join(nativeRoot, 'sherpa-onnx-1.13.6/LICENSE'), join(target, 'LICENSE'))
    await writeFile(join(target, 'addon.js'), "module.exports = require('./sherpa-onnx.node')\n")
    const files = Object.fromEntries(await Promise.all(layout.filenames.map(async name => [name, await sha(join(target, name))])))
    await writeFile(join(target, 'manifest.json'), JSON.stringify({ version: 1, engineVersion: '1.13.6',
      platform: layout.platform, sourceSha256: wakeNativeSourceSha256,
      patchSha256: await sha(patch), files }, null, 2) + '\n')
  }
  await validateWakeNativeBundle(target, layout)
  console.log(`wake_native_score_ready version=1 engine=1.13.6 platform=${layout.platform}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareWakeNative(process.argv.includes('--install')) }
  catch (error) {
    const reason = /^wake_native_[a-z_]+$/.test(error.message) ? error.message : 'wake_native_build_required'
    const prerequisites = process.platform === 'darwin' ? 'Mac with Xcode Command Line Tools and CMake'
      : 'Windows with Visual Studio C++ Build Tools and CMake'
    console.error(`${reason}: run npm run build:wake-native on ${prerequisites}.`)
    process.exitCode = 1
  }
}
