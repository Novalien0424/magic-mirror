# Magic Mirror operator controls

The helper operates the existing user LaunchAgent
`gui/$(id -u)/com.magicmirror.launchagent`. It serializes the eight mode keys'
requests (start/stop/loop/console/studio/desktop/music/dance), debounces successful
repeated actions for three seconds, and holds the shared Electron operation lease.
An active QA owner rejects a queued request with `electron_owner_busy`; it never
takes over that owner's app. VOL± and the Music page keys act at once, outside the
queue and the lease (below). Launchd remains the
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
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-studio.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-desktop.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-music.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-dance.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-volume-up.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-volume-down.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-music-previous.sh
/Users/novalien0424/magic-mirror/deploy/macos/magic-mirror-music-next.sh
```

The Music page's three folder keys are the Magic Mirror Controls plugin's action
(`com.magicmirror.controls.folder`), not wrapper apps.

Each fixes its action and calls the existing queue helper using canonical paths.
The chain uses `/bin/zsh` and `/opt/homebrew/bin/node`, without depending on the
launcher's working directory or interactive shell PATH. It does not run npm,
build the app, edit a plist, or launch Electron directly. The installed field
plist must already exist at
`~/Library/LaunchAgents/com.magicmirror.launchagent.plist`. `install-stream-deck-controls.sh`
creates the twelve wrapper apps and `install-stream-deck-plugin.sh` the plugin; profiles:
[Stream Deck](stream-deck.md#reinstall-the-local-controls).

The eight mode-key scripts return after **queueing** the request; exit zero is queue
acceptance, not proof that the app started/stopped. VOL± and the Music page keys run
at once and exit 1 on failure. Completion is reported through the
metadata-only log and quiet system sounds played on the alert output (the Jabra) only,
never on every speaker (`stop-state --chime`): Glass for started/loop playing/`studio_ready`; Pop for Console or Desktop shown,
MusicLoop/Dance preparing and already on/off; Tink for clean stop, Sosumi for a
forced stop, Basso for failure/busy; a cancelled MusicLoop/Dance start plays nothing.
Requests are published atomically and processed in order. A stop followed by a
start stays ordered. Requests older than 120 seconds are dropped with `expired`,
leaving room for a forced app stop plus the bounded TV operation ahead of them.

## Behavior and limits

All visible actions first run the signed helper's fixed `--portrait` policy: find
exactly one T749, restore Mac rotation 90° if needed and verify portrait bounds.
It leaves the operator monitor alone. Failure reports `portrait_failed` before
starting/changing the application or waking HDMI. The accepted Android rotation
remains `user_rotation=2`.

Start is idempotent when the job already has a PID. Otherwise it kickstarts a
loaded job or bootstraps an unloaded job, then waits up to ten seconds for a PID.
The combined control then waits up to ten seconds for this Main's existing
`MAIN_READY`, Mirror `WINDOW_LOADED` and `RENDERER_READY` metadata, invalidated by
logged mirror failure/recreation or app exit, and rechecks the Main PID. Only
then does it send Main `normal` for START, `play_loop` for LOOP, `show_console`
for CONSOLE, `studio` for STUDIO, `music_loop` for MUSIC LOOP, `dance_floor` for DANCE, or `desktop` for DESKTOP. Only a successful
acknowledgement permits TV wake and HDMI selection for display modes. MUSIC LOOP
leaves TV power, orientation, mouse and the HDMI black cover unchanged.
Missing/ambiguous readiness
reports `<action>_not_ready` without waking the TV; mode failure reports
`<action>_mode_failed` plus a safe `modeReason`.
The saved active avatar is never overwritten. An already-running app goes through
the same acknowledgement path. Main owns idempotent loop playback and must only
acknowledge `play_loop` success after playback actually starts (or is already
playing). START switches back to normal Conversation mode. STUDIO returns from the
loop like START, then selects Interactive Studio mode; its success outcome is
`studio_ready`. No control payload accepts a media path.
CONSOLE reuses the current renderer and waits at most ten seconds for its
load/bridge readiness, then places it in the mirror display's work area above
the kiosk window. It preserves unsaved edits and current playback. Repeats
show/focus rather than hide it. From Desktop, CONSOLE first resumes the saved
avatar mode. START/STUDIO/LOOP/DESKTOP/MUSIC LOOP/DANCE and the folder keys hide the
Console (edits are kept); STOP closes the
whole application, so all current and future owned program modes end together.

DESKTOP closes the input gate before releasing voice/wake/camera/scenes, waits for
loop playback release, then hides Mirror and Console. Electron and the Console
renderer remain alive, preserving unsaved edits. Main persists Desktop across
crash recovery. START/STUDIO/LOOP restore the existing Mirror window after their
mode acknowledgement; Remote Console can open on the main monitor while the TV
remains on Desktop. DESKTOP wakes HDMI and connects the TV mouse like CONSOLE;
its success result is `desktop_shown`.

MUSIC LOOP selects Main's native music mode (on the Airfoil route it plays into "Magic
Mirror Music" and Airfoil reaches every speaker; the direct speaker group is the
fallback, see [Stream Deck](stream-deck.md#musicloop)) and reports `music_preparing`
after Main accepts the mode. Console reports actual playback after native progress.
Before sending that mode command, each accepted press calls the existing native
output reset/read-back once to put every external speaker at its calibrated normal level
([Stream Deck: speaker levels](stream-deck.md#speaker-levels-calibrated-2026-11-07)). Playback VOL± and
physical volume changes then persist until another MUSIC LOOP, START or STOP press. No timer or track callback resets
volume. Reset failure is retained in the command's `audio` metadata and does not
block other outputs. START also resets every speaker to its normal level, about 6 s after the TV
wakes; a failure is kept in `audio` and START still reports `started`. STUDIO does not
reset volume; with the avatar's image skill off Main refuses it (`studio_skill_disabled`
in the app log, `studio_mode_failed` and Basso here).
Downloads do not block command acknowledgement or controls. Music does not call
the TV/ADB path, so a sleeping or unreachable TV cannot produce a music failure
beep. Ready tracks repeat
while remaining files prepare; files over 200 MB are abnormal and skipped. The
operator supplies files through shared `MusicLoop`, never a command argument.
A queued STOP cancels this command's
acknowledgement wait within a poll interval, allowing ordinary global shutdown to
cancel a cloud preparation. A cancelled MusicLoop or Dance start logs `music_cancelled`
or `dance_cancelled` and plays no chime. Main releases the
native child on mode change/quit; stdin EOF and parent loss also release it.

### Main acknowledgement mailbox

The import-safe [operator client](../../scripts/operator-command.mjs) uses only
`~/Library/Application Support/magic-mirror/operator-control` on this Mac,
matching `app.getPath('userData')/operator-control` in Main. It publishes an atomic
request under `requests/<UUID>.json`:

```json
{"version":1,"id":"<UUID>","action":"normal|play_loop|show_console|show_console_main|studio|desktop|music_loop|dance_floor|music_folder_1|music_folder_2|music_folder_3|music_next|music_previous","issuedAt":0,"expiresAt":45000}
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

