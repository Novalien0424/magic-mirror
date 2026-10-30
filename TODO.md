# Open work — reconciled 2026-10-30

Only unresolved work belongs here. [PRD](PRD.md) defines the current product;
[PROGRESS](PROGRESS.md) records delivery/runtime; [DECISIONS](DECISIONS.md) owns
rulings. Historical failures remain in linked reports, even when later repaired.

## Reliability and product gaps

- [ ] **Studio speech-failure recovery and operator rescue.** A rejected opening
  or question cue can leave a step without its listening deadline. Add bounded
  recovery and a visible safe exit; provide a current-visit name retry/correction
  control with fresh verbal read-back. The 10-24 name repair fixed candidate
  selection, receipt-based confirmation and tool-only repeats, but explicitly
  left these two gaps open.
  [Audit](docs/testing/studio-journey-audit-2026-10-24.md) ·
  [Repair boundary](docs/testing/guest-name-repair-2026-10-24.md).
- [ ] **TV ADB transport and mouse release.** Wake/standby remain unavailable on
  10-30; local STOP, black HDMI and Jabra 70 work independently. Restore board
  transport and verify physical mode-to-STOP behavior.
  [Latest evidence](docs/testing/dance-floor-delivery-2026-10-30.md).
- [ ] **Post-restart Jabra volume.** STOP read-back was 70%; one later startup
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
- [ ] **Live quality-judge baseline.** The memory-role judge failed `local_scope`
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
- [ ] **Dance Floor installation.** Check audible/visible beat alignment and
  saved offset, independent speaker delay, hotplug, normal-volume output and
  the complete 35-minute track boundary. Software clock measurements and quiet
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
