// Live, isolated QA of the published Raven. No visitor data or credentials are copied.
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBuild } from './qa-build.mjs'
import { acquireElectronOwner } from './electron-owner.mjs'
import { createQaArtifact, finishQaArtifact } from './qa-artifacts.mjs'
import { runRavenQaLaunchAgent } from './raven-qa-launchagent.mjs'
import { RAVEN_SYNTHETIC_MEDIA, RAVEN_CONVERSATION_SCENARIOS, RAVEN_QUALITY_JUDGE_CONTRACT } from '../src/main/raven-conversation-fixture.ts'
import { defaultExperience } from '../src/shared/portrait-studio.ts'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseOwner = acquireElectronOwner('raven-qa')
process.once('exit', releaseOwner)
if (process.platform !== 'darwin' || process.cwd() !== '/Users/novalien0424/magic-mirror') throw Error('raven_qa_canonical_mac_required')
const args = process.argv.slice(2), launchAgent = args.includes('--launch-agent')
if (launchAgent) args.splice(args.indexOf('--launch-agent'), 1)
const physical = args.includes('--physical')
if (physical) args.splice(args.indexOf('--physical'), 1)
if (physical && !launchAgent) throw Error('raven_qa_physical_requires_launchagent')
const personaIndex = args.indexOf('--persona')
const personaVariant = personaIndex < 0 ? 'published' : args[personaIndex + 1]
if (!['published', 'sage', 'authoritative'].includes(personaVariant)) throw Error('raven_qa_persona_invalid')
if (personaIndex >= 0) args.splice(personaIndex, 2)
const effortIndex = args.indexOf('--effort')
const effort = effortIndex < 0 ? null : args[effortIndex + 1]
if (effortIndex >= 0) {
  if (!['minimal', 'low'].includes(effort)) throw Error('raven_qa_effort_invalid')
  args.splice(effortIndex, 2)
}
const resolvedPromptIndex = args.indexOf('--prompt')
const promptVariant = resolvedPromptIndex < 0 ? 'trimmed' : args[resolvedPromptIndex + 1]
if (!['baseline', 'trimmed', 'merged', 'focused'].includes(promptVariant)) throw Error('raven_qa_prompt_invalid')
if (resolvedPromptIndex >= 0) args.splice(resolvedPromptIndex, 2)
const variantIndex = args.indexOf('--variant')
const variant = variantIndex < 0 ? null : args[variantIndex + 1]
if (variantIndex >= 0) {
  if (!['mini', 'full'].includes(variant)) throw Error('raven_qa_variant_invalid')
  args.splice(variantIndex, 2)
}
const selected = args[0] === '--scenario' && args.length === 2 ? args[1] : ''
const mediaBgm = selected === 'media_bgm'
const reviewUi = ['review_ui', 'memory_calendar', 'camera_native', 'camera_delivery'].includes(selected)
if (args.length !== 0 && (!selected || ![...RAVEN_CONVERSATION_SCENARIOS.map(s => s.id), 'review_ui', 'memory_calendar', 'media_bgm', 'media_stop', 'portrait_studio', 'additional_capabilities', 'camera', 'camera_native', 'camera_delivery', 'judge_calibration', 'memory_intent_calibration', 'wake_diagnostic', 'wake_media', 'wake_media_routes', 'wake_media_mac', 'wake_soak', 'wake_soak_mac', 'wake_replay', 'wake_capture', 'wake_control', 'wake_aec', 'wake_aec_alignment', 'wake_aec_alignment_native', 'wake_browser', 'wake_levels', 'wake_levels_asr'].includes(selected))) throw Error('raven_qa_scenario_invalid')
// The caller must preserve operator edits and quit the ordinary app first.
if (spawnSync('/usr/bin/pgrep', ['-f', '/Electron.app/Contents/MacOS/Electron'], { encoding: 'utf8' }).status === 0) throw Error('raven_qa_electron_already_running')
const build = await verifyBuild(repo)
const operator = join(process.env.HOME, 'Library/Application Support/magic-mirror')
const published = await readFile(join(operator, 'config/active.json'))
const config = JSON.parse(published)
const modelTrial = variant === null && effort === null ? null : JSON.parse(await readFile(join(repo, 'resources/testing/raven-model-ab.v1.json'), 'utf8'))
if (modelTrial) {
  if (modelTrial.version !== 1 || variant !== null && typeof modelTrial.variants?.[variant] !== 'string'
    || effort !== null && !modelTrial.reasoningEfforts?.includes(effort)) throw Error('raven_qa_trial_config_invalid')
  if (variant !== null) config.aiModels.realtimeDialogue.modelId = modelTrial.variants[variant]
  if (effort !== null) config.reasoningEffort = effort
  config.configVersion += 100000
}
const avatar = config.avatarCatalog?.avatars.find(a => a.id === config.avatarCatalog.activeAvatarId)
const model = config.avatarCatalog?.models.find(m => m.id === avatar?.modelId)
if (avatar?.name !== 'Raven' || !model || avatar.modelId === 'builtin-ren') throw Error('raven_qa_published_raven_required')
if (personaVariant !== 'published') {
  const persona = JSON.parse(await readFile(join(repo, `resources/testing/raven-${personaVariant}-persona.v1.json`), 'utf8'))
  if (persona.version !== 1 || typeof persona.personality !== 'string' || typeof persona.speakingStyle !== 'string') throw Error('raven_qa_persona_invalid')
  avatar.personality = persona.personality
  avatar.speakingStyle = persona.speakingStyle
}
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const root = await createQaArtifact(repo, stamp)
const data = join(root, 'user-data'), output = join(root, 'screenshots')
for (const path of ['config', 'assets/music', 'assets/visual', 'assets/avatars', 'fixtures/own', 'fixtures/shared']) await mkdir(join(data, path), { recursive: true })
await mkdir(output)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fingerprint = digest(JSON.stringify(avatar))
const promptPath = { baseline: 'resources/testing/raven-prompt-baseline.v1.json',
  merged: 'resources/testing/raven-merged-media.v1.json', focused: 'resources/testing/raven-focused.v1.json',
  trimmed: 'resources/config/prompts/realtime.v1.json' }[promptVariant]
