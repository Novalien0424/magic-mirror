# Phase 0 Task 8 — Boot, Authorized IPC, and Mirror Lifecycle Implementation Plan

> **For agentic workers:** Follow the repository rule that only the interactive root dispatches fresh profile-backed CLI workers; workers do not delegate, spawn children, or create review workers. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the accepted Tasks 2–7 in a Main-owned composition root, expose only authorized typed Mirror/Console IPC, and project all seven lifecycle states onto a nonblank Mirror UI.

**Architecture:** `bootSequence()` composes the existing Main services in one deterministic order and creates the lifecycle actor last; it records only stable metadata and routes essential failures to Maintenance. `ipc.ts` owns per-window sender authorization, narrow preload bridges, simulator dispatch, and snapshot publication. The Mirror consumes a bounded `AppSnapshot`; profile/candidate/guest identifiers remain inside Main.

**Tech Stack:** Electron 43, TypeScript 5.9, React 19, XState 5, Vitest 4, `node:sqlite`, existing `Telemetry`, `ConfigService`, model resolver, module registry/mocks, and no new dependency.

**Spec:** `docs/Magic_Mirror_PRD_v0.3.md`, `docs/Magic_Mirror_Tech_Spec_v0.3.md`, `docs/Magic_Mirror_Implementation_Plan_v0.3.md`, and the root rulings in `AGENTS.md`.

## Global Constraints

- Base: branch `phase0-boot-ipc` after main tip `909c75b`; Tasks 2–7 are accepted inputs.
- The unit is composition-root + typed IPC + Mirror projection only. Do not change the implementations of `lifecycle.ts`, `config-service.ts`, `credential-store.ts`, `model-settings.ts`, `module-registry.ts`, `module-mocks.ts`, `sqlite-service.ts`, `telemetry.ts`, `crash-recovery.ts`, `log.ts`, or `smoke.ts`.
- Main boot order is exact: `Telemetry` → `ConfigService.initialize()` → `resolveModelSettings()` → `openSqlite()` → deterministic registry/mocks → lifecycle actor. Starting is visible while the preceding local work is pending.
- A config, model-settings, SQLite, or other local-essential failure produces a stable error code/reason and `Maintenance`; a missing, failed, or degraded cloud/external module never gates `Dormant`.
- `cloud_failure` enters `OfflineLoop`; `cloud_recovery` returns to a clean `Dormant` snapshot with no active session or identity status. No old conversation is resumed.
- Public simulator `wake` is one command. Main sends `WAKE_DETECTED` and then mock `REALTIME_READY` in that order; there is no public readiness or `realtime_ready` simulator command. The existing R2 `handleSimulator` return shape is authoritative and must not be widened or renamed.
- Remove renderer-facing `AppSnapshot.activeProfileId`. Expose only a bounded identity status (`unassigned`, `confirming`, `active`, `anonymous`, or `group`); no `guestId`, `profileId`, `candidateProfileId`, or equivalent may occur in any IPC payload/result.
- Model IDs are resolved from the accepted config service and remain Main-owned. No model ID literal, fallback model, credential, `.env` value, transcript, audio, memory value, private context, image, frame, embedding, or raw exception crosses IPC or enters diagnostics.
- Every ignored command, rejected sender/payload, fallback, degrade, and delivery failure emits a metadata-only event with a stable `reason`; raw error messages are discarded.
- Keep `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, no wholesale `ipcRenderer` exposure, denied popups/navigation, and a strict CSP that works for the Vite dev origin and packaged `file://` resources.
- CredentialStore remains Main-only and safeStorage-backed; Task 8 adds no credential IPC or credential read. Windows DPAPI development does not field-verify target macOS Keychain/TCC/signing/entitlements/LaunchAgent behavior.
- Do not add `app.relaunch()`, a second restart owner, real Realtime/WebRTC, wake worker or mic acquisition, face/identity/memory/avatar/scene behavior, Console pages, demo records, packaging/signing/install work, dependencies, or product/process-file edits.

## Planned file topology and contracts

