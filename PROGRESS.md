# Magic Mirror — Progress

**Current dashboard — Status as of 2026-08-23 — Phase 1 — Realtime Voice: IN PROGRESS.** The active branch is
`phase1-realtime-voice`; Phase 0 is accepted at local tag `phase0-v0.3.1` on
`9237dc7`; the accepted Phase 1 plan is `82aa39c`; P1-U7A, P1-U7B1/B2
transport, P1-U7C1/C2 credential/DTO boundaries, and P1-U7C3 renderer
runtime owner and generation-safe Realtime session rollover, and P1-U7D/U7E1/U7E2
are accepted; P1-U7F1 and P1-U7F2A are accepted; P1-U7 remains in progress
with P1-U7F2B next, followed by P1-U7F3; P1-U8 is pending. Phases 2–7 remain
sequential and have not started.

## Phase 1 — Realtime Voice checkpoint (2026-08-23)

P1-U1 through P1-U6 are accepted. Phase 1 remains in progress; no Phase 1
demo, exit, or tag is claimed.

| Unit | State | Accepted record |
|---|---|---|
| P1-U1 — SDK lockstep + versioned voice/session snapshots | accepted | `4862383` |
| P1-U2 — Main safeStorage credential import + ephemeral client-secret broker | accepted | `5be5871` |
| P1-U3 — deterministic RealtimeSession/WebRTC adapter + official ScriptedRealtimeTransport | accepted | `18461e5` |
| P1-U4 — one microphone owner + one audible output + playback completion | accepted | `cffd484` |
| P1-U5 — lifecycle outage/OfflineLoop/recovery/manual wake/rollover | accepted | `fb5e58f` |
| P1-U6 — interruption/final-transcript RAM mapping and cleanup | accepted | no self-referential hash recorded |
| P1-U7 — Console voice controls/persona/credential/model/RAM transcript view | in progress; P1-U7A, P1-U7B1/B2, P1-U7C1/C2, P1-U7C3, P1-U7D, P1-U7E1, P1-U7E2, P1-U7F1, and P1-U7F2A accepted; P1-U7F2B next | `4b2b6fa`, `4636b17`, `f4e5103`, `105db2f`, `b81d400` |
| P1-U8 — deterministic demos/records/privacy/regression + real exit checkpoint | pending | pending |

### P1-U6 scope and evidence

The exact eight application/test paths were:

- `src/renderer/realtime/transcript-buffer.ts`
- `src/renderer/realtime/turn-controller.ts`
- `src/renderer/realtime/session-cleanup.ts`
- `src/shared/console-types.ts`
- `src/main/console-data.ts`
- `tests/unit/realtime-transcript-buffer.test.ts`
- `tests/unit/realtime-interruption.test.ts`
- `tests/unit/realtime-privacy-cleanup.test.ts`

The bounded current-session transcript projection is RAM-only. Invalid or stale
input degrades with stable metadata; VAD/manual interruption stops audible gain
and coalesces duplicate interrupt signals; Voice and new-turn progress are not
gated by transcription. Stop, offline, rollover, restart, and close boundaries
clear RAM. No transcript persistence, telemetry, or export path was added.

The tester gate passed `32/32` focused tests; `npm run typecheck:node` exited
`0`; and `npm run typecheck:web` exited `0`. Directly checked invariant IDs
`1, 4, 5, 6, 9, 10, 11, 12`; canonical invariants `1–12` remain preserved.
The historical checkpoint recorded the user-owned paths
`docs/Magic_Mirror_Phase0_Adversarial_Review_2026-08-19.md` and
`scripts/install-node-lts.ps1` with content unchanged. The user's explicit
2026-08-22 instruction authorizes tracking both in the integration commit. No
`.env` content/value was read or validity checked.

### P1-U7A — Console start/disconnect controls (externally accepted 2026-08-22)

