import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { mirrorConfigSchema } from '../../src/main/config-service'
import { newAvatar } from '../../src/renderer/console/profile-workspace'
import { registerStudioIpc } from '../../src/main/studio/studio-ipc'
import { avatarProfileSessionSettings, parseAvatarSessionSettings } from '../../src/shared/avatar-prompt'
import { defaultExperience, parseAvatarExperience, parseStudioSessionEvent, parseStudioView, STUDIO_CONSOLE_CHANNEL, STUDIO_MIRROR_CHANNEL,
  STUDIO_PROMPT_STAGES, studioPromptIssue } from '../../src/shared/portrait-studio'
import { PORTRAIT_STUDIO, STUDIO_PROMPT_DEFAULTS, studioPrompt } from '../../src/shared/portrait-studio-config'
import { inspectAvatarPrompts } from '../../src/shared/prompt-inspection'
import type { MirrorConfig } from '../../src/shared/types'
import type { ChatgptCredentialSource } from '../../src/main/chatgpt-auth/token-file'

function fixture(): MirrorConfig {
  const { schemaVersion: _version, ...baseline } = JSON.parse(readFileSync('resources/config/default.json', 'utf8'))
  return { ...baseline, avatarCatalog: { activeAvatarId: 'guide', avatars: [newAvatar('guide')], locks: [], models: [] } }
}

describe('Portrait Studio configuration', () => {
  it('defaults every avatar to conversation mode with four approved questions and validates edits', () => {
    const config = fixture()
    delete (config.avatarCatalog!.avatars[0] as { experience?: unknown }).experience
    const parsed = mirrorConfigSchema.parse(config) as MirrorConfig
    const experience = parsed.avatarCatalog!.avatars[0]!.experience!
    expect(experience.defaultMode).toBe('conversation')
    expect(experience.studio.questions).toHaveLength(4)
    expect(parseAvatarExperience(experience)).not.toBeNull()
    const bad = fixture()
    bad.avatarCatalog!.avatars[0]!.experience = { ...defaultExperience(), studio: { ...defaultExperience().studio, questions: [] } }
    expect(mirrorConfigSchema.safeParse(bad).success).toBe(false)
    const tooMany = defaultExperience()
    tooMany.studio.questions = Array.from({ length: 9 }, (_v, i) => ({ id: `q${i}`, zh: '問', en: 'Q', slot: 'detail' as const }))
    expect(parseAvatarExperience(tooMany)).toBeNull()
  })

  it('keeps the guest list out of renderer session settings', () => {
    const profile = { ...newAvatar('guide'), experience: { ...defaultExperience(), guests: { names: ['王曉明'], match: 'prefer' as const } } }
    const settings = avatarProfileSessionSettings(profile, '魔鏡阿魔鏡')
    expect(JSON.stringify(settings)).not.toContain('王曉明')
    expect(settings.experience?.guestMatch).toBe('prefer')
    expect(parseAvatarSessionSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings)
  })

  it('accepts a saved multi-line start script in the enter event the Mirror receives', () => {
    const experience = defaultExperience()
    experience.studio.startScript = '我在。\n今天想讓我為你畫一幅畫像嗎？'
    expect(parseAvatarExperience(experience)).not.toBeNull()
    expect(parseStudioSessionEvent({ event: 'enter', startScript: experience.studio.startScript })).not.toBeNull()
    expect(parseStudioSessionEvent({ event: 'enter', startScript: 'tab\tscript' })).toBeNull()
  })

  it('keeps settings saved before stage prompts valid and validates stage overrides', () => {
    const legacy = defaultExperience() as unknown as { studio: Record<string, unknown> }
    delete legacy.studio.prompts
    expect(parseAvatarExperience(legacy)?.studio.prompts).toEqual({})
    const withPrompt = (stage: string, text: string) => parseAvatarExperience({ ...defaultExperience(), studio: { ...defaultExperience().studio, prompts: { [stage]: text } } })
    expect(withPrompt('confirmName', 'Say 「{{name}}」 back.')).not.toBeNull()
    expect(withPrompt('confirmName', 'Say the name back.')).toBeNull()
    expect(withPrompt('askName', '{{question}} {{secret}}')).toBeNull()
    expect(withPrompt('unknownStage', 'x')).toBeNull()
    for (const stage of STUDIO_PROMPT_STAGES) expect(studioPromptIssue(stage, STUDIO_PROMPT_DEFAULTS[stage])).toBe('')
    expect(studioPrompt(undefined, 'painting')).toBe(STUDIO_PROMPT_DEFAULTS.painting)
  })

  it('shows each effective stage prompt and its source in the prompt inspector', () => {
    const profile = { ...newAvatar('guide'), experience: { ...defaultExperience(), studio: { ...defaultExperience().studio, prompts: { painting: '我要開始畫了。' } } } }
    const sections = inspectAvatarPrompts(profile, []).pages.Session
    const painting = sections.find(s => s.title === 'Interactive Studio stage · Painting starts')!
    expect(painting).toMatchObject({ content: '我要開始畫了。', source: 'avatarCatalog.avatars[guide].experience.studio.prompts.painting' })
    expect(sections.find(s => s.title === 'Interactive Studio stage · Hand over the picture')?.source).toMatch(/\(default\)$/)
  })

  it('pins the image model in versioned config and rejects unsafe view URLs', () => {
    expect(PORTRAIT_STUDIO.image.modelId).toMatch(/^gpt-image-/)
    expect(parseStudioView({ phase: 'reveal', language: 'zh', questionCount: 4, answered: 4, chips: [], lettering: 'nameplate', revisionsLeft: 1,
      imageUrl: 'https://example.com/x.png' })).toBeNull()
  })
})

