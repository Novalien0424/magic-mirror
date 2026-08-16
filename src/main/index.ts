import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

const isDarwin = process.platform === 'darwin'

function rendererTarget(window: 'mirror' | 'console'): { url?: string; file?: string } {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer !== undefined && devServer !== '') return { url: `${devServer}/${window}/index.html` }
  return { file: join(__dirname, `../renderer/${window}/index.html`) }
}

function load(win: BrowserWindow, window: 'mirror' | 'console'): void {
  const target = rendererTarget(window)
  if (target.url !== undefined) void win.loadURL(target.url)
  else void win.loadFile(target.file as string)
}

function createMirrorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    backgroundColor: '#05070a',
    // macOS kiosk fullscreen; the Windows dev machine maximizes a frameless window.
    ...(isDarwin ? { simpleFullscreen: true, alwaysOnTop: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/mirror.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.once('ready-to-show', () => {
    if (isDarwin) win.setSimpleFullScreen(true)
    else win.maximize()
    win.show()
  })

  load(win, 'mirror')
  return win
}

function createConsoleWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    backgroundColor: '#101418',
    title: 'Magic Mirror Console',
    webPreferences: {
      preload: join(__dirname, '../preload/console.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  load(win, 'console')
  return win
}

void app.whenReady().then(() => {
  createMirrorWindow()
  createConsoleWindow()
})

app.on('window-all-closed', () => {
  if (!isDarwin) app.quit()
})
