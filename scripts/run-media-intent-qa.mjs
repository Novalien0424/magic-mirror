import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBuild } from './qa-build.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const build = await verifyBuild(root)
const evidence = join(root, '.artifacts', 'media-intent-qa', new Date().toISOString().replaceAll(':', '-'))
await mkdir(evidence, { recursive: true })
await writeFile(join(evidence, 'build.json'), JSON.stringify(build))
const require = createRequire(import.meta.url)
const child = spawn(require('electron'), [join(root, 'out/main/media-intent-qa.js'), evidence], { cwd: root, stdio: 'inherit' })
child.on('error', () => { console.error('media_intent_qa_launch_failed'); process.exitCode = 2 })
child.on('exit', async code => {
  let verified = false
  try {
    const result = JSON.parse(await readFile(join(evidence, 'evidence.json'), 'utf8'))
    verified = result.checks.length === 8 && result.checks.every(check => check.passed === true)
  } catch { /* Partial evidence cannot pass. */ }
  console.log(`Media intent QA evidence: ${evidence}`)
  process.exitCode = code === 0 && verified ? 0 : 2
})
