# Magic Mirror — Progress

**Current dashboard — 2026-08-27 — Phase 1 physical exit pending; Phase 2 Wake
Lifecycle Windows engineering candidate built.**
Branch `phase1-realtime-voice` has accepted product commit `b246521` for
P1-U9. Phase 0 is accepted and tagged
`phase0-v0.3.1` at `9237dc7`. The accepted Phase 1 plan is
`82aa39c`; P1-U1 through P1-U7 are accepted, with U7 tip `426f52c`.
P1-U8-A is accepted/pushed at `fd78a28`; the phase-evidence skill correction
was accepted at `d8ca7de`; deterministic P1-U8-B engineering is
accepted/pushed at `d1d5364`. P1-U9 credential-source closure is accepted. A
corrected real provider smoke now passes with the configured `gpt-realtime-2.1`;
physical mic/output and target-Mac evidence have not occurred. Phase 1 exit/tag
is **not accepted**. Official phase
order for human evidence, exit decisions, release tags, and phase-status
promotion remains sequential. The user authorized Phase 2 runtime engineering
to start from a frozen Phase 1 candidate while away. The Windows engineering
candidate now implements the replaceable wake package, isolated worker,
exclusive mic handoff, idle/sleep lifecycle, Console evidence, and target-Mac
corpus evaluator. Its package remains intentionally `unselected` until the
Windows candidate comparison is run. The Mac mini M4 port and target-specific
revalidation are deferred until PC development is complete. Neither phase is
accepted or tagged, and Phases 3–7 have not started. The four earlier
prep-only lanes below do not start or promote another phase.
Canonical invariants 1–12 remain authoritative; control-plane rules and current authority are in
[`AGENTS.md`](AGENTS.md), and durable rulings are in [`DECISIONS.md`](DECISIONS.md).
The automated live harness launches the actual `npm run dev` /
`electron-vite dev` path in an isolated temporary user-data environment, drives
start-to-Active and stop-to-Dormant when the provider permits it, emits one fixed
metadata-only marker, and supervises full process-tree cleanup. The 2026-08-26
failures were caused by the live flag not selecting isolated `userData`, which
allowed a local mock model ID to leak into the run. The 2026-08-27 correction
passes the real provider path; Phase 1 exit/tag remains not accepted and untagged.

## Clock-out handoff — 2026-08-23

- Resume at `phase1-realtime-voice`, accepted product commit `b246521`. P1-D3/
  P1-D4/P1-D6 are deterministic `mock_passed` only; P1-D1/P1-D2/P1-D5 remain
  `real-demo not_executed`. Phase 1 exit/tag is not accepted. Phase 2 has not
  started and must not advance until the Phase 1 real gate passes.
- The real-gate intervention checklist is not a completion claim. The ignored
  root `.env` `OPENAI_API_KEY` is loaded only by Electron Main at runtime;
  Console provisioning, `safeStorage`, Keychain, DPAPI, and alternate
  credential fallback are not runtime paths. Agents/workers do not inspect or
  output `.env` values and no value is recorded. The ordered human
  interventions and their pending/not-executed reasons are recorded below.
- Next-session order: finish the P1 real demos; complete Phase 1
  regression/exit/tag; perform the exact-path Phase 2 survey; implement bounded
  TDD units for keyword artifact, wake worker, exclusive mic handoff,
  lifecycle, idle-sleep, and Console corpus; then run P2 real demos/tuning,
  platform evidence, regression, and tag.
- Applicable invariant boundary: `1, 8, 9, 10, 11, 12`. No transcript, audio,
  private context, credential, or other user content is recorded in this
  handoff.

## Pre-Phase-1 prep authorization — 2026-08-24

The user explicitly authorized prep-only parallel work for Phases 2, 3, 4,
and 7 before Phase 1 exits. This does not change the official order or allow
phase advancement: runtime integration, demos, exit decisions, regression,
release tags, and phase-status promotion remain sequential, and direct
predecessor gates remain mandatory before integration or exit.

