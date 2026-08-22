# DECISIONS.md — Durable process and architecture decisions

Newest first. Product documents remain authoritative for decisions derivable
from them; this file records accepted boundaries, selected contracts, and
process state that must survive implementation handoffs.

## Active boundary, authority, and phase order

- The interactive root is the sole orchestrator and external reviewer. Workers
  use exactly one bounded role, exact read/write scope, metadata-only evidence,
  and no recursive Codex or launcher invocation. For behavior changes,
  implementers own focused TDD RED/GREEN; independent tester workers own fresh
  acceptance validation. Implementers do not claim tester evidence.
- Every execution route is fresh and profile-backed with model
  `gpt-5.6-luna`, reasoning effort `max`, and one of `implementer`,
  `surveyor`, or `tester`. Worker self-review is capped at three passes;
  root review is external. No separate review worker exists.
- The fewest bounded fresh-worker gates consistent with strict TDD, tester-owned
  acceptance validation, privacy/invariants, and external review remain the
  efficiency ruling. This does not relax scope, evidence, privacy, or
  authority rules.
- Phase order is 0 Foundation/Console, 1 Realtime Voice, 2 Wake Lifecycle,
  3 Avatar/Audio, 4 Scenes, 5 Identity/Profiles, 6 Memory, and 7 Field
  Hardening. Phase 0 is accepted; Phase 1 is current and in progress under
  accepted plan `82aa39c`. P1-U1 through P1-U6 and P1-U7A/B1/B2/C1/C2/C3
  are accepted, as are P1-U7D/U7E1/U7E2; P1-U7 remains in progress with
  P1-U7F next and only planned, and P1-U8 pending. Phases 2–7 do not advance
  early.

## Active robust-POC efficiency decision (2026-08-22)

- The default route is one in-thread root plan review with no plan artifact by
  default, one bounded fresh implementer, implementer-owned focused RED/GREEN
  for behavior changes, one independent tester, external root acceptance, and
  authorized root commit/push. There is no separate plan worker, survey,
  review worker, per-unit demo, regression, or full-suite gate by default.
- Use the smallest validation command set that proves the changed boundary.
  Documentation/configuration-only changes use static checks without ceremonial
  application tests. Phase exit still requires the product demo, recorded
  result, required regression evidence, and release boundary from the phase
  workflow; affected risk may justify the same evidence earlier.
- A read-only survey is allowed only when authoritative sources cannot
  establish exact scope or evidence. A correction follow-up requires a
  concrete root finding. Independent work may share one unit only when it is
  naturally coupled and jointly reviewable.
- Escalation conditions are privacy/identity/profile, credentials, runtime
  model IDs, microphone ownership, restart ownership, schema/destructive
  migrations, dependencies/packaging, launcher/protocol, failed evidence, and
  phase exit. An escalation may add a survey, focused validation, or full
  regression as justified.
- The canonical launcher argv, profile, model, reasoning effort, protocol,
  deadlines, output cap, exact scope, freshness, role isolation, external root
  review, metadata-only evidence, and canonical invariants remain unchanged.

## Durable decisions

### Phase 1 voice, session, transcript, and microphone

- `@openai/agents` and `@openai/agents-realtime` stay in exact lockstep at
  `0.16.1`; `ScriptedRealtimeTransport` comes from the official testing
  export. Runtime model IDs still come only from versioned configuration.
- Session and job snapshots freeze the configured model/persona boundary.
  `realtimeSessionId` is authoritative for stale-event rejection;
  `sessionGeneration` is diagnostic only.
- A profile-scope change closes the old-owner session, confirms in a clean
  Persona+Master-only session, then calls `updateAgent` in that same clean
  session. Owner/profile identifiers stay in Main.
- P1-U6 maps final transcripts only to a bounded current-session RAM
  projection. Interruption stops audible gain and coalesces duplicate signals;
  stop, offline, rollover, restart, and close boundaries clear RAM. No
  transcript, audio, memory value, or private context is persisted.
- Exactly one microphone owner exists at a time. Handoff is explicit
  release-then-acquire; failure is local Maintenance, not cloud OfflineLoop.
  A single adapter or audio failure cannot gate unrelated conversation.

### P1-U7A accepted Console boundary (2026-08-22)

