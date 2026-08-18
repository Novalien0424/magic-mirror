# DECISIONS.md — ADRs beyond Tech Spec §18

Newest first. Only durable decisions not derivable from the docs; the 11
architecture decisions in Tech Spec §18 are not repeated here.

## 2026-08-19 — Task 4 integration and Task 5 SQLite boundary

- **Task 4 integration.** Metadata-only telemetry is completed, root-reviewed,
  integrated, and pushed on `main` at `dca1327`. The supplied evidence is
  focused telemetry `21/21`, full `8 files / 113 tests`, Node plus web
  typecheck exit `0`, and Electron Vite build exit `0`.
- **Current route.** `phase0-sqlite` is the current branch from the pushed
  `main` state at `dca1327`. Application Task 5 is current, planned, and not
  started; Tasks 3–5 remain sequential; Phase 0 remains in progress; and
  Phase 1 remains blocked.
- **SQLite ownership.** Task 5 is limited to a Main-only
  `openSqlite({ dbPath, telemetry, driverFactory? })` boundary. The caller
  supplies the absolute persistent path. The service uses real
  `node:sqlite` `DatabaseSync` by default and exposes only the narrow injected
  driver factory required for deterministic foreign-key, WAL, migration,
  integrity, and close failure tests. No dependency or alternate database is
  introduced.
- **Baseline schema.** The only table Task 5 may create is the exact
  `app_migrations(version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL)`
  table. Internal migration `1` is named `foundation_baseline`. Guests,
  enrollment, embeddings, visits, recent/durable/Master memory, telemetry,
  logs, backup/restore, and all later schema are deferred; malformed/future
  states are rejected rather than downgraded or recreated.
- **SQLite guarantees.** `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode =
  WAL`, and `PRAGMA integrity_check` are required and verified. Empty, NUL,
  non-absolute, and `:memory:` paths fail with stable `sqlite_` codes. No
  hidden relocation, parent-directory creation, in-memory fallback, or
  alternate file is permitted. Migration uses `BEGIN IMMEDIATE`/`COMMIT` and
  best-effort `ROLLBACK`.
- **Health and close.** `SqliteHealth` is defensive metadata only. `close()`
  is idempotent; after a successful close health is `failed` with
  `sqlite_closed`, while a driver close failure is visible as
  `sqlite_close_failed` through both health and a metadata-only telemetry
  event.
- **Telemetry boundary.** The required sink is `Pick<Telemetry, 'emit'>`.
  SQLite events use module `sqlite`, source `runtime`, and stable names,
  statuses, error codes, and reasons. Sink exceptions never gate SQLite.
  Task 4 remains RAM/JSONL-only; no telemetry or log table is created, and no
  path, SQL, raw exception, user content, transcript, audio, private context,
  secret, or credential enters telemetry.
- **Downstream/demo boundary.** P0-D2 later maps DB failure to Maintenance,
  P0-D3 later consumes SQLite metadata events, P0-D4 later consumes
  reopen/idempotence evidence, and Task 10 owns demos and records. Task 5
  itself claims no demo and does not wire boot, lifecycle, IPC, or UI.
- **Environment/platform.** No user setup is required for this planning
  boundary. `.env` remains presence/ignore metadata only: present, ignored by
  `.gitignore` line 9, untracked, content/value not accessed, and validity not
  checked. The untracked `scripts/install-node-lts.ps1` remains untouched.
  Windows validation does not field-verify target macOS packaged
  `node:sqlite`, TCC, Keychain, signing, or entitlements.

## 2026-08-19 — Task 3 integration and Task 4 telemetry decision

- **Task 3 integration.** ConfigService + credentials is completed, reviewed,
  and integrated on pushed `main`: implementation commit `0270686` and
  correction/integration tip `835c92d`. Fresh merged-main verification
  supplied for this record is 7 test files / 92 tests passed, full Node plus
  web typecheck exit 0, and Electron Vite main/preload/renderer build exit 0.
- **Current route.** `phase0-telemetry` is the current branch, pushed from
  `main`. Application Task 4 is current and not started; Tasks 3–5 remain
  sequential; Phase 0 remains in progress and Phase 1 remains blocked.
- **Telemetry caps.** Task 4 uses a Main-owned RAM ring capped at 2,000
  events, a non-blocking rotating JSONL writer capped at 5 * 1024 * 1024
  bytes per file and 5 retained files, and a FIFO writer queue capped at
  1,000 items. Queue overflow drops the oldest item and increments
  `telemetryDroppedCount`. Console pagination is a later consumer; no
  external telemetry stack is introduced.
- **Persisted field boundary.** JSONL contains only
  `time,module,event,status,duration_ms?,error_code?,session_id?,scene_id?,reason?,source?`.
  Unknown fields are stripped before serialization; raw errors and arbitrary
  extra values are rejected or omitted. Transcripts, audio, prompts/private
  context/memory values, images/frames, embeddings, keys, Realtime secrets,
  and other user content never enter telemetry.