Create exactly these implementation/test files:

- `src/main/boot.ts`: `bootSequence`, `BootRuntime`, `createStartingSnapshot`, `projectAppSnapshot`, Main-only simulator dispatch, stable failure mapping, and snapshot subscriptions. Inject factory seams for deterministic tests; call the accepted service implementations unchanged.
- `src/main/ipc.ts`: `MIRROR_IPC_CHANNELS`, `CONSOLE_IPC_CHANNELS`, `authorizeSender`, typed handler registration, payload validation, and `publishSnapshot`. Every handler checks both `event.senderFrame === event.sender.mainFrame` and the tracked `webContents.id` for the expected window kind.
- `src/renderer/shared/ErrorBoundary.tsx`: export `ErrorBoundary`; catch renderer failures, emit/display only stable metadata such as `{ code: 'renderer_boundary_failed', reason: 'render_exception' }`, and render a nonblank fallback without reading or emitting `Error.message`, `Error.stack`, or stringified exceptions.
- `tests/unit/boot-ipc.test.ts`: boot order/failure/degrade, simulator sequencing, identity redaction, IPC allowlists, sender checks, payload rejection, and OfflineLoop recovery.
- `tests/unit/mirror-projection.test.ts`: the exact seven-state copy contract and snapshot-to-view projection.

Modify only these application files:

- `src/main/index.ts`: use `bootSequence` after `app.whenReady`, keep windows painting `Starting` before local initialization completes, register the IPC handlers, broadcast snapshots, retain existing crash recovery/smoke markers, and add secure navigation/window options.
- `src/preload/mirror.ts` and `src/preload/console.ts`: expose only their own typed methods/listeners with type-only shared imports; never expose `ipcRenderer`.
- `src/shared/bridge.ts`: define separate Mirror/Console channel maps, snapshot subscriptions, and the typed simulator method; keep sender identity Main-derived.
- `src/shared/types.ts`: replace `activeProfileId` in `AppSnapshot` with bounded `identityStatus`, make `AppSnapshot.configVersion` exactly `number | null` so Starting/Maintenance never invent a revision, and retain the existing `SimulatorCommand` union without adding readiness.
- `src/renderer/mirror/App.tsx` and `styles.css`: remove the 1.2-second local timer, consume Main snapshots, and render all seven states (including nonblank OfflineLoop and reasoned Maintenance) without identifiers.
- `src/renderer/mirror/index.html` and `src/renderer/console/index.html`: add the same strict CSP meta policy.

Do not modify `src/renderer/console/App.tsx`; its six deferred pages belong to Task 9. Do not modify existing tests; the two new focused files own this unit’s new assertions.

### Main composition contract

`bootSequence(options)` must call the injected/default factories in this observable order:

```text
createTelemetry
configService.initialize
resolveModelSettings
openSqlite
createMockModuleFactory + createModuleRegistry
createLifecycleActor
```

It must retain the successful active config version and model resolution in Main, but never put model IDs in `AppSnapshot`. The registry is initialized with deterministic mock adapters/statuses; probing a failed `openai`, `wake`, `camera`, or effect adapter records its status but still sends `LOCAL_READY`. A local-essential failure is remembered as `{ module, error_code, reason }`, the registry/mocks and lifecycle are still created, and the actor receives `LOCAL_CORE_FAILED` only after creation. No raw caught value is read for a message or serialized.

`createStartingSnapshot()` is the renderer-safe pre-runtime value: lifecycle `starting`, `configVersion: null`, all module statuses from `DEFAULT_MODULE_STATUSES`, `identityStatus: 'unassigned'`, null session/error/maintenance fields, and only build metadata. `projectAppSnapshot()` maps the Main lifecycle context to that shape; it may inspect `activeProfileId` in Main, but its return object must have no `activeProfileId` key and must map a named value only to `identityStatus: 'active'`.

