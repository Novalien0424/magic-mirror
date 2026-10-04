import { parseMemoryRequest, validMemoryText, type MemoryConsoleRequest, type MemoryReply } from '../../shared/memory'
import type { MemoryStore } from './store'
import { MemorySession, type MemoryState } from './session'

interface Options {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
  authorize(event: unknown, kind: 'mirror' | 'console'): boolean
  state(): MemoryState
  store(): MemoryStore
  knownAvatar(id: string): Promise<boolean>
  resetConversation(): Promise<unknown>
  canEdit(): boolean
  report(code: string): void
}
const rejected = (code = 'memory_request_rejected'): MemoryReply => ({ status: 'rejected', code })
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** Separate content-bearing IPC. It never passes through telemetry or the public prompt inspector. */
export function registerMemoryIpc(options: Options): { observe(): void } {
  const session = new MemorySession({
    save: (...args) => options.store().save(...args),
    recall: (...args) => options.store().recall(...args),
    forget: (...args) => options.store().forget(...args),
  })
  const current = (identity: unknown): MemoryState | null => {
    const state = options.state()
    return state.active && state.avatarId && object(identity) && Object.keys(identity).length === 2
      && identity.realtimeSessionId === state.realtimeSessionId && identity.sessionGeneration === state.sessionGeneration ? state : null
  }
  options.handle('mirror:memory', async (event, ...args) => {
    if (!options.authorize(event, 'mirror') || args.length !== 1 || !object(args[0])) return rejected()
    const envelope = args[0]
    if (Object.keys(envelope).length !== 2) return rejected()
    const state = current(envelope.identity), request = parseMemoryRequest(envelope.request)
    if (!state || !request) return rejected('memory_session_unavailable')
    const result = session.request(state, request)
    options.report(result.code)
    return result
  })
  options.handle('mirror:memory-input', (event, ...args) => {
    if (!options.authorize(event, 'mirror') || args.length !== 1 || !object(args[0])) return rejected()
    const envelope = args[0], state = current(envelope.identity)
    if (!state || Object.keys(envelope).length !== 4 || !validMemoryText(envelope.itemId, 128)
      || !['start', 'complete'].includes(envelope.phase as string) || typeof envelope.transcript !== 'string' || envelope.transcript.length > 16000) return rejected()
    if (envelope.phase === 'start') { session.turnStart(state, envelope.itemId); return { status: 'accepted', code: 'memory_turn_observed' } }
    const result = session.transcript(state, envelope.itemId, envelope.transcript)
    if (!['memory_no_pending_confirmation', 'memory_confirmation_stale'].includes(result.code)) options.report(result.code)
    return result
  })
  options.handle('mirror:memory-reset', async (event, ...args) => {
    if (!options.authorize(event, 'mirror') || args.length !== 1 || !current(args[0])) return rejected()
    session.reset()
    try { await options.resetConversation(); return { status: 'accepted', code: 'memory_session_replaced' } }
    catch { options.report('memory_session_reset_failed'); return { status: 'failed', code: 'memory_session_reset_failed' } }
  })
  options.handle('console:memory', async (event, ...args) => {
    if (!options.authorize(event, 'console') || args.length !== 1 || !object(args[0])) return rejected()
    const v = args[0]
    if (Object.keys(v).length !== 6 || !['list', 'save', 'delete'].includes(v.action as string)
      || !validMemoryText(v.avatarId, 128) || !validMemoryText(v.name, 80, true) || !validMemoryText(v.topic, 120, true)
      || !validMemoryText(v.text, 1000, true) || !validMemoryText(v.query, 200, true)) return rejected()
    const request = v as unknown as MemoryConsoleRequest
    try {
      if (!await options.knownAvatar(request.avatarId)) return rejected('memory_avatar_unavailable')
      // Mutations while voice owns old private context would leave stale facts in that conversation.
      if (request.action !== 'list' && !options.canEdit()) return rejected('memory_end_conversation_first')
      const store = options.store()
      if (request.action === 'save') store.save(request.avatarId, request.name, request.topic, request.text)
      if (request.action === 'delete') store.forget(request.avatarId, request.name, request.topic)
      return { status: 'accepted', code: 'memory_console_ready', names: store.names(request.avatarId),
        entries: request.name.trim() ? store.list(request.avatarId, request.name, request.query) : [] }
    } catch { options.report('memory_storage_unavailable'); return { status: 'failed', code: 'memory_storage_unavailable' } }
  })
  return { observe: () => session.observe(options.state()) }
}
