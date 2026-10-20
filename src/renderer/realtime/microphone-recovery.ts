export type MicrophoneRecoveryReason = 'microphone_recovery_started' | 'microphone_recovery_ready' | 'microphone_recovery_waiting'
interface Input {
  stream: MediaStream
  mediaDevices: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices' | 'addEventListener' | 'removeEventListener'>
  getConstraints(): Promise<true | MediaTrackConstraints>
  replaceTrack(track: MediaStreamTrack): Promise<void>
  onStatus(reason: MicrophoneRecoveryReason): void
}
interface Lease { stop(): Promise<void> }
interface Shared { join(input: Input): Lease }

// Same-owner session rollover reuses a MediaStream. Share recovery ownership so
// overlapping session lifetimes can never open two replacement microphones.
const recoveries = new WeakMap<MediaStream, Shared>()

export function watchMicrophone(input: Input): Lease {
  const existing = recoveries.get(input.stream)
  if (existing) return existing.join(input)
  const clients: Input[] = []
  const stream = input.stream
  const devices = input.mediaDevices
  const watched = new Set<MediaStreamTrack>()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let operation: Promise<void> | null = null
  let forcePending = false
  let recheck = false
  let retryDelay = 1200
  let enabled = true
  const current = (): Input | undefined => clients[clients.length - 1]
  const report = (reason: MicrophoneRecoveryReason): void => { if (!stopped) current()?.onStatus(reason) }

  const ended = (): void => schedule(true)
  const changed = (): void => schedule(false)
  const watchTracks = (): void => {
    for (const track of watched) track.removeEventListener('ended', ended)
    watched.clear()
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', ended)
      watched.add(track)
    }
  }

  async function needsReplacement(constraints: true | MediaTrackConstraints): Promise<boolean> {
    const track = stream.getAudioTracks()[0]
    if (!track || track.readyState === 'ended') return true
    const id = constraints !== true && typeof constraints.deviceId === 'object'
      && !Array.isArray(constraints.deviceId) ? constraints.deviceId.exact : undefined
    let desired = typeof id === 'string' ? id : undefined
    if (!desired) {
      const inputs = (await devices.enumerateDevices()).filter(d => d.kind === 'audioinput')
      const defaultDevice = inputs.find(d => d.deviceId === 'default')
      desired = defaultDevice?.groupId
        ? inputs.find(d => d.deviceId !== 'default' && d.groupId === defaultDevice.groupId)?.deviceId
        : undefined
    }
    return desired !== undefined && desired !== track.getSettings().deviceId
  }

  async function recover(force: boolean): Promise<void> {
    let acquired: MediaStream | undefined
    try {
      const constraints = await current()!.getConstraints()
      if (stopped || (!force && !(await needsReplacement(constraints)))) return
      if (stopped) return
      const old = stream.getAudioTracks()
      if (old.length) enabled = old.some(t => t.enabled)
      // Stop all old physical capture before getUserMedia. Main still grants
      // the single microphone lease to Realtime throughout this device change.
      for (const track of old) {
        track.removeEventListener('ended', ended)
        watched.delete(track)
        track.stop()
        stream.removeTrack(track)
      }
      report('microphone_recovery_started')
      acquired = await devices.getUserMedia({ audio: constraints, video: false })
      if (stopped) return
      const next = acquired.getAudioTracks()[0]
      if (!next || next.readyState === 'ended') throw new Error('capture_unavailable')
      next.enabled = enabled
      await current()!.replaceTrack(next)
      if (stopped) return
      stream.addTrack(next)
      for (const track of acquired.getTracks()) if (track !== next) track.stop()
      acquired = undefined
      watchTracks()
      retryDelay = 1200
      report('microphone_recovery_ready')
    } catch {
      if (!stopped) {
        report('microphone_recovery_waiting')
        schedule(true, retryDelay)
        retryDelay = Math.min(10000, retryDelay * 2)
      }
    } finally {
      // A session closed during acquisition/replacement must finish releasing
      // this late stream before Main can hand ownership back to wake.
      if (acquired) for (const track of acquired.getTracks()) track.stop()
    }
  }

  function schedule(force: boolean, delay = 1200): void {
    if (stopped) return
    forcePending ||= force
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (operation) { recheck = true; return }
      const forced = forcePending
      forcePending = false
      operation = recover(forced).finally(() => {
        operation = null
        if (recheck && !stopped) { recheck = false; schedule(false) }
      })
    }, delay)
  }

  const shared: Shared = {
    join(client) {
      clients.push(client)
      let stopPromise: Promise<void> | undefined
      return {
        stop() {
          if (stopPromise) return stopPromise
          stopPromise = (async () => {
          const index = clients.indexOf(client)
          if (index >= 0) clients.splice(index, 1)
          if (clients.length) return
          stopped = true
          clearTimeout(timer)
          devices.removeEventListener('devicechange', changed)
          for (const track of watched) track.removeEventListener('ended', ended)
          watched.clear()
          await operation
          recoveries.delete(stream)
          })()
          return stopPromise
        },
      }
    },
  }
  recoveries.set(stream, shared)
  const lease = shared.join(input)
  watchTracks()
  devices.addEventListener('devicechange', changed)
  return lease
}
