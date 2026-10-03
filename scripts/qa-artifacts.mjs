import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKER = '.qa-artifact.json'
const OWNER = 'magic-mirror/phase4-qa'
const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/
const digest = value => createHash('sha256').update(value).digest('hex')
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b

async function ordinary(path, directory) {
  const stat = await lstat(path)
  if (stat.isSymbolicLink() || !samePath(await realpath(path), resolve(path))) throw Error('qa_artifact_link_rejected')
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) throw Error('qa_artifact_path_invalid')
  return stat
}

async function runRoot(repo, runId, create = false) {
  if (!RUN_ID.test(runId)) throw Error('qa_artifact_invalid_run_id')
  repo = resolve(repo)
  await ordinary(repo, true)
  let path = repo
  for (const name of ['.artifacts', 'phase4-qa']) {
    path = join(path, name)
    if (create) await mkdir(path).catch(error => { if (error.code !== 'EEXIST') throw error })
    await ordinary(path, true)
  }
  path = join(path, runId)
  if (create) await mkdir(path) // Never adopt or overwrite an existing directory.
  await ordinary(path, true)
  return path
}

async function markerAt(repo, runId) {
  const root = await runRoot(repo, runId)
  const file = join(root, MARKER)
  await ordinary(file, false).catch(error => {
    if (error.code === 'ENOENT') throw Error('qa_artifact_marker_required')
    throw error
  })
  const marker = await readFile(file, 'utf8').then(JSON.parse).catch(() => { throw Error('qa_artifact_marker_invalid') })
  if (!marker || marker.version !== 1 || marker.owner !== OWNER || marker.runId !== runId
    || typeof marker.repository !== 'string' || !samePath(marker.repository, resolve(repo)) || !['running', 'finished'].includes(marker.state)) {
    throw Error('qa_artifact_marker_invalid')
  }
  return { root, marker }
}

export async function createQaArtifact(repo, runId) {
  const root = await runRoot(repo, runId, true)
  await writeFile(join(root, MARKER), JSON.stringify({ version: 1, owner: OWNER, runId,
    repository: resolve(repo), state: 'running', createdAt: new Date().toISOString() }), { flag: 'wx' })
  return root
}

export async function finishQaArtifact(repo, runId, exitCode) {
  const { root, marker } = await markerAt(repo, runId)
  if (marker.state !== 'running' || !Number.isInteger(exitCode)) throw Error('qa_artifact_finish_invalid')
  await writeFile(join(root, MARKER), JSON.stringify({ ...marker, state: 'finished', exitCode,
    finishedAt: new Date().toISOString() }))
}

async function reportDigest(repo, report) {
  if (typeof report !== 'string' || !/^docs\/testing\/[a-zA-Z0-9_-]+\.md$/.test(report)) throw Error('qa_artifact_report_invalid')
  await ordinary(join(repo, 'docs'), true)
  await ordinary(join(repo, 'docs/testing'), true)
  await ordinary(join(repo, report), false)
  const bytes = await readFile(join(repo, report))
  if (!bytes.length) throw Error('qa_artifact_report_invalid')
  return digest(bytes)
}

async function inventory(root) {
  const entries = []
  let files = 0, bytes = 0
  async function walk(path) {
    for (const name of (await readdir(path)).sort()) {
      if (path === root && name === MARKER) continue
      const file = join(path, name), stat = await lstat(file)
      if (stat.isSymbolicLink()) throw Error('qa_artifact_link_rejected')
      await ordinary(file, stat.isDirectory())
      entries.push([relative(root, file), stat.isDirectory() ? 'directory' : [stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino]])
      if (stat.isDirectory()) await walk(file)
      else { files++; bytes += stat.size }
    }
  }
  await walk(root)
  return { fingerprint: digest(JSON.stringify(entries)), files, bytes }
}

function finished(marker) {
  if (marker.state !== 'finished' || !Number.isInteger(marker.exitCode)) throw Error('qa_artifact_run_unfinished')
}

export async function reviewQaArtifact(repo, runId, report) {
  const { root, marker } = await markerAt(repo, runId)
  finished(marker)
  const reportHash = await reportDigest(repo, report)
  const contents = await inventory(root)
  await writeFile(join(root, MARKER), JSON.stringify({ ...marker,
    review: { report, reportHash, ...contents, reviewedAt: new Date().toISOString() } }))
  return { runId, report, ...contents, reviewed: true }
}

export async function cleanQaArtifact(repo, runId, deleteFiles = false) {
  const { root, marker } = await markerAt(repo, runId)
  finished(marker)
  if (!marker.review) throw Error('qa_artifact_review_required')
  if (await reportDigest(repo, marker.review.report) !== marker.review.reportHash) throw Error('qa_artifact_report_changed')
  const contents = await inventory(root)
  if (contents.fingerprint !== marker.review.fingerprint) throw Error('qa_artifact_contents_changed')
  // Only this named, completed, reviewed run is eligible. No glob or force option.
  if (deleteFiles) await rm(root, { recursive: true, force: false })
  return { runId, root, report: marker.review.report, exitCode: marker.exitCode, ...contents, deleted: deleteFiles }
}

if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const [command, runId, option, value, ...extra] = process.argv.slice(2)
  try {
    let result
    if (command === 'review' && option === '--report' && value && !extra.length) result = await reviewQaArtifact(repo, runId, value)
    else if (command === 'clean' && (!option || option === '--delete') && !value && !extra.length) result = await cleanQaArtifact(repo, runId, option === '--delete')
    else throw Error('usage: node scripts/qa-artifacts.mjs review RUN_ID --report docs/testing/REPORT.md | clean RUN_ID [--delete]')
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
}
