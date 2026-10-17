import type { ConsoleBridge } from '../../shared/bridge'

/** A stalled IPC request must not leave the last healthy status on screen. */
export function getAvatarRuntimeWithTimeout(bridge: Pick<ConsoleBridge, 'getAvatarRuntime'>): ReturnType<ConsoleBridge['getAvatarRuntime']> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('console_runtime_timeout')), 2000)
    Promise.resolve().then(() => bridge.getAvatarRuntime()).then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}
