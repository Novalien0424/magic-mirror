# Main process, lifecycle and persistence

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Process Model & IPC

- Renderer sandbox is default-on; never set `nodeIntegration: true` (it
  silently disables the sandbox). Preload exposes a narrow typed API via
  `contextBridge.exposeInMainWorld`; `ipcRenderer` cannot be passed wholesale
  (Electron >=29).
- Two-way calls: `ipcMain.handle` + `ipcRenderer.invoke`. No official typed
  helper exists -- hand-roll a channel-map type or use
  `@electron-toolkit/typed-ipc`.
- **Validate `event.senderFrame`/`webContents.id` in every handler** so the
  visitor window can never call console/admin channels. Main owns lifecycle,
  config, SQLite, devices; renderers never open the DB (Spec Section 3.2).

## Lifecycle State Machine

`xstate@5.x` (stable; `setup().createMachine()` + `createActor`; TS >=5.0) in
Main, modeling ONLY the seven states: Starting, Dormant, Activating, Active,
Suspending, OfflineLoop, Maintenance. No parallel regions, no identity
epochs. Console is a second window, not a state.

## SQLite

**Use `node:sqlite`** -- works in Electron main since 36 (issue #47706 fixed);
zero native deps, no rebuild, no notarization surface. Preserve the installed Electron pin; replacing SQLite is a separate architecture decision.

```ts
import { DatabaseSync, backup } from 'node:sqlite';
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');          // WAL is a pragma, not an option
await backup(db, backupPath, { rate: 4 });     // online backup for Console button
// VACUUM INTO 'path' also works via exec()
```

electron-vite externalizes trap: add `node:sqlite` to the main config's
rollup `external` or it breaks the build.

## Config Files

`active.json`/`draft.json`/`previous.json` with draft -> schema validation ->
temp write -> atomic replace. Use `write-file-atomic@8` (does fsync +
rename + signal-exit cleanup) -- hand-rolled versions usually forget the
**directory** fsync around rename. Validation failure keeps `previous.json`
and shows the exact field error in Console; an invalid scene block must not
block anonymous Voice startup (Spec Section 13.3).

## Gotchas

- Cubism Core (Phase 3) loads as a global script, not an ES module -- plan
  CSP/bundler handling early.
- OfflineLoop video: verify decodability at Starting; a corrupt asset falls
  back to the built-in Maintenance still, never black (Spec Section 9.3).
