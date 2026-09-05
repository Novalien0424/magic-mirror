import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  powerSaveBlocker,
  protocol,
  screen,
  utilityProcess,
  type WebContents,
} from 'electron'
import { BOOT_RENDERER_READY_CHANNEL, type MirrorWindowKind } from '../shared/bridge'
import type { LifecycleState } from '../shared/types'
import type { ImportedMedia, MediaImportEntry } from '../shared/media-import'
import { bootSequence, type BootRuntime } from './boot'
import { initializeAudioPreferences } from './audio-preferences'
import { createCrashRecovery } from './crash-recovery'
import { createDisplaySleepBlocker, type DisplaySleepBlocker, type DisplaySleepBlockerEvent } from './display-sleep-blocker'
import { createEnvironmentCredentialSource } from './environment-credential-source'
import {
  dispatchMirrorRealtimeRuntimeCommand,
  publishSnapshot,
  registerIpcHandlers,
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
import { importManagedMusicAsset } from './scenes/music-assets'
import { createVisualAssetManager, createVisualPlaybackVerifier, verifyManagedVisualAsset } from './scenes/visual-assets'
import { serveMediaFile } from './scenes/media-file-response'
import { runPhase4Qa } from './phase4-qa'

const isDarwin = process.platform === 'darwin'
const CONSOLE_SHORTCUT = 'CommandOrControl+Shift+D'
/** Never let a stalled stdout pipe turn a smoke run into a hang. */
const EXIT_FLUSH_TIMEOUT_MS = 500
const phase1LiveSmokeEnabled = process.env['MIRROR_PHASE1_LIVE_SMOKE'] === '1'
const phase4QaEnabled = process.env['MIRROR_PHASE4_QA'] === '1'

// A kiosk wake/Console command has no click inside the mirror renderer. Permit
// those trusted Main-routed actions to start the local output graph.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
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
let wakeSupervisor: WakeSupervisor | null = null
let shutdownPromise: Promise<void> | null = null
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

async function configureWakeRuntime(runtime: BootRuntime): Promise<void> {
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
  const loaded = await loadWakeModelPackage({
    rootDirectory: wakeModelRoot(),
    wake,
    platform: `${process.platform}-${process.arch}`,
  })
  if (!loaded.ok) {
    await runtime.setWakeRuntimeStatus('degraded', loaded.reason)
    return
  }

  const tuning = loaded.manifest.tuning
  const workerPackage: WakeWorkerPackage = {
    packageId: loaded.manifest.packageId,
    engine: loaded.manifest.engine,
    engineVersion: loaded.manifest.engineVersion,
    modelVersion: loaded.manifest.modelVersion,
    phrase: loaded.manifest.phrase,
    sampleRateHz: 16_000,
    artifactPaths: Object.fromEntries(loaded.artifactPaths),
    tuning: {
      ...(tuning.threshold === undefined ? {} : { threshold: tuning.threshold }),
      ...(tuning.score === undefined ? {} : { score: tuning.score }),
      ...(tuning.numTrailingBlanks === undefined ? {} : { numTrailingBlanks: tuning.numTrailingBlanks }),
    },
  }
  let activation: ReturnType<typeof createWakeConversationActivation> | null = null
  const supervisor = createWakeSupervisor({
    spawn: spawnWakeWorker,
    onWake: () => {
      void activation?.handleWake()
    },
    onStatus: (snapshot) => {
      const moduleStatus = snapshot.status === 'failed'
        ? 'failed'
        : snapshot.status === 'starting' || snapshot.status === 'stopped'
          ? 'degraded'
          : 'ready'
      void runtime.setWakeRuntimeStatus(moduleStatus, snapshot.reason ?? `wake_worker_${snapshot.status}`)
    },
  })
  activation = createWakeConversationActivation({
    getLifecycle: () => runtime.snapshot().lifecycle,
    startConversation: () => runtime.manualStart(),
    reacquireWake: () => supervisor.acquire(),
  })
  wakeSupervisor = supervisor
  const started = await supervisor.start({ package: workerPackage })
  if (started.status === 'failed') return
  if (runtime.snapshot().lifecycle === 'dormant' || runtime.snapshot().lifecycle === 'offlineLoop') {
    await supervisor.acquire()
  }
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
  const mirrorDisplay = selectPortraitDisplay(screen.getAllDisplays(), primaryDisplay.id)
  const mirrorBounds = mirrorDisplay?.bounds

  return {
    ...shared,
    ...(mirrorBounds ?? { width: 1280, height: 800 }),
    frame: false,
    backgroundColor: '#05070a',
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

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
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
      if (isDarwin) win.setSimpleFullScreen(true)
      else win.maximize()
      win.show()
      marker('WINDOW_SHOWN', { window: kind, mode: isDarwin ? 'simple_fullscreen' : 'maximized' })
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
  const portrait = selectPortraitDisplay(displays, screen.getPrimaryDisplay().id)
  const mirrorDisplay = screen.getDisplayMatching(mirror.getBounds())
  for (const display of displays) marker('PHASE4_QA_DISPLAY_CANDIDATE', {
    display: display.id, width: display.bounds.width, height: display.bounds.height,
    mirror: display.id === mirrorDisplay.id ? 'yes' : 'no',
  })
  if (!editorOnly && (portrait === null || portrait.bounds.height <= portrait.bounds.width || mirrorDisplay.id !== portrait.id)) {
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
    console_display: consoleDisplay?.id ?? 0, status: editorOnly ? 'mirror_not_executed' : 'portrait_verified' })
  if (process.env['MIRROR_PHASE4_QA_MANUAL'] === '1') {
    marker('PHASE4_QA_MANUAL', { status: 'ready', evidence: 'not_executed' })
    return
  }
  const evidence: Record<string, unknown>[] = []
  const finish = async (result: MarkerFields, code: number): Promise<void> => {
    try {
      await writeFile(join(outputDir, '..', 'evidence.json'), JSON.stringify({
        platform: process.platform,
        mode: editorOnly ? 'editor' : process.env['MIRROR_PHASE4_QA_CONSOLE'] === '1' ? 'console' : 'avatar_scenes',
        live: process.env['MIRROR_PHASE4_QA_LIVE'] === '1',
        display: { count: displays.length, mirror: portrait?.id, width: portrait?.bounds.width,
          height: portrait?.bounds.height, verified: !editorOnly, console: consoleDisplay?.id },
        result, evidence,
        humanAcceptance: 'not_executed', physicalHardware: 'not_executed',
      }, null, 2))
      exitWithMarker('PHASE4_QA_RESULT', result, code)
    } catch {
      exitWithMarker('PHASE4_QA_RESULT', { status: 'failed', reason: 'phase4_qa_evidence_write_failed' }, 2)
    }
  }
  void runPhase4Qa({
    runtime,
    mirror,
    console: consoleWindow,
    outputDir,
    musicOnly: process.env['MIRROR_PHASE4_QA_MUSIC_ONLY'] === '1',
    live: process.env['MIRROR_PHASE4_QA_LIVE'] === '1',
    lifecycleLive: process.env['MIRROR_PHASE4_QA_LIFECYCLE_LIVE'] === '1',
    consoleOnly: process.env['MIRROR_PHASE4_QA_CONSOLE'] === '1',
    editorOnly,
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
  initializeAudioPreferences(join(app.getPath('userData'), 'audio-devices.json'))
  const credentialSource = createEnvironmentCredentialSource()
  const clientSecretBroker = createClientSecretBroker({
    credentialStore: credentialSource,
    events: deferredCredentialEvents.sink,
  })

  const runtime: BootRuntime = bootSequence({
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
      release: () => wakeSupervisor?.release() ?? Promise.resolve({
        status: 'success' as const,
        reason: 'wake_microphone_not_configured',
      }),
      acquire: () => wakeSupervisor?.acquire() ?? Promise.resolve({
        status: 'success' as const,
        reason: 'wake_microphone_not_configured',
      }),
    },
    validateWakeConfig: async (wake) => (await loadWakeModelPackage({
      rootDirectory: wakeModelRoot(),
      wake,
      platform: `${process.platform}-${process.arch}`,
    })).ok,
    validateSceneAssets: async (config) => {
      for (const asset of config.visualAssets) {
        await verifyManagedVisualAsset({ asset, storageDir: join(app.getPath('userData'), 'assets', 'visual') })
      }
      return true
    },
    dispatchRealtimeRuntimeCommand: (command) =>
      dispatchMirrorRealtimeRuntimeCommand(command, windows),
  })
  deferredCredentialEvents.install(runtime.telemetry)
  bootRuntime = runtime
  const visualStorageDir = join(app.getPath('userData'), 'assets', 'visual')
  const visualAssetManager = createVisualAssetManager({ storageDir: visualStorageDir })
  const verifyPlaybackVisual = createVisualPlaybackVerifier()
  // Imported-but-unsaved assets can be previewed without publishing the draft.
  const importedPreviews = new Map<string, ImportedMedia>()
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
  protocol.handle('magic-mirror-media', async (request) => {
    try {
      await visualAssetReady
      if (phase4QaEnabled) marker('PHASE4_MEDIA_PROTOCOL', { stage: 'request', status: 'received' })
      const url = new URL(request.url)
      const opaqueId = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(opaqueId)) {
        return new Response(null, { status: 404 })
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
  sceneRuntimeControl = registerIpcHandlers({
    ipcMain,
    runtime,
    console: runtime.console,
    windows,
    telemetry: runtime.telemetry,
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
  runtime.subscribe((snapshot) => {
    const previousLifecycle = mainLifecycle
    mainLifecycle = snapshot.lifecycle
    if (previousLifecycle === 'active' && snapshot.lifecycle !== 'active') {
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
  if (shutdownPromise !== null) return shutdownPromise
  const runtime = bootRuntime
  if (runtime === null) {
    shutdownPromise = Promise.resolve()
    return shutdownPromise
  }

  shutdownPromise = Promise.resolve()
    .then(() => sceneRuntimeControl?.stopAll())
    .then(() => wakeSupervisor?.shutdown())
    .then(() => runtime.shutdown())
    .catch(() => {
      marker('SHUTDOWN_FAILED', { reason: 'shutdown_rejected' })
    })
  return shutdownPromise
}

function stopQuitResources(): void {
  if (quitResourcesStopped) return
  quitResourcesStopped = true
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
