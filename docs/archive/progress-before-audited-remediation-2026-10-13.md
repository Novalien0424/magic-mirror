# Magic Mirror — current delivery, 2026-10-13

## Latest audit and authorized prompt/harness changes

[Remaining-errors and character audit](../../docs/testing/remaining-errors-and-character-audit-2026-10-13.md)
reproduces a late camera image crossing visitor turns, diagnostic state overwriting
camera availability, and language-hint classification gaps. Those application
fixes remain pending under the owner's audit-only instruction. Camera UVC, wake
during playback and memory quality/interpreter failures remain unresolved.

The owner separately authorized skills, harness and prompt changes. The catalog
now reinforces character continuity (+67 template tokens, still seven tools).
Judge v6 scores character separately; `character_consistency` is an opt-in
eight-turn scenario. Camera ASR is diagnostic rather than a visual-test gate;
invalid judgments, duplicate runs and mixed case sets no longer distort rates.
The report contains a proposed Raven persona; published v17 is unchanged.

Fresh verification: **60 focused tests pass**, both TypeScript projects, build,
source/output stamp and three edited skills pass. No Electron/provider/device
trial ran. The new prompt is a candidate without live character acceptance.
Next: address the audited application bugs when authorized and evaluate matched
character candidates; do not treat past full-suite/physical passes as new evidence.

## Runtime

Latest [camera reliability investigation](../../docs/testing/camera-reliability-2026-10-13.md):
requests now survive a worker-restart gap and fail promptly when the USB recovery
budget is exhausted. Three added regressions pass. Camera monitoring remains
awake-only; the two new physical runs pass all six ownership assertions.

**The USB stream is still unreliable.** Seven native experiments fail sustained
capture. macOS reports invalid video payloads; alternate formats/rates, a bus
reset and fresh helpers do not resolve it. Those unsuccessful changes are
reverted. The final physical run is **7/8**: speech recognition preserves the
request and Raven calls the tool, but no image is supplied. The separate real
Realtime/synthetic-image test passes **5/5**, including all four grounding
criteria. No overall camera acceptance. Current evidence supersedes the earlier
short passing samples for reliability claims; earlier measured recovery timing
remains in the [fast-reset ledger](../../docs/testing/camera-fast-recovery-2026-10-13.md).

The broader TV-off provider/device retest completed at **00:57 Taipei, Oct 13**.
Physical camera conversation and capability checks passed after repairs. Wake
over Jabra speech playback and model dialogue quality remain unqualified.
The preceding full suite passes **2,040 tests, 1 skipped**, including the camera
recovery regressions. Both TypeScript projects and the final build pass. Normal
Raven is stopped and production TV policy is intact.
Broader evidence and failures:
[Oct 12 retest](../../docs/testing/realtime-retest-2026-10-12.md).
Published **v17** and draft match, with no operator edits lost. Production model
IDs and persona are unchanged. The independent root board-ADB remains PID
**4320**. The final built output is stamped and verified.

TV power remains human-controlled. Startup allows up to 180 seconds for first
presence and requires at least 15 continuous seconds of dual absence before
clean exit. Start through com.magicmirror.launchagent when wanted; it is the
sole restart owner. Agent start/stop operations and QA use the shared Electron
operation lease described in [DECISIONS](../../DECISIONS.md).

The app owns targeted USB camera reset and fresh-frame verification while awake.
Main requests reset after 2.5 seconds without native frame receipts; no camera
watchdog runs while asleep. Owned Vision buffers and a bounded pending-request
recovery wait are implemented. The remaining blocker is the camera/USB/macOS UVC
path rejecting payloads after reset; firmware versus transport versus driver is
not isolated. Manual unplug/replug is not requested.

Mac en0 **192.168.77.1/24** → TV **192.168.77.2/24** is the control path.
AnyLauncher 1.13 owns TV HOME/HDMI; the old Mac HDMI watchdog is retired.
Last accepted layout: Virtual 16:9 Main, T749 right, Mac rotation 90°, Android
rotation 2. [TV evidence](../../docs/testing/tv-hdmi-boot-2026-10-10.md),
[operator runbook](../../deploy/macos/README.md).

## Delivery and evidence

The [third-audit ledger](../../docs/testing/third-audit-remediation-2026-10-11.md)
maps the [audit](../../docs/testing/third-audit-prompts-skills-persistence-2026-10-11.md)
to fixes, retained failures and remaining acceptance. Changes are uncommitted.

- Memory-reset races, language-hint replacement, control-turn ordering,
  missing-final-ASR ownership and exact media stop **「停止播放」** are fixed.
  Local-only requests have an application source gate. Tool output omits speech
  routing and confirmation receipts; failures carry bounded codes.
- Agents packages are pinned to **0.20.0**. The trimmed v17 prompt retains
  seven tools; the preceding repair clarified the camera description/use condition.
  The new audit adds character continuity above. The five-tool design stays QA-only.
- **Pre-audit full suite: 2,040 passed, 1 skipped**, 183 passing files, exit 0;
  includes eight camera lifecycle and 28 camera tracker regressions.
  Includes sequential Electron smoke and Phase 0 integration. Both TypeScript
  projects, final build and source/output verification pass. The edited skills
  validate; scoped final diff and whitespace checks pass.
