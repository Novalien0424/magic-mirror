import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const musicOnly = process.argv.includes('--music-only')
const live = process.argv.includes('--live')
if (resolve(process.cwd()).toLowerCase() !== repoRoot.toLowerCase()) {
  throw new Error('phase4_qa_requires_canonical_checkout_cwd')
}

const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const root = resolve(repoRoot, '.artifacts', 'phase4-qa', stamp)
const userDataDir = join(root, 'user-data')
const outputDir = join(root, 'screenshots')
const configDir = join(userDataDir, 'config')
const musicDir = join(userDataDir, 'assets', 'music')
const visualDir = join(userDataDir, 'assets', 'visual')
await Promise.all([mkdir(configDir, { recursive: true }), mkdir(musicDir, { recursive: true }), mkdir(visualDir, { recursive: true }), mkdir(outputDir, { recursive: true })])

function makeToneWav(durationSeconds = 4, sampleRate = 48_000) {
  const sampleCount = durationSeconds * sampleRate
  const dataLength = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(1, index / 1000, (sampleCount - index) / 1000)
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 0.28 * envelope
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2)
  }
  return buffer
}

const music = makeToneWav()
const musicFileName = 'phase4-qa-tone.wav'
await writeFile(join(musicDir, musicFileName), music)

const trialVisualDir = join(repoRoot, 'resources', 'phase4-trial-assets')
const visualFixtures = [
  { id: 'visual-qa-still', fileName: 'phase4-still.png', name: 'QA still', kind: 'image', mimeType: 'image/png', width: 360, height: 640, orientation: 'portrait', audioTrack: 'absent' },
  { id: 'visual-qa-finite', fileName: 'phase4-finite-silent.webm', name: 'QA finite silent', kind: 'video', mimeType: 'video/webm', width: 360, height: 640, orientation: 'portrait', durationMs: 3000, audioTrack: 'absent' },
  { id: 'visual-qa-loop', fileName: 'phase4-loop-silent.webm', name: 'QA loop silent', kind: 'video', mimeType: 'video/webm', width: 360, height: 640, orientation: 'portrait', durationMs: 2000, audioTrack: 'absent' },
  { id: 'visual-qa-embedded', fileName: 'phase4-finite-embedded-audio.webm', name: 'QA embedded audio', kind: 'video', mimeType: 'video/webm', width: 360, height: 640, orientation: 'portrait', durationMs: 3008, audioTrack: 'present' },
];
{
  // Generated fixture assembly never puts source paths into runtime config.
  for (const fixture of visualFixtures) {
    const bytes = await readFile(join(trialVisualDir, fixture.fileName))
    await writeFile(join(visualDir, fixture.fileName), bytes)
    fixture.byteLength = bytes.byteLength
    fixture.sha256 = createHash('sha256').update(bytes).digest('hex')
    fixture.windowsDecode = 'passed'
  }
}
visualFixtures.push({
  id: 'visual-qa-missing', fileName: 'phase4-intentionally-missing.webm', name: 'QA missing video',
  kind: 'video', mimeType: 'video/webm', width: 360, height: 640, orientation: 'portrait',
  durationMs: 1000, audioTrack: 'absent', byteLength: 100, sha256: '0'.repeat(64), windowsDecode: 'passed',
})

