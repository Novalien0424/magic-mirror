# Stream Deck Neo controls

The venue Mac has Elgato Stream Deck 7.6.0 (23012), verified current by its own
updater on 2026-10-17. The signed, notarized vendor installer was used. Neo
firmware was updated successfully from 1.00.013 to 1.00.017; its update button
disappeared afterward. Stream Deck opens automatically at login.

The selected **Magic Mirror** profile has two buttons on the top row:

| Position | Button | Action |
| --- | --- | --- |
| First / left | Green **START MIRROR** | Start Magic Mirror, wait for renderer load/bridge readiness, then wake the TV onto HDMI. An already-running app stays running. |
| Second | Red **STOP MIRROR** | Put the TV in standby, then request Main's clean shutdown, verify release, and unload the job so it stays stopped. |

START opens the normal application, initially in reflective Dormant mode.
It restores the last saved active avatar selection (the Console's **Use on
Mirror** selection), currently Raven. The scripts do not hard-code an avatar or
overwrite that selection when starting or stopping.
Normal avatar wake behavior and TV presence policy still apply. STOP closes the
application as well as sleeping the TV. Starting again bootstraps the same
installed LaunchAgent.

**Standby is not complete power-off.** Android reports Asleep and display OFF,
but the board remains powered and reachable over wired ADB so START can wake it.
No black-desktop helper is installed. Standby consumption has not been measured;
wake after a full Android shutdown or removal of mains power is not established.
The Mac mini remains running. This does not change the Mac's pre-login/boot screen.

Both buttons use Elgato's built-in **System → Open** action. The targets are
`~/Applications/Magic Mirror Controls/Start Magic Mirror.app` and
`~/Applications/Magic Mirror Controls/Stop Magic Mirror.app`. The small local
apps call the executable [start](magic-mirror-start.sh) and
[stop](magic-mirror-stop.sh) scripts without opening Terminal. No extra plugin,
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

[Installation metadata](../../.artifacts/stream-deck-2026-10-17/installation-verification.json)
records the vendor signature, package SHA-256, versions, exact two assignments,
and startup/persistence checks without retaining the device serial number.
[Live lifecycle results](../../.artifacts/stream-deck-2026-10-17/live-controls-results.json)
cover the assigned application launch path, renderer readiness, duplicate presses,
ordered STOP→START, clean process release, and a 30-second no-restart interval.
The owner confirmed physical START/STOP presses work. USB reconnect/cold-login
acceptance remains separate. Fresh TV integration evidence is in the current
[ledger](../../docs/testing/stream-deck-controls-2026-10-17.md).

Primary sources: [Elgato downloads](https://www.elgato.com/us/en/s/downloads),
[built-in System actions](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia).
