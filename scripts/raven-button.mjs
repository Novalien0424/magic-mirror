import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireElectronOwner } from './electron-owner.mjs'
import { createTvIo, operateMirrorControl, operateTv } from './mirror-tv-control.mjs'
import { createOperatorIo, sendOperatorCommand } from './operator-command.mjs'
import { createMouseIo, operateMouse } from './mirror-mouse-control.mjs'
import { createStopStateIo } from './mirror-stop-state.mjs'

/** Parse only process metadata; never collect command arguments or environments. */
export function parseProcessSnapshot(text) {
  return text.split('\n').filter(line => line.trim()).map(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d{4})\s+(\S+)\s+(.+?)\s*$/)
    if (!match) throw Error('process_snapshot_invalid')
    return { pid: Number(match[1]), ppid: Number(match[2]), started: match[3].replace(/\s+/g, ' '), status: match[4], command: match[5] }
  })
}

/** Retain the job's observed tree in RAM so reparented children remain visible. */
export function processTree(processes, pid) {
  const pids = new Set([pid])
  for (let size = 0; size !== pids.size;) {
    size = pids.size
    for (const child of processes) if (pids.has(child.ppid)) pids.add(child.pid)
  }
  return processes.filter(child => pids.has(child.pid))
}

export function parseLaunchdState(result) {
  if (result.error || result.signal) throw Error('launchd_state_unavailable')
  if (result.status !== 0) {
    if (/Could not find service\s/.test(result.stderr ?? '')) return { loaded: false, pid: null }
    throw Error('launchd_state_unavailable')
  }
  const text = result.stdout ?? ''
  return { loaded: true, pid: Number(text.match(/^\s*pid = (\d+)/m)?.[1]) || null,
    exit: Number(text.match(/^\s*last exit code = (-?\d+)/m)?.[1] ?? NaN) }
}

/** Startup markers scoped to Main's start time; logged failures invalidate them. */
export function mirrorRendererReady(text, startedAt) {
  if (!Number.isFinite(startedAt)) return false
  let main = false, loaded = false, ready = false
  for (const line of text.slice(0, text.lastIndexOf('\n') + 1).split('\n')) {
    const at = Date.parse(line.match(/\bat=(\S+)/)?.[1] ?? '')
    if (!Number.isFinite(at) || at < startedAt) continue
    if (line.startsWith('MAIN_READY ')) { main = true; loaded = ready = false }
    if (line.startsWith('APP_EXIT ')) { main = loaded = ready = false }
    if (!main || !/\bwindow=mirror\b/.test(line)) continue
    if (/^(RENDERER_GONE|WINDOW_RECREATED|WINDOW_LOAD_FAILED|PRELOAD_ERROR) /.test(line)) loaded = ready = false
    if (line.startsWith('WINDOW_LOADED ')) loaded = true
    if (line.startsWith('RENDERER_READY ')) ready = true
  }
  return main && loaded && ready
}

export async function waitForMirrorReady(io) {
  const now = io.now ?? (() => performance.now()), deadline = now() + 10000
  const budget = () => {
    if (now() >= deadline) throw Error('readiness_deadline')
    return Math.max(1, Math.min(1000, Math.ceil(deadline - now())))
  }
  try {
    for (let attempt = 0; attempt < 40 && now() < deadline; attempt++) {
      const state = await io.state(budget())
      if (!state.pid) return false
      const main = (await io.processes(budget())).find(row => row.pid === state.pid)
      if (main && mirrorRendererReady(await io.readLog(), Date.parse(main.started))
        && (await io.state(budget())).pid === state.pid && now() < deadline) return true
      if (now() >= deadline) return false
      await io.wait(Math.max(1, Math.min(250, deadline - now())))
    }
  } catch { /* Fail closed with a metadata result; no raw log escapes. */ }
  return false
}

