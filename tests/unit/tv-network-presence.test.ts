import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { probeTvEthernet } from '../../src/main/tv-presence'

const network = vi.hoisted(() => ({ connect: vi.fn(), ping: vi.fn() }))
vi.mock('node:net', async importOriginal => ({
  ...await importOriginal<typeof import('node:net')>(), createConnection: network.connect,
}))
vi.mock('node:child_process', () => ({ execFile: network.ping }))
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

function fixture(pingError: unknown = null) {
  vi.useFakeTimers()
  const socket = Object.assign(new EventEmitter(), { destroy: vi.fn() })
  network.connect.mockReturnValue(socket)
  network.ping.mockImplementation((_file, _args, _options, callback) => callback(pingError))
  const abort = new AbortController()
  return { socket, abort, result: probeTvEthernet('192.168.77.2', abort.signal) }
}

it.each(['connect', 'ECONNREFUSED'])('treats %s as an Ethernet response even without an ADB session', async event => {
  const f = fixture()
  if (event === 'connect') f.socket.emit('connect')
  else f.socket.emit('error', { code: event })
  expect(await f.result).toBe('present')
  expect(network.ping).not.toHaveBeenCalled()
  expect(f.socket.destroy).toHaveBeenCalledOnce()
})
it('keeps a host present if its ADB port times out but ICMP responds', async () => {
  const f = fixture()
  await vi.advanceTimersByTimeAsync(800)
  expect(await f.result).toBe('present')
  expect(network.ping).toHaveBeenCalledOnce()
})
it.each(['EHOSTDOWN', 'ENETDOWN', 'ETIMEDOUT'])('marks %s absent only after ICMP also fails', async code => {
  const f = fixture({ code: 2 })
  f.socket.emit('error', { code })
  expect(await f.result).toBe('absent')
})
it('does not turn a permission error into an absent TV', async () => {
  const f = fixture()
  f.socket.emit('error', { code: 'EACCES' })
  expect(await f.result).toBe('unknown')
  expect(network.ping).not.toHaveBeenCalled()
})
it('aborts without a ping subprocess or absence verdict', async () => {
  const f = fixture()
  f.abort.abort()
  expect(await f.result).toBe('unknown')
  expect(network.ping).not.toHaveBeenCalled()
})
