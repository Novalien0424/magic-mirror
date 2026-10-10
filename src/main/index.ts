import { allowPromptWindow } from '../shared/prompt-window'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { readFile, readdir, writeFile, open } from 'node:fs/promises'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  MenuItem,
  powerSaveBlocker,
  protocol,
  screen,
  systemPreferences,
  utilityProcess,
  type WebContents,
} from 'electron'
import { BOOT_RENDERER_READY_CHANNEL, type MirrorWindowKind } from '../shared/bridge'
import type { LifecycleState } from '../shared/types'
import type { ImportedMedia, MediaImportEntry } from '../shared/media-import'
import { createVoicePreviewLease, type VoicePreviewLease } from './realtime/voice-preview'
import { createMemoryRepository, unavailableMemoryRepository } from './memory/repository'
import { createMemoryEmbedder } from './memory/embedding'
import { createMemoryExtractor } from './memory/extractor'
import { createMemoryInterpreter } from './memory/intent'
import { createMemoryConsolidator } from './memory/consolidator'
import { MemoryLearning } from './memory/learning'
import { MemoryIndexer } from './memory/indexer'
import { MemoryImporter } from './memory/import'
import { runMemoryLiveQa } from './memory/live-qa'
import { registerMemoryIpc } from './memory/ipc'
import { bootSequence, type BootRuntime } from './boot'
import { initializeAudioPreferences, getAudioPreferences } from './audio-preferences'
import { createCrashRecovery } from './crash-recovery'
import { startCameraTracking, type CameraTrackingService } from './camera/tracker'
import {
  chooseMirrorDisplay,
  parseMirrorDisplayMatch,
  planInitialPlacement,
  planRehome,
  type DisplayInfo,
  type DisplayMarker,
  type DisplayTrigger,
  type MirrorPlacement,
  type Rect
} from './display-target'
import { createDisplaySleepBlocker, type DisplaySleepBlocker, type DisplaySleepBlockerEvent } from './display-sleep-blocker'
import { monitorTvPresence, parseTvHost, probeTvEthernet } from './tv-presence'
import { createEnvironmentCredentialSource } from './environment-credential-source'
import {
  dispatchMirrorRealtimeRuntimeCommand,
  publishSnapshot,
  registerIpcHandlers,
  authorizeSender,
  type SceneRuntimeControl,
} from './ipc'
import { formatMarker, marker, type MarkerFields } from './log'
import { applyPhase0UserDataPath } from './phase0-demo-runner'
import {
  createPhase1LiveSmokeCoordinator,
  matchesPhase1LiveSmokeProvenance,
  type Phase1LiveSmokeCoordinator,
  type Phase1LiveSmokeResult,
} from './phase1-live-smoke'
import {
  createClientSecretBroker,
  type ClientSecretBrokerEventSink,
} from './realtime/client-secret-broker'
import { evaluateSmoke, parseSmokeMode } from './smoke'
import { loadWakeModelPackage } from './wake/model-package'
import {
  createWakeSupervisor,
  type WakeSupervisor,
  type WakeWorkerChild,
} from './wake/supervisor'
import type { WakeWorkerPackage } from './wake/protocol'
import { createWakeConversationActivation } from './wake/conversation-activation'
import { selectPortraitDisplay } from './portrait-display'
import { validateCubismModelBundle } from './avatar/model-bundle'
import { importAvatarModel, verifyAvatarModel, safeAvatarFile, listAvatarModels, saveAvatarModelLabel } from './avatar/model-import'
import type { AvatarModel } from '../shared/avatar-profiles'
import { importManagedMusicAsset } from './scenes/music-assets'
import { MediaFolders } from './avatar/media-folders'
import { createVisualAssetManager, createVisualPlaybackVerifier, verifyManagedVisualAsset } from './scenes/visual-assets'
import { serveMediaFile } from './scenes/media-file-response'
import { runPhase4Qa } from './phase4-qa'
import { configureVideoDecoding } from './video-decoding-policy'
import { createWakeWorkerPackage, wakeTuningIsActive } from './wake/runtime-config'
import { createWakeCalibration } from './wake/calibration'
import { needsWakeMicrophonePermission, requestWakeMicrophonePermission } from './wake/microphone-permission'
import { createYoutubePlayer } from './avatar/youtube-player'
import { createYoutubeCredentialSource, createYoutubeSearch } from './avatar/youtube-search'

const isDarwin = process.platform === 'darwin'
let cameraTracking: CameraTrackingService | null = null
let cameraStopping = false
const CONSOLE_SHORTCUT = 'CommandOrControl+Shift+D'
/** Never let a stalled stdout pipe turn a smoke run into a hang. */
const EXIT_FLUSH_TIMEOUT_MS = 500
const phase1LiveSmokeEnabled = process.env['MIRROR_PHASE1_LIVE_SMOKE'] === '1'
const phase4QaEnabled = process.env['MIRROR_PHASE4_QA'] === '1'

// A kiosk wake/Console command has no click inside the mirror renderer. Permit
// those trusted Main-routed actions to start the local output graph.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
const videoDecodingReason = configureVideoDecoding(process.platform, name => app.commandLine.appendSwitch(name))
protocol.registerSchemesAsPrivileged([{
  scheme: 'magic-mirror-media',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}])

if (phase1LiveSmokeEnabled) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

const smokeMode = parseSmokeMode(process.env['MIRROR_SMOKE_MS'])
const phase0UserDataPath = applyPhase0UserDataPath({
  app,
  demo: process.env['MIRROR_PHASE0_DEMO'],
  smoke: smokeMode.kind === 'on' || phase1LiveSmokeEnabled || phase4QaEnabled,
  userDataRoot: process.env['MIRROR_PHASE0_USER_DATA_ROOT'],
  userDataDir: process.env['MIRROR_USER_DATA_DIR'],
})
/** In smoke mode the windows load but stay off-screen so repeated runs do not hijack the desktop. */
const hideWindowsForSmoke = smokeMode.kind === 'on' && !phase4QaEnabled
  || phase4QaEnabled && process.env['MIRROR_PHASE4_QA_EDITOR'] === '1'

/**
 * `MIRROR_DISPLAY=<label substring>` pins the Mirror to that display (e.g. `T749`, the
 * portrait HDMI panel) and follows it across unplug/replug. Unset keeps the incoming
 * portrait-display selection, with primary fallback and no display listeners.
 */
const mirrorDisplayMatch = parseMirrorDisplayMatch(process.env['MIRROR_DISPLAY'])
/** Displays settle in bursts after a replug (added, then rotation via metrics-changed). */
const DISPLAY_SETTLE_MS = 750
let mirrorPlacement: MirrorPlacement | null = null
/** Mirror windows that went through their first placement; anything else is still loading. */
const placedMirrors = new WeakSet<BrowserWindow>()
let displaySettleTimer: NodeJS.Timeout | null = null
let tvPresence: ReturnType<typeof monitorTvPresence> | undefined

/**
 * Smoke-contract hook: `MIRROR_FORCE_RENDERER_CRASH=<n>` crashes the next n mirror
 * renderers, so recreate-once and the give-up branch are both testable end to end.
 */
let forcedCrashesLeft = Math.max(0, Number.parseInt(process.env['MIRROR_FORCE_RENDERER_CRASH'] ?? '', 10) || 0)

const windows = new Map<MirrorWindowKind, BrowserWindow>()
/** Per-webContents so a recreated window reports readiness again. */
const readyReported = new WeakSet<WebContents>()
const crashRecovery = createCrashRecovery()

/** Smoke-only state: Main lifecycle is projected only after the current mirror is ready. */
const boot: { lifecycle: LifecycleState; loaded: Record<MirrorWindowKind, boolean> } = {
  lifecycle: 'starting',
  loaded: { mirror: false, console: false }
}
let mainLifecycle: LifecycleState = 'starting'
let mirrorRendererReady = false
let displaySleepBlocker: DisplaySleepBlocker | null = null
let bootRuntime: BootRuntime | null = null
let sceneRuntimeControl: SceneRuntimeControl | null = null
let phase1LiveSmokeCoordinator: Phase1LiveSmokeCoordinator | null = null
const phase4QaReadyKinds = new Set<MirrorWindowKind>()
let phase4QaStarted = false
let memoryPipelineQa: ((evidence: (step: string) => void) => Promise<void>) | undefined
let wakeSupervisor: WakeSupervisor | null = null
let wakeCalibration: ReturnType<typeof createWakeCalibration> | null = null
let shutdownPromise: Promise<void> | null = null
let shutdownMemory: (() => Promise<void>) | undefined
let willQuitHandled = false
let quitResourcesStopped = false
let appQuitFinalizationStarted = false

type RendererEntry = { readonly from: 'dev-server'; readonly url: string } | { readonly from: 'file'; readonly file: string }

function rendererEntry(kind: MirrorWindowKind): RendererEntry {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer !== undefined && devServer !== '') return { from: 'dev-server', url: `${devServer}/${kind}/index.html` }
  return { from: 'file', file: join(__dirname, `../renderer/${kind}/index.html`) }
}

function resolveOfflineLoopAssetPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked/out/renderer/mock/offline-loop-v1.mp4')
  }
  return resolve(__dirname, '../../resources/generated/mock/offline-loop-v1.mp4')
}

function wakeModelRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'wake-models')
    : join(app.getAppPath(), 'resources', 'wake-models')
}

function avatarModelRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'renderer', 'avatar', 'Ren')
    : join(app.getAppPath(), 'resources', 'avatar', 'Ren')
}

async function configureAvatarRuntime(runtime: BootRuntime): Promise<void> {
  const root = avatarModelRoot()
  try {
    const [manifestSource, entries] = await Promise.all([
      readFile(join(root, 'Ren.model3.json'), 'utf8'),
      readdir(root, { recursive: true, withFileTypes: true }),
    ])
    const files = new Set(entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name)
        .slice(root.length + 1)
        .replaceAll('\\', '/')))
    const result = validateCubismModelBundle({
      model3: JSON.parse(manifestSource) as unknown,
      files,
    })
    await runtime.setAvatarRuntimeStatus(
      result.ok ? 'ready' : 'degraded',
      result.ok ? 'avatar_bundle_validated' : result.reason,
    )
  } catch {
    await runtime.setAvatarRuntimeStatus('degraded', 'avatar_bundle_unavailable')
  }
}

function spawnWakeWorker(): WakeWorkerChild {
  const child = utilityProcess.fork(resolve(__dirname, 'wake-worker.js'), [], {
    serviceName: 'Magic Mirror Wake Listener',
  })
  return {
    postMessage: (command) => child.postMessage(command),
    on(event, listener) {
      if (event === 'message') child.on('message', listener)
      else child.on('exit', (code) => listener(code))
    },
    kill: () => child.kill(),
  }
}

let wakeConfigurationTask: Promise<void> = Promise.resolve()
let configuredWakeSignature = ''
function configureWakeRuntime(runtime: BootRuntime): Promise<void> {
  const wasCalibrating = wakeCalibration?.isActive()
  const stopped = wakeCalibration?.stop(false)
  wakeConfigurationTask = wakeConfigurationTask.catch(() => undefined).then(async () => {
    await stopped
    if (wasCalibrating) configuredWakeSignature = ''
    await applyWakeRuntimeConfig(runtime)
  })
  return wakeConfigurationTask
}

async function applyWakeRuntimeConfig(runtime: BootRuntime): Promise<void> {
  if (
    typeof runtime.getPublishedWakeConfigForRuntime !== 'function'
    || typeof runtime.setWakeRuntimeStatus !== 'function'
  ) return
  let wake: Awaited<ReturnType<BootRuntime['getPublishedWakeConfigForRuntime']>>
  try {
    wake = await runtime.getPublishedWakeConfigForRuntime()
  } catch {
    await runtime.setWakeRuntimeStatus('failed', 'wake_config_unavailable')
    return
  }
  if (wake.tuning?.enabled === true && wake.tuning.phrase !== wake.phrase) {
    runtime.telemetry.emit({ module: 'wake', event: 'wake_tuning_ignored', status: 'degraded',
      reason: 'phrase_binding_mismatch', source: 'runtime' })
  }
  const signature = JSON.stringify(wake)
  if (signature === configuredWakeSignature) return
  const requiresMicrophonePermission = needsWakeMicrophonePermission({ platform: process.platform,
    smoke: smokeMode.kind === 'on', isolatedQa: phase4QaEnabled || phase1LiveSmokeEnabled,
    nativeWakeQa: phase4QaEnabled && process.env['MIRROR_RAVEN_CONVERSATION_QA'] === '1' })
  if (requiresMicrophonePermission && systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
    await runtime.setWakeRuntimeStatus('degraded', 'wake_microphone_permission_required')
  }
  const permission = await requestWakeMicrophonePermission({
    required: requiresMicrophonePermission,
    request: () => systemPreferences.askForMediaAccess('microphone'),
    stopping: () => shutdownPromise !== null || appQuitFinalizationStarted,
  })
  if (permission === 'stopped') return
  if (permission !== 'granted') {
    await wakeSupervisor?.release()
    configuredWakeSignature = ''
    await runtime.setWakeRuntimeStatus('degraded', permission === 'denied'
      ? 'wake_microphone_permission_denied' : 'wake_microphone_permission_unavailable')
    return
  }
  const loaded = await loadWakeModelPackage({
    rootDirectory: wakeModelRoot(),
    wake,
    platform: `${process.platform}-${process.arch}`,
    customKeywordsDirectory: join(app.getPath('userData'), 'wake-keywords'),
    forceCustomKeywords: wakeTuningIsActive(wake),
  })
  if (!loaded.ok) {
    await wakeSupervisor?.release()
    configuredWakeSignature = ''
    await runtime.setWakeRuntimeStatus('degraded', loaded.reason)
    return
  }

  const workerPackage: WakeWorkerPackage = createWakeWorkerPackage(loaded, wake)
  if (shutdownPromise !== null || appQuitFinalizationStarted) return
  if (wakeSupervisor !== null) {
    const released = await wakeSupervisor.release()
    if (released.status !== 'success') return
    const updated = await wakeSupervisor.updateConfig({ package: workerPackage })
    if (updated.status !== 'success') return
    configuredWakeSignature = signature
    if (runtime.snapshot().lifecycle === 'dormant' || runtime.snapshot().lifecycle === 'offlineLoop') {
      await wakeSupervisor.acquire()
    }
    return
  }
  let activation: ReturnType<typeof createWakeConversationActivation> | null = null
  const supervisor = createWakeSupervisor({
    spawn: spawnWakeWorker,
    onWake: () => {
      void activation?.handleWake()
    },
    onStatus: (snapshot) => {
      const moduleStatus = snapshot.status === 'failed' || snapshot.input.recovery?.state === 'failed'
        ? 'failed'
        : snapshot.status === 'starting' || snapshot.status === 'stopped' || snapshot.status === 'acquiring' || snapshot.input.recovery?.state === 'restarting'
          ? 'degraded'
          : 'ready'
      const healthReason = snapshot.input.recovery?.state === 'failed' ? snapshot.input.recovery.reason
        : snapshot.input.recovery?.state === 'restarting' ? 'wake_worker_restarting' : snapshot.reason
      void runtime.setWakeRuntimeStatus(moduleStatus, healthReason ?? `wake_worker_${snapshot.status}`)
    },
  })
  activation = createWakeConversationActivation({
    getLifecycle: () => runtime.snapshot().lifecycle,
    beforeStart: async () => { await sceneRuntimeControl?.stopAll() },
    startConversation: () => runtime.manualStart(),
    reacquireWake: () => supervisor.acquire(),
  })
  wakeSupervisor = supervisor
  const started = await supervisor.start({ package: workerPackage })
  if (started.status === 'failed') return
  configuredWakeSignature = signature
  if (runtime.snapshot().lifecycle === 'dormant' || runtime.snapshot().lifecycle === 'offlineLoop') {
    await supervisor.acquire()
  }
}

function selectMirrorDisplay(
  displays: readonly Electron.Display[],
  primaryDisplayId: number,
): Electron.Display | null {
  if (mirrorDisplayMatch === undefined) return selectPortraitDisplay(displays, primaryDisplayId)
  const choice = chooseMirrorDisplay(
    displays.map(display => ({ ...display, primary: display.id === primaryDisplayId })),
    mirrorDisplayMatch,
  )
  return choice.reason === 'match'
    ? displays.find(display => display.id === choice.display.id) ?? null
    : null
}

