import { SAMPLE_STUDIO_CONCEPT } from '../../src/shared/studio-concept'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerImageSkillIpc } from '../../src/main/studio/image-skill-ipc'
import { IMAGE_SKILL, type ImageSkillEvent, type ImageSkillReply, type ImageSkillRequest } from '../../src/shared/image-skill'
import type { CameraSnapshot } from '../../src/shared/camera-tracking'
import type { StudioIpc } from '../../src/main/studio/studio-ipc'

const decoder = vi.hoisted(() => ({ empty: false, width: 1920, height: 1080, crops: [] as unknown[], cropEmpty: false }))
vi.mock('electron', () => ({ nativeImage: { createFromDataURL: () => ({ isEmpty: () => decoder.empty,
  getSize: () => ({ width: decoder.width, height: decoder.height }),
  crop: (rect: unknown) => { decoder.crops.push(rect); return { isEmpty: () => decoder.cropEmpty, toJPEG: (quality: number) => Buffer.from(`person-${quality}`) } } }) } }))
const identity = { realtimeSessionId: 'synthetic-visit', sessionGeneration: 1 }
function harness(frame: CameraSnapshot | null, enabled = true) {
  const events: ImageSkillEvent[] = [], report = vi.fn(), capture = vi.fn(async () => frame)
  const provider = { edit: vi.fn(async () => ({ ok: true as const, image: Buffer.from('art'), mimeType: 'image/png' as const, elapsedMs: 1 })), generate: vi.fn() }
  let handler!: (event: unknown, ...args: unknown[]) => unknown
  const runtime = registerImageSkillIpc({ ipcMain: { handle: (_channel, fn) => { handler = fn } }, authorize: event => event === 'mirror',
    snapshot: () => ({ lifecycle: 'active', ...identity }), enabled: () => enabled,
    images: { concepts: { select: async () => ({ ok: true, concept: SAMPLE_STUDIO_CONCEPT, elapsedMs: 0 }) }, provider, usable: async () => true, status: async () => ({ status: 'signed_in' }) }, studio: {
      active: () => false, canUsePhoto: () => false, usePhoto: () => false, clearPhoto: () => false } as unknown as StudioIpc,
    quality: async () => 'medium', capture, report, activity: vi.fn(), dispatch: command => {
      if (command.type === 'image_event') events.push(command.event)
      return true
    } })
  const request = (value: ImageSkillRequest) => handler('mirror', { identity, request: value }) as Promise<ImageSkillReply>
  return { runtime, handler, request, capture, provider, report, events,
    async approve() {
      await request({ action: 'generate', prompt: 'A wizard portrait', source: 'photo', picture: 'portrait', language: 'en' })
      const consent = events.find((event): event is Extract<ImageSkillEvent, { event: 'consent' }> => event.event === 'consent')!
      await request({ action: 'consent_ready', ticket: consent.ticket })
      await request({ action: 'photo_reply', ticket: consent.ticket, text: 'use my photo', itemId: 'final-yes' })
      await vi.advanceTimersByTimeAsync(IMAGE_SKILL.countdownMs)
    } }
}
const photo = (): CameraSnapshot => ({ width: 1920, height: 1080, dataUrl: 'data:image/jpeg;base64,cGhvdG8=', faceCount: 1 })
afterEach(() => { vi.useRealTimers(); decoder.empty = false; decoder.width = 1920; decoder.height = 1080; decoder.crops = []; decoder.cropEmpty = false })
describe('image IPC authorization and portrait acceptance', () => {
  it('enforces the assignment in Main even for a forged image tool request', async () => {
    const h = harness(photo(), false)
    expect(await h.request({ action: 'generate', prompt: 'A wizard', source: 'photo', picture: 'portrait', language: 'en' }))
      .toMatchObject({ status: 'rejected', code: 'image_skill_disabled' })
    expect(h.capture).not.toHaveBeenCalled(); expect(h.provider.edit).not.toHaveBeenCalled(); expect(h.provider.generate).not.toHaveBeenCalled()
  })
  it('rejects unauthorized, malformed and stale requests before capture or generation', async () => {
    const h = harness(photo()), request = { action: 'generate', prompt: 'A wizard', source: 'photo', picture: 'portrait', language: 'en' }
    expect(await h.handler('console', { identity, request })).toMatchObject({ code: 'image_sender_rejected' })
    expect(await h.handler('mirror', { identity, request, confirmed: true })).toMatchObject({ code: 'image_request_invalid' })
    expect(await h.handler('mirror', { identity: { ...identity, sessionGeneration: 2 }, request })).toMatchObject({ code: 'image_session_stale' })
    expect(h.capture).not.toHaveBeenCalled(); expect(h.provider.edit).not.toHaveBeenCalled()
  })
  it.each([null, { ...photo(), width: 4096 }, { ...photo(), faceCount: undefined }, { ...photo(), faceCount: 0 }, { ...photo(), faceCount: 0, faces: [] }])('does not upload an absent, invalid-sized or faceless capture %#', async frame => {
    vi.useFakeTimers(); const h = harness(frame); await h.approve()
    expect(h.capture).toHaveBeenCalledOnce(); expect(h.provider.edit).not.toHaveBeenCalled()
    expect(h.report).toHaveBeenCalledWith('image_photo_quality_rejected')
    expect(h.events).toContainEqual(expect.objectContaining({ event: 'line', line: IMAGE_SKILL.speech.en.cameraFailed }))
    h.runtime.close('test_end')
  })
  it.each(['empty', 'wrong-size'])('does not upload a capture with a %s decode', async failure => {
    vi.useFakeTimers(); decoder.empty = failure === 'empty'; decoder.width = failure === 'wrong-size' ? 640 : 1920
    const h = harness(photo()); await h.approve()
    expect(h.provider.edit).not.toHaveBeenCalled(); expect(h.report).toHaveBeenCalledWith('image_photo_decode_rejected')
    h.runtime.close('test_end')
  })
  it.each([[1920, 1080], [1080, 1920], [1280, 720]])('uploads only the fresh approved %ix%i single-face photo through the shared provider', async (width, height) => {
    vi.useFakeTimers(); decoder.width = width; decoder.height = height
    const h = harness({ ...photo(), width, height }); await h.approve()
    expect(h.provider.edit).toHaveBeenCalledOnce()
    expect(h.provider.edit).toHaveBeenCalledWith(expect.objectContaining({ image: Buffer.from('photo'), mimeType: 'image/jpeg' }))
    expect(h.events).toContainEqual(expect.objectContaining({ event: 'ready' })); h.runtime.close('test_end')
    expect(decoder.crops).toEqual([])
  })
  it('uploads only the nearest person when several people are in view (owner 11-15)', async () => {
    vi.useFakeTimers()
    const h = harness({ ...photo(), faceCount: 2, faces: [{ x: 0.7, y: 0.35, width: 0.08, height: 0.12 }, { x: 0.4, y: 0.3, width: 0.2, height: 0.3 }] })
    await h.approve()
    expect(decoder.crops).toEqual([{ x: 384, y: 32, width: 960, height: 1048 }])
    expect(h.provider.edit).toHaveBeenCalledWith(expect.objectContaining({ image: Buffer.from('person-95'), mimeType: 'image/jpeg' }))
    expect(h.report).toHaveBeenCalledWith('image_photo_nearest_person_selected')
    expect(h.report).not.toHaveBeenCalledWith('image_photo_quality_rejected'); h.runtime.close('test_end')
  })
  it('does not upload when the nearest person cannot be cut out of the photo', async () => {
    vi.useFakeTimers(); decoder.cropEmpty = true
    const h = harness({ ...photo(), faceCount: 2, faces: [{ x: 0.7, y: 0.35, width: 0.08, height: 0.12 }, { x: 0.4, y: 0.3, width: 0.2, height: 0.3 }] })
    await h.approve()
    expect(h.provider.edit).not.toHaveBeenCalled(); expect(h.report).toHaveBeenCalledWith('image_photo_decode_rejected')
    h.runtime.close('test_end')
  })
})
