import { randomUUID } from 'node:crypto'
import { PORTRAIT_STUDIO, renderStudioText, studioFailureLine, studioPrompt, studioScreenView } from '../../shared/portrait-studio-config'
import { STUDIO_ANSWER_MAX, studioPictureType, studioStartLanguage } from '../../shared/portrait-studio'
import { literalSpeechText, speechScriptText } from '../../shared/speech-script'
import type {
  AvatarExperience, StudioImageFailure, StudioLanguage, StudioPhase, StudioPromptStage, StudioReply, StudioRequest, StudioSessionEvent, StudioStep, StudioView,
} from '../../shared/portrait-studio'
import type { PortraitImageProvider, PortraitImageResult } from './image-provider'
import { matchGuestNames, guestTextKey } from './guest-names'
import { buildPortraitPrompt, buildRevisionPrompt } from './prompt-builder'
import { IMAGE_SKILL } from '../../shared/image-skill'

export interface StudioIdentity { readonly realtimeSessionId: string; readonly sessionGeneration: number }
/** `mode` is the Mirror switch turned to Interactive Studio during a conversation. */
export type StudioStartSource = 'visitor' | 'session_default' | 'console' | 'mode'

/**
 * Output seam for the finished picture. The deferred printer is a no-op today.
 * Every final picture is handed to each sink after the transfer cue plays; a failing sink only
 * reports `studio_keepsake_<name>_failed` and never blocks the farewell.
 */
export interface KeepsakeSink { readonly name: string; deliver(image: { bytes: Buffer; mimeType: string }): void }

interface StoredImage { readonly bytes: Buffer; readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }
interface Run {
  readonly id: string
  readonly identity: StudioIdentity
  readonly experience: AvatarExperience
  /** A studio-mode run (wake or Mirror switch) ends with the studio farewell and Dormant. */
  readonly source: StudioStartSource
  language: StudioLanguage
  phase: StudioPhase
  name: string
  answers: string[]
  revisionsLeft: number
  revision: number
  change?: string
  imageId?: string
  holdEndsAt?: number
  abort?: AbortController
  holdTimer?: ReturnType<typeof setTimeout>
  activityHeld: boolean
  photo?: StoredImage
  step?: StudioStep
  stepSequence: number
  silenceTimer?: ReturnType<typeof setTimeout>
  delivered: boolean
}