function windowOptions(kind: MirrorWindowKind): Electron.BrowserWindowConstructorOptions {
  const shared: Electron.BrowserWindowConstructorOptions = {
    show: false,
    webPreferences: {
      preload: join(__dirname, `../preload/${kind}.js`),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  }

  if (kind === 'console') {
    return { ...shared, width: 1100, height: 760, title: 'Magic Mirror Console', backgroundColor: '#101418' }
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const mirrorDisplay = selectMirrorDisplay(screen.getAllDisplays(), primaryDisplay.id)
  const mirrorBounds = mirrorDisplay?.bounds

  return {
    ...shared,
    ...(mirrorBounds ?? { width: 1280, height: 800 }),
    frame: false,
    backgroundColor: '#000000',
    // macOS kiosk uses pre-Lion fullscreen (no Space transition); the Windows dev
    // machine gets a maximized frameless window instead.
    ...(isDarwin ? { simpleFullscreen: true, alwaysOnTop: true } : {}),
    webPreferences: { ...shared.webPreferences, backgroundThrottling: false }
  }
}

function createWindow(kind: MirrorWindowKind): BrowserWindow {
  const win = new BrowserWindow(windowOptions(kind))
  windows.set(kind, win)
  boot.loaded[kind] = false
  if (kind === 'mirror') {
    mirrorRendererReady = false
    boot.lifecycle = 'starting'
  }

  win.webContents.setWindowOpenHandler(({ url, frameName }) => allowPromptWindow(kind, url, frameName)
    ? { action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 800, minWidth: 600,
        minHeight: 450, backgroundColor: '#101418', autoHideMenuBar: true } }
    : { action: 'deny' })
  win.webContents.on('did-create-window', child => {
    // about:blank inherits the sandbox and isolation. Its sender is deliberately
    // absent from `windows`: all privileged Console IPC remains unauthorized.
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    child.webContents.on('will-navigate', event => event.preventDefault())
    child.webContents.on('will-frame-navigate', event => event.preventDefault())
  })
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  win.webContents.on('did-finish-load', () => {
    boot.loaded[kind] = true
    marker('WINDOW_LOADED', { window: kind })
    if (kind === 'mirror' && forcedCrashesLeft > 0) {
      forcedCrashesLeft -= 1
      // Next tick: crashing inside the load event confuses Electron's own teardown.
      setImmediate(() => {
        marker('FORCED_RENDERER_CRASH', { window: kind, reason: 'mirror_force_renderer_crash' })
        win.webContents.forcefullyCrashRenderer()
      })
    }
  })

  win.webContents.on('did-fail-load', (_event, errorCode, _errorDescription) => {
    marker('WINDOW_LOAD_FAILED', { window: kind, error_code: errorCode, reason: 'window_load_failed' })
  })

  win.webContents.on('preload-error', (_event, preloadPath, _error) => {
    // No silent failure: a preload that threw means a renderer with no bridge.
    marker('PRELOAD_ERROR', { window: kind, file: basename(preloadPath), reason: 'preload_exception' })
  })

  win.once('closed', () => {
    if (windows.get(kind) === win) windows.delete(kind)
    if (kind === 'mirror') void sceneRuntimeControl?.stopAll()
  })

  // The mirror is the visitor-facing glass: show it as soon as it can paint.
  // The console stays hidden until Ctrl+Shift+D.
  if (kind === 'mirror') {
    win.once('ready-to-show', () => {
      if (hideWindowsForSmoke) {
        marker('WINDOW_KEPT_HIDDEN', { window: kind, reason: 'smoke_mode' })
        return
      }
      if (!placeMirrorInitially(win)) return
      if (isDarwin) win.setSimpleFullScreen(true)
      else win.maximize()
      win.show()
      raiseMirrorAboveMenuBar(win)
      marker('WINDOW_SHOWN', {
        window: kind,
        mode: isDarwin ? 'simple_fullscreen' : 'maximized',
        ...(isDarwin ? { level: MIRROR_WINDOW_LEVEL } : {})
      })
      if (bootRuntime !== null) startPhase4QaIfReady(bootRuntime)
    })
  }

  const entry = rendererEntry(kind)
  const phase4QaQuery = phase4QaEnabled && kind === 'mirror' ? { phase4Qa: '1' } : undefined
  if (entry.from === 'dev-server') {
    const url = new URL(entry.url)
    if (phase4QaQuery !== undefined) url.searchParams.set('phase4Qa', phase4QaQuery.phase4Qa)
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(entry.file, phase4QaQuery === undefined ? undefined : { query: phase4QaQuery })
  }

  return win
}

function emitDisplayMarker(m: DisplayMarker): void {
  marker(m.name, m.fields)
}

function displaySnapshot(): DisplayInfo[] {
  try {
    const primaryId = screen.getPrimaryDisplay().id
    return screen
      .getAllDisplays()
      .map((d) => ({ id: d.id, label: d.label, bounds: d.bounds, primary: d.id === primaryId }))
  } catch {
    // Treat unavailable display metadata as "no displays" without logging raw errors.
    marker('MIRROR_DISPLAY_QUERY_FAILED', { reason: 'display_query_failed' })
    return []
  }
}

/**
 * Before the first show: move onto the chosen display; fullscreen + show are the caller's.
 * Returns false when the window must stay hidden (recreated while its target is missing).
 */
function placeMirrorInitially(win: BrowserWindow): boolean {
  if (mirrorDisplayMatch === undefined) return true
  const plan = planInitialPlacement(
    chooseMirrorDisplay(displaySnapshot(), mirrorDisplayMatch),
    mirrorDisplayMatch,
    mirrorPlacement
  )
  emitDisplayMarker(plan.marker)
  mirrorPlacement = plan.placement
  placedMirrors.add(win)
  if (plan.action === 'hide') return false
  if (plan.display !== null) moveMirrorWindow(win, plan.display.bounds)
  return true
}

/**
 * simpleFullscreen hides the menu bar only while this app is frontmost; the operator's
 * apps (or any focus-stealing dialog) would draw their menu bar over the top of the glass.
 * The screen-saver level (1000) sits above the menu bar (24). Toggling simple fullscreen
 * can reset the level, so this is re-asserted after every show/move. Mirror only — the
 * console window is left alone.
 */
const MIRROR_WINDOW_LEVEL = 'screen-saver'
function raiseMirrorAboveMenuBar(win: BrowserWindow): void {
  if (isDarwin) win.setAlwaysOnTop(true, MIRROR_WINDOW_LEVEL)
}

/** A fullscreen window cannot change displays: leave fullscreen, move, re-enter. */
function moveMirrorWindow(win: BrowserWindow, bounds: Rect): void {
  if (isDarwin) {
    if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false)
    win.setBounds(bounds)
    win.setSimpleFullScreen(true)
    raiseMirrorAboveMenuBar(win)
    return
  }
  if (win.isMaximized()) win.unmaximize()
  win.setBounds(bounds)
  win.maximize()
}

function rehomeMirror(trigger: DisplayTrigger): void {
  const win = windows.get('mirror')
  if (win === undefined || win.isDestroyed() || !placedMirrors.has(win)) {
    // Not placed yet (first load or being recreated): its own ready-to-show placement runs.
    // A window we deliberately hid for a missing target IS placed and proceeds.
    marker('MIRROR_DISPLAY_REHOME_SKIPPED', { reason: 'mirror_not_shown', trigger })
    return
  }

  const decision = planRehome(mirrorPlacement, chooseMirrorDisplay(displaySnapshot(), mirrorDisplayMatch), mirrorDisplayMatch, trigger)
  emitDisplayMarker(decision.marker)
  switch (decision.action) {
    case 'none':
      return
    case 'hide':
      // Not destroyed: the renderer keeps running (backgroundThrottling is off) for the return.
      win.hide()
      break
    case 'move':
      moveMirrorWindow(win, decision.display.bounds)
      break
    case 'move_and_show':
      moveMirrorWindow(win, decision.display.bounds)
      win.show()
      raiseMirrorAboveMenuBar(win)
      if (bootRuntime !== null) startPhase4QaIfReady(bootRuntime)
      break
  }
  mirrorPlacement = decision.placement
}

function scheduleRehome(trigger: DisplayTrigger): void {
  if (displaySettleTimer !== null) clearTimeout(displaySettleTimer)
  displaySettleTimer = setTimeout(() => {
    displaySettleTimer = null
    rehomeMirror(trigger)
  }, DISPLAY_SETTLE_MS)
}

/** Only when a target is configured and windows are really on screen (never in smoke mode). */
function watchMirrorDisplay(): void {
  if (mirrorDisplayMatch === undefined || hideWindowsForSmoke) return
  screen.on('display-added', () => scheduleRehome('display-added'))
  screen.on('display-removed', () => scheduleRehome('display-removed'))
  screen.on('display-metrics-changed', () => scheduleRehome('display-metrics-changed'))
}

/** Task 1 interface: both Phase 0 windows, created in one call. */
export function createWindows(): void {
  createWindow('mirror')
  createWindow('console')
}

function windowKindOf(sender: WebContents): MirrorWindowKind | null {
  for (const [kind, win] of windows) {
    if (!win.isDestroyed() && win.webContents === sender) return kind
  }
  return null
}

function onRendererReady(sender: WebContents): void {
  // Authorization comes from the sender's identity, never from a renderer-supplied value.
  const kind = windowKindOf(sender)
  if (kind === null) {
    marker('IPC_SENDER_REJECTED', { channel: BOOT_RENDERER_READY_CHANNEL, reason: 'unknown_sender' })
    return
  }

  // React StrictMode replays mount effects in dev; readiness is idempotent state,
  // so the repeat is collapsed rather than logged twice.
  if (readyReported.has(sender)) return
  readyReported.add(sender)

  marker('RENDERER_READY', { window: kind })
  if (kind === 'mirror') {
    mirrorRendererReady = true
    boot.lifecycle = mainLifecycle
  }
}

function onRenderProcessGone(contents: WebContents, details: Electron.RenderProcessGoneDetails): void {
  const kind = windowKindOf(contents)
  if (kind === null) {
    marker('RENDERER_GONE_UNTRACKED', { reason: details.reason })
    return
  }

  if (kind === 'mirror') void sceneRuntimeControl?.stopAll()

  const decision = crashRecovery.decide({ window: kind, reason: details.reason, exitCode: details.exitCode })
  if (decision.action === 'ignore') return

  marker('RENDERER_GONE', { window: kind, reason: details.reason, exit_code: details.exitCode })

  if (decision.action === 'give_up') {
    // The supervisor (macOS LaunchAgent KeepAlive) owns app restarts; do not relaunch in-app.
    exitWithMarker('APP_EXIT', { code: 1, window: kind, attempts: decision.attempt, reason: decision.reason }, 1)
    return
  }

  // Build the replacement before disposing of the corpse so no moment has zero windows.
  const stale = windows.get(kind)
  const wasVisible = stale !== undefined && !stale.isDestroyed() && stale.isVisible()
  const replacement = createWindow(kind)
  if (stale !== undefined && !stale.isDestroyed()) stale.destroy()
  // A window the operator had open must come back, not silently disappear.
  // The mirror re-shows itself from 'ready-to-show'; the console has no such handler
  // (it opens on the shortcut), so an open console must be restored explicitly rather
  // than silently disappearing from under the operator.
  if (kind === 'console' && wasVisible) replacement.show()
  marker('WINDOW_RECREATED', { window: kind, attempt: decision.attempt, was_visible: wasVisible })
}

