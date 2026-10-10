# Field setup: Mac mini at the venue

This folder holds the operator tooling that turns the venue Mac mini plus the
HAOCROWN smart mirror into the Magic Mirror glass. None of it is part of the
Electron app. **Current deployment status** (what is installed, verified, and
pending) is under "Resume here" in `PROGRESS.md`. Audio device policy is in `DECISIONS.md`
(2026-10-03).

## Hardware chain

```
Mac mini ──HDMI 1920x1080@60 (macOS-rotated 90°)──▶ RK628D HDMI-in ─▶ ZC-3568D Android 11 board ─▶ 1080x1920 portrait panel behind two-way glass
Mac mini ◀─USB─ Jabra Speak2 75   (default mic + speaker)
Mac mini ◀─USB─ Arducam 1080P Low Light (UVC camera inside the frame)
Mac mini ──LAN/adb 10.0.0.4:5555──▶ mirror board (watchdog keeps the HDMI viewer in front)
```

The mirror is an Android device, not a monitor. It shows the Mac only while the
Rockchip HDMI-in app `com.android.rockchip.camera2/.RockchipCamera2` is in front.
After a reboot it starts on its own launcher. Its EDID name `T749-fHD720` is
Rockchip's stock RK628D default and does not describe the panel.

## One-time board setup (on the glass, with the remote or touch)

1. Settings → Display → Advanced → **Connect to the computer**: on. This opens network adb on port 5555.
2. Settings → Display → Advanced → **Systemui Setting** → **StatusBar Hidden**.
3. From the Mac, run `adb connect 10.0.0.4:5555 && adb shell settings put system accelerometer_rotation 0 && adb shell settings put system user_rotation 1`. The watchdog re-applies this.

Homebrew adb 37.x aborts on macOS 27 in its mDNS code. Always export
`ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0` before running adb.
For operator access to the installed daemon's connection, use
`adb -P 5038 -s 10.0.0.4:5555 ...`.

The watchdog only opens HDMI when a successful foreground query identifies
the stock launcher and the board reports `mWakefulness=Awake`. Standby, missing
activity results and failed queries defer recovery. It leaves Settings and
other foreground apps alone, and reports launch success only when Android's
`am start -W` returns `Status: ok`. The focused check is
`python3 deploy/macos/test-board-hdmi-keepalive.py` (fake ADB; no hardware access).
This remains a Mac-dependent recovery mechanism, not a TV-side boot launcher.
Actual remote standby/resume and standalone boot acceptance are still pending.

## One-time Mac setup

```sh
brew install --cask android-platform-tools
swiftc -O deploy/macos/displayctl.swift -o /usr/local/bin/displayctl   # or any dir on PATH

displayctl list
displayctl mode   T749 1920 1080 60      # EDID-preferred; macOS defaults to 2160p30, which the board renders badly
displayctl rotate T749 90                # macOS lays out a portrait 1080x1920 desktop
displayctl main   MB16                   # on-site work: operator monitor stays main (skip in production)

sudo zsh deploy/macos/install-board-hdmi-daemon.sh   # board watchdog (root LaunchDaemon)
zsh deploy/macos/install-audio-prefer.sh             # Jabra = default mic + speaker (user LaunchAgent)
```

Once rotated, macOS reports the display's modes rotated too: `displayctl mode T749 1080 1920 60`.

### Why the board watchdog is a root daemon

As a per-user LaunchAgent, adb gets `No route to host` from macOS Local Network
privacy, and System Settings offers no switch for a command-line tool. Root
LaunchDaemons are exempt. The installer copies the script to a root-owned
location, because root runs it. The daemon uses adb port 5038 so it never
collides with an operator's adb on port 5037.

## Running the app on the glass

- **Production:** HDMI is the only display. It is primary, and the Mirror window opens there.
- **On-site with the operator monitor attached:** keep the monitor as main
  (`displayctl main MB16`) and start the app with `MIRROR_DISPLAY=T749`. The
  Mirror window then targets the glass, and it returns there after the board
  reboots and the display comes back. Never make the glass the main display
  while someone works on the other monitor: macOS moves their windows under the
  full-screen Mirror window.

### App LaunchAgent configuration: installed on the final Mac

[`com.magicmirror.launchagent.field.plist`](com.magicmirror.launchagent.field.plist)
was installed and bootstrapped for this venue account on 2026-10-03.
Main and both renderers started; the Mirror selected `T749-fHD720` and entered
simple fullscreen. Crash restart returned the HDMI Mirror ready. Login and clean-quit evidence must be checked
in `PROGRESS.md`. This checkout deployment runs the `npm run build` output through
local Electron; it is not proof of a signed or packaged production deployment.
The packaged template remains at
[`resources/macos/com.magicmirror.launchagent.plist`](../../resources/macos/com.magicmirror.launchagent.plist).

The field definition uses these exact paths and settings:

| Setting | Required value |
|---|---|
| App owner label | `com.magicmirror.launchagent` |
| Electron executable (first argument) | `/Users/novalien0424/magic-mirror/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` |
| Checkout (second argument and working directory) | `/Users/novalien0424/magic-mirror` |
| Built Main entry (`package.json` main) | `/Users/novalien0424/magic-mirror/out/main/index.js` |
| Built preload and renderer directories | `/Users/novalien0424/magic-mirror/out/preload/` and `/Users/novalien0424/magic-mirror/out/renderer/` |
| Configured environment | `MIRROR_DISPLAY=T749` only |
| Required writable log directory | `/Users/novalien0424/Library/Logs/MagicMirror` |

Before replacing a build, stop the app, then run from the checkout:

```sh
cd /Users/novalien0424/magic-mirror
npm run typecheck
npm run build
```

Fresh build and typecheck evidence is linked from `PROGRESS.md`.
The executable must exist and be executable, and the build must produce the
Main entry plus the complete preload and renderer outputs at the paths above.
The log directory must already exist and be writable by `novalien0424` before
bootstrap; launchd does not create its parent directories. This configuration
does not load `.env` or contain credentials. Electron Main alone loads
`/Users/novalien0424/magic-mirror/.env` as the sole `OPENAI_API_KEY` source.
Never print or copy the key into logs, LaunchAgent settings or operator reports.

The reviewed definition is installed at
`~/Library/LaunchAgents/com.magicmirror.launchagent.plist`, then bootstrap it
in this account's GUI session. Before that bootstrap, individually identify
any existing manual Magic Mirror instance by its PID and command path and
quit only that verified instance. Confirm whether the same app label is already
loaded and replace its definition deliberately; do not run duplicate app
instances or use blanket process-kill commands. The field and packaged
definitions share the same label and eventual installed path. The user
LaunchAgent is the sole app restart owner; the board and audio services do not
supervise Electron, and no additional app login item or restart owner is added.

`RunAtLoad=true` starts the app when the agent is loaded at login.
`KeepAlive={SuccessfulExit=false}` restarts a nonzero failure, with
`ThrottleInterval=10` limiting restart frequency. A clean quit (exit 0) stays
stopped until the next login or an explicit operator kickstart.
`ProcessType=Interactive` is configured. The app must never call `app.relaunch()`;
its existing recovery contract allows one renderer recreation before exit 1.

The configured HDMI target stays hidden while absent and is selected again
after reconnect. Raven v11 is imported into the managed library and selected in
published config v8. The Mac wake package is `sherpa-magic-mirror-mac-v1`;
its four upstream model/token hashes match the repository v2 model hashes.
Its keyword file is compiled with the bundled pronunciation lexicon, and its
spoken accuracy is not yet certified. Camera gaze uses Apple Vision face boxes
in RAM, selects the largest face with a switching hold, and sends only a
smoothed direction to the Mirror. This does not enroll or identify visitors.
Actual UI, camera streaming, speech, hotplug and reboot evidence belongs in
`PROGRESS.md`; installation alone does not establish these results.

## Logs (metadata only)

| Component | Log |
|---|---|
| Board watchdog | `/Library/Logs/MagicMirror/board-hdmi.log` (`BOARD_*`, `HDMI_VIEW_*`) |
| Audio preference | `~/Library/Logs/MagicMirror/audio-prefer.log` (`PREFERRED_AUDIO_*`, `DEFAULT_SET*`) |
| App stdout | `/Users/novalien0424/Library/Logs/MagicMirror/app.out.log` |
| App stderr | `/Users/novalien0424/Library/Logs/MagicMirror/app.err.log` |

App stdout/stderr must remain metadata-only: no transcripts, conversation
audio, extracted memory values, injected private context, images, embeddings,
or credentials. The log paths do not authorize recording private content.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Glass shows the Android launcher | The watchdog relaunches the viewer within ~20 s. A full board reboot is back in ~80 s (measured 2026-10-03). If not, check `board-hdmi.log`. |
| Picture stretched | Android rotation was reset. Run `adb shell settings put system user_rotation 1`. |
| Jabra missing from Sound settings | It shows only its HID interface when off or charging. Press its power button. |
| Camera frame mostly ceiling / face from below | Mount nearer eye level, tilted slightly down; frontal faces matter for recognition (Phase 5) |
| Camera opens but gives no frames (`Unable to send device request` in `/usr/bin/log`) | UVC firmware hung. Unplug and replug the camera. Note that zsh's `log` builtin shadows `/usr/bin/log`. |
| `adb` keeps saying "daemon not running" | The mDNS crash. Export `ADB_MDNS=0`. |

## Removal

```sh
sudo launchctl bootout system/com.magicmirror.board-hdmi && sudo rm /Library/LaunchDaemons/com.magicmirror.board-hdmi.plist
launchctl bootout gui/$(id -u)/com.magicmirror.audio-prefer && rm ~/Library/LaunchAgents/com.magicmirror.audio-prefer.plist
```
