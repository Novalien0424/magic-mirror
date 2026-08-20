import { createHash } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  ConsoleConfigDiff,
  ConsoleModelsPayload,
} from '../shared/console-types'
import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  NativeImage,
  ProcessMemoryInfo,
} from 'electron'
import { bootSequence, type BootRuntime } from './boot'

export const PHASE0_DEMO_IDS = Object.freeze(['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'] as const)

const DEMO_ID_SET: ReadonlySet<string> = new Set(PHASE0_DEMO_IDS)
const PRIVATE_KEY_PATTERN = /(?:transcript|audio|credential|secret|token|embedding|prompt|utterance|private[_-]?context|raw[_-]?(?:line|jsonl)|(?:guest|candidate)_?id|profile_?id|memory[_-]?(?:value|text|content))/i
const ALLOWLISTED_HASH_KEYS: ReadonlySet<string> = new Set([
  'realtimeHash',
  'transcriptionHash',
  'extractorHash',
  'personaHash',
])
const SHA256_HASH_PATTERN = /^[0-9a-f]{64}$/
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_CONFIG_PATH = join(SOURCE_ROOT, 'resources', 'config', 'default.json')
const OFFLINE_LOOP_ASSET_SOURCE_PATH = join(
  SOURCE_ROOT,
  'resources',
  'offline-loop',
  'offline-loop-v1.mp4.base64',
)
const OFFLINE_LOOP_ASSET_SHA256 = 'e9e4383572854438f47591b67153d5b25dfc20f577019d649f2149e4cbb34cd6'
const OFFLINE_LOOP_ASSET_BYTE_LENGTH = 1687
const OFFLINE_LOOP_MEDIA_READY_TIMEOUT_MS = 10_000
const OFFLINE_LOOP_MEDIA_POLL_MS = 50
const STRICT_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const FIXTURE_CONFIG_PATH = 'phase0-fixture-default.json'
const TELEMETRY_FILE_NAME = 'telemetry-0.jsonl'
const MAX_REOPEN_TELEMETRY_BYTES = 1_048_576
const MAX_REOPEN_TELEMETRY_LINES = 4096
const ALLOWLISTED_REOPEN_EVENT = Object.freeze({
  module: 'app',
  event: 'phase_reopen_probe',
  status: 'success',
  source: 'contract_test',
  reason: 'process_a_metadata_probe',
} as const)

const FIXTURE_VALUES = Object.freeze({
  realtimeDialogue: 'fixture-realtime-p0-v2',
  inputTranscription: 'fixture-transcription-p0-v2',
  memoryExtractor: 'fixture-extractor-p0-v2',
  persona: 'Phase0Fixture',
})

type DemoId = typeof PHASE0_DEMO_IDS[number]
type FailureCase = 'cloud-failure' | 'core-failure'
type D4Process = 'A' | 'B'

interface UserDataIsolation {
  readonly ok: true
  readonly root: string
  readonly userDataDir: string
}

interface InvalidUserDataIsolation {
  readonly ok: false
  readonly reason: 'user_data_isolation_invalid'
}

export type Phase0UserDataPathResult = UserDataIsolation | InvalidUserDataIsolation

export interface Phase0UserDataPathOptions {
  readonly app: Phase0MainApp
  readonly demo?: string
  readonly smoke: boolean
  readonly userDataRoot?: string
  readonly userDataDir?: string
}

export interface Phase0MainApp {
  setPath(name: 'userData', path: string): void
  whenReady(): Promise<void>
}

interface DemoContext {
  readonly demo: DemoId
  readonly failureCase?: FailureCase
  readonly buildCommit: string
  readonly userDataRoot: string
  readonly userDataDir: string
  readonly soakMs: number
  readonly sampleMs: number
  readonly noTimeCompression: boolean
}

interface DemoRuntimeContext extends DemoContext {
  readonly runtime: BootRuntime
  readonly setProbeFailure: (value: boolean) => void
  readonly electron: Phase0ElectronCapabilities
}

export interface Phase0ElectronCapabilities {
  readonly app: Phase0MainApp
  readonly createBrowserWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow
  readonly getProcessMemoryInfo: () => Promise<ProcessMemoryInfo>
}

interface DemoExecutionResult {
  readonly recordWritten?: boolean
}

