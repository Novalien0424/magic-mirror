# Phase 0 Adversarial Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the accepted 2026-08-19 Phase 0 adversarial-review findings before Task 10 execution, while preserving accepted application behavior, task order, privacy boundaries, and the Phase 1 gate.

**Architecture:** Electron Main remains the owner of lifecycle, configuration, SQLite, credentials, power policy, and profile identifiers. Renderer windows receive metadata-only projections. The five fixes are sequential because the corrected Task 10 evidence consumes their contracts. Phase 1 is documented as an entry contract only; it is not implemented here.

**Tech Stack:** Electron 43.4.1 for the corrected Task 10 package pin; `node:sqlite` with WAL; TypeScript/Vitest; `powerSaveBlocker`; existing XState lifecycle, ConfigService, telemetry, and Console data plane. `electron-builder` remains exactly 26.15.3; NSIS is outside Task 10.

**Spec:** The 2026-08-19 adversarial review is the accepted finding set. Product authority remains `docs/Magic_Mirror_PRD_v0.3.md`, `docs/Magic_Mirror_Tech_Spec_v0.3.md`, `docs/Magic_Mirror_Implementation_Plan_v0.3.md`, and the 2026-08-16 stack review. The v0.3.1 review premise in v0.3-named files is valid.

## Global Constraints

- This plan starts from HEAD `255008e`. Tasks 1–9 remain accepted; Task 10 is planned but not implemented; Phase 1 remains blocked. Do not reorder, reopen, or rename application tasks.
- Execute units A, B, C, D, and E in order. Corrected Task 10 resumes only after E passes. Phase 1 begins only after corrected Task 10 PASS, external root acceptance, and the local Phase 0 tag.
- Every later worker handoff repeats: `model: "gpt-5.6-luna"`, `reasoning_effort: "max"`, exactly one `role` of `implementer`/`surveyor`/`tester`, `fresh_worker: true`, one bounded task, exact named write scope, relevant skill paths, canonical invariant IDs, metadata-only evidence, self-review of at most three passes, and external root review after return.
- Workers use `apply_patch` for every write and never commit, push, tag, delegate, spawn, install, or widen scope. Root owns commit checkpoints, external review, and the final tag. Testers own all named commands and return complete stdout/stderr and exit codes, including failures.
- There is no PR/merge bureaucracy and no separate review worker; the interactive root performs the external review gate after each bounded worker result.
- Behavior units use strict TDD: the implementer writes one focused failing test; a fresh tester observes the expected RED exit; an implementer makes the smallest production or validation-harness change; a fresh tester observes GREEN. Coupled assertions may share that one cycle. Refactoring is allowed only after GREEN. Unit A is documentation-only and uses a static tester.
- Plans and handoffs state interfaces and behavior contracts, not full test or implementation bodies. All decisions are resolved by the accepted review judgment. Preserve accepted `eventDelivery`, SQLite baseline exactness, Main-only IDs, safeStorage credential handling, no-silent-model-fallback rule, and the single LaunchAgent restart owner.
- All evidence is metadata-only: IDs, enums, counts, timings, statuses, reasons, hashes, paths, and exit codes. Never record transcripts, audio, extracted memory, private context, prompts containing user content, images, embeddings, credentials, `.env` values, database content, or raw error payloads.
- Preserve all canonical invariants 1–12. In particular, control turns remain extraction-free; spell matching remains normalized exact full-transcript matching with one trigger; microphone handoff remains explicit release-then-acquire; every fallback/degrade is visible or a metadata-only Console event; configured model IDs come only from versioned config; and credentials remain Main/safeStorage-only.
- Keep Windows development versus target macOS explicit. Windows execution cannot verify macOS Keychain, TCC, signing, entitlements, packaged-worker, LaunchAgent, or field power behavior. Never add `app.relaunch()` or a second restart owner.
- Do not edit the adversarial review, the immutable 2026-08-16 stack review, any source skill, `scripts/install-node-lts.ps1`, product runtime model configuration, or unrelated user changes. Do not read `.env`.

