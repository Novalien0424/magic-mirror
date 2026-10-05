#!/usr/bin/env node
/** Explicit provisioning only: node scripts/prepare-memory-embedding.mjs [--runtime-directory DIR] [--uv PATH]. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

class SetupError extends Error {
  constructor(reason, exit) { super(reason); this.reason = reason; this.exit = exit }
}

function report(reason, metadata = {}) {
  process.stdout.write(`${JSON.stringify({ type: 'memory_embedding_prepare', reason, ...metadata })}\n`)
}

function parseArgs() {
  const args = process.argv.slice(2)
  let runtimeDirectory = fileURLToPath(new URL('../.local/memory-embedding', import.meta.url))
  let uv = 'uv'
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--help') {
      process.stdout.write('node scripts/prepare-memory-embedding.mjs [--runtime-directory DIR] [--uv PATH]\nPrivate, isolated macOS arm64 runtime. Downloads only during this command; no global installation.\n')
      return null
    }
    if (!['--runtime-directory', '--uv'].includes(arg) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new SetupError('invalid_options')
    }
    if (arg === '--runtime-directory') runtimeDirectory = resolve(args[++index])
    else uv = args[++index]
  }
  return { runtimeDirectory, uv }
}

async function hashFile(path) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length }
  return { sha256: hash.digest('hex'), bytes }
}

async function validFile(path, sha256, size) {
  try {
    if (size !== undefined && (await stat(path)).size !== size) return false
    const result = await hashFile(path)
    return result.sha256 === sha256 && (size === undefined || result.bytes === size)
  } catch { return false }
}

async function download(url, path, sha256, size) {
  const artifact = basename(path)
  if (!/^[a-f0-9]{64}$/.test(sha256) || new URL(url).protocol !== 'https:') throw new SetupError('invalid_manifest')
  if (await validFile(path, sha256, size)) return
  for (let attempt = 1; attempt <= 2; attempt++) {
    const temporary = `${path}.part`
    await rm(temporary, { force: true })
    let reason = 'download_failed'
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(600_000),
        headers: { 'User-Agent': 'MagicMirror-Memory-Prepare/1' } })
      if (!response.ok || !response.body) {
        reason = `http_status_${response.status}`
        throw new SetupError(reason)
      }
      const hash = createHash('sha256')
      let bytes = 0
      const maximum = size ?? 100 * 1024 * 1024
      async function* checkedBody() {
        for await (const chunk of Readable.fromWeb(response.body)) {
          bytes += chunk.length
          if (bytes > maximum) { reason = 'download_too_large'; throw new SetupError(reason) }
          hash.update(chunk)
          yield chunk
        }
      }
      await pipeline(checkedBody(), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
      if (hash.digest('hex') !== sha256 || (size !== undefined && bytes !== size)) {
        reason = 'hash_mismatch'
        throw new SetupError(reason)
      }
      await rename(temporary, path)
      report('artifact_verified', { artifact, bytes })
      return
    } catch {
      await rm(temporary, { force: true })
      // Exact content-free failure, including the single allowed retry attempt.
      report(reason, { artifact, attempt })
      if (attempt === 2) throw new SetupError(reason)
    }
  }
}

function run(executable, args, env, reason) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { shell: false, env, stdio: ['ignore', 'ignore', 'ignore'] })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 180_000)
    child.once('error', () => { clearTimeout(timer); reject(new SetupError(reason)) })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && !timedOut) resolveRun()
      else reject(new SetupError(timedOut ? `${reason}_timeout` : reason, code))
    })
  })
}

async function prepare(options) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new SetupError('runtime_unsupported')
  const root = options.runtimeDirectory
  const allowed = new Set(['.gitignore', '.prepare.lock', 'downloads', 'wheels', 'python', 'venv', 'model', 'cache',
    'manifest.json', 'memory-embedding-worker.py', 'runtime.json', 'requirements.lock'])
  try {
    if ((await readdir(root)).some((name) => !allowed.has(name))) throw new SetupError('runtime_directory_not_empty')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(root, { recursive: true, mode: 0o700 })
  await chmod(root, 0o700)
  await writeFile(join(root, '.gitignore'), '*\n', { mode: 0o600 })
  let lock
  try { lock = await open(join(root, '.prepare.lock'), 'wx', 0o600) } catch { throw new SetupError('prepare_locked') }
  try {
    const manifestBytes = await readFile(new URL('../resources/config/memory-embedding.v1.json', import.meta.url))
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    const identity = manifest.identity
    if (manifest.schemaVersion !== 1 || identity.runtime.platform !== 'darwin-arm64'
      || identity.model.repository !== 'Qwen/Qwen3-Embedding-0.6B') throw new SetupError('invalid_manifest')
    const version = `memory-embedding.v1:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`
    const directories = ['downloads', 'wheels', 'model', 'cache']
    for (const directory of directories) await mkdir(join(root, directory), { recursive: true, mode: 0o700 })
    const python = identity.runtime.python
    const archive = join(root, 'downloads', python.filename)
    await download(manifest.downloads.python, archive, python.sha256)
    const interpreter = join(root, 'python', 'bin', 'python3.12')
    // No credential-bearing environment, user uv config, system Python download,
    // global cache, or global package installation enters these subprocesses.
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'en_US.UTF-8',
      UV_CACHE_DIR: join(root, 'cache', 'uv'), UV_PYTHON_DOWNLOADS: 'never', UV_NO_CONFIG: '1', UV_HTTP_RETRIES: '0',
      HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', HF_HOME: join(root, 'cache', 'hf') }
    try { await stat(interpreter) } catch {
      await run('/usr/bin/tar', ['-xzf', archive, '-C', root], env, 'python_extract_failed')
    }
    const wheels = identity.runtime.packages
    for (const wheel of wheels) {
      if (basename(wheel.filename) !== wheel.filename) throw new SetupError('invalid_manifest')
      await download(manifest.downloads.wheels[wheel.filename], join(root, 'wheels', wheel.filename), wheel.sha256, wheel.size)
    }
    const requirements = wheels.map((wheel) => `${wheel.name}==${wheel.version} --hash=sha256:${wheel.sha256}`).join('\n') + '\n'
    const requirementsPath = join(root, 'requirements.lock')
    await writeFile(requirementsPath, requirements, { mode: 0o600 })
    const venvPython = join(root, 'venv', 'bin', 'python')
    try { await stat(venvPython) } catch {
      await run(options.uv, ['venv', '--no-config', '--python', interpreter, join(root, 'venv')], env, 'uv_venv_failed')
    }
    await run(options.uv, ['pip', 'sync', '--no-config', '--offline', '--no-index', '--require-hashes',
      '--find-links', join(root, 'wheels'), '--python', venvPython, requirementsPath], env, 'uv_install_failed')
    await run(venvPython, ['-I', '-B', '-c',
      'import importlib.metadata,json,platform,sys; p=json.loads(sys.argv[1]); assert platform.python_version()==sys.argv[2]; assert all(importlib.metadata.version(x["name"])==x["version"] for x in p)',
      JSON.stringify(wheels.map(({ name, version }) => ({ name, version }))), python.version], env, 'runtime_verify_failed')
    for (const asset of identity.model.files) {
      if (basename(asset.name) !== asset.name) throw new SetupError('invalid_manifest')
      await download(manifest.downloads.modelBase + asset.name, join(root, 'model', asset.name), asset.sha256, asset.size)
    }
    const workerBytes = await readFile(new URL('./memory-embedding-worker.py', import.meta.url))
    await writeFile(join(root, 'manifest.json'), manifestBytes, { mode: 0o600 })
    await writeFile(join(root, 'memory-embedding-worker.py'), workerBytes, { mode: 0o600 })
    await writeFile(join(root, 'runtime.json'), JSON.stringify({ version, platform: identity.runtime.platform,
      manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      workerSha256: createHash('sha256').update(workerBytes).digest('hex'), preparedAt: new Date().toISOString() }) + '\n', { mode: 0o600 })
    report('runtime_prepared', { version, dimensions: identity.dimensions, packages: wheels.length, runtimeDirectory: root })
  } finally {
    await lock.close()
    await rm(join(root, '.prepare.lock'), { force: true })
  }
}

try {
  const options = parseArgs()
  if (options) await prepare(options)
} catch (error) {
  report(error instanceof SetupError ? error.reason : 'prepare_failed', error instanceof SetupError && error.exit !== undefined ? { exit: error.exit } : {})
  process.exitCode = 1
}
