# BrowserWindows, workers and the deployed Mac

Installed code, current DECISIONS and contract tests outrank version notes here.

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

## Crash recovery under the LaunchAgent

The LaunchAgent restarts on crash and respects a clean quit; login items give no
supervision. In-app recovery handles `render-process-gone` (recreate the window;
a failure state must not look like black Dormant) and `child-process-gone`; see
[crash-recovery](../../../../src/main/crash-recovery.ts).

## Workers

- Node wake worker: `utilityProcess.fork(modulePath, args, { serviceName,
  stdio: 'pipe' })` (only after `app.ready`; child replies via
  `process.parentPort`).
- Native camera child for gaze and `capture_camera`: Main spawns it through
  `child_process` ([tracker](../../../../src/main/camera/tracker.ts)). A planned
  Python face worker would also use `child_process.spawn` (utilityProcess is
  Node-only). **Drain stdout/stderr or the child deadlocks on a full pipe.**
- TCC: inspect the actual app/helper signing and launch chain, required
  `NSMicrophoneUsageDescription` / `NSCameraUsageDescription`, and applicable
  hardened-runtime entitlements. Do not assume a parent's grant covers every
  helper or another launch context. Read `getMediaAccessStatus` and request access
  before native capture; separately measure delivered samples. Zero PCM alone
  does not prove denial, and missing usage descriptions are not universally a
  silent failure. [Electron permission API](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos).
  Surface bounded permission/device reasons without retry loops. See
  [physical wake evidence](../../mm-wake-word/references/handoff-platform.md).
