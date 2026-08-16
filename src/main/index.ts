import { basename, join } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, type WebContents } from 'electron'
import { BOOT_RENDERER_READY_CHANNEL, type MirrorWindowKind } from '../shared/bridge'
import type { LifecycleState } from '../shared/types'
import { createCrashRecovery } from './crash-recovery'
import { formatMarker, marker, type MarkerFields } from './log'
import { evaluateSmoke, parseSmokeMode } from './smoke'

const isDarwin = process.platform === 'darwin'
const CONSOLE_SHORTCUT = 'CommandOrControl+Shift+D'
/** Never let a stalled stdout pipe turn a smoke run into a hang. */
const EXIT_FLUSH_TIMEOUT_MS = 500

const smokeMode = parseSmokeMode(process.env['MIRROR_SMOKE_MS'])
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

const boot: { lifecycle: LifecycleState; loaded: Record<MirrorWindowKind, boolean> } = {
  // Task 2 owns the real machine; Task 1 only needs "did we leave starting".
  lifecycle: 'starting',
  loaded: { mirror: false, console: false }
}

type RendererEntry = { readonly from: 'dev-server'; readonly url: string } | { readonly from: 'file'; readonly file: string }

function rendererEntry(kind: MirrorWindowKind): RendererEntry {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer !== undefined && devServer !== '') return { from: 'dev-server', url: `${devServer}/${kind}/index.html` }
  return { from: 'file', file: join(__dirname, `../renderer/${kind}/index.html`) }
}

function windowOptions(kind: MirrorWindowKind): Electron.BrowserWindowConstructorOptions {
  const shared: Electron.BrowserWindowConstructorOptions = {
    show: false,
    webPreferences: {
      preload: join(__dirname, `../preload/${kind}.js`),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
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

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    marker('WINDOW_LOAD_FAILED', { window: kind, error_code: errorCode, reason: errorDescription })
  })

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    // No silent failure: a preload that threw means a renderer with no bridge.
    marker('PRELOAD_ERROR', { window: kind, file: basename(preloadPath), reason: error.message })
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
  if (kind === 'mirror' && boot.lifecycle === 'starting') {
    boot.lifecycle = 'dormant'
    marker('LIFECYCLE', { from: 'starting', to: 'dormant' })
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
    // The supervisor (macOS LaunchAgent KeepAlive) owns app restarts — never app.relaunch().
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
    app.exit(code)
  }
  process.stdout.write(formatMarker(name, fields), quit)
  setTimeout(quit, EXIT_FLUSH_TIMEOUT_MS)
}

function finishSmokeRun(): void {
  const verdict = evaluateSmoke(boot)
  exitWithMarker('SMOKE_RESULT', { exit: verdict.exitCode, reason: verdict.reason }, verdict.exitCode)
}

void app.whenReady().then(() => {
  marker('MAIN_READY', {
    electron: process.versions.electron,
    platform: process.platform,
    smoke: smokeMode.kind
  })

  if (smokeMode.kind === 'invalid') {
    exitWithMarker('SMOKE_CONFIG_INVALID', { raw: smokeMode.raw, reason: 'mirror_smoke_ms_not_a_positive_number' }, 2)
    return
  }

  ipcMain.on(BOOT_RENDERER_READY_CHANNEL, (event) => onRendererReady(event.sender))
  app.on('render-process-gone', (_event, contents, details) => onRenderProcessGone(contents, details))
  createWindows()
  registerConsoleShortcut()

  if (smokeMode.kind === 'on') setTimeout(finishSmokeRun, smokeMode.ms)
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (!isDarwin) app.quit()
})
