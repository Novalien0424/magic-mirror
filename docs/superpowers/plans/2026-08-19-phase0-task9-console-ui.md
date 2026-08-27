# Phase 0 Task 9 — Console UI Implementation Plan

> **For agentic workers:** Use the repository's fresh-worker dispatch contract and execute the three slices in order. Steps use checkbox (`- [ ]`) syntax for tracking. This plan authorizes planning only until the interactive root accepts each slice externally.

**Goal:** Complete the Phase 0 local Console's Overview, Simulator, Events, Config, Models, and Phase Tests read/display surfaces over Main-owned, sender-authorized, metadata-safe data contracts.

**Architecture:** Electron Main owns the Console data plane, Developer Mode decision, telemetry pagination, configuration mutation, model-resolution refresh, simulated runtime snapshots, and Phase Test record reads. The Console renderer receives narrow typed responses through Console-only IPC; the generic `AppSnapshot` and all Mirror channels remain unchanged in meaning and model-ID-free. The work is split into three sequential TDD slices so the observation/simulation path is usable before configuration/model mutation, and the Phase Tests page can display persisted results without owning their production.

**Tech Stack:** Electron 43, TypeScript 5.9, React 19, Vitest 4, existing `Telemetry`, `ConfigService`, `resolveModelSettings`, `createSessionModelSnapshot`, `createJobModelSnapshot`, `node:sqlite` baseline, and existing typed preload/IPC patterns. No new dependency.

**Base commit:** `f7a38371091aa0fb2fa99494dacd47286940cf67` — accepted Task 8 Boot, authorized IPC, and Mirror checkpoint.

**Story / phase IDs:** `US-DEV-001`, `FR-FOUND-01`, `FR-FOUND-03`, `FR-DEV-01`, `FR-DEV-02`, `FR-DEV-03`, Phase 0 Foundation / Console Increment, P0-D3 observability, and the P0-D5 model-settings data-flow consumer. Task 10 retains P0-D1–P0-D5 execution and recording.

**Authoritative anchors:** `docs/Magic_Mirror_PRD_v0.3.md` §9.1 and §11; `docs/Magic_Mirror_Tech_Spec_v0.3.md` §§6, 13.3, 13.4, and 14.1; `docs/Magic_Mirror_Implementation_Plan_v0.3.md` §§3.1–3.4, §4, and §5; `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md` sections B and C; accepted Task 7 model-settings plan; accepted Task 8 plan; canonical invariants 1–12.

## Mandatory rulings

The current task envelope and the following constraints are binding for every slice, worker, test, payload, and review checkpoint. They preserve the accepted Task 8 boundary and the product's privacy and ownership rules.

## Global Constraints

- The three slices are sequential and bounded: 9A Overview + Simulator + Events and the Main-owned Console data plane; 9B Config + Models and the Main refresh/snapshot contract; 9C Phase Tests read/display contract. No slice starts before the previous slice's tester-owned full validation and external root review.
- Every implementation/test dispatch uses `model: "gpt-5.6-luna"`, `reasoning_effort: "max"`, `fresh_worker: true`, exactly one role, exact named paths, metadata-only evidence, no more than three self-review passes, and an external root review after return. Workers do not dispatch children, create a review worker, commit, push, merge, tag, or edit process records.
- TDD is mandatory: the fresh implementer writes one focused failing test set with `apply_patch`; a fresh tester runs the exact RED command and records the expected nonzero result; a fresh implementer writes only the named production paths; a fresh tester runs focused GREEN plus exact diff/security/privacy checks; a fresh tester then runs the full verbose Vitest suite, Node/web typechecks, Electron build, and negative scans before root review.
- Task 8 tests are regression consumers and remain read-only. Do not edit `tests/unit/boot-ipc.test.ts` or any accepted Task 8 test in this plan. If a real Task 9 change exposes an actual Task 8 regression, stop and let root authorize a separate correction gate based on that failure; no test edit is pre-authorized here.
- `AppSnapshot`, `projectAppSnapshot`, Mirror bridge methods, Mirror IPC handlers, Mirror preload, Mirror renderer, telemetry records, logs, diagnostics, exports, and worker evidence remain model-ID-free. Model values may cross only through the new narrow Console-only, sender-authorized Models payload and its Models UI.
- `handleSimulator` and `SimulatorResult` retain their accepted shapes exactly. In particular, no `realtime_ready` public simulator command is added, and a disabled simulation returns the existing `{ op: 'success' | 'degraded' | 'failed'; lifecycleEvent?: string }` shape without a reason field.
- Developer Mode authority remains in Main. Default is enabled when `app.isPackaged === false` and disabled when `app.isPackaged === true`. The only optional startup override is the non-secret exact enum `enabled` or `disabled`, read in Main before the data plane is constructed; malformed values are ignored with a stable metadata-only reason. The renderer can display the resulting boolean and cannot set it.
- Every new Console IPC handler reuses `authorizeSender` with both the main-frame identity and the exact tracked `webContents.id`. Mirror senders, unknown senders, destroyed windows, non-main frames, and mismatched IDs receive stable rejection results and metadata events; no service object, `ipcRenderer`, filesystem, SQLite, `safeStorage`, credential, or raw exception crosses the bridge.
- Overview module health is observational and non-gating. It displays every module status, last success/error/degrade metadata, bounded `identityStatus` rather than profile/candidate IDs, and mock/simulator readiness labels. Audio and camera TCC fields are explicitly `not_checked` until a real macOS probe exists. A mock status never claims physical/provider readiness.
- Events use existing `Telemetry.readPage` only. Query input is exact-key, enum, integer, and size validated before the call; the maximum page is 200 and the returned rows are metadata-only. No Console query adds a second event store or external telemetry stack.
- `ConfigService` remains the sole owner of `active.json`, `draft.json`, `previous.json`, validation, atomic replacement, revision changes, compensation, publish, rollback, and full diff semantics. Task 9 wraps it in Main; it does not rewrite it or add a second persistence layer.
- Publish and Rollback require a Main-revalidated full diff confirmation containing the expected active revision, all changed paths, `nonModelChanges`, and a Main-generated digest. Invalid Draft or failed mock Test Draft leaves Active unchanged and blocks Publish. After either mutation Main re-reads and re-resolves the active configuration before publishing a fresh snapshot to Console/Mirror consumers.
- Existing simulated runtime snapshots are immutable. Publish/Rollback never mutate a current session/job snapshot. Only an explicit Developer Mode `Create next mock session/job` action creates new snapshots from the refreshed Active revision; evidence exposes `current`, `old`, and `new` labels without claiming a real provider or contract pass.
- The Config shell exposes only Phase 0-safe fields and state; it has no credential editor, remote-admin surface, login, backend, generic JSON editor, plugin framework, provider list, model marketplace, auto-latest selector, or multi-provider router.
- Developer Mode gates the public Simulator controls and explicit next mock session/job creation. `Test Draft` is a narrow Config preflight that validates the configured Draft through deterministic mock factories without changing runtime state; it remains a bounded Config action, is always labeled `mock_passed`/`source=simulator`, and never sets Developer Mode or invokes a provider.
- Phase Tests is read-only in Task 9. It may display an empty state or the latest validated metadata record supplied by a Main-owned reader, but it does not fabricate records, run demos, write durable records, prove restart persistence, execute P0-D1–P0-D5, check exit criteria, or create/tag a phase release. Those remain Task 10 ownership.
- No OpenAI credential, network, camera, microphone, physical device, packaged worker, target macOS Keychain/TCC/signing/entitlements, or `.env` value is required or accessed by Task 9. Windows results do not field-verify target macOS paths. LaunchAgent remains the only app-level restart owner; no `app.relaunch()` is added.
- No dependency is added. Existing React, TypeScript, Electron, Vitest, `Telemetry`, `ConfigService`, model resolver, and Main mocks are sufficient.

## Planned file topology

### 9A files — new and modified

- Create `src/shared/console-types.ts`: type-only Console response, Overview, Events query/page, and stable Console error contracts. This file is the only shared home for Task 9 Console payload types; the Models payload is explicitly marked Console-only.
- Create `src/main/console-data.ts`: Main-owned Overview/Events/Simulator facade, Developer Mode resolution, bounded telemetry projection, mock-readiness labeling, and stable unavailable/degraded results. It never exposes a service object.
- Create `tests/unit/console-data.test.ts`: RED/GREEN tests for Developer Mode, Overview, Events pagination/filtering, simulator gating, metadata reasons, and privacy sentinels.
- Create `tests/unit/console-ipc.test.ts`: RED/GREEN tests for Console channel registration, sender authorization, exact argument validation, Mirror denial, and narrow response shapes.
- Create `tests/unit/console-ui.test.ts`: RED/GREEN pure Console view-contract tests for page labels, Overview mock/TCC copy, Simulator disabled copy, and Events metadata-only columns.
- Modify `src/main/boot.ts`: construct the Main Console data plane, retain the packaging/override Developer Mode decision in Main, and expose only the Main-owned facade needed by IPC.
- Modify `src/main/ipc.ts`: add Overview/Events Console channels and guarded handlers while preserving all Task 8 handlers and `handleSimulator` return behavior.
- Modify `src/main/index.ts`: pass `app.isPackaged` and the bounded Main startup override to boot; pass the Main Console facade to IPC registration.
- Modify `src/shared/bridge.ts`: add only typed Console methods and channel-map entries; leave Mirror methods/model-free.
- Modify `src/preload/console.ts`: expose the named Console methods individually through `contextBridge`; never expose raw `ipcRenderer`.
- Modify `src/renderer/console/App.tsx` and `src/renderer/console/styles.css`: replace the shell with Overview, Simulator, and Events pages while retaining visible placeholders for later Task 9B/9C pages.

### 9B files — new and modified

- Create `src/main/console-config.ts`: Main-only safe Config view, exact Draft validation/merge, Test Draft mock contract, full diff digest/reconfirmation, atomic Publish/Rollback wrappers, model card projection, and current/old/new simulated session/job evidence.
- Create `tests/unit/console-config-models.test.ts`: ConfigService boundary, invalid Draft, Test Draft, confirmation, refresh, model payload, and snapshot immutability tests.
- Create `tests/unit/console-config-ui.test.ts`: pure Config/Models display-contract tests, including three fixed cards, diff confirmation state, `mock_passed`, `source=simulator`, and no credential control.
- Modify `src/shared/console-types.ts`: add safe Config, diff-confirmation, Draft-test, Console-only Models, Models-only Draft update, runtime snapshot, and action-result types.
- Modify `src/main/console-data.ts`: attach the Main-only Config/Models controller without widening the renderer facade or generic AppSnapshot.
- Modify `src/main/boot.ts`: add Main-owned config refresh closure that re-reads ConfigService, resolves model settings, updates the Main config revision, and notifies snapshot subscribers after Publish/Rollback.
- Modify `src/main/ipc.ts`: add sender-authorized Config/Models query and action handlers with exact argument counts and stable rejection responses.
- Modify `src/shared/bridge.ts`, `src/preload/console.ts`, `src/renderer/console/App.tsx`, and `src/renderer/console/styles.css`: add the narrow Config/Models methods and pages, including the Models-only Draft update. Model values appear only in the Models request/response path.

