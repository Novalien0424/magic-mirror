# Magic Mirror — Progress

**Current dashboard — 2026-08-23 — Phase 1, Realtime Voice: IN PROGRESS.**
Branch `phase1-realtime-voice` is pushed through `d1d5364`. Phase 0 is accepted
and tagged `phase0-v0.3.1` at `9237dc7`. The accepted Phase 1 plan is
`82aa39c`; P1-U1 through P1-U7 are accepted, with U7 tip `426f52c`.
P1-U8-A is accepted/pushed at `fd78a28`; the phase-evidence skill correction
was accepted at `d8ca7de`; deterministic P1-U8-B engineering is
accepted/pushed at `d1d5364`. Phase 1 exit/tag is **not accepted**. Phases 2–7
remain sequential and have not started. Canonical invariants 1–12 remain
authoritative; control-plane rules and current authority are in
[`AGENTS.md`](AGENTS.md), and durable rulings are in [`DECISIONS.md`](DECISIONS.md).

## Phase 1 — accepted unit ledger

| Unit | Accepted record | Material boundary/evidence retained |
|---|---|---|
| P1-U1 | `4862383` | SDK lockstep and versioned voice/session snapshots |
| P1-U2 | `5be5871` | Main `safeStorage` import and ephemeral client-secret broker |
| P1-U3 | `18461e5` | Deterministic `RealtimeSession`/WebRTC adapter and official scripted transport |
| P1-U4 | `cffd484` | One microphone owner, one audible output, playback completion |
| P1-U5 | `fb5e58f` | Lifecycle outage, OfflineLoop, recovery, manual wake, rollover |
| P1-U6 | accepted; no self-referential hash recorded | RAM-only transcript/interruption mapping and cleanup; focused `32/32`, Node/web typechecks `0` |
| P1-U7 | accepted at `426f52c`; record set `4b2b6fa`, `4636b17`, `f4e5103`, `105db2f`, `b81d400`, `5e8b66d`, `c427670`, `b4abd76`, `426f52c` | Console voice controls, persona/credential/model controls, RAM transcript view, runtime ownership and recovery |
| P1-U8-A | accepted/pushed at `fd78a28`; phase-evidence correction `d8ca7de` | Deterministic demo/record/privacy/regression checkpoint; no real-demo promotion |
| P1-U8-B | deterministic engineering accepted/pushed at `d1d5364` | Fresh gate: `49/49` test files, `570/570` tests, Node/web typechecks, Electron Vite build, and `git diff --check` all exit `0` |

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
| Deterministic SQLite artifact | Outside the repo at `C:\tmp\magic-mirror-p1-u8b-deterministic.sqlite`; P1-D3/D4/D6 `mock_passed`; P1-D1/D2/D5 `real demo not_executed`. It is not a real demo and is not a tracked repo file. |
| Phase 1 exit | Not accepted; no Phase 1 release tag. Real/provider/device/operator evidence is not claimed. |
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
DPAPI-backed `safeStorage` and local packaging only, not target-Mac Keychain,
TCC, signing, entitlements, packaged workers, LaunchAgent, real-device, or
provider/account behavior. Configured model IDs remain versioned-config-only;
failure never silently substitutes another ID.

## Pending work — exact order

1. Run real P1-D1/D2/D5 only when the required OpenAI account/credential/network,
   physical microphone/output, temporary Persona, Voice choice, analyser tuning,
   and operator observation are available; record them as real evidence.
2. Complete the Phase 1 regression/exit record and accept/tag Phase 1 only after
   those required real results. The deterministic artifact cannot substitute.
3. Start Phase 2 Wake Lifecycle, including customizable wake-word artifact
   generation, metadata/safe fallback, and tuning evidence. The accepted
   300-second idle/wake/sleep timer remains a Phase 2 non-goal.
4. Proceed sequentially through Phase 3 Avatar/Audio, Phase 4 Scenes, Phase 5
   Identity/Profiles, Phase 6 Memory, and Phase 7 Field Hardening.
5. Later target-Mac/field evidence must cover Keychain `safeStorage`, TCC
   mic/camera, signing/entitlements, packaged workers, LaunchAgent restart,
   power policy, and real-device/provider behavior.

## Human-intervention ledger

| Boundary | Record | Status |
|---|---|---|
| P1-U7 engineering | No human intervention was needed for the accepted bounded/mock/static gates recorded for U7. | Complete |
| P1-U7 harness incidents | Worker/launcher timeouts, stale test expectations, and smoke timeout were recovered with preserved artifacts; they were harness/test events, not product failures. | Complete; no human intervention |
| P1-U8-A/U8-B deterministic engineering | No human intervention was needed. Recent worker timeouts during harness compaction were clean harness-service/process incidents, not product failures. | Complete; no human intervention |
| P1-C3 Electron launch | Earlier launch failure cleared without intervention; it did not reproduce in the focused rerun/full gate; no install/reinstall or human action was required. | Cleared |
| Phase 1 exit | Real OpenAI/provider, physical mic/output, temporary Persona, Voice choice, analyser tuning, and operator-observed P1-D1/D2/D5 are required. | Pending human intervention/evidence |
| Target Mac | Keychain, TCC, signing/entitlements, packaged-worker, LaunchAgent, power, device, and provider checks are later. | Pending |
| Venue/product inputs | Wake corpus/keyword, avatar assets, scene spells/presets, camera/identity, memory/profile, and hardware/adapter inputs remain later. | Pending |

## Harness, environment, warnings, and privacy register

- H6/H9 process facts are frozen: root alone orchestrates and performs external
  acceptance; fresh profile-backed workers use exact bounded scopes, one of the
  implementer/surveyor/tester roles, and no recursive delegation. Evidence is
  metadata-only; raw JSON event streams stay suppressed and only the latest
  nonempty agent message is forwarded. Launcher hardening culminated
  at `5818830`; frozen suite `15/15` and a real profile-backed probe passed;
  deadlines remain first-write `480s`, post-write `120s`, overall `600s`.
- This is an npm-only project. Development Node is `v24.19.0` (prerequisite
  `>=22.22.2` or `>=24.15.0`); `398` packages were installed, `399` audited,
  zero vulnerabilities recorded. The unrelated Node `DEP0190` child-process
  shell warning and nonblocking LF-to-CRLF warnings remain. Windows firewall
  evidence is development-only; script-fix commit `3e93936` supplied the
  persistent Private-profile rule names `MagicMirror.Development.Electron.TCP`
  and `MagicMirror.Development.Electron.UDP`.
- `.env` exists, is ignored/untracked metadata only; its content/value was not accessed and validity was not checked.
  tracked `false`/untracked, content/value accessed `false`, validity checked
  `false`. Its value was not read and is never recorded; Main `safeStorage` and
  short-lived renderer credentials are authoritative.
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
