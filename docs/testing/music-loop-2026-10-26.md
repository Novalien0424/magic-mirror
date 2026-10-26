# MusicLoop — plan, self-review and delivery, 2026-10-26

## Requested journey

Add one Stream Deck Neo key, **MUSIC / LOOP**, in unused slot (1,1). The operator
puts audio files inside the linked avatar shared folder's `MusicLoop` subfolder.
Pressing the key starts a filename-ordered playlist and repeats the complete
playlist indefinitely. Repeated presses do not overlap playback. Music goes to
all connected physical Mac output devices. The TV remains black; HDMI stays awake
so its audio output is usable. No avatar, wake microphone or camera runs behind it.

STOP releases the playlist and its native audio resources through Main's normal
shutdown, covers HDMI black, sleeps the TV and restores Jabra output to 70%.
START, STUDIO, PLAY LOOP and DESKTOP leave MusicLoop before entering their modes.
CONSOLE preserves playback so the operator can inspect status; Return to Avatar
stops it. No existing key is replaced. The LLM-search redesign is deferred in TODO.

## Implementation plan

1. Add a `music` appliance mode and `music_loop` operator command to the existing
   controller/mailbox. Reuse input suspension, black presentation, persisted
   intent, Console status and Main shutdown; no second Electron restart owner.
2. Main scans only the shared `MusicLoop` tree, ignores unsupported/hidden files,
   rejects symlink escapes and prepares cloud media through the existing local
   cache. Missing/empty folders and decode/output failures are explicit metadata
   reasons. A bad track is skipped; an entirely unusable playlist stops visibly.
3. A Main-owned native child uses a temporary private CoreAudio multi-output
   device (mirrored streams, drift correction) and AVPlayer. It routes only this
   player, never changes the default device/input gains or hardware volumes, and
   releases on stdin EOF/parent exit as well as explicit stop. Rebuild the route
   on output-device changes. No third-party driver or new dependency.
4. Add the signed wrapper and short key artwork through the existing installer.
   Assign the unused live Neo key through Stream Deck UI, preserving other keys.
5. Check focused sequencing/cancellation tests, native compile and actual output
   routing, isolated Electron journey, STOP and repeat behavior. Use minimum QA
   volume, preserve other outputs/mutes and restore Jabra to 70%. Remove owned
   fixtures and leave the normal installation stopped after QA.

## Self-review before implementation

- Main must own the child. A detached playlist outside Main would violate the
  existing global STOP contract and could survive shutdown.
- Validate actual playback progress before reporting success. A queued request,
  launched process or available default speaker does not prove all-output play.
- A private non-stacked aggregate mirrors the same data to its subdevices and
  avoids changing other Mac apps. Exclude virtual/aggregate devices to prevent
  duplicate routing; include connected physical output devices only.
- Cancel preparation and pending starts on mode change/STOP. Ended callbacks from
  old tracks cannot restart playback. Keep all diagnostics metadata-only.
- Keep Console and its unsaved draft alive. Mode status must distinguish MusicLoop
  from Loop Video; existing video controls still work.
- The shared MusicLoop directory was absent at inspection. Do not assume songs
  have been selected or put test audio into the production playlist permanently.
- Native routing/clock advancement is not proof of acoustic quality, Bluetooth
  latency alignment or a human physical button press; report those separately.

Reviewed against invariants 1–12: no credential/model/identity/memory changes;
mic release precedes playback, failures are explicit, Main owns authorization
and cleanup. Review complete; proceed with this bounded implementation.

