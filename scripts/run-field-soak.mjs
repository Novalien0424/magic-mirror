import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { acquireElectronOwner } from './electron-owner.mjs'
import { verifyBuild } from './qa-build.mjs'

// Read-only sampler: never wakes/restarts the app or defeats intentional TV-off.
const repo = '/Users/novalien0424/magic-mirror'
if (process.platform !== 'darwin' || resolve(process.cwd()) !== repo) throw Error('field_soak_requires_canonical_mac')
const release = acquireElectronOwner('field-soak')
process.once('exit', release)
const build = await verifyBuild(repo)
const started = Date.now(), target = `gui/${process.getuid()}/com.magicmirror.launchagent`
const stamp = new Date(started).toISOString().replaceAll(':', '-').replaceAll('.', '-')
const root = join(repo, '.artifacts/field-soak', stamp)
await mkdir(root, { recursive: true })
const samples = [], cycles = new Set()
let stopping = false, reason = 'running'
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; reason = 'operator_cancelled' })
const state = () => {
  const out = spawnSync('/bin/launchctl', ['print', target], { encoding: 'utf8' }).stdout ?? ''
  return { pid: Number(out.match(/^\s*pid = (\d+)/m)?.[1]) || null, runs: Number(out.match(/^\s*runs = (\d+)/m)?.[1]) || 0 }
}
const initial = state()
if (!initial.pid) throw Error('field_soak_app_not_running')
const sample = async () => {
  const current = state()
  if (!current.pid) { reason = 'application_stopped'; return false }
  const processProbe = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,pcpu='], { encoding: 'utf8' })
  if (processProbe.status !== 0) { reason = 'process_probe_failed'; return false }
  const rows = processProbe.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number))
  const ids = new Set([current.pid])
  for (let n = 0; n < 8; n++) for (const [pid, ppid] of rows) if (ids.has(ppid)) ids.add(pid)
  const tree = rows.filter(([pid]) => ids.has(pid))
  const descriptorProbe = spawnSync('/usr/sbin/lsof', ['-nP', '-p', [...ids].join(','), '-F', 'f'], { encoding: 'utf8', timeout: 10000 })
  if (descriptorProbe.status !== 0) { reason = 'descriptor_probe_failed'; return false }
  const descriptors = descriptorProbe.stdout
  let fd = 0
  for (const line of descriptors.split('\n')) if (/^f\d/.test(line)) fd++
  const appLog = await readFile(join(homedir(), 'Library/Logs/MagicMirror/app.out.log'), 'utf8').catch(() => '')
  const launchesLastHour = appLog.split('\n').filter(line => line.startsWith('MAIN_READY ') && Date.parse(line.match(/\bat=(\S+)/)?.[1] ?? '') > Date.now() - 3600000).length
  for (let n = 0; n < 5; n++) {
    const telemetry = await readFile(join(homedir(), `Library/Application Support/magic-mirror/telemetry/telemetry-${n}.jsonl`), 'utf8').catch(() => '')
    for (const line of telemetry.split('\n')) {
      let event; try { event = JSON.parse(line) } catch { continue }
      if (Date.parse(event.time) >= started && event.event === 'lifecycle_transition' && /from=suspending;to=dormant/.test(event.reason ?? '')) cycles.add(event.time)
    }
  }
  samples.push({ at: new Date().toISOString(), elapsedMs: Date.now() - started, pid: current.pid, runs: current.runs, processCount: tree.length,
    rssMB: tree.reduce((sum, row) => sum + row[2], 0) / 1024, cpuPercent: tree.reduce((sum, row) => sum + row[3], 0), fd, launchesLastHour })
  if (current.runs !== initial.runs || current.pid !== initial.pid) { reason = 'unexpected_restart'; return false }
  return true
}
function verdict() {
  const warm = samples.filter(s => s.elapsedMs >= 600000), x = warm.map(s => s.elapsedMs / 3600000), y = warm.map(s => s.rssMB)
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length
  const slope = warm.length < 2 ? null : x.reduce((sum, value, i) => sum + (value - mx) * (y[i] - my), 0) / x.reduce((sum, value) => sum + (value - mx) ** 2, 0)
  const fdGrowth = warm.length < 2 ? null : warm.at(-1).fd - warm[0].fd
  return { rssSlopeMBPerHour: slope, fdGrowth, completedCycles: cycles.size,
    passed: reason === 'duration_complete' && slope !== null && slope < 5 && fdGrowth !== null && fdGrowth <= 0 && cycles.size >= 10 }
}
const persist = async () => writeFile(join(root, 'soak.json'), JSON.stringify({ version: 1, startedAt: new Date(started).toISOString(), reason,
  requiredDurationMs: 86400000, build, ...verdict(), samples, evidence: 'process_resources_and_lifecycle_metadata_only' }, null, 2))
console.log(JSON.stringify({ event: 'field_soak_started', root, pid: initial.pid }))
try {
  while (!stopping) {
    if (!await sample()) break
    if (Date.now() - started >= 86400000) { reason = 'duration_complete'; break }
    await persist()
    // Short interruptible waits keep cancellation responsive.
    for (let n = 0; n < 24 && !stopping; n++) await new Promise(resolve => setTimeout(resolve, 5000))
  }
} finally { await persist(); release() }
console.log(JSON.stringify({ event: 'field_soak_finished', root, reason, ...verdict() }))
process.exitCode = verdict().passed ? 0 : 2
