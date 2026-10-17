import { randomUUID } from 'node:crypto'
import { PORTRAIT_STUDIO, renderStudioText, studioFailureLine } from '../../shared/portrait-studio-config'
import type {
  AvatarExperience, StudioImageFailure, StudioLanguage, StudioPhase, StudioReply, StudioRequest, StudioSessionEvent, StudioView,
} from '../../shared/portrait-studio'
import type { PortraitImageProvider, PortraitImageResult } from './image-provider'
import { matchGuestNames, guestTextKey } from './guest-names'
import { buildPortraitPrompt, buildRevisionPrompt } from './prompt-builder'

export interface StudioIdentity { readonly realtimeSessionId: string; readonly sessionGeneration: number }
export type StudioStartSource = 'visitor' | 'session_default' | 'console'

/** Output seam for finished portraits. Display is the only sink today; a printer sink can be added later. */
export interface KeepsakeSink { readonly name: string; deliver(image: { bytes: Buffer; mimeType: string }): void }

interface StoredImage { readonly bytes: Buffer; readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }
interface Run {
  readonly id: string
  readonly identity: StudioIdentity
  readonly experience: AvatarExperience
  language: StudioLanguage
  phase: StudioPhase
  name: string
  nameAttempts: number
  answers: string[]
  revisionsLeft: number
  revision: number
  change?: string
  imageId?: string
  holdEndsAt?: number
  abort?: AbortController
  holdTimer?: ReturnType<typeof setTimeout>
  activityHeld: boolean
}

const G = PORTRAIT_STUDIO.guidance
const reply = (status: StudioReply['status'], code: string, next?: string, candidates?: string[]): StudioReply =>
  ({ status, code, ...(next ? { next } : {}), ...(candidates?.length ? { candidates } : {}) })

/**
 * Single owner of the Portrait Studio. Holds the name, answers and images in RAM
 * only; reports metadata reasons only. No identity, memory or hardware authority.
 */