/** Injectable launchd state machine; tests never signal a real process. */
export async function operateButton(action, io) {
  if (!['start', 'stop'].includes(action)) throw Error('raven_button_action_invalid')
  const now = io.now ?? (() => performance.now())
  // The field job's ExitTimeOut is 20 s. Leave room for launchd's own forced
  // cleanup after our 25 s graceful wait, including asynchronous bootout.
  const deadline = now() + (action === 'start' ? 10000 : 55000)
  const budget = limit => Math.max(1, Math.min(limit, Math.ceil(deadline - now())))
  const stateOfJob = () => io.state(budget(1000))
  const launch = operation => io.launch(operation, budget(operation === 'bootout' ? 25000 : 2000))
  let state = await stateOfJob()
  if (action === 'start') {
    if (state.pid) return 'already_on'
    if (!await launch(state.loaded ? 'kickstart' : 'bootstrap')) {
      // KeepAlive or another operator may have started it between print and ctl.
      return (await stateOfJob()).pid ? 'started' : 'start_failed'
    }
    for (let n = 0; n < 20 && now() < deadline; n++) {
      if ((await stateOfJob()).pid) return 'started'
      await io.wait(budget(500))
    }
    return 'start_timeout'
  }
  if (!state.loaded && !state.pid) return 'already_off'
  const tracked = new Map()
  let cleanupUnverified = false
  const capture = async pid => {
    if (!pid || !io.processes) return
    try {
      for (const child of processTree(await io.processes(budget(1000)), pid)) tracked.set(child.pid, child)
    } catch { cleanupUnverified = true }
  }
  await capture(state.pid)
  let clean = !state.pid && state.exit === 0
  if (state.pid) {
    const pid = state.pid
    if (await launch('term')) {
      const grace = Math.min(deadline, now() + 25000)
      try {
        for (let n = 0; n < 50 && now() < grace; n++) {
          await io.wait(Math.max(1, Math.min(500, Math.ceil(grace - now()))))
          state = await stateOfJob()
          if (!state.pid) { clean = state.exit === 0; break }
          if (state.pid !== pid) { await capture(state.pid); break }
        }
      } catch { /* A failed probe must still reach the bounded bootout. */ }
    }
  }
  // Unload even a clean exit or an initial PID-less crash/restart gap. A failed
  // TERM can race an exit too; it must not prevent removing KeepAlive's job.
  await launch('bootout')
  try {
    const cleanupDeadline = Math.min(deadline, now() + 23000)
    const cleanupBudget = limit => Math.max(1, Math.min(limit, Math.ceil(cleanupDeadline - now())))
    // macOS can keep the removing job visible until ExitTimeOut kills a frozen
    // Main. Job removal and child cleanup share the same bounded grace period.
    state = await io.state(cleanupBudget(1000))
    for (let n = 0; (state.loaded || state.pid) && n < 50 && now() < cleanupDeadline; n++) {
      await io.wait(cleanupBudget(500))
      state = await io.state(cleanupBudget(1000))
    }
    if (state.loaded || state.pid) return 'stop_failed'
    for (let n = 0; tracked.size && n < 50 && now() < cleanupDeadline; n++) {
      const processes = await io.processes(cleanupBudget(1000))
      for (const [pid, child] of tracked) {
        if (!processes.some(current => current.pid === pid && current.started === child.started
          && current.command === child.command && !current.status.startsWith('Z'))) tracked.delete(pid)
      }
      if (tracked.size && now() < cleanupDeadline) await io.wait(cleanupBudget(500))
    }
  } catch { return 'stop_cleanup_unverified' }
  if (tracked.size) return 'stop_processes_remaining'
  if (cleanupUnverified) return 'stop_cleanup_unverified'
  return clean ? 'stopped' : 'stopped_forced'
}

/** A malformed or partial queue file is consumed, never retried forever. */
export function parseQueuedRequest(text) {
  try {
    const request = JSON.parse(text)
    return request && ['start', 'stop', 'loop', 'console', 'studio', 'desktop', 'music'].includes(request.action) && Number.isFinite(request.at) ? request : null
  } catch { return null }
}

/** Fixed launchd/process IO, shared with the bounded native STOP check. */
export function createButtonIo() {
  const domain = `gui/${process.getuid()}`, job = domain + '/com.magicmirror.launchagent'
  const ctl = (args, timeout) => spawnSync('/bin/launchctl', args, { encoding: 'utf8', timeout, killSignal: 'SIGKILL' })
  return {
    state: async timeout => parseLaunchdState(ctl(['print', job], timeout)),
    launch: async (action, timeout) => ctl(action === 'bootstrap' ? ['bootstrap', domain, join(homedir(), 'Library/LaunchAgents/com.magicmirror.launchagent.plist')]
      : action === 'term' ? ['kill', 'TERM', job] : [action, job], timeout).status === 0,
    processes: async timeout => {
      const result = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,lstart=,stat=,comm='], {
        encoding: 'utf8', timeout, killSignal: 'SIGKILL', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      })
      if (result.status !== 0 || result.error || !result.stdout?.trim()) throw Error('process_snapshot_unavailable')
      return parseProcessSnapshot(result.stdout)
    },
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    readLog: async () => readFileSync(join(homedir(), 'Library/Logs/MagicMirror/app.out.log'), 'utf8'),
  }
}

