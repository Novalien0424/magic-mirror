import { useEffect, useState } from 'react'
import type { LifecycleState } from '../../shared/types'

/** Task 1 placeholder: Main owns the real lifecycle from Task 2/Task 8 onwards. */
const SETTLE_MS = 1200

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<LifecycleState>('starting')
  const [bridgeMissing, setBridgeMissing] = useState(false)

  useEffect(() => {
    const bridge = window.magicMirror
    if (bridge === undefined) {
      // Preload never ran. Say so on the glass instead of pretending to boot.
      console.error('RENDER_BRIDGE_MISSING window=mirror')
      setBridgeMissing(true)
      return
    }
    bridge.notifyReady()
    const timer = setTimeout(() => setScreen('dormant'), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])

  if (bridgeMissing) {
    return (
      <div className="screen screen--fault">
        <p className="screen__title">Starting</p>
        <p className="screen__detail">Bridge unavailable — the mirror cannot report readiness.</p>
      </div>
    )
  }

  return (
    <div className={`screen screen--${screen}`}>
      <p className="screen__title">{screen === 'starting' ? 'Starting' : 'Dormant'}</p>
      <p className="screen__detail">
        {screen === 'starting' ? 'Waking the mirror…' : 'Phase 0 placeholder — say the wake word later.'}
      </p>
    </div>
  )
}