interface FailureSignal {
  readonly reason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStrictDescendant(root: string, candidate: string): boolean {
  const child = relative(root, candidate)
  return child !== ''
    && child !== '..'
    && !child.startsWith(`..${sep}`)
    && !/^[A-Za-z]:[\\/]/.test(child)
}

function invalidIsolation(): InvalidUserDataIsolation {
  return { ok: false, reason: 'user_data_isolation_invalid' }
}

/**
 * Resolves and validates the Main user-data boundary without creating paths.
 * The caller owns creation and cleanup of a run directory.
 */
export function resolvePhase0UserDataIsolation(
  rootInput: unknown,
  userDataInput: unknown,
): Phase0UserDataPathResult {
  if (
    typeof rootInput !== 'string'
    || rootInput.trim() === ''
    || rootInput.includes('\0')
    || typeof userDataInput !== 'string'
    || userDataInput.trim() === ''
    || userDataInput.includes('\0')
  ) return invalidIsolation()

  try {
    const root = realpathSync(resolve(rootInput))
    const userDataDir = realpathSync(resolve(userDataInput))
    if (!lstatSync(root).isDirectory() || !lstatSync(userDataDir).isDirectory()) {
      return invalidIsolation()
    }
    if (!isStrictDescendant(root, userDataDir)) return invalidIsolation()
    return { ok: true, root, userDataDir }
  } catch {
    return invalidIsolation()
  }
}

/**
 * Applies the explicit demo/smoke user-data path before app.whenReady().
 * Ordinary runtime ignores these variables and retains Electron's default path.
 */
export function applyPhase0UserDataPath(options: Phase0UserDataPathOptions): Phase0UserDataPathResult | { readonly ok: true; readonly ignored: true } {
  const explicitDemo = options.demo !== undefined
  const hasAnyIsolationInput = options.userDataRoot !== undefined || options.userDataDir !== undefined
  if (!explicitDemo && !(options.smoke && hasAnyIsolationInput)) return { ok: true, ignored: true }

  const isolation = resolvePhase0UserDataIsolation(options.userDataRoot, options.userDataDir)
  if (!isolation.ok) return isolation

  try {
    options.app.setPath('userData', isolation.userDataDir)
  } catch {
    return invalidIsolation()
  }
  return isolation
}

function demoIdFromEnvironment(): DemoId | null {
  const value = process.env['MIRROR_PHASE0_DEMO']
  return typeof value === 'string' && DEMO_ID_SET.has(value) ? value as DemoId : null
}

function failureCaseFromEnvironment(): FailureCase | undefined {
  const value = process.env['MIRROR_PHASE0_CASE']
  return value === 'cloud-failure' || value === 'core-failure' ? value : undefined
}

function processRoleFromEnvironment(): D4Process | undefined {
  const value = process.env['MIRROR_PHASE0_PROCESS']
  return value === 'A' || value === 'B' ? value : undefined
}

function positiveIntegerFromEnvironment(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function booleanFromEnvironment(name: string): boolean {
  return process.env[name] === '1'
}

function nowIso(): string {
  try {
    return new Date().toISOString()
  } catch {
    return '1970-01-01T00:00:00.000Z'
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function signal(reason: string): never {
  throw { reason } satisfies FailureSignal
}

function failureReason(value: unknown): string {
  if (isRecord(value) && typeof value.reason === 'string' && /^[A-Za-z0-9_=;:+,/?-]{1,128}$/.test(value.reason)) {
    return value.reason
  }
  return 'demo_contract_failed'
}

let markerQueue: Promise<void> = Promise.resolve()

function markerValue(name: string, fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { marker: name, ...fields }
}

function metadataOnly(value: unknown, key: string): boolean {
  if (ALLOWLISTED_HASH_KEYS.has(key)) return typeof value === 'string' && SHA256_HASH_PATTERN.test(value)
  if (PRIVATE_KEY_PATTERN.test(key)) return false
  if (Array.isArray(value)) return value.every((item) => metadataOnly(item, key))
  if (isRecord(value)) return Object.entries(value).every(([childKey, child]) => metadataOnly(child, childKey))
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string'
    && value.length <= 4096
    && !value.includes('\r')
    && !value.includes('\n')
}

function emitMarker(name: string, fields: Readonly<Record<string, unknown>>): void {
  const value = markerValue(name, fields)
  if (!metadataOnly(value, 'marker')) return
  const line = JSON.stringify(value) + '\n'
  markerQueue = markerQueue.then(async () => {
    try {
      await new Promise<void>((resolveWrite) => {
        if (process.stdout.write(line, () => resolveWrite())) return
        process.stdout.once('drain', resolveWrite)
      })
    } catch {
      // The outer CLI maps a missing result marker to a stable process failure.
    }
  })
}

async function flushMarkers(): Promise<void> {
  await markerQueue
}

function contextFromEnvironment(): DemoContext | null {
  const demo = demoIdFromEnvironment()
  const buildCommit = process.env['MIRROR_BUILD_COMMIT']
  const userDataRoot = process.env['MIRROR_PHASE0_USER_DATA_ROOT']
  const userDataDir = process.env['MIRROR_USER_DATA_DIR']
  if (
    demo === null
    || typeof buildCommit !== 'string'
    || buildCommit.trim() === ''
    || typeof userDataRoot !== 'string'
    || typeof userDataDir !== 'string'
  ) return null

  const isolation = resolvePhase0UserDataIsolation(userDataRoot, userDataDir)
  if (!isolation.ok) return null
  return {
    demo,
    failureCase: failureCaseFromEnvironment(),
    buildCommit,
    userDataRoot: isolation.root,
    userDataDir: isolation.userDataDir,
    soakMs: positiveIntegerFromEnvironment('MIRROR_PHASE0_SOAK_MS', 0),
    sampleMs: positiveIntegerFromEnvironment('MIRROR_PHASE0_SAMPLE_MS', 300_000),
    noTimeCompression: booleanFromEnvironment('MIRROR_PHASE0_NO_TIME_COMPRESSION'),
  }
}

async function createFixtureDefaultConfig(userDataDir: string): Promise<string> {
  const raw = await readFile(DEFAULT_CONFIG_PATH, 'utf8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const persona = isRecord(parsed['persona']) ? parsed['persona'] : {}
  const aiModels = isRecord(parsed['aiModels']) ? parsed['aiModels'] : {}
  parsed['schemaVersion'] = 1
  parsed['configVersion'] = 1
  parsed['persona'] = { ...persona, name: FIXTURE_VALUES.persona }
  parsed['aiModels'] = {
    ...aiModels,
    realtimeDialogue: { modelId: FIXTURE_VALUES.realtimeDialogue },
    inputTranscription: { modelId: FIXTURE_VALUES.inputTranscription },
    memoryExtractor: { modelId: FIXTURE_VALUES.memoryExtractor },
  }
  const target = join(userDataDir, FIXTURE_CONFIG_PATH)
  await writeFile(target, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
  return target
}

function makeRuntime(
  context: DemoContext,
  defaultConfigPath: string,
  electron: Phase0ElectronCapabilities,
): DemoRuntimeContext {
  let probeFailure = false
  const mockDraftProbe = context.demo === 'P0-D5'
    ? () => probeFailure
      ? { result: 'failed' as const, reason: 'cause=mock_probe_failed' as const }
      : { result: 'mock_passed' as const, reason: 'cause=all_configured_ids_observed' as const }
    : undefined

  const runtime = bootSequence({
    appVersion: 'phase0-demo',
    buildCommit: context.buildCommit,
    isPackaged: false,
    developerModeOverride: 'enabled',
    telemetryDirectory: join(context.userDataDir, 'telemetry'),
    configDir: join(context.userDataDir, 'config'),
    defaultConfigPath,
    sqlitePath: join(context.userDataDir, 'mirror.sqlite'),
    activationFailureAfterWake: context.demo === 'P0-D2' && context.failureCase === 'cloud-failure',
    completeSleepForDemo: context.demo === 'P0-D1',
    mockDraftProbe,
  })
  return {
    ...context,
    runtime,
    setProbeFailure: (value) => {
      probeFailure = value
    },
    electron,
  }
}

function phaseRecord(
  context: DemoContext,
  result: 'passed' | 'failed',
): Record<string, unknown> {
  return {
    phase: '0',
    demoId: context.demo,
    build: context.buildCommit,
    time: nowIso(),
    result,
    note: `demo=${context.demo};result=${result}`,
  }
}

async function appendRecord(
  context: DemoRuntimeContext,
  result: 'passed' | 'failed',
): Promise<void> {
  const appendResult = context.runtime.appendPhaseTestRecord(phaseRecord(context, result))
  if (!appendResult.ok) signal('phase_record_write_failed')

  const page = await context.runtime.console.getPhaseTests()
  if (!page.ok || page.value.records.length !== 1 || page.value.latest?.demoId !== context.demo) {
    signal('phase_record_read_failed')
  }
  emitMarker('PHASE_RECORD_WRITTEN', {
    phase: '0',
    demoId: context.demo,
    result,
    count: page.value.records.length,
  })
}

async function readModels(context: DemoRuntimeContext): Promise<ConsoleModelsPayload> {
  const response = await context.runtime.console.getModels()
  if (!response.ok) signal('models_unreadable')
  return response.value
}

function publishedSlot(
  models: ConsoleModelsPayload,
  role: 'realtimeDialogue' | 'inputTranscription' | 'memoryExtractor',
): { readonly configVersion: number; readonly fingerprint: string; readonly modelId: string } {
  const card = models.cards.find((candidate) => candidate.role === role)
  if (card === undefined) signal('model_slot_unreadable')
  return card.publishedActive
}

function configConfirmation(diff: ConsoleConfigDiff): Record<string, unknown> {
  return {
    operation: diff.operation,
    expectedActiveVersion: diff.expectedActiveVersion,
    changedPaths: diff.changed.map((entry) => entry.path).slice().sort(),
    nonModelChanges: diff.nonModelChanges,
    confirmationDigest: diff.confirmationDigest,
  }
}

async function publishModels(
  context: DemoRuntimeContext,
  values: Readonly<Record<string, string>>,
): Promise<void> {
  const saved = await context.runtime.console.saveModelDraft(values)
  if (!saved.ok) signal('model_draft_save_failed')
  const tested = await context.runtime.console.testDraft()
  if (!tested.ok || tested.value.result !== 'mock_passed') signal('model_draft_probe_failed')
  const config = await context.runtime.console.getConfig()
  if (!config.ok) signal('config_unreadable')
  const published = await context.runtime.console.publish(configConfirmation(config.value.publishDiff))
  if (!published.ok) signal('config_publish_failed')
}

async function runD1(context: DemoRuntimeContext): Promise<DemoExecutionResult> {
  const observed: string[] = []
  let previous: string | null = null
  const subscription = context.runtime.subscribe((snapshot) => {
    if (snapshot.lifecycle === previous) return
    previous = snapshot.lifecycle
    observed.push(snapshot.lifecycle)
    emitMarker('PHASE_DEMO_STEP', { state: snapshot.lifecycle })
  })

  await context.runtime.ready
  await context.runtime.handleSimulator({ type: 'wake' })
  await context.runtime.handleSimulator({ type: 'sleep' })
  subscription.unsubscribe()

  const expected = ['starting', 'dormant', 'activating', 'active', 'suspending', 'dormant']
  if (JSON.stringify(observed) !== JSON.stringify(expected)) signal('lifecycle_sequence_invalid')
  return {}
}

interface OfflineLoopPageState {
  readonly readyState: number
  readonly paused: boolean
  readonly ended: boolean
  readonly currentTime: number
  readonly loopCount: number
  readonly error: boolean
}

interface OfflineLoopSample {
  readonly elapsedMs: number
  readonly playing: boolean
  readonly nonblack: boolean
  readonly rssBytes: number
  readonly workingSetBytes: number
  readonly heapUsedBytes: number
  readonly mediaCurrentTimeMs: number
  readonly loopCount: number
}

type OfflineLoopMemoryField = 'rssBytes' | 'workingSetBytes' | 'heapUsedBytes'

function removeOneFinalLineEnding(value: string): string {
  if (value.endsWith('\r\n')) return value.slice(0, -2)
  if (value.endsWith('\n')) return value.slice(0, -1)
  return value
}

async function readVerifiedOfflineLoopAsset(): Promise<Buffer> {
  let source: string
  try {
    source = await readFile(OFFLINE_LOOP_ASSET_SOURCE_PATH, 'utf8')
  } catch {
    signal('offline_loop_asset_invalid')
  }

  const encoded = removeOneFinalLineEnding(source)
  if (
    encoded.length === 0
    || /\s/u.test(encoded)
    || !STRICT_BASE64_PATTERN.test(encoded)
  ) signal('offline_loop_asset_invalid')

  let bytes: Buffer
  try {
    bytes = Buffer.from(encoded, 'base64')
  } catch {
    signal('offline_loop_asset_invalid')
  }
  if (
    bytes.toString('base64') !== encoded
    || bytes.byteLength !== OFFLINE_LOOP_ASSET_BYTE_LENGTH
    || createHash('sha256').update(bytes).digest('hex') !== OFFLINE_LOOP_ASSET_SHA256
  ) signal('offline_loop_asset_invalid')
  return bytes
}

function offlineLoopDataPage(asset: Buffer): string {
  const encoded = asset.toString('base64')
  const html = [
    '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';media-src data:;script-src \'unsafe-inline\';style-src \'unsafe-inline\'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}video{display:block;width:100%;height:100%;object-fit:contain}</style></head><body>',
    `<video id="offline-loop-video" width="320" height="180" src="data:video/mp4;base64,${encoded}" autoplay muted playsinline></video>`,
    '<script>(() => { const video = document.getElementById("offline-loop-video"); const state = { loopCount: 0, error: false }; window.__phase0OfflineLoopState = state; if (!(video instanceof HTMLVideoElement)) { state.error = true; return; } video.addEventListener("error", () => { state.error = true; }); video.addEventListener("ended", () => { state.loopCount += 1; video.currentTime = 0; const pending = video.play(); if (pending !== undefined) pending.catch(() => { state.error = true; }); }); const pending = video.play(); if (pending !== undefined) pending.catch(() => { state.error = true; }); })();</script>',
    '</body></html>',
  ].join('')
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

const OFFLINE_LOOP_PAGE_STATE_SCRIPT = `(() => {
  const video = document.getElementById('offline-loop-video')
  const state = window.__phase0OfflineLoopState
  if (!(video instanceof HTMLVideoElement) || state === undefined) return null
  return {
    readyState: video.readyState,
    paused: video.paused,
    ended: video.ended,
    currentTime: video.currentTime,
    loopCount: state.loopCount,
    error: state.error,
  }
})()`

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    ? value
    : null
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null
}

function pageState(value: unknown): OfflineLoopPageState | null {
  if (!isRecord(value)) return null
  const readyState = nonnegativeInteger(value['readyState'])
  const currentTime = value['currentTime']
  const loopCount = nonnegativeInteger(value['loopCount'])
  if (
    readyState === null
    || readyState > 4
    || typeof value['paused'] !== 'boolean'
    || typeof value['ended'] !== 'boolean'
    || typeof currentTime !== 'number'
    || !Number.isFinite(currentTime)
    || currentTime < 0
    || loopCount === null
    || typeof value['error'] !== 'boolean'
  ) return null
  return {
    readyState,
    paused: value['paused'],
    ended: value['ended'],
    currentTime,
    loopCount,
    error: value['error'],
  }
}

function actualMediaPlaying(state: OfflineLoopPageState): boolean {
  return state.readyState >= 2
    && !state.paused
    && !state.ended
    && !state.error
}

async function readOfflineLoopPageState(browserWindow: BrowserWindow): Promise<OfflineLoopPageState> {
  if (browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
    signal('offline_loop_media_unavailable')
  }

  let value: unknown
  try {
    value = await browserWindow.webContents.executeJavaScript(OFFLINE_LOOP_PAGE_STATE_SCRIPT, true)
  } catch {
    signal('offline_loop_media_unavailable')
  }
  const state = pageState(value)
  if (state === null) signal('offline_loop_media_unavailable')
  return state
}

async function waitForOfflineLoopReady(browserWindow: BrowserWindow): Promise<void> {
  const deadline = Date.now() + OFFLINE_LOOP_MEDIA_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await readOfflineLoopPageState(browserWindow)
    if (state.error) signal('offline_loop_media_unavailable')
    if (actualMediaPlaying(state)) return
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, OFFLINE_LOOP_MEDIA_POLL_MS))
  }
  signal('offline_loop_media_unavailable')
}

function frameHasVisibleNonblackPixel(image: NativeImage): boolean {
  try {
    if (image.isEmpty()) return false
    const bitmap = image.toBitmap()
    if (bitmap.byteLength < 4) return false
    for (let index = 0; index + 3 < bitmap.byteLength; index += 4) {
      const blue = bitmap[index]
      const green = bitmap[index + 1]
      const red = bitmap[index + 2]
      const alpha = bitmap[index + 3]
      if (alpha > 0 && (blue > 0 || green > 0 || red > 0)) return true
    }
  } catch {
    return false
  }
  return false
}

async function captureOfflineLoopFrame(browserWindow: BrowserWindow): Promise<boolean> {
  if (browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
    signal('offline_loop_black_frame')
  }
  let image: NativeImage
  try {
    image = await browserWindow.webContents.capturePage(undefined, { stayHidden: true })
  } catch {
    signal('offline_loop_black_frame')
  }
  return frameHasVisibleNonblackPixel(image)
}

async function collectOfflineLoopSample(
  context: DemoRuntimeContext,
  browserWindow: BrowserWindow,
  elapsedMs: number,
): Promise<OfflineLoopSample> {
  const before = await readOfflineLoopPageState(browserWindow)
  if (!actualMediaPlaying(before)) signal('offline_loop_media_stopped')

  const nonblack = await captureOfflineLoopFrame(browserWindow)
  if (!nonblack) signal('offline_loop_black_frame')

  const after = await readOfflineLoopPageState(browserWindow)
  const playing = actualMediaPlaying(after)
  if (!playing) signal('offline_loop_media_stopped')

  const mediaCurrentTimeMs = Math.floor(after.currentTime * 1000)
  if (nonnegativeInteger(mediaCurrentTimeMs) === null) signal('offline_loop_sample_invalid')

  let nodeMemory: NodeJS.MemoryUsage
  try {
    nodeMemory = process.memoryUsage()
  } catch {
    signal('offline_loop_sample_invalid')
  }

  let electronMemory: unknown
  try {
    electronMemory = await context.electron.getProcessMemoryInfo()
  } catch {
    signal('offline_loop_sample_invalid')
  }

  const rssBytes = positiveInteger(nodeMemory.rss)
  const heapUsedBytes = positiveInteger(nodeMemory.heapUsed)
  const residentSet = isRecord(electronMemory)
    ? positiveInteger(electronMemory['residentSet'])
    : null
  const workingSetBytes = residentSet === null ? null : residentSet * 1024
  if (
    rssBytes === null
    || heapUsedBytes === null
    || workingSetBytes === null
    || !positiveInteger(workingSetBytes)
  ) signal('offline_loop_sample_invalid')

  return {
    elapsedMs,
    playing,
    nonblack,
    rssBytes,
    workingSetBytes,
    heapUsedBytes,
    mediaCurrentTimeMs,
    loopCount: after.loopCount,
  }
}

function offlineLoopElapsedSchedule(context: DemoContext): readonly number[] {
  if (context.soakMs <= 0) return [0]
  const elapsedValues = [0]
  let elapsed = 0
  while (elapsed < context.soakMs) {
    const interval = Math.min(context.sampleMs, context.soakMs - elapsed)
    if (interval <= 0) signal('offline_loop_scheduling_invalid')
    elapsed += interval
    elapsedValues.push(elapsed)
  }
  return elapsedValues
}

function validateOfflineLoopMemorySeries(
  samples: readonly OfflineLoopSample[],
  field: OfflineLoopMemoryField,
): void {
  const baseline = samples[0]?.[field]
  if (baseline === undefined) signal('offline_loop_sample_invalid')
  const maximum = Math.max(...samples.map((sample) => sample[field]))
  if (maximum - baseline > Math.max(134_217_728, baseline * 0.25)) {
    signal('offline_loop_memory_growth')
  }
  const strictlyIncreasing = samples.slice(1).every((sample, index) => (
    sample[field] > (samples[index] as OfflineLoopSample)[field]
  ))
  const finalValue = samples[samples.length - 1]?.[field]
  if (strictlyIncreasing && finalValue !== undefined && finalValue - baseline > 134_217_728) {
    signal('offline_loop_memory_growth')
  }
}

function validateOfflineLoopSeries(
  samples: readonly OfflineLoopSample[],
  expectedElapsed: readonly number[],
): void {
  if (samples.length !== expectedElapsed.length) signal('offline_loop_scheduling_invalid')
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] as OfflineLoopSample
    if (sample.elapsedMs !== expectedElapsed[index]) signal('offline_loop_scheduling_invalid')
    if (!sample.playing) signal('offline_loop_media_stopped')
    if (!sample.nonblack) signal('offline_loop_black_frame')
    if (index === 0) continue
    const previous = samples[index - 1] as OfflineLoopSample
    if (sample.loopCount < previous.loopCount) signal('offline_loop_media_not_advancing')
    if (sample.mediaCurrentTimeMs <= previous.mediaCurrentTimeMs && sample.loopCount <= previous.loopCount) {
      signal('offline_loop_media_not_advancing')
    }
  }
  validateOfflineLoopMemorySeries(samples, 'rssBytes')
  validateOfflineLoopMemorySeries(samples, 'workingSetBytes')
  validateOfflineLoopMemorySeries(samples, 'heapUsedBytes')
}

async function emitOfflineLoopSamples(context: DemoRuntimeContext): Promise<void> {
  const asset = await readVerifiedOfflineLoopAsset()
  const expectedElapsed = offlineLoopElapsedSchedule(context)
  const runId = basename(context.userDataDir)
  if (runId === '') signal('offline_loop_sample_invalid')
  let browserWindow: BrowserWindow | null = null
  let failure: string | null = null

  try {
    try {
      browserWindow = context.electron.createBrowserWindow({
        show: false,
        width: 320,
        height: 180,
        paintWhenInitiallyHidden: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          backgroundThrottling: false,
          offscreen: true,
          partition: 'phase0-offline-loop',
        },
      })
    } catch {
      signal('offline_loop_media_unavailable')
    }
    if (browserWindow === null) signal('offline_loop_media_unavailable')
    const probe = browserWindow

    try {
      probe.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      probe.webContents.on('will-navigate', (event) => event.preventDefault())
      probe.webContents.on('will-frame-navigate', (event) => event.preventDefault())
      probe.webContents.on('will-redirect', (event) => event.preventDefault())
      await probe.webContents.loadURL(offlineLoopDataPage(asset))
    } catch {
      signal('offline_loop_media_unavailable')
    }

    await waitForOfflineLoopReady(probe)
    const samples: OfflineLoopSample[] = []
    for (let index = 0; index < expectedElapsed.length; index += 1) {
      if (index > 0 && context.noTimeCompression) {
        const previousElapsed = expectedElapsed[index - 1] as number
        const currentElapsed = expectedElapsed[index] as number
        const waitMs = currentElapsed - previousElapsed
        if (waitMs <= 0) signal('offline_loop_scheduling_invalid')
        await new Promise<void>((resolveWait) => setTimeout(resolveWait, waitMs))
      }
      const sample = await collectOfflineLoopSample(
        context,
        probe,
        expectedElapsed[index] as number,
      )
      samples.push(sample)
      emitMarker('OFFLINE_LOOP_SAMPLE', {
        demoId: context.demo,
        userDataDir: context.userDataDir,
        runId,
        state: 'offlineLoop',
        nonblack: sample.nonblack,
        playing: sample.playing,
        reason: 'cloud_unavailable',
        elapsedMs: sample.elapsedMs,
        rssBytes: sample.rssBytes,
        workingSetBytes: sample.workingSetBytes,
        heapUsedBytes: sample.heapUsedBytes,
        mediaCurrentTimeMs: sample.mediaCurrentTimeMs,
        loopCount: sample.loopCount,
      })
    }

    if (context.soakMs > 0 && context.noTimeCompression) {
      validateOfflineLoopSeries(samples, expectedElapsed)
    }
  } catch (caught) {
    const candidate = failureReason(caught)
    failure = candidate === 'demo_contract_failed'
      ? 'offline_loop_media_unavailable'
      : candidate
  } finally {
    if (browserWindow !== null) {
      try {
        if (!browserWindow.isDestroyed()) browserWindow.destroy()
      } catch {
        if (failure === null) failure = 'offline_loop_media_unavailable'
      }
    }
  }

