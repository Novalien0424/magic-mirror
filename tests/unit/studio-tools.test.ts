import { describe, expect, it, vi } from 'vitest'
import { invokeFunctionTool, RunContext } from '@openai/agents'
import { isBackgroundResult } from '@openai/agents/realtime'
import { REALTIME_TOOLS, parseRealtimeToolCatalog, resolveRealtimeTools } from '../../src/shared/realtime-tools'
import { bindRealtimeTools } from '../../src/renderer/realtime/realtime-tool-bindings'

const call = (tool: ReturnType<typeof bindRealtimeTools>[number], input: string) => invokeFunctionTool({ tool, input, runContext: new RunContext({}) })

describe('Portrait Studio tool availability', () => {
  it('keeps studio tools out of the conversation agent and gives the studio agent only studio tools plus sleep', () => {
    const conversation = resolveRealtimeTools('Rest.').map(spec => spec.name)
    const studio = resolveRealtimeTools('Rest.', false, REALTIME_TOOLS, 'studio').map(spec => spec.name)
    expect(conversation).toContain('start_portrait_studio')
    expect(conversation).toContain('return_to_dormant')
    expect(conversation.some(name => name.startsWith('studio_'))).toBe(false)
    expect([...studio].sort()).toEqual(['dismiss_image', 'return_to_dormant', 'studio_answer', 'studio_exit', 'studio_finish', 'studio_reject_name', 'studio_repeat_question', 'studio_revise', 'studio_set_name', 'studio_use_photo'])
    expect(conversation).toEqual(expect.arrayContaining(['create_image', 'edit_image', 'dismiss_image']))
    const bad = structuredClone(REALTIME_TOOLS) as unknown as { tools: { availability: string }[] }
    bad.tools[0]!.availability = 'everywhere'
    expect(() => parseRealtimeToolCatalog(bad)).toThrow('invalid_realtime_tool_catalog')
  })

  it('validates studio arguments before Main sees them', async () => {
    const handler = vi.fn(async () => ({ outcome: 'accepted' as const, studio: { status: 'accepted' as const, code: 'studio_name_heard' } }))
    const [setName] = bindRealtimeTools(resolveRealtimeTools('Rest.', false, REALTIME_TOOLS, 'studio').filter(t => t.name === 'studio_set_name'), { studio_set_name: handler }, vi.fn())
    await call(setName!, JSON.stringify({ name: '王曉明', confirmed: false }))
    expect(handler).not.toHaveBeenCalled()
    await call(setName!, JSON.stringify({ name: '王曉明', confirmed: false, language: 'zh' }))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('speaks studio guidance but keeps duplicate and stale studio replies in the background', async () => {
    const [answer] = bindRealtimeTools(resolveRealtimeTools('Rest.', false, REALTIME_TOOLS, 'studio').filter(t => t.name === 'studio_answer'), {
      studio_answer: async args => args.question === 1
        ? { outcome: 'accepted' as const, studio: { status: 'accepted' as const, code: 'studio_answer_recorded', next: 'Now ask question 2 of 4: x' } }
        : { outcome: 'ignored' as const, studio: { status: 'ignored' as const, code: 'studio_answer_duplicate' } },
    }, vi.fn())
    const spoken = await call(answer!, JSON.stringify({ question: 1, answer: 'owl', language: 'en' }))
    expect(isBackgroundResult(spoken)).toBe(false)
    expect(spoken).toMatchObject({ next: 'Now ask question 2 of 4: x', studio: { code: 'studio_answer_recorded' } })
    expect(isBackgroundResult(await call(answer!, JSON.stringify({ question: 2, answer: 'owl', language: 'en' })))).toBe(true)
  })
})
