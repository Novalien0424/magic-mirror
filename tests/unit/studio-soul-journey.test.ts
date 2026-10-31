import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStudioRuntime } from '../../src/main/studio/studio-runtime'
import { deferredPrinterSkill } from '../../src/main/studio/printer-skill'
import { defaultExperience, parseAvatarExperience, parseStudioSessionEvent, type StudioSessionEvent, type StudioStep } from '../../src/shared/portrait-studio'
import { parseSpeechScript } from '../../src/shared/speech-script'
import { playSpeechScript } from '../../src/renderer/realtime/speech-script'

const identity = { realtimeSessionId: 'test-soul', sessionGeneration: 1 }
function visit(count = 4) {
  const events: StudioSessionEvent[] = [], reports: string[] = []
  let current: StudioStep
  const generate = vi.fn(async () => ({ ok: true as const, image: Buffer.from('synthetic-image'), mimeType: 'image/png' as const, elapsedMs: 1 }))
  const printer = deferredPrinterSkill(reason => reports.push(reason))
  const deliver = vi.spyOn(printer, 'deliver')
  const runtime = createStudioRuntime({ provider: () => ({ generate, edit: generate }), activity: vi.fn(), report: reason => reports.push(reason),
    keepsakeSinks: [printer], dispatch: command => {
      if (command.type === 'studio_event') { events.push(command.event); if ('step' in command.event && command.event.step) current = command.event.step }
      return true
    } })
  const experience = defaultExperience()
  experience.studio.questions = experience.studio.questions.slice(0, count)
  current = runtime.start(identity, experience, 'visitor').step!
  const signal = (action: 'step_ready' | 'step_activity' | 'paint' | 'deliver', stepId = current.id) => runtime.handle({ action, stepId }, identity)
  return { runtime, events, reports, generate, deliver, current: () => current, signal }
}
afterEach(() => vi.useRealTimers())

describe('Gate thirty-three application journey', () => {
  it('addresses the name only in question one and changes language only through the explicit action', () => {
    const v = visit()
    v.runtime.handle({ action: 'set_name', name: 'Amy', confirmed: false, language: 'en' }, identity)
    expect(v.current()).toMatchObject({ language: 'zh', speech: '我會寫上「A m y」，對嗎？' })
    v.runtime.handle({ action: 'set_name', name: 'Amy', confirmed: true, language: 'en' }, identity)
    expect(v.current().speech).toMatch(/^Amy啊，/)
    v.runtime.handle({ action: 'answer', question: 1, answer: 'I travelled alone.', language: 'en' }, identity)
    expect(v.current().language).toBe('zh')
    expect(v.current().speech).not.toContain('Amy')
    const switched = v.runtime.handle({ action: 'language', language: 'en' }, identity)
    expect(switched.step).toMatchObject({ phase: 'question', language: 'en' })
    // The model learns the repeat already happened, so the next reply is recorded, not re-asked.
    expect(switched.next).toContain('already repeated the pending question')
    expect(v.current().speech).toBe(defaultExperience().studio.questions[1]!.en)
    expect(v.current().comment).toBeUndefined()
    v.runtime.handle({ action: 'answer', question: 2, answer: '我會幫助朋友。', language: 'zh' }, identity)
    expect(v.current().language).toBe('en')
    expect(v.current().speech).toBe(defaultExperience().studio.questions[2]!.en)
    v.runtime.handle({ action: 'language', language: 'zh' }, identity)
    expect(v.current().speech).toBe(defaultExperience().studio.questions[2]!.zh)
    v.runtime.handle({ action: 'answer', question: 3, answer: 'Peace and adventure.', language: 'en' }, identity)
    expect(v.current().speech).toBe(defaultExperience().studio.questions[3]!.zh)
    expect(v.current().speech).not.toContain('Amy')
    v.runtime.close('test_complete')
  })

  it('starts the silence clock only after playback, cancels for speech, rejects stale steps and uses the fallback name', async () => {
    vi.useFakeTimers()
    const v = visit()
    await vi.advanceTimersByTimeAsync(60000)
    expect(v.runtime.phase()).toBe('name')
    v.signal('step_ready')
    await vi.advanceTimersByTimeAsync(29999)
    expect(v.runtime.phase()).toBe('name')
    v.signal('step_activity')
    await vi.advanceTimersByTimeAsync(30001)
    expect(v.runtime.phase()).toBe('name')
    const old = v.current().id
    v.signal('step_ready')
    await vi.advanceTimersByTimeAsync(30000)
    expect(v.current().speech).toMatch(/^無名之人啊，/)
    expect(v.signal('step_ready', old).code).toBe('studio_step_stale')
    v.runtime.close('test_complete')
  })

  it('clears a denied name and never silently confirms it on a confirmation timeout', async () => {
    vi.useFakeTimers()
    const v = visit()
    v.runtime.handle({ action: 'set_name', name: '王小明', confirmed: false, language: 'zh' }, identity)
    expect(v.current().speech).toContain('王小明')
    v.runtime.handle({ action: 'reject_name' }, identity)
    expect(v.current().phase).toBe('name')
    expect(v.current().speech).not.toContain('王小明')
    v.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: false, language: 'zh' }, identity)
    v.signal('step_ready'); await vi.advanceTimersByTimeAsync(30000)
    expect(v.current().speech).toMatch(/^無名之人啊，/)
    expect(v.reports).not.toContain('studio_name_confirmed')
    v.runtime.close('test_complete')
  })

  it.each([1, 2, 4])('supports %i questions, acknowledges every silent answer and orders generation and printer after cues', async count => {
    vi.useFakeTimers()
    const v = visit(count)
    v.signal('step_ready'); await vi.advanceTimersByTimeAsync(30000)
    for (let i = 0; i < count; i++) {
      v.signal('step_ready'); await vi.advanceTimersByTimeAsync(30000)
      expect(v.current().silent).toBe(true)
      expect(v.current().comment).toBeUndefined()
    }
    expect(v.reports.filter(r => r === 'studio_answer_unanswered')).toHaveLength(count)
    expect(v.runtime.phase()).toBe('painting')
    expect(v.generate).not.toHaveBeenCalled()
    v.signal('paint'); await Promise.resolve(); await Promise.resolve()
    expect(v.generate).toHaveBeenCalledOnce()
    expect(v.generate.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ prompt: expect.stringContaining('未回答') })]))
    expect(v.runtime.phase()).toBe('reveal')
    v.signal('step_ready'); await vi.advanceTimersByTimeAsync(30000)
    expect(v.current()).toMatchObject({ phase: 'keepsake', silent: true, speech: '現在讓我們把你的靈魂傳遞出去' })
    await vi.advanceTimersByTimeAsync(45000)
    expect(v.deliver).not.toHaveBeenCalled()
    const transfer = v.current().id
    v.signal('deliver'); v.signal('deliver', transfer)
    expect(v.deliver).toHaveBeenCalledOnce()
    expect(v.reports).toContain('studio_printer_deferred')
    expect(v.events.at(-1)).toEqual({ event: 'keepsake_done', afterPortrait: 'continue' }) // visitor-requested: back to conversation
    expect(v.events.every(e => parseStudioSessionEvent(e) !== null)).toBe(true)
    expect(v.runtime.isActive()).toBe(false)
  })

  it('preserves reflective reasons and cancels timers when the session closes', async () => {
    vi.useFakeTimers()
    const v = visit()
    v.runtime.handle({ action: 'set_name', name: '王曉明', confirmed: true, language: 'zh' }, identity)
    const answer = '我自己去旅行，因為我想證明我可以獨立。'.repeat(10)
    v.runtime.handle({ action: 'answer', question: 1, answer, language: 'zh' }, identity)
    expect(v.current().comment).toBe(answer)
    v.signal('step_ready'); v.runtime.syncIdentity(null)
    const n = v.events.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(v.events).toHaveLength(n)
    expect(v.generate).not.toHaveBeenCalled()
  })
  it('repeats a question without recording an answer and expires the previous token', () => {
    const v = visit(), first = v.current().id
    v.runtime.handle({ action: 'repeat' }, identity)
    expect(v.current().phase).toBe('name')
    expect(v.current().id).not.toBe(first)
    expect(v.signal('step_ready', first).code).toBe('studio_step_stale')
    expect(v.reports).not.toContain('studio_answer_recorded')
    v.runtime.close('test_complete')
  })
})

