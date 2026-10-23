import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { newAvatar } from '../../src/renderer/console/profile-workspace'
import { inspectAvatarPrompts, PROMPT_TABS } from '../../src/shared/prompt-inspection'
import { REALTIME_PROMPT_SOURCE, REALTIME_PROMPTS, buildSpeechResponse, renderPrompt } from '../../src/shared/realtime-prompts'
import { allowPromptWindow, promptWindowName } from '../../src/shared/prompt-window'
import { REALTIME_TOOLS, resolveRealtimeTools, realtimeToolDefinition } from '../../src/shared/realtime-tools'
import { renderToStaticMarkup } from 'react-dom/server'
import { MEMORY_PROMPTS, MEMORY_PROMPT_SOURCE } from '../../src/shared/memory-prompts'
import { defaultExperience } from '../../src/shared/portrait-studio'

describe('file-sourced prompt inspection', () => {
  it('loads the complete versioned catalog without hidden fallback wording', () => {
    expect(REALTIME_PROMPTS).toEqual(JSON.parse(readFileSync(REALTIME_PROMPT_SOURCE, 'utf8')))
    expect(Object.isFrozen(REALTIME_PROMPTS.defaults)).toBe(true)
    const avatar = newAvatar('fixture')
    expect(avatar.personality).toBe(REALTIME_PROMPTS.authoring.newAvatarPersonality)
    expect(avatar.presentation.sleepFarewell).toBe(REALTIME_PROMPTS.defaults.sleepFarewell)
  })
  it('shows fully rendered speech requests, tools, hints, audition, defaults and source templates', () => {
    const avatar = { ...newAvatar('fixture'), name: 'Raven', speakingStyle: 'Slow.',
      presentation: { ...newAvatar('fixture').presentation, wakeGreeting: 'Welcome.', sleepFarewell: 'Rest.' } }
    const view = inspectAvatarPrompts(avatar, [{ id:'dialogue', name:'Scene', enabled:true, kind:'avatar_dialogue', text:'Rain.' }])
    expect(JSON.parse(view.pages.Speech[0].content)).toEqual(buildSpeechResponse('Welcome.', 'Slow.'))
    expect(JSON.parse(view.pages.Speech[1].content)).toEqual(buildSpeechResponse('Rest.', 'Slow.'))
    expect(JSON.parse(view.pages.Speech.find(section => section.title.startsWith('Scene dialogue'))!.content)).toEqual(buildSpeechResponse('Rain.', 'Slow.'))
    expect(view.pages.Sources[0].content).toContain(REALTIME_PROMPTS.defaults.personality)
    expect(JSON.parse(view.pages['Tools & input'][0].content)).toEqual(realtimeToolDefinition(resolveRealtimeTools(avatar.sleepPhrase!)[0]))
    expect(JSON.parse(view.pages['Tools & input'][1].content)).toEqual(REALTIME_TOOLS.tools[0].results)
    expect(JSON.parse(view.pages.Sources[1].content)).toEqual(REALTIME_TOOLS)
    expect(JSON.parse(view.pages.Audition[1].content)).toEqual(buildSpeechResponse(REALTIME_PROMPTS.auditionText, 'Slow.'))
    expect(inspectAvatarPrompts({...avatar, presentation:{...avatar.presentation,wakeGreeting:''}},[]).pages.Speech[0].content).toContain('no request sent')
  })
  it('shows the memory helpers and the studio requests the application writes, from versioned files', () => {
    expect(MEMORY_PROMPTS).toEqual(JSON.parse(readFileSync(MEMORY_PROMPT_SOURCE, 'utf8')))
    const view = inspectAvatarPrompts(newAvatar('fixture'), [])
    const tools = view.pages['Tools & input']
    expect(tools.find(section => section.title.startsWith('Memory extraction'))).toMatchObject({ content: MEMORY_PROMPTS.extractor, source: `${MEMORY_PROMPT_SOURCE}#extractor` })
    expect(tools.find(section => section.title.startsWith('Memory intent · confirmation'))!.content).toContain(MEMORY_PROMPTS.intent.tasks.confirmation)
    const first = view.pages.Session.find(section => section.title.startsWith('Interactive Studio first question'))!
    expect(first.content).toContain('準備好的話就告訴我你的名字')
    expect(view.pages.Session.find(section => section.title.startsWith('Interactive Studio fixed transitions'))!.content).toContain('30000')
    // No hidden wording remains in the studio agent instructions either.
    expect(view.pages.Session.find(s => s.title.startsWith('Interactive Studio agent instructions'))!.content).toContain('After the name there are 4 studio questions; the application gives each one in the tool guidance.')
  })

  it('does not reinterpret template markers or markup inside operator values', () => {
    const value = '<script>alert(1)</script>{{text}}'
    expect(renderPrompt('performance', { speakingStyle:value, text:'Exact.' })).toContain(value)
    expect(buildSpeechResponse(value, '').instructions.endsWith(value)).toBe(true)
    expect(renderToStaticMarkup(value)).toContain('&lt;script&gt;')
  })
  it('keeps the inspector usable while an authored timing marker is invalid', () => {
    const avatar = newAvatar('fixture')
    avatar.experience = defaultExperience()
    avatar.experience.studio.startScript = 'Hello[pause=99s]'
    expect(inspectAvatarPrompts(avatar, []).pages.Session.find(s => s.title.startsWith('Interactive Studio opening'))?.content).toContain('Invalid pause marker')
  })
  it('allows only the five known Console child windows with a blank local document', () => {
    for (let i = 0; i < PROMPT_TABS.length; i++) {
      expect(allowPromptWindow('console', 'about:blank', promptWindowName(i))).toBe(true)
      expect(allowPromptWindow('mirror', 'about:blank', promptWindowName(i))).toBe(false)
    }
    for (const url of ['https://example.com', 'file:///C:/secret', 'javascript:alert(1)', 'about:blank#x'])
      expect(allowPromptWindow('console', url, promptWindowName(0))).toBe(false)
    expect(allowPromptWindow('console','about:blank','unknown')).toBe(false)
  })
})
