import { afterEach, describe, expect, it, vi } from 'vitest'
import { createImageSkillRuntime } from '../../src/main/studio/image-skill-runtime'
import { IMAGE_SKILL, parseImageSkillEvent, parseImageSkillRequest, parseImageSkillView, type ImageSkillEvent, type ImageSkillView } from '../../src/shared/image-skill'
import type { PortraitImageProvider, PortraitImageResult } from '../../src/main/studio/image-provider'
import { createStudioRuntime } from '../../src/main/studio/studio-runtime'
import { defaultExperience } from '../../src/shared/portrait-studio'

const ID = { realtimeSessionId: 'visit-a', sessionGeneration: 1 }
const ok = (): PortraitImageResult => ({ ok: true, image: Buffer.from('synthetic-png'), mimeType: 'image/png', elapsedMs: 1 })
function harness(enabled = true) {
  const views: (ImageSkillView | null)[] = [], events: ImageSkillEvent[] = [], reports: string[] = []
  let current: typeof ID | null = ID
  const provider = { generate: vi.fn<PortraitImageProvider['generate']>(async () => ok()), edit: vi.fn<PortraitImageProvider['edit']>(async () => ok()) }
  const capture = vi.fn(async () => ({ bytes: Buffer.from('synthetic-photo'), mimeType: 'image/jpeg' as const }))
  const studioUsePhoto = vi.fn(() => true), studioActive = vi.fn(() => false), studioCanUsePhoto = vi.fn(() => true)
  const activity = vi.fn(), quality = vi.fn(async () => 'medium' as const), usable = vi.fn(async () => true)
  const runtime = createImageSkillRuntime({ provider, usable, quality, enabled: () => enabled, current: () => current, capture,
    studioActive, studioCanUsePhoto, studioUsePhoto, dispatch: view => views.push(view), event: event => events.push(event), report: reason => reports.push(reason), activity })
  return { runtime, provider, capture, studioUsePhoto, studioActive, studioCanUsePhoto, activity, quality, usable, views, events, reports,
    request: (source: 'description' | 'photo' = 'description') => runtime.handle({ action: 'generate', prompt: 'A wizard in a forest', picture: 'portrait', source, language: 'en' }, ID),
    consent: () => events.filter((e): e is Extract<ImageSkillEvent, { event: 'consent' }> => e.event === 'consent').at(-1)!,
    end() { current = null; runtime.syncIdentity(null) } }
}
afterEach(() => vi.useRealTimers())
describe('shared image skill ownership and photo consent', () => {
  it('denies image effects when disabled but keeps ordinary camera permission and cleanup available', async () => {
    const h = harness(false)
    for (const source of ['description', 'photo'] as const) expect(await h.request(source)).toMatchObject({ code: 'image_skill_disabled' })
    expect(await h.runtime.handle({ action: 'edit', prompt: 'a sky', language: 'en' }, ID)).toMatchObject({ code: 'image_skill_disabled' })
    expect(await h.runtime.handle({ action: 'studio_photo', language: 'en' }, ID)).toMatchObject({ code: 'image_skill_disabled' })
    expect(h.provider.generate).not.toHaveBeenCalled(); expect(h.provider.edit).not.toHaveBeenCalled()
    expect(h.capture).not.toHaveBeenCalled(); expect(h.usable).not.toHaveBeenCalled()
    expect(await h.runtime.handle({ action: 'camera_permission', language: 'en' }, ID)).toMatchObject({ code: 'image_consent_pending' })
    expect(await h.runtime.handle({ action: 'dismiss' }, ID)).toMatchObject({ code: 'image_dismissed' })
  })
  it('authorizes one ordinary-camera capture only after playback, approval and countdown; expires and revokes it', async () => {
    vi.useFakeTimers(); const h = harness()
    const approve = async () => {
      await h.runtime.handle({ action: 'camera_permission', language: 'en' }, ID)
      const c = h.consent()
      expect(c.line).toBe(IMAGE_SKILL.cameraConsent.en)
      expect(h.runtime.consumeCameraPermit(ID)).toBe(false)
      await h.runtime.handle({ action: 'consent_ready', ticket: c.ticket }, ID)
      await h.runtime.handle({ action: 'photo_reply', ticket: c.ticket, text: 'use my photo', itemId: 'yes' }, ID)
      expect(h.runtime.consumeCameraPermit(ID)).toBe(false)
      await vi.advanceTimersByTimeAsync(IMAGE_SKILL.countdownMs)
      expect(h.capture).not.toHaveBeenCalled(); expect(h.provider.edit).not.toHaveBeenCalled()
      expect(h.events.at(-1)).toMatchObject({ event: 'camera_approved' })
    }
    await approve(); expect(h.runtime.consumeCameraPermit(ID)).toBe(true); expect(h.runtime.consumeCameraPermit(ID)).toBe(false)
    await approve(); await vi.advanceTimersByTimeAsync(15001); expect(h.runtime.consumeCameraPermit(ID)).toBe(false)
    await approve(); h.runtime.close('scene_changed'); expect(h.runtime.consumeCameraPermit(ID)).toBe(false)
    await approve(); h.end(); expect(h.runtime.consumeCameraPermit(ID)).toBe(false)
  })
  it('lets an explicit photo-art tool replace an unapproved surroundings request without capturing', async () => {
    const h = harness(); await h.runtime.handle({ action: 'camera_permission', language: 'en' }, ID)
    const previous = h.consent().ticket
    expect(await h.request('photo')).toMatchObject({ code: 'image_consent_pending' })
    expect(h.consent().ticket).not.toBe(previous); expect(h.capture).not.toHaveBeenCalled()
    expect(h.views.at(-1)?.target).toBe('conversation'); h.runtime.close('test_end')
  })
  it('uses the Studio provider for text generation, edits its bytes, and releases the previous image URL', async () => {
    const h = harness(); await h.request(); await vi.waitFor(() => expect(h.views.at(-1)?.phase).toBe('ready'))
    const oldId = h.views.at(-1)!.imageUrl!.split('/').at(-1)!
    expect(h.runtime.image(oldId)).toBeDefined(); expect(h.capture).not.toHaveBeenCalled()
    await h.runtime.handle({ action: 'edit', prompt: 'Purple sky', language: 'en' }, ID)
    await vi.waitFor(() => expect(h.provider.edit).toHaveBeenCalledOnce())
    expect(h.provider.edit.mock.calls[0]![0]).toMatchObject({ image: Buffer.from('synthetic-png') })
    await vi.waitFor(() => expect(h.runtime.image(oldId)).toBeUndefined())
    h.runtime.close('image_dismissed'); expect(h.views.at(-1)).toBeNull()
  })
  it('never captures on an early, denied, quoted, or model-invented confirmation', async () => {
    vi.useFakeTimers(); const h = harness(); await h.request('photo'); const c = h.consent()
    expect(await h.runtime.handle({ action: 'photo_reply', ticket: c.ticket, text: 'use my photo', itemId: 'early' }, ID)).toMatchObject({ code: 'image_consent_not_ready' })
    await h.runtime.handle({ action: 'consent_ready', ticket: c.ticket }, ID)
    await h.runtime.handle({ action: 'photo_reply', ticket: c.ticket, text: 'Someone said use my photo', itemId: 'quote' }, ID)
    const again = h.consent(); expect(again.ticket).not.toBe(c.ticket)
    await h.runtime.handle({ action: 'consent_ready', ticket: again.ticket }, ID)
    await h.runtime.handle({ action: 'photo_reply', ticket: again.ticket, text: 'do not use my photo', itemId: 'no' }, ID)
    await vi.advanceTimersByTimeAsync(5000); expect(h.capture).not.toHaveBeenCalled(); expect(h.provider.edit).not.toHaveBeenCalled()
    expect(parseImageSkillRequest({ action: 'photo_reply', confirmed: true })).toBeNull()
  })
  it('captures exactly once after playback, explicit approval and the countdown, using photo bytes for the edit endpoint', async () => {
    vi.useFakeTimers(); const h = harness(); await h.request('photo'); const c = h.consent()
    await h.runtime.handle({ action: 'consent_ready', ticket: c.ticket }, ID)
    const request = { action: 'photo_reply' as const, ticket: c.ticket, text: 'Use my photo.', itemId: 'yes' }
    expect(await h.runtime.handle(request, ID)).toMatchObject({ code: 'image_photo_approved' })
    await h.runtime.handle(request, ID)
    expect(h.capture).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(IMAGE_SKILL.countdownMs)
    expect(h.capture).toHaveBeenCalledOnce(); expect(h.provider.generate).not.toHaveBeenCalled()
    expect(h.provider.edit).toHaveBeenCalledWith(expect.objectContaining({ image: Buffer.from('synthetic-photo'), signal: expect.any(AbortSignal) }))
    expect(h.views.at(-1)?.phase).toBe('ready')
  })
  it.each(['consent', 'countdown', 'capture', 'generation'] as const)('cancels at %s and ignores late completions', async phase => {
    vi.useFakeTimers(); const h = harness()
    let captured: ((v: Awaited<ReturnType<typeof h.capture>>) => void) | undefined
    let generated: ((v: PortraitImageResult) => void) | undefined
    if (phase === 'capture') h.capture.mockImplementation(() => new Promise(resolve => { captured = resolve }))
    if (phase === 'generation') h.provider.edit.mockImplementation(() => new Promise(resolve => { generated = resolve }))
    await h.request('photo'); const c = h.consent()
    if (phase !== 'consent') {
      await h.runtime.handle({ action: 'consent_ready', ticket: c.ticket }, ID)
      await h.runtime.handle({ action: 'photo_reply', ticket: c.ticket, text: 'use my photo', itemId: 'yes' }, ID)
    }
    if (phase === 'capture' || phase === 'generation') await vi.advanceTimersByTimeAsync(IMAGE_SKILL.countdownMs)
    h.end(); captured?.({ bytes: Buffer.from('photo'), mimeType: 'image/jpeg' }); generated?.(ok())
    await vi.advanceTimersByTimeAsync(50000)
    expect(h.views.at(-1)).toBeNull(); expect(h.events.some(e => e.event === 'ready')).toBe(false)
    expect(h.activity.mock.calls.filter(c => c[0] === 'started')).toHaveLength(1)
    expect(h.activity.mock.calls.filter(c => c[0] === 'finished')).toHaveLength(1)
  })
  it('cancels asynchronous startup without reviving it, and rejects duplicate jobs', async () => {
    const h = harness(); let resolve!: (q: 'medium') => void
    h.quality.mockImplementation(() => new Promise(r => { resolve = r }))
    const first = h.request(); expect(await h.request()).toMatchObject({ code: 'image_busy' })
    h.runtime.close('image_dismissed'); resolve('medium')
    expect(await first).toMatchObject({ code: 'image_start_stale' }); expect(h.provider.generate).not.toHaveBeenCalled()
  })
  it('reserves the photo step before asynchronous configuration finishes', async () => {
    const h = harness(); let resolve!: (q: 'medium') => void
    h.quality.mockImplementation(() => new Promise(r => { resolve = r }))
    const first = h.runtime.handle({ action: 'studio_photo', language: 'en' }, ID)
    expect(h.runtime.photoPending()).toBe(true)
    h.runtime.close('image_dismissed'); resolve('medium')
    expect(await first).toMatchObject({ code: 'image_start_stale' }); expect(h.runtime.photoPending()).toBe(false)
  })
  it('keeps the successful picture after a provider edit failure', async () => {
    const h = harness(); await h.request(); await vi.waitFor(() => expect(h.views.at(-1)?.phase).toBe('ready'))
    const url = h.views.at(-1)!.imageUrl
    h.provider.edit.mockResolvedValue({ ok: false, code: 'studio_image_unavailable', elapsedMs: 1 })
    await h.runtime.handle({ action: 'edit', prompt: 'Purple sky', language: 'en' }, ID)
    await vi.waitFor(() => expect(h.reports).toContain('image_image_unavailable'))
    expect(h.views.at(-1)).toMatchObject({ phase: 'ready', imageUrl: url })
  })
  it('expires unused consent and never transfers it to a new session', async () => {
    vi.useFakeTimers(); const h = harness(); await h.request('photo'); const c = h.consent()
    expect(await h.runtime.handle({ action: 'consent_ready', ticket: c.ticket }, { ...ID, sessionGeneration: 2 })).toMatchObject({ code: 'image_session_stale' })
    await vi.advanceTimersByTimeAsync(IMAGE_SKILL.consentTimeoutMs)
    expect(h.capture).not.toHaveBeenCalled(); expect(h.runtime.photoPending()).toBe(false)
  })
  it('attaches an approved photo to Studio without launching a second picture or changing its steps', async () => {
    vi.useFakeTimers(); const h = harness(); h.studioActive.mockReturnValue(true)
    await h.runtime.handle({ action: 'studio_photo', language: 'en' }, ID); const c = h.consent()
    await h.runtime.handle({ action: 'consent_ready', ticket: c.ticket }, ID)
    await h.runtime.handle({ action: 'photo_reply', ticket: c.ticket, text: 'use my photo', itemId: 'yes' }, ID)
    await vi.advanceTimersByTimeAsync(IMAGE_SKILL.countdownMs)
    expect(h.studioUsePhoto).toHaveBeenCalledOnce(); expect(h.provider.edit).not.toHaveBeenCalled(); expect(h.views.at(-1)).toBeNull()
    expect(h.events.at(-1)).toMatchObject({ event: 'closed', outcome: 'photo_attached' })
    expect(parseImageSkillEvent(h.events.at(-1))).toEqual(h.events.at(-1))
  })
  it('Studio preserves its normal question/reveal/change flow when a photo is attached', async () => {
    const h = harness(); const commands: unknown[] = []
    const runtime = createStudioRuntime({ provider: () => h.provider, dispatch: command => { commands.push(command); return true }, activity: vi.fn(), report: vi.fn() })
    const experience = defaultExperience(); experience.studio.askName = false; experience.studio.questions = [experience.studio.questions[0]!]
    runtime.start(ID, experience, 'visitor')
    expect(runtime.usePhoto(ID, { bytes: Buffer.from('guest-photo'), mimeType: 'image/jpeg' })).toBe(true)
    runtime.handle({ action: 'answer', question: 1, answer: 'a wizard', language: 'en' }, ID)
    await vi.waitFor(() => expect(runtime.phase()).toBe('reveal'))
    expect(h.provider.generate).not.toHaveBeenCalled(); expect(h.provider.edit).toHaveBeenCalledWith(expect.objectContaining({ image: Buffer.from('guest-photo') }))
    runtime.handle({ action: 'revise', change: 'purple sky' }, ID)
    await vi.waitFor(() => expect(h.provider.edit).toHaveBeenCalledTimes(2))
    expect(h.provider.edit.mock.calls[1]![0]).toMatchObject({ image: Buffer.from('synthetic-png') })
    runtime.close('studio_exited')
  })
  it('rejects malformed commands, URLs and event payloads', () => {
    expect(parseImageSkillRequest({ action: 'generate', prompt: 'x', source: 'photo', picture: 'portrait', language: 'en', confirmed: true })).toBeNull()
    expect(parseImageSkillView({ id: 'a', phase: 'ready', language: 'en', target: 'conversation', picture: 'portrait', imageUrl: 'https://example.com/private' })).toBeNull()
    expect(parseImageSkillEvent({ event: 'consent', id: 'a', ticket: 't', line: 'Question?', extra: true })).toBeNull()
  })
})
