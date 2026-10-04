import { parsePresentation, type PresentationConfig } from '../../shared/presentation'
import type { LifecycleState } from '../../shared/types'
import type { PresentationPhase } from './presentation-controller'

function cancelled(): Error {
  const error = new Error('wake_presentation_cancelled')
  error.name = 'AbortError'
  return error
}

/** Gates only the greeting. Connection and visitor audio never wait here. */
export function createPresentationGreetingGate(input: { onReason(reason: string): void }) {
  let config: PresentationConfig | undefined
  let phase: PresentationPhase = 'asleep'
  let lifecycle: LifecycleState = 'starting'
  let enteringAt: number | undefined
  let disposed = false
  const report = (reason: string) => { try { input.onReason(reason) } catch { /* Observation cannot gate conversation. */ } }
  const waiters = new Set<(error?: Error) => void>()
  const finish = (error?: Error) => { for (const waiter of [...waiters]) waiter(error) }
  return {
    update(next: PresentationConfig, nextPhase: PresentationPhase, nextLifecycle: LifecycleState) {
      if (disposed) return
      if (config && config !== next) {
        if (waiters.size) report('wake_presentation_replaced')
        finish(cancelled())
        enteringAt = undefined
      }
      if (nextPhase === 'entering' && (phase !== 'entering' || config !== next)) enteringAt = Date.now()
      config = next; phase = nextPhase; lifecycle = nextLifecycle
      if (phase === 'awake') finish()
      else if (config.mode !== 'reflective' || phase === 'exiting' || phase === 'inactive'
        || lifecycle !== 'activating' && lifecycle !== 'active') {
        if (waiters.size) report('wake_presentation_cancelled')
        finish(cancelled())
        enteringAt = undefined
      }
    },
    wait(signal: AbortSignal): Promise<void> {
      if (disposed || signal.aborted) return Promise.reject(cancelled())
      if (config?.mode !== 'reflective' || phase === 'awake'
        || lifecycle !== 'activating' && lifecycle !== 'active') return Promise.resolve()
      if (phase !== 'asleep' && phase !== 'entering') return Promise.reject(cancelled())
      const normalized = parsePresentation(config)
      if (!normalized) { report('wake_presentation_timing_invalid'); return Promise.resolve() }
      const remaining = normalized.entranceMs - (enteringAt === undefined ? 0 : Date.now() - enteringAt)
      return new Promise<void>((resolve, reject) => {
        const done = (error?: Error) => {
          clearTimeout(timer); signal.removeEventListener('abort', abort); waiters.delete(done)
          if (error) reject(error); else resolve()
        }
        const abort = () => done(cancelled())
        const timer = setTimeout(() => { report('wake_presentation_timeout'); done() }, Math.min(normalized.entranceMs, Math.max(0, remaining)) + 250)
        waiters.add(done)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      finish(cancelled())
      config = undefined; enteringAt = undefined
    },
  }
}
