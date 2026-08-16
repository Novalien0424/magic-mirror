---
name: mm-electron-foundation
description: Use when implementing the Electron shell — main process, lifecycle state machine, mirror/console windows, IPC, SQLite, config files, credentials, auto-start, crash recovery, or spawning the wake/face workers (Phase 0, and whenever those areas change later).
---

# Electron Foundation — Magic Mirror Reference

## Overview

Verified **2026-08-16**. Pin `electron@43.x` (Chromium M150, Node 24.17;
Electron 44 lands 2026-08-25, 41 EOLs same day — plan the bump, don't ride
`latest`). Scaffold: **electron-vite 5** for dev/build + **electron-builder
or Forge** for packaging/signing. TypeScript + React renderers.

## Process Model & IPC

- Renderer sandbox is default-on; never set `nodeIntegration: true` (it
  silently disables the sandbox). Preload exposes a narrow typed API via
  `contextBridge.exposeInMainWorld`; `ipcRenderer` cannot be passed wholesale
  (Electron ≥29).
- Two-way calls: `ipcMain.handle` + `ipcRenderer.invoke`. No official typed
  helper exists — hand-roll a channel-map type or use
  `@electron-toolkit/typed-ipc`.
- **Validate `event.senderFrame`/`webContents.id` in every handler** so the
  visitor window can never call console/admin channels. Main owns lifecycle,
  config, SQLite, devices; renderers never open the DB (Spec §3.2).

## Lifecycle State Machine

`xstate@5.x` (stable; `setup().createMachine()` + `createActor`; TS ≥5.0) in
Main, modeling ONLY the seven states: Starting, Dormant, Activating, Active,
Suspending, OfflineLoop, Maintenance. No parallel regions, no identity
epochs. Console is a second window, not a state.

## SQLite

**Use `node:sqlite`** — works in Electron main since 36 (issue #47706 fixed);
zero native deps, no rebuild, no notarization surface. RC-stability, so pin
the Electron major. `better-sqlite3@13` (N-API, prebuilt) is the fallback if
an ORM adapter is ever needed.

```ts
import { DatabaseSync, backup } from 'node:sqlite';
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');          // WAL is a pragma, not an option
await backup(db, backupPath, { rate: 4 });     // online backup for Console button
// VACUUM INTO 'path' also works via exec()
```

electron-vite externalizes trap: add `node:sqlite` to the main config's
rollup `external` or it breaks the build.

## Credentials

`safeStorage` (Keychain-backed on macOS); **keytar is archived — never add
it**. Call only after `app.ready`; prefer `encryptStringAsync`/
`decryptStringAsync` (sync blocks on Keychain UI); handle `shouldReEncrypt`.
Store the encrypted blob in local data, plaintext never crosses IPC
(invariant #12). On the Windows dev machine safeStorage uses DPAPI — same
code path, no shim needed.

## Kiosk Windows

- Visitor window: `simpleFullscreen: true` (macOS pre-Lion fullscreen — no
  Space transition; don't mix `kiosk:true` with `setFullScreen()`),
  `alwaysOnTop`, CSS `cursor: none` (takes effect on next mouse move; no API).
- Fullscreen transitions are async — gate on `'enter-full-screen'` events.
- `powerSaveBlocker.start('prevent-display-sleep')` while app runs.
- Console window: separate `BrowserWindow`, positioned via
  `screen.getAllDisplays()`, opened by shortcut/hot-corner from any state.

## Auto-start & Crash Recovery (pick ONE restart owner)

- Supervisor: user **LaunchAgent plist with `KeepAlive = {SuccessfulExit =
  false}`** — launchd relaunches on crash, respects clean quit. Login items
  give no supervision.
- Because launchd owns restarts: in-app recovery is `app.on('render-process-gone')`
  (reasons: `crashed|oom|...` → recreate the window, never leave a black
  screen) and `child-process-gone`; after N failures in a window just
  `app.exit(1)` and let launchd restart. **Do not also call `app.relaunch()`
  — the two restart mechanisms fight.**

## Workers

- Node wake worker: `utilityProcess.fork(modulePath, args, { serviceName,
  stdio: 'pipe' })` (official recommendation; only after `app.ready`;
  child replies via `process.parentPort`).
- Python face worker: `child_process.spawn` (utilityProcess is Node-only).
  **Drain stdout/stderr or the child deadlocks on a full pipe.**
- TCC: mic/camera permission attributes to the parent .app bundle — put
  `NSMicrophoneUsageDescription` + `NSCameraUsageDescription` in Info.plist
  and `com.apple.security.device.audio-input`/`.camera` entitlements with
  hardenedRuntime; grants then cover spawned children. A missing key =
  **silent denial, no dialog** — the #1 "camera looks broken" cause. The
  Console Audio/Camera cards display TCC authorization status explicitly
  (Spec §6.2) so permission denial and dead hardware are distinguishable;
  surface as `Degraded`, don't retry-loop.

## Config Files

`active.json`/`draft.json`/`previous.json` with draft → schema validation →
temp write → atomic replace. Use `write-file-atomic@8` (does fsync +
rename + signal-exit cleanup) — hand-rolled versions usually forget the
**directory** fsync around rename. Validation failure keeps `previous.json`
and shows the exact field error in Console; an invalid scene block must not
block anonymous Voice startup (Spec §13.3).

## Gotchas

- Cubism Core (Phase 3) loads as a global script, not an ES module — plan
  CSP/bundler handling early.
- macOS 26 GPU lag bug is fixed in Electron ≥38.2 — another reason for 43.
- OfflineLoop video: verify decodability at Starting; a corrupt asset falls
  back to the built-in Maintenance still, never black (Spec §9.3).
