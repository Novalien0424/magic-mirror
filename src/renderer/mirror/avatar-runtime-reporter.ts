import type { AvatarRuntimeSnapshot } from '../../shared/bridge'

/** Console diagnostics do not need animation-rate IPC. Keep the newest sample,
 * send device lists only when changed, and preserve immediate state/fault reports. */
export function createAvatarRuntimeReporter(send: (snapshot: AvatarRuntimeSnapshot) => void) {
  let current: AvatarRuntimeSnapshot = { status: 'not_ready', reason: 'avatar_renderer_not_ready',
    state: 'Dormant', fps: 0, waveform: 0, mouthOpen: 0, audioUnderruns: 0, voiceGain: 1, musicGain: 1 }
  let last = '', devices = '', lastSent = -Infinity, disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer); timer = undefined
    if (disposed) return
    const fingerprint = JSON.stringify(current)
    if (fingerprint === last) return
    const { audioDevices, ...metrics } = current
    const deviceFingerprint = JSON.stringify(audioDevices) ?? ''
    try {
      send({ ...metrics, ...(audioDevices && deviceFingerprint !== devices ? { audioDevices } : {}) })
      last = fingerprint; devices = deviceFingerprint; lastSent = performance.now()
    } catch { /* Diagnostics cannot stop playback. A later report can retry. */ }
  }
  return {
    report(patch: Partial<AvatarRuntimeSnapshot>) {
      if (disposed) return
      const urgent = patch.reason !== undefined && patch.reason !== current.reason
        || patch.status !== undefined && patch.status !== current.status
        || patch.state !== undefined && patch.state !== current.state || patch.audioDevices !== undefined
      if (patch.reason !== undefined) {
        const reason = patch.reason.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 96)
        patch = { ...patch, reason: /^[a-z]/.test(reason) ? reason : 'avatar_runtime_event' }
      }
      current = { ...current, ...patch }
      if (urgent || performance.now() - lastSent >= 100) flush()
      else timer ??= setTimeout(flush, Math.max(0, 100 - (performance.now() - lastSent)))
    },
    dispose() { disposed = true; clearTimeout(timer) },
  }
}