| Prep lane | Authorization/status | Boundary |
|---|---|---|
| Phase 2 — Wake Lifecycle | `prep-only accepted` | Official `phase_state: not-started`; isolated synthetic/metadata-only artifact with an exact named read/write scope. |
| Phase 3 — Avatar/Audio | `prep-only accepted` | Official `phase_state: not-started`; isolated synthetic/metadata-only artifact with an exact named read/write scope. |
| Phase 4 — Scenes | `prep-only accepted` | Official `phase_state: not-started`; isolated synthetic/metadata-only artifact with an exact named read/write scope. |
| Phase 7 — Field Hardening | `prep-only accepted` | Official `phase_state: not-started`; isolated synthetic/metadata-only artifact with an exact named read/write scope. |

Prep-only units may not perform runtime wiring, IPC/schema/dependency/config
changes, credential access, network/device access, user-content processing,
phase promotion, real/mock demo claims, exit claims, regression claims, or
release tags. No implementation plan artifact or Phase 1 evidence change is
allowed. Phases 5 and 6 remain unauthorized with `phase_state: not-started`. The four accepted
prep-only units are ledgered below; they do not promote a phase or alter Phase 1
evidence.

### Accepted prep-only unit ledger — 2026-08-24

These four units are accepted preparation only. They do not start or promote
their official phase, and they do not provide runtime integration, demo, exit,
regression, release-tag, or field evidence.

| Unit | Accepted prep-only result | Independent validation | Explicit non-evidence | Exact artifact paths |
| --- | --- | --- | --- | --- |
| `P2-PREP-W1` | Offline keyword artifact and opaque synthetic corpus | `26/26` focused tests; node typecheck exit `0` | No detector, microphone, or wake-to-Realtime handoff evidence | `src/main/wake/keyword-artifact.ts`; `src/main/wake/fixtures/synthetic-keyword-corpus.ts`; `tests/main/wake/keyword-artifact.test.ts` |
| `P3-PREP-A1` | Pure RMS/envelope math | `20/20` focused tests; web typecheck exit `0` | No real audio, Web Audio, Cubism, or asset evidence | `src/renderer/avatar/audio/lipSyncMath.ts`; `tests/renderer/avatar/audio/lipSyncMath.test.ts` |
| `P4-PREP-S1` | Pure normalized exact spell trigger and one-turn guard | `19/19` focused tests; node typecheck exit `0` | No transcript pipeline, preset, adapter, or hardware evidence | `src/main/scenes/spell-trigger.ts`; `tests/main/scenes/spell-trigger.test.ts` |
| `P7-PREP-E1` | Empty evidence template | Seven no-claim header sentinels; `19` pending rows; forbidden generic status scan returned expected no-match | No field evidence | `docs/Magic_Mirror_Phase7_Field_Hardening_Evidence_Template.md` |

Initial H6 dispatch timeouts are resolved process history only; they are not
human-intervention blockers.

## Phase 1 — accepted unit ledger

| Unit | Accepted record | Material boundary/evidence retained |
|---|---|---|
| P1-U1 | `4862383` | SDK lockstep and versioned voice/session snapshots |
| P1-U2 | `5be5871` | Historical Main credential broker; prior `safeStorage` provisioning wording is superseded by P1-U9 |
| P1-U3 | `18461e5` | Deterministic `RealtimeSession`/WebRTC adapter and official scripted transport |
| P1-U4 | `cffd484` | One microphone owner, one audible output, playback completion |
| P1-U5 | `fb5e58f` | Lifecycle outage, OfflineLoop, recovery, manual wake, rollover |
| P1-U6 | accepted; no self-referential hash recorded | RAM-only transcript/interruption mapping and cleanup; focused `32/32`, Node/web typechecks `0` |
| P1-U7 | accepted at `426f52c`; record set `4b2b6fa`, `4636b17`, `f4e5103`, `105db2f`, `b81d400`, `5e8b66d`, `c427670`, `b4abd76`, `426f52c` | Console voice controls, persona/model controls, RAM transcript view, runtime ownership and recovery; prior Console credential provisioning is superseded by P1-U9 |
| P1-U8-A | accepted/pushed at `fd78a28`; phase-evidence correction `d8ca7de` | Deterministic demo/record/privacy/regression checkpoint; no real-demo promotion |
| P1-U8-B | deterministic engineering accepted/pushed at `d1d5364` | Fresh gate: `49/49` test files, `570/570` tests, Node/web typechecks, Electron Vite build, and `git diff --check` all exit `0` |
| P1-U9 | accepted product commit `b246521` | Main-only ignored-root `.env` credential source; focused `5/5`, `npm run typecheck:node` exit `0`; no real API/provider/target-Mac run occurred |

