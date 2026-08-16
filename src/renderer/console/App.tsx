import { useEffect, useState } from 'react'

const PAGES = ['Overview', 'Simulator', 'Events', 'Phase Tests', 'Config', 'Models'] as const

export function App(): React.JSX.Element {
  const [bridgeMissing, setBridgeMissing] = useState(false)

  useEffect(() => {
    const bridge = window.magicMirror
    if (bridge === undefined) {
      console.error('RENDER_BRIDGE_MISSING window=console')
      setBridgeMissing(true)
      return
    }
    bridge.notifyReady()
  }, [])

  return (
    <main className="console">
      <h1 className="console__title">Magic Mirror Console</h1>
      <p className="console__detail">
        Phase 0 shell. Pages arrive in Task 9; this window only proves it opens and loads.
      </p>
      {bridgeMissing ? <p className="console__fault">Bridge unavailable — readiness not reported.</p> : null}
      <ul className="console__pages">
        {PAGES.map((page) => (
          <li key={page} className="console__page">
            {page} <span className="console__badge">Not implemented</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