### 9C files — new and modified

- Create `src/main/console-phase-tests.ts`: bounded read-only Phase 0 record adapter with empty/latest result projection and visible failure mapping; no writer or demo runner.
- Create `tests/unit/console-phase-tests.test.ts`: empty reader, latest record, malformed record, reader failure, metadata bounds, and no-fabrication tests.
- Create `tests/unit/console-phase-tests-ui.test.ts`: pure Phase Tests empty/latest display contract tests with no Run/Write control.
- Modify `src/main/console-data.ts`, `src/main/ipc.ts`, `src/shared/console-types.ts`, `src/shared/bridge.ts`, `src/preload/console.ts`, `src/renderer/console/App.tsx`, and `src/renderer/console/styles.css` to attach and display the read-only Phase Tests contract.

No existing Task 8 test is modified. No product document, package file, dependency, `.env`, `scripts/`, process record, `src/main/telemetry.ts`, `src/main/config-service.ts`, `src/main/model-settings.ts`, `src/main/module-registry.ts`, `src/main/module-mocks.ts`, `src/main/sqlite-service.ts`, or `src/renderer/shared/ErrorBoundary.tsx` is changed by this plan.

## Shared contracts that all three slices use

The following are implementation contracts, not suggestions. They keep the worker's local view of the interfaces consistent across sequential slices.

### Console response and error boundary

Add a type-only `ConsoleResponse<T>` in `src/shared/console-types.ts`:

```ts
export type ConsoleResponse<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: ConsoleErrorCode
      readonly reason: ConsoleReason
      readonly fields?: readonly ConsoleFieldError[]
    }

export type ConsoleErrorCode =
  | 'console_not_ready'
  | 'console_request_invalid'
  | 'console_request_rejected'
  | 'developer_mode_disabled'
  | 'console_events_query_invalid'
  | 'console_config_invalid'
  | 'console_config_not_tested'
  | 'console_config_test_failed'
  | 'console_config_diff_stale'
  | 'console_config_confirmation_invalid'
  | 'console_config_publish_failed'
  | 'console_config_rollback_failed'
  | 'console_config_previous_unavailable'
  | 'console_config_refresh_failed'
  | 'console_model_test_failed'
  | 'console_phase_tests_read_failed'

export type ConsoleReason =
  | 'cause=developer_mode_disabled'
  | 'cause=console_data_plane_unavailable'
  | 'cause=payload_schema_invalid'
  | 'cause=query_bounds_invalid'
  | 'cause=sender_rejected'
  | 'cause=config_service_unavailable'
  | 'cause=config_schema_invalid'
  | 'cause=draft_not_tested'
  | 'cause=draft_test_failed'
  | 'cause=diff_stale'
  | 'cause=confirmation_invalid'
  | 'cause=atomic_publish_failed'
  | 'cause=atomic_rollback_failed'
  | 'cause=previous_unavailable'
  | 'cause=refresh_failed'
  | 'cause=mock_probe_failed'
  | 'cause=reader_failed'
  | 'cause=record_invalid'

export interface ConsoleFieldError {
  readonly path: string
  readonly message: string
}
```

`ConsoleReason` values are stable bounded enums. A caught exception is mapped to one of these reasons and its message/stack is never read, serialized, or returned. IPC sender failures may use `console_request_rejected` with `cause=sender_rejected`; the detailed sender reason remains only in the metadata event.

### Overview and Events payloads

```ts
export interface ConsoleEventSummary {
  readonly time: string
  readonly module: ModuleId
  readonly event: string
  readonly status: MirrorEvent['status']
  readonly duration_ms?: number
  readonly error_code?: string
  readonly session_id?: string
  readonly scene_id?: string
  readonly reason?: string
  readonly source?: NonNullable<MirrorEvent['source']>
}

export interface ConsoleModuleObservation {
  readonly status: ModuleStatus
  readonly readiness: 'mock' | 'not_checked'
  readonly lastSuccess: ConsoleEventSummary | null
  readonly lastError: ConsoleEventSummary | null
  readonly lastFallback: ConsoleEventSummary | null
}

export interface ConsoleOverviewPayload {
  readonly lifecycle: LifecycleState
  readonly appVersion: string
  readonly buildCommit: string
  readonly configVersion: number | null
  readonly identityStatus: IdentityStatus
  readonly realtimeSessionId: string | null
  readonly sessionGeneration: number
  readonly uptimeSeconds: number
  readonly developerMode: boolean
  readonly developerModeSource: 'packaging_default' | 'startup_override'
  readonly modules: Readonly<Record<ModuleId, ConsoleModuleObservation>>
  readonly audioTcc: 'not_checked'
  readonly cameraTcc: 'not_checked'
}

export interface ConsoleEventsQuery {
  readonly limit?: number
  readonly beforeSequence?: number
  readonly module?: ModuleId
  readonly status?: MirrorEvent['status']
  readonly source?: NonNullable<MirrorEvent['source']>
}

export interface ConsoleEventsPage {
  readonly events: readonly ConsoleEventSummary[]
  readonly nextBeforeSequence: number | null
}
```

`getEvents` accepts `undefined` or an exact object containing only the five query keys. It clamps no invalid caller value silently: limits must be integers 1–200, `beforeSequence` must be a finite nonnegative safe integer, and enum values must be in the existing sets. The Main facade passes only the validated request to `Telemetry.readPage`. Overview reads at most one bounded page and derives per-module summaries; all module statuses remain observational and never gate the lifecycle.

### Developer Mode and Main facade

`src/main/console-data.ts` exposes these exact Main-only interfaces:

```ts
export interface DeveloperModeDecision {
  readonly enabled: boolean
  readonly source: 'packaging_default' | 'startup_override'
}

export interface ConsoleBaseDataPlane {
  getOverview(): ConsoleResponse<ConsoleOverviewPayload>
  getEvents(request: unknown): ConsoleResponse<ConsoleEventsPage>
  simulate(command: unknown): Promise<SimulatorResult>
}

export interface ConsoleDataPlane extends ConsoleBaseDataPlane {
  // 9B and 9C add the following Main-only facade methods after their own RED gates.
  // The 9A implementation contains only the three base methods above.
  getConfig(): Promise<ConsoleResponse<ConsoleConfigPayload>>
  getModels(): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveModelDraft(input: unknown): Promise<ConsoleResponse<ConsoleModelsPayload>>
  saveDraft(input: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  testDraft(): Promise<ConsoleResponse<ConsoleDraftTestResult>>
  publish(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  rollback(confirmation: unknown): Promise<ConsoleResponse<ConsoleConfigPayload>>
  createNextRuntimeSnapshots(): Promise<ConsoleResponse<ConsoleRuntimeSnapshotResult>>
  getPhaseTests(): Promise<ConsoleResponse<ConsolePhaseTestsPayload>>
}

export function resolveDeveloperMode(
  isPackaged: boolean,
  override: unknown,
  emit: (event: Omit<MirrorEvent, 'time'>) => void,
): DeveloperModeDecision
```

The 9A implementation constructs only the three `ConsoleBaseDataPlane` methods. Gate 9B extends the facade with the Config/Models methods, and Gate 9C adds `getPhaseTests`; a later-slice method returns `console_not_ready` only until its Main-owned controller is attached. The actual boot path attaches all three controllers synchronously through Main-owned closures before IPC registration. No method returns a service object. `resolveDeveloperMode(false, undefined, emit)` returns enabled/packaging_default; `resolveDeveloperMode(true, undefined, emit)` returns disabled/packaging_default; exact `enabled`/`disabled` overrides are honored; every other override returns the packaging default and emits `developer_mode_override_invalid` with a bounded reason. There is no renderer setter.

The 9A `BootRuntime` addition is a Main-only `console: ConsoleBaseDataPlane` facade. 9B widens that property to the completed `ConsoleDataPlane` after its controller methods exist. Its existing `snapshot()`, `subscribe()`, `handleSimulator()`, and `SimulatorResult` contracts remain unchanged. `src/main/index.ts` passes `app.isPackaged` and `process.env['MIRROR_DEVELOPER_MODE']`; it does not pass `.env` contents or a credential.

### Console-only IPC contract

Extend only `ConsoleChannelMap` with these exact channel names. `MirrorChannelMap` remains limited to its Task 8 methods:

```ts
overview: 'console:get-overview'
events: 'console:get-events'
config: 'console:get-config'
models: 'console:get-models'
saveModelDraft: 'console:save-model-draft'
saveDraft: 'console:save-draft'
testDraft: 'console:test-draft'
publish: 'console:publish'
rollback: 'console:rollback'
nextRuntime: 'console:create-next-runtime'
phaseTests: 'console:get-phase-tests'
```

Every handler calls `authorizeSender(event, 'console', windows)` before touching the facade, verifies the exact argument count, and maps failure to a stable `ConsoleResponse` or the unchanged `SimulatorResult` shape. A Mirror sender cannot reach any of these handlers. The Console preload exposes named methods only: `getOverview`, `getEvents`, `getConfig`, `getModels`, `saveModelDraft`, `saveDraft`, `testDraft`, `publish`, `rollback`, `createNextRuntimeSnapshots`, `getPhaseTests`, plus the existing `notifyReady`, `getSnapshot`, `onSnapshot`, and `simulate`.

### Config, diff, Models, and runtime snapshot contract

The safe Config page view excludes `persona.instructions`, all AI model values, credentials, secrets, arbitrary `spells`/`scenes` entries, raw exceptions, and unknown keys:

```ts
export interface ConsoleConfigSafeView {
  readonly configVersion: number
  readonly personaName: string
  readonly voice: string
  readonly idleSeconds: number
  readonly wake: { readonly phrase: string; readonly modelVersion: string }
  readonly faceModel: { readonly detectorId: string; readonly recognizerId: string }
  readonly assets: { readonly offlineLoopVideo: string; readonly avatarDir: string; readonly musicDir: string }
  readonly adapters: { readonly lighting: 'mock' | 'physical'; readonly fog: 'mock' | 'physical'; readonly music: 'mock' | 'physical' }
}

export interface ConsoleConfigDraftInput {
  readonly personaName: string
  readonly voice: string
  readonly idleSeconds: number
  readonly wake: { readonly phrase: string; readonly modelVersion: string }
  readonly faceModel: { readonly detectorId: string; readonly recognizerId: string }
  readonly assets: { readonly offlineLoopVideo: string; readonly avatarDir: string; readonly musicDir: string }
  readonly adapters: { readonly lighting: 'mock' | 'physical'; readonly fog: 'mock' | 'physical'; readonly music: 'mock' | 'physical' }
}

export interface ConsoleConfigDiffEntry {
  readonly path: string
  readonly kind: 'model' | 'non_model'
  readonly change: 'added' | 'removed' | 'updated'
}

export interface ConsoleConfigDiff {
  readonly operation: 'publish' | 'rollback'
  readonly from: 'active' | 'previous'
  readonly to: 'draft' | 'active'
  readonly expectedActiveVersion: number
  readonly changed: readonly ConsoleConfigDiffEntry[]
  readonly nonModelChanges: boolean
  readonly confirmationDigest: string
}

export interface ConsoleDiffConfirmation {
  readonly operation: 'publish' | 'rollback'
  readonly expectedActiveVersion: number
  readonly changedPaths: readonly string[]
  readonly nonModelChanges: boolean
  readonly confirmationDigest: string
}

export interface ConsoleConfigPayload {
  readonly active: ConsoleConfigSafeView
  readonly draft: ConsoleConfigSafeView
  readonly previous: ConsoleConfigSafeView
  readonly publishDiff: ConsoleConfigDiff
  readonly rollbackDiff: ConsoleConfigDiff
  readonly draftTest: ConsoleDraftTestResult | null
}

export interface ConsoleDraftTestResult {
  readonly result: 'mock_passed' | 'failed'
  readonly source: 'simulator'
  readonly configVersion: number
  readonly fingerprint: string
  readonly roleCount: 3
  readonly reason: 'cause=all_configured_ids_observed' | 'cause=mock_probe_failed' | 'cause=draft_invalid'
}
```

`ConsoleConfigDiff.changed` contains every changed path from the fresh Main diff, including model paths, but never includes `from`/`to` values. The Models payload and the Models-only Draft update request are the only renderer contracts that carry configured model strings. `confirmationDigest` is a stable Main-generated digest over the complete internal diff, including values that are not sent to the renderer; it is an opaque confirmation value and is never placed in telemetry. Publish/Rollback recompute and compare all confirmation fields immediately before calling `ConfigService.publish()`/`rollback()`.

The Models payload and the Models-only Draft update request are the only model-value-bearing renderer contracts:

```ts
export type ConsoleModelRole = 'realtimeDialogue' | 'inputTranscription' | 'memoryExtractor'

export interface ConsoleModelSlot {
  readonly configVersion: number
  readonly fingerprint: string
  readonly modelId: string
}

export interface ConsoleModelDraftInput {
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
}

export interface ConsoleModelCard {
  readonly role: ConsoleModelRole
  readonly label: 'Realtime Dialogue' | 'Input Transcription' | 'Memory Extractor'
  readonly draft: ConsoleModelSlot
  readonly publishedActive: ConsoleModelSlot
  readonly runtimeLoaded: ConsoleModelSlot
  readonly previous: ConsoleModelSlot
  readonly pending: 'none' | 'next_session' | 'next_job'
}

export interface ConsoleRuntimeSnapshot {
  readonly label: 'current' | 'old' | 'new'
  readonly source: 'simulator'
  readonly session: Readonly<SessionModelSnapshot> | null
  readonly job: Readonly<JobModelSnapshot> | null
}

export interface ConsoleModelsPayload {
  readonly cards: readonly ConsoleModelCard[]
  readonly runtime: {
    readonly current: ConsoleRuntimeSnapshot | null
    readonly old: ConsoleRuntimeSnapshot | null
    readonly new: ConsoleRuntimeSnapshot | null
  }
  readonly latestTest: ConsoleDraftTestResult | null
}

export interface ConsoleRuntimeSnapshotResult {
  readonly result: 'mock_passed' | 'failed'
  readonly source: 'simulator'
  readonly reason: 'cause=next_snapshot_created' | 'cause=developer_mode_disabled' | 'cause=refresh_failed'
}
```

The `SessionModelSnapshot`/`JobModelSnapshot` values in `ConsoleRuntimeSnapshot` are nested only under `ConsoleModelsPayload`, never in `AppSnapshot`, Overview, Events, telemetry, logs, diagnostics, or Mirror. Before a mutation, `current` is the existing simulated pair. After Publish/Rollback, `current` is unchanged and copied to `old`; `new` is empty until the explicit next-snapshot action. The action creates new snapshots from refreshed Active using the accepted builders and records only `mock_passed`/`source=simulator` metadata in its result/event. The UI calls a runtime result “Mock passed,” never “Contract passed.”

### Phase Tests contract

```ts
export interface ConsolePhaseTestsPayload {
  readonly phase: '0'
  readonly source: 'empty' | 'reader'
  readonly latest: PhaseTestRecord | null
  readonly records: readonly PhaseTestRecord[]
}

export interface PhaseTestRecordReader {
  read(phase: '0'): readonly PhaseTestRecord[] | PromiseLike<readonly PhaseTestRecord[]>
}
```

The reader is Main-owned and injected. The Task 9 default reader returns an empty list. The adapter accepts at most 20 records, validates exact `P0-D1` through `P0-D5` IDs, canonical time, build, result (`passed`, `failed`, or `mock_passed`), and bounded note metadata. It returns the newest valid record as `latest`, returns an explicit read failure for a throwing/invalid reader, and never creates a record. Task 10 can replace the reader with its durable implementation without changing the renderer contract.

## Required dispatch envelope and evidence

Every one of the fifteen slice gates uses a fresh profile-backed worker with the following fields repeated in the prompt. Substitute only the gate-specific role, task, exact paths, and commands:

```text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: exactly one of "implementer" or "tester"
fresh_worker: true
task: one bounded Phase 0 Task 9 gate with explicit non-goals; execute only the listed RED, GREEN, or validation work
write_scope: exact named files; read-only unless the named scope grants a write; all writes use apply_patch
skills: .agents/skills/mm-phase-workflow/SKILL.md; .agents/skills/mm-invariants/SKILL.md; .agents/skills/mm-electron-foundation/SKILL.md; plus test-driven-development for implementer RED/production gates or verification-before-completion for tester gates
self_invariants: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12; emphasize 1, 3, 8, 9, 10, 11, 12
evidence: exact changed files, concise diff summary, complete stdout/stderr and exit code for every named command, static/security/privacy scan outcomes, checked invariant IDs, self-review pass count, and unresolved risks; metadata-only
self_review: read the own diff/output; no more than 3 passes
root_review: external interactive-root review after return; not part of self-review
```

No worker may inspect `.env` or `scripts/`, print model values, print test fixture values that stand in for private content, print credentials, transcript/audio/private-memory/image/embedding data, or copy the harness model into runtime configuration. Test evidence reports paths, test counts, enum statuses, reasons, timings, hashes, and exit codes only.

## Slice 9A — Overview + Simulator + Events and Main-owned Console data plane

**Story / Phase:** `US-DEV-001`, `FR-FOUND-01`, `FR-FOUND-03`, `FR-DEV-01`, `FR-DEV-03`, Phase 0 Foundation Console Increment; this slice establishes the one local observation/control surface before mutation controls exist.

**User-visible outcome:** The operator can open the Console and see the current lifecycle, all module statuses, bounded last success/error/degrade metadata, mock/simulator readiness, `not_checked` Audio/Camera TCC state, and paginated filtered Events; Developer Mode controls whether the existing simulator acts, with disabled simulation visibly reasoned and non-gating.

**Files / modules expected to change:** Create the 9A files in the topology above; modify only the named Main, IPC, bridge, preload, Console renderer, and styles paths. Do not touch accepted services or existing tests.

**Console control or telemetry to add:** Main-owned `developer_mode_resolved`, `console_events_query_invalid`, `console_query_rejected`, and `simulator_command_ignored` metadata events with bounded reasons; Overview cards for every `ModuleId`, `readiness: 'mock' | 'not_checked'`, `audioTcc: 'not_checked'`, and `cameraTcc: 'not_checked'`; paginated Events query with `limit`, `beforeSequence`, `module`, `status`, and `source` filters.

**Happy-path test:** A deterministic Main facade returns all `MODULE_IDS` in Overview, maps telemetry into last success/error/fallback summaries, returns a bounded filtered page through `Telemetry.readPage`, and an enabled Console simulator delegates a valid existing command while preserving the exact `SimulatorResult` shape.

**Failure / fallback test:** Packaged/default-disabled simulation returns exactly `{ op: 'degraded' }` with no lifecycle event and emits `cause=developer_mode_disabled`; invalid event bounds, a Mirror sender, a non-main frame, a mismatched `webContents.id`, a destroyed Console window, and a send failure all return stable safe failures and metadata reasons without gating the lifecycle.

**Explicit non-goals:** No Config/Models mutation, no model-value payload, no credential surface, no real provider/device/network/camera/microphone, no new simulator command, no Phase Tests records, no demo execution, no persistence changes, no Task 10 evidence, and no Task 8 test edits.

**Demo step affected:** Supplies the Console observation and simulator controls later consumed by Task 10's P0-D3 and by the P0-D1/P0-D2 runner. Task 9A does not run or claim those demos.

### 9A exact interfaces and test seams

`createConsoleDataPlane` in 9A returns `ConsoleBaseDataPlane` and receives only Main closures: `getSnapshot(): AppSnapshot`, `getTelemetry(): Pick<Telemetry, 'readPage' | 'emit'>`, `getDeveloperMode(): DeveloperModeDecision`, `getStartedAt(): number`, and `handleSimulator(command: unknown): Promise<SimulatorResult>`. It may reserve later controller getters as optional Main-only seams, but 9A tests and UI do not call them. The implementation must not import Electron into the pure data module; `index.ts` supplies `app.isPackaged` and the bounded override to `boot.ts`.

`getOverview()` clones only the accepted `AppSnapshot` fields, computes bounded uptime, projects every module status, and reads a single maximum-200 telemetry page to derive `lastSuccess`, `lastError`, and `lastFallback`. It must not include `activeProfileId`, `guestId`, `candidateProfileId`, `profileId`, `modelId`, credentials, raw exceptions, transcript/audio/private-context fields, or arbitrary event fields. It labels Task 6/Task 8 mock adapters as `readiness: 'mock'`; `audioTcc` and `cameraTcc` are always `not_checked` in this task.

