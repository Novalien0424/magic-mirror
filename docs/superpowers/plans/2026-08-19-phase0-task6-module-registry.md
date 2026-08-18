# Phase 0 Task 6 — Main-Owned Module Registry and Deterministic Mocks Implementation Plan

> **For agentic workers:** The interactive root dispatches fresh profile-backed CLI workers through the repository's explicit `codex exec --profile nova-auto --ephemeral --cd 'C:\Project\magic-mirror' -m gpt-5.6-luna -c 'model_reasoning_effort="max"'` route. Workers execute only their bounded task and never delegate, spawn, or dispatch children. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Main-owned, injected registry that reports every shared module without gating unrelated modules, plus a separate deterministic mock factory for focused contract tests.

**Architecture:** `createModuleRegistry` owns one runtime-exhaustive status record, receives adapters and a metadata-only event sink from Electron Main, and probes only the requested adapter. `createMockModuleFactory` creates independent adapters with a fixed, settable outcome; it never owns registry state and never emits telemetry. Missing adapters, thrown probes, invalid probe results, and sink failures are mapped at the registry boundary to closed metadata-only outcomes.

**Tech Stack:** Existing TypeScript shared types, Vitest, and the repository's existing Node/typecheck/build scripts. No new dependency.

**Spec:** `docs/Magic_Mirror_Implementation_Plan_v0.3.md` Phase 0 (§5, lines 136–193), the existing shared contracts in `src/shared/types.ts`, the metadata-only sink behavior in `src/main/telemetry.ts`, and the event-sink pattern in `src/main/config-service.ts`. This file is the accepted Task 6 design detail.

## Global Constraints

- Task 6 implementation scope is exactly these three application/test paths, in this order: create `tests/unit/module-registry.test.ts` RED first; create `src/main/module-registry.ts`; create `src/main/module-mocks.ts`.
- Every future Task 6 test or production-file write uses `apply_patch`; no shell write trick, formatter, generator, or editor may write any path.
- No shared type, boot, IPC, renderer, Console, lifecycle, config, telemetry, package, dependency, lockfile, process-state, product-document, evidence, `.env`, credential, immutable-skill, harness, or user-script change is allowed.
- Import and use the existing `ModuleId`, `ModuleStatus`, `OpStatus`, and `MirrorEvent` types from `src/shared/types.ts`; do not redefine or extend them.
- Adapter probe outcomes use the closed `ModuleProbeOutcome = Extract<OpStatus, 'success' | 'degraded' | 'failed'>` type. Every other runtime value, including `info`, is an invalid probe result and is mapped at the registry boundary.
- The runtime module set is exactly `app`, `openai`, `wake`, `audio`, `camera`, `identity`, `memory`, `avatar`, `lighting`, `fog`, `music`, `sqlite`, `config`, and `telemetry`.
- The default status is a runtime-exhaustive `Record<ModuleId, ModuleStatus>` with every value `not_implemented`. A missing adapter remains `not_implemented`; it is never inferred as ready.
- An injected adapter carries its own initial `ModuleStatus`. Registering an adapter applies that initial status without probing and without emitting an event.
- Duplicate adapter IDs are rejected by one stable domain error before a registry is returned; no partially constructed registry can escape.
- A probe may return `ModuleProbeOutcome` synchronously or through a promise/thenable. The registry normalizes both paths to `Promise` behavior and calls the selected adapter at most once.
- Only the selected module changes: valid `success` becomes `ready`, valid `degraded` becomes `degraded`, valid `failed` becomes `failed`, a throw/rejection becomes `failed`, an invalid result becomes `failed`, and a missing adapter stays `not_implemented`.
- Missing, throw, and invalid outcomes never escape as exceptions. Each returns a stable discriminated, metadata-only result. Raw exceptions, exception messages, arbitrary probe values, and arbitrary adapter/user strings never enter a result or event.
- Reason and error-code values are closed literal unions. Event source is limited to `runtime | simulator | contract_test` and defaults to `runtime`.
- Each outcome has one exact metadata-only `module_probe` event attempt. The event sink is injected and called once after the status transition. Every returned result carries closed `eventDelivery: 'emitted' | 'failed'` metadata; a sink throw or rejection-equivalent failure is isolated, never retried, and cannot roll back the status or reject the probe.
- There is no retry, alternate adapter, hidden fallback, constructor-time probe, `probeAll`, or sibling-module gate. A failing or missing adapter cannot block another module's independent probe.
- Snapshot and status reads are defensive. Returned records, reports, and event objects are fresh frozen values; mutating a returned value cannot mutate registry state.
- The deterministic mock factory has only fixed outcome controls and module/status metadata. It has no transcript, audio, memory, private-context, profile, image, embedding, credential, model, prompt, or arbitrary-content field.
- No OpenAI credential, camera, physical device, `.env` file, or credential store is read. Development Node `v24.19.0` already satisfies the repository prerequisite `>=22.22.2` or `>=24.15.0`; there is no user setup blocker.
- Windows verification covers the development path only. It cannot field-verify the target macOS Keychain, TCC, signing, entitlements, packaged-worker, or LaunchAgent path.
- Customizable wake word remains Phase 2. Task 6 does not add wake-word configuration, keyword encoding, sherpa models, microphone ownership, or recorded-WAV tuning.
- The user-owned `scripts/install-node-lts.ps1` and all process-state files remain untouched.

