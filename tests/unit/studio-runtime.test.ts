import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStudioRuntime } from '../../src/main/studio/studio-runtime'
import type { PortraitImageProvider, PortraitImageResult } from '../../src/main/studio/image-provider'
import { defaultExperience, parseStudioSessionEvent, parseStudioView, studioText, type AvatarExperience } from '../../src/shared/portrait-studio'
import { PORTRAIT_STUDIO } from '../../src/shared/portrait-studio-config'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)])
const identity = { realtimeSessionId: 'rt-1', sessionGeneration: 1 }
const okImage: PortraitImageResult = { ok: true, image: PNG, mimeType: 'image/png', elapsedMs: 1200 }

function harness(options: { experience?: AvatarExperience; results?: PortraitImageResult[]; provider?: boolean } = {}) {
  const commands: { type: string; view?: unknown; event?: unknown }[] = []
  const activity: string[] = []
  const reports: string[] = []
  const results = [...(options.results ?? [okImage, okImage])]
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  const calls: { kind: string; prompt: string; signal?: AbortSignal }[] = []
  const provider: PortraitImageProvider = {
    generate: async ({ prompt, signal }) => { calls.push({ kind: 'generate', prompt, signal }); await gate; return results.shift()! },
    edit: async ({ prompt }) => { calls.push({ kind: 'edit', prompt }); return results.shift()! },
  }
  const runtime = createStudioRuntime({
    provider: () => options.provider === false ? null : provider,
    dispatch: command => { commands.push(command as never); return true },
    activity: (kind, runId) => activity.push(`${kind}:${runId.slice(0, 7)}`),
    report: reason => reports.push(reason),
  })
  const experience = options.experience ?? defaultExperience()
  const events = () => commands.filter(c => c.type === 'studio_event').map(c => c.event as { event: string })
  const views = () => commands.filter(c => c.type === 'studio_view').map(c => c.view)
  return { runtime, experience, commands, events, views, activity, reports, calls, release: () => release!() }
}
async function answerAll(h: ReturnType<typeof harness>, count = 4) {
  for (let i = 1; i <= count; i++) h.runtime.handle({ action: 'answer', question: i, answer: `answer ${i}`, language: 'zh' }, identity)
}
afterEach(() => { vi.useRealTimers() })