- Console Start Conversation and Disconnect use typed, validated Console-only
  IPC to the existing `manualStart`/`manualStop` actions and expose only
  metadata-only action/status/reason. Simulate Cloud Failure is unchanged, and
  R2's authoritative `handleSimulator` return shape is unchanged.
- The exact nine changed source/test paths are
  `src/main/ipc.ts`, `src/preload/console.ts`,
  `src/renderer/console/App.tsx`, `src/shared/bridge.ts`,
  `src/shared/console-types.ts`, `tests/integration/phase1-recovery.test.ts`,
  `tests/unit/console-ipc.test.ts`, `tests/unit/console-ui.test.ts`, and
  `tests/unit/realtime-privacy-cleanup.test.ts`.
- Accepted evidence is `git diff --check` exit `0` with line-ending warnings,
  four focused files passing `31/31` tests, and Node/web typechecks exiting
  `0`. No full suite, build, or demo was run; this is not P1-U7 completion or
  Phase 1 exit evidence.
- Process evidence remains metadata-only: the initial worker timed out and
  recovery completed the route; accidental untracked `pnpm` files were
  removed, and `npm` is the verified command route. Current evidence identifies
  no project-skill correction. No application, test, skill, or package change
  belongs to this record update.

### P1-U7B1/B2 accepted Console interrupt transport (2026-08-22)

- An authorized zero-argument Console interrupt dispatches payload-free through
  Main to the exact `mirror:interrupt` channel on the tracked Mirror
  `webContents`; dispatch exposes only metadata-only `status`/`reason`.
  Mirror preload exposes typed `onInterrupt(listener)` with an exact disposer
  and drops the event payload.
- No Console UI, Mirror App consumer, `TurnController` call, renderer
  acknowledgment, or interruption-completion claim exists yet.
- The exact eight changed source/test paths are
  `src/main/ipc.ts`, `src/preload/console.ts`, `src/preload/mirror.ts`,
  `src/shared/bridge.ts`, `src/shared/console-types.ts`,
  `tests/unit/console-ipc.test.ts`, `tests/unit/mirror-projection.test.ts`,
  and `tests/unit/realtime-privacy-cleanup.test.ts`.
- Accepted evidence is `git diff --check` exit `0` with line-ending warnings,
  five focused files passing `45/45` tests, and Node/web typechecks exiting
  `0`. No full suite, build, or demo was run.
- No human input was needed for this transport boundary. Current evidence
  identifies no project-skill correction. This is not Phase 1 exit evidence.
- This record update makes no source, test, skill, or package change and
  records no private values, commit, or invented hash.

### P1-U7C1/C2 accepted atomic credential/DTO boundary (2026-08-22)

- C1's atomic issuer/600-second credential expiry is committed and pushed at
  `cc8c34f`. Before credential await it synchronously copies/freezes the
  Published model snapshot and Main realtime identity, mints for
  `snapshot.realtimeDialogue`, then copies/freezes the result. Focused evidence
  was 3 test files/9 tests and a green Node typecheck; the Windows-only platform
  limitation remains.
- C2 is externally accepted on the current uncommitted integration diff; no
  future commit hash is recorded. The existing
  `mirror:request-realtime-client-secret` channel/method returns one
  renderer-safe atomic DTO. Boot uses the C1 issuer with current Published
  active settings and existing Main lifecycle identity; missing identity is
  explicit `session_unavailable` with no broker call, malformed data is
  `invalid_payload`, and preload structurally validates, sanitizes, copies,
  and freezes the exact DTO. The old direct secret-only path is absent.
- Fresh C2 evidence was 6 test files/45 tests passing, Node/web typechecks
  exiting `0`, and `git diff --check` exiting `0` with line-ending warnings;
  the prior exact negative scan exited `1` with empty output as expected. No
  full suite, build, demo, or target-Mac/provider field verification belongs
  to this unit.
- C1/C2 surveys found no concrete defect in `mm-phase-workflow`,
  `mm-invariants`, `mm-electron-foundation`, or `mm-realtime-voice`; no skill
  edit is needed.
- P1-U7C3 is accepted below. P1-U8 owns deterministic/real demos, Phase Test
  records, the full regression/privacy scan, final exit acceptance, and the
  local `phase1-v0.3.1` tag. No Phase 1 exit is claimed.

### P1-U7C3 accepted renderer runtime owner and generation-safe Realtime session rollover (2026-08-22)

