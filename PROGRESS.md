# Magic Mirror — Progress

**Current dashboard — 2026-08-28 — Phase 2 Wake Lifecycle is accepted as a
Windows development checkpoint; Phase 3 Avatar/Audio implementation is in
progress on the Windows development PC.**
Phase 0 is accepted and tagged `phase0-v0.3.1` at `9237dc7`. Phase 1 product
tip `4bd241f` is accepted from the real Windows microphone/speaker path and is
released as `phase1-v0.3.1`. Phase 2 is released as `phase2-v0.3.1`; it
implements the replaceable wake
package, isolated worker, exclusive mic handoff, idle/sleep lifecycle, Console
evidence, and current-host corpus evaluator. The runtime now selects the hashed
`sherpa-magic-mirror-win-v2` package; native load and real EPOS microphone
acquisition pass. The Mac mini M4 port and target-specific
revalidation remain deferred until PC development is complete. Phase 3 has an
implemented Windows candidate awaiting its real-audio exit observations;
Phases 4–7 have not started, and their earlier prep-only lanes remain non-phase
evidence.
Canonical invariants 1–12 remain authoritative; control-plane rules and current authority are in
[`AGENTS.md`](AGENTS.md), and durable rulings are in [`DECISIONS.md`](DECISIONS.md).
The automated live harness launches the actual `npm run dev` /
`electron-vite dev` path in an isolated temporary user-data environment, drives
start-to-Active and stop-to-Dormant when the provider permits it, emits one fixed
metadata-only marker, and supervises full process-tree cleanup. The 2026-08-26
failures were caused by the live flag not selecting isolated `userData`, which
allowed a local mock model ID to leak into the run. The 2026-08-27 correction
passes the real provider path.

## Phase 3 implementation candidate — 2026-08-28

- The Windows candidate vendors the accepted official Cubism 5 Web SDK R5
  Core/Framework and Haru development rig, renders with WebGL2 on the closest
  9:16 portrait display, and provides Dormant, Waking, Listening, Thinking,
  Speaking, Scene, and Suspending motions plus expressions, blink, breath,
  micro-head movement, physics, pose, and a visible static fallback.
- Lip sync uses an analyser on actual audible output, never transcript timing.
  The Realtime remote stream and recorded-output fixture share the same
  RMS/envelope path; interruption zeros the mouth and stops speaking motion and
  expression. Voice/music gains are independent; music ducks, restores, and
  fades before Dormant/OfflineLoop.
- Console now exposes state/motion/expression controls, recorded output, music,
  Interrupt, gain controls, FPS, waveform, mouth, underruns, and metadata-only
  failure reasons. Large avatar/audio assets are unpacked in the packaged app.
- Automated Windows evidence passed the P3-D1 state journey. The live portrait
  renderer reported ready at about 238 FPS; recorded output drove mouth to
  0.833; music followed `1.00 -> 0.22 -> 1.00 -> 0.00`; interrupt restored
  Dormant with mouth `0.000`; a 13.5-second loop reported zero false underruns.
  This is real local renderer/Web Audio evidence, not real Realtime audio or a
  Phase 3 exit claim.
- Phase 3 remains `in-progress`. Required remaining evidence is one real
  Realtime-output lipsync observation, a 10-minute Realtime+Avatar conversation
  without stuck mouth or material underrun, ten real interruptions, and the
  later target-Mac near-60-FPS check. MotionSync remains an optional later
  enhancement and is not an exit condition.

## Phase 1 closure — accepted 2026-08-27

- The operator confirmed that real conversation, audible output, and audio
  barge-in work without a quality problem, and explicitly accepted Phase 1.
  This is real-device evidence on the Windows development PC. No unreported
  turn or interruption count is inferred from that confirmation.
- The configured real-provider lifecycle smoke passed start → Active → stop →
  Dormant with provenance and cleanup passed and zero orphan processes. The
  product default is versioned config `gpt-realtime-2.1-mini`, voice `cedar`,
  input transcription `gpt-live-transcribe`, and `server-vad-noisy`; there is
  no mock or silent runtime model substitution.
- P1-D3, P1-D4, and P1-D6 retain their deterministic `mock_passed` evidence.
  P1-D1/P1-D2 are operator-accepted real audio behavior. P1-D5 is accepted
  from the real configured-provider session plus the existing versioned
  Draft/Publish/snapshot/invalid-Draft contract regression.
