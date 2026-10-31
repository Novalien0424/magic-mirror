import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOARD, createTvIo, ensureBoardWakelock } from './mirror-tv-control.mjs'

/**
 * LaunchAgent tick (every two minutes): re-apply the board's standby wakelock after a
 * board reboot, before anyone puts it to sleep with the remote. Uses only the trusted
 * root ADB server; never touches Electron, TV power, the HDMI app or the mirror mode.
 * Logs a metadata line only when the outcome changes.
 */
export async function keepBoardAwake(io = createTvIo()) {
  if (!io.available()) return 'board_adb_unavailable'
  if (await ensureBoardWakelock(io)) return 'board_wakelock_held'
  // After a board reboot the root ADB server needs one explicit connect.
  io.run(['connect', BOARD], 3000)
  await io.wait(350)
  return await ensureBoardWakelock(io) ? 'board_wakelock_held' : 'board_unreachable'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outcome = await keepBoardAwake().catch(() => 'board_keep_awake_failed')
  const state = join(homedir(), 'Library/Caches/MagicMirror/board-keep-awake.json')
  const log = join(homedir(), 'Library/Logs/MagicMirror/board-keep-awake.log')
  let previous = ''
  try { previous = JSON.parse(readFileSync(state, 'utf8')).outcome } catch {}
  if (outcome !== previous) {
    mkdirSync(dirname(state), { recursive: true }); mkdirSync(dirname(log), { recursive: true })
    appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), outcome }) + '\n', { mode: 0o600 })
    writeFileSync(state, JSON.stringify({ outcome }), { mode: 0o600 })
  }
}