  if (failure !== null) signal(failure)
}

async function runD2(context: DemoRuntimeContext): Promise<DemoExecutionResult> {
  await context.runtime.ready
  if (context.failureCase === 'cloud-failure') {
    await context.runtime.handleSimulator({ type: 'wake' })
    if (context.runtime.snapshot().lifecycle !== 'offlineLoop') signal('activation_fallback_invalid')
    emitMarker('PHASE_DEMO_STEP', {
      step: 'activation_cloud_failure',
      after: 'WAKE_DETECTED',
      before: 'REALTIME_READY',
      reason: 'cloud_unavailable',
      status: 'degraded',
    })

    await context.runtime.handleSimulator({ type: 'cloud_recovery' })
    await context.runtime.handleSimulator({ type: 'wake' })
    await context.runtime.handleSimulator({ type: 'cloud_failure' })
    if (context.runtime.snapshot().lifecycle !== 'offlineLoop') signal('active_fallback_invalid')
    emitMarker('PHASE_DEMO_STEP', {
      step: 'active_cloud_failure',
      state: 'offlineLoop',
      visible: true,
      nonblack: true,
      reason: 'cloud_unavailable',
      unrelated: 'not_gated',
    })
    await emitOfflineLoopSamples(context)
    return {}
  }

  await context.runtime.handleSimulator({ type: 'sqlite_failure' })
  if (context.runtime.snapshot().lifecycle !== 'maintenance') signal('maintenance_fallback_invalid')
  emitMarker('PHASE_DEMO_STEP', {
    step: 'local_core_failure',
    state: 'maintenance',
    visible: true,
    nonblack: true,
    reason: 'sqlite_open_failed',
    unrelated: 'not_gated',
  })
  return {}
}

