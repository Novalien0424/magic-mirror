import { basename, join, resolve } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, powerSaveBlocker, type WebContents } from 'electron'
import { BOOT_RENDERER_READY_CHANNEL, type MirrorWindowKind } from '../shared/bridge'
import type { LifecycleState } from '../shared/types'
import { bootSequence, type BootRuntime } from './boot'
import { createCrashRecovery } from './crash-recovery'
import { createDisplaySleepBlocker, type DisplaySleepBlocker, type DisplaySleepBlockerEvent } from './display-sleep-blocker'
import { createEnvironmentCredentialSource } from './environment-credential-source'
import {
  dispatchMirrorRealtimeRuntimeCommand,
  publishSnapshot,
  registerIpcHandlers,
} from './ipc'
import { formatMarker, marker, type MarkerFields } from './log'
import { applyPhase0UserDataPath } from './phase0-demo-runner'
import {
  createPhase1LiveSmokeCoordinator,
  type Phase1LiveSmokeCoordinator,
  type Phase1LiveSmokeResult,
} from './phase1-live-smoke'
import {
  createClientSecretBroker,
  type ClientSecretBrokerEventSink,
} from './realtime/client-secret-broker'
import { evaluateSmoke, parseSmokeMode } from './smoke'

const isDarwin = process.platform === 'darwin'
const CONSOLE_SHORTCUT = 'CommandOrControl+Shift+D'
/** Never let a stalled stdout pipe turn a smoke run into a hang. */
const EXIT_FLUSH_TIMEOUT_MS = 500
const phase1LiveSmokeEnabled = process.env['MIRROR_PHASE1_LIVE_SMOKE'] === '1'

if (phase1LiveSmokeEnabled) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

const smokeMode = parseSmokeMode(process.env['MIRROR_SMOKE_MS'])
const phase0UserDataPath = applyPhase0UserDataPath({
  app,
  demo: process.env['MIRROR_PHASE0_DEMO'],
  smoke: smokeMode.kind === 'on' || phase1LiveSmokeEnabled,
  userDataRoot: process.env['MIRROR_PHASE0_USER_DATA_ROOT'],
  userDataDir: process.env['MIRROR_USER_DATA_DIR'],
})
/** In smoke mode the windows load but stay off-screen so repeated runs do not hijack the desktop. */
const hideWindowsForSmoke = smokeMode.kind === 'on'

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
let phase1LiveSmokeCoordinator: Phase1LiveSmokeCoordinator | null = null
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

  return {
    ...shared,
    width: 1280,
    height: 800,
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
    })
  }

  const entry = rendererEntry(kind)
  if (entry.from === 'dev-server') void win.loadURL(entry.url)
  else void win.loadFile(entry.file)

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
    },
    result.exit,
  )
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

void app.whenReady().then(() => {
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
  const credentialSource = createEnvironmentCredentialSource()
  const clientSecretBroker = createClientSecretBroker({
    credentialStore: credentialSource,
    events: deferredCredentialEvents.sink,
  })

  const runtime: BootRuntime = bootSequence({
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
    dispatchRealtimeRuntimeCommand: (command) =>
      dispatchMirrorRealtimeRuntimeCommand(command, windows),
  })
  deferredCredentialEvents.install(runtime.telemetry)
  bootRuntime = runtime

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
  registerIpcHandlers({
    ipcMain,
    runtime,
    console: runtime.console,
    windows,
    telemetry: runtime.telemetry,
    onReady: (kind) => {
      const win = windows.get(kind)
      if (win !== undefined && !win.isDestroyed()) {
        onRendererReady(win.webContents)
        if (kind === 'mirror') phase1LiveSmokeCoordinator?.onMirrorRendererReady()
      }
    },
  })
  runtime.subscribe((snapshot) => {
    mainLifecycle = snapshot.lifecycle
    boot.lifecycle = mirrorRendererReady ? snapshot.lifecycle : 'starting'
    void publishSnapshot('mirror', snapshot, windows, runtime.telemetry)
    void publishSnapshot('console', snapshot, windows, runtime.telemetry)
  })

  if (phase1LiveSmokeEnabled) {
    phase1LiveSmokeCoordinator = createPhase1LiveSmokeCoordinator({
      getSnapshot: () => runtime.snapshot(),
      getLastRealtimeRuntimeOutcomeReason: () => runtime.getLastRealtimeRuntimeOutcomeReason(),
      subscribe: (listener) => runtime.subscribe(listener),
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
