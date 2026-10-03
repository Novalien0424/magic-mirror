// Canonical Windows Electron only. Synthetic signals and metadata; no provider/mic.
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, '.artifacts/voice-effects/proof');
if (!process.versions.electron) {
  if (process.platform !== 'win32' || root.toLowerCase() !== 'c:\\project\\magic-mirror') throw Error('canonical_windows_required');
  (async () => {
    fs.mkdirSync(path.join(dir, 'mirror'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'voice-effects'), { recursive: true });
    fs.copyFileSync(path.join(root, 'node_modules/signalsmith-stretch/SignalsmithStretch.mjs'), path.join(dir, 'voice-effects/SignalsmithStretch.mjs'));
    fs.copyFileSync(path.join(root, 'tests/fixtures/voice-effects-meter.js'), path.join(dir, 'mirror/meter.js'));
    await require('esbuild').build({ entryPoints: [path.join(root, 'tests/fixtures/voice-effects-proof.ts')], bundle: true, format: 'esm', platform: 'browser', outfile: path.join(dir, 'mirror/proof.mjs') });
    fs.writeFileSync(path.join(dir, 'mirror/index.html'), `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; media-src 'self' blob:; connect-src 'self'"><body>Voice effects synthetic QA<script type="module" src="./proof.mjs"></script></body>`);
    const result = require('node:child_process').spawnSync(path.join(root, 'node_modules/electron/dist/electron.exe'), [__filename], { cwd: root, encoding: 'utf8', windowsHide: true });
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 2);
  })().catch(error => { console.error(error); process.exit(2); });
} else {
  const { app, BrowserWindow, session } = require('electron');
  app.setPath('userData', path.join(dir, 'user-data'));
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  const deadline = setTimeout(() => app.exit(2), 60000);
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    await window.loadFile(path.join(dir, 'mirror/index.html'));
    const result = await window.webContents.executeJavaScript('window.voiceProof()');
    const report = { at: new Date().toISOString(), electron: process.versions.electron, chrome: process.versions.chrome, ...result };
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); clearTimeout(deadline); window.destroy(); app.exit(result.passed ? 0 : 1);
  }).catch(error => { console.error(error); app.exit(2); });
}
