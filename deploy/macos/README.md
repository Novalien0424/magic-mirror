# Field setup: Mac mini at the venue

This folder holds the operator tooling that turns the venue Mac mini plus the
HAOCROWN smart mirror into the Magic Mirror glass. None of it is part of the
Electron app. Hardware facts and verification evidence are in `PROGRESS.md`
under "Field deployment hardware". Audio device policy is in `DECISIONS.md`
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

## Logs (metadata only)

| Component | Log |
|---|---|
| Board watchdog | `/Library/Logs/MagicMirror/board-hdmi.log` (`BOARD_*`, `HDMI_VIEW_*`) |
| Audio preference | `~/Library/Logs/MagicMirror/audio-prefer.log` (`PREFERRED_AUDIO_*`, `DEFAULT_SET*`) |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Glass shows the Android launcher | The watchdog relaunches the viewer within ~20 s. A full board reboot is back in ~80 s (measured 2026-10-03). If not, check `board-hdmi.log`. |
| Picture stretched | Android rotation was reset. Run `adb shell settings put system user_rotation 1`. |
| Jabra missing from Sound settings | It shows only its HID interface when off or charging. Press its power button. |
| Camera opens but gives no frames (`Unable to send device request` in `/usr/bin/log`) | UVC firmware hung. Unplug and replug the camera. Note that zsh's `log` builtin shadows `/usr/bin/log`. |
| `adb` keeps saying "daemon not running" | The mDNS crash. Export `ADB_MDNS=0`. |

## Removal

```sh
sudo launchctl bootout system/com.magicmirror.board-hdmi && sudo rm /Library/LaunchDaemons/com.magicmirror.board-hdmi.plist
launchctl bootout gui/$(id -u)/com.magicmirror.audio-prefer && rm ~/Library/LaunchAgents/com.magicmirror.audio-prefer.plist
```
