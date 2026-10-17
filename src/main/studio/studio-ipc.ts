import { createChatgptTokenFile, type ChatgptCredentialSource } from '../chatgpt-auth/token-file'
import { PORTRAIT_STUDIO } from '../../shared/portrait-studio-config'
import {
  parseStudioConsoleCommand, parseStudioRequest, STUDIO_CONSOLE_CHANNEL, STUDIO_MIRROR_CHANNEL,
  type AvatarExperience, type StudioConsoleResult, type StudioConsoleStatus, type StudioReply, type StudioSessionEvent, type StudioView,
} from '../../shared/portrait-studio'
import type { ConsoleResponse } from '../../shared/console-types'
import { createCodexImageProvider, type PortraitImageProvider } from './image-provider'
import { buildPortraitPrompt } from './prompt-builder'
import { createStudioRuntime, type StudioIdentity } from './studio-runtime'

interface Registrar { handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void }
interface SnapshotLike { readonly lifecycle: string; readonly realtimeSessionId: string | null; readonly sessionGeneration: number }
type StudioCommand = { type: 'studio_view'; view: StudioView | null } | { type: 'studio_event'; event: StudioSessionEvent; identity: StudioIdentity }

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value: unknown, keys: string[]) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

/**
 * Portrait Studio IPC: Mirror tool requests and Console status/live controls.
 * Sender authorization and session identity checks follow `mirror:media-skill`.
 */
