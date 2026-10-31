import type { GuestListSettings, StudioSettings } from '../shared/portrait-studio'

/**
 * Live Interactive Studio QA stories: one studio setup each, plus what the
 * synthetic visitor says. `default` is the owner's published studio with one
 * edited stage prompt; the others replace the whole studio with a very
 * different story, language, name step, question count, lettering, quality,
 * change limit and custom prompts. Visitors are synthetic; no real person.
 */
export interface StudioQaStory {
  readonly id: string
  readonly title: string
  /** Replaces the studio settings; `default` merges into the published studio instead. */
  readonly studio: Partial<StudioSettings>
  readonly guests?: GuestListSettings
  readonly visitor: {
    /** Name step: what the visitor says, the characters they mean, a correction and a confirmation. */
    readonly name?: { readonly say: string; readonly intended: string; readonly correction: string; readonly confirm: string }
    readonly denyName?: string
    readonly silentName?: boolean
    readonly silentQuestions?: readonly number[]
    readonly silentPreference?: boolean
    readonly languageRequests?: readonly { beforeQuestion: number; language: 'zh' | 'en'; say: string }[]
    /** One per studio question, in order. */
    readonly answers: readonly string[]
    /** Change requests after reveals, in order; never more than revisionsAllowed. */
    readonly changes: readonly string[]
    /** Said when a picture is shown and the avatar has not finished on its own. */
    readonly thanks: string
    /** A later Conversation-mode visit that asks for the studio (journey V3). */
    readonly request?: string
  }
  /** Words from an edited stage prompt that show the avatar followed it (a soft check). */
  readonly promptMarkers?: Readonly<Partial<Record<'painting' | 'finished', string>>>
}

