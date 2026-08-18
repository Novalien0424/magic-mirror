# Phase 0 Task 5 — SQLite Initialization + Migration Baseline Implementation Plan

> Only the interactive root dispatches fresh profile-backed CLI workers; workers execute their bounded unit directly and never delegate. Steps use checkbox ( - [ ] ) syntax for tracking.

**Goal:** Add a Main-only node:sqlite service that opens one caller-supplied persistent database path, establishes the required SQLite pragmas, applies only the foundation_baseline migration, validates the baseline, and exposes metadata-only health and failure results without wiring the service into application boot.

**Architecture:** openSqlite receives an absolute dbPath and a required Pick<Telemetry, 'emit'> sink. It uses a real node:sqlite DatabaseSync adapter by default, while a narrow injected database-driver factory exists only to make foreign-key, WAL, migration, integrity, and close failure paths deterministic in tests. Initialization is fail-closed: it never relocates a path, creates a parent directory, falls back to :memory:, recreates a malformed schema, downgrades, or silently substitutes another database.

**Tech Stack:** TypeScript 5.9, Electron Main, Node 24 node:sqlite / DatabaseSync, the existing shared Result<T, E> type, the existing Task 4 Telemetry interface, Vitest 4.1.10, and Node built-ins only. No dependency, package, build, runtime-model, or schema-framework change is allowed.

**Spec:** docs/Magic_Mirror_PRD_v0.3.md §§5.1, 9.1, 11.2, and 13; docs/Magic_Mirror_Tech_Spec_v0.3.md §§3.2, 6.3, 13.1, 14.1, 16, and 18; docs/Magic_Mirror_Implementation_Plan_v0.3.md §§3.3–3.4, Phase 0 scope, P0-D2, P0-D3, P0-D4, and Phase 0 exit criteria; docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md §SQLite; .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; and the accepted Task 4 plan docs/superpowers/plans/2026-08-19-phase0-task4-telemetry.md.

## Global Constraints

- Planning state: Task 4 metadata-only telemetry is completed, root-reviewed, integrated, and pushed on main at dca1327; supplied evidence is focused telemetry 21/21, full 8 files / 113 tests, Node plus web typecheck exit 0, and Electron Vite build exit 0.
- Current branch: phase0-sqlite, created from the pushed main state at dca1327. Application Task 5 is current, planned, and not started.
- Tasks 3–5 remain sequential. Phase 1 remains blocked until complete Phase 0 work and the Task 10 exit review; this plan does not advance either status.
- Exact application TDD write order is tests/unit/sqlite-service.test.ts first, then src/main/sqlite-service.ts. No other application source, test, package, lockfile, build, runtime-config, resource, preload, renderer, shared-type, or IPC path is a Task 5 write path.
- The service is Main-only. The caller injects dbPath; renderers never open SQLite, receive a database handle, or choose profile/database permissions.
- The default adapter is real node:sqlite DatabaseSync. The optional injected SqliteDatabaseDriverFactory is a narrow deterministic test seam, not a production alternate database implementation or fallback.
- Initialization must execute and verify PRAGMA foreign_keys = ON, PRAGMA journal_mode = WAL, and PRAGMA integrity_check; a failed verification returns a stable failure and never reports ready.
- Path validation precedence is exact: reject empty/whitespace first, then any NUL-containing path, then exactly :memory:, then non-absolute paths, before opening. The exact :memory: input maps to memory_path and never reaches the non-absolute check. Do not relocate, normalize to another path, create a parent directory, use an in-memory fallback, open an alternate database, or hide a directory policy inside the service.
- The service creates only app_migrations; migration 1 is named exactly foundation_baseline. It does not create telemetry/log tables or any guests, enrollment, embedding, visit-summary, memory, or Master Memory table.
- The exact app_migrations structural contract and row contract are validated before and after any migration. Malformed, non-contiguous, unknown, gapped, or future rows fail visibly; the service never downgrades, deletes, recreates, or replaces a database.
- Migration application uses BEGIN IMMEDIATE, the exact required migration statements, COMMIT, and best-effort ROLLBACK on any transaction failure. A rollback failure never replaces the primary stable failure or leaks its exception.
- health() returns defensive metadata-only copies. After a successful close, health is failed with failure.code === sqlite_closed; a close-driver failure is failed with sqlite_close_failed. close() is idempotent and never exposes a raw exception.
- The telemetry sink is required and typed as Pick<Telemetry, 'emit'>. Sink exceptions are caught and cannot gate open, migration, integrity, or close behavior. Events always use module: sqlite and source: runtime, with stable event names, statuses, error codes, and reasons only.
- Telemetry contains no raw exception, stack, database path, SQL, user content, secret, transcript, audio, private context, memory value, image, embedding, or credential. Task 4 remains RAM/JSONL only; Task 5 never creates a telemetry table or moves events into SQLite.
- Default happy/reopen/schema-only tests use OS temporary directories and persistent files. Tests create and clean their own temporary directories. No test opens an in-memory database; :memory: is exercised only as a rejected path input, with no driver call.
- P0-D2 later maps database failure to Maintenance, P0-D3 later consumes SQLite metadata events, and P0-D4 later consumes reopen/idempotence evidence. Task 10 owns demos and records; Task 5 supplies deterministic unit evidence only.
- Workers do not stage, commit, push, switch branches, merge, or dispatch children. The interactive root owns external review and the intentional Git integration sequence.
- Preserve the untracked scripts/install-node-lts.ps1. Never read or modify .env; process state may record only supplied metadata that .env is present, ignored by .gitignore line 9, untracked, content/value not accessed, and validity not checked. No user setup is required for this Task 5 planning boundary.
- Windows development uses the same Electron safeStorage API backed by DPAPI as the target macOS Keychain path, but Windows validation does not field-verify packaged macOS node:sqlite, TCC, Keychain, signing, or entitlements. The single LaunchAgent restart owner and no-app.relaunch rule remain unchanged.

---

## Status and scope

- Phase: Phase 0 — Foundation / Visible Skeleton.
- Current unit: Application Task 5 — SQLite initialization + migration baseline.
- User-visible status: The contract is prepared only. No SQLite runtime implementation, boot wiring, lifecycle mapping, Maintenance UI, IPC, Console page, or phase demo result is claimed by this plan.
- Exact future implementation files: Create tests/unit/sqlite-service.test.ts first; then create src/main/sqlite-service.ts.
- Exact process files updated by this planning unit: AGENTS.md, PROGRESS.md, DECISIONS.md, and this plan file.
- Read-only neighboring boundaries: src/main/index.ts, src/main/lifecycle.ts, src/main/telemetry.ts, src/shared/types.ts, all preload/renderer files, all Task 3 files, package files, build files, resources, and the ignored SDD ledger remain read-only.

## Unit template

**Story / Phase:** US-FOUND-001 / Phase 0 Foundation, Application Task 5.

**User-visible outcome:** Main can report a ready persistent SQLite baseline when the caller supplies a valid path, and can return safe, reasoned metadata when the path, pragmas, schema, migration, integrity check, or close operation fails. The later boot owner can map the failure to Maintenance without a black screen.

**Files / modules expected to change:** Create tests/unit/sqlite-service.test.ts first, then src/main/sqlite-service.ts. The test uses real persistent temporary files for default happy/reopen/schema-only behavior and a narrow injected driver only for deterministic foreign-key, WAL, migration, integrity, and close failures. No other code or test file changes.

