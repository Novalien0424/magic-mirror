# Historical voice design and Claude recovery handoffs

Superseded current-state entries; retained as history. Follow root PROGRESS for current work.

## Clock-in — 2026-09-09 15:05 Asia/Taipei

Claude review recovered and the voice-effects first routing gate investigated.
The actual user-level MCP override still launched upstream v0.9.0 despite the
repaired plugin manifest. Corrected only its command/args; fresh MCP launched
from actual user TOML passes ready/status/result/terminal cancel, **exit 0**.
Current attached connection is stale; restart Codex to load the corrected
launcher. [Root cause and proof](../../docs/testing/claude-in-codex-windows-repair-2026-09-09.md).

One replacement Fable/high review completed: **concerns**, 10 findings,
USD **0.757796**. Same job recovered; no duplicate replacement spend or running
review. [Review and assessment](../../docs/testing/avatar-voice-effects-design-review-2026-09-09.md).
Older pending-review authorization/resume text below is historical.

**Voice implementation blocked at the design's first source-routing gate.**
Canonical Electron 44 local-file test, actual loopback WebRTC remote track:
element-source RMS **0**, stream control **0.014235**, WAV control **0.014179**.
Default AudioContext sink selection works. Candidate fails, controls pass,
**exit 1**. [Windows evidence / next decision](../../docs/testing/voice-routing-proof-2026-09-09.md).
Per the focused design, stopped before DSP install/UI/live integration.
Next: resolve the failed source boundary and prove receiver suppression plus
single-sink MediaStreamAudioSource routing before resuming that integration.
Latency/reset/CSP/device/default-Raven sound gates remain open; no Mac claim.

No product code/dependency/config-publication changes, commit or push this turn.
Prior operator/motion-loop edits remain. No normal Electron was running at
clock-in; isolated probe disposed its contexts/tracks/peers and exited.

## Clock-out — 2026-09-09 14:02 Asia/Taipei

Safe to restart Codex. Persistent repaired plugin launch configuration verified;
both repair repositories are clean at `66bdaee` / `f4bc398`. Use a new thread
after restart to attach the repaired MCP process. No paid review or task command
is left running by this task; the original review job is confirmed done.

Fresh runtime check: **no Electron process found** (both canonical executable
query and all-Electron process query). Earlier running PIDs below are historical,
not current. This task did not stop/restart the app; preserve current state.

Magic Mirror HEAD is `4cd917f`. Motion-loop changes and voice research/design/
repair handoff documents remain saved locally but **uncommitted/unpushed**.
Unrelated operator `.codex/config.toml`, `CLAUDE.md`, survey and `sample/` changes
remain untouched. No voice engine installation/integration or sound QA yet.

Resume: read this section, the focused voice design and linked repair/review
evidence below. First check repaired Claude readiness. Ask for/obtain the pending
replacement Fable review authorization (one run, $2 best-effort budget), or an
explicit waiver; the first response was unusable, not a review pass. Then prove
single-sink audio routing and implement the approved one-library Voice Studio
scope with default/Raven acceptance. Do not repeat research or the completed
repair, silently launch another paid review, or infer Mac readiness.

## Persistent Claude-in-Codex Windows repair — 2026-09-09

Authorized repair installed from retained local source, with local commits
`66bdaee` (plugin) and `f4bc398` (core). WNOHANG/unsafe PID probing and missing
Windows restart locks corrected. **23 focused tests pass**; two fresh MCP
launches recover status/result/cancel, exit 0. Broader upstream Unix-fixture
selection has 10 failures/7 passes, recorded without claiming a full suite pass.
[Installation, persistence, checks and rollback](../../docs/testing/claude-in-codex-windows-repair-2026-09-09.md).
Original Fable job recovered: cost $0.265971, but response is attempted tool text,
not review; verdict unknown. Replacement paid review approval requested; none
launched. New Codex threads pick up installed MCP; existing threads may retain
old code. No Magic Mirror runtime changes/restart in this repair.

## Integrated avatar voice effects design — 2026-09-09

Operator accepted and narrowed the proposal to one integrated open-source
library, default/Raven supernatural presets and per-avatar tuning controls.
[Focused design](../../docs/superpowers/specs/2026-09-09-avatar-voice-effects-design.md):
Signalsmith Stretch plus native Web Audio, no neural backend; provider speed
and model delivery style remain distinct from local DSP. Includes Console Voice
Studio, single audio owner, interruption/reset and measured acceptance gates.
Self-review completed. Exactly one Fable consult launched; original Windows
retrieval failure is repaired above. Recovered verdict unknown, no critique.
[Review evidence and recovery handle](../../docs/testing/avatar-voice-effects-design-review-2026-09-09.md).
No runtime/dependency changes or avatar sound QA yet. Next: obtain the requested
usable review after replacement approval, then prove single-sink audio routing before wiring
the settings/UI. Existing preview-loop app state below was not restarted.

## Prior voice changer research — 2026-09-09

[Research and proposed implementation plan](../../docs/superpowers/plans/2026-09-09-avatar-voice-changer-research.md)
compares Apple Silicon voice conversion and DSP options, records source revision
anchors/license caveats, and maps Voice Studio controls, storage, audio ownership,
interruption/truncation and Mac acceptance gates. Recommendation: embedded DSP
first, with an optional neural branch now superseded by the focused design above.
Actual M4 configuration and M6 performance still need hardware evidence. The
research itself made no runtime/code/config/dependency changes, restart,
installation, commit/push or Mac benchmark, and did not promote a phase.
The preview-loop delivery/runtime below remains the last observed app state.

