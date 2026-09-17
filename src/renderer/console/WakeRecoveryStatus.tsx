import * as React from 'react'
import type { WakeInputSnapshot } from '../../shared/wake-input'

export function WakeRecoveryStatus({ recovery }: { recovery: WakeInputSnapshot['recovery'] }): React.JSX.Element | null {
  if (!recovery) return null
  const detail = recovery.reason.replaceAll('_', ' ')
  return <p role={recovery.state === 'failed' ? 'alert' : 'status'} aria-label="Wake listener recovery">
    {recovery.state === 'failed'
      ? `Wake listener recovery failed: ${detail}. Check the microphone connection, save any draft edits, then close and restart Magic Mirror. Start live test can also retry the listener after the device is available.`
      : recovery.state === 'restarting'
        ? `Restarting wake listener after ${detail}. Waiting for audio to confirm recovery.`
        : `Audio resumed after ${detail}.`}
    {` Listener restart attempts: ${recovery.attempts}. (${recovery.reason})`}
  </p>
}