for (const file of model.files) {
  const target = join(data, 'assets/avatars', model.id, file)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(join(operator, 'assets/avatars', model.id, file), target)
}
// Keep Raven's actual presentation, effects, voice, persona and model settings.
// Only media/scene fixtures and external hardware adapters are substituted.
config.avatarCatalog = { ...config.avatarCatalog, avatars: [avatar], models: [model], locks: [] }
if (selected === 'portrait_studio') {
  // One operator-edited stage prompt proves configurable stage prompts reach the live avatar.
  const experience = avatar.experience ?? defaultExperience()
  avatar.experience = { ...experience, studio: { ...experience.studio,
    prompts: { ...experience.studio.prompts, painting: '用一句話告訴訪客：「顏料已經調好了，我開始畫囉。」不要描述畫面。' } } }
}
const presentationIds = new Set([avatar.presentation.backgroundId, avatar.presentation.entranceVideoId, avatar.presentation.exitVideoId])
config.visualAssets = config.visualAssets.filter(a => presentationIds.has(a.id))
config.musicAssets = config.musicAssets.filter(a => a.id === avatar.presentation.ambienceId)
for (const [kind, assets] of [['visual', config.visualAssets], ['music', config.musicAssets]]) {
  for (const asset of assets) await copyFile(join(operator, 'assets', kind, asset.fileName), join(data, 'assets', kind, asset.fileName))
}
function tone(seconds) {
  const count = seconds * 48000, wav = Buffer.alloc(44 + count * 2)
  wav.write('RIFF'); wav.writeUInt32LE(36 + count * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(Math.sin(i / 48000 * Math.PI * 2 * 330) * 3500), 44 + 2 * i)
  return wav
}
const wav = tone(selected === 'media_stop' ? 90 : 8)
if (mediaBgm) await writeFile(join(data, 'assets/music/phase4-qa-tone.wav'), wav)
// The real folder scanner supplies opaque IDs and enforces own/shared scope.
for (const [folder, names] of [['own', ['Folder Beacon', '雨夜鋼琴']], ['shared', ['Shared Lantern']]]) {
  for (const name of names) await writeFile(join(data, 'fixtures', folder, name + '.wav'), wav)
}
await copyFile(join(repo, 'resources/phase4-trial-assets/phase4-finite-silent.webm'), join(data, 'fixtures/own', 'Sky.webm'))
await writeFile(join(data, 'media-folders.json'), JSON.stringify({ version: 1, links: { [`avatar:${avatar.id}`]: join(data, 'fixtures/own'), shared: join(data, 'fixtures/shared') } }))
for (const media of RAVEN_SYNTHETIC_MEDIA) {
  const video = media.kind === 'video', bytes = video ? await readFile(join(repo, 'resources/phase4-trial-assets/phase4-finite-silent.webm')) : wav
  const fileName = media.assetId + (video ? '.webm' : '.wav')
  await writeFile(join(data, 'assets', video ? 'visual' : 'music', fileName), bytes)
  const asset = { id: media.assetId, name: media.name, fileName, mimeType: video ? 'video/webm' : 'audio/wav', byteLength: bytes.length, sha256: digest(bytes) }
  if (video) config.visualAssets.push({ ...asset, kind: 'video', width: 360, height: 640, orientation: 'portrait', durationMs: 3000, audioTrack: 'absent', windowsDecode: 'passed' })
  else config.musicAssets.push(asset)
}
avatar.mediaSkill = { ...avatar.mediaSkill, resources: mediaBgm ? [] : RAVEN_SYNTHETIC_MEDIA }
config.adapters = { lighting: 'mock', fog: 'mock', music: 'mock' }
const action = { id: 'qa-spell-light', name: 'QA light', enabled: true, kind: 'lighting', command: 'on', presetId: 'qa-blue' }
const scene = { id: 'qa-spell-scene', name: 'QA scene', enabled: true, stages: [{ id: 'qa-spell-stage', name: 'QA stage', endCondition: { kind: 'duration', durationMs: 500 }, actionIds: [action.id] }] }
config.sceneActions = [action]; config.scenes = []; config.spells = []
avatar.scenes = [scene]
avatar.spells = [{ id: 'qa-spell', name: 'QA exact spell', phrase: '施放咒語，點亮銀燈', sceneId: scene.id, enabled: true, cooldownMs: 1000 }]
for (const slot of ['active', 'draft', 'previous']) await writeFile(join(data, 'config', slot + '.json'), JSON.stringify(config), { mode: 0o600 })
// Preserve device routing and gain, without copying device-independent visitor data.
await copyFile(join(operator, 'audio-devices.json'), join(data, 'audio-devices.json'))
await writeFile(join(root, 'build.json'), JSON.stringify(build))
await writeFile(join(root, 'raven-provenance.json'), JSON.stringify({ publishedConfigSha256: digest(published), avatarFingerprint: fingerprint,
  promptVariant, personaVariant,
  reasoningEffort: config.reasoningEffort,
  promptCatalogSha256: digest(await readFile(join(repo, promptPath))),
  toolCatalogSha256: promptVariant !== 'trimmed'
    ? digest(JSON.stringify(JSON.parse(await readFile(join(repo, promptPath), 'utf8')).tools))
    : digest(await readFile(join(repo, 'resources/config/prompts/realtime-tools.v1.json'))),
  judgeVersion: RAVEN_QUALITY_JUDGE_CONTRACT.version,
  probeSha256: digest(await readFile(join(repo, 'src/main/raven-conversation-probe.ts'))),
  // Include the scenario criteria and supplemental runtime judge instructions.
  judgeCriteriaSha256: digest(Buffer.concat(await Promise.all(['src/main/raven-conversation-fixture.ts', 'src/main/raven-conversation-qa.ts',
    'src/main/raven-camera-input-qa.ts', 'src/main/raven-conversation-judge.ts'].map(path => readFile(join(repo, path)))))),
  modelTrial: modelTrial ? { version: modelTrial.version, variant, configVersion: config.configVersion } : null,
  name: avatar.name, rig: model.name, modelId: model.id, voice: avatar.voice, models: config.aiModels,
  substitutions: ['isolated identity database', 'synthetic media folders', ...(physical ? [] : ['synthetic camera frame']), 'one fixture spell with mock hardware'],
  deviceRoute: physical ? 'mac_speaker_to_jabra_microphone_and_native_camera' : 'virtual_microphone_and_camera_fixture',
  tvShutdown: 'session_scoped_qa_exemption',
  humanAcousticAcceptance: 'not_executed', portraitAcceptance: 'not_executed' }, null, 2))
