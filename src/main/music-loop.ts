import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { createInterface } from 'node:readline'

const AUDIO: Record<string, string> = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.wav': 'audio/vnd.wave', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.flac': 'audio/flac', '.caf': 'audio/x-caf' }
export const MUSIC_LOOP_MAX_BYTES = 100_000_000
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

/** Single Main-owned player and background download owner; diagnostics contain no paths. */
export function createMusicLoop(input: {
  executable: string
  sharedRoot(): Promise<string | undefined>
  prepare(path: string, size: number, mtime: number, signal: AbortSignal): Promise<string>
  cached?(path: string, size: number, mtime: number): Promise<string | undefined>
  isLocal?(path: string, signal: AbortSignal): Promise<boolean>
  state?(status: 'preparing' | 'playing', pending: number, oversized: number): void
  report(reason: string, details?: Record<string, number>): void
  failed(reason: string): void
  gain?: number
}) {
  let revision = 0, child: ChildProcessWithoutNullStreams | undefined, abort: AbortController | undefined
  let settle: ((success: boolean) => void) | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let stopping: Promise<void> = Promise.resolve(), preparation: Promise<void> = Promise.resolve()
  const report = (reason: string, details?: Record<string, number>) => input.report(reason, details)
  const stop = (): Promise<void> => {
    ++revision; abort?.abort(); abort = undefined
    clearTimeout(deadline); settle?.(false); settle = undefined
    const previous = child; child = undefined
    const release = !previous?.pid || previous.exitCode !== null || previous.signalCode !== null ? stopping : new Promise<void>((resolve, reject) => {
      const force = setTimeout(() => previous.kill('SIGKILL'), 1500)
      const timeout = setTimeout(() => { cleanup(); reject(Error('operator_loop_music_stop_failed')) }, 3500)
      const cleanup = () => { clearTimeout(force); clearTimeout(timeout) }
      previous.once('exit', () => { cleanup(); resolve() })
      previous.stdin.end(); previous.kill('SIGTERM')
    })
    stopping = Promise.all([release, preparation]).then(() => undefined)
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
      type Track = { path: string; size: number; mtime: number; local?: string; status: 'pending' | 'ready' | 'failed' }
      const tracks: Track[] = []
      let oversized = 0
      try {
        const files = await musicLoopFiles(await input.sharedRoot())
        for (const path of files) {
          if (run !== revision) return false
          try {
            const stat = await lstat(path)
            if (!stat.isFile() || stat.size === 0 || await realpath(path) !== path) throw Error()
            if (stat.size > MUSIC_LOOP_MAX_BYTES) {
              oversized++; report('operator_loop_music_oversize_skipped', { bytes: stat.size, limit: MUSIC_LOOP_MAX_BYTES }); continue
            }
            const local = await input.cached?.(path, stat.size, stat.mtimeMs)
            tracks.push({ path, size: stat.size, mtime: stat.mtimeMs, local, status: local ? 'ready' : 'pending' })
          } catch { report('operator_loop_music_file_skipped') }
        }
        if (!tracks.length) throw Error(oversized === files.length ? 'operator_loop_music_all_oversize' : 'operator_loop_music_no_playable_tracks')
      } catch (error) {
        if (run !== revision) return false
        fail(error instanceof Error && /^operator_loop_music_[a-z_]+$/.test(error.message) ? error.message : 'operator_loop_music_scan_failed')
        return false
      }
      if (run !== revision) return false
      report('operator_loop_music_playlist_loaded', { tracks: tracks.length })
      const firstPlayed = new Promise<boolean>(resolve => { settle = resolve })
      // Only native route startup is bounded here. Download deadlines belong to the preparer.
      deadline = setTimeout(() => { if (run === revision) fail('operator_loop_music_start_timeout') }, 35000)
      const process = spawn(input.executable, [], { stdio: ['pipe', 'pipe', 'pipe'] }); child = process
      process.stderr.resume()
      let current: number | undefined, last: number | undefined, trackId = 0, cycles = 0
      let routeReady = false, picking = false, audible = false, lastState = ''
      const pendingCount = () => tracks.filter(t => t.status === 'pending').length
      const state = () => {
        if (run !== revision) return
        const pending = pendingCount(), status = audible ? 'playing' : 'preparing'
        const key = status + ':' + pending
        if (key !== lastState) {
          lastState = key; input.state?.(status, pending, oversized)
          report('operator_loop_music_download_status', { ready: tracks.filter(t => t.status === 'ready').length, pending })
        }
      }
      const unchanged = async (track: Track) => {
        const stat = await lstat(track.path)
        return stat.isFile() && stat.size === track.size && stat.mtimeMs === track.mtime && await realpath(track.path) === track.path
      }
      const next = async () => {
        if (picking || !routeReady || current !== undefined || run !== revision) return
        picking = true
        try {
          for (let offset = 1; offset <= tracks.length; offset++) {
            const index = ((last ?? -1) + offset) % tracks.length, track = tracks[index]!
            if (track.status !== 'ready') continue
            try {
              if (!await unchanged(track) || !track.local) throw Error()
              const cached = await lstat(track.local)
              if (!cached.isFile() || cached.size !== track.size || await realpath(track.local) !== track.local) throw Error()
              if (run !== revision) return
              if (last !== undefined && index <= last) { cycles++; report('operator_loop_music_playlist_repeated', { cycles }) }
              current = last = index
              process.stdin.write(JSON.stringify({ action: 'play', id: ++trackId, path: track.local, mime: AUDIO[extname(track.path).toLowerCase()], gain: input.gain ?? 1 }) + '\n')
              return
            } catch { track.status = 'failed'; report('operator_loop_music_file_skipped') }
          }
          if (run !== revision) return
          if (tracks.some(t => t.status === 'ready')) return // a download completed during validation
          if (!pendingCount()) fail('operator_loop_music_no_playable_tracks')
          else state()
        } finally {
          picking = false
          if (run === revision && current === undefined && tracks.some(t => t.status === 'ready')) void next()
        }
      }
      createInterface({ input: process.stdout }).on('line', line => {
        if (run !== revision) return
        try {
          if (line.length > 2048) throw Error()
          const event = JSON.parse(line)
          if (event.event === 'ready' && Number.isSafeInteger(event.outputs) && event.outputs > 0) {
            clearTimeout(deadline); routeReady = true
            report('operator_loop_music_outputs_ready', { outputs: event.outputs })
            void next()
          } else if (event.event === 'playing' && event.id === trackId && current !== undefined) {
            audible = true; settle?.(true); settle = undefined; state()
            report('operator_loop_music_playing', { tracks: tracks.length, outputs: event.outputs, track: current + 1, cycles })
          } else if (['ended', 'track_failed'].includes(event.event) && event.id === trackId && current !== undefined) {
            if (event.event === 'track_failed') { tracks[current]!.status = 'failed'; report('operator_loop_music_decode_skipped') }
            current = undefined; audible = false; void next()
          } else if (event.event === 'failed') {
            fail(typeof event.reason === 'string' && /^operator_loop_music_[a-z_]+$/.test(event.reason) ? event.reason : 'operator_loop_music_player_failed')
          }
        } catch { fail('operator_loop_music_protocol_invalid') }
      })
      process.on('error', () => { if (run === revision) fail('operator_loop_music_player_unavailable') })
      process.stdin.on('error', () => { if (run === revision) fail('operator_loop_music_player_unavailable') })
      process.on('exit', () => { if (run === revision) fail('operator_loop_music_player_exited') })
      preparation = (async () => {
        const local: Track[] = [], remote: Track[] = []
        // All cache hits are already playable. Probe source metadata without downloading.
        for (const track of tracks.filter(t => t.status === 'pending')) {
          if (run !== revision) return
          let available = false
          try { available = await input.isLocal?.(track.path, cancellation.signal) ?? false }
          catch { if (run === revision) report('operator_loop_music_availability_unknown') }
          ;(available ? local : remote).push(track)
        }
        state()
        for (const track of [...local, ...remote]) {
          if (run !== revision) return
          try {
            if (!await unchanged(track)) throw Error()
            const prepared = await input.prepare(track.path, track.size, track.mtime, cancellation.signal)
            if (run !== revision) return
            if (!await unchanged(track)) throw Error()
            track.local = prepared; track.status = 'ready'
            report('operator_loop_music_file_ready')
          } catch {
            if (run !== revision) return
            track.status = 'failed'; report('operator_loop_music_download_failed')
          }
          state(); void next()
        }
      })().catch(() => { if (run === revision) fail('operator_loop_music_prepare_failed') })
      return firstPlayed
    },
  }
}
