# Magic Mirror operator controls

The helper operates the existing user LaunchAgent
`gui/$(id -u)/com.magicmirror.launchagent`. It serializes start/stop/loop/console requests,
debounces successful repeated actions for three seconds, and holds the shared
Electron operation lease. An active QA owner rejects the request with
`electron_owner_busy`; it never takes over that owner's app. Launchd remains the
sole crash restart owner. The helper does not load credentials or model config,
open a microphone, or change TV-presence shutdown policy. The same serialized
operation also controls the wired TV through the existing trusted board ADB daemon.

## Stream Deck application wrappers

Use these executable scripts as the targets of the macOS application wrappers
opened by Stream Deck:

```sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-start.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-stop.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-loop.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-console.sh
```

Each fixes its action and calls the existing queue helper using canonical paths.
The chain uses `/bin/zsh` and `/opt/homebrew/bin/node`, without depending on the
launcher's working directory or interactive shell PATH. It does not run npm,
build the app, edit a plist, or launch Electron directly. The installed field
plist must already exist at
`~/Library/LaunchAgents/com.magicmirror.launchagent.plist`. Creating application
wrappers and configuring Stream Deck are separate integration steps.

The scripts return after **queueing** the request; exit zero is queue acceptance,
not proof that the app started/stopped. Completion is reported through the
metadata-only log and `afplay` sounds: Glass for started/loop playing, Pop for Console shown/already on/off,
Tink for clean stop, Sosumi for a forced stop, and Basso for failure/busy.
Requests are published atomically and processed in order. A stop followed by a
start stays ordered. Requests older than 120 seconds are dropped with `expired`,
leaving room for a forced app stop plus the bounded TV operation ahead of them.

## Behavior and limits

Start is idempotent when the job already has a PID. Otherwise it kickstarts a
loaded job or bootstraps an unloaded job, then waits up to ten seconds for a PID.
The combined control then waits up to ten seconds for this Main's existing
`MAIN_READY`, Mirror `WINDOW_LOADED` and `RENDERER_READY` metadata, invalidated by
logged mirror failure/recreation or app exit, and rechecks the Main PID. Only
then does it send Main `normal` for START, `play_loop` for LOOP, or `show_console`
for CONSOLE. Only a successful
acknowledgement permits TV wake and HDMI selection. Missing/ambiguous readiness
reports `<action>_not_ready` without waking the TV; mode failure reports
`<action>_mode_failed` plus a safe `modeReason`.
The saved active avatar is never overwritten. An already-running app goes through
the same acknowledgement path. Main owns idempotent loop playback and must only
acknowledge `play_loop` success after playback actually starts (or is already
playing). START switches back to normal mode. No control payload accepts a media path.
CONSOLE reuses the current renderer and waits at most ten seconds for its
load/bridge readiness, then places it in the mirror display's work area above
the kiosk window. It preserves unsaved edits and current playback. Repeats
show/focus rather than hide it. START/LOOP hide the Console; STOP closes the
whole application, so all current and future owned program modes end together.

### Main acknowledgement mailbox

The import-safe [operator client](../../scripts/operator-command.mjs) uses only
`~/Library/Application Support/magic-mirror/operator-control` on this Mac,
matching `app.getPath('userData')/operator-control` in Main. It publishes an atomic
request under `requests/<UUID>.json`:

```json
{"version":1,"id":"<UUID>","action":"normal|play_loop|show_console","issuedAt":0,"expiresAt":45000}
```

`issuedAt` is `Date.now()` at creation; `expiresAt` is exactly 45,000 ms later.
Main replies under `responses/<same UUID>.json` with exactly
`{"version":1,"id":"<same UUID>","status":"success|failed","reason":"safe_snakecase"}`.
The client validates version, ID, status and reason, polls every 100 ms for up to
45 seconds using both expiry and a monotonic deadline, and removes its own request,
temporary file and response after completion/failure/timeout. It enforces directory
mode 0700 and file mode 0600. No root-path override, socket, service, credentials,
media path or private configuration is used. Failures retain only fixed metadata.
The protocol adds up to 45 seconds to the existing startup/readiness and TV budgets.

These markers prove startup load/bridge receipt, not ongoing event-loop health,
avatar first frame or microphone/camera/audio acceptance. They are historical
metadata correlated to process start time, not a heartbeat or atomic health
protocol; a concurrent hang/shutdown remains possible. The helper does not
restart a running app to manufacture readiness. `WINDOW_SHOWN` is deliberately
not a pre-wake requirement, since a sleeping HDMI target may disappear.

