import type { AvatarState } from './avatar-state'

export type PerformanceProfile = 'raven-calm-v1' | null

/** The vendored stop implementation splices while incrementing its index and
 * can leave alternate fading entries alive. Drain through its public API. */
export function drainMotionQueue(manager: {
  stopAllMotions(): void
  getCubismMotionQueueEntries(): unknown[]
}): void {
  do { manager.stopAllMotions() } while (manager.getCubismMotionQueueEntries().length > 0)
}

/** Versioned, explicit opt-in; imported names and UUIDs never select behavior. */
export function readPerformanceProfile(manifest: unknown): PerformanceProfile {
  if (typeof manifest !== 'object' || manifest === null) return null
  const profile = (manifest as { MagicMirror?: { Version?: unknown; Performance?: unknown } }).MagicMirror
  return profile?.Version === 1 && profile.Performance === 'raven-calm-v1' ? 'raven-calm-v1' : null
}

export function lifecycleLoops(profile: PerformanceProfile, state: AvatarState): boolean {
  if (state === 'OfflineLoop') return false
  return profile === null || ['Dormant', 'Listening', 'Thinking', 'Speaking'].includes(state)
}

export function performanceState(state: AvatarState, oneShotGroup: string | null): AvatarState {
  return oneShotGroup !== null && ['Dormant', 'Waking', 'Listening', 'Thinking', 'Speaking', 'Scene', 'Suspending'].includes(oneShotGroup)
    ? oneShotGroup as AvatarState : state
}

/** These clips author eyelids; automatic blink must not replace their curves. */
export function ownsBlink(profile: PerformanceProfile, state: AvatarState): boolean {
  return profile !== null && ['Dormant', 'Waking', 'Suspending'].includes(state)
}

/** Preserve continuity even when lifecycle events interrupt a clip mid-gesture.
 * Separate from model.saveParameters(): effects must never accumulate in the
 * motion base. Mouth and manual parameter overrides deliberately bypass this.
 */
export class PerformanceContinuity {
  readonly #values = new Map<string, number>()

  reset(): void { this.#values.clear() }

  sample(id: string, target: number, deltaSeconds: number): number {
    const previous = this.#values.get(id) ?? target
    const tau = id.includes('Eye') ? 0.045 : 0.18
    const value = previous + (target - previous) * (1 - Math.exp(-Math.max(0, deltaSeconds) / tau))
    // The SDK holds a blink at zero briefly. A low-pass filter would otherwise
    // miss complete closure for the entire blink, exposing a persistent slit.
    const settled = (id.includes('Eye') && target === 0) || Math.abs(target - value) < 0.0001 ? target : value
    this.#values.set(id, settled)
    return settled
  }
}

export const CONTINUOUS_PARAMETERS = [
  'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
  'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ', 'ParamBreath',
  'ParamEyeLOpen', 'ParamEyeROpen',
] as const
