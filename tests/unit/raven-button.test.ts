import { describe, expect, it, vi } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
// @ts-expect-error Plain JavaScript shared with the deployed CLI.
import { mirrorRendererReady, waitForMirrorReady, operateButton, parseLaunchdState, parseProcessSnapshot, parseQueuedRequest, processTree } from '../../scripts/raven-button.mjs'
// @ts-expect-error Plain JavaScript config generator.
import { ravenButtonMapping } from '../../scripts/raven-button-karabiner.mjs'

const off = { loaded: false, pid: null }
const running = { loaded: true, pid: 123 }
const child = (pid: number, ppid: number, extra = {}) => ({
  pid, ppid, started: 'Sat Oct 17 10:00:00 2026', status: 'S', command: `/fixture/process-${pid}`, ...extra,
})
const operations = (launch: ReturnType<typeof vi.fn>) => launch.mock.calls.map(([operation]) => operation)
function clock() {
  let time = 0
  return { now: () => time, wait: vi.fn(async (ms: number) => { time += ms }), advance: (ms: number) => { time += ms } }
}

describe('readiness before waking TV', () => {
  const since = Date.parse('2026-10-17T02:00:00Z')
  const marker = (value: string) => `${value} at=2026-10-17T02:00:01Z\n`
  const ready = marker('MAIN_READY platform=darwin') + marker('WINDOW_LOADED window=mirror') + marker('RENDERER_READY window=mirror')
  it('requires current-Main load and renderer readiness, ignoring old sessions and Console', () => {
    expect(mirrorRendererReady(ready, since)).toBe(true)
    expect(mirrorRendererReady(ready, since + 2000)).toBe(false)
    expect(mirrorRendererReady(ready.replaceAll('window=mirror', 'window=console'), since)).toBe(false)
    expect(mirrorRendererReady(marker('RENDERER_READY window=mirror'), since)).toBe(false)
    expect(mirrorRendererReady(ready.trimEnd(), since)).toBe(false)
  })
  it.each(['APP_EXIT code=0', 'RENDERER_GONE window=mirror', 'WINDOW_RECREATED window=mirror', 'MAIN_READY platform=darwin'])(
    'invalidates readiness after %s', event => expect(mirrorRendererReady(ready + marker(event), since)).toBe(false))
  it('accepts a recovered renderer only after load and bridge readiness return', () => {
    const crash = ready + marker('RENDERER_GONE window=mirror')
    expect(mirrorRendererReady(crash + marker('RENDERER_READY window=mirror'), since)).toBe(false)
    expect(mirrorRendererReady(crash + marker('WINDOW_LOADED window=mirror') + marker('RENDERER_READY window=mirror'), since)).toBe(true)
  })
  it('does not mistake a PID for a ready app', async () => {
    const time = clock()
    expect(await waitForMirrorReady({ ...time, state: async () => running,
      processes: async () => [{ pid: 123, started: '2026-10-17T02:00:00Z' }], readLog: async () => '' })).toBe(false)
    expect(time.now()).toBe(10000)
  })
  it('checks the same Main still owns the ready markers', async () => {
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValue(off)
    expect(await waitForMirrorReady({ ...clock(), state,
      processes: async () => [{ pid: 123, started: '2026-10-17T02:00:00Z' }], readLog: async () => ready })).toBe(false)
  })
})

