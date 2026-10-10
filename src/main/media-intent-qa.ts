/** Synthetic text intent QA with the configured Realtime model; no mic or playback. */
import { app } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime'
import config from '../../resources/config/default.json'
import { buildAvatarPrompt } from '../shared/avatar-prompt'
import { resolveRealtimeTools } from '../shared/realtime-tools'
import { rankMediaResources } from '../shared/media-discovery'
import { bindRealtimeTools } from '../renderer/realtime/realtime-tool-bindings'
import { createEnvironmentCredentialSource } from './environment-credential-source'
import { createClientSecretBroker } from './realtime/client-secret-broker'
import type { AvatarMediaResource } from '../shared/media-skill'

const root = resolve(process.argv[2] ?? '.artifacts/media-intent-qa')
app.setPath('userData', join(root, 'user-data'))
app.on('window-all-closed', () => {})
const resources: AvatarMediaResource[] = [
  { kind: 'music', assetId: 'fixture-rain', name: 'Rain — Fixture Pianist', aliases: ['雨聲', '雨天鋼琴'] },
]
const scenarios = [
  { name: 'local_default_once', text: 'Play Rain by Fixture Pianist.', route: ['find_media', 'play_media'], mode: 'once' },
  { name: 'local_then_youtube', text: 'Play Moonlit Lake by Fixture Pianist.', route: ['find_media', 'search_youtube', 'play_youtube'], mode: 'once' },
  { name: 'explicit_youtube_chinese', text: '在 YouTube 播放 Fixture Pianist 的 Moonlit Lake 音樂，不要循環。', route: ['search_youtube', 'play_youtube'], mode: 'once' },
  { name: 'local_only_english', text: 'Play Moonlit Lake from our vault.', route: ['find_media'] },
  { name: 'local_only_chinese', text: '只在我們的資料夾找月光湖這首歌，播放一次。', route: ['find_media'] },
  { name: 'explicit_local_loop_chinese', text: '循環播放我們寶庫的雨聲音樂。', route: ['find_media', 'play_media'], mode: 'loop' },
  { name: 'contextual_clue', context: 'The song I mean is Rain by Fixture Pianist.', text: 'Play that song.', route: ['find_media', 'play_media'], mode: 'once' },
  { name: 'ambiguous_local_asks', text: 'Play Rain.', route: ['find_media'], ambiguous: true },
]
const checks: { name: string; passed: boolean; calls: string[]; reason?: string }[] = []
let tokens = 0
let active: RealtimeSession | undefined
let finished = false
const deadline = setTimeout(() => { void finish(2, 'media_intent_qa_timeout') }, 240000)
async function finish(exit: number, reason?: string) {
  if (finished) return
  finished = true; clearTimeout(deadline); active?.close()
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'evidence.json'), JSON.stringify({ timestamp: new Date().toISOString(),
    model: config.aiModels.realtimeDialogue.modelId, checks, tokens, reason,
    exclusions: ['microphone ASR', 'physical wake word', 'actual media playback', 'Raven persona', 'private memory'],
  }, null, 2))
  console.log(JSON.stringify({ event: 'media_intent_qa_complete', exit, checks, tokens, reason }))
  app.exit(exit)
}
void app.whenReady().then(async () => {
  const broker = createClientSecretBroker({ credentialStore: createEnvironmentCredentialSource(), events: { emit() {} } })
  for (const scenario of scenarios) {
    const calls: { name: string; mode?: unknown; valid?: boolean }[] = []
    let responseDone = 0, lastActivity = Date.now(), failed = false, replied = false
    const local = scenario.ambiguous ? [...resources, { ...resources[0], assetId: 'fixture-rain-other', name: 'Rain — Another Pianist' }] : resources
    const record = (name: string, mode?: unknown, valid?: boolean) => { calls.push({ name, mode, valid }); lastActivity = Date.now() }
    const tools = bindRealtimeTools(resolveRealtimeTools('Rest.'), {
      find_media: async args => {
        record('find_media')
        const media = rankMediaResources(local, { query: args.query as string, kind: args.kind as 'all' | 'music' | 'video' })
        return { outcome: media.status, media }
      },
      search_youtube: async () => {
        record('search_youtube')
        return { outcome: 'accepted', youtube: { status: 'accepted', code: 'youtube_search_results', videos: [
          { url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', title: 'Moonlit Lake — Fixture Pianist', channel: 'Fixture Pianist' },
        ] } }
      },
      play_media: async args => { record('play_media', args.mode, args.assetId === 'fixture-rain'); return 'accepted' },
      play_youtube: async args => {
        record('play_youtube', args.mode, args.url === 'https://www.youtube.com/watch?v=M7lc1UVf-VE'); return 'accepted'
      },
      stop_media: async () => { record('stop_media'); return 'accepted' },
      memory: async () => { record('memory'); return 'rejected' },
      capture_camera: async () => { record('capture_camera'); return 'rejected' },
      return_to_dormant: async () => { record('return_to_dormant'); return 'rejected' },
    }, () => { failed = true })
    const session = new RealtimeSession(new RealtimeAgent({ name: 'Media fixture', tools,
      instructions: buildAvatarPrompt({ name: 'Media fixture', personality: 'A friendly media companion.', speakingStyle: '',
        wakeGreeting: '', sleepFarewell: 'Goodbye.', sleepPhrase: 'Rest.',
        mediaSkill: { enabled: true, resources: [], fadeMs: 0, gain: 1 },
      }),
    }), { transport: 'websocket', model: config.aiModels.realtimeDialogue.modelId,
      historyStoreAudio: false, tracingDisabled: true, config: { outputModalities: ['text'], tracing: null } })
    active = session
    session.on('error', () => { failed = true })
    session.on('transport_event', event => {
      if (event.type === 'response.done') {
        responseDone++; lastActivity = Date.now()
        const response = event.response as { usage?: { total_tokens?: number }; output?: { type?: string }[] }
        tokens += response.usage?.total_tokens ?? 0
        replied ||= !!response.output?.some(item => item.type === 'message')
      }
    })
    try {
      const credential = await broker.issue({ modelId: config.aiModels.realtimeDialogue.modelId })
      await session.connect({ apiKey: credential.value })
      if (scenario.context) session.transport.sendEvent({ type: 'conversation.item.create', item: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: scenario.context }],
      } })
      session.sendMessage(scenario.text)
      const until = Date.now() + 25000
      while (!failed && Date.now() < until && !(responseDone && Date.now() - lastActivity > 1200
        && (calls.some(call => call.name.startsWith('play_')) || replied))) await new Promise(resolve => setTimeout(resolve, 100))
      const playback = calls.find(call => call.name.startsWith('play_'))
      const passed = !failed && JSON.stringify(calls.map(call => call.name)) === JSON.stringify(scenario.route)
        && (scenario.mode ? playback?.mode === scenario.mode && playback.valid === true : !playback && replied)
      checks.push({ name: scenario.name, passed, calls: calls.map(call => call.name), ...(!passed ? { reason: failed ? 'provider_or_tool_error' : 'intent_mismatch' } : {}) })
      console.log(JSON.stringify({ event: 'media_intent_case', ...checks.at(-1) }))
    } finally { session.close(); active = undefined }
    if (!checks.at(-1)?.passed) break
  }
  await finish(checks.length === scenarios.length && checks.every(check => check.passed) ? 0 : 2)
}).catch(() => { void finish(2, 'media_intent_qa_failed') })