Primary references: [Apple multi-output guidance](https://support.apple.com/guide/audio-midi-setup/ams7c093f372/mac),
installed CoreAudio `AudioHardware.h` (`kAudioAggregateDeviceIsPrivateKey`,
`kAudioAggregateDeviceIsStackedKey`, subdevice drift compensation), and installed
AVFoundation `AVPlayer.h` (`audioOutputDeviceUniqueID`).

## Results

Implemented and installed on the canonical Mac mini checkout. The active Neo
profile **Magic Mirror copy 1** now has MUSIC LOOP in bottom-row slot (1,1), with
a music-note icon and a two-line title. Assignment was made through Stream Deck's
System/Open UI; all six existing assignments and the selected profile were kept.
The signed wrapper is `~/Applications/Magic Mirror Controls/Music Loop Magic Mirror.app`.
The recovery profile and installer include the seventh key.

The linked `AI_Stuff/AI_Avatar/Common/MusicLoop` folder was created **empty**, as
the owner explicitly requested, and verified empty after testing. Add MP3, M4A,
AAC, WAV, AIFF, FLAC or CAF files. Nested folders are included in natural filename
order. Press MUSIC LOOP to start; STOP then MUSIC LOOP refreshes a changed list.
There is no alias/search dependency and no production test song was installed.

Main owns one native player and private multi-output route. Native checks found
three physical outputs: **Jabra Speak2 75, T749-fHD720 and Mac mini Speakers**.
The worker confirms all three aggregate subdevices and advancing playback before
success. Its route is released on mode change, shutdown, TERM and stdin EOF.
Queued STOP abandons a pending MusicLoop acknowledgement wait; the existing
global STOP path remains responsible for application shutdown and device cleanup.
No second application restart owner, new dependency, default-device selection,
input-gain change, credential or model change was introduced.

### Checks and observed repairs

[Machine-readable results](music-loop-checks-2026-10-26.json) include build
fingerprints, executed cases, playback/repeat metadata and hardware outcomes.
[Retained full failures](music-loop-failures-2026-10-26.txt) include both failed
Electron attempts, the later asynchronous test assertion and hardware STOP result.

- **290 distinct focused tests pass**, reusing unchanged passes: 288 across 11
  files, followed by 26/26 in MusicLoop/operator-controller tests after two new
  invalid-video transition cases. TypeScript node/web projects both pass.
- `npm run build`, native compilation/signing, wrapper signing verification,
  shell syntax, `git diff --check` and `node scripts/qa-build.mjs --verify` pass.
- Real isolated Electron `--operator-loop`: final **27/27 cases, exit 0,
  19 screenshots**, run `2026-10-26T06-53-06-830Z`. An earlier repaired build also
  passed 27/27 (`2026-10-26T06-46-33-103Z`). The final run used the deployed source
  `41f766685bacb443eb4e5b9ad63755c39ec4960e400ff2468f3ce20cd2fb6266` and output
  `8482e5376d1980d10a9066efba12c086668d86659b91580e64435e3ee76b5f8d`.
- The journey played two synthetic tracks on the native three-output route,
  completed two whole playlist wraps, kept playback on repeated MUSIC LOOP and
  CONSOLE, and released it for START, STUDIO, video loop, Desktop and Return to
  Avatar. It verified empty-folder messaging and retry after files were restored.
  The final case deliberately ended with native music active; normal Main
  shutdown left **zero Electron/music worker processes**.
- Cached `.media` WAV playback reached playing/end and exited cleanly on TERM
  and EOF. A temporary cached copy of an existing MP3 also reached playing on
  all three outputs and was removed. These checks used minimum QA hardware
  volume and player gain 0.01; they are route/clock evidence, not human listening.
- Inspected both final Console MusicLoop screenshots: readable playback state,
  empty-folder recovery instructions, Return to Avatar and Stop All, with no
  clipping. Live Neo artwork/title fit the key. Mirror uses the existing pure
  black component; MusicLoop DOM contains no avatar/video/audio. Existing black
  fallback pixel checks also passed.

QA caught a genuine decode gap: cloud-cache filenames end in `.media`, so the
native player could not identify their container. Main now passes the original
audio MIME type and AVURLAsset uses that override. The failing run had 24 prior
cases pass, then both music tracks failed to decode. Cached WAV/MP3 checks and
both subsequent Electron runs prove the repair.

Final review caught an invalid-video handoff gap: PLAY LOOP could stop music
before validating video while still reporting MusicLoop as playing. Validation
now preserves an already-playing playlist on rejection; pending music startup
still cancels promptly. Both branches have focused regression coverage and the
normal transitions passed again in the final Electron run.

Development-only fixes: the first Electron attempt expected three shared files
after two MusicLoop fixtures had raised that to five (five prior cases passed).
An asynchronous repeat assertion needed to wait for the next file preparation,
not just the previous track's completion; the test now observes the actual call.
Initial local test setup also needed macOS `/private/tmp` canonicalization and
updated command/installer counts, and a QA reply type was corrected before build.
These were not hidden as passing attempts.

Focused command:

```sh
node node_modules/vitest/vitest.mjs run tests/unit/music-loop.test.ts tests/unit/operator-loop.test.ts tests/unit/operator-control.test.ts tests/unit/operator-command.test.ts tests/unit/raven-button.test.ts tests/unit/mirror-tv-control.test.ts tests/unit/prepare-media-file.test.ts tests/renderer/mirror/operator-loop-app.test.ts tests/renderer/mirror/operator-loop-controller.test.ts tests/renderer/console/second-audit-status.test.ts tests/renderer/console/loop-video-panel.test.ts
npm run typecheck
npm run build
```

Rendered check: `MIRROR_DISPLAY=T749 node scripts/run-phase4-qa.mjs --operator-loop`,
wrapped by a temporary native output guard that captured other device volumes
and mute states in RAM, set writable outputs to 1%, and restored them after each
run, including failures. Jabra was restored to 70% every time, then the installed
`stop-state --reset-output` / `--output-status` verified **70.08%** at final cleanup.
No human speech, provider dialogue, camera capture or production config/draft edit
was required. Normal production Electron was not started; its stopped state was
preserved throughout isolated QA.

### Hardware STOP limit

The real combined STOP path was exercised on the already-stopped installation
under the Electron operation lease. It returned `blackout_covered`,
`jabra_output_70`, `already_off`, no loaded application LaunchAgent and zero
playback processes. **TV standby and mouse disconnect failed**. A direct
metadata-only probe found the trusted board service available but the venue ADB
transport missing (`tv_transport_missing`, exit 1). This remains an external
hardware boundary; no success is claimed for TV power or mouse release.
HDMI's native black cover remains active. No physical key press, acoustic quality,
inter-device timing alignment or physical hotplug acceptance is claimed.

### Cleanup and next use

Four reviewed QA roots were cleaned: **365 files / 53119588 bytes**, excluding
the four retained ownership markers. All 27 owned scratch files were removed.
Metadata results/failures remain after screenshot review. The production MusicLoop folder remains empty,
Jabra remains at 70%, and the application stays stopped with the black cover.
The next operator action is to add music and press MUSIC LOOP. The LLM-led media
selection redesign is recorded in [TODO](../../TODO.md) and remains deferred.
