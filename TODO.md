# Open work — reconciled 2026-11-01

Only unresolved work belongs here. [PRD](PRD.md) defines the current product;
[PROGRESS](PROGRESS.md) records delivery/runtime; [DECISIONS](DECISIONS.md) owns
rulings. Historical failures remain in linked reports, even when later repaired.

## Reliability and product gaps

- [ ] **Studio operator rescue.** Speech-failure recovery is implemented (10-31:
  one retry per fixed line, then the visit continues with `studio_speech_skipped`).
  Still open: a visible safe exit and a current-visit name retry/correction
  control with fresh verbal read-back. The 10-24 name repair fixed candidate
  selection, receipt-based confirmation and tool-only repeats, but explicitly
  left these two gaps open.
  [Audit](docs/testing/studio-journey-audit-2026-10-24.md) ·
  [Repair boundary](docs/testing/guest-name-repair-2026-10-24.md).
- [ ] **TV board standby (RCA 10-31, fixed; confirm overnight).** Standby made
  the board retry deep suspend every ~10 s, cycling Ethernet and the HDMI bridge until
  they wedged (10-26…10-31; power cycles cured it). Every TV operation now holds a root
  wakelock; field STOP/START/CONSOLE/DESKTOP passed with 0 ping drops in standby. The keep-awake tick
  (re-applies it after board reboots, installed 10-31 20:50) held a 1.6 h standby with 0
  drops; confirm a full overnight. A mouse client ignoring EXIT is now ended.
- [ ] **Post-restart Jabra volume (history).** STOP read-back was 70%; one later startup
  observation was 6.25%. Final explicit 70% held. Likely cause found 11-07: opening the
  Jabra's microphone (as Raven does at start) switched its output from 70% to 0.0625 within
  the same second, twice in a row; the level stayed there after the mic closed. START's
  reset ~6 s after ready covers it; continuous volume enforcement would prevent the owner's
  physical-button adjustment. [Evidence](docs/testing/dance-floor-checks-2026-10-30.json).
- [ ] **USB camera stability.** Blocked (physical, 11-01): the camera is damaged and not
  on the USB bus; replace or reconnect it. Before that, temporary 96×96 / 5 fps mode delivered frames but
  failed strict stability; one sample averaged 2.18 fps. Qualify cable/port/host or
  vendor-matched firmware across restart/reboot.
  [Native checks](docs/testing/low-camera-image-journeys-2026-10-21.md) ·
  [Investigation](docs/testing/camera-availability-qa-2026-10-18.md).
- [ ] **Wake and voice quality.** Validate human names, corrections/spelling,
  near-negative wake phrases, cold start, media interference, barge-in and echo.
  Synthetic speech is not human accuracy. Owner wake-media check (11-01 evening, run under
  Electron for microphone access, Mac mini "visitor" raised to 50%): 0/10 wakes in every
  cell including the no-media control (voice 23 dB over the room), 0 false wakes; the
  stimulus is detected offline, so the Mac mini speaker → Jabra path, not media, defeats
  it. Needs a human or a better speaker-placed visitor. The TV speaker does play HDMI
  audio, even in standby (1 kHz probe +14.5 dB). Repeat hidden online phrase
  「在雲上找找」 and factual/character/tool scenarios if field results worsen.
  [Name repair](docs/testing/guest-name-repair-2026-10-24.md) ·
  [Voice boundaries](docs/testing/open-issues-2026-10-13.md) ·
  [Online-media sample](docs/testing/console-ux-revamp-2026-10-17.md).