describe('Portrait Studio IPC', () => {
  type Snapshot = { lifecycle: string; realtimeSessionId: string | null; sessionGeneration: number }
  function harness(options: { lifecycle?: string; auth?: 'signed_in' | 'missing'; experience?: () => Promise<ReturnType<typeof defaultExperience>>; keepAlive?: () => Promise<void>; keepSignedIn?: boolean; mirrorMode?: Parameters<typeof registerStudioIpc>[0]['mirrorMode'] } = {}) {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const dispatched: unknown[] = []
    const reports: string[] = []
    let snapshot: Snapshot = { lifecycle: options.lifecycle ?? 'active', realtimeSessionId: 'rt-1', sessionGeneration: 1 }
    const listeners: ((value: Snapshot) => void)[] = []
    const credentials: ChatgptCredentialSource = { get: async () => options.auth === 'missing' ? null : ({ accessToken: 't', accountId: 'a' }),
      refreshAfterRejection: async () => null, status: async () => ({ status: options.auth ?? 'signed_in' }), keepAlive: options.keepAlive }
    registerStudioIpc({
      ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler) } },
      authorize: (event, kind) => event === kind,
      payloadRejected: () => reports.push('payload_rejected'),
      snapshot: () => snapshot,
      subscribe: listener => { listeners.push(listener); listener(snapshot) },
      experience: options.experience ?? (async () => defaultExperience()),
      dispatch: command => { dispatched.push(command); return true },
      activity: vi.fn(), stopMedia: vi.fn(), report: reason => reports.push(reason), credentials, keepSignedIn: options.keepSignedIn,
      ...(options.mirrorMode ? { mirrorMode: options.mirrorMode } : {}),
      fetchImpl: vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch,
    })
    const mirror = (request: unknown, identity: unknown = { realtimeSessionId: 'rt-1', sessionGeneration: 1 }) =>
      handlers.get(STUDIO_MIRROR_CHANNEL)!('mirror', { request, identity })
    const console = (command: unknown, sender = 'console') => handlers.get(STUDIO_CONSOLE_CHANNEL)!(sender, command)
    const move = (next: Snapshot) => { snapshot = next; for (const listener of listeners) listener(next) }
    return { mirror, console, dispatched, reports, move }
  }
  const RT1 = { realtimeSessionId: 'rt-1', sessionGeneration: 1 }

  it('keeps the ChatGPT sign-in alive only when Main asks, at start and every 30 minutes', async () => {
    vi.useFakeTimers()
    try {
      const idle = vi.fn(async () => undefined)
      harness({ keepAlive: idle })
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(idle).not.toHaveBeenCalled()
      const keepAlive = vi.fn(async () => undefined)
      harness({ keepAlive, keepSignedIn: true })
      expect(keepAlive).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(keepAlive).toHaveBeenCalledTimes(3)
    } finally { vi.useRealTimers() }
  })

  it('authorizes senders, validates payloads and rejects stale sessions', async () => {
    const h = harness()
    expect(await h.mirror({ action: 'start', source: 'visitor', extra: 1 })).toMatchObject({ status: 'rejected', code: 'studio_request_invalid' })
    expect(await h.mirror({ action: 'start', source: 'visitor' }, { realtimeSessionId: 'old', sessionGeneration: 1 })).toMatchObject({ code: 'studio_session_stale' })
    expect(await h.console({ action: 'status' }, 'mirror')).toMatchObject({ ok: false, error: 'console_request_rejected' })
    expect(await h.mirror({ action: 'start', source: 'visitor' })).toMatchObject({ status: 'accepted', code: 'studio_started' })
    // A session-default start is Main's decision; a renderer cannot claim it.
    expect(await harness().mirror({ action: 'start', source: 'session_default' })).toMatchObject({ code: 'studio_request_invalid' })
  })

  it('refuses to start without a ChatGPT sign-in and reports status without token values', async () => {
    const h = harness({ auth: 'missing' })
    expect(await h.mirror({ action: 'start', source: 'visitor' })).toMatchObject({ status: 'rejected', code: 'studio_unavailable' })
    const status = await h.console({ action: 'status' }) as { ok: true; value: { status: Record<string, unknown> } }
    expect(status.value.status).toMatchObject({ auth: 'missing', modelId: PORTRAIT_STUDIO.image.modelId, active: false })
    expect(JSON.stringify(status)).not.toMatch(/accessToken|Bearer/)
  })

  it('lets the operator start and end a studio in the live session', async () => {
    const h = harness()
    const started = await h.console({ action: 'start' }) as { ok: true; value: { action: { code: string } } }
    expect(started.value.action.code).toBe('studio_started')
    expect(h.dispatched).toContainEqual({ type: 'studio_event', event: { event: 'enter', startScript: defaultExperience().studio.startScript }, identity: RT1 })
    const ended = await h.console({ action: 'exit' }) as { ok: true; value: { action: { code: string } } }
    expect(ended.value.action.code).toBe('studio_operator_exit')
    expect(h.dispatched).toContainEqual({ type: 'studio_event', event: { event: 'closed', reason: 'studio_operator_exit' }, identity: RT1 })
    const dormant = harness({ lifecycle: 'dormant' })
    expect(((await dormant.console({ action: 'start' })) as { value: { action: { code: string } } }).value.action.code).toBe('studio_requires_active_session')
  })

  it('does not start a console studio for a session that ended during the checks', async () => {
    let h: ReturnType<typeof harness> | undefined
    h = harness({ experience: async () => { h!.move({ lifecycle: 'dormant', realtimeSessionId: null, sessionGeneration: 1 }); return defaultExperience() } })
    const started = await h.console({ action: 'start' }) as { value: { action: { code: string } } }
    expect(started.value.action.code).toBe('studio_requires_active_session')
    expect(h.dispatched.some(c => (c as { type: string }).type === 'studio_event')).toBe(false)
  })

  it('does not report a studio-default failure when a Console start won the race', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let calls = 0
    const h = harness({ lifecycle: 'activating', experience: async () => {
      if (calls++ === 0) await gate
      return { ...defaultExperience(), defaultMode: 'portrait_studio' as const }
    } })
    h.move({ lifecycle: 'active', realtimeSessionId: 'rt-1', sessionGeneration: 1 })
    const started = await h.console({ action: 'start' }) as { value: { action: { code: string } } }
    expect(started.value.action.code).toBe('studio_started')
    release()
    await new Promise(resolve => setTimeout(resolve, 0))
    const studioEvents = h.dispatched.filter(c => (c as { type: string }).type === 'studio_event').map(c => (c as { event: { event: string } }).event.event)
    expect(studioEvents).toEqual(['enter'])
    expect(h.reports).not.toContain('studio_default_unavailable')
  })

  it('starts the studio when a studio-default session wakes, but not on a rollover', async () => {
    const studioDefault = async () => ({ ...defaultExperience(), defaultMode: 'portrait_studio' as const })
    const h = harness({ lifecycle: 'activating', experience: studioDefault })
    h.move({ lifecycle: 'active', realtimeSessionId: 'rt-1', sessionGeneration: 1 })
    await vi.waitFor(() => expect(h.dispatched).toContainEqual({ type: 'studio_event',
      event: { event: 'enter', startScript: defaultExperience().studio.startScript }, identity: RT1 }))
    h.move({ lifecycle: 'active', realtimeSessionId: 'rt-2', sessionGeneration: 2 })
    expect(h.dispatched).toContainEqual({ type: 'studio_event', event: { event: 'closed', reason: 'studio_session_replaced' }, identity: RT1 })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(h.dispatched.filter(c => (c as { event?: { event?: string } }).event?.event === 'enter')).toHaveLength(1)
    const signedOut = harness({ lifecycle: 'activating', auth: 'missing', experience: studioDefault })
    signedOut.move({ lifecycle: 'active', realtimeSessionId: 'rt-1', sessionGeneration: 1 })
    await vi.waitFor(() => expect(signedOut.dispatched).toContainEqual({ type: 'studio_event',
      event: { event: 'closed', reason: 'studio_default_unavailable' }, identity: RT1 }))
    expect(signedOut.reports).toContain('studio_auth_required')
  })

  describe('Mirror mode switch', () => {
    const store = (initial: 'conversation' | 'studio' = 'conversation', saveOk = true) => {
      let mode = initial
      type Mode = 'conversation' | 'studio'
      const listeners: ((mode: Mode, previous: Mode, source: 'console' | 'operator') => void)[] = []
      const sessions = new Map<string, 'conversation' | 'studio'>()
      return {
        get: () => mode,
        set: (next: Mode) => { if (!saveOk) return false; if (next !== mode) { const previous = mode; mode = next; listeners.forEach(l => l(next, previous, 'console')) } return true },
        sessionMode: (identity: { realtimeSessionId: string; sessionGeneration: number }) => {
          const key = `${identity.realtimeSessionId}#${identity.sessionGeneration}`
          if (!sessions.has(key)) sessions.set(key, mode)
          return sessions.get(key)!
        },
        subscribe: (listener: (mode: Mode, previous: Mode, source: 'console' | 'operator') => void) => { listeners.push(listener); return () => undefined },
      }
    }
    const events = (h: ReturnType<typeof harness>) => h.dispatched.filter(c => (c as { type: string }).type === 'studio_event').map(c => (c as { event: { event: string } }).event.event)

    it('reports the mode in Console status and switches it with a result the operator sees', async () => {
      const mirrorMode = store()
      const h = harness({ lifecycle: 'dormant', mirrorMode })
      const status = await h.console({ action: 'status' }) as { value: { status: { mirrorMode: string } } }
      expect(status.value.status.mirrorMode).toBe('conversation')
      const switched = await h.console({ action: 'mode', mode: 'studio' }) as { value: { status: { mirrorMode: string }; action: { status: string; code: string } } }
      expect(switched.value).toMatchObject({ status: { mirrorMode: 'studio' }, action: { status: 'accepted', code: 'mirror_mode_studio' } })
      // Dormant: nothing starts now; the next wake does.
      expect(events(h)).toEqual([])
      const failing = harness({ lifecycle: 'dormant', mirrorMode: store('conversation', false) })
      const refused = await failing.console({ action: 'mode', mode: 'studio' }) as { value: { action: { status: string; code: string } } }
      expect(refused.value.action).toEqual({ status: 'failed', code: 'mirror_mode_save_failed' })
      expect(await h.console({ action: 'mode', mode: 'party' })).toMatchObject({ ok: false, error: 'console_request_invalid' })
    })

    it('starts the studio for the visitor now when switched on mid-conversation, and closes it when switched off', async () => {
      const mirrorMode = store()
      const h = harness({ mirrorMode })
      await h.console({ action: 'mode', mode: 'studio' })
      await vi.waitFor(() => expect(h.dispatched).toContainEqual({ type: 'studio_event',
        event: { event: 'enter', startScript: defaultExperience().studio.startScript }, identity: RT1 }))
      expect(h.reports).toContain('studio_started_mode')
      await h.console({ action: 'mode', mode: 'conversation' })
      expect(h.dispatched.at(-1)).toEqual({ type: 'studio_event', event: { event: 'closed', reason: 'studio_operator_exit' }, identity: RT1 })
      // Signed out: the switch is saved, the start is refused with a metadata reason.
      const signedOut = harness({ auth: 'missing', mirrorMode: store() })
      await signedOut.console({ action: 'mode', mode: 'studio' })
      await vi.waitFor(() => expect(signedOut.reports).toContain('studio_mode_start_unavailable'))
      expect(events(signedOut)).toEqual([])
    })

    it('wakes into the studio from the mode captured for that session, whatever the saved per-avatar default', async () => {
      const mirrorMode = store('studio')
      const h = harness({ lifecycle: 'activating', mirrorMode })
      h.move({ lifecycle: 'active', realtimeSessionId: 'rt-1', sessionGeneration: 1 })
      await vi.waitFor(() => expect(events(h)).toEqual(['enter']))
      // Switched on while the session was waking (after it captured Conversation): it starts like a live switch.
      const late = store('conversation')
      const l = harness({ lifecycle: 'activating', mirrorMode: late })
      late.sessionMode(RT1)
      late.set('studio')
      l.move({ lifecycle: 'active', realtimeSessionId: 'rt-1', sessionGeneration: 1 })
      await vi.waitFor(() => expect(events(l)).toEqual(['enter']))
      expect(l.reports).toContain('studio_started_mode')
      // Conversation mode wakes into a normal conversation.
      const normal = harness({ lifecycle: 'activating', mirrorMode: store('conversation') })
      normal.move({ lifecycle: 'active', realtimeSessionId: 'rt-1', sessionGeneration: 1 })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(events(normal)).toEqual([])
    })
  })
})

