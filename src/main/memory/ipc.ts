import { parseMemoryRequest, validMemoryText, type MemoryConsoleRequest, type MemoryReply, type MemoryMode, type MemoryInputPhase } from '../../shared/memory'
import type { MemoryRepository, MemoryEmbedder } from './contracts'
import type { MemoryState } from './session'
import { RelationshipMemory } from './relationship'
import type { MemoryLearning } from './learning'
import type { MemoryImporter } from './import'
import type { MemoryInterpreter } from './intent'

interface Options {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
  authorize(event: unknown, kind: 'mirror' | 'console'): boolean
  state(): MemoryState
  store(): MemoryRepository
  learning: Pick<MemoryLearning, 'observe' | 'flush' | 'invalidate' | 'exclude'>
  embedder?: MemoryEmbedder
  interpret?: MemoryInterpreter
  controlPhrases?(): Promise<string[]>
  onChanged?(): void
  importer?: MemoryImporter
  pickMarkdown?(): Promise<string | null>
  knownAvatar(id: string): Promise<boolean>
  resetConversation(): Promise<unknown>
  canEdit(): boolean
  report(code: string): void
}
const rejected = (code = 'memory_request_rejected'): MemoryReply => ({ status: 'rejected', code })
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** Separate content-bearing IPC. It never passes through telemetry or the public prompt inspector. */
export function registerMemoryIpc(options: Options): { observe(): void; close(): void; relationship: RelationshipMemory } {
  const session = new RelationshipMemory({ repository: options.store(), learning: options.learning,
    embedder: options.embedder, interpret: options.interpret, report: options.report, controlPhrases: options.controlPhrases ?? (async () => []), onChanged: options.onChanged })
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
    try {
      const result = await session.request(state, request)
      options.report(result.code)
      return result
    } catch { options.report('memory_storage_unavailable'); return { status: 'failed', code: 'memory_storage_unavailable' } }
  })
  options.handle('mirror:memory-input', async (event, ...args) => {
    if (!options.authorize(event, 'mirror') || args.length !== 1 || !object(args[0])) return rejected()
    const envelope = args[0], state = current(envelope.identity)
    if (!state || Object.keys(envelope).length !== 4 || !validMemoryText(envelope.itemId, 128)
      || !['speech', 'start', 'complete', 'settled', 'control', 'question_played', 'question_cancelled'].includes(envelope.phase as string) || typeof envelope.transcript !== 'string' || envelope.transcript.length > 16000) return rejected()
    try {
      const result = await session.input(state, envelope.phase as MemoryInputPhase, envelope.itemId, envelope.transcript)
      if (!['memory_no_pending_confirmation', 'memory_confirmation_stale'].includes(result.code)) options.report(result.code)
      return result
    } catch { options.report('memory_storage_unavailable'); return { status: 'failed', code: 'memory_storage_unavailable' } }
  })
  options.handle('mirror:memory-reset', async (event, ...args) => {
    if (!options.authorize(event, 'mirror') || args.length !== 1 || !current(args[0])) return rejected()
    try { await options.resetConversation(); await session.reset(); return { status: 'accepted', code: 'memory_session_replaced' } }
    catch { options.report('memory_session_reset_failed'); return { status: 'failed', code: 'memory_session_reset_failed' } }
  })
  options.handle('console:memory', async (event, ...args) => {
    if (!options.authorize(event, 'console') || args.length !== 1 || !object(args[0])) return rejected()
    const v = args[0]
    if (Object.keys(v).length !== 6 || !['list', 'save', 'delete', 'policy'].includes(v.action as string)
      || !validMemoryText(v.avatarId, 128) || !validMemoryText(v.name, 80, true) || !validMemoryText(v.topic, 120, true)
      || !validMemoryText(v.text, 1000, true) || !validMemoryText(v.query, 200, true)) return rejected()
    const request = v as unknown as MemoryConsoleRequest
    try {
      if (!await options.knownAvatar(request.avatarId)) return rejected('memory_avatar_unavailable')
      // Mutations while voice owns old private context would leave stale facts in that conversation.
      if (request.action !== 'list' && !options.canEdit()) return rejected('memory_end_conversation_first')
      if (request.action !== 'list' && options.importer?.status().state === 'running') return rejected('memory_import_busy')
      const store = options.store()
      if (request.action !== 'list') options.learning.invalidate(request.avatarId, request.name)
      if (request.action === 'save') await store.save(request.avatarId, request.name, request.topic, request.text)
      if (request.action === 'delete') await store.forget(request.avatarId, request.name, request.topic)
      if (request.action === 'policy') {
        if (!['automatic', 'explicit', 'off'].includes(request.text) || !request.name.trim()) return rejected()
        await store.setPolicy(request.avatarId, request.name, request.text as MemoryMode)
      }
      // Dormant means no provider conversation can retain this scope's prior values.
      if (request.action !== 'list') {
        if (options.canEdit()) await store.setCleanupRequired(request.avatarId, request.name, false)
        else await options.resetConversation()
        options.onChanged?.()
      }
      const policy = request.name.trim() ? await store.policy(request.avatarId, request.name) : undefined
      const found = request.name.trim() && request.query.trim() && options.embedder ? await options.embedder.embed(request.query, 'query', AbortSignal.timeout(1500)).catch(() => undefined) : undefined
      const matches = request.name.trim() && request.query.trim() && found ? await store.hybridRecall(request.avatarId, request.name, request.query, found) : undefined
      return { status: 'accepted', code: 'memory_console_ready', names: await store.names(request.avatarId), mode: policy?.mode,
        entries: matches?.entries ?? (request.name.trim() ? await store.list(request.avatarId, request.name, request.query) : []) }
    } catch { options.report('memory_storage_unavailable'); return { status: 'failed', code: 'memory_storage_unavailable' } }
  })
  options.handle('console:memory-import', async (event, ...args) => {
    const failure = (code: string) => ({ state: 'failed', chunks: 0, processed: 0, saved: 0, persona: '', code })
    if (!options.authorize(event, 'console') || args.length !== 1 || !object(args[0]) || !options.importer) return failure('memory_import_rejected')
    const v = args[0]
    if (Object.keys(v).length !== 3 || !['pick', 'start', 'status', 'cancel'].includes(v.action as string)
      || !validMemoryText(v.avatarId, 128) || !validMemoryText(v.name, 80)) return failure('memory_import_rejected')
    try {
      if (!await options.knownAvatar(v.avatarId)) return failure('memory_avatar_unavailable')
      if (v.action === 'status') return options.importer.status()
      if (v.action === 'cancel') return options.importer.cancel()
      if (!options.canEdit()) return failure('memory_end_conversation_first')
      if (v.action === 'pick') {
        const markdown = await options.pickMarkdown?.()
        if (markdown == null) return options.importer.status()
        if (!options.canEdit()) return failure('memory_end_conversation_first')
        return options.importer.stage(v.avatarId, v.name, markdown)
      }
      if (!options.importer.owns(v.avatarId, v.name)) return failure('memory_import_scope_changed')
      options.learning.invalidate(v.avatarId, v.name)
      return options.importer.start()
    } catch (error) {
      const code = error instanceof Error && ['memory_import_too_large', 'memory_import_persona_too_large', 'memory_import_empty', 'memory_import_busy'].includes(error.message) ? error.message : 'memory_import_failed'
      options.report(code); return failure(code)
    }
  })
  return { observe: () => session.observe(options.state()), close: () => session.close(), relationship: session }
}
