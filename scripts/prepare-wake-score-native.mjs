import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'resources/wake-native/win32-x64')
const patch = join(root, 'scripts/native/sherpa-onnx-1.13.6-wake-score.patch')
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex')
const filenames = ['sherpa-onnx.node', 'sherpa-onnx-c-api.dll', 'onnxruntime.dll',
  'onnxruntime_providers_shared.dll', 'keyword-spotter.js', 'streaming-asr.js', 'addon.js', 'LICENSE',
  'ONNXRUNTIME-LICENSE', 'ONNXRUNTIME-ThirdPartyNotices.txt']

try {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    console.log('wake_native_score_platform_not_built'); process.exit(0)
  }
  if (process.argv.includes('--install')) {
    const packageRoot = join(root, 'node_modules/sherpa-onnx-node')
    const platformRoot = join(root, 'node_modules/sherpa-onnx-win-x64')
    for (const directory of [packageRoot, platformRoot]) {
      if (JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).version !== '1.13.6') {
        throw new Error('wake_native_version_mismatch')
      }
    }
    await mkdir(target, { recursive: true })
    for (const name of ['keyword-spotter.js', 'streaming-asr.js']) await copyFile(join(packageRoot, name), join(target, name))
    await copyFile(join(platformRoot, 'sherpa-onnx.node'), join(target, 'sherpa-onnx.node'))
    const build = join(root, '.artifacts/sherpa-score-native/build')
    await copyFile(join(build, 'bin/Release/sherpa-onnx-c-api.dll'), join(target, 'sherpa-onnx-c-api.dll'))
    for (const name of ['onnxruntime.dll', 'onnxruntime_providers_shared.dll']) {
      await copyFile(join(build, '_deps/onnxruntime-src/lib', name), join(target, name))
    }
    await copyFile(join(build, '_deps/onnxruntime-src/LICENSE'), join(target, 'ONNXRUNTIME-LICENSE'))
    await copyFile(join(build, '_deps/onnxruntime-src/ThirdPartyNotices.txt'), join(target, 'ONNXRUNTIME-ThirdPartyNotices.txt'))
    await copyFile(join(root, '.artifacts/sherpa-score-native/sherpa-onnx-1.13.6/LICENSE'), join(target, 'LICENSE'))
    await writeFile(join(target, 'addon.js'), "module.exports = require('./sherpa-onnx.node')\n")
    const files = Object.fromEntries(await Promise.all(filenames.map(async name => [name, await sha(join(target, name))])))
    await writeFile(join(target, 'manifest.json'), JSON.stringify({ version: 1, engineVersion: '1.13.6',
      sourceSha256: '78f5d10f957d2de1867a1e08395e9ec2ec388911c853dd141887396667f3ff34',
      patchSha256: await sha(patch), files }, null, 2) + '\n')
  }
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.engineVersion !== '1.13.6' || manifest.patchSha256 !== await sha(patch)) {
    throw new Error('wake_native_build_stale')
  }
  for (const name of filenames) {
    if (manifest.files[name] !== await sha(join(target, name))) throw new Error('wake_native_hash_mismatch')
  }
  console.log('wake_native_score_ready version=1 engine=1.13.6 platform=win32-x64')
} catch (error) {
  const reason = /^wake_native_[a-z_]+$/.test(error.message) ? error.message : 'wake_native_build_required'
  console.error(`${reason}: run npm run build:wake-native on Windows with Visual Studio C++ Build Tools and CMake.`)
  process.exitCode = 1
}
