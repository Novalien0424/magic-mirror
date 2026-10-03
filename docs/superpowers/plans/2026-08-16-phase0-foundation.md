# Phase 0 — Foundation / Visible Skeleton Implementation Plan

> **SUPERSEDED BASELINE NOTICE — 2026-08-19:** This is the historical Phase 0
> foundation plan. Its old `AppSnapshot.activeProfileId`, all-domain SQLite
> schema, `phase-tests.json` persistence, “lifecycle left starting” smoke
> wording, and inline implementation bodies are retained for traceability only
> and are superseded by the accepted Task 2–9 plans, the accepted SQLite
> baseline, and the corrected Task 10 handoff. Tasks 1–9 are accepted; the
> original Task 10 plan is `255008e`, correction plan `9adcca4`, Task 10 is
> unimplemented, and Phase 1 remains blocked. Do not use this historical body
> as a current implementation contract.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every implementation dispatch MUST paste the invariants table from `.claude/skills/mm-invariants/SKILL.md` and follow TDD (test first, watch it fail, minimal code, watch it pass).

**Goal:** A always-visible Electron mirror skeleton: 7-state lifecycle, Console (6 pages), metadata-only telemetry, config/SQLite/credential services, OfflineLoop playback, and mocks for every future module — demoable as P0-D1…P0-D5.

**Architecture:** One Electron modular monolith. Main owns lifecycle/config/DB/telemetry/devices; two renderer windows (Mirror kiosk + Console) talk over typed, sender-validated IPC. All external services and hardware are mocks in Phase 0.

**Tech Stack:** Electron `43.4.1` for the corrected Task 10 pin, electron-vite 5,
TypeScript, React, XState v5, `node:sqlite` (WAL pragma), zod v4,
write-file-atomic 8, vitest. The verified backup API is module-level
`import { backup } from 'node:sqlite'; await backup(sourceDb, backupPath, options)`
and returns a Promise; there is no `db.backup` instance method.

**Spec:** `docs/Magic_Mirror_Implementation_Plan_v0.3.md` §5 (Phase 0), `docs/Magic_Mirror_Tech_Spec_v0.3.md` §3–§6, §13–§14, `docs/Magic_Mirror_PRD_v0.3.md` US-FOUND-001 / US-DEV-001. Consult skills: `mm-electron-foundation` (mandatory for every task), `mm-invariants` (paste into every dispatch).

## Global Constraints

- Electron pinned `43.x`; SQLite is `node:sqlite`; WAL via `PRAGMA journal_mode = WAL`.
- No model ID literals in `src/` — model IDs live ONLY in packaged config fixtures (`config/default.json`) and test fixtures. Automated scan enforces this (Task 9).
- Telemetry events are metadata-only; the emit path mechanically rejects content-bearing keys (Task 4). Never persist transcripts, audio, prompts, memory content, images, embeddings, or credentials.
- Every fallback/drop/ignore emits a `MirrorEvent` with `reason`. Simulator-originated events carry `source: 'simulator'`.
- No black screen, ever: renderer crash → recreate window; core failure → Maintenance screen with diagnostic code.
- Dev machine is Windows; macOS-only behavior (simpleFullscreen, LaunchAgent, Keychain backend, TCC) sits behind `process.platform` guards and ships as authored resources verified on the Mac later. Everything in this plan must run and test on Windows.
- Boot smoke contract: env `MIRROR_SMOKE_MS=<n>` makes the app auto-quit after n ms with exit code 0 only if both windows loaded and lifecycle is exactly `dormant` or `maintenance`; exit 2 otherwise. Demo scripts rely on this. `starting` and all other nonterminal lifecycle states have stable failure reasons.
- Commits: conventional prefix per task (`feat:`/`test:`/`chore:`), one commit per green TDD cycle minimum, plus the trailer lines mandated in the session harness.

## Shared Interfaces (single source: `src/shared/types.ts` — Task 1 creates it verbatim)