async function emitConsoleQueries(
  context: DemoRuntimeContext,
  state: 'offlineLoop' | 'maintenance',
  reason: 'cloud_unavailable' | 'sqlite_open_failed',
): Promise<void> {
  const overview = await context.runtime.console.getOverview()
  if (!overview.ok || overview.value.lifecycle !== state) signal('console_overview_unreadable')
  emitMarker('PHASE_DEMO_STEP', {
    step: 'console_query',
    state,
    view: 'overview',
    status: 'readable',
    lifecycle: overview.value.lifecycle,
    fallback: overview.value.lifecycle,
  })

  const events = await context.runtime.console.getEvents(undefined)
  if (!events.ok) signal('console_events_unreadable')
  const matchingError = events.value.events.find((event) => (
    (event.status === 'failed' || event.status === 'degraded')
    && event.error_code === reason
  ))
  if (matchingError === undefined) signal('console_error_reason_unreadable')
  emitMarker('PHASE_DEMO_STEP', {
    step: 'console_query',
    state,
    view: 'events',
    status: 'readable',
    lastError: matchingError.error_code,
    reason: matchingError.error_code,
  })

  const phaseTests = await context.runtime.console.getPhaseTests()
  const latest = phaseTests.ok ? phaseTests.value.latest : null
  if (!phaseTests.ok || latest === null || latest.result !== 'passed' || phaseTests.value.records.length < 1) {
    signal('console_phase_tests_unreadable')
  }
  emitMarker('PHASE_DEMO_STEP', {
    step: 'console_query',
    state,
    view: 'phase_tests',
    status: 'readable',
    recordStatus: latest.result,
    recordCount: phaseTests.value.records.length,
  })
}

