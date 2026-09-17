# Magic Mirror — structured Realtime tools, 2026-09-17

## Resume here

The current Realtime sleep skill is migrated to a versioned structured tool
catalog: schemas, use/avoid/speech rules, availability and JSON results share
one source for runtime and Console. Explicit handlers validate arguments before
effects; spells retain application exact-match routes. AGENTS and compact
Realtime, roleplay and QA guidance are updated.
[Architecture and evidence](docs/testing/realtime-tool-architecture-2026-09-17.md):
159 focused tests, web typecheck/build and real SDK serialization tests pass.
Normal Raven Tools & input was visually verified; app is running with v20 and
the saved draft preserved. Isolated lifecycle QA failed at Electron capture
before provider work, including its one retry; it is not a live pass.

The earlier [prompt audit](docs/testing/realtime-prompt-audit-2026-09-17.md)
introduced five native inspector windows and response-scoped greeting/scene
cues. **Sleep silence remains unresolved:** prior Raven pre-tool speech and
residual-output failures are retained. Next: operator testing of the structured
tools, then investigate pre-tool output and the QA capture failure separately.

Raven V11 from remote PR #1 is installed in the normal shared rig library as
**Raven · v11**, with its matching renderer and motion ownership changes.
The repository Live2D and installed avatar-studio skills are updated. V10 and
the prior published state were preserved at installation; V11 was not
automatically assigned/published. The operator has since published v20. [Installation evidence](docs/testing/raven-v11-install-2026-09-17.md):
69 focused tests, web typecheck/build, bundle validation and 227 isolated
Windows Console checks passed. Normal native import and visible Console
display were observed; all 17 managed files match V11. Artistic and live
output-audio acceptance remain separate.

Raven's extra invitation on sleep is addressed with a compact silent-tool prompt,
SDK background completion, and an application-owned exact farewell response.
Sleep intent clears local processed audio; only the farewell response reopens
output, and sleep waits for its playback/tail. No linguistic regex filters.
[Raven farewell evidence](docs/testing/raven-farewell-2026-09-16.md): 112 focused
tests, web typecheck/build and final real-provider host/Raven lifecycle and
speaker-output checks passed. Failed attempts remain linked. Physical operator
retest and broader spoken reliability remain open.

Wake greetings and application scene speech now explicitly forbid tool calls
for that response, preventing a greeting from invoking the sleep/farewell tool.
Visitor sleep commands retain their tool. Replacement-worker timer/send failures
now enter failed recovery instead of remaining on Restarting.
[Diagnosis and current checks](docs/testing/wake-greeting-sleep-2026-09-16.md):
189 focused tests, web typecheck/build and four real-provider Windows lifecycle
checks passed. The operator's physical stop-calibration/wake retest remains open;
the original model/tool decision cannot be reconstructed from metadata alone.

Repeated Start failure is fixed: an exhausted wake worker previously stayed
absent while Start kept sending it configuration. Start now safely creates a
fresh worker; automatic recovery remains bounded. Console preserves failure
and recovery state across cleanup, shows restart attempts, and explicitly
prompts saving edits and restarting Magic Mirror when recovery fails.
[Recovery RCA, research and checks](docs/testing/wake-recovery-retry-2026-09-16.md):
125 focused tests, web typecheck/build, real worker-exit recovery, explicit
terminal failure and production Start/Stop retry passed. The original native
device/driver failure at 17:21 is identified by code, not its physical cause.

The live calibration meter now displays the real native acoustic score and
matched/total sound tokens. Direct Console observation of the operator's three
spoken attempts at threshold 0.18 recorded **2 detections**, with full 9/9-token
scores **0.517361** and **0.473206**. Partial matches also appeared; threshold
alone does not resolve incomplete matches. Published settings were preserved.
[Native score delivery and evidence](docs/testing/wake-native-score-2026-09-16.md):
141 focused tests, 21 final follow-up tests, five native cases, web typecheck,
build and 33 Windows UI checks passed. The adapter also consumes results at
every decoder step, fixing lost detections in coalesced input. Human wake
reliability remains open; the original zero-detection interval is not fully
explained. Release packaging did not complete and remains unverified.
Next: use score plus token progress to investigate the remaining spoken miss.

Live wake calibration is available at Avatars → Persona → Wake sensitivity
tuning → Start live test. It shows separate microphone and native score
meters, repeated detection counts and applied threshold/score/trailing blanks.
Use in draft → Save → Publish keeps tested values across restart; temporary
tests restore published settings when stopped or interrupted. No operator
sensitivity setting changed. [Delivery and RCA](docs/testing/wake-calibration-2026-09-16.md):
139 focused tests, web typecheck/build and 33 Windows UI checks passed.
The reported rain misses were one non-exact transcript and one cancelled
announcement; cancellation diagnostics now distinguish visitor speech from
output interruption. Physical wake/spell accuracy is not yet established.
The repeated `魔鏡阿魔鏡` trial is recorded above; rain verification remains open.