describe('authored speech pauses', () => {
  it('accepts multiline reflective questions from the textarea', () => {
    const experience = defaultExperience()
    experience.studio.questions[0]!.zh = '哪一刻讓你印象深刻？\n[pause=1s]為什麼呢？'
    expect(parseAvatarExperience(experience)?.studio.questions[0]!.zh).toBe(experience.studio.questions[0]!.zh)
  })
  it('parses timed markers without speaking them and rejects invalid durations', () => {
    expect(parseSpeechScript('歡迎。[pause=1.5s]你的名字？')).toEqual([{ text: '歡迎。', pauseMs: 1500 }, { text: '你的名字？', pauseMs: 0 }])
    for (const text of ['[pause=1s]', 'Hello[pause=99s]', 'Hello[pause=0s]', 'Hello[pause=oops]']) expect(() => parseSpeechScript(text)).toThrow()
  })
  it('waits after actual playback and aborts the remaining script during a gap', async () => {
    vi.useFakeTimers()
    const abort = new AbortController(), calls: string[] = []
    let complete!: (value: boolean) => void
    const played = playSpeechScript('first[pause=1s]second', abort.signal, text => { calls.push(text); return new Promise(resolve => { complete = resolve }) })
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toEqual(['first'])
    complete(true); await vi.advanceTimersByTimeAsync(999)
    expect(calls).toEqual(['first'])
    abort.abort(); await vi.advanceTimersByTimeAsync(1)
    expect(await played).toBe(false)
    expect(calls).toEqual(['first'])
  })
  it('marks the last spoken segment even when consecutive pauses follow it', async () => {
    vi.useFakeTimers()
    const play = vi.fn(async () => true)
    const done = playSpeechScript('Farewell[pause=1s][pause=0.5s]', new AbortController().signal, play)
    await vi.advanceTimersByTimeAsync(1499)
    expect(play).toHaveBeenCalledWith('Farewell', true)
    await vi.advanceTimersByTimeAsync(1)
    expect(await done).toBe(true)
  })
})
