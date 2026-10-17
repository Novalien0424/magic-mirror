import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error Plain JavaScript shared with the deployed hooks.
import { MOUSE_PATHS, createMouseIo, operateMouse, parseMouseList } from '../../scripts/mirror-mouse-control.mjs'

const ok = (stdout = '') => ({ status: 0, stdout })
const command = `${MOUSE_PATHS.clientBinary} -c ${MOUSE_PATHS.clientConfig} -e -g`
const add = 'MANUAL HUB ADD,192.168.77.2:7575'
const use = 'USE,mm-mouse.51', release = 'STOP USING,mm-mouse.51'
const opaque = 'synthetic private command/error detail'
const device = (address = 'mm-mouse.51', owner = '') =>
  `  --> Xiaomi Wireless Mouse Lite 3 (${address})${owner ? ` ${owner}` : ''}\n`
const hub = (devices = device(), address = 'mm-mouse:7575') => `Hub (${address}) \t\n${devices}`

function fixture(client = false) {
  const state = { time: 0, client, inUse: false, confirm: true, exit: true, slow: false,
    socket: true, missing: new Set<string>(), failures: new Map<string, number>(), list: null as string | null }
  const io = {
    uid: 501, now: () => state.time, report: vi.fn(),
    exists: vi.fn(async (path: string) => !state.missing.has(path)),
    wait: vi.fn(async (ms: number) => { state.time += ms }),
    socketReady: vi.fn(async (_path: string, timeout: number) => {
      if (state.slow) state.time += timeout
      return state.socket
    }),
    processes: vi.fn(async (timeout: number) => {
      if (state.slow) state.time += timeout
      return state.client ? [{ pid: 42, uid: 501, command }] : []
    }),
    run: vi.fn(async (file: string, args: string[], timeout: number) => {
      if (state.slow) state.time += timeout
      const text = file === MOUSE_PATHS.clientBinary ? args[1] : args.at(-1)!
      const failures = state.failures.get(text) ?? 0
      if (failures) { state.failures.set(text, failures - 1); throw Error(opaque) }
      if (file === MOUSE_PATHS.adb && ['start', 'stop'].includes(text)) return ok()
      if (file === '/usr/bin/open') { state.client = true; return ok() }
      if (file === MOUSE_PATHS.clientBinary && args[0] === '-t') {
        if (text === add) return ok()
        if (text === 'LIST') return ok(state.list ?? hub(device(undefined, state.inUse ? '(In-use by you)' : '')))
        if (text === use) { state.inUse = state.confirm; return ok() }
        if (text === release) { state.inUse = false; return ok() }
        if (text === 'EXIT') { if (state.exit) state.client = false; return ok() }
      }
      throw Error('unexpected synthetic command')
    }),
  }
  return { io, state }
}
type Io = ReturnType<typeof fixture>['io']
const apis = (io: Io) => io.run.mock.calls.filter(([file]) => file === MOUSE_PATHS.clientBinary).map(([, args]) => args[1])
const remotes = (io: Io) => io.run.mock.calls.filter(([file]) => file === MOUSE_PATHS.adb).map(([, args]) => args.at(-1))

