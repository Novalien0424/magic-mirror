import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('retired board-HDMI watchdog', () => {
  it('keeps the historical plist disabled without a keepalive or autostart loop', () => {
    const source = readFileSync(resolve('deploy/macos/com.magicmirror.board-hdmi.daemon.plist'), 'utf8')
    expect(source).toMatch(/<key>Disabled<\/key>\s*<true\/>/)
    expect(source).toMatch(/<key>KeepAlive<\/key>\s*<false\/>/)
    expect(source).toMatch(/<key>RunAtLoad<\/key>\s*<false\/>/)
  })
  it.each([
    ['board-hdmi-keepalive.sh', 0, 'legacy_watchdog_disabled'],
    ['install-board-hdmi-daemon.sh', 1, 'legacy_watchdog_retired'],
  ] as const)('keeps %s inert without a host-service, ADB, TV or Electron mutation', (name, status, reason) => {
    const result = spawnSync('/bin/zsh', [resolve('deploy/macos', name)], { encoding: 'utf8', timeout: 2000,
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } })
    expect(result.status).toBe(status)
    expect(result.stdout + result.stderr).toContain(reason)
  })
})