`handleSimulator(command)` keeps the R2 result object exactly. `wake` is accepted only from `dormant`, uses deterministic Main-created activation/session metadata, sends `WAKE_DETECTED` followed immediately by `REALTIME_READY`, and returns the post-command result without exposing either internal ID as a profile identifier. `cloud_failure` uses the lifecycle `CLOUD_FAILED` event and never changes `dormant` into a cloud gate; `cloud_recovery` is accepted only in `offlineLoop`, sends `RECOVERY_PASSED`, and yields clean `dormant`. `sqlite_failure` sends `LOCAL_CORE_FAILED` with a stable SQLite code. Camera/avatar/scene simulator inputs only emit bounded `source=simulator` events and do not invent future services.

### IPC and security contract

Use distinct allowlists. Mirror may invoke `mirror:get-snapshot`, receive `mirror:snapshot`, and send the boot-ready notification. Console may invoke `console:get-snapshot` and `console:simulate`, receive `console:snapshot`, and send its boot-ready notification. A Mirror sender cannot call Console channels and a Console sender cannot call Mirror channels. The ready channel may remain shared only if authorization still derives from the tracked sender window, never from a renderer-supplied `window` field.

`authorizeSender(event, expectedKind, windows)` rejects an unknown/destroyed window, a non-main `senderFrame`, or a `webContents.id` mismatch. Rejection emits `ipc_sender_rejected` with one of the stable reasons `unknown_sender`, `sender_frame_invalid`, `web_contents_mismatch`, or `window_destroyed`; the handler returns the R2-safe rejection result and never invokes the runtime. Payload validators require exact discriminated-union keys, bounded enum values, and safe scene/avatar metadata; any guest/profile/candidate-shaped key is rejected as `ipc_payload_invalid` before dispatch.

`publishSnapshot` sends only the projected `AppSnapshot` to the matching window. A `webContents.send` failure emits `ipc_snapshot_delivery_failed` and does not alter lifecycle or block another window. Preloads expose `notifyReady()`, `getSnapshot()`, `onSnapshot(listener): () => void`, and Console-only `simulate(command)` through `contextBridge`; no renderer receives `ConfigService`, SQLite, CredentialStore, safeStorage, filesystem access, model IDs, or Main lifecycle context.

### Mirror projection contract

Export a frozen `MIRROR_STATE_COPY: Record<LifecycleState, { title: string; detail: string }>` with exactly these seven keys and nonblank values:

```text
starting     → Starting / Preparing the local mirror.
dormant      → Dormant / Waiting for the wake word.
activating   → Activating / Waking the mirror.
active       → Active / Ready for conversation.
suspending   → Suspending / Returning to sleep.
offlineLoop  → OfflineLoop / Cloud unavailable; local fallback is playing.
maintenance  → Maintenance / Local service unavailable; see the Console.
```

`App` starts with `Starting`, calls `notifyReady`, obtains the initial snapshot, subscribes to Main, and removes the listener on unmount. It never sets a lifecycle state from a timer. OfflineLoop remains visibly labeled and loops the already-configured local fallback media when available; media failure renders the same nonblank fallback panel with `offline_loop_asset_unavailable` rather than a black screen. Maintenance displays only the stable `maintenance.reason`/error code, never a raw exception. The rendered view contains no profile, guest, candidate, credential, model, transcript, or audio content.
Wrap the Mirror tree in `ErrorBoundary`; its failure callback and fallback may expose only stable metadata code/reason (for example `renderer_boundary_failed`), never raw error message, stack, or stringified exception content.

## Exactly five TDD gates

Every dispatch uses `model: "gpt-5.6-luna"`, `reasoning_effort: "max"`, `fresh_worker: true`, one role, exact write/read scope, the three project skills (`mm-phase-workflow`, `mm-invariants`, `mm-electron-foundation`), canonical invariant IDs `1–12`, metadata-only evidence, at most three self-review passes, and an external root review after return. `writing-plans` is only for plan authoring, not a required worker skill; implementation gates use TDD when applicable and tester gates use verification when applicable.

### Gate 1 — focused RED tests only (implementer)

