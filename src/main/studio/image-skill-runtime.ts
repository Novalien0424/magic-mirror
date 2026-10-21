import { randomUUID } from 'node:crypto'
import { IMAGE_SKILL, buildImageSkillPrompt, type ImageSkillEvent, type ImageSkillReply, type ImageSkillRequest, type ImageSkillView } from '../../shared/image-skill'
import { spokenCommandKey } from '../../shared/spoken-command'
import type { StudioLanguage, StudioPictureType, StudioQuality } from '../../shared/portrait-studio'
import type { PortraitImageProvider, PortraitImageResult } from './image-provider'
import type { StudioIdentity } from './studio-runtime'

export interface SkillImage { readonly bytes: Buffer; readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }
interface Run {
  id: string; identity: StudioIdentity; language: StudioLanguage; target: ImageSkillView['target']; picture: StudioPictureType
  phase: ImageSkillView['phase']; prompt: string; quality: StudioQuality; image?: SkillImage; imageId?: string
  abort: AbortController; ticket?: string; consentReady: boolean; unclear: number; replies: Set<string>
  timer?: ReturnType<typeof setTimeout>; countdownEndsAt?: number; held: boolean
  photoRequested: boolean
}
const same = (a: StudioIdentity, b: StudioIdentity) => a.realtimeSessionId === b.realtimeSessionId && a.sessionGeneration === b.sessionGeneration
const reply = (status: ImageSkillReply['status'], code: string, next?: string): ImageSkillReply => ({ status, code, ...(next ? { next } : {}) })
const consentKey = (text: string) => spokenCommandKey(text.toLowerCase().replace(/\s+/gu, ' '))

