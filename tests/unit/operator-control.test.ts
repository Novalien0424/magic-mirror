import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseOperatorRequest, startOperatorControl } from '../../src/main/operator-control'

const filesystem = vi.hoisted(() => ({ watch: vi.fn() }))
vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(), watch: filesystem.watch,
}))

const now = 100_000
const ids = [1, 2, 3, 4, 5].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
const id = ids[0]!
type Action = NonNullable<ReturnType<typeof parseOperatorRequest>>['action']
const request = (extra: Record<string, unknown> = {}) => ({ version: 1, id, action: 'play_loop', issuedAt: now, expiresAt: now + 45000, ...extra })
const directories: string[] = [], stops: (() => void)[] = []
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(async () => {
  for (const stop of stops.splice(0)) stop()
  filesystem.watch.mockReset()
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function mailbox() {
  const directory = await mkdtemp(join(tmpdir(), 'mm-operator-control-test-'))
  directories.push(directory)
  const requests = join(directory, 'requests'), responses = join(directory, 'responses')
  await mkdir(requests)
  let notify: () => void = () => { throw Error('test_watcher_not_started') }
  const close = vi.fn(), execute = vi.fn(async (_action: Action): Promise<boolean> => true)
  const waiters: { count: number; resolve(): void }[] = []
  let reportCount = 0
  const report = vi.fn((_reason: string) => {
    reportCount += 1
    for (const waiter of waiters.splice(0)) {
      if (reportCount >= waiter.count) waiter.resolve()
      else waiters.push(waiter)
    }
  })
  return {
    requests, responses, execute, report, close, notify: () => notify(),
    reported(count: number) {
      return reportCount >= count ? Promise.resolve() : new Promise<void>(resolve => { waiters.push({ count, resolve }) })
    },
    async publish(name: string, value: unknown = request({ id: name })) {
      const temporary = join(requests, `${name}.json.tmp`)
      await writeFile(temporary, typeof value === 'string' ? value : JSON.stringify(value), { flag: 'wx', mode: 0o600 })
      await rename(temporary, join(requests, `${name}.json`))
    },
    async response(name: string) { return JSON.parse(await readFile(join(responses, `${name}.json`), 'utf8')) },
    async start() {
      filesystem.watch.mockImplementation((_path: string, listener: () => void) => {
        notify = listener
        return { on: vi.fn(), close }
      })
      stops.push(await startOperatorControl({ directory, execute, report }))
    },
  }
}

describe('Main operator request parser', () => {
  it.each(['normal', 'play_loop', 'show_console', 'show_console_main', 'studio'] as const)('accepts exactly the fixed %s payload and returns only command metadata', action => {
    expect(parseOperatorRequest(request({ action }), now)).toEqual({ id, action, expiresAt: now + 45000 })
  })

  it.each([
    null, [], 'play_loop', {},
    { ...request(), version: 2 }, { ...request(), version: '1' },
    { ...request(), action: 'stop' }, { ...request(), action: 'shutdown' },
    { ...request(), action: 'PLAY_LOOP' }, { ...request(), action: 'play_loop ' }, { ...request(), action: 'show_console_remote' },
    { ...request(), action: { action: 'normal' } },
    { ...request(), extra: true }, { ...request(), issuedAt: undefined },
    { ...request(), id: '../request' }, { ...request(), id: '' }, { ...request(), id: 1 },
    { ...request(), id: `${id}x` }, { ...request(), id: id.replaceAll('-', '') },
    { ...request(), issuedAt: NaN }, { ...request(), issuedAt: Infinity },
    { ...request(), issuedAt: String(now) }, { ...request(), expiresAt: NaN },
    { ...request(), expiresAt: Infinity }, { ...request(), expiresAt: String(now + 45000) },
  ])('rejects malformed or expanded payload %#', value => {
    expect(parseOperatorRequest(value, now)).toBeNull()
  })

  it('requires every field, bounds lifetime, and enforces the exact expiry and future-skew boundaries', () => {
    for (const key of Object.keys(request())) {
      const partial: Record<string, unknown> = { ...request() }
      delete partial[key]
      expect(parseOperatorRequest(partial, now)).toBeNull()
    }
    expect(parseOperatorRequest(request(), now + 44999)).not.toBeNull()
    expect(parseOperatorRequest(request(), now + 45000)).toBeNull()
    expect(parseOperatorRequest(request({ expiresAt: now }), now)).toBeNull()
    expect(parseOperatorRequest(request({ issuedAt: now + 1000, expiresAt: now + 46000 }), now)).not.toBeNull()
    expect(parseOperatorRequest(request({ issuedAt: now + 1001, expiresAt: now + 46001 }), now)).toBeNull()
    expect(parseOperatorRequest(request({ expiresAt: now + 45001 }), now)).toBeNull()
    expect(parseOperatorRequest(request({ issuedAt: now + 1, expiresAt: now + 1 }), now)).toBeNull()
    expect(parseOperatorRequest(request({ issuedAt: now + 2, expiresAt: now + 1 }), now)).toBeNull()
    const uppercase = 'CB108B79-5DFE-4B6D-9802-272F41D300FF'
    expect(parseOperatorRequest(request({ id: uppercase }), now)?.id).toBe(uppercase)
  })
})

describe('operator mailbox request processing', () => {
  it('consumes an atomic request once despite concurrent/repeated notifications, then acknowledges its result', async () => {
    const f = await mailbox(), entered = deferred<void>(), execution = deferred<boolean>()
    f.execute.mockImplementationOnce(async () => { entered.resolve(); return execution.promise })
    await f.publish(id)
    await f.start()
    await entered.promise
    expect(await readdir(f.requests)).toEqual([])
    expect(await readdir(f.responses)).toEqual([])
    for (let n = 0; n < 6; n++) f.notify()
    expect(f.execute).toHaveBeenCalledExactlyOnceWith('play_loop')
    execution.resolve(true)
    await f.reported(1)
    expect(await f.response(id)).toEqual({ version: 1, id, status: 'success', reason: 'operator_control_complete' })
    for (let n = 0; n < 6; n++) f.notify()

    const nextId = ids[1]!
    await f.publish(nextId, request({ id: nextId, action: 'normal' }))
    f.notify(); f.notify()
    await f.reported(2)
    expect(f.execute.mock.calls).toEqual([['play_loop'], ['normal']])
    expect(await f.response(nextId)).toEqual({ version: 1, id: nextId, status: 'success', reason: 'operator_control_complete' })
    expect(f.report.mock.calls).toEqual([['operator_control_complete'], ['operator_control_complete']])
    expect(await readdir(f.requests)).toEqual([])
    expect((await readdir(f.responses)).sort()).toEqual([`${id}.json`, `${nextId}.json`].sort())
  })

  it('rejects stale, expanded, mismatched and malformed requests without executing, and ignores unpublished temporary files', async () => {
    const f = await mailbox()
    await f.publish(id, request({ issuedAt: now - 45000, expiresAt: now }))
    await f.publish(ids[1]!, request({ id: ids[1], extra: true }))
    await f.publish(ids[2]!, request({ id: ids[4] }))
    await f.publish(ids[3]!, '{')
    await writeFile(join(f.requests, `${ids[4]}.json.tmp`), JSON.stringify(request({ id: ids[4] })), { mode: 0o600 })
    await f.start()
    await f.reported(4)
    expect(f.execute).not.toHaveBeenCalled()
    for (const [index, name] of ids.slice(0, 4).entries()) {
      expect(await f.response(name)).toEqual({ version: 1, id: name, status: 'failed', reason: index === 3 ? 'operator_control_failed' : 'operator_control_invalid' })
    }
    expect(f.report.mock.calls).toEqual([
      ['operator_control_invalid'], ['operator_control_invalid'], ['operator_control_invalid'], ['operator_control_failed'],
    ])
    expect(await readdir(f.requests)).toEqual([`${ids[4]}.json.tmp`])
    expect((await readdir(f.responses)).sort()).toEqual(ids.slice(0, 4).map(name => `${name}.json`).sort())
  })

  it.each(['false', 'exception'] as const)('returns only safe failure metadata when execution yields %s', async failure => {
    const f = await mailbox()
    if (failure === 'false') f.execute.mockResolvedValueOnce(false)
    else f.execute.mockRejectedValueOnce(Error('synthetic_execution_failure'))
    await f.publish(id)
    await f.start()
    await f.reported(1)
    expect(f.execute).toHaveBeenCalledExactlyOnceWith('play_loop')
    expect(await f.response(id)).toEqual({ version: 1, id, status: 'failed', reason: 'operator_control_failed' })
    expect(f.report).toHaveBeenCalledExactlyOnceWith('operator_control_failed')
    expect(await readdir(f.requests)).toEqual([])
  })
})
