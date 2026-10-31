# Stream Deck Neo controls

The venue Mac has Elgato Stream Deck 7.6.0 (23012), verified current by its own
updater on 2026-10-17. The signed, notarized vendor installer was used. Neo
firmware was updated successfully from 1.00.013 to 1.00.017; its update button
disappeared afterward.

The current **Magic Mirror copy 1** profile has eight controls. DANCE FLOOR was
added through Stream Deck's UI to bottom-row third on 2026-10-30, preserving
the seven previous assignments. MUSIC LOOP was
added to its unused bottom-row second key on 2026-10-26; the existing default
profile and six assignments were preserved. PLAY LOOP is now labeled VIDEO LOOP.
STUDIO is shortened to fit the key;
DESKTOP occupies the top-right key. Elgato's original Default Profile and the older
Magic Mirror profiles are preserved.

| Position | Button | Action |
| --- | --- | --- |
| First / left (`0,0`) | Green **START MIRROR** | Ensure Magic Mirror is running and ready, require Main's successful `normal` acknowledgement (Conversation mode), then wake the TV onto HDMI. |
| Second (`1,0`) | Purple **CONSOLE** | Bring the existing Console above the mirror display, preserving current playback and unsaved edits; start the app and wake HDMI if needed. |
| Third (`2,0`) | Blue **VIDEO LOOP** | Ensure Magic Mirror is running and ready, require Main's successful `play_loop` acknowledgement of actual playback, then wake the TV onto HDMI. |
| Top right (`3,0`) | Teal **DESKTOP** | Pause voice, wake listening, camera and media; hide both Mirror windows, preserving unsaved Console edits; show the portrait macOS desktop and connect the TV mouse. |
| Bottom left (`0,1`) | Amber **STUDIO** | Same as START, but require Main's successful `studio` acknowledgement (Interactive Studio mode) before waking HDMI. |
| Bottom second (`1,1`) | Turquoise **MUSIC LOOP** | Loop ready audio files of up to 200 MB from shared `MusicLoop` on all connected physical Mac outputs while remaining files download. TV black; voice and camera off. |
| Bottom third (`2,1`) | **DANCE FLOOR** | Play selected Dance Floor audio through all external outputs (Bluetooth included; the Mac's built-in speaker is skipped when another speaker is present), default 90%, after Raven says "Ready to Party?", with Raven's beat-driven head/body motion. Voice listening and camera stay off. |
| Bottom right (`3,1`) | Red **STOP** | Cover T749 HDMI with pure black, put the TV in standby, stop Magic Mirror and its owned processes, unload its job, and reset Jabra Speak2 75 output to 70%. The black cover stays until another control has a ready app and acknowledged mode. |

START selects normal Conversation mode, including from Desktop or loop playback.
STUDIO likewise returns from Desktop or the loop to the avatar,
then selects Interactive Studio mode: the mirror now wakes to the avatar's Studio
wake phrase (default 「招喚渡鴉使者」), runs the studio and ends each visit with the
studio farewell and Dormant. VIDEO LOOP and CONSOLE leave the mirror mode alone;
STOP retains its black HDMI and Jabra 70% policy.
Display controls first verify the venue's Mac 90° portrait orientation.
MUSIC LOOP leaves TV power, orientation, mouse and the HDMI black cover alone.
DESKTOP keeps Electron running with input suspended; it does not discard Console
edits. START, STUDIO and VIDEO LOOP restore their selected view. CONSOLE returns
from Desktop to the saved avatar mode and opens its existing editor on the TV.
An ordinary fresh start begins in reflective Dormant mode.
It restores the last saved active avatar selection (the Console's **Use on
Mirror** selection), currently Raven. The scripts do not hard-code an avatar or
overwrite that selection when starting or stopping.
Normal avatar wake behavior and TV presence policy still apply. STOP closes the
application as well as sleeping the TV. Starting again bootstraps the same
installed LaunchAgent. VIDEO LOOP uses Main's approved loop; repeated LOOP is
idempotent in Main and does not restart playback. The controls do not supply a
media path. START, STUDIO, DESKTOP and VIDEO LOOP hide Console without
destroying its unsaved editor state. Repeated CONSOLE shows/focuses it; close the
window or press START/STUDIO/VIDEO LOOP to return to the mirror view.
STOP sends no mode command; Main clears desired mode on deliberate TERM. STOP
applies to Magic Mirror's programs, not unrelated Mac applications.

**Standby is not complete power-off.** Android reports Asleep and display OFF,
but the board remains powered and reachable over wired ADB so START can wake it.
The signed native black cover remains active after STOP. Standby consumption has not been measured;
wake after a full Android shutdown or removal of mains power is not established.
The Mac mini remains running. This does not change the Mac's pre-login/boot screen.

All eight buttons use Elgato's built-in **System → Open** action. The targets are
`~/Applications/Magic Mirror Controls/Start Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Stop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Play Loop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Console Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Studio Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Music Loop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Dance Floor Magic Mirror.app`, and
`~/Applications/Magic Mirror Controls/Desktop Magic Mirror.app`. The small local
apps call the executable [start](magic-mirror-start.sh),
[stop](magic-mirror-stop.sh), [loop](magic-mirror-loop.sh),
[Console](magic-mirror-console.sh), [studio](magic-mirror-studio.sh), and
[desktop](magic-mirror-desktop.sh) and [music](magic-mirror-music.sh) scripts
without opening Terminal. No extra plugin, hotkey remapper, accessibility grant,
microphone owner, or restart service is needed for these controls. Elgato's
original Default Profile remains available.

## MusicLoop

The linked shared folder is `AI_Stuff/AI_Avatar/Common`; its **MusicLoop** subfolder
was created empty at the owner's request. Add MP3, M4A, AAC, WAV, AIFF, FLAC or CAF
files of **200 MB or less (200,000,000 bytes)**, then press MUSIC LOOP. Larger files
are abnormal and skipped before download or playback; Console reports when all
files are oversized. Subfolders are included; hidden files and symlinks are
excluded. Number filenames for an explicit order among ready tracks.

Cached tracks start first; locally downloaded files are prepared before cloud-only
files. Ready tracks keep repeating while one background download completes. New
completed tracks join at a track boundary. If none are ready, Console shows
downloading/preparing and playback begins automatically. Downloads have a finite
size-based timeout (883 seconds at 200 MB); failure skips that file and preserves
playable music. Repeated MUSIC LOOP preserves playback and preparation. STOP then
MUSIC LOOP retries downloads and reloads added/removed files. An empty folder
produces an explicit Console message.

Each accepted MUSIC LOOP press first sets Jabra output to **70%** and verifies
the native read-back. This happens once per press, including a repeat press while
music is running. Jabra's physical volume buttons remain usable afterward; there
is no periodic reset or per-track volume enforcement. A missing/unavailable Jabra
reset is recorded in button diagnostics; music can still use other outputs.

Main owns the player and a temporary private macOS multi-output route. Current
outputs are Jabra, HDMI and Mac mini Speakers. Connected physical outputs are
rediscovered during playback; virtual and aggregate devices are excluded to avoid
duplicate routes. Input gain and device mute/volume are preserved; while the
app runs the default output is the shared "Magic Mirror Speakers" device (see
[README](README.md)), which this private route does not use. The route duplicates one stereo stream across the available outputs;
it does not concatenate their channels. MUSIC LOOP does not wake the TV or depend
on its ADB connection. HDMI receives music if the connected TV is already able to
play audio; TV power remains unchanged.

START, STUDIO, VIDEO LOOP, DESKTOP and Return to Avatar release MusicLoop before
changing modes. CONSOLE preserves it and shows status. **STOP ends it through the
same Main shutdown as all other modes**, destroys its temporary audio route,
sleeps TV, keeps HDMI black and restores Jabra to 70%. A queued STOP interrupts a
pending MusicLoop-start wait. No separate restart service is installed.

[Initial delivery](../../docs/testing/music-loop-2026-10-26.md) ·
[Download follow-up, checks and limits](../../docs/testing/music-loop-downloads-2026-10-26.md).

## Dance Floor

The default file is `AI_Stuff/AI_Avatar/Common/DanceFloor.m4a`; M4A plays directly.
Add other supported audio to `Common/DanceFloor`, maximum 200 MB per file.
Open **Console → Dance Floor** locally or through the existing tailnet Console
to refresh/select music, change intensity, volume, visual timing offset, welcome
and Chinese/English language. Save changes before Start. Track/language/welcome
apply next start; intensity, timing and a changed volume apply immediately.

Start prepares the file, analyses local beat timing, gives a brief in-character
welcome, then loops the music. No physical microphone or camera is used. Volume
is set once, default 100%, on writable Mac outputs; physical speaker controls
remain free afterward. Fixed-volume HDMI depends on the TV's own setting.
Music timing drives head and torso motion; this portrait rig has no independent
arms/legs. Positive timing offset advances Raven and negative delays Raven.

STOP releases Dance and restores Jabra70 plus the other outputs' prior levels.
The Console's Stop Dance Floor and global Stop All during Dance end Dance only:
they restore output levels (Jabra 70%) and return Raven to Conversation while
the app keeps running. Only the physical STOP key runs the shutdown/black-cover
operation (owner ruling 2026-10-31). Return to Avatar and other mode keys release
Dance before switching. Opening Console preserves Dance. Crashes do not restart
Dance automatically. [Journey, measurements and physical exclusions](../../docs/testing/dance-floor-delivery-2026-10-30.md).

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
STUDIO and VIDEO LOOP leave an existing connection alone. No mouse-axis remapping
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
START, STUDIO, DESKTOP and VIDEO LOOP hide it as before. Remote Console leaves a
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
The owner confirmed physical START/STOP presses work. Physical VIDEO LOOP press,
USB reconnect and cold-login acceptance remain separate. Earlier TV integration evidence is in the
[ledger](../../docs/testing/stream-deck-controls-2026-10-17.md).

Primary sources: [Elgato downloads](https://www.elgato.com/us/en/s/downloads),
[built-in System actions](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia).
