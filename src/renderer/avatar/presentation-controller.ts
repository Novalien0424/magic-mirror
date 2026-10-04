import type { LifecycleState } from '../../shared/types'

export type PresentationPhase = 'asleep' | 'entering' | 'awake' | 'exiting' | 'inactive'

export function createPresentationController(input: {
  entranceMs: number; exitMs: number; initialPhase?: 'asleep' | 'awake'; changed(phase: PresentationPhase): void
}) {
  let phase: PresentationPhase = input.initialPhase ?? 'asleep'
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let disposed = false
  const set = (next: PresentationPhase) => {
    ++generation
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    phase = next
    input.changed(next)
  }
  const transition = (next: PresentationPhase, end: PresentationPhase, duration: number) => {
    set(next)
    const owner = generation
    timer = setTimeout(() => { if (!disposed && owner === generation) set(end) }, duration)
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
    dispose() { disposed = true; ++generation; if (timer !== undefined) clearTimeout(timer) },
  }
}
