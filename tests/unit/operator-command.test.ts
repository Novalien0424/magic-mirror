import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Plain JavaScript shared with the deployed CLI.
import { OPERATOR_ACTIONS, createOperatorIo, createOperatorRequest, parseOperatorRequest, parseOperatorResponse, sendOperatorCommand } from '../../scripts/operator-command.mjs'

const id = 'cb108b79-5dfe-4b6d-9802-272f41d300ff'
const otherId = '8d55bcc1-eb91-4d1b-aabb-3e6cce83e2ed'
const issuedAt = 100000
const request = (extra = {}) => ({ version: 1, id, action: 'play_loop', issuedAt, expiresAt: issuedAt + 45000, ...extra })
const response = (extra = {}) => JSON.stringify({ version: 1, id, status: 'success', reason: 'loop_playing', ...extra })
function mailbox() {
  let time = issuedAt, monotonic = 0
  return {
    now: () => time, monotonicNow: () => monotonic, uuid: () => id,
    advance: (ms: number) => { time += ms; monotonic += ms },
    jumpWall: (ms: number) => { time += ms },
    wait: vi.fn(async (ms: number) => { time += ms; monotonic += ms }),
    prepare: vi.fn(async () => {}), publish: vi.fn(async (_request: unknown) => {}),
    readResponse: vi.fn(async (_id: string): Promise<string | null> => null), cleanup: vi.fn(async (_id: string) => {}),
  }
}

describe('operator mailbox payload validation', () => {
  it('accepts exactly Main\'s operator action set', () => {
    const main = readFileSync(new URL('../../src/main/operator-control.ts', import.meta.url), 'utf8').match(/^export type OperatorAction = (.+)$/m)?.[1]
    expect([...main?.matchAll(/'([a-z_]+)'/g) ?? []].map(([, action]) => action)).toEqual(OPERATOR_ACTIONS)
    expect(OPERATOR_ACTIONS).toEqual(['normal', 'play_loop', 'show_console', 'show_console_main', 'studio'])
    expect(Object.isFrozen(OPERATOR_ACTIONS)).toBe(true)
  })
  it.each(['normal', 'play_loop', 'show_console', 'show_console_main', 'studio'])('creates exactly the approved %s payload', action => {
    expect(createOperatorRequest(action, id, issuedAt)).toEqual(request({ action }))
    expect(parseOperatorRequest(JSON.stringify(request({ action })), issuedAt)).toEqual(request({ action }))
  })
  it.each([
    { action: 'stop' }, { action: 'console' }, { action: 'remote_console' }, { action: 'Studio' }, { action: 'portrait_studio' }, { action: '/private/media.mp4' }, { version: 2 }, { id: '../escape' },
    { issuedAt: -1 }, { issuedAt: issuedAt + 1 }, { expiresAt: issuedAt + 45001 },
    { expiresAt: issuedAt + 44999 }, { mediaPath: '/private/media.mp4' }, { id: null },
  ])('rejects malformed payload %j', extra => {
    expect(parseOperatorRequest(JSON.stringify(request(extra)), issuedAt)).toBeNull()
  })
  it('rejects partial data and expires at the exact 45-second boundary', () => {
    expect(parseOperatorRequest('{', issuedAt)).toBeNull()
    expect(parseOperatorRequest('null', issuedAt)).toBeNull()
    expect(parseOperatorRequest(JSON.stringify(request()), issuedAt + 44999)).not.toBeNull()
    expect(parseOperatorRequest(JSON.stringify(request()), issuedAt + 45000)).toBeNull()
    expect(() => createOperatorRequest('normal', '../escape', issuedAt)).toThrow('operator_request_invalid')
    expect(() => createOperatorRequest('shutdown', id, issuedAt)).toThrow('operator_request_invalid')
  })
  it.each([
    { id: otherId }, { version: 2 }, { status: 'ok' }, { reason: 'private raw text' },
    { reason: 'private/path' }, { reason: 'unsafe_' }, { reason: '' }, { mediaPath: '/private/file' },
  ])('rejects mismatched or unsafe responses %j', extra => {
    expect(parseOperatorResponse(response(extra), id)).toBeNull()
  })
  it('returns only validated acknowledgement metadata', () => {
    expect(parseOperatorResponse(response(), id)).toEqual({ status: 'success', reason: 'loop_playing' })
    expect(parseOperatorResponse(response({ status: 'failed', reason: 'playback_failed' }), id)).toEqual({ status: 'failed', reason: 'playback_failed' })
    expect(parseOperatorResponse('{', id)).toBeNull()
  })
})

