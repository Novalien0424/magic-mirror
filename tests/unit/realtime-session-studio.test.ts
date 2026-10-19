import { describe, expect, it, vi } from 'vitest'
import { invokeFunctionTool, RunContext, type FunctionTool } from '@openai/agents'
import { createRealtimeSession, type CreateRealtimeSessionInput, type RealtimeSessionDependencies } from '../../src/renderer/realtime/realtime-session-adapter'
import { createDeterministicRealtimeTransport } from '../../src/renderer/realtime/realtime-transport'
import { avatarProfileSessionSettings } from '../../src/shared/avatar-prompt'
import { avatarCatalogFor } from '../../src/shared/avatar-profiles'
import { defaultExperience, type StudioReply, type StudioRequest } from '../../src/shared/portrait-studio'
import type { SessionModelSnapshot, MirrorConfig } from '../../src/shared/types'

type Listener = (...events: unknown[]) => void
interface AgentOptions { name: string; instructions: string; tools: FunctionTool<unknown, undefined, unknown>[] }

function probe() {
  const listeners = new Map<string, Listener[]>()
  const agents: AgentOptions[] = []
  const transport = createDeterministicRealtimeTransport()
  const sent: Record<string, unknown>[] = []
  vi.spyOn(transport, 'sendEvent').mockImplementation(event => { sent.push(event as Record<string, unknown>) })
  vi.spyOn(transport, 'requestResponse').mockImplementation(response => transport.sendEvent({ type: 'response.create', response }))
  const updateAgent = vi.fn(async (agent: unknown) => agent)
  const session = { addImage: vi.fn(), connect: vi.fn(async () => undefined), interrupt: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
    sendMessage: vi.fn(), updateAgent,
    on: vi.fn((name: string, listener: Listener) => { listeners.set(name, [...(listeners.get(name) ?? []), listener]) }) }
  const dependencies: RealtimeSessionDependencies = {
    RealtimeAgent: vi.fn(function (options: AgentOptions) { agents.push(options); return { name: options.name, options } }) as unknown as RealtimeSessionDependencies['RealtimeAgent'],
    RealtimeSession: vi.fn(function () { return session }) as unknown as RealtimeSessionDependencies['RealtimeSession'],
    createTransport: () => transport,
  }
  const event = (value: Record<string, unknown>) => { for (const listener of listeners.get('transport_event') ?? []) listener(value) }
  const sessionEvent = (name: string, value: unknown) => { for (const listener of listeners.get(name) ?? []) listener(value) }
  return { agents, sent, updateAgent, dependencies, event, sessionEvent }
}

const snapshot: SessionModelSnapshot = Object.freeze({ configVersion: 1, fingerprint: 'f', sdkVersion: '0.20.0', realtimeDialogue: 'm', inputTranscription: 't',
  memoryExtractor: 'x', voice: 'v', turnDetectionProfile: 'semantic-vad-interruptible', reasoningEffort: 'medium', takenAt: '2026-10-17T00:00:00.000Z' })

function avatar(mode: 'conversation' | 'portrait_studio' = 'conversation') {
  const catalog = avatarCatalogFor({ persona: { name: 'Raven', instructions: 'A sage raven.' }, voice: 'v', idleSeconds: 60, presentation: {}, scenes: [], spells: [],
    wake: { phrase: '魔鏡阿魔鏡' } } as unknown as MirrorConfig)
  const profile = { ...catalog.avatars[0]!, experience: { ...defaultExperience(), defaultMode: mode } }
  return avatarProfileSessionSettings(profile, '魔鏡阿魔鏡')
}

function session(p: ReturnType<typeof probe>, studio: (request: StudioRequest) => StudioReply, extra: Partial<CreateRealtimeSessionInput> = {}) {
  const requests: StudioRequest[] = []
  const eventSink = vi.fn()
  const memoryInput = vi.fn(async () => ({ status: 'accepted' as const, code: 'ok' }))
  const handle = createRealtimeSession({ snapshot, clientSecret: 'secret', mediaStream: {} as MediaStream, audioElement: {} as HTMLAudioElement,
    sessionId: 'session-a', sessionGeneration: 7, eventSink, dependencies: p.dependencies, avatar: avatar(), onMemoryInput: memoryInput,
    onStudioRequest: async request => { requests.push(request); return studio(request) },
    prepareStudioImage: async () => 'data:image/jpeg;base64,AAAA', ...extra })
  const reasons = () => eventSink.mock.calls.map(([event]) => (event as { reason?: string }).reason)
  return { handle, requests, memoryInput, reasons }
}
const ID = { realtimeSessionId: 'session-a', sessionGeneration: 7 }
const tool = (agent: AgentOptions, name: string) => agent.tools.find(t => t.name === name)!
const call = (t: FunctionTool<unknown, undefined, unknown>, input: unknown) => invokeFunctionTool({ tool: t, input: JSON.stringify(input), runContext: new RunContext({}) })
const accepted = (code: string, next?: string): StudioReply => ({ status: 'accepted', code, ...(next ? { next } : {}) })
const responses = (p: ReturnType<typeof probe>) => p.sent.filter(e => e.type === 'response.create').map(e => e.response as Record<string, unknown>)