## Execution Order and Required Worker Evidence

The order is `A documentation corrections → B terminal smoke → C config schema → D display-sleep blocker → E Electron SQLite runtime smoke → corrected Task 10`. Each unit below is one 8-field work unit: Story/Phase, User-visible outcome, Files/modules expected, Console control/telemetry, Happy-path test, Failure/fallback test, Explicit non-goals, and Demo step affected.

- [ ] Complete Unit A and receive external root acceptance.
- [ ] Complete Unit B and receive external root acceptance.
- [ ] Complete Unit C and receive external root acceptance.
- [ ] Complete Unit D and receive external root acceptance.
- [ ] Complete Unit E and receive external root acceptance.
- [ ] Resume corrected Task 10, obtain tester PASS and external root acceptance, then allow the root-only local tag.
- [ ] Keep Phase 1 blocked until the preceding Task 10 gate and tag exist.

For every behavior unit, the RED and GREEN tester commands are exact and tester-owned. A returned evidence packet names each changed file, gives a concise diff summary, includes complete command output and exit codes, lists checked invariant IDs and risks, and confirms no private values were emitted. A root review follows each packet before the next unit. No separate review worker exists.

The later execution plan must write only these documentation targets when its unit requires them: `docs/superpowers/plans/2026-08-19-phase0-task10-demos-exit.md`, `docs/superpowers/plans/2026-08-16-phase0-foundation.md`, `docs/Magic_Mirror_Implementation_Plan_v0.3.md`, `PROGRESS.md`, and `DECISIONS.md`. The adversarial review and immutable stack review are never edited.

---

## Unit A — Accepted Decisions, Task 10 Corrections, and Progress State

**Story / Phase:** As the Phase 0 owner, I need one authoritative record of accepted review fixes so Task 10 executes against current contracts and Phase 1 cannot open on stale evidence. This is a documentation-only pre-Task 10 unit.

**User-visible outcome:** The Console/demo operator and future implementers see accurate task status, terminal smoke requirements, failure visibility, Windows/macOS limits, and Phase 1 entry conditions. No runtime behavior changes in this unit.

**Files/modules expected:** Modify exactly `DECISIONS.md`, `PROGRESS.md`, `docs/superpowers/plans/2026-08-19-phase0-task10-demos-exit.md`, `docs/superpowers/plans/2026-08-16-phase0-foundation.md`, and `docs/Magic_Mirror_Implementation_Plan_v0.3.md`. Do not modify any other path.

**Console control/telemetry:** Add no control. Record only metadata contracts: config schema migration/recovery reasons, display-sleep blocker status, SQLite runtime phase-test status, stable smoke reasons, and corrected Task 10 evidence labels. Do not record contents or credentials.

**Happy-path test:** A static tester verifies the five-document diff is whitespace-clean and that the accepted pins, task statuses, terminal states, runtime contracts, and phase gates are present without changing immutable review sources.

**Failure/fallback test:** Static review rejects any stale “Task 8 next”/“lifecycle left starting” claim, any unsupported-schema-to-Default rule, any second video placement, any `app.relaunch`, any Mac field claim from Windows evidence, or any Phase 1 implementation claim. No application test is added for documentation ceremony.

**Explicit non-goals:** No application code, tests, package files, resources, records, skills, demo execution, `.env` access, Mac verification, worker commit, push, or tag. Plan banners are documentation cleanup and are not an exit blocker by themselves.

**Demo step affected:** Correct Task 10’s final smoke and demo script before it runs; no demo runs in Unit A.

**Exact decisions to record:**

