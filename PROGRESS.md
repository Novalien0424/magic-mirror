# Magic Mirror — Progress

**Current dashboard — 2026-08-23 — Phase 1, Realtime Voice: IN PROGRESS.**
Branch `phase1-realtime-voice` has accepted product commit `b246521` for
P1-U9. Phase 0 is accepted and tagged
`phase0-v0.3.1` at `9237dc7`. The accepted Phase 1 plan is
`82aa39c`; P1-U1 through P1-U7 are accepted, with U7 tip `426f52c`.
P1-U8-A is accepted/pushed at `fd78a28`; the phase-evidence skill correction
was accepted at `d8ca7de`; deterministic P1-U8-B engineering is
accepted/pushed at `d1d5364`. P1-U9 credential-source closure is accepted with
focused `5/5` and `npm run typecheck:node` exit `0`; no real API/provider/
target-Mac run occurred. Phase 1 exit/tag is **not accepted**. Phases 2–7
remain sequential and have not started. Canonical invariants 1–12 remain
authoritative; control-plane rules and current authority are in
[`AGENTS.md`](AGENTS.md), and durable rulings are in [`DECISIONS.md`](DECISIONS.md).

## Clock-out handoff — 2026-08-23

- Resume at `phase1-realtime-voice`, accepted product commit `b246521`. P1-D3/
  P1-D4/P1-D6 are deterministic `mock_passed` only; P1-D1/P1-D2/P1-D5 remain
  `real-demo not_executed`. Phase 1 exit/tag is not accepted. Phase 2 has not
  started and must not advance until the Phase 1 real gate passes.
- The real-gate intervention checklist is not a completion claim: the ignored
  root `.env` `OPENAI_API_KEY` is loaded only by Electron Main at runtime;
  Console provisioning, `safeStorage`, Keychain, DPAPI, and alternate
  credential fallback are not runtime paths. Agents/workers do not inspect or
  output `.env` values and no value is recorded. Provide network, physical
  microphone/output, a temporary Persona, and the built-in Voice; observe
  analyser/output behavior; run 20 real P1-D1 turns, 10 real P1-D2
  interruptions, real P1-D5 Draft/Publish/new-session/invalid-Draft checks,
  and real metadata-only Console records.
- Next-session order: finish the P1 real demos; complete Phase 1
  regression/exit/tag; perform the exact-path Phase 2 survey; implement bounded
  TDD units for keyword artifact, wake worker, exclusive mic handoff,
  lifecycle, idle-sleep, and Console corpus; then run P2 real demos/tuning,
  platform evidence, regression, and tag.
- Applicable invariant boundary: `1, 8, 9, 10, 11, 12`. No transcript, audio,
  private context, credential, or other user content is recorded in this
  handoff.

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
the historical DPAPI-backed `safeStorage` path and local packaging only; that
credential ruling is superseded for this personal build by the ignored-root
`.env` Main-only path. It does not field-verify target-Mac TCC, signing,
entitlements, packaged workers, LaunchAgent, real-device, or provider/account
behavior. Configured model IDs remain versioned-config-only;
failure never silently substitutes another ID.

## Pending work — exact order

The 2026-08-23 clock-out handoff above is authoritative. The P1 real gate,
Phase 1 regression/exit/tag, exact-path Phase 2 survey, bounded Phase 2 TDD,
and later Phase 2 real/tuning/platform/regression/tag work remain pending in
that order; subsequent phases remain sequential.

## Human-intervention ledger

| Boundary | Record | Status |
|---|---|---|
| P1-U7 engineering | No human intervention was needed for the accepted bounded/mock/static gates recorded for U7. | Complete |
| P1-U7 harness incidents | Worker/launcher timeouts, stale test expectations, and smoke timeout were recovered with preserved artifacts; they were harness/test events, not product failures. | Complete; no human intervention |
| P1-U8-A/U8-B deterministic engineering | No human intervention was needed. Recent worker timeouts during harness compaction were clean harness-service/process incidents, not product failures. | Complete; no human intervention |
| P1-C3 Electron launch | Earlier launch failure cleared without intervention; it did not reproduce in the focused rerun/full gate; no install/reinstall or human action was required. | Cleared |
| Phase 1 exit | Exact real-demo intervention checklist is recorded in the 2026-08-23 clock-out handoff; the personal-build credential remains ignored-root `.env` Main-only, with no safeStorage/Keychain/DPAPI path, and records remain metadata-only. | Pending; P1-D1/D2/D5 `real-demo not_executed` |
| Target Mac | TCC, signing/entitlements, packaged-worker, LaunchAgent, power, device, and provider checks are later; the superseded Keychain credential path is not a runtime requirement for this personal build. | Pending |
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
