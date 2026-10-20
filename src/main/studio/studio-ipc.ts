import { CHATGPT_KEEPALIVE_INTERVAL_MS } from '../chatgpt-auth/constants'
import { createChatgptTokenFile, type ChatgptCredentialSource } from '../chatgpt-auth/token-file'
import { PORTRAIT_STUDIO, studioPrompt, studioWakePhrase } from '../../shared/portrait-studio-config'
import {
  parseStudioConsoleCommand, parseStudioRequest, STUDIO_CONSOLE_CHANNEL, STUDIO_MIRROR_CHANNEL, studioPictureType, studioStartLanguage,
  type AvatarExperience, type MirrorMode, type StudioConsoleResult, type StudioConsoleStatus, type StudioOutcome, type StudioReply,
  type StudioSessionEvent, type StudioView,
} from '../../shared/portrait-studio'
import { STUDIO_SAMPLE_ANSWERS } from '../../shared/studio-image-prompt'
import type { MirrorModeStore } from '../mirror-mode'
import type { ConsoleResponse } from '../../shared/console-types'
import { createCodexImageProvider, type PortraitImageProvider } from './image-provider'
import { buildPortraitPrompt } from './prompt-builder'
import { createStudioRuntime, type KeepsakeSink, type StudioIdentity } from './studio-runtime'

interface Registrar { handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void }
interface SnapshotLike { readonly lifecycle: string; readonly realtimeSessionId: string | null; readonly sessionGeneration: number }
type StudioCommand = { type: 'studio_view'; view: StudioView | null } | { type: 'studio_event'; event: StudioSessionEvent; identity: StudioIdentity }

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value: unknown, keys: string[]) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