### P1-U7 accepted subunits and gates

| Scope | Record/status | Retained validation or limitation |
|---|---|---|
| U7A | accepted | `31/31` focused tests in four files; Node/web typechecks and diff check `0` (line-ending warnings); no full suite/build/demo |
| U7B1/B2 | accepted | Payload-free Main-to-Mirror interrupt transport; `45/45` focused tests in five files; Node/web typechecks and diff check `0` (line-ending warnings); no UI/consumer/completion claim, full suite/build/demo |
| U7C1 | committed/pushed at `cc8c34f` | Atomic issuer/600-second expiry; three files/`9` tests and Node typecheck green; Windows-only platform limitation |
| U7C2 | accepted on the uncommitted integration diff; no future hash recorded | Renderer-safe atomic DTO; six files/`45` tests, Node/web typechecks and diff check `0`; negative scan exit `1` with empty output as expected; no full suite/build/demo/target-Mac/provider field verification |
| U7C3 | accepted at `24bccfd` | `47/47` files and `478/478` tests; Node/web/build `0`; stale interrupt expectation corrected; Electron `43.4.1` launch issue cleared without intervention |
| U7F1/U7F2A | accepted; F1 `105db2f`, F2A `b81d400` | Frozen command DTO and Main-owned manual transactions; focused candidate `90/90`; final `48/48` files and `515/515` tests; Node/web/build `0`; stale fixtures corrected without a production defect |
| U7F2B1 | accepted/pushed at `5e8b66d` | `48/48` files and `518/518` tests; Node/web/build green; Main-owned rollover and exact 60-minute timer |
| U7F2B2a | accepted/pushed at `c427670` | `48/48` files and `522/522` tests; Node/web/build green; bounded failure-report transport |
| U7F2B2b | accepted/pushed at `b4abd76` | Focused four files/`52` tests and full `48/48` files/`525/525` tests; Node/web/build green; exact `5/15/30/60` probe schedule, no automatic full reconnect |
| U7F3 | accepted/pushed at `426f52c` | Focused seven files/`141` tests; final `48/48` files/`545/545` tests; Node/web/build and diff check green; actual-output playback and metadata-only outcomes |
| U7D/U7E1/U7E2 | accepted in the U7 record | No separate hash beyond the accepted U7 record set above |

U6 remains bounded to current-session RAM projection: stale/invalid input,
interrupts, and cleanup degrade with metadata-only outcomes; transcription does
not gate Voice/new turns; stop/offline/rollover/restart/close clear RAM. U7F3
analyser values are PoC only: fallback delay `500ms`, sample interval `50ms`,
bound `2000ms`, silence threshold `0.02`, and `3` samples. Real mic/output
tuning remains required. U6 directly checked invariant IDs `1, 4, 5, 6, 9,
10, 11, 12`; canonical invariants `1–12` remain preserved.

## Current verification and evidence