async function runD3(context: DemoRuntimeContext): Promise<DemoExecutionResult> {
  await context.runtime.ready
  await context.runtime.handleSimulator({ type: 'wake' })
  await context.runtime.handleSimulator({ type: 'cloud_failure' })
  await appendRecord(context, 'passed')
  await emitConsoleQueries(context, 'offlineLoop', 'cloud_unavailable')

  await context.runtime.handleSimulator({ type: 'sqlite_failure' })
  if (context.runtime.snapshot().lifecycle !== 'maintenance') signal('maintenance_transition_invalid')
  await emitConsoleQueries(context, 'maintenance', 'sqlite_open_failed')
  return { recordWritten: true }
}

async function runD5(context: DemoRuntimeContext): Promise<DemoExecutionResult> {
  await context.runtime.ready
  const initialModels = await readModels(context)
  emitMarker('PHASE_DEMO_STEP', {
    step: 'fixture_routing',
    realtimeHash: sha256(FIXTURE_VALUES.realtimeDialogue),
    transcriptionHash: sha256(FIXTURE_VALUES.inputTranscription),
    extractorHash: sha256(FIXTURE_VALUES.memoryExtractor),
    personaHash: sha256(FIXTURE_VALUES.persona),
  })

  const beforeInvalid = publishedSlot(initialModels, 'realtimeDialogue')
  const invalidDraft = await context.runtime.console.saveModelDraft({
    realtimeDialogue: '',
    inputTranscription: publishedSlot(initialModels, 'inputTranscription').modelId,
    memoryExtractor: publishedSlot(initialModels, 'memoryExtractor').modelId,
  })
  if (invalidDraft.ok) signal('invalid_draft_accepted')
  const afterInvalid = publishedSlot(await readModels(context), 'realtimeDialogue')
  if (
    beforeInvalid.configVersion !== afterInvalid.configVersion
    || beforeInvalid.fingerprint !== afterInvalid.fingerprint
  ) signal('invalid_draft_replaced_active')
  emitMarker('PHASE_DEMO_STEP', {
    step: 'invalid_draft',
    field: 'realtimeDialogue',
    status: 'rejected',
    reason: 'cause=draft_invalid',
    activePreserved: true,
    versionPreserved: true,
    fingerprintPreserved: true,
    activeVersionBefore: beforeInvalid.configVersion,
    activeVersionAfter: afterInvalid.configVersion,
    activeFingerprintBefore: beforeInvalid.fingerprint,
    activeFingerprintAfter: afterInvalid.fingerprint,
  })

  await context.runtime.createInitialRuntimeSnapshotsForTest()
  context.setProbeFailure(false)
  const successfulProbe = await context.runtime.console.testDraft()
  if (!successfulProbe.ok || successfulProbe.value.result !== 'mock_passed') signal('successful_probe_failed')
  emitMarker('PHASE_DEMO_STEP', {
    step: 'mock_probe',
    probe: 'success',
    result: successfulProbe.value.result,
    source: successfulProbe.value.source,
    reason: successfulProbe.value.reason,
  })

  const beforeFailedProbe = publishedSlot(await readModels(context), 'realtimeDialogue')
  context.setProbeFailure(true)
  const failedProbe = await context.runtime.console.testDraft()
  if (!failedProbe.ok || failedProbe.value.result !== 'failed') signal('failed_probe_not_failed')
  const afterFailedProbe = publishedSlot(await readModels(context), 'realtimeDialogue')
  if (
    beforeFailedProbe.configVersion !== afterFailedProbe.configVersion
    || beforeFailedProbe.fingerprint !== afterFailedProbe.fingerprint
  ) signal('failed_probe_replaced_active')
  emitMarker('PHASE_DEMO_STEP', {
    step: 'mock_probe',
    probe: 'failure',
    result: failedProbe.value.result,
    source: failedProbe.value.source,
    reason: failedProbe.value.reason,
    activePreserved: true,
    versionPreserved: true,
    fingerprintPreserved: true,
    activeVersionBefore: beforeFailedProbe.configVersion,
    activeVersionAfter: afterFailedProbe.configVersion,
    activeFingerprintBefore: beforeFailedProbe.fingerprint,
    activeFingerprintAfter: afterFailedProbe.fingerprint,
  })

  const beforeNext = await readModels(context)
  if (
    beforeNext.runtime.current === null
    || beforeNext.runtime.current.session === null
    || beforeNext.runtime.current.job === null
  ) {
    signal('old_snapshot_missing')
  }
  context.setProbeFailure(false)
  const nextSnapshots = await context.runtime.console.createNextRuntimeSnapshots()
  if (!nextSnapshots.ok || nextSnapshots.value.result !== 'mock_passed') signal('next_snapshot_missing')
  const afterNext = await readModels(context)
  if (
    afterNext.runtime.current === null
    || afterNext.runtime.current.session === null
    || afterNext.runtime.new === null
    || afterNext.runtime.new.session === null
  ) {
    signal('snapshot_boundary_invalid')
  }
  emitMarker('PHASE_DEMO_STEP', {
    step: 'snapshot_boundary',
    oldSession: 'retained',
    oldJob: 'retained',
    next: 'explicit',
  })

  const config = await context.runtime.console.getConfig()
  if (!config.ok) signal('config_unreadable')
  const draft = config.value.draft
  const saved = await context.runtime.console.saveDraft({
    personaName: 'Phase0Rollback',
    voice: draft.voice,
    idleSeconds: draft.idleSeconds,
    wake: { ...draft.wake },
    faceModel: { ...draft.faceModel },
    assets: { ...draft.assets },
    adapters: { ...draft.adapters },
  })
  if (!saved.ok) signal('non_model_draft_failed')
  const testForPublish = await context.runtime.console.testDraft()
  if (!testForPublish.ok || testForPublish.value.result !== 'mock_passed') signal('rollback_setup_probe_failed')
  const publishState = await context.runtime.console.getConfig()
  if (!publishState.ok) signal('publish_diff_unreadable')
  const published = await context.runtime.console.publish(configConfirmation(publishState.value.publishDiff))
  if (!published.ok) signal('rollback_setup_publish_failed')
  const rollbackState = await context.runtime.console.getConfig()
  if (!rollbackState.ok || !rollbackState.value.rollbackDiff.nonModelChanges) signal('rollback_non_model_change_missing')
  const rolledBack = await context.runtime.console.rollback(configConfirmation(rollbackState.value.rollbackDiff))
  if (!rolledBack.ok) signal('rollback_failed')
  emitMarker('PHASE_DEMO_STEP', {
    step: 'rollback',
    operation: 'rollback',
    nonModelChanges: rollbackState.value.rollbackDiff.nonModelChanges,
  })
  return {}
}

