import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit build inputs only: never walk the checkout root or read .env/user data.
const inputs = ['src', 'resources/generated', 'resources/avatar', 'resources/config',
  'resources/offline-loop', 'package.json', 'package-lock.json', 'electron.vite.config.ts',
  'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json',
  'scripts/generate-offline-loop.mjs', 'scripts/prepare-avatar-assets.mjs', 'scripts/generate-avatar-audio.mjs']
const requiredOutputs = ['main/index.js', 'preload/mirror.js', 'preload/console.js',
  'renderer/mirror/index.html', 'renderer/console/index.html']
const manifestName = '.qa-build.json'

async function fingerprint(root, paths) {
  const hash = createHash('sha256')
  async function visit(path) {
    const info = await lstat(join(root, path))
    if (info.isSymbolicLink()) throw new Error('qa_build_symlink')
    if (info.isDirectory()) {
      for (const entry of (await readdir(join(root, path))).sort()) {
        if (path === 'out' && entry === manifestName) continue
        await visit(`${path}/${entry}`)
      }
    } else if (info.isFile()) {
      const bytes = await readFile(join(root, path))
      hash.update(`${path}\0${bytes.length}\0`).update(bytes)
    } else throw new Error('qa_build_input_invalid')
  }
  for (const path of paths) await visit(path)
  return hash.digest('hex')
}

async function readManifest(root) {
  try { return JSON.parse(await readFile(join(root, 'out', manifestName), 'utf8')) }
  catch { throw new Error('qa_build_required') }
}
async function saveManifest(root, value) {
  await mkdir(join(root, 'out'), { recursive: true })
  await writeFile(join(root, 'out', manifestName), JSON.stringify(value))
}
export async function beginBuild(root) {
  await saveManifest(root, { version: 1, status: 'building', source: await fingerprint(root, inputs) })
}
export async function finishBuild(root) {
  const before = await readManifest(root)
  const source = await fingerprint(root, inputs)
  if (before.version !== 1 || before.status !== 'building' || before.source !== source) {
    throw new Error('qa_build_source_changed')
  }
  for (const path of requiredOutputs) {
    try { if (!(await lstat(join(root, 'out', path))).isFile()) throw new Error() }
    catch { throw new Error('qa_build_output_missing') }
  }
  const manifest = { version: 1, status: 'complete', source,
    output: await fingerprint(root, ['out']), builtAt: new Date().toISOString() }
  await saveManifest(root, manifest)
  return manifest
}
export async function verifyBuild(root) {
  const manifest = await readManifest(root)
  if (manifest.version !== 1 || manifest.status !== 'complete') throw new Error('qa_build_incomplete')
  if (manifest.source !== await fingerprint(root, inputs)) throw new Error('qa_build_stale')
  if (manifest.output !== await fingerprint(root, ['out'])) throw new Error('qa_build_output_changed')
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  try {
    const mode = process.argv[2]
    if (mode === '--begin') await beginBuild(root)
    else if (mode === '--finish') await finishBuild(root)
    else if (mode === '--verify') await verifyBuild(root)
    else throw new Error('qa_build_mode_invalid')
  } catch (error) {
    const reason = /^qa_build_[a-z_]+$/.test(error.message) ? error.message : 'qa_build_io_failed'
    process.stderr.write(`${reason}: run npm run build before Electron QA.\n`)
    process.exitCode = 2
  }
}