| Evidence | Status and truth boundary |
|---|---|
| Fresh U8-B deterministic gate | `49/49` files, `570/570` tests, `npm run typecheck:node`, `npm run typecheck:web`, `npm run build`, and `git diff --check`: all exit `0` |
| P1-U9 credential-source closure | Accepted product commit `b246521`; focused `5/5`, `npm run typecheck:node` exit `0`; no real API/provider/target-Mac run occurred |
| Automated Phase 1 live harness | Actual `npm run dev` / `electron-vite dev` path in an isolated temporary user-data environment; start-to-Active and stop-to-Dormant when provider permits; one fixed metadata-only marker; full process-tree cleanup supervision |
| Corrected real provider smoke — 2026-08-27 | Fresh verification: `PHASE1_LIVE_RESULT status=passed stage=dormant reason=completed exit=0 duration_ms=5381 model_availability=available cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`; this proves provider connection and cleanup, not the remaining physical human demos |
| Earlier Phase 1 live gate — 2026-08-26 | `PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=2257 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0` |
| Official Realtime model verification — 2026-08-26 | Official OpenAI model pages document `gpt-realtime-2.1` and `gpt-realtime-2.1-mini`; the official Realtime session-create schema lists both exact IDs. Both spellings are verified; spelling is ruled out. |
| Fresh full-model live gate — 2026-08-26 | Exact marker is recorded in the automated live-gate evidence below. One-model-at-a-time connect used `gpt-realtime-2.1`; the failed actual connect is authoritative. |
| Fresh mini-model live gate — 2026-08-26 | Exact marker is recorded in the automated live-gate evidence below. One-model-at-a-time connect used `gpt-realtime-2.1-mini`; this was a bounded verification attempt, not a baseline/config change. |
| Current product configuration | Realtime model `gpt-realtime-2.1`; input transcription `gpt-live-transcribe`; voice `marin`; no runtime fallback |
| Deterministic SQLite artifact | Outside the repo at `C:\tmp\magic-mirror-p1-u8b-deterministic.sqlite`; P1-D3/D4/D6 `mock_passed`; P1-D1/D2/D5 `real-demo not_executed`. It is not a real demo and is not a tracked repo file. |
| Phase 1 exit | Not accepted; no Phase 1 release tag. The passing automated provider smoke is not physical demo evidence; target-Mac microphone/TCC, natural conversation, audible output, and spoken barge-in are not claimed. |
| Phase 2 Windows engineering candidate | Commits `52cb13b` through `7c55436` plus final package-validation/harness closure; default phrase `魔鏡阿魔鏡`; real target package remains `unselected`. Full candidate verification is recorded below. |
| Phase 2 Windows wake candidate selection | `not_executed`; no Windows Porcupine `.ppn` or sherpa package has been selected. Compare false rejects, false accepts, latency, CPU, and stability on this PC before publishing the Windows development candidate; repeat/revalidate on the M4 during the later port. |
| Phase 0 demos | P0-D1 through P0-D5 passed, including both P0-D2 cloud/core failures. |

### Phase 0 accepted ledger — 2026-08-20

| Task order | Accepted record | Material validation retained |
|---|---|---|
| 1 — scaffold, two windows, never-black-screen boot | done/reviewed; in `phase0-v0.3.1` | Historical typecheck; four files/`20` tests |
| 2 — lifecycle state machine | integrated at `a7d74b14771de4f527762c30171ad2e68fc3d985` | `31` focused; five files/`51` tests; Node typecheck `0` |
| 3 — ConfigService + credentials | `0270686`; correction/integration tip `835c92d` | Seven files/`92` tests; Node/web typecheck and Electron Vite build `0` |
| 4 — metadata-only, non-blocking telemetry | integrated at `dca1327` | Focused `21/21`; eight files/`113` tests; typecheck/build `0` |
| 5 — SQLite + migrations | integrated at `a8f0355` | Focused `32/32`; full `145/145`; typecheck/build `0` |
| 6 — Main module registry + mocks | accepted/integrated at `5b95a94`; plan gate `83be86b` | Focused `16/16`; full `161/161`; typecheck/build green |
| 7 — model settings resolver + snapshots | plan `6214b6c`; implementation `5e24bdc` | Focused `7/7`; full `168/168`; typecheck/build and both negative scans green |
| 8 — boot wiring, IPC, Mirror UI + OfflineLoop | accepted | Accepted application task |
| 9 — Console UI — six pages | accepted | Accepted application task |
| 10 — demo runner, exit criteria, tag | done/accepted | 10B `13/13`; 10C `8/8`; full `311` |