function toggleConsoleWindow(): void {
  const win = windows.get('console')
  if (win === undefined || win.isDestroyed()) {
    marker('CONSOLE_TOGGLE_IGNORED', { reason: 'console_window_missing' })
    return
  }

  if (win.isVisible()) {
    win.hide()
    marker('CONSOLE_TOGGLED', { visible: false })
    return
  }
  win.show()
  win.focus()
  marker('CONSOLE_TOGGLED', { visible: true })
}

function registerConsoleShortcut(): void {
  const registered = globalShortcut.register(CONSOLE_SHORTCUT, toggleConsoleWindow)
  if (registered) marker('SHORTCUT_REGISTERED', { accelerator: CONSOLE_SHORTCUT })
  else marker('SHORTCUT_REGISTER_FAILED', { accelerator: CONSOLE_SHORTCUT, reason: 'accelerator_unavailable' })
  const menu = Menu.getApplicationMenu()
  if (menu) {
    const view = menu.items.find(item => item.role === 'viewMenu' || item.label === 'View')?.submenu
    const item = new MenuItem({ label: 'Magic Mirror Console', click: toggleConsoleWindow })
    if (view) view.append(item)
    else { const submenu = new Menu(); submenu.append(item); menu.append(new MenuItem({ label: 'Console', submenu })) }
    Menu.setApplicationMenu(menu)
  }
}

/** Logs a final marker and exits once it has reached the pipe — the exit code is the contract. */
function exitWithMarker(name: string, fields: MarkerFields, code: number): void {
  let exited = false
  const quit = (): void => {
    if (exited) return
    exited = true
    stopQuitResources()
    void shutdownBootRuntime().then(() => {
      if (code === 1) {
        app.exit(1)
        return
      }
      app.exit(code)
    })
  }
  process.stdout.write(formatMarker(name, fields), quit)
  setTimeout(quit, EXIT_FLUSH_TIMEOUT_MS)
}

function finishSmokeRun(): void {
  const verdict = evaluateSmoke(boot)
  const snapshot = bootRuntime?.snapshot()
  exitWithMarker(
    'SMOKE_RESULT',
    {
      exit: verdict.exitCode,
      reason: verdict.reason,
      lifecycle: snapshot?.lifecycle ?? 'starting',
      config_status: snapshot?.modules.config ?? 'failed',
      maintenance_code: snapshot?.maintenance?.code ?? 'none',
    },
    verdict.exitCode,
  )
}

function finishPhase1LiveSmoke(result: Phase1LiveSmokeResult): void {
  exitWithMarker(
    'PHASE1_LIVE_RESULT',
    {
      status: result.status,
      exit: result.exit,
      stage: result.stage,
      reason: result.reason,
      duration_ms: result.duration_ms,
      model_availability: result.modelAvailability,
      provenance: result.provenance,
    },
    result.exit,
  )
}

function startPhase4QaIfReady(runtime: BootRuntime): void {
  if (
    !phase4QaEnabled
    || phase4QaStarted
    || !phase4QaReadyKinds.has('mirror')
    || !phase4QaReadyKinds.has('console')
  ) return
  const mirror = windows.get('mirror')
  const consoleWindow = windows.get('console')
  const outputDir = process.env['MIRROR_PHASE4_QA_OUTPUT_DIR']
  if (
    mirror === undefined
    || consoleWindow === undefined
    || outputDir === undefined
    || !isAbsolute(outputDir)
  ) {
    exitWithMarker('PHASE4_QA_RESULT', { status: 'failed', reason: 'phase4_qa_config_invalid' }, 2)
    return
  }
  const editorOnly = process.env['MIRROR_PHASE4_QA_EDITOR'] === '1'
  if (!editorOnly && !mirror.isVisible()) return
  phase4QaStarted = true
  const displays = screen.getAllDisplays()
  const portrait = selectMirrorDisplay(displays, screen.getPrimaryDisplay().id)
  const mirrorDisplay = screen.getDisplayMatching(mirror.getBounds())
  for (const display of displays) marker('PHASE4_QA_DISPLAY_CANDIDATE', {
    display: display.id, width: display.bounds.width, height: display.bounds.height,
    mirror: display.id === mirrorDisplay.id ? 'yes' : 'no',
  })
  const ravenConversation = process.env['MIRROR_RAVEN_CONVERSATION_QA'] === '1'
  const mediaFunctional = ravenConversation || process.env['MIRROR_MEDIA_SKILL_QA'] === '1' && process.env['MIRROR_MEDIA_SKILL_QA_FUNCTIONAL'] === '1'
  if (!editorOnly && !mediaFunctional && (portrait === null || portrait.bounds.height <= portrait.bounds.width || mirrorDisplay.id !== portrait.id)) {
    exitWithMarker('PHASE4_QA_RESULT', { status: 'failed', reason: 'phase4_qa_portrait_display_required' }, 2)
    return
  }
  const consoleDisplay = displays.find(display => display.id !== portrait?.id && display.id === screen.getPrimaryDisplay().id)
    ?? displays.find(display => display.id !== portrait?.id)
  if (consoleDisplay !== undefined) {
    const area = consoleDisplay.workArea
    consoleWindow.setBounds({ x: area.x, y: area.y, width: Math.min(1100, area.width), height: Math.min(900, area.height) })
  }
  consoleWindow.show()
  marker('PHASE4_QA_DISPLAY', { display_count: displays.length, mirror_display: portrait?.id ?? 0,
    width: portrait?.bounds.width ?? 0, height: portrait?.bounds.height ?? 0, scale_factor: portrait?.scaleFactor ?? 1,
    console_display: consoleDisplay?.id ?? 0, status: editorOnly ? 'mirror_not_executed' : mediaFunctional ? 'functional_only_portrait_not_verified' : 'portrait_verified' })
  if (process.env['MIRROR_PHASE4_QA_MANUAL'] === '1') {
    marker('PHASE4_QA_MANUAL', { status: 'ready', evidence: 'not_executed' })
    return
  }
  const evidence: Record<string, unknown>[] = []
  const finish = async (result: MarkerFields, code: number): Promise<void> => {
    try {
      await writeFile(join(outputDir, '..', 'evidence.json'), JSON.stringify({
        platform: process.platform,
        mode: ravenConversation ? 'raven_conversation' : mediaFunctional ? 'media_skill_functional' : process.env['MIRROR_PHASE4_QA_CUBISM'] === '1' ? 'cubism' : editorOnly ? 'editor' : process.env['MIRROR_PHASE4_QA_CONSOLE'] === '1' ? 'console' : 'avatar_scenes',
        live: process.env['MIRROR_PHASE4_QA_LIVE'] === '1',
        display: { count: displays.length, mirror: portrait?.id, width: portrait?.bounds.width,
          height: portrait?.bounds.height, verified: !editorOnly && !mediaFunctional, console: consoleDisplay?.id },
        result, evidence,
        humanAcceptance: 'not_executed', physicalHardware: 'not_executed',
      }, null, 2))
      exitWithMarker('PHASE4_QA_RESULT', result, code)
    } catch {
      exitWithMarker('PHASE4_QA_RESULT', { status: 'failed', reason: 'phase4_qa_evidence_write_failed' }, 2)
    }
  }
  void runPhase4Qa({
    wakeOwner: () => wakeSupervisor,
    runtime,
    mirror,
    console: consoleWindow,
    outputDir,
    musicOnly: process.env['MIRROR_PHASE4_QA_MUSIC_ONLY'] === '1',
    live: process.env['MIRROR_PHASE4_QA_LIVE'] === '1',
    lifecycleLive: process.env['MIRROR_PHASE4_QA_LIFECYCLE_LIVE'] === '1',
    consoleOnly: process.env['MIRROR_PHASE4_QA_CONSOLE'] === '1',
    editorOnly,
    cubismOnly: process.env['MIRROR_PHASE4_QA_CUBISM'] === '1',
    memoryPipeline: memoryPipelineQa,
    onEvidence: (step) => { evidence.push({ ...step }); marker('PHASE4_QA_STEP', { ...step }) },
  }).then((result) => {
    return finish({
      status: 'passed',
      motion_count: result.motionCount,
      expression_count: result.expressionCount,
      scene_count: result.sceneCount,
      visual_count: result.visualCount,
      screenshot_count: result.screenshotCount,
      music_analyser: result.musicAnalyser,
      console_check_count: result.consoleCheckCount ?? 0,
    }, 0)
  }).catch((error: unknown) => {
    const reason = error instanceof Error && /^phase4_qa_[a-z_]+$/.test(error.message)
      ? error.message
      : 'phase4_qa_failed'
    return finish({ status: 'failed', reason }, 2)
  })
}