- The renderer runtime owner for session, transport, microphone, audio, and
  cleanup, including generation-safe Realtime session rollover, is externally
  accepted at `24bccfd`. Evidence was `47/47` test files and `478/478` tests
  passing; `npm run typecheck:node`,
  `npm run typecheck:web`, and `npm run build` each exited `0`. One stale
  Mirror interrupt expectation was corrected.
- An earlier Electron launch failure cleared without intervention and did not
  reproduce in the 3-file/29-test focused rerun or the full gate. Local
  `electron.cmd` and the direct binary were `v43.4.1`; no install/reinstall or
  human action was required. The existing `DEP0190` child-process shell
  warning remains.
- P1-U7 remains in progress. The next bounded unit is P1-U7D App/Console
  interrupt composition, followed by the remaining lifecycle, recovery, and
  timer work; then P1-U8 demos/records/exit. This does not mark real Realtime,
  microphone, or target-Mac evidence complete, and is not Phase 1 exit
  evidence.

### P1-U7D/U7E1/U7E2 accepted; P1-U7F externally reviewed boundary (2026-08-23)

- P1-U7D App interrupt composition is accepted at `4b2b6fa`; P1-U7E1
  metadata-only Mirror-to-Main runtime outcomes are accepted at `4636b17`; and
  P1-U7E2 browser runtime dependencies are accepted and pushed at `f4e5103`.
  U7E2 evidence is `48/48` files and `500/500` tests; Node/web typechecks and
  the Electron Vite build each exited `0`; known `npm --run` and `DEP0190`
  warnings remain. No human intervention was required and no skill correction
  was found.
- P1-U7F is the next and only planned Phase 1 boundary. It owns a tagged
  Main-to-Mirror runtime command boundary plus exactly one browser runtime
  host/cleanup/outcome composition for manual start/stop/interrupt and
  60-minute rollover. `sessionGeneration` 0 is Main's no-active-session
  sentinel, start bundles require an active identity, renderer session
  generations are positive, and `realtimeSessionId` remains stale-event
  authority.
- The accepted Phase 1 plan lines `960–962` retain 300-second idle/wake/sleep
  as Phase 2 because it is a non-goal. U7F has no implementation or Phase 1
  exit claim; P1-U8 owns the demos, Phase Test records, regression/privacy
  scan, final exit acceptance, and `phase1-v0.3.1` tag.

### Human-intervention timing ledger

- **P1-U7A:** none needed; mocks are sufficient for its bounded Console IPC
  boundary and metadata-only status/reason path.
- **P1-U7B1/B2 transport:** none needed; bounded mock/test evidence is
  sufficient for the payload-free Main-to-Mirror dispatch boundary.
- **P1-U7C1/C2:** none needed for C1/C2 engineering and mock/static
  acceptance.
- **P1-U7D/U7E1/U7E2 + P1-U7F survey:** none now; the first broad U7F survey
  timed out, and the narrowed retry completed without human action. No skill
  correction was needed.
- **P1-U7C3 Electron launch — cleared; no action required:** an earlier launch
  failure cleared without intervention and did not reproduce in the
  3-file/29-test focused rerun or full gate; local `electron.cmd` and direct
  binary were `v43.4.1`; no install/reinstall or human action was required.
  Existing `DEP0190` child-process shell warning remains.
- **Phase 1 exit:** real OpenAI credential/account/network, PoC mic/output,
  temporary Persona, a Voice choice, and operator observation of P1-D1/D2/D5
  are still required.
- **Later target-Mac evidence:** Keychain `safeStorage`, TCC mic/camera,
  signing/entitlements, packaged workers, LaunchAgent restart, power policy,
  and real-device/provider behavior.
- **Later venue/product inputs:** wake corpus/keyword, avatar assets, scene
  spells/presets, camera/identity, memory/profile, and hardware/adapter inputs.
  Mocks support progress where accurate but cannot replace real Phase 1 exit
  evidence.

### Config, model, and credential boundaries

- Serialized config uses a separate numeric `schemaVersion`; `configVersion`
  is the published revision, not a schema discriminator. Known legacy or
  missing schema markers migrate atomically while preserving operator values;
  unsupported/future schemas fail visibly to Maintenance. Active → Previous →
  packaged Default is reserved for corrupt, missing, or unreadable data.
- Runtime model IDs are config-only. A configured model failure never silently
  substitutes another ID; one bounded retry of the same configured ID is not
  a fallback. Exhausted configured options route to OfflineLoop visibly.
