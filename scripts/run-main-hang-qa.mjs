// Authorized field test: block the real Electron Main event loop. The existing
// launchd label remains the only restart owner; its installed plist is untouched.
import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireElectronOwner, assertElectronStopped } from './electron-owner.mjs'
import { verifyBuild } from './qa-build.mjs'

const repo = '/Users/novalien0424/magic-mirror'
if (process.platform !== 'darwin' || process.cwd() !== repo) throw Error('main_hang_qa_canonical_mac_required')
const release = acquireElectronOwner('main-hang-qa')
process.once('exit', release)
assertElectronStopped()
const build = await verifyBuild(repo), domain = `gui/${process.getuid()}`, job = domain + '/com.magicmirror.launchagent'
const installed = join(homedir(), 'Library/LaunchAgents/com.magicmirror.launchagent.plist')
const original = await readFile(installed)
const ctl = args => spawnSync('/bin/launchctl', args, { encoding: 'utf8', timeout: 30000 })
const state = () => {
  const s = ctl(['print', job]).stdout ?? ''
  return { pid: Number(s.match(/^\s*pid = (\d+)/m)?.[1]) || null, runs: Number(s.match(/^\s*runs = (\d+)/m)?.[1]) || 0,
    exit: Number(s.match(/^\s*last exit code = (-?\d+)/m)?.[1] ?? NaN) }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await pause(250) }
  throw Error('main_hang_qa_timeout')
}
const config = join(homedir(), 'Library/Application Support/magic-mirror/config')
const active = await readFile(join(config, 'active.json')), draft = await readFile(join(config, 'draft.json'))
if (!active.equals(draft)) throw Error('main_hang_qa_preserve_draft_first')
const plist = JSON.parse(spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', installed], { encoding: 'utf8' }).stdout)
if (plist.Label !== 'com.magicmirror.launchagent' || JSON.stringify(plist.ProgramArguments) !== JSON.stringify([
  repo + '/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron', repo])) throw Error('main_hang_qa_job_mismatch')
const socket = createServer()
await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve) })
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const temporary = join(tmpdir(), `magic-mirror-main-hang-${process.pid}.plist`)
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const root = join(repo, '.artifacts/main-hang-qa', stamp)
await mkdir(root, { recursive: true })
const markerLog = plist.StandardOutPath
const ready = async since => (await readFile(markerLog, 'utf8')).split('\n').some(line =>
  line.startsWith('RENDERER_READY window=mirror ') && Date.parse(line.match(/\bat=(\S+)/)?.[1] ?? '') >= since)
const results = []
let ws, replaced = false, originalDefinitionRestored = false
try {
  const candidate = structuredClone(plist)
  delete candidate.EnvironmentVariables.MIRROR_TV_HOST
  candidate.ProgramArguments.splice(1, 0, `--inspect=127.0.0.1:${port}`)
  candidate.StandardErrorPath = '/dev/null'
  await writeFile(temporary, JSON.stringify(candidate), { mode: 0o600 })
  if (spawnSync('/usr/bin/plutil', ['-convert', 'xml1', temporary]).status !== 0) throw Error('main_hang_qa_plist_failed')
  if (ctl(['print', job]).status === 0) {
    if (ctl(['bootout', job]).status !== 0) throw Error('main_hang_qa_unload_failed')
    await until(() => ctl(['print', job]).status !== 0, 30000)
  }
  replaced = true
  const started = Date.now()
  if (ctl(['bootstrap', domain, temporary]).status !== 0) throw Error('main_hang_qa_start_failed')
  await until(() => state().pid)
  await until(() => ready(started))
  const first = state()
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
  const target = targets.find(t => t.type === 'node')
  if (!target?.webSocketDebuggerUrl?.startsWith(`ws://127.0.0.1:${port}/`)) throw Error('main_hang_qa_inspector_unavailable')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', () => reject(Error('main_hang_qa_inspector_failed')), { once: true }) })
  const blocked = Date.now()
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)' } }))
  const second = await until(() => { const s = state(); return s.pid && s.pid !== first.pid ? s : null }, 85000)
  await until(() => ready(blocked))
  const failedMarker = (await readFile(markerLog, 'utf8')).split('\n').some(line => line.startsWith('MAIN_LIVENESS_FAILED ')
    && Date.parse(line.match(/\bat=(\S+)/)?.[1] ?? '') >= blocked)
  const result = { check: 'real_main_event_loop_hang', passed: failedMarker && second.runs === first.runs + 1,
    watchdogMarker: failedMarker, restartCount: second.runs - first.runs, recoveryMs: Date.now() - blocked, rendererReady: true }
  results.push(result); console.log(JSON.stringify(result))
} catch (error) {
  results.push({ check: 'real_main_event_loop_hang', passed: false, reason: /^main_hang_qa_[a-z_]+$/.test(error.message) ? error.message : 'main_hang_qa_failed' })
} finally {
  ws?.close()
  if (replaced) {
    // Unload the temporary definition even when Main is unresponsive, then
    // restore the exact installed definition and finish with a clean exit.
    ctl(['bootout', job])
    try {
      await until(() => ctl(['print', job]).status !== 0, 30000)
      const restored = Date.now()
      if (!(await readFile(installed)).equals(original)) throw Error('main_hang_qa_installed_changed')
      if (ctl(['bootstrap', domain, installed]).status !== 0) throw Error('main_hang_qa_restore_failed')
      originalDefinitionRestored = true
      try { await until(() => ready(restored)) }
      finally { ctl(['kill', 'TERM', job]) }
      await until(() => !state().pid)
      await pause(11000)
    } catch (error) {
      results.push({ check: 'restore_original_launchagent', passed: false,
        reason: /^main_hang_qa_[a-z_]+$/.test(error.message) ? error.message : 'main_hang_qa_restore_failed' })
      if (state().pid) {
        ctl(['bootout', job])
        originalDefinitionRestored = false
        await until(() => ctl(['print', job]).status !== 0, 30000).catch(() => {})
      }
    }
  }
  const final = state(), settingsPreserved = (await readFile(installed)).equals(original)
    && (await readFile(join(config, 'active.json'))).equals(active) && (await readFile(join(config, 'draft.json'))).equals(draft)
  const tvPolicyRestored = settingsPreserved && originalDefinitionRestored && ctl(['print', job]).status === 0
  results.push({ check: 'restore_original_tv_policy_and_stop', passed: tvPolicyRestored && !final.pid && final.exit === 0,
    settingsPreserved, tvPolicyRestored, stopped: !final.pid, exit: final.exit })
  await writeFile(join(root, 'results.json'), JSON.stringify({ build, tvBypass: 'temporary_launch_definition', results }, null, 2))
  await unlink(temporary).catch(() => {})
  release()
}
console.log(JSON.stringify({ event: 'main_hang_qa_complete', root, passed: results.every(r => r.passed) }))
process.exitCode = results.every(r => r.passed) ? 0 : 2