function emitDisplaySleepMetadata(
  telemetry: BootRuntime['telemetry'],
  event: DisplaySleepBlockerEvent,
): void {
  const metadata: Parameters<typeof telemetry.emit>[0] = {
    module: 'app',
    event: `display_sleep_blocker_${event.action}`,
    status: event.status === 'degraded' ? 'degraded' : event.status === 'not_started' ? 'info' : 'success',
    source: 'runtime',
  }
  if (event.reason !== undefined) metadata.reason = event.reason
  try {
    telemetry.emit(metadata)
  } catch {
    // A diagnostic sink failure cannot gate blocker startup or clean quit.
  }
}

function createDeferredCredentialEventSink(): {
  readonly sink: ClientSecretBrokerEventSink
  readonly install: (target: ClientSecretBrokerEventSink) => void
} {
  let target: ClientSecretBrokerEventSink | null = null
  const pending: Parameters<ClientSecretBrokerEventSink['emit']>[0][] = []

  return {
    sink: {
      emit(event) {
        if (target === null) {
          pending.push(event)
          return
        }
        try {
          target.emit(event)
        } catch {
          // Credential diagnostics remain metadata-only and cannot gate a request.
        }
      },
    },
    install(nextTarget) {
      target = nextTarget
      while (pending.length > 0) {
        const event = pending.shift()
        if (event === undefined) continue
        try {
          target.emit(event)
        } catch {
          // A telemetry sink failure cannot expose or block credential handling.
        }
      }
    },
  }
}

