import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { lstat, mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createMusicLoop, musicLoopFiles, MUSIC_LOOP_MAX_BYTES } from './music-loop'
import { analyseBeats, type RhythmFeature } from './dance-beats'
import { DEFAULT_DANCE, parseDanceSettings, type DanceAnalysis, type DanceFrame, type DanceSettings, type DanceView } from '../shared/dance-floor'
const atomic = require('write-file-atomic') as { sync(path: string, value: string, options: { mode: number }): void }
export const danceTrackId = (path: string) => createHash('sha1').update(path).digest('hex')

export async function decodeRhythm(executable: string, path: string, mime: string, signal: AbortSignal): Promise<RhythmFeature[]> {
  if (signal.aborted) throw Error('dance_cancelled')
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [path, mime], { stdio: ['ignore', 'pipe', 'ignore'] })
    const frames: RhythmFeature[] = []; let complete = false, failure = '', force: ReturnType<typeof setTimeout> | undefined
    const abort = () => { failure = 'dance_cancelled'; child.kill('SIGTERM'); force ??= setTimeout(() => child.kill('SIGKILL'), 1000) }
    const timeout = setTimeout(() => { abort(); failure = 'dance_analysis_timeout' }, 180000)
    signal.addEventListener('abort', abort, { once: true })
    const cleanup = () => { clearTimeout(timeout); clearTimeout(force); signal.removeEventListener('abort', abort) }
    child.on('error', () => { cleanup(); reject(Error('dance_analysis_unavailable')) })
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        if (line.length > 200000) throw Error()
        const e = JSON.parse(line)
        if (e.event === 'complete') complete = true
        else if (e.event === 'features' && Array.isArray(e.frames) && e.frames.length <= 500) {
          for (const f of e.frames) {
            if (!Array.isArray(f) || f.length !== 5 || f.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)
              || f[0] > 21600 || frames.length && f[0] <= frames[frames.length - 1]![0] || frames.length >= 2_200_000) throw Error()
            frames.push(f as RhythmFeature)
          }
        } else throw Error()
      } catch { abort(); failure = 'dance_analysis_invalid' }
    })
    child.on('exit', code => { cleanup(); if (!failure && complete && code === 0) resolve(frames); else reject(Error(failure || 'dance_analysis_decode_failed')) })
  })
}

