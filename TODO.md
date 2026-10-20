# Open work — reconciled 2026-10-18

Only unresolved defects, limitations and acceptance remain here. Current delivery
and runtime: [PROGRESS](PROGRESS.md). Durable rules: [DECISIONS](DECISIONS.md).
The 2026-10-18 code-audit findings and media deadline limitation are fixed:
[evidence](docs/testing/todo-audit-fixes-2026-10-18.md). Memory model and
sign-in upkeep: [evidence](docs/testing/memory-model-signin-2026-10-18.md).
Interactive Studio, Mirror mode switch and Stream Deck key:
[evidence](docs/testing/interactive-studio-2026-10-18.md) ·
[user journeys](docs/testing/user-journeys-2026-10-18.md).

## Earlier unresolved reliability

- [ ] **Camera transport/driver stall.** Minimal capture received no frames and
  macOS reported about 99% invalid UVC payloads. App-owned, awake-only reset
  restores frames briefly but cannot sustain this Arducam. Obtain controlled
  alternate cable/port, powered-hub, device or host evidence to isolate the
  boundary; do not depend on manual unplug/replug recovery.
  [Camera investigation](docs/testing/open-issues-2026-10-13.md#1-camera-cannot-sustain-fresh-frames).
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
- [ ] **Intermittent Console reload stall.** One of three ritual runs stalled;
  later runs passed. Preserve the failure and use the new unload-blocker
  diagnostics if it recurs before claiming the cause is fixed.
  [QA driver evidence](docs/testing/console-ux-revamp-2026-10-17.md#qa-drivers-repaired).

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
- [ ] **Studio names by voice.** Since 2026-10-20 a name counts as confirmed
  only from the visitor's reply to its read-back; the final build passed 5 of 5
  name steps (王小明 → 王曉明 by 「破曉的曉」, spelled M-I-A → Mia). The model still
  decides how to rebuild a described character; measure with human speakers
  before an event that depends on exact names.
  [Studio stories](docs/testing/interactive-studio-stories-2026-10-20.md).
- [ ] **Repaint preamble (owner decision).** A change asked with a spoken
  preamble now gets no second line, but a vague preamble (「讓我想一下…」) can then
  be the only line before a ~45 s repaint. Options: allow one short in-character
  preamble for studio_revise with a sample phrase in its tool description (the
  prompting guide's approach; extends the 2026-10-14 preamble ruling), or keep
  as is. The painting line after the last answer is still sometimes spoken twice.
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