---

## Eight-field phase unit

Story / Phase: Phase 0 Foundation / Task 6 — Main-owned module registry and deterministic mock adapters.

User-visible outcome: Main can expose a status for every known module and a probe result/event that clearly distinguishes ready, degraded, failed, missing, thrown, and invalid behavior without hiding a failure or blocking unrelated modules.

Files / modules expected to change: `tests/unit/module-registry.test.ts` first, then `src/main/module-registry.ts`, then `src/main/module-mocks.ts`; no other path.

Console control or telemetry to add: No Console or IPC control in this task. The injected sink is attempted once with one metadata-only `module_probe` event per probe outcome, with source defaulting to `runtime`.

Happy-path test: Inject ready, degraded, and failed adapters with initial statuses; probe each synchronously and asynchronously; assert the selected status, stable result, and exact event.

Failure / fallback test: Probe a missing adapter, a synchronous/async throw, and invalid results; assert stable non-throwing reports, fixed error codes/reasons, exact events, no raw values, and no sibling-module change. Make the event sink throw or reject and assert the committed result still resolves with `eventDelivery: 'failed'`.

Explicit non-goals: No boot wiring, lifecycle changes, IPC, renderer/Console UI, telemetry implementation, config/model resolver, SQLite, OpenAI, camera, hardware, retry, fallback selection, microphone ownership, custom wake word, or Phase 0 demo execution.

Demo step affected: None directly. Task 6 supplies the contract used by later Phase 0 integration and P0-D3 observability work; Task 10 owns the actual P0-D1–P0-D5 demo runs and records.

## Authoritative references and rationale

- `src/shared/types.ts:5-19` defines the existing `ModuleId`, `ModuleStatus`, `OpStatus`, and metadata-only `MirrorEvent`; Task 6 consumes these types and does not alter them.
- `src/main/telemetry.ts:4-7, 60-66, 117-121, 617-671` defines the existing event-input shape, allowed source values, validation boundary, timestamp ownership, and raw-error-safe rejection behavior. The registry emits `Omit<MirrorEvent, 'time'>` so the injected telemetry sink remains the timestamp owner.
- `src/main/config-service.ts:31-43, 56-69` establishes the existing injected event-sink pattern and closed telemetry/error-code unions. Task 6 follows the pattern but keeps its own closed registry unions in `module-registry.ts`.
- `tests/unit/telemetry.test.ts:20-35, 139-145, 166-185` provides the local metadata/privacy test convention: use synthetic sentinels, assert raw exceptions do not appear, and keep diagnostics free of transcript/audio/private content.
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md:136-166` makes Phase 0 a visible, mockable skeleton, requires metadata-only events, lists the future mock adapters, and says module statuses are observational rather than a global gate.
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md:168-183` requires visible failure events, repeatable Phase 0 demos, and no partial state changes on invalid contracts.
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md:189-193` keeps OpenAI, camera, physical devices, remote admin, and complex envelopes outside this foundation task.
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md:209-215` keeps realtime voice and manual Console wake in Phase 1; custom wake word is explicitly deferred.
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md:258-309` assigns the local wake worker, custom Chinese keyword model, and microphone handoff to Phase 2, not Task 6.
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md:634-658` requires an eight-field unit, happy and failure tests, a Console/telemetry increment, and confirmation that transcript/audio persistence was not added.
- `.agents/skills/mm-phase-workflow/SKILL.md` requires mock-first, one bounded unit, a failure/fallback test, and no global gate; `.agents/skills/mm-invariants/SKILL.md` requires metadata-only diagnostics, no silent failure, and failure degradation; `.agents/skills/mm-electron-foundation/SKILL.md` keeps Main as the owner of lifecycle/config/devices and preserves the Windows-DPAPI versus target-macOS-Keychain distinction.

## Locked file topology

| Path | Responsibility | Allowed change |
|---|---|---|
| `tests/unit/module-registry.test.ts` | Independent exhaustive contract, created RED first and retained as regression coverage | Create/modify only this test file |
| `src/main/module-registry.ts` | Main-owned module IDs, adapter contract, statuses, probe mapping, defensive reads, and event isolation | Create only this production file |
| `src/main/module-mocks.ts` | Separate deterministic mock factory with settable fixed outcomes | Create only this production test-support file |

