import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_SPEAKER_LEVELS, speakerTargetLevel, type SpeakerLevels } from './speaker-levels'

/**
 * Venue music through Airfoil (Rogue Amoeba). All music plays into the "Magic Mirror Music"
 * virtual output (music-loop helpers, while the flag file exists); Airfoil reads its separate
 * zero-latency "Magic Mirror Capture" input, so the output's video compensation cannot be
 * counted again by Core Audio when the driver loads. Airfoil plays it on the Jabra
 * ("Computer"), Bluetooth speakers and AirPlay speakers named
 * EDIFIER, in sync. The device reports Airfoil's measured delay, so Chromium and AVPlayer
 * hold pictures back to match. Raven's voice never enters this path (it stays on the Jabra).
 * Without Airfoil the flag is removed and music falls back to the direct speaker group.
 * Diagnostics are counts and reason codes only.
 */
export const AIRFOIL_SOURCE = 'Magic Mirror Capture'
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

/** Bluetooth sync settle time after Airfoil connects a speaker (measured ~6 min, 2026-11-07). */
export const BLUETOOTH_SETTLE_MS = 6.5 * 60_000
/** An AirPlay connect normally lands on the next 10 s poll; this long without one is a degrade. */
export const AIRPLAY_MISSING_MS = 30_000

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
  /** Calibrated normal levels: AirPlay speakers keep their offset from the Jabra's level. */
  levels?: SpeakerLevels
  /** How long a freshly connected Bluetooth speaker stays silent while Airfoil syncs it. */
  bluetoothSettleMs?: number
  /** False while the Jabra's microphone is open: it then plays ~150 ms early, so it sits out music. */
  localMusic?: () => boolean
  /** Settle start times of Bluetooth speakers kept connected through a stop (epoch ms by id). */
  settleState?: { load(): Record<string, number>; save(state: Record<string, number>): void }
  now?: () => number
  pollMs?: number
}) {
  const run = input.run ?? runOsascript
  const launch = input.launch ?? (() => new Promise<void>((resolve, reject) =>
    execFile('/usr/bin/open', ['-g', '-b', 'com.rogueamoeba.Airfoil'], { timeout: 15_000 }, error => error ? reject(error) : resolve())))
  const writeFlag = input.writeFlag ?? (async (on: boolean) => {
    if (on) { await mkdir(dirname(input.flagPath), { recursive: true }); await writeFile(input.flagPath, 'airfoil\n') }
    else await rm(input.flagPath, { force: true })
  })
  const levels = input.levels ?? DEFAULT_SPEAKER_LEVELS
  let stopped = false, active = false, failures = 0, level = levels.jabra, timer: ReturnType<typeof setTimeout> | undefined
  let targets: AirfoilSpeaker[] = [], lastReason = '', joined = new Set<string>()
  // 2026-11-08: after a reboot the Edifier was off the network, then listed but unresolvable, and
  // music played on the Jabra alone with no reason anywhere. Since when no AirPlay speaker plays.
  let airplayMissingSince: number | undefined, airplayMissing = false
  // Measured 2026-11-07: after Airfoil connects a Bluetooth speaker (A1) it starts ~130 ms late
  // and glides into sync at ~20 ms/min, settling after ~6 min (the Jabra and AirPlay speakers are
  // in sync at once). The speaker streams at Airfoil volume 0 meanwhile and then joins in sync.
  const settleMs = input.bluetoothSettleMs ?? BLUETOOTH_SETTLE_MS, clock = input.now ?? Date.now
  const settling = new Map<string, number>()
  const statePath = join(dirname(input.flagPath), 'bluetooth-settle.json')
  const settleState = input.settleState ?? {
    load: () => { try { return JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, number> } catch { return {} } },
    save: (state: Record<string, number>) => { try { writeFileSync(statePath, JSON.stringify(state)) } catch { /* best effort */ } },
  }
  let savedSettling = ''
  const saveSettling = () => {
    const next = JSON.stringify(Object.fromEntries(settling))
    if (next !== savedSettling) { savedSettling = next; settleState.save(Object.fromEntries(settling)) }
  }
  // A Bluetooth speaker kept connected through a stop resumes its settle time from the file.
  let resumed: Record<string, number> = {}
  const settled = (speaker: AirfoilSpeaker) => { const since = settling.get(speaker.id); return since === undefined || clock() - since >= settleMs }
  // Computer (Jabra) and Bluetooth play at full Airfoil volume: their CoreAudio levels carry the
  // calibration. AirPlay speakers have only Airfoil's volume, so it carries their offset.
  const localOn = () => input.localMusic?.() ?? true
  // The Jabra music state and AirPlay volumes Airfoil last confirmed; a failed write keeps the
  // old value, so the next poll retries it.
  let localApplied = true, localWriting = false, localFailed = false, airplayFailed = false
  const airplayApplied = new Map<string, number>()
  const volumeFor = (speaker: AirfoilSpeaker) => airfoilKind(speaker) === 'airplay' ? speakerTargetLevel(levels, speaker.name, level)
    : airfoilKind(speaker) === 'bluetooth' && !settled(speaker) ? 0 : airfoilKind(speaker) === 'local' && !localOn() ? 0 : 1
  // One osascript at a time per speaker: an older slow write can never land after a newer one.
  const lanes = new Map<string, Promise<unknown>>()
  const serial = <T>(id: string, task: () => Promise<T>): Promise<T> => {
    const result = (lanes.get(id) ?? Promise.resolve()).then(task)
    const tail = result.catch(() => undefined)
    lanes.set(id, tail)
    void tail.then(() => { if (lanes.get(id) === tail) lanes.delete(id) })
    return result
  }
  // Applies the Jabra's music state now (Main calls it on every microphone change; each poll re-checks).
  const refreshLocal = (): void => {
    const on = localOn()
    if (localWriting || on === localApplied) return
    localWriting = true
    const locals = targets.filter(speaker => speaker.connected && airfoilKind(speaker) === 'local')
    void Promise.all(locals.map(speaker => serial(speaker.id, () => run(VOLUME, [speaker.id, on ? '1' : '0'])))).then(() => {
      localApplied = on; localFailed = false
      input.report(on ? 'music_output_jabra_music_on' : 'music_output_jabra_music_off')
      return true
    }, () => {
      if (!localFailed) { localFailed = true; input.degraded('music_output_jabra_music_failed') }
      return false
    }).then(applied => {
      localWriting = false
      // The microphone may have changed during the write; a failure waits for the next poll.
      if (applied) refreshLocal()
    })
  }
  // AirPlay speakers carry their offset in Airfoil's volume; each write uses the latest level.
  const refreshAirplay = (): void => {
    for (const speaker of targets) {
      if (!speaker.connected || airfoilKind(speaker) !== 'airplay') continue
      void serial(speaker.id, async () => {
        const value = volumeFor(speaker)
        if (airplayApplied.get(speaker.id) === value) return
        await run(VOLUME, [speaker.id, String(value)])
        airplayApplied.set(speaker.id, value); airplayFailed = false
      }).catch(() => {
        airplayApplied.delete(speaker.id)
        if (!airplayFailed) { airplayFailed = true; input.degraded('music_output_airplay_level_failed') }
      })
    }
  }
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
    let settlingNow = 0
    for (const speaker of targets) {
      if (speaker.connected && active) continue
      // A Bluetooth speaker this run connects starts its settle time; one already connected
      // before Main started has been in sync for an unknown time and plays at once.
      const fresh = !speaker.connected && airfoilKind(speaker) === 'bluetooth'
      if (fresh) settling.set(speaker.id, clock())
      else if (speaker.connected && airfoilKind(speaker) === 'bluetooth' && Number.isFinite(resumed[speaker.id])
        && clock() - resumed[speaker.id]! < settleMs) settling.set(speaker.id, resumed[speaker.id]!)
      const value = volumeFor(speaker)
      try { speaker.connected = (await serial(speaker.id, () => run(CONNECT, [speaker.id, String(value)]))) === 'true' } catch { speaker.connected = false }
      if (speaker.connected && airfoilKind(speaker) === 'airplay') airplayApplied.set(speaker.id, value)
      else airplayApplied.delete(speaker.id)
      if (fresh && !speaker.connected) settling.delete(speaker.id)
      else if (fresh) settlingNow++
    }
    resumed = {}
    if (!active && !localWriting) localApplied = localOn()
    refreshLocal(); refreshAirplay()
    if (settlingNow) input.report('music_output_bluetooth_settling', { speakers: settlingNow, seconds: Math.round(settleMs / 1000) })
    for (const speaker of targets) {
      if (!settling.has(speaker.id)) continue
      if (!speaker.connected) { settling.delete(speaker.id); continue }
      if (!settled(speaker)) continue
      settling.delete(speaker.id)
      try { await serial(speaker.id, () => run(VOLUME, [speaker.id, '1'])); input.report('music_output_bluetooth_joined', { speakers: 1 }) } catch {
        settling.set(speaker.id, clock() - settleMs)
        input.degraded('music_output_bluetooth_join_failed')
      }
    }
    saveSettling()
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
    // No AirPlay speaker (Edifier) for 30 s: listed but refusing, or not found on the network at all.
    if (count('airplay')) {
      if (airplayMissing) input.report('music_output_airplay_restored', { speakers: count('airplay') })
      airplayMissingSince = undefined; airplayMissing = false
    } else {
      airplayMissingSince ??= clock()
      if (!airplayMissing && clock() - airplayMissingSince >= AIRPLAY_MISSING_MS) {
        airplayMissing = true
        input.degraded(targets.some(speaker => airfoilKind(speaker) === 'airplay') ? 'music_output_airplay_unreachable' : 'music_output_airplay_not_found')
      }
    }
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
      airplayMissingSince = undefined; airplayMissing = false
      resumed = settleState.load()
      await launch().catch(() => undefined)
      void loop()
    },
    /** Group level from the Jabra (VOL±, Dance, STOP restores); AirPlay speakers follow it with their offsets. */
    setLevel(next: number): void {
      if (!Number.isFinite(next)) return
      level = Math.min(2, Math.max(0, next))
      refreshAirplay()
    },
    /** Synchronous for will-quit: the flag goes now, the disconnect finishes on its own. Bluetooth
     * speakers stay connected (owner 2026-11-07): Airfoil keeps them in sync while the app is
     * stopped, so the next start needs no settle time. Computer and AirPlay speakers are released. */
    stop(): void {
      stopped = true; clearTimeout(timer); active = false
      if (input.writeFlag) void input.writeFlag(false).catch(() => undefined)
      else rmSync(input.flagPath, { force: true })
      const ids = targets.filter(speaker => speaker.connected && airfoilKind(speaker) !== 'bluetooth').map(speaker => speaker.id)
      if (!ids.length) return
      if (input.disconnectDetached) input.disconnectDetached(ids)
      else spawn('/usr/bin/osascript', ['-e', DISCONNECT, ...ids], { detached: true, stdio: 'ignore' }).unref()
    },
    isActive: () => active,
    refreshLocal,
  }
}