// Technical guidance stays versioned; operator-editable stage prompts come from the run's avatar.
const G = PORTRAIT_STUDIO.guidance
const prompt = (r: { experience: AvatarExperience }, stage: StudioPromptStage) => studioPrompt(r.experience.studio, stage)
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
  const images = new Map<string, StoredImage>()
  let run: Run | null = null

  const question = (r: Run, index: number) => r.experience.studio.questions[index]!
  const questionText = (r: Run, index: number) => question(r, index)[r.language]
  const nameQuestion = (r: Run) => r.experience.studio.nameQuestion[r.language]
  const lines = (r: Run) => PORTRAIT_STUDIO.journey[r.language]
  const guests = (r: Run) => r.experience.guests.match === 'off' ? [] : r.experience.guests.names
  const asksName = (experience: AvatarExperience) => experience.studio.askName !== false
  const currentStep = (r: Run): string => r.phase === 'confirm' ? renderStudioText(PORTRAIT_STUDIO.journey.steps.confirm, { name: r.name })
    : r.phase === 'name' ? renderStudioText(PORTRAIT_STUDIO.journey.steps.name, { question: speechScriptText(nameQuestion(r)) })
    : r.phase === 'question' ? renderStudioText(PORTRAIT_STUDIO.journey.steps.question, { index: String(r.answers.length + 1), count: String(r.experience.studio.questions.length), question: speechScriptText(questionText(r, r.answers.length)) })
    : r.phase === 'reveal' ? PORTRAIT_STUDIO.journey.steps.reveal : r.phase === 'keepsake' ? PORTRAIT_STUDIO.journey.steps.keepsake : PORTRAIT_STUDIO.journey.steps.painting

  function view(r: Run): StudioView {
    const count = r.experience.studio.questions.length
    return {
      phase: r.phase, language: r.language, questionCount: count, answered: r.answers.length,
      ...(r.phase === 'name' ? { prompt: speechScriptText(nameQuestion(r)) } : r.phase === 'question' ? { prompt: speechScriptText(questionText(r, r.answers.length)) } : {}),
      ...(r.name && r.phase !== 'name' ? { name: r.name } : {}),
      chips: r.answers.map(answer => answer.slice(0, 24)),
      ...(r.change && r.phase === 'revising' ? { change: r.change.slice(0, 120) } : {}),
      ...(r.imageId && ['reveal', 'revising', 'keepsake'].includes(r.phase) ? { imageUrl: `magic-mirror-media://studio/${r.imageId}` } : {}),
      lettering: r.experience.studio.nameLettering, picture: studioPictureType(r.experience.studio), revisionsLeft: r.revisionsLeft,
      ...(r.holdEndsAt ? { holdEndsAt: r.holdEndsAt } : {}),
      askName: asksName(r.experience), text: studioScreenView(r.experience.studio, r.language, Math.min(r.answers.length + 1, count), count),
    }
  }
  const publish = (r: Run) => { if (run === r) input.dispatch({ type: 'studio_view', view: view(r) }) }
  // Painting and transfer own their completion, independently of conversation idle.
  const hold = (r: Run) => { if (!r.activityHeld) { r.activityHeld = true; input.activity('started', r.id) } }
  const release = (r: Run) => { if (r.activityHeld) { r.activityHeld = false; input.activity('finished', r.id) } }
  const stopSilence = (r: Run) => { clearTimeout(r.silenceTimer); r.silenceTimer = undefined }
  function step(r: Run, extra: Pick<StudioStep, 'comment' | 'silent'> = {}, dispatch = true): StudioStep {
    stopSilence(r)
    const text = lines(r)
    const spokenName = /^[A-Za-z -]+$/.test(r.name) ? [...r.name].join(' ') : literalSpeechText(r.name)
    const speech = r.phase === 'name' ? nameQuestion(r)
      : r.phase === 'confirm' ? renderStudioText(text.confirm, { name: spokenName })
      : r.phase === 'question' ? (r.name && r.answers.length === 0 ? renderStudioText(text.address, { name: literalSpeechText(r.name) }) : '') + questionText(r, r.answers.length)
      : r.phase === 'painting' ? text.painting : r.phase === 'revising' ? text.repainting
      : r.phase === 'reveal' ? text.reveal + (r.revisionsLeft > 0 ? `[pause=1s]${text.offerChange}` : '') : text.transfer
    r.step = { id: `${r.id}-${++r.stepSequence}`, phase: r.phase, speech, guidance: currentStep(r), language: r.language,
      ...(r.phase === 'reveal' ? { final: r.revisionsLeft <= 0 } : {}), ...extra }
    publish(r)
    if (dispatch) input.dispatch({ type: 'studio_event', event: { event: 'step', step: r.step }, identity: r.identity })
    return r.step
  }
  function armSilence(r: Run): void {
    if (r.silenceTimer || !['name', 'confirm', 'question', 'reveal'].includes(r.phase)) return
    const stepId = r.step?.id
    r.silenceTimer = setTimeout(() => {
      r.silenceTimer = undefined
      if (run !== r || r.step?.id !== stepId) return
      input.report(`studio_${r.phase}_timeout`)
      if (r.phase === 'name' || r.phase === 'confirm') {
        r.name = PORTRAIT_STUDIO.journey.fallbackName
        r.phase = 'question'
        step(r)
      } else if (r.phase === 'question') recordAnswer(r, PORTRAIT_STUDIO.journey.unanswered, true)
      else if (r.phase === 'reveal') startKeepsake(r, true)
    }, PORTRAIT_STUDIO.journey.silenceMs)
    input.report('studio_wait_started')
  }
  function recordAnswer(r: Run, answer: string, silent = false): void {
    r.answers.push(answer.trim().slice(0, STUDIO_ANSWER_MAX))
    input.report(silent ? 'studio_answer_unanswered' : 'studio_answer_recorded')
    if (r.answers.length === r.experience.studio.questions.length) r.phase = 'painting'
    step(r, silent ? { silent: true } : { comment: answer })
  }

  function close(reason: string, notify = true): void {
    const r = run
    if (!r) return
    run = null
    r.abort?.abort()
    clearTimeout(r.holdTimer)
    stopSilence(r)
    images.clear()
    r.photo = undefined
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
      input.dispatch({ type: 'studio_event', event: { event: 'failed', code, line: studioFailureLine('revision_failed', r.language, r.experience.studio), keepPortrait: true }, identity: r.identity })
      startKeepsake(r)
      return
    }
    input.dispatch({ type: 'studio_event', event: { event: 'failed', code, line: studioFailureLine(code, r.language, r.experience.studio), keepPortrait: false }, identity: r.identity })
    close(`studio_failed_${code.replace(/^studio_/, '')}`, false)
  }

  function startKeepsake(r: Run, silent = false): void {
    r.phase = 'keepsake'
    hold(r)
    step(r, silent ? { silent: true } : {})
  }
  function deliver(r: Run): StudioReply {
    if (r.delivered) return reply('ignored', 'studio_finish_duplicate')
    r.delivered = true
    const image = r.imageId ? images.get(r.imageId) : undefined
    if (image) for (const sink of input.keepsakeSinks ?? []) {
      try { sink.deliver({ bytes: image.bytes, mimeType: image.mimeType }) } catch { input.report(`studio_keepsake_${sink.name}_failed`, 'degraded') }
    }
    input.report('studio_transfer_completed')
    input.dispatch({ type: 'studio_event', event: { event: 'keepsake_done', afterPortrait: 'farewell' }, identity: r.identity })
    close('studio_completed', false)
    return reply('accepted', 'studio_delivered')
  }

  async function paint(r: Run, kind: 'generate' | 'edit'): Promise<void> {
    const provider = input.provider()
    if (!provider) { fail(r, 'studio_image_unavailable', kind === 'edit'); return }
    const abort = new AbortController()
    r.abort = abort
    hold(r)
    publish(r)
    const quality = r.experience.studio.quality, picture = studioPictureType(r.experience.studio)
    const answers = r.answers.map((answer, index) => ({ slot: question(r, index).slot, imageLine: question(r, index).imageLine, answer }))
    const previous = r.imageId ? images.get(r.imageId) : undefined
    let result: PortraitImageResult
    try {
      const photo = kind === 'generate' ? r.photo : undefined
      r.photo = undefined
      result = photo
        ? await provider.edit({ prompt: `${IMAGE_SKILL.photo}\n\n${buildPortraitPrompt({ studio: r.experience.studio, answers, name: r.name })}`, image: photo.bytes, mimeType: photo.mimeType, quality, picture, signal: abort.signal })
        : kind === 'edit' && previous
        ? await provider.edit({ prompt: buildRevisionPrompt({ studio: r.experience.studio, change: r.change ?? '', name: r.name }), image: previous.bytes, mimeType: previous.mimeType, quality, picture, signal: abort.signal })
        : await provider.generate({ prompt: buildPortraitPrompt({ studio: r.experience.studio, answers, name: r.name }), quality, picture, signal: abort.signal })
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
    const revealStep = step(r, {}, false)
    input.dispatch({ type: 'studio_event', event: { event: 'ready', imageUrl: `magic-mirror-media://studio/${id}`,
      revision: r.revision, revisionsLeft: r.revisionsLeft, language: r.language, step: revealStep }, identity: r.identity })
  }

  function start(identity: StudioIdentity, experience: AvatarExperience, source: StudioStartSource): StudioReply {
    if (run && sameIdentity(run.identity, identity)) return reply('ignored', 'studio_start_duplicate')
    if (run) close('studio_session_replaced')
    // Application code owns authorization: a renderer cannot claim a default it was not given.
    if (source === 'visitor' && !experience.visitorMayRequest || source === 'session_default' && experience.defaultMode !== 'portrait_studio') {
      input.report('studio_start_not_enabled', 'degraded')
      return reply('rejected', 'studio_not_enabled', studioPrompt(experience.studio, 'unavailable'))
    }
    if (!input.provider()) { input.report('studio_unavailable', 'degraded'); return reply('rejected', 'studio_unavailable', studioPrompt(experience.studio, 'unavailable')) }
    void Promise.resolve(input.stopMedia?.()).catch(() => input.report('studio_media_stop_failed', 'degraded'))
    const r: Run = { id: `studio-${randomUUID()}`, identity, experience: structuredClone(experience), source, language: studioStartLanguage(experience.studio.startScript), phase: asksName(experience) ? 'name' : 'question',
      name: '', answers: [], revisionsLeft: experience.studio.revisionsAllowed, revision: 0, activityHeld: false, stepSequence: 0, delivered: false }
    run = r
    input.report(`studio_started_${source}`)
    return { ...reply('accepted', 'studio_started', currentStep(r)), step: step(r, {}, false) }
  }

  function handle(request: Exclude<StudioRequest, { action: 'start' }>, identity: StudioIdentity): StudioReply {
    const r = run
    if (!r || !sameIdentity(r.identity, identity)) return reply('ignored', 'studio_not_active_stale')
    if (request.action === 'exit') { close('studio_exited', false); return reply('accepted', 'studio_exited', prompt(r, 'exited')) }
    if (request.action === 'language') {
      if (r.phase === 'keepsake') return reply('ignored', 'studio_language_stale')
      r.language = request.language
      // Repeat only a pending question. Never restart a painting or consume an answer.
      const repeat = ['name', 'confirm', 'question', 'reveal'].includes(r.phase)
      if (repeat) step(r)
      else publish(r)
      input.report('studio_language_changed')
      return { ...reply('accepted', 'studio_language_changed'), ...(repeat ? { step: r.step } : {}) }
    }
    if ('stepId' in request) {
      if (request.stepId !== r.step?.id) return reply('ignored', 'studio_step_stale')
      if (request.action === 'step_activity') { stopSilence(r); return reply('accepted', 'studio_wait_cancelled') }
      if (request.action === 'step_ready') { armSilence(r); return reply('accepted', 'studio_step_ready') }
      if (request.action === 'deliver') return r.phase === 'keepsake' ? deliver(r) : reply('rejected', 'studio_wrong_step')
      if (request.action === 'paint') {
        if (!['painting', 'revising'].includes(r.phase) || r.abort) return reply('ignored', 'studio_paint_duplicate')
        input.report(r.phase === 'painting' ? 'studio_painting_started' : 'studio_revision_started')
        void paint(r, r.phase === 'painting' ? 'generate' : 'edit')
        return reply('accepted', 'studio_painting')
      }
    }
    if (request.action === 'reject_name') {
      if (r.phase !== 'confirm') return reply('rejected', 'studio_wrong_step')
      r.name = ''; r.phase = 'name'; step(r)
      input.report('studio_name_denied')
      return reply('accepted', 'studio_name_denied', currentStep(r))
    }
    if (request.action === 'repeat') {
      if (!['name', 'confirm', 'question', 'reveal'].includes(r.phase)) return reply('rejected', 'studio_wrong_step', currentStep(r))
      step(r); input.report('studio_question_repeated')
      return reply('accepted', 'studio_question_repeated', currentStep(r))
    }
    if (request.action === 'set_name') {
      if (!asksName(r.experience)) return reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      if (r.phase !== 'name' && r.phase !== 'confirm') return r.phase === 'question' && request.confirmed && guestTextKey(request.name) === guestTextKey(r.name)
        ? reply('ignored', 'studio_name_duplicate') : reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      const name = request.name.trim()
      const list = guests(r)
      const candidates = list.length ? matchGuestNames(name, list) : []
      const listed = list.some(guest => guest === name)
      if (r.experience.guests.match === 'only' && list.length && !listed) {
        if (!candidates.length) { r.name = ''; r.phase = 'name'; step(r); input.report('studio_name_not_listed'); return { ...reply('rejected', 'studio_name_not_listed', prompt(r, 'guestOnly')), step: r.step } }
        r.name = candidates[0]!
        r.phase = 'confirm'; step(r)
        return reply('accepted', 'studio_name_candidates', renderStudioText(prompt(r, 'chooseGuest'), { candidates: candidates.map(c => `「${c}」`).join('、') }), candidates)
      }
      // Only the visitor's acceptance of a read-back confirms; an unconfirmed name is read back again.
      if (request.confirmed) {
        r.name = name
        r.phase = 'question'
        input.report('studio_name_confirmed')
        step(r)
        return reply('accepted', 'studio_name_confirmed', currentStep(r))
      }
      r.name = candidates.length && !listed ? candidates[0]! : name
      r.phase = 'confirm'
      step(r)
      if (candidates.length && !listed) {
        return reply('accepted', 'studio_name_candidates', renderStudioText(prompt(r, 'chooseGuest'), { candidates: candidates.map(c => `「${c}」`).join('、') }), candidates)
      }
      return reply('accepted', 'studio_name_heard', currentStep(r))
    }
    if (request.action === 'answer') {
      const expected = r.answers.length + 1
      if (r.phase !== 'question') return request.question < expected ? reply('ignored', 'studio_answer_duplicate')
        : reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      // A different answer to the question just recorded replaces it (a visitor's correction, or a
      // reply the model recorded too early); the same answer again stays silent.
      const text = request.answer.trim().slice(0, STUDIO_ANSWER_MAX)
      if (request.question === expected - 1 && r.answers.length && text !== r.answers.at(-1)) {
        r.answers[r.answers.length - 1] = text
        step(r, { comment: text })
        return reply('accepted', 'studio_answer_replaced', currentStep(r))
      }
      if (request.question < expected) return reply('ignored', 'studio_answer_duplicate')
      if (request.question > expected) return reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      recordAnswer(r, text)
      return reply('accepted', r.answers.length === r.experience.studio.questions.length ? 'studio_painting' : 'studio_answer_recorded', currentStep(r))
    }
    if (request.action === 'revise') {
      if (r.phase === 'revising' || r.phase === 'painting') return reply('ignored', 'studio_revise_duplicate')
      if (r.phase !== 'reveal') return reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
      if (r.revisionsLeft <= 0) return reply('rejected', 'studio_no_changes_left', prompt(r, 'noChangesLeft'))
      r.revisionsLeft -= 1
      r.change = request.change.trim()
      r.phase = 'revising'
      r.abort = undefined
      input.report('studio_revision_requested')
      step(r)
      return reply('accepted', 'studio_repainting', prompt(r, 'repainting'))
    }
    // finish
    if (r.phase === 'keepsake') return reply('ignored', 'studio_finish_duplicate')
    if (r.phase !== 'reveal') return reply('rejected', 'studio_wrong_step', renderStudioText(G.wrongStep, { current: currentStep(r) }))
    startKeepsake(r)
    input.report('studio_finished')
    return reply('accepted', 'studio_finished', prompt(r, 'finished'))
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
    canUsePhoto: (identity: StudioIdentity) => !!run && sameIdentity(run.identity, identity) && ['name', 'confirm', 'question'].includes(run.phase),
    clearPhoto(identity: StudioIdentity): boolean {
      if (!run || !sameIdentity(run.identity, identity) || !run.photo) return false
      run.photo = undefined; input.report('studio_photo_removed'); return true
    },
    usePhoto(identity: StudioIdentity, photo: StoredImage): boolean {
      if (!run || !sameIdentity(run.identity, identity) || !['name', 'confirm', 'question'].includes(run.phase)) return false
      run.photo = photo
      input.report('studio_photo_attached')
      return true
    },
    image(id: string): StoredImage | undefined { return run ? images.get(id) : undefined },
  }
}

function sameIdentity(a: StudioIdentity, b: StudioIdentity): boolean {
  return a.realtimeSessionId === b.realtimeSessionId && a.sessionGeneration === b.sessionGeneration
}

export type StudioRuntime = ReturnType<typeof createStudioRuntime>
