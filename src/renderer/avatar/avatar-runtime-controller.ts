import type { AvatarState } from './avatar-state'

export interface AvatarRenderPort {
  setState(state: AvatarState): void
  setMouthOpen(value: number): void
  stopSpeakingMotion(): void
  clearExpression(): void
}

export interface AvatarRuntimeSnapshot {
  readonly state: AvatarState
  readonly mouthOpen: number
}

export interface AvatarRuntimeController {
  setState(state: AvatarState): void
  setMouthOpen(value: number): void
  interrupt(): void
  snapshot(): AvatarRuntimeSnapshot
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function createAvatarRuntimeController(
  port: AvatarRenderPort,
): AvatarRuntimeController {
  let state: AvatarState = 'Dormant'
  let mouthOpen = 0
  let initialized = false

  const clearSpeakingWork = (): void => {
    mouthOpen = 0
    port.setMouthOpen(0)
    port.stopSpeakingMotion()
    port.clearExpression()
  }

  const setState = (next: AvatarState): void => {
    if (initialized && state === next) return
    if (next === 'OfflineLoop') clearSpeakingWork()
    state = next
    initialized = true
    port.setState(next)
  }

  return Object.freeze({
    setState,
    setMouthOpen: (value: number): void => {
      mouthOpen = clampUnit(value)
      port.setMouthOpen(mouthOpen)
    },
    interrupt: (): void => {
      clearSpeakingWork()
      setState('Listening')
    },
    snapshot: (): AvatarRuntimeSnapshot => Object.freeze({ state, mouthOpen }),
  })
}