Wake input now verifies first-block delivery and recovers a stalled worker;
release/shutdown cancel recovery and old callbacks cannot affect a new capture.
Console reports recovery/failure and actual quiet levels. No device, phrase or
sensitivity setting changed. [Delivery evidence](docs/testing/wake-capture-recovery-2026-09-16.md):
169 focused tests, 19 overlapping follow-up checks, web typecheck/build passed;
six real Electron microphone/ownership checks passed on each of two fresh launches.
[RCA](docs/testing/wake-rca-2026-09-16.md) retains the original stalled-stream evidence.
Physical wake accuracy and overnight/device-change behavior remain hardware
verification; the current calibration panel supports the next operator test.

Scene playback now pauses idle until playback finishes, then starts the full
configured interval. The hidden Developer Mode 30-second cap is removed.
Wake tuning controls show actual numeric package/override values. No operator
sensitivity setting changed. [Current evidence](docs/testing/scene-idle-wake-values-2026-09-15.md):
149 focused tests and 32 Windows UI checks passed.

Avatar CRUD fixes remain delivered; [prior evidence](docs/testing/avatar-crud-audit-2026-09-15.md)
records immediate deletion, keyboard renaming and consistent Mirror selection.

Console Stop/Abort and automatic Save/check are also complete;
[prior delivery evidence](docs/testing/console-stop-save-check-2026-09-15.md) records those checks.

## Runtime and workspace

- Canonical `C:/Project/magic-mirror`, branch `main`; accumulated delivery is
  recorded in Git history. Preserve local operator data and installed skills.
- Normal dev session **14915**, `http://localhost:5173/`, restarted from canonical
  checkout on **2026-09-17 Asia/Taipei**. Main, Mirror and Console are ready;
  Raven remains active on published **v20**. Its pending edit was saved and
  checked before restart, but not published. The Tools & input inspector is
  open with the saved Raven draft. V11 remains installed in the rig library.
  Isolated QA ended before launch; operator authorized restarts. Persistent
  Private TCP/UDP firewall rules matched the canonical executable. Physical
  sleep and stop-calibration/wake retests remain open.
- Operator config preserved, with Ren's short phrase `施放咒語，下雨`. Per-avatar
  wake/sleep and sensitivity controls are available; video fades default to 0.
- `out/` contains a development build. Rebuild stamped output before Electron
  QA; never overlap QA/full tests with normal Electron. Preserve any new
  unsaved Console edits before restart. See [UI QA](.agents/skills/mm-ui-qa/SKILL.md).

## Evidence and limits

- [Avatar management](docs/testing/avatar-management-2026-09-15.md): Mirror activation,
  historical first delivery. Its draft-only deletion workflow is superseded by
  the [CRUD audit](docs/testing/avatar-crud-audit-2026-09-15.md).

- [Console Stop/Abort and Save/check](docs/testing/console-stop-save-check-2026-09-15.md):
  Windows Console 38 checks, profiles/voice 25, developer audio 3, Cubism 181;
  final focused suite 166 tests, web typecheck/build passed. Live queued dialogue
  and physical sound remain operator verification; no phase promotion.

- [Latest persona/spell/fade RCA and checks](docs/testing/persona-spell-video-fades-2026-09-15.md):
  real-provider spell QA 3 checks; Console/portrait fade QA 10 checks, 6
  screenshots, 151 opacity/gain samples. Focused tests, web/scoped Node checks
  and build passed. These are historical results for the recorded build.
- [Wake tuning and short-command evidence](docs/testing/short-spells-wake-tuning-2026-09-15.md);
  [audio ownership/state table](docs/testing/audio-playback-audit-2026-09-15.md).
- Full Node typecheck has pre-existing TS7016 in the QA-artifacts test. Human
  speech accuracy, first-boot wake reproduction, physical speakers/echo and
  hardware/long-run acceptance remain open in TODO.
- Phases 0–3 accepted on Windows; Phase 4 active, unaccepted and untagged.
  Identity → Memory → Field Hardening and the later Mac port remain sequential.
- Current Raven assets: [storage](resources/avatar/Raven/README.md),
  [handoff](RAVEN-V10-EXPRESSION-FIX-HANDOFF.md). Large ignored source assets need
  separate backup; built-in Ren QA does not establish Raven acceptance.

## Instruction ownership

[AGENTS](AGENTS.md) owns execution/invariants; [DECISIONS](DECISIONS.md) owns
rulings; [TODO](TODO.md) contains open work only. The personal
`roleplay-control-prompts` skill and `C:/Users/b8901/.codex/AGENTS.md` retain the
no-coaching and code-controlled playback lesson. Completed task narratives have
been removed from this handoff; linked test reports retain necessary evidence.