Console Start Conversation and Disconnect use typed, validated Console-only
IPC to the existing `manualStart`/`manualStop` actions and surface only
metadata-only action/status/reason. Simulate Cloud Failure is unchanged, and
R2's authoritative `handleSimulator` return shape is unchanged.

The exact nine changed source/test paths were:

- `src/main/ipc.ts`
- `src/preload/console.ts`
- `src/renderer/console/App.tsx`
- `src/shared/bridge.ts`
- `src/shared/console-types.ts`
- `tests/integration/phase1-recovery.test.ts`
- `tests/unit/console-ipc.test.ts`
- `tests/unit/console-ui.test.ts`
- `tests/unit/realtime-privacy-cleanup.test.ts`

Accepted evidence was `git diff --check` exit `0` with line-ending warnings,
four focused files passing `31/31` tests, and Node/web typechecks exiting `0`.
No full suite, build, or demo was run. This accepts P1-U7A only; P1-U7
remains in progress, with Interrupt and the rest of its scope next, and no
Phase 1 exit is claimed.

Process evidence is metadata-only: the initial worker timed out and recovery
completed the route; accidental untracked `pnpm` files were removed, and
`npm` is the verified command route. Current evidence identifies no
project-skill correction. This record update changes no application, test,
skill, or package file.

### P1-U7B1/B2 — Console interrupt transport (externally accepted 2026-08-22)

An authorized zero-argument Console interrupt dispatches payload-free through
Main to the exact `mirror:interrupt` channel on the tracked Mirror
`webContents`, with metadata-only dispatch `status`/`reason`. Mirror preload
exposes typed `onInterrupt(listener)` with an exact disposer and drops the
event payload. No Console UI, Mirror App consumer, `TurnController` call,
renderer acknowledgment, or interruption-completion claim exists yet.

The exact eight changed source/test paths were:

- `src/main/ipc.ts`
- `src/preload/console.ts`
- `src/preload/mirror.ts`
- `src/shared/bridge.ts`
- `src/shared/console-types.ts`
- `tests/unit/console-ipc.test.ts`
- `tests/unit/mirror-projection.test.ts`
- `tests/unit/realtime-privacy-cleanup.test.ts`

Accepted evidence was `git diff --check` exit `0` with line-ending warnings,
five focused files passing `45/45` tests, and Node/web typechecks exiting `0`.
No full suite, build, or demo was run. No human input was needed for this
transport boundary, and current evidence identifies no project-skill
correction. No Phase 1 exit is claimed.

This record update makes no source, test, skill, or package change and records
no private values, commit, or invented hash.

### P1-U7C1/C2 — atomic credential issuer and renderer-safe DTO (externally accepted 2026-08-22)

C1's atomic issuer/600-second credential expiry is committed and pushed at
`cc8c34f`. Before credential await it synchronously copies/freezes the Published
model snapshot and Main realtime identity, mints for
`snapshot.realtimeDialogue`, then copies/freezes the result. Focused evidence
was 3 test files/9 tests and a green Node typecheck; the Windows-only platform
limitation remains.

C2 is externally accepted on the current uncommitted integration diff; no
future commit hash is recorded. The existing
`mirror:request-realtime-client-secret` channel/method returns one
renderer-safe atomic DTO. Boot uses the C1 issuer with current Published active
settings and existing Main lifecycle identity; missing identity is explicit
`session_unavailable` with no broker call, malformed data is
`invalid_payload`, and preload structurally validates, sanitizes, copies, and
freezes the exact DTO. The old direct secret-only path is absent.

Fresh C2 evidence was 6 test files/45 tests passing, Node/web typechecks
exiting `0`, and `git diff --check` exiting `0` with line-ending warnings; the
prior exact negative scan exited `1` with empty output as expected. No full
suite, build, demo, or target-Mac/provider field verification belongs to this
unit. C1/C2 surveys found no concrete defect in the four required Magic Mirror
skills; no skill edit is needed.