The implementation worker must not add a shared `module.ts`, boot import, IPC channel, renderer card, config entry, telemetry helper, package script, dependency, or fixture file. Later tasks may inject this registry without changing its contract.

## Exact public API: `src/main/module-registry.ts`

The following names, property names, and literal values are fixed. The code block is a type-level sketch; workers implement it with the smallest private helpers needed by the tests.

```ts
import type {
  MirrorEvent,
  ModuleId,
  ModuleStatus,
  OpStatus,
} from '../shared/types'

export const MODULE_IDS: readonly ModuleId[]
export const DEFAULT_MODULE_STATUSES: Readonly<Record<ModuleId, ModuleStatus>>

export type ModuleEventSource = NonNullable<MirrorEvent['source']>
export type ModuleProbeOutcome = Extract<OpStatus, 'success' | 'degraded' | 'failed'>
export type ModuleEventDelivery = 'emitted' | 'failed'

export type ModuleProbeReason =
  | 'probe_success'
  | 'probe_degraded'
  | 'probe_failed'
  | 'probe_threw'
  | 'probe_invalid'
  | 'module_missing'

export type ModuleProbeErrorCode =
  | 'module_probe_degraded'
  | 'module_probe_failed'
  | 'module_probe_threw'
  | 'module_probe_invalid'
  | 'module_adapter_missing'

type ModuleProbeResultBase = {
  readonly module: ModuleId
  readonly eventDelivery: ModuleEventDelivery
}

export type ModuleProbeResult =
  | (ModuleProbeResultBase & {
      readonly kind: 'success'
      readonly status: 'ready'
      readonly opStatus: 'success'
      readonly reason: 'probe_success'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'degraded'
      readonly status: 'degraded'
      readonly opStatus: 'degraded'
      readonly reason: 'probe_degraded'
      readonly errorCode: 'module_probe_degraded'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'failed'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly reason: 'probe_failed'
      readonly errorCode: 'module_probe_failed'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'throw'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly reason: 'probe_threw'
      readonly errorCode: 'module_probe_threw'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'invalid'
      readonly status: 'failed'
      readonly opStatus: 'failed'
      readonly reason: 'probe_invalid'
      readonly errorCode: 'module_probe_invalid'
    })
  | (ModuleProbeResultBase & {
      readonly kind: 'missing'
      readonly status: 'not_implemented'
      readonly opStatus: 'info'
      readonly reason: 'module_missing'
      readonly errorCode: 'module_adapter_missing'
    })

export interface ModuleAdapter {
  readonly id: ModuleId
  readonly initialStatus: ModuleStatus
  readonly probe: () => ModuleProbeOutcome | PromiseLike<ModuleProbeOutcome>
}

export interface ModuleEventSink {
  emit(event: Omit<MirrorEvent, 'time'>): void | PromiseLike<void>
}

export interface ModuleRegistryOptions {
  readonly events: ModuleEventSink
  readonly source?: ModuleEventSource
  readonly adapters?: readonly ModuleAdapter[]
}

export type ModuleRegistryErrorCode =
  | 'module_id_invalid'
  | 'module_adapter_invalid'
  | 'module_adapter_duplicate'
  | 'module_event_sink_invalid'
  | 'module_source_invalid'

export class ModuleRegistryError extends Error {
  readonly code: ModuleRegistryErrorCode
  constructor(code: ModuleRegistryErrorCode)
}

export interface ModuleRegistry {
  getStatus(module: ModuleId): ModuleStatus
  snapshot(): Readonly<Record<ModuleId, ModuleStatus>>
  probe(module: ModuleId): Promise<ModuleProbeResult>
}

export function isModuleId(value: unknown): value is ModuleId
export function createModuleRegistry(options: ModuleRegistryOptions): ModuleRegistry
```

### Registry construction semantics

1. `MODULE_IDS` is an ordered, frozen runtime tuple containing exactly the 14 shared IDs above. `DEFAULT_MODULE_STATUSES` is a separately declared, runtime-exhaustive `Record<ModuleId, ModuleStatus>` whose every value is `not_implemented`, exposed only through a defensive frozen copy.
2. `createModuleRegistry` requires `events`. It defaults `source` to `runtime`, accepts only `runtime`, `simulator`, or `contract_test`, and validates `events.emit` before constructing state. Invalid configuration throws `ModuleRegistryError` with a closed `ModuleRegistryErrorCode` and a stable generic message; it never interpolates an input or exception.
3. The constructor validates every adapter before publishing any registry: adapter object, `id`, `initialStatus`, and callable `probe`. It builds a temporary map, rejects a repeated `id` with `code === 'module_adapter_duplicate'`, and only then creates the private status record and adapter map. There is no partially constructed return value.
4. The private status record starts as a copy of `DEFAULT_MODULE_STATUSES`; each validated adapter's `initialStatus` then overwrites only that adapter's ID. Construction calls no probe and emits no event.
5. `getStatus` accepts a typed `ModuleId` but also guards runtime input. A runtime-invalid value throws `ModuleRegistryError('module_id_invalid')`; a valid ID with no adapter is not an invalid input and is handled as the stable `missing` probe result.