STOP first covers the T749 HDMI display (or, when its bridge loses the EDID name,
the single unnamed non-main display) with a native, opaque black window. It
survives Electron shutdown, covers desktop/menu/Dock and hides the cursor only on
that display. START/LOOP/STUDIO/CONSOLE/DESKTOP/DANCE clear it after renderer readiness and the
mode acknowledgement. The operator monitor remains usable. A missing display or
failed cover is reported; TV, app, mouse and audio cleanup still run independently.
The cover does not restart Electron and has no LaunchAgent.

STOP also sets every external CoreAudio speaker's **output** (the required Jabra
Speak2 75, plus Bluetooth speakers such as A1) to 0.70 unmuted and reads it back. The
AirPlay Edifier is not a CoreAudio output: Airfoil gives it the Jabra's level when the
app next connects it. It preserves input gain, selected default devices and the Mac
mini speaker. A missing or ambiguous Jabra and failed verification are reported in the
button log's `audio` as `jabra_output_missing`, `jabra_output_ambiguous` or
`output_volume_verify_failed` (`jabra_output_reset_failed` for anything else).

**Music page keys** (`raven-button.sh music-next|music-previous|music-folder-1..3`) send
Main `music_next`, `music_previous` or `music_folder_N` directly when the app is running
(no queue, no TV, no app start); they log `music_next`/… or `music_key_failed`/
`music_not_running` with Main's reason and play Pop or Basso. Main checks a folder before
switching, so a refused folder keeps the current music. A folder key works in any mode
while the app runs: it starts MusicLoop on that folder (no speaker-level reset) and hides the
Console. PREV/NEXT outside MusicLoop give `music_key_failed` with Basso.

