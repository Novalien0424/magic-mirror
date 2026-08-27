import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const entry = resolve('out', 'main', 'wake-evaluator.js')
if (!existsSync(entry)) {
  process.stderr.write('WAKE_EVALUATION status=failed reason=build_required\n')
  process.exit(2)
}
const supplied = process.argv.slice(2)
const forwarded = supplied[0]?.startsWith('--') === false
  ? ['--corpus', supplied[0], ...supplied.slice(1).flatMap((packageId) => ['--package', packageId])]
  : supplied
const child = spawn(process.execPath, [entry, ...forwarded], {
  stdio: 'inherit',
  env: process.env,
})
child.once('error', () => {
  process.stderr.write('WAKE_EVALUATION status=failed reason=runner_failed\n')
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = typeof code === 'number' ? code : 1
})
