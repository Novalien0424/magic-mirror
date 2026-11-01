// Runs the recorder as a child of Electron so it uses Electron's existing Microphone permission.
const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
if (app.dock) app.dock.hide();
app.whenReady().then(() => {
  const argv = process.argv; const i = argv.indexOf('--mm-rec');
  const [bin, ...args] = argv.slice(i + 1);
  const log = fs.openSync(args[args.indexOf('--out') + 1] + '.log', 'w');
  const child = spawn(bin, args, { stdio: ['ignore', log, log] });
  child.on('exit', (code) => app.exit(code ?? 0));
});
