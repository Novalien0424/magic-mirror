import { execFile } from 'node:child_process'
import { access, lstat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const MOUSE_PATHS = Object.freeze({
  adb: '/Library/Application Support/MagicMirror/adb',
  adbPrefix: Object.freeze(['-H', '127.0.0.1', '-P', '5038', '-s', '192.168.77.2:5555']),
  runner: '/data/local/tmp/mm-mouse/control.sh',
  clientApp: '/Applications/VirtualHereUniversal.app',
  clientBinary: '/Applications/VirtualHereUniversal.app/Contents/MacOS/VirtualHereUniversal',
  clientConfig: join(homedir(), 'Library/Application Support/MagicMirror/mouse/client.ini'),
  clientSocket: '/tmp/vhclient_ipc/socket',
})
const CLIENT_ARGS = Object.freeze(['-c', MOUSE_PATHS.clientConfig, '-e', '-g'])
const CLIENT_COMMAND = [MOUSE_PATHS.clientBinary, ...CLIENT_ARGS].join(' ')
const HUB = 'mm-mouse:7575'
const RECEIVER = 'Xiaomi Wireless Mouse Lite 3'
const passed = result => result?.status === 0 && !result.error && !result.signal

/** Only exact LIST metadata authorizes an individual receiver address. */
export function parseMouseList(text) {
  let hub = null, hubs = 0, invalid = false
  const receivers = []
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      hub = /^[^()]+ \(([^()\s]+)\)\s*$/.exec(line)?.[1] ?? null
      if (hub === HUB) hubs++
    } else if (hub === HUB) {
      const device = /^\s+--> (.+?) \(([^()]+)\)(?: (?:\(([^()]+)\)|\[([^\]]+)\]))?\s*$/.exec(line)
      if (device?.[1] !== RECEIVER) continue
      if (!/^mm-mouse\.[0-9]+$/.test(device[2])) { invalid = true; continue }
      const ownership = device[3] ?? device[4]
      receivers.push({ address: device[2], ownership: ownership === 'In-use by you' ? 'you'
        : !ownership || ownership === 'Available' ? 'available' : 'other' })
    }
  }
  if (hubs > 1 || receivers.length > 1) return { status: 'ambiguous' }
  if (invalid) return { status: 'invalid' }
  return receivers.length === 1 ? { status: 'found', ...receivers[0] } : { status: 'missing' }
}

/** No config contents are read. Ownership requires this user's exact GUI argv. */
export function createMouseIo(report = () => {}, overrides = {}) {
  const now = overrides.now ?? (() => performance.now())
  const run = overrides.run ?? ((file, args, timeout) => new Promise(resolve => {
    execFile(file, args, { encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 256 * 1024,
      env: { HOME: homedir(), PATH: '/usr/bin:/bin', LC_ALL: 'C', ADB_MDNS: '0', ADB_MDNS_AUTO_CONNECT: '0' },
    }, (error, stdout, stderr) => resolve({ status: error ? typeof error.code === 'number' ? error.code : null : 0,
      error: Boolean(error && typeof error.code !== 'number'), signal: error?.signal,
      // The actual macOS 6.0.3 API writes successful replies to stderr. Keep
      // those replies in RAM for parsing; never emit either stream to logs.
      stdout: file === MOUSE_PATHS.clientBinary && args[0] === '-t' ? stdout + stderr : stdout }))
  }))
  return {
    report, run, uid: process.getuid(), now,
    exists: async path => { try { await access(path); return true } catch { return false } },
    socketReady: async (path, timeout) => {
      let timer
      try {
        return await Promise.race([
          lstat(path).then(info => info.isSocket(), () => false),
          new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout) }),
        ])
      } finally { clearTimeout(timer) }
    },
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    processes: async timeout => {
      const deadline = now() + timeout
      // Select exact executable basenames before reading their argv. Avoid
      // process-name truncation and never collect unrelated process arguments.
      const probe = await run('/bin/ps', ['-ww', '-axo', 'pid=,comm='], timeout)
      if (!passed(probe)) throw Error('mouse_process_unavailable')
      const pids = probe.stdout.split('\n').filter(line => line.trim()).flatMap(line => {
        const row = /^\s*([1-9][0-9]*)\s+(.+)$/.exec(line)
        if (!row) throw Error('mouse_process_unavailable')
        return row[2].split('/').at(-1) === 'VirtualHereUniversal' ? [row[1]] : []
      })
      if (!pids.length) return []
      const remaining = Math.floor(deadline - now())
      if (remaining < 1) throw Error('mouse_process_unavailable')
      const snapshot = await run('/bin/ps', ['-ww', '-p', pids.join(','), '-o', 'pid=,uid=,command='], remaining)
      if (!passed(snapshot)) throw Error('mouse_process_unavailable')
      return snapshot.stdout.split('\n').filter(line => line.trim()).map(line => {
        const row = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
        if (!row || !pids.includes(row[1])) throw Error('mouse_process_unavailable')
        return { pid: Number(row[1]), uid: Number(row[2]), command: row[3] }
      })
    },
    ...overrides,
  }
}