`getEvents(request)` validates exact keys and bounded values before calling `Telemetry.readPage`. The response copies only the allowed event fields from the shared metadata schema. The renderer owns pagination cursors and filter selection, but cannot bypass Main validation.

`simulate(command)` checks Main's Developer Mode decision, then delegates valid/invalid commands to the existing Main `handleSimulator`. It returns the existing `SimulatorResult` object exactly. Disabled simulation emits one stable `source=simulator` metadata event and returns `{ op: 'degraded' }`; it never adds a `reason` field to the result and never changes lifecycle.

### 9A TDD gates

#### - [ ] Gate 9A.1 — implementer writes focused RED tests only

**Role:** fresh `implementer`.

**Write scope:** `tests/unit/console-data.test.ts`, `tests/unit/console-ipc.test.ts`, and `tests/unit/console-ui.test.ts` only; use `apply_patch`. Read the accepted Task 8 interfaces and the named existing service types. Do not create or modify production files.

Write deterministic tests with these stable, non-sensitive sentinels held only in RAM and never printed: `__TEST_TRANSCRIPT_SENTINEL__`, `__TEST_AUDIO_SENTINEL__`, `__TEST_PRIVATE_MEMORY_SENTINEL__`, `__TEST_CREDENTIAL_SENTINEL__`, `__TEST_IMAGE_SENTINEL__`, `__TEST_EMBEDDING_SENTINEL__`, and `__TEST_CONFIGURED_VALUE_SENTINEL__`. Tests assert `JSON.stringify` of every returned payload/event does not contain any sentinel; they do not log the serialized value.

Required RED test names and assertions:

```ts
it('defaults Developer Mode from unpackaged versus packaged Main state', () => {
  expect(resolveDeveloperMode(false, undefined, sink).enabled).toBe(true)
  expect(resolveDeveloperMode(true, undefined, sink).enabled).toBe(false)
})

it('accepts only the bounded startup override and records invalid override metadata', () => {
  expect(resolveDeveloperMode(true, 'enabled', sink).source).toBe('startup_override')
  expect(resolveDeveloperMode(false, 'disabled', sink).enabled).toBe(false)
  expect(resolveDeveloperMode(false, '__invalid__', sink).enabled).toBe(true)
  expect(events.at(-1)).toMatchObject({ event: 'developer_mode_override_invalid', reason: 'cause=payload_schema_invalid' })
})

it('projects every module as observational mock health with explicit unverified TCC', () => {
  const result = plane.getOverview(); expect(result.ok).toBe(true)
  if (result.ok) {
    expect(Object.keys(result.value.modules).sort()).toEqual(MODULE_IDS.slice().sort())
    expect(Object.values(result.value.modules).every((card) => card.readiness === 'mock')).toBe(true)
    expect(result.value.audioTcc).toBe('not_checked'); expect(result.value.cameraTcc).toBe('not_checked')
    expect(result.value.identityStatus).toBe('unassigned')
    expect(JSON.stringify(result.value)).not.toContain('activeProfileId')
  }
})

it('validates bounded event pagination and forwards only accepted filters', () => {
  const result = plane.getEvents({ limit: 2, beforeSequence: 9, module: 'camera', status: 'failed', source: 'simulator' })
  expect(readPage).toHaveBeenCalledWith({ limit: 2, beforeSequence: 9, module: 'camera', status: 'failed', source: 'simulator' })
  expect(result).toEqual({ ok: true, value: expect.objectContaining({ nextBeforeSequence: expect.anything() }) })
  expect(plane.getEvents({ limit: 201 })).toMatchObject({ ok: false, error: 'console_events_query_invalid', reason: 'cause=query_bounds_invalid' })
})

it('keeps disabled simulation in the authoritative result shape and emits a reason', async () => {
  const result = await disabledPlane.simulate({ type: 'wake' })
  expect(result).toEqual({ op: 'degraded' })
  expect(events.at(-1)).toMatchObject({ event: 'simulator_command_ignored', source: 'simulator', reason: 'cause=developer_mode_disabled' })
})
```

The IPC tests must register every 9A channel, assert exact Console sender checks for both `senderFrame === mainFrame` and tracked numeric ID, assert a Mirror sender cannot invoke Console handlers, reject extra arguments/unknown fields, and verify no registered handler returns `ConfigService`, `Telemetry`, filesystem, SQLite, credential, or lifecycle objects. The UI tests assert the exact six tab labels, the `Mock / simulator` and `TCC: not_checked` copy, disabled-simulation copy, and Events columns limited to time/module/event/status/duration/error code/session/reason/source.

**Expected RED evidence:** The focused tests fail because the new data-plane module, Console payloads, handlers, and view exports are absent. A test that passes immediately is corrected before implementation; a collection error caused by a test typo is fixed in the test-only gate until the failure is specifically the missing feature.

#### - [ ] Gate 9A.2 — tester observes focused RED

**Role:** fresh `tester`, read-only; no file writes.

Run exactly:

```powershell
npx vitest run tests/unit/console-data.test.ts tests/unit/console-ipc.test.ts tests/unit/console-ui.test.ts --reporter=verbose
```

Expected result is a nonzero exit caused by missing 9A production/types/handlers or missing view exports, with the named assertions/collection failures recorded. The tester returns complete stdout/stderr and exit code, confirms the three test files are the only intended RED additions, and confirms no sensitive sentinel was printed.

#### - [ ] Gate 9A.3 — implementer writes the smallest 9A production change

**Role:** fresh `implementer`; execute only after Gate 9A.2's expected RED.

**Write scope:** `src/shared/console-types.ts`, `src/main/console-data.ts`, `src/main/boot.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/shared/bridge.ts`, `src/preload/console.ts`, `src/renderer/console/App.tsx`, and `src/renderer/console/styles.css`. Do not modify any test or accepted service.

Implementation order and acceptance:

1. Add type-only Overview/Events/response contracts and the bounded Developer Mode decision. Use stable enum reasons; do not add a broad string escape hatch to the response type.
2. Construct the data plane in `bootSequence` with Main closures. Add `developerModeOverride?: unknown` and `isPackaged?: boolean` options. Pass the accepted boot snapshot/telemetry/`handleSimulator`; preserve the existing `BootRuntime` methods and R2 simulator result shape.
3. Add `console:get-overview` and `console:get-events` to `ConsoleChannelMap`, register exact Console-only handlers, and run `authorizeSender` before request validation or facade access. Keep `console:get-snapshot`, `console:simulate`, the ready channel, Mirror allowlists, and sender rejection metadata compatible with Task 8.
4. In `index.ts`, pass `app.isPackaged` and only `process.env['MIRROR_DEVELOPER_MODE']` as the bounded Main startup override. Do not inspect `.env`; do not pass a renderer-supplied Developer Mode value.
5. Expose named preload methods via `contextBridge`; do not expose `ipcRenderer`, Main objects, event sinks, or filesystem APIs.
6. Replace only the Console shell presentation. Overview renders all modules and non-gating states, mock labels, `not_checked` TCC, bounded identity status, and last metadata. Simulator renders the existing command set only and shows a reasoned disabled state. Events renders paginated/filterable metadata and an explicit load-older state; it never renders transcript/audio/private content.

The implementation must keep the Console visible if a query fails, emit a metadata event for each ignored/rejected/degraded action, and avoid any global health gate. No model-bearing field is added to `AppSnapshot`, `MirrorEvent`, `MirrorBridge`, or the Mirror UI.

**Expected GREEN acceptance:** The focused RED tests pass with no warnings caused by the new code; disabled simulation is exactly the old result shape; all new IPC handlers reject Mirror/invalid senders; Overview contains all module IDs but no identity/model/credential values; Events calls `Telemetry.readPage` with bounded validated input; and the UI exposes only the 9A controls.

#### - [ ] Gate 9A.4 — tester runs focused GREEN and exact diff/security/privacy checks

**Role:** fresh `tester`, read-only. Run each command separately and capture complete stdout/stderr and exit code:

```powershell
npx vitest run tests/unit/console-data.test.ts tests/unit/console-ipc.test.ts tests/unit/console-ui.test.ts --reporter=verbose
git diff --check -- src/shared/console-types.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/main/index.ts src/shared/bridge.ts src/preload/console.ts src/renderer/console/App.tsx src/renderer/console/styles.css tests/unit/console-data.test.ts tests/unit/console-ipc.test.ts tests/unit/console-ui.test.ts
git status --short --untracked-files=all -- src/shared/console-types.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/main/index.ts src/shared/bridge.ts src/preload/console.ts src/renderer/console/App.tsx src/renderer/console/styles.css tests/unit/console-data.test.ts tests/unit/console-ipc.test.ts tests/unit/console-ui.test.ts
Select-String -LiteralPath src/shared/bridge.ts,src/preload/console.ts,src/main/ipc.ts -Pattern 'console:get-overview','console:get-events','authorizeSender'
rg -l "guestId|candidateProfileId|activeProfileId|profileId|modelId" src/shared/types.ts src/shared/bridge.ts src/preload/console.ts src/renderer/mirror src/renderer/shared
rg -l "safeStorage|CredentialStore|ConfigService|SqliteService|node:sqlite|fs/promises|apiKey|clientSecret" src/shared/console-types.ts src/preload/console.ts src/renderer/console src/renderer/mirror
rg -l "app\.relaunch\(|nodeIntegration:\s*true|gpt-[A-Za-z0-9.-]+|auto.?latest|candidate.?model|default.?model|model.?fallback" src/shared/console-types.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/preload/console.ts src/renderer/console
```

Expected exits: focused Vitest `0`; `git diff --check` `0`; status output contains only the named 9A paths plus the plan path if the plan is present; `Select-String` `0`; each negative `rg -l` scan `1` with no output. If a negative scan exits `0`, the tester reports only matching file paths, not matching lines or values, and the gate fails. The focused tests are the privacy-sentinel check; no sentinel is printed.

#### - [ ] Gate 9A.5 — tester runs full regression and final negative scans

**Role:** fresh `tester`, read-only. No `.env`, credential, device, network, camera, microphone, or external service setup is allowed. Run exactly:

