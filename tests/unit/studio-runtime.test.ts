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
  const results = [...(options.results ?? [okImage, { ...okImage, image: Buffer.concat([PNG, Buffer.from([1])]) }])]
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
  completeCue(h, 'paint')
}
function completeCue(h: ReturnType<typeof harness>, action: 'paint' | 'deliver') {
  const step = (h.events().filter(e => e.event === 'step').at(-1) as unknown as { step: { id: string } }).step
  h.runtime.handle({ action, stepId: step.id }, identity)
}
/** The visitor says the name, hears it read back and agrees. */
function confirmName(h: ReturnType<typeof harness>, name: string, language: 'zh' | 'en' = 'zh') {
  h.runtime.handle({ action: 'set_name', name, confirmed: false, language }, identity)
  return h.runtime.handle({ action: 'set_name', name, confirmed: true, language }, identity)
}
afterEach(() => { vi.useRealTimers() })

describe('portrait studio runtime', () => {
  it('skips rejected ambiguous candidates, reaches the fourth, and confirms only the pending step', () => {
    const experience = defaultExperience()
    experience.guests = { names: ['黃曉明', '王曉明', '李曉明', '張曉明'], match: 'only' }
    const h = harness({ experience })
    const first = h.runtime.start(identity, experience, 'visitor')
    expect(h.runtime.handle({ action: 'confirm_name', stepId: first.step!.id }, identity).status).toBe('rejected')
    let oldStep = first.step!.id
    for (const [index, candidate] of experience.guests.names.entries()) {
      const heard = h.runtime.handle({ action: 'set_name', name: '曉明', confirmed: false, language: 'zh' }, identity)
      // Only the candidate Main reads back leaves Main; the other matches stay there.
      expect(heard.candidates).toEqual([candidate])
      expect(heard.next).toContain(`「${candidate}」`)
      for (const other of experience.guests.names.filter(name => name !== candidate)) expect(heard.next).not.toContain(other)
      expect(h.runtime.handle({ action: 'confirm_name', stepId: oldStep }, identity).code).toBe('studio_step_stale')
      oldStep = heard.step!.id
      if (index < 3) h.runtime.handle({ action: 'reject_name' }, identity)
      else expect(h.runtime.handle({ action: 'confirm_name', stepId: heard.step!.id }, identity).code).toBe('studio_name_confirmed')
    }
    expect(h.views().at(-1)).toMatchObject({ phase: 'question', name: '張曉明' })
    expect(h.runtime.handle({ action: 'confirm_name', stepId: oldStep }, identity).code).toBe('studio_step_stale')
    h.runtime.close('test_complete')
    h.runtime.start(identity, experience, 'visitor')
    expect(h.runtime.handle({ action: 'set_name', name: '曉明', confirmed: false, language: 'zh' }, identity).candidates?.[0]).toBe('黃曉明')
    h.runtime.close('test_complete')
  })

  it('uses aliases and English phonetics in only-mode, and reasks when all candidates were denied', () => {
    const experience = defaultExperience()
    experience.guests = { names: ['Stephen', '單雅婷'], aliases: [{ name: '單雅婷', aliases: ['山雅婷'] }], match: 'only' }
    const h = harness({ experience })
    h.runtime.start(identity, experience, 'visitor')
    expect(h.runtime.handle({ action: 'set_name', name: 'Steven', confirmed: false, language: 'zh' }, identity).candidates).toEqual(['Stephen'])
    h.runtime.handle({ action: 'reject_name' }, identity)
    expect(h.runtime.handle({ action: 'set_name', name: 'Steven', confirmed: false, language: 'zh' }, identity).code).toBe('studio_name_not_listed')
    const aliased = h.runtime.handle({ action: 'set_name', name: '山雅婷', confirmed: false, language: 'zh' }, identity)
    expect(aliased.candidates).toEqual(['單雅婷'])
    h.runtime.handle({ action: 'confirm_name', stepId: aliased.step!.id }, identity)
    expect(h.views().at(-1)).toMatchObject({ phase: 'question', name: '單雅婷', language: 'zh' })
    expect(h.reports.join(' ')).not.toMatch(/Stephen|單雅婷|山雅婷|Steven/)
    h.runtime.close('test_complete')
  })
  it('reports an unchanged provider edit as a failed revision and retains the original picture', async () => {
    const h = harness({ results: [okImage, okImage] })
    h.runtime.start(identity, h.experience, 'visitor')
    confirmName(h, '測試')
    await answerAll(h); h.release()
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
    h.runtime.handle({ action: 'revise', change: 'red wings' }, identity)
    completeCue(h, 'paint')
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('keepsake'))
    expect(h.reports).toContain('studio_revision_unchanged')
    expect(h.reports).not.toContain('studio_revision_ready')
    expect(h.events()).toContainEqual(expect.objectContaining({ event: 'failed', keepPortrait: true }))
    h.runtime.close('test_complete')
  })
  it('keeps the Avatar visible through the last comment and drawing cue, and the picture visible through the revision cue', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    confirmName(h, '測試')
    for (let question = 1; question <= 4; question++) h.runtime.handle({ action: 'answer', question, answer: 'synthetic answer', language: 'zh' }, identity)
    expect(h.runtime.phase()).toBe('painting')
    expect(h.views().at(-1)).toMatchObject({ phase: 'question' })
    expect(h.calls).toHaveLength(0)
    completeCue(h, 'paint')
    expect(h.views().at(-1)).toMatchObject({ phase: 'painting' })
    expect(h.calls).toHaveLength(1)
    h.release()
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
    h.runtime.handle({ action: 'revise', change: 'Make the wings red' }, identity)
    expect(h.views().at(-1)).toMatchObject({ phase: 'reveal' })
    expect(h.calls).toHaveLength(1)
    completeCue(h, 'paint')
    expect(h.views().at(-1)).toMatchObject({ phase: 'revising' })
    await vi.waitFor(() => expect(h.calls).toHaveLength(2))
    const redraw = h.calls[1]!.prompt
    expect(redraw).toContain('Preserve the meaning, not the old rendering.')
    expect(redraw).toContain(h.experience.studio.artStyle)
    expect(redraw).toContain('no gradients, shadows, glow, texture or tiny details')
    expect(redraw.match(/"synthetic answer"/g)).toHaveLength(4)
    expect(redraw).toContain('"Make the wings red"')
    h.runtime.close('test_complete')
  })

  it('keeps every versioned guidance prompt valid as a studio reply (one line)', () => {
    for (const text of Object.values(PORTRAIT_STUDIO.guidance)) expect(studioText(text, 2000)).toBe(true)
  })

  it('starts in Traditional Chinese even when the operator opening includes English', () => {
    const english = harness({ experience: { ...defaultExperience(), studio: { ...defaultExperience().studio, askName: false,
      startScript: 'Welcome, traveller. Answer three questions.' } } })
    expect(english.runtime.start(identity, english.experience, 'console').next).toContain(english.experience.studio.questions[0]!.zh)
    expect(english.views().at(-1)).toMatchObject({ language: 'zh', phase: 'question' })
    expect(english.views().at(-1)).not.toHaveProperty('prompt')
    const chinese = harness()
    expect(chinese.runtime.start(identity, chinese.experience, 'console').next).toContain('準備好的話就告訴我你的名字')
    expect(chinese.views().at(-1)).toMatchObject({ language: 'zh' })
  })

  it('runs name → questions → painting → reveal → change → keepsake with valid views and events', async () => {
    vi.useFakeTimers()
    const h = harness()
    expect(h.runtime.start(identity, h.experience, 'visitor')).toMatchObject({ status: 'accepted', next: expect.stringContaining('準備好的話就告訴我你的名字') })
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: false, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_heard', next: expect.stringContaining('「王曉明」') })
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_confirmed', next: expect.stringContaining('1 of 4') })
    for (let i = 1; i < 4; i++) expect(h.runtime.handle({ action: 'answer', question: i, answer: `a${i}`, language: 'zh' }, identity).next).toContain(`${i + 1} of 4`)
    expect(h.runtime.handle({ action: 'answer', question: 4, answer: 'a4', language: 'zh' }, identity)).toMatchObject({ code: 'studio_painting' })
    expect(h.runtime.phase()).toBe('painting')
    expect(h.calls).toHaveLength(0)
    completeCue(h, 'paint')
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
    completeCue(h, 'paint')
    await vi.runAllTimersAsync()
    expect(h.calls.map(c => c.kind)).toEqual(['generate', 'edit'])
    expect(h.runtime.handle({ action: 'revise', change: 'again' } as never, identity)).toMatchObject({ code: 'studio_no_changes_left' })
    expect(h.runtime.handle({ action: 'finish' }, identity)).toMatchObject({ code: 'studio_finished' })
    expect(h.runtime.phase()).toBe('keepsake')
    for (const view of h.views()) if (view) expect(parseStudioView(view)).not.toBeNull()
    await vi.advanceTimersByTimeAsync(45_000)
    expect(h.runtime.isActive()).toBe(true)
    completeCue(h, 'deliver')
    // A visitor-requested studio returns to the conversation it started in.
    expect(h.events().at(-1)).toEqual({ event: 'keepsake_done', afterPortrait: 'continue' })
    expect(h.runtime.isActive()).toBe(false)
    // Held while painting, repainting and the keepsake countdown; released after each.
    expect(h.activity.map(a => a.split(':')[0])).toEqual(['started', 'finished', 'started', 'finished', 'started', 'finished'])
    expect(h.views().at(-1)).toBeNull()
  })

  it('never puts the visitor name into the image prompt in nameplate mode, and keeps telemetry metadata-only', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    confirmName(h, '王曉明')
    await answerAll(h)
    h.release()
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
    expect(h.calls[0]!.prompt).not.toContain('王曉明')
    expect(h.calls[0]!.prompt).toContain('"answer 1"')
    expect(h.reports.join(' ')).not.toMatch(/王曉明|answer 1/)
  })

  it('never accepts an unconfirmed name, however many times it is read back, and reads back each correction', () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    const setName = (name: string, confirmed: boolean) => h.runtime.handle({ action: 'set_name', name, confirmed, language: 'zh' }, identity)
    for (let i = 0; i < 6; i++) expect(setName('王小明', false)).toMatchObject({ code: 'studio_name_heard', next: expect.stringContaining('「王小明」') })
    expect(setName('王曉明', false)).toMatchObject({ code: 'studio_name_heard', next: expect.stringContaining('「王曉明」') })
    expect(h.runtime.phase()).toBe('confirm')
    expect(h.reports).not.toContain('studio_name_confirmed')
    expect(h.runtime.handle({ action: 'answer', question: 1, answer: 'a1', language: 'zh' }, identity)).toMatchObject({ status: 'rejected', code: 'studio_wrong_step' })
    expect(setName('王曉明', true)).toMatchObject({ code: 'studio_name_confirmed', next: expect.stringContaining('1 of 4') })
    expect(h.views().at(-1)).toMatchObject({ phase: 'question', name: '王曉明' })
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
    // A "confirmed" name without its read-back is read back first.
    expect(h.runtime.handle({ action: 'set_name', name: '林美玲', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_heard' })
    expect(h.runtime.handle({ action: 'set_name', name: '林美玲', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_confirmed' })
  })

  it('rejects wrong steps, ignores duplicates and stale sessions', () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    expect(h.runtime.start(identity, h.experience, 'visitor')).toMatchObject({ status: 'ignored', code: 'studio_start_duplicate' })
    expect(h.runtime.handle({ action: 'answer', question: 1, answer: 'x', language: 'zh' }, identity)).toMatchObject({ status: 'rejected', code: 'studio_wrong_step' })
    confirmName(h, 'Amy', 'en')
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
    confirmName(failing, 'Amy', 'en')
    await answerAll(failing)
    failing.release()
    await vi.waitFor(() => expect(failing.runtime.isActive()).toBe(false))
    expect(failing.events().at(-1)).toMatchObject({ event: 'failed', code: 'studio_quota_exhausted', keepPortrait: false, line: expect.stringContaining('顏料') })
    expect(failing.activity.map(a => a.split(':')[0])).toEqual(['started', 'finished'])

    const edit = harness({ results: [okImage, { ok: false, code: 'studio_image_unavailable', elapsedMs: 5 }] })
    edit.runtime.start(identity, edit.experience, 'visitor')
    confirmName(edit, 'Amy', 'en')
    await answerAll(edit)
    edit.release()
    await vi.waitFor(() => expect(edit.runtime.phase()).toBe('reveal'))
    edit.runtime.handle({ action: 'revise', change: 'snow' }, identity)
    completeCue(edit, 'paint')
    await vi.waitFor(() => expect(edit.runtime.phase()).toBe('keepsake'))
    expect(edit.events()).toContainEqual(expect.objectContaining({ event: 'failed', keepPortrait: true }))
  })

  it('aborts painting on close and ignores a late image; unavailable provider rejects start', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    confirmName(h, 'Amy', 'en')
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
    confirmName(h, '王曉明')
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

  it('gives transfer guidance while the final cue is playing', async () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    confirmName(h, '王曉明')
    await answerAll(h)
    h.release()
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
    h.runtime.handle({ action: 'finish' }, identity)
    const reply = h.runtime.handle({ action: 'set_name', name: '李小華', confirmed: false, language: 'zh' }, identity)
    expect(reply.next).toContain('deferred printer')
    expect(reply.next).not.toContain('being painted')
  })

  it('keeps application-owned questions authoritative over legacy stage prompts', () => {
    const h = harness()
    const experience = { ...h.experience, studio: { ...h.experience.studio, prompts: { askName: 'Open warmly, then ask: {{question}}', confirmName: 'Spell out 「{{name}}」.' } } }
    expect(h.runtime.start(identity, experience, 'visitor').next).toContain(`The application asks the visitor: ${experience.studio.nameQuestion.zh}`)
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: false, language: 'zh' }, identity).next).toContain('The application has read back 「王曉明」')
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
    // Saved on-glass text stays valid but is no longer sent: the glass shows only progress, name and picture.
    expect(view).not.toHaveProperty('text')
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ status: 'rejected', code: 'studio_wrong_step' })
    expect(h.reports).toContain('studio_started_mode')
    await answerAll(h)
    // The app owns painting; old stage instructions cannot ask more questions.
    expect(h.runtime.handle({ action: 'answer', question: 5, answer: 'x', language: 'zh' }, identity).next).toContain('Do not record more story answers')
    expect(h.calls[0]!.prompt).toContain('Card figure: "answer 1".')
    expect(h.calls[0]!.prompt).not.toContain('王曉明')
    h.release()
    await vi.waitFor(() => expect(h.events().at(-1)).toMatchObject({ event: 'failed', line: '牌卡散了，我們聊聊吧。' }))
  })

  it('ends studio-mode visits with the farewell and returns conversation-started visits to conversation', async () => {
    vi.useFakeTimers()
    for (const source of ['session_default', 'mode', 'visitor', 'console'] as const) {
      const experience = { ...defaultExperience(), defaultMode: 'portrait_studio' as const }
      const h = harness({ experience })
      h.release()
      expect(h.runtime.start(identity, experience, source).status).toBe('accepted')
      confirmName(h, 'Mira', 'en')
      await answerAll(h)
      await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
      h.runtime.handle({ action: 'finish' }, identity)
      await vi.advanceTimersByTimeAsync(45_000)
      completeCue(h, 'deliver')
      expect(h.events().at(-1)).toEqual({ event: 'keepsake_done', afterPortrait: source === 'mode' || source === 'session_default' ? 'farewell' : 'continue' })
    }
  })

  it('confirms only agreement with the pending read-back and keeps the read-back spelling', () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    // "Confirmed" before any read-back is a name to read back.
    expect(h.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_heard' })
    expect(h.runtime.phase()).toBe('confirm')
    // The same name in another script agrees; the read-back spelling is kept.
    expect(h.runtime.handle({ action: 'set_name', name: '王晓明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_confirmed' })
    expect(h.views().at(-1)).toMatchObject({ phase: 'question', name: '王曉明' })
    expect(h.reports.filter(r => r === 'studio_name_confirmed')).toHaveLength(1)

    const denied = harness()
    denied.runtime.start(identity, denied.experience, 'visitor')
    denied.runtime.handle({ action: 'set_name', name: '王小明', confirmed: false, language: 'zh' }, identity)
    denied.runtime.handle({ action: 'reject_name' }, identity)
    // A denied name labelled confirmed is read back again, never accepted directly.
    expect(denied.runtime.handle({ action: 'set_name', name: '王小明', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_heard' })
    expect(denied.runtime.phase()).toBe('confirm')
    // A different "confirmed" name during a read-back is a correction.
    expect(denied.runtime.handle({ action: 'set_name', name: '李小華', confirmed: true, language: 'zh' }, identity)).toMatchObject({ code: 'studio_name_heard', next: expect.stringContaining('「李小華」') })
    expect(denied.reports).not.toContain('studio_name_confirmed')
  })

  it('fails a painting the Mirror never starts, and fails only the change when a repaint never starts', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    confirmName(h, '測試')
    for (let i = 1; i <= 4; i++) h.runtime.handle({ action: 'answer', question: i, answer: `a${i}`, language: 'zh' }, identity)
    await vi.advanceTimersByTimeAsync(PORTRAIT_STUDIO.journey.paintStartMs - 1)
    expect(h.runtime.phase()).toBe('painting')
    await vi.advanceTimersByTimeAsync(1)
    expect(h.calls).toHaveLength(0)
    expect(h.runtime.isActive()).toBe(false)
    expect(h.events().at(-1)).toMatchObject({ event: 'failed', code: 'studio_paint_timeout', keepPortrait: false, line: expect.stringContaining('畫布') })
    expect(h.reports).toEqual(expect.arrayContaining(['studio_paint_timeout', 'studio_failed_paint_timeout']))

    const repaint = harness()
    repaint.release()
    repaint.runtime.start(identity, repaint.experience, 'visitor')
    confirmName(repaint, '測試')
    await answerAll(repaint)
    await vi.waitFor(() => expect(repaint.runtime.phase()).toBe('reveal'))
    // A painting that started in time is never failed by the deadline.
    await vi.advanceTimersByTimeAsync(PORTRAIT_STUDIO.journey.paintStartMs)
    expect(repaint.reports).not.toContain('studio_paint_timeout')
    repaint.runtime.handle({ action: 'revise', change: 'snow' }, identity)
    await vi.advanceTimersByTimeAsync(PORTRAIT_STUDIO.journey.paintStartMs)
    expect(repaint.runtime.phase()).toBe('keepsake')
    expect(repaint.events()).toContainEqual(expect.objectContaining({ event: 'failed', code: 'studio_paint_timeout', keepPortrait: true }))
    expect(repaint.calls).toHaveLength(1)
  })

  it('delivers a keepsake the Mirror never delivers, once, and reports the deadline', async () => {
    vi.useFakeTimers()
    const delivered = vi.fn()
    const commands: { type: string; event?: unknown }[] = [], reports: string[] = []
    const runtime = createStudioRuntime({ provider: () => ({ generate: async () => okImage, edit: async () => okImage }),
      dispatch: command => { commands.push(command as never); return true }, activity: vi.fn(), report: reason => reports.push(reason),
      keepsakeSinks: [{ name: 'printer', deliver: delivered }] })
    const h = { runtime, events: () => commands.filter(c => c.type === 'studio_event').map(c => c.event as { event: string }) } as unknown as ReturnType<typeof harness>
    runtime.start(identity, defaultExperience(), 'mode')
    confirmName(h, '測試')
    await answerAll(h)
    await vi.waitFor(() => expect(runtime.phase()).toBe('reveal'))
    runtime.handle({ action: 'finish' }, identity)
    await vi.advanceTimersByTimeAsync(PORTRAIT_STUDIO.journey.keepsakeMs - 1)
    expect(delivered).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(delivered).toHaveBeenCalledOnce()
    expect(reports).toEqual(expect.arrayContaining(['studio_keepsake_timeout', 'studio_completed']))
    expect(h.events().at(-1)).toEqual({ event: 'keepsake_done', afterPortrait: 'farewell' })
    expect(runtime.isActive()).toBe(false)
  })

  it('reports an async keepsake sink failure without blocking the farewell', async () => {
    const reports: string[] = [], commands: { type: string; event?: unknown }[] = []
    const runtime = createStudioRuntime({ provider: () => ({ generate: async () => okImage, edit: async () => okImage }),
      dispatch: command => { commands.push(command as never); return true }, activity: vi.fn(), report: reason => reports.push(reason),
      keepsakeSinks: [{ name: 'printer', deliver: async () => { throw new Error('offline') } }, { name: 'sync', deliver: () => { throw new Error('x') } }] })
    const h = { runtime, events: () => commands.filter(c => c.type === 'studio_event').map(c => c.event as { event: string }) } as unknown as ReturnType<typeof harness>
    runtime.start(identity, defaultExperience(), 'visitor')
    confirmName(h, '測試')
    await answerAll(h)
    await vi.waitFor(() => expect(runtime.phase()).toBe('reveal'))
    runtime.handle({ action: 'finish' }, identity)
    completeCue(h, 'deliver')
    expect(h.events().at(-1)).toEqual({ event: 'keepsake_done', afterPortrait: 'continue' })
    await vi.waitFor(() => expect(reports).toEqual(expect.arrayContaining(['studio_keepsake_printer_failed', 'studio_keepsake_sync_failed'])))
    expect(reports.join(' ')).not.toContain('offline')
  })

  it('replaces the last answer once, only while the step issued for it is current, and reports it', () => {
    const h = harness()
    h.runtime.start(identity, h.experience, 'visitor')
    confirmName(h, 'Amy', 'en')
    h.runtime.handle({ action: 'answer', question: 1, answer: 'owl', language: 'en' }, identity)
    expect(h.runtime.handle({ action: 'answer', question: 1, answer: 'dragon', language: 'en' }, identity)).toMatchObject({ code: 'studio_answer_replaced' })
    expect(h.reports).toContain('studio_answer_replaced')
    expect(h.runtime.handle({ action: 'answer', question: 1, answer: 'phoenix', language: 'en' }, identity)).toMatchObject({ status: 'ignored', code: 'studio_answer_duplicate' })
    h.runtime.handle({ action: 'answer', question: 2, answer: 'forest', language: 'en' }, identity)
    h.runtime.handle({ action: 'repeat' }, identity)
    // After a later step (here a repeat), question 2's answer is no longer the one being commented on.
    expect(h.runtime.handle({ action: 'answer', question: 2, answer: 'desert', language: 'en' }, identity)).toMatchObject({ status: 'ignored', code: 'studio_answer_duplicate' })
    expect(h.reports.filter(r => r === 'studio_answer_replaced')).toHaveLength(1)
  })

  it('lets the operator end a visit: Studio-mode visits get the farewell, conversation visits return to it', async () => {
    for (const [source, afterPortrait] of [['mode', 'farewell'], ['session_default', 'farewell'], ['visitor', 'continue']] as const) {
      const h = harness({ experience: { ...defaultExperience(), defaultMode: 'portrait_studio' } })
      expect(h.runtime.end('studio_operator_ended')).toBe(false)
      h.runtime.start(identity, h.experience, source)
      confirmName(h, '測試')
      await answerAll(h)
      expect(h.runtime.end('studio_operator_ended')).toBe(true)
      expect(h.calls[0]!.signal?.aborted).toBe(true)
      expect(h.events().at(-1)).toEqual({ event: 'keepsake_done', afterPortrait })
      expect(h.events().some(e => e.event === 'closed')).toBe(false)
      expect(h.reports).toContain('studio_operator_ended')
      expect(h.views().at(-1)).toBeNull()
      expect(h.activity.map(a => a.split(':')[0])).toEqual(['started', 'finished'])
    }
  })
})

