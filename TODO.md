# Open work — reconciled 2026-10-21

Only unresolved defects, limitations and acceptance remain here. Current delivery
and runtime: [PROGRESS](PROGRESS.md). Durable rules: [DECISIONS](DECISIONS.md).

## Unresolved reliability

- [ ] **Camera transport/driver reliability.** The owner's temporary minimum
  mode is 96×96 at 5 fps. It returned six native snapshots, but strict stability
  failed; a separate 72-frame sample delivered about 2.18 fps. The earlier zero-frame
  result is superseded, while continuous reliability remains unqualified.
  Obtain vendor-matched firmware/PCB or alternate cable/port/host evidence,
  then qualify a persistent fix across restart/reboot.
  [Latest native evidence](docs/testing/low-camera-image-journeys-2026-10-21.md) ·
  [Transport investigation](docs/testing/camera-availability-qa-2026-10-18.md).
- [ ] **Wake robustness under media and cold start.** Validate representative
  human positives, near negatives and startup behavior over Dormant media. The
  Jabra speech-bed stress failures remain; synthetic detection rates are not
  human accuracy. Consolidates the older duplicate wake checks.
  [Wake investigation](docs/testing/open-issues-2026-10-13.md#2-wake-fails-over-the-tested-speech-playback).
- [ ] **Realtime dialogue and media reliability.** Check the hidden online
  phrase 「在雲上找找」 through the real microphone and repeat matched scenarios
  if field results worsen. On 10-17 the gate held, but mini searched on 4/6
  phrase turns and sometimes failed to play. Identity ASR, factual correction,
  character/tool delivery and repeated Chinese-title clarification also retain
  evidence gaps; do not reopen repaired memory-write bugs without reproduction.
  [Latest live results](docs/testing/console-ux-revamp-2026-10-17.md#results) ·
  [Earlier boundaries](docs/testing/open-issues-2026-10-13.md).
  The 10-21 ordinary-camera regression also missed tool selection on its first
  attempt despite correct ASR; its one unchanged retry passed all five checks.
  No photo was taken on the failed attempt.
  [Camera failure/retry](docs/testing/avatar-image-skill-selection-2026-10-21.md#results).
- [ ] **Intermittent Console reload stall.** One of three ritual runs stalled;
  later runs passed. Preserve the failure and use the new unload-blocker
  diagnostics if it recurs before claiming the cause is fixed.
  [QA driver evidence](docs/testing/console-ux-revamp-2026-10-17.md#qa-drivers-repaired).
- [ ] **Image chat completion timing.** The first per-Avatar live Conversation
  run timed out waiting for chat-during-painting completion despite recorded audio
  replies and an image reveal. The single retry passed the full 14-check journey.
  New metadata counters can identify the outstanding wait if it recurs; the first
  run does not establish whether provider timing or QA tracking was responsible.
  [Retained failure and retry](docs/testing/avatar-image-skill-selection-2026-10-21.md#results).

- [ ] **Live quality judge baseline on `gpt-6.1-sol`.** Since config 19 the
  judge reads the memory role, now `gpt-6.1-sol`. Live `local_scope` failed its
  quality judge twice (tool silence, grounding, naturalness/character 2/3) while
  every application check passed; the luna judge passed it on retry. Decide
  whether to re-baseline thresholds or give the judge its own versioned model
  role before treating live quality failures as regressions.
  [Evidence](docs/testing/memory-model-signin-2026-10-18.md#results).
- [ ] **Cold Drive media on a real download.** The size-scaled wait and
  copy-before-play are proven with synthetic delays only. Once, with a large
  online-only Common video, check Loop Save/Play, Stream Deck PLAY LOOP and a
  conversation request. Known limitation: during a long copy, a PLAY LOOP press
  shows nothing until the loop starts, and a conversation request waits with the
  avatar visible but silent. [Fixes](docs/testing/todo-audit-fixes-2026-10-18.md).

## Remaining acceptance

- [ ] **Shared image skill with real guests.** The owner authorized a public
  Internet portrait after native frame delivery because nobody was available.
  The complete simulated journeys and retained failures are in the
  [latest per-Avatar report](docs/testing/avatar-image-skill-selection-2026-10-21.md).
  When a willing guest is available, verify real microphone use, a clear face
  at 96×96, fresh capture and likeness in both modes. Simulation cannot establish
  these human checks or reliable USB delivery.
- [ ] **Interactive Studio in the field.** The five-key profile is imported
  (Neo shows "Magic Mirror copy"; delete the unused old profile). Press
  INTERACTIVE STUDIO, say 「招喚渡鴉使者」 at the mirror (check detection; 招 is
  zhāo, the usual 召喚 is zhào — change the phrase in 1 · Start if detection is
  weak), complete one human visit to the farewell and Dormant, check the farewell
  pauses, then START MIRROR. Walk the [user journeys](docs/testing/user-journeys-2026-10-18.md)
  O2–O4 on the portrait TV.
- [ ] **QA sound wrapper and output-device switches.** During Electron runs the
  default output can flip between the TV output and the Jabra, so a restore can
  land on the other device. Pin capture/restore to one device (CoreAudio device
  ID) before the next long sound-producing batch; until then set the Jabra back
  to the normal 69 % after QA. [Evidence](docs/testing/interactive-studio-2026-10-18.md#owner-flow-follow-up-same-day).
- [ ] Review the compact Console on the portrait TV with its mouse, including
  Save/check feedback, live queued-scene cancellation, Return to Avatar while
  Loop Play starts and the Interactive Studio sign-in badge and Mirror mode
  switch. [Delivery](docs/testing/console-ux-revamp-2026-10-17.md).
- [ ] **Studio names by voice.** Measure corrections and spelling with human
  speakers before an event that depends on exact names. The 2026-10-20 synthetic
  visits passed 5 of 5 name steps, and local tests now cover repeated unconfirmed
  calls. The new 2026-10-21 shared-image QA passed 2/3 name steps; one visit
  advanced with the wrong intended spelling. Neither sample establishes human accuracy.
  [Studio stories](docs/testing/interactive-studio-stories-2026-10-20.md).
- [ ] **Sticker print output.** Stickers are shown on the mirror only; the
  keepsake has no file or printer output yet (`KeepsakeSink` is display-only).
  Decide how a finished sticker reaches the colour printer.
- [ ] **Published studio art style.** The owner's published studio keeps its
  ink-and-watercolour storybook style, which fights the flat sticker look;
  switch it in the Console if stickers are wanted there.
- [ ] Confirm Chrome Remote Desktop pointer movement/click, drag/scroll and
  keyboard alongside the forwarded TV mouse. Physical local direction/clicks
  are already accepted. [Mouse evidence](docs/testing/portrait-console-mouse-2026-10-17.md).
  Also open **Remote Console Magic Mirror** on the Desktop remotely: Console on
  the main display, avatar uncovered on the TV; then press CONSOLE on the Neo and
  check it returns over the avatar. [Remote Console](docs/testing/remote-console-2026-10-18.md).
- [ ] Confirm the latest Neo key layout/labels and physical START, CONSOLE,
  PLAY LOOP and STOP behavior, picture/music, USB reconnect and cold login.
  [Operator controls](docs/testing/operator-controls-2026-10-17.md).
- [ ] Complete outstanding Mac field acceptance: physical audio/echo and
  interruption, configured spell/effect and fade behavior, power/cold boot,
  packaging/signing, and a 24-hour TV-present soak with ten conversations.
  Follow current command/preamble rulings; no phase acceptance is implied.
  [Deferred acceptance](docs/testing/open-issues-2026-10-13.md#deferred-acceptance).

Every sound-producing QA must capture output volume/mute, use minimum output,
and restore the captured state on success, failure or cancellation. Such QA does
not establish normal-volume acoustic acceptance. See the
[sound directive](DECISIONS.md#2026-10-17--qa-sound-level-owner-directive).

Remove entries when the relevant fix and evidence exist. Superseded delivery and
optional historical artifact-cleanup requests stay in their evidence ledgers;
they are not current repair tasks.
