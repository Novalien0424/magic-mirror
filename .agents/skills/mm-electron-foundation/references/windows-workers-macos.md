# Windows, workers and the later macOS port

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Kiosk Windows

- Visitor window: `simpleFullscreen: true` (macOS pre-Lion fullscreen -- no
  Space transition; don't mix `kiosk:true` with `setFullScreen()`),
  `alwaysOnTop`, CSS `cursor: none` (takes effect on next mouse move; no API).
- Fullscreen transitions are async -- gate on `'enter-full-screen'` events.
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
- TCC: mic/camera permission attributes to the parent .app bundle -- put
  `NSMicrophoneUsageDescription` + `NSCameraUsageDescription` in Info.plist
  and `com.apple.security.device.audio-input`/`.camera` entitlements with
  hardenedRuntime; grants then cover spawned children. A missing key =
  **silent denial, no dialog** -- the #1 "camera looks broken" cause. The
  Console Audio/Camera cards display TCC authorization status explicitly
  (Spec Section 6.2) so permission denial and dead hardware are distinguishable;
  surface as `Degraded`, don't retry-loop.