export const STUDIO_QA_STORIES: readonly StudioQaStory[] = Object.freeze([
  {
    id: 'guest_names_zh', title: 'Chinese guest shortlist: denial skips the first homophone', studio: {},
    guests: { names: ['黃曉明', '王曉明', '林美玲'], match: 'only' },
    visitor: { name: { say: '我叫曉明。', intended: '王曉明', correction: '我姓王，名字是破曉的曉，明天的明，王曉明。', confirm: '對，就是這個名字。' },
      denyName: '不對，這不是我的名字。請重新問我名字。',
      answers: ['我自己去海邊看日出。', '我會留下來幫朋友收拾。', '我想旅行，也想多陪家人。', '我希望生活多一點安靜。'], changes: [], thanks: '謝謝。' },
  },
  {
    id: 'guest_names_en', title: 'English guest phonetics: canonical spelling and application confirmation', studio: {},
    guests: { names: ['Katherine', 'Sean', 'Stephen'], match: 'only' },
    visitor: { name: { say: 'My name is Catherine.', intended: 'Katherine', correction: 'The spelling is K A T H E R I N E, Katherine.', confirm: 'Yes, that is correct.' },
      answers: ['I went to the beach alone to see the sunrise.', 'I stayed to help my friend clean up.', 'I want to travel and also spend time with family.', 'I wish for more quiet time.'], changes: [], thanks: 'Thank you.' },
  },
  {
    id: 'soul_language', title: 'Gate thirty-three: explicit bilingual switching and name-only display', studio: {},
    visitor: {
      name: { say: 'My name is Amy.', intended: 'Amy', correction: 'Please write A M Y, Amy.', confirm: 'Yes, that is correct.' },
      languageRequests: [
        { beforeQuestion: 2, language: 'en', say: 'Please speak English from now on. Please repeat the current question in English.' },
        { beforeQuestion: 3, language: 'zh', say: '接下來請改用中文。請用中文重複這一題。' },
      ],
      answers: ['I explored a new city alone without my phone. I remember feeling free because I could finally ignore my messages.',
        '有一次朋友搬家，我主動陪他整理到半夜。我就是很在意朋友的人。',
        'I want to spend more time with my family and travel alone, but my holidays are limited.',
        '我希望生活裡多一點安靜和自由。'],
      changes: ['我很喜歡，但是請讓靈魂多一對銀色的翅膀。'], thanks: '我很喜歡，謝謝你。',
    },
  },
  {
    id: 'soul', title: 'Gate thirty-three: four reflective questions, name denial and one revision', studio: {},
    visitor: {
      name: { say: '我叫王曉明。', intended: '王曉明', correction: '是破曉的曉，明天的明，王曉明。', confirm: '對，就是這個名字。' },
      denyName: '不對，這不是我的名字。請重新問我名字。',
      answers: ['我沒有帶手機，自己在陌生城市冒險了一天。我記得很清楚，因為終於不必一直看訊息。',
        '有一次朋友搬家，我主動陪他整理到半夜。我就是很在意朋友的人。',
        '我想多陪伴家人，也想獨自去遠方旅行，但是假期很有限。',
        '我希望生活裡多一點安靜和自由。'],
      changes: ['保留靈魂的意思，用現代極簡多色向量風格重新畫，不要水彩筆觸，並加上一對銀色翅膀。'], thanks: '我喜歡，謝謝你。',
      request: '請開始互動工作室，帶我完成靈魂問答體驗。',
    },
  },
  {
    id: 'soul_silence', title: 'Gate thirty-three: two edited questions, silent name and silent answers',
    studio: { questions: [
      { id: 'quiet', zh: '說說你最珍惜的一段安靜時光。[pause=1s]為什麼呢？', en: 'What quiet moment do you cherish, and why?', slot: 'mood' },
      { id: 'wish', zh: '接下來，你希望多一點什麼？', en: 'What would you like more of next?', slot: 'detail' },
    ] },
    visitor: {
      name: { say: '我叫王曉明。', intended: '無名之人', correction: '我叫王曉明。', confirm: '對。' },
      silentName: true, silentQuestions: [1, 2], silentPreference: true, answers: ['保持沉默。', '保持沉默。'], changes: [], thanks: '我很喜歡這個靈魂，不需要修改，謝謝你。',
    },
  },
  {
    id: 'default',
    title: 'Published Raven studio',
    studio: { prompts: { painting: '用一句話告訴訪客：「顏料已經調好了，我開始畫囉。」不要描述畫面。' } },
    visitor: {
      name: { say: '我叫王曉明。', intended: '王曉明', correction: '不是小朋友的小，是破曉的曉，王曉明。', confirm: '對，就是這個名字。' },
      // One answer per published default question: the past year's moment and why, a "this is me"
      // moment, two wants that are hard to have at once, and what life could have more of.
      answers: ['最難忘的是去年夏天，我一個人去海邊看日出。因為那天我第一次覺得，自己一個人也可以過得很好。',
        '有一次下大雨，我把傘借給公車站一個不認識的阿姨，自己淋雨回家。那時候我就覺得，這就是我會做的事。',
        '我想存錢買房子，也想辭職去環島旅行，可是這兩件事很難同時做到。',
        '我希望生活裡多一點安靜的時間，可以慢慢看書。'],
      changes: ['可以把海邊換成下雪的森林嗎？'],
      thanks: '很好，我很喜歡，謝謝你。',
      request: '請開始互動工作室，帶我完成畫像的問答體驗。',
    },
    promptMarkers: { painting: '顏料' },
  },
  {
    id: 'past_life_oracle',
    title: 'Past-Life Oracle 前世之鏡: Dunhuang gold-leaf icon, painted name, two changes',
    studio: {
      wakePhrase: '招喚渡鴉使者',
      character: '你是渡鴉使者，鏡底的古老神諭者。你相信每個人的靈魂都在鏡子深處留下一道前世的倒影，而你能把它撈上來，畫成一幅聖像。你說話像在進行一場安靜的儀式：緩慢、莊重、帶著禪意與詩意，偶爾用一句很短的偈語收尾。你溫柔、不恐嚇、不算命、不預言災禍，只讓人看見自己靈魂的光。每次只說一兩句。',
      startScript: '我是渡鴉使者。鏡子的最深處，沉睡著你的前世。今夜，我要把它撈上來，為你畫成一幅聖像。',
      askName: true,
      nameQuestion: { zh: '先告訴我，這一世，你叫什麼名字？', en: 'First, tell me: what is your name in this life?' },
      questions: [
        { id: 'dream', zh: '你最常夢見的地方是哪裡？', en: 'Where do you most often find yourself in dreams?', slot: 'setting' },
        { id: 'soul', zh: '如果你的靈魂會發出聲音，那是什麼聲音？', en: 'If your soul made a sound, what would it be?', slot: 'mood',
          imageLine: 'The sound of the visitor’s soul, shown as light and atmosphere: {{answer}}.' },
        { id: 'release', zh: '這一世，你最想放下什麼？', en: 'What do you most wish to let go of in this life?', slot: 'detail',
          imageLine: 'Something being released, drifting away from the figure as light: {{answer}}.' },
        { id: 'guard', zh: '在前世，你守護過什麼？', en: 'What did you guard in a past life?', slot: 'subject',
          imageLine: 'The past-life self as a luminous guardian figure, protecting: {{answer}}.' },
      ],
      artStyle: 'Sacred gold-leaf emblem in bold flat vector, after Dunhuang murals: lapis blue, malachite green, cinnabar red and gold, a radiant halo and flowing apsaras ribbons, serene.',
      nameLettering: 'painted',
      nameFont: 'bold gold brush calligraphy',
      quality: 'high',
      revisionsAllowed: 2,
      holdSeconds: 30,
      prompts: {
        askQuestion: '先用半句偈語回應訪客上一句話，再莊重地問第 {{index}} 題（共 {{count}} 題）：{{question}}',
        painting: '用一句話說：「我把你的前世，從鏡底撈上來了。」不要描述畫面。',
      },
    },
    visitor: {
      name: { say: '我叫王曉明。', intended: '王曉明', correction: '不是小朋友的小，是破曉的曉，王曉明。', confirm: '對，沒錯。' },
      answers: ['我常夢見一座沉在海底的寺廟。', '像遠方寺廟的鐘聲，很慢、很長。', '我想放下對失去的恐懼。', '我好像守護過一盞永遠不會熄滅的燈。'],
      changes: ['讓我的影子變成一條龍。', '把天空換成流動的銀河。'],
      thanks: '我看見了。謝謝你，渡鴉使者。',
      request: '請開始互動工作室的前世之鏡體驗。',
    },
    promptMarkers: { painting: '前世' },
  },
  {
    id: 'unlived_cartographer',
    title: 'The Cartographer of Unlived Lives: English, celestial chart, no name, no changes',
    studio: {
      wakePhrase: '招喚渡鴉使者',
      character: 'You are the Cartographer of Unlived Lives, an ancient raven who maps every road a person did not take. You believe each unchosen path still exists as a quiet star somewhere, and that it loves the person who let it go. Speak English in short, luminous, slightly cryptic sentences, like a poet reading the night sky. Be warm and wondering, never mournful or frightening. Never claim real fortune-telling; you are drawing a map, not a fate.',
      startScript: 'Welcome, wanderer. I keep the maps of the lives you never lived. Answer three questions, and I will chart one for you.',
      askName: false,
      questions: [
        { id: 'door', zh: '說一扇你從未打開的門。', en: 'Tell me about a door you never opened.', slot: 'subject',
          imageLine: 'At the centre of the chart, the unopened door as a celestial gate: {{answer}}.' },
        { id: 'planet', zh: '如果你的靈魂是一顆行星，它會發出什麼聲音？', en: 'If your soul were a planet, what sound would it make?', slot: 'mood',
          imageLine: 'The orbits and light of the chart move like this sound: {{answer}}.' },
        { id: 'colour', zh: '說一種不可能存在的顏色。', en: 'Describe a colour that cannot exist.', slot: 'palette',
          imageLine: 'An impossible colour glows through the whole chart: {{answer}}.' },
      ],
      artStyle: 'Antique celestial chart on dark indigo parchment fused with Hilma af Klint spiritual abstraction: sacred geometry, nested golden orbits, pastel nebulae, engraved compass roses, quiet and visionary.',
      imagePrompt: { frame: 'Create one visionary celestial map in portrait orientation for a visitor of a magic mirror: the map of a life they did not live. Art direction (operator style): {{style}}. Build the map from the visitor’s answers below. Keep it gentle and suitable for all ages. Do not depict a real, identifiable person.' },
      pictureType: 'portrait',
      nameLettering: 'nameplate',
      quality: 'low',
      revisionsAllowed: 0,
      holdSeconds: 30,
      farewell: 'Every road you did not take still loves you\nFarewell, wanderer',
      screenText: { questionLabel: { zh: '第 {{index}} 道星軌，共 {{count}} 道', en: 'Orbit {{index}} of {{count}}' },
        photoHint: { zh: '拍下你未曾走過的那一生', en: 'Photograph the life you never lived' } },
      prompts: { reveal: 'The map of the unlived life is now on the mirror and attached above as an image. Speak in {{language}}. As the Cartographer, read one feature you can actually see on the map as a gentle truth about the visitor, in at most two short sentences. Then {{followUp}}' },
    },
    visitor: {
      answers: ["A door painted with the sea, at the end of my grandmother's hallway.", 'A low hum, like a whale singing inside a bell.', 'A colour that tastes like rain on hot stone.'],
      changes: [],
      thanks: 'It is beautiful. Thank you, Cartographer.',
    },
  },
  {
    id: 'dream_pawnshop',
    title: 'Dream Pawnshop 夢的典當行: surreal dreamscape, English name in Chinese, six questions, one change',
    studio: {
      wakePhrase: '招喚渡鴉使者',
      character: '你是「夢的典當行」的老闆，一隻戴著單片眼鏡的渡鴉。你用夢交換回憶：訪客交出一段回憶，你就畫出一個屬於他們的夢。你說話詼諧、詭譎又帶點哲學，像一位很有禮貌的魔術師，喜歡把普通的東西說得很奇妙，但從不嚇人。你會珍惜地對待每一段被典當的回憶。每次只說一兩句。',
      startScript: '歡迎光臨夢的典當行。在這裡，回憶可以換成夢。我們來談一筆交易吧。',
      askName: true,
      nameQuestion: { zh: '典當單上，要寫誰的名字？', en: 'Whose name goes on the pawn ticket?' },
      questions: [
        { id: 'memory', zh: '你願意用哪一段回憶，換一個夢？', en: 'Which memory would you trade for a dream?', slot: 'detail',
          imageLine: 'The pawned memory appears inside the dream as a small glowing scene: {{answer}}.' },
        { id: 'wings', zh: '在那個夢裡，你長著什麼樣的翅膀？', en: 'In that dream, what kind of wings do you have?', slot: 'subject',
          imageLine: 'The dreamer, seen from behind, has wings like this: {{answer}}.' },
        { id: 'time', zh: '夢裡的時間，往哪個方向流？', en: 'Which way does time flow in the dream?', slot: 'setting',
          imageLine: 'Time in this dreamscape flows like this: {{answer}}.' },
        { id: 'heartbeat', zh: '你的心跳是什麼顏色？', en: 'What colour is your heartbeat?', slot: 'palette' },
        { id: 'tears', zh: '如果眼淚會發芽，會長出什麼？', en: 'If tears could sprout, what would grow?', slot: 'companion',
          imageLine: 'Growing from fallen tears beside the dreamer: {{answer}}.' },
        { id: 'waking', zh: '醒來的時候，你手裡握著什麼？', en: 'When you wake, what is in your hand?', slot: 'mood',
          imageLine: 'The light of the moment of waking, with this held in the hand: {{answer}}.' },
      ],
      artStyle: 'Surreal dream emblem in bold flat vector, in the spirit of Remedios Varo: floating impossible objects, moon-silver, lilac and candle-gold, whimsical and tender.',
      nameLettering: 'nameplate',
      quality: 'medium',
      revisionsAllowed: 1,
      holdSeconds: 30,
      farewell: '夢醒了\n帶著它走吧',
      screenText: { nameLabel: { zh: '典當人', en: 'Pawned by' }, photoHint: { zh: '拍下你換來的夢', en: 'Photograph the dream you traded for' } },
      prompts: {
        painting: '用一句話說：「成交。你的回憶我收下了，現在把夢畫給你。」不要描述畫面。',
        finished: '用一句話說：「這個夢是你的了。記得拍下來，醒來就看不見了。」',
        finalVersion: '用一句話說：「這個夢是你的了。記得拍下來，醒來就看不見了。」',
      },
    },
    visitor: {
      name: { say: '典當人叫 Mia。', intended: 'Mia', correction: '是英文名字，拼法是 M、I、A。', confirm: '對，沒錯。' },
      answers: ['我願意交出第一次騎腳踏車的那個下午。', '用落葉做成的翅膀。', '往後流，像倒放的電影。', '月光那種淡淡的藍。', '會長出會發光的蘑菇。', '一把會唱歌的鑰匙。'],
      changes: ['讓所有的時鐘都變成蝴蝶。'],
      thanks: '好美的夢，謝謝老闆。',
    },
    promptMarkers: { painting: '成交', finished: '醒來就看不見' },
  },
] satisfies StudioQaStory[])

export function studioQaStory(id: string): StudioQaStory | undefined {
  return STUDIO_QA_STORIES.find(story => story.id === id)
}

/** Names compare as a visitor reads them on the glass: width, case and spaces aside. */
export function sameStudioName(a: string, b: string): boolean {
  const key = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, '')
  return key(a) === key(b)
}
