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
  it('keeps confirmed media silent but lets the avatar explain a playback failure', async () => {
    const media = vi.fn(async (): Promise<'accepted' | 'failed'> => 'accepted')
    const [tool] = bindRealtimeTools(resolveRealtimeTools('Rest.').filter(t => t.name === 'play_media'), { play_media: media }, vi.fn())
    const args = JSON.stringify({ kind: 'video', assetId: 'clip', mode: 'loop' })
    expect(isBackgroundResult(await call(tool, args))).toBe(true)
    media.mockResolvedValueOnce('failed')
    const result = await call(tool, args)
    expect(isBackgroundResult(result)).toBe(false)
    expect(result).toMatchObject({ status: 'failed', speech: 'model' })
  })
  it('resumes the real SDK response after camera capture, with the image already in context', async () => {
    const spec = resolveRealtimeTools('Rest.').filter(t => t.name === 'capture_camera')
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
    const tools = bindRealtimeTools(all, { return_to_dormant: async () => 'accepted', play_media: media, stop_media: async () => 'accepted', capture_camera: async () => 'accepted', memory: async () => 'rejected' }, vi.fn())
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
})