describe('operator mailbox lifecycle', () => {
  it.each([['play_loop', 'loop_playing'], ['show_console', 'console_shown'], ['studio', 'studio_ready']])('publishes %s once, polls at 100 ms, and cleans up its own request and response', async (action, reason) => {
    const io = mailbox(); io.readResponse.mockResolvedValueOnce(null).mockResolvedValueOnce(response({ reason }))
    expect(await sendOperatorCommand(action, io)).toEqual({ status: 'success', reason })
    expect(io.publish).toHaveBeenCalledExactlyOnceWith(request({ action }))
    expect(io.wait.mock.calls).toEqual([[100]])
    expect(io.cleanup).toHaveBeenCalledExactlyOnceWith(id)
  })
  it.each([['play_loop', 'loop_playing', 'loop_already_playing'], ['show_console', 'console_shown', 'console_shown']])('requires a fresh acknowledgement for repeated %s requests', async (action, reason, repeatedReason) => {
    const io = mailbox(); io.readResponse.mockResolvedValue(response({ reason }))
    expect((await sendOperatorCommand(action, io)).status).toBe('success')
    io.readResponse.mockResolvedValue(response({ id: otherId, reason: repeatedReason }))
    io.uuid = () => otherId
    expect((await sendOperatorCommand(action, io)).status).toBe('success')
    expect(io.publish.mock.calls.map(([value]) => (value as { id: string }).id)).toEqual([id, otherId])
    expect(io.cleanup.mock.calls).toEqual([[id], [otherId]])
  })
  it.each(['normal', 'show_console'])('bounds missing %s acknowledgements to 45 seconds and removes its files', async action => {
    const io = mailbox()
    expect(await sendOperatorCommand(action, io)).toEqual({ status: 'failed', reason: 'operator_command_timeout' })
    expect(io.now()).toBe(issuedAt + 45000)
    expect(io.wait).toHaveBeenCalledTimes(450)
    expect(io.wait.mock.calls.every(([ms]) => ms === 100)).toBe(true)
    expect(io.publish).toHaveBeenCalledTimes(1)
    expect(io.cleanup).toHaveBeenCalledExactlyOnceWith(id)
  })
  it('does not publish a request that expired during preparation', async () => {
    const io = mailbox(); io.prepare.mockImplementation(async () => { io.advance(45000) })
    expect((await sendOperatorCommand('normal', io)).reason).toBe('operator_command_timeout')
    expect(io.publish).not.toHaveBeenCalled()
    expect(io.cleanup).toHaveBeenCalledWith(id)
  })
  it.each(['play_loop', 'show_console'])('rejects a %s success read at the expiry boundary', async action => {
    const io = mailbox(); io.readResponse.mockImplementation(async () => { io.advance(45000); return response() })
    expect((await sendOperatorCommand(action, io)).reason).toBe('operator_command_timeout')
    expect(io.cleanup).toHaveBeenCalledWith(id)
  })
  it('keeps the monotonic timeout when the wall clock moves backwards', async () => {
    const io = mailbox(); io.prepare.mockImplementation(async () => { io.jumpWall(-60000) })
    expect((await sendOperatorCommand('normal', io)).reason).toBe('operator_command_timeout')
    expect(io.monotonicNow()).toBe(45000)
  })
  it.each([response({ id: otherId }), response({ reason: 'private raw message' }), '{'])('fails closed on invalid response %s', async value => {
    const io = mailbox(); io.readResponse.mockResolvedValueOnce(value)
    expect(await sendOperatorCommand('play_loop', io)).toEqual({ status: 'failed', reason: 'operator_response_invalid' })
    expect(io.cleanup).toHaveBeenCalledWith(id)
  })
  it('preserves a safe Main failure without retrying the command', async () => {
    const io = mailbox(); io.readResponse.mockResolvedValueOnce(response({ status: 'failed', reason: 'playback_failed' }))
    expect(await sendOperatorCommand('play_loop', io)).toEqual({ status: 'failed', reason: 'playback_failed' })
    expect(io.publish).toHaveBeenCalledTimes(1)
    expect(io.cleanup).toHaveBeenCalledWith(id)
  })
  it('rejects a Console response for another request and cleans up only its own files', async () => {
    const io = mailbox(); io.readResponse.mockResolvedValueOnce(response({ id: otherId, reason: 'console_shown' }))
    expect(await sendOperatorCommand('show_console', io)).toEqual({ status: 'failed', reason: 'operator_response_invalid' })
    expect(io.publish).toHaveBeenCalledExactlyOnceWith(request({ action: 'show_console' }))
    expect(io.cleanup).toHaveBeenCalledExactlyOnceWith(id)
  })
  it('preserves a safe Console failure without retrying or retaining raw errors', async () => {
    const io = mailbox(); io.readResponse.mockResolvedValueOnce(response({ status: 'failed', reason: 'console_unavailable' }))
    expect(await sendOperatorCommand('show_console', io)).toEqual({ status: 'failed', reason: 'console_unavailable' })
    expect(io.publish).toHaveBeenCalledTimes(1)
    expect(io.cleanup).toHaveBeenCalledExactlyOnceWith(id)
  })
  it('cleans up after publication fails and never returns raw errors', async () => {
    const io = mailbox(); io.publish.mockRejectedValueOnce(Error('private filesystem details'))
    expect(await sendOperatorCommand('normal', io)).toEqual({ status: 'failed', reason: 'operator_command_failed' })
    expect(io.cleanup).toHaveBeenCalledWith(id)
  })
  it.each(['play_loop', 'show_console'])('reports cleanup failure even after successful %s acknowledgement', async action => {
    const io = mailbox(); io.readResponse.mockResolvedValueOnce(response()); io.cleanup.mockRejectedValueOnce(Error('private filesystem details'))
    expect(await sendOperatorCommand(action, io)).toEqual({ status: 'failed', reason: 'operator_cleanup_failed' })
  })
})