export function createDanceFloor(input: {
  directory: string; executable: string; analyser: string
  sharedRoot(): Promise<string | undefined>
  prepare(path: string, size: number, mtime: number, signal: AbortSignal): Promise<string>
  cached?(path: string, size: number, mtime: number): Promise<string | undefined>
  isLocal?(path: string, signal: AbortSignal): Promise<boolean>
  publish(frame: DanceFrame): void; report(reason: string, details?: Record<string, number>): void
  failed(reason: string): void
  welcome?(generation: number, signal: AbortSignal): Promise<void>
  qa?: boolean
}) {
  const settingsPath = join(input.directory, 'dance-floor.json')
  let settings = { ...DEFAULT_DANCE }
  try { settings = parseDanceSettings(JSON.parse(readFileSync(settingsPath, 'utf8'))) ?? settings }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') input.report('dance_settings_unreadable') }
  let tracks: DanceView['tracks'] = [], generation = 0, chosen = '', first = true
  let analysis: DanceAnalysis | undefined
  let outputs: DanceView['outputs'] = { count: 0, controlled: 0, verified: false }
  let frame: DanceFrame = { generation, trackId: 0, positionMs: 0, sentAt: Date.now(), rate: 0, beats: [], energy: 0,
    settings, status: 'idle', reason: 'dance_idle' }
  const publish = (patch: Partial<DanceFrame>) => {
    frame = { ...frame, ...patch, settings: { ...settings }, generation }; input.publish(structuredClone(frame))
  }
  const empty = (): DanceAnalysis => ({ version: 1, durationMs: 0, beats: [], energy: [], energyStepMs: 100 })
  async function analyse(path: string, mime: string, signal: AbortSignal): Promise<DanceAnalysis> {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path, { signal })) hash.update(chunk)
    const directory = join(input.directory, 'dance-analysis-v1'); await mkdir(directory, { recursive: true, mode: 0o700 })
    const file = join(directory, hash.digest('hex') + '.json')
    try {
      if ((await lstat(file)).size > 20_000_000) throw Error()
      const cached = JSON.parse(await readFile(file, 'utf8')) as DanceAnalysis
      if (cached.version === 1 && cached.durationMs > 0 && cached.durationMs <= 21_600_000 && cached.energyStepMs > 0
        && Array.isArray(cached.beats) && cached.beats.length < 100000 && cached.beats.every((b, i, a) => b.timeMs >= 0 && (!i || b.timeMs > a[i-1]!.timeMs)
          && b.periodMs >= 200 && b.periodMs <= 1500 && b.strength >= 0 && b.strength <= 1 && b.confidence >= 0 && b.confidence <= 1 && Number.isSafeInteger(b.index))
        && Array.isArray(cached.energy) && cached.energy.length < 220000 && cached.energy.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return cached
    } catch { /* Content-addressed derived metadata may be rebuilt. */ }
    const features = await decodeRhythm(input.analyser, path, mime, signal)
    if (signal.aborted) throw Error('dance_cancelled')
    const result = analyseBeats(features)
    if (signal.aborted) throw Error('dance_cancelled')
    const temporary = file + '.tmp'
    await writeFile(temporary, JSON.stringify(result), { mode: 0o600 }); await rename(temporary, file)
    input.report('dance_analysis_ready', { beats: result.beats.length, durationMs: Math.round(result.durationMs) })
    return result
  }
  const player = createMusicLoop({ ...input, folder: 'DanceFloor', gain: input.qa ? 0.01 : 1,
    select: path => danceTrackId(path) === chosen,
    danceVolume: () => input.qa ? 0.01 : settings.volume,
    report: (reason, details) => input.report(reason.replace('operator_loop_music_', 'dance_music_'), details),
    state: status => { if (status === 'preparing' && frame.status !== 'welcome') publish({ status: 'preparing', reason: 'dance_preparing', rate: 0 }) },
    failed: () => { publish({ status: 'failed', reason: 'dance_playback_failed', rate: 0 }); input.failed('operator_loop_dance_failed') },
    beforePlay: async (path, mime, id, signal) => {
      const run = generation
      publish({ status: 'preparing', reason: 'dance_analysing', rate: 0, trackId: id, beats: [], energy: 0 })
      try { analysis = await analyse(path, mime, signal) }
      catch (e) {
        if (signal.aborted || run !== generation) return
        analysis = empty(); input.report(e instanceof Error && /^dance_[a-z_]+$/.test(e.message) ? e.message : 'dance_analysis_failed')
      }
      if (signal.aborted || run !== generation) return
      if (first && settings.welcome && input.welcome) {
        first = false; publish({ status: 'welcome', reason: 'dance_welcome' })
        try { await input.welcome(run, signal) } catch { if (!signal.aborted) input.report('dance_welcome_unavailable') }
      }
      if (signal.aborted || run !== generation) return
      publish({ status: 'preparing', reason: 'dance_starting', positionMs: 0, rate: 0 })
    },
    nativeEvent: event => {
      if (event.event === 'volume') {
        outputs = { count: Number(event.outputs) || 0, controlled: Number(event.controlled) || 0, verified: event.verified === true }
        input.report(outputs.verified ? 'dance_volume_verified' : 'dance_volume_failed', { outputs: outputs.count, controlled: outputs.controlled })
      } else if (event.event === 'volume_restore_failed') input.report('dance_volume_restore_failed')
      else if (event.event === 'clock' && event.id === frame.trackId && typeof event.positionMs === 'number' && Number.isFinite(event.positionMs)
        && event.positionMs >= 0 && event.positionMs <= 21_600_000 && typeof event.sentAt === 'number' && Math.abs(Date.now() - event.sentAt) < 5000
        && (event.rate === 0 || event.rate === 1)) {
        const positionMs = event.positionMs, beats = analysis?.beats.filter(b => b.timeMs >= positionMs - 1800 && b.timeMs <= positionMs + 2200).slice(0, 32) ?? []
        // Hold loudness over one gesture. Instantaneous RMS would suppress the
        // anticipation and move the apparent impact until after a drum attack.
        const beat = beats.reduce<typeof beats[number] | undefined>((best, b) => !best || Math.abs(b.timeMs-positionMs)<Math.abs(best.timeMs-positionMs) ? b : best, undefined)
        const center = beat?.timeMs ?? positionMs, radius = (beat?.periodMs ?? 500) / 2
        const values = analysis?.energy.slice(Math.max(0, Math.floor((center-radius)/analysis.energyStepMs)), Math.ceil((center+radius)/analysis.energyStepMs)) ?? []
        publish({ status: 'playing', positionMs, sentAt: event.sentAt, rate: event.rate, beats,
          energy: values.reduce((sum, v) => sum+v, 0) / Math.max(1, values.length),
          reason: event.rate === 0 ? 'dance_waiting_for_audio' : beats.length ? 'dance_beat_locked' : 'dance_no_confident_beat' })
      }
    },
  })
  const controller = {
    view: (): DanceView => structuredClone({ settings, tracks, frame, outputs }),
    async refresh() {
      const root = await input.sharedRoot()
      if (root) await mkdir(join(root, 'DanceFloor'), { recursive: true, mode: 0o700 })
      try {
        const files = await musicLoopFiles(root, 'DanceFloor')
        tracks = (await Promise.all(files.map(async path => ({ id: danceTrackId(path), name: basename(path), bytes: (await lstat(path)).size }))))
          .filter(t => t.bytes > 0 && t.bytes <= MUSIC_LOOP_MAX_BYTES)
      } catch (e) {
        tracks = []
        input.report(e instanceof Error && e.message === 'operator_loop_music_empty' ? 'dance_folder_empty' : 'dance_folder_unavailable')
      }
      return controller.view()
    },
    save(next: DanceSettings) {
      const parsed = parseDanceSettings(next)
      if (!parsed || parsed.track && !tracks.some(t => t.id === parsed.track)) throw Error('dance_settings_invalid')
      atomic.sync(settingsPath, JSON.stringify(parsed), { mode: 0o600 })
      const volumeChanged = settings.volume !== parsed.volume
      settings = { ...parsed }; publish({})
      if (volumeChanged) player.setVolume(input.qa ? 0.01 : settings.volume)
    },
    async start() {
      await controller.stop(); const run = generation
      await controller.refresh()
      if (run !== generation) return false
      chosen = settings.track || tracks[0]?.id || ''; first = true; analysis = undefined
      if (!chosen || !tracks.some(t => t.id === chosen)) {
        publish({ status: 'failed', reason: 'dance_track_missing' }); input.failed('operator_loop_dance_track_missing'); return false
      }
      publish({ status: 'preparing', reason: 'dance_preparing' })
      return player.start()
    },
    async stop() {
      ++generation; publish({ status: 'idle', reason: 'dance_idle', trackId: 0, rate: 0, beats: [], energy: 0 })
      await player.stop()
    },
  }
  return controller
}
