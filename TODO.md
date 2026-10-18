# Open work — reconciled 2026-10-18

Only unresolved defects, limitations and acceptance remain here. Current delivery
and runtime: [PROGRESS](PROGRESS.md). Durable rules: [DECISIONS](DECISIONS.md).
The 2026-10-18 code-audit findings and media deadline limitation are fixed:
[evidence](docs/testing/todo-audit-fixes-2026-10-18.md).

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

## Remaining acceptance

- [ ] Review the compact Console on the portrait TV with its mouse, including
  Save/check feedback and live queued-scene cancellation. Complete a human
  Portrait Studio visit using Jabra. [Delivery](docs/testing/console-ux-revamp-2026-10-17.md).
- [ ] Confirm Chrome Remote Desktop pointer movement/click, drag/scroll and
  keyboard alongside the forwarded TV mouse. Physical local direction/clicks
  are already accepted. [Mouse evidence](docs/testing/portrait-console-mouse-2026-10-17.md).
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