```ts
export type LifecycleState =
  | 'starting' | 'dormant' | 'activating' | 'active'
  | 'suspending' | 'offlineLoop' | 'maintenance';

export type ModuleId =
  | 'app' | 'openai' | 'wake' | 'audio' | 'camera' | 'identity' | 'memory'
  | 'avatar' | 'lighting' | 'fog' | 'music' | 'sqlite' | 'config' | 'telemetry';

export type ModuleStatus = 'not_implemented' | 'ready' | 'degraded' | 'failed';
export type OpStatus = 'success' | 'degraded' | 'failed';

export interface MirrorEvent {
  time: string;                 // ISO-8601, set by Telemetry.emit
  module: ModuleId;
  event: string;                // snake_case, e.g. 'lifecycle_transition'
  status: OpStatus | 'info';
  duration_ms?: number;
  error_code?: string;
  session_id?: string;
  scene_id?: string;
  reason?: string;
  source?: 'runtime' | 'simulator' | 'contract_test';
}

export interface AiModelRoleConfig { modelId: string; note?: string }
export interface AiModelsConfig {
  realtimeDialogue: AiModelRoleConfig;
  inputTranscription: AiModelRoleConfig;
  memoryExtractor: AiModelRoleConfig;
}

export interface MirrorConfig {
  configVersion: number;                     // bumped on every publish
  persona: { name: string; instructions: string };
  voice: string;
  idleSeconds: number;                       // 300 in production config
  aiModels: AiModelsConfig;
  wake: { phrase: string; modelVersion: string };
  faceModel: { detectorId: string; recognizerId: string };
  assets: { offlineLoopVideo: string; avatarDir: string; musicDir: string };
  spells: unknown[];                         // Phase 4 owns the shape
  scenes: unknown[];
  adapters: { lighting: 'mock' | 'physical'; fog: 'mock' | 'physical'; music: 'mock' | 'physical' };
}

export interface FieldError { path: string; message: string }
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface ConfigDiff { changed: Array<{ path: string; from: unknown; to: unknown }>; nonModelChanges: boolean }

export interface SessionModelSnapshot {
  configVersion: number; fingerprint: string;
  realtimeDialogue: string; inputTranscription: string; voice: string;
  takenAt: string;
}
export interface JobModelSnapshot {
  configVersion: number; fingerprint: string; memoryExtractor: string; takenAt: string;
}

export interface AppSnapshot {
  lifecycle: LifecycleState;
  appVersion: string; buildCommit: string; configVersion: number;
  modules: Record<ModuleId, ModuleStatus>;
  activeProfileId: string | 'anonymous' | null;
  realtimeSessionId: string | null;
  sessionGeneration: number;
  lastError: { module: ModuleId; error_code: string; time: string } | null;
  maintenance: { code: string; detail: string } | null;   // set when lifecycle==='maintenance'
}

export type SimulatorCommand =
  | { type: 'wake' }
  | { type: 'cloud_failure' } | { type: 'cloud_recovery' }
  | { type: 'camera_result'; faces: 0 | 1 | 'multiple' }
  | { type: 'avatar_state'; state: string }
  | { type: 'scene_result'; sceneId: string; status: OpStatus }
  | { type: 'sqlite_failure' }
  | { type: 'sleep' };

export interface PhaseTestRecord {
  demoId: string;               // 'P0-D1' ...
  build: string; time: string; result: 'passed' | 'failed' | 'mock_passed';
  note?: string;
}
```

Lifecycle machine events (Task 2): `LOCAL_READY, LOCAL_CORE_FAILED, WAKE_DETECTED, REALTIME_READY, CLOUD_FAILED, LOCAL_AUDIO_FAILED, IDLE_TIMEOUT, SLEEP_REQUESTED, MEDIA_CLOSED, RECOVERY_PASSED, RETRY_STARTUP` — transitions exactly per Tech Spec §5 mermaid diagram, nothing extra.

## File Structure

