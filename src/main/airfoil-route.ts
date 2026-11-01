import { execFile, spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Venue music through Airfoil (Rogue Amoeba). All music plays into the "Magic Mirror Music"
 * virtual device (music-loop helpers, while the flag file exists); Airfoil reads that device
 * and plays it on the Jabra ("Computer"), Bluetooth speakers and AirPlay speakers named
 * EDIFIER, in sync. The device reports Airfoil's measured delay, so Chromium and AVPlayer
 * hold pictures back to match. Raven's voice never enters this path (it stays on the Jabra).
 * Without Airfoil the flag is removed and music falls back to the direct speaker group.
 * Diagnostics are counts and reason codes only.
 */
export const AIRFOIL_SOURCE = 'Magic Mirror Music'
export const AIRFOIL_LOCAL_ID = 'com.rogueamoeba.airfoil.LocalSpeaker'

export interface AirfoilSpeaker { id: string; name: string; connected: boolean }
export type AirfoilKind = 'local' | 'bluetooth' | 'airplay'

/** Venue speakers Magic Mirror drives; everything else Airfoil lists (the Mac's own and the
 * TV board's AirPlay receivers, neighbours' speakers) is left alone. */
export function airfoilKind(speaker: Pick<AirfoilSpeaker, 'id' | 'name'>): AirfoilKind | undefined {
  if (speaker.id === AIRFOIL_LOCAL_ID) return 'local'
  if (speaker.id.endsWith(':output')) return 'bluetooth'
  if (/^EDIFIER\b/i.test(speaker.name)) return 'airplay'
  return undefined
}

export function parseAirfoilSpeakers(text: string): AirfoilSpeaker[] {
  return text.split('\n').map(line => line.split('\t')).filter(parts => parts.length === 3 && parts[0])
    .map(([id, name, connected]) => ({ id: id!, name: name!, connected: connected === 'true' }))
}

const LIST = `tell application "Airfoil"
  set out to ""
  repeat with s in every speaker
    set out to out & (id of s) & tab & (name of s) & tab & (connected of s) & linefeed
  end repeat
  return out
end tell`
const SOURCE = `on run argv
  tell application "Airfoil"
    set linked volume to false
    set current audio source to (first device source whose name is (item 1 of argv))
    return name of current audio source
  end tell
end run`
const CONNECT = `on run argv
  tell application "Airfoil"
    set s to (first speaker whose id is (item 1 of argv))
    if not (connected of s) then connect to s
    set (volume of s) to ((item 2 of argv) as real)
    return connected of s
  end tell
end run`
const VOLUME = `on run argv
  tell application "Airfoil" to set (volume of (first speaker whose id is (item 1 of argv))) to ((item 2 of argv) as real)
end run`
const DISCONNECT = `on run argv
  tell application "Airfoil"
    repeat with i in argv
      set s to (first speaker whose id is (i as text))
      if connected of s then disconnect from s
    end repeat
  end tell
end run`

export function runOsascript(script: string, args: string[] = [], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => execFile('/usr/bin/osascript', ['-e', script, ...args], { timeout: timeoutMs },
    (error, stdout) => error ? reject(error) : resolve(String(stdout).trim())))
}