### Probe semantics

1. `probe(module)` validates the module, increments no external counter, selects only that module's adapter, and returns a `Promise` even for a synchronous adapter.
2. Normalize the adapter call as `await Promise.resolve().then(() => adapter.probe())`. This catches both a synchronous throw and an asynchronous rejection without inspecting the caught value. There is exactly one invocation and no retry.
3. Validate the resolved value by exact identity against the closed `ModuleProbeOutcome` literals: `success`, `degraded`, or `failed`. An object, `null`, `undefined`, `info`, unknown string, extra-field object, symbol, or any other value is `invalid`; no raw value is copied.
4. Apply only these transitions: `success -> ready`, `degraded -> degraded`, `failed -> failed`, throw/rejection -> `failed`, invalid result -> `failed`, missing adapter -> `not_implemented`. The missing result's `opStatus` and event `status` are both `info`, with fixed reason `module_missing` and error code `module_adapter_missing`.
5. Return the matching frozen `ModuleProbeResult` with `eventDelivery: 'emitted'` after normal event delivery or `eventDelivery: 'failed'` after a sink failure. Missing, throw, and invalid are ordinary resolved results, not thrown errors. The only probe-time throw is the stable `module_id_invalid` domain error for a runtime-invalid module key.
6. After committing the selected status, build one frozen event with the exact matrix key set and attempt `await Promise.resolve().then(() => events.emit(event))` exactly once. A synchronous sink throw, returned-thenable rejection, or thenable assimilation failure is caught without binding, reading, or forwarding the caught value; the registry does not retry, and returns the same outcome with `eventDelivery: 'failed'`. Normal completion returns the same outcome with `eventDelivery: 'emitted'`. `eventDelivery` is result metadata only and never an event key.

### Exact event matrix

Every event is a frozen `Omit<MirrorEvent, 'time'>`; it contains no `time` because the injected telemetry sink owns timestamping. The event name is always `module_probe`. `source` is the constructor source or `runtime`. Object key order is not significant, but the key set and values are exact. A normal one-attempt delivery gives the returned result `eventDelivery: 'emitted'`; a synchronous throw or rejection-equivalent sink failure gives it `eventDelivery: 'failed'`. Event objects themselves never contain `eventDelivery`.

| Probe outcome | `ModuleProbeResult` status | Event `status` (`MirrorEvent['status']`) | Event `reason` | Event `error_code` | Exact event shape |
|---|---|---|---|---|---|
| valid `success` | `ready` | `success` | `probe_success` | absent | `{ module, event: 'module_probe', status: 'success', reason: 'probe_success', source }` |
| valid `degraded` | `degraded` | `degraded` | `probe_degraded` | `module_probe_degraded` | `{ module, event: 'module_probe', status: 'degraded', error_code: 'module_probe_degraded', reason: 'probe_degraded', source }` |
| valid `failed` | `failed` | `failed` | `probe_failed` | `module_probe_failed` | `{ module, event: 'module_probe', status: 'failed', error_code: 'module_probe_failed', reason: 'probe_failed', source }` |
| synchronous throw or async rejection | `failed` | `failed` | `probe_threw` | `module_probe_threw` | `{ module, event: 'module_probe', status: 'failed', error_code: 'module_probe_threw', reason: 'probe_threw', source }` |
| invalid resolved result | `failed` | `failed` | `probe_invalid` | `module_probe_invalid` | `{ module, event: 'module_probe', status: 'failed', error_code: 'module_probe_invalid', reason: 'probe_invalid', source }` |
| no adapter for a valid module ID | `not_implemented` | `info` | `module_missing` | `module_adapter_missing` | `{ module, event: 'module_probe', status: 'info', error_code: 'module_adapter_missing', reason: 'module_missing', source }` |

No event includes `duration_ms`, `session_id`, `scene_id`, `eventDelivery`, arbitrary fields, adapter data, model IDs, credentials, transcript, audio, private context, image/frame data, embeddings, or raw exception content. A sink that throws or rejects is tested for isolation; the registry does not attempt to serialize or forward the sink's exception and reports only the closed result metadata `eventDelivery: 'failed'`.

### Defensive reads and non-gating rule