Stop is idempotent when the job is absent. For a running job it sends one TERM
and permits up to 25 seconds for Main's cleanup. It then unloads the job, including
after a clean exit. An initial PID-less crash/restart gap also unloads the job;
it is never mistaken for `already_off`. A restarted PID, failed TERM, or failed
shutdown probe reaches the same unload path. Removing the job prevents KeepAlive
from bringing it back before the next explicit start. A later login can still
load the installed LaunchAgent normally; stop does not persistently disable it.
STOP sends no mailbox mode request; deliberate TERM clears desired mode in Main.

The stop operation has a 55-second monotonic budget, including command and child
checks. Launchctl print is limited to one second, TERM to two seconds, and
bootout to 25 seconds (each capped by the remaining budget). The field job's
existing `ExitTimeOut=20` lets launchd force a hung process to exit after its own
TERM; the helper reserves time for that cleanup instead of adding another killer.
Timed-out command
processes receive SIGKILL. The job's absence is verified even if bootout fails;
a still-loaded job reports `stop_failed`. The serialized queue may add wait time
before an individual request begins.

Before TERM (and on an observed restart), the helper captures the job's process
family in RAM using PID, parent PID, start time, state, and executable name only.
After requesting unload, it waits for both job removal and captured processes for up to 23 seconds within
the same stop budget. Reparented children remain tracked; reused PIDs and zombies
do not count as live children. Surviving processes report
`stop_processes_remaining`; unavailable process/state checks report
`stop_cleanup_unverified`. Cleanup relies on Main and launchd; the helper never
uses broad `pkill` or signals unrelated processes. It cannot prove cleanup of
orphans that predate its snapshot or children first created after capture.
Those failure results require inspection before another start.

## TV standby/wake

STOP first confirms Android Asleep/display OFF, sending explicit key 223 only
when needed, then always performs the app stop. START/LOOP/CONSOLE send explicit wake key
224 when needed, open `com.android.rockchip.camera2/.RockchipCamera2`, and
verify Awake/display ON. Confirmed standby needs no repeated sleep injection.
This is **standby, not Android shutdown or mains power-off**. The board and wired
control path retain power; actual standby wattage is unmeasured.

The fixed client is `/Library/Application Support/MagicMirror/adb`, numeric host
`127.0.0.1` and port 5038 (no auto-start of a user ADB server),
target `192.168.77.2:5555`; mDNS stays disabled. The installed root daemon must
already be available. Reuse its working transport, connecting only if a shell
probe fails, allowing 350 ms for transport settling before verification/retry.
Device work is bounded to 12 seconds with at most one retry and
individual ADB commands capped at three seconds. No new background polling or
service is added. The TV budget is additional to the app's start/stop budget.
Completion logs contain separate app/TV outcomes; command failures log only the
step and a fixed failure/timeout reason, never raw device output.

TV failure leaves app cleanup enabled and produces Basso. Successful combined
operations retain the usual sounds. START/LOOP/CONSOLE do not repair full power loss or a
dead/untrusted ADB connection. A complete Mac login/boot screen blackout is outside
these session controls.

## Existing Flic/Karabiner route

Configure Flic Universal keyboard events to emit **F13 for push and F14 for hold**.
Verify those two actual events in Karabiner-EventViewer before installing a rule.
Do not assume a Bluetooth button holds an HID key down for the physical duration.
The precise hold timing and reconnect behavior require the physical device.

Generate the rule using the button's observed Bluetooth `device_address`:

```sh
node scripts/raven-button-karabiner.mjs ACTUAL_DEVICE_ADDRESS > /tmp/raven-button.json
```

The generator refuses an absent/malformed address. Add that generated rule to
Karabiner's complex modifications after its driver approvals are complete. It
consumes only this device's F13/F14, leaving other keyboards untouched. No
Karabiner installation, system approval, pairing or purchase has been performed.

Metadata-only feedback is in `~/Library/Logs/MagicMirror/button.log` (256 KiB plus
one rotated file). `electron_owner_busy` means another operation owns Raven.
Both the queue mutex and shared Mac operation lease are kernel-owned and release
after a crash/reboot. Do not unlink their lock files. Diagnostic owner JSON may
remain after a crash, but does not block acquisition. Physical reboot/button
acceptance still requires the actual device.

Validate all ten physical acceptance cases in the third audit, including duplicate
holds, hold then push, mid-media stop, reconnect, key suppression and power-cut
login. The unit tests cover launchd ordering and device scoping, not Bluetooth.

Primary references: [Flic Universal](https://flic.io/applications/flic-universal),
[Karabiner device conditions](https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/conditions/device/),
[shell commands](https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/to/shell-command/).