```
electron.vite.config.ts            # main/preload/renderer configs; node:sqlite external
package.json / tsconfig*.json
config/default.json                # packaged default config incl. FAKE model IDs (fixtures)
src/shared/types.ts                # verbatim from above (Task 1)
src/main/index.ts                  # boot, windows, smoke-mode, crash recovery (T1, wired T8)
src/main/lifecycle.ts              # XState v5 machine + createLifecycleActor()      (T2)
src/main/config/schema.ts          # zod schema + validate()                          (T3)
src/main/config/service.ts         # ConfigService                                    (T3)
src/main/credentials.ts            # safeStorage wrapper                              (T3)
src/main/telemetry/telemetry.ts    # ring buffer + rotating JSONL + guards            (T4)
src/main/db/index.ts               # openDb/migrate/integrityCheck                    (T5)
src/main/db/migrations/001_baseline.sql                                              (T5)
src/main/modules/registry.ts       # ModuleRegistry (statuses, mocks)                 (T6)
src/main/modules/mocks.ts          # 8 mock modules + SceneAdapter mocks              (T6)
src/main/models/resolver.ts        # fingerprint(), createSessionSnapshot/JobSnapshot (T7)
src/main/ipc.ts                    # typed handlers + sender validation               (T8)
src/preload/mirror.ts / console.ts                                                   (T8)
src/renderer/mirror/               # visitor UI: state screens, OfflineLoop, Maintenance (T8)
src/renderer/console/              # 6 pages: Overview/Simulator/Events/PhaseTests/Config/Models (T9)
assets/offline/offline-loop.mp4    # placeholder seamless loop (generated, labeled placeholder)
resources/macos/{Info.plist.additions.xml, entitlements.plist, com.magicmirror.launchagent.plist} (T1)
tests/unit/*.test.ts               # vitest per task
scripts/p0-demos.mjs               # P0-D1..D5 runner (T10)
PROGRESS.md                        # created T1, updated every task
```

Task DAG: T1 → {T2, T3, T4, T5} in parallel → {T6, T7} in parallel → T8 → T9 → T10.

---

### Task 1: Scaffold, two windows, never-black-screen boot

```text
Story / Phase:        US-FOUND-001 / Phase 0
User-visible outcome: `npm run dev` opens the Mirror window showing a "Starting" screen that
                      settles into a placeholder Dormant screen; Ctrl+Shift+D opens Console
                      window (placeholder). Renderer kill → window auto-recreates. Smoke mode
                      exits 0.
Files / modules:      package.json, electron.vite.config.ts, tsconfig*, src/shared/types.ts,
                      src/main/index.ts, src/preload/*.ts, src/renderer/mirror/ (shell),
                      src/renderer/console/ (shell), resources/macos/*, PROGRESS.md
Console/telemetry:    none yet (Console shell only); boot logs MAIN_READY marker
Happy-path test:      smoke run exits 0; typecheck clean
Failure/fallback test: renderer 'render-process-gone' → window recreated once, exit still 0;
                      forced preload failure → smoke exits 2 (not hang, not black)
Explicit non-goals:   lifecycle logic, IPC surface, kiosk fullscreen polish, packaging/signing
Demo step affected:   P0-D1 (start), P0-D4 (restart survives)
```

**Interfaces:** Produces `src/shared/types.ts` VERBATIM from Shared Interfaces above; produces `createWindows()`, `MIRROR_SMOKE_MS` contract. Consumes nothing.

- [x] Scaffold electron-vite + React + TS; pin `electron@43`, add `xstate@5`, `zod@4`, `write-file-atomic@8`, `vitest`. Add `node:sqlite` to main rollup externals.
- [x] Write `src/shared/types.ts` verbatim. `npm run typecheck` passes.
- [x] Failing test `tests/unit/smoke-contract.test.ts`: spawn `npm run dev` with `MIRROR_SMOKE_MS=8000`, expect exit 0 and stdout containing `MAIN_READY` (guard with 60s timeout; skip-if-CI flag not allowed — it must run locally).
- [x] Implement main: create Mirror window (fullscreen on win32 dev = maximized frameless; `simpleFullscreen` under `process.platform==='darwin'` guard), Console window hidden until `Ctrl+Shift+D`, `render-process-gone` → log + recreate once, smoke-mode auto-quit. Watch test pass.
- [x] Failure test: env `MIRROR_FORCE_RENDERER_FAIL=1` makes mirror preload throw → smoke exits 2. Implement the guard; watch pass.
- [x] Author `resources/macos/` files (Info.plist additions with `NSMicrophoneUsageDescription`/`NSCameraUsageDescription`, entitlements with `com.apple.security.device.*`, LaunchAgent plist with `KeepAlive={SuccessfulExit=false}`) — content per `mm-electron-foundation`; mark "field-verified in Phase 7" in comments.
- [x] Create `PROGRESS.md` (state: Phase 0 in progress, task table). Commit. *(Task 1 done + reviewed 2026-08-16 — commits 0aa6a84..8771d32; see SDD ledger.)*