- Exit verification at product tip `4bd241f`: `npm test` passed 51 files and
  621 tests; Node and web typechecks passed; `npm run build` passed; the real
  provider smoke passed; `git diff --check` passed. Target-Mac TCC, signing,
  packaged-worker, LaunchAgent, and power behavior remain later port/field
  evidence and are not claimed by this Windows acceptance.

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
| Current product configuration | Realtime model `gpt-realtime-2.1-mini`; input transcription `gpt-live-transcribe`; voice `cedar`; `server-vad-noisy`; no runtime fallback |
| Deterministic SQLite artifact | Outside the repo at `C:\tmp\magic-mirror-p1-u8b-deterministic.sqlite`; P1-D3/D4/D6 `mock_passed`; P1-D1/D2/D5 `real-demo not_executed`. It is not a real demo and is not a tracked repo file. |
| Phase 1 exit | Accepted by the operator from the real Windows microphone/speaker path and released as `phase1-v0.3.1`; target-Mac checks remain deferred to the later port. |
| Phase 2 Windows checkpoint | Accepted Phase 1 baseline merged at `b9b74cb`; default phrase `魔鏡阿魔鏡`; selected package `sherpa-magic-mirror-win-v2`; operator accepted the Windows lifecycle checkpoint and deferred accuracy hardening to Phase 7. |
| Phase 2 sherpa Windows package | Official latest selected zh-en artifacts, custom `魔鏡阿魔鏡` token encoding, hashes, provenance, and tuning are recorded in `sherpa-magic-mirror-win-v2`. Runtime package loading and real EPOS microphone acquisition passed; multi-speaker and ambient accuracy optimization remains Phase 7 work. |
| Phase 2 Windows wake candidate selection | The Windows development runtime explicitly selects the sherpa package. Porcupine and its credential/dependency/runtime branches are removed; the sherpa package is revalidated on M4 during the later port. |
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

- Accepted Phase 1 tag `phase1-v0.3.1` is merged into Phase 2 at `b9b74cb`.
  Phase 2 uses one immutable, replaceable sherpa `zh-CN` wake package with
  exact hashes/provenance/tuning and no alternate-engine credential or fallback.
- The isolated worker owns one `decibri` 16 kHz mono capture path only in
  Dormant/OfflineLoop. Wake/manual start release it before Realtime starts;
  stop, idle, the payload-free model tool `return_to_dormant` for the directed
  phrase `恭送渡鴨大人`, and cloud failure close renderer tracks before wake
  reacquires. Quoted, negated, hypothetical, and incidental mentions do not
  activate the tool. Local handoff failure enters Maintenance.
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
- Windows package/tooling closure at `693edef`: explicit `win32-x64`/
  `darwin-arm64` import and evaluation, immutable sherpa
  `numTrailingBlanks`, and the official-model candidate that is now selected
  for Windows human validation. Fresh
  verification: `61/61` test files and `667/667` tests, both typechecks, build,
  and diff check exited `0`; canonical Windows packaging exited `0`. The
  canonical automated provider smoke passed with
  `PHASE1_LIVE_RESULT status=passed stage=dormant reason=completed exit=0 duration_ms=5424 model_availability=available provenance=passed cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`;
  packaged `Magic Mirror.exe` boot/auto-quit exited `0` with isolated user data.
  The candidate evaluator processed seven official non-target WAVs with zero
  detections and zero failures. It also detected 7/9 locally synthesized
  `魔鏡阿魔鏡` clips across three installed Mandarin voices and three speech
  rates with zero inference failures. The 22.2% synthetic false-reject rate was
  not used for tuning or package selection; these checks do not claim physical
  wake quality.
- Electron `44.0.0` dev runtime loaded the hashed sherpa package and reached
  `wake_worker_ready` then `wake_worker_listening` on the real EPOS microphone.
  Two fixed Windows-TTS speaker-loop attempts were not detected, consistent
  with the EPOS echo-cancellation path; this is not a physical human wake pass.
- Final Phase 2 close gate: `60/60` test files and `665/665` tests passed;
  Node/web typechecks, Electron Vite build, Electron 44 Windows package,
  packaged executable boot/auto-quit, and `git diff --check` exited `0`. The
  real-provider lifecycle regression passed with
  `PHASE1_LIVE_RESULT status=passed stage=dormant reason=completed exit=0 duration_ms=14797 model_availability=available provenance=passed cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0`.
- Operator evidence on 2026-08-27 demonstrated the real local wake path on the
  second of two attempts, confirmed exact `如你所願，再會` directed sleep, and
  confirmed a 30-second developer-idle return to Dormant. Production idle was
  then restored to 300 seconds in Active config version 9.