- `snapshot()` returns a new frozen flat record containing exactly every `ModuleId` on every call. `getStatus()` returns only a scalar `ModuleStatus`.
- The result and event passed to the sink are new frozen objects. A sink may inspect them but cannot mutate registry state through them. `eventDelivery` exists only on the returned result; the event key set remains exact.
- The registry has no `register`, `setStatus`, `reset`, `probeAll`, or retry method. A caller probes modules independently. A failing `audio` adapter never causes a `fog` adapter to run, wait, or change status.

## Exact public API: `src/main/module-mocks.ts`

```ts
import type {
  ModuleAdapter,
  ModuleId,
  ModuleStatus,
} from './module-registry'

export type MockProbeOutcome =
  | 'success'
  | 'degraded'
  | 'failed'
  | 'throw'
  | 'invalid'

export interface MockModuleOptions {
  readonly initialStatus?: ModuleStatus
  readonly outcome?: MockProbeOutcome
}

export interface MockModuleAdapter extends ModuleAdapter {
  setOutcome(outcome: MockProbeOutcome): void
}

export interface ModuleMockFactory {
  create(id: ModuleId, options?: MockModuleOptions): MockModuleAdapter
}

export function createMockModuleFactory(): ModuleMockFactory
```

The factory defaults `initialStatus` to `not_implemented` and `outcome` to `success`. `create` validates a runtime ID and throws the stable `ModuleRegistryError('module_id_invalid')` for a runtime-invalid value. `setOutcome` accepts only the five fixed outcomes. `success`, `degraded`, and `failed` return the corresponding `OpStatus`; `throw` throws a fixed synthetic error inside the mock; `invalid` returns `null` through an internal test-only cast. The registry, not the mock, maps those last two cases to fixed metadata.

Each returned adapter has only `id`, `initialStatus`, `probe`, and `setOutcome`; it carries no private-content field and emits no event. Outcome state is per adapter and deterministic. The factory uses no timer, randomness, clock, environment variable, file, network, credential, or shared mutable registry state. `setOutcome` affects the next call and does not alter `initialStatus`.

## TDD task sequence

### Task 1: Create the RED test file before production modules

**Files:**

- Create: `tests/unit/module-registry.test.ts`
- Read-only references: `src/shared/types.ts`, `src/main/telemetry.ts`, `src/main/config-service.ts`, `tests/unit/telemetry.test.ts`

- [ ] Write only the test file. Do not create placeholder `src/main/module-registry.ts` or `src/main/module-mocks.ts` yet.
- [ ] Import the exact public API names from both missing production modules. Do not use a Vitest module mock to hide a missing import.
- [ ] Keep the expected ID tuple independent of `MODULE_IDS` so a production omission fails:

```ts
const EXPECTED_MODULE_IDS = [
  'app', 'openai', 'wake', 'audio', 'camera', 'identity', 'memory',
  'avatar', 'lighting', 'fog', 'music', 'sqlite', 'config', 'telemetry',
] as const
```

- [ ] Use a metadata-only event capture helper. It must copy only the event fields and never log or persist the event:

```ts
type CapturedEvent = Omit<MirrorEvent, 'time'>

function capture(events: CapturedEvent[]): ModuleEventSink {
  return {
    emit(event) {
      events.push({ ...event })
    },
  }
}
```

- [ ] Use `createMockModuleFactory()` for deterministic valid outcomes, and use tiny local adapters only where the test must deliberately return a promise, throw a raw sentinel, or return an invalid value. Never put a private-content sentinel in a source/event field except to assert that it is absent.

Add these focused cases with these exact names and assertions. This is the minimum RED/GREEN contract; more tests are allowed only inside this file and only when they preserve the same closed API.