### Task 2: Lifecycle state machine

```text
Story / Phase:        US-FOUND-001 / Phase 0
User-visible outcome: Pure module: 7 states, legal transitions only, context per Spec §5.1
Files / modules:      src/main/lifecycle.ts, tests/unit/lifecycle.test.ts
Console/telemetry:    emits 'lifecycle_transition' (with from/to in reason) and
                      'lifecycle_event_ignored' (illegal event + reason) via injected Telemetry
Happy-path test:      full P0-D1 path starting→dormant→activating→active→suspending→dormant
Failure/fallback test: CLOUD_FAILED in active → offlineLoop; LOCAL_CORE_FAILED anywhere → maintenance;
                      illegal event (e.g. WAKE_DETECTED in active) ignored + telemetry event, no throw
Explicit non-goals:   timers (real 300s idle is Phase 2), parallel regions, epochs
Demo step affected:   P0-D1, P0-D2
```

**Interfaces:** Consumes `Telemetry` (Task 4 — inject as `{ emit(e): void }`, so T2/T4 stay parallel). Produces `createLifecycleActor(deps: { telemetry: Pick<Telemetry,'emit'> }): { send(evt), getState(): LifecycleState, getContext(): LifecycleContext, subscribe(cb) }` with `LifecycleContext = { activationId: string|null, realtimeSessionId: string|null, sessionGeneration: number, activeProfileId: string|'anonymous'|null, lastInteractionAt: string|null, sceneInvocationId: string|null }`.

- [ ] Failing tests first: table-driven legal transitions (every edge in Spec §5 mermaid), the two failure paths, illegal-event ignore+telemetry, context updates (WAKE_DETECTED assigns new activationId; MEDIA_CLOSED clears owner/session; entering offlineLoop clears owner + bumps sessionGeneration).
- [ ] Implement with XState v5 `setup().createMachine()`; watch pass. Commit.

### Task 3: ConfigService + credentials

```text
Story / Phase:        US-DEV-001, FR-FOUND-01 / Phase 0
User-visible outcome: active/draft/previous.json lifecycle with atomic writes, validation,
                      publish/rollback + diff; safeStorage credential wrapper
Files / modules:      src/main/config/{schema.ts,service.ts}, src/main/credentials.ts,
                      config/default.json, tests/unit/{config.test.ts,credentials.test.ts}
Console/telemetry:    'config_published' | 'config_rollback' | 'config_invalid' (field paths in
                      reason) | 'config_previous_used' events via injected telemetry
Happy-path test:      first boot materializes active.json from packaged default; updateDraft+publish
                      bumps configVersion, moves old active→previous, diff lists changes and flags
                      nonModelChanges
Failure/fallback test: invalid draft → publish returns FieldError[], active untouched (no partial
                      publish); corrupted active.json at load → falls back to previous.json +
                      'config_previous_used'; both missing → Result error the boot path maps to
                      Maintenance
Explicit non-goals:   Console UI (T9), model snapshot semantics (T7), real API keys
Demo step affected:   P0-D4, P0-D5 (data layer)
```

**Interfaces:** Produces `createConfigService(dir, telemetry): ConfigService` per shared types (`active/draft/fingerprint/updateDraft/publish/rollbackToPrevious/diff`); `fingerprint = sha256(canonicalJson(cfg))` — Task 7 reuses this exact function from `service.ts` export `canonicalFingerprint(cfg)`. Produces `credentials.ts`: `storeApiKey(s): Promise<Result<void,string>>`, `readApiKey(): Promise<Result<string,'unavailable'|'missing'>>` over `safeStorage` (DPAPI on win32, Keychain on darwin — same API); plaintext never returned to renderers, never written to config/telemetry.
`config/default.json` model IDs are FAKE fixtures: `fixture-realtime-model-a`, `fixture-transcribe-model-a`, `fixture-extractor-model-a` (P0-D5 requires fake IDs; real IDs enter config in later phases).