Phase 0 also retained: ten bounded smoke cycles; the exact real-time 30-minute
OfflineLoop soak with samples at `0`, `300000`, `600000`, `900000`, `1200000`,
`1500000`, and `1800000` ms; every sample nonblack/playing; memory growth below
`134217728` bytes. Privacy, negative runtime-model/fallback, Windows unpacked
packaging, fixed-asset hash/length/decode, no-relaunch, exact-whitespace, and
status-scope gates passed. Electron `43.4.1` and electron-builder `26.15.3`
remain the accepted baseline. The sole restart owner is the user LaunchAgent
`KeepAlive={SuccessfulExit=false}`; in-app recovery recreates one failed
renderer then exits `1`; `app.relaunch()` is never used. Windows evidence covers
the historical DPAPI-backed `safeStorage` path and local packaging only; that
credential ruling is superseded for this personal build by the ignored-root
`.env` Main-only path. It does not field-verify target-Mac TCC, signing,
entitlements, packaged workers, LaunchAgent, real-device, or provider/account
behavior. Configured model IDs remain versioned-config-only;
failure never silently substitutes another ID.

## Phase 2 Windows engineering candidate — 2026-08-27

- The frozen Phase 1 candidate is `d239c01`. Phase 2 adds immutable,
  replaceable `zh-CN` wake packages for trained Porcupine or compiled/trained
  sherpa artifacts, exact hashes/provenance/tuning, and one explicitly selected
  engine with no runtime fallback.
- The isolated worker owns one `decibri` 16 kHz mono capture path only in
  Dormant/OfflineLoop. Wake/manual start release it before Realtime starts;
  stop, idle, exact completed-transcript `睡吧`, and cloud failure close the
  renderer tracks before wake reacquires. Local handoff failure enters
  Maintenance.
- Console reuses existing Overview, simulator, Events, and Phase Tests. When a
  wake reference changes, Draft Test and Publish validate its manifest,
  phrase, platform, artifacts, and hashes; an invalid package cannot replace
  Active and an unchanged unavailable package cannot gate unrelated settings.
  Applying a newly Published wake package requires the next application start;
  no second hot-reload controller was added.
- Final Windows gate: `59/59` test files and `661/661` tests; `npm run
  typecheck`, `npm run build`, Windows `npm run package`, and `git diff
  --check` exited `0`. Provider smoke passed before the final package-validator
  and harness-only closure:
  `PHASE1_LIVE_RESULT status=passed stage=dormant reason=completed exit=0 duration_ms=6035 model_availability=available provenance=passed cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`.
- M4/native quality, packaged macOS worker/TCC/signing, real microphone, and
  human evidence were not run and are not claimed. P2-D1..D5 remain
  `real-demo not_executed`; no Phase 2 tag exists.

## Pending work — exact order

1. From the exact frozen Phase 1 build, run P1-D1 (20 real turns), P1-D2 (10
   spoken interruptions), and P1-D5 (real Draft/Publish/new-session/invalid
   Draft). If they pass, record evidence and tag Phase 1.
2. On this Windows PC, import/train the platform-specific Mandarin Porcupine
   `魔鏡阿魔鏡` package and compile the matching sherpa package. Compare both at
   the same false-accept target on at least 100 approved positives plus hard
   negatives and two hours of approved background audio; Publish the measured
   Windows development candidate.
3. From the exact Phase 2 build, run P2-D1..D5: local wake to real Realtime,
   offline wake to OfflineLoop, 30-second developer idle plus 300-second
   configuration check, exact `睡吧` after playback, and the mic-owner timeline.
4. Satisfy the Windows Phase 2 evidence: at least 19/20 live wakes, the
   separate 30-minute ambient/TV false-wake run, and clean lifecycle/device
   release. Any resulting phase tag is a Windows development checkpoint only.
   Continue Phases 3–7 sequentially on this PC. After PC development, repeat
   wake selection and complete TCC/native packaging/signing/LaunchAgent/power
   evidence during the Mac mini M4 port before final deployment acceptance.

