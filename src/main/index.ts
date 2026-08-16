import { basename, join } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, type WebContents } from 'electron'
import { BOOT_RENDERER_READY_CHANNEL, type MirrorWindowKind } from '../shared/bridge'
import type { LifecycleState } from '../shared/types'
import { formatMarker, marker } from './log'
import { evaluateSmoke, parseSmokeMode, type SmokeState } from './smoke'

const isDarwin = process.platform === 'darwin'
const CONSOLE_SHORTCUT = 'CommandOrControl+Shift+D'
/** Never let a stalled stdout pipe turn a smoke run into a hang. */
const EXIT_FLUSH_TIMEOUT_MS = 500

const smokeMode = parseSmokeMode(process.env['MIRROR_SMOKE_MS'])
/** In smoke mode the windows load but stay off-screen so repeated runs do not hijack the desktop. */
const headless = smokeMode.kind === 'on'

const windows = new Map<MirrorWindowKind, BrowserWindow>()
/** Per-webContents so a recreated window reports readiness again. */
const readyReported = new WeakSet<WebContents>()

const boot: { lifecycle: LifecycleState; loaded: Record<MirrorWindowKind, boolean> } = {
  // Task 2 owns the real machine; Task 1 only needs "did we leave starting".
  lifecycle: 'starting',
  loaded: { mirror: false, console: false }
}

function rendererEntry(kind: MirrorWindowKind): { url?: string; file?: string } {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer !== undefined && devServer !== '') return { url: `${devServer}/${kind}/index.html` }
  return { file: join(__dirname, `../renderer/${kind}/index.html`) }
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
      if (headless) {
        marker('WINDOW_KEPT_HIDDEN', { window: kind, reason: 'smoke_mode' })
        return
      }
      if (isDarwin) win.setSimpleFullScreen(true)
      else win.maximize()
      win.show()
    })
  }

  const entry = rendererEntry(kind)
  if (entry.url !== undefined) void win.loadURL(entry.url)
  else void win.loadFile(entry.file as string)

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
  else marker('SHORTCUT_REGISTER_FAILED', { accelerator: CONSOLE_SHORTCUT, reason: 'already_taken' })
}

function exitAfterFlush(line: string, code: number): void {
  let exited = false
  const quit = (): void => {
    if (exited) return
    exited = true
    app.exit(code)
  }
  process.stdout.write(line, quit)
  setTimeout(quit, EXIT_FLUSH_TIMEOUT_MS)
}

function finishSmokeRun(): void {
  const verdict = evaluateSmoke(boot as SmokeState)
  exitAfterFlush(formatMarker('SMOKE_RESULT', { exit: verdict.exitCode, reason: verdict.reason }), verdict.exitCode)
}

void app.whenReady().then(() => {
  marker('MAIN_READY', {
    electron: process.versions.electron,
    platform: process.platform,
    smoke: smokeMode.kind
  })

  if (smokeMode.kind === 'invalid') {
    exitAfterFlush(
      formatMarker('SMOKE_CONFIG_INVALID', { raw: smokeMode.raw, reason: 'mirror_smoke_ms_not_a_positive_number' }),
      2
    )
    return
  }

  ipcMain.on(BOOT_RENDERER_READY_CHANNEL, (event) => onRendererReady(event.sender))
  createWindows()
  registerConsoleShortcut()

  if (smokeMode.kind === 'on') setTimeout(finishSmokeRun, smokeMode.ms)
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (!isDarwin) app.quit()
})
