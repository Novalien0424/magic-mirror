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

### USB camera recovery

The [camera lifecycle owner](../../../../src/main/camera/lifecycle.ts) follows
Main's activating/active state and Mirror renderer readiness. Sleeping/offline/
maintenance avatars have no native camera worker or camera watchdog timer.
Release on suspending or renderer replacement; serialize reacquisition after
child exit, and discard late permission grants after sleep/shutdown. Runtime
camera checks while asleep return unavailable; explicit native QA remains a
separately owned diagnostic. Camera failure must not gate voice activation.

The owner requires application-owned recovery (DECISIONS 2026-10-11); do not
delegate it to a physical unplug/replug. Rebuilding AVCaptureSession alone does
not reset a wedged USB device. Release the camera owner before a targeted USB
reset/re-enumeration, rediscover it, then verify fresh native frames and a
RAM-only requested snapshot. A successful reset call is not capture acceptance.
Bound attempts and back off; permission/device/reset failures stay metadata-only
and must not interrupt the Jabra, unrelated USB devices or conversation. Do not
kill system-wide media services or restart Electron as a camera recovery path.

Implementation: Main's [tracker](../../../../src/main/camera/tracker.ts) retains
the two-attempt budget across worker replacement, spaces attempts by 10 seconds
and rearms only after 30 seconds of fresh frames. The native helper releases
AVCapture before [USB re-enumeration](../../../../deploy/macos/camera-usb-reset.c),
matching location/vendor/product from the selected AVFoundation device against
exactly one IOKit device. No hub reset, interface seizure or elevation is used.
The installed Mac's user-level call has been measured; do not assume every Mac
permits it. Apple documents the API in
[IOUSBLib](https://github.com/apple-oss-distributions/IOUSBFamily/blob/main/IOUSBFamily/Headers/IOUSBLib.h).
Reset completion is degraded until new frames arrive. Oversized UVC frames are
scaled to the snapshot contract's 1280-pixel limit before JPEG encoding.
While the avatar owns the camera, Main requests recovery after 2.5 seconds without native frame receipts, sampled
every 500 ms. Heartbeats and delayed Vision results do not extend that deadline.
Startup/re-enumeration have a separate native grace period; permission denial
and device absence disarm the old stream deadline. The native QA stall begins
after successful delivery and records detection-to-reset and reset-to-frame time.
After USB reset, schedule rediscovery when the two-second grace ends instead of
adding another periodic-watchdog interval. Recovery QA must wait for reset and
fresh readiness before counting its six post-reset requested snapshots.
A pending snapshot can wait at most 15 seconds through an existing recovery and
retry once after fresh delivery. The wait does not grant another USB reset;
concurrent requests, shutdown, permission loss and device absence remain bounded.
Requests arriving between worker exit and replacement also join that wait.
Exhausting the USB budget settles pending captures and rejects new captures
immediately until fresh frames return; do not add another full recovery timeout.
A capture while the helper is retiring fails fast (`camera_snapshot_worker_retiring`)
and joins that wait. A watchdog tick more than 1 s late (Main stall, sleep) defers
once so queued helper output is read before judging staleness. The USB reset is
deferred, without spending budget, while the conversation microphone (selected
label, else system default) is the camera's own microphone or unknown
(`camera_usb_reset_deferred_microphone` / `_microphone_unknown`, 10 s recheck); a
wedged helper is still replaced. The helper reads stdin on its own thread and
exits on EOF (forced after 2 s if its queue is wedged), so it cannot outlive Main.
Dormant publishes camera `ready` with `camera_avatar_inactive`, not the last
Active status.
AVCapture's dropped-frame callback reports late frames, buffer exhaustion and
discontinuities; a drop alone must not clear otherwise fresh gaze or reset USB.
USB payload rejection can occur below that callback. Diagnose it with bounded
`UVCAssistant` complete-frame/invalid-payload counters, without retaining raw
driver logs or identifiers. Reset receipts and a few initial frames do not
establish a stable stream; see the [reliability investigation](../../../../docs/testing/camera-reliability-2026-10-13.md).
On the deployed Arducam, hold `lockForConfiguration` through session commit and
`startRunning`, then release it: macOS otherwise overwrites the chosen format.
VGA YUY2 at its exact near-15-fps duration passed the Oct 11 test. Early Oct 13
retests still stalled after reset; the final 12-snapshot test and a physical
Realtime request recovering through a stall passed after the bounded capture
wait repair. These passes establish recovery, not stall elimination or a soak.
Output conversion remains NV12. See Apple's
[format guidance](https://developer.apple.com/documentation/avfoundation/capture-device-formats).
Copy a single frame into owned RAM before asynchronous Vision analysis rather
than retaining the driver's capture pool. Apple's
[frame-drop guidance](https://developer.apple.com/library/archive/technotes/tn2445/_index.html)
explains the buffer-starvation risk; this does not identify every stall's cause.
Keep capture delivery separate from bounded Vision work; heartbeat liveness
alone does not establish fresh frames. The `camera_native` QA mode now checks
six RAM-only snapshots spaced five seconds apart, then an injected stall and
six further snapshots, five seconds apart, after real USB re-enumeration. Retain frame-gap and dimension
metadata, never images. [Field evidence](../../../../docs/testing/realtime-field-followup-2026-10-11.md).
Latest retest: [Oct 12–13 ledger](../../../../docs/testing/realtime-retest-2026-10-12.md).

The reset-command deadline is independent of helper heartbeat: after four seconds
without completion, retire the blocked helper and await its close. A replacement
uses the next bounded attempt to reset before capture, preserving ten-second
spacing. Never launch another camera owner while the old process remains alive.
For processing isolation, `camera_delivery` bypasses Vision/copy/JPEG in the same
signed helper and LaunchAgent route. A standalone Swift process with different
launch/signing context is not an equivalent control. Require advancing source
timestamps and a complete stable window; reset receipts alone do not count.
Current driver/device limits: [focused research](../../../../docs/testing/focused-research-2026-10-13.md).
