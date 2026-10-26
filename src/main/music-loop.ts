import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { createInterface } from 'node:readline'

const AUDIO: Record<string, string> = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.wav': 'audio/vnd.wave', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac', '.caf': 'audio/x-caf' }
export async function musicLoopFiles(shared: string | undefined): Promise<string[]> {
  if (!shared) throw Error('operator_loop_music_shared_missing')
  const root = join(shared, 'MusicLoop'), files: string[] = []
  try {
    if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw Error()
  } catch { throw Error('operator_loop_music_folder_missing') }
  let visited = 0
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 16) throw Error('operator_loop_music_folder_limit')
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))) {
      if (++visited > 10000) throw Error('operator_loop_music_folder_limit')
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const path = join(directory, entry.name)
      if (await realpath(path) !== path) continue
      if (entry.isDirectory()) await walk(path, depth + 1)
      else if (entry.isFile() && AUDIO[extname(entry.name).toLowerCase()]) files.push(path)
    }
  }
  await walk(root, 0)
  if (!files.length) throw Error('operator_loop_music_empty')
  return files
}

/** Single Main-owned native player; paths and source labels never enter diagnostics. */
export function createMusicLoop(input: {
  executable: string
  sharedRoot(): Promise<string | undefined>
  prepare(path: string, size: number, mtime: number, signal: AbortSignal): Promise<string>
  report(reason: string, details?: Record<string, number>): void
  failed(reason: string): void
  gain?: number
}) {
  let revision = 0, child: ChildProcessWithoutNullStreams | undefined, abort: AbortController | undefined
  let settle: ((success: boolean) => void) | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let stopping: Promise<void> = Promise.resolve()
  const report = (reason: string, details?: Record<string, number>) => input.report(reason, details)
  const stop = (): Promise<void> => {
    ++revision; abort?.abort(); abort = undefined
    clearTimeout(deadline); settle?.(false); settle = undefined
    const previous = child; child = undefined
    if (!previous?.pid || previous.exitCode !== null || previous.signalCode !== null) return stopping
    stopping = new Promise<void>((resolve, reject) => {
      const force = setTimeout(() => previous.kill('SIGKILL'), 1500)
      const timeout = setTimeout(() => { cleanup(); reject(Error('operator_loop_music_stop_failed')) }, 3500)
      const cleanup = () => { clearTimeout(force); clearTimeout(timeout) }
      previous.once('exit', () => { cleanup(); resolve() })
      previous.stdin.end(); previous.kill('SIGTERM')
    })
    return stopping
  }
  const fail = (reason: string) => {
    report(reason); input.failed(reason)
    void stop().catch(() => report('operator_loop_music_stop_failed'))
  }
  return {
    stop,
    async start(): Promise<boolean> {
      await stop()
      const run = revision, cancellation = new AbortController(); abort = cancellation
      let files: string[]
      try { files = await musicLoopFiles(await input.sharedRoot()) }
      catch (error) {
        if (run !== revision) return false
        fail(error instanceof Error && /^operator_loop_music_[a-z_]+$/.test(error.message) ? error.message : 'operator_loop_music_scan_failed')
        return false
      }
      if (run !== revision) return false
      report('operator_loop_music_playlist_loaded', { tracks: files.length })
      const firstPlayed = new Promise<boolean>(resolve => { settle = resolve })
      deadline = setTimeout(() => { if (run === revision) fail('operator_loop_music_start_timeout') }, 35000)
      const process = spawn(input.executable, [], { stdio: ['pipe', 'pipe', 'pipe'] }); child = process
      // The worker emits only fixed metadata. Discard native framework diagnostics.
      process.stderr.resume()
      let index = 0, trackId = 0, bad = 0, cycles = 0, advancing = false, started = false
      const next = async () => {
        if (advancing || run !== revision) return
        advancing = true
        try {
          while (run === revision) {
            const path = files[index]!
            index = (index + 1) % files.length
            try {
              if (await realpath(path) !== path) throw Error()
              const stat = await lstat(path)
              if (!stat.isFile() || stat.size === 0) throw Error()
              const local = await input.prepare(path, stat.size, stat.mtimeMs, cancellation.signal)
              if (run !== revision) return
              const after = await lstat(path)
              if (await realpath(path) !== path || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error()
              process.stdin.write(JSON.stringify({ action: 'play', id: ++trackId, path: local, mime: AUDIO[extname(path).toLowerCase()], gain: input.gain ?? 1 }) + '\n')
              return
            } catch {
              if (run !== revision) return
              report('operator_loop_music_file_skipped')
              if (++bad >= files.length) { fail('operator_loop_music_no_playable_tracks'); return }
            }
          }
        } finally { advancing = false }
      }
      createInterface({ input: process.stdout }).on('line', line => {
        if (run !== revision) return
        try {
          if (line.length > 2048) throw Error()
          const event = JSON.parse(line)
          if (event.event === 'ready' && Number.isSafeInteger(event.outputs) && event.outputs > 0) {
            report('operator_loop_music_outputs_ready', { outputs: event.outputs })
            if (!started) { started = true; void next() }
          } else if (event.event === 'playing' && event.id === trackId) {
            bad = 0; clearTimeout(deadline); settle?.(true); settle = undefined
            report('operator_loop_music_playing', { tracks: files.length, outputs: event.outputs, track: index || files.length, cycles })
          } else if (['ended', 'track_failed'].includes(event.event) && event.id === trackId) {
            if (event.event === 'track_failed') {
              report('operator_loop_music_decode_skipped')
              if (++bad >= files.length) { fail('operator_loop_music_no_playable_tracks'); return }
            } else if (index === 0) { cycles++; report('operator_loop_music_playlist_repeated', { cycles }) }
            void next()
          } else if (event.event === 'failed') {
            fail(typeof event.reason === 'string' && /^operator_loop_music_[a-z_]+$/.test(event.reason) ? event.reason : 'operator_loop_music_player_failed')
          }
        } catch { fail('operator_loop_music_protocol_invalid') }
      })
      process.on('error', () => { if (run === revision) fail('operator_loop_music_player_unavailable') })
      process.stdin.on('error', () => { if (run === revision) fail('operator_loop_music_player_unavailable') })
      process.on('exit', () => { if (run === revision) fail('operator_loop_music_player_exited') })
      return firstPlayed
    },
  }
}
