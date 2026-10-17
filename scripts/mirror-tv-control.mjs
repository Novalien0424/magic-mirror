import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { safeOperatorReason } from './operator-command.mjs'

const BOARD = '192.168.77.2:5555'
const HDMI = 'com.android.rockchip.camera2/.RockchipCamera2'

export function parseTvPower(text) {
  return {
    wakefulness: text.match(/^\s*mWakefulness=(\w+)\s*$/m)?.[1] ?? null,
    display: text.match(/^\s*Display Power: state=(\w+)\s*$/m)?.[1] ?? null,
  }
}

/** Fixed venue device commands. Reuse the trusted root server, never replace it. */
export function createTvIo(report = () => {}) {
  return {
    report,
    available: () => spawnSync('/bin/launchctl', ['print', 'system/com.magicmirror.board-adb'],
      { stdio: 'ignore', timeout: 1000, killSignal: 'SIGKILL' }).status === 0,
    // Explicit numeric host makes ADB fail instead of auto-starting a user
    // server if the trusted root daemon disappears between checks.
    run: (args, timeout) => spawnSync('/Library/Application Support/MagicMirror/adb', ['-H', '127.0.0.1', '-P', '5038', ...args], {
      encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 256 * 1024,
      env: { HOME: homedir(), PATH: '/usr/bin:/bin', ADB_MDNS: '0', ADB_MDNS_AUTO_CONNECT: '0' },
    }),
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
}

/** Standby is Android sleep/display OFF, not shutdown or removal of mains power. */
export async function operateTv(action, io = createTvIo()) {
  if (!['awake', 'standby'].includes(action)) throw Error('tv_action_invalid')
  const now = io.now ?? (() => performance.now())
  const deadline = now() + 12000
  const run = args => {
    if (now() >= deadline) throw Error('tv_deadline')
    return io.run(args, Math.max(1, Math.min(3000, Math.ceil(deadline - now()))))
  }
  const ok = (result, step) => {
    const passed = result.status === 0 && !result.error && !result.signal
    if (!passed) {
      const error = result.stderr ?? ''
      const reason = result.error?.code === 'ETIMEDOUT' ? 'tv_command_timeout'
        : /\boffline\b/i.test(error) ? 'tv_transport_offline'
          : /\bunauthorized\b/i.test(error) ? 'tv_transport_unauthorized'
            : /device .*not found|no devices\/emulators found/i.test(error) ? 'tv_transport_missing'
              : /closed|reset by peer/i.test(error) ? 'tv_transport_closed' : 'tv_command_failed'
      io.report?.(step, reason)
    }
    return passed
  }
  try {
    if (!await io.available()) return 'tv_unavailable'
    // One retry only. Explicit SLEEP/WAKEUP are idempotent; never toggle POWER.
    for (let attempt = 0; attempt < 2 && now() < deadline; attempt++) {
      if (attempt > 0) await io.wait(Math.min(350, deadline - now()))
      // Reuse a working transport. A redundant `connect` can stall even while
      // shell requests on the existing trusted connection still succeed.
      let before = await run(['-s', BOARD, 'shell', 'dumpsys', 'power'])
      if (!ok(before, 'power_before')) {
        if (!ok(await run(['connect', BOARD]), 'connect')) continue
        // The server may acknowledge connect before transport authentication
        // becomes usable. Do not consume both attempts in the same instant.
        if (now() < deadline) await io.wait(Math.min(350, deadline - now()))
        before = await run(['-s', BOARD, 'shell', 'dumpsys', 'power'])
        if (!ok(before, 'power_before')) continue
      }
      const current = parseTvPower(before.stdout ?? '')
      const known = ok(before, 'power_before')
      // In standby the Android input service need not finish another injected
      // sleep key promptly. A confirmed OFF state needs no second command.
      if (action === 'standby' && known && current.wakefulness === 'Asleep' && current.display === 'OFF') return 'tv_standby'
      if (!(action === 'awake' && known && current.wakefulness === 'Awake' && current.display === 'ON')
        && !ok(await run(['-s', BOARD, 'shell', 'input', 'keyevent', action === 'standby' ? '223' : '224']), 'power_key')) continue
      if (action === 'awake') {
        const activity = await run(['-s', BOARD, 'shell', 'am', 'start', '-W', '-n', HDMI])
        if (!ok(activity, 'hdmi') || !/^Status: ok\s*$/m.test(activity.stdout ?? '')) continue
      }
      for (let check = 0; check < 2 && now() < deadline; check++) {
        const result = await run(['-s', BOARD, 'shell', 'dumpsys', 'power'])
        const power = parseTvPower(result.stdout ?? '')
        if (ok(result, 'power_after') && (action === 'standby'
          ? power.wakefulness === 'Asleep' && power.display === 'OFF'
          : power.wakefulness === 'Awake' && power.display === 'ON')) return `tv_${action}`
        if (check === 0 && now() < deadline) await io.wait(Math.min(350, deadline - now()))
      }
    }
  } catch { /* Raw device/ADB output never enters persistent diagnostics. */ }
  return `tv_${action}_failed`
}

/** The entire sequence runs inside the existing button queue/operation lease. */
export async function operateMirrorControl(action, io) {
  if (!['start', 'stop', 'loop', 'console'].includes(action)) throw Error('mirror_control_action_invalid')
  const attempt = async (fn, fallback) => { try { return await fn() } catch { return fallback } }
  if (action === 'stop') {
    // Hide the screen before app windows disappear. TV failure must not skip cleanup.
    const tv = await attempt(() => io.tv('standby'), 'tv_standby_failed')
    const app = await attempt(() => io.app('stop'), 'stop_failed')
    return { app, tv, outcome: !['stopped', 'already_off', 'stopped_forced'].includes(app)
      ? app : tv === 'tv_standby' ? app : tv }
  }
  const app = await attempt(() => io.app('start'), 'start_failed')
  if (!['started', 'already_on'].includes(app)) return { app, tv: 'tv_wake_skipped', outcome: app }
  const ready = await attempt(() => io.ready(), false)
  if (!ready) return { app, tv: 'tv_wake_skipped', outcome: `${action}_not_ready` }
  // Console is a separate window; showing it must preserve the current media mode.
  const command = action === 'console' ? 'show_console' : action === 'loop' ? 'play_loop' : 'normal'
  const reply = await attempt(() => io.mode(command), { status: 'failed', reason: 'operator_command_failed' })
  const valid = reply && ['success', 'failed'].includes(reply.status) && safeOperatorReason(reply.reason)
  const mode = valid ? reply.status : 'failed', modeReason = valid ? reply.reason : 'operator_response_invalid'
  if (mode !== 'success') return { app, mode, modeReason, tv: 'tv_wake_skipped', outcome: `${action}_mode_failed` }
  const tv = await attempt(() => io.tv('awake'), 'tv_awake_failed')
  return { app, mode, modeReason, tv, outcome: tv === 'tv_awake' ? action === 'console' ? 'console_shown' : action === 'loop' ? 'loop_playing' : app : tv }
}