- [ ] Skills: the three project skills plus TDD for the RED test-writing step; `writing-plans` is not required.
- [ ] Write only `tests/unit/boot-ipc.test.ts` and `tests/unit/mirror-projection.test.ts` with `apply_patch`; do not create production files or alter existing tests.
- [ ] In `boot-ipc.test.ts`, add exact assertions for: factory call order above; `createStartingSnapshot().lifecycle === 'starting'`; config/model/SQLite failures becoming `maintenance` with stable codes and no raw sentinel; failed cloud/mock modules still reaching `dormant`; `projectAppSnapshot` omitting `activeProfileId` and all guest/profile/candidate-shaped keys; `handleSimulator({ type: 'wake' })` producing ordered `WAKE_DETECTED` then `REALTIME_READY`; no `realtime_ready` public command; cloud failure/recovery producing `offlineLoop` then clean `dormant`; and sender-frame/id/allowlist/payload rejection.
- [ ] In `mirror-projection.test.ts`, assert exact key coverage of `MIRROR_STATE_COPY`, nonblank title/detail for every `LifecycleState`, correct `screen--<state>` mapping, stable OfflineLoop/Maintenance copy, no identifier key in the projected view, and an `ErrorBoundary` failure callback/fallback containing only stable `{ code: 'renderer_boundary_failed', reason: 'render_exception' }` metadata—not `Error.message`, `Error.stack`, or `String(error)`.
- [ ] Use only synthetic metadata sentinels in RAM test fixtures; assert those sentinels never occur in snapshot, simulator result, or telemetry event serialization.
- [ ] Evidence: exact two files, concise diff, complete `apply_patch` output/exit code, self-review pass count, and unresolved risks; no tests are run in this gate.

### Gate 2 — tester observes focused RED

- [ ] Skills: the three project skills plus verification; `writing-plans` is not required.
- [ ] Read only the two focused tests and named production/type interfaces; run exactly:

```powershell
npx vitest run tests/unit/boot-ipc.test.ts tests/unit/mirror-projection.test.ts
```

- [ ] Expected outcome: nonzero exit with focused failures caused by the missing `bootSequence`/IPC/projection contracts; no application files are written. The tester returns complete stdout/stderr and exit code, records the failing assertion names, and confirms no raw sentinel was emitted by the test harness.

### Gate 3 — complete smallest production/UI implementation (implementer)

- [ ] Skills: the three project skills plus TDD for the production behavior; `writing-plans` is not required.
- [ ] Write only these production/UI files: `src/main/boot.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/mirror.ts`, `src/preload/console.ts`, `src/shared/bridge.ts`, `src/shared/types.ts`, `src/renderer/shared/ErrorBoundary.tsx`, `src/renderer/mirror/App.tsx`, `src/renderer/mirror/styles.css`, `src/renderer/mirror/index.html`, and `src/renderer/console/index.html`. Implement the composition order and guarded stable-failure path first, then typed IPC/preloads, then Main snapshot publication and Mirror rendering. Do not change the two focused tests or any accepted service.
- [ ] Preserve `createWindows()`/smoke marker behavior and crash recovery. Create windows/IPC before awaiting local boot so the visitor sees `Starting`; replace the old readiness-to-Dormant assignment with the runtime’s `LOCAL_READY`/`LOCAL_CORE_FAILED` transition.
- [ ] Add strict CSP (`default-src 'self'`, `script-src 'self'`, no `unsafe-eval`, local-only dev HMR `connect-src`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, and self/inline styles required by the existing renderer) to both HTML files. Add `setWindowOpenHandler` denial, `will-navigate` denial, and secure BrowserWindow flags.
- [ ] Wrap the Mirror tree in `ErrorBoundary`; `componentDidCatch` records/displays only stable metadata `{ code: 'renderer_boundary_failed', reason: 'render_exception' }` and a nonblank fallback, never reading or emitting raw `Error.message`, `Error.stack`, or `String(error)`.
- [ ] Keep credentials Main/safeStorage-only and model settings Main-only. Do not inspect `.env`, call OpenAI, open a device, acquire a microphone, or add a model literal.
- [ ] Self-review the complete diff/output for scope, R2 return-shape preservation, all seven states, senderFrame/id validation, no identifier crossing, stable reasons, no silent failure, and invariants `1–12`; maximum three passes. Return exact changed files and complete command output without running validation commands.

