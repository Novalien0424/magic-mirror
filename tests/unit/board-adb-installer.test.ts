import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('root ADB installer executable boundary', () => {
  it('installs a root-owned copy before execution and never invokes the writable source', () => {
    const script = readFileSync('deploy/macos/install-board-adb-daemon.sh', 'utf8')
    const install = script.indexOf('/usr/bin/install -o root -g wheel -m 755 "$adb_source" "$dest/adb"')
    const execute = script.indexOf('ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0 "$dest/adb" -P 5038 kill-server')
    expect(install).toBeGreaterThan(-1)
    expect(execute).toBeGreaterThan(install)
    expect(script).not.toMatch(/"\$adb_source"\s+-P/)
    expect(script).toContain('ADB_PORT_HAS_UNEXPECTED_OWNER')
  })
})