**VOL±** (`raven-button.sh volume-up|volume-down`, on the Playback and Music pages)
runs the same helper's `--volume-up/--volume-down` at once, outside the queue and the
Electron lease: every external CoreAudio speaker ±10% together on a 5% grid, VOL+
unmutes; AirPlay speakers follow the Jabra through Airfoil while the app runs.
It logs `volume_up`/`volume_down` or `volume_step_failed` and plays Pop or Basso,
detached so the wrapper app exits in about 0.2 s and quick repeats are not dropped. Install the signed user-owned helper with
`zsh deploy/macos/install-stop-state.sh` when deploying these controls.

STOP first confirms Android Asleep/display OFF, sending explicit key 223 only
when needed, then always performs the app stop and releases the TV mouse. START/LOOP/CONSOLE/STUDIO/DESKTOP/DANCE send explicit wake key
224 when needed, open `com.android.rockchip.camera2/.RockchipCamera2`, and
verify Awake/display ON; CONSOLE and DESKTOP also connect the TV mouse (up to 10 s).
Confirmed standby needs no repeated sleep injection.
Before any sleep/wake key the helper ensures a root kernel wakelock
(`magicmirror_standby`) on the board, so standby only turns the screen off; without it
the board cycled Ethernet and the HDMI bridge until both wedged ([RCA](../../DECISIONS.md#2026-10-31--console-dance-stop-musicloop-volume-and-studio-ending-owner-rulings)). The wakelock is lost on a
board reboot; `install-board-keep-awake.sh` adds a two-minute per-user tick that
re-applies it through the root ADB server (metadata log `board-keep-awake.log`).
This is **standby, not Android shutdown or mains power-off**. The board and wired
control path retain power; actual standby wattage is unmeasured.

The fixed client is `/Library/Application Support/MagicMirror/adb`, numeric host
`127.0.0.1` and port 5038 (no auto-start of a user ADB server),
target `192.168.77.2:5555`; mDNS stays disabled. The installed root daemon must
already be available. Reuse its working transport, connecting only if a shell
probe fails, allowing 350 ms for transport settling before verification/retry.
Device work is bounded to 12 seconds with at most one retry and
individual ADB commands capped at three seconds. The button path adds no polling;
the keep-awake tick is the only board poller. The TV budget is additional to the app's start/stop budget.
Completion logs contain separate app/TV outcomes; command failures log only the
step and a fixed failure/timeout reason, never raw device output.

TV failure leaves app cleanup enabled and produces Basso. Successful combined
operations retain the usual sounds. START/LOOP/CONSOLE/STUDIO/DESKTOP/DANCE do not repair full power loss or a
dead/untrusted ADB connection. A complete Mac login/boot screen blackout is outside
these session controls.

Metadata-only feedback is in `~/Library/Logs/MagicMirror/button.log` (256 KiB plus
one rotated file). `electron_owner_busy` means another operation owns Raven.
Both the queue mutex and shared Mac operation lease are kernel-owned and release
after a crash/reboot. Do not unlink their lock files. Diagnostic owner JSON may
remain after a crash, but does not block acquisition. Physical reboot/button
acceptance still requires the actual device.

## Flic/Karabiner route (design only, not deployed)

The Stream Deck Neo is the deployed control; Karabiner is not installed. An earlier
design maps a Flic Universal button (F13 push, F14 hold) through a Karabiner rule from
`node scripts/raven-button-karabiner.mjs <device_address>`, which consumes only that
device's keys. It needs the physical button, Karabiner driver approval and the
third-audit physical cases before use. References:
[Flic Universal](https://flic.io/applications/flic-universal),
[Karabiner device conditions](https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/conditions/device/).