P1-U7C3 is accepted below. P1-U8 owns deterministic/real demos, Phase Test
records, the full regression/privacy scan, final exit acceptance, and the local
`phase1-v0.3.1` tag. No Phase 1 exit is claimed.

### P1-U7C3 — renderer runtime owner and generation-safe Realtime session rollover (externally accepted 2026-08-22 at `24bccfd`)

The renderer runtime owner for session, transport, microphone, audio, and
cleanup, including generation-safe Realtime session rollover, is externally
accepted at `24bccfd`. Evidence was `47/47` test files
and `478/478` tests passing; `npm run typecheck:node`,
`npm run typecheck:web`, and `npm run build` each exited `0`. One stale Mirror
interrupt expectation was corrected.

An earlier Electron launch failure cleared without intervention and did not
reproduce in the 3-file/29-test focused rerun or the full gate. Local
`electron.cmd` and the direct binary were `v43.4.1`; no install/reinstall or
human action was required. The existing `DEP0190` child-process shell warning
remains.

P1-U7 remains in progress. P1-U7D App/Console interrupt composition is next,
followed by remaining lifecycle, recovery, and timer work; P1-U8 owns
deterministic/real demos, Phase Test records, the full regression/privacy scan,
final exit acceptance, and the local `phase1-v0.3.1` tag. This does not mark
real Realtime, microphone, or target-Mac evidence complete, and no Phase 1
exit is claimed.

### P1-U7F1/U7F2A — command transport and Main-owned manual transactions accepted (2026-08-23)

P1-U7F1 is accepted and pushed at `105db2f`: a frozen typed Main-to-Mirror
start/stop/rollover command DTO, Mirror preload subscription/disposer, exact
tracked-Mirror dispatch with stable metadata-only outcomes, and strictly
positive renderer bundle generations.

P1-U7F2A is accepted, committed, and pushed at `b81d400`. Main keeps one
pending start identity; wake increments generation; a request bundle may use
the pending identity only while Activating; renderer success commits that
exact ID; delivery/renderer start failure reaches OfflineLoop and clears
pending identity. Active stop transitions through Suspending to Dormant on
renderer success or Maintenance on failure; wrong-state outcomes are ignored
with metadata-only reasons. Legacy explicitly injected recovery-controller
behavior is preserved. Production index dispatches through the tracked Mirror,
and IPC reconciles outcome reports non-throwingly.