void app.whenReady().then(async () => {
  if (!phase0UserDataPath.ok) {
    exitWithMarker('SMOKE_CONFIG_INVALID', { reason: 'phase0_user_data_isolation_invalid' }, 2)
    return
  }

  marker('MAIN_READY', {
    electron: process.versions.electron,
    platform: process.platform,
    smoke: smokeMode.kind
  })

  if (smokeMode.kind === 'invalid') {
    exitWithMarker('SMOKE_CONFIG_INVALID', { raw: smokeMode.raw, reason: 'mirror_smoke_ms_not_a_positive_number' }, 2)
    return
  }

  const deferredCredentialEvents = createDeferredCredentialEventSink()
  const mediaFolders = new MediaFolders(join(app.getPath('userData'), 'media-folders.json'))
  const mediaFoldersReady = mediaFolders.load()
  initializeAudioPreferences(join(app.getPath('userData'), 'audio-devices.json'))
  const credentialSource = createEnvironmentCredentialSource()
  let voicePreview: VoicePreviewLease | undefined
  const clientSecretBroker = createClientSecretBroker({
    credentialStore: credentialSource,
    events: deferredCredentialEvents.sink,
  })

  const runtime: BootRuntime = bootSequence({
    getFolderMedia: avatarId => mediaFolders.resources(avatarId),
    // Synthetic QA has no provider session to deliver MEDIA_CLOSED.
    completeSleepForDemo: phase4QaEnabled && process.env['MIRROR_PHASE4_QA_LIVE'] !== '1',
    appVersion: app.getVersion(),
    buildCommit: process.env['MIRROR_BUILD_COMMIT'] ?? 'development',
    isPackaged: app.isPackaged,
    developerModeOverride: process.env['MIRROR_DEVELOPER_MODE'],
    telemetryDirectory: join(app.getPath('userData'), 'telemetry'),
    configDir: join(app.getPath('userData'), 'config'),
    defaultConfigPath: app.isPackaged
      ? join(process.resourcesPath, 'config', 'default.json')
      : join(app.getAppPath(), 'resources', 'config', 'default.json'),
    sqlitePath: join(app.getPath('userData'), 'mirror.sqlite'),
    offlineLoopAssetPath: resolveOfflineLoopAssetPath(),
    clientSecretBroker,
    wakeMicrophoneHandoff: {
      release: async () => {
        await wakeCalibration?.stop(false)
        return wakeSupervisor?.release() ?? { status: 'success' as const, reason: 'wake_microphone_not_configured' }
      },
      acquire: () => wakeSupervisor?.acquire() ?? Promise.resolve({
        status: 'success' as const,
        reason: 'wake_microphone_not_configured',
      }),
    },
    onWakeConfigChanged: () => configureWakeRuntime(runtime),
    getWakeTuningDefaults: async wake => {
      const loaded = await loadWakeModelPackage({ rootDirectory: wakeModelRoot(), wake,
        platform: `${process.platform}-${process.arch}`,
        customKeywordsDirectory: join(app.getPath('userData'), 'wake-keywords'),
      })
      if (!loaded.ok) return null
      const defaults = createWakeWorkerPackage(loaded, wake).tuning
      return { packageId: loaded.manifest.packageId, threshold: defaults.threshold!, score: defaults.score!,
        numTrailingBlanks: defaults.numTrailingBlanks ?? 1 }
    },
    validateWakeConfig: async (wake, tuning) => {
      const result = await loadWakeModelPackage({
        rootDirectory: wakeModelRoot(),
        wake,
        platform: `${process.platform}-${process.arch}`,
        customKeywordsDirectory: join(app.getPath('userData'), 'wake-keywords'),
        forceCustomKeywords: tuning?.enabled === true && tuning.phrase === wake.phrase,
      })
      if (!result.ok) runtime.telemetry.emit({ module: 'wake', event: 'wake_phrase_validation_failed',
        status: 'failed', reason: result.reason, source: 'runtime' })
      return result.ok
    },
    validateSceneAssets: async (config) => {
      for (const model of config.avatarCatalog?.models ?? []) {
        if (!(await verifyAvatarModel(model, join(app.getPath('userData'), 'assets', 'avatars')))) return false
      }
      for (const asset of config.visualAssets) {
        await verifyManagedVisualAsset({ asset, storageDir: join(app.getPath('userData'), 'assets', 'visual') })
      }
      return true
    },
    dispatchRealtimeRuntimeCommand: (command) => {
      if (command.operation === 'start') voicePreview?.preempt()
      return dispatchMirrorRealtimeRuntimeCommand(command, windows)
    },
  })
  deferredCredentialEvents.install(runtime.telemetry)
  let lastFolderHealth = ''
  const reportFolderHealth = () => {
    const status = mediaFolders.health()
    if (status === lastFolderHealth) return
    lastFolderHealth = status
    runtime.telemetry.emit({ module: 'avatar', event: 'media_folders', source: 'runtime',
      status: status === 'ready' ? 'success' : 'degraded', reason: `media_folder_index_${status}` })
  }
  void mediaFoldersReady.then(reportFolderHealth)
  let refreshingFolders = false
  const folderTimer = setInterval(() => {
    if (refreshingFolders) return
    refreshingFolders = true
    void mediaFoldersReady.then(() => mediaFolders.refresh()).then(reportFolderHealth).catch(() => runtime.telemetry.emit({ module: 'avatar', event: 'media_folders',
      source: 'runtime', status: 'degraded', reason: 'media_folder_refresh_failed' })).finally(() => { refreshingFolders = false })
  }, 30000)
  folderTimer.unref()
  app.once('before-quit', () => clearInterval(folderTimer))
  bootRuntime = runtime
  wakeCalibration = createWakeCalibration({
    supervisor: () => wakeSupervisor,
    canListen: () => runtime.snapshot().lifecycle === 'dormant' || runtime.snapshot().lifecycle === 'offlineLoop',
    load: async settings => {
      // Testing an unsaved avatar is safe: settings are temporary and cannot publish.
      const published = await runtime.getPublishedWakeConfigForRuntime()
      const wake = { ...published, phrase: settings.phrase, tuning: { enabled: true, phrase: settings.phrase,
        threshold: settings.threshold, score: settings.score, numTrailingBlanks: settings.numTrailingBlanks } }
      const loaded = await loadWakeModelPackage({ rootDirectory: wakeModelRoot(), wake,
        platform: `${process.platform}-${process.arch}`, forceCustomKeywords: true,
        customKeywordsDirectory: join(app.getPath('userData'), 'wake-keywords') })
      if (!loaded.ok) throw new Error(loaded.reason)
      return createWakeWorkerPackage(loaded, wake)
    },
  })
  void runtime.ready.then(() => runtime.telemetry.emit({ module: 'avatar', event: 'video_decode_policy',
    status: 'info', reason: videoDecodingReason, source: 'runtime' }))
  const visualStorageDir = join(app.getPath('userData'), 'assets', 'visual')
  const visualAssetManager = createVisualAssetManager({ storageDir: visualStorageDir })
  const verifyPlaybackVisual = createVisualPlaybackVerifier()
  // Imported-but-unsaved assets can be previewed without publishing the draft.
  const importedPreviews = new Map<string, ImportedMedia>()
  const importedModels = new Map<string, AvatarModel>()
  const avatarStorageDir = join(app.getPath('userData'), 'assets', 'avatars')
  const rememberPreview = <T extends ImportedMedia>(asset: T): T => {
    importedPreviews.delete(asset.id); importedPreviews.set(asset.id, asset)
    if (importedPreviews.size > 512) importedPreviews.delete(importedPreviews.keys().next().value!)
    return asset
  }
  const visualAssetReady = visualAssetManager.initialize().catch(() => {
    runtime.telemetry.emit({
      module: 'avatar',
      event: 'visual_asset_storage_unavailable',
      status: 'degraded',
      reason: 'cause=pending_cleanup_failed',
      source: 'runtime',
    })
  })
  void configureWakeRuntime(runtime)
  void configureAvatarRuntime(runtime)

  displaySleepBlocker = createDisplaySleepBlocker(
    {
      start: (type) => powerSaveBlocker.start(type),
      isStarted: (id) => powerSaveBlocker.isStarted(id),
      stop: (id) => powerSaveBlocker.stop(id),
    },
    (event) => emitDisplaySleepMetadata(runtime.telemetry, event),
  )
  displaySleepBlocker.start()

  app.on('render-process-gone', (_event, contents, details) => onRenderProcessGone(contents, details))

  createWindows()
  watchMirrorDisplay()
  const tvHost = parseTvHost(process.env['MIRROR_TV_HOST'])
  if (isDarwin && mirrorDisplayMatch && tvHost && smokeMode.kind === 'off'
    && !phase4QaEnabled && !phase1LiveSmokeEnabled) {
    const displayNeedle = mirrorDisplayMatch.toLowerCase()
    tvPresence = monitorTvPresence({
      display: () => screen.getAllDisplays().some(display => display.label.toLowerCase().includes(displayNeedle))
        ? 'present' : 'absent',
      ethernet: signal => probeTvEthernet(tvHost, signal),
      report: event => {
        marker('TV_PRESENCE', event)
        try {
          runtime.telemetry.emit({ module: 'app', event: 'tv_presence', source: 'runtime',
            status: event.reason === 'presence_query_unavailable' ? 'degraded' : 'info',
            reason: `${event.reason};hdmi=${event.hdmi};ethernet=${event.ethernet}` })
        } catch { /* Diagnostics cannot gate shutdown or conversation. */ }
      },
      onAbsent: () => app.quit(),
    })
  } else if (process.env['MIRROR_TV_HOST'] && !tvHost) {
    marker('TV_PRESENCE_DISABLED', { reason: 'invalid_tv_host' })
  }
  // Permission and capture startup never gate the Mirror, voice, or other adapters.
  if (isDarwin && smokeMode.kind === 'off' && !phase4QaEnabled && !phase1LiveSmokeEnabled) {
    void runtime.ready.then(async () => {
      const granted = await systemPreferences.askForMediaAccess('camera')
      if (cameraStopping) return
      if (!granted) { await runtime.setCameraRuntimeStatus?.('degraded', 'camera_permission_denied'); return }
      cameraTracking = startCameraTracking({
        executable: app.isPackaged
          ? join(process.resourcesPath, 'app.asar.unpacked/out/native/camera-tracker')
          : join(app.getAppPath(), 'out/native/camera-tracker'),
        cameraName: 'Arducam',
        onTarget: target => {
          const mirror = windows.get('mirror')
          if (mirror && !mirror.isDestroyed()) mirror.webContents.send('mirror:camera-target', target)
        },
        onStatus: (status, reason) => { void runtime.setCameraRuntimeStatus?.(status, reason) },
      })
    }).catch(() => { void runtime.setCameraRuntimeStatus?.('degraded', 'camera_start_failed') })
  }
  protocol.handle('magic-mirror-media', async (request) => {
    try {
      await visualAssetReady
      if (phase4QaEnabled) marker('PHASE4_MEDIA_PROTOCOL', { stage: 'request', status: 'received' })
      const url = new URL(request.url)
      if (url.hostname === 'avatar') {
        const [id, ...segments] = decodeURIComponent(url.pathname.slice(1)).split('/')
        if (!/^model-[a-z0-9-]{1,80}$/.test(id)) return new Response(null, { status: 404 })
        const file = segments.join('/')
        const config = await runtime.console.getConfig()
        const model = importedModels.get(id) ?? (config.ok ? [...(config.value.active.avatarCatalog?.models ?? []), ...(config.value.draft.avatarCatalog?.models ?? [])].find(m => m.id === id) : undefined)
        if (!model?.files.includes(file)) return new Response(null, { status: 404 })
        const path = await safeAvatarFile(join(avatarStorageDir, id), file)
        return serveMediaFile(request, path, file.endsWith('.png') ? 'image/png' : /\.jpe?g$/i.test(file) ? 'image/jpeg' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream')
      }
      const opaqueId = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(opaqueId)) {
        return new Response(null, { status: 404 })
      }
      if (opaqueId.startsWith('folder-') && ['music', 'music-draft', 'visual', 'visual-draft'].includes(url.hostname)) {
        await mediaFoldersReady
        const active = await runtime.getPublishedSceneConfigForRuntime()
        const file = await mediaFolders.resolve(opaqueId, active.avatarCatalog?.activeAvatarId, url.hostname.endsWith('-draft'))
        if (!file || url.hostname.startsWith('music') !== file.mimeType.startsWith('audio/')) return new Response(null, { status: 404 })
        return serveMediaFile(request, file.path, file.mimeType)
      }
      let filePath: string
      let mimeType: string
      if (url.hostname === 'music' || url.hostname === 'music-draft') {
        const draft = url.hostname === 'music-draft' ? await runtime.console.getConfig() : null
        if (draft !== null && !draft.ok) return new Response(null, { status: 404 })
        const config = draft?.ok ? draft.value.draft : await runtime.getPublishedSceneConfigForRuntime()
        const remembered = url.hostname === 'music-draft' ? importedPreviews.get(opaqueId) : undefined
        const asset = remembered && !('kind' in remembered) ? remembered : config.musicAssets.find((candidate) => candidate.id === opaqueId)
        if (asset === undefined) return new Response(null, { status: 404 })
        filePath = join(app.getPath('userData'), 'assets', 'music', asset.fileName)
        mimeType = asset.mimeType
      } else if (url.hostname === 'visual-pending') {
        const pendingPath = await visualAssetManager.resolvePendingPath(opaqueId)
        if (pendingPath === null) return new Response(null, { status: 404 })
        filePath = pendingPath
        const extension = extname(pendingPath).toLowerCase()
        mimeType = extension === '.png' ? 'image/png'
          : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
            : extension === '.webp' ? 'image/webp'
              : extension === '.mp4' ? 'video/mp4'
                : extension === '.webm' ? 'video/webm' : ''
        if (mimeType === '') return new Response(null, { status: 404 })
      } else if (url.hostname === 'visual' || url.hostname === 'visual-draft') {
        const draft = url.hostname === 'visual-draft' ? await runtime.console.getConfig() : null
        if (draft !== null && !draft.ok) return new Response(null, { status: 404 })
        const config = draft?.ok ? draft.value.draft : await runtime.getPublishedSceneConfigForRuntime()
        const remembered = url.hostname === 'visual-draft' ? importedPreviews.get(opaqueId) : undefined
        const asset = remembered && 'kind' in remembered ? remembered : config.visualAssets.find((candidate) => candidate.id === opaqueId)
        if (asset === undefined) return new Response(null, { status: 404 })
        await verifyPlaybackVisual({ asset, storageDir: visualStorageDir })
        filePath = join(visualStorageDir, asset.fileName)
        mimeType = asset.mimeType
      } else {
        return new Response(null, { status: 404 })
      }
      if (phase4QaEnabled) marker('PHASE4_MEDIA_PROTOCOL', { stage: 'asset', status: 'resolved' })
      const response = await serveMediaFile(request, filePath, mimeType)
      if (phase4QaEnabled) marker('PHASE4_MEDIA_PROTOCOL', { stage: 'file_fetch', status: response.status })
      return response
    } catch {
      if (phase4QaEnabled) marker('PHASE4_MEDIA_PROTOCOL', { stage: 'handler', status: 'failed' })
      return new Response(null, { status: 404 })
    }
  })
  voicePreview = createVoicePreviewLease({
    isDormant: () => runtime.snapshot().lifecycle === 'dormant',
    snapshot: () => runtime.getPublishedSessionModelSnapshotForDiagnostics(),
    broker: clientSecretBroker,
    suppressOutput: () => windows.get('console')?.webContents.setAudioMuted(true),
    enableOutput: () => windows.get('console')?.webContents.setAudioMuted(false),
    notify: reason => {
      windows.get('console')?.webContents.send('console:voice-preview-cancelled', reason)
      runtime.telemetry.emit({ module: 'avatar', event: 'voice_preview_stopped', status: 'info', reason, source: 'runtime' })
    },
  })
  const youtubePlayer = createYoutubePlayer(() => windows.get('mirror'), { preferences: () => getAudioPreferences().preferences,
    report: reason => runtime.telemetry.emit({ module: 'avatar', event: 'media_skill', source: 'runtime', status: 'degraded', reason }) })
  app.once('before-quit', () => youtubePlayer.stop())
  sceneRuntimeControl = registerIpcHandlers({
    youtube: youtubePlayer,
    searchYoutube: createYoutubeSearch({ credentialSource: createYoutubeCredentialSource() }),
    captureCamera: () => phase4QaEnabled && process.env['MIRROR_RAVEN_CONVERSATION_QA'] === '1'
      ? windows.get('mirror')!.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,640,480);x.fillStyle='blue';x.fillRect(60,140,160,160);x.fillStyle='yellow';x.beginPath();x.arc(460,220,80,0,Math.PI*2);x.fill();return {dataUrl:c.toDataURL('image/jpeg',.8),width:640,height:480}})()`)
      : cameraTracking?.capture() ?? Promise.resolve(null),
    getFolderMedia: avatarId => mediaFolders.resources(avatarId),
    mediaFolders: async request => {
      await mediaFoldersReady
      const config = await runtime.console.getConfig()
      if (!config.ok) throw Error('media_folder_config_unavailable')
      const knownAvatar = !request.avatarId || config.value.draft.avatarCatalog?.avatars.some(avatar => avatar.id === request.avatarId)
      if (!knownAvatar && ['choose', 'unlink'].includes(request.action) && request.scope === 'own') throw Error('media_folder_save_avatar_first')
      const owner = request.scope === 'shared' ? 'shared' : `avatar:${request.avatarId}`
      if (request.action === 'choose') {
        const options: Electron.OpenDialogOptions = { title: request.scope === 'shared' ? 'Choose shared media folder for all avatars' : 'Choose this avatar’s media folder', properties: ['openDirectory'],
          defaultPath: (request.scope === 'shared' ? mediaFolders.view().shared : mediaFolders.view(request.avatarId).own)?.path ?? app.getPath('home') }
        const window = windows.get('console')
        const selected = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
        if (!selected.canceled && selected.filePaths[0]) await mediaFolders.link(owner, selected.filePaths[0])
      } else if (request.action === 'unlink') await mediaFolders.unlink(owner)
      else if (request.action === 'refresh') await mediaFolders.refresh()
      else if (request.action === 'save') await mediaFolders.saveCurrent()
      reportFolderHealth()
      return mediaFolders.view(knownAvatar ? request.avatarId : undefined)
    },
    wakeCalibration: async command => {
      if (command.type === 'start' || command.type === 'update') await wakeConfigurationTask
      return wakeCalibration!.command(command)
    },
    voicePreview,
    getWakeInput: () => wakeSupervisor?.snapshot().input,
    ipcMain,
    runtime,
    console: runtime.console,
    windows,
    telemetry: runtime.telemetry,
    listAvatarModels: async () => {
      const library = await listAvatarModels(avatarStorageDir)
      for (const model of library.models) importedModels.set(model.id, model)
      if (library.rejectedCount > 0) runtime.telemetry.emit({ module: 'avatar', event: 'avatar_library_degraded', status: 'degraded', reason: 'avatar_invalid_bundles_skipped', source: 'runtime' })
      if (library.labelWarningCount) runtime.telemetry.emit({ module: 'avatar', event: 'avatar_library_degraded', status: 'degraded', reason: 'avatar_invalid_labels_ignored', source: 'runtime' })
      return library
    },
    saveAvatarModelLabel: async request => {
      const model = await saveAvatarModelLabel(avatarStorageDir, request)
      importedModels.set(model.id, model)
      return model
    },
    importAvatarModel: async () => {
      const picker: Electron.OpenDialogOptions = { title: 'Import Cubism model3.json and referenced assets', properties: ['openFile'], filters: [{ name: 'Cubism model manifest', extensions: ['json'] }] }
      const owner = windows.get('console')
      const selected = owner ? await dialog.showOpenDialog(owner, picker) : await dialog.showOpenDialog(picker)
      if (selected.canceled || !selected.filePaths[0]) return null
      const model = await importAvatarModel(selected.filePaths[0], avatarStorageDir)
      importedModels.set(model.id, model)
      if (importedModels.size > 32) importedModels.delete(importedModels.keys().next().value!)
      return model
    },
    importMedia: async (request) => {
      await visualAssetReady
      const visualExtensions = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm']
      const musicExtensions = ['mp3', 'wav', 'ogg', 'm4a']
      const picker: Electron.OpenDialogOptions = {
        title: request.multiple ? 'Import media (up to 32 files)' : 'Import scene media',
        properties: request.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [{ name: 'Media', extensions: request.kind === 'visual' ? visualExtensions
          : request.kind === 'music' ? musicExtensions : [...visualExtensions, ...musicExtensions] }],
      }
      const owner = windows.get('console')
      const selection = owner ? await dialog.showOpenDialog(owner, picker) : await dialog.showOpenDialog(picker)
      if (selection.canceled) return []
      if (selection.filePaths.length > (request.multiple ? 32 : 1)) return [{ kind: 'failed', name: 'Selection', reason: 'media_selection_limit_exceeded' }]
      const entries: MediaImportEntry[] = []
      for (const sourcePath of selection.filePaths) {
        const extension = extname(sourcePath).slice(1).toLowerCase()
        try {
          if (request.kind !== 'music' && visualExtensions.includes(extension)) {
            entries.push({ kind: 'visual', pending: await visualAssetManager.import({ sourcePath }) })
          } else if (request.kind !== 'visual' && musicExtensions.includes(extension)) {
            entries.push({ kind: 'music', asset: rememberPreview(await importManagedMusicAsset({ sourcePath, storageDir: join(app.getPath('userData'), 'assets', 'music') })) })
          } else entries.push({ kind: 'failed', name: basename(sourcePath).slice(0, 120), reason: 'media_format_unsupported' })
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
          entries.push({ kind: 'failed', name: basename(sourcePath).slice(0, 120),
            reason: typeof code === 'string' && /^(visual|music)_asset_[a-z_]+$/.test(code) ? code : 'media_import_failed' })
        }
      }
      return entries
    },
    importMusicAsset: async () => {
      const owner = windows.get('console')
      const pickerOptions: Electron.OpenDialogOptions = {
        title: 'Import scene music',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
      }
      const selection = owner === undefined
        ? await dialog.showOpenDialog(pickerOptions)
        : await dialog.showOpenDialog(owner, pickerOptions)
      const sourcePath = selection.filePaths[0]
      if (selection.canceled || sourcePath === undefined) return null
      return rememberPreview(await importManagedMusicAsset({
        sourcePath,
        storageDir: join(app.getPath('userData'), 'assets', 'music'),
      }))
    },
    importVisualAsset: async () => {
      await visualAssetReady
      const owner = windows.get('console')
      const pickerOptions: Electron.OpenDialogOptions = {
        title: 'Import scene visual',
        properties: ['openFile'],
        filters: [{ name: 'Images and videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'] }],
      }
      const selection = owner === undefined
        ? await dialog.showOpenDialog(pickerOptions)
        : await dialog.showOpenDialog(owner, pickerOptions)
      const sourcePath = selection.filePaths[0]
      if (selection.canceled || sourcePath === undefined) return null
      return visualAssetManager.import({ sourcePath })
    },
    finalizeVisualAsset: async (input) => {
      await visualAssetReady
      return rememberPreview(await visualAssetManager.finalize(input))
    },
    cancelVisualAsset: async (token) => {
      await visualAssetReady
      return visualAssetManager.cancel(token)
    },
    onReady: (kind) => {
      const win = windows.get(kind)
      if (win !== undefined && !win.isDestroyed()) {
        onRendererReady(win.webContents)
        if (kind === 'mirror') phase1LiveSmokeCoordinator?.onMirrorRendererReady()
        phase4QaReadyKinds.add(kind)
        startPhase4QaIfReady(runtime)
      }
    },
  })
  const memoryReport = (code: string): void => {
    if (code === 'memory_storage_unavailable') void runtime.setMemoryRuntimeStatus('degraded')
    runtime.telemetry.emit({ module: 'memory', event: 'memory_operation', status: /failed|unavailable|invalid|timeout/.test(code) ? 'degraded' : 'info', reason: code, source: 'runtime' })
  }
  let memoryStore: ReturnType<typeof createMemoryRepository>
  try { memoryStore = createMemoryRepository(join(app.getPath('userData'), 'private-memory', 'memory.sqlite')) }
  catch { memoryStore = unavailableMemoryRepository(); memoryReport('memory_storage_unavailable') }
  void memoryStore.names('runtime-check').then(() => runtime.setMemoryRuntimeStatus('ready')).catch(() => memoryReport('memory_storage_unavailable'))
  const memoryEmbedder = createMemoryEmbedder({ runtimeDirectory: app.isPackaged
    ? join(app.getPath('userData'), 'memory-embedding') : join(app.getAppPath(), '.local', 'memory-embedding'),
    report: event => memoryReport(`memory_embedding_${event.reason}`) })
  const memoryIndexer = new MemoryIndexer(memoryStore, memoryEmbedder, memoryReport)
  void memoryEmbedder.embed('Memory runtime readiness.', 'document').then(() => memoryIndexer.schedule())
    .catch(() => memoryReport('memory_semantic_unavailable'))
  const memoryExtractor = createMemoryExtractor({ credentialSource })
  const memoryModel = async () => (await runtime.getPublishedSessionModelSnapshotForDiagnostics()).memoryExtractor
  const memoryInterpreter = createMemoryInterpreter({ credentialSource, model: memoryModel })
  const memoryConsolidator = createMemoryConsolidator({ repository: memoryStore, extract: memoryExtractor, embedder: memoryEmbedder, report: memoryReport })
  const memoryLearning = new MemoryLearning({ repository: memoryStore, extract: memoryExtractor, consolidate: memoryConsolidator, model: memoryModel,
    report: memoryReport, onCommitted: (avatarId, name) => {
      memoryIndexer.schedule()
      void memoryStore.policy(avatarId, name).then(async policy => {
        const snapshot = runtime.snapshot()
        if (policy.cleanupRequired && memory.relationship.invalidateLoaded({ active: snapshot.lifecycle === 'active',
          avatarId: runtime.getPublishedAvatarId(), realtimeSessionId: snapshot.realtimeSessionId ?? '', sessionGeneration: snapshot.sessionGeneration }, avatarId, name)) {
          memoryReport('memory_context_refresh_required')
          const reset = await runtime.rolloverAtSafeBoundary()
          if (!['dispatched', 'success'].includes(reset.status as string)) await runtime.manualStop()
        }
      }).catch(() => memoryReport('memory_context_refresh_failed'))
    } })
  const memoryImporter = new MemoryImporter({ repository: memoryStore, extract: memoryExtractor, consolidate: memoryConsolidator, model: memoryModel,
    canRun: () => runtime.snapshot().lifecycle === 'dormant', report: memoryReport, onChanged: () => memoryIndexer.schedule() })
  memoryIndexer.schedule()
  if (phase4QaEnabled && process.env['MIRROR_MEMORY_LIVE_QA'] === '1') memoryPipelineQa = async evidence => runMemoryLiveQa({
    path: join(app.getPath('userData'), 'private-memory', 'synthetic-e2e.sqlite'), model: await memoryModel(),
    extract: memoryExtractor, embedder: memoryEmbedder, evidence })
  const memory = registerMemoryIpc({
    handle: (channel, handler) => ipcMain.handle(channel, handler),
    authorize: (event, kind) => authorizeSender(event, kind, windows).ok,
    state: () => { const snapshot = runtime.snapshot(); return { active: snapshot.lifecycle === 'active', lifecycle: snapshot.lifecycle,
      avatarId: runtime.getPublishedAvatarId(), realtimeSessionId: snapshot.realtimeSessionId ?? '', sessionGeneration: snapshot.sessionGeneration } },
    store: () => memoryStore,
    learning: memoryLearning, embedder: memoryEmbedder, importer: memoryImporter, interpret: memoryInterpreter,
    onChanged: () => memoryIndexer.schedule(),
    controlPhrases: async () => {
      const config = await runtime.console.getConfig()
      if (!config.ok) return []
      const avatar = config.value.active.avatarCatalog?.avatars.find(a => a.id === runtime.getPublishedAvatarId())
      return [...config.value.active.spells.map(spell => spell.phrase), ...(avatar?.spells ?? []).map(spell => spell.phrase), avatar?.sleepPhrase ?? '', avatar?.wakePhrase ?? ''].filter(Boolean)
    },
    pickMarkdown: async () => {
      const selected = await dialog.showOpenDialog({ title: 'Import memory Markdown', properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] })
      if (selected.canceled || !selected.filePaths[0]) return null
      const file = await open(selected.filePaths[0], 'r')
      try {
        const info = await file.stat()
        if (!info.isFile() || info.size > 20 * 1024 * 1024) throw Error('memory_import_too_large')
        const buffer = Buffer.alloc(Math.min(info.size + 1, 20 * 1024 * 1024 + 1))
        let bytesRead = 0
        while (bytesRead < buffer.length) {
          const part = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
          if (!part.bytesRead) break
          bytesRead += part.bytesRead
        }
        if (bytesRead > info.size || bytesRead > 20 * 1024 * 1024) throw Error('memory_import_too_large')
        if (bytesRead !== info.size) throw Error('memory_import_source_changed')
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead))
      } finally { await file.close() }
    },
    knownAvatar: async id => { const config = await runtime.console.getConfig(); return config.ok && !!config.value.active.avatarCatalog?.avatars.some(a => a.id === id) },
    resetConversation: async () => {
      const result = await runtime.rolloverAtSafeBoundary()
      if (!['dispatched', 'success'].includes(result.status as string)) { await runtime.manualStop(); throw new Error('memory_session_reset_failed') }
    },
    canEdit: () => runtime.snapshot().lifecycle === 'dormant',
    report: memoryReport,
  })
  shutdownMemory = async () => {
    memory.close(); memoryImporter.cancel()
    await memoryLearning.flush()
    await Promise.allSettled([memoryLearning.close(), memoryImporter.idle(), memoryIndexer.close(), memoryEmbedder.close()])
    await memoryStore.close()
  }
  runtime.subscribe((snapshot) => {
    memory.observe()
    const previousLifecycle = mainLifecycle
    mainLifecycle = snapshot.lifecycle
    if (previousLifecycle === 'active' && snapshot.lifecycle !== 'active') {
      void sceneRuntimeControl?.stopAll({ preserveSleepingMedia: snapshot.lifecycle === 'suspending' })
    } else if (previousLifecycle !== snapshot.lifecycle && (snapshot.lifecycle === 'maintenance' || snapshot.lifecycle === 'offlineLoop')) {
      void sceneRuntimeControl?.stopAll()
    }
    boot.lifecycle = mirrorRendererReady ? snapshot.lifecycle : 'starting'
    void publishSnapshot('mirror', snapshot, windows, runtime.telemetry)
    void publishSnapshot('console', snapshot, windows, runtime.telemetry)
  })

  if (phase1LiveSmokeEnabled) {
    phase1LiveSmokeCoordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => runtime.snapshot(),
      getLastRealtimeRuntimeOutcomeReason: () => runtime.getLastRealtimeRuntimeOutcomeReason(),
      subscribe: (listener) => runtime.subscribe(listener),
      checkProvenance: async () => {
        const encodedExpected = process.env['MIRROR_PHASE1_EXPECTED_PROVENANCE']
        if (encodedExpected === undefined) return false
        let expected: unknown
        try {
          expected = JSON.parse(encodedExpected) as unknown
        } catch {
          return false
        }
        const snapshot = await runtime.getPublishedSessionModelSnapshotForDiagnostics()
        return matchesPhase1LiveSmokeProvenance(expected, {
          userDataDir: resolve(app.getPath('userData')),
          configVersion: snapshot.configVersion,
          fingerprint: snapshot.fingerprint,
          sdkVersion: snapshot.sdkVersion,
          realtimeDialogue: snapshot.realtimeDialogue,
          inputTranscription: snapshot.inputTranscription,
          memoryExtractor: snapshot.memoryExtractor,
          voice: snapshot.voice,
          reasoningEffort: snapshot.reasoningEffort,
          turnDetectionProfile: snapshot.turnDetectionProfile,
        })
      },
      probeConfiguredModelAvailability: runtime.probeConfiguredModelAvailability,
      manualStart: () => runtime.manualStart(),
      manualStop: () => runtime.manualStop(),
      emitResult: finishPhase1LiveSmoke,
    })
    phase1LiveSmokeCoordinator.start()
  }

  registerConsoleShortcut()

  if (smokeMode.kind === 'on') setTimeout(finishSmokeRun, smokeMode.ms)
})

function shutdownBootRuntime(): Promise<void> {
  cameraStopping = true
  if (shutdownPromise !== null) return shutdownPromise
  const runtime = bootRuntime
  if (runtime === null) {
    shutdownPromise = Promise.resolve()
    return shutdownPromise
  }

  shutdownPromise = Promise.resolve()
    .then(() => cameraTracking?.stop())
    .then(() => sceneRuntimeControl?.stopAll())
    .then(() => wakeCalibration?.stop(false))
    .then(() => wakeSupervisor?.shutdown())
    .then(() => runtime.shutdown())
    .then(() => shutdownMemory?.())
    .catch(() => {
      marker('SHUTDOWN_FAILED', { reason: 'shutdown_rejected' })
    })
  return shutdownPromise
}

function stopQuitResources(): void {
  if (quitResourcesStopped) return
  quitResourcesStopped = true
  tvPresence?.stop()
  if (displaySettleTimer !== null) {
    clearTimeout(displaySettleTimer)
    displaySettleTimer = null
  }
  globalShortcut.unregisterAll()
  displaySleepBlocker?.stop()
}

app.on('will-quit', (event) => {
  if (willQuitHandled) return

  event.preventDefault()
  stopQuitResources()
  if (appQuitFinalizationStarted) return
  appQuitFinalizationStarted = true

  void shutdownBootRuntime().then(() => {
    // Release before app.quit() so Electron's reentrant will-quit is allowed through.
    willQuitHandled = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (!isDarwin) app.quit()
})