- API credentials are read by Main through Electron `safeStorage` and never
  enter renderer data, logs, telemetry, exports, or config. Renderer access
  is limited to short-lived Realtime credentials. `.env` is provisioning input,
  not a runtime or renderer-visible credential source.

### Telemetry and SQLite

- Telemetry is metadata-only and non-blocking: Main RAM ring max `2,000`,
  rotating JSONL max `5 MB` per file with `5` retained files, and writer
  queue max `1,000`; oldest overflow increments `telemetryDroppedCount`.
  Persisted fields are limited to time, module, event, status, optional
  duration, error code, session/scene IDs, reason, and source.
- Telemetry and SQLite failures remain visible through bounded metadata and
  never gate wake, Voice, Avatar, scenes, config, credentials, or lifecycle.
  No transcripts, audio, prompts/private context, memory values, images/frames,
  embeddings, keys, secrets, raw errors, or arbitrary user content enter
  telemetry or logs.
- The accepted SQLite baseline is Main-only `openSqlite`; the only foundation
  table is `app_migrations(version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)`
  with migration `1` named `foundation_baseline`. Foreign keys, WAL, integrity
  check, transactional migration, defensive health, and idempotent close are
  required.
- The verified module-level backup contract is
  `import { backup } from 'node:sqlite'; await backup(sourceDb, backupPath, options)`;
  there is no `db.backup` instance method. SQLite metadata uses the accepted
  `eventDelivery=emitted|failed` values.

### Module registry and deterministic mocks

- Task 6 selected a runtime-exhaustive Main registry with injected
  closed-outcome adapters and separate deterministic mocks. Results/events are
  stable and metadata-only; missing adapters are informational; there is no
  retry or sibling-module gate, and no boot, IPC, UI, or model-resolver work
  belongs in this boundary.

### Electron, IPC, OfflineLoop, and restart

- Main owns lifecycle and recovery. Cloud failure maps to OfflineLoop; local
  core failure maps to Maintenance. A black screen is never an acceptable
  degrade path, and unrelated adapters do not gate conversation.
- In-app recovery may recreate a failed renderer once. When that budget is
  spent, the app exits with code `1`; the target Mac LaunchAgent with
  `KeepAlive={SuccessfulExit=false}` is the sole restart owner. Never call
  `app.relaunch()` and never add a second restart owner.
- Task 10 final smoke requires both windows loaded and lifecycle exactly
  `dormant` or `maintenance`; Console Overview, Events, and Phase Tests are
  queried while OfflineLoop and Maintenance are active.

### Runtime versions and packaging

- Accepted Task 10 facts are Electron `43.4.1` and electron-builder
  `26.15.3`. The OfflineLoop video is in renderer public/output and
  `asarUnpack`, not `extraResources`; config Default remains in
  `extraResources`. The text base64 generator exists only because worker
  writes use `apply_patch`. Activation failure is injected after
  `WAKE_DETECTED` and before `REALTIME_READY`.
- Development Node is `v24.19.0` and satisfies `>=22.22.2` or `>=24.15.0`;
  Electron's own Node `24.17` is a separate runtime fact. Dependency
  materialization recorded `398` installed, `399` audited, and zero
  vulnerabilities. Preserve the unrelated recorded Node `DEP0190` warning.

### Wake word and target-Mac checkpoints

- The wake phrase remains customizable and is a Phase 2 requirement. Editable
  phrase/config/raw keyword input must generate a versioned detector artifact
  with metadata, visible safe fallback, and later tuning evidence.
- Windows development evidence does not field-verify target-Mac Keychain/TCC,
  microphone/camera capture, signing, entitlements, packaged workers,
  LaunchAgent, power policy, real devices, or provider/account behavior.
  Before Phase 2 exit on the real Mac, record signing, packaged TCC keys,
  Keychain `safeStorage`, clean-quit/restart, 30-minute OfflineLoop soak,
  ten boots, and power-policy evidence.

## Acceptance ledger