- In `DECISIONS.md`, record separate serialized `schemaVersion` handling; known legacy materialization; fail-closed unsupported/future schema; Active → Previous → packaged Default only for corrupt/missing/unreadable slots; preserved operator values; and metadata-only migration/recovery events. `configVersion` remains a revision-like published config field, never a schema discriminator.
- Note that `config_recovered` already exists, so the finding is an incorrect fallback replacement rather than a literal absence of visibility; preserve that event and add the schema-specific metadata reasons.
- Record `powerSaveBlocker.start('prevent-display-sleep')` as a pre-Phase 1 foundation fix, with failure visible and non-gating. Field `pmset`/screensaver work belongs to the macOS checkpoint/Phase 7 operations.
- In `DECISIONS.md` and `docs/Magic_Mirror_Implementation_Plan_v0.3.md`, record the module-level Node contract `import { backup } from 'node:sqlite'; await backup(db, backupPath, options)` with `backup(db, path, options): Promise`; do not edit the historical review’s wording.
- Record Phase 5’s future owner display as authorized public `call_name` in Console only, never UUID/profile/guest/candidate IDs. Record authorized Main/Console Persona-instruction editing and the one-time operator-triggered `.env` import into Main safeStorage; `.env` is never a runtime source and its values are never read or logged in worker evidence.
- Correct Task 10 to exact Electron `43.4.1`, exact `electron-builder` `26.15.3`, NSIS out of scope, one video placement (renderer `publicDir` plus `asarUnpack`, no video `extraResources`), config `extraResources` retained, and the apply-patch-only reason for retaining the text base64 generator.
- Correct Task 10’s activation failure to occur after `WAKE_DETECTED` and before `REALTIME_READY`; query Console while OfflineLoop and Maintenance are active; and require final smoke lifecycle `{dormant, maintenance}` with both windows loaded. Windows evidence never verifies macOS.
- Record Phase 1 contracts without implementing them: `@openai/agents` and `@openai/agents-realtime` exact `0.16.1` lockstep; `ScriptedRealtimeTransport` from the official testing export; `openai` `^7.2.0` as a dependency floor rather than a peer; exact configured model IDs; `realtimeSessionId` as stale-event authority and `sessionGeneration` as diagnostic only.
- Correct `PROGRESS.md` now to Tasks 1–9 accepted, Task 10 planned at HEAD `255008e`, and Phase 1 blocked. State that `PROGRESS.md` is updated again only after final Task 10 PASS and external root acceptance; do not pre-claim PASS.
- Add prominent `SUPERSEDED` banners to stale sections of the two phase plans where they assert old interfaces, `phase-tests.json`, full inline implementation bodies, or “lifecycle left starting.” Keep historical context but point to the corrected contracts; do not rewrite the plans into another full implementation.

**Dispatch and gate:** The implementer’s exact write scope is the five paths above; skills are `mm-phase-workflow` and `mm-invariants`; self-invariants are 1–12. The fresh static tester has read-only scope and runs:

```powershell
git diff --check -- DECISIONS.md PROGRESS.md docs/superpowers/plans/2026-08-16-phase0-foundation.md docs/Magic_Mirror_Implementation_Plan_v0.3.md docs/superpowers/plans/2026-08-19-phase0-task10-demos-exit.md
```

Expected exit is `0` with no output. The tester also reports metadata-only presence/absence checks for the exact decisions above. Root reviews authority, ordering, immutable-file preservation, and scope. Root-only checkpoint after acceptance: commit message `docs: record phase0 adversarial review fixes`; no worker-generated commit or tag.

---

## Unit B — Terminal-State Smoke Contract

**Story / Phase:** As the boot smoke gate, I need both windows and a true terminal lifecycle state so an active or half-started application cannot be reported healthy.

**User-visible outcome:** Smoke succeeds only when Mirror and Console are loaded and lifecycle is exactly `dormant` or `maintenance`; every other lifecycle produces a stable reason visible in the metadata marker/Console result.

**Files/modules expected:** Modify exactly `src/main/smoke.ts` and `tests/unit/smoke-mode.test.ts`. Preserve `tests/unit/smoke-contract.test.ts` unless a tester proves a contract change is required; its `lifecycle_still_starting` assertion remains stable.

