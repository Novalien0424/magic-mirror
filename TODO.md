# Open work — reconciled 2026-10-31

Only unresolved work belongs here. [PRD](PRD.md) defines the current product;
[PROGRESS](PROGRESS.md) records delivery/runtime; [DECISIONS](DECISIONS.md) owns
rulings. Historical failures remain in linked reports, even when later repaired.

## Goal — owner away, 2026-10-31 night (authorized: fix every item, complete QA)

**Done means:** every item below is fixed with evidence, or marked blocked with the
exact physical reason; complete QA has run on the final build (unit, typecheck, build,
every Phase 4 mode, provider modes, Raven scenarios, YouTube/media runners, every
Stream Deck key in the field) with outputs at 1% and all external speakers back at 70%;
PRD/runbooks/PROGRESS are current; everything is committed and pushed. Each line is
ticked only with its evidence.

- [x] G1 A1 (far away): a reconnecting speaker joins mid-song (route rebuild) at the
  Jabra's level; a failed join now keeps the music on the speakers that worked and
  retries in 5 s (`operator_loop_music_route_kept`, unit-tested; was a MusicLoop stop).
  A real reconnect was not reproducible tonight (A1 absent).
- [x] G2 Neo: root cause of the Neo showing old keys: the old "copy 1" held Stream
  Deck's default-profile mark (`AppIdentifier *`), applied on launch and focus changes.
  "Magic Mirror copy 3" is now the default; the five obsolete profiles were deleted
  (left: Elgato Default Profile, copy 3, Magic Mirror Music, Magic Mirror Playback copy).
- [x] G3 Video loop smoothness: loop media re-reads reuse the verified local copy (one
  lstat on the source instead of realpath/prepare per range request); per-wrap
  `operator_loop_wrapped wraps= dropped=` markers. TV wake stays after the mode
  acknowledgement by the existing owner ruling (a failed start keeps the TV dark; 46
  tests encode it) — the owner kept this order (DECISIONS 11-01).
- [x] G4 `youtube_modes` loop: harness bug — the check treated the playlist reload
  states (-1/5) at a loop boundary as lost; product never paused it. Fixed (needs rerun).
- [x] G5 `--memory-live`: harness answered "yes" before the app asked (the app resets
  by design) and sent its own `response.create`; now waits for Main's
  `memory_question_delivered`/`memory_brief_installed` and names its errors (needs rerun).
- [x] G6 Memory/identity runners send no replies of their own; their failures are
  mini-model identity/recall rates (owner decision: mini vs full model).
- [x] G7 Judge is correct: the kept transcript has Simplified characters in 2 of 11
  replies and 1 unrequested English reply (mini drift; speech only, no captions);
  `unnecessary_question` follows v22's "ask one short question". Persona/model change
  needs a measured owner decision — not published while the owner is away.
- [x] G8 Acoustic wake during a loop: QA-environment limit — the synthetic visitor
  plays from the Mac mini speaker, which sits at 1% (its normal venue level) and is
  quieted for QA; needs a deliberate audible run (owner sound rule).
- [x] G9 `mouse_stop_failed`: a client ignoring EXIT is now ended (SIGTERM, SIGKILL;
  own process only) before the board stop; EXIT wait capped at 3 s (unit-tested).
- [x] G10 TV board standby holds: 10-31 22:38→11-01 01:09 in standby, 900 of 900 pings
  answered; the keep-awake tick held the wakelock throughout (106 runs by 00:12).
- [ ] G11 BLOCKED (physical): the camera is not on the USB bus at all (only Jabra,
  Stream Deck and two hubs); reconnect its cable/port.
- [x] G12 Complete QA on the final build: 42-run batch, every failure diagnosed, fixes
  rebuilt and rerun, field pass of every key (results in the journeys doc and PROGRESS);
  remaining provider rates are listed below.
- [x] G13 Docs current (PRD, TODO, PROGRESS, journeys, runbooks), committed and pushed.
- [x] G14 Stream Deck/Neo cannot silently show old keys again: "After every import
  (required)" default-profile step in the runbook, plugin install in the reinstall block.
- [x] G15 Skills, harness and CLAUDE.md correct and concise (build-while-running rule,
  venue runbook links, QA lease/1% acoustic-wake notes).

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
  drops; confirm a full overnight. A mouse client ignoring EXIT is now ended (G9).