| Boundary | Accepted record | Evidence retained |
|---|---|---|
| Phase 0 release | local tag `phase0-v0.3.1` at `9237dc7` | P0-D1–D5, ten smoke cycles, 30-minute soak, Phase 0 accepted |
| Task 2 | `a7d74b14771de4f527762c30171ad2e68fc3d985` | 31 focused; merged 5 files / 51 tests; Node typecheck `0` |
| Task 3 | `0270686` plus `835c92d` | 7 files / 92 tests; Node/web typecheck and Electron Vite build `0` |
| Task 4 | `dca1327` | focused `21/21`; full `8 files / 113 tests`; typecheck/build `0` |
| Task 5 | `a8f0355` | focused `32/32`; full `145/145`; typecheck/build `0` |
| Task 6 | plan gate `83be86b`; implementation `5b95a94` | focused `16/16`; full `161/161`; typecheck/build green |
| Task 7 | plan `6214b6c`; implementation `5e24bdc` | focused `7/7`; full `168/168`; typecheck/build and negative scans green |
| Tasks 8–9 | accepted inputs | accepted Task 10 completed Phase 0 demos/records/exit |
| Task 10 | accepted | 10B `13/13`; 10C `8/8`; full `311`; typecheck/build, P0-D1–D5, ten smoke cycles, soak passed |
| P1-U1–U5 | `4862383`, `5be5871`, `18461e5`, `cffd484`, `fb5e58f` | accepted |
| P1-U6 | accepted; no self-referential hash | focused `32/32`; Node/web typecheck exit `0` |
| P1-U7A | externally accepted 2026-08-22; integration commit represented by repository history | 9 changed source/test paths; focused `31/31`; Node/web typechecks `0`; `git diff --check` `0` with line-ending warnings; no full suite/build/demo |
| P1-U7B1/B2 | externally accepted 2026-08-22; no invented hash recorded | 8 changed source/test paths; focused `45/45`; Node/web typechecks `0`; `git diff --check` `0` with line-ending warnings; no full suite/build/demo |
| P1-U7C1 | externally accepted 2026-08-22; committed and pushed at `cc8c34f` | 3 test files / 9 tests; Node typecheck green; Windows-only platform limitation remains |
| P1-U7C2 | externally accepted 2026-08-22 on the current uncommitted integration diff; no future commit hash recorded | 6 test files / 45 tests; Node/web typechecks exit `0`; `git diff --check` exit `0` with line-ending warnings; prior exact negative scan exit `1` with empty output; no full suite/build/demo or target-Mac/provider field verification |
| P1-U7C3 | externally accepted 2026-08-22 at `24bccfd` | 47/47 test files and 478/478 tests; Node/web typechecks and build exit `0`; stale Mirror interrupt expectation corrected; Electron launch cleared with no action; `DEP0190` remains |
| Harness H9 | `5818830` | frozen suite `15/15`; real profile-backed probe passed |

## Consolidated privacy, environment, and file-scope rules

- Canonical invariants `1–12` remain authoritative and unchanged. In
  particular, transcripts/audio/memory values/private context remain RAM-only;
  face recognition only proposes a candidate; profile and guest identifiers
  stay Main-only; control turns skip memory extraction; spells require
  normalized exact full-transcript matching; one mic owner is enforced; every
  ignore/drop/fallback/degrade has visitor-visible or metadata-only reason;
  failures degrade without gating; model IDs remain config-only without silent
  fallback; and credentials remain Main-owned through `safeStorage`.
- `.env` metadata is only exists `true`, ignored by `.gitignore` line `9`,
  Git tracked `false` (untracked), content/value accessed `false`, and validity
  checked `false`. No value was read, recorded, or inspected. The user-owned
  `scripts/install-node-lts.ps1` and
  `docs/Magic_Mirror_Phase0_Adversarial_Review_2026-08-19.md` have content that
  remains unchanged; the user's explicit 2026-08-22 instruction authorizes
  tracking both in the integration commit.
- Windows results are development evidence only and never target-Mac field
  verification. No credential, private content, transcript, audio, image,
  embedding, or prompt value belongs in records or diagnostics.

## Superseded-history index

- Historical application records that described Phase 0 as in progress or
  Tasks 8–10 as next/unimplemented are superseded by the accepted Phase 0
  ledger and must not be read as current status.
- Codex harness-migration Task labels and commits are process history, not
  application Tasks 1–10. H9 `5818830` is the current harness checkpoint.
- R1 is completed historical in-place integration; R2 preserves the
  authoritative `handleSimulator` return shape; R5 keeps Tasks 3–5
  sequential. R3 and R4 are superseded by the current Codex policy.