- **Oct 11 Mac persistence: 4/4 checks pass.** First wake-worker failure recovers
  in Main; a second triggers one launchd restart. Frozen renderer replacement
  takes 29.12 s. Double TERM exits 0 and stays stopped for 60 seconds.
  Installed LaunchAgent timeout is 20 seconds, other settings preserved.
- **Oct 11 Electron Main hang passes:** watchdog termination, one launchd
  restart and ready renderer in 60.01 s; original TV policy and clean stopped
  state restored. The first harness-restoration failure is retained.
- **Oct 11 button helper: 6/6 checks pass**, including duplicate presses,
  ordered stop→start, frozen-app unload and restart after unload; eight unit
  tests pass. This does not include physical Flic/Karabiner integration.
- Exact **「停止播放」** real-provider regression passes **8/8**: negation
  keeps playback, the exact command stops it without a model tool/reply, and
  the next ordinary turn and microphone release pass.
- Default online search now performs local discovery in application code,
  reuses only a current-turn same-query result and never treats failed discovery
  as a confirmed miss. New-request prefixes and Chinese 寶庫/宝库 are repaired.
- **Final Oct 13 capability recheck: 10/10**, on the production mini model and
  seven tools. WebGL, own/Chinese/shared-folder playback, synthetic-camera
  grounding, interruption and release pass. Chinese title ASR was literally
  correct; the model's query was not. Bounded current-turn transcript fallback
  recovered the match. Earlier failures are retained, not pooled into this pass.
- Oct 11 four versioned provider arms: **12/12 local-only runtime routes pass**.
  Quality: **0/3 baseline mini**, **0/3 trimmed mini**, **2/3 trimmed full**,
  **1/3 merged mini**. Every arm fails overall quality; no model/persona/tool
  promotion. The requested 200-tool-turn arms and holdout are not completed.
- Fresh repaired full provider run: **69 passed, 13 failed, 9 not executed**;
  **24/35 quality turns**. An identity-interpreter timeout caused the memory
  skips and invalidated dependent denial setup. Focused denial then passes all
  runtime checks and **2/2 quality**. Latest focused memory: **16/18 checks,
  4/10 quality**; explicit save succeeds, unnecessary tool use and poor recall
  remain. Default fallback: runtime ordering passes, **3/4 quality** under
  judge v5. No overall conversation-quality acceptance.

[Current retest ledger](../../docs/testing/realtime-retest-2026-10-12.md) records
official OpenAI/Apple/Jabra research, fixes, failures and device evidence.
[Current metadata and full failed-test evidence](../../.artifacts/realtime-retest-2026-10-12/)
are byte-verified. Provider screenshots were reviewed on the virtual landscape
display before completed marked scratch cleanup. The earlier
[third-audit archive](../../.artifacts/third-audit-remediation-2026-10-11/) remains.
Portrait-TV acceptance remains separate. No phase advances. The
[Oct 11 field ledger](../../docs/testing/realtime-field-followup-2026-10-11.md) and
[its evidence](../../.artifacts/realtime-field-followup-2026-10-11/) remain historical.

Earlier [second-audit evidence](../../docs/testing/second-audit-remediation-2026-10-11.md)
remains valid for unchanged boundaries. Committed baseline: **a5f7118** runtime
remediation and **22e4565** second audit. Pre-existing operator, Claude, audit
and owner-check changes are preserved.

## Remaining acceptance and next action

Resolve model language/narration/recall and qualify wake during representative
Jabra media before the larger gold/holdout campaign or model/tool promotion.
Camera cold-wake delivery remains blocked by invalid UVC payloads after reset.
Ownership/release is verified; the final physical request is recognized and
routes to the correct tool. Use the retained driver counters to investigate the
camera/USB/macOS boundary before repeating unchanged capture tests. Model camera
grounding passed one synthetic-image sample and is not a broad reliability rate.
For AEC, first establish reference/capture alignment; the current experiment
never aligned. Memory save passed the diagnostic retry, but two earlier schema
failures and an identity timeout remain unexplained. Capture only bounded
validation-stage reasons on recurrence. Chinese-title and interruption passes
are single-run evidence, not general reliability. Keep production IDs versioned.

The **24-hour soak**, ten actual conversation cycles, **T1–T5** physical
power/cold-boot checks and Flic purchase/pairing/Karabiner approvals remain open.
The TV must be present for soak. Both the shared Mac operation lease and button
queue mutex are kernel-owned; a real SIGKILL test verifies lock recovery despite
stale metadata. Physical button reboot acceptance remains open. No
physical-button or packaged/signing acceptance is claimed.

Fresh physical wake: quiet **5/5**, Jabra −20 dB speech bed **0/10** without
experimental AEC and **0/10** with it; all 25 negative trials pass. Input is
fresh, but AEC never acquires delay alignment (ERLE 0); this does not test an
effective canceller. Production AEC stays disabled, with no Jabra setting or
firmware change. Earlier acoustic route/call-mode findings remain in the field
ledger. Full-provider YouTube-loop wake still fails; a local-tone-loop pass
does not establish representative media or human acceptance. Published
Raven has no production spells/scenes; effects need operator-authored presets.
Screen-lock change still requires owner authentication.

[Previous handoff](../../docs/archive/progress-before-third-audit-remediation-2026-10-11.md),
[earlier handoff](../../docs/archive/progress-before-second-audit-remediation-2026-10-11.md),
[durable rulings](../../DECISIONS.md).