describe('fixed private operator mailbox filesystem', () => {
  const root = join(homedir(), 'Library/Application Support/magic-mirror/operator-control')
  function filesystem() {
    return {
      mkdir: vi.fn(async () => {}), chmod: vi.fn(async () => {}),
      lstat: vi.fn(async (): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }> => ({ isDirectory: () => true, isSymbolicLink: () => false })),
      writeFile: vi.fn(async () => {}), rename: vi.fn(async () => {}), rm: vi.fn(async () => {}),
      open: vi.fn(async () => ({ stat: async () => ({ isFile: () => true, size: 100 }),
        chmod: vi.fn(async () => {}), readFile: vi.fn(async () => response()), close: vi.fn(async () => {}),
      })),
    }
  }
  it('enforces private directories and atomically renames a 0600 UUID request', async () => {
    const fs = filesystem(), io = createOperatorIo(fs)
    await io.prepare()
    expect(fs.mkdir.mock.calls).toEqual([root, join(root, 'requests'), join(root, 'responses')].map(path => [path, { recursive: true, mode: 0o700 }]))
    expect(fs.chmod.mock.calls).toEqual([root, join(root, 'requests'), join(root, 'responses')].map(path => [path, 0o700]))
    const value = createOperatorRequest('normal', id, Date.now())
    await io.publish(value)
    const temporary = join(root, 'requests', `${id}.json.tmp`), published = join(root, 'requests', `${id}.json`)
    expect(fs.writeFile).toHaveBeenCalledWith(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    expect(fs.chmod).toHaveBeenCalledWith(temporary, 0o600)
    expect(fs.rename).toHaveBeenCalledWith(temporary, published)
    expect(fs.writeFile.mock.invocationCallOrder[0]).toBeLessThan(fs.rename.mock.invocationCallOrder[0]!)
    await io.cleanup(id)
    expect(fs.rm.mock.calls).toEqual([published, temporary, join(root, 'responses', `${id}.json`)].map(path => [path, { force: true }]))
  })
  it('rejects a symlink mailbox before publishing', async () => {
    const fs = filesystem(); fs.lstat.mockResolvedValueOnce({ isDirectory: () => false, isSymbolicLink: () => true })
    await expect(createOperatorIo(fs).prepare()).rejects.toThrow('operator_directory_invalid')
    expect(fs.chmod).not.toHaveBeenCalled()
    expect(fs.writeFile).not.toHaveBeenCalled()
  })
  it('reads only a bounded regular response file and closes it', async () => {
    const fs = filesystem(), io = createOperatorIo(fs)
    expect(await io.readResponse(id)).toBe(response())
    const handle = await fs.open.mock.results[0]!.value
    expect(handle.chmod).toHaveBeenCalledWith(0o600)
    expect(handle.close).toHaveBeenCalledTimes(1)
    await expect(io.readResponse('../escape')).rejects.toThrow('operator_request_invalid')
    expect(fs.open).toHaveBeenCalledTimes(1)
  })
  it('attempts all owned removals if one cleanup fails', async () => {
    const fs = filesystem(); fs.rm.mockRejectedValueOnce(Error('private filesystem details'))
    await expect(createOperatorIo(fs).cleanup(id)).rejects.toThrow('operator_cleanup_failed')
    expect(fs.rm).toHaveBeenCalledTimes(3)
  })
})
