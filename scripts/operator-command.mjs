import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import * as filesystem from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const OPERATOR_COMMAND_TTL_MS = 45000
export const OPERATOR_COMMAND_POLL_MS = 100
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Must equal Main's OperatorAction set in src/main/operator-control.ts.
export const OPERATOR_ACTIONS = Object.freeze(['normal', 'play_loop', 'show_console', 'show_console_main', 'studio', 'desktop', 'music_loop'])
const failed = reason => ({ status: 'failed', reason })
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

export const safeOperatorReason = value => typeof value === 'string'
  && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value)

/** Commands contain no media paths, profile data, or application configuration. */
export function parseOperatorRequest(text, now = Date.now()) {
  try {
    const value = JSON.parse(text)
    return exactKeys(value, ['version', 'id', 'action', 'issuedAt', 'expiresAt'])
      && value.version === 1 && typeof value.id === 'string' && uuid.test(value.id) && OPERATOR_ACTIONS.includes(value.action)
      && Number.isSafeInteger(value.issuedAt) && value.issuedAt >= 0 && Number.isSafeInteger(value.expiresAt)
      && value.expiresAt === value.issuedAt + OPERATOR_COMMAND_TTL_MS
      && Number.isSafeInteger(now) && value.issuedAt <= now && now < value.expiresAt ? value : null
  } catch { return null }
}

export function createOperatorRequest(action, id = randomUUID(), issuedAt = Date.now()) {
  const value = { version: 1, id, action, issuedAt, expiresAt: issuedAt + OPERATOR_COMMAND_TTL_MS }
  if (!parseOperatorRequest(JSON.stringify(value), issuedAt)) throw Error('operator_request_invalid')
  return value
}

export function parseOperatorResponse(text, id) {
  try {
    const value = JSON.parse(text)
    return uuid.test(id) && exactKeys(value, ['version', 'id', 'status', 'reason'])
      && value.version === 1 && value.id === id && ['success', 'failed'].includes(value.status)
      && safeOperatorReason(value.reason) ? { status: value.status, reason: value.reason } : null
  } catch { return null }
}

/** Fixed production mailbox. Only the filesystem adapter is injectable for tests. */
export function createOperatorIo(fs = filesystem) {
  const root = join(homedir(), 'Library/Application Support/magic-mirror/operator-control')
  const requests = join(root, 'requests'), responses = join(root, 'responses')
  const paths = id => {
    if (typeof id !== 'string' || !uuid.test(id)) throw Error('operator_request_invalid')
    return { request: join(requests, `${id}.json`), temporary: join(requests, `${id}.json.tmp`), response: join(responses, `${id}.json`) }
  }
  return {
    now: () => Date.now(), monotonicNow: () => performance.now(), uuid: () => randomUUID(),
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    prepare: async () => {
      for (const path of [root, requests, responses]) {
        await fs.mkdir(path, { recursive: true, mode: 0o700 })
        const stat = await fs.lstat(path)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('operator_directory_invalid')
        await fs.chmod(path, 0o700)
      }
    },
    publish: async request => {
      if (!parseOperatorRequest(JSON.stringify(request))) throw Error('operator_request_invalid')
      const path = paths(request.id)
      await fs.writeFile(path.temporary, JSON.stringify(request), { flag: 'wx', mode: 0o600 })
      await fs.chmod(path.temporary, 0o600)
      await fs.rename(path.temporary, path.request)
    },
    readResponse: async id => {
      let handle
      try {
        handle = await fs.open(paths(id).response, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > 4096) throw Error('operator_response_invalid')
        await handle.chmod(0o600)
        return await handle.readFile('utf8')
      } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
      } finally { await handle?.close() }
    },
    cleanup: async id => {
      const path = paths(id)
      // Attempt every owned removal even if one fails. Never sweep other requests.
      const results = await Promise.allSettled([path.request, path.temporary, path.response].map(file => fs.rm(file, { force: true })))
      if (results.some(result => result.status === 'rejected')) throw Error('operator_cleanup_failed')
    },
  }
}

/** An acknowledgement is required; queue publication alone never means success. */
export async function sendOperatorCommand(action, io = createOperatorIo()) {
  const request = createOperatorRequest(action, io.uuid(), io.now())
  const deadline = io.monotonicNow() + OPERATOR_COMMAND_TTL_MS
  const expired = () => io.now() >= request.expiresAt || io.monotonicNow() >= deadline || io.cancelled?.() === true
  let result = failed('operator_command_timeout')
  try {
    await io.prepare()
    if (!expired()) {
      await io.publish(request)
      for (let poll = 0; poll < OPERATOR_COMMAND_TTL_MS / OPERATOR_COMMAND_POLL_MS && !expired(); poll++) {
        const text = await io.readResponse(request.id)
        if (expired()) break
        if (text !== null) {
          result = parseOperatorResponse(text, request.id) ?? failed('operator_response_invalid')
          break
        }
        await io.wait(Math.min(OPERATOR_COMMAND_POLL_MS, deadline - io.monotonicNow(), request.expiresAt - io.now()))
      }
    }
    if (io.cancelled?.() === true) result = failed('operator_command_cancelled')
  } catch { result = failed('operator_command_failed') }
  finally {
    try { await io.cleanup(request.id) } catch { result = failed('operator_cleanup_failed') }
  }
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') throw Error('operator_command_macos_only')
  if (process.argv.length !== 3 || !OPERATOR_ACTIONS.includes(process.argv[2])) throw Error('operator_request_invalid')
  const result = await sendOperatorCommand(process.argv[2])
  process.stdout.write(JSON.stringify(result) + '\n')
  if (result.status !== 'success') process.exitCode = 1
}