export function registerStudioIpc(deps: {
  ipcMain: Registrar
  authorize(event: unknown, kind: 'mirror' | 'console'): boolean
  payloadRejected(): void
  snapshot(): SnapshotLike
  /** Snapshot changes; the studio closes when its session is replaced or ends. */
  subscribe?(listener: (snapshot: SnapshotLike) => void): unknown
  experience(): Promise<AvatarExperience | null>
  dispatch(command: StudioCommand): boolean
  activity(kind: 'started' | 'finished', runId: string): void
  stopMedia(): Promise<void> | void
  report(reason: string, status: 'info' | 'degraded' | 'failed', durationMs?: number): void
  credentials?: ChatgptCredentialSource
  fetchImpl?: typeof fetch
}) {
  const credentials = deps.credentials ?? createChatgptTokenFile({ report: reason => deps.report(reason, /fail|invalid|missing|http_/.test(reason) ? 'degraded' : 'info') })
  const provider: PortraitImageProvider = createCodexImageProvider({ credentials, settings: PORTRAIT_STUDIO.image, fetchImpl: deps.fetchImpl,
    report: reason => deps.report(reason, 'info') })
  const runtime = createStudioRuntime({
    provider: () => provider,
    dispatch: command => deps.dispatch(command),
    activity: (kind, runId) => deps.activity(kind, runId),
    report: (reason, status, timingMs) => deps.report(reason, status ?? 'info', timingMs),
    stopMedia: () => deps.stopMedia(),
  })
  // Usable means a credential is available now: a refresh runs if due, and a
  // failed scheduled refresh still allows a token that has not expired.
  const usable = async () => (await credentials.get().catch(() => null)) !== null
  const identityOf = (snapshot: SnapshotLike): StudioIdentity | null => snapshot.lifecycle === 'active' && snapshot.realtimeSessionId !== null
    ? { realtimeSessionId: snapshot.realtimeSessionId, sessionGeneration: snapshot.sessionGeneration } : null
  const currentIdentity = (): StudioIdentity | null => identityOf(deps.snapshot())
  const sameIdentity = (a: StudioIdentity | null, b: StudioIdentity | null) =>
    !!a && !!b && a.realtimeSessionId === b.realtimeSessionId && a.sessionGeneration === b.sessionGeneration
  /**
   * A studio-default avatar enters the studio when a woken session becomes
   * active. Main decides (it owns the run); the Mirror only follows `enter`.
   * A rollover is not a new visit and never restarts the studio.
   */
  async function startDefault(identity: StudioIdentity): Promise<void> {
    const experience = await deps.experience().catch(() => null)
    if (experience?.defaultMode !== 'portrait_studio') return
    const ok = await usable()
    if (!sameIdentity(identity, currentIdentity())) return
    const result = ok ? runtime.start(identity, experience, 'session_default') : null
    if (result?.status === 'accepted') {
      deps.dispatch({ type: 'studio_event', event: { event: 'enter', startScript: experience.studio.startScript }, identity })
      return
    }
    // A Console or visitor start won the race; that start already entered the studio.
    if (result?.status === 'ignored') return
    deps.report(ok ? 'studio_default_unavailable' : 'studio_auth_required', 'degraded')
    // The Mirror greets with its ordinary wake greeting instead.
    deps.dispatch({ type: 'studio_event', event: { event: 'closed', reason: 'studio_default_unavailable' }, identity })
  }
  let previous: StudioIdentity | null = null
  deps.subscribe?.(snapshot => {
    const identity = identityOf(snapshot)
    runtime.syncIdentity(identity)
    const woke = identity !== null && previous === null
    previous = identity
    if (woke) void startDefault(identity).catch(() => deps.report('studio_default_unavailable', 'degraded'))
  })
  const matches = (identity: unknown): identity is StudioIdentity => {
    const current = currentIdentity()
    if (!current || !isRecord(identity) || !exactKeys(identity, ['realtimeSessionId', 'sessionGeneration'])) return false
    return identity.realtimeSessionId === current.realtimeSessionId && identity.sessionGeneration === current.sessionGeneration
  }
  const unavailable = (): StudioReply => ({ status: 'rejected', code: 'studio_unavailable', next: PORTRAIT_STUDIO.guidance.unavailable })

  deps.ipcMain.handle(STUDIO_MIRROR_CHANNEL, async (event, ...args): Promise<StudioReply> => {
    if (!deps.authorize(event, 'mirror')) return { status: 'rejected', code: 'studio_sender_rejected' }
    const envelope = args[0]
    const request = parseStudioRequest(isRecord(envelope) ? envelope.request : undefined)
    if (args.length !== 1 || !exactKeys(envelope, ['request', 'identity']) || !request) { deps.payloadRejected(); return { status: 'rejected', code: 'studio_request_invalid' } }
    const identity = (envelope as Record<string, unknown>).identity
    if (!matches(identity)) { deps.report('studio_session_stale', 'info'); return { status: 'ignored', code: 'studio_session_stale' } }
    if (request.action !== 'start') return runtime.handle(request, identity)
    const experience = await deps.experience().catch(() => null)
    if (!experience) { deps.report('studio_config_unavailable', 'degraded'); return unavailable() }
    if (!await usable()) { deps.report('studio_auth_required', 'degraded'); return unavailable() }
    if (!matches(identity)) return { status: 'ignored', code: 'studio_session_stale' }
    return runtime.start(identity, experience, request.source)
  })

  async function status(): Promise<StudioConsoleStatus> {
    const auth = await credentials.status()
    const phase = runtime.phase()
    return { auth: auth.status, ...(auth.lastRefresh ? { lastRefresh: auth.lastRefresh } : {}), modelId: PORTRAIT_STUDIO.image.modelId,
      active: runtime.isActive(), ...(phase ? { phase } : {}) }
  }

  deps.ipcMain.handle(STUDIO_CONSOLE_CHANNEL, async (event, ...args): Promise<ConsoleResponse<StudioConsoleResult>> => {
    if (!deps.authorize(event, 'console')) return { ok: false, error: 'console_request_rejected', reason: 'cause=sender_rejected' }
    const command = parseStudioConsoleCommand(args[0])
    if (args.length !== 1 || !command) { deps.payloadRejected(); return { ok: false, error: 'console_request_invalid', reason: 'cause=payload_schema_invalid' } }
    if (command.action === 'status') return { ok: true, value: { status: await status() } }
    if (command.action === 'exit') {
      const active = runtime.isActive()
      runtime.close('studio_operator_exit')
      return { ok: true, value: { status: await status(), action: { status: active ? 'accepted' : 'ignored', code: active ? 'studio_operator_exit' : 'studio_not_active' } } }
    }
    if (command.action === 'start') {
      const identity = currentIdentity()
      const experience = await deps.experience().catch(() => null)
      if (!identity) return { ok: true, value: { status: await status(), action: { status: 'rejected', code: 'studio_requires_active_session' } } }
      if (!experience || !await usable()) return { ok: true, value: { status: await status(), action: { status: 'rejected', code: 'studio_unavailable' } } }
      // The session may have ended or rolled over while config and sign-in were checked.
      if (!sameIdentity(identity, currentIdentity())) return { ok: true, value: { status: await status(), action: { status: 'rejected', code: 'studio_requires_active_session' } } }
      const result = runtime.start(identity, experience, 'console')
      if (result.status === 'accepted') deps.dispatch({ type: 'studio_event', event: { event: 'enter', startScript: experience.studio.startScript }, identity })
      return { ok: true, value: { status: await status(), action: { status: result.status, code: result.code } } }
    }
    // Test portrait: shown in the Console only, never saved.
    const experience = await deps.experience().catch(() => null)
    if (!experience) return { ok: true, value: { status: await status(), test: { ok: false, code: 'studio_config_unavailable', elapsedMs: 0 } } }
    const samples = ['an owl', 'a seaside at night', 'light mist', 'deep blue', 'a small fox', 'soft candlelight', 'a lantern', 'falling leaves']
    const answers = experience.studio.questions.map((question, index) => ({ slot: question.slot, answer: samples[index % samples.length]! }))
    const result = await provider.generate({ prompt: buildPortraitPrompt({ studio: experience.studio, answers, name: 'Raven' }), quality: experience.studio.quality })
    deps.report(result.ok ? 'studio_test_ready' : result.code, result.ok ? 'info' : 'degraded', result.elapsedMs)
    return { ok: true, value: { status: await status(), test: result.ok
      ? { ok: true, elapsedMs: result.elapsedMs, dataUrl: `data:${result.mimeType};base64,${result.image.toString('base64')}` }
      : { ok: false, code: result.code, elapsedMs: result.elapsedMs } } }
  })

  return {
    close: (reason: string) => runtime.close(reason),
    image: (id: string) => runtime.image(id),
  }
}

export type StudioIpc = ReturnType<typeof registerStudioIpc>