```powershell
npx vitest run --reporter=verbose
npm run typecheck:node
npm run typecheck:web
npm run build
git diff --check -- src/shared/console-types.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/main/index.ts src/shared/bridge.ts src/preload/console.ts src/renderer/console/App.tsx src/renderer/console/styles.css tests/unit/console-data.test.ts tests/unit/console-ipc.test.ts tests/unit/console-ui.test.ts
rg -l "guestId|candidateProfileId|activeProfileId|profileId|modelId" src/shared/types.ts src/shared/bridge.ts src/preload/console.ts src/renderer/mirror src/renderer/shared
rg -l "safeStorage|CredentialStore|ConfigService|SqliteService|node:sqlite|fs/promises|apiKey|clientSecret" src/shared/console-types.ts src/preload/console.ts src/renderer/console src/renderer/mirror
rg -l "app\.relaunch\(|nodeIntegration:\s*true|gpt-[A-Za-z0-9.-]+|auto.?latest|candidate.?model|default.?model|model.?fallback" src/shared/console-types.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/preload/console.ts src/renderer/console
```

Expected exits: full Vitest, Node typecheck, web typecheck, build, and diff check `0`; each negative scan `1` with no output. The tester returns full verbose Vitest output, complete compiler/build output, exit codes, changed-path confirmation, exact test count/timing, invariant IDs, and unresolved risks. A green full suite does not authorize Task 9B until root externally checks this slice.

### 9A root review checkpoint

Root accepts 9A only when the returned diff is limited to the 9A topology, Gate 9A.2 proves the tests failed for the missing feature, Gate 9A.4 is focused green, Gate 9A.5 is fully green, and the following are visible in the diff/evidence:

- Main is the only Developer Mode authority; packaging default and exact bounded override are tested; no renderer setter exists.
- Overview contains all modules, mock labels, bounded identity status, last success/error/fallback metadata, and explicit `not_checked` TCC without making a global readiness gate.
- Events is a bounded `Telemetry.readPage` consumer with filters/cursor and no second store.
- Disabled simulation preserves the exact `SimulatorResult` shape; `realtime_ready` is absent; every ignore/rejection/degrade has a stable event/reason.
- Every new handler checks sender frame and exact webContents ID; Mirror cannot call Console; no service/IPC/filesystem/SQLite/credential object crosses.
- AppSnapshot, Mirror payloads, telemetry, logs, diagnostics, exports, and test evidence contain no model IDs or sensitive sentinels.
- Invariants 1–12 are checked, with 2/4/5/6/7 explicitly preserved as untouched future behavior.

Root does not run commands in this checkpoint and does not pre-authorize changes to Task 8 tests. Root must reject and re-dispatch 9A if any boundary is missing.

## Slice 9B — Config + Models, Test Draft, diff-confirmed mutation, and Main refresh

**Story / Phase:** `US-DEV-001`, `FR-FOUND-01`, `FR-DEV-01`, `FR-DEV-03`, Phase 0 Config/Models Console Increment, P0-D5 data-flow contract; this slice makes the safe local config and configured-model state actionable without creating a provider integration.

**User-visible outcome:** The operator can view safe Active/Draft/Previous Config state, edit only Phase 0-safe fields, run a mock Test Draft, inspect a complete structural diff with non-model changes highlighted, confirm Publish or Rollback Entire Config to Previous, see the refreshed Main revision, and inspect three fixed model cards plus immutable current/old/new simulated session/job evidence. Invalid Drafts and failed mock tests are visible and cannot mutate Active.

**Files / modules expected to change:** Create `src/main/console-config.ts` and the two 9B test files; modify the 9A Console facade, Main refresh seam, Console-only shared types, IPC, preload, renderer, and styles exactly as listed. `ConfigService`, `model-settings.ts`, existing tests, and generic snapshot types remain read-only.

**Console control or telemetry to add:** Models-only Draft role update plus `config_draft_saved`, `config_draft_rejected`, `config_diff_rejected`, `config_publish_requested`, `config_rollback_requested`, `config_refresh_failed`, `model_settings_simulated`, and `runtime_snapshot_created` metadata events with only slot/revision/count/status/reason/source fields. No model value, digest input, credential, or raw exception enters an event.

**Happy-path test:** An in-memory ConfigService harness updates all three Draft model roles through the Models-only action, saves a safe non-model Draft, returns a full Active→Draft diff with `nonModelChanges`, passes a mock Test Draft, Main-revalidates the confirmation, atomically publishes, refreshes the model resolution/config version, leaves the old current snapshots unchanged, and exposes a new Active revision only through the Models payload after an explicit next-snapshot action.

**Failure / fallback test:** Invalid Draft, mock Test Draft failure, stale/partial confirmation, missing Previous, atomic ConfigService failure, or refresh failure leaves Active and existing snapshots unchanged as applicable, blocks Publish before mutation, returns a stable reason, and keeps unrelated lifecycle/module operation available. Model IDs never enter generic snapshots, telemetry, logs, diagnostics, or evidence.

**Explicit non-goals:** No real OpenAI/SDK/provider call, credential exchange, model connectivity or contract test, model dropdown/router/auto-latest/fallback, ConfigService rewrite, credential editor, arbitrary JSON/backend/plugin surface, identity/profile/session switching, persistent demo record, Task 10 execution, or Task 9C Phase Tests implementation.

**Demo step affected:** Supplies the P0-D5 Console data path later executed and recorded by Task 10. Task 9B does not execute P0-D5, call a provider, or claim contract success.

### 9B exact Main controller contract

`src/main/console-config.ts` consumes `ConfigService` and `ModelSettingsResolution` only inside Main. It receives getters for the current ConfigService and model resolution, a Main `refreshConfig(): Promise<{ ok: true; configVersion: number; resolution: ModelSettingsResolution } | { ok: false; error: 'console_config_refresh_failed'; reason: 'cause=refresh_failed' }>`, `getDeveloperMode`, telemetry, a deterministic clock, and an optional injected mock Draft probe. It never receives or returns Electron objects.

After the 9B RED gate, extend the 9A `ConsoleBaseDataPlane` to the final `ConsoleDataPlane` with `getConfig`, `getModels`, `saveModelDraft`, `saveDraft`, `testDraft`, `publish`, `rollback`, and `createNextRuntimeSnapshots`, using the exact shared response types above. The 9B boot facade delegates those methods to the Main controller and returns `console_not_ready` only while its Main ConfigService getter is unavailable; it does not implement a parallel ConfigService.

The safe Config Draft input is exact-key validated and merged into the current Main-owned Draft. It updates only `persona.name`, `voice`, `idleSeconds`, `wake`, `faceModel`, `assets`, and `adapters`; it preserves model roles, persona instructions, spells, and scenes in Main. A separate Models-only `saveModelDraft(input: unknown)` accepts exactly `realtimeDialogue`, `inputTranscription`, and `memoryExtractor` non-empty strings, merges only `aiModels` in Main, invalidates any prior Draft-test result, and calls the same `ConfigService.saveDraft` boundary. Neither action accepts unknown keys or model values through the Config page. `ConfigService.saveDraft` remains the validation/atomic writer boundary. Its safe `FieldError` list is returned only as bounded `{ path, message }` fields; caught exceptions are mapped to stable codes.

`getConfig()` reads current slots, maps safe fields, computes both full structural diffs (`active`→`draft` and `active`→`previous`), classifies each path using the accepted three model paths, and produces opaque confirmation digests. It includes `draftTest` only as a bounded result summary. No diff entry contains a raw `from` or `to` value.

`testDraft()` reads and resolves the current Draft, invokes the deterministic mock probe, and stores the result against the Draft fingerprint/config version. It is a bounded Config preflight rather than a public `handleSimulator` command, so Publish can require it even when the public Simulator page is disabled. A success is exactly `result: 'mock_passed'`, `source: 'simulator'`, `roleCount: 3`; a failure is exactly `result: 'failed'`, `source: 'simulator'`, and `cause=mock_probe_failed` or `cause=draft_invalid`. It never calls a network/provider and never reports `contract_passed`.

`publish(confirmation)` validates exact keys, operation, revision, sorted complete changed paths, `nonModelChanges`, and digest; then fresh-reads/re-diffs Main state and compares all fields. It additionally requires a matching successful Draft test. Only after all checks pass does it call `ConfigService.publish()`. It then calls Main `refreshConfig()`, updates the facade's resolution and config version, clears stale Draft-test state, and notifies existing snapshot subscribers. If refresh fails after an atomic mutation, it returns `console_config_refresh_failed`, emits a visible reason, and never pretends the old resolution is current.

`rollback(confirmation)` repeats fresh full-diff validation for Active→Previous, requires no Draft test, calls `ConfigService.rollback()`, refreshes Main, clears stale Draft-test state, and returns the refreshed Config payload. Missing Previous maps to `console_config_previous_unavailable`. No model-only rollback path exists.

The Main runtime evidence store starts with one `current` pair created from the accepted Active model resolution only when a deterministic 9B test/demo fixture explicitly requests it. Publish/Rollback copies the current pair to `old` without mutation and clears `new`. `createNextRuntimeSnapshots()` is Developer Mode-gated, uses the refreshed Active resolution and accepted snapshot builders, stores `new`, and returns only `mock_passed`/`failed` metadata. Existing current/old values remain byte-for-byte unchanged in focused tests.

### 9B TDD gates

#### - [ ] Gate 9B.1 — implementer writes focused RED tests only

**Role:** fresh `implementer`.

**Write scope:** `tests/unit/console-config-models.test.ts` and `tests/unit/console-config-ui.test.ts` only; use `apply_patch`. Read only the accepted ConfigService/model-settings/shared contracts and 9A facade types. Do not create or modify production files or existing tests.

Use an in-memory `ConfigFileOperations`/`ConfigAtomicWriter` harness with deterministic keys only; do not read or write real config paths. Use safe synthetic fixtures and the privacy sentinels from 9A. Do not print configured model values; assertions compare them in memory and report only roles/revisions/statuses.

The fixture defines `fixtureModelValue(role: ConsoleModelRole)` as a deterministic non-user value held in RAM and increments a `modelDraftCalls` counter whenever the injected ConfigService harness receives the Models-only Draft merge.

Required RED test names and assertions:

```ts
it('rejects an unsafe Draft input with exact fields and leaves Active unchanged', async () => {
  const before = await controller.getConfig()
  const result = await controller.saveDraft({ unexpected: '__TEST_CONFIGURED_VALUE_SENTINEL__' })
  expect(result).toMatchObject({ ok: false, error: 'console_config_invalid', reason: 'cause=payload_schema_invalid' })
  const after = await controller.getConfig()
  expect(after).toEqual(before)
})

it('updates all three Draft model roles only through the Models action', async () => {
  const input = { realtimeDialogue: fixtureModelValue('realtimeDialogue'), inputTranscription: fixtureModelValue('inputTranscription'), memoryExtractor: fixtureModelValue('memoryExtractor') }
  const result = await controller.saveModelDraft(input)
  expect(result).toMatchObject({ ok: true, value: { cards: expect.arrayContaining([expect.objectContaining({ role: 'realtimeDialogue' }), expect.objectContaining({ role: 'inputTranscription' }), expect.objectContaining({ role: 'memoryExtractor' })]) } })
  const config = await controller.getConfig(); expect(config.ok).toBe(true)
  if (config.ok) expect(JSON.stringify(config.value)).not.toContain('modelId')
  expect(modelDraftCalls).toBe(1)
  expect(await activeRevision()).toBe(7)
})

it('blocks Publish until a successful mock Draft test matches the current Draft', async () => {
  const diff = await readPublishDiff()
  const blocked = await controller.publish(diffConfirmation(diff))
  expect(blocked).toMatchObject({ ok: false, error: 'console_config_not_tested', reason: 'cause=draft_not_tested' })
  expect(await activeRevision()).toBe(7)
  await controller.testDraft()
  const published = await controller.publish(diffConfirmation(await readPublishDiff()))
  expect(published).toMatchObject({ ok: true })
  expect(await activeRevision()).toBeGreaterThan(7)
})

it('rejects a stale full diff confirmation before calling ConfigService.publish', async () => {
  const diff = await readPublishDiff(); const stale = { ...diffConfirmation(diff), changedPaths: [] }
  const result = await controller.publish(stale)
  expect(result).toMatchObject({ ok: false, error: 'console_config_diff_stale', reason: 'cause=diff_stale' })
  expect(publishCalls).toBe(0); expect(await activeRevision()).toBe(7)
})

it('refreshes Main resolution after Publish and Rollback while preserving old snapshots', async () => {
  const old = await controller.createInitialRuntimeSnapshotsForTest()
  await controller.testDraft(); await controller.publish(diffConfirmation(await readPublishDiff()))
  const afterPublish = await controller.getModels()
  expect(afterPublish).toMatchObject({ ok: true, value: { runtime: { old: expect.anything(), new: null } } })
  expect(JSON.stringify(afterPublish.value.runtime.old)).toBe(JSON.stringify(old))
  const next = await controller.createNextRuntimeSnapshots()
  expect(next).toMatchObject({ ok: true, value: { result: 'mock_passed', source: 'simulator' } })
  const afterNext = await controller.getModels()
  expect(afterNext).toMatchObject({ ok: true, value: { runtime: { new: expect.objectContaining({ label: 'new', source: 'simulator' }) } } })
  expect(JSON.stringify(afterNext.value.runtime.old)).toBe(JSON.stringify(old))
})

it('returns failed mock Draft evidence and keeps Active unchanged', async () => {
  const failing = makeController({ mockDraftProbe: () => ({ result: 'failed', reason: 'cause=mock_probe_failed' }) })
  const tested = await failing.testDraft()
  expect(tested).toMatchObject({ ok: true, value: { result: 'failed', source: 'simulator', reason: 'cause=mock_probe_failed' } })
  const blocked = await failing.publish(diffConfirmation(await failing.getPublishDiff()))
  expect(blocked).toMatchObject({ ok: false, error: 'console_config_test_failed', reason: 'cause=draft_test_failed' })
  expect(await failing.activeRevision()).toBe(7)
})
```

Also assert Rollback requires a complete fresh confirmation, uses the entire Active→Previous diff, refreshes the Main config version/resolution, and never changes the existing session/job snapshot. Assert `ConsoleModelsPayload` has exactly three fixed role cards, and that `modelId` keys occur only under the Models response fixture—not in `AppSnapshot`, Overview, Events, or serialized telemetry. Assert no result/event contains `__TEST_TRANSCRIPT_SENTINEL__`, `__TEST_AUDIO_SENTINEL__`, `__TEST_PRIVATE_MEMORY_SENTINEL__`, `__TEST_CREDENTIAL_SENTINEL__`, `__TEST_IMAGE_SENTINEL__`, `__TEST_EMBEDDING_SENTINEL__`, or raw configured-value sentinels.

The UI tests assert Config has no credential label/input or model-value control, Models alone provides three bounded Draft role inputs and the `saveModelDraft` action, Publish and Rollback display complete changed-path categories plus `nonModelChanges`, Test Draft uses `Mock passed`/`source=simulator`, Models renders exactly the three fixed cards and Draft/Published Active/Runtime loaded/Previous sections, and pending next-session/job status is visible without calling a provider.

**Expected RED evidence:** Focused collection/tests fail because the 9B controller, new types, handlers, and UI projections are absent. A missing export or mismatch caused by a test typo must be corrected inside this test-only gate; no production code is added to make RED pass.

#### - [ ] Gate 9B.2 — tester observes focused RED

**Role:** fresh `tester`, read-only; no file writes.

Run exactly:

```powershell
npx vitest run tests/unit/console-config-models.test.ts tests/unit/console-config-ui.test.ts --reporter=verbose
```

Expected result is nonzero for missing `console-config.ts`, new types, IPC facade methods, or view exports. The tester returns complete stdout/stderr and exit code, named expected failures, changed-path confirmation, and metadata-only privacy observations.

#### - [ ] Gate 9B.3 — implementer writes the smallest 9B production change

**Role:** fresh `implementer`; execute only after Gate 9B.2's expected RED.

**Write scope:** `src/main/console-config.ts`, `src/shared/console-types.ts`, `src/main/console-data.ts`, `src/main/boot.ts`, `src/main/ipc.ts`, `src/shared/bridge.ts`, `src/preload/console.ts`, `src/renderer/console/App.tsx`, and `src/renderer/console/styles.css`. Do not modify tests, `ConfigService`, `model-settings.ts`, `src/shared/types.ts`, or Task 8 tests.

Implementation order and acceptance:

1. Add exact shared Config/Diff/Models/runtime result types. Keep model-bearing fields confined to `ConsoleModelsPayload` and its nested runtime snapshots; do not add them to `AppSnapshot`, `MirrorEvent`, Overview, Events, or Mirror bridge types.
2. Implement the Main controller around existing `ConfigService` methods and existing model resolver/snapshot builders. Validate exact Draft patches and confirmation objects at the Main boundary; map ConfigService errors to stable safe codes/field paths without reading raw exception messages.
3. Generate full structural diff entries and an opaque Main digest. Main re-reads and re-diffs immediately before Publish/Rollback; compare all paths and `nonModelChanges`. Never trust a renderer's “confirmed” boolean or revision alone.
4. Require a matching `mock_passed` Draft test before Publish; keep Active unchanged for invalid Draft, failed test, stale confirmation, or pre-mutation error. Publish/Rollback call the existing atomic service methods only once after validation.
5. Add the Main refresh closure in `boot.ts`. It waits for the accepted boot, calls `ConfigService.read()`, calls `resolveModelSettings()`, updates the Main-owned config version/model resolution, and publishes the model-free refreshed AppSnapshot to existing subscribers. It never returns model values through the generic snapshot.
6. Implement immutable current/old/new runtime evidence. Use `createSessionModelSnapshot` and `createJobModelSnapshot` only from Active. Clear/rebuild pending evidence at mutation boundaries; create new evidence only on explicit Developer Mode action; return `mock_passed`/`source=simulator`, never contract status.
7. Add exact Console-only IPC/preload methods for Config/Models and actions. Every action has exact argument count, Main sender authorization, stable unavailable/rejected response, and metadata-only event. `getModels` and `saveModelDraft` are the only handlers that carry configured model values.
8. Add Config and Models pages with fixed controls/cards. Config never renders model values or credentials; Models alone renders three bounded Draft role inputs plus the three configured cards and their revision/fingerprint/runtime/pending state. Publish/Rollback require a visible full diff confirmation; no generic editor or provider chooser is added.

**Expected GREEN acceptance:** Invalid Draft and failed/stale Test Draft cases are non-mutating; successful Publish/Rollback use atomic ConfigService behavior and immediately refresh Main; generic AppSnapshot remains model-free; old snapshots stay unchanged; next snapshots use refreshed Active only after explicit action; three Model cards show `mock_passed`/`source=simulator`; and all Console-only handlers remain sender-authorized.

#### - [ ] Gate 9B.4 — tester runs focused GREEN and exact diff/security/privacy checks

**Role:** fresh `tester`, read-only. Run each command separately:

```powershell
npx vitest run tests/unit/console-config-models.test.ts tests/unit/console-config-ui.test.ts --reporter=verbose
git diff --check -- src/main/console-config.ts src/shared/console-types.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/shared/bridge.ts src/preload/console.ts src/renderer/console/App.tsx src/renderer/console/styles.css tests/unit/console-config-models.test.ts tests/unit/console-config-ui.test.ts
Select-String -LiteralPath src/shared/console-types.ts,src/main/console-config.ts,src/main/ipc.ts,src/preload/console.ts -Pattern 'console:get-config','console:get-models','console:save-model-draft','console:save-draft','console:test-draft','console:publish','console:rollback','authorizeSender'
rg -l "modelId" src/shared/types.ts src/shared/bridge.ts src/main/telemetry.ts src/main/ipc.ts src/preload/mirror.ts src/renderer/mirror src/renderer/shared
rg -l "modelId" src/shared/console-types.ts src/main/console-config.ts src/preload/console.ts src/renderer/console/App.tsx
rg -l "gpt-[A-Za-z0-9.-]+|auto.?latest|candidate.?model|default.?model|model.?fallback|fallback.?model|provider.?list" src/main/console-config.ts src/main/console-data.ts src/shared/console-types.ts src/preload/console.ts src/renderer/console
rg -l "safeStorage|CredentialStore|apiKey|clientSecret|credentialEditor|credential editor|node:sqlite|fs/promises" src/main/console-config.ts src/shared/console-types.ts src/preload/console.ts src/renderer/console
rg -l "guestId|candidateProfileId|activeProfileId|profileId|transcript|audio|privateContext|embedding" src/shared/types.ts src/shared/bridge.ts src/preload/mirror.ts src/renderer/mirror src/renderer/shared
```

Expected exits: focused Vitest `0`; diff check `0`; channel/security marker scan `0`; forbidden model-ID scan outside the Console Models path `1` with no output; the allowlisted Models-path scan `0` with only the named Console files; runtime model/fallback vocabulary scan `1`; credential/remote/raw-sensitive scan `1`; identifier/content-key scan outside the allowed Main/model payload scope `1`. If a positive scan occurs, report paths only and never print values. The focused tests own sentinel checks and must not print serialized payloads.

#### - [ ] Gate 9B.5 — tester runs full regression and final negative scans

**Role:** fresh `tester`, read-only; no external setup.

Run exactly:

```powershell
npx vitest run --reporter=verbose
npm run typecheck:node
npm run typecheck:web
npm run build
git diff --check -- src/main/console-config.ts src/shared/console-types.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/shared/bridge.ts src/preload/console.ts src/renderer/console/App.tsx src/renderer/console/styles.css tests/unit/console-config-models.test.ts tests/unit/console-config-ui.test.ts
Select-String -LiteralPath src/main/ipc.ts,src/preload/console.ts -Pattern 'console:get-models','console:save-model-draft','authorizeSender'
rg -l "modelId" src/shared/types.ts src/shared/bridge.ts src/main/telemetry.ts src/main/ipc.ts src/preload/mirror.ts src/renderer/mirror src/renderer/shared
rg -l "gpt-[A-Za-z0-9.-]+|auto.?latest|candidate.?model|default.?model|model.?fallback|fallback.?model|provider.?list" src/main/console-config.ts src/main/console-data.ts src/shared/console-types.ts src/preload/console.ts src/renderer/console
rg -l "safeStorage|CredentialStore|apiKey|clientSecret|credentialEditor|credential editor|node:sqlite|fs/promises" src/main/console-config.ts src/shared/console-types.ts src/preload/console.ts src/renderer/console
rg -l "app\.relaunch\(|nodeIntegration:\s*true" src/main/console-config.ts src/main/console-data.ts src/main/boot.ts src/main/ipc.ts src/preload/console.ts src/renderer/console
```

Expected exits: full Vitest, Node typecheck, web typecheck, build, diff check `0`; every negative scan `1` with no output. Full verbose output must include the unedited Task 8 boot/IPC/Mirror regression tests. The tester reports full outputs/codes, test counts/timings, exact changed paths, the allowed Models payload boundary, invariant IDs, and unresolved Windows/macOS risks.

### 9B root review checkpoint

Root accepts 9B only when the diff and evidence prove:

- ConfigService remains the atomic owner; safe Draft patches, field errors, full diffs, Main-revalidated confirmation, and nonModelChanges are explicit.
- Invalid Draft, failed mock Test Draft, stale confirmation, Previous-unavailable, and refresh-failure paths are visible and do not silently mutate or substitute Active.
- Publish/Rollback refresh Main config version/model resolution and existing subscribers; generic AppSnapshot and Mirror payloads remain model-ID-free.
- Model IDs appear only in the sender-authorized Models payload, its Main source, its Console preload/UI route, and the in-memory test fixture; they never appear in telemetry, logs, diagnostics, exports, Mirror, generic snapshot, or evidence.
- Exactly three fixed cards exist; there is no model list/router/auto-latest/fallback, no real provider call, and no contract-pass claim.
- Current/old/new runtime evidence demonstrates immutable old snapshots and explicit next-session/job creation from refreshed Active. The result/event is `mock_passed`/`source=simulator` only.
- No credential editor, safeStorage access, network/device access, or hidden Developer Mode setter exists.
- Invariants 1–12 are checked, especially 1, 3, 8, 9, 10, 11, and 12; 2, 4, 5, 6, and 7 remain untouched.

Root does not run commands and does not claim P0-D5 completion. Task 10 remains the owner of executing the P0-D5 demo and recording its result.

## Slice 9C — Phase Tests read/display contract

**Story / Phase:** `FR-DEV-02`, `US-DEV-001`, Phase 0 Phase Tests Console Increment; this slice makes recent Phase 0 result metadata visible without taking ownership of execution or persistence.

**User-visible outcome:** The operator can open Phase Tests and see either an honest empty state or the latest bounded Phase 0 record supplied by Main, including demo ID, build, time, result, and note. There is no fabricated success, Run button, durable writer, restart claim, exit verdict, or phase tag.

**Files / modules expected to change:** Create the read-only Main adapter and two focused test files; modify the existing Console facade/IPC/bridge/preload/UI/styles only. Do not add a database table, writer, demo runner, process record, or Task 10 hook that executes work.

**Console control or telemetry to add:** `phase_tests_read_failed` with `cause=reader_failed` or `cause=record_invalid`; a visible empty/read-failure/latest display. No write event and no synthetic `passed` record.

**Happy-path test:** An injected reader returns bounded Phase 0 records; the Main adapter validates, preserves metadata-only values, returns the newest as `latest`, and the UI displays it without adding a Run/Write action.

**Failure / fallback test:** The default reader returns an empty result; a throwing/invalid reader returns a stable visible read failure and no record; malformed records are omitted or fail the response according to the exact validation contract, never replaced with a fabricated record.

**Explicit non-goals:** No demo execution, simulator orchestration, durable record write, SQLite schema/table, restart/reopen evidence, P0-D1–P0-D5 execution, exit criteria, phase tag, external research, macOS field verification, or changes to Task 10 ownership.

**Demo step affected:** Provides the display/query surface that Task 10 will populate after its own P0-D1–P0-D5 runner and persistence/restart checks. Task 9C does not run, record, or claim any demo.

### 9C exact reader and UI contract

`createConsolePhaseTests({ reader, getBuildCommit, emit })` calls only the injected Main reader. It accepts at most 20 records, checks exact keys and bounded values, sorts by canonical time descending, returns `source: 'empty'` for zero records and `source: 'reader'` when at least one valid record exists, and maps a reader throw or invalid output to `console_phase_tests_read_failed` with no raw exception. It never calls `ConfigService`, SQLite, `handleSimulator`, or a demo runner.

The Phase Tests IPC channel is `console:get-phase-tests`, exact zero arguments, Console sender authorization, and a `ConsoleResponse<ConsolePhaseTestsPayload>`. The renderer displays:

- Empty: `No Phase 0 records yet — Task 10 owns demo execution and record production.`
- Latest: `demoId`, `build`, `time`, `result`, and bounded `note` with `mock_passed` visibly labeled `Mock passed`.
- Failure: stable error/reason only; no raw exception.

There is no button or method named `runDemo`, `executeDemo`, `writeRecord`, `persistRecord`, `checkExit`, `tagPhase`, or equivalent in Task 9C.

### 9C TDD gates

#### - [ ] Gate 9C.1 — implementer writes focused RED tests only

**Role:** fresh `implementer`.

**Write scope:** `tests/unit/console-phase-tests.test.ts` and `tests/unit/console-phase-tests-ui.test.ts` only; use `apply_patch`. Read only the shared PhaseTestRecord type, 9A/9B Console facade contract, and current Console shell. Do not create or modify production files, SQLite code, demo code, or existing tests.

Required RED test names and assertions:

```ts
it('returns an honest empty Phase Tests payload when the reader has no records', async () => {
  const common = { getBuildCommit: () => 'fixture-build', emit: sink }
  const result = await createConsolePhaseTests({ ...common, reader: { read: () => [] } }).get()
  expect(result).toEqual({ ok: true, value: { phase: '0', source: 'empty', latest: null, records: [] } })
})

it('returns the newest bounded reader record without fabricating a result', async () => {
  const common = { getBuildCommit: () => 'fixture-build', emit: sink }
  const result = await createConsolePhaseTests({ ...common, reader: { read: () => [olderRecord, latestRecord] } }).get()
  expect(result).toMatchObject({ ok: true, value: { source: 'reader', latest: latestRecord, records: [latestRecord, olderRecord] } })
})

it('maps reader failure or malformed output to a visible stable error', async () => {
  const common = { getBuildCommit: () => 'fixture-build', emit: sink }
  const result = await createConsolePhaseTests({ ...common, reader: { read: () => { throw new Error('__TEST_PRIVATE_MEMORY_SENTINEL__') } } }).get()
  expect(result).toMatchObject({ ok: false, error: 'console_phase_tests_read_failed', reason: 'cause=reader_failed' })
  expect(JSON.stringify(result)).not.toContain('__TEST_PRIVATE_MEMORY_SENTINEL__')
})
```

The UI tests assert exact empty/latest/failure copy, that `mock_passed` is labeled `Mock passed`, that no Run/Write/Exit/Tag control is rendered, and that no Phase Test payload contains any privacy sentinel or model-bearing key.

**Expected RED evidence:** Focused tests fail for the missing Phase Tests adapter, channel, response, or UI projection. The tester must identify a feature-missing failure rather than a test typo before implementation proceeds.

#### - [ ] Gate 9C.2 — tester observes focused RED

**Role:** fresh `tester`, read-only; no file writes.

Run exactly:

```powershell
npx vitest run tests/unit/console-phase-tests.test.ts tests/unit/console-phase-tests-ui.test.ts --reporter=verbose
```

Expected result is nonzero for the absent adapter/channel/view exports. Return complete stdout/stderr, exit code, named failures, and confirmation that no record was written or fabricated.

#### - [ ] Gate 9C.3 — implementer writes the smallest 9C production change

**Role:** fresh `implementer`; execute only after Gate 9C.2's expected RED.

**Write scope:** `src/main/console-phase-tests.ts`, `src/main/console-data.ts`, `src/main/ipc.ts`, `src/shared/console-types.ts`, `src/shared/bridge.ts`, `src/preload/console.ts`, `src/renderer/console/App.tsx`, and `src/renderer/console/styles.css`. Do not modify tests, SQLite, ConfigService, demo/record files, Task 8 tests, or process records.

Implementation order and acceptance:

1. Add the exact read-only response and reader interfaces; validate record count, IDs, timestamps, result enum, build, and bounded note without reading raw exceptions.
2. Attach the Main reader to the existing Console facade. Use an empty default reader; do not add a write method or persistence side effect.
3. Add `console:get-phase-tests` with exact zero-argument validation and `authorizeSender(event, 'console', windows)`. Return stable safe errors and metadata-only `phase_tests_read_failed` events.
4. Add Phase Tests display to the existing Console navigation. Show empty/latest/failure states, exact result labels, and no action that runs or writes a demo. Keep later Task 10 ownership text visible.
5. Preserve all 9A/9B pages and sender/model/privacy boundaries. The Phase Tests payload contains no model values and does not change the generic AppSnapshot.

**Expected GREEN acceptance:** Empty, latest, malformed, and reader-failure tests pass; the Phase Tests page never fabricates a record; no new persistence or demo execution exists; and all prior focused behavior remains green.

#### - [ ] Gate 9C.4 — tester runs focused GREEN and exact diff/security/privacy checks

**Role:** fresh `tester`, read-only. Run each command separately:

```powershell
npx vitest run tests/unit/console-phase-tests.test.ts tests/unit/console-phase-tests-ui.test.ts --reporter=verbose
git diff --check -- src/main/console-phase-tests.ts src/main/console-data.ts src/main/ipc.ts src/shared/console-types.ts src/shared/bridge.ts src/preload/console.ts src/renderer/console/App.tsx src/renderer/console/styles.css tests/unit/console-phase-tests.test.ts tests/unit/console-phase-tests-ui.test.ts
Select-String -LiteralPath src/shared/bridge.ts,src/preload/console.ts,src/main/ipc.ts -Pattern 'console:get-phase-tests','authorizeSender'
rg -l "runDemo|executeDemo|writeRecord|persistRecord|checkExit|tagPhase|phase_test.*write|INSERT.*phase|app\.relaunch\(" src/main/console-phase-tests.ts src/main/console-data.ts src/main/ipc.ts src/preload/console.ts src/renderer/console
rg -l "guestId|candidateProfileId|activeProfileId|profileId|modelId|credential|apiKey|clientSecret|transcript|audio|privateContext|embedding" src/shared/types.ts src/shared/bridge.ts src/preload/mirror.ts src/renderer/mirror src/renderer/shared
```

Expected exits: focused Vitest `0`; diff check `0`; channel marker scan `0`; no-demo/no-write scan `1`; generic Mirror/privacy scan `1`. A positive scan reports paths only. The focused tests assert the reader failure sentinel is not returned or printed.

#### - [ ] Gate 9C.5 — tester runs full regression and final scans

**Role:** fresh `tester`, read-only; no external setup.

Run exactly:

```powershell
npx vitest run --reporter=verbose
npm run typecheck:node
npm run typecheck:web
npm run build
git diff --check -- src/main/console-phase-tests.ts src/main/console-data.ts src/main/ipc.ts src/shared/console-types.ts src/shared/bridge.ts src/preload/console.ts src/renderer/console/App.tsx src/renderer/console/styles.css tests/unit/console-phase-tests.test.ts tests/unit/console-phase-tests-ui.test.ts
rg -l "runDemo|executeDemo|writeRecord|persistRecord|checkExit|tagPhase|phase_test.*write|INSERT.*phase|app\.relaunch\(" src/main/console-phase-tests.ts src/main/console-data.ts src/main/ipc.ts src/preload/console.ts src/renderer/console
rg -l "modelId" src/shared/types.ts src/shared/bridge.ts src/main/telemetry.ts src/main/ipc.ts src/preload/mirror.ts src/renderer/mirror src/renderer/shared
rg -l "safeStorage|CredentialStore|apiKey|clientSecret|node:sqlite|fs/promises" src/main/console-phase-tests.ts src/main/console-data.ts src/preload/console.ts src/renderer/console
```

Expected exits: full Vitest, Node typecheck, web typecheck, build, and diff check `0`; each negative scan `1` with no output. Full verbose output must include all prior 9A/9B focused/regression consumers and the unedited Task 8 tests. Tester evidence lists record counts/statuses only and does not claim any demo or exit result.

### 9C root review checkpoint

Root accepts 9C only when the diff and evidence prove:

- The Phase Tests query is Main-owned, bounded, sender-authorized, read-only, and empty by default without fabricating a record.
- Latest records are validated metadata and read failures are visible with stable reasons; no raw exception, private content, transcript/audio, credential, model value, or arbitrary payload is returned.
- The UI has no demo runner, durable writer, restart claim, exit check, phase tag, or hidden action. Task 10 ownership text and the empty state are explicit.
- All 9A Overview/Simulator/Events and 9B Config/Models behavior remains green and unchanged in ownership.
- Invariants 1–12 are checked; 2, 4, 5, 6, and 7 remain future behavior and are not fabricated by the Phase Tests surface.

## Root review checklist for the complete Task 9 plan execution

The interactive root accepts the complete Task 9 implementation only after accepting 9A, 9B, and 9C separately and checking every item below against each returned diff and tester evidence:

- [ ] Base is `f7a38371091aa0fb2fa99494dacd47286940cf67`; the three slices ran strictly in order; every worker used the explicit Luna/max/fresh envelope, exact scope, named skills, metadata-only evidence, and at most three self-review passes.
- [ ] Each slice has a focused RED produced by a fresh implementer, a fresh tester-observed expected failure, a smallest production GREEN, a fresh tester-focused green, and a fresh tester full verbose Vitest/typecheck/web-typecheck/build/scan checkpoint.
- [ ] Only the named Task 9 paths changed. Existing Task 8 tests and accepted services are untouched unless root opens a separate correction gate after an actual failure.
- [ ] Main owns lifecycle/config/module health/Developer Mode and all config/model/runtime/record readers; no renderer can set Developer Mode or access a service object.
- [ ] Every new Console handler reuses `authorizeSender` and validates main frame plus exact `webContents.id`; Mirror cannot call Console channels; delivery/dispatch failures are visible and non-gating.
- [ ] Overview is complete for all modules, observational, mock-labeled, bounded, and explicit about Audio/Camera TCC `not_checked`; identity is a bounded enum, not an ID.
- [ ] Events is a bounded filtered/paginated `Telemetry.readPage` view; no second event store or external observability system exists.
- [ ] Config uses existing ConfigService atomic semantics. Draft validation, failed Test Draft, full diff/nonModelChanges confirmation, Publish, Rollback Entire Config, Main refresh, and stable failure reasons are all visible and tested.
- [ ] Models has exactly three fixed cards, the only three-role Draft update action, and configured model values only through its narrow Console-only sender-authorized request/response path; it has no provider router, auto-latest, fallback, credential, or contract-pass claim.
- [ ] Old/current/new simulated session/job evidence is immutable and explicitly simulator-sourced; new snapshots are created only after an explicit action and use refreshed Active resolution.
- [ ] Phase Tests reads/validates/visibly displays empty/latest metadata only; Task 10 alone owns demo execution, durable record production, restart evidence, P0-D1–P0-D5, exit evidence, and tagging.
- [ ] No OpenAI credential, network, camera, microphone, physical device, `.env` value, target macOS field verification, or second restart owner was required or claimed.

## Explicit non-goals

- No implementation outside the named 9A/9B/9C files; no application/test/config/package/dependency/process-record edits beyond those scopes; no Git commit, push, merge, or tag.
- No changes to `src/main/config-service.ts`, `src/main/model-settings.ts`, `src/main/telemetry.ts`, `src/main/module-registry.ts`, `src/main/module-mocks.ts`, `src/main/sqlite-service.ts`, `src/shared/types.ts`, existing Task 8 tests, or `src/renderer/shared/ErrorBoundary.tsx`.
- No OpenAI/Agents SDK/Realtimesession/WebRTC/provider call, credential exchange, network request, camera/microphone/physical device access, worker spawn, TCC probe, Keychain/DPAPI value read, `.env` read, or macOS packaging/field-verification claim.
- No runtime model literal, model fallback, hidden SDK default, auto-latest selection, provider list, model router, multi-provider abstraction, generic plugin/backend/admin framework, or credential editor.
- No profile/guest/candidate ID crossing, private-memory flow, face confirmation, session switching, memory extraction, control-turn classification, spell matching, scene execution, adapter hardware control, or mic handoff.
- No modification of the authoritative `handleSimulator` return shape or public simulator command union; no `realtime_ready` command.
- No Phase Tests writer, demo runner, durable record persistence, restart/reopen evidence, P0-D1–P0-D5 execution, exit-criteria verdict, or Phase 0 release tag.
- No claim that Windows validation field-verifies macOS Keychain/TCC/signing/entitlements/packaged-worker/LaunchAgent behavior; LaunchAgent remains the sole restart owner and `app.relaunch()` remains prohibited.

## Canonical invariant checklist 1–12

1. **RAM-only content:** Task 9 returns and stores only metadata, bounded config presentation, and the explicitly allowed Console Models payload. No final transcript, conversation audio, extracted memory value, private context, image, frame, embedding, or credential enters telemetry, logs, diagnostics, exports, worker evidence, Phase Test records, or generic IPC. The UI has no transcript/audio/private-memory surface.
2. **Face candidate confirmation:** No face recognition, candidate proposal, private-memory load, or identity confirmation is implemented. Overview projects only the accepted bounded `identityStatus`.
3. **Main-only profile IDs:** `guestId`, `candidateProfileId`, `profileId`, and `activeProfileId` remain Main-only and are absent from every Console/Mirror request/response, AppSnapshot, UI, event, diagnostic, and evidence path.
4. **Clean profile change:** Profile change/session close/Persona+Master confirmation/updateAgent behavior remains untouched and is not simulated by Task 9.
5. **Turn-start owner snapshot:** Memory extraction owner snapshot behavior remains untouched; Task 9B's model session/job snapshots are configuration-revision evidence only and do not carry profile ownership.
6. **Control-turn extraction exclusion:** No extraction or control-turn behavior is added; Phase Tests and model simulation never claim it.
7. **Exact spell matching:** No spell, scene, hardware parameter, or trigger behavior is added; the existing simulator command set remains authoritative.
8. **Single microphone owner:** Task 9 acquires no microphone and creates no audio handoff; Audio Overview status is observational with TCC `not_checked`.
9. **No silent failure:** Every invalid query, sender rejection, disabled simulation, mock failure, stale confirmation, atomic error, refresh error, reader error, and degraded/missing state is visitor-visible or a metadata-only event with a stable reason.
10. **Degrade without gating:** Module status is informational; a failed/missing mock, telemetry read, Console query, or unrelated controller does not gate conversation/lifecycle or sibling modules. The Console remains nonblank on errors.
11. **Configured-only model IDs:** Main resolves model values from versioned ConfigService slots. Task 9 exposes them only in the narrow Models payload, never adds a source literal, provider list, auto-latest, hidden fallback, telemetry value, generic snapshot value, or substitution path.
12. **Main-only credentials:** No credential read or editor exists. `safeStorage` and CredentialStore stay Main-only; no key, secret, `.env` value, or credential-shaped data crosses IPC or enters logs/telemetry/exports.

## Task 9 completion boundary and Task 10 handoff

Task 9 is complete only when root has externally accepted all three slices after their tester-owned focused/full evidence, the Console has all six read/control pages with the stated boundaries, and no unresolved privacy/sender/config/model ownership issue remains. This completion does not mean Phase 0 demos passed.

At the handoff boundary, Task 10 receives:

- the working Overview/Simulator/Events path for its own P0-D1–P0-D3 execution;
- Config/Models Test Draft, diff-confirmed Publish/Rollback, and immutable snapshot evidence for its own P0-D5 execution;
- the Phase Tests empty/latest reader/display contract, with no fabricated record;
- unchanged ownership of demo execution, durable record production/persistence and restart evidence, P0-D1–P0-D5 results, exit checks, prior-phase smoke, and the recoverable Phase 0 tag.

Task 9 must not report a demo, record, exit, restart, macOS field, provider, credential, or phase-tag claim. The next authorized work is Task 10 under its own bounded plan and external root review.