1. `enumerates every ModuleId and initializes the runtime-exhaustive default record`: assert `MODULE_IDS` exactly equals `EXPECTED_MODULE_IDS`, `Object.keys(registry.snapshot()).sort()` equals the sorted expected tuple, all values are `not_implemented`, and construction emitted no event.
2. `applies each injected adapter initialStatus without probing or changing siblings`: inject `openai` as `ready`, `wake` as `degraded`, and `camera` as `failed`; assert those exact statuses, every other module remains `not_implemented`, no probe ran, and no event was emitted.
3. `rejects duplicate adapter IDs with a stable domain error and no partial registry`: inject two `audio` adapters; assert `ModuleRegistryError`, `code === 'module_adapter_duplicate'`, a generic stable message, no probe call, and no registry value is returned.
4. `returns a stable missing result and one exact info metadata event`: probe `wake` without an adapter using source `contract_test`; assert `kind: 'missing'`, `status: 'not_implemented'`, `opStatus: 'info'`, `eventDelivery: 'emitted'`, fixed reason/error code, the exact event matrix row with `status: 'info'`, and unchanged snapshots.
5. `maps synchronous success to ready and probes only the selected module`: inject factory-default `lighting` and `fog` mocks (initial `not_implemented`, outcome `success`), probe `lighting`, assert only lighting maps to `ready` with one `success` result/event, one selected outcome, zero sibling calls, and `fog` remains `not_implemented`.
6. `maps asynchronous degraded to degraded after Promise normalization`: inject a local adapter whose probe returns `Promise.resolve('degraded')`; assert the awaited `kind`, status, fixed reason/error code, and exact degraded event.
7. `maps valid failed to failed without retry or sibling gating`: use a failed `music` mock and a ready `fog` mock; probe music, assert one failed call, no retry, no fog call, music failed, fog unchanged, and the fixed failed event.
8. `maps synchronous and asynchronous throws to stable failed results`: run one adapter that throws a raw error synchronously and one that returns a rejected promise; assert both resolve as `kind: 'throw'`, status `failed`, fixed `module_probe_threw`/`probe_threw`, and no raw error text appears in either serialized result or event.
9. `maps null undefined unknown and object probe values to invalid without forwarding them`: run separate adapters returning `null`, `undefined`, `info`, an unknown string, and an object containing a raw sentinel/private-looking field; assert each resolves as `kind: 'invalid'`, status `failed`, fixed `module_probe_invalid`/`probe_invalid`, and no raw value/field appears in the result or event.
10. `changes only the probed module`: initialize at least four adapters with distinct statuses, make the selected adapter begin `ready` (not `degraded`), snapshot before and after a degraded probe, assert exactly one status key actually changed, and assert all unselected adapter call counts are zero.
11. `returns defensive frozen status snapshots and reports`: obtain two snapshots and assert they are distinct and frozen; attempt `Reflect.set` on one, assert the registry is unchanged; assert the probe result and later snapshot cannot be mutated through a previous reference.
12. `isolates an event sink throw after committing the selected status`: use sinks that throw or return a rejected thenable containing a synthetic raw-error sentinel; probe a ready adapter through each, assert each call resolves with status ready and `eventDelivery: 'failed'`, and no exception/sentinel appears in either result or any captured metadata.
13. `accepts only runtime simulator and contract_test sources and defaults to runtime`: run probes with each allowed source and no source; assert exact event source values, then pass a cast invalid source and assert `ModuleRegistryError('module_source_invalid')` without emitting an arbitrary source.
14. `rejects runtime-invalid module IDs and malformed adapters with closed configuration codes`: pass a cast invalid module ID, a malformed adapter, a bad initial status, and a bad sink; assert only the documented `ModuleRegistryErrorCode` is exposed and no input object/string is copied into the error message or event.
15. `keeps mock outcomes settable, deterministic, and independent`: create two mock adapters; assert default success, set one through degraded, failed, throw, and invalid, then create a new handle for the same module and assert the new handle starts at its defaults; assert the other adapter's outcome and initial status never change and no private-content keys exist.
16. `uses the exact metadata-only event key set for all six outcomes`: exercise success, degraded, failed, throw, invalid, and missing; assert keys are exactly `module`, `event`, `status`, `reason`, `source`, plus `error_code` for non-success outcomes; assert no `time`, `eventDelivery`, or arbitrary field exists, and assert every returned frozen result carries only the closed `eventDelivery` value.

- [ ] Keep deliberate runtime-invalid inputs behind `as unknown`; do not use `any` to weaken the public contract.
- [ ] Add explicit privacy assertions using opaque synthetic sentinels for raw exception text and private-looking fields. The test must not write those sentinels to a file or telemetry implementation.

### Task 2: Observe the required RED checkpoint

- [ ] Dispatch a fresh tester with this exact focused command before creating either production module:

```powershell
npm test -- tests/unit/module-registry.test.ts
```

- [ ] Expected RED is only the missing production-module resolution failure (`src/main/module-registry.ts` and/or its dependent `src/main/module-mocks.ts`) with a non-zero exit. Do not add placeholder production files, skip tests, or alter package configuration to change the failure shape.
- [ ] The tester returns complete stdout/stderr and the exit code. The evidence is metadata-only: path, failure category, test count if available, and code; never raw private content.

### Task 3: Implement the smallest GREEN registry

**Files:**

- Create: `src/main/module-registry.ts`
- Existing test file may be corrected only when a test assertion is inconsistent with the locked API; no other file may change.

