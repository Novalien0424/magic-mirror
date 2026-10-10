import { useSyncExternalStore } from 'react'
import type { ConsoleRuntimeStore } from './runtime-store'
import { WakeRecoveryStatus } from './WakeRecoveryStatus'

export function RuntimeStatusStrip({ store, lifecycle, phrase }: { store: ConsoleRuntimeStore; lifecycle?: string; phrase?: string }) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
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