describe('Raven launchd button', () => {
  it('rejects malformed or partial queue files instead of throwing', () => {
    expect(parseQueuedRequest('{"action":"start","at":1')).toBeNull()
    expect(parseQueuedRequest('')).toBeNull()
    expect(parseQueuedRequest('null')).toBeNull()
    expect(parseQueuedRequest('{"action":"reboot","at":1}')).toBeNull()
    expect(parseQueuedRequest('{"action":"show_console","at":1}')).toBeNull()
    expect(parseQueuedRequest('{"action":"Studio","at":1}')).toBeNull()
    expect(parseQueuedRequest('{"action":"studio","at":"1"}')).toBeNull()
    expect(parseQueuedRequest('{"action":"stop","at":5}')).toEqual({ action: 'stop', at: 5 })
    expect(parseQueuedRequest('{"action":"loop","at":6}')).toEqual({ action: 'loop', at: 6 })
    expect(parseQueuedRequest('{"action":"console","at":7}')).toEqual({ action: 'console', at: 7 })
    expect(parseQueuedRequest('{"action":"studio","at":8}')).toEqual({ action: 'studio', at: 8 })
    expect(parseQueuedRequest('{"action":"desktop","at":9}')).toEqual({ action: 'desktop', at: 9 })
  })
  it.each(['kickstart', 'bootstrap'])('starts a stopped job through %s', async operation => {
    const state = vi.fn().mockResolvedValueOnce({ loaded: operation === 'kickstart', pid: null }).mockResolvedValue({ pid: 123 })
    const launch = vi.fn(async () => true)
    expect(await operateButton('start', { state, launch, wait: vi.fn() })).toBe('started')
    expect(operations(launch)).toEqual([operation])
  })
  it('is idempotent for running starts and stopped stops', async () => {
    const launch = vi.fn(), wait = vi.fn()
    expect(await operateButton('start', { state: async () => ({ pid: 1 }), launch, wait })).toBe('already_on')
    expect(await operateButton('stop', { state: async () => off, launch, wait })).toBe('already_off')
    expect(launch).not.toHaveBeenCalled()
  })
  it('accepts a start racing a KeepAlive launch without a second launch', async () => {
    const state = vi.fn().mockResolvedValueOnce({ loaded: true, pid: null }).mockResolvedValue(running)
    const launch = vi.fn(async () => false)
    expect(await operateButton('start', { state, launch, ...clock() })).toBe('started')
    expect(operations(launch)).toEqual(['kickstart'])
  })
  it('reports a failed start when no process appeared', async () => {
    expect(await operateButton('start', { state: async () => off, launch: async () => false, ...clock() })).toBe('start_failed')
  })
  it('bounds a start that never produces a PID', async () => {
    const time = clock(), launch = vi.fn(async () => true)
    expect(await operateButton('start', { state: async () => off, launch, ...time })).toBe('start_timeout')
    expect(time.now()).toBe(10000)
    expect(operations(launch)).toEqual(['bootstrap'])
  })
  it('sends exactly one TERM, waits for exit zero, and unloads the stopped job', async () => {
    let unloaded = false
    const launch = vi.fn(async (operation: string) => { if (operation === 'bootout') unloaded = true; return true })
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce(running)
      .mockImplementation(async () => unloaded ? off : { loaded: true, pid: null, exit: 0 })
    expect(await operateButton('stop', { state, launch, ...clock() })).toBe('stopped')
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('unloads a frozen job after 25 seconds without a second TERM', async () => {
    let unloaded = false
    const launch = vi.fn(async (operation: string) => { if (operation === 'bootout') unloaded = true; return true }), time = clock()
    expect(await operateButton('stop', { state: async () => unloaded ? off : running, launch, ...time })).toBe('stopped_forced')
    expect(operations(launch)).toEqual(['term', 'bootout'])
    expect(time.wait).toHaveBeenCalledTimes(50)
    expect(time.now()).toBe(25000)
  })
  it('unloads a restart that occurred during intentional stop', async () => {
    let unloaded = false
    const launch = vi.fn(async (operation: string) => { if (operation === 'bootout') unloaded = true; return true })
    const state = vi.fn().mockResolvedValueOnce(running).mockImplementation(async () => unloaded ? off : { loaded: true, pid: 456 })
    expect(await operateButton('stop', { state, launch, ...clock() })).toBe('stopped_forced')
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('unloads the PID-less gap after a signal exit before KeepAlive can restart', async () => {
    let unloaded = false
    const launch = vi.fn(async (operation: string) => { if (operation === 'bootout') unloaded = true; return true })
    const state = vi.fn().mockResolvedValueOnce(running).mockImplementation(async () => unloaded ? off : { loaded: true, pid: null, exit: NaN })
    expect(await operateButton('stop', { state, launch, ...clock() })).toBe('stopped_forced')
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it.each([NaN, 1, 0])('unloads an initial PID-less job with last exit %s', async exit => {
    let unloaded = false
    const launch = vi.fn(async () => { unloaded = true; return true })
    const state = async () => unloaded ? off : { loaded: true, pid: null, exit }
    expect(await operateButton('stop', { state, launch, ...clock() })).toBe(exit === 0 ? 'stopped' : 'stopped_forced')
    expect(operations(launch)).toEqual(['bootout'])
  })
  it('still unloads when TERM races the process exit and fails', async () => {
    let unloaded = false
    const launch = vi.fn(async (operation: string) => { if (operation === 'bootout') unloaded = true; return operation === 'bootout' })
    expect(await operateButton('stop', { state: async () => unloaded ? off : running, launch, ...clock() })).toBe('stopped_forced')
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('still unloads after a failed state probe during shutdown', async () => {
    const state = vi.fn().mockResolvedValueOnce(running).mockRejectedValueOnce(Error('probe_failed')).mockResolvedValue(off)
    const launch = vi.fn(async () => true)
    expect(await operateButton('stop', { state, launch, ...clock() })).toBe('stopped_forced')
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it.each([true, false])('does not claim a stop while the job remains loaded (bootout result %s)', async accepted => {
    const state = async () => ({ loaded: true, pid: null }), launch = vi.fn(async () => accepted)
    expect(await operateButton('stop', { state, launch, ...clock() })).toBe('stop_failed')
    expect(operations(launch)).toEqual(['bootout'])
  })
  it('accepts a failed bootout only after verifying the job is absent', async () => {
    const state = vi.fn().mockResolvedValueOnce({ loaded: true, pid: null }).mockResolvedValue(off)
    expect(await operateButton('stop', { state, launch: async () => false, ...clock() })).toBe('stopped_forced')
  })
  it('counts slow launchctl calls against the stop deadline and bounds their timeouts', async () => {
    let unloaded = false
    const time = clock(), state = vi.fn(async (timeout: number) => { time.advance(Math.min(timeout, 1000)); return unloaded ? off : running })
    const launch = vi.fn(async (operation: string, timeout: number) => {
      time.advance(Math.min(timeout, operation === 'bootout' ? 20000 : 2000))
      if (operation === 'bootout') unloaded = true
      return true
    })
    expect(await operateButton('stop', { state, launch, ...time })).toBe('stopped_forced')
    expect(time.now()).toBeLessThanOrEqual(55000)
    expect(time.wait.mock.calls.length).toBeLessThan(50)
    expect(state.mock.calls.every(([timeout]) => timeout > 0 && timeout <= 1000)).toBe(true)
    expect(launch.mock.calls.every(([operation, timeout]) => timeout > 0 && timeout <= (operation === 'bootout' ? 25000 : 2000))).toBe(true)
  })
  it('waits for captured reparented children and grandchildren, without acting on unrelated processes', async () => {
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce({ loaded: true, pid: null, exit: 0 }).mockResolvedValue(off)
    const processes = vi.fn().mockResolvedValueOnce([child(789, 456), child(123, 1), child(456, 123), child(999, 1)])
      .mockResolvedValueOnce([child(456, 1), child(789, 1), child(999, 1)]).mockResolvedValue([child(999, 1)])
    const launch = vi.fn(async () => true), time = clock()
    expect(await operateButton('stop', { state, launch, processes, ...time })).toBe('stopped')
    expect(processes).toHaveBeenCalledTimes(3)
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('reports a surviving captured child after the bounded cleanup check', async () => {
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce({ loaded: true, pid: null, exit: 0 }).mockResolvedValue(off)
    const processes = vi.fn().mockResolvedValueOnce([child(123, 1), child(456, 123)]).mockResolvedValue([child(456, 1)])
    const launch = vi.fn(async () => true), time = clock()
    expect(await operateButton('stop', { state, launch, processes, ...time })).toBe('stop_processes_remaining')
    expect(time.now()).toBe(23500)
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('counts slow process probes against the cleanup deadline', async () => {
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce({ loaded: true, pid: null, exit: 0 }).mockResolvedValue(off)
    const time = clock(), processes = vi.fn(async (timeout: number) => {
      time.advance(timeout)
      return [child(123, 1), child(456, 123)]
    })
    expect(await operateButton('stop', { state, processes, launch: async () => true, ...time })).toBe('stop_processes_remaining')
    expect(time.now()).toBe(24500)
    expect(processes.mock.calls.length).toBeLessThan(50)
  })
  it.each([false, true])('allows launchd its 20-second forced-exit interval (job removal delayed: %s)', async jobDelayed => {
    let unloaded = false
    const time = clock(), state = async () => unloaded && (!jobDelayed || time.now() >= 45000) ? off : running
    const launch = vi.fn(async (operation: string) => { if (operation === 'bootout') unloaded = true; return true })
    const processes = async () => time.now() < 45000 ? [child(123, 1), child(456, 123)] : []
    expect(await operateButton('stop', { state, launch, processes, ...time })).toBe('stopped_forced')
    expect(time.now()).toBe(45000)
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('also verifies the children of an observed restart before reporting a stop', async () => {
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce({ loaded: true, pid: 789 }).mockResolvedValue(off)
    const processes = vi.fn().mockResolvedValueOnce([child(123, 1), child(456, 123)])
      .mockResolvedValueOnce([child(789, 1), child(900, 789)]).mockResolvedValue([child(900, 1)])
    const launch = vi.fn(async () => true)
    expect(await operateButton('stop', { state, processes, launch, ...clock() })).toBe('stop_processes_remaining')
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('does not mistake zombies or reused PIDs for live captured children', async () => {
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce({ loaded: true, pid: null, exit: 0 }).mockResolvedValue(off)
    const processes = vi.fn().mockResolvedValueOnce([child(123, 1), child(456, 123), child(789, 123)])
      .mockResolvedValue([child(456, 1, { started: 'Sat Oct 17 11:00:00 2026' }), child(789, 1, { status: 'Z' })])
    expect(await operateButton('stop', { state, processes, launch: async () => true, ...clock() })).toBe('stopped')
  })
  it.each(['capture', 'verification'])('reports unverified cleanup on a failed %s probe but still unloads', async failure => {
    const state = vi.fn().mockResolvedValueOnce(running).mockResolvedValueOnce({ loaded: true, pid: null, exit: 0 }).mockResolvedValue(off)
    const processes = failure === 'capture' ? vi.fn().mockRejectedValue(Error('ps_failed'))
      : vi.fn().mockResolvedValueOnce([child(123, 1)]).mockRejectedValue(Error('ps_failed'))
    const launch = vi.fn(async () => true)
    expect(await operateButton('stop', { state, processes, launch, ...clock() })).toBe('stop_cleanup_unverified')
    expect(operations(launch)).toEqual(['term', 'bootout'])
  })
  it('parses only explicit launchd absence and rejects failed state probes', () => {
    expect(parseLaunchdState({ status: 0, stdout: 'state = running\n\tpid = 123\n\tlast exit code = 0\n' })).toEqual({ ...running, exit: 0 })
    expect(parseLaunchdState({ status: 0, stdout: '\tlast exit code = 0\n' })).toEqual({ loaded: true, pid: null, exit: 0 })
    expect(parseLaunchdState({ status: 113, stderr: 'Could not find service "com.magicmirror.launchagent" in domain for user gui:501' })).toEqual(off)
    for (const result of [
      { status: 1, stderr: 'Operation not permitted' },
      { status: null, error: Error('ETIMEDOUT') },
      { status: null, signal: 'SIGKILL', stderr: 'Could not find service ' },
    ]) expect(() => parseLaunchdState(result)).toThrow('launchd_state_unavailable')
  })
  it('parses process metadata with spaced paths and builds just the observed family', () => {
    const processes = parseProcessSnapshot(' 123 1 Sat Oct 17 10:00:00 2026 S /fixture/Electron App\n 789 456 Sat Oct 17 10:00:00 2026 S /fixture/grandchild\n 456 123 Sat Oct 17 10:00:00 2026 S /fixture/child\n 999 1 Sat Oct 17 10:00:00 2026 S /fixture/unrelated\n')
    expect(processTree(processes, 123).map((item: { pid: number }) => item.pid)).toEqual([123, 789, 456])
    expect(processes[0].command).toBe('/fixture/Electron App')
    expect(() => parseProcessSnapshot('partial process row')).toThrow('process_snapshot_invalid')
  })
  it.each(['start', 'stop', 'loop', 'console', 'studio', 'desktop', 'music'])('provides an executable canonical %s wrapper without launching it', action => {
    const path = new URL(`../../deploy/macos/magic-mirror-${action}.sh`, import.meta.url)
    expect(statSync(path).mode & 0o111).not.toBe(0)
    expect(readFileSync(path, 'utf8')).toBe(`#!/bin/zsh\nset -eu\nexec /bin/zsh /Users/novalien0424/magic-mirror/deploy/macos/raven-button.sh ${action}\n`)
  })
  it('installs a signed wrapper for every Stream Deck profile key, with STUDIO under START', () => {
    const installer = readFileSync(new URL('../../deploy/macos/install-stream-deck-controls.sh', import.meta.url), 'utf8')
    const profile = readFileSync(new URL('../../scripts/prepare-stream-deck-profile.py', import.meta.url), 'utf8')
    expect(installer.match(/^for action in (.+); do$/gm)).toEqual(Array(2).fill('for action in start stop loop console studio desktop music; do'))
    for (const [action, label] of [['start', 'Start'], ['stop', 'Stop'], ['loop', 'Play Loop'], ['console', 'Console'], ['studio', 'Studio'], ['desktop', 'Desktop'], ['music', 'Music Loop']]) {
      expect(installer).toContain(`    ${action}) label='${label} Magic Mirror' ;;`)
      expect(profile).toContain(`, "${label}", `)
    }
    expect(profile).toContain('(0, 1, "Studio", "STUDIO", "#b26a00", ')
    expect(profile).toContain('(3, 0, "Desktop", "DESKTOP", ')
    expect(profile).toContain('(1, 1, "Music Loop", "MUSIC\\nLOOP", ')
  })
  it('keeps Remote Console off the button queue, the TV, the mouse and the Stream Deck', () => {
    const path = new URL('../../deploy/macos/magic-mirror-remote-console.sh', import.meta.url)
    const script = readFileSync(path, 'utf8')
    const installer = readFileSync(new URL('../../deploy/macos/install-remote-console.sh', import.meta.url), 'utf8')
    expect(statSync(path).mode & 0o111).not.toBe(0)
    expect(statSync(new URL('../../deploy/macos/install-remote-console.sh', import.meta.url)).mode & 0o111).not.toBe(0)
    expect(script).toContain('/Users/novalien0424/magic-mirror/scripts/operator-command.mjs show_console_main ')
    expect(script).not.toMatch(/raven-button|mirror-tv-control|mirror-mouse|afplay|launchctl (kickstart|bootstrap|kill)/)
    expect(installer).toContain('destination="$HOME/Desktop/$label.app"')
    expect(installer).toContain('identifier=com.magicmirror.control.remote-console')
    expect(installer).not.toMatch(/Magic Mirror Controls|prepare-stream-deck-profile/)
    expect(readFileSync(new URL('../../deploy/macos/install-stream-deck-controls.sh', import.meta.url), 'utf8')).not.toContain('remote')
  })
  it('requires the observed device address and consumes both keys only on that device', () => {
    expect(() => ravenButtonMapping(undefined)).toThrow('observed_bluetooth_device_address_required')
    const mapping = ravenButtonMapping('12:34:56:78:90:ab')
    expect(mapping.rules[0].manipulators).toHaveLength(2)
    for (const item of mapping.rules[0].manipulators) {
      expect(item.conditions).toEqual([{ type: 'device_if', identifiers: [{ device_address: '12:34:56:78:90:ab' }] }])
      expect(item.to[0]).not.toHaveProperty('key_code')
      expect(item.to[0].repeat).toBe(false)
    }
  })
})