async function runSingleDemo(context: DemoRuntimeContext): Promise<number> {
  let recordWritten = false
  let passed = false
  let reason = 'demo_contract_failed'
  try {
    let execution: DemoExecutionResult
    if (context.demo === 'P0-D1') execution = await runD1(context)
    else if (context.demo === 'P0-D2') execution = await runD2(context)
    else if (context.demo === 'P0-D3') execution = await runD3(context)
    else if (context.demo === 'P0-D5') execution = await runD5(context)
    else execution = {}
    recordWritten = execution.recordWritten === true
    if (!recordWritten) {
      await appendRecord(context, 'passed')
      recordWritten = true
    }
    passed = true
  } catch (error) {
    reason = failureReason(error)
  }

  if (!recordWritten) {
    try {
      await appendRecord(context, 'failed')
      recordWritten = true
    } catch {
      // A missing SQLite row is represented by the failed result marker only.
    }
  }

  try {
    await context.runtime.shutdown()
  } catch {
    if (passed) {
      passed = false
      reason = 'shutdown_failed'
    }
  }

  emitMarker('PHASE_DEMO_RESULT', {
    demoId: context.demo,
    result: passed ? 'passed' : 'failed',
    exit: passed ? 0 : 2,
    reason: passed ? 'contract_passed' : reason,
  })
  await flushMarkers()
  return passed ? 0 : 2
}