export function createStudioRuntime(input: {
  provider(): PortraitImageProvider | null
  dispatch(command: { type: 'studio_view'; view: StudioView | null } | { type: 'studio_event'; event: StudioSessionEvent; identity: StudioIdentity }): boolean
  activity(kind: 'started' | 'finished', runId: string): void
  report(reason: string, status?: 'info' | 'degraded', timingMs?: number): void
  stopMedia?(): Promise<void> | void
  keepsakeSinks?: readonly KeepsakeSink[]
  now?: () => number
}) {
  const now = input.now ?? Date.now
  const images = new Map<string, StoredImage>()
  let run: Run | null = null

  const question = (r: Run, index: number) => r.experience.studio.questions[index]!
  const questionText = (r: Run, index: number) => question(r, index)[r.language]
  const nameQuestion = (r: Run) => r.experience.studio.nameQuestion[r.language]
  const guests = (r: Run) => r.experience.guests.match === 'off' ? [] : r.experience.guests.names
  const currentStep = (r: Run): string => r.phase === 'name' || r.phase === 'confirm' ? renderStudioText(G.askName, { question: nameQuestion(r) })
    : r.phase === 'question' ? renderStudioText(G.askQuestion, { index: String(r.answers.length + 1), count: String(r.experience.studio.questions.length), question: questionText(r, r.answers.length) })
    : r.phase === 'reveal' ? PORTRAIT_STUDIO.agent.offerChange : r.phase === 'keepsake' ? G.finished : G.busy

  function view(r: Run): StudioView {
    const count = r.experience.studio.questions.length
    return {
      phase: r.phase, language: r.language, questionCount: count, answered: r.answers.length,
      ...(r.phase === 'name' ? { prompt: nameQuestion(r) } : r.phase === 'question' ? { prompt: questionText(r, r.answers.length) } : {}),
      ...(r.name && r.phase !== 'name' ? { name: r.name } : {}),
      chips: r.answers.map(answer => answer.slice(0, 24)),
      ...(r.change && r.phase === 'revising' ? { change: r.change.slice(0, 120) } : {}),
      ...(r.imageId && ['reveal', 'revising', 'keepsake'].includes(r.phase) ? { imageUrl: `magic-mirror-media://studio/${r.imageId}` } : {}),
      lettering: r.experience.studio.nameLettering, revisionsLeft: r.revisionsLeft,
      ...(r.holdEndsAt ? { holdEndsAt: r.holdEndsAt } : {}),
    }
  }
  const publish = (r: Run) => { if (run === r) input.dispatch({ type: 'studio_view', view: view(r) }) }
  // Painting and the keepsake countdown are bounded silent waits, so they pause
  // the idle timer. Reveal is a spoken step: an absent visitor idles out normally.
  const hold = (r: Run) => { if (!r.activityHeld) { r.activityHeld = true; input.activity('started', r.id) } }
  const release = (r: Run) => { if (r.activityHeld) { r.activityHeld = false; input.activity('finished', r.id) } }

  function close(reason: string, notify = true): void {
    const r = run
    if (!r) return
    run = null
    r.abort?.abort()
    clearTimeout(r.holdTimer)
    images.clear()
    // Always release the idle-timer hold, on every exit path.
    release(r)
    input.dispatch({ type: 'studio_view', view: null })
    if (notify) input.dispatch({ type: 'studio_event', event: { event: 'closed', reason }, identity: r.identity })
    input.report(reason)
  }

  function fail(r: Run, code: StudioImageFailure, keepPortrait: boolean): void {
    if (run !== r) return
    input.report(code, 'degraded')
    if (keepPortrait && r.imageId) {
      input.dispatch({ type: 'studio_event', event: { event: 'failed', code, line: studioFailureLine('revision_failed', r.language), keepPortrait: true }, identity: r.identity })
      startKeepsake(r)
      return
    }
    input.dispatch({ type: 'studio_event', event: { event: 'failed', code, line: studioFailureLine(code, r.language), keepPortrait: false }, identity: r.identity })
    close(`studio_failed_${code.replace(/^studio_/, '')}`, false)
  }

  function startKeepsake(r: Run): void {
    r.phase = 'keepsake'
    hold(r)
    r.holdEndsAt = now() + r.experience.studio.holdSeconds * 1000
    const image = r.imageId ? images.get(r.imageId) : undefined
    if (image) for (const sink of input.keepsakeSinks ?? []) {
      try { sink.deliver({ bytes: image.bytes, mimeType: image.mimeType }) } catch { input.report(`studio_keepsake_${sink.name}_failed`, 'degraded') }
    }
    publish(r)
    r.holdTimer = setTimeout(() => {
      if (run !== r) return
      input.dispatch({ type: 'studio_event', event: { event: 'keepsake_done', afterPortrait: r.experience.afterPortrait }, identity: r.identity })
      close('studio_completed', false)
    }, r.experience.studio.holdSeconds * 1000)
  }

  async function paint(r: Run, kind: 'generate' | 'edit'): Promise<void> {
    const provider = input.provider()
    if (!provider) { fail(r, 'studio_image_unavailable', kind === 'edit'); return }
    const abort = new AbortController()
    r.abort = abort
    hold(r)
    publish(r)
    const quality = r.experience.studio.quality
    const answers = r.answers.map((answer, index) => ({ slot: question(r, index).slot, answer }))
    const previous = r.imageId ? images.get(r.imageId) : undefined
    let result: PortraitImageResult
    try {
      result = kind === 'edit' && previous
        ? await provider.edit({ prompt: buildRevisionPrompt({ studio: r.experience.studio, change: r.change ?? '', name: r.name }), image: previous.bytes, mimeType: previous.mimeType, quality, signal: abort.signal })
        : await provider.generate({ prompt: buildPortraitPrompt({ studio: r.experience.studio, answers, name: r.name }), quality, signal: abort.signal })
    } catch { result = { ok: false, code: 'studio_image_unavailable', elapsedMs: 0 } }
    if (run !== r || abort.signal.aborted) return
    if (!result.ok) { fail(r, result.code, kind === 'edit'); return }
    input.report(kind === 'edit' ? 'studio_revision_ready' : 'studio_image_ready', 'info', result.elapsedMs)
    const id = randomUUID()
    if (r.imageId && kind === 'generate') images.delete(r.imageId)
    for (const key of [...images.keys()]) if (key !== r.imageId) images.delete(key)
    images.set(id, { bytes: result.image, mimeType: result.mimeType })
    r.imageId = id
    r.revision += kind === 'edit' ? 1 : 0
    r.phase = 'reveal'
    release(r)
    publish(r)
    input.dispatch({ type: 'studio_event', event: { event: 'ready', imageUrl: `magic-mirror-media://studio/${id}`,
      revision: r.revision, revisionsLeft: r.revisionsLeft, language: r.language }, identity: r.identity })
  }

  function start(identity: StudioIdentity, experience: AvatarExperience, source: StudioStartSource): StudioReply {
    if (run && sameIdentity(run.identity, identity)) return reply('ignored', 'studio_start_duplicate')
    if (run) close('studio_session_replaced')
    // Application code owns authorization: a renderer cannot claim a default it was not given.
    if (source === 'visitor' && !experience.visitorMayRequest || source === 'session_default' && experience.defaultMode !== 'portrait_studio') {
      input.report('studio_start_not_enabled', 'degraded')
      return reply('rejected', 'studio_not_enabled', G.unavailable)
    }
    if (!input.provider()) { input.report('studio_unavailable', 'degraded'); return reply('rejected', 'studio_unavailable', G.unavailable) }
    void Promise.resolve(input.stopMedia?.()).catch(() => input.report('studio_media_stop_failed', 'degraded'))
    const r: Run = { id: `studio-${randomUUID()}`, identity, experience: structuredClone(experience), language: 'zh', phase: 'name',
      name: '', nameAttempts: 0, answers: [], revisionsLeft: experience.studio.revisionsAllowed, revision: 0, activityHeld: false }
    run = r
    input.report(`studio_started_${source}`)
    publish(r)
    return reply('accepted', 'studio_started', renderStudioText(G.askName, { question: nameQuestion(r) }))
  }

  function handle(request: Exclude<StudioRequest, { action: 'start' }>, identity: StudioIdentity): StudioReply {
    const r = run
    if (!r || !sameIdentity(r.identity, identity)) return reply('ignored', 'studio_not_active_stale')
    if (request.action === 'exit') { close('studio_exited', false); return reply('accepted', 'studio_exited', G.exited) }
    if (request.action === 'set_name') {
      if (r.phase !== 'name' && r.phase !== 'confirm') return r.phase === 'question' && request.confirmed && guestTextKey(request.name) === guestTextKey(r.name)
        ? reply('ignored', 'studio_name_duplicate') : reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      r.language = request.language
      const name = request.name.trim()
      const list = guests(r)
      const candidates = list.length ? matchGuestNames(name, list) : []
      const listed = list.some(guest => guest === name)
      if (r.experience.guests.match === 'only' && list.length && !listed) {
        if (!candidates.length) { r.phase = 'name'; publish(r); return reply('rejected', 'studio_name_not_listed', G.guestOnly) }
        r.phase = 'confirm'; publish(r)
        return reply('accepted', 'studio_name_candidates', renderStudioText(G.chooseGuest, { candidates: candidates.map(c => `「${c}」`).join('、') }), candidates)
      }
      r.nameAttempts += request.confirmed ? 0 : 1
      if (request.confirmed || r.nameAttempts > 3) {
        r.name = name
        r.phase = 'question'
        input.report('studio_name_confirmed')
        publish(r)
        return reply('accepted', 'studio_name_confirmed', currentStep(r))
      }
      r.name = name
      r.phase = 'confirm'
      publish(r)
      if (candidates.length && !listed) {
        return reply('accepted', 'studio_name_candidates', renderStudioText(G.chooseGuest, { candidates: candidates.map(c => `「${c}」`).join('、') }), candidates)
      }
      return reply('accepted', 'studio_name_heard', renderStudioText(G.confirmName, { name }))
    }
    if (request.action === 'answer') {
      const expected = r.answers.length + 1
      if (r.phase !== 'question') return request.question < expected ? reply('ignored', 'studio_answer_duplicate')
        : reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      if (request.question < expected) return reply('ignored', 'studio_answer_duplicate')
      if (request.question > expected) return reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      r.language = request.language
      r.answers.push(request.answer.trim().slice(0, 80))
      input.report('studio_answer_recorded')
      if (r.answers.length < r.experience.studio.questions.length) { publish(r); return reply('accepted', 'studio_answer_recorded', currentStep(r)) }
      r.phase = 'painting'
      input.report('studio_painting_started')
      void paint(r, 'generate')
      return reply('accepted', 'studio_painting', G.painting)
    }
    if (request.action === 'revise') {
      if (r.phase === 'revising' || r.phase === 'painting') return reply('ignored', 'studio_revise_duplicate')
      if (r.phase !== 'reveal') return reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      if (r.revisionsLeft <= 0) return reply('rejected', 'studio_no_changes_left', G.noChangesLeft)
      r.revisionsLeft -= 1
      r.change = request.change.trim()
      r.phase = 'revising'
      input.report('studio_revision_requested')
      void paint(r, 'edit')
      return reply('accepted', 'studio_repainting', G.repainting)
    }
    // finish
    if (r.phase === 'keepsake') return reply('ignored', 'studio_finish_duplicate')
    if (r.phase !== 'reveal') return reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
    startKeepsake(r)
    input.report('studio_finished')
    return reply('accepted', 'studio_finished', G.finished)
  }

  /** Main's authoritative session identity changed (rollover, sleep, end): a run never outlives its session. */
  function syncIdentity(identity: StudioIdentity | null): void {
    if (run && (!identity || !sameIdentity(run.identity, identity))) close(identity ? 'studio_session_replaced' : 'studio_session_ended')
  }

  return {
    start,
    handle,
    close,
    syncIdentity,
    isActive: () => run !== null,
    activeFor: (identity: StudioIdentity) => run !== null && sameIdentity(run.identity, identity),
    phase: (): StudioPhase | null => run?.phase ?? null,
    image(id: string): StoredImage | undefined { return run ? images.get(id) : undefined },
  }
}

function sameIdentity(a: StudioIdentity, b: StudioIdentity): boolean {
  return a.realtimeSessionId === b.realtimeSessionId && a.sessionGeneration === b.sessionGeneration
}

export type StudioRuntime = ReturnType<typeof createStudioRuntime>