## Human-intervention ledger

| Boundary | Record | Status |
|---|---|---|
| P1-U7 engineering | No human intervention was needed for the accepted bounded/mock/static gates recorded for U7. | Complete |
| P1-U7 harness incidents | Worker/launcher timeouts, stale test expectations, and smoke timeout were recovered with preserved artifacts; they were harness/test events, not product failures. | Complete; no human intervention |
| P1-U8-A/U8-B deterministic engineering | No human intervention was needed. Recent worker timeouts during harness compaction were clean harness-service/process incidents, not product failures. | Complete; no human intervention |
| P1-C3 Electron launch | Earlier launch failure cleared without intervention; it did not reproduce in the focused rerun/full gate; no install/reinstall or human action was required. | Cleared |
| P1 automated live gate — 2026-08-26 (earlier attempt) | `PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=2257 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0` | Historical metadata-only observation; no model-spelling conclusion is drawn. |
| P1 exact-model live attempts — 2026-08-26 | Fresh full and mini exact markers are recorded above. | Superseded diagnosis: these runs loaded a local mock model from non-isolated user data; the 2026-08-27 corrected run proves provider/project access. |
| Phase 1 exit | The autonomous exit audit at pushed tip `f5a2d59` is recorded below; the personal-build credential remains ignored-root `.env` Main-only, with no safeStorage/Keychain/DPAPI path, and records remain metadata-only. | Pending/not accepted; P1-D1/D2/D5 `real-demo not_executed` |
| Phase 2 engineering | Windows implementation and deterministic verification required no operator input. | Engineering candidate only; P2-D1..D5 `real-demo not_executed` |
| Wake quality selection | Train/import both Windows `魔鏡阿魔鏡` candidates, collect/approve the local corpus, run the equal-false-accept PC comparison, and Publish the development winner. | Pending; current package is `unselected`; M4 revalidation deferred to port |
| Target Mac | Port only after PC development; then repeat wake selection and verify TCC, signing/entitlements, packaged workers, LaunchAgent, power, device, and provider behavior. | Deferred; not a current PC-development gate |
| Venue/product inputs | Wake corpus/keyword, avatar assets, scene spells/presets, camera/identity, memory/profile, and hardware/adapter inputs remain later. | Pending |

### Autonomous Phase 1 exit audit — 2026-08-23 — pushed tip `f5a2d59`

This autonomous audit was documentation-only: it made no tests, builds, demos,
provider/network calls, or application validation, and it did not read `.env` or
any credential value. It made no phase-status promotion. P1-D1/P1-D2/P1-D5
remain `real-demo not_executed`, and Phase 1 exit/tag remains not accepted.

The following ordered human interventions remain required:

| # | Intervention | Status / reason |
|---|---|---|
| 1 | Run Main/Console provider/account/network readiness preflight without recording the key. | `complete` — the configured model was retrieved, a Realtime client secret was minted, and the corrected automated provider smoke passed without recording key values. |
| 2 | Confirm physical microphone/output acquisition, audible output, analyser signal, and no device-busy condition. | `pending/not_executed` — physical device confirmation was not run. |
| 3 | Choose temporary Persona and built-in Voice using metadata identifiers only. | `pending/not_executed` — operator choice was not made and no session/demo was run. |
| 4 | Perform P1-D1: 20 real spoken turns. | `real-demo not_executed` — no real application/demo run was made. |
| 5 | Perform P1-D2: 10 real interruptions with observed output stop and continued answers. | `real-demo not_executed` — no real application/demo run was made. |
| 6 | Perform P1-D5: real Draft/Publish/new-session/invalid-Draft sequence with metadata-only evidence. | `real-demo not_executed` — no application run was made and no evidence was recorded. |
| 7 | After items 1–6 pass, run Phase 1 regression/exit review and create the release tag. | `pending/not_executed` — blocked until the real gate passes; no regression/exit review or release tag was run/created. |