- [ ] Failing tests for every behavior above (use temp dirs; corrupt files by truncating mid-JSON). Include: credential round-trip, and a test asserting the plaintext key never appears in any file under the temp config dir after store.
- [ ] Implement schema (zod) + service (write-file-atomic; write draft/active/previous as three files; canonical JSON = sorted keys). Watch pass. Commit.

### Task 4: Telemetry (metadata-only, non-blocking)

```text
Story / Phase:        US-DEV-001, FR-DEV-01/03 / Phase 0
User-visible outcome: RAM ring (2000) + rotating JSONL (5MB × 5 files) under diagnostics/;
                      queue 1000, drop-oldest + counter; content guard
Files / modules:      src/main/telemetry/telemetry.ts, tests/unit/telemetry.test.ts
Console/telemetry:    IS the telemetry; exposes droppedCount() and contentRejectedCount()
Happy-path test:      emit → appears in recent() with ISO time; JSONL line written; rotation at
                      size cap keeps ≤5 files
Failure/fallback test: queue overflow drops oldest-unwritten + increments droppedCount, emit never
                      blocks/throws; write failure (dir made read-only / injected fs error) →
                      hot path unaffected, counter rises; event containing forbidden keys
                      (transcript|text|audio|prompt|content|image|embedding|apiKey) or >500-char
                      string values → rejected, contentRejectedCount++, 'telemetry_content_rejected'
                      meta-event emitted once per offender module
Explicit non-goals:   external observability stacks, Console Events UI (T9)
Demo step affected:   P0-D3
```

**Interfaces:** Produces `createTelemetry(dir): Telemetry` = `{ emit(e: Omit<MirrorEvent,'time'>): void; recent(q?: {module?, status?, page?, pageSize?}): MirrorEvent[]; droppedCount(): number; contentRejectedCount(): number; flush(): Promise<void> }`. All other tasks inject this.

- [ ] Failing tests for every behavior above (rotation via tiny size cap in test config; overflow via 2000+ rapid emits with a stalled writer).
- [ ] Implement (async writer loop, `flush()` for tests). Watch pass. Commit.

### Task 5: SQLite + migrations

> **SUPERSEDED:** The historical all-domain schema shown below is not the
> accepted Task 5 contract. Task 5 accepts only the Main-owned migration
> baseline and `app_migrations` boundary recorded in `DECISIONS.md`; do not
> reopen or broaden that schema here. The module-level `node:sqlite` backup
> contract is `backup(sourceDb, backupPath, options): Promise`.

```text
Story / Phase:        US-FOUND-001, FR-MEM-01 (skeleton) / Phase 0
User-visible outcome: node:sqlite database with WAL + baseline schema + integrity check
Files / modules:      src/main/db/index.ts, src/main/db/migrations/001_baseline.sql,
                      tests/unit/db.test.ts
Console/telemetry:    'db_opened' | 'db_migrated' (applied count) | 'db_open_failed' |
                      'db_integrity_failed' events
Happy-path test:      fresh open → migrate applies 001, app_migrations row written, WAL mode on,
                      re-migrate is a no-op; integrityCheck ok
Failure/fallback test: corrupted file (write garbage bytes) → openDb/integrityCheck returns error
                      Result (boot maps it to Maintenance); migration failure mid-script rolls
                      back (transaction) leaving version unchanged
Explicit non-goals:   real data access APIs (later phases), backup/restore (Phase 7)
Demo step affected:   P0-D2 (sqlite failure → Maintenance), P0-D4
```