**Console control or telemetry to add:** Add the Main-only Pick<Telemetry, 'emit'> event seam for stable SQLite open, migration, integrity, and close metadata. Do not add IPC, a Console page, boot wiring, a lifecycle transition, a database-backed event table, or a renderer-visible health channel.

**Happy-path test:** Open a real persistent file through default DatabaseSync, verify foreign keys are enabled, journal mode is WAL, PRAGMA integrity_check is ok, exactly one app_migrations table exists with migration 1 foundation_baseline, health is ready, close is idempotent, and reopening the same file does not duplicate or recreate the baseline.

**Failure / fallback test:** Reject invalid paths; map a real missing-parent open failure; inject foreign-key, WAL, migration, integrity, and close failures; make the telemetry sink throw; and verify stable result/health/event metadata, best-effort rollback, no raw exception/path/SQL, no fallback database, no directory creation, no silent failure, and no gating by telemetry.

**Explicit non-goals:** Boot wiring; lifecycle-to-Maintenance mapping; IPC or preload; Mirror/Console UI; module registry; model resolver; guests; enrollment images; embeddings; visit summaries; recent/durable/Master memory; profile or identity data; backup/restore; telemetry/log tables; database pooling; ORM/native dependency; alternate DB; :memory: fallback; schema versions beyond 1; Task 6–10 implementation; Phase 1 implementation; macOS field validation; user setup; and all worker Git operations.

**Demo step affected:** P0-D2 later consumes DB failure as Maintenance, P0-D3 later consumes SQLite metadata events, and P0-D4 later verifies reopen/idempotence. Task 10 owns the visible demos and records; Task 5 does not claim a demo.

## Source anchors and decision labels

The labels below distinguish source-grounded requirements from bounded design choices made explicit so the RED and GREEN workers share one contract.

### Verified requirements

| Label | Anchor | Requirement carried into this plan |
|---|---|---|
| verified | PRD §5.1 / US-FOUND-001 | Opening SQLite is a local-core boot concern; failure must surface as Maintenance rather than a blank screen. |
| verified | PRD §9.1 and §11.2 | Diagnostics and telemetry are metadata-only; no complete transcript, audio, private memory context, runtime frame, embedding, key, or secret is persisted. |
| verified | PRD §13 / Tech Spec §13.1 | SQLite is the local source of truth; Phase 1 domain tables are named in the product documents but are not the Task 5 baseline. |
| verified | Tech Spec §3.2 | SQLite is Main-owned; renderers do not open the database. |
| verified | Tech Spec §6.3 and §14.1 | SQLite open, migration, integrity, storage-path, and failure metadata must be observable without blocking unrelated visitor work. |
| verified | Tech Spec §13.1 | app_migrations is the migration metadata table; the formal domain schema is deferred to migration files and later owners. |
| verified | Implementation Plan Phase 0 / P0-D2 | A simulated or real SQLite failure later maps to Maintenance; failure must not become OfflineLoop or a black screen. |
| verified | Implementation Plan P0-D3 / P0-D4 | SQLite metadata is a later observability consumer and reopen/idempotence are later restart evidence. |
| verified | Stack Adversarial Review §SQLite | Use node:sqlite / DatabaseSync, keep WAL as a pragma, and avoid a native dependency/rebuild surface. |
| verified | src/shared/types.ts | Result<T, E> is { ok: true; value: T } | { ok: false; error: E }; MirrorEvent is the existing metadata event shape. |
| verified | src/main/telemetry.ts | Task 4 already exposes Telemetry.emit; SQLite receives only Pick<Telemetry, 'emit'> and leaves RAM/JSONL ownership with Task 4. |
| verified | mm-phase-workflow | Every unit has all eight template fields, a failure/fallback test, and a later Console/telemetry increment. |
| verified | mm-invariants | All twelve canonical invariants remain applicable; no content or identifier crosses an unsafe boundary and no failure is silently swallowed. |
| verified | mm-electron-foundation | Electron 43.x uses Main-owned node:sqlite; Windows DPAPI and target macOS Keychain/TCC/signing/entitlement distinctions remain explicit. |

### Explicit design decisions and inferences

| Label | Decision | Reason |
|---|---|---|
| decision | The exact baseline table is CREATE TABLE IF NOT EXISTS app_migrations (version INTEGER NOT NULL PRIMARY KEY, name TEXT NOT NULL). | It stores only the migration version and exact migration name, has no content-bearing columns, and is sufficient for a one-row baseline without inventing later schema. |
| decision | Structural validation requires one sqlite_master object of type table, the normalized exact baseline DDL, exactly the two PRAGMA table_info columns, no indexes/triggers/views attached to app_migrations, and rows selected only as version,name. | A table that merely has similarly named columns must not silently pass as the application schema. |
| decision | The internal registry is exactly [{ version: 1, name: 'foundation_baseline' }]; migration row validation checks ascending, strictly contiguous positive safe integers and exact names. | It makes malformed, gapped, unknown, and future states deterministic while leaving all domain schemas to later tasks. |
| decision | A gap is rejected as sqlite_schema_invalid before future-version classification when the returned sequence is not contiguous; a contiguous version above 1 is sqlite_schema_too_new. | The result is deterministic for [1,3] versus [2] and never treats a partial future schema as a supported baseline. |
| decision | SqliteHealth contains only status, schema version, pragma/integrity metadata, and a stable failure object; it contains no path, handle, SQL, or exception text. | Health is safe to expose to a later Main/Console adapter and remains defensive metadata only. |
| decision | Stable SQLite event names are sqlite_open, sqlite_migration, sqlite_integrity_check, and sqlite_close; each event is module: sqlite, source: runtime, and uses only the allow-listed stable code/reason fields. | A small fixed event vocabulary is enough for P0-D2–D4 and prevents event-name drift or arbitrary diagnostics. |
| decision | The service performs no mkdir, path relocation, file copy, deletion, DROP TABLE, downgrade, or alternate-driver selection. | The caller owns data-directory policy and failure must be visible rather than repaired behind the service boundary. |
| decision | close() stores and returns the first close result on subsequent calls; successful close is ok, failed close remains sqlite_close_failed, and successful-close health is failed/sqlite_closed. | Idempotence is deterministic even when the underlying close throws, and the closed state cannot be retried into an ambiguous lifecycle. |
| decision | A failure during initialization attempts one best-effort adapter close, reports a separate stable close event only if that cleanup close fails, and returns the original failure. | Cleanup must not leak a handle or replace the causal error with an unsafe exception. |
| inference | The default adapter wraps DatabaseSync.exec, prepare(...).get/all/run, and close behind the narrow driver interface. | This keeps the production seam real and makes failure tests deterministic without adding a database package or exposing a second runtime backend. |

## File map and exact public contract

### File responsibilities

- tests/unit/sqlite-service.test.ts: RED-first tests, persistent temporary-file helpers, real DatabaseSync schema seed helpers, a narrow injected-driver failure harness, metadata-only telemetry capture, and cleanup. It is the only Task 5 test write path.
- src/main/sqlite-service.ts: path validation, default DatabaseSync adapter, pragma setup/verification, exact migration table/row validation, transactional baseline migration, integrity check, defensive health copies, idempotent close, stable error mapping, and sink isolation. It is the only Task 5 production write path.
- src/main/telemetry.ts: read-only consumer seam; Task 5 does not alter Task 4 caps, fields, RAM/JSONL persistence, or event writer.
- src/shared/types.ts: read-only source of the shared Result and MirrorEvent contracts.

