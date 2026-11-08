import type { AvatarImageService } from '../avatar/image-service'
import { PORTRAIT_STUDIO, studioPrompt, studioWakePhrase } from '../../shared/portrait-studio-config'
import {
  parseStudioConsoleCommand, parseStudioRequest, STUDIO_CONSOLE_CHANNEL, STUDIO_MIRROR_CHANNEL, studioPictureType, studioStartLanguage,
  type AvatarExperience, type MirrorMode, type StudioConsoleResult, type StudioConsoleStatus, type StudioOutcome, type StudioReply,
  type StudioSessionEvent, type StudioView,
} from '../../shared/portrait-studio'
import { STUDIO_SAMPLE_ANSWERS } from '../../shared/studio-image-prompt'
import type { MirrorModeStore } from '../mirror-mode'
import type { ConsoleResponse } from '../../shared/console-types'
import { buildPortraitPrompt } from './prompt-builder'
import { createStudioRuntime, type KeepsakeSink, type StudioIdentity, type StudioStartSource } from './studio-runtime'
import { deferredPrinterSkill } from './printer-skill'
import { matchGuestNames } from './guest-names'
import { isWebConsoleEvent } from '../web-console'

interface Registrar { handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void }
interface SnapshotLike { readonly lifecycle: string; readonly realtimeSessionId: string | null; readonly sessionGeneration: number }
type StudioCommand = { type: 'studio_view'; view: StudioView | null } | { type: 'studio_event'; event: StudioSessionEvent; identity: StudioIdentity }

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value: unknown, keys: string[]) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
/** The Mirror gives up on a studio-default greeting after 10 s; Main decides, and says so, before that. */
export const STUDIO_DEFAULT_START_DEADLINE_MS = 9000
/** A plan-limit or sign-in failure pauses new visits this long (or until an image succeeds): a full interview would end without a picture. */
export const STUDIO_IMAGE_PAUSE_MS = 15 * 60_000
const PAUSING_FAILURES: readonly string[] = ['studio_quota_exhausted', 'studio_auth_required']

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
  photoPending?(): boolean
  report(reason: string, status: 'info' | 'degraded' | 'failed', durationMs?: number): void
  images: AvatarImageService
  /** Session-pinned assignment; without an identity checks the published avatar. */
  imageEnabled(identity?: StudioIdentity): boolean
  /** The Mirror switch. Without it (tests), the saved per-avatar default mode applies. */
  mirrorMode?: Pick<MirrorModeStore, 'get' | 'set' | 'sessionMode' | 'subscribe'>
  /** Where finished pictures go besides the Mirror. PRINTING (to be added): pass the printer skill's sink here. */
  keepsakeSinks?: readonly KeepsakeSink[]
  now?: () => number
}) {
  const { provider, usable } = deps.images
  const now = deps.now ?? Date.now
  // Metadata only: the last failed picture (run or Console test) and whether any picture succeeded since.
  let lastFailure: { code: string; at: number } | null = null, succeededSince = false
  const noteImage = (result: { ok: true } | { ok: false; code: string }) => {
    if (result.ok) { succeededSince = true; return }
    if (result.code === 'studio_cancelled') return
    lastFailure = { code: result.code, at: now() }; succeededSince = false
  }
  /** The reason a new visit is refused right now, or null. */
  const paused = (): string | null => lastFailure && !succeededSince && PAUSING_FAILURES.includes(lastFailure.code)
    && now() - lastFailure.at < STUDIO_IMAGE_PAUSE_MS ? `studio_paused_${lastFailure.code.replace(/^studio_/, '')}` : null
  // Reports made while one Mirror request is handled, so each non-accepted reply is reported exactly once.
  let handling: Set<string> | null = null
  const runtime = createStudioRuntime({
    provider: () => provider,
    dispatch: command => deps.dispatch(command),
    activity: (kind, runId) => deps.activity(kind, runId),
    report: (reason, status, timingMs) => { handling?.add(reason); deps.report(reason, status ?? 'info', timingMs) },
    imageResult: noteImage,
    stopMedia: () => deps.stopMedia(),
    keepsakeSinks: deps.keepsakeSinks ?? [deferredPrinterSkill(reason => deps.report(reason, 'info'))],
  })
  const reported = (reply: StudioReply, already: ReadonlySet<string> = new Set()): StudioReply => {
    // Invariant 9: stale, duplicate and wrong-step replies are routine races, so info unless the request failed.
    if (reply.status !== 'accepted' && !already.has(reply.code)) deps.report(reply.code, reply.status === 'failed' ? 'degraded' : 'info')
    return reply
  }
  const handleOnce = <T extends StudioReply>(handle: () => T): T => {
    const seen = handling = new Set()
    try { return reported(handle(), seen) as T } finally { handling = null }
  }
  const identityOf = (snapshot: SnapshotLike): StudioIdentity | null => snapshot.lifecycle === 'active' && snapshot.realtimeSessionId !== null
    ? { realtimeSessionId: snapshot.realtimeSessionId, sessionGeneration: snapshot.sessionGeneration } : null
  const currentIdentity = (): StudioIdentity | null => identityOf(deps.snapshot())
  const sameIdentity = (a: StudioIdentity | null, b: StudioIdentity | null) =>
    !!a && !!b && a.realtimeSessionId === b.realtimeSessionId && a.sessionGeneration === b.sessionGeneration
  // Leaving the studio (Conversation switch, exit, scene) also cancels starts still checking config and sign-in.
  let startEpoch = 0
  const exit = (reason: string) => { startEpoch += 1; runtime.close(reason) }
  /** Rechecked after the async checks: an exit since, or a studio-mode start whose switch is now off. */
  function startCancelled(epoch: number, source: StudioStartSource): boolean {
    const cancelled = epoch !== startEpoch || (source === 'mode' || source === 'session_default') && deps.mirrorMode?.get() === 'conversation'
    if (cancelled) deps.report('studio_start_cancelled', 'info')
    return cancelled
  }
  /**
   * In Interactive Studio mode a woken session enters the studio. The mode is
   * the one captured for this session (the renderer's greeting used the same).
   * Main decides (it owns the run); the Mirror only follows `enter`. A rollover
   * is not a new visit and never restarts the studio.
   */
  async function startDefault(identity: StudioIdentity): Promise<void> {
    if (!deps.imageEnabled(identity)) {
      deps.report('studio_skill_disabled', 'info')
      deps.dispatch({ type: 'studio_event', event: { event: 'closed', reason: 'studio_skill_disabled' }, identity })
      return
    }
    const epoch = startEpoch
    const sessionMode = deps.mirrorMode?.sessionMode(identity)
    // Switched on while this session was still waking: start it like a live switch.
    if (sessionMode === 'conversation' && deps.mirrorMode?.get() === 'studio') { await applyMode('studio'); return }
    // Config and a sign-in refresh may take longer than the Mirror waits to greet. Past the
    // deadline the Mirror greets normally now, and a late check never enters (no double greeting).
    let studioSession = sessionMode ? sessionMode === 'studio' : undefined, late = false
    const deadline = setTimeout(() => {
      late = true
      if (studioSession === false || !sameIdentity(identity, currentIdentity()) || runtime.activeFor(identity)) return
      deps.report('studio_default_timeout', 'degraded')
      deps.dispatch({ type: 'studio_event', event: { event: 'closed', reason: 'studio_default_unavailable' }, identity })
    }, STUDIO_DEFAULT_START_DEADLINE_MS)
    try {
      const saved = await deps.experience().catch(() => null)
      studioSession ??= saved?.defaultMode === 'portrait_studio'
      if (!studioSession || late) return
      const experience = saved && { ...saved, defaultMode: 'portrait_studio' as const }
      const pause = paused()
      const ok = !!experience && !pause && await usable()
      if (late || !sameIdentity(identity, currentIdentity())) return
      if (startCancelled(epoch, 'session_default')) {
        // The Mirror greets normally, unless the switch turned back on and that start already entered the studio.
        if (!runtime.activeFor(identity)) deps.dispatch({ type: 'studio_event', event: { event: 'closed', reason: 'studio_start_cancelled' }, identity })
        return
      }
      const result = ok ? runtime.start(identity, experience, 'session_default') : null
      if (experience && result?.status === 'accepted') {
        deps.dispatch({ type: 'studio_event', event: { event: 'enter', startScript: experience.studio.startScript, firstStep: result.next ?? '',
          language: studioStartLanguage(experience.studio.startScript), step: result.step }, identity })
        return
      }
      // A Console or visitor start won the race; that start already entered the studio.
      if (result?.status === 'ignored') return
      deps.report(!experience ? 'studio_config_unavailable' : pause ?? (ok ? 'studio_default_unavailable' : 'studio_auth_required'), 'degraded')
      // The Mirror greets with its ordinary wake greeting instead.
      deps.dispatch({ type: 'studio_event', event: { event: 'closed', reason: 'studio_default_unavailable' }, identity })
    } finally { clearTimeout(deadline) }
  }
  /** Console or mode-switch start inside the current conversation. */
  async function startFor(identity: StudioIdentity, source: 'console' | 'mode'): Promise<{ status: StudioOutcome; code: string }> {
    if (!deps.imageEnabled(identity)) return { status: 'rejected', code: 'studio_skill_disabled' }
    const epoch = startEpoch
    const experience = await deps.experience().catch(() => null)
    const pause = paused()
    if (pause) { deps.report(pause, 'degraded'); return { status: 'rejected', code: pause } }
    if (!experience || !await usable()) return { status: 'rejected', code: 'studio_unavailable' }
    // The session may have ended or rolled over while config and sign-in were checked.
    if (!sameIdentity(identity, currentIdentity())) return { status: 'rejected', code: 'studio_requires_active_session' }
    if (startCancelled(epoch, source)) return { status: 'ignored', code: 'studio_start_cancelled' }
    const result = runtime.start(identity, experience, source)
    if (result.status === 'accepted') deps.dispatch({ type: 'studio_event', event: { event: 'enter', startScript: experience.studio.startScript, firstStep: result.next ?? '',
        language: studioStartLanguage(experience.studio.startScript), step: result.step }, identity })
    return { status: result.status, code: result.code }
  }
  /** A live switch applies to the visitor now: Interactive Studio starts, Conversation closes the studio. */
  async function applyMode(mode: MirrorMode): Promise<void> {
    if (mode === 'conversation') { exit('studio_operator_exit'); return }
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
    if (request.action !== 'exit' && !deps.imageEnabled(identity)) {
      deps.report('studio_skill_disabled', 'info'); return { status: 'rejected', code: 'studio_skill_disabled' }
    }
    if (request.action !== 'exit' && request.action !== 'step_activity' && deps.photoPending?.()) return reported({ status: 'ignored', code: 'studio_photo_pending' })
    if (request.action !== 'start') return handleOnce(() => runtime.handle(request, identity))
    const epoch = startEpoch
    const experience = await deps.experience().catch(() => null)
    if (!experience) { deps.report('studio_config_unavailable', 'degraded'); return unavailable() }
    const pause = paused()
    if (pause) { deps.report(pause, 'degraded'); return unavailable(experience) }
    if (!await usable()) { deps.report('studio_auth_required', 'degraded'); return unavailable(experience) }
    if (!matches(identity)) { deps.report('studio_session_stale', 'info'); return { status: 'ignored', code: 'studio_session_stale' } }
    if (startCancelled(epoch, request.source)) return { ...unavailable(experience), code: 'studio_start_cancelled' }
    return handleOnce(() => runtime.start(identity, experience, request.source))
  })

  async function status(): Promise<StudioConsoleStatus> {
    const auth = await deps.images.status()
    const experience = await deps.experience().catch(() => null)
    const phase = runtime.phase()
    const failure = lastFailure && { code: lastFailure.code, at: new Date(lastFailure.at).toISOString(),
      ...(paused() ? { pausedUntil: new Date(lastFailure.at + STUDIO_IMAGE_PAUSE_MS).toISOString() } : {}) }
    return { auth: auth.status, ...(auth.lastRefresh ? { lastRefresh: auth.lastRefresh } : {}), modelId: PORTRAIT_STUDIO.image.modelId,
      active: runtime.isActive(), imageSkillEnabled: deps.imageEnabled(currentIdentity() ?? undefined),
      ...(phase ? { phase } : {}), mirrorMode: deps.imageEnabled(currentIdentity() ?? undefined) ? deps.mirrorMode?.get() ?? 'conversation' : 'conversation',
      ...(experience ? { wakePhrase: studioWakePhrase(experience.studio) } : {}), ...(failure ? { lastImageFailure: failure } : {}) }
  }

  deps.ipcMain.handle(STUDIO_CONSOLE_CHANNEL, async (event, ...args): Promise<ConsoleResponse<StudioConsoleResult>> => {
    if (!deps.authorize(event, 'console')) return { ok: false, error: 'console_request_rejected', reason: 'cause=sender_rejected' }
    const command = parseStudioConsoleCommand(args[0])
    if (args.length !== 1 || !command) { deps.payloadRejected(); return { ok: false, error: 'console_request_invalid', reason: 'cause=payload_schema_invalid' } }
    if (command.action === 'status') return { ok: true, value: { status: await status() } }
    // CONSOLE-02: the name-match test stays on the Mac, and a remote test picture would spend the plan's images.
    if ((command.action === 'match_name' || command.action === 'test') && isWebConsoleEvent(event)) {
      deps.report(`studio_remote_${command.action}_rejected`, 'degraded')
      return { ok: false, error: 'console_request_rejected', reason: 'cause=mac_local_only' }
    }
    if (command.action === 'match_name') return { ok: true, value: { status: await status(), nameMatches: command.guests.match === 'off' ? []
      : matchGuestNames(command.name, command.guests.names, 3, command.guests.aliases) } }
    if (command.action === 'exit') {
      const active = runtime.isActive()
      exit('studio_operator_exit')
      return { ok: true, value: { status: await status(), action: { status: active ? 'accepted' : 'ignored', code: active ? 'studio_operator_exit' : 'studio_not_active' } } }
    }
    if (command.action === 'end') {
      // Also cancels a start still checking config, like exit; the visit then ends as if completed.
      startEpoch += 1
      const ended = runtime.end('studio_operator_ended')
      if (!ended) deps.report('studio_not_active', 'info')
      return { ok: true, value: { status: await status(), action: { status: ended ? 'accepted' : 'ignored', code: ended ? 'studio_operator_ended' : 'studio_not_active' } } }
    }
    if (command.action === 'mode') {
      if (command.mode === 'studio' && !deps.imageEnabled(currentIdentity() ?? undefined)) return { ok: true,
        value: { status: await status(), action: { status: 'rejected', code: 'studio_skill_disabled' } } }
      const saved = deps.mirrorMode?.set(command.mode, 'console') ?? false
      return { ok: true, value: { status: await status(), action: saved ? { status: 'accepted', code: `mirror_mode_${command.mode}` } : { status: 'failed', code: 'mirror_mode_save_failed' } } }
    }
    if (command.action === 'start') {
      const identity = currentIdentity()
      const action = identity ? await startFor(identity, 'console') : { status: 'rejected' as const, code: 'studio_requires_active_session' }
      return { ok: true, value: { status: await status(), action } }
    }
    // Test portrait: shown in the Console only, never saved.
    if (!deps.imageEnabled(currentIdentity() ?? undefined)) return { ok: true, value: { status: await status(), test: { ok: false, code: 'studio_skill_disabled', elapsedMs: 0 } } }
    const experience = await deps.experience().catch(() => null)
    if (!experience) return { ok: true, value: { status: await status(), test: { ok: false, code: 'studio_config_unavailable', elapsedMs: 0 } } }
    const answers = experience.studio.questions.map((question, index) => ({ slot: question.slot, imageLine: question.imageLine,
      answer: STUDIO_SAMPLE_ANSWERS[index % STUDIO_SAMPLE_ANSWERS.length]! }))
    const name = experience.studio.askName === false ? '' : 'Raven'
    const result = await provider.generate({ prompt: buildPortraitPrompt({ studio: experience.studio, answers, name }), quality: experience.studio.quality, picture: studioPictureType(experience.studio) })
    // A successful test picture resumes visits paused by a plan-limit or sign-in failure.
    noteImage(result)
    deps.report(result.ok ? 'studio_test_ready' : result.code, result.ok ? 'info' : 'degraded', result.elapsedMs)
    return { ok: true, value: { status: await status(), test: result.ok
      ? { ok: true, elapsedMs: result.elapsedMs, dataUrl: `data:${result.mimeType};base64,${result.image.toString('base64')}` }
      : { ok: false, code: result.code, elapsedMs: result.elapsedMs } } }
  })

  return {
    close: exit,
    image: (id: string) => runtime.image(id),
    /** Cheap: a run is open (any phase). The session rollover waits while this is true. */
    active: () => runtime.isActive(),
    canUsePhoto: runtime.canUsePhoto,
    usePhoto: runtime.usePhoto,
    clearPhoto: runtime.clearPhoto,
  }
}

export type StudioIpc = ReturnType<typeof registerStudioIpc>