**Interfaces:** Produces `openDb(path): Result<DatabaseSync, string>`, `migrate(db): Result<number, string>`, `integrityCheck(db): Result<'ok', string>`. `001_baseline.sql` creates: `app_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)`, `guests(id TEXT PRIMARY KEY, call_name TEXT UNIQUE NOT NULL, created_at TEXT)`, `enrollment_images(id TEXT PRIMARY KEY, guest_id TEXT REFERENCES guests(id), rel_path TEXT, sha256 TEXT, captured_at TEXT, quality REAL, crop_meta TEXT, consent_at TEXT)`, `face_embeddings(id TEXT PRIMARY KEY, guest_id TEXT, source_image_id TEXT, detector_id TEXT, recognizer_id TEXT, detector_sha256 TEXT, recognizer_sha256 TEXT, preprocess_version TEXT, dimension INTEGER, created_at TEXT)`, `visit_summaries(id TEXT PRIMARY KEY, guest_id TEXT, summary TEXT, visited_at TEXT)`, `guest_memories(id TEXT PRIMARY KEY, guest_id TEXT, kind TEXT CHECK(kind IN ('recent','durable')), subject_key TEXT, value TEXT, status TEXT CHECK(status IN ('active','superseded','disabled')), created_at TEXT, superseded_by TEXT)`, `master_memory(id TEXT PRIMARY KEY, content TEXT, status TEXT CHECK(status IN ('active','disabled')), updated_at TEXT)`. (Embedding columns already carry the v0.3.1 detector+recognizer pair.)

- [ ] Failing tests per behaviors; implement; watch pass. Commit.

### Task 6: Module registry + mocks

```text
Story / Phase:        US-DEV-001, FR-DEV-03 / Phase 0
User-visible outcome: every future module reports not_implemented/ready/degraded/failed; 8 mocks
                      respond to simulator commands with visible results + events
Files / modules:      src/main/modules/{registry.ts,mocks.ts}, tests/unit/modules.test.ts
Console/telemetry:    every mock action emits an event with source:'simulator'; failures carry
                      reason; registry snapshot feeds AppSnapshot.modules
Happy-path test:      registry lists all ModuleIds with statuses; simulate scene_result success →
                      lighting mock emits success event; statuses update
Failure/fallback test: fog mock failure → fog event 'failed' + registry fog:'degraded', lighting
                      and registry others UNCHANGED (degrade-not-gate proven by assertion);
                      unknown simulator command → rejected with reason event, no throw
Explicit non-goals:   real adapters, scene timelines (Phase 4), any hardware
Demo step affected:   P0-D1, P0-D2, P0-D3
```

**Interfaces:** Consumes Telemetry (T4). Produces `createModuleRegistry(telemetry): { snapshot(): Record<ModuleId, ModuleStatus>; setStatus(id, status): void; handleSimulator(cmd: SimulatorCommand): OpStatus }` and mock `SceneAdapter` impls per Tech Spec §12.4 signature (`health/execute/stopAll`). Lifecycle wiring of `cloud_failure`→CLOUD_FAILED etc. happens in T8, not here — registry only returns which lifecycle event (if any) a command implies: `handleSimulator` returns `{ op: OpStatus; lifecycleEvent?: string }`.

- [ ] Failing tests per behaviors; implement; watch pass. Commit.

### Task 7: AI model settings resolver + snapshots

```text
Story / Phase:        US-DEV-001 (Models page data), Impl Plan §3.2 Models / Phase 0
User-visible outcome: three-role model config flows Draft→Published→Runtime with frozen
                      per-session/per-job snapshots and full-diff publish/rollback (P0-D5 core)
Files / modules:      src/main/models/resolver.ts, tests/unit/models.test.ts
Console/telemetry:    'model_config_published' | 'model_config_rollback' (fingerprints in reason),
                      'mock_contract_test' with source:'simulator' and result 'Mock passed'
Happy-path test:      createSessionSnapshot(active) freezes {realtimeDialogue, inputTranscription,
                      voice, configVersion, fingerprint}; mock session factory receives exactly the
                      draft-edited fixture IDs after publish — but an ALREADY-CREATED mock session
                      keeps its old snapshot (P0-D5 boundary); next created session gets new revision
Failure/fallback test: invalid draft (bad model field) → publish rejected, Active unchanged, no
                      partial state; mock contract failure → 'Mock failed' recorded, Active
                      unchanged; rollback shows diff including non-model changes flag
Explicit non-goals:   real OpenAI calls (Phase 1 contract tests), Models page UI (T9)
Demo step affected:   P0-D5
```