const env = { ...process.env, MIRROR_PHASE4_QA: '1', MIRROR_RAVEN_CONVERSATION_QA: '1', MIRROR_PHASE4_QA_LIVE: '1',
  MIRROR_RAVEN_CONVERSATION_QA_SCENARIO: selected,
  MIRROR_PHASE4_QA_CONSOLE: '1', MIRROR_PHASE4_QA_OUTPUT_DIR: output, MIRROR_PHASE0_USER_DATA_ROOT: root,
  MIRROR_USER_DATA_DIR: data, MIRROR_SMOKE_MS: ['wake_soak', 'wake_soak_mac'].includes(selected) ? '2400000' : '1800000', MIRROR_DEVELOPER_MODE: 'disabled' }
for (const key of Object.keys(env)) if (key.startsWith('MIRROR_') && !['MIRROR_PHASE4_QA', 'MIRROR_RAVEN_CONVERSATION_QA', 'MIRROR_RAVEN_CONVERSATION_QA_SCENARIO', 'MIRROR_PHASE4_QA_LIVE', 'MIRROR_PHASE4_QA_CONSOLE', 'MIRROR_PHASE4_QA_OUTPUT_DIR', 'MIRROR_PHASE0_USER_DATA_ROOT', 'MIRROR_USER_DATA_DIR', 'MIRROR_SMOKE_MS', 'MIRROR_DEVELOPER_MODE'].includes(key)) delete env[key]
env.MIRROR_QA_PROMPT_VARIANT = promptVariant
if (physical) env.MIRROR_QA_PHYSICAL_DEVICES = '1'
if (mediaBgm) Object.assign(env, { MIRROR_RAVEN_CONVERSATION_QA: '0', MIRROR_PHASE4_QA_LIVE: '0',
  MIRROR_MEDIA_SKILL_QA: '1', MIRROR_MEDIA_SKILL_QA_FUNCTIONAL: '1' })
