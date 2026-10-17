import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireElectronOwner, assertElectronStopped } from './electron-owner.mjs'
import { qualityRates } from './raven-quality-rates.mjs'

const release = acquireElectronOwner('raven-audit-trials')
process.once('exit', release)
assertElectronStopped()
const scenario = process.argv[2] ?? 'local_scope'
const rounds = Number(process.argv[3] ?? 1)
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) throw Error('raven_trials_rounds_invalid')
const root = join(process.cwd(), '.artifacts/third-audit-trials', new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'))
await mkdir(root, { recursive: true })
const cells = [], arms = [['baseline', 'mini'], ['trimmed', 'mini'], ['trimmed', 'full'], ['merged', 'mini']]
let cancelled = false, current
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cancelled = true; current?.kill(signal) })
console.log(JSON.stringify({ event: 'raven_trials_started', root, scenario, rounds }))
for (let round = 0; round < rounds && !cancelled; round++) {
  // Reverse alternate rounds to reduce order/session-time confounding.
  for (const [prompt, model] of round % 2 ? [...arms].reverse() : arms) {
    if (cancelled) break
    const log = join(root, `${round + 1}-${prompt}-${model}.log`), fd = await open(log, 'wx')
    const started = Date.now()
    const exit = await new Promise(resolve => {
      current = spawn(process.execPath, ['scripts/run-raven-conversation-qa.mjs', '--launch-agent', '--scenario', scenario, '--prompt', prompt, '--variant', model],
        { env: process.env, stdio: ['ignore', fd.fd, fd.fd] })
      current.once('error', () => resolve(1)); current.once('exit', code => resolve(code ?? 1))
    })
    current = undefined; await fd.close()
    const output = await readFile(log, 'utf8')
    let directory
    for (const line of output.split('\n')) { try { const e = JSON.parse(line); if (e.event === 'raven_qa_launch') directory = e.root } catch {} }
    let result
    try { result = JSON.parse(await readFile(join(directory, 'raven-results.json'), 'utf8')) } catch {}
    const cell = { round: round + 1, prompt, model, exit, durationMs: Date.now() - started, directory,
      judgedTurns: result?.qualityDiagnostics?.length ?? 0, passed: result?.passed === true }
    cells.push(cell); console.log(JSON.stringify(cell))
    await writeFile(join(root, 'cells.json'), JSON.stringify({ scenario, rounds, running: true, cells }, null, 2))
    // A provider/setup outage cannot become an unlimited paid retry loop.
    if (!result || result.running || !cell.judgedTurns) { cancelled = true; break }
  }
}
await writeFile(join(root, 'cells.json'), JSON.stringify({ scenario, rounds, running: false, cancelled, cells }, null, 2))
const directories = cells.flatMap(c => c.directory && c.judgedTurns ? [c.directory] : [])
if (directories.length) await writeFile(join(root, 'rates.json'), JSON.stringify(await qualityRates(directories), null, 2))
release()
console.log(JSON.stringify({ event: 'raven_trials_complete', root, cells: cells.length, cancelled }))
process.exitCode = cancelled || cells.some(c => !c.passed) ? 2 : 0
