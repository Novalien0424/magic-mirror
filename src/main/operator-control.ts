import { watch, type FSWatcher } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type OperatorAction = 'normal' | 'play_loop' | 'show_console' | 'show_console_main' | 'studio'
export function parseOperatorRequest(value: unknown, now = Date.now()): { id: string; action: OperatorAction; expiresAt: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  return Object.keys(v).length === 5 && v.version === 1 && typeof v.id === 'string' && ID.test(v.id)
    && (v.action === 'normal' || v.action === 'play_loop' || v.action === 'show_console' || v.action === 'show_console_main' || v.action === 'studio') && typeof v.issuedAt === 'number' && Number.isFinite(v.issuedAt)
    && typeof v.expiresAt === 'number' && Number.isFinite(v.expiresAt) && v.issuedAt <= now + 1000 && now < v.expiresAt
    && v.expiresAt > v.issuedAt && v.expiresAt - v.issuedAt <= 45000
    ? { id: v.id, action: v.action, expiresAt: v.expiresAt } : null
}

/** Fixed operator commands only; local mailbox is not a shell or renderer bridge. */
export async function startOperatorControl(input: {
  directory: string
  execute(action: OperatorAction): Promise<boolean>
  report(reason: string): void
}): Promise<() => void> {
  const requests = join(input.directory, 'requests'), responses = join(input.directory, 'responses')
  await mkdir(requests, { recursive: true, mode: 0o700 }); await mkdir(responses, { recursive: true, mode: 0o700 })
  for (const directory of [input.directory, requests, responses]) {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('operator_control_directory_invalid')
  }
  let closed = false, running = false, dirty = false, watcher: FSWatcher | undefined
  const drain = async () => {
    dirty = true
    if (running || closed) return
    running = true
    try {
      do {
        dirty = false
        for (const name of (await readdir(requests)).filter(name => ID.test(name.replace(/\.json$/, '')) && name.endsWith('.json')).sort()) {
          if (closed) break
          const path = join(requests, name)
          let id = name.slice(0, -5), success = false, reason = 'operator_control_invalid'
          try {
            const info = await lstat(path)
            if (!info.isFile() || info.isSymbolicLink() || info.size > 2048) throw Error()
            const request = parseOperatorRequest(JSON.parse(await readFile(path, 'utf8')))
            if (request && request.id === id) {
              id = request.id
              // Consume once before executing; duplicated fs events cannot replay it.
              await unlink(path)
              success = await input.execute(request.action)
              reason = success ? 'operator_control_complete' : 'operator_control_failed'
            }
          } catch { reason = 'operator_control_failed' }
          await unlink(path).catch(() => undefined)
          if (closed) break
          const destination = join(responses, name), temporary = destination + '.tmp'
          await writeFile(temporary, JSON.stringify({ version: 1, id, status: success ? 'success' : 'failed', reason }), { mode: 0o600 })
          await rename(temporary, destination)
          input.report(reason)
        }
        // Bound orphan responses after interrupted clients, without logging payloads.
        for (const name of (await readdir(responses)).filter(name => name.endsWith('.json') && ID.test(name.slice(0, -5)))) {
          const path = join(responses, name), info = await lstat(path).catch(() => null)
          if (info && Date.now() - info.mtimeMs > 120000) await unlink(path).catch(() => undefined)
        }
      } while (dirty && !closed)
    } catch { input.report('operator_control_io_failed') }
    finally { running = false }
  }
  watcher = watch(requests, () => { void drain() })
  watcher.on('error', () => input.report('operator_control_watch_failed'))
  void drain()
  return () => { closed = true; watcher?.close() }
}
