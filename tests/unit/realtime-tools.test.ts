import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { invokeFunctionTool, RunContext } from '@openai/agents'
import { isBackgroundResult, RealtimeAgent, RealtimeSession, OpenAIRealtimeWebSocket } from '@openai/agents/realtime'
import { ScriptedRealtimeTransport } from '@openai/agents/realtime/testing'
import { REALTIME_TOOLS, REALTIME_TOOL_SOURCE, parseRealtimeToolCatalog, resolveRealtimeTools, realtimeToolDefinition, realtimeToolInstructions } from '../../src/shared/realtime-tools'
import { bindRealtimeTools } from '../../src/renderer/realtime/realtime-tool-bindings'

const fresh = () => structuredClone(REALTIME_TOOLS) as any
const specs = () => resolveRealtimeTools('Rest.').filter(spec => spec.handler === 'return_to_dormant')
const call = (tool: ReturnType<typeof bindRealtimeTools>[number], input: string) => invokeFunctionTool({tool, input, runContext:new RunContext({})})

describe('structured Realtime tool catalog', () => {
  it('returns bounded memory results but suppresses generation for a clean memory reset', async () => {
    const handler = vi.fn(async () => ({ outcome: 'accepted' as const, memory: { status: 'accepted' as const, code: 'memory_recalled', entries: [] } }))
    const [tool] = bindRealtimeTools(resolveRealtimeTools('Rest.').filter(t => t.name === 'memory'), { memory: handler }, vi.fn())
    const args = JSON.stringify({ action: 'recall', name: '', topic: '', text: '', query: '' })
    expect(await call(tool, args)).toMatchObject({ memory: { code: 'memory_recalled', entries: [] } })
    handler.mockResolvedValueOnce({ outcome: 'accepted', memory: { status: 'accepted', code: 'memory_forgotten', entries: [] } })
    expect(isBackgroundResult(await call(tool, args))).toBe(true)
  })
  it.each([
    ['play_media', { kind: 'video', assetId: 'clip', mode: 'once' }],
    ['play_youtube', { kind: 'music', url: 'https://www.youtube.com/watch?v=abcdefghijk', mode: 'once' }],
  ] as const)('keeps %s silent after a clarification selection but lets playback failures respond', async (name, arguments_) => {
    const spec = resolveRealtimeTools('Rest.').filter(t => t.name === name)
    expect(spec[0].rules.speech).toContain('clarification selection')
    expect(spec[0].rules.speech).toContain('ask no extra confirmation')
    expect(spec[0].rules.speech).toContain('stay silent')
    const media = vi.fn(async (): Promise<'accepted' | 'rejected' | 'failed'> => 'accepted')
    const [tool] = bindRealtimeTools(spec, { [name]: media }, vi.fn())
    const args = JSON.stringify(arguments_)
    const accepted = await call(tool, args)
    expect(isBackgroundResult(accepted)).toBe(true)
    expect(accepted).toMatchObject({ content: { status: 'accepted', code: 'media_started', speech: 'none' } })
    for (const outcome of ['rejected', 'failed'] as const) {
      media.mockResolvedValueOnce(outcome)
      const result = await call(tool, args)
      expect(isBackgroundResult(result)).toBe(false)
      expect(result).toMatchObject({ status: outcome, speech: 'model' })
    }
  })
  it('distinguishes an active stop from declined playback or a quoted mention', () => {
    const stop = resolveRealtimeTools('Rest.').find(t => t.name === 'stop_media')!
    expect(stop.rules.useWhen).toContain('end current playback')
    expect(stop.rules.useWhen).toContain('不要再播了')
    expect(stop.rules.avoidWhen).toContain('do-not-start requests')
    expect(stop.rules.avoidWhen).toContain('不要播放影片，聊聊雨天 after playback ends')
    expect(stop.rules.avoidWhen).toContain('quoted, negated, hypothetical or incidental stop mentions')
    expect(stop.rules.speech).toContain('If accepted, stay silent')
    expect(stop.rules.speech).toContain('If ignored, no media was playing: answer the actual request')
    expect(stop.rules.speech).toContain('If rejected or failed')
    expect(realtimeToolInstructions([stop])).toContain(stop.rules.avoidWhen)
    expect(realtimeToolInstructions([stop])).toContain(stop.rules.speech)
  })
  it.each([
    ['accepted', 'media_stopped', 'none'],
    ['ignored', 'media_not_playing', 'model'],
    ['rejected', 'media_request_rejected', 'model'],
    ['failed', 'media_stop_failed', 'model'],
  ] as const)('uses catalog speech ownership after an %s stop through the real SDK', async (outcome, code, speech) => {
    const spec = resolveRealtimeTools('Rest.').filter(t => t.name === 'stop_media')
    const transport = new ScriptedRealtimeTransport(), errors = vi.fn(), onFailure = vi.fn()
    const output = vi.spyOn(transport, 'sendFunctionCallOutput'), stop = vi.fn(async () => outcome)
    const session = new RealtimeSession(new RealtimeAgent({ name: 'fixture', instructions: realtimeToolInstructions(spec),
      tools: bindRealtimeTools(spec, { stop_media: stop }, onFailure) }),
      { transport, tracingDisabled: true, historyStoreAudio: false, config: { tracing: null } })
    session.on('error', errors)
    try {
      await session.connect({ apiKey: 'synthetic-unused-credential' })
      transport.emit('function_call', { type: 'function_call', id: 'stop-item', callId: 'stop-call', name: 'stop_media', arguments: '{}', responseId: 'fixture-response' })
      await vi.waitFor(() => expect(output).toHaveBeenCalledOnce())
      expect(JSON.parse(output.mock.calls[0][1])).toEqual({ status: outcome, code, speech })
      // Only an accepted stop suppresses the next model response.
      expect(output.mock.calls[0][2]).toBe(outcome !== 'accepted')
      expect(stop).toHaveBeenCalledExactlyOnceWith({})
      expect(onFailure).not.toHaveBeenCalled()
      expect(errors).not.toHaveBeenCalled()
    } finally { session.close() }
  })
  it('allows stop validation and execution failures to respond without disclosing exception text', async () => {
    const stop = vi.fn(async () => { throw new Error('private fixture') }), onFailure = vi.fn()
    const [tool] = bindRealtimeTools(resolveRealtimeTools('Rest.').filter(t => t.name === 'stop_media'), { stop_media: stop }, onFailure)
    const rejected = await call(tool, '{"unexpected":true}')
    expect(isBackgroundResult(rejected)).toBe(false)
    expect(rejected).toEqual({ status: 'rejected', code: 'media_request_rejected', speech: 'model' })
    expect(stop).not.toHaveBeenCalled()
    const failed = await call(tool, '{}')
    expect(isBackgroundResult(failed)).toBe(false)
    expect(failed).toEqual({ status: 'failed', code: 'media_stop_failed', speech: 'model' })
    expect(JSON.stringify(failed)).not.toContain('private fixture')
    expect(stop).toHaveBeenCalledExactlyOnceWith({})
    expect(onFailure.mock.calls).toEqual([['tool_arguments_rejected'], ['tool_execution_failed']])
  })
  it('resumes the real SDK response after camera capture, with the image already in context', async () => {
    const spec = resolveRealtimeTools('Rest.').filter(t => t.name === 'capture_camera')
    expect(spec[0].results.accepted.speech).toBe('model')
    const transport = new ScriptedRealtimeTransport(), errors = vi.fn()
    const addImage = vi.spyOn(transport, 'addImage'), output = vi.spyOn(transport, 'sendFunctionCallOutput')
    const session = new RealtimeSession(new RealtimeAgent({ name: 'fixture', tools: bindRealtimeTools(spec, {
      capture_camera: async () => { session.addImage('data:image/jpeg;base64,/9j/2Q==', { triggerResponse: false }); return 'accepted' },
    }, vi.fn()) }), { transport, tracingDisabled: true, historyStoreAudio: false, config: { tracing: null } })
    session.on('error', errors)
    try {
      await session.connect({ apiKey: 'synthetic-unused-credential' })
      transport.emit('function_call', { type: 'function_call', id: 'capture-item', callId: 'capture-call', name: 'capture_camera', arguments: '{}', responseId: 'fixture-response' })
      await vi.waitFor(() => expect(output).toHaveBeenCalledOnce())
      expect(addImage).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/2Q==', { triggerResponse: false })
      expect(addImage.mock.invocationCallOrder[0]).toBeLessThan(output.mock.invocationCallOrder[0])
      expect(JSON.parse(output.mock.calls[0][1])).toEqual(spec[0].results.accepted)
      expect(output.mock.calls[0][2]).toBe(true)
      expect(errors).not.toHaveBeenCalled()
    } finally { session.close() }
  })
  it('loads and freezes the actual file and renders values once', () => {
    expect(REALTIME_TOOLS).toEqual(JSON.parse(readFileSync(REALTIME_TOOL_SOURCE, 'utf8')))
    expect(Object.isFrozen(REALTIME_TOOLS.tools[0].parameters.properties)).toBe(true)
    const rendered = resolveRealtimeTools('{{sleepPhrase}}')[0]
    expect(rendered.description).toContain('"{{sleepPhrase}}"')
  })
  it('omits disabled tools and their rules, and exposes no audition tools', () => {
    const catalog = fresh(); catalog.tools.forEach((tool: any) => { tool.enabled = false })
    const resolved = resolveRealtimeTools('Rest.', false, parseRealtimeToolCatalog(catalog))
    expect(resolved).toEqual([]); expect(realtimeToolInstructions(resolved)).toBe('')
    expect(resolveRealtimeTools('Rest.', true)).toEqual([])
  })
  it.each([
    (c:any) => c.tools.push(c.tools[0]),
    (c:any) => c.tools[0].rules.useWhen = '{{visitorHistory}}',
    (c:any) => c.tools[0].parameters.additionalProperties = true,
    (c:any) => c.tools[0].parameters.properties.x = {type:'string'},
    (c:any) => c.tools[0].parameters.unevaluatedProperties = false,
    (c:any) => c.tools[0].completion = 'unimplemented',
    (c:any) => c.tools[0].results.failed.status = 'accepted',
  ])('fails visibly for invalid definitions', change => {
    const catalog=fresh(); change(catalog)
    expect(() => parseRealtimeToolCatalog(catalog)).toThrow('invalid_realtime_tool_catalog')
  })
  it('cannot execute an unbound or inherited handler', () => {
    const catalog=fresh(); catalog.tools[0].handler='toString'
    expect(() => bindRealtimeTools(resolveRealtimeTools('Rest.',false,parseRealtimeToolCatalog(catalog)),{},vi.fn()))
      .toThrow('realtime_tool_handler_unavailable')
  })
  it('keeps the native definition identical and returns JSON through the actual SDK invocation path', async () => {
    const handler=vi.fn(async () => 'accepted' as const), onFailure=vi.fn()
    const [tool]=bindRealtimeTools(specs(),{return_to_dormant:handler},onFailure)
    expect({type:tool.type,name:tool.name,description:tool.description,parameters:tool.parameters}).toEqual(realtimeToolDefinition(specs()[0]))
    const result=await call(tool,'{}')
    expect(isBackgroundResult(result)).toBe(true)
    expect(result).toMatchObject({content:REALTIME_TOOLS.tools[0].results.accepted})
    expect(handler).toHaveBeenCalledExactlyOnceWith({}); expect(onFailure).not.toHaveBeenCalled()
  })
  it.each(['{','null','[]','{"unexpected":"private fixture"}'])('rejects invalid arguments before executing: %s', async input => {
    const handler=vi.fn(), onFailure=vi.fn()
    const [tool]=bindRealtimeTools(specs(),{return_to_dormant:handler},onFailure)
    expect(await call(tool,input)).toMatchObject({content:REALTIME_TOOLS.tools[0].results.rejected})
    expect(handler).not.toHaveBeenCalled(); expect(onFailure).toHaveBeenCalledExactlyOnceWith('tool_arguments_rejected')
  })
  it('validates structured enum arguments for future explicitly bound tools', async () => {
    const catalog=fresh(); catalog.tools[0].parameters={type:'object',properties:{mode:{type:'string',enum:['calm','bright']}},required:['mode'],additionalProperties:false}
    const handler=vi.fn(async () => 'accepted' as const)
    const [tool]=bindRealtimeTools(resolveRealtimeTools('Rest.',false,parseRealtimeToolCatalog(catalog)).filter(spec => spec.handler === 'return_to_dormant'),{return_to_dormant:handler},vi.fn())
    await call(tool,'{"mode":"invented"}'); expect(handler).not.toHaveBeenCalled()
    await call(tool,'{"mode":"calm"}'); expect(handler).toHaveBeenCalledExactlyOnceWith({mode:'calm'})
  })
  it('returns a safe failure without disclosing exception text', async () => {
    const onFailure=vi.fn()
    const [tool]=bindRealtimeTools(specs(),{return_to_dormant:async()=>{throw new Error('private fixture')}},onFailure)
    const result=await call(tool,'{}')
    expect(result).toMatchObject({content:REALTIME_TOOLS.tools[0].results.failed})
    expect(JSON.stringify(result)).not.toContain('private fixture')
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('tool_execution_failed')
  })
  it('serializes catalog tools and background JSON through a real SDK session', async () => {
    const transport=new ScriptedRealtimeTransport(), errors=vi.fn()
    const output=vi.spyOn(transport,'sendFunctionCallOutput')
    const session=new RealtimeSession(new RealtimeAgent({name:'fixture',instructions:realtimeToolInstructions(specs()),
      tools:bindRealtimeTools(specs(),{return_to_dormant:async()=>'accepted'},vi.fn())}),
      {transport,tracingDisabled:true,config:{tracing:null}})
    session.on('error',errors)
    try {
      const config=await session.getInitialSessionConfig()
      // Both production WebRTC and this offline transport use OpenAIRealtimeBase's serializer.
      expect(new OpenAIRealtimeWebSocket().buildSessionPayload(config).tools).toEqual(specs().map(realtimeToolDefinition))
      await session.connect({apiKey:'synthetic-unused-credential'})
      transport.emit('function_call',{type:'function_call',id:'tool-item',callId:'tool-call',name:'return_to_dormant',arguments:'{}',responseId:'fixture-response'})
      await vi.waitFor(()=>expect(output).toHaveBeenCalledOnce())
      expect(JSON.parse(output.mock.calls[0][1])).toEqual(REALTIME_TOOLS.tools[0].results.accepted)
      expect(output.mock.calls[0][2]).toBe(false)
      expect(errors).not.toHaveBeenCalled()
    } finally {session.close()}
  })
  it('validates media arguments and serializes all native tools through the SDK', async () => {
    const all = resolveRealtimeTools('Rest.'), media = vi.fn(async () => 'accepted' as const)
    const tools = bindRealtimeTools(all, { return_to_dormant: async () => 'accepted', play_media: media, stop_media: async () => 'accepted', capture_camera: async () => 'accepted', memory: async () => 'rejected',
      find_media: async () => 'accepted', search_youtube: async () => 'accepted', play_youtube: async () => 'accepted' }, vi.fn())
    const play = tools.find(t => t.name === 'play_media')!
    await call(play, JSON.stringify({ kind: 'video', assetId: 'clip', mode: 'forever' }))
    await call(play, JSON.stringify({ kind: 'video', assetId: 'clip' }))
    expect(media).not.toHaveBeenCalled()
    expect(await call(play, JSON.stringify({ kind: 'video', assetId: 'clip', mode: 'loop' })))
      .toMatchObject({ content: { status: 'accepted', code: 'media_started' } })
    expect(media).toHaveBeenCalledExactlyOnceWith({ kind: 'video', assetId: 'clip', mode: 'loop' })
    const session = new RealtimeSession(new RealtimeAgent({ name: 'fixture', tools }), { transport: new ScriptedRealtimeTransport(), tracingDisabled: true })
    try {
      expect(new OpenAIRealtimeWebSocket().buildSessionPayload(await session.getInitialSessionConfig()).tools).toEqual(all.map(realtimeToolDefinition))
    } finally { session.close() }
  })
  it('routes local-first lookup and explicit source restrictions through the shared catalog', () => {
    const lookup = resolveRealtimeTools('Rest.').find(t => t.name === 'find_media')!
    expect(lookup.rules.useWhen).toContain('call find_media first')
    expect(lookup.rules.useWhen).toContain('unless the visitor explicitly requests YouTube')
    expect(lookup.rules.useWhen).toContain('not every later media request')
    expect(lookup.rules.speech).toContain('no suitable local match')
    expect(resolveRealtimeTools('Rest.').find(t => t.name === 'play_youtube')!.rules.avoidWhen).toContain('Use once unless')
  })
  it('returns discovery candidates to the model but suppresses stale discovery replies', async () => {
    const media = { status: 'accepted' as const, code: 'media_discovery_matches', resources: [{ kind: 'music' as const, assetId: 'rain', name: 'Rain', aliases: [] }], total: 1 }
    const handler = vi.fn(async () => ({ outcome: 'accepted' as const, media }))
    const [tool] = bindRealtimeTools(resolveRealtimeTools('Rest.').filter(t => t.name === 'find_media'), { find_media: handler }, vi.fn())
    expect(await call(tool, '{"query":"rain","kind":"music"}')).toMatchObject({ media })
    expect(await call(tool, '{"query":"rain","kind":"music"}')).not.toHaveProperty('guidance')
    handler.mockResolvedValueOnce({ outcome: 'accepted', media: { ...media, code: 'media_discovery_no_match', resources: [], total: 0 } })
    expect(await call(tool, '{"query":"missing","kind":"music"}')).toMatchObject({
      media: { code: 'media_discovery_no_match', resources: [], total: 0 },
      guidance: expect.stringContaining('continue with search_youtube'),
    })
    handler.mockResolvedValueOnce({ outcome: 'accepted', media: { ...media, code: 'media_discovery_stale', resources: [], total: 0 } })
    expect(isBackgroundResult(await call(tool, '{"query":"rain","kind":"music"}'))).toBe(true)
  })
})
