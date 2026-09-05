import type { LifecycleState } from '../../shared/types'

export type PresentationPhase = 'asleep' | 'entering' | 'awake' | 'exiting' | 'inactive'

export function createPresentationController(input: {
  entranceMs: number; exitMs: number; changed(phase: PresentationPhase): void
}) {
  let phase: PresentationPhase = 'asleep'
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const set = (next: PresentationPhase) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    phase = next
    input.changed(next)
  }
  const transition = (next: PresentationPhase, end: PresentationPhase, duration: number) => {
    set(next)
    timer = setTimeout(() => { if (!disposed) set(end) }, duration)
  }
  return {
    update(lifecycle: LifecycleState) {
      if (disposed) return
      if (lifecycle === 'activating' || lifecycle === 'active') {
        if (phase !== 'entering' && phase !== 'awake') transition('entering', 'awake', input.entranceMs)
      } else if (lifecycle === 'suspending' || lifecycle === 'dormant') {
        if (phase === 'awake' || phase === 'entering') transition('exiting', 'asleep', input.exitMs)
        else if (phase === 'inactive') set('asleep')
      } else if (phase !== 'inactive') set('inactive')
    },
    dispose() { disposed = true; if (timer !== undefined) clearTimeout(timer) },
  }
}