- [ ] **Intermittent Console reload stall.** One ritual run stalled; later runs
  passed. Use unload-blocker diagnostics if it recurs; no established root cause.
  [Report](docs/testing/console-ux-revamp-2026-10-17.md#qa-drivers-repaired).
- [ ] **Image chat timing/tool selection.** A chat-during-painting timeout and an
  ordinary-camera tool-selection miss each passed one unchanged retry. Retain
  both failures; no claim of deterministic provider reliability.
  [Report](docs/testing/avatar-image-skill-selection-2026-10-21.md#results).
- [ ] **Reply quality below baseline target.** Quality is now a reported rate
  (ruling 2026-10-31). v9 baseline failure rate per judged turn: mini 57% (154
  turns), full 33% (24 turns). Owner keeps mini for now (11-01); report mini rates;
  improve character/naturalness without losing the persona.
- [ ] **Music on room speakers during conversation.** The Jabra cancels only its
  own output, so conversation music from the other speakers reaches the
  microphone. Check real-guest turns and voice Stop while music plays; consider
  ducking music while the visitor speaks.
- [ ] **Live quality-judge baseline (history).** The memory-role judge failed `local_scope`
  quality twice despite passing application checks; a prior judge passed on
  retry. Re-baseline or explicitly version a separate judge role before treating
  these scores as regressions. [Evidence](docs/testing/memory-model-signin-2026-10-18.md#results).
- [ ] **LLM-led media catalog selection.** Replace rigid alias/matcher admission
  with the LLM selecting real authorized catalog entries. Evaluate 50/200/512
  items, versions and ambiguity; preserve character and online authorization.
  Existing phonetic retrieval is shipped; this redesign is deferred.
  [Research and acceptance](docs/testing/llm-media-catalog-design-2026-10-25.md).
- [ ] **Physical sticker printing.** The final cue calls a deferred printer sink;
  physical printer and delivery are not connected. [Journey](PRD.md#3-完整訪客旅程).

- [ ] **Audit follow-ups not fixed on 10-31.** Hourly rollover does not wait for a
  quiet turn; a person switch/forget restarts the session silently and drops the
  pending identity; a local rollover failure shows OfflineLoop instead of
  Maintenance; one unclear identity answer cancels confirmation; group and
  late search-phrase turns rely on the extractor prompt; a SQLite failure enters
  Maintenance (DECISIONS says it must not gate conversation); deleting an avatar
  leaves its private memories unreachable; the Studio picture appears just before
  its reveal line; a MusicLoop intent can briefly resume on START after a crash.
- [ ] **Provider rates after the night QA (11-01).** Fixed and verified: spell cue stall
  (a spell cutting an unspoken line closed the visit, `scene_dialogue_cancel_failed`;
  `--live` 0 of 2 → pass), YouTube search argument shape and live/upcoming results
  (`default_fallback` 0 of 3 → pass), local scope/loop query words, memory-live and
  spells-live harnesses, long online videos in the YouTube checks. Remaining rates (mini
  model, prompts unchanged): `--lifecycle-live` preamble before the farewell (a doubled
  goodbye, 0 of 4); YouTube search then asking instead of playing (`youtube_once` 2 of 4,
  loop 1 of 3, media-intent 2 of 3); `local_media` tool route 0 of 3;
  `--memory-conversation` quality 0 of 2; `image_skill` 1 of 4 (chat-while-painting
  timeout); acoustic wake during a loop at the 1% QA level (environment). The ~30 s
  spell refusal came from `--spells-live`'s fixture persona, not Raven (Raven v23 asks for
  one or two sentences).
- [ ] **Music page in the room.** AI_Stuff is Available offline (owner, 10-31); the Yunelle
  key plays its 84 songs from song 1 (field-checked). 11-01 night, 1%, through the installed
  control apps: MUSIC LOOP, PREV/NEXT, VOL±, folder 1 (84 songs), the empty folder 2
  refused with the music kept, STOP back; no app focus change. Owner: press each Music page
  key once on the Neo and check the folder titles (the re-sync pause is direct-route only).
- [ ] **A1 keeps leaving Bluetooth** (20:35, 21:13, and absent since; still off 11-01 night,
  a reconnect attempt timed out, so Airfoil had only Jabra + Edifier). Likely its
  auto power-off or the −80 dBm link; move it closer or disable auto-off. On rejoin it now
  takes the Jabra's level. Not yet seen live: a speaker leaving or rejoining mid-song (no
  rebuild, `speaker_matched` or `route_kept` event since the code shipped); Main's side is
  unit-tested only.
- [ ] **Online songs (owner 11-07 night).** The relaxed phrase and Dormant playback are done and
  QA-passed (`cloud_songs`: both owner sentences found, played, Raven Dormant during and after).
  Open: (1) the owner judges by ear in the room (QA ran at 1%); (2) local media keeps the old
  behaviour (conversation resumes; local video sound on the Jabra; local Dormant loops 12 dB
  quieter); (3) mini still says a word before playing on some turns (judge `tool_silence`);
  (4) `phase4-qa-runner.test.ts` fails 6 cases only in the first full unit run right after
  `npm run build` and passes on rerun.
- [ ] **Airfoil sync — open items (11-01).** All music now plays through Airfoil (runbook
  "Airfoil music route"; calibrated Edifier +0.8 ms, A1 +26 ms from the Jabra, total 2148 ms).
  Open: (1) the second Jabra now plays through Jabra's link (11-07: silent while the USB Jabra
  had been pressed second; relinked with the USB Jabra first, owner confirmed both play, in sync
  by ear). Night re-tune 11-07: Computer 0.246, A1 0 (runbook); A1 now joins 6.5 min after each
  connect (Airfoil's Bluetooth sync glide). Owner to judge by ear on the next session; still open:
  A1 wanders ±20 ms with 30–40 ms jumps on its weak link (move it nearer the Mac mini, or an AirPlay
  speaker instead); A1 now stays connected through STOP (owner), so only a fresh connect waits.
  Its loudness at 1 m is unmeasured;
  (2) the TV (HDMI) is outside the Airfoil group: measure its delay once a non-Jabra mic
  exists, then add it (e.g. Computer = Jabra + HDMI multi-output); (3) the Jabra pair's absolute delay
  still rests on the 11-01 iPad memo (11-07 re-tune is relative to the Edifier; lip-sync `mmlt`
  unchanged); (4) watch A1 (±25 ms per stream
  start; weak link). The TV picture path is measured (67 ms, `tv-picture/measure.sh`) and
  compensated (reported latency 2081 ms); lip-sync now rests on the audio total (2148 ms);
  a glance at VIDEO LOOP/YouTube is still a useful sanity check;
  (5) a second Edifier joins by name: re-run `speaker-sync/measure.sh` and set its offset.
- [ ] **Video loop smoothness.** Loop re-reads now reuse the local copy and each wrap logs
  `operator_loop_wrapped wraps= dropped=`. Open: the board's camera-preview HDMI
  path (the TV wake order stays: DECISIONS 11-01). Watch the wrap markers in the room.
- [ ] **Playback page on the Neo (physical).** VIDEO LOOP/MUSIC LOOP → VOL+/VOL−/STOP
  and STOP → main keys were imported and read back from Stream Deck's store
  (10-31); the wrappers, VOL± and STOP were field-run by script. 11-01: the owner's
  presses switched pages, but Stream Deck returned to the main profile about 1 s later,
  because the mirror's `show()` and its simple-fullscreen re-toggle activated Electron
  (a focus change selects the default profile). Fixed: `showInactive` and no re-toggle
  when the mirror is already in place. Cold and warm VIDEO LOOP, MUSIC LOOP, the folder
  key and Console → VIDEO LOOP were verified with no focus change. 11-01 night re-check
  (1%): the installed profiles' switch targets resolve (main → Playback/Music, both STOPs →
  main); cold and warm VIDEO LOOP/MUSIC LOOP plus every page key, opened through the same
  control apps, gave 0 app activations in 24 presses (watchers caught a deliberate one), and
  the control apps themselves never take focus. A physical press of each Neo key remains
  the owner's check; nothing tests the installed profiles, the focus rule or the plugin's
  folder titles automatically.
- [ ] **System alert on the TV display.** A macOS UserNotificationCenter alert (260×192,
  behind the mirror and the black cover) has been waiting since 11-01 14:22, one second
  after an agent shell command (likely a permission prompt; text unreadable without Screen
  Recording). Owner: read and answer it on the Mac (deny if unsure).
- [ ] **Raven v22 in the room.** v22 (published 10-31) drops the quoted style
  lines that v21 repeated (「你們人類太囉嗦了…」 in about 1 of 10 replies) and keeps
  sarcasm for visitors Raven judges really too chatty or unclear. Not yet
  measured in QA; listen for leftover stock lines and for too little bite.

## Remaining field acceptance

- [ ] **Studio with real people.** Run opening → corrected/confirmed name →
  four answers/short comments → drawing cue → image → explicit redraw or finish →
  transfer → farewell/Dormant → fresh restart. Check silence branches, Chinese/
  English, name-only display and guest-list near sounds at the Jabra.
  [Current journey](PRD.md#3-完整訪客旅程) ·
  [Latest synthetic image run](docs/testing/studio-redraw-music-cap-2026-10-26.md).
  Saved modern minimalist art and MusicLoop 200 MB are already implemented.
- [ ] **Consented guest photo.** Verify real microphone permission, fresh clear
  face at the temporary camera mode and likeness; public-portrait simulation
  cannot prove these. [Report](docs/testing/avatar-image-skill-selection-2026-10-21.md).
- [ ] **Dance Floor installation.** Rendered sync on the real track is measured
  (10-31: 100% beat-locked, 4 ms median, groove added). Still check audible/visible
  alignment and saved offset on the Airfoil route (11-01: Dance's clock already waits
  for the music device's reported 2.1 s, checked silently), hotplug, normal-volume
  output and the complete 35-minute track boundary. Software clock measurements and quiet
  playback do not establish these. [Report](docs/testing/dance-floor-delivery-2026-10-30.md).
- [ ] **Cold Drive video and long-copy feedback.** MusicLoop/Dance native
  preparation is exercised; general Loop Video/conversation cold-video delivery
  and silent waiting UX remain to verify.
  [Video gap](docs/testing/todo-audit-fixes-2026-10-18.md) ·
  [Music download checks](docs/testing/music-loop-downloads-2026-10-26.md).
- [ ] **Physical operator journey.** Verify the current eight Neo keys, portrait
  Console save/check feedback, queued start cancellation, Desktop→other mode,
  Remote Console and remote-pointer/keyboard behavior with the TV mouse.
  [Current controls](deploy/macos/stream-deck.md) ·
  [Desktop evidence](docs/testing/stream-deck-desktop-2026-10-23.md).
- [ ] **Release/venue acceptance.** Connected lighting/fog, real scene fades,
  cold login/power, signing/packaging and 24-hour TV-present soak with ten
  conversations remain distinct from local test passes.
  [Acceptance boundaries](docs/testing/open-issues-2026-10-13.md#deferred-acceptance).

Every sound-producing QA uses minimum output (1% is intentional), then restores
**every external speaker to 70% unmuted** (Mac mini speaker to its captured level) and
preserves input/default devices on success, failure or cancellation.
The device-aware wrapper is implemented; actual hotplug still needs field
coverage. [Current QA policy](.agents/skills/mm-ui-qa/SKILL.md).
Face enrollment, standalone Master Memory and backup/restore UI remain future
product scope in [PRD](PRD.md#6-尚未提供與待驗收), not accepted features.
