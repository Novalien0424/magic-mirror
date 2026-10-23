# Stream Deck Neo controls

The venue Mac has Elgato Stream Deck 7.6.0 (23012), verified current by its own
updater on 2026-10-17. The signed, notarized vendor installer was used. Neo
firmware was updated successfully from 1.00.013 to 1.00.017; its update button
disappeared afterward.

The current **Magic Mirror copy 1** profile has six controls, installed and selected
as the Neo's default on 2026-10-23. STUDIO is shortened to fit the physical key;
DESKTOP occupies the top-right key. Elgato's original Default Profile and the older
Magic Mirror profiles are preserved.

| Position | Button | Action |
| --- | --- | --- |
| First / left (`0,0`) | Green **START MIRROR** | Ensure Magic Mirror is running and ready, require Main's successful `normal` acknowledgement (Conversation mode), then wake the TV onto HDMI. |
| Second (`1,0`) | Purple **CONSOLE** | Bring the existing Console above the mirror display, preserving current playback and unsaved edits; start the app and wake HDMI if needed. |
| Third (`2,0`) | Blue **PLAY LOOP** | Ensure Magic Mirror is running and ready, require Main's successful `play_loop` acknowledgement of actual playback, then wake the TV onto HDMI. |
| Top right (`3,0`) | Teal **DESKTOP** | Pause voice, wake listening, camera and media; hide both Mirror windows, preserving unsaved Console edits; show the portrait macOS desktop and connect the TV mouse. |
| Bottom left (`0,1`) | Amber **STUDIO** | Same as START, but require Main's successful `studio` acknowledgement (Interactive Studio mode) before waking HDMI. |
| Bottom right (`3,1`) | Red **STOP** | Cover T749 HDMI with pure black, put the TV in standby, stop Magic Mirror and its owned processes, unload its job, and reset Jabra Speak2 75 output to 70%. The black cover stays until another control has a ready app and acknowledged mode. |

START selects normal Conversation mode, including from Desktop or loop playback.
STUDIO likewise returns from Desktop or the loop to the avatar,
then selects Interactive Studio mode: the mirror now wakes to the avatar's Studio
wake phrase (default 「招喚渡鴉使者」), runs the studio and ends each visit with the
studio farewell and Dormant. PLAY LOOP and CONSOLE leave the mirror mode alone;
STOP retains its black HDMI and Jabra 70% policy.
Every visible control first verifies the venue's Mac 90° portrait orientation.
DESKTOP keeps Electron running with input suspended; it does not discard Console
edits. START, STUDIO and PLAY LOOP restore their selected view. CONSOLE returns
from Desktop to the saved avatar mode and opens its existing editor on the TV.
An ordinary fresh start begins in reflective Dormant mode.
It restores the last saved active avatar selection (the Console's **Use on
Mirror** selection), currently Raven. The scripts do not hard-code an avatar or
overwrite that selection when starting or stopping.
Normal avatar wake behavior and TV presence policy still apply. STOP closes the
application as well as sleeping the TV. Starting again bootstraps the same
installed LaunchAgent. PLAY LOOP uses Main's approved loop; repeated LOOP is
idempotent in Main and does not restart playback. The controls do not supply a
media path. START, STUDIO, DESKTOP and PLAY LOOP hide Console without
destroying its unsaved editor state. Repeated CONSOLE shows/focuses it; close the
window or press START/STUDIO/PLAY LOOP to return to the mirror view.
STOP sends no mode command; Main clears desired mode on deliberate TERM. STOP
applies to Magic Mirror's programs, not unrelated Mac applications.

**Standby is not complete power-off.** Android reports Asleep and display OFF,
but the board remains powered and reachable over wired ADB so START can wake it.
The signed native black cover remains active after STOP. Standby consumption has not been measured;
wake after a full Android shutdown or removal of mains power is not established.
The Mac mini remains running. This does not change the Mac's pre-login/boot screen.

All six buttons use Elgato's built-in **System → Open** action. The targets are
`~/Applications/Magic Mirror Controls/Start Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Stop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Play Loop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Console Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Studio Magic Mirror.app`, and
`~/Applications/Magic Mirror Controls/Desktop Magic Mirror.app`. The small local
apps call the executable [start](magic-mirror-start.sh),
[stop](magic-mirror-stop.sh), [loop](magic-mirror-loop.sh),
[Console](magic-mirror-console.sh), [studio](magic-mirror-studio.sh), and
[desktop](magic-mirror-desktop.sh) scripts
without opening Terminal. No extra plugin, hotkey remapper, accessibility grant,
microphone owner, or restart service is needed for these controls. Elgato's
original Default Profile remains available.

## Reinstall the local controls

From the canonical checkout:

```sh
zsh deploy/macos/install-stream-deck-controls.sh
open "$HOME/Applications/Magic Mirror Controls/Magic Mirror.streamDeckProfile"
```

The installer verifies its prerequisites, creates ad-hoc signed local apps,
and only replaces apps with the matching Magic Mirror bundle identifiers. It
generates an importable profile; importing is a separate explicit action and
does not edit Elgato's live configuration files. Avoid re-importing unnecessarily,
because Stream Deck may create another copy of the profile. The generated file
also serves as a recovery copy. The installed app and profile retained their
configuration across a Stream Deck quit/relaunch test.

**Desktop / compact Studio (2026-10-23):** installer run, six signed wrappers and
updated native helper deployed, regenerated profile imported. Stream Deck created
**Magic Mirror copy 1**, selected it on the Neo and marked it as the default profile.
The live UI shows both labels fully, and DESKTOP targets Desktop Magic Mirror.app.

