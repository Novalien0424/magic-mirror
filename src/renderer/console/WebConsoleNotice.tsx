import { useEffect, useState } from 'react'
import { isBrowserConsole, webConsoleState } from './web-bridge'
import { WEB_CONSOLE_LOCAL_ONLY } from '../../shared/web-console'

export function WebConsoleNotice() {
  const [state, setState] = useState(webConsoleState)
  useEffect(() => {
    const update = () => setState(webConsoleState())
    window.addEventListener('web-console-status', update)
    return () => window.removeEventListener('web-console-status', update)
  }, [])
  if (!isBrowserConsole) return null
  return <aside role="status" className="web-console-notice"><strong>{state}</strong><span>{WEB_CONSOLE_LOCAL_ONLY}</span></aside>
}
