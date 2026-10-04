import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const wakeNativeSourceSha256 = '78f5d10f957d2de1867a1e08395e9ec2ec388911c853dd141887396667f3ff34'

export function getWakeNativeBuildPlan({ platform = process.platform, arch = process.arch,
  root = repositoryRoot, args = [], sdkPath } = {}) {
  if (platform === 'win32' && arch === 'x64') {
    return { command: 'pwsh', args: ['-NoProfile', '-File', join(root, 'scripts/build-wake-score-native.ps1'), ...args] }
  }
  if (platform !== 'darwin' || arch !== 'arm64') throw new Error('wake_native_platform_unsupported')
  let parallel = '6'
  if (args.length) {
    if (args.length !== 2 || !/^(--parallel|-parallel)$/i.test(args[0])
      || !/^[1-9]\d*$/.test(args[1]) || Number(args[1]) > 64) throw new Error('wake_native_arguments_invalid')
    parallel = args[1]
  }
  const nativeRoot = join(root, '.artifacts/sherpa-score-native-mac')
  const source = join(nativeRoot, 'sherpa-onnx-1.13.6')
  const build = join(nativeRoot, 'build')
  return { nativeRoot, source, build, archive: join(nativeRoot, 'sherpa-onnx-1.13.6.tar.gz'),
    configureArgs: ['-S', source, '-B', build, '-G', 'Unix Makefiles', '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_OSX_ARCHITECTURES=arm64', '-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0', '-DBUILD_SHARED_LIBS=ON',
      ...(sdkPath ? [`-DCMAKE_OSX_SYSROOT=${sdkPath}`] : []),
      '-DSHERPA_ONNX_USE_PRE_INSTALLED_ONNXRUNTIME_IF_AVAILABLE=OFF', '-DSHERPA_ONNX_ENABLE_C_API=ON',
      '-DSHERPA_ONNX_ENABLE_BINARY=OFF', '-DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF', '-DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF',
      '-DSHERPA_ONNX_ENABLE_TTS=OFF', '-DSHERPA_ONNX_ENABLE_SPEAKER_DIARIZATION=OFF', '-DSHERPA_ONNX_BUILD_C_API_EXAMPLES=OFF'],
    buildArgs: ['--build', build, '--config', 'Release', '--target', 'sherpa-onnx-c-api', '--parallel', parallel] }
}

export async function verifyWakeNativeSourceArchive(archive) {
  if (createHash('sha256').update(await readFile(archive)).digest('hex') !== wakeNativeSourceSha256) {
    throw new Error('wake_native_source_hash_mismatch')
  }
}

function run(command, args, root, reason) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    child.once('error', () => reject(new Error(`${reason}_unavailable`)))
    child.once('close', (code, signal) => {
      if (code === 0) resolveCommand()
      else {
        console.error(`wake_native_command_failed command=${command} exit=${code ?? 'none'} signal=${signal ?? 'none'}`)
        reject(new Error(reason))
      }
    })
  })
}

export async function buildWakeNative(args = process.argv.slice(2)) {
  let plan = getWakeNativeBuildPlan({ args })
  if (plan.command) {
    await run(plan.command, plan.args, repositoryRoot, 'wake_native_build_failed')
    return
  }
  await run('cmake', ['--version'], repositoryRoot, 'wake_native_cmake_required')
  let sdkPath
  try {
    const { stdout } = await promisify(execFile)('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { cwd: repositoryRoot })
    sdkPath = stdout.trim()
    if (!sdkPath || !existsSync(sdkPath)) throw new Error('wake_native_sdk_unavailable')
  } catch { throw new Error('wake_native_sdk_unavailable') }
  console.log(`wake_native_sdk_selected path=${sdkPath}`)
  plan = getWakeNativeBuildPlan({ args, sdkPath })
  await mkdir(plan.nativeRoot, { recursive: true })
  if (!existsSync(plan.archive)) {
    const download = `${plan.archive}.download`
    await run('curl', ['--fail', '--location', '--retry', '1', '--silent', '--show-error', '--output', download,
      'https://github.com/k2-fsa/sherpa-onnx/archive/refs/tags/v1.13.6.tar.gz'], repositoryRoot, 'wake_native_download_failed')
    await verifyWakeNativeSourceArchive(download)
    await rename(download, plan.archive)
  }
  await verifyWakeNativeSourceArchive(plan.archive)
  console.log(`wake_native_source_verified sha256=${wakeNativeSourceSha256}`)
  if (!existsSync(join(plan.source, 'CMakeLists.txt'))) {
    await run('tar', ['-xzf', plan.archive, '-C', plan.nativeRoot], repositoryRoot, 'wake_native_extract_failed')
  }
  const patch = join(repositoryRoot, 'scripts/native/sherpa-onnx-1.13.6-wake-score.patch')
  const directory = `--directory=${relative(repositoryRoot, plan.source).split(sep).join('/')}`
  const patched = (await readFile(join(plan.source, 'sherpa-onnx/csrc/keyword-spotter.cc'), 'utf8')).includes('wake_score_version')
  if (patched) await run('git', ['apply', '--reverse', '--check', directory, patch], repositoryRoot, 'wake_native_patch_conflict')
  else {
    await run('git', ['apply', '--check', directory, patch], repositoryRoot, 'wake_native_patch_conflict')
    await run('git', ['apply', directory, patch], repositoryRoot, 'wake_native_patch_failed')
  }
  await run('cmake', plan.configureArgs, repositoryRoot, 'wake_native_configure_failed')
  await run('cmake', plan.buildArgs, repositoryRoot, 'wake_native_build_failed')
  await run(process.execPath, [join(repositoryRoot, 'scripts/prepare-wake-score-native.mjs'), '--install'],
    repositoryRoot, 'wake_native_install_failed')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildWakeNative() }
  catch (error) {
    console.error(/^wake_native_[a-z_]+$/.test(error.message) ? error.message : 'wake_native_build_failed')
    process.exitCode = 1
  }
}