describe('synthetic mouse control', () => {
  it('parses actual and legacy ownership with trailing hub whitespace', () => {
    for (const owner of ['(In-use by you)', '[In-use by you]']) {
      expect(parseMouseList(hub(device('mm-mouse.782', owner))))
        .toEqual({ status: 'found', address: 'mm-mouse.782', ownership: 'you' })
    }
    expect(parseMouseList(hub())).toEqual({ status: 'found', address: 'mm-mouse.51', ownership: 'available' })
    expect(parseMouseList(hub(device(undefined, '(In-use by another client)'))).ownership).toBe('other')
  })

  it('requires exact hub, receiver and numeric address, rejecting ambiguity', () => {
    for (const address of ['other:7575', 'mm-mouse:75750', '192.168.77.2:7575']) {
      expect(parseMouseList(hub(device(), address))).toEqual({ status: 'missing' })
    }
    expect(parseMouseList(hub().replace('Mouse Lite 3', 'Mouse Lite 30'))).toEqual({ status: 'missing' })
    for (const address of ['mm-mouse.*', 'mm-mouse.51.extra', 'other.51']) {
      expect(parseMouseList(hub(device(address)))).toEqual({ status: 'invalid' })
    }
    for (const list of [hub(device() + device('mm-mouse.52')), hub() + hub('')]) {
      expect(parseMouseList(list)).toEqual({ status: 'ambiguous' })
    }
  })

  it('inspects argv only for matched executable metadata, excluding unrelated CLI prompts', async () => {
    const rows: Record<string, string> = { '2': `2 501 codex exec "repair ${command}"`, '7': `7 501 ${command}` }
    const run = vi.fn(async (_file: string, args: string[], _timeout: number) => args.includes('pid=,comm=')
      ? ok('2 /usr/local/bin/codex\n7 /Applications/VirtualHereUniversal.app/Contents/MacOS/VirtualHereUniversal\n8 /tmp/VirtualHereUniversal-helper\n9 /usr/bin/node\n')
      : ok(args[2].split(',').map(pid => rows[pid]).join('\n')))
    const io = createMouseIo(() => {}, { run, uid: 501, now: () => 0 })
    expect(await io.processes(500)).toEqual([{ pid: 7, uid: 501, command }])
    expect(run.mock.calls[1]).toEqual(['/bin/ps', ['-ww', '-p', '7', '-o', 'pid=,uid=,command='], 500])
    run.mockReset().mockResolvedValue(ok('2 /usr/local/bin/codex\n9 /usr/bin/node\n'))
    expect(await io.processes(500)).toEqual([])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('waits for the actual cold socket, then starts idempotently with the normal GUI argv', async () => {
    const { io } = fixture()
    io.socketReady.mockImplementation(async () => {
      expect(apis(io)).toEqual([])
      return io.socketReady.mock.calls.length >= 3
    })
    expect(await operateMouse('start', io)).toBe('mouse_started')
    expect(io.socketReady).toHaveBeenCalledTimes(3)
    expect(io.socketReady.mock.calls.every(([path, timeout]) => path === '/tmp/vhclient_ipc/socket'
      && timeout > 0 && timeout <= 250)).toBe(true)
    expect(io.run).toHaveBeenCalledWith(MOUSE_PATHS.adb,
      [...MOUSE_PATHS.adbPrefix, 'shell', 'su', '0', 'sh', MOUSE_PATHS.runner, 'start'], expect.any(Number))
    expect(io.run).toHaveBeenCalledWith('/usr/bin/open', ['-gj', '-a', MOUSE_PATHS.clientApp,
      '--args', '-c', MOUSE_PATHS.clientConfig, '-e', '-g'], expect.any(Number))
    io.socketReady.mockResolvedValue(true)
    expect(await operateMouse('start', io)).toBe('mouse_started')
    expect(apis(io)).toContain(add)
    expect(apis(io).filter(text => text === use)).toHaveLength(1)
    expect(io.run.mock.calls.filter(([file]) => file === '/usr/bin/open')).toHaveLength(1)
  })

  it('requires an in-use LIST confirmation after USE OK', async () => {
    const { io, state } = fixture(); state.confirm = false
    expect(await operateMouse('start', io)).toBe('mouse_readiness_timeout')
    expect(apis(io).filter(text => text === use)).toHaveLength(1)
    expect(apis(io).filter(text => text === 'LIST').length).toBeLessThanOrEqual(40)
    expect(state.time).toBeLessThanOrEqual(10000)
  })

  it.each([true, false])('bounds unavailable IPC even with an advancing clock: %s', async advancing => {
    const { io, state } = fixture(); state.socket = false
    if (!advancing) io.wait.mockImplementation(async () => {})
    expect(await operateMouse('start', io)).toBe('mouse_readiness_timeout')
    expect(io.socketReady.mock.calls.length).toBeLessThanOrEqual(40)
    expect(state.time).toBeLessThanOrEqual(10000)
    expect(apis(io)).toEqual([])
  })

  it('shares one failed startup retry and never retries USE or persistent API failures', async () => {
    for (const [failures, reason, adds, lists] of [
      [[[add, 1]], 'mouse_started', 2, 2],
      [[['LIST', 1]], 'mouse_started', 1, 3],
      [[[add, 1], ['LIST', 1]], 'mouse_list_failed', 2, 1],
      [[[add, Infinity]], 'mouse_hub_add_failed', 2, 0],
      [[['LIST', Infinity]], 'mouse_list_failed', 1, 2],
      [[[use, Infinity]], 'mouse_use_failed', 1, 1],
    ] as [Array<[string, number]>, string, number, number][]) {
      const { io, state } = fixture(); state.failures = new Map(failures)
      expect(await operateMouse('start', io)).toBe(reason)
      expect(apis(io).filter(text => text === add)).toHaveLength(adds)
      expect(apis(io).filter(text => text === 'LIST')).toHaveLength(lists)
      expect(apis(io).filter(text => text === use).length).toBeLessThanOrEqual(1)
      expect(JSON.stringify(io.report.mock.calls)).not.toContain(opaque)
    }
  })

  it.each(['start', 'stop'])('bounds slow %s operations and preserves remote cleanup time', async action => {
    const { io, state } = fixture(true); state.slow = true; state.inUse = true
    const result = await operateMouse(action, io)
    expect(result).toBe(action === 'stop' ? 'mouse_stopped' : 'mouse_started')
    expect(state.time).toBeLessThanOrEqual(10000)
    expect(io.run.mock.calls.every(([, , timeout]) => timeout > 0 && timeout <= 3000)).toBe(true)
    expect(io.processes.mock.calls.every(([timeout]) => timeout > 0 && timeout <= 1000)).toBe(true)
    if (action === 'stop') expect(remotes(io)).toEqual(['stop'])
  })

  it('allows missing config and safely degrades missing optional installation with remote cleanup', async () => {
    const { io, state } = fixture(); state.missing.add(MOUSE_PATHS.clientConfig)
    expect(await operateMouse('start', io)).toBe('mouse_started')
    expect(await operateMouse('stop', io)).toBe('mouse_stopped')
    expect(io.exists).not.toHaveBeenCalledWith(MOUSE_PATHS.clientConfig)
    for (const path of [MOUSE_PATHS.adb, MOUSE_PATHS.clientApp, MOUSE_PATHS.clientBinary]) {
      const f = fixture(); f.state.missing.add(path)
      expect(await operateMouse('start', f.io)).toBe('mouse_not_installed')
      expect(f.io.run).not.toHaveBeenCalled()
      expect(await operateMouse('stop', f.io)).toBe('mouse_not_installed')
      expect(remotes(f.io)).toEqual(path === MOUSE_PATHS.adb ? [] : ['stop'])
    }
  })

  it('preserves clients with different UID/argv and ambiguous dedicated clients', async () => {
    const owned = { pid: 42, uid: 501, command }
    for (const rows of [[{ ...owned, uid: 502 }], [{ ...owned, command: command + ' -i' }],
      [{ ...owned, command: command.replace('/client.ini', '/client.ini.other') }], [owned, { ...owned, pid: 43 }]]) {
      const { io } = fixture(true); io.processes.mockResolvedValue(rows)
      const reason = rows.length > 1 ? 'mouse_client_ambiguous' : 'mouse_client_unowned'
      expect(await operateMouse('start', io)).toBe(reason)
      expect(io.run).not.toHaveBeenCalled()
      expect(await operateMouse('stop', io)).toBe(reason)
      expect(apis(io)).toEqual([])
      expect(remotes(io)).toEqual(['stop'])
    }
  })

  it('releases exactly its receiver, verifies delayed client exit, and stops idempotently', async () => {
    const { io, state } = fixture(true); state.inUse = true; state.exit = false
    let polls = 0
    io.wait.mockImplementation(async ms => { state.time += ms; if (++polls === 2) state.client = false })
    expect(await operateMouse('stop', io)).toBe('mouse_stopped')
    expect(state.client).toBe(false)
    expect(polls).toBe(2)
    expect(apis(io)).toEqual(['LIST', release, 'EXIT'])
    expect(await operateMouse('stop', io)).toBe('mouse_stopped')
    expect(apis(io)).toEqual(['LIST', release, 'EXIT'])
    expect(remotes(io)).toEqual(['stop', 'stop'])
  })

  it('never releases an unmatched, busy, idle or ambiguous receiver', async () => {
    for (const [list, reason] of [[hub('', 'other:7575'), 'mouse_stopped'], [hub(), 'mouse_stopped'],
      [hub(device(undefined, '(In-use by another client)')), 'mouse_stopped'],
      [hub(device() + device('mm-mouse.52')), 'mouse_stop_failed'], [hub(device('other.51')), 'mouse_stop_failed']]) {
      const { io, state } = fixture(true); state.list = list
      expect(await operateMouse('stop', io)).toBe(reason)
      expect(apis(io).some(text => text.startsWith('STOP USING,'))).toBe(false)
      expect(apis(io)).toContain('EXIT')
      expect(remotes(io)).toEqual(['stop'])
    }
  })

  it.each(['LIST', release, 'EXIT', 'process'])('still stops remotely after %s fails, with metadata-only diagnostics', async failure => {
    const { io, state } = fixture(true); state.inUse = true
    if (failure === 'process') {
      io.processes.mockRejectedValue(Error(opaque))
      io.report.mockImplementation(() => { throw Error(opaque) })
    } else state.failures.set(failure, Infinity)
    expect(await operateMouse('stop', io)).toBe(failure === 'process' ? 'mouse_process_unavailable' : 'mouse_stop_failed')
    expect(remotes(io)).toEqual(['stop'])
    if (failure !== 'process') {
      expect(apis(io)).toContain('EXIT')
      expect(apis(io).filter(text => text === failure)).toHaveLength(1)
    } else expect(apis(io)).toEqual([])
    expect(JSON.stringify(io.report.mock.calls)).not.toContain(opaque)
    expect(io.report.mock.calls.every(([step, reason]) => /^[a-z_]+$/.test(step) && /^mouse_[a-z_]+$/.test(reason))).toBe(true)
  })

  it('reports a client that ignores EXIT and still performs bounded remote cleanup', async () => {
    const { io, state } = fixture(true); state.exit = false
    expect(await operateMouse('stop', io)).toBe('mouse_stop_failed')
    expect(apis(io).filter(text => text === 'EXIT')).toHaveLength(1)
    expect(io.report).toHaveBeenCalledWith('exit', 'mouse_client_exit_unverified')
    expect(state.time).toBeLessThanOrEqual(10000)
    expect(remotes(io)).toEqual(['stop'])
  })
})
