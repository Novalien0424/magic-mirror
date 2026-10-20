#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const runner = path.join(import.meta.dirname, 'run-v08-qa.mjs')
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'raven-v08-qa-args-'))

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, ...args], { cwd: path.dirname(runner), windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

try {
  const helpOutput = path.join(tempRoot, 'help-captures')
  const help = await run(['--help', '--output', helpOutput])
  assert.equal(help.code, 0, help.stderr)
  assert.match(help.stderr, /Usage: node run-v08-qa\.mjs/)
  await assert.rejects(fs.stat(helpOutput), (error) => error?.code === 'ENOENT')

  const missingRoot = path.join(tempRoot, 'missing-model-root')
  const missingRootOutput = path.join(tempRoot, 'missing-root-captures')
  const missing = await run(['--model-root', missingRoot, '--output', missingRootOutput])
  assert.equal(missing.code, 2, missing.stderr)
  assert.match(missing.stderr, /model-root is not a directory/)
  await assert.rejects(fs.stat(missingRootOutput), (error) => error?.code === 'ENOENT')

  const emptyModelRoot = path.join(tempRoot, 'empty-model-root')
  await fs.mkdir(emptyModelRoot)
  const missingOutput = await run(['--model-root', emptyModelRoot])
  assert.equal(missingOutput.code, 2, missingOutput.stderr)
  assert.match(missingOutput.stderr, /--output is required/)

  console.log(JSON.stringify({ status: 'pass', checks: ['help_no_write', 'missing_model_root_no_write', 'missing_output_rejected'] }, null, 2))
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
