# Stream Deck Neo controls

The venue Mac has Elgato Stream Deck 7.6.0 (23012), verified current by its own
updater on 2026-10-17. The signed, notarized vendor installer was used. Neo
firmware was updated successfully from 1.00.013 to 1.00.017; its update button
disappeared afterward. Stream Deck opens automatically at login.

The installed **Magic Mirror** profile has four controls. The latest owner
revision moves STOP to the bottom-right key and puts CONSOLE second; PLAY LOOP
stays third with padded artwork and a two-line label. All four signed application
wrappers were deployed on 2026-10-17. Elgato's Default Profile is preserved.

| Position | Button | Action |
| --- | --- | --- |
| First / left (`0,0`) | Green **START MIRROR** | Ensure Magic Mirror is running and ready, require Main's successful `normal` acknowledgement, then wake the TV onto HDMI. |
| Second (`1,0`) | Purple **CONSOLE** | Bring the existing Console above the mirror display, preserving current playback and unsaved edits; start the app and wake HDMI if needed. |
| Third (`2,0`) | Blue **PLAY LOOP** | Ensure Magic Mirror is running and ready, require Main's successful `play_loop` acknowledgement of actual playback, then wake the TV onto HDMI. |
| Bottom right (`3,1`) | Red **STOP** | Put the TV in standby, then stop the whole Magic Mirror application and owned processes, including loop/media and future program modes; unload the job so it stays stopped. |

START selects normal mode, including when the app was already playing the loop.
An ordinary fresh start begins in reflective Dormant mode.
It restores the last saved active avatar selection (the Console's **Use on
Mirror** selection), currently Raven. The scripts do not hard-code an avatar or
overwrite that selection when starting or stopping.
Normal avatar wake behavior and TV presence policy still apply. STOP closes the
application as well as sleeping the TV. Starting again bootstraps the same
installed LaunchAgent. PLAY LOOP uses Main's approved loop; repeated LOOP is
idempotent in Main and does not restart playback. The controls do not supply a
media path. START and PLAY LOOP hide Console without destroying its unsaved
editor state. Repeated CONSOLE shows/focuses it; close the window or press
START/PLAY LOOP to return to the mirror view. STOP sends no mode command; Main
clears desired mode on deliberate TERM. STOP applies to Magic Mirror's programs,
not unrelated Mac applications.

**Standby is not complete power-off.** Android reports Asleep and display OFF,
but the board remains powered and reachable over wired ADB so START can wake it.
No black-desktop helper is installed. Standby consumption has not been measured;
wake after a full Android shutdown or removal of mains power is not established.
The Mac mini remains running. This does not change the Mac's pre-login/boot screen.

All four buttons use Elgato's built-in **System → Open** action. The targets are
`~/Applications/Magic Mirror Controls/Start Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Stop Magic Mirror.app`,
`~/Applications/Magic Mirror Controls/Play Loop Magic Mirror.app`, and
`~/Applications/Magic Mirror Controls/Console Magic Mirror.app`. The small local
apps call the executable [start](magic-mirror-start.sh),
[stop](magic-mirror-stop.sh), [loop](magic-mirror-loop.sh), and
[Console](magic-mirror-console.sh) scripts without opening Terminal. No extra plugin,
hotkey remapper, accessibility grant, microphone owner, or restart service is
needed for these controls. Elgato's original Default Profile remains available.

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

The queue and graceful/forced-stop behavior, result sounds, metadata log, and
limits are documented in [raven-button.md](raven-button.md). Script exit zero
means queued; the final result is in `~/Library/Logs/MagicMirror/button.log`.
The controls require the existing installed field plist, canonical checkout,
built output, `/opt/homebrew/bin/node`, and the installed
`system/com.magicmirror.board-adb` daemon on port 5038; they do not build on every
press. A TV failure produces Basso and a metadata reason, while STOP still cleans
up the application. The helper never replaces/restarts the trusted ADB server.

## Verification

The four-key profile survived Stream Deck relaunch and the connected Neo was
verified through IOHID. The assigned app wrappers were exercised on the actual
Mac/TV, including playback acknowledgement, repeat PLAY, saved-mode return and
crash restoration. Fresh unit, Electron playback/recovery and field evidence is
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