const config = JSON.parse(await readFile(join(repoRoot, 'resources', 'config', 'default.json'), 'utf8'))
config.configVersion = 41
// Renderer capture takes longer than the developer-mode product idle timeout.
// Keep this isolated QA session alive until the live dialogue assertions run.
config.idleSeconds = 300
config.visualAssets = visualFixtures
config.musicAssets = [{
  id: 'music-qa-tone',
  name: 'Phase 4 QA tone',
  fileName: musicFileName,
  mimeType: 'audio/wav',
  byteLength: music.byteLength,
  sha256: createHash('sha256').update(music).digest('hex'),
}]
config.sceneActions = [
  { id: 'dialogue-opening', name: 'Opening dialogue', enabled: true, kind: 'avatar_dialogue', text: 'The mirror awakens now.' },
  { id: 'dialogue-ending', name: 'Ending dialogue', enabled: true, kind: 'avatar_dialogue', text: 'The scene is complete.' },
  { id: 'motion-opening', name: 'Opening motion', enabled: true, kind: 'avatar_motion', motionGroup: 'Waking' },
  { id: 'motion-ending', name: 'Ending motion', enabled: true, kind: 'avatar_motion', motionGroup: 'Scene' },
  { id: 'expression-one', name: 'Expression one', enabled: true, kind: 'avatar_expression', expression: 'exp_01' },
  { id: 'music-play', name: 'Play QA tone', enabled: true, kind: 'music', command: 'play', assetId: 'music-qa-tone', gain: 0.65, loop: true },
  { id: 'music-fade', name: 'Fade QA tone', enabled: true, kind: 'music', command: 'fade', targetGain: 0.2, durationMs: 150 },
  { id: 'music-stop', name: 'Stop QA tone', enabled: true, kind: 'music', command: 'stop', fadeDurationMs: 150 },
  { id: 'light-on', name: 'Light on', enabled: true, kind: 'lighting', command: 'on', presetId: 'qa-blue' },
  { id: 'light-off', name: 'Light off', enabled: true, kind: 'lighting', command: 'off', presetId: 'qa-blue' },
  { id: 'fog-on', name: 'Fog on', enabled: true, kind: 'fog', command: 'on', presetId: 'qa-soft' },
  { id: 'fog-value', name: 'Fog value', enabled: true, kind: 'fog', command: 'value', presetId: 'qa-soft', value: 0.4 },
  { id: 'fog-off', name: 'Fog off', enabled: true, kind: 'fog', command: 'off', presetId: 'qa-soft' },
  { id: 'visual-still', name: 'Show QA still', enabled: true, kind: 'visual', assetId: 'visual-qa-still', fit: 'contain', playback: 'still', audio: 'muted', gain: 0 },
  { id: 'visual-finite', name: 'Play QA finite', enabled: true, kind: 'visual', assetId: 'visual-qa-finite', fit: 'cover', playback: 'once', audio: 'muted', gain: 0 },
  { id: 'visual-loop', name: 'Loop QA silent', enabled: true, kind: 'visual', assetId: 'visual-qa-loop', fit: 'cover', playback: 'loop', audio: 'muted', gain: 0 },
  { id: 'visual-embedded', name: 'Play QA embedded audio', enabled: true, kind: 'visual', assetId: 'visual-qa-embedded', fit: 'contain', playback: 'once', audio: 'embedded', gain: 0.5 },
  { id: 'visual-missing', name: 'Play missing QA video', enabled: true, kind: 'visual', assetId: 'visual-qa-missing', fit: 'contain', playback: 'once', audio: 'muted', gain: 0 },
]
config.scenes = [
  {
    id: 'scene-avatar-music', name: 'Avatar and music', enabled: true,
    stages: [
      { id: 'avatar-open', name: 'Open', endCondition: { kind: 'duration', durationMs: 700 }, actionIds: ['dialogue-opening', 'motion-opening', 'music-play', 'light-on'] },
      { id: 'avatar-effect', name: 'Effect', endCondition: { kind: 'duration', durationMs: 700 }, actionIds: ['expression-one', 'fog-on', 'fog-value'] },
      { id: 'avatar-release', name: 'Release', endCondition: { kind: 'duration', durationMs: 300 }, actionIds: ['music-fade', 'fog-off', 'light-off'] },
      { id: 'avatar-ending', name: 'Ending', endCondition: { kind: 'duration', durationMs: 700 }, actionIds: ['dialogue-ending', 'motion-ending', 'music-stop'] },
    ],
  },
  {
    id: 'scene-fog-light', name: 'Fog and light', enabled: true,
    stages: [
      { id: 'fog-start', name: 'Start', endCondition: { kind: 'duration', durationMs: 250 }, actionIds: ['fog-on', 'light-on'] },
      { id: 'fog-level', name: 'Level', endCondition: { kind: 'duration', durationMs: 250 }, actionIds: ['fog-value'] },
      { id: 'fog-stop', name: 'Stop', endCondition: { kind: 'duration', durationMs: 250 }, actionIds: ['fog-off', 'light-off'] },
    ],
  },
  {
    id: 'scene-ending', name: 'Ending', enabled: true,
    stages: [
      { id: 'ending-motion', name: 'Motion', endCondition: { kind: 'duration', durationMs: 350 }, actionIds: ['motion-ending'] },
      { id: 'ending-dialogue', name: 'Dialogue', endCondition: { kind: 'duration', durationMs: 350 }, actionIds: ['dialogue-ending'] },
    ],
  },
  {
    id: 'scene-visual-still', name: 'Still visual', enabled: true,
    stages: [{ id: 'visual-still-stage', name: 'Still', endCondition: { kind: 'duration', durationMs: 1000 }, actionIds: ['visual-still'] }],
  },
  {
    id: 'scene-visual-finite', name: 'Finite visual', enabled: true,
    stages: [{ id: 'visual-finite-stage', name: 'Finite', endCondition: { kind: 'video_complete', visualActionId: 'visual-finite' }, actionIds: ['visual-finite'] }],
  },
  {
    id: 'scene-visual-loop', name: 'Loop visual', enabled: true,
    stages: [{ id: 'visual-loop-stage', name: 'Loop', endCondition: { kind: 'until_stopped', maxRuntimeMs: 15_000 }, actionIds: ['visual-loop', 'music-play'] }],
  },
  {
    id: 'scene-visual-embedded', name: 'Embedded audio visual', enabled: true,
    stages: [{ id: 'visual-embedded-stage', name: 'Embedded', endCondition: { kind: 'video_complete', visualActionId: 'visual-embedded' }, actionIds: ['visual-embedded'] }],
  },
  {
    id: 'scene-visual-missing', name: 'Missing visual fallback', enabled: true,
    stages: [{ id: 'visual-missing-stage', name: 'Missing', endCondition: { kind: 'video_complete', visualActionId: 'visual-missing' }, actionIds: ['visual-missing'] }],
  },
]
config.spells = [
  { id: 'spell-avatar-music', name: 'Avatar music spell', phrase: 'Mirror begin the ceremony', sceneId: 'scene-avatar-music', enabled: true, cooldownMs: 1000 },
  { id: 'spell-fog-light', name: 'Fog light spell', phrase: 'Mirror call the mist', sceneId: 'scene-fog-light', enabled: true, cooldownMs: 1000 },
  { id: 'spell-ending', name: 'Ending spell', phrase: 'Mirror end the ceremony', sceneId: 'scene-ending', enabled: true, cooldownMs: 1000 },
  { id: 'spell-visual-still', name: 'Still visual spell', phrase: 'Mirror show the portrait', sceneId: 'scene-visual-still', enabled: true, cooldownMs: 0 },
  { id: 'spell-visual-finite', name: 'Finite visual spell', phrase: 'Mirror play the finite vision', sceneId: 'scene-visual-finite', enabled: true, cooldownMs: 0 },
  { id: 'spell-visual-loop', name: 'Loop visual spell', phrase: 'Mirror hold the vision', sceneId: 'scene-visual-loop', enabled: true, cooldownMs: 0 },
  { id: 'spell-visual-embedded', name: 'Embedded visual spell', phrase: 'Mirror play the sounding vision', sceneId: 'scene-visual-embedded', enabled: true, cooldownMs: 0 },
  { id: 'spell-visual-missing', name: 'Missing visual spell', phrase: 'Mirror play the missing vision', sceneId: 'scene-visual-missing', enabled: true, cooldownMs: 0 },
]
config.adapters = { lighting: 'mock', fog: 'mock', music: 'mock' }