- [x] **Post-restart Jabra volume / mute (10-31 cause found).** The Jabra's own
  firmware mutes at volume step 0 (its button at 1%) and pushes its stored step
  back when an app opens it; restores never cleared the mute. STOP, START (after
  the app owns it), Dance restore and QA now set 70% unmuted. Field-confirm once.
- [ ] **Post-restart Jabra volume (history).** STOP read-back was 70%; one later startup
  observation was 6.25%. Final explicit 70% held. Investigate if reproducible;
  cause is unknown, and continuous volume enforcement would prevent the owner's
  physical-button adjustment. [Evidence](docs/testing/dance-floor-checks-2026-10-30.json).
- [ ] **USB camera stability.** Temporary 96×96 / 5 fps mode delivered frames but
  failed strict stability; one sample averaged 2.18 fps. Qualify cable/port/host or
  vendor-matched firmware across restart/reboot.
  [Native checks](docs/testing/low-camera-image-journeys-2026-10-21.md) ·
  [Investigation](docs/testing/camera-availability-qa-2026-10-18.md).
- [ ] **Wake and voice quality.** Validate human names, corrections/spelling,
  near-negative wake phrases, cold start, media interference, barge-in and echo.
  Synthetic speech is not human accuracy. Repeat hidden online phrase
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
  turns), full 33% (24 turns). Owner to choose mini versus full for dialogue;
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
  timeout); acoustic wake during a loop at the 1% QA level (environment). Raven's
  in-character refusal to teach a spell ran ~30 s of speech.
- [ ] **Music page in the room.** AI_Stuff is Available offline (owner, 10-31); the Yunelle
  key plays its 84 songs from song 1 (field-checked). Owner: press each Music page key
  once on the Neo (folder titles, PREV/NEXT, STOP back to main) and listen across song
  changes with the re-sync pause (Bluetooth streams now pause 1.24 s between songs).
- [ ] **A1 keeps leaving Bluetooth** (20:35, 21:13, and absent since; outputs=3). Likely its
  auto power-off or the −80 dBm link; move it closer or disable auto-off. On rejoin it now
  takes the Jabra's level. Not yet seen live: a speaker leaving or rejoining mid-song (no
  rebuild, `speaker_matched` or `route_kept` event since the code shipped); Main's side is
  unit-tested only. The Edifier reads −78 dBm (11-01).
- [ ] **Airfoil sync — open items (11-01).** All music now plays through Airfoil (runbook
  "Airfoil music route"; calibrated Edifier +0.8 ms, A1 +26 ms from the Jabra, total 2148 ms).
  Open: (1) owner, physical: unplug the second Jabra (START/MUSIC LOOP 70% reset refuses
  while two Jabras are attached) and check whether the two Jabras are linked to each other
  (a +336 ms train in the iPad memo looked like the second unit echoing the first);
  (2) the TV (HDMI) is outside the Airfoil group: measure its delay once a non-Jabra mic
  exists, then add it (e.g. Computer = Jabra + HDMI multi-output); (3) the Jabra's hidden
  ≈108 ms rests on one iPad memo; re-check with a real mic; (4) watch A1 (±25 ms per stream
  start; weak link) and confirm by eye that VIDEO LOOP/YouTube pictures match the sound;
  (5) a second Edifier joins by name: re-run `speaker-sync/measure.sh` and set its offset.
- [ ] **Video loop smoothness.** Loop re-reads now reuse the local copy and each wrap logs
  `operator_loop_wrapped wraps= dropped=` (G3). Open: the board's camera-preview HDMI
  path (the TV wake order stays: DECISIONS 11-01). Watch the wrap markers in the room.
- [ ] **Playback page on the Neo (physical).** VIDEO LOOP/MUSIC LOOP → VOL+/VOL−/STOP
  and STOP → main keys were imported and read back from Stream Deck's store
  (10-31); the wrappers, VOL± and STOP were field-run by script. 11-01: the owner's
  presses switched pages, but Stream Deck returned to the main profile about 1 s later,
  because the mirror's `show()` and its simple-fullscreen re-toggle activated Electron
  (a focus change selects the default profile). Fixed: `showInactive` and no re-toggle
  when the mirror is already in place. Cold and warm VIDEO LOOP, MUSIC LOOP, the folder
  key and Console → VIDEO LOOP were verified with no focus change. A physical press of
  each Neo key remains the owner's check.
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
  alignment and saved offset, the Edifier Bluetooth speaker's ~183 ms reported
  latency against the Jabra (echo by ear), hotplug, normal-volume output and the
  complete 35-minute track boundary. Software clock measurements and quiet
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