- **Failure visibility.** Queue, scheduler, writer, and rotation failures
  remain visible through bounded RAM metadata and counters. Internal
  drop/degraded records use a direct non-recursive RAM path and are never
  enqueued indefinitely. Writer or rotation failure cannot block wake, Voice,
  Avatar, scenes, config, credentials, or lifecycle.
- **Source and wake boundary.** Runtime, simulator, and contract_test sources
  remain distinct. Wake metadata uses the configurable keyword,
  configured_threshold, boost, and num_trailing_blanks representation; it
  never records per-event confidence and does not implement wake detection.
- **Task 5 boundary.** Task 5 remains next and sequential. It may consume the
  telemetry sink for metadata-only SQLite health events, but Task 4 telemetry
  remains RAM/JSONL and is not stored in SQLite.
- **Environment and platform risk.** The local `.env` boundary remains
  metadata-only: presence was recorded, content/value was not accessed or
  validated, and long-lived credentials remain Main plus safeStorage. The
  existing unrelated Node DEP0190 warning remains; Windows development does
  not field-verify macOS Keychain/TCC/signing/entitlements. The untracked
  `scripts/install-node-lts.ps1` remains untouched.

## 2026-08-18 — Task 2 integration and Task 3 preparation

- **Task 2 completion.** The Main-owned lifecycle state machine is completed,
  reviewed, and locally integrated at
  `a7d74b14771de4f527762c30171ad2e68fc3d985`; the merged-tree evidence is 31
  focused lifecycle tests, 5 files / 51 tests, and clean
  `npm run typecheck:node`. The old `phase0-lifecycle` branch was deleted.
- **Current application route.** `phase0-config` is the current local branch;
  Task 3 (ConfigService + credentials) is next and is prepared but not
  started. Tasks 3–5 remain sequential. Phase 0 remains in progress and
  Phase 1 remains blocked.
- **Integration metadata.** The verified GitHub origin is
  `https://github.com/Novalien0424/magic-mirror`; `main` is pushed/tracking
  `origin/main` at the integrated Task 2 commit. `phase0-config` has not been
  claimed as pushed.
- **Development prerequisite.** Node `v24.19.0` satisfies the required
  `>=22.22.2` or `>=24.15.0` range for `write-file-atomic@8` and Task 3. The
  untracked `scripts/install-node-lts.ps1` remains untouched.
- **Task 3 scope.** The implementation plan is limited to new
  `src/main/config-service.ts`, `src/main/credential-store.ts`,
  `resources/config/default.json`,
  `tests/unit/config-service.test.ts`, and
  `tests/unit/credential-store.test.ts`. Existing shared types, Main wiring,
  bridge/preloads/renderers, package files, and all other paths remain
  read-only.
- **Config boundary.** ConfigService receives its config directory and
  versioned default path from its caller, validates the existing shared
  `MirrorConfig` core, seeds first boot, persists Draft/Active/Previous with
  atomic writes and compensating restoration, and degrades malformed scene or
  spell items to disabled/empty surfaces with reasoned metadata. It does not
  own Task 7 model-role resolution or session/job snapshots.
- **Credential boundary.** CredentialStore is Main-only, receives its
  credential path, Electron 43 `safeStorage` adapter, file operations, and
  metadata sink from its caller, writes only an encrypted blob outside config
  and backups, supports set/get/clear and safeStorage re-encryption, and
  never uses keytar. Task 8 owns `app.ready` and renderer IPC wiring; Phase 1
  owns short-lived credential exchange.
- **Metadata boundary.** Task 3 defines an injected
  `Omit<MirrorEvent, 'time'>` sink with fixed config/credential event names,
  statuses, error codes, and reason grammar. Events contain only slot,
  operation, count, field-path, revision, and cause metadata; no config values,
  secrets, transcripts, audio, private context, images, embeddings, or
  prompts are emitted.
- **Execution boundary.** The plan routes TDD through a test-only
  implementer, dedicated RED tester, the same logical implementer for
  production/resource files, focused GREEN and node-typecheck tester, root
  review, full-suite/build tester, and root commit. No worker stages, commits,
  pushes, or merges; no demo is claimed by this preparation record.
- **Credential provisioning setup (metadata only).** The user reports that the
  local OpenAI credential is provisioned through `.env`. Supplied metadata
  records `.env` exists: true, `.gitignore` line 9 rule `.env` ignores it,
  tracked by Git: false (untracked), content/value accessed: false, and
  validity checked: false. Current branch remains `phase0-config` and the
  origin remains
  `https://github.com/Novalien0424/magic-mirror`. `.env` is provisioning input
  only and must never be committed, pushed, or treated as runtime
  renderer-visible storage; Main/`safeStorage` and short-lived renderer
  credentials remain authoritative.
