import { useSyncExternalStore } from 'react'
import type { ConsoleRuntimeStore } from './runtime-store'
import { WakeRecoveryStatus } from './WakeRecoveryStatus'
import type { OperatorLoopSnapshot } from '../../shared/operator-loop'
import type { MirrorMode } from '../../shared/portrait-studio'

/** Header status chip; it widens into a banner only when the Mirror needs attention. */
export function RuntimeStatusStrip({ store, lifecycle, phrase, operatorLoop, mirrorMode }: { store: ConsoleRuntimeStore; lifecycle?: string; phrase?: string; operatorLoop?: OperatorLoopSnapshot | null; mirrorMode?: MirrorMode }) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  if (operatorLoop?.mode === 'loop') return <section className={`runtime-status${operatorLoop.status === 'failed' ? ' runtime-status--attention' : ''}`}
    aria-label="Mirror listening status" data-lifecycle="loop">
    <div aria-live="polite"><span className="runtime-status__dot" aria-hidden="true" /><strong>{operatorLoop.status === 'failed' ? 'Loop video needs attention' : 'Loop Video mode'}</strong> · Voice, wake listening and camera are off.</div>
  </section>
  const wake = state.status === 'success' ? state.value.wakeInput : undefined
  const listening = wake?.state === 'signal' || wake?.state === 'silent'
  const needsWake = lifecycle === 'dormant' || lifecycle === 'offlineLoop'
  // 'waiting' lasts under three seconds (Main reports 'stalled' after that): a normal
  // (re)start, for example after a Mirror mode switch, not a microphone problem.
  const starting = needsWake && wake?.state === 'waiting'
  const failed = state.status === 'failure' || needsWake && !listening && !starting
  const title = lifecycle === 'active' ? 'In conversation' : lifecycle === 'activating' ? 'Waking up'
    : lifecycle === 'suspending' ? 'Returning to sleep' : lifecycle === 'dormant' ? 'Asleep'
      : lifecycle === 'offlineLoop' ? 'Cloud connection unavailable' : lifecycle === 'maintenance' ? 'Needs attention' : 'Starting'
  const detail = state.status === 'success' && needsWake && listening
    ? wake?.state === 'silent' ? 'Wake listener running · quiet input' : 'Wake listener receiving audio' : undefined
  return <section className={`runtime-status${failed ? ' runtime-status--attention' : ''}`} aria-label="Mirror listening status"
    data-lifecycle={lifecycle ?? 'connecting'} title={detail}>
    <div aria-live="polite"><span className="runtime-status__dot" aria-hidden="true" /><strong>{title}</strong>{state.status === 'loading' ? ' · Loading status…'
      : state.status === 'failure' ? ' · Status unavailable. Check the app connection.'
        : needsWake ? listening ? <> · Listening for <span lang="zh-Hant">「{phrase || 'the wake phrase'}」</span></>
          : starting ? ' · Starting the wake listener…'
          : ` · Wake listener ${wake?.state ?? 'unavailable'}. Check the microphone connection and device selection.`
          : ''}{mirrorMode === 'studio' && <span className="runtime-status__mode">Interactive Studio mode</span>}</div>
    {needsWake && wake?.recovery && wake.recovery.state !== 'recovered' && <WakeRecoveryStatus recovery={wake.recovery} />}
    {detail && <small className="console__sr-only">{`✓ ${detail}`}</small>}
  </section>
}
