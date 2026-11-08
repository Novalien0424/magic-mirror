import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

/** A helper that ran this long before exiting earns a fresh automatic restart. */
export const SHARED_OUTPUT_HEALTHY_MS = 10 * 60_000

/**
 * Main owns the venue's public "Magic Mirror Speakers" device (music-loop --shared-output).
 * audio-prefer makes it the macOS default output while it exists, so renderer music,
 * operator loops and YouTube reach every speaker; Raven's voice stays on the speakerphone.
 * Without it music degrades to the speakerphone; diagnostics are counts and reasons only.
 */
export function createSharedMusicOutput(input: {
  executable: string
  report(reason: string, details?: Record<string, number>): void
  degraded(reason: string): void
  /** Group speaker level (0..1) from the helper, for AirPlay speakers to follow. */
  level?(value: number): void
  spawnImpl?: typeof spawn
  restartDelayMs?: number
  now?: () => number
}) {
  let child: ChildProcessByStdio<Writable, Readable, null> | undefined, stopped = false, restarts = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const now = input.now ?? Date.now
  const start = (): void => {
    if (stopped || child) return
    const next = (input.spawnImpl ?? spawn)(input.executable, ['--shared-output'], { stdio: ['pipe', 'pipe', 'ignore'] })
    const startedAt = now()
    child = next
    next.stdin.on('error', () => undefined)
    createInterface({ input: next.stdout }).on('line', line => {
      let event: Record<string, unknown>
      try { event = JSON.parse(line) } catch { return }
      const count = (value: unknown) => Number.isInteger(value) ? value as number : 0
      if (event.event === 'shared') input.report('music_output_shared_ready', { outputs: count(event.outputs), wireless: count(event.wireless), airfoil: count(event.airfoil) })
      else if (event.event === 'shared_failed') input.degraded('music_output_shared_route_failed')
      // A reconnected speaker was set to the group's level (percent, metadata only).
      else if (event.event === 'speaker_matched' && typeof event.level === 'number' && Number.isFinite(event.level))
        input.report('music_output_speaker_matched', { level: Math.round(Math.min(1, Math.max(0, event.level)) * 100) })
      // The group level exceeds 1 while the Jabra is at 100% and VOL+ raises the others further.
      else if (event.event === 'level' && typeof event.level === 'number' && Number.isFinite(event.level))
        input.level?.(Math.min(2, Math.max(0, event.level)))
    })
    next.once('error', () => { if (child === next) child = undefined; if (!stopped) input.degraded('music_output_shared_unavailable') })
    next.once('exit', () => {
      if (child !== next) return
      child = undefined
      if (stopped) return
      // One restart covers a transient helper failure; a repeated exit stays degraded. A helper
      // that ran healthily first gets its restart back, so one exit a day never ends the route.
      if (now() - startedAt >= SHARED_OUTPUT_HEALTHY_MS) restarts = 0
      if (restarts++ < 1) { input.report('music_output_shared_restarting'); timer = setTimeout(start, input.restartDelayMs ?? 2000) }
      else input.degraded('music_output_shared_exited')
    })
  }
  return {
    start,
    stop(): void {
      stopped = true; clearTimeout(timer)
      const current = child
      child = undefined
      // EOF lets the helper remove its public device; SIGTERM covers a stuck reader.
      current?.stdin.end(); current?.kill('SIGTERM')
    },
  }
}