- **Phase 2 wake phrase requirement.** The wake phrase is customizable and
  must never be hard-coded: the editable phrase/config/raw keyword source must
  generate the detector keyword artifact, with version/metadata and safe
  fallback visible. This requirement is accepted without starting its
  implementation. Application order and status are unchanged.

## 2026-08-17 — Phase 0 Task 1 integration and Task 2 dispatch preparation

- **Local integration.** `main` was fast-forwarded locally from `7c07244` to
  `426728f012556b4095eb8b25d94aa7476617f103`; no remote/upstream exists.
  `phase0-foundation` was deleted after green verification, and
  `phase0-lifecycle` is the current Task 2 branch from that exact HEAD.
- **Post-merge check.** A fresh `nova-auto` `gpt-5.6-luna` max tester verified
  merged `main` at that HEAD: Node `v22.21.0`, `npm run typecheck` exit `0`,
  `npm test` exit `0`, 4 files / 20 tests, Vitest `34.96s`, clean.
- **Authoritative Task 2 shape.** The accepted plan
  (`docs/superpowers/plans/2026-08-17-phase0-task2-lifecycle.md`) and ignored
  brief (`.superpowers/sdd/2026-08-16-phase0-foundation/task-2-dispatch-brief.md`)
  replace the stale SDD idle/listening/processing/speaking and
  `src/main/console.ts` suggestions with the exact seven-state lifecycle and
  injected metadata-only telemetry boundary. Detailed `LOCAL_CORE_FAILED
  anywhere` supplements the Tech Spec primary-edge diagram and routes to
  `maintenance`.
- **Process state.** Task 2 is prepared but not started; Tasks 2–5 remain
  sequential; Phase 0 remains in progress and Phase 1 remains blocked and
  must not advance. The Node
  prerequisite upgrade to `>=22.22.2` or `>=24.15.0` applies before Task
  3, not Task 2.

## 2026-08-17 — Codex harness migration routing

- **Root ownership.** The root Codex thread is the sole orchestrator and
  reviewer. Root does not implement changes, perform survey/research, or run
  tests/validation.
- **Worker route.** Every worker explicitly launches fresh through profile
  `nova-auto` with model `gpt-5.6-luna`, `reasoning_effort: "max"`, exactly one
  bounded role, and `fresh_worker: true`.
- **Review boundary.** No separate review role exists. Root review is external
  to worker self-review, and all current and future plans and workers allow at
  most three self-review passes.
- **Supersession.** The user's current Codex policy supersedes SDD ledger
  R3/R4; R1 is completed historical in-place integration, while R2/R5 remain
  active.

## 2026-08-16 — Task 1 (Phase 0 scaffold)

- **TypeScript 5.9, not 7.0.** xstate 5 and the vite/electron-vite toolchain
  are only verified against 5.x today. Revisit when Phase 0 closes.
- **vite 7 + @vitejs/plugin-react 5, not vite 8.** electron-vite 5 peers
  `vite ^5||^6||^7`; vite 8 would force plugin-react 6 and break electron-vite.
- **CommonJS output** (no `"type": "module"`): sandboxed preloads cannot be
  ES modules.
- **Preloads bundle self-contained.** A sandboxed preload cannot `require` a
  relative rollup chunk, so `src/preload/*.ts` takes only type-only imports
  from `src/shared/`; the IPC channel literal is pinned by the `BootChannel`
  type so a rename breaks typecheck.
- **One restart owner.** In-app recovery recreates a crashed renderer once;
  when the budget is spent the app exits 1 and the macOS LaunchAgent
  (`KeepAlive={SuccessfulExit=false}`) restarts it. `app.relaunch()` is never
  called.
- **Smoke mode keeps windows hidden** so automated boot loops (Task 10) don't
  hijack the desktop; the visible path is exercised by plain `npm run dev`.
- **Env-gated test hooks** (`MIRROR_FORCE_RENDERER_FAIL`,
  `MIRROR_FORCE_RENDERER_CRASH`) ship in production code paths as the only
  way to E2E-test the failure branches; Phase 7 gates them behind a build
  flag before field deployment.

## 2026-08-16 — Session/process decisions (orchestrator)

- Docs are authoritative at v0.3.1 (in-place amendment, filenames keep v0.3);
  `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md` records why.
- Implementation Plan owns phase exit criteria; Tech Spec §16 is a summary
  that defers to it on any mismatch.
- Extractor Draft baseline is `gpt-5.6-luna` (config data, not code);
  `gpt-5.6-terra` is the A/B candidate.
- SDD process rulings (review seat, sequential tasks, worktree choice) live
  in the SDD ledger: `.superpowers/sdd/2026-08-16-phase0-foundation/progress.md`.
