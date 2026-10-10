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
Mac mini en0 192.168.77.1 ──direct Ethernet/adb──▶ mirror eth0 192.168.77.2:5555
```

The mirror is an Android device, not a monitor. It shows the Mac only while the
Rockchip HDMI-in app `com.android.rockchip.camera2/.RockchipCamera2` is in front.
AnyLauncher 1.13 is the default HOME and opens HDMI-IN after boot. Its EDID name `T749-fHD720` is
Rockchip's stock RK628D default and does not describe the panel.

## One-time board setup (on the glass, with the remote or touch)

1. Settings → Display → Advanced → **Connect to the computer**: on. This opens network adb on port 5555.
2. Settings → Display → Advanced → **Systemui Setting** → **StatusBar Hidden**.
3. Ethernet uses static **192.168.77.2/24**. The vendor UI requires gateway
   192.168.77.1 and DNS placeholders 0.0.0.0; Android Internet is not required.
4. AnyLauncher HOME is `com.tumuyan.fixedplay/.MainActivity`. Select HDMI-IN
   (`com.android.rockchip.camera2/.RockchipCamera2`) as primary, mode `r2`, and
   Quickstep as secondary. Two software reboots and the user's subsequent
   power-on check passed; explicit mains-removal and rapid-HOME escape
   acceptance remain pending.
5. Set `accelerometer_rotation=0` and **`user_rotation=2`** through wired ADB.
   Combined with Mac rotation 90°, this is physically confirmed upright.

Homebrew adb 37.x aborts on macOS 27 in its mDNS code. Always export
`ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0` before running adb.
For operator access to the installed daemon's connection, use
`adb -P 5038 -s 192.168.77.2:5555 ...` after
`adb -P 5038 connect 192.168.77.2:5555`.

The old `com.magicmirror.board-hdmi` watchdog is **disabled and unloaded**.
Do not reinstall it unchanged: its Wi-Fi address and rotation are obsolete.
AnyLauncher owns TV boot; the new board-ADB daemon only owns the localhost ADB
server. It neither polls HDMI nor supervises Electron.

## One-time Mac setup

```sh
brew install --cask android-platform-tools
swiftc -O deploy/macos/displayctl.swift -o /usr/local/bin/displayctl   # or any dir on PATH

displayctl list
displayctl mode   T749 1920 1080 60      # EDID-preferred; macOS defaults to 2160p30, which the board renders badly
displayctl rotate T749 90                # macOS lays out a portrait 1080x1920 desktop
displayctl unmirror
displayctl main   Virtual              # Virtual 16:9 stays MAIN; T749 is extended RIGHT

sudo zsh deploy/macos/install-board-adb-daemon.sh    # localhost ADB only (root LaunchDaemon)
zsh deploy/macos/install-audio-prefer.sh             # Jabra = default mic + speaker (user LaunchAgent)
```

Once rotated, macOS reports the display's modes rotated too: `displayctl mode T749 1080 1920 60`.

Mac Ethernet is persistently Manual 192.168.77.1/24 **without a router**;
Wi-Fi remains the Mac's Internet/default route. No DHCP server or Internet
sharing is needed. Roll back with `sudo networksetup -setdhcp Ethernet` and
TV Ethernet DHCP mode when a DHCP server is available.

A TV reboot exposed a generic-display EDID failure. BetterDisplay now
auto-applies the TV's unchanged, checksum-valid EDID to fallback record tag 6.
That recovered T749 and passed the second reboot. See the
[evidence and rollback](../../docs/testing/tv-hdmi-boot-2026-10-10.md).

### Why ADB is a root daemon

As a per-user LaunchAgent, adb gets `No route to host` from macOS Local Network
privacy, and System Settings offers no switch for a command-line tool. Root
LaunchDaemons are exempt. The installer copies the ADB binary to a root-owned
location, because root runs it. The daemon binds **127.0.0.1:5038**, leaving
operator port 5037 alone. It reuses the already authorized root ADB identity.
After a platform-tools update, rerun the installer to refresh the copied binary.

## Running the app on the glass

- **This headless Mac:** Virtual 16:9 is MAIN; T749 is extended RIGHT, portrait
  1080×1920@60 at `(1920,0)`. Start the app with `MIRROR_DISPLAY=T749`. The
  Mirror window then targets the glass, and it returns there after the board
  reboots and the display comes back. Never make the glass the main display
  while someone works on the virtual/operator display: macOS moves their windows
  under the full-screen Mirror window.

### Manual start/stop and TV standby

The future Bluetooth button is not installed. These are the tested building
blocks; **standby is not full Android shutdown**. Keep the ADB service running:

```sh
export ADB_MDNS=0 ADB_MDNS_AUTO_CONNECT=0
adb -P 5038 connect 192.168.77.2:5555
adb -P 5038 -s 192.168.77.2:5555 shell input keyevent 224
adb -P 5038 -s 192.168.77.2:5555 shell am start -W -n com.android.rockchip.camera2/.RockchipCamera2
launchctl kickstart gui/$(id -u)/com.magicmirror.launchagent