async function publishD4Config(context: DemoRuntimeContext): Promise<void> {
  await publishModels(context, {
    realtimeDialogue: 'phase0-reopen-realtime',
    inputTranscription: 'phase0-reopen-transcription',
    memoryExtractor: 'phase0-reopen-extractor',
  })
}

async function runD4A(context: DemoRuntimeContext): Promise<number> {
  let recordWritten = false
  let passed = false
  let reason = 'reopen_process_a_failed'
  let shutdownCount = 0
  try {
    await context.runtime.ready
    await publishD4Config(context)
    emitMarker('PHASE_DEMO_STEP', {
      process: 'A',
      action: 'publish_config',
      status: 'success',
      userDataDir: context.userDataDir,
    })
    await appendRecord(context, 'passed')
    recordWritten = true
    emitMarker('PHASE_DEMO_STEP', {
      process: 'A',
      action: 'append_phase_record',
      count: 1,
      status: 'success',
      userDataDir: context.userDataDir,
    })
    context.runtime.telemetry.emit(ALLOWLISTED_REOPEN_EVENT)
    emitMarker('PHASE_DEMO_STEP', {
      process: 'A',
      action: 'emit_reopen_probe',
      count: 1,
      ...ALLOWLISTED_REOPEN_EVENT,
      userDataDir: context.userDataDir,
    })
    shutdownCount += 1
    await context.runtime.shutdown()
    emitMarker('PHASE_DEMO_STEP', {
      process: 'A',
      action: 'shutdown',
      flushCount: 1,
      closeCount: 1,
      userDataDir: context.userDataDir,
    })
    passed = true
  } catch (error) {
    reason = failureReason(error)
  }

  if (!recordWritten) {
    try {
      await appendRecord(context, 'failed')
    } catch {
      // The parent maps the absent record to a process-contract failure.
    }
  }
  if (shutdownCount === 0) {
    try {
      await context.runtime.shutdown()
    } catch {
      reason = 'shutdown_failed'
    }
  }
  await flushMarkers()
  if (!passed) emitMarker('PHASE_DEMO_RESULT', {
    demoId: context.demo,
    result: 'failed',
    exit: 2,
    reason,
  })
  await flushMarkers()
  return passed ? 0 : 2
}