/**
 * Interactive Studio IPC: Mirror tool requests, Console status/live controls and
 * the Mirror mode switch. Sender authorization and session identity checks
 * follow `mirror:media-skill`.
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
  /** Production only: refresh the sign-in in the background so it never lapses while idle. */
  keepSignedIn?: boolean
  /** The Mirror switch. Without it (tests), the saved per-avatar default mode applies. */
  mirrorMode?: Pick<MirrorModeStore, 'get' | 'set' | 'sessionMode' | 'subscribe'>
  /** Where finished pictures go besides the Mirror. PRINTING (to be added): pass the printer skill's sink here. */
  keepsakeSinks?: readonly KeepsakeSink[]
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
    keepsakeSinks: deps.keepsakeSinks ?? [],
  })
  if (deps.keepSignedIn && credentials.keepAlive) {
    const keepAlive = () => void credentials.keepAlive!().catch(() => deps.report('chatgpt_keepalive_failed', 'degraded'))
    keepAlive()
    setInterval(keepAlive, CHATGPT_KEEPALIVE_INTERVAL_MS).unref()
  }
  // Usable means a credential is available now: a refresh runs if due, and a
  // failed scheduled refresh still allows a token that has not expired.
  const usable = async () => (await credentials.get().catch(() => null)) !== null
  const identityOf = (snapshot: SnapshotLike): StudioIdentity | null => snapshot.lifecycle === 'active' && snapshot.realtimeSessionId !== null
    ? { realtimeSessionId: snapshot.realtimeSessionId, sessionGeneration: snapshot.sessionGeneration } : null
  const currentIdentity = (): StudioIdentity | null => identityOf(deps.snapshot())
  const sameIdentity = (a: StudioIdentity | null, b: StudioIdentity | null) =>
    !!a && !!b && a.realtimeSessionId === b.realtimeSessionId && a.sessionGeneration === b.sessionGeneration
  /**
   * In Interactive Studio mode a woken session enters the studio. The mode is
   * the one captured for this session (the renderer's greeting used the same).
   * Main decides (it owns the run); the Mirror only follows `enter`. A rollover
   * is not a new visit and never restarts the studio.
   */
  async function startDefault(identity: StudioIdentity): Promise<void> {
    const sessionMode = deps.mirrorMode?.sessionMode(identity)
    // Switched on while this session was still waking: start it like a live switch.
    if (sessionMode === 'conversation' && deps.mirrorMode?.get() === 'studio') { await applyMode('studio'); return }
    const saved = await deps.experience().catch(() => null)
    if (sessionMode ? sessionMode !== 'studio' : saved?.defaultMode !== 'portrait_studio') return
    const experience = saved && { ...saved, defaultMode: 'portrait_studio' as const }
    const ok = !!experience && await usable()
    if (!sameIdentity(identity, currentIdentity())) return
    const result = ok ? runtime.start(identity, experience, 'session_default') : null
    if (experience && result?.status === 'accepted') {
      deps.dispatch({ type: 'studio_event', event: { event: 'enter', startScript: experience.studio.startScript, firstStep: result.next ?? '',
        language: studioStartLanguage(experience.studio.startScript) }, identity })
      return
    }
    // A Console or visitor start won the race; that start already entered the studio.
    if (result?.status === 'ignored') return
    deps.report(!experience ? 'studio_config_unavailable' : ok ? 'studio_default_unavailable' : 'studio_auth_required', 'degraded')
    // The Mirror greets with its ordinary wake greeting instead.
    deps.dispatch({ type: 'studio_event', event: { event: 'closed', reason: 'studio_default_unavailable' }, identity })
  }
  /** Console or mode-switch start inside the current conversation. */
  async function startFor(identity: StudioIdentity, source: 'console' | 'mode'): Promise<{ status: StudioOutcome; code: string }> {
    const experience = await deps.experience().catch(() => null)
    if (!experience || !await usable()) return { status: 'rejected', code: 'studio_unavailable' }
    // The session may have ended or rolled over while config and sign-in were checked.
    if (!sameIdentity(identity, currentIdentity())) return { status: 'rejected', code: 'studio_requires_active_session' }
    const result = runtime.start(identity, experience, source)
    if (result.status === 'accepted') deps.dispatch({ type: 'studio_event', event: { event: 'enter', startScript: experience.studio.startScript, firstStep: result.next ?? '',
        language: studioStartLanguage(experience.studio.startScript) }, identity })
    return { status: result.status, code: result.code }
  }
  /** A live switch applies to the visitor now: Interactive Studio starts, Conversation closes the studio. */
  async function applyMode(mode: MirrorMode): Promise<void> {
    if (mode === 'conversation') { if (runtime.isActive()) runtime.close('studio_operator_exit'); return }
    const identity = currentIdentity()
    if (!identity || runtime.activeFor(identity)) return
    const result = await startFor(identity, 'mode')
    if (result.status === 'rejected' || result.status === 'failed') deps.report(`studio_mode_start_${result.code.replace(/^studio_/, '')}`, 'degraded')
  }
  deps.mirrorMode?.subscribe(mode => { void applyMode(mode).catch(() => deps.report('studio_mode_start_failed', 'degraded')) })
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
  const unavailable = (experience?: AvatarExperience | null): StudioReply => ({ status: 'rejected', code: 'studio_unavailable', next: studioPrompt(experience?.studio, 'unavailable') })

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
    if (!await usable()) { deps.report('studio_auth_required', 'degraded'); return unavailable(experience) }
    if (!matches(identity)) return { status: 'ignored', code: 'studio_session_stale' }
    return runtime.start(identity, experience, request.source)
  })

  async function status(): Promise<StudioConsoleStatus> {
    const auth = await credentials.status()
    const experience = await deps.experience().catch(() => null)
    const phase = runtime.phase()
    return { auth: auth.status, ...(auth.lastRefresh ? { lastRefresh: auth.lastRefresh } : {}), modelId: PORTRAIT_STUDIO.image.modelId,
      active: runtime.isActive(), ...(phase ? { phase } : {}), mirrorMode: deps.mirrorMode?.get() ?? 'conversation',
      ...(experience ? { wakePhrase: studioWakePhrase(experience.studio) } : {}) }
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
    if (command.action === 'mode') {
      const saved = deps.mirrorMode?.set(command.mode, 'console') ?? false
      return { ok: true, value: { status: await status(), action: saved ? { status: 'accepted', code: `mirror_mode_${command.mode}` } : { status: 'failed', code: 'mirror_mode_save_failed' } } }
    }
    if (command.action === 'start') {
      const identity = currentIdentity()
      const action = identity ? await startFor(identity, 'console') : { status: 'rejected' as const, code: 'studio_requires_active_session' }
      return { ok: true, value: { status: await status(), action } }
    }
    // Test portrait: shown in the Console only, never saved.
    const experience = await deps.experience().catch(() => null)
    if (!experience) return { ok: true, value: { status: await status(), test: { ok: false, code: 'studio_config_unavailable', elapsedMs: 0 } } }
    const answers = experience.studio.questions.map((question, index) => ({ slot: question.slot, imageLine: question.imageLine,
      answer: STUDIO_SAMPLE_ANSWERS[index % STUDIO_SAMPLE_ANSWERS.length]! }))
    const name = experience.studio.askName === false ? '' : 'Raven'
    const result = await provider.generate({ prompt: buildPortraitPrompt({ studio: experience.studio, answers, name }), quality: experience.studio.quality, picture: studioPictureType(experience.studio) })
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