/**
 * Hooks serialize calls in their existing operation queue. Injectable IO:
 * run(file,args,timeoutMs), exists(path), socketReady(path,timeoutMs) -> boolean,
 * processes(timeoutMs) -> [{pid,uid,command}],
 * uid, now(), wait(ms), report(step,reason). Returns only fixed metadata reasons.
 */
export async function operateMouse(action, io = createMouseIo()) {
  const report = (step, reason) => { try { io.report?.(step, reason) } catch { /* Diagnostics cannot gate cleanup. */ } }
  const finish = reason => { report(action === 'stop' ? 'stop' : 'start', reason); return reason }
  if (!['start', 'stop'].includes(action)) return finish('mouse_action_invalid')
  const now = io.now ?? (() => performance.now())
  const deadline = now() + 10000
  // Reserve remote shutdown time even when client inspection or IPC is slow.
  const clientDeadline = action === 'stop' ? deadline - 3000 : deadline
  const budget = (end, cap = 2000) => Math.max(0, Math.min(cap, Math.floor(end - now())))
  const command = async (step, file, args, end = clientDeadline) => {
    try {
      const timeout = budget(end, step === 'remote_stop' ? 3000 : 2000)
      if (timeout && passed(await io.run(file, args, timeout))) return true
    } catch { /* Raw command errors remain transient. */ }
    report(step, `mouse_${step}_failed`)
    return false
  }
  const inspect = async () => {
    try {
      const timeout = budget(clientDeadline, action === 'stop' ? 500 : 1000)
      if (!timeout) return 'mouse_readiness_timeout'
      const rows = await io.processes(timeout)
      if (!Array.isArray(rows)) return 'mouse_process_unavailable'
      if (rows.some(row => !Number.isSafeInteger(row?.pid) || row.pid < 1
        || row.uid !== io.uid || row.command !== CLIENT_COMMAND)) return 'mouse_client_unowned'
      return rows.length > 1 ? 'mouse_client_ambiguous' : rows.length ? 'owned' : 'absent'
    } catch { return 'mouse_process_unavailable' }
  }
  let startupRetries = 1
  const api = async (step, text, retryReadiness = false) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const owner = await inspect()
      if (owner !== 'owned') { report(step, owner === 'absent' ? 'mouse_client_absent' : owner); return null }
      try {
        const timeout = budget(clientDeadline, action === 'stop' ? 1000 : 2000)
        const result = timeout ? await io.run(MOUSE_PATHS.clientBinary, ['-t', text], timeout) : null
        if (passed(result)) return result.stdout ?? ''
      } catch { /* Never surface stdout, stderr or exception text. */ }
      report(step, `mouse_${step}_failed`)
      // Only idempotent startup hub/LIST calls share one failed API retry.
      // USE, release and EXIT are never retried.
      if (!retryReadiness || startupRetries-- <= 0) return null
      const pause = budget(clientDeadline, 250)
      if (!pause) return null
      await io.wait(pause)
    }
    return null
  }
  const remote = verb => command(`remote_${verb}`, MOUSE_PATHS.adb,
    [...MOUSE_PATHS.adbPrefix, 'shell', 'su', '0', 'sh', MOUSE_PATHS.runner, verb], deadline)
  let present
  try {
    present = await Promise.all([MOUSE_PATHS.adb, MOUSE_PATHS.clientApp,
      MOUSE_PATHS.clientBinary].map(path => io.exists(path)))
  } catch { report('installation', 'mouse_installation_check_failed'); present = [false, false, false] }
  const installed = present.every(Boolean)
  if (action === 'start') {
    if (!installed) return finish('mouse_not_installed')
    if (!Number.isSafeInteger(io.uid) || io.uid <= 0) return finish('mouse_client_user_invalid')
    try {
      const owner = await inspect()
      if (!['owned', 'absent'].includes(owner)) return finish(owner)
      if (!await remote('start')) return finish('mouse_remote_start_failed')
      const afterRemote = await inspect()
      if (!['owned', 'absent'].includes(afterRemote)) return finish(afterRemote)
      if (afterRemote === 'absent' && !await command('client_launch', '/usr/bin/open',
        ['-gj', '-a', MOUSE_PATHS.clientApp, '--args', ...CLIENT_ARGS])) return finish('mouse_client_launch_failed')
      let ipcReady = false, hubAdded = false, used = null
      // Both a monotonic deadline and a finite poll count bound synthetic or
      // stalled clocks. Filesystem checks have their own bounded timeout.
      for (let check = 0; check < 40 && budget(clientDeadline); check++) {
        const current = await inspect()
        if (!['owned', 'absent'].includes(current)) return finish(current)
        if (current === 'owned') {
          const socketTimeout = budget(clientDeadline, 250)
          if (!ipcReady && socketTimeout) ipcReady = await io.socketReady(MOUSE_PATHS.clientSocket, socketTimeout)
          if (!ipcReady) {
            const pause = budget(clientDeadline, 250)
            if (pause) await io.wait(pause)
            continue
          }
          if (!hubAdded) {
            if (await api('hub_add', 'MANUAL HUB ADD,192.168.77.2:7575', true) === null) return finish('mouse_hub_add_failed')
            hubAdded = true
          }
          const list = await api('list', 'LIST', true)
          if (list === null) return finish('mouse_list_failed')
          const receiver = parseMouseList(list)
          if (receiver.status === 'ambiguous' || receiver.status === 'invalid') return finish(`mouse_receiver_${receiver.status}`)
          if (receiver.status === 'found') {
            if (receiver.ownership === 'other') return finish('mouse_receiver_busy')
            if (used && receiver.address !== used) return finish('mouse_receiver_changed')
            if (receiver.ownership === 'you') return finish('mouse_started')
            if (!used) {
              if (await api('use', `USE,${receiver.address}`) === null) return finish('mouse_use_failed')
              used = receiver.address
            }
          }
        }
        const pause = budget(clientDeadline, 250)
        if (pause) await io.wait(pause)
      }
      return finish('mouse_readiness_timeout')
    } catch { return finish('mouse_start_failed') }
  }

  let failure = null
  try {
    const owner = await inspect()
    if (!['owned', 'absent'].includes(owner)) { failure = owner; report('client', owner) }
    if (owner === 'owned' && present[2]) {
      const list = await api('list', 'LIST')
      if (list === null) failure = 'mouse_stop_failed'
      else {
        const receiver = parseMouseList(list)
        if (receiver.status === 'ambiguous' || receiver.status === 'invalid') {
          failure = 'mouse_stop_failed'; report('release', `mouse_receiver_${receiver.status}`)
        } else if (receiver.status === 'found' && receiver.ownership === 'you'
          && await api('release', `STOP USING,${receiver.address}`) === null) failure = 'mouse_stop_failed'
      }
      // EXIT is independently attempted after a LIST/release failure, only while
      // the exact dedicated process still owns the API endpoint.
      if (await api('exit', 'EXIT') === null) failure = 'mouse_stop_failed'
      else {
        let remaining = 'owned'
        for (let check = 0; check < 70 && budget(clientDeadline); check++) {
          remaining = await inspect()
          if (remaining !== 'owned') break
          await io.wait(Math.min(100, budget(clientDeadline)))
        }
        if (remaining !== 'absent') { failure = 'mouse_stop_failed'; report('exit', 'mouse_client_exit_unverified') }
      }
    }
  } catch { failure = 'mouse_stop_failed'; report('client', failure) }
  finally {
    if (present[0] && !await remote('stop')) failure = 'mouse_stop_failed'
  }
  return finish(!installed ? 'mouse_not_installed' : failure ?? 'mouse_stopped')
}