### Earlier automated Phase 1 live-gate evidence — 2026-08-26

The new automated live harness launches the actual `npm run dev` /
`electron-vite dev` path in an isolated temporary user-data environment. It
drives start-to-Active and stop-to-Dormant when the provider permits it, emits
one fixed metadata-only marker, and supervises full process-tree cleanup. The
current product configuration is realtime model `gpt-realtime-2.1`, input
transcription `gpt-live-transcribe`, and voice `marin`, with no runtime fallback.

The earlier real gate result is retained exactly:

`PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=2257 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`

This earlier marker is metadata-only historical evidence. Its
`model_availability=unavailable` value is observational and does not establish
that either model spelling is invalid. It does not prove a product success,
Phase 1 exit, target-Mac microphone/TCC, natural conversation, audible output,
or spoken barge-in. Phase 1 remains unaccepted and untagged. Code must not
silently substitute another model.

### Official model verification and fresh exact-model live attempts — 2026-08-26

Verified official OpenAI sources:

- `https://developers.openai.com/api/docs/models/gpt-realtime-2.1` documents
  `gpt-realtime-2.1`.
- `https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini`
  documents `gpt-realtime-2.1-mini`.

The official Realtime session-create schema lists both exact IDs. Both model
spellings are officially valid, so spelling is ruled out. The final versioned
baseline remains solely realtime model `gpt-realtime-2.1`, input transcription
`gpt-live-transcribe`, and voice `marin`, with no runtime fallback. The mini
model was a bounded one-model-at-a-time verification attempt and did not change
the versioned baseline.

Fresh full-model attempt, with only `gpt-realtime-2.1` configured:

`PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=4259 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`

Fresh mini-model attempt, with only `gpt-realtime-2.1-mini` configured:

`PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=1686 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`

Both exact one-model-at-a-time live connects were rejected and absent from the
API project's bounded catalog view. An API key marked unrestricted controls key
endpoint permissions but is not evidence that the project catalog exposes a
model. `model_availability` is observational; the failed actual connect is
authoritative. The evidence does not establish a more specific entitlement
cause.

That provider/project-access conclusion is superseded by the corrected
2026-08-27 run below. P1-D1/P1-D2/P1-D5 remain `real-demo not_executed` because
target-Mac microphone/TCC, physical device behavior, natural conversation,
audible output, spoken barge-in, and the remaining human checks are still
pending. Phase 1 remains unaccepted and untagged. Applicable invariant IDs:
`1, 8, 9, 10, 11, 12`.

### Corrected automated provider smoke — 2026-08-27

The Phase 1 live flag previously did not select the harness's isolated Electron
`userData` directory. A normal-user `active.json` therefore supplied
`mock-realtime-dialogue-v1`, and the provider rejected that test-only ID. The
Main bootstrap now isolates `userData` for both smoke flags. With the configured
`gpt-realtime-2.1`, the actual application path produced:

`PHASE1_LIVE_RESULT status=passed stage=dormant reason=completed exit=0 duration_ms=5381 model_availability=available cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`

This closes the credential/project/model-access question. It does not replace
the physical mic/output and operator evidence required by P1-D1/P1-D2/P1-D5.

### Phase 0/1 home-PoC simplification audit — 2026-08-27

- Retired the external H6 worker protocol/launcher and removed mandatory
  worker/tester/review gates from all seven repository skills. Direct execution
  plus proportional verification is the default.
- Removed the superseded `safeStorage` credential store and its tests; the
  ignored root `.env` Main-only source remains the sole runtime path.
- Removed the unused injected outage-recovery controller and its duplicate test
  stack. The production Main probe schedule remains the sole recovery path.
- Reduced the renderer runtime owner to one ownership/cleanup model and replaced
  provider-prose/model-name parsing with bounded generic transport/status
  categories. Runtime model IDs remain config-only with no silent substitution.