# Stop: wait for clean exit/no workers before putting the panel in standby.
launchctl kill SIGTERM gui/$(id -u)/com.magicmirror.launchagent
launchctl print gui/$(id -u)/com.magicmirror.launchagent
adb -P 5038 -s 192.168.77.2:5555 shell input keyevent 223
```

Startup enters reflective Dormant: a black HDMI picture with ambience is
expected until wake. The held-stop check ended BGM and all app/worker processes.
Wired standby/wake passed with the new server; full shutdown/power-removal wake
and Mac cold boot remain untested. Allow roughly two minutes for TV boot/ADB.

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
published config v15 at the 2026-10-10 check. The Mac wake package is `sherpa-magic-mirror-mac-v1`;
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
| ADB server | `/Library/Logs/MagicMirror/board-adb.log` |
| Disabled watchdog (historical) | `/Library/Logs/MagicMirror/board-hdmi.log` |
| Audio preference | `~/Library/Logs/MagicMirror/audio-prefer.log` (`PREFERRED_AUDIO_*`, `DEFAULT_SET*`) |
| App stdout | `/Users/novalien0424/Library/Logs/MagicMirror/app.out.log` |
| App stderr | `/Users/novalien0424/Library/Logs/MagicMirror/app.err.log` |

App stdout/stderr must remain metadata-only: no transcripts, conversation
audio, extracted memory values, injected private context, images, embeddings,
or credentials. The log paths do not authorize recording private content.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Glass shows the Android launcher | Check default HOME is AnyLauncher and its target is HDMI-IN. Explicit wired `am start -W` can open HDMI. Do not re-enable the obsolete watchdog. |
| Wrong orientation | Verify Mac rotation 90° and Android `user_rotation=2`; operator confirmed this pair upright. |
| Mac reports Generic Display, not T749 | Check BetterDisplay's unchanged-EDID fallback and extended layout; see the linked TV evidence. |
| Jabra missing from Sound settings | It shows only its HID interface when off or charging. Press its power button. |
| Camera frame mostly ceiling / face from below | Mount nearer eye level, tilted slightly down; frontal faces matter for recognition (Phase 5) |
| Camera opens but gives no frames (`Unable to send device request` in `/usr/bin/log`) | UVC firmware hung. Unplug and replug the camera. Note that zsh's `log` builtin shadows `/usr/bin/log`. |
| ADB unavailable/offline | Check `system/com.magicmirror.board-adb`, localhost port 5038 and Ethernet first. mDNS is disabled. During boot, retry once after settling. A stale host transport previously required an ADB-server restart; it did not prove the TV was off. |

## Removal

```sh
sudo launchctl bootout system/com.magicmirror.board-adb
sudo rm /Library/LaunchDaemons/com.magicmirror.board-adb.plist
launchctl bootout gui/$(id -u)/com.magicmirror.audio-prefer && rm ~/Library/LaunchAgents/com.magicmirror.audio-prefer.plist
```