### Public TypeScript interfaces and signatures

The RED test and GREEN implementation must use these names and signatures without drift. The adapter types are intentionally narrow and are not a second production database API.

~~~ts
import type { Result } from '../shared/types'
import type { Telemetry } from './telemetry'

export const SQLITE_SCHEMA_VERSION = 1 as const

export type SqliteFailureCode =
  | 'sqlite_path_invalid'
  | 'sqlite_open_failed'
  | 'sqlite_foreign_keys_failed'
  | 'sqlite_journal_mode_failed'
  | 'sqlite_schema_invalid'
  | 'sqlite_schema_too_new'
  | 'sqlite_migration_failed'
  | 'sqlite_integrity_failed'
  | 'sqlite_close_failed'
  | 'sqlite_closed'

export type SqliteFailureReason =
  | 'empty_path'
  | 'nul_byte'
  | 'memory_path'
  | 'not_absolute'
  | 'driver_open_failed'
  | 'foreign_keys_not_enabled'
  | 'journal_mode_not_wal'
  | 'schema_object_invalid'
  | 'schema_ddl_invalid'
  | 'schema_columns_invalid'
  | 'schema_rows_invalid'
  | 'schema_gap'
  | 'schema_name_unknown'
  | 'schema_future_version'
  | 'migration_transaction_failed'
  | 'integrity_check_not_ok'
  | 'driver_close_failed'
  | 'cleanup_close_failed'
  | 'service_closed'

export interface SqliteFailure {
  code: SqliteFailureCode
  reason: SqliteFailureReason
}

export interface SqliteHealth {
  status: 'ready' | 'failed'
  schemaVersion: number | null
  journalMode: 'wal' | 'unknown'
  foreignKeys: boolean | null
  integrity: 'ok' | 'failed' | 'unknown'
  failure: SqliteFailure | null
}

export type SqliteDatabaseRow = Readonly<Record<string, unknown>>

export interface SqliteDatabaseDriver {
  exec(sql: string): void
  get(sql: string, params?: readonly unknown[]): SqliteDatabaseRow | undefined
  all(sql: string, params?: readonly unknown[]): readonly SqliteDatabaseRow[]
  run(sql: string, params?: readonly unknown[]): void
  close(): void
}

export type SqliteDatabaseDriverFactory =
  (dbPath: string) => SqliteDatabaseDriver

export interface SqliteServiceOptions {
  dbPath: string
  telemetry: Pick<Telemetry, 'emit'>
  driverFactory?: SqliteDatabaseDriverFactory
}

export interface SqliteService {
  health(): SqliteHealth
  close(): Result<void, SqliteFailure>
}

export function openSqlite(
  options: SqliteServiceOptions,
): Result<SqliteService, SqliteFailure>
~~~

Contract details:

- dbPath is required and is never defaulted. The caller supplies one absolute persistent file path.
- telemetry is required even for a path-validation failure so every rejected/degraded path can be represented through the same safe sink. The service catches sink exceptions and never returns a telemetry-derived failure.
- driverFactory defaults to the internal real DatabaseSync wrapper. When supplied, it is used only by deterministic tests for the named failure paths; no production caller may use it to select a different database engine.
- SqliteFailure has no path, SQL, raw exception, stack, row payload, or user data. SqliteHealth has no database handle or path and is rebuilt on every health() call.
- close() does not throw. The first result is retained for idempotent repeat calls; a successful close returns { ok: true, value: undefined }, while a driver close failure returns { ok: false, error: { code: 'sqlite_close_failed', reason: 'driver_close_failed' } }.
- cleanup_close_failed is an event-only cause for best-effort initialization cleanup; the returned failure remains the original primary SqliteFailure.
- health() is ready only after all required pragmas, schema/migration validation, and integrity check succeed. A successful close changes it to status: failed with failure { code: 'sqlite_closed', reason: 'service_closed' }; a close failure changes it to status: failed with sqlite_close_failed.

## Exact SQL, schema, validation, and event contracts

### Required SQL and baseline shape

The production module owns these exact internal statements; no statement is configurable through SqliteServiceOptions:

~~~sql
PRAGMA foreign_keys = ON;
PRAGMA foreign_keys;
PRAGMA journal_mode = WAL;
PRAGMA table_info('app_migrations');
PRAGMA index_list('app_migrations');
PRAGMA foreign_key_list('app_migrations');
SELECT type, name, tbl_name, sql
  FROM sqlite_master
 WHERE name = 'app_migrations';
SELECT version, name
  FROM app_migrations
 ORDER BY version ASC;
