import { describe, expect, it } from 'vitest'
import { visitorSentenceLanguage } from '../../src/shared/visitor-language'
import { MemoryDialogue } from '../../src/renderer/realtime/memory-dialogue'

describe('visitor-only language hints', () => {
  it.each(['Can you play 青花瓷?', 'Please explain the poem 靜夜思 in English.', 'Music makes me happy.', 'The rain stopped this morning.'])('recognizes the sentence around a title or noun subject: %s', text => {
    expect(visitorSentenceLanguage(text)).toBe('english')
  })
  it.each(['你是我的眼', '《我想要你》', '「Can you feel the love tonight」'])('keeps ambiguous or explicitly quoted titles neutral: %s', text => {
    expect(visitorSentenceLanguage(text)).toBeNull()
  })
  it.each(['請播放 Can you feel the love tonight', '我想聽 Music makes me happy', '請解釋「Can you help me?」這句話。'])('uses the Chinese request around an English title: %s', text => {
    expect(visitorSentenceLanguage(text)).toBe('chinese')
  })
  it.each(['Could you play some music?', 'I miss my family.', 'Please tell me about ravens.', 'Why is the sky blue?', 'Sing me a song', 'What time is it?', 'Who are you?', 'Try the title Distant Harbor again, please.', 'Only look in our folder for Distant Harbor. Do not search online for this one.'])('recognizes clear English sentences: %s', text => {
    expect(visitorSentenceLanguage(text)).toBe('english')
  })
  it.each([
    'Yes, a quiet walk sounds nice. What should I take with me?',
    'Back to that invitation: what should I put in the first line?',
    'Where could we go tomorrow?',
    'What would you recommend?',
    'My name is Mira Vale. We spoke before about an exhibit.',
  ])('recognizes complete English questions with modal verbs: %s', text => {
    expect(visitorSentenceLanguage(text)).toBe('english')
  })
  it('preserves explicit language selection through ordinary speech', () => {
    const events: any[] = []
    const dialogue = new MemoryDialogue({ send: event => events.push(event), baseInstructions: 'Persona', speakingStyle: '', turnDetection: {},
      input: async () => ({ status: 'accepted', code: '' }), tail: async () => {}, interrupt: async () => {}, failed: () => {}, report: () => {} })
    dialogue.setReplyLanguage('english')
    const hint = events.at(-1).item.id
    const count = events.length
    dialogue.speech('title-only')
    dialogue.speech('title-only')
    expect(events).toHaveLength(count)
    dialogue.speech('chinese-sentence')
    dialogue.setReplyLanguage('chinese')
    expect(events.slice(count).map(event => event.type)).toEqual(['conversation.item.delete', 'conversation.item.create'])
    expect(events[count].item_id).toBe(hint)
    expect(events.at(-1).item.content[0].text).toContain('Traditional')
    expect(events.every(event => !['session.update', 'response.create'].includes(event.type))).toBe(true)
    dialogue.close()
  })
  it.each(['現在幾點', '這是什麼', '你好嗎', '那你呢', '告訴我一個故事', '播放月亮代表我的心', '幫我找一首周杰倫的歌', '為什麼天空是藍的', '停止播放', '我想聽音樂', '請播放音樂', '只在我們的資料夾找遠方港口，別去網路找。'])('recognizes Chinese sentences: %s', text => {
    expect(visitorSentenceLanguage(text)).toBe('chinese')
  })
  it.each(['请播放我们资料夹的雨夜钢琴。', '帮我找一首周杰伦的歌', '告诉我一个故事', '我们觉得今天很舒服。', '你会讲这个故事吗？'])('recognizes Simplified-Chinese ASR without changing the reply policy: %s', text => {
    expect(visitorSentenceLanguage(text)).toBe('chinese')
  })
  it.each(['周杰倫', 'Taylor Swift', 'The Beatles Yesterday', 'hello', 'Hello Raven', 'Good morning', '渡鴉大人', '月亮代表我的心'])('does not switch for isolated names or fragments: %s', text => {
    expect(visitorSentenceLanguage(text)).toBeNull()
  })
  it('replaces the explicit selection hint without retaining visitor text', () => {
    const events: any[] = []
    const dialogue = new MemoryDialogue({ send: event => events.push(event), baseInstructions: 'Persona', speakingStyle: '', turnDetection: {},
      input: async () => ({ status: 'accepted', code: '' }), tail: async () => {}, interrupt: async () => {}, failed: () => {}, report: () => {} })
    dialogue.setReplyLanguage('english')
    dialogue.setReplyLanguage('english')
    dialogue.speech('title-only')
    dialogue.setReplyLanguage('chinese')
    expect(events.map(event => event.type)).toEqual(['conversation.item.create', 'conversation.item.delete', 'conversation.item.create', 'conversation.item.delete', 'conversation.item.create'])
    expect(events[1].item_id).toBe(events[0].item.id)
    expect(events[3].item_id).toBe(events[2].item.id)
    expect(events.filter(event => event.item).every(event => event.item.role === 'system')).toBe(true)
    expect(JSON.stringify(events)).not.toContain('private concern')
    expect(JSON.stringify(events)).toContain('Traditional')
    const priorHint = events.at(-1).item.id
    const beforeSpeech = events.length
    dialogue.speech('new-speech')
    expect(events).toHaveLength(beforeSpeech)
    const count = events.length
    dialogue.speech('title-only')
    expect(events).toHaveLength(count)
    dialogue.setReplyLanguage('english')
    expect(events.at(-1).type).toBe('conversation.item.create')
    expect(events.filter(event => event.item_id === priorHint)).toHaveLength(1)
    dialogue.close()
  })
})
