# Stream Deck Neo start/stop delivery — 2026-10-17

The owner requested good start and clean stop scripts, two buttons on the
connected Neo, and current vendor software/firmware. Implemented and installed
on the canonical Mac mini; no production model, TV policy, dependency or phase
change. Original Elgato Default Profile and prior repository edits are preserved.

## Installed configuration

- Stream Deck **7.6.0 (23012)** from the [official vendor download](https://www.elgato.com/us/en/s/downloads).
  Package SHA-256 matched the published package metadata; `pkgutil` verified
  Corsair Memory, Inc. (Y93VXCB8Q5), and `spctl` accepted its notarization.
  The app's own update check confirmed it is the latest version.
- Neo firmware **1.00.013 → 1.00.017**, official in-app update successful;
  no further firmware update was offered afterward.
- Elgato login startup enabled. **Magic Mirror** selected profile persisted
  after a real app quit/relaunch. Top-row key 1 is green START MIRROR; key 2 is
  red STOP MIRROR. Both use the documented built-in
  [System/Open action](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia).
- Two local, ad-hoc signed application wrappers are installed under
  `~/Applications/Magic Mirror Controls`. They call canonical executable shell
  scripts without opening Terminal. No third-party plugin or remapper installed.
- [Setup/reinstall guide](../../deploy/macos/stream-deck.md),
  [script behavior and limits](../../deploy/macos/raven-button.md), and
  [installation verification](../../.artifacts/stream-deck-2026-10-17/installation-verification.json).

## Implementation

Reuse the existing serialized queue and Electron operation lease. Start uses
the installed LaunchAgent, remains idempotent, and does not build on each press.
Stop sends one TERM, permits Main's graceful cleanup, unloads the job, and verifies
job absence plus captured process-family disappearance. Initial PID-less crash
gaps, failed TERM, and observed restarts cannot be mistaken for an already-stopped
app. Launchd remains the only restart/forced-cleanup owner; no broad process kill.
Queue publication is atomic, failed operations do not become successful debounce
state, and failed feedback/spawn paths have metadata reasons.

Real frozen-Main testing exposed an initial **`stop_failed` after 25.431 s**:
`bootout` can return while the removing job is still visible during the field
plist's existing 20-second exit timeout. The final implementation shares a
bounded grace period between job disappearance and child cleanup. The overall
stop budget is 55 seconds; an ordinary clean stop does not wait through it.
The failure is retained in
[frozen-stop-result.json](../../.artifacts/stream-deck-2026-10-17/frozen-stop-result.json).

## Fresh verification

| Check | Result |
| --- | --- |
| Assigned START application → actual field LaunchAgent → Mirror renderer ready | Passed |
| Duplicate START | Same Main PID; duplicate debounced |
| Assigned STOP application | Clean exit/unloaded; zero canonical app/camera processes |
| Duplicate STOP | Safely debounced |
| Rapid STOP then START | Ordered `stopped`, then `started` |
| Final clean stop and 30-second no-restart interval | Passed |
| Deliberately SIGSTOP-frozen Main, final implementation | `stopped_forced` in **46.200 s**, job absent and **zero app processes** |
| Start again after forced shutdown, then clean stop | Passed; start **448 ms**, stop **1060 ms** |
| Focused lifecycle and operation-lease tests | **37 passed**, 2 files, exit 0 |
| JS/shell/Python syntax; installer repeat; signatures | Passed |
| Existing stamped build verification | Passed; runtime source unchanged |
| Imported layout and persistence after Elgato app relaunch | Visually checked; both labeled keys present |

Normal stop samples took approximately 1–3 seconds. Start timing above measures
the queued launcher result, not full visitor readiness; renderer readiness was
checked separately in the first case. Unit tests additionally cover initial and
post-TERM restart gaps, failed probes, PID reuse/zombies, remaining children, and
bounded timeouts. No full suite or unrelated Realtime QA was needed.

Evidence: [normal lifecycle](../../.artifacts/stream-deck-2026-10-17/live-controls-results.json),
[frozen retry](../../.artifacts/stream-deck-2026-10-17/frozen-stop-retest.json),
[post-fault recovery](../../.artifacts/stream-deck-2026-10-17/post-fault-recovery.json),
[focused tests](../../.artifacts/stream-deck-2026-10-17/controls-tests-final.log),
[build](../../.artifacts/stream-deck-2026-10-17/build-check.json),
[worker detail](../../.artifacts/stream-deck-2026-10-17/lifecycle-worker.md).
The root's subsequent real-test fix supersedes the worker's immediate job-absence
check. The initial local app installer also failed because its fresh AppleScript
bundle had no CFBundleIdentifier; changing Set to Add fixed it, and repeat
installation passed. Its [failure log](../../.artifacts/stream-deck-2026-10-17/controls-install-initial-failure.log)
is retained.

## Acceptance limits and final state

These live tests launch the exact applications stored in the Stream Deck key
assignments through macOS LaunchServices. They do **not** synthesize a physical
Neo key press. The owner subsequently confirmed that the physical START/STOP
buttons work. That is owner evidence, not an agent-synthesized key press.
USB reconnect, cold-login,
and an active media/conversation stop were not separately exercised in this
feature test. No raw conversation, audio, images, credentials, process arguments,
or device serial is retained in the evidence.

After automated tests Magic Mirror is stopped and its user job unloaded; the
installed plist remains for explicit START or ordinary login. Elgato remains
running with the Magic Mirror profile selected. User interaction after the tests
may intentionally change the app's state.

## Follow-up — reflective TV standby and HDMI wake

The owner chose **TV standby** to prevent the macOS desktop remaining visible
after STOP, then asked whether standby is full power-off. It is not: actual
board readings are Asleep/display OFF, wired ADB stays responsive, and boot count
remains 54 across sleep/wake. Wattage was not measured. The Mac remains running.
Full Android shutdown or removal of mains power requires a separately proven
wake method. No black-backdrop app, wallpaper change or extra daemon was installed.

Changed [raven-button.mjs](../../scripts/raven-button.mjs) to wrap the established
app lifecycle with [mirror-tv-control.mjs](../../scripts/mirror-tv-control.mjs).
STOP sleeps the TV before closing app windows, including when the app is already
off, and still attempts app cleanup after TV failure. START waits for the current
Main's load/bridge markers, then wakes the TV and starts its HDMI activity. It
preserves the saved active avatar. Both run under the existing queue and shared
operation lease. Updated decisions and deployment guides describe these semantics.

TV work reuses the installed trusted server on 5038, with mDNS disabled, fixed
board/activity, explicit non-toggle sleep/wake keys, twelve-second budget and
at most one retry. The client uses numeric `-H 127.0.0.1` so a missing daemon
fails instead of auto-starting a separate user server. Command diagnostics contain
only fixed step/failure reasons. Queue expiry is now 120 seconds to accommodate
TV work plus a frozen-app cleanup ahead of a request.

Fresh verification:

| Case | Result |
| --- | --- |
| STOP with app already off | Confirmed Asleep/OFF |
| START from standby | App loaded; Android Awake/ON; HDMI activity foreground; Main-owned 1080×1920 opaque window on T749 at layer 1000 |
| Duplicate START after debounce interval | Same Main PID; Awake/HDMI retained |
| STOP | App unloaded, TV Asleep/OFF |
| Duplicate STOP after debounce interval | Already-off success; no unnecessary sleep key |
| Restart after standby | Passed |
| Rapid STOP→START | TV/app stop completed before TV/app start |
| Final STOP and thirty-second interval | App stayed off and TV stayed asleep; boot count unchanged |
| Focused app/TV/operation-lease regressions | 65 passed, 3 files, exit 0 |
| Script syntax and existing stamped build verification | Exit 0; Electron runtime source unchanged |

The first passing eight-case run measured a cold start at 4.498 s, subsequent start at 5.294 s,
and clean stop at 5.082 s. These include the queued control result and TV
verification, not first avatar frame or conversation readiness. Native window
metadata proves placement/visibility, not a human observation of the glass.
The owner-confirmed physical key assignments are unchanged; these tests launch
the exact assigned apps via LaunchServices.

Failures retained:

- The first combined run passed start/HDMI and stop, then a duplicate STOP
  reported `tv_standby_failed` although a subsequent probe found Asleep/OFF.
  That version did not retain the failing ADB sub-step, so the exact cause is
  unproven. Confirmed-state checking now skips unnecessary sleep injection.
- The next run reported two three-second `connect` timeouts during START;
  app cleanup still passed. Existing shell requests remained usable. The final
  helper probes the existing transport first and only connects on probe failure.
  The eight-case run above then passed. Neither failure is erased by that pass.
- A later cycle after the explicit numeric-host guard reported immediate
  power-probe/key failures within both attempts. STOP still cleaned up and a
  later read found Asleep/OFF. The exact device/host cause was not proven; this
  is retained as a transient transport failure. The helper now allows 350 ms
  after connect and before its sole retry, and avoids sending a key when the
  reconnected transport still cannot answer. Diagnostics distinguish offline,
  missing, unauthorized, closed and timeout failures without raw device output.

Evidence: [standby proof](../../.artifacts/tv-controls-2026-10-17/standby-proof.json),
[first failure](../../.artifacts/tv-controls-2026-10-17/live-results-initial-failure.json),
[connect failure](../../.artifacts/tv-controls-2026-10-17/live-results-wake-failure.json),
[transport failure](../../.artifacts/tv-controls-2026-10-17/transport-settle-failure.json),
[first passing run](../../.artifacts/tv-controls-2026-10-17/live-results-before-guard.json),
[eight-case result](../../.artifacts/tv-controls-2026-10-17/live-results.json),
[unit results](../../.artifacts/tv-controls-2026-10-17/unit-tests.log), and
[readiness survey](../../.artifacts/tv-controls-2026-10-17/readiness-survey.md).

Final implementation (including the numeric-host guard and bounded transport
settling) reran all eight live cases successfully, exit 0. Direct final check at
**2026-10-17 10:50:21 Taipei** found job unloaded, zero canonical Electron/native
app processes and TV Asleep/OFF; see
[final state](../../.artifacts/tv-controls-2026-10-17/final-state.json).
Transient ADB faults remain a dependency risk, not a claim of guaranteed wake
after arbitrary network/device failure. Final code keeps one bounded retry and
explicit failure feedback rather than restarting services in a loop.

Readiness is deliberately a startup-marker check, not a new live health protocol.
`RENDERER_READY` precedes initial snapshot completion; a concurrent hang/ordinary
quit can leave old positive markers while the process still exists. The current
Main start time, latest boot/load/ready sequence and logged failure invalidations
reduce stale matches, but cannot prove continuous event-loop health. The survey's
heartbeat publication proposal was not added for this bounded TV-control feature.
No forced runtime restart is used to obtain a fresh receipt. Standby retaining
the HDMI display was verified on this TV; `WINDOW_SHOWN` is not required before
wake because other sleep/disconnect states may remove the target.

Primary references: Android's
[SLEEP/WAKEUP key semantics](https://developer.android.com/reference/android/view/KeyEvent#KEYCODE_SLEEP),
ADB's [server startup guard](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/android15-qpr2-s8-release/client/adb_client.cpp)
and [numeric-host classification](https://android.googlesource.com/platform/packages/modules/adb/+/refs/tags/android-17.0.0_r1/socket_spec.cpp).
