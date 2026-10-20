import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, openSync, closeSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const alive = pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

export function assertElectronStopped() {
  if (process.platform === 'darwin') {
    const probe = spawnSync('/usr/bin/pgrep', ['-f', '/Electron.app/Contents/MacOS/Electron'], { encoding: 'utf8' })
    if (probe.status === 0) throw Error('electron_already_running')
    if (probe.status !== 1) throw Error('electron_process_probe_failed')
  } else if (process.platform === 'win32') {
    const probe = spawnSync('tasklist.exe', ['/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
    if (probe.status !== 0) throw Error('electron_process_probe_failed')
    if (/"electron\.exe"/i.test(probe.stdout)) throw Error('electron_already_running')
  }
}

/** Cooperative operation lease for QA, tests and agent start/stop commands.
 * The normal application may remain running after its operator releases this
 * lease; runners must still check that Electron is stopped before launching QA.
 */
export function acquireElectronOwner(owner, directory = join(homedir(), 'Library/Caches/MagicMirror/electron-owner')) {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(owner)) throw Error('electron_owner_invalid')
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 })
  const file = join(directory, 'owner.json')
  const existing = () => {
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  }
  const inherited = process.env.MIRROR_ELECTRON_OWNER_TOKEN
  if (process.platform === 'darwin') {
    // Darwin O_EXLOCK is not exported by Node's constants (sys/fcntl.h: 0x20).
    // Never unlink the lock inode: an open descriptor owns the operation and
    // the kernel releases it on exit/SIGKILL/reboot. JSON is diagnostic only.
    const metadata = directory + '.json'
    const record = () => { try { return JSON.parse(readFileSync(metadata, 'utf8')) } catch { return null } }
    const previous = record() ?? existing()
    if (inherited && previous?.token === inherited && [1, 2].includes(previous?.version) && alive(previous.pid)) return () => {}
    let fd
    try { fd = openSync(directory + '.lock', constants.O_RDWR | constants.O_CREAT | constants.O_NONBLOCK | constants.O_NOFOLLOW | 0x20, 0o600) }
    catch (error) {
      if (error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK') throw Error('electron_owner_busy')
      throw Error('electron_owner_lock_failed')
    }
    const token = randomUUID()
    try {
      // Migrate only a valid, dead legacy owner. Unknown directory contents and
      // a still-running old-version owner remain protected.
      if (existsSync(directory)) {
        const old = existing()
        if (old?.version !== 1 || !Number.isSafeInteger(old.pid) || typeof old.token !== 'string'
          || readdirSync(directory).some(name => name !== 'owner.json')) throw Error('electron_owner_record_invalid')
        if (alive(old.pid)) throw Error('electron_owner_busy')
        rmSync(directory, { recursive: true })
      }
      writeFileSync(metadata, JSON.stringify({ version: 2, owner, pid: process.pid, token, startedAt: new Date().toISOString() }), { mode: 0o600 })
    } catch (error) { closeSync(fd); throw error }
    process.env.MIRROR_ELECTRON_OWNER_TOKEN = token
    let released = false
    return () => {
      if (released) return
      released = true
      try { if (record()?.token === token) rmSync(metadata) } finally { closeSync(fd) }
      if (process.env.MIRROR_ELECTRON_OWNER_TOKEN === token) {
        if (inherited) process.env.MIRROR_ELECTRON_OWNER_TOKEN = inherited
        else delete process.env.MIRROR_ELECTRON_OWNER_TOKEN
      }
    }
  }
  const previous = existing()
  if (inherited && previous?.token === inherited && previous?.version === 1 && alive(previous.pid)) return () => {}
  const token = randomUUID()
  try { mkdirSync(directory, { mode: 0o700 }) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    const old = existing()
    if (!old || old.version !== 1 || typeof old.token !== 'string' || !Number.isSafeInteger(old.pid)) throw Error('electron_owner_record_invalid')
    if (alive(old.pid)) throw Error(`electron_owner_busy:${old.owner}`)
    // Never race another agent to reclaim a dead owner's directory. Inspect
    // and explicitly remove a stale record before attempting a new operation.
    throw Error(`electron_owner_stale:${old.owner}`)
  }
  writeFileSync(file, JSON.stringify({ version: 1, owner, pid: process.pid, token, startedAt: new Date().toISOString() }), { mode: 0o600 })
  process.env.MIRROR_ELECTRON_OWNER_TOKEN = token
  let released = false
  return () => {
    if (released) return
    released = true
    if (existing()?.token === token) rmSync(directory, { recursive: true })
    if (process.env.MIRROR_ELECTRON_OWNER_TOKEN === token) {
      if (inherited) process.env.MIRROR_ELECTRON_OWNER_TOKEN = inherited
      else delete process.env.MIRROR_ELECTRON_OWNER_TOKEN
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [owner, command, ...args] = process.argv.slice(2)
  if (!owner || !command) throw Error('usage: node scripts/electron-owner.mjs owner command [args]')
  const release = acquireElectronOwner(owner)
  process.once('exit', release)
  if (owner === 'tests') assertElectronStopped()
  const child = spawn(command, args, { stdio: 'inherit', env: process.env })
  let stopping = false
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (!stopping) { stopping = true; child.kill(signal) }
  })
  child.on('error', () => { release(); process.exitCode = 1 })
  child.on('exit', (code, signal) => { release(); process.exitCode = code ?? (signal ? 1 : 0) })
}