async function parseAllowlistedTelemetryEvent(userDataDir: string): Promise<boolean> {
  try {
    const path = join(userDataDir, 'telemetry', TELEMETRY_FILE_NAME)
    const contents = await readFile(path, 'utf8')
    if (Buffer.byteLength(contents, 'utf8') > MAX_REOPEN_TELEMETRY_BYTES) return false
    const lines = contents.split(/\r?\n/)
    if (lines.length > MAX_REOPEN_TELEMETRY_LINES) return false
    let matches = 0
    for (const line of lines) {
      if (line.trim() === '') continue
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch {
        continue
      }
      if (!isRecord(value)) continue
      if (
        value['module'] === ALLOWLISTED_REOPEN_EVENT.module
        && value['event'] === ALLOWLISTED_REOPEN_EVENT.event
        && value['status'] === ALLOWLISTED_REOPEN_EVENT.status
        && value['source'] === ALLOWLISTED_REOPEN_EVENT.source
        && value['reason'] === ALLOWLISTED_REOPEN_EVENT.reason
      ) matches += 1
    }
    return matches === 1
  } catch {
    return false
  }
}

async function runD4B(context: DemoRuntimeContext): Promise<number> {
  let passed = false
  let reason = 'reopen_process_b_failed'
  try {
    await context.runtime.ready
    const config = await context.runtime.console.getModels()
    const phaseTests = await context.runtime.console.getPhaseTests()
    const configReadable = config.ok && config.value.cards.length === 3
    const phaseRecordReadable = phaseTests.ok
      && phaseTests.value.records.length === 1
      && phaseTests.value.latest?.demoId === 'P0-D4'
    const eventReadable = await parseAllowlistedTelemetryEvent(context.userDataDir)
    if (!configReadable || !phaseRecordReadable || !eventReadable) signal('reopen_data_unreadable')
    emitMarker('PHASE_DEMO_STEP', {
      process: 'B',
      action: 'reopen',
      config: 'readable',
      phaseRecord: 'readable',
      event: 'readable',
      userDataDir: context.userDataDir,
    })
    await context.runtime.shutdown()
    emitMarker('PHASE_REOPEN_RESULT', {
      config: 'readable',
      phaseRecord: 'readable',
      event: 'readable',
      userDataDir: context.userDataDir,
    })
    passed = true
  } catch (error) {
    reason = failureReason(error)
    try {
      await context.runtime.shutdown()
    } catch {
      reason = 'shutdown_failed'
    }
  }
  await flushMarkers()
  if (!passed) emitMarker('PHASE_DEMO_RESULT', {
    demoId: context.demo,
    result: 'failed',
    exit: 2,
    reason,
  })
  await flushMarkers()
  return passed ? 0 : 2
}

/** Entry invoked by the local Electron child process. */
export async function runPhase0DemoFromElectron(
  electron: Phase0ElectronCapabilities,
): Promise<number> {
  const app = electron.app
  const demo = demoIdFromEnvironment()
  const isolation = applyPhase0UserDataPath({
    app,
    demo: process.env['MIRROR_PHASE0_DEMO'],
    smoke: false,
    userDataRoot: process.env['MIRROR_PHASE0_USER_DATA_ROOT'],
    userDataDir: process.env['MIRROR_USER_DATA_DIR'],
  })
  if (demo === null || !isolation.ok) {
    if (demo !== null) emitMarker('PHASE_DEMO_RESULT', {
      demoId: demo,
      result: 'failed',
      exit: 2,
      reason: 'user_data_isolation_invalid',
    })
    await flushMarkers()
    return 2
  }

  const baseContext = contextFromEnvironment()
  if (baseContext === null) {
    emitMarker('PHASE_DEMO_RESULT', {
      ...(demo === null ? {} : { demoId: demo }),
      result: 'failed',
      exit: 2,
      reason: 'user_data_isolation_invalid',
    })
    await flushMarkers()
    return 2
  }

  const processRole = processRoleFromEnvironment()
  if (!(baseContext.demo === 'P0-D4' && processRole === 'B')) {
    emitMarker('PHASE_DEMO_START', {
      demoId: baseContext.demo,
      userDataDir: baseContext.userDataDir,
    })
  }

  let defaultConfigPath = DEFAULT_CONFIG_PATH
  try {
    if (baseContext.demo === 'P0-D5') defaultConfigPath = await createFixtureDefaultConfig(baseContext.userDataDir)
    await app.whenReady()
    const context = makeRuntime(baseContext, defaultConfigPath, electron)
    if (baseContext.demo === 'P0-D4' && processRole === 'A') return await runD4A(context)
    if (baseContext.demo === 'P0-D4' && processRole === 'B') return await runD4B(context)
    return await runSingleDemo(context)
  } catch {
    emitMarker('PHASE_DEMO_RESULT', {
      demoId: baseContext.demo,
      result: 'failed',
      exit: 2,
      reason: 'source_runtime_failed',
    })
    await flushMarkers()
    return 2
  }
}
