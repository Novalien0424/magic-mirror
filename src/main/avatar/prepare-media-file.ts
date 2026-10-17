import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, realpath, rename, rm, utimes } from 'node:fs/promises'
import { join } from 'node:path'

type Status = 'media_file_preparing' | 'media_file_prepared' | 'media_file_prepare_failed'
  | 'media_file_cache_pruned' | 'media_file_cache_cleanup_failed'
const CACHE_BUDGET = 2 * 1024 ** 3
const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000
/** Seconds for one download-and-copy: about 1 MiB/s sustained, at least 9 s, at most 10 minutes. */
export const prepareDeadlineSeconds = (size: number): number => Math.min(600, Math.max(9, Math.ceil(size / 2 ** 20)))

/** Keep playback outside File Provider. Drive remains the versioned source. */
export function createMacMediaFilePreparer(executable: string, directory: string,
  onStatus?: (reason: Status) => void,
): (path: string, size: number, mtime: number) => Promise<string> {
  const report = (reason: Status) => { try { onStatus?.(reason) } catch { /* diagnostics only */ } }
  const pending = new Map<string, Promise<string>>()
  let initialized: Promise<string> | undefined
  const initialize = async (): Promise<string> => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (!(await lstat(directory)).isDirectory()) throw Error('media_file_prepare_failed')
    const root = await realpath(directory)
    // Prune only at startup, before this process has any active playback files.
    // The current run's working set may exceed this soft budget; never evict it.
    try {
      const files: { path: string; size: number; used: number }[] = []
      let removed = false
      for (const name of await readdir(root)) {
        const path = join(root, name)
        if (/^[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/.test(name)) {
          await rm(path, { force: true }); removed = true
        } else if (/^[a-f0-9]{64}\.media$/.test(name)) {
          const info = await lstat(path)
          if (info.isFile()) files.push({ path, size: info.size, used: info.mtimeMs })
        }
      }
      let bytes = 0
      for (const file of files.sort((a, b) => b.used - a.used)) {
        bytes += file.size
        if (bytes > CACHE_BUDGET || Date.now() - file.used > CACHE_MAX_AGE) {
          await rm(file.path, { force: true }); removed = true
        }
      }
      if (removed) report('media_file_cache_pruned')
    } catch { report('media_file_cache_cleanup_failed') }
    return root
  }
  const complete = async (path: string, size: number) => {
    try { const info = await lstat(path); return info.isFile() && info.size === size && await realpath(path) === path }
    catch { return false }
  }
  return async (path, size, mtime) => {
    try {
      const root = await (initialized ??= initialize().catch(error => { initialized = undefined; throw error }))
      const key = createHash('sha256').update(`${path}\0${size}\0${mtime}`).digest('hex')
      const target = join(root, `${key}.media`)
      if (await complete(target, size)) {
        const now = new Date()
        try { await utimes(target, now, now) } catch { /* cache age only */ }
        return target
      }
      const existing = pending.get(key)
      if (existing) return await existing
      const operation = (async () => {
        const staging = join(root, `${key}.${randomUUID()}.tmp`)
        report('media_file_preparing')
        try {
          const deadline = prepareDeadlineSeconds(size)
          await new Promise<void>((resolve, reject) => {
            execFile(executable, [path, String(size), staging, String(deadline)],
              { timeout: (deadline + 1) * 1000, killSignal: 'SIGKILL', maxBuffer: 1024, encoding: 'utf8' }, (error, stdout) => {
                if (error || stdout.trim() !== `media_file_prepared bytes=${size}`) reject(Error('media_file_prepare_failed'))
                else resolve()
              })
          })
          if (!await complete(staging, size)) throw Error('media_file_prepare_failed')
          await rename(staging, target)
          report('media_file_prepared')
          return target
        } finally { await rm(staging, { force: true }) }
      })()
      pending.set(key, operation)
      try { return await operation } finally { if (pending.get(key) === operation) pending.delete(key) }
    } catch { report('media_file_prepare_failed'); throw Error('media_file_prepare_failed') }
  }
}