Strict TDD recovered RED with 4 existing tests passing and exactly 3 new
transaction tests failing for the intended missing behavior; lifecycle
generation evidence was `32/32` green, and the focused candidate later passed
`90/90`. After test-fixture corrections, the final gate was Node typecheck
`0`, web typecheck `0`, `npm test` `48/48` files and `515/515` tests, and
`npm run build` `0`; `DEP0190` remains a nonblocking tooling warning. The
regression investigation found no production defect: test-only corrections
replaced stale bundle generation `0` (Main's no-session sentinel), restored
the accepted command channel in two exact Mirror maps, and typed one fixture
callback while retaining strict zero-rejection coverage.

The broad U7F survey timed out, its narrowed retry succeeded, and bounded
U7F2A RED-writer/combined-RED-tester/first-implementer timeouts were recovered
with artifacts where applicable; these were harness events, not product
failures. Scoped survey and root review found no concrete defect or missing
invariant/behavior in the four routed skills; no skill change is warranted.

Next is P1-U7F2B: the pending 60-minute rollover transaction plus bounded
outage recovery/retry probes, preserving the active authoritative identity
until renderer rollover success. P1-U7F3 then mounts the single renderer
runtime host/cleanup/outcome composition. P1-U8 owns deterministic/real demos,
Phase Test records, regression/privacy scan, Phase 1 exit, and the local
`phase1-v0.3.1` tag. The accepted 300-second idle/wake/sleep timer remains a
Phase 2 non-goal. No Phase 1 exit or real OpenAI, mic/output, macOS, or
operator evidence is claimed.

## Human-intervention ledger

| Boundary | Human intervention or evidence | Timing/status |
|---|---|---|
| P1-U7A | None needed; typed Console controls and metadata-only outcomes are accepted with the bounded mock/test evidence. | Complete |
| P1-U7B1/B2 | None needed; the bounded payload-free Main-to-Mirror interrupt transport is accepted with mock/test evidence. | Complete |
| P1-U7C1/C2 | None needed for C1/C2 engineering and mock/static acceptance. | Complete |
| P1-U7D/U7E1/U7E2/U7F1/U7F2A | No human intervention; the broad U7F survey timed out, its narrowed retry succeeded, and bounded U7F2A worker/tester timeouts were recovered with artifacts where applicable; no skill correction was needed. | Complete; no human intervention |
| P1-U7C3 Electron launch | Earlier launch failure cleared without intervention and did not reproduce in the 3-file/29-test focused rerun or full gate; local `electron.cmd` and direct binary were `v43.4.1`; no install/reinstall or human action was required. Existing `DEP0190` child-process shell warning remains. | Cleared; no action required |
| Phase 1 exit | Real OpenAI credential/account/network; PoC mic/output; temporary Persona; Voice choice; and operator observation of P1-D1/D2/D5. | Required later, before exit |
| Target Mac | Keychain `safeStorage`, TCC mic/camera, signing/entitlements, packaged workers, LaunchAgent restart, power policy, and real-device/provider behavior. | Later target-Mac evidence |
| Venue/product inputs | Wake corpus/keyword, avatar assets, scene spells/presets, camera/identity inputs, memory/profile inputs, and hardware/adapter inputs. | Later venue-specific work |

Mocks allow progress where the boundary permits, but cannot replace the real
OpenAI, mic/output, and operator-observed evidence required for Phase 1 exit.

## Phase 0 — accepted ledger (2026-08-20)

| Task | State and accepted record | Validation retained |
|---|---|---|
| 1 — scaffold, two windows, never-black-screen boot | done + reviewed; included in `phase0-v0.3.1` | historical typecheck; 4 files / 20 tests |
| 2 — lifecycle state machine | done + reviewed + locally integrated at `a7d74b14771de4f527762c30171ad2e68fc3d985` | 31 focused; merged 5 files / 51 tests; Node typecheck `0` |
| 3 — ConfigService + credentials | done + reviewed + integrated at `0270686`, correction/integration tip `835c92d` | 7 files / 92 tests; Node/web typecheck and Electron Vite build `0` |
| 4 — metadata-only, non-blocking telemetry | done + reviewed + integrated at `dca1327` | focused `21/21`; 8 files / 113 tests; typecheck/build `0` |
| 5 — SQLite + migrations | done + reviewed + integrated at `a8f0355` | focused `32/32`; full `145/145`; typecheck/build `0` |
| 6 — Main module registry + mocks | done + reviewed + accepted + integrated at `5b95a94`; plan gate `83be86b` | focused `16/16`; full `161/161`; typecheck/build green |
| 7 — model settings resolver + snapshots | done + reviewed + accepted; plan `6214b6c`, implementation `5e24bdc` | focused `7/7`; full `168/168`; typecheck/build and both negative scans green |
| 8 — boot wiring, IPC, Mirror UI + OfflineLoop | accepted | accepted application task |
| 9 — Console UI — 6 pages | accepted | accepted application task |
| 10 — P0 demo runner, exit criteria, tag | done + accepted | Task 10B `13/13`; Task 10C `8/8`; full `311` |

### Phase 0 acceptance evidence

P0-D1 through P0-D5 passed, including both P0-D2 cloud/core failure cases.
Node/web typechecks and the Electron Vite build passed; ten bounded smoke cycles
passed; and the exact real-time 30-minute OfflineLoop soak passed with seven
samples at elapsed `0`, `300000`, `600000`, `900000`, `1200000`, `1500000`, and
`1800000` ms. Every sample was nonblack and playing, and memory growth stayed
below the accepted `134217728`-byte allowance.

The privacy scan, negative runtime model/fallback scan, Windows unpacked
packaging, fixed asset hash/length/decode, no-relaunch, exact-whitespace, and
status-scope gates passed. Task 10 uses the preserved Electron `43.4.1` and
electron-builder `26.15.3` facts. The LaunchAgent
`KeepAlive={SuccessfulExit=false}` remains the sole restart owner; in-app
recovery recreates a failed renderer once and then exits with code `1`;
`app.relaunch()` is never used.

Windows development evidence validates DPAPI-backed `safeStorage` and local
packaging only. It does not field-verify target-macOS Keychain, TCC, signing,
entitlements, packaged-worker, LaunchAgent, real-device, or provider/account
behavior. Model IDs remain versioned-config-only; a failed configured ID is
never silently substituted. Canonical invariants `1–12` remain authoritative:
diagnostics are metadata-only, private values stay RAM-only, mic ownership is
single, degradation is visible, failures do not gate unrelated behavior, and
credentials remain Main-owned through `safeStorage`.

## Harness and environment checkpoint

Launcher hardening through H9 culminated at `5818830`; the frozen harness suite
passed `15/15`, and a real profile-backed probe passed. Fixed deadlines remain
first-write `480` seconds, post-write `120` seconds, and overall `600` seconds.
Raw JSON event streams remain suppressed and only the latest nonempty agent
message is forwarded.

Dependency materialization recorded `398` packages installed, `399` audited,
and zero vulnerabilities. Preserve Electron `43.4.1`, electron-builder
`26.15.3`, and development Node `v24.19.0`, which satisfies the prerequisite
`>=22.22.2` or `>=24.15.0`. The existing unrelated Node `DEP0190` warning
remains a recorded risk. Windows firewall setup is development-only evidence;
script-fix commit `3e93936` supplied noninteractive display names for the
persistent Private-profile rules `MagicMirror.Development.Electron.TCP` and
`MagicMirror.Development.Electron.UDP`.

## Current verification and how-to

| Command | Purpose |
|---|---|
| `npm run dev` | electron-vite development Mirror plus hidden Console |
| `npm run build` | production bundles into `out/` |
| `npm run typecheck` | Node and web TypeScript checks |
| `npm test` | Vitest, including spawned boot smoke runs |

Smoke metadata uses `MIRROR_SMOKE_MS=<n>`; exit `0` requires both windows loaded
and lifecycle `dormant` or `maintenance`, while invalid smoke input exits `2`.
`MIRROR_FORCE_RENDERER_FAIL=1` tests the unavailable-bridge path and
`MIRROR_FORCE_RENDERER_CRASH=<n>` tests bounded renderer recovery. Boot markers
are metadata-only: never transcripts, audio, prompts, memory values, images,
embeddings, credentials, or other private content.

## Privacy, platform, and remaining-risk register

`.env` metadata is limited to exists `true`, ignored by `.gitignore` line `9`,
Git tracked `false` (untracked), content/value accessed `false`, and validity
checked `false`. Its value was not read and is never recorded. It is provisioning
input only; Main `safeStorage` and short-lived renderer credentials remain the
authoritative credential path.

The customizable wake word remains a Phase 2 requirement. The editable
phrase/config/raw keyword source must generate a versioned detector keyword
artifact with metadata and safe fallback, followed by tuning evidence; this
implementation and tuning have not started. The user-owned
`scripts/install-node-lts.ps1` and
`docs/Magic_Mirror_Phase0_Adversarial_Review_2026-08-19.md` have content that
remains unchanged; the user's explicit 2026-08-22 instruction authorizes
tracking both in the integration commit.

Historical pre-acceptance records that say Phase 0 is in progress, Phase 1 is
blocked, or Tasks 8–10 are next/unimplemented are superseded and retained only
as traceability. They do not override this dashboard. Harness-migration Task
labels are process records and are distinct from application Tasks 1–10.