/** Shared provider, separate conversation workspace. Photos and artwork are RAM-only. */
export function createImageSkillRuntime(input: {
  provider: PortraitImageProvider
  usable(): Promise<boolean>
  enabled(identity: StudioIdentity): boolean
  quality(): Promise<StudioQuality>
  current(): StudioIdentity | null
  studioActive(): boolean
  studioCanUsePhoto(identity: StudioIdentity): boolean
  studioUsePhoto(identity: StudioIdentity, photo: SkillImage): boolean
  studioClearPhoto?(identity: StudioIdentity): boolean
  capture(): Promise<SkillImage | null>
  dispatch(view: ImageSkillView | null): void
  event(event: ImageSkillEvent, identity: StudioIdentity): void
  report(reason: string): void
  activity(kind: 'started' | 'finished', id: string): void
}) {
  let run: Run | null = null
  let cameraPermit: { identity: StudioIdentity; expires: number } | null = null
  const live = (r: Run) => run === r && !r.abort.signal.aborted && !!input.current() && same(r.identity, input.current()!)
  const line = (r: Run, key: keyof typeof IMAGE_SKILL.speech.en) => IMAGE_SKILL.speech[r.language][key]
  const emit = (r: Run, event: ImageSkillEvent) => { if (live(r)) input.event(event, r.identity) }
  const hold = (r: Run) => { if (!r.held) { r.held = true; input.activity('started', r.id) } }
  const release = (r: Run) => { if (r.held) { r.held = false; input.activity('finished', r.id) } }
  function publish(r: Run) {
    if (live(r)) input.dispatch({ id: r.id, phase: r.phase, language: r.language, target: r.target, picture: r.picture,
      ...(r.imageId ? { imageUrl: `magic-mirror-media://image-skill/${r.imageId}` } : {}),
      ...(r.countdownEndsAt ? { countdownEndsAt: r.countdownEndsAt } : {}) })
  }
  function close(reason: string) {
    cameraPermit = null
    const r = run
    if (!r) return
    run = null; r.abort.abort(); clearTimeout(r.timer); r.image = undefined; r.ticket = undefined; release(r)
    input.dispatch(null); input.event({ event: 'closed', id: r.id,
      ...(reason === 'image_photo_attached' ? { outcome: 'photo_attached' as const } : {}) }, r.identity); input.report(reason)
  }
  function fail(r: Run, reason: string, speech: 'cameraFailed' | 'failed' | 'revisionFailed') {
    if (!live(r)) return
    input.report(reason); release(r)
    r.photoRequested = false
    r.ticket = undefined; clearTimeout(r.timer)
    r.phase = r.image ? 'ready' : 'failed'; publish(r)
    emit(r, { event: 'line', id: r.id, line: line(r, speech) })
    if (r.target === 'studio') close('image_studio_photo_failed')
  }
  async function paint(r: Run, photo?: SkillImage) {
    if (!live(r)) return
    const previous = r.image
    r.phase = previous ? 'revising' : 'painting'; r.ticket = undefined; hold(r); publish(r)
    let result: PortraitImageResult
    try {
      if (!await input.usable()) { fail(r, 'image_auth_required', previous ? 'revisionFailed' : 'failed'); return }
      if (!live(r)) return
      const original = photo ?? previous
      const prompt = buildImageSkillPrompt(r.prompt, previous ? 'edit' : 'generate', r.picture, !!photo)
      result = original ? await input.provider.edit({ prompt, image: original.bytes, mimeType: original.mimeType, quality: r.quality, picture: r.picture, signal: r.abort.signal })
        : await input.provider.generate({ prompt, quality: r.quality, picture: r.picture, signal: r.abort.signal })
    } catch { result = { ok: false, code: 'studio_image_unavailable', elapsedMs: 0 } }
    if (!live(r)) { input.report('image_result_stale'); return }
    if (!result.ok) { fail(r, result.code.replace(/^studio_/, 'image_'), previous ? 'revisionFailed' : 'failed'); return }
    r.image = { bytes: result.image, mimeType: result.mimeType }; r.imageId = randomUUID(); r.phase = 'ready'; release(r); publish(r)
    input.report(previous ? 'image_revision_ready' : photo ? 'image_photo_ready' : 'image_ready')
    emit(r, { event: 'ready', id: r.id, imageUrl: `magic-mirror-media://image-skill/${r.imageId}`, language: r.language })
  }
  function askConsent(r: Run, repeated = false) {
    r.phase = 'consent'; r.consentReady = false; r.ticket = randomUUID(); hold(r); publish(r)
    clearTimeout(r.timer)
    r.timer = setTimeout(() => {
      if (!live(r)) return
      emit(r, { event: 'line', id: r.id, line: line(r, 'cancelled') }); close('image_consent_expired')
    }, IMAGE_SKILL.consentTimeoutMs)
    emit(r, { event: 'consent', id: r.id, ticket: r.ticket,
      line: !repeated && r.target === 'camera' ? IMAGE_SKILL.cameraConsent[r.language] : line(r, repeated ? 'unclear' : 'consent') })
  }
  async function capture(r: Run) {
    if (!live(r)) return
    if (r.target === 'camera') {
      close('image_camera_permission_granted')
      cameraPermit = { identity: { ...r.identity }, expires: Date.now() + 15000 }
      input.event({ event: 'camera_approved', id: r.id }, r.identity)
      return
    }
    r.phase = 'capturing'; r.countdownEndsAt = undefined; publish(r)
    const photo = await input.capture().catch(() => null)
    if (!live(r)) { input.report('image_capture_stale'); return }
    if (!photo) { fail(r, 'image_camera_unavailable', 'cameraFailed'); return }
    input.report('image_photo_captured')
    r.photoRequested = false
    if (r.target === 'studio') {
      if (!input.studioUsePhoto(r.identity, photo)) { fail(r, 'image_studio_step_changed', 'failed'); return }
      emit(r, { event: 'line', id: r.id, line: line(r, 'photoReady') }); close('image_photo_attached')
    } else await paint(r, photo)
  }
  async function handle(request: ImageSkillRequest, identity: StudioIdentity): Promise<ImageSkillReply> {
    const current = input.current()
    if (!current || !same(current, identity)) return reply('ignored', 'image_session_stale')
    if (request.action === 'dismiss') { const active = !!run, removed = input.studioClearPhoto?.(identity); close('image_dismissed'); return reply(active || removed ? 'accepted' : 'ignored', 'image_dismissed') }
    // Camera questions retain their own explicit permission flow when art is disabled.
    const requiresImages = ['generate', 'edit', 'studio_photo'].includes(request.action)
      || (request.action === 'consent_ready' || request.action === 'photo_reply') && !!run && run.target !== 'camera'
    if (requiresImages && !input.enabled(identity)) {
      input.report('image_skill_disabled'); return reply('rejected', 'image_skill_disabled')
    }
    if (request.action === 'consent_ready' || request.action === 'photo_reply') {
      const r = run
      if (!r || !live(r) || r.phase !== 'consent' || request.ticket !== r.ticket) return reply('ignored', 'image_consent_stale')
      if (request.action === 'consent_ready') { r.consentReady = true; return reply('accepted', 'image_consent_ready') }
      if (!r.consentReady) { input.report('image_consent_before_playback'); return reply('rejected', 'image_consent_not_ready') }
      if (r.replies.has(request.itemId)) return reply('ignored', 'image_consent_duplicate')
      r.replies.add(request.itemId)
      const key = consentKey(request.text)
      if (IMAGE_SKILL.approval.some(word => consentKey(word) === key)) {
        clearTimeout(r.timer); r.ticket = undefined; r.consentReady = false; r.phase = 'countdown'; r.countdownEndsAt = Date.now() + IMAGE_SKILL.countdownMs
        publish(r); input.report('image_photo_approved'); r.timer = setTimeout(() => void capture(r), IMAGE_SKILL.countdownMs)
        return reply('accepted', 'image_photo_approved')
      }
      if (IMAGE_SKILL.denial.some(word => consentKey(word) === key) || r.unclear++ >= 1) {
        emit(r, { event: 'line', id: r.id, line: line(r, 'cancelled') }); close('image_photo_declined')
        return reply('accepted', 'image_photo_declined')
      }
      askConsent(r, true); return reply('rejected', 'image_consent_unclear')
    }
    if (run && !['ready', 'failed'].includes(run.phase)
      && !(run.target === 'camera' && run.phase === 'consent' && request.action === 'generate' && request.source === 'photo')) return reply('ignored', 'image_busy', line(run, 'busy'))
    if (request.action === 'edit') {
      const r = run
      if (!r?.image || !live(r) || r.target !== 'conversation' || input.studioActive()) return reply('rejected', 'image_not_available')
      r.prompt = request.prompt; r.language = request.language
      void paint(r); return reply('accepted', 'image_revising', line(r, 'revising'))
    }
    if (request.action === 'generate' && input.studioActive()) return reply('rejected', 'image_studio_active')
    if (request.action === 'studio_photo' && !input.studioCanUsePhoto(identity)) return reply('rejected', 'image_studio_step', IMAGE_SKILL.speech[request.language].studioStep)
    close('image_replaced')
    const r: Run = { id: randomUUID(), identity: { ...identity }, language: request.language, target: request.action === 'studio_photo' ? 'studio' : request.action === 'camera_permission' ? 'camera' : 'conversation',
      picture: request.action === 'generate' ? request.picture : 'portrait', prompt: request.action === 'generate' ? request.prompt : '', quality: 'medium',
      phase: 'painting', abort: new AbortController(), consentReady: false, unclear: 0, replies: new Set(), held: false,
      photoRequested: request.action !== 'generate' || request.source === 'photo' }
    run = r; hold(r); publish(r)
    // Reserve ownership before asynchronous config/auth work; cancellation cannot resurrect it.
    const quality = await input.quality().catch(() => null)
    if (!live(r)) return reply('ignored', 'image_start_stale')
    if (!quality) { fail(r, 'image_config_unavailable', 'failed'); return reply('failed', 'image_config_unavailable') }
    r.quality = quality
    if (request.action !== 'generate' || request.source === 'photo') { askConsent(r); return reply('accepted', 'image_consent_pending') }
    void paint(r); return reply('accepted', 'image_started', line(r, 'started'))
  }
  return { handle, close,
    consumeCameraPermit(identity: StudioIdentity): boolean {
      const permit = cameraPermit
      cameraPermit = null
      return !!permit && permit.expires >= Date.now() && same(permit.identity, identity)
        && !!input.current() && same(identity, input.current()!)
    },
    photoPending: () => run?.photoRequested ?? false,
    studioPending: () => run?.target === 'studio',
    syncIdentity(identity: StudioIdentity | null) {
      if (cameraPermit && (!identity || !same(cameraPermit.identity, identity))) cameraPermit = null
      if (run && (!identity || !same(run.identity, identity))) close('image_session_ended')
    },
    image(id: string): SkillImage | undefined { return run && live(run) && run.imageId === id ? run.image : undefined },
  }
}
