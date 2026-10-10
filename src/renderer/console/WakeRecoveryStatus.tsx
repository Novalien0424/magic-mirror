import * as React from 'react'
import type { WakeInputSnapshot } from '../../shared/wake-input'

export function WakeRecoveryStatus({ recovery }: { recovery: WakeInputSnapshot['recovery'] }): React.JSX.Element | null {
  if (!recovery) return null
  return <div aria-label="Wake listener recovery">
    {recovery.state === 'failed'
      ? 'Wake listener recovery failed. Check the microphone connection, save any draft edits, then close and restart Magic Mirror. Start live test can also retry the listener after the device is available.'
      : recovery.state === 'restarting'
        ? 'Restarting the wake listener. Waiting for audio to confirm recovery.'
        : 'Microphone audio has resumed.'}
    {` Listener restart attempts: ${recovery.attempts}.`}
    <details><summary>Technical detail</summary><code>{recovery.reason}</code></details>
  </div>
}