The queue and graceful/forced-stop behavior, result sounds, metadata log, and
limits are documented in [raven-button.md](raven-button.md). Script exit zero
means queued; the final result is in `~/Library/Logs/MagicMirror/button.log`.
The controls require the existing installed field plist, canonical checkout,
built output, `/opt/homebrew/bin/node`, and the installed
`system/com.magicmirror.board-adb` daemon on port 5038; they do not build on every
press. A TV failure produces Basso and a metadata reason, while STOP still cleans
up the application. The helper never replaces/restarts the trusted ADB server.

## TV-connected mouse and remote desktop

The Xiaomi receiver stays plugged into the TV. **CONSOLE** and **DESKTOP** connect that
receiver to macOS over the direct Ethernet cable. The owner confirmed one pointer,
correct movement and working clicks on the portrait Console. **STOP** releases
it back to Android and closes the dedicated USB client/server. START,
STUDIO and PLAY LOOP leave an existing connection alone. No mouse-axis remapping
is installed; keep the accepted Mac 90° / Android user_rotation 2 display settings.

One-time installation or deliberate version update, from this checkout:

```sh
zsh deploy/macos/install-mirror-mouse.sh
```

Exit the dedicated VirtualHere client before reinstalling. The installer pins
tested server 4.8.8 and Mac client 6.0.3 by SHA-256 and verifies the client's vendor
signature/notarization. If a vendor download changes, it fails closed until the
new version is checked and its pin deliberately updated. It uses the board's
existing root access; no rooting, security-policy change or paid client service
is needed. Allow VirtualHereUniversal's normal macOS **Local Network** prompt on
first use. The existing installation has this permission. Only USB `2717:50d1`
is shared; its IPv4 server accepts TCP 7575 only from the directly wired Mac
`192.168.77.1`. No USB reports or mouse/keyboard events are recorded.

The client/config/helper live at `/Applications/VirtualHereUniversal.app` and
`~/Library/Application Support/MagicMirror/mouse/`; the board files are under
`/data/local/tmp/mm-mouse/`. CONSOLE restarts a missing server/client on demand;
it does not require a new login agent. Allow up to ten seconds for a failed
attempt to produce a fixed reason in `~/Library/Logs/MagicMirror/button.log`.
Console still opens if mouse forwarding fails, so remote input remains available.

For **Chrome Remote Desktop**, connect to this Mac as usual. To check the Console
without covering the avatar, stay on the main (virtual) display and double-click
**Remote Console Magic Mirror** on the Desktop. The Console opens there at normal
size while the avatar keeps running on the TV. It only shows the Console: it does
not start Magic Mirror, wake the TV, connect the TV mouse, change the Mirror mode
or play a sound, and if the app is not running it says so in an alert. The next
CONSOLE press (Neo key or Console app) moves the Console back over the avatar;
START, STUDIO, DESKTOP and PLAY LOOP hide it as before. Remote Console leaves a
Desktop TV visible and offers Return to Avatar. Install or reinstall it
with `zsh deploy/macos/install-remote-console.sh` (it refuses to replace any other
app of that name).

To see the Console where a TV user would, select the portrait T749 display (or
all displays) and open
`~/Applications/Magic Mirror Controls/Console Magic Mirror.app` remotely; the
physical Neo button is not required. The existing virtual
main display and remote desktop host remain unchanged. Both inputs control the
same Mac pointer; take turns using the local and remote mice. After moving the
physical mouse, leave it still for a few seconds before controlling remotely
(Chrome Remote Desktop gives local input temporary priority). The helper only
places an outside pointer on the portrait display when CONSOLE or DESKTOP is invoked, then
exits. STOP does not stop Chrome Remote Desktop. End-to-end remote acceptance and
recovery limits are recorded in the [mouse QA ledger](../../docs/testing/portrait-console-mouse-2026-10-17.md).

## Verification

The six-key profile and targets were checked in the connected Neo's editor.
Fresh checks passed 24 isolated Electron journey cases and 10 deployed Mac/TV
transitions, including Desktop to every mode and STOP. See the
[Desktop QA ledger](../../docs/testing/stream-deck-desktop-2026-10-23.md).
A physical press of the new key remains separate from this evidence. The assigned app
wrappers were exercised on the actual Mac/TV, including playback acknowledgement,
repeat PLAY, saved-mode return and crash restoration. Fresh unit, Electron
playback/recovery and field evidence is
in the [Loop Video ledger](../../docs/testing/operator-loop-2026-10-17.md).
The latest [Console/global STOP checks](../../docs/testing/operator-controls-2026-10-17.md)
cover Console on the real HDMI display and mode-preserving overlay behavior.
The saved initial preset is `3_worlds_loop.mp4` with separate `天使_intro.mp3`,
contain fit and 70% volume; change it in Console → Loop Video.

[Installation metadata](../../.artifacts/stream-deck-2026-10-17/installation-verification.json)
records the vendor signature, package SHA-256, versions, exact two assignments,
and startup/persistence checks without retaining the device serial number.
[Live lifecycle results](../../.artifacts/stream-deck-2026-10-17/live-controls-results.json)
cover the assigned application launch path, renderer readiness, duplicate presses,
ordered STOP→START, clean process release, and a 30-second no-restart interval.
The owner confirmed physical START/STOP presses work. Physical PLAY LOOP press,
USB reconnect and cold-login acceptance remain separate. Earlier TV integration evidence is in the
[ledger](../../docs/testing/stream-deck-controls-2026-10-17.md).

Primary sources: [Elgato downloads](https://www.elgato.com/us/en/s/downloads),
[built-in System actions](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia).