**Console control/telemetry:** Preserve the existing `SMOKE_RESULT` metadata shape and missing-window reasons. Use `lifecycle_still_starting` for `starting`; use stable `lifecycle_not_terminal` for `activating`, `active`, `suspending`, and `offlineLoop`. Do not add transcript, session, or model data.

**Happy-path test:** `evaluateSmoke` returns pass for both windows with `dormant` and for both windows with `maintenance`.

**Failure/fallback test:** `starting` retains its stable reason; each nonterminal active lifecycle fails with `lifecycle_not_terminal`; either missing window still fails with its existing stable reason. Failure is an exit/status result only and does not gate unrelated modules.

**Explicit non-goals:** No lifecycle-machine change, IPC change, renderer change, restart policy, model change, or Task 10 demo execution.

**Demo step affected:** Enables the corrected final smoke-state assertion used by Task 10.

**TDD dispatch:** The implementer first writes one focused test covering `maintenance` pass and a representative active/nonterminal failure in `tests/unit/smoke-mode.test.ts`; the fresh RED tester runs:

```powershell
npx vitest run tests/unit/smoke-mode.test.ts --reporter=verbose
```

Expected RED exit is `1` because the current implementation accepts a non-starting lifecycle such as `offlineLoop` and does not distinguish terminal states. The implementer then changes only `src/main/smoke.ts` to the exact contract above. A fresh GREEN tester runs the same command; expected exit is `0`. Both workers use `mm-phase-workflow`, `mm-invariants`, and `mm-electron-foundation`, check invariants 1–12, and return complete metadata-only evidence. Root reviews before the next checkpoint.

---

## Unit C — Versioned Config Schema Evolution

**Story / Phase:** As an operator with an existing config, I need known legacy data materialized without losing values and unsupported future data held for Maintenance rather than replaced by packaged Default.

**User-visible outcome:** Config loading preserves operator values, emits metadata-only migration/recovery events, and enters Maintenance for unsupported/future schema. Corrupt, missing, or unreadable Active still resolves to valid Previous and then packaged Default; an old or unsupported schema is never treated as corruption.

**Files/modules expected:** Modify exactly `src/main/config-service.ts`, `resources/config/default.json`, `tests/unit/config-service.test.ts`, and `tests/unit/boot-ipc.test.ts`. A source-usage survey records these read-only paths and confirms they need no changes: `src/shared/types.ts`, `src/main/boot.ts`, `src/main/console-config.ts`, `src/main/model-settings.ts`, `tests/unit/model-settings.test.ts`, and `tests/unit/console-config-models.test.ts`. The serialized envelope stays internal, so `MirrorConfig`, IPC snapshots, and model settings do not gain `schemaVersion`.

**Console control/telemetry:** Preserve `ConfigService` public methods and metadata-only event delivery. Add stable event/error codes `config_schema_migrated`, `config_schema_migration_failed`, and `config_schema_unsupported`; fields are slot, numeric from/to schema, action, and safe reason only. Boot’s existing caught-config-error path maps the unsupported code to Maintenance; no private config values enter snapshots or events.

**Happy-path test:** `CURRENT_CONFIG_SCHEMA_VERSION = 1`; serialized legacy absence/`0` follows the explicit known `0 → 1` migration and is atomically materialized as `{schemaVersion:1,...config}` while preserving every operator value. Current `1` reads and writes unchanged except for the envelope. Packaged Default is serialized with `schemaVersion:1`. `configVersion` remains the published revision.

**Failure/fallback test:** Any unsupported/future schema in Active, Previous, or Draft raises `ConfigServiceError.code === 'config_schema_unsupported'`, emits metadata, and does not fall back to Default. A migration write failure raises `config_schema_migration_failed` and fails closed. Only corrupt/missing/unreadable Active may fall back to valid Previous and then valid packaged Default; ordinary invalid/missing Draft retains its existing Active fallback. The boot IPC test proves unsupported schema reaches Maintenance.

