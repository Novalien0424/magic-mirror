# Open work — reconciled 2026-10-31

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
  (re-applies it after board reboots) was installed by the owner 10-31 20:50; watch one
  overnight standby. One intermittent `mouse_stop_failed` (1 of 3) remains unexplained.
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
- [ ] **QA open items 10-31.** `youtube_modes` 0 of 2 (no tool call; YouTube loop
  paused in Dormant, `raven_qa_loop_lost`); `--memory-live` unclassified harness error
  right after the identity step (channel-open wait did not cure it); acoustic wake
  during a loop fails at the 1% QA output level; `--memory-conversation` 0 of 2 and
  v22 character judge 0 of 10 (`unnecessary_question`, `wrong_language` on English
  turns answered in Chinese — check the judge against the PRD language rule).
- [ ] **Music page in the room.** AI_Stuff is Available offline (owner, 10-31); the Yunelle
  key plays its 84 songs from song 1 (field-checked). Owner: press each Music page key
  once on the Neo (folder titles, PREV/NEXT, STOP back to main) and listen across song
  changes with the re-sync pause (Bluetooth streams now pause 1.24 s between songs).
- [ ] **A1 keeps leaving Bluetooth** (20:35, 21:13, and absent since; outputs=3). Likely its
  auto power-off or the −80 dBm link; move it closer or disable auto-off. On rejoin it now
  takes the Jabra's level.
- [ ] **Video loop smoothness (not started; owner chose volume fixes first).** Loop-wrap
  hitch (QA: dropped frames at half the wraps), TV wake after playback, board camera-preview
  path. Proposed: local-path fetches for loop media, dropped-frame metrics, parallel TV wake.
  Old profiles ("Magic Mirror", "copy", "copy 1", "copy 2", "Magic Mirror Playback")
  can be deleted in Stream Deck.
- [ ] **Playback page on the Neo (physical).** VIDEO LOOP/MUSIC LOOP → VOL+/VOL−/STOP
  and STOP → main keys were imported and read back from Stream Deck's store
  (10-31); the wrappers, VOL± and STOP were field-run by script. A physical press
  of each Neo key remains the owner's check. The old "Magic Mirror", "copy" and
  "copy 1" profiles can be deleted in Stream Deck.
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

Every sound-producing QA uses minimum output (Jabra 1% is intentional), then
restores **Jabra 70% by device identity**, other outputs to their captured levels,
and preserves mute/input/default devices on success, failure or cancellation.
The device-aware wrapper is implemented; actual hotplug still needs field
coverage. [Current QA policy](.agents/skills/mm-ui-qa/SKILL.md).
Face enrollment, standalone Master Memory and backup/restore UI remain future
product scope in [PRD](PRD.md#6-尚未提供與待驗收), not accepted features.