- The metadata timeline records wake-worker release before Realtime mic acquire
  at `2026-08-27T13:51:21Z`/`13:51:22Z`; after the idle deadline, Realtime
  cleanup precedes wake listening and Dormant at `2026-08-27T13:52:01Z`.
  Console Phase Tests recorded P2-D1/D3/D4/D5 as real `passed` and P2-D2 as
  `not_executed` at `2026-08-27T14:01:18.892Z`, build `phase2-v0.3.1`.
- The user accepted this Windows Phase 2 checkpoint and explicitly deferred
  P2-D2 offline wake, the 19/20 live-wake sample, the 30-minute ambient/TV run,
  and broader multi-speaker accuracy work to Phase 7. These are not claimed as
  Phase 2 passes. M4/native quality, macOS worker/TCC/signing, and target-device
  accuracy are also not claimed.

## Pending work — exact order

1. Human-verify and close the Phase 3 Windows candidate: real Realtime lipsync,
   10-minute conversation, ten interruptions, and perceived avatar/audio
   quality; then record Phase Tests, regression, tag, and merge only if accepted.
2. In Phase 7, execute the deferred P2-D2 offline-wake check, representative
   multi-speaker positive corpus, 19/20 acceptance sample, and 30-minute
   ambient/TV false-wake run.
3. After PC development, revalidate the sherpa package and complete TCC/native
   packaging/signing/LaunchAgent/power evidence during the Mac mini M4 port
   before final deployment acceptance.

## Later roadmap additions — 2026-08-27

- Phase 7 — optimize wake-word accuracy using representative speakers,
  distances/noise conditions, ambient negatives, and final target hardware.
- Phase 8 — Multiple Personas / Persona Tuning. Add versioned,
  operator-selectable Personas and tune their character consistency, speaking
  style, and response quality. This post-core phase is not started and its
  detailed design is intentionally deferred.

## Human-intervention ledger

| Boundary | Record | Status |
|---|---|---|
| P1-U7 engineering | No human intervention was needed for the accepted bounded/mock/static gates recorded for U7. | Complete |
| P1-U7 harness incidents | Worker/launcher timeouts, stale test expectations, and smoke timeout were recovered with preserved artifacts; they were harness/test events, not product failures. | Complete; no human intervention |
| P1-U8-A/U8-B deterministic engineering | No human intervention was needed. Recent worker timeouts during harness compaction were clean harness-service/process incidents, not product failures. | Complete; no human intervention |
| P1-C3 Electron launch | Earlier launch failure cleared without intervention; it did not reproduce in the focused rerun/full gate; no install/reinstall or human action was required. | Cleared |
| P1 automated live gate — 2026-08-26 (earlier attempt) | `PHASE1_LIVE_RESULT status=failed stage=active reason=start_connect_realtime_model_unsupported exit=1 duration_ms=2257 model_availability=unavailable cleanup=passed marker_count=1 output_marker_count=1 orphan_count=0` | Historical metadata-only observation; no model-spelling conclusion is drawn. |
| P1 exact-model live attempts — 2026-08-26 | Fresh full and mini exact markers are recorded above. | Superseded diagnosis: these runs loaded a local mock model from non-isolated user data; the 2026-08-27 corrected run proves provider/project access. |
| Phase 1 exit | Operator accepted real conversation, output, and barge-in; `phase1-v0.3.1` is pushed. | Complete |
| Phase 2 engineering | Windows implementation, native package load, EPOS microphone acquisition, operator lifecycle checks, and automated close gate passed. | Accepted as `phase2-v0.3.1` Windows checkpoint |
| Wake quality selection | The v2 sherpa package is selected; P2-D2, multi-speaker, 19/20, ambient, and M4 accuracy evidence are explicitly deferred. | Phase 7 / Mac-port work |
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
- Phase 3: observe real Realtime-output lipsync, interruption, ten-minute
  stability, and perceived avatar/audio quality on the Windows candidate. The
  final character asset remains a Phase 7 deliverable.
- Phase 4: approve the final spells and presets, then connect and observe the
  adapters and hardware.
- After PC development: provide target-Mac, operator, and device time for the
  port, wake revalidation, 100-cycle/soak, boot, power, signing, and TCC checks.

Phase 2 engineering started under the dated overlap ruling and was accepted
after the Phase 1 physical gate and the operator's real Windows lifecycle
checks. The release is a Windows checkpoint only; Mac deployment and deferred
accuracy evidence are not claimed.

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
  During the 2026-08-27 canonical Phase 2 smoke, dependency/package preparation
  left the pinned development Electron binary absent; running its pinned
  `install.js` restored Electron `43.4.1` at the same canonical path. The rule
  still matched exactly, no firewall prompt was needed, and the subsequent
  live and packaged smokes passed. Future runtime runs verify the executable
  exists after dependency/package operations; they do not add another rule.
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