**Explicit non-goals:** No change to runtime `MirrorConfig` shape, `configVersion` semantics, SQLite, boot lifecycle code, Console model APIs, model IDs, credentials, or accepted recovery/eventDelivery behavior. Do not make an unsupported operator config silently disappear.

**Demo step affected:** Task 10’s configuration/recovery evidence must show migration, unsupported-to-Maintenance, and corrupt/missing fallback as metadata-only outcomes.

**TDD dispatch:** Before production edits, the implementer writes focused config-service tests with separate legacy/current/future encoders and a focused boot IPC unsupported-schema assertion. The fresh RED tester runs:

```powershell
npx vitest run tests/unit/config-service.test.ts tests/unit/boot-ipc.test.ts --reporter=verbose
```

Expected RED exit is `1`. The implementer then makes the smallest changes in the four named write paths: parse the internal envelope before strict core validation; apply only the known migration table; materialize atomically; reject unsupported versions before fallback; and update raw persisted-fixture expectations. A fresh GREEN tester runs the same command; expected exit is `0`. Workers use `mm-phase-workflow`, `mm-invariants`, `mm-electron-foundation`, and `mm-realtime-voice` only for the documented model/config boundary; self-invariants are 1–12. Root checks the actual usage survey, exact paths, privacy, and fallback ordering before acceptance.

---

## Unit D — Main-Owned Display-Sleep Blocker

**Story / Phase:** As the mirror operator, I need the running Electron app to prevent display sleep, including in Maintenance, without turning a power API failure into a conversation or restart failure.

**User-visible outcome:** Main starts one `prevent-display-sleep` blocker after app readiness, retains and checks its ID, reports active/degraded/stopped metadata, and stops it on clean quit. A start/status/stop error is visible and non-gating.

**Files/modules expected:** Create exactly `src/main/display-sleep-blocker.ts` and `tests/unit/display-sleep-blocker.test.ts`; modify exactly `src/main/index.ts`. No other source or test path changes.

**Console control/telemetry:** The module-level TypeScript contract is:

```text
type DisplaySleepBlockerStatus = 'not_started' | 'active' | 'degraded' | 'stopped'
type DisplaySleepBlockerEvent = {
  action: 'start' | 'status' | 'stop'
  status: DisplaySleepBlockerStatus
  reason?: string
}
interface PowerSaveBlockerPort {
  start(type: 'prevent-display-sleep'): number
  isStarted(id: number): boolean
  stop(id: number): void
}
interface DisplaySleepBlocker {
  start(): DisplaySleepBlockerStatus
  status(): DisplaySleepBlockerStatus
  stop(): DisplaySleepBlockerStatus
}
function createDisplaySleepBlocker(
  api: PowerSaveBlockerPort,
  emit: (event: DisplaySleepBlockerEvent) => void,
): DisplaySleepBlocker
```

`DisplaySleepBlockerEvent` contains only `action: 'start' | 'status' | 'stop'`, the status, and an optional safe failure reason. Keep the retained ID private to Main. Start once after `app.whenReady`/boot readiness, independently of lifecycle, so Maintenance remains protected; stop once from `will-quit`. Never add a restart owner or gate boot, Console, or unrelated adapters.

**Happy-path test:** An injected deterministic API returns an ID, `isStarted(id) === true`, and a successful stop. The module reports `active`, then `stopped`, and emits start/stop metadata.

**Failure/fallback test:** Start exception, inactive status, status exception, and stop exception each report `degraded` or `stopped` with a stable safe reason and do not throw into boot/quit. Repeated start does not create a second blocker; repeated stop does not call the API twice.

**Explicit non-goals:** No `pmset`/screensaver command, macOS field assertion, renderer control, lifecycle transition, LaunchAgent change, `app.relaunch`, or power-policy persistence.

**Demo step affected:** Task 10 records blocker start/status/stop metadata during normal and Maintenance startup; it does not claim macOS field verification.

**TDD dispatch:** The implementer first writes one focused injected-API test in `tests/unit/display-sleep-blocker.test.ts`; a fresh RED tester runs:

```powershell
npx vitest run tests/unit/display-sleep-blocker.test.ts --reporter=verbose
```

Expected RED exit is `1` because the module is absent. The implementer then creates the module and wires Electron’s `powerSaveBlocker` in `src/main/index.ts`; a fresh GREEN tester runs the same command and expects exit `0`. Workers use `mm-phase-workflow`, `mm-invariants`, and `mm-electron-foundation`, check invariants 1–12, and return complete metadata-only evidence. Root reviews retained-ID ownership, Maintenance behavior, clean-quit handling, and absence of a second restart owner.

---

## Unit E — Electron-Runtime SQLite Open/WAL/Close/Reopen Smoke

**Story / Phase:** As the Phase 0 verifier, I need evidence from Electron’s bundled `node:sqlite`, not only system-Node Vitest, that Main can open, WAL-enable, close, reopen, and close the database.

**User-visible outcome:** One deterministic Electron runtime smoke produces a metadata-only pass marker for open/WAL/close/reopen/close-again. It proves runtime fidelity without changing the accepted SQLite schema baseline or exposing rows, paths, or private data.

**Files/modules expected:** Create exactly `tests/integration/sqlite-electron-runtime.test.ts` and `scripts/sqlite-electron-runtime-smoke.mjs`. Do not modify `src/main/sqlite-service.ts` or `tests/unit/sqlite-service.test.ts`; their accepted baseline and system-Node coverage remain intact.

**Console control/telemetry:** The harness prints only `SQLITE_RUNTIME_RESULT status=passed;open=ready;wal=wal;close=closed;reopen=ready;row=present;close_again=closed` or a stable metadata-only failure reason and exit code. The temporary database is cleaned up. Database access remains Main-process-only; no renderer or IPC boundary is introduced.

**Happy-path test:** The Electron entrypoint waits for readiness, uses the local Electron runtime’s `node:sqlite` `DatabaseSync`, opens a temporary database, confirms WAL mode, writes one metadata sentinel, closes, reopens, confirms presence, closes again, and exits `0`.

**Failure/fallback test:** Missing runtime, open/WAL/close/reopen failure, or cleanup failure exits nonzero with a stable stage reason and no raw path/error/row content. The smoke does not change application lifecycle or gate unrelated adapters.

**Explicit non-goals:** No SQLite schema migration, backup implementation, application DB replacement, renderer access, persistent evidence DB, system-Node substitution, or Task 10 demo run. The historical backup wording is corrected in Unit A only; the exact module-level contract is `backup(db, path, options): Promise`.

**Demo step affected:** Task 10’s SQLite phase-test and final evidence matrix run this Electron-runtime smoke once in addition to existing focused unit coverage.

**TDD dispatch:** The implementer first writes the focused Vitest spawn/marker test in `tests/integration/sqlite-electron-runtime.test.ts`; a fresh RED tester runs:

```powershell
npx vitest run tests/integration/sqlite-electron-runtime.test.ts --reporter=verbose
```

Expected RED exit is `1` because the harness entrypoint is absent. The implementer then adds only the Electron validation entrypoint in `scripts/sqlite-electron-runtime-smoke.mjs`; a fresh GREEN tester runs the same command and expects exit `0`. The test must resolve the repository’s installed Electron executable and must not invoke system Node for the SQLite operations. Workers use `mm-phase-workflow`, `mm-invariants`, and `mm-electron-foundation`, check invariants 1–12, and return complete metadata-only evidence. Root verifies that this complements rather than duplicates the accepted system-Node baseline.

---

## Corrected Task 10 Handoff

After Units A–E are root-accepted, Task 10 resumes from the corrected `docs/superpowers/plans/2026-08-19-phase0-task10-demos-exit.md`. Its existing bounded Task 10 units remain the execution source; Unit A records these mandatory corrections:

- Pin Electron exactly `43.4.1` in package metadata/lockfile. Keep `electron-builder` exactly `26.15.3`; document that issue #9983 is NSIS-only and NSIS is outside Task 10. Do not upgrade either package during evidence collection.
- Keep one video placement: renderer `publicDir` plus `asarUnpack`; remove video `extraResources`. Retain only config `extraResources`. Retain the text base64 generator solely because implementers must use `apply_patch`, and document that constraint.
- Add the activation-time cloud failure between `WAKE_DETECTED` and `REALTIME_READY` in the deterministic demo seam. Do not weaken the public simulator contract if the scenario can be driven internally.
- Query the Console overview/events/phase-test data while OfflineLoop and Maintenance are active. Final smoke passes only with both windows loaded and lifecycle exactly `dormant` or `maintenance`; every other lifecycle has a stable failure reason.
- Include the Unit E Electron-runtime SQLite marker in the phase-test/final evidence set. Preserve metadata-only telemetry and the exact accepted SQLite baseline.
- Keep all final evidence Windows-labeled. Record the macOS checkpoint as a future target before Phase 2 exit: packaged TCC keys, stable signing identity, microphone/camera capture, Keychain safeStorage, LaunchAgent restart/clean quit, 30-minute OfflineLoop soak, and ten boots. It is not Windows-verifiable and not a Phase 0 gate.

Task 10’s tester owns, at minimum, these exact validation commands and expected exits: focused Vitest and the new Electron-runtime smoke `0`; full `npx vitest run --reporter=verbose` `0`; `npm run typecheck:node` `0`; `npm run typecheck:web` `0`; `npm run build` `0`; ten smoke boots each `0` with the terminal-state marker; deterministic demos `0`; the prescribed 1,800,000 ms OfflineLoop soak `0`; package `--dir --win --x64` `0`; and `git diff --check` `0`. Negative scans for runtime model literals/fallbacks, private identifiers/content, credentials, and `app.relaunch` must exit `1` with no matching output. No scan reads `.env`.

The exact negative scans are:

```powershell
rg -n --glob '*.ts' --glob '*.tsx' --glob '*.mjs' -e 'gpt-[0-9]' -e '\bo[0-9]([.-][A-Za-z0-9]+)*\b' -e 'fallback.{0,24}model' -e 'auto[-_ ]?latest' -e 'modelFallback' src scripts
rg -n --glob '*.ts' --glob '*.tsx' --glob '*.mjs' 'app\.relaunch' src scripts
rg -n --glob '*.ts' --glob '*.tsx' --glob '*.mjs' -e 'console\.(log|warn|error)\([^)]*(transcript|audio|memoryValue|privateContext|credential|apiKey|embedding|prompt)' -e 'write(File|FileSync|JSONL)\([^)]*(transcript|audio|memoryValue|privateContext|credential|apiKey|embedding|prompt)' -e 'process\.env\.(OPENAI|API_KEY|MIRROR_API_KEY)' src scripts
```

Each command must exit `1` and emit no output. The tester does not read `.env`; any match or any other exit is a gate failure. The corrected Task 10 plan’s exact `1..10` PowerShell smoke loop sets the four required smoke environment variables and invokes `npm run smoke`; each iteration must exit `0` and report a loaded-both-windows terminal state.

Task 10’s evidence packet names changed files and hashes, includes complete stdout/stderr and exit codes, records only metadata, and states the Windows/macOS limitation. Root performs the external review and may create the local Phase 0 tag only after all gates pass. A failed Task 10 gate stops Phase 1 entry and keeps `PROGRESS.md` from claiming completion.

## Phase 1 Entry Contract — Recorded, Not Implemented Here

Phase 1 cannot start within this plan. It begins only after corrected Task 10 PASS, external root acceptance, and the local tag. The entry record must preserve:

- Exact lockstep `@openai/agents` `0.16.1` and `@openai/agents-realtime` `0.16.1`; `ScriptedRealtimeTransport` from the official testing export; `openai` `^7.2.0` as a dependency floor, not a peer.
- Exact configured model IDs from versioned config, with no worker model or silent substitution entering runtime configuration.
- `realtimeSessionId` as authoritative stale-event rejection; `sessionGeneration` is diagnostic only. Audio/transcripts/private context remain RAM-only, and microphone ownership uses release-then-acquire handoff.
- Authorized Main/Console Persona instruction editing only. The one-time operator-triggered `.env` import is read by Main into safeStorage; `.env` is not a runtime source, and no value is read or logged in worker evidence.
- Future Phase 5 owner display is the authorized public `call_name` in Console only; never expose UUID/profile/guest/candidate IDs.

No Phase 1 package, realtime, credential, Persona, memory, or renderer feature is implemented by Units A–E or by this plan.

## Compact Acceptance Matrix

| Gate | Owner and evidence | Required result | Stop condition |
|---|---|---|---|
| A | Fresh static tester; five named docs | `git diff --check` exit `0`; accepted decisions and status are present | stale order, mutable review edit, or unsupported fallback claim |
| B | Fresh RED/GREEN testers; smoke mode test | RED `1`, GREEN `0`; only `dormant`/`maintenance` pass | active lifecycle passes or stable reason changes unexpectedly |
| C | Fresh RED/GREEN testers; config and boot IPC tests | RED `1`, GREEN `0`; future schema reaches Maintenance | unsupported schema reaches Default or values/events leak |
| D | Fresh RED/GREEN testers; blocker test | RED `1`, GREEN `0`; start/stop is metadata-only and non-gating | second owner, blocker exception gates boot, or `app.relaunch` appears |
| E | Fresh RED/GREEN testers; Electron runtime test | RED `1`, GREEN `0`; bundled `node:sqlite` marker passes | system Node substitutes Electron or DB content is emitted |
| Task 10 | Task 10 tester plus external root review | all corrected commands/evidence pass; local tag follows root acceptance | any missing demo/evidence, nonterminal smoke, or Windows/Mac overclaim |
| Phase 1 | Root gate only | blocked until corrected Task 10 PASS, root acceptance, and tag | any attempt to implement or enter Phase 1 early |

## Risks, Rollback, and Stop Rules

- Config risk: a legacy slot may contain a valid value with no schema marker. The explicit `0 → 1` migration preserves it; an unknown marker fails closed. If migration/materialization cannot be proven atomic, stop before Task 10.
- Electron risk: bundled `node:sqlite` behavior may differ from system Node. The dedicated runtime smoke is the authoritative Phase 0 check; do not “fix” it by replacing the Electron runtime with system Node.
- Power risk: `powerSaveBlocker` can fail or return an inactive ID. Report `degraded` metadata and continue; do not add retries, a restart owner, or a lifecycle gate. macOS field behavior remains unverified on Windows.
- Packaging risk: duplicate video resources or a package pin drift invalidates Task 10 evidence. Stop and correct the plan/package scope before packaging.
- Scope risk: any worker writes outside its exact paths, emits private values, changes accepted eventDelivery/SQLite/restart/task order, or exceeds three self-review passes. Stop the unit and return it to root; do not widen scope.
- Root rollback is checkpoint-based: root may revert the just-accepted unit’s own checkpoint after review, preserving unrelated user changes. No worker uses destructive reset/checkout, and no unit advances after a failed gate.

## Final Worker Self-Review Checklist

Before returning any unit, the worker reads its own diff/output and completes no more than three passes:

- [ ] Authority, task order, HEAD/status, and Phase 1 gate remain exact.
- [ ] Every path, interface, status/reason code, command, expected exit, and fallback is consistent with the source contracts.
- [ ] No unresolved text, broad/glob write scope, full test/implementation body, private value, credential, model literal, profile ID, or `.env` value is present.
- [ ] All applicable canonical invariants 1–12, Windows/macOS limits, single LaunchAgent owner, and no-`app.relaunch` rule are preserved.
- [ ] Evidence is metadata-only, tester-owned where required, and the unit remains within its named files.
- [ ] Plan and generated documentation remain at or below 650 lines where that limit applies; root review is external and has not been claimed.