### Gate 4 — focused GREEN and exact-diff inspection (tester)

- [ ] Skills: the three project skills plus verification; `writing-plans` is not required.
- [ ] Run exactly:

```powershell
npx vitest run tests/unit/boot-ipc.test.ts tests/unit/mirror-projection.test.ts
git diff --check -- src/main/boot.ts src/main/ipc.ts src/main/index.ts src/preload/mirror.ts src/preload/console.ts src/shared/bridge.ts src/shared/types.ts src/renderer/shared/ErrorBoundary.tsx src/renderer/mirror/App.tsx src/renderer/mirror/styles.css src/renderer/mirror/index.html src/renderer/console/index.html tests/unit/boot-ipc.test.ts tests/unit/mirror-projection.test.ts docs/superpowers/plans/2026-08-19-phase0-task8-boot-ipc-mirror.md
Select-String -LiteralPath src/main/index.ts -Pattern 'sandbox: true','contextIsolation: true','nodeIntegration: false','setWindowOpenHandler','will-navigate'
Select-String -LiteralPath src/renderer/mirror/index.html,src/renderer/console/index.html -Pattern 'Content-Security-Policy','object-src ''none''','script-src ''self'''
```

- [ ] Expected outcome: focused tests exit `0`; `git diff --check` exits `0`; the security scans find every required marker; changed paths are exactly the plan plus the named implementation/test files; no added line contains `app.relaunch(`, `gpt-`, `modelId:`, `guestId`, `candidateProfileId`, or `activeProfileId` in a renderer/IPC payload. Return complete stdout/stderr and exit codes, exact-diff summary, and risks.

### Gate 5 — full regression with smoke contracts, typecheck/build (tester)

- [ ] Skills: the three project skills plus verification; `writing-plans` is not required.
- [ ] Run exactly these commands, with no `.env` access and no credential/device/network setup:

```powershell
npx vitest run --reporter=verbose
npm run typecheck:node
npm run typecheck:web
npm run build
```

- [ ] Expected outcome: the single full verbose Vitest run exits `0` and its verbose output includes all four existing `boot smoke contract` cases (clean boot, preload failure, one renderer recreate, supervisor exit after the recreate budget) with documented exit codes `0`, `2`, `0`, and `1`, plus the existing `smoke-mode` assertions; Node and web typechecks exit `0`; Electron Vite build exits `0`. The tester returns complete stdout/stderr for every command, exit codes, changed-file confirmation, and unresolved risks; it does not edit evidence or application files.

## Invariant review checklist

- `1`: no final transcript/audio, memory value, private context, image, embedding, or credential is stored or returned; diagnostics are metadata-only.
- `2`: no face candidate or private memory flow is implemented; only bounded identity status is projected.
- `3`: all guest/candidate/profile IDs remain in Main lifecycle context; no such field or value enters bridge, simulator result, UI, or Console channel.
- `4`: profile changes are untouched and remain the later clean-session owner.
- `5`: extraction owner snapshot is untouched.
- `6`: control-turn extraction rules are untouched.
- `7`: exact spell matching, one trigger, and approved presets are untouched.
- `8`: no microphone owner or handoff is added; the existing invariant remains preserved.
- `9`: every rejection/ignore/fallback/degrade has a visitor-visible state or metadata event with a stable reason.
- `10`: cloud/external module failure leaves Dormant available; local-essential failure is reasoned Maintenance; no black screen.
- `11`: boot calls `resolveModelSettings` from config and never substitutes a model or emits a runtime model literal.
- `12`: no credential IPC; future safeStorage access remains Main-only and no key reaches renderer/log/telemetry/export.

Completion means only the listed plan/application/test paths changed during their respective gates, the five gates ran in order, the root rulings above are visible in code/tests, and Task 9 Console pages plus Task 10 demo/record/exit ownership remain deferred.