**Interfaces:** Consumes ConfigService (T3, incl. `canonicalFingerprint`). Produces `createSessionSnapshot(cfg: MirrorConfig): SessionModelSnapshot`, `createJobSnapshot(cfg): JobModelSnapshot`, `createMockSessionFactory(getActive: () => MirrorConfig): { start(): { snapshot: SessionModelSnapshot } }`, `runMockContractTest(draft: MirrorConfig): Result<'mock_passed', FieldError[]>`.

- [ ] Failing tests per behaviors (snapshot boundary test is the heart: create session → publish new draft → assert old session snapshot unchanged AND new session uses new fingerprint).
- [ ] Implement; watch pass. Commit.

### Task 8: Boot wiring, IPC, Mirror visitor UI + OfflineLoop

```text
Story / Phase:        US-FOUND-001, US-OUTAGE-001 (visual path only) / Phase 0
User-visible outcome: real boot sequence: config→db→telemetry→registry→lifecycle; Mirror window
                      renders per-state screens incl. seamless OfflineLoop video and Maintenance
                      screen with diagnostic code; simulator drives it end to end
Files / modules:      src/main/index.ts (wire), src/main/ipc.ts, src/preload/*.ts,
                      src/renderer/mirror/**, assets/offline/offline-loop.mp4 (placeholder),
                      tests/unit/ipc.test.ts, tests/unit/boot.test.ts
Console/telemetry:    'app_boot' (duration), 'offline_loop_started/stopped',
                      'asset_validation_failed', 'stale_ipc_sender_rejected'
Happy-path test:      boot with healthy temp dirs → lifecycle dormant, AppSnapshot correct over
                      IPC; simulate cloud_failure → offlineLoop state + video screen flag;
                      recovery → dormant
Failure/fallback test: sqlite_failure sim → maintenance + diagnostic code (not offlineLoop —
                      failure-source separation per Spec §2.3); missing/corrupt offline video at
                      boot → 'asset_validation_failed' + Maintenance-still fallback path (screen
                      shows built-in still, never black); mirror-window sender calling a
                      console-only channel → rejected + event
Explicit non-goals:   Console pages (T9), real cloud probe, audio
Demo step affected:   P0-D1, P0-D2, P0-D4
```

**Interfaces:** Consumes T2–T7. Produces the IPC surface (channels: `state:get`, push `state:changed`; console-only: `console:simulate`, `console:events`, `console:phaseTests:*`, `console:config:*`, `console:models:*`) with sender validation helper `assertConsoleSender(event)`. Produces `bootSequence(paths): Promise<Result<AppContext, {code, detail}>>` (pure enough to unit test with temp dirs; maps each failure to Maintenance codes: `CFG_LOAD`, `DB_OPEN`, `DB_INTEGRITY`, `ASSET_OFFLINE_LOOP`). Generate the placeholder loop video with ffmpeg if available, else commit a tiny generated .mp4 fixture; label placeholder in filename and PROGRESS.md.

- [ ] Failing tests: bootSequence happy/failure matrix; IPC sender validation; then wire renderer screens (React: one component per lifecycle state; OfflineLoop uses `<video loop muted autoplay>` with preload + decode check via `HTMLMediaElement.play()` promise at Starting).
- [ ] Verify smoke run still exits 0; simulate paths manually via a temporary main-process test hook (`MIRROR_SIM=cloud_failure` env for the boot test). Watch pass. Commit.

### Task 9: Console UI — 6 pages

> **SUPERSEDED:** The historical `phase-tests.json` store below is not the
> authoritative Phase 0 record contract. Task 10A owns SQLite phase-test rows
> and the Console reader; retain this body only as historical UI context.

