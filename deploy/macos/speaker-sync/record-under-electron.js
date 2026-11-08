// Runs the recorder as a child of Electron so it uses Electron's existing Microphone permission.
const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
if (app.dock) app.dock.hide();
app.whenReady().then(() => {
  const argv = process.argv; const i = argv.indexOf('--mm-rec');
  const [bin, ...args] = argv.slice(i + 1);
  const prefix = args[args.indexOf('--out') + 1];
  const log = fs.openSync(prefix + '.log', 'w');
  const owner = prefix + '.owner.json';
  const child = spawn(bin, args, { stdio: ['ignore', log, log] });
  child.once('spawn', () => fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, childPid: child.pid })));
  let finished = false;
  const finish = code => {
    if (finished) return;
    finished = true;
    fs.rmSync(owner, { force: true });
    fs.closeSync(log);
    app.exit(code);
  };
  child.once('error', () => finish(1));
  child.once('exit', code => finish(code ?? 1));
  // A cancelled measurement must release its physical microphone too.
  const stop = () => child.kill('SIGTERM');
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  app.once('before-quit', stop);
});
