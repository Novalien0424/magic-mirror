import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { acquireElectronOwner, assertElectronStopped } from './electron-owner.mjs'
import { verifyBuild } from './qa-build.mjs'

const repo = '/Users/novalien0424/magic-mirror'
if (process.platform !== 'darwin' || resolve(process.cwd()) !== repo) throw Error('persistence_qa_requires_canonical_mac')
const release = acquireElectronOwner('field-persistence-qa')
process.once('exit', release)
assertElectronStopped()
const build = await verifyBuild(repo), started = Date.now()
const domain = `gui/${process.getuid()}`, job = domain + '/com.magicmirror.launchagent'
const configRoot = join(homedir(), 'Library/Application Support/magic-mirror/config')
const [active, draft] = await Promise.all(['active', 'draft'].map(n => readFile(join(configRoot, n + '.json'), 'utf8').then(JSON.parse)))
if (JSON.stringify(active) !== JSON.stringify(draft)) throw Error('persistence_qa_preserve_operator_draft_first')
const installed = join(homedir(), 'Library/LaunchAgents/com.magicmirror.launchagent.plist')
const canonical = join(repo, 'deploy/macos/com.magicmirror.launchagent.field.plist')
const plist = path => JSON.parse(spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }).stdout)
const before = plist(installed), expected = plist(canonical)
before.ExitTimeOut = 20
// Preserve arbitrary existing environment/settings: only the named timeout is
// deployed, never replace the job with an unrelated definition.
if (before.Label !== expected.Label || JSON.stringify(before.ProgramArguments) !== JSON.stringify(expected.ProgramArguments)) throw Error('persistence_qa_job_mismatch')
const ctl = args => spawnSync('/bin/launchctl', args, { encoding: 'utf8', timeout: 30000 })
const state = () => {
  const s = ctl(['print', job]).stdout ?? ''
  return { pid: Number(s.match(/^\s*pid = (\d+)/m)?.[1]) || null, runs: Number(s.match(/^\s*runs = (\d+)/m)?.[1]) || 0, exit: Number(s.match(/^\s*last exit code = (-?\d+)/m)?.[1] ?? NaN) }
}
const processes = () => (spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).stdout ?? '').split('\n').flatMap(line => {
  const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/); return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }] : []
})
const children = (pid, kind) => processes().filter(p => p.ppid === pid && p.command.startsWith(repo + '/node_modules/electron/') && p.command.includes(kind))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await wait(250) }
  throw Error('persistence_qa_timeout')
}
const telemetryPath = join(homedir(), 'Library/Application Support/magic-mirror/telemetry/telemetry-0.jsonl')
const listening = async since => {
  const s = await readFile(telemetryPath, 'utf8').catch(() => '')
  return s.split('\n').some(line => { try { const e = JSON.parse(line); return Date.parse(e.time) >= since && ['wake_worker_listening', 'wake_audio_recovered'].includes(e.reason) } catch { return false } })
}
const rendererReady = async since => {
  const s = await readFile(join(homedir(), 'Library/Logs/MagicMirror/app.out.log'), 'utf8')
  return s.split('\n').some(line => line.startsWith('RENDERER_READY window=mirror ') && Date.parse(line.match(/\bat=(\S+)/)?.[1] ?? '') >= since)
}
const root = join(repo, '.artifacts/field-persistence', new Date(started).toISOString().replaceAll(':', '-').replaceAll('.', '-'))
await mkdir(root, { recursive: true })
const results = []
let frozen = null
async function check(name, work) {
  const at = Date.now()
  try { const extra = await work(); results.push({ name, passed: true, durationMs: Date.now() - at, ...extra }) }
  catch (e) { results.push({ name, passed: false, durationMs: Date.now() - at, reason: e.message === 'persistence_qa_timeout' ? e.message : 'persistence_qa_failed' }); throw e }
  finally { await writeFile(join(root, 'results.json'), JSON.stringify({ build, configVersion: active.configVersion, results }, null, 2)); console.log(JSON.stringify(results.at(-1))) }
}
try {
  await check('deploy_timeout_and_start', async () => {
    if (ctl(['print', job]).status === 0 && ctl(['bootout', job]).status !== 0) throw Error()
    const temporary = installed + '.third-audit.tmp'
    await writeFile(temporary, JSON.stringify(before), { mode: 0o644 })
    if (spawnSync('/usr/bin/plutil', ['-convert', 'xml1', temporary]).status !== 0) throw Error()
    await rename(temporary, installed)
    if (ctl(['bootstrap', domain, installed]).status !== 0) throw Error()
    await until(() => state().pid)
    await until(() => listening(started))
    await until(() => rendererReady(started))
    if (!isDeepStrictEqual(before, plist(installed))) throw Error()
    return { exitTimeOut: plist(installed).ExitTimeOut, settingsPreserved: true, rendererReady: true }
  })
  await check('L6_two_wake_worker_failures', async () => {
    const first = state(), at = Date.now()
    const workers = children(first.pid, '--utility-sub-type=node.mojom.NodeService')
    if (workers.length !== 1) throw Error()
    process.kill(workers[0].pid, 'SIGKILL')
    const replacement = await until(() => children(first.pid, '--utility-sub-type=node.mojom.NodeService').find(p => p.pid !== workers[0].pid))
    await until(() => listening(at))
    if (state().pid !== first.pid) throw Error()
    const secondAt = Date.now()
    process.kill(replacement.pid, 'SIGKILL')
    const restarted = await until(() => { const s = state(); return s.pid && s.pid !== first.pid ? s : null }, 25000)
    await until(() => listening(secondAt))
    return { firstWorkerRecoveredInMain: true, launchdRestarted: true, restartCount: restarted.runs - first.runs, recoveryMs: Date.now() - secondAt }
  })
  await check('L7_renderer_SIGSTOP', async () => {
    const at = Date.now()
    const main = state().pid, renderers = children(main, '--type=renderer')
    if (renderers.length !== 1) throw Error()
    frozen = renderers[0].pid; process.kill(frozen, 'SIGSTOP')
    const replacement = await until(() => children(main, '--type=renderer').find(p => p.pid !== frozen), 45000)
    if (state().pid !== main) throw Error()
    try { process.kill(frozen, 0); throw Error() } catch (e) { if (e.code !== 'ESRCH') throw e }
    frozen = null
    await until(() => rendererReady(at))
    return { mainPreserved: true, rendererReplaced: !!replacement }
  })
  await check('L3_double_TERM_no_restart_60s', async () => {
    const running = state()
    if (!running.pid) throw Error()
    if (ctl(['kill', 'TERM', job]).status !== 0) throw Error()
    ctl(['kill', 'TERM', job])
    await until(() => !state().pid, 20000)
    await wait(60000)
    const stopped = state()
    if (stopped.pid || stopped.exit !== 0 || stopped.runs !== running.runs) throw Error()
    if (processes().some(p => p.command.startsWith(repo + '/node_modules/electron/') || p.command.startsWith(repo + '/out/native/camera-tracker'))) throw Error()
    return { exit: stopped.exit, unchangedRuns: true, noAppChildren: true }
  })
} finally {
  if (frozen) { try { process.kill(frozen, 'SIGCONT') } catch {} }
  if (state().pid) { ctl(['kill', 'TERM', job]); await until(() => !state().pid).catch(() => {}) }
  await writeFile(join(root, 'results.json'), JSON.stringify({ build, configVersion: active.configVersion, results, finalState: state(), elapsedMs: Date.now() - started }, null, 2))
  release()
}
console.log(JSON.stringify({ event: 'field_persistence_complete', root, passed: results.every(r => r.passed) }))