- Review against the Phase 0/1 PRD and implementation-plan boundaries found no
  remaining duplicate Realtime state machine, alternate credential path,
  mandatory process gate, or runtime model catalog. Larger Foundation modules
  remain because they implement accepted Console/config/SQLite composition;
  file size alone is not a reason to risk a broad refactor in this PoC.
- Verification: both TypeScript targets and production build exited `0`; all
  `51` test files / `611` tests passed; seven skills and all control-plane TOML,
  PowerShell, and checksum files validated; the fresh real-provider smoke above
  passed with cleanup and zero orphan processes.

### Future prep-only human interventions — lower priority than Phase 1

The seven ordered Phase 1 interventions above remain the higher-priority work.
After that gate, the remaining plain-language needs are:

- Phase 2: the approved phrase is `魔鏡阿魔鏡`; provide or approve the real
  corpus and Windows microphone time for the PC model selection and demos.
- Phase 3: provide the final Live2D/Cubism assets, then observe actual-output-
  audio behavior.
- Phase 4: approve the final spells and presets, then connect and observe the
  adapters and hardware.
- After PC development: provide target-Mac, operator, and device time for the
  port, wake revalidation, 100-cycle/soak, boot, power, signing, and TCC checks.

Phase 2 engineering started under the dated overlap ruling and now has a
Windows candidate. That does not promote or accept Phase 2. Human evidence,
exit/tag, and promotion remain sequential after the Phase 1 physical gate.

## Harness, environment, warnings, and privacy register

- H6/H9 launcher facts are retained as history only. The external worker
  launcher and prompt-envelope protocol are retired; current work executes
  directly under `AGENTS.md`, with optional built-in roles only when delegation
  materially helps. Repository skills contain domain facts, not mandatory
  orchestration gates.
- This is an npm-only project. Development Node is `v24.19.0` (prerequisite
  `>=22.22.2` or `>=24.15.0`); `398` packages were installed, `399` audited,
  zero vulnerabilities recorded. The unrelated Node `DEP0190` child-process
  shell warning and nonblocking LF-to-CRLF warnings remain. Windows firewall
  evidence is development-only; script-fix commit `3e93936` supplied the
  persistent Private-profile rule names `MagicMirror.Development.Electron.TCP`
  and `MagicMirror.Development.Electron.UDP`. One elevated canonical setup is
  complete. The 2026-08-27 read-only verification found both enabled Private
  inbound Allow rules in `PersistentStore`, with TCP/UDP respectively and the
  exact program `C:\Project\magic-mirror\node_modules\electron\dist\electron.exe`.
  Later canonical Electron runs proceed without another prompt; recheck only
  after that path/install changes or rule lookup fails. Per-worktree Electron
  execution/rules remain forbidden because program scope is an exact path.
- `.env` exists and is ignored/untracked. For this personal build it is the sole
  runtime master-key source, loaded only by Electron Main; missing, empty, and
  read failures remain metadata-only reasons. Agents/workers do not inspect or
  output its value, and this record does not record it. Console provisioning,
  `safeStorage`, Keychain, DPAPI, and alternate credential fallback are not
  runtime paths.
- User-owned `scripts/install-node-lts.ps1` and
  `docs/Magic_Mirror_Phase0_Adversarial_Review_2026-08-19.md` remain unchanged;
  the explicit 2026-08-22 instruction authorizes tracking both in the
  integration commit.
- Diagnostics and evidence remain metadata-only: IDs, enums, counts, timings,
  statuses, reasons, hashes, paths, and exit codes only. Transcripts, audio,
  private context, extracted memory values, credentials, images, embeddings,
  and prompts remain out of files, telemetry, exports, and logs. The current
  record does not promote mock evidence, invent a status, or claim target-Mac,
  provider, device, or operator completion.

Historical pre-acceptance wording that said Phase 0 was in progress, Phase 1
was blocked, or Tasks 8–10 were next is superseded and retained here only as a
status note; harness-migration task labels remain process records distinct from
application Tasks 1–10.