```text
Story / Phase:        US-DEV-001 / Phase 0
User-visible outcome: Console window with Overview, Simulator, Events, Phase Tests, Config,
                      Models pages — every Phase 0 observation/action available in UI
Files / modules:      src/renderer/console/**, src/main/ipc.ts (extend), tests/unit/console-ipc.test.ts,
                      tests/unit/model-literal-scan.test.ts
Console/telemetry:    Phase Tests records persist via config dir JSON (phase-tests.json);
                      simulator buttons tag source:'simulator'
Happy-path test:      Events query paginates & filters by module/status; PhaseTests record/list
                      round-trips; Models page data shows Draft/Active/Runtime/Previous +
                      fingerprints + 'Pending next session' when draft differs
Failure/fallback test: unimplemented module cards render 'Not implemented' (asserted for wake/
                      camera/etc. from registry snapshot — never blank); publish with invalid
                      draft surfaces exact FieldError paths in UI state; model-literal scan test
                      FAILS if any src/ file outside config fixtures matches
                      /gpt-|sherpa-onnx-kws|sface|yunet|fixture-.*-model/ (proves P0 exit criterion)
Explicit non-goals:   auth/remote access, RAM transcript panel (Phase 1), real contract tests
Demo step affected:   P0-D3, P0-D5
```

**Interfaces:** Consumes T3–T8 IPC. Produces `phase-tests.json` store `{ records: PhaseTestRecord[] }` and the six React pages; Overview consumes `AppSnapshot`; Models consumes resolver outputs (T7).

- [ ] Failing tests (IPC handlers + the literal-scan test — write scan test FIRST; it should already pass, proving the constraint held, and it guards forever after).
- [ ] Implement pages (function components, minimal styling, keyboard shortcut focus). Watch pass. Commit.

### Task 10: P0 demo runner, exit criteria, tag

> **SUPERSEDED:** This original Task 10 body is retained as historical
> planning context only. The corrected source is
> `docs/superpowers/plans/2026-08-19-phase0-task10-demos-exit.md` after the
> accepted correction units. Task 10 remains unimplemented; no demo, Phase 0
> exit, or Phase 1 entry is claimed by this plan.

```text
Story / Phase:        US-FOUND-001 + US-DEV-001 acceptance / Phase 0
User-visible outcome: `node scripts/p0-demos.mjs` runs P0-D1..D5 programmatically where possible,
                      prints per-demo PASS/FAIL, writes PhaseTestRecords; PROGRESS.md updated;
                      git tag phase0
Files / modules:      scripts/p0-demos.mjs, PROGRESS.md, docs update if criteria deviate
Console/telemetry:    records land in phase-tests.json as build+time+result
Happy-path test:      D1 lifecycle walk (via simulator IPC in smoke app instance); D2 cloud→
                      offlineLoop + sqlite→maintenance, screenshot-free assertion via AppSnapshot;
                      D3 events queryable for every transition incl. fallback reasons; D4 restart
                      app → config/phase-tests/events readable; D5 model fixture edit→publish→
                      snapshot boundary (drives T7 via IPC)
Failure/fallback test: runner itself exits non-zero if any demo fails; 10-boot loop (smoke mode)
                      asserts 10/10 exit 0
Explicit non-goals:   30-min OfflineLoop soak on Windows dev (record as Mac-pending in
                      PROGRESS.md), packaging, Phase 1 anything
Demo step affected:   P0-D1..P0-D5, Exit Criteria
```

- [ ] Write runner (drives the app in smoke+sim mode over IPC or the `MIRROR_SIM` hook); run; fix what fails; record results.
- [ ] Update PROGRESS.md (verified state, Mac-pending items: OfflineLoop 30-min soak, macOS TCC/kiosk/LaunchAgent verification, 5×實機 boot). Commit; tag `v0.1.0-phase0`.

## Self-Review (done at planning time)

- Spec coverage: Impl Plan §5 Scope items map to T1 (shell/windows/error boundary/macOS resources), T2 (lifecycle), T3 (config three-file + credentials), T4 (telemetry), T5 (SQLite skeleton), T6 (all mocks), T7 (Models settings/snapshots/resolver), T8 (OfflineLoop preload + boot + Maintenance), T9 (Console §3.2 pages incl. Models cards), T10 (demos P0-D1..D5 + exit). Model-ID source scan → T9 test. "非原開發者可重複 P0-D1~D5" → T10 runner + PROGRESS.md.
- Placeholder scan: none — fixtures and fake IDs are named exactly; offline video is an explicitly labeled generated placeholder (venue asset arrives per Impl Plan §20).
- Type consistency: all cross-task names come verbatim from Shared Interfaces; `canonicalFingerprint` defined once (T3) and consumed (T7); `handleSimulator` return shape defined (T6) and consumed (T8).
```
