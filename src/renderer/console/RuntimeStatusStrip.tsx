import { useSyncExternalStore } from 'react'
import type { ConsoleRuntimeStore } from './runtime-store'
import { WakeRecoveryStatus } from './WakeRecoveryStatus'
import type { OperatorLoopSnapshot } from '../../shared/operator-loop'

export function RuntimeStatusStrip({ store, lifecycle, phrase, operatorLoop }: { store: ConsoleRuntimeStore; lifecycle?: string; phrase?: string; operatorLoop?: OperatorLoopSnapshot | null }) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  if (operatorLoop?.mode === 'loop') return <section className={`runtime-status${operatorLoop.status === 'failed' ? ' runtime-status--attention' : ''}`} aria-label="Mirror listening status">
    <div aria-live="polite"><strong>{operatorLoop.status === 'failed' ? 'Loop video needs attention' : 'Loop Video mode'}</strong> · Voice, wake listening and camera are off.</div>
  </section>
  const wake = state.status === 'success' ? state.value.wakeInput : undefined
  const listening = wake?.state === 'signal' || wake?.state === 'silent'
  const needsWake = lifecycle === 'dormant' || lifecycle === 'offlineLoop'
  const failed = state.status === 'failure' || needsWake && !listening
  const title = lifecycle === 'active' ? 'In conversation' : lifecycle === 'activating' ? 'Waking up'
    : lifecycle === 'suspending' ? 'Returning to sleep' : lifecycle === 'dormant' ? 'Asleep'
      : lifecycle === 'offlineLoop' ? 'Cloud connection unavailable' : lifecycle === 'maintenance' ? 'Needs attention' : 'Starting'
  return <section className={`runtime-status${failed ? ' runtime-status--attention' : ''}`} aria-label="Mirror listening status">
    <div aria-live="polite"><strong>{title}</strong>{state.status === 'loading' ? ' · Loading status…'
      : state.status === 'failure' ? ' · Status unavailable. Check the app connection.'
        : needsWake ? listening ? <> · Listening for <span lang="zh-Hant">「{phrase || 'the wake phrase'}」</span></>
          : ` · Wake listener ${wake?.state ?? 'unavailable'}. Check the microphone connection and device selection.`
          : ''}</div>
    {needsWake && wake?.recovery && wake.recovery.state !== 'recovered' && <WakeRecoveryStatus recovery={wake.recovery} />}
    {state.status === 'success' && needsWake && listening && <small>{wake?.state === 'silent' ? '✓ Wake listener running · quiet input' : '✓ Wake listener receiving audio'}</small>}
  </section>
}
