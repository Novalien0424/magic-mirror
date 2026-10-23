import type { ConsoleBridge } from '../../shared/bridge'
import { WEB_CONSOLE_METHODS, WEB_CONSOLE_LOCAL_ONLY } from '../../shared/web-console'

export const isBrowserConsole = !window.magicMirror && /^https?:$/.test(location.protocol)
type Listener = (value: never) => void
const listeners = new Map<string, Set<Listener>>()
let state = 'Connecting to the Mac…'
export const webConsoleState = () => state
const status = (text: string) => { state = text; window.dispatchEvent(new Event('web-console-status')) }

if (isBrowserConsole) {
  document.documentElement.dataset.webConsole = 'true'
  let token: Promise<string> | undefined
  const session = () => token ??= fetch('/api/session', { cache: 'no-store' }).then(async res => {
    if (!res.ok) throw Error('Tailnet access was rejected.')
    return (await res.json() as { token: string }).token
  }).catch(error => { token = undefined; throw error })
  const invoke = async (method: string, args: unknown[], refresh = true): Promise<unknown> => {
    try {
      const res = await fetch('/api/invoke', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Console-Token': await session() }, body: JSON.stringify({ method, args }) })
      if (res.status === 403 && refresh) { token = undefined; return invoke(method, args, false) }
      if (!res.ok) throw Error('The Mac did not accept this request. Reconnect and check its state before trying again.')
      return await res.json()
    } catch (error) { status('Disconnected — controls are unavailable. Keep this page open; your unsaved edits remain here.'); throw error }
  }
  const unavailable = async () => ({ ok: false, error: 'console_request_rejected', reason: WEB_CONSOLE_LOCAL_ONLY })
  let events: EventSource | undefined, poll: ReturnType<typeof setInterval> | undefined, polling = false
  const dispatch = (channel: string, value: never) => { for (const listener of listeners.get(channel) ?? []) listener(value) }
  const connect = () => {
    if (events) return
    events = new EventSource('/api/events')
    events.onopen = () => status('Connected to Magic Mirror · Tailnet Console')
    events.onerror = () => status('Disconnected — controls are unavailable. Keep this page open; your unsaved edits remain here.')
    events.onmessage = event => { const data = JSON.parse(event.data) as { channel: string; value: never }; dispatch(data.channel, data.value) }
    // Initial state plus recovery after a dropped stream; never reload operator edits.
    const snapshot = async () => {
      if (polling) return
      polling = true
      try {
        dispatch('console:snapshot', await invoke('getSnapshot', []) as never)
        status('Connected to Magic Mirror · Tailnet Console')
      } catch { /* Visible connection banner. */ }
      finally { polling = false }
    }
    void snapshot(); poll = setInterval(() => void snapshot(), 4000)
  }
  const subscribe = (channel: string, listener: Listener) => {
    const group = listeners.get(channel) ?? new Set<Listener>(); group.add(listener); listeners.set(channel, group); connect()
    return () => { group.delete(listener); if (![...listeners.values()].some(g => g.size)) { events?.close(); events = undefined; clearInterval(poll) } }
  }
  const bridge = Object.fromEntries(Object.keys(WEB_CONSOLE_METHODS).map(method => [method, (...args: unknown[]) => invoke(method, args)])) as unknown as ConsoleBridge
  Object.assign(bridge, {
    runScene: (id: string, scope?: unknown, source?: string) => invoke('runScene', [id, ...(source ? [scope ?? null, source] : scope ? [scope] : [])]),
    notifyReady() {},
    onSnapshot: (listener: Listener) => subscribe('console:snapshot', listener),
    onSceneStatus: (listener: Listener) => subscribe('console:scene-status', listener),
    simulate: unavailable, importAvatarModel: unavailable, uploadMusic: unavailable, uploadVisual: unavailable,
    importMedia: unavailable, finalizeVisual: unavailable, cancelVisual: unavailable,
  })
  Object.defineProperty(window, 'magicMirror', { value: Object.freeze(bridge) })
}