- [ ] Add the existing type imports, exact frozen ID tuple, explicit runtime source set, and `DEFAULT_MODULE_STATUSES` record. Verify the record has all 14 keys and all values `not_implemented` at runtime.
- [ ] Add the closed `ModuleProbeOutcome` derived from the existing `OpStatus` literals, `ModuleEventDelivery`, `ModuleProbeReason`, `ModuleProbeErrorCode`, `ModuleRegistryErrorCode`, discriminated `ModuleProbeResult`, `ModuleAdapter`, sink, options, and registry interfaces exactly as specified.
- [ ] Implement `ModuleRegistryError` with a stable generic message and closed `code`. Never interpolate module input, adapter data, reason text, or caught exceptions.
- [ ] Implement validators for event sink, source, adapter ID/status/probe, and runtime module IDs. A malformed adapter or option throws a stable domain error; it is distinct from a runtime invalid probe result, including runtime `info` values outside `ModuleProbeOutcome`.
- [ ] Build a temporary validated adapter map and reject duplicate IDs before the registry object is created. Initialize the private status record from the default record and apply only adapter `initialStatus` values.
- [ ] Implement `getStatus` and `snapshot` as defensive reads. Freeze returned snapshots and never expose the internal map or adapter objects.
- [ ] Implement `probe` using exactly one `await Promise.resolve().then(() => adapter.probe())` boundary. Map only exact `ModuleProbeOutcome` literals; treat `info` and every other runtime value as invalid; catch sync throw/rejection without reading the caught value; map invalid values without copying them.
- [ ] Commit the selected module status before building the result/event. Ensure no sibling status or adapter is touched. Missing returns `not_implemented`, uses `opStatus: 'info'`, emits event `status: 'info'`, and does not invent a fallback adapter.
- [ ] Emit exactly one frozen `module_probe` event through a safe helper. Await one sink attempt so synchronous throws and returned-thenable rejections become `eventDelivery: 'failed'` without reading the caught value; normal completion returns `eventDelivery: 'emitted'`. Do not retry or recursively emit, and never add delivery to the event object.

### Task 4: Implement the separate deterministic mock factory

**Files:**

- Create: `src/main/module-mocks.ts`

- [ ] Import the registry contracts and `ModuleRegistryError`/`isModuleId`; do not duplicate module IDs or create a second registry.
- [ ] Implement `createMockModuleFactory()` and `create` with per-adapter closure state. Defaults are `initialStatus: 'not_implemented'` and `outcome: 'success'`.
- [ ] Implement `setOutcome` for exactly `success`, `degraded`, `failed`, `throw`, and `invalid`; valid outcomes return the matching `OpStatus`, `throw` creates a fixed local error, and `invalid` returns `null` only through an internal test-only cast.
- [ ] Keep the adapter surface to `id`, `initialStatus`, `probe`, and `setOutcome`; no private-content fields, events, timers, random values, environment reads, filesystem reads, network calls, credentials, or model values.
- [ ] Ensure changing one mock's outcome changes no other mock and never changes its fixed `initialStatus`.

### Task 5: Focused GREEN and limited refactor

- [ ] Run the focused tester command again:

```powershell
npm test -- tests/unit/module-registry.test.ts
```

- [ ] Expected result is exit `0`, with every Task 6 test passing. The tester reports complete output, test count, duration, and exit code.
- [ ] If focused GREEN fails, change only the three locked paths, fix one contract failure at a time, and rerun the focused command. Do not broaden scope.
- [ ] Refactor only private helpers, type aliases, and test harness setup inside the three locked paths while GREEN. Do not rename public exports, fields, union literals, event keys, error codes, or change the one-module/no-retry semantics.

### Task 6: Fresh tester validation

Dispatch fresh testers after focused GREEN. They may run only these exact commands and must return complete stdout/stderr and exit codes:

| Check | Exact command | Expected |
|---|---|---|
| focused | `npm test -- tests/unit/module-registry.test.ts` | exit `0` |
| full | `npm test` | exit `0` |
| typecheck | `npm run typecheck:node` and `npm run typecheck:web` | both exit `0` |
| build | `npm run build` | exit `0` |
| status | `git status --short` | exit `0`; root reviews every reported path for scope |

The typecheck stage is two named commands because Main and renderer TypeScript configurations are separate. No tester may edit application files or create an evidence artifact. A Windows green result is development evidence only and cannot field-verify the target macOS path.

## Root review criteria

Root accepts Task 6 only when all of the following are evidenced externally after the worker self-review, with no more than three worker self-review passes:

- The diff contains exactly `tests/unit/module-registry.test.ts`, `src/main/module-registry.ts`, and `src/main/module-mocks.ts` for the application/test implementation; no shared type or integration file changed.
- The RED checkpoint failed only because the two production modules were missing, and the focused GREEN checkpoint later passes.
- `MODULE_IDS` and `DEFAULT_MODULE_STATUSES` are runtime-exhaustive and match the existing shared union; every unregistered module is `not_implemented`.
- Adapter `initialStatus` is applied without a probe; duplicates fail with the stable domain code and no partial registry is returned.
- Adapter `probe` accepts only the closed `ModuleProbeOutcome` values (with runtime `info` and every other non-member invalid); sync and async probes are normalized; only the selected module changes; success/degraded/failed/throw/invalid/missing map exactly as specified, including missing `opStatus`/event `status` `info`; no retry and no sibling gate exists.
- Missing, throw, and invalid results are stable discriminated metadata-only values. Raw exceptions, arbitrary values, and private content never appear in results, events, errors, logs, or worker evidence.
- Every outcome attempts exactly one exact event matrix row after committing status; normal delivery returns `eventDelivery: 'emitted'`, a sink throw or rejection-equivalent failure returns the same outcome with `eventDelivery: 'failed'`, and the sink is never retried or allowed to reject/roll back a probe. Event objects retain the exact existing key sets and never include `eventDelivery`.
- Snapshots, reports, and event objects are defensive/frozen and no internal state leaks; event-delivery metadata is closed and result-only.
- The mock factory is deterministic, independently settable, and contains no private-content field.
- Applicable invariants are explicitly reported: IDs 1, 9, 10, 11, and 12. Invariants 2–8 remain preserved by non-entry into identity, profile, memory, scene, wake, and microphone paths.
- Focused/full tests, both typechecks, build, and status all have complete output and exit codes from fresh testers. Root does not substitute confidence for validation output.

## Task 7/8/9/10 boundaries

- Task 7 owns the config-driven AI model settings resolver and Main-owned session/job snapshots. It may inject or consume module status later, but Task 6 does not add model IDs, config reads, snapshot fields, or fallback model logic.
- Task 8 owns later Phase 0 boot/lifecycle/OfflineLoop integration. It may construct the registry in Main and decide how a visible failure state is presented; it may not change the registry's public contract, make module health a global gate, or add a second restart owner.
- Task 9 owns later Console/Simulator/IPC presentation and controls. It may display the frozen snapshot and metadata events, but it may not pass profile IDs, credentials, transcripts, audio, or arbitrary adapter strings through this registry, and it may not mutate registry state through a returned snapshot.
- Task 10 owns P0-D1–P0-D5 independent demos, short regression smoke, Phase Tests/`PROGRESS.md` records, and the phase exit decision. Task 6 claims no demo pass, hardware result, macOS field verification, or phase exit.
- Task 6 does not reorder the application task sequence. It remains a bounded contract unit and does not absorb any work from Tasks 7–10.

## Exact commit, push, and merged-main flow

The planning worker does not implement, test, commit, push, merge, edit process state, or read credentials. The plan artifact is committed and pushed separately first as its own prior commit; it is not included in the three-file Task 6 implementation commit. The existing `phase0-modules` branch already exists and tracks `origin/phase0-modules`; no new task-specific branch is created or used.

After the root accepts this plan and the current application-task sequencing permits implementation:

1. Root dispatches the RED implementer, RED tester, production implementer, focused GREEN tester, and full validation testers through the required fresh `gpt-5.6-luna`/`max` envelopes. Workers use `apply_patch`, report their exact diff/output, and do not widen scope.
2. After root's external review accepts the complete evidence, root stages only the three locked implementation/test paths, commits on the existing `phase0-modules` branch, and pushes that branch:

   ```powershell
   git switch phase0-modules
   git add tests/unit/module-registry.test.ts src/main/module-registry.ts src/main/module-mocks.ts
   git commit -m "feat: add main module registry and deterministic mocks"
   git push origin phase0-modules
   ```

3. Root reviews the pushed branch tip and fast-forwards local `main` without squashing, rebasing, or editing the accepted application diff:

   ```powershell
   git switch main
   git pull --ff-only origin main
   git merge --ff-only phase0-modules
   ```

4. Before pushing `main`, root dispatches a fresh merged-main tester for the focused, full, both typecheck, build, and status commands above. Root accepts the merged-main evidence only after it passes and the final status contains no unexpected path.
5. Only after that merged-main validation passes does root push `main`:

   ```powershell
   git push origin main
   ```

## Evidence and privacy hand-off

Every worker returns exact changed paths, a concise diff summary, complete stdout/stderr and exit code for every named command, applicable invariant IDs, privacy posture, self-review pass count, and unresolved risks. Evidence may contain only paths, hashes, counts, timings, statuses, reasons, fixed error codes, closed `eventDelivery` values, and exit codes. It must never contain transcripts, audio, extracted memory values, private context, credentials, images, embeddings, raw exceptions, sink exception content, or user-content prompts. Event objects retain their exact metadata-only key sets and never carry `eventDelivery`; sink failure is reported only as the result metadata enum.

Plan complete.