export function createAirfoilRoute(input: {
  flagPath: string
  report(reason: string, details?: Record<string, number>): void
  degraded(reason: string): void
  run?: (script: string, args?: string[]) => Promise<string>
  launch?: () => Promise<void>
  writeFlag?: (on: boolean) => Promise<void>
  installed?: () => boolean
  /** Detached disconnect at quit: it must finish after Electron exits. */
  disconnectDetached?: (ids: string[]) => void
  pollMs?: number
}) {
  const run = input.run ?? runOsascript
  const launch = input.launch ?? (() => new Promise<void>((resolve, reject) =>
    execFile('/usr/bin/open', ['-g', '-b', 'com.rogueamoeba.Airfoil'], { timeout: 15_000 }, error => error ? reject(error) : resolve())))
  const writeFlag = input.writeFlag ?? (async (on: boolean) => {
    if (on) { await mkdir(dirname(input.flagPath), { recursive: true }); await writeFile(input.flagPath, 'airfoil\n') }
    else await rm(input.flagPath, { force: true })
  })
  let stopped = false, active = false, failures = 0, level = 0.7, timer: ReturnType<typeof setTimeout> | undefined
  let targets: AirfoilSpeaker[] = [], lastReason = '', joined = new Set<string>()
  const volumeFor = (speaker: AirfoilSpeaker) => airfoilKind(speaker) === 'airplay' ? level : 1
  const setActive = async (on: boolean, reason?: string) => {
    if (on !== active) { await writeFlag(on).catch(() => undefined); active = on }
    if (!on && reason && reason !== lastReason) input.degraded(reason)
    lastReason = on ? '' : reason ?? lastReason
  }
  const cycle = async (): Promise<void> => {
    let speakers: AirfoilSpeaker[]
    try { speakers = parseAirfoilSpeakers(await run(LIST)) } catch {
      // Airfoil quit or is not answering: relaunch once per failure streak, then degrade.
      if (failures++ === 0) { await launch().catch(() => undefined); return }
      return setActive(false, 'music_output_airfoil_unavailable')
    }
    if (stopped) return
    if (failures > 0 || !active) {
      try { await run(SOURCE, [AIRFOIL_SOURCE]) } catch { return setActive(false, 'music_output_airfoil_source_missing') }
    }
    failures = 0
    targets = speakers.filter(speaker => airfoilKind(speaker))
    const dropped = new Set(targets.filter(speaker => !speaker.connected).map(speaker => speaker.id))
    for (const speaker of targets) {
      if (speaker.connected && active) continue
      try { speaker.connected = (await run(CONNECT, [speaker.id, String(volumeFor(speaker))])) === 'true' } catch { speaker.connected = false }
    }
    // AirPlay connects finish after the first poll; a late or returning speaker counts as reconnected.
    const now = new Set(targets.filter(speaker => speaker.connected).map(speaker => speaker.id))
    const reconnected = [...now].filter(id => !joined.has(id) || dropped.has(id)).length
    joined = now
    if (stopped) return
    const local = targets.find(speaker => airfoilKind(speaker) === 'local')
    if (!local?.connected) return setActive(false, 'music_output_airfoil_local_failed')
    const wasActive = active
    await setActive(true)
    const count = (kind: AirfoilKind) => targets.filter(speaker => speaker.connected && airfoilKind(speaker) === kind).length
    if (!wasActive) input.report('music_output_airfoil_ready', { speakers: targets.filter(s => s.connected).length, airplay: count('airplay'), bluetooth: count('bluetooth') })
    else if (reconnected) input.report('music_output_airfoil_speaker_reconnected', { speakers: reconnected })
  }
  const loop = async (): Promise<void> => {
    if (stopped) return
    try { await cycle() } catch { await setActive(false, 'music_output_airfoil_unavailable') }
    if (!stopped) timer = setTimeout(() => void loop(), input.pollMs ?? 10_000)
  }
  return {
    async start(): Promise<void> {
      stopped = false
      // A Mac without Airfoil (development) keeps the direct speakers; no Airfoil dialog appears.
      if (!(input.installed ?? (() => existsSync('/Applications/Airfoil.app')))()) return input.report('music_output_airfoil_not_installed')
      // A previous run that died keeps no stale route: music is direct until Airfoil is verified.
      await writeFlag(false).catch(() => undefined); active = false
      await launch().catch(() => undefined)
      void loop()
    },
    /** Group level from the Jabra (VOL±, Dance, STOP restores); AirPlay speakers follow it. */
    setLevel(next: number): void {
      if (!Number.isFinite(next)) return
      level = Math.min(1, Math.max(0, next))
      for (const speaker of targets) if (speaker.connected && airfoilKind(speaker) === 'airplay') void run(VOLUME, [speaker.id, String(level)]).catch(() => undefined)
    },
    /** Synchronous for will-quit: the flag goes now, the disconnect finishes on its own. */
    stop(): void {
      stopped = true; clearTimeout(timer); active = false
      if (input.writeFlag) void input.writeFlag(false).catch(() => undefined)
      else rmSync(input.flagPath, { force: true })
      const ids = targets.filter(speaker => speaker.connected).map(speaker => speaker.id)
      if (!ids.length) return
      if (input.disconnectDetached) input.disconnectDetached(ids)
      else spawn('/usr/bin/osascript', ['-e', DISCONNECT, ...ids], { detached: true, stdio: 'ignore' }).unref()
    },
    isActive: () => active,
  }
}