describe('portrait studio runtime', () => {
  it('keeps every versioned guidance prompt valid as a studio reply (one line)', () => {
    for (const text of Object.values(PORTRAIT_STUDIO.guidance)) expect(studioText(text, 2000)).toBe(true)
  })

  it('starts in the start script language, so an English story asks and shows its first question in English', () => {
    const english = harness({ experience: { ...defaultExperience(), studio: { ...defaultExperience().studio, askName: false,
      startScript: 'Welcome, traveller. Answer three questions.' } } })
    expect(english.runtime.start(identity, english.experience, 'console').next).toContain('If you could become any animal or creature')
    expect(english.views().at(-1)).toMatchObject({ language: 'en', prompt: 'If you could become any animal or creature, what would it be?' })
    const chinese = harness()
    expect(chinese.runtime.start(identity, chinese.experience, 'console').next).toContain('畫上要寫什麼名字')
    expect(chinese.views().at(-1)).toMatchObject({ language: 'zh' })
  })

  it('runs name → questions → painting → reveal → change → keepsake with valid views and events', async () => {
    vi.useFakeTimers()
    const h = harness()
    expect(h.runtime.start(identity, h.experience, 'visitor')).toMatchObject({ status: 'accepted', next: expect.stringContaining('畫上要寫什麼名字') })
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: false, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_heard', next: expect.stringContaining('「王曉明」') })
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_confirmed', next: expect.stringContaining('1 of 4') })
    for (let i = 1; i < 4; i++) expect(h.runtime.handle({ action: 'answer', question: i, answer: `a${i}`, language: 'zh' }, identity).next).toContain(`${i + 1} of 4`)
    expect(h.runtime.handle({ action: 'answer', question: 4, answer: 'a4', language: 'zh' }, identity)).toMatchObject({ code: 'studio_painting' })
    expect(h.runtime.phase()).toBe('painting')
    expect(h.activity).toHaveLength(1)
    h.release()
    await vi.runAllTimersAsync()
    expect(h.runtime.phase()).toBe('reveal')
    // Reveal is a spoken step: an absent visitor idles out normally.
    expect(h.activity.at(-1)).toMatch(/^finished:/)
    const ready = h.events().find(e => e.event === 'ready') as unknown as { imageUrl: string }
    expect(parseStudioSessionEvent(ready)).not.toBeNull()
    expect(h.runtime.image(ready.imageUrl.split('/').pop()!)?.bytes.equals(PNG)).toBe(true)
    expect(h.runtime.handle({ action: 'revise', change: '把海邊換成雪地', language: 'zh' } as never, identity)).toMatchObject({ code: 'studio_repainting' })
    await vi.runAllTimersAsync()
    expect(h.calls.map(c => c.kind)).toEqual(['generate', 'edit'])
    expect(h.runtime.handle({ action: 'revise', change: 'again' } as never, identity)).toMatchObject({ code: 'studio_no_changes_left' })
    expect(h.runtime.handle({ action: 'finish' }, identity)).toMatchObject({ code: 'studio_finished' })
    expect(h.runtime.phase()).toBe('keepsake')
    for (const view of h.views()) if (view) expect(parseStudioView(view)).not.toBeNull()
    await vi.advanceTimersByTimeAsync(45_000)
    expect(h.events().at(-1)).toEqual({ event: 'keepsake_done', afterPortrait: 'continue' })
    expect(h.runtime.isActive()).toBe(false)
    // Held while painting, repainting and the keepsake countdown; released after each.
    expect(h.activity.map(a => a.split(':')[0])).toEqual(['started', 'finished', 'started', 'finished', 'started', 'finished'])
    expect(h.views().at(-1)).toBeNull()
  })

  it('never puts the visitor name into the image prompt in nameplate mode, and keeps telemetry metadata-only', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)
    await answerAll(h)
    h.release()
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
    expect(h.calls[0]!.prompt).not.toContain('王曉明')
    expect(h.calls[0]!.prompt).toContain('"answer 1"')
    expect(h.reports.join(' ')).not.toMatch(/王曉明|answer 1/)
  })

  it('offers guest-list candidates and enforces only-mode', () => {
    const experience = defaultExperience()
    experience.guests = { names: ['王曉明', '林美玲'], match: 'only' }
    const h = harness({ experience })
    h.runtime.start(identity, experience, 'visitor')
    expect(h.runtime.handle({ action: 'set_name', name: '王小明', confirmed: false, language: 'zh' }, identity))
      .toMatchObject({ code: 'studio_name_candidates', candidates: ['王曉明'] })
    expect(h.runtime.handle({ action: 'set_name', name: '陌生人', confirmed: true, language: 'zh' }, identity))
      .toMatchObject({ status: 'rejected', code: 'studio_name_not_listed' })
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_confirmed' })
  })

  it('rejects wrong steps, ignores duplicates and stale sessions', () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    expect(h.runtime.start(identity, h.experience, 'visitor')).toMatchObject({ status: 'ignored', code: 'studio_start_duplicate' })
    expect(h.runtime.handle({ action: 'answer', question: 1, answer: 'x', language: 'zh' }, identity)).toMatchObject({ status: 'rejected', code: 'studio_wrong_step' })
    h.runtime.handle({ action: 'set_name', name: 'Amy', confirmed: true, language: 'en' }, identity)
    h.runtime.handle({ action: 'answer', question: 1, answer: 'owl', language: 'en' }, identity)
    expect(h.runtime.handle({ action: 'answer', question: 1, answer: 'owl', language: 'en' }, identity)).toMatchObject({ status: 'ignored', code: 'studio_answer_duplicate' })
    // A different answer to the question just recorded replaces it and the current question is asked again.
    expect(h.runtime.handle({ action: 'answer', question: 1, answer: 'dragon', language: 'en' }, identity)).toMatchObject({ status: 'accepted', code: 'studio_answer_replaced', next: expect.stringContaining('2 of 4') })
    expect(h.views().at(-1)).toMatchObject({ phase: 'question', answered: 1 })
    expect(h.runtime.handle({ action: 'answer', question: 3, answer: 'x', language: 'en' }, identity)).toMatchObject({ code: 'studio_wrong_step' })
    expect(h.runtime.handle({ action: 'finish' }, { realtimeSessionId: 'rt-2', sessionGeneration: 2 })).toMatchObject({ code: 'studio_not_active_stale' })
    expect(h.runtime.handle({ action: 'finish' }, identity)).toMatchObject({ code: 'studio_wrong_step' })
  })

  it('reports failures in character, closes, and releases the idle hold; a failed change keeps the portrait', async () => {
    const failing = harness({ results: [{ ok: false, code: 'studio_quota_exhausted', elapsedMs: 5 }] })
    failing.runtime.start(identity, failing.experience, 'visitor')
    failing.runtime.handle({ action: 'set_name', name: 'Amy', confirmed: true, language: 'en' }, identity)
    await answerAll(failing)
    failing.release()
    await vi.waitFor(() => expect(failing.runtime.isActive()).toBe(false))
    expect(failing.events().at(-1)).toMatchObject({ event: 'failed', code: 'studio_quota_exhausted', keepPortrait: false, line: expect.stringContaining('顏料') })
    expect(failing.activity.map(a => a.split(':')[0])).toEqual(['started', 'finished'])

    const edit = harness({ results: [okImage, { ok: false, code: 'studio_image_unavailable', elapsedMs: 5 }] })
    edit.runtime.start(identity, edit.experience, 'visitor')
    edit.runtime.handle({ action: 'set_name', name: 'Amy', confirmed: true, language: 'en' }, identity)
    await answerAll(edit)
    edit.release()
    await vi.waitFor(() => expect(edit.runtime.phase()).toBe('reveal'))
    edit.runtime.handle({ action: 'revise', change: 'snow' }, identity)
    await vi.waitFor(() => expect(edit.runtime.phase()).toBe('keepsake'))
    expect(edit.events().at(-1)).toMatchObject({ event: 'failed', keepPortrait: true })
  })

  it('aborts painting on close and ignores a late image; unavailable provider rejects start', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    h.runtime.handle({ action: 'set_name', name: 'Amy', confirmed: true, language: 'en' }, identity)
    await answerAll(h)
    expect(h.calls[0]!.signal?.aborted).toBe(false)
    h.runtime.close('studio_session_ended')
    expect(h.calls[0]!.signal?.aborted).toBe(true)
    h.release()
    await Promise.resolve(); await Promise.resolve()
    expect(h.events().some(e => e.event === 'ready')).toBe(false)
    expect(h.activity.map(a => a.split(':')[0])).toEqual(['started', 'finished'])
    const off = harness({ provider: false })
    expect(off.runtime.start(identity, off.experience, 'visitor')).toMatchObject({ status: 'rejected', code: 'studio_unavailable' })
    const disabled = defaultExperience(); disabled.visitorMayRequest = false
    expect(harness().runtime.start(identity, disabled, 'visitor')).toMatchObject({ code: 'studio_not_enabled' })
  })

  it('starts a session default only for a studio-default avatar', () => {
    const h = harness()
    expect(h.runtime.start(identity, h.experience, 'session_default')).toMatchObject({ status: 'rejected', code: 'studio_not_enabled' })
    expect(h.runtime.start(identity, { ...h.experience, defaultMode: 'portrait_studio' }, 'session_default')).toMatchObject({ status: 'accepted' })
  })

  it('closes when its session is replaced or ends, releasing the idle hold', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)
    await answerAll(h)
    h.runtime.syncIdentity(identity)
    expect(h.runtime.isActive()).toBe(true)
    h.runtime.syncIdentity({ realtimeSessionId: 'rt-2', sessionGeneration: 2 })
    expect(h.runtime.isActive()).toBe(false)
    expect(h.events().at(-1)).toEqual({ event: 'closed', reason: 'studio_session_replaced' })
    expect(h.commands.at(-1)).toMatchObject({ identity })
    expect(h.activity.map(a => a.split(':')[0])).toEqual(['started', 'finished'])
    h.runtime.start(identity, h.experience, 'visitor')
    h.runtime.syncIdentity(null)
    expect(h.reports).toContain('studio_session_ended')
  })

  it('gives keepsake guidance, not painting guidance, during the photo countdown', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)
    await answerAll(h)
    h.release()
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
    h.runtime.handle({ action: 'finish' }, identity)
    const reply = h.runtime.handle({ action: 'set_name', name: '李小華', confirmed: false, language: 'zh' }, identity)
    expect(reply.next).toContain('photograph')
    expect(reply.next).not.toContain('being painted')
  })

  it("guides the avatar with this avatar's stage prompts where the operator edited them", () => {
    const h = harness()
    const experience = { ...h.experience, studio: { ...h.experience.studio, prompts: { askName: 'Open warmly, then ask: {{question}}', confirmName: 'Spell out 「{{name}}」.' } } }
    expect(h.runtime.start(identity, experience, 'visitor').next).toBe(`Open warmly, then ask: ${experience.studio.nameQuestion.zh}`)
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: false, language: 'zh' }, identity).next).toBe('Spell out 「王曉明」.')
    // Stages without an override keep the versioned default.
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity).next).toContain('1 of 4')
  })

  it('runs without a name step, with this avatar\'s question lines, on-glass text and failure lines', async () => {
    const base = defaultExperience()
    const experience: AvatarExperience = { ...base, studio: { ...base.studio, askName: false, nameLettering: 'painted',
      questions: base.studio.questions.map((q, i) => i === 0 ? { ...q, imageLine: 'Card figure: {{answer}}.' } : q),
      screenText: { questionLabel: { zh: '第 {{index}} 關', en: 'Step {{index}}' } },
      failureLines: { default: { zh: '牌卡散了，我們聊聊吧。', en: 'The cards scattered. Let us talk.' } },
      prompts: { busy: '還在洗牌，先聊聊。' } } }
    const h = harness({ experience, results: [{ ok: false, code: 'studio_image_unavailable', elapsedMs: 5 }] })
    const started = h.runtime.start(identity, experience, 'mode')
    expect(started).toMatchObject({ status: 'accepted', code: 'studio_started' })
    expect(started.next).toContain(base.studio.questions[0]!.zh)
    const view = parseStudioView(h.views().at(-1))!
    expect(view).toMatchObject({ phase: 'question', askName: false })
    expect(view.text.questionLabel).toBe('第 1 關')
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ status: 'rejected', code: 'studio_wrong_step' })
    expect(h.reports).toContain('studio_started_mode')
    await answerAll(h)
    // While painting, a stray step gets this avatar's While painting guidance.
    expect(h.runtime.handle({ action: 'answer', question: 5, answer: 'x', language: 'zh' }, identity).next).toContain('還在洗牌')
    expect(h.calls[0]!.prompt).toContain('Card figure: "answer 1".')
    expect(h.calls[0]!.prompt).not.toContain('王曉明')
    h.release()
    await vi.waitFor(() => expect(h.events().at(-1)).toMatchObject({ event: 'failed', line: '牌卡散了，我們聊聊吧。' }))
  })

  it('ends a studio-mode run with the farewell and a visitor-asked run with conversation', async () => {
    vi.useFakeTimers()
    for (const [source, after] of [['session_default', 'farewell'], ['mode', 'farewell'], ['visitor', 'continue'], ['console', 'continue']] as const) {
      const experience = { ...defaultExperience(), defaultMode: 'portrait_studio' as const }
      const h = harness({ experience })
      h.release()
      expect(h.runtime.start(identity, experience, source).status).toBe('accepted')
      h.runtime.handle({ action: 'set_name', name: 'Mira', confirmed: true, language: 'en' }, identity)
      await answerAll(h)
      await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
      h.runtime.handle({ action: 'finish' }, identity)
      await vi.advanceTimersByTimeAsync(45_000)
      expect(h.events().at(-1)).toEqual({ event: 'keepsake_done', afterPortrait: after })
    }
  })
})