describe('Portrait Studio in the Realtime session', () => {
  it('builds a conversation agent with the entry tool and a studio agent without memory or media tools', () => {
    const p = probe()
    session(p, () => accepted('studio_started'))
    const [conversation, studio] = p.agents
    expect(conversation!.tools.map(t => t.name)).toContain('start_portrait_studio')
    expect(conversation!.tools.map(t => t.name)).not.toContain('studio_answer')
    expect(studio!.name).toBe('magic-mirror-portrait-studio')
    expect(studio!.tools.map(t => t.name).sort()).toEqual(['return_to_dormant', 'studio_answer', 'studio_exit', 'studio_finish', 'studio_revise', 'studio_set_name'])
    expect(studio!.instructions).toContain('# Portrait studio')
    expect(studio!.instructions).toContain('畫上要寫什麼名字')
  })

  it('swaps to the studio agent before the start tool returns its guidance, and back on exit', async () => {
    const p = probe()
    const { requests } = session(p, request => request.action === 'start' ? accepted('studio_started', 'Ask the name') : accepted('studio_exited', 'Continue'))
    const [conversation, studio] = p.agents
    const result = await call(tool(conversation!, 'start_portrait_studio'), {})
    expect(requests[0]).toEqual({ action: 'start', source: 'visitor' })
    expect(p.updateAgent).toHaveBeenCalledWith(expect.objectContaining({ name: 'magic-mirror-portrait-studio' }))
    expect(result).toMatchObject({ next: 'Ask the name', studio: { code: 'studio_started' } })
    await call(tool(studio!, 'studio_exit'), {})
    expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' }))
  })

  it('ignores studio tools before the studio starts, without calling Main', async () => {
    const p = probe()
    const { requests } = session(p, () => accepted('x'))
    const result = await call(tool(p.agents[1]!, 'studio_answer'), { question: 1, answer: 'owl', language: 'en' })
    expect(requests).toHaveLength(0)
    // Stale studio replies stay silent: a background result, never a spoken response.
    expect(result).toMatchObject({ content: { studio: { code: 'studio_not_active_stale' } } })
  })

  it('marks studio turns as memory control turns', async () => {
    const p = probe()
    const { memoryInput } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    p.event({ type: 'input_audio_buffer.speech_started', item_id: 'item-1' })
    p.event({ type: 'response.created', response: { id: 'r1' } })
    p.event({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ type: 'message', id: 'msg-1', content: [] }] } })
    await vi.waitFor(() => expect(memoryInput).toHaveBeenCalledWith('control', 'item-1', '', expect.anything()))
  })

  it('reveals with a downscaled image only when no response is active, then deletes the image item', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    p.event({ type: 'response.created', response: { id: 'busy' } })
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/abcdef12', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(p.sent.some(e => e.type === 'conversation.item.create')).toBe(false)
    p.event({ type: 'response.done', response: { id: 'busy', status: 'completed', output: [] } })
    await vi.waitFor(() => expect(p.sent.some(e => e.type === 'conversation.item.create')).toBe(true))
    const image = p.sent.find(e => e.type === 'conversation.item.create')!.item as { id: string; content: { type: string; image_url: string }[] }
    expect(image.content[0]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' })
    const reveal = responses(p).find(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')!
    expect(reveal.instructions).toContain('Taiwan Mandarin')
    expect(reveal.instructions).toContain('studio_revise')
    p.event({ type: 'response.created', response: { id: 'rev' } })
    p.event({ type: 'response.done', response: { id: 'rev', status: 'completed', output: [], metadata: { mirror_studio: 'reveal' } } })
    expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: image.id }))
  })

  it('never reveals a portrait from an earlier studio run after the studio restarts in the same session', async () => {
    const p = probe()
    const prepared: ((url: string) => void)[] = []
    const { handle, reasons } = session(p, () => accepted('studio_started'),
      { prepareStudioImage: () => new Promise<string>(resolve => { prepared.push(resolve) }) })
    const isReveal = (r: Record<string, unknown>) => (r.metadata as Record<string, unknown> | undefined)?.mirror_studio === 'reveal'
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    // Run A's portrait is still being prepared when the visitor leaves and starts again.
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/aaaa1111', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
    handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
    await vi.waitFor(() => expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' })))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-portrait-studio' }))
    prepared[0]!('data:image/jpeg;base64,AAAA')
    await vi.waitFor(() => expect(reasons()).toContain('studio_event_stale'))
    expect(p.sent.some(e => e.type === 'conversation.item.create')).toBe(false)
    expect(responses(p).some(isReveal)).toBe(false)
    // The current run's own portrait still reveals.
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/bbbb2222', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
    await vi.waitFor(() => expect(prepared).toHaveLength(2))
    prepared[1]!('data:image/jpeg;base64,BBBB')
    await vi.waitFor(() => expect(responses(p).some(isReveal)).toBe(true))
    const image = p.sent.find(e => e.type === 'conversation.item.create')!.item as { content: { image_url: string }[] }
    expect(image.content[0]!.image_url).toBe('data:image/jpeg;base64,BBBB')
  })

  it('speaks a failure line and returns to conversation; ends with farewell when configured', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    handle.studioEvent!({ event: 'failed', code: 'studio_quota_exhausted', line: '今天的顏料用完了，我們聊聊吧。', keepPortrait: false }, ID)
    await vi.waitFor(() => expect(responses(p).some(r => String(r.instructions).includes('今天的顏料用完了'))).toBe(true))
    expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' }))

    const q = probe()
    const second = session(q, () => accepted('studio_started'))
    await call(tool(q.agents[0]!, 'start_portrait_studio'), {})
    second.handle.studioEvent!({ event: 'keepsake_done', afterPortrait: 'farewell' }, ID)
    await vi.waitFor(() => expect(responses(q).some(r => typeof (r.metadata as Record<string, unknown>)?.mirror_sleep_cue === 'string')).toBe(true))
    // The studio's own farewell (pauses between lines), not the avatar's sleep farewell.
    expect(responses(q).find(r => typeof (r.metadata as Record<string, unknown>)?.mirror_sleep_cue === 'string')!.instructions)
      .toContain('願你找到你所追尋。……再會。……人類。')
  })

  it('deletes studio conversation items after the studio closes', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    p.event({ type: 'conversation.item.added', item: { id: 'asst-1', type: 'message', role: 'assistant' } })
    handle.studioEvent!({ event: 'keepsake_done', afterPortrait: 'continue' }, ID)
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'asst-1' })))
  })

  it('deletes studio function calls together with their outputs, including the entry call', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    p.event({ type: 'conversation.item.added', item: { id: 'fc-start', type: 'function_call', name: 'start_portrait_studio', call_id: 'c0' } })
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    p.event({ type: 'conversation.item.added', item: { id: 'fo-start', type: 'function_call_output', call_id: 'c0' } })
    p.event({ type: 'conversation.item.added', item: { id: 'fc-name', type: 'function_call', name: 'studio_set_name', call_id: 'c1' } })
    p.event({ type: 'conversation.item.added', item: { id: 'fo-name', type: 'function_call_output', call_id: 'c1' } })
    p.event({ type: 'conversation.item.added', item: { id: 'hint', type: 'message', role: 'system' } })
    handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fo-name' })))
    for (const id of ['fc-start', 'fo-start', 'fc-name']) expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: id }))
    expect(p.sent).not.toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'hint' }))
  })

  it('keeps a visitor turn that began in the studio a control turn after the studio closes', async () => {
    const p = probe()
    const { handle, memoryInput } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    p.event({ type: 'input_audio_buffer.speech_started', item_id: 'item-9' })
    handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
    await vi.waitFor(() => expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' })))
    p.event({ type: 'response.created', response: { id: 'r9' } })
    p.event({ type: 'response.done', response: { id: 'r9', status: 'completed', output: [] } })
    await vi.waitFor(() => expect(memoryInput).toHaveBeenCalledWith('control', 'item-9', '', expect.anything()))
  })

  it('deletes a visitor turn that began in the studio, and the reply to it, when they arrive after the studio closes', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    p.event({ type: 'input_audio_buffer.speech_started', item_id: 'item-late' })
    handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
    await vi.waitFor(() => expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' })))
    p.event({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-late' })
    // The exit cleanup runs before the visitor's item exists.
    await new Promise(resolve => setTimeout(resolve, 900))
    expect(p.sent).not.toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'item-late' }))
    p.event({ type: 'conversation.item.added', item: { id: 'item-late', type: 'message', role: 'user' } })
    // The SDK retrieves an input item after transcription; deletion follows that retrieval.
    p.event({ type: 'conversation.item.retrieved', item: { id: 'item-late', type: 'message', role: 'user' } })
    p.event({ type: 'response.created', response: { id: 'r-late' } })
    p.event({ type: 'response.done', response: { id: 'r-late', status: 'completed', output: [{ id: 'reply-late', type: 'message', role: 'assistant' }] } })
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'item-late' })), { timeout: 4000 })
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'reply-late' })), { timeout: 4000 })
    // Ordinary conversation after the studio is kept.
    p.event({ type: 'input_audio_buffer.speech_started', item_id: 'item-after' })
    p.event({ type: 'conversation.item.added', item: { id: 'item-after', type: 'message', role: 'user' } })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(p.sent).not.toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'item-after' }))
  })

  it('deletes a studio call and its output when the output arrives after the studio closes', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    p.event({ type: 'conversation.item.added', item: { id: 'fc-name', type: 'function_call', name: 'studio_set_name', call_id: 'c1' } })
    handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
    await vi.waitFor(() => expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' })))
    await new Promise(resolve => setTimeout(resolve, 50))
    // The exit cleanup cannot delete half a pair; the name-bearing call waits for its output.
    expect(p.sent).not.toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fc-name' }))
    p.event({ type: 'conversation.item.added', item: { id: 'fo-name', type: 'function_call_output', call_id: 'c1' } })
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fo-name' })))
    expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fc-name' }))
    // A studio call and output that both arrive after exit are removed too.
    p.event({ type: 'conversation.item.added', item: { id: 'fc-answer', type: 'function_call', name: 'studio_answer', call_id: 'c2' } })
    p.event({ type: 'conversation.item.added', item: { id: 'fo-answer', type: 'function_call_output', call_id: 'c2' } })
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fc-answer' })))
    expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fo-answer' }))
  })

  it('deletes a reveal reply that the server delivers after the studio closed', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/abcdef12', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
    await vi.waitFor(() => expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')).toBe(true))
    // The visitor leaves before the server starts the reveal reply.
    handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
    await vi.waitFor(() => expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' })))
    const reply = { id: 'reveal-reply', type: 'message', role: 'assistant' }
    p.event({ type: 'response.created', response: { id: 'rev', metadata: { mirror_studio: 'reveal' } } })
    p.event({ type: 'conversation.item.added', item: reply })
    p.event({ type: 'response.done', response: { id: 'rev', status: 'completed', metadata: { mirror_studio: 'reveal' }, output: [reply] } })
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'reveal-reply' })))
  })

  it.each(['before', 'after'] as const)('deletes an interrupted studio call that never gets an output (interrupted %s exit)', async order => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    const cut = { id: 'fc-cut', type: 'function_call', name: 'studio_set_name', call_id: 'c9' }
    p.event({ type: 'conversation.item.added', item: { ...cut, status: 'in_progress' } })
    // An interrupted reply ends with its partial call incomplete; the SDK never runs it.
    const interrupted = () => p.event({ type: 'response.done', response: { id: 'r-cut', status: 'cancelled', output: [{ ...cut, status: 'incomplete' }] } })
    if (order === 'before') interrupted()
    handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
    await vi.waitFor(() => expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' })))
    if (order === 'after') {
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(p.sent).not.toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fc-cut' }))
      interrupted()
    }
    await vi.waitFor(() => expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'fc-cut' })))
  })

  it.each(['before', 'after'] as const)('deletes a studio turn whose transcription fails %s the exit cleanup', async order => {
    vi.useFakeTimers()
    try {
      const p = probe()
      const { handle, reasons } = session(p, () => accepted('studio_started'))
      await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
      p.event({ type: 'input_audio_buffer.speech_started', item_id: 'item-fail' })
      handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
      await vi.advanceTimersByTimeAsync(0)
      expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' }))
      p.event({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-fail' })
      p.event({ type: 'input_audio_buffer.committed', item_id: 'item-fail' })
      p.event({ type: 'conversation.item.added', item: { id: 'item-fail', type: 'message', role: 'user' } })
      const failed = () => p.event({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'item-fail', content_index: 0, error: { type: 'transcription_error' } })
      if (order === 'before') failed()
      await vi.advanceTimersByTimeAsync(2000)
      if (order === 'after') {
        // Cleanup already ran and is waiting for a retrieval that a failed transcript never triggers.
        expect(p.sent).not.toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'item-fail' }))
        failed()
      }
      expect(p.sent).toContainEqual(expect.objectContaining({ type: 'conversation.item.delete', item_id: 'item-fail' }))
      expect(reasons()).toContain('transcript_unavailable')
    } finally { vi.useRealTimers() }
  })

  it('keeps a rejected farewell retry inside the studio run that asked for it', async () => {
    vi.useFakeTimers()
    try {
      const p = probe()
      const { handle, reasons } = session(p, () => accepted('studio_started'))
      await handle.connect()
      await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
      handle.studioEvent!({ event: 'keepsake_done', afterPortrait: 'farewell' }, ID)
      await vi.advanceTimersByTimeAsync(0)
      const farewells = () => p.sent.filter(e => e.type === 'response.create' && typeof (e.response as { metadata?: Record<string, unknown> }).metadata?.mirror_sleep_cue === 'string')
      expect(farewells()).toHaveLength(1)
      // Run A's farewell is rejected while another response is active; run B starts before it finishes.
      p.event({ type: 'response.created', response: { id: 'busy' } })
      p.event({ type: 'error', error: { type: 'invalid_request_error', code: 'conversation_already_has_active_response', event_id: farewells()[0]!.event_id } })
      await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
      expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-portrait-studio' }))
      p.event({ type: 'response.done', response: { id: 'busy', status: 'completed', output: [] } })
      await vi.advanceTimersByTimeAsync(20000)
      expect(farewells()).toHaveLength(1)
      expect(reasons()).toContain('studio_event_stale')
    } finally { vi.useRealTimers() }
  })

  it('never reveals an older portrait revision after a newer one in the same run', async () => {
    const p = probe()
    const prepared: ((url: string) => void)[] = []
    const { handle, reasons } = session(p, () => accepted('studio_started'),
      { prepareStudioImage: () => new Promise<string>(resolve => { prepared.push(resolve) }) })
    const reveals = () => responses(p).filter(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/aaaa1111', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/bbbb2222', revision: 1, revisionsLeft: 0, language: 'zh' }, ID)
    await vi.waitFor(() => expect(prepared).toHaveLength(2))
    prepared[1]!('data:image/jpeg;base64,BBBB')
    await vi.waitFor(() => expect(reveals()).toHaveLength(1))
    // Revision 0 finishes preparing only after revision 1 was revealed.
    prepared[0]!('data:image/jpeg;base64,AAAA')
    await vi.waitFor(() => expect(reasons()).toContain('studio_event_stale'))
    expect(reveals()).toHaveLength(1)
    const images = p.sent.filter(e => e.type === 'conversation.item.create').map(e => (e.item as { content: { image_url: string }[] }).content[0]!.image_url)
    expect(images).toEqual(['data:image/jpeg;base64,BBBB'])
  })

  it('deletes each studio item once, even when a late item event arrives after the reveal removed the picture', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await handle.connect()
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/abcdef12', revision: 0, revisionsLeft: 0, language: 'zh' }, ID)
    await vi.waitFor(() => expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')).toBe(true))
    const image = (p.sent.find(e => e.type === 'conversation.item.create') as { item: { id: string } }).item.id
    p.event({ type: 'response.created', response: { id: 'reveal-r', metadata: { mirror_studio: 'reveal' } } })
    p.event({ type: 'response.done', response: { id: 'reveal-r', status: 'completed', output: [], metadata: { mirror_studio: 'reveal' } } })
    // The picture's own item event arrives after the reveal already removed it.
    p.event({ type: 'conversation.item.done', item: { id: image, type: 'message', role: 'user', content: [{ type: 'input_image' }] } })
    handle.studioEvent!({ event: 'keepsake_done', afterPortrait: 'continue' }, ID)
    await new Promise(resolve => setTimeout(resolve, 50))
    const deletes = p.sent.filter(e => e.type === 'conversation.item.delete').map(e => e.item_id as string)
    expect(deletes.filter(id => id === image)).toHaveLength(1)
    expect(new Set(deletes).size).toBe(deletes.length)
    // Each delete names its cleanup path, so a rejected one can be traced without content.
    expect(p.sent.filter(e => e.type === 'conversation.item.delete').every(e => /^delete_(input|image|turn|call|ended_call|output)_\d+$/.test(String(e.event_id)))).toBe(true)
  })

  it('lets the final reveal hand the picture over without tools, then finishes the studio itself', async () => {
    const p = probe()
    const { handle, requests } = session(p, () => accepted('studio_started'))
    await handle.connect()
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    const reveals = () => responses(p).filter(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')
    // A reveal with a change left keeps tools, so the visitor's change can be painted.
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/aaaa1111', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
    await vi.waitFor(() => expect(reveals()).toHaveLength(1))
    expect(reveals()[0]!.tool_choice).toBeUndefined()
    p.event({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [], metadata: { mirror_studio: 'reveal' } } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(requests.filter(r => r.action === 'finish')).toHaveLength(0)
    // The last reveal speaks the handover with no tool call, and the application finishes once it ends.
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/bbbb2222', revision: 1, revisionsLeft: 0, language: 'zh' }, ID)
    await vi.waitFor(() => expect(reveals()).toHaveLength(2))
    expect(reveals()[1]).toMatchObject({ tool_choice: 'none', metadata: { mirror_studio: 'reveal', mirror_studio_final: 'true' } })
    expect(String(reveals()[1]!.instructions)).toContain('they can take a photo of it now')
    expect(requests.filter(r => r.action === 'finish')).toHaveLength(0)
    p.event({ type: 'response.done', response: { id: 'r2', status: 'completed', output: [], metadata: { mirror_studio: 'reveal', mirror_studio_final: 'true' } } })
    await vi.waitFor(() => expect(requests.filter(r => r.action === 'finish')).toHaveLength(1))
    p.event({ type: 'response.done', response: { id: 'r2', status: 'completed', output: [], metadata: { mirror_studio: 'reveal', mirror_studio_final: 'true' } } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(requests.filter(r => r.action === 'finish')).toHaveLength(1)
  })

  it('ignores studio events addressed to another session', async () => {
    const p = probe()
    const { handle, reasons } = session(p, () => accepted('studio_started'))
    handle.studioEvent!({ event: 'enter', startScript: '畫室開門了。', firstStep: '', language: 'zh' }, { realtimeSessionId: 'session-old', sessionGeneration: 6 })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(p.updateAgent).not.toHaveBeenCalled()
    expect(reasons()).toContain('studio_event_stale')
  })

  it('waits for the server reply to a finished visitor turn before revealing, and retries a rejected reveal once', async () => {
    vi.useFakeTimers()
    try {
      const p = probe()
      const { handle } = session(p, () => accepted('studio_started'))
      await handle.connect()
      await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
      p.event({ type: 'input_audio_buffer.speech_started', item_id: 'item-2' })
      handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/abcdef12', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
      p.event({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-2' })
      await vi.advanceTimersByTimeAsync(500)
      expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')).toBe(false)
      p.event({ type: 'response.created', response: { id: 'auto' } })
      await vi.advanceTimersByTimeAsync(2000)
      expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')).toBe(false)
      p.event({ type: 'response.done', response: { id: 'auto', status: 'completed', output: [] } })
      await vi.advanceTimersByTimeAsync(0)
      const reveals = () => p.sent.filter(e => e.type === 'response.create' && (e.response as { metadata?: Record<string, unknown> }).metadata?.mirror_studio === 'reveal')
      expect(reveals()).toHaveLength(1)
      p.event({ type: 'error', error: { type: 'invalid_request_error', code: 'conversation_already_has_active_response', event_id: reveals()[0]!.event_id } })
      await vi.advanceTimersByTimeAsync(0)
      expect(reveals()).toHaveLength(2)
      expect(reveals()[1]!.event_id).not.toBe(reveals()[0]!.event_id)
    } finally { vi.useRealTimers() }
  })

  it('lets queued application speech finish before revealing, and never suppresses a reveal during a spoken command', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_started'))
    await handle.connect()
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    const reveals = () => responses(p).filter(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')
    handle.speakVerbatim('施法完成。')
    const cueId = (responses(p).find(r => typeof (r.metadata as Record<string, unknown>)?.mirror_scene_cue === 'string')!.metadata as Record<string, string>).mirror_scene_cue
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/abcdef12', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reveals()).toHaveLength(0)
    p.event({ type: 'response.created', response: { id: 'cue-r', metadata: { mirror_scene_cue: cueId } } })
    p.event({ type: 'output_audio_buffer.started', response_id: 'cue-r' })
    p.event({ type: 'response.done', response: { id: 'cue-r', status: 'completed', output: [], metadata: { mirror_scene_cue: cueId } } })
    expect(reveals()).toHaveLength(0)
    p.event({ type: 'output_audio_buffer.stopped', response_id: 'cue-r' })
    await vi.waitFor(() => expect(reveals()).toHaveLength(1))
    handle.claimControlTurn!('')
    p.event({ type: 'response.created', response: { id: 'model-r' } })
    p.event({ type: 'response.created', response: { id: 'reveal-r', metadata: { mirror_studio: 'reveal' } } })
    const cancels = p.sent.filter(e => e.type === 'response.cancel').map(e => e.response_id)
    expect(cancels).toContain('model-r')
    expect(cancels).not.toContain('reveal-r')
  })

  it('keeps the studio open when a spoken command suppresses a reply that tried to exit it', async () => {
    const p = probe()
    const { handle, requests } = session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    handle.claimControlTurn!('')
    const result = await call(tool(p.agents[1]!, 'studio_exit'), {})
    expect(result).toMatchObject({ content: { studio: { code: 'studio_not_active_stale' } } })
    expect(requests.map(r => r.action)).toEqual(['start'])
    expect(p.updateAgent).toHaveBeenCalledTimes(1)
  })

  it('keeps duplicate entry calls silent', async () => {
    const p = probe()
    session(p, () => accepted('studio_started'))
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    expect(await call(tool(p.agents[0]!, 'start_portrait_studio'), {})).toMatchObject({ content: { studio: { code: 'studio_start_duplicate' } } })
  })

  it('waits for media to end before revealing, even past the forced fallback, and keeps media in no-reply mode across swaps', async () => {
    vi.useFakeTimers()
    try {
      const p = probe()
      const { handle } = session(p, () => accepted('studio_started'))
      await handle.connect()
      await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
      handle.setMediaPlayback!(true)
      handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/abcdef12', revision: 0, revisionsLeft: 1, language: 'zh' }, ID)
      await vi.advanceTimersByTimeAsync(20000)
      expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')).toBe(false)
      const noReply = () => p.sent.filter(e => e.type === 'session.update'
        && (e.session as { audio?: { input?: { turn_detection?: { create_response?: boolean } } } }).audio?.input?.turn_detection?.create_response === false).length
      const before = noReply()
      handle.studioEvent!({ event: 'closed', reason: 'studio_operator_exit' }, ID)
      await vi.advanceTimersByTimeAsync(0)
      expect(p.updateAgent).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'magic-mirror-realtime' }))
      expect(noReply()).toBe(before + 1)
      handle.setMediaPlayback!(false)
      await vi.advanceTimersByTimeAsync(0)
      // The studio closed meanwhile, so the queued reveal is dropped as stale, never spoken over media.
      expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('uses the avatar stage prompts for the studio instructions and the reveal', async () => {
    const p = probe()
    const settings = avatar()
    const studio = { ...settings.experience!.studio, prompts: { instructions: 'Run a calm studio.', reveal: 'Describe one colour in {{language}}. Then {{followUp}}',
      offerChange: 'ask about one change.' } }
    const { handle } = session(p, () => accepted('studio_started'), { avatar: { ...settings, experience: { ...settings.experience!, studio } } })
    expect(p.agents[1]!.instructions).toContain('Run a calm studio.')
    await call(tool(p.agents[0]!, 'start_portrait_studio'), {})
    handle.studioEvent!({ event: 'ready', imageUrl: 'magic-mirror-media://studio/abcdef12', revision: 0, revisionsLeft: 1, language: 'en' }, ID)
    await vi.waitFor(() => expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')).toBe(true))
    const reveal = responses(p).find(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'reveal')!
    expect(reveal.instructions).toContain('Describe one colour in English. Then ask about one change.')
  })

  it('keeps the session when an agent swap races a tool call for the other agent', async () => {
    const p = probe()
    const { handle, reasons } = session(p, () => accepted('studio_started'))
    await handle.connect()
    p.sessionEvent('error', { type: 'error', error: new Error('Tool studio_revise not found') })
    expect(reasons()).toContain('realtime_tool_not_found')
    expect(reasons()).not.toContain('realtime_connect_failed')
  })

  it('enters the studio when Main starts a studio-default session, greeting with the studio start script', async () => {
    const p = probe()
    const { handle, requests } = session(p, () => accepted('studio_started'), { avatar: avatar('portrait_studio'), wakeGreeting: '我在，請說。' })
    await handle.connect()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(responses(p)).toHaveLength(0)
    const step = 'The studio is open. Ask this name question now: 先告訴我，畫上要寫什麼名字？'
    handle.studioEvent!({ event: 'enter', startScript: '我在。今天想讓我為你畫一幅畫像嗎？\n回答我幾個小問題就好。', firstStep: step, language: 'zh' }, ID)
    await vi.waitFor(() => expect(responses(p).some(r => String(r.instructions).includes('今天想讓我為你畫一幅畫像嗎'))).toBe(true))
    // Main owns the decision; the renderer never claims a default start.
    expect(requests).toHaveLength(0)
    expect(p.updateAgent).toHaveBeenCalledWith(expect.objectContaining({ name: 'magic-mirror-portrait-studio' }))
    expect(responses(p).some(r => String(r.instructions).includes('我在，請說。'))).toBe(false)
    // The first step joins the conversation, then the avatar asks it once the start script has played.
    const items = p.sent.filter(e => e.type === 'conversation.item.create').map(e => e.item as { role: string; content: { text: string }[] })
    expect(items).toContainEqual(expect.objectContaining({ role: 'system', content: [{ type: 'input_text', text: step }] }))
    const firstSteps = () => responses(p).filter(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'first_step')
    expect(firstSteps()).toHaveLength(0)
    const cueId = (responses(p).find(r => typeof (r.metadata as Record<string, unknown>)?.mirror_scene_cue === 'string')!.metadata as Record<string, string>).mirror_scene_cue
    p.event({ type: 'response.created', response: { id: 'start-r', metadata: { mirror_scene_cue: cueId } } })
    p.event({ type: 'output_audio_buffer.started', response_id: 'start-r' })
    p.event({ type: 'response.done', response: { id: 'start-r', status: 'completed', output: [], metadata: { mirror_scene_cue: cueId } } })
    p.event({ type: 'output_audio_buffer.stopped', response_id: 'start-r' })
    await vi.waitFor(() => expect(firstSteps()).toHaveLength(1))
    expect(String(firstSteps()[0]!.instructions)).toContain('# Portrait studio')
    expect(String(firstSteps()[0]!.instructions)).toContain(step)
    expect(String(firstSteps()[0]!.instructions)).toContain('Speak in Taiwan Mandarin in Traditional Chinese.')
  })

  it('does not ask the first step again when the visitor already answered it during the start script', async () => {
    const p = probe()
    const { handle } = session(p, () => accepted('studio_name_heard', 'Read the name back'))
    await handle.connect()
    handle.studioEvent!({ event: 'enter', startScript: '畫室開門了。', firstStep: 'Ask this name question now: 名字？', language: 'zh' }, ID)
    await vi.waitFor(() => expect(responses(p).some(r => typeof (r.metadata as Record<string, unknown>)?.mirror_scene_cue === 'string')).toBe(true))
    await call(tool(p.agents[1]!, 'studio_set_name'), { name: '王曉明', confirmed: false, language: 'zh' })
    const cueId = (responses(p).find(r => typeof (r.metadata as Record<string, unknown>)?.mirror_scene_cue === 'string')!.metadata as Record<string, string>).mirror_scene_cue
    p.event({ type: 'response.created', response: { id: 'start-r', metadata: { mirror_scene_cue: cueId } } })
    p.event({ type: 'response.done', response: { id: 'start-r', status: 'completed', output: [], metadata: { mirror_scene_cue: cueId } } })
    p.event({ type: 'output_audio_buffer.stopped', response_id: 'start-r' })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(responses(p).some(r => (r.metadata as Record<string, unknown>)?.mirror_studio === 'first_step')).toBe(false)
  })

  it('falls back to the normal greeting when Main cannot start a studio-default session', async () => {
    const p = probe()
    const { handle, reasons } = session(p, () => accepted('x'), { avatar: avatar('portrait_studio'), wakeGreeting: '我在，請說。' })
    await handle.connect()
    handle.studioEvent!({ event: 'closed', reason: 'studio_default_unavailable' }, ID)
    await vi.waitFor(() => expect(responses(p).some(r => String(r.instructions).includes('我在，請說。'))).toBe(true))
    expect(p.updateAgent).not.toHaveBeenCalled()
    expect(reasons()).toContain('studio_default_unavailable')
  })
})
