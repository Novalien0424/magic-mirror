import { createConnection, isIP } from 'node:net'
import { execFile } from 'node:child_process'

export type TvPresence = 'present' | 'absent' | 'unknown'
export const TV_ABSENCE_GRACE_MS = 15_000

/** A refused TCP connection still proves the host answered; ADB authentication
 * and transport state are deliberately irrelevant to Ethernet presence. */
function probeTvPort(host: string, signal: AbortSignal): Promise<TvPresence> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve('unknown'); return }
    const socket = createConnection({ host, port: 5555 })
    const finish = (result: TvPresence) => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      socket.destroy()
      resolve(result)
    }
    const abort = () => finish('unknown')
    const timeout = setTimeout(() => finish('absent'), 800)
    signal.addEventListener('abort', abort, { once: true })
    socket.once('connect', () => finish('present'))
    socket.once('error', (error: NodeJS.ErrnoException) => finish(
      error.code === 'ECONNREFUSED' ? 'present'
        : ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EHOSTDOWN', 'ENETDOWN'].includes(error.code ?? '') ? 'absent' : 'unknown',
    ))
  })
}

export async function probeTvEthernet(host: string, signal: AbortSignal): Promise<TvPresence> {
  const port = await probeTvPort(host, signal)
  if (port !== 'absent' || signal.aborted) return port
  // A filtered/stalled ADB port does not prove that Ethernet is down.
  return new Promise(resolve => {
    const ipv4 = isIP(host) === 4
    execFile(ipv4 ? '/sbin/ping' : '/sbin/ping6',
      ['-n', '-c', '1', ...(ipv4 ? ['-W', '800'] : []), host],
      { signal, timeout: 1200, maxBuffer: 4096 }, error => {
        if (signal.aborted) resolve('unknown')
        else if (!error) resolve('present')
        else if (error.killed || error.code === 2) resolve('absent')
        else resolve('unknown')
      })
  })
}

export function parseTvHost(value: string | undefined): string | undefined {
  const host = value?.trim()
  return host && isIP(host) ? host : undefined
}

/** Main owns this monitor and the normal quit path. Either positive signal or
 * an uncertain sample cancels the countdown. No overlapping network probes. */
export function monitorTvPresence(options: {
  display: () => TvPresence
  ethernet: (signal: AbortSignal) => Promise<TvPresence>
  onAbsent: () => void
  report: (event: { hdmi: TvPresence; ethernet: TvPresence; reason: string }) => void
  now?: () => number
}): { stop(): void } {
  const now = options.now ?? (() => performance.now())
  const abort = new AbortController()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let absentSince: number | undefined
  let previous = ''
  const stop = () => {
    stopped = true
    clearTimeout(timer)
    abort.abort()
  }
  const sample = async () => {
    let ethernet: TvPresence = 'unknown'
    let hdmi: TvPresence = 'unknown'
    try { ethernet = await options.ethernet(abort.signal) } catch { /* Report unknown below. */ }
    if (stopped) return
    try { hdmi = options.display() } catch { /* Never interpret a query error as absent. */ }
    const bothAbsent = hdmi === 'absent' && ethernet === 'absent'
    if (bothAbsent) absentSince ??= now()
    else absentSince = undefined
    const state = `${hdmi}/${ethernet}`
    if (state !== previous) {
      previous = state
      options.report({ hdmi, ethernet, reason: bothAbsent ? 'both_absent_countdown'
        : hdmi === 'unknown' || ethernet === 'unknown' ? 'presence_query_unavailable' : 'presence_detected' })
    }
    if (absentSince !== undefined && now() - absentSince >= TV_ABSENCE_GRACE_MS) {
      options.report({ hdmi, ethernet, reason: 'both_absent_15_seconds' })
      stop()
      options.onAbsent()
      return
    }
    timer = setTimeout(() => { void sample() }, 1000)
  }
  void sample()
  return { stop }
}
