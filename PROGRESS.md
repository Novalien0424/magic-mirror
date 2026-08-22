# Magic Mirror — Progress

**Current dashboard — Status as of 2026-08-22 — Phase 1 — Realtime Voice: IN PROGRESS.** The active branch is
`phase1-realtime-voice`; Phase 0 is accepted at local tag `phase0-v0.3.1` on
`9237dc7`; the accepted Phase 1 plan is `82aa39c`; P1-U7 is next and P1-U8 is
pending. Phases 2–7 remain sequential and have not started.

## Phase 1 — Realtime Voice checkpoint (2026-08-22)

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
| P1-U7 — Console voice controls/persona/credential/model/RAM transcript view | next | pending |
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

P1-U7 must compose the accepted transcript, interruption, cleanup, realtime
recovery, audio-event, cleanup-boundary, and authorized Console seams into the
default runtime. P1-U8 owns deterministic/real demos, Phase Test records, the
full regression/privacy scan, final exit acceptance, and the local
`phase1-v0.3.1` tag.

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