const file = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === file) {
  if (process.platform !== 'darwin') throw Error('raven_button_macos_only')
  const action = process.argv[2]
  if (!['start', 'stop', 'loop', 'console', 'studio', 'desktop', 'music', '--worker', '--wake'].includes(action)) throw Error('raven_button_action_invalid')
  const root = join(homedir(), 'Library/Caches/MagicMirror/button'), queue = join(root, 'queue')
  const log = join(homedir(), 'Library/Logs/MagicMirror/button.log')
  mkdirSync(queue, { recursive: true, mode: 0o700 }); mkdirSync(dirname(log), { recursive: true })
  const record = (action, outcome, details = {}) => {
    try { if (statSync(log).size > 256 * 1024) renameSync(log, log + '.1') } catch {}
    appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), action, outcome, ...details }) + '\n', { mode: 0o600 })
  }
  const detach = () => {
    // This detached process survives Karabiner replacing its shell command.
    const child = spawn('/bin/zsh', [join(dirname(file), '../deploy/macos/raven-button-worker.sh')], { detached: true, stdio: 'ignore',
      env: { HOME: homedir(), PATH: '/usr/bin:/bin:/opt/homebrew/bin' } })
    child.on('error', () => { record('press', 'worker_spawn_failed'); process.exitCode = 1 })
    child.unref()
  }
  if (action === '--wake') detach()
  else if (action !== '--worker') {
    const path = join(queue, `${process.hrtime.bigint().toString().padStart(24, '0')}-${process.pid}.json`)
    // Another worker may already be draining the queue. Publish only a complete
    // request, so it cannot consume a partially written control press.
    writeFileSync(path + '.tmp', JSON.stringify({ action, at: Date.now() }), { flag: 'wx', mode: 0o600 })
    renameSync(path + '.tmp', path)
    detach()
  } else {
    if (process.env.MIRROR_BUTTON_WORKER_LOCK !== '1') throw Error('raven_button_worker_requires_lock')
    let release
    const io = createButtonIo()
    const sounds = { started: 'Glass', already_on: 'Pop', loop_playing: 'Glass', music_preparing: 'Pop', studio_ready: 'Glass', console_shown: 'Pop', desktop_shown: 'Pop', stopped: 'Tink', already_off: 'Pop', stopped_forced: 'Sosumi' }
    const feedback = outcome => {
      const child = spawn('/usr/bin/afplay', [`/System/Library/Sounds/${sounds[outcome] ?? 'Basso'}.aiff`], { stdio: 'ignore' })
      child.on('error', () => record('press', 'feedback_unavailable'))
    }
    try {
      // A physical press must never take over somebody else's active QA.
      try { release = acquireElectronOwner('raven-button') } catch {
        for (const name of readdirSync(queue).filter(n => /^\d+-\d+\.json$/.test(n))) { rmSync(join(queue, name)); record('press', 'electron_owner_busy') }
        feedback('electron_owner_busy')
        process.exitCode = 1
      }
      const lastPress = join(root, 'last-press.json')
      let previous = { action: '', at: 0 }
      try {
        const saved = JSON.parse(readFileSync(lastPress, 'utf8'))
        if (['start', 'stop', 'loop', 'console', 'studio', 'desktop', 'music'].includes(saved.action) && Number.isFinite(saved.at)) previous = saved
      } catch (error) { if (error.code !== 'ENOENT') record('press', 'debounce_state_invalid') }
      while (release) {
        const name = readdirSync(queue).filter(n => /^\d+-\d+\.json$/.test(n)).sort()[0]
        if (!name) break
        const path = join(queue, name), text = readFileSync(path, 'utf8'); rmSync(path)
        const request = parseQueuedRequest(text)
        if (!request) { record('press', 'request_invalid'); continue }
        if (Date.now() - request.at > 120000) { record(request.action, 'expired'); continue }
        if (request.action === previous.action && request.at >= previous.at && request.at - previous.at < 3000) { record(request.action, 'debounced'); continue }
        const result = await operateMirrorControl(request.action, {
          ...createStopStateIo(),
          app: action => operateButton(action, io),
          tv: action => operateTv(action, createTvIo((step, outcome) => record('tv', outcome, { step }))),
          ready: () => waitForMirrorReady(io),
          // Let a queued STOP reach Main even while a cold MusicLoop file is
          // preparing. The normal STOP path owns shutdown; no extra kill owner.
          mode: action => sendOperatorCommand(action, { ...createOperatorIo(), cancelled: () => action === 'music_loop'
            && readdirSync(queue).filter(n => /^\d+-\d+\.json$/.test(n)).some(name => {
              try { const next = parseQueuedRequest(readFileSync(join(queue, name), 'utf8'))
                return next?.action === 'stop' && Date.now() - next.at <= 120000
              } catch { return false }
            }) }),
          mouse: async action => {
            const mouse = await operateMouse(action, createMouseIo((step, outcome) => record('mouse', outcome, { step })))
            if (action === 'start' && mouse === 'mouse_started') {
              const cursor = spawnSync(join(homedir(), 'Library/Application Support/MagicMirror/mouse/mirror-cursor'), [],
                { stdio: 'ignore', timeout: 1000, killSignal: 'SIGKILL' })
              if (cursor.status !== 0 || cursor.error || cursor.signal) record('mouse', 'mouse_pointer_placement_failed')
            }
            return mouse
          },
        })
        const { outcome, ...details } = result
        record(request.action, outcome, details)
        if (Object.hasOwn(sounds, outcome)) {
          previous = request
          writeFileSync(lastPress + '.tmp', JSON.stringify(previous), { mode: 0o600 })
          renameSync(lastPress + '.tmp', lastPress)
        }
        if (outcome !== 'music_cancelled') feedback(outcome)
      }
    } catch { record('press', 'helper_failed'); process.exitCode = 1 }
    finally {
      release?.()
    }
  }
}
