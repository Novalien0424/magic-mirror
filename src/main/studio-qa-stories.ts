import type { StudioSettings } from '../shared/portrait-studio'

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
  readonly visitor: {
    /** Name step: what the visitor says, the characters they mean, a correction and a confirmation. */
    readonly name?: { readonly say: string; readonly intended: string; readonly correction: string; readonly confirm: string }
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
    id: 'default',
    title: 'Published Raven studio',
    studio: { prompts: { painting: '用一句話告訴訪客：「顏料已經調好了，我開始畫囉。」不要描述畫面。' } },
    visitor: {
      name: { say: '我叫王曉明。', intended: '王曉明', correction: '不是小朋友的小，是破曉的曉，王曉明。', confirm: '對，就是這個名字。' },
      answers: ['我想變成一隻貓頭鷹。', '夜晚的海邊。', '像起霧的早晨，很安靜。', '深藍色。'],
      changes: ['可以把海邊換成下雪的森林嗎？'],
      thanks: '很好，我很喜歡，謝謝你。',
      request: '可以幫我畫一張畫像嗎？',
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
      artStyle: 'Dunhuang cave mural meets Byzantine gold-leaf icon: mineral pigments of lapis, malachite and cinnabar, aged plaster texture, a radiant halo, flying apsaras ribbons, sacred and serene.',
      nameLettering: 'painted',
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
      request: '可以幫我畫一張畫像嗎？',
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
      artStyle: 'Surreal magical-realist dreamscape in the manner of Remedios Varo: impossible architecture, floating objects, delicate iridescent glazes, soft candle and moonlight, whimsical and tender.',
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
