import type { MirrorWindowKind } from '../shared/bridge'

/**
 * Renderer crash policy. A crashed renderer leaves a black window, which is never
 * acceptable (invariant #10), so the window is recreated. Restarts of the *app* belong
 * to one owner only — the macOS LaunchAgent (`KeepAlive={SuccessfulExit=false}`) — so
 * once the recreate budget is spent we exit non-zero and let the supervisor relaunch.
 * `app.relaunch()` is deliberately never used: two restart owners fight.
 *
 * Electron-free on purpose: the policy is unit-testable without a running app.
 */

export interface RendererGone {
  readonly window: MirrorWindowKind
  /** Electron's `details.reason`: crashed | oom | killed | launch-failed | clean-exit | … */
  readonly reason: string
  readonly exitCode: number
}

export type CrashDecision =
  | { readonly action: 'ignore' }
  | { readonly action: 'recreate'; readonly attempt: number }
  | { readonly action: 'give_up'; readonly attempt: number; readonly reason: string }

export interface CrashRecovery {
  decide(gone: RendererGone): CrashDecision
}

const DEFAULT_MAX_RECREATES = 1

export function createCrashRecovery(maxRecreates: number = DEFAULT_MAX_RECREATES): CrashRecovery {
  const attempts = new Map<MirrorWindowKind, number>()

  return {
    decide(gone: RendererGone): CrashDecision {
      // A renderer that exited cleanly (app quitting, window closed) is not a crash.
      if (gone.reason === 'clean-exit') return { action: 'ignore' }

      const attempt = (attempts.get(gone.window) ?? 0) + 1
      attempts.set(gone.window, attempt)

      if (attempt > maxRecreates) {
        return { action: 'give_up', attempt, reason: 'recreate_limit_exhausted' }
      }
      return { action: 'recreate', attempt }
    }
  }
}
