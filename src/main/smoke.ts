import type { MirrorWindowKind } from '../shared/bridge'
import type { LifecycleState } from '../shared/types'

/**
 * Boot smoke contract. `MIRROR_SMOKE_MS=<n>` makes the app quit n ms after `app.ready`
 * with exit 0 only if both windows loaded AND the lifecycle is exactly `dormant` or
 * `maintenance`.
 * Kept electron-free so the decision rules are unit-testable without spawning the app.
 */

export const SMOKE_EXIT_OK = 0
export const SMOKE_EXIT_FAILED = 2

export type SmokeMode =
  | { readonly kind: 'off' }
  | { readonly kind: 'on'; readonly ms: number }
  | { readonly kind: 'invalid'; readonly raw: string }

export function parseSmokeMode(raw: string | undefined): SmokeMode {
  if (raw === undefined || raw.trim() === '') return { kind: 'off' }
  const ms = Number(raw)
  // A set-but-unusable value must fail loudly; silently booting non-smoke would let a
  // broken demo script report success.
  if (!Number.isFinite(ms) || ms <= 0) return { kind: 'invalid', raw }
  return { kind: 'on', ms: Math.trunc(ms) }
}

export interface SmokeState {
  readonly lifecycle: LifecycleState
  readonly loaded: Readonly<Record<MirrorWindowKind, boolean>>
}

export interface SmokeVerdict {
  readonly exitCode: typeof SMOKE_EXIT_OK | typeof SMOKE_EXIT_FAILED
  /** Machine-readable, comma-separated; every unmet condition is named. */
  readonly reason: string
}

const TERMINAL_LIFECYCLE_STATES: ReadonlySet<LifecycleState> = new Set([
  'dormant',
  'maintenance'
])

export function evaluateSmoke(state: SmokeState): SmokeVerdict {
  const unmet: string[] = []
  if (!state.loaded.mirror) unmet.push('mirror_window_not_loaded')
  if (!state.loaded.console) unmet.push('console_window_not_loaded')
  if (state.lifecycle === 'starting') {
    unmet.push('lifecycle_still_starting')
  } else if (!TERMINAL_LIFECYCLE_STATES.has(state.lifecycle)) {
    unmet.push('lifecycle_not_terminal')
  }

  return unmet.length === 0
    ? { exitCode: SMOKE_EXIT_OK, reason: 'ok' }
    : { exitCode: SMOKE_EXIT_FAILED, reason: unmet.join(',') }
}
