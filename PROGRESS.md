# Magic Mirror — current handoff, 2026-10-31

## Current delivery

Runtime: `field/macmini-deploy`, audit fixes committed as f338c9d and pushed; the
all-speakers and quality-rate follow-up is committed on top. Built and running on
the canonical Mac (production restarted 17:07 Taipei).
[Audit and QA report](https://claude.ai/artifact/QPzGYwcT5HiRbhFSXNi7DV) ·
[prior handoff](docs/archive/progress-before-dance-floor-2026-10-30.md).

What changed (rulings in [DECISIONS](DECISIONS.md) 2026-10-31, product in [PRD](PRD.md)):

- **Evening 10-31 (uncommitted until the owner says so):** VIDEO LOOP cold start fixed
  (the renderer retried a default output being switched to the shared speakers once and
  no longer keeps a failed route after the sink detaches); MusicLoop decoupled from the
  TV (no TV-absent exit while it plays; a hidden panel never fails the command);
  Playback page (VIDEO/MUSIC LOOP → VOL+/VOL−/STOP, STOP → main keys; two-profile
  package imported as "Magic Mirror copy 2" + "Magic Mirror Playback"); TV presence
  and STOP/portrait accept the unnamed panel; board wakelock (RCA below); wake cue
  opens on the Jabra (458 → 13 ms); QA harness fixes (ritual sampling, media-intent
  tool map, memory channel race); title-alias discovery with generic media words.
  [User journeys and results](docs/testing/user-journeys-2026-10-31.md).
- **Night 10-31:** MusicLoop plays its own files in file-name order; the Neo's new
  **Magic Mirror Music** page has 3 subfolder keys (titled by the new Magic Mirror
  Controls plugin), PREV, NEXT, VOL± and STOP; an unreadable subfolder (Google Drive
  "Yunelle", not downloaded: EDEADLK) is skipped and its key refused while music keeps
  playing; the 1.2 s Bluetooth re-sync pause between songs is enabled. Field-checked
  13:34Z: NEXT/PREV, refused Yunelle/empty slot, music uninterrupted. Imported as
  "Magic Mirror copy 3" + "Magic Mirror Playback copy" + "Magic Mirror Music"; Stream
  Deck stopped answering accessibility after its relaunch, so the Neo was left on the
  Music page (its STOP returns to copy 3).
- **Volume fixes 10-31 night (owner: do 1 and 2; no loudness normalization because songs
  are added constantly; the 70% reset policy unchanged):** a rejoining speaker takes the
  Jabra's level (active from the next app start, built 21:45); button chimes now play at
  35% on the alert output (Jabra) via `stop-state --chime` (installed, field-checked).
  Investigation of video jitter (loop-wrap hitch, start delay, board capture path) and
  volume actors is in the session report; fixes 4–5 not started.
- **Follow-up check 21:57 Taipei:** Yunelle readable after AI_Stuff went offline (84
  songs); the re-sync pause measured on the Edifier stream (suspend 21:48:38.83 → start
  40.07); file-name order fixed for on-disk songs still being cached (waits ≤15 s; before,
  Yunelle started at song 2); runbook profile/page names corrected. Full unit suite passes;
  Phase 0 demos and Phase 4 runner checks pass with the app stopped (they refuse while it
  runs). MUSIC LOOP restarted on the new build (song 1).

- Dance Floor: Console Stop/Stop All end Dance and return to Conversation; loop-wrap
  clock fix; beat-locked groove; "Ready to Party?" welcome; 90% default volume;
  real-track movement QA (100% beat-locked, 4 ms median).
- Speakers: every music source (MusicLoop, Dance, conversation music, operator
  loop, YouTube) plays on every external output, Bluetooth aligned to a 185 ms
  floor; the Mac mini speaker is excluded. Main publishes "Magic Mirror Speakers"
  (`music-loop --shared-output`), audio-prefer makes it the default output while
  the app runs; voice/cues are pinned to the microphone's speakerphone (Jabra) and
  embedded local-video audio stays there. STOP/START/MUSIC LOOP/Dance end/QA return
  every external speaker (Jabra, Edifier, A1) to 70% unmuted (A1 had been at 100%).
- Raven persona v22 published (v21 kept as rollback): no quoted example lines (v21's
  「你們人類太囉嗦了…」 was copied verbatim); sarcasm only when Raven judges a visitor
  really too chatty or unclear. Not yet measured in QA.
- Studio: conversation-started visits return to conversation; bounded cue retry;
  thank-you loop, language-after-switch, comment and sticker prompt fixes.
- Conversation: dropped-connection detection, idle timer after barge-in, identity
  question language and lead-in, self-introduction → identify, photo portrait stays
  create_image, default Traditional-Chinese hint.
- Console: two-Console save conflicts, Save & apply scope, unsaved editor refreshes,
  Models errors, tailnet developer controls blocked, rollback confirmation.
- QA: reply-quality and barge-in judges report rates only; tool use, effects,
  privacy and cues stay hard gates. `raven-quality-rates.mjs` compares with the v9
  baseline (`resources/testing/raven-quality-baseline.v1.json`).

## Last observed runtime — not a live health guarantee

- 20:45 Taipei 10-31: production stopped by STOP (TV standby with the wakelock held,
  black cover, Jabra 0.701 / Edifier 0.70 unmuted; A1 no longer listed, likely asleep).
  Neo on "Magic Mirror copy 2". Field buttons (real Stream Deck path, outputs at 1%):
  every key cold and warm, STOP from every mode, VOL±, MUSIC LOOP with the TV in
  standby — all success outcomes after the board fix; 1 of 3 mouse stops failed once.
- Electron QA on the final builds: 17 Phase 4 modes pass (ritual after a harness fix);
  provider: `--live`, `--lifecycle-live` (2nd), `--spells-live`, media-intent (fixed
  harness) pass; `--memory-live` harness error after the identity step and
  `--memory-conversation` 0 of 2 open. Raven: 15 of 18 scenarios pass (some on the
  one allowed retry); open: `youtube_modes` (YouTube loop paused in Dormant),
  acoustic wake during a loop at 1% output, `local_media` 1 of 2 (model chose YouTube).
  Full unit suite 2938 passed. Details: [journeys](docs/testing/user-journeys-2026-10-31.md).

- 17:07 Taipei: START passed (app started, Jabra 70% unmuted read back; TV ADB
  still fails, known). `MUSIC_OUTPUT music_output_shared_ready outputs=4
  wireless=2`; default output = Magic Mirror Speakers, alerts and input = Jabra.
- Routing QA on this build (outputs at 1%): `--active-bgm`, `--media-skill`,
  `--operator-loop` and `run-youtube-qa.mjs --audible` passed; a CoreAudio watcher
  showed TV, Edifier, Jabra and A1 running together for music and Jabra alone for
  voice. Moving the default away left only the Jabra stream (voice pin holds).
- Unit + renderer: all pass except `phase4-qa-runner` mode checks, which refuse
  while production Electron runs (`electron_already_running`); typecheck clean.
- ~17:30 Taipei: the TV's HDMI bridge stopped sending its EDID. macOS lists it
  unnamed at 1280x720 (vendor 0), so everything matching "T749" missed it: no
  portrait rotation, STOP's black cover failed, and the app would hide the avatar.
  Fixed: a single unnamed non-main display now counts as the panel
  (`unnamed_target` in `display-target.ts`, `venueScreens()` in `stop-state`).
  The TV was set to 1920x1080@60 and rotated to portrait, and STOP now covers it
  (`blackout_covered`). A stale pre-fix cover helper held the lock and was ended.
  The board (192.168.77.2) still does not answer, so TV standby fails. The app is
  stopped (owner's STOP); avatar placement on the unnamed TV is unit-tested, not
  yet seen live.

**TV board RCA, 20:00 Taipei 10-31.** TV control worked 10-17…10-24 (last success:
STOP standby 10-24 17:32) and failed from 10-26 until the owner's power cycles today.
Reproduced on the board (Android 11, RK3568, kernel 4.19, `mem_sleep [deep]`, Ethernet
wake-on-LAN disabled): after the standby key the kernel attempts deep suspend every
7–13 s, each aborted by the vendor `watch_dog` wakelock, and every attempt takes eth0
down/up (and powers the RK628 HDMI bridge). Over days one cycle left Ethernet (and later
the EDID) wedged until power-off. No pre-reboot logs survive (logd/pstore not persistent).
Fix: a root kernel wakelock `magicmirror_standby` before every TV operation; with it the
board stayed Asleep/display OFF with 0 ping drops and woke in 2 s. A two-minute
per-user tick re-applies it after board reboots (`install-board-keep-awake.sh`,
installed by the owner 20:50 Taipei; first run exit 0, wakelock held).

## Next work / unresolved boundaries

Camera cable check, **17:44 Taipei 2026-10-31**: after the owner's cable swap/replug,
IOKit lists the USB hubs, Jabra and Stream Deck but no camera (`0c45:0520` count 0);
native AVFoundation discovery also returns 0 Arducam devices / 0 formats. This
blocks frame-rate/stability measurement; it does not identify which cable, port,
connector or camera component failed. No camera frames were captured and normal
Electron remained stopped. Next: verify the camera's physical data connection,
then rerun the minimum-mode cadence check once it enumerates. Metadata evidence:
[USB](.artifacts/camera-cable-2026-10-31/usb-enumeration.json) ·
[native discovery](.artifacts/camera-cable-2026-10-31/native-formats.json).
**17:48 Taipei, second owner replug:** unchanged — no camera in IOKit and 0
Arducam devices/formats in native discovery. Production Electron is now running
(PID 87817); it was left untouched and no second capture owner was launched.
[USB recheck](.artifacts/camera-cable-2026-10-31/usb-enumeration-replug2.json) ·
[native recheck](.artifacts/camera-cable-2026-10-31/native-formats-replug2.json).
Clock-in checks: Node typecheck and 30 display-target tests passed; existing app
build verification failed `qa_build_stale` (retained in
[preflight failures](.artifacts/camera-cable-2026-10-31/preflight-failures.txt)), so
rebuild current source before Electron QA. Other in-progress edits were preserved.

MusicLoop inspection, **21:00 Taipei 2026-10-31**: the saved shared root is the
Drive-backed `AI_Stuff/AI_Avatar/Common`; MusicLoop scans its `MusicLoop` tree
recursively, prepares cloud files through File Provider, and repeats ready tracks.
New files require a fresh mode start (STOP then MUSIC LOOP); a repeat press during
playback does not rescan. Live enumeration failed on `MusicLoop/Yunelle` with
`Resource deadlock avoided` (errno 11), including the one retry using the actual
playlist scanner. This currently blocks the whole scan before playback, rather
than skipping that directory. Last logged run at 20:46 loaded five tracks; current
folder completeness is unverified. All 28 music-loop/preparer unit tests passed.
No playback or source changes made. [Failure evidence](.artifacts/music-loop-inspection-2026-10-31/scan.json).

1. Owner: press the Neo keys
   once (VIDEO/MUSIC LOOP → Playback → STOP back), leave the TV in standby overnight.
2. Field: listen to conversation music and YouTube on all four speakers; check
   voice Stop and guest turns while music plays (other speakers are not
   echo-cancelled by the Jabra). Dance in the room; real guests for Studio/wake.
3. Owner: mini vs full dialogue model (quality rate below target); harness-review
   edits listed in the report; whether to delete retained QA artifacts.
4. Open items in [TODO](TODO.md), including the audit follow-ups not fixed today.