for (const slot of ['active', 'draft', 'previous']) {
  await writeFile(join(configDir, `${slot}.json`), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

const electron = join(repoRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const environment = {
  ...process.env,
  MIRROR_PHASE4_QA: '1',
  MIRROR_PHASE4_QA_MUSIC_ONLY: musicOnly ? '1' : '0',
  MIRROR_PHASE4_QA_LIVE: live ? '1' : '0',
  MIRROR_PHASE4_QA_OUTPUT_DIR: outputDir,
  MIRROR_PHASE0_USER_DATA_ROOT: root,
  MIRROR_USER_DATA_DIR: userDataDir,
  MIRROR_SMOKE_MS: '120000',
  MIRROR_DEVELOPER_MODE: 'disabled',
  MIRROR_BUILD_COMMIT: 'phase4-qa',
}
delete environment.MIRROR_PHASE0_DEMO
delete environment.MIRROR_PHASE1_LIVE_SMOKE

const child = spawn(electron, [repoRoot], {
  cwd: repoRoot,
  env: environment,
  windowsHide: false,
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)

const exitCode = await new Promise((resolveExit, reject) => {
  const timer = setTimeout(() => {
    child.kill()
    reject(new Error('phase4_qa_timeout'))
  }, 130_000)
  child.once('error', (error) => {
    clearTimeout(timer)
    reject(error)
  })
  child.once('exit', (code) => {
    clearTimeout(timer)
    resolveExit(code ?? 2)
  })
})

process.stdout.write(`${JSON.stringify({ marker: 'PHASE4_QA_ARTIFACTS', root, outputDir, exit: exitCode })}\n`)
process.exitCode = exitCode