if (reviewUi) Object.assign(env, { MIRROR_RAVEN_CONVERSATION_QA: '0', MIRROR_PHASE4_QA_LIVE: '0', MIRROR_REVIEW_UI_QA: '1',
  ...(selected === 'memory_calendar' ? { MIRROR_MEMORY_CALENDAR_QA: '1' } : {}) })
let exit
if (launchAgent) exit = await runRavenQaLaunchAgent({ repo, root, stamp, environment: env })
else {
  const child = spawn(join(repo, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), [repo], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] })
  // Production logs are metadata-only; never expose native/provider diagnostic text.
  let pending = '', resultCount = 0, passed = false
  child.stdout.on('data', chunk => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/); pending = lines.pop() ?? ''
    for (const line of lines) if (/^(?:PHASE4_|BOOT_|LIFECYCLE_|WAKE_|SHUTDOWN_|WINDOW_)/.test(line)) {
      process.stdout.write(line + '\n')
      if (line.includes('PHASE4_QA_RESULT')) { resultCount++; passed = /status=passed|"status":"passed"/.test(line) }
    }
  })
  child.stderr.resume()
  const code = await new Promise(resolveExit => { child.once('error', () => resolveExit(2)); child.once('exit', c => resolveExit(c ?? 2)) })
  exit = code === 0 && resultCount === 1 && passed ? 0 : 2
}
await finishQaArtifact(repo, stamp, exit)
console.log(JSON.stringify({ event: 'raven_qa_complete', exit, evidence: join(root, 'evidence.json') }))
process.exitCode = exit
