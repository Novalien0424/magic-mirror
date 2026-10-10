# Windows, workers and the deployed Mac

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Kiosk windows

- Visitor window: `simpleFullscreen: true` (macOS pre-Lion fullscreen -- no
  Space transition; don't mix `kiosk:true` with `setFullScreen()`),
  `alwaysOnTop`, CSS `cursor: none` (takes effect on next mouse move; no API).
- Native `setFullScreen()` transitions are async; use their completion events.
  `setSimpleFullScreen()` uses macOS's separate pre-Lion mode, so do not wait for
  a native Space-transition event there. [Electron window API](https://www.electronjs.org/docs/latest/api/browser-window).
- `powerSaveBlocker.start('prevent-display-sleep')` while app runs.
- Console window: separate `BrowserWindow`, positioned via
  `screen.getAllDisplays()`, opened by shortcut/hot-corner from any state.

## Auto-start & Crash Recovery (pick ONE restart owner)

- Supervisor: user **LaunchAgent plist with `KeepAlive = {SuccessfulExit =
  false}`** -- launchd relaunches on crash, respects clean quit. Login items
  give no supervision.
- Because launchd owns restarts: in-app recovery is `app.on('render-process-gone')`
  (reasons: `crashed|oom|...` -> recreate the window, never leave a black
  screen) and `child-process-gone`; after one failed renderer recreation
  `app.exit(1)` and let launchd restart. **Do not also call `app.relaunch()`
  -- the two restart mechanisms fight.**

## Workers

- Node wake worker: `utilityProcess.fork(modulePath, args, { serviceName,
  stdio: 'pipe' })` (official recommendation; only after `app.ready`;
  child replies via `process.parentPort`).
- Python face worker: `child_process.spawn` (utilityProcess is Node-only).
  **Drain stdout/stderr or the child deadlocks on a full pipe.**
- TCC: inspect the actual app/helper signing and launch chain, required
  `NSMicrophoneUsageDescription` / `NSCameraUsageDescription`, and applicable
  hardened-runtime entitlements. Do not assume a parent's grant covers every
  helper or another launch context. Read `getMediaAccessStatus` and request access
  before native capture; separately measure delivered samples. Zero PCM alone
  does not prove denial, and missing usage descriptions are not universally a
  silent failure. [Electron permission API](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos).
  Surface bounded permission/device reasons without retry loops. See
  [physical wake evidence](../../mm-wake-word/references/handoff-platform.md).