CREATE TABLE IF NOT EXISTS app_migrations (
  version INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO app_migrations (version, name) VALUES (?, ?);
PRAGMA integrity_check;
BEGIN IMMEDIATE;
COMMIT;
ROLLBACK;
~~~

The exact accepted structural shape is:

| Source | Expected metadata |
|---|---|
| sqlite_master | One object named app_migrations, type = table, tbl_name = app_migrations, and normalized SQL equal to the baseline DDL without IF NOT EXISTS; missing/null SQL or any other object type is sqlite_schema_invalid. |
| PRAGMA table_info('app_migrations') | Exactly two rows in cid order: { cid: 0, name: 'version', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 } and { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 }. |
| PRAGMA index_list('app_migrations') | Empty for the integer primary-key baseline; any user-created index is an exact-shape failure. |
| PRAGMA foreign_key_list('app_migrations') | Empty; the baseline has no foreign keys. |
| app_migrations rows | Exactly the selected version and name columns, validated as described below; no row content beyond these metadata fields is accepted. |

The service may inspect other existing SQLite objects only to avoid confusing them with app_migrations; it creates none. A valid database for this task has no application-created object other than app_migrations. It never creates guests, enrollment_images, face_embeddings, visit_summaries, guest_memories, master_memory, telemetry, logs, indexes, triggers, or views.

### Migration registry and row validation

The only internal registry is:

~~~ts
const EXPECTED_MIGRATIONS = [
  { version: 1, name: 'foundation_baseline' },
] as const
~~~

Validation is deterministic and ordered:

1. Validate the sqlite_master object and exact table structure. A missing object is the only state that proceeds to the baseline-create transaction; a present malformed object is sqlite_schema_invalid, never repaired.
2. Validate every selected row is a non-array object with exactly the keys version and name, a positive safe integer version, and a non-empty string name. Any malformed row is sqlite_schema_invalid with reason schema_rows_invalid.
3. Require rows to be strictly ascending in the returned ORDER BY version ASC result. Duplicate, reversed, or non-contiguous versions are sqlite_schema_invalid with reason schema_gap.
4. An empty valid table is a pending baseline and may receive migration 1. A first version below 1 is invalid. A contiguous first/last version above SQLITE_SCHEMA_VERSION is sqlite_schema_too_new with reason schema_future_version.
5. For every supported row, require the exact registry name at that version. Any unknown, renamed, or mismatched supported name is sqlite_schema_invalid with reason schema_name_unknown.
6. If the final supported version is less than 1, apply missing migrations in ascending order. For this task the only operation is the foundation_baseline table creation/row insert. If the row already exists exactly, do not reapply it.
7. After COMMIT, re-read and revalidate the exact table shape and rows. A post-commit mismatch is a visible schema failure; there is no downgrade, delete, recreate, rollback-after-commit, or alternate database.

For deterministic precedence, a non-contiguous sequence such as versions 1,3 is sqlite_schema_invalid/schema_gap, while a contiguous future sequence such as version 2 is sqlite_schema_too_new/schema_future_version. A supported version with an unknown name is sqlite_schema_invalid/schema_name_unknown.

### Initialization sequence

openSqlite executes this sequence and returns at the first stable failure:

1. Validate the runtime shape of options, options.dbPath, and options.telemetry without reading or normalizing a secret. Reject an empty or whitespace-only path as empty_path, any NUL as nul_byte, exactly :memory: as memory_path, and only then a non-absolute path as not_absolute. The exact :memory: input must therefore never produce not_absolute. Do not call the driver factory for any rejected path.
2. Select the supplied test factory or the default DatabaseSync adapter and call it once with the exact validated path. A constructor/driver failure maps to sqlite_open_failed/driver_open_failed; the exception is not retained or emitted.
3. Execute PRAGMA foreign_keys = ON, query PRAGMA foreign_keys, and require exactly the numeric enabled result. Any throw, missing row, unexpected key/value, or disabled result maps to sqlite_foreign_keys_failed/foreign_keys_not_enabled.
4. Execute/query PRAGMA journal_mode = WAL and require exactly the case-insensitive wal result. Any throw or other mode maps to sqlite_journal_mode_failed/journal_mode_not_wal.
5. Inspect and validate app_migrations. If absent, apply the baseline transaction. If present and valid but empty, apply the baseline transaction. If present with exact migration 1, do not write a second row.
6. Apply pending migration work only inside BEGIN IMMEDIATE → CREATE TABLE IF NOT EXISTS .../INSERT ... → COMMIT. Any begin, DDL, insert, or commit failure triggers best-effort ROLLBACK and maps to sqlite_migration_failed/migration_transaction_failed.
7. Revalidate the exact table and rows after migration. Then run PRAGMA integrity_check and require exactly one result row with integrity_check === 'ok'. Any throw, malformed result, or non-ok result maps to sqlite_integrity_failed/integrity_check_not_ok.
8. Return a service whose defensive health reports ready, schemaVersion: 1, journalMode: wal, foreignKeys: true, integrity: ok, and failure: null.
9. If a post-open step fails, attempt one adapter close without exposing its exception. If that cleanup close fails, emit a stable sqlite_close failure event but retain and return the primary failure.

The default adapter may create the persistent database file as DatabaseSync normally does when its parent already exists; it must not create or choose the parent directory. The caller and tests own directory setup.

### Telemetry event contract

Every emission is attempted through a local try/catch; a sink exception is ignored after the attempt and cannot alter the SQLite Result or health. The event payloads are limited to the existing metadata seam:

| Event | Success/info contract | Failure contract |
|---|---|---|
| sqlite_open | status: success, reason=schema_version=1;foreign_keys=on;journal_mode=wal;integrity=ok | status: failed, error_code=<SqliteFailureCode>, reason=cause=<SqliteFailureReason>, using the exact primary failure code/reason pair for every path, driver-open, pragma, schema, migration, and integrity failure. |
| sqlite_migration | status: success, reason=version=1;name=foundation_baseline only when migration work was applied | status: failed, error_code=sqlite_migration_failed, reason=cause=migration_transaction_failed. |
| sqlite_integrity_check | status: success, reason=result=ok | status: failed, error_code=sqlite_integrity_failed, reason=cause=integrity_check_not_ok. |
| sqlite_close | status: success, reason=status=closed on the first successful close | status: failed, error_code=sqlite_close_failed, reason=cause=driver_close_failed; an initialization cleanup close uses reason=cause=cleanup_close_failed. |

All event payloads set module: sqlite and source: runtime, omit session/scene identifiers, and use no raw text, path, or SQL. Success reasons remain metadata-only. The health-only sqlite_closed/service_closed state is represented by the defensive health object; a repeated close returns its retained first result and does not create an unbounded event loop.

## TDD execution tasks

### Task 0: Static plan gate before RED

**Files:**

- Read: AGENTS.md, PROGRESS.md, DECISIONS.md, this plan, src/shared/types.ts, src/main/telemetry.ts, and the three required .agents/skills files.
- Write: none.
- Do not read: .env, scripts/install-node-lts.ps1, ignored ledger contents, credentials, audio, images, or user content.

**Interfaces:**

- Consumes: the four planning files as changed by this documentation unit and the exact Task 5 contract above.
- Produces: metadata-only static evidence that the plan is complete enough for the RED test worker and that no application implementation has started.

- [ ] Step 1: Dispatch a fresh static-gate tester after root review of the four documentation files.

The tester runs only these read-only commands, in order:

~~~powershell
git diff --check -- AGENTS.md PROGRESS.md DECISIONS.md
$bad = Select-String -LiteralPath 'docs/superpowers/plans/2026-08-19-phase0-task5-sqlite.md' -Pattern '[ \t]+$'; if ($bad) { $bad; exit 1 }; exit 0
rg -n "SQLITE_SCHEMA_VERSION|sqlite_foreign_keys_failed|sqlite_journal_mode_failed|sqlite_schema_too_new|sqlite_migration_failed|sqlite_integrity_failed|sqlite_close_failed|BEGIN IMMEDIATE|PRAGMA integrity_check|Plan complete" docs/superpowers/plans/2026-08-19-phase0-task5-sqlite.md
git status --short --branch --untracked-files=all
~~~

Expected: the tracked-file diff check exits 0; the PowerShell check exits 0 only when the untracked plan has no trailing whitespace; the required contract markers are found; and the full branch/status output contains no Task 5 application file before the RED worker while continuing to show the untracked installer without staging or modifying it. The tester returns complete stdout/stderr and each exit code, including any unavailable or failed command. It does not run Vitest, npm, Node, a build, or any Git mutation.

### Task 1: Write the SQLite RED contract

**Files:**

- Create: tests/unit/sqlite-service.test.ts
- Read: src/shared/types.ts, src/main/telemetry.ts, src/main/config-service.ts, src/main/credential-store.ts, and this plan.
- Do not create or modify: src/main/sqlite-service.ts during this unit.

**Interfaces:**

- Consumes: the exact public types/signatures, SQL contract, event contract, and TDD cases in this plan.
- Produces: a failing test contract that names the production module before it exists and makes every required path observable without a real user database.

- [ ] Step 1: Create persistent-file and metadata-only test helpers before assertions.

Use mkdtemp under the OS temporary directory for every real database. Use a distinct mirror.sqlite path below an existing temporary directory, and remove the directory recursively in afterEach/afterAll after services and seed handles are closed. The service must never receive a parent directory that the test expects it to create. The only invalid in-memory case is a path-input assertion for exactly :memory:; no test opens it and no test uses an in-memory database.

Capture telemetry as shallow copies of event metadata. Provide a sink that can be switched to throw so the test proves sink exceptions do not gate SQLite. Do not record the temporary path, SQL, raw injected exception, or any content in captured event assertions; use only event names, statuses, stable codes, and safe reasons.

The real schema seed helper uses DatabaseSync on a persistent temporary path, closes the seed handle before calling openSqlite, and creates only the exact app_migrations table. It supports exact row 1, an empty exact table, malformed column shape, a gapped 1,3 row sequence, an unknown name at version 1, and a contiguous future version 2. It never uses :memory:.

The injected-driver helper implements only exec, get, all, run, and close, records operation categories/SQL labels in test memory, and returns the exact happy metadata unless one named failure switch is enabled. It is used only for foreign-key, WAL, migration, integrity, and close failure cases. It is not used to simulate path validation, real open failure, or happy/reopen/schema-only behavior.

- [ ] Step 2: Add RED assertions for the public API and exact baseline constants.

Import SQLITE_SCHEMA_VERSION, openSqlite, and every public type needed by the helpers from ../../src/main/sqlite-service. Assert that the expected constant is 1, that openSqlite returns the existing shared Result shape, and that a successful service exposes only health() and close() at runtime. Keep the type imports aligned with the exact contract so a name or signature drift fails typecheck later.

- [ ] Step 3: Add RED assertions for real persistent happy path and required pragmas.

Test that default DatabaseSync opens a persistent file whose parent already exists, returns ok: true, reports the exact ready health metadata, and emits sqlite_open with module sqlite and source runtime. Reopen the same path with a fresh sink and assert ready health, exactly one app_migrations table, exactly one row { version: 1, name: 'foundation_baseline' }, no application table besides app_migrations, and no telemetry/log table. Inspect the persistent file with a real DatabaseSync handle after the service closes; do not depend only on fake call records.

- [ ] Step 4: Add RED assertions for close, defensive health, and no directory policy.

Assert that health() returns independent top-level and nested failure objects: mutating one returned copy does not change a later copy. Assert first close returns ok, emits one successful sqlite_close, changes health to status failed with failure.code === sqlite_closed, and a second close returns the retained successful result without reopening or throwing. Assert a path under a deliberately missing parent returns sqlite_open_failed, does not create the missing directory, and emits no path or raw exception.

- [ ] Step 5: Add RED assertions for path rejection and no fallback.

Exercise path inputs in exact precedence order: empty/whitespace-only maps to empty_path; NUL-containing maps to nul_byte; exactly :memory: maps to memory_path, never not_absolute; and relative maps to not_absolute. For each, assert ok: false, error.code === sqlite_path_invalid, no database file/parent creation, no alternate path, and no injected-driver invocation. Assert that an absolute path is not silently trimmed or relocated; only validation determines acceptance.

- [ ] Step 6: Add RED assertions for schema-only rows and rejection precedence.

Using real persistent seed files, assert an exact empty table receives baseline migration 1; an exact row 1 reopens successfully without another row; malformed table/columns return sqlite_schema_invalid; rows 1,3 return sqlite_schema_invalid with schema_gap; an unknown name at version 1 returns sqlite_schema_invalid with schema_name_unknown; and contiguous version 2 returns sqlite_schema_too_new with schema_future_version. Assert malformed/gapped/future paths do not drop or recreate the table and do not create domain or telemetry tables.

- [ ] Step 7: Add RED assertions for injected pragma, migration, integrity, and close failures.

For each fake-driver switch, assert the exact stable failure code, health/event status where a service exists, and no raw exception, SQL, or path in captured telemetry. For every primary open failure, assert the sqlite_open failure event uses error_code equal to the returned SqliteFailureCode and reason=cause=<the returned SqliteFailureReason>. For migration failure, assert the operation sequence includes BEGIN IMMEDIATE and a best-effort ROLLBACK, never reports success, the sqlite_migration event uses error_code=sqlite_migration_failed and reason=cause=migration_transaction_failed, and no downgrade/recreate runs. For a foreign-key or WAL verification mismatch, assert the service stops before migration. For integrity failure, assert migration has completed/committed only when the fake is configured to fail after that step, then returns sqlite_integrity_failed and emits sqlite_integrity_check with error_code=sqlite_integrity_failed and reason=cause=integrity_check_not_ok. For close failure, open successfully, assert close() returns sqlite_close_failed, health exposes the same failure, sqlite_close failed metadata uses error_code=sqlite_close_failed and reason=cause=driver_close_failed, and a second close returns the retained failure without retrying.

- [ ] Step 8: Add RED assertions for telemetry sink isolation and privacy.

Make telemetry.emit throw on every call and assert a valid database still opens, returns ready health, passes integrity, and closes. For each captured event from a non-throwing sink, assert the stable event name/status/code/reason only, including the failed-event cause grammar and metadata-only success reasons; assert serialized event metadata does not contain the database path, any SQL statement, any synthetic raw exception marker, a transcript/audio/private-memory marker, a secret, or a credential. Assert Task 4 remains the only telemetry persistence owner by checking the SQLite object list contains no telemetry/log table.

The test-only implementer writes no production file, runs no npm/npx/node/test/typecheck/build command, does not read .env or the installer, and performs no Git mutation. Its evidence is the exact changed test path, concise RED contract summary, output only from any read-only inspection it actually ran, and unresolved risks.

### Task 2: Observe the expected RED checkpoint

**Files:**

- Read: tests/unit/sqlite-service.test.ts, this plan, and the existing shared/telemetry types.
- Write: none.

**Interfaces:**

- Consumes: the test-only RED contract with src/main/sqlite-service.ts absent.
- Produces: complete evidence that the focused test fails for the missing production module, not because the test is malformed or because a hidden fallback exists.

- [ ] Step 1: Dispatch one fresh RED tester after root accepts Task 1.

The tester runs only:

~~~powershell
npx vitest run tests/unit/sqlite-service.test.ts
~~~

Expected: non-zero because src/main/sqlite-service.ts is not yet present. The tester returns complete stdout/stderr and the exit code even if the command is unavailable or fails differently. It does not run any other command, write any file, read .env or scripts/install-node-lts.ps1, stage/commit/push/merge, or dispatch a child. Root accepts this evidence before Task 3.

### Task 3: Implement the smallest production SQLite service

**Files:**

- Create: src/main/sqlite-service.ts
- Read: tests/unit/sqlite-service.test.ts, src/shared/types.ts, src/main/telemetry.ts, and this plan.
- Do not modify: tests/unit/sqlite-service.test.ts after the RED handoff or any other path.

**Interfaces:**

- Consumes: the exact public contract and failing tests from Tasks 1–2.
- Produces: openSqlite(options): Result<SqliteService, SqliteFailure> with real DatabaseSync default behavior, stable failure/health/event metadata, and no hidden fallback or schema expansion.

- [ ] Step 1: Define the exact public types and internal constants.

Export SQLITE_SCHEMA_VERSION, SqliteFailureCode, SqliteFailure, SqliteHealth, SqliteServiceOptions, SqliteService, SqliteDatabaseDriver, SqliteDatabaseDriverFactory, and openSqlite exactly as specified. Keep the migration registry, DDL, stable reason/event maps, and default adapter unexported unless required by the public contract. Import Result and Telemetry as type-only imports.

- [ ] Step 2: Implement path validation and the real DatabaseSync adapter.

Validate the path before any driver call using typeof, trimmed emptiness, NUL detection, exact :memory: rejection, and only then path.isAbsolute. Do not call resolve, dirname plus mkdir, copy, relocation, or a fallback path. Wrap new DatabaseSync(dbPath), prepare(...).get/all/run, and close() in the narrow adapter. Do not stringify caught exceptions. Keep the adapter private and default to it when driverFactory is absent.

- [ ] Step 3: Implement safe telemetry and stable failure construction.

Build events only from fixed literals, enum values, expected version/name metadata, and stable reason tokens. Set module: sqlite and source: runtime on every event. Failed events use error_code=<SqliteFailureCode> with reason=cause=<SqliteFailureReason>; success reasons remain metadata-only. Wrap only the sink call so a throwing sink cannot change the SQLite outcome. Map each caught failure to one of the ten operational codes or the closed-state code; never include String(error), a stack, SQL, a path, a row, or an arbitrary reason.

- [ ] Step 4: Implement required pragma setup and verification.

Execute foreign keys first and require the verified enabled result. Execute WAL and require a case-insensitive wal result. Stop before schema/migration on either failure. Record only safe health metadata after verification; do not claim ready from a successful exec without checking the returned pragma value.

- [ ] Step 5: Implement exact schema inspection and row validation.

Inspect sqlite_master, PRAGMA table_info, PRAGMA index_list, PRAGMA foreign_key_list, and ordered version,name rows. Accept only the exact baseline shape and exact row metadata. Apply the specified precedence for malformed, gap, unknown-name, and future-version failures. Do not drop, alter, recreate, downgrade, or replace a present malformed table.

- [ ] Step 6: Implement transactional baseline migration.

When the table is absent or valid and empty, execute BEGIN IMMEDIATE, create only the exact baseline table, insert (1, 'foundation_baseline'), and COMMIT. On any begin/DDL/insert/commit failure, attempt ROLLBACK in a separate guarded operation, emit one stable migration failure, and return sqlite_migration_failed. Emit the migration success event only after commit and final row validation. Do not create any future or domain table.

- [ ] Step 7: Implement integrity check, ready health, and initialization cleanup.

Run PRAGMA integrity_check after final schema/row validation and require one ok result. Only then return a service with ready health. If any later step fails, best-effort close the adapter, emit sqlite_close with error_code=sqlite_close_failed and reason=cause=cleanup_close_failed only if that close fails, and preserve the primary failure result. Do not return a partially ready service.

- [ ] Step 8: Implement defensive health and idempotent close.

Store private health and the first close result. Return fresh copies from health() including a cloned failure object. On first successful close, emit sqlite_close success and set health to failed/sqlite_closed. On a close throw, emit sqlite_close failed with error_code=sqlite_close_failed and reason=cause=driver_close_failed, set health to failed/sqlite_close_failed, and retain that error. Later calls return a copy of the retained result without retrying, opening, or throwing.

- [ ] Step 9: Read the own source and RED test for self-review.

Perform no more than three self-review passes. Check exact public names/signatures, no dependency or package change, no :memory: connection, no directory creation, no fallback database, exact BEGIN IMMEDIATE/COMMIT/best-effort ROLLBACK, final integrity_check, full schema/row validation, all ten operational failure codes plus sqlite_closed, defensive copies, sink isolation, event privacy, and no Task 4/Task 6+ boundary drift. Return exact changed files, concise diff summary, complete output and exit code for every command actually run, and unresolved risks. The production worker runs no tests/build/typecheck/npx/npm command and performs no Git mutation.

### Task 4: Focused GREEN and regression verification

**Files:**

- Read: tests/unit/sqlite-service.test.ts, src/main/sqlite-service.ts, Task 4 telemetry files, and process state.
- Write: only ignored generated build output under out/ if npm run build produces it; no tracked file or source/test/config write.

**Interfaces:**

- Consumes: the accepted RED evidence, the production implementation, and the exact commands below.
- Produces: complete focused, full-suite, typecheck, build, and status evidence for root review.

- [ ] Step 1: Dispatch a different fresh GREEN/regression tester after root accepts the production implementation.

The tester runs these commands in order and no others:

~~~powershell
npx vitest run tests/unit/sqlite-service.test.ts
npm test
npm run typecheck
npm run build
git status --short
~~~

Expected: focused GREEN exits 0; full npm test exits 0; npm run typecheck exits 0 for Node and web; npm run build exits 0 for Electron main/preload/renderer; and git status --short shows no unapproved tracked changes while preserving the untracked installer. The tester returns complete stdout/stderr and exit code for every command, including unavailable or failed output. It does not rerun the RED checkpoint, modify source/tests/package/config, read .env or the installer, stage/commit/push/merge, or dispatch a child.

### Task 5: Root external review before integration

The interactive root performs the external review after each worker returns; this is not a worker self-review and is not a separate review role. Root does not run application tests or validation commands. Root accepts only when all of the following are evidenced:

- The documentation plan ends exactly with Plan complete, and AGENTS.md, PROGRESS.md, and DECISIONS.md consistently identify phase0-sqlite, Task 4 at dca1327, Task 5 planned/not started, sequential Tasks 3–5, blocked Phase 1, no setup requirement, .env metadata-only handling, and the untouched installer.
- The RED test is the first Task 5 application write and the focused RED failed because the production module was absent.
- The application diff is exactly tests/unit/sqlite-service.test.ts followed by src/main/sqlite-service.ts; no shared, package, dependency, build, config, runtime-model, boot, lifecycle, IPC, UI, schema, telemetry, or product boundary changed.
- Public types and signatures match the plan and existing Result/Telemetry seams exactly.
- The real adapter is node:sqlite DatabaseSync; injected driver use is narrow and limited to deterministic foreign-key, WAL, migration, integrity, and close failure tests.
- Path validation rejects the required invalid inputs without driver calls, relocation, parent-directory creation, alternate files, or in-memory fallback.
- The only created application table is exact app_migrations; migration 1 is exact foundation_baseline; all schema/row validation, future/gap/name behavior, no-downgrade/no-recreate rules, transactional statements, and final integrity check are test-backed.
- Health copies are defensive; close is idempotent; successful close is failed/sqlite_closed; close failure is visible through both health and telemetry; sink exceptions cannot gate SQLite.
- Every ignore/drop/failure/degrade surface has a stable metadata event or result reason; primary sqlite_open failures pair error_code=<SqliteFailureCode> with reason=cause=<SqliteFailureReason>; migration, integrity, driver-close, and cleanup-close failures use their exact cause tokens; and no raw exception, path, SQL, user content, secret, transcript, audio, memory/private context, image, or embedding is present.
- All twelve invariant IDs were checked, with direct attention to 1, 3, 8, 9, 10, 11, and 12; worker evidence is metadata-only.
- Windows evidence does not claim packaged macOS node:sqlite, TCC, Keychain, signing, or entitlement field verification.
- P0-D2/P0-D3/P0-D4 and Task 10 ownership remain later boundaries; no demo is claimed from unit tests.

## Complete invariant checklist for every implementation/test dispatch

Paste this complete checklist into every Task 0, Task 1, Task 2, Task 3, and Task 4/merged-main worker prompt. Workers report all IDs checked even when a particular invariant is not directly exercised by the SQLite unit.

1. Final transcripts, conversation audio, extracted memory values, and injected private context remain RAM-only; diagnostics contain metadata.
2. Face recognition proposes a candidate; private memory follows explicit verbal confirmation.
3. Guest and candidate profile IDs remain in Electron Main and never cross renderer/model tool boundaries.
4. A profile change closes the old session and confirms in a clean Persona+Master-only session before updating the agent.
5. Extraction writes to the owner snapshot taken at turn start.
6. Identity, naming, switching, group, sleep, and spell control turns skip personal-memory extraction.
7. A scene requires normalized exact full-transcript spell matching and one trigger per turn; approved presets alone control hardware.
8. Exactly one microphone owner exists at a time, with explicit release-then-acquire handoff.
9. Every ignore, drop, fallback, or degrade is visitor-visible or a metadata-only Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Model IDs come only from versioned configuration; a failed configured ID never silently substitutes another ID.
12. Credentials are read by Main through safeStorage; keys never enter renderer data, logs, telemetry, or exports.

## Exact command schedule and ownership

The current documentation worker runs none of the future implementation/test commands. The tester role owns every named execution; the root owns only the Git mutation sequence after external review.

| Checkpoint | Exact command(s) | Fresh worker owner | Required evidence |
|---|---|---|---|
| Plan static gate | The four Task 0 commands in order: tracked-file git diff --check; PowerShell trailing-whitespace check of the untracked plan; the existing rg required-marker scan; git status --short --branch --untracked-files=all | One fresh static-gate tester before RED | Complete stdout/stderr and exit code for each command; no Task 5 application file yet; installer preserved. |
| RED | npx vitest run tests/unit/sqlite-service.test.ts | One fresh RED tester after Task 1 | Non-zero missing-module failure; complete stdout/stderr and exit code. |
| Focused GREEN | npx vitest run tests/unit/sqlite-service.test.ts | A different fresh GREEN/regression tester after root accepts the production implementation | Exit 0; complete stdout/stderr and exit code. |
| Full test | npm test | Same GREEN/regression tester after focused GREEN | Exit 0; complete stdout/stderr and exit code. |
| Typecheck | npm run typecheck | Same GREEN/regression tester after full test | Exit 0 for Node and web; complete stdout/stderr and exit code. |
| Build | npm run build | Same GREEN/regression tester after typecheck | Exit 0 for main/preload/renderer; ignored out/ output only; complete stdout/stderr and exit code. |
| Status | git status --short | Same GREEN/regression tester after build | Complete output; no unapproved tracked changes; untracked installer preserved. |
| Merged-main full test | npm test | One fresh merged-main tester after root fast-forward merge | Exit 0; complete stdout/stderr and exit code. |
| Merged-main typecheck | npm run typecheck | Same merged-main tester | Exit 0 for Node and web; complete stdout/stderr and exit code. |
| Merged-main build | npm run build | Same merged-main tester | Exit 0; ignored out/ output only; complete stdout/stderr and exit code. |
| Merged-main status | git status --short | Same merged-main tester | Complete output; no unintended tracked change; installer remains untracked. |

The test-only and production implementers run no named application execution. The RED tester does not run GREEN/full commands; the GREEN tester does not rerun RED; the merged-main tester is a new worker distinct from both. A command that is unavailable or fails is returned in full, not summarized away. No worker reads .env or scripts/install-node-lts.ps1.

## Requirements-to-test matrix

| Requirement | RED/GREEN coverage | Root evidence gate |
|---|---|---|
| Exact public API and shared Result | Imports/uses all named exports and return branches | No signature drift or ad hoc result shape. |
| Main-only caller-supplied absolute path | Required options and invalid-path tests | No renderer/IPC/boot path and no default path. |
| Empty/NUL/non-absolute/:memory: rejection | One assertion per input class in exact precedence order; no driver call | :memory: maps to memory_path before not_absolute; no relocation or hidden fallback. |
| Real DatabaseSync default | Persistent happy/reopen/schema-only files | No alternate DB or dependency. |
| Foreign keys and WAL | Real health plus deterministic injected failures | Both pragma execution and verification are required. |
| Exact app_migrations shape | Real schema inspection and malformed-shape rejection | No domain/telemetry tables and no repair. |
| Baseline migration 1 | Empty-table/new-file create + exact row | Name foundation_baseline, no future schemas. |
| Contiguous/unknown/future rows | Real seeded 1,3, unknown name, version 2 cases | Stable invalid/too-new precedence. |
| Transaction and rollback | Injected begin/DDL/insert/commit failure with rollback tracking | BEGIN IMMEDIATE/COMMIT/best-effort ROLLBACK, no downgrade. |
| Integrity check | Real ok and injected malformed/non-ok/throw cases | Required final check before ready. |
| Health defensive copies | Top-level and nested mutation test | No path/handle/raw exception in health. |
| Close idempotence/failure | Real double close and injected close failure | Health and sqlite_close event visibility. |
| Telemetry isolation/privacy | Sink-throw test and stable metadata assertions, including failed-event error_code/reason=cause grammar and metadata-only success reasons | No raw error, path, SQL, content, or telemetry table. |
| Failure degradation | Every failure returns stable metadata without throwing | Later P0-D2 maps failure to Maintenance; no unrelated gate. |
| Platform boundary | Plan/process wording and worker scope | Windows result does not claim macOS field verification. |

## Dispatch envelopes

Each envelope below is a bounded worker prompt. The interactive root launches it only through the explicit profile-backed wrapper required by AGENTS.md; the worker never calls codex, delegates, or creates a review worker.

### Envelope A — static plan-gate tester

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "tester"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI tester described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: Before the SQLite RED worker is dispatched, perform the bounded static plan gate for the four named documentation files. Run only, in order, the exact git diff --check -- AGENTS.md PROGRESS.md DECISIONS.md command; `$bad = Select-String -LiteralPath 'docs/superpowers/plans/2026-08-19-phase0-task5-sqlite.md' -Pattern '[ \t]+$'; if ($bad) { $bad; exit 1 }; exit 0`; the existing rg required-marker scan; and git status --short --branch --untracked-files=all. Do not run npm, npx, node, Vitest, typecheck, build, or any application validation. Confirm the plan contains the exact public API, SQL/migration/event contracts, failed-event cause grammar, full invariant checklist, worker scopes, review gates, and final Plan complete line. Explicit non-goals: do not edit any file; do not read .env or scripts/install-node-lts.ps1; do not inspect credentials or user content; do not stage/commit/push/merge; do not dispatch a child.
write_scope: read-only; no files may be written
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/verification-before-completion/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 8, 9, 10, 11, 12
evidence: exact files inspected, complete stdout/stderr and exit code for every named read-only command, concise marker/result summary, installer-preservation and .env non-access confirmation, unresolved risks; metadata-only
self_review: read the own output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review
complete invariant checklist: paste the complete 1-12 checklist from the plan verbatim
~~~

### Envelope B — test-only RED implementer

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI implementer described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: Write the bounded SQLite RED contract in tests/unit/sqlite-service.test.ts only, exactly as specified in the Task 5 plan. Cover real persistent DatabaseSync happy/reopen/schema-only paths, path rejection, exact app_migrations shape/rows, required pragma outcomes, transaction/rollback, integrity, close, defensive health, telemetry sink isolation, and metadata privacy. Explicit non-goals: do not create src/main/sqlite-service.ts; do not modify shared types, telemetry, index/lifecycle, Task 3 files, package/dependency/build/config files, IPC, preload, renderer, product docs, skills, .env, installer, ignored ledger, or any other path; do not run npm/npx/node/test/typecheck/build; do not stage/commit/push or dispatch a child.
write_scope: exactly tests/unit/sqlite-service.test.ts; read-only all other paths
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/test-driven-development/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 9, 10, 12
evidence: exact changed file, concise test-contract/diff summary, complete stdout/stderr and exit code for every command actually run, installer/.env non-access confirmation, unresolved risks; metadata-only
self_review: read the own diff/output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review
complete invariant checklist: paste the complete 1-12 checklist from the plan verbatim
~~~

### Envelope C — focused RED tester

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "tester"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI tester described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: After the test-only RED implementer returns and before production implementation, run only npx vitest run tests/unit/sqlite-service.test.ts. Expect the non-zero missing-module RED result because src/main/sqlite-service.ts is absent. Explicit non-goals: do not run any other command; do not modify files; do not add dependencies; do not read .env or scripts/install-node-lts.ps1; do not stage/commit/push/merge; do not dispatch a child; do not hide unavailable or failed output; do not inspect or record secrets/user content.
write_scope: read-only; no files may be written
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/verification-before-completion/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 9, 10, 12
evidence: exact test file inspected, complete stdout/stderr and exit code for the only named command, expected missing-module failure classification, installer/.env non-access confirmation, unresolved risks; metadata-only
self_review: read the own output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review
complete invariant checklist: paste the complete 1-12 checklist from the plan verbatim
~~~

### Envelope D — production implementer

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI implementer described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: After root accepts the RED evidence, implement the exact Main-only SQLite initialization and migration baseline in src/main/sqlite-service.ts. Use real node:sqlite DatabaseSync by default, the exact public API, required pragmas, exact app_migrations/foundation_baseline contract, transactional BEGIN IMMEDIATE/COMMIT/best-effort ROLLBACK, final integrity_check, defensive health, idempotent close, stable metadata-only telemetry, and the narrow injected driver factory solely for deterministic failure tests. Explicit non-goals: do not modify tests/unit/sqlite-service.test.ts after handoff; do not modify any other source/test/shared/package/dependency/build/config/resource/IPC/UI/product/skill/ledger path; do not add schemas beyond app_migrations; do not add path relocation, directory creation, :memory: fallback, alternate DB, downgrade, recreate, backup/restore, boot/lifecycle wiring, model resolver, credentials, .env, or installer changes; do not run npm/npx/node/test/typecheck/build; do not stage/commit/push or dispatch a child.
write_scope: exactly src/main/sqlite-service.ts; read-only all other paths
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/test-driven-development/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 9, 10, 11, 12
evidence: exact changed file, concise diff summary, complete stdout/stderr and exit code for every command actually run, installer/.env non-access confirmation, privacy/scope risks and unresolved ambiguities; metadata-only
self_review: read the own diff/output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review
complete invariant checklist: paste the complete 1-12 checklist from the plan verbatim
~~~

### Envelope E — focused GREEN/regression tester

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "tester"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI tester described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: After root accepts the RED evidence and production implementation, act as a different fresh GREEN/regression tester. Run exactly, in order: npx vitest run tests/unit/sqlite-service.test.ts; npm test; npm run typecheck; npm run build; git status --short. Return complete output and exit codes. Explicit non-goals: do not rerun the RED checkpoint; do not modify application/test/package/config source; do not add dependencies; do not read .env or scripts/install-node-lts.ps1; do not stage/commit/push/merge; do not dispatch a child; do not hide unavailable or failed output; do not inspect or record secrets/user content.
write_scope: read-only except ignored generated build output under out/ while npm run build executes; no tracked files or other writes
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/verification-before-completion/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 9, 10, 11, 12
evidence: exact files inspected, complete stdout/stderr and exit code for every named command, focused/full/typecheck/build/status result, generated-output scope, installer/.env non-access confirmation, unresolved risks; metadata-only
self_review: read the own output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review
complete invariant checklist: paste the complete 1-12 checklist from the plan verbatim
~~~

### Envelope F — fresh merged-main tester

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "tester"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI tester described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: After the interactive root fast-forwards phase0-sqlite into main and before pushing main, act as a fresh merged-main tester distinct from the RED and GREEN testers. Run exactly, in order: npm test; npm run typecheck; npm run build; git status --short. Verify the merged tree retains Task 4 evidence and the Task 5 SQLite contract. Explicit non-goals: do not run the focused or RED checkpoint; do not modify application/test/package/config source; do not add dependencies; do not read .env or scripts/install-node-lts.ps1; do not stage/commit/push/merge; do not dispatch a child; do not hide unavailable or failed output; do not inspect or record secrets/user content.
write_scope: read-only except ignored generated build output under out/ while npm run build executes; no tracked files or other writes
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/verification-before-completion/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 9, 10, 11, 12
evidence: exact merged files inspected, complete stdout/stderr and exit code for every named command, merged-main test/typecheck/build/status result, installer/.env non-access confirmation, unresolved risks; metadata-only
self_review: read the own output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review
complete invariant checklist: paste the complete 1-12 checklist from the plan verbatim
~~~

## Exact intentional Git instructions

Workers must not execute any of these commands. The interactive root may run them only after the corresponding external review gate accepts the evidence.

After the root accepts this documentation/process update and the static plan gate, stage exactly the four named planning files on phase0-sqlite:

~~~powershell
git add -- AGENTS.md PROGRESS.md DECISIONS.md docs/superpowers/plans/2026-08-19-phase0-task5-sqlite.md
git commit -m "docs: plan Phase 0 Task 5 sqlite baseline"
git push origin phase0-sqlite
~~~

After the RED/GREEN workers and root review accept the implementation, stage exactly the two Task 5 application files:

~~~powershell
git add -- tests/unit/sqlite-service.test.ts src/main/sqlite-service.ts
git commit -m "feat: add SQLite initialization baseline"
git push origin phase0-sqlite
~~~

After the branch push, the root performs the sequential integration:

~~~powershell
git switch main
git merge --ff-only phase0-sqlite
~~~

The root then dispatches Envelope F. Only after root accepts complete merged-main npm test, npm run typecheck, npm run build, and git status --short evidence does it push the integrated tip:

~~~powershell
git push origin main
~~~

The root records exact commit IDs, file counts, test counts/statuses, typecheck/build exit codes, warnings, installer status, .env metadata boundary, platform limitation, and unresolved risks. No worker stages, commits, pushes, merges, or claims a demo.

## Integration gate

Task 5 is accepted only when all are true:

1. Task 4 remains accepted and pushed at dca1327 with focused telemetry 21/21, full 8 files / 113 tests, Node plus web typecheck exit 0, and Electron Vite build exit 0 recorded in process state.
2. The four planning files are mutually consistent, the plan ends with Plan complete, and the exact Task 5 branch/status/order boundary is recorded without changing historical records.
3. The RED test was observed failing for the absent production module, then the focused GREEN test, full npm test, full npm run typecheck, and npm run build tester gates all exit 0 with complete evidence.
4. The implementation diff contains exactly tests/unit/sqlite-service.test.ts followed by src/main/sqlite-service.ts; no dependency, package, build, config, shared, renderer, boot, lifecycle, IPC, UI, product, or later-schema change is present.
5. The service opens only caller-supplied absolute persistent paths, uses real DatabaseSync by default, verifies foreign keys/WAL/integrity, creates only exact app_migrations with foundation_baseline, and rejects all malformed/future/no-downgrade cases.
6. Health is defensive and metadata-only, close is idempotent, close failure is visible through health and telemetry, sink exceptions cannot gate SQLite, and every failure has a stable code plus mechanically matched reason=cause metadata without raw content.
7. Root intentionally commits and pushes phase0-sqlite, fast-forwards main, accepts fresh merged-main test/typecheck/build/status evidence, and only then pushes main.
8. No Phase 0 demo is claimed by Task 5; P0-D2/P0-D3/P0-D4 remain later consumers and Task 10 remains the demo/record owner. Phase 1 remains blocked.

## Task 6 handoff

After Task 5 is integrated and accepted, the next sequential application task remains Task 6, subject to the root’s fresh plan and review. Later owners may consume SqliteService.health() and the stable SQLite telemetry events, but they must not move telemetry into SQLite or bypass the Main-owned path/health boundary. Domain schema, boot/lifecycle mapping, registry, model resolver, backup/restore, identity, and memory work remain in their explicitly assigned later tasks.

Plan complete
