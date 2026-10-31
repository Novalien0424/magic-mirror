import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Fixed native helpers; no shell, device fallback, input gain or raw diagnostics. */
export function createStopStateIo() {
  const binary = join(homedir(), 'Library/Application Support/MagicMirror/ops/stop-state')
  const root = join(homedir(), 'Library/Caches/MagicMirror/blackout')
  const active = join(root, 'active'), ready = join(root, 'ready.json')
  const read = async () => { try { return JSON.parse(await readFile(ready, 'utf8')) } catch { return null } }
  const alive = pid => { try { if (!Number.isSafeInteger(pid) || pid <= 0) return false; process.kill(pid, 0); return true } catch { return false } }
  return {
    portrait: async () => {
      const result = spawnSync(binary, ['--portrait'], { encoding: 'utf8', timeout: 4000, killSignal: 'SIGKILL' })
      return result.status === 0 && !result.error && !result.signal && result.stdout.trim() === 'portrait_ready'
        ? 'portrait_ready' : 'portrait_failed'
    },
    blackout: async action => {
      if (!['cover', 'clear'].includes(action)) throw Error('blackout_action_invalid')
      await mkdir(root, { recursive: true, mode: 0o700 })
      if (action === 'clear') {
        await rm(active, { force: true })
        for (let i = 0; i < 30; i++) {
          const state = await read()
          if (!state || !alive(state.pid)) { await rm(ready, { force: true }); return 'blackout_cleared' }
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        return 'blackout_clear_failed'
      }
      const token = randomUUID()
      await writeFile(active, token, { mode: 0o600 })
      // One bounded retry also covers a previous helper completing its clear.
      for (let attempt = 0; attempt < 2; attempt++) {
        const child = spawn(binary, ['--black'], { detached: true, stdio: 'ignore' })
        let failed = false; child.on('error', () => { failed = true }); child.unref()
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 100))
          if (failed) break
          const state = await read()
          if (state?.token === token && state.displays > 0 && alive(state.pid)) return 'blackout_covered'
        }
      }
      return 'blackout_cover_failed'
    },
    resetAudio: async () => {
      const result = spawnSync(binary, ['--reset-output'], { encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL' })
      return result.status === 0 && !result.error && !result.signal ? 'jabra_output_70' : 'jabra_output_reset_failed'
    },
    // Button feedback, quiet and on the alert output (Jabra) only, never every speaker.
    // Detached: Stream Deck cannot reopen a still-running wrapper app.
    chime: (name, onError = () => {}) => {
      const child = spawn(binary, ['--chime', name], { stdio: 'ignore', detached: true })
      child.on('error', onError); child.unref()
    },
    // Playback VOL±: every external speaker 10% up/down together, read back by the helper.
    stepVolume: async direction => {
      if (!['up', 'down'].includes(direction)) throw Error('volume_direction_invalid')
      const result = spawnSync(binary, [`--volume-${direction}`], { encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL' })
      return result.status === 0 && !result.error && !result.signal ? `volume_${direction}` : 'volume_step_failed'
    },
  }
}
