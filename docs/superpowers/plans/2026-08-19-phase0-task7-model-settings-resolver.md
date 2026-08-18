# Phase 0 Task 7 — AI Model Settings Resolver Implementation Plan

> **For agentic workers:** The interactive root dispatches these five bounded gates through fresh profile-backed CLI workers. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure Electron Main resolver that reads the three configured AI model roles from versioned config, exposes Active/Draft/Previous views, freezes session and job snapshots at their creation boundaries, and produces metadata-only simulator evidence without adding persistence or provider calls.

**Architecture:** `src/main/model-settings.ts` consumes the existing `ConfigSlots` value returned by `ConfigService` and has no file, database, credential, IPC, renderer, SDK, or network access. It validates exactly `realtimeDialogue`, `inputTranscription`, and `memoryExtractor`, fingerprints the complete config, returns frozen Active/Draft/Previous views, creates frozen snapshots only from Active, and builds a pure `source=simulator` metadata event; the caller owns event emission.

**Tech Stack:** TypeScript 5.9, existing `zod`-validated `MirrorConfig`, existing `ConfigService`/`ConfigSlots`, Node `crypto`, Vitest 4, and the existing Electron Vite build. No dependency changes.

**Spec:** `docs/Magic_Mirror_PRD_v0.3.md`, `docs/Magic_Mirror_Tech_Spec_v0.3.md`, and `docs/Magic_Mirror_Implementation_Plan_v0.3.md` (Phase 0 scope, Models Console increment, P0-D5, and Phase 0 exit criteria).

## Global Constraints

- This boundary starts after accepted Task 6 work. Preserve Task 6 status and application order; Task 7 remains separate.
- The only application paths are `src/main/model-settings.ts` and `tests/unit/model-settings.test.ts`. Do not modify `src/main/config-service.ts`, `src/shared/types.ts`, `src/main/module-registry.ts`, `src/main/module-mocks.ts`, `src/main/telemetry.ts`, package files, configuration data, product documents, scripts, `AGENTS.md`, `PROGRESS.md`, `DECISIONS.md`, `.env`, or any process ledger.
- Do not inspect, copy, validate, hash, print, or expose `.env`, credentials, user content, transcripts, audio, private context, prompts, images, or embeddings. Evidence is metadata-only: paths, IDs, enums, counts, timings, statuses, reasons, hashes, and exit codes.
- `ConfigService` remains the sole owner of `active.json`, `draft.json`, and `previous.json` persistence, atomic writes, revision changes, validation, diffing, publish, rollback, and compensation. The resolver accepts an existing `ConfigSlots` value and does not recreate or wrap persistence.
- Resolve exactly the three existing `MirrorConfig.aiModels` keys. Do not add a provider list, role registry, candidate list, auto-latest selector, generic model router, default, fallback, substitution, or retry policy. Every runtime model ID comes directly from supplied versioned config; an invalid or failed configured ID remains visibly invalid/failed.
- `SessionModelSnapshot` and `JobModelSnapshot` retain the existing shared shapes. Return `Readonly<...>` and freeze flat objects at explicit session-creation/job-enqueue boundaries. Draft and Previous are display/diff inputs, never snapshot sources; publishing cannot mutate an existing snapshot.
- A fingerprint is metadata only. It identifies a full config revision but never enters prompts, credentials, renderer data, transcripts, audio, memory values, or raw diagnostics. Simulator evidence contains only bounded metadata, enums, counts, config metadata, and a safe reason.
- Simulator outcomes are exactly `result: 'mock_passed' | 'failed'` and `source: 'simulator'`, never real provider results. No OpenAI call, Agents SDK type, WebRTC, credential exchange, `safeStorage`, `.env` access, UI, IPC, boot/lifecycle wiring, module-registry change, Phase 1 contract, Phase 2 wake behavior, hardware behavior, second restart owner, sibling gate, retry maze, or global model-health gate belongs here.
- The pure resolver has no platform branch. Windows development evidence does not field-verify target macOS Keychain, TCC, signing, entitlements, packaged workers, or LaunchAgent behavior. The one-restart-owner rule remains unchanged.
- Only the interactive root dispatches the bounded workers; no worker dispatches a child or creates a review role. Workers do not stage, commit, push, merge, or edit an unlisted path. Root performs the external review.
- Every gate prompt repeats:

  ```text
  model: "gpt-5.6-luna"
  reasoning_effort: "max"
  role: exactly one of "implementer" or "tester"
  fresh_worker: true
  task: one bounded TDD gate with explicit non-goals
  write_scope: exact named files; read-only unless the named scope grants a write
  skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, .agents/skills/mm-realtime-voice/SKILL.md
  self_invariants: 1, 3, 9, 10, 11, 12
  evidence: exact files, concise diff summary, complete command output and exit codes, unresolved risks; metadata-only
  self_review: read the own diff/output; no more than 3 passes
  root_review: external root gate after return; not part of self-review
  ```

- Applicable invariants are 1, 3, 9, 10, 11, and 12: RAM-only content and metadata-only diagnostics; Main-only profile/guest identifiers; visible/reasoned invalid or degraded results; failures do not gate unrelated adapters; configured IDs without silent substitution; and Main-only credentials. Invariants 2, 4, 5, 6, 7, and 8 remain unchanged and outside this task.

## File and Interface Contract

The implementation boundary is intentionally two files:

- Create `src/main/model-settings.ts` for pure Main-owned validation, stable whole-config fingerprinting, frozen Active/Draft/Previous views, active-only snapshots, and metadata-only simulator evidence.
- Create `tests/unit/model-settings.test.ts` for deterministic fixtures, core TDD tests, ConfigService boundary tests using injected in-memory adapters, snapshot-boundary tests, no-fallback tests, and simulator metadata tests.
- Read-only dependencies are `ConfigSlots`/`ConfigSlot`/`ConfigService` from `src/main/config-service.ts`; `MirrorConfig`, `SessionModelSnapshot`, `JobModelSnapshot`, and `MirrorEvent` from `src/shared/types.ts`; and existing telemetry/module tests only for conventions.

The production file exposes these exact symbols and no provider-specific runtime literals:

```ts
export type ModelSettingsRole =
  | 'realtimeDialogue'
  | 'inputTranscription'
  | 'memoryExtractor'

export const MODEL_SETTINGS_ROLES: readonly ModelSettingsRole[]

export type ActiveModelSettings = Readonly<{
  readonly slot: 'active'
  readonly configVersion: number
  readonly fingerprint: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
}>

export type DraftModelSettings = Readonly<{
  readonly slot: 'draft'
  readonly configVersion: number
  readonly fingerprint: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
}>

export type PreviousModelSettings = Readonly<{
  readonly slot: 'previous'
  readonly configVersion: number
  readonly fingerprint: string
  readonly realtimeDialogue: string
  readonly inputTranscription: string
  readonly memoryExtractor: string
  readonly voice: string
}>

export interface ModelSettingsResolution {
  readonly active: ActiveModelSettings
  readonly draft: DraftModelSettings
  readonly previous: PreviousModelSettings
}

export type ModelSettingsErrorCode =
  | 'model_settings_invalid_config'
  | 'model_settings_invalid_role'
  | 'model_settings_snapshot_not_active'
  | 'model_settings_invalid_taken_at'

export class ModelSettingsError extends Error {
  readonly code: ModelSettingsErrorCode
  readonly slot: 'active' | 'draft' | 'previous' | null
  readonly role: ModelSettingsRole | null
}

export function resolveModelSettings(slots: ConfigSlots): ModelSettingsResolution
export function createSessionModelSnapshot(active: ActiveModelSettings, takenAt: string): Readonly<SessionModelSnapshot>
export function createJobModelSnapshot(active: ActiveModelSettings, takenAt: string): Readonly<JobModelSnapshot>

export interface ModelSettingsSimulatorObservation {
  readonly session: Readonly<{
    readonly realtimeDialogue: string
    readonly inputTranscription: string
    readonly voice: string
  }>
  readonly job: Readonly<{ readonly memoryExtractor: string }>
}

export interface ModelSettingsSimulatorEvidence {
  readonly result: 'mock_passed' | 'failed'
  readonly source: 'simulator'
  readonly configVersion: number
  readonly fingerprint: string
  readonly roleCount: 3
  readonly reason: string
  readonly event: Readonly<Omit<MirrorEvent, 'time'>>
}

export function buildModelSettingsSimulatorEvidence(
  active: ActiveModelSettings,
  session: Readonly<SessionModelSnapshot>,
  job: Readonly<JobModelSnapshot>,
  observed: ModelSettingsSimulatorObservation,
): ModelSettingsSimulatorEvidence
```

`resolveModelSettings` resolves `active`, `draft`, and `previous` independently, validates the exact role-key set and non-empty configured IDs, preserves configured strings and voice, computes a deterministic SHA-256 fingerprint from stable-key ordering of the complete `MirrorConfig` including `configVersion`, freezes each view and the returned container, and never reads another slot when one is invalid. `createSessionModelSnapshot` and `createJobModelSnapshot` first require `active.slot === 'active'`, then non-empty `takenAt`, copy only existing fields, freeze the flat object, and never call `Date.now()`, retain mutable config, look up another slot, or expose a lazy getter.

`buildModelSettingsSimulatorEvidence` compares the active view, both frozen snapshots, and the three-role observation in a fixed order. A complete match returns `mock_passed`; the first mismatch returns `failed` with `error_code: 'model_settings_simulator_mismatch'`. Both return `source: 'simulator'`, `module: 'openai'`, event `model_settings_simulated`, `roleCount: 3`, config metadata, and a safe reason. No captured values, transcript/audio/private-context fields, raw exception, credential, fallback field, side effect, or telemetry emission is allowed.

## Five-Gate TDD Execution Sequence

### Gate 1: One implementer writes every focused test, with no production file

**Role/scope:** `implementer`, write only `tests/unit/model-settings.test.ts`; read only `src/main/config-service.ts`, `src/shared/types.ts`, and `src/main/telemetry.ts`. This gate is test-only and must not create or modify `src/main/model-settings.ts`.

Define deterministic non-user-content fixtures. `fixtureConfig(version, suffix)` uses exactly `fixture-realtime-${suffix}`, `fixture-transcription-${suffix}`, `fixture-memory-${suffix}`, `fixture-voice-${suffix}`, and `fixture-persona-${suffix}`, includes every required `MirrorConfig` field (`persona`, `voice`, `idleSeconds`, all three `aiModels` roles, `wake`, `faceModel`, `assets`, empty `spells`/`scenes`, and mock adapters), and `fixtureSlots()` returns active `fixtureConfig(7, 'active')`, draft `fixtureConfig(7, 'draft')`, previous `fixtureConfig(6, 'previous')`.

Write the core tests with these exact assertions:

```ts
describe('model settings resolver core', () => {
  it('resolves exactly the three configured roles from all three slots', () => {
    const slots = fixtureSlots(); const resolved = resolveModelSettings(slots)
    expect(MODEL_SETTINGS_ROLES).toEqual(['realtimeDialogue', 'inputTranscription', 'memoryExtractor'])
    expect(resolved.active.slot).toBe('active'); expect(resolved.draft.slot).toBe('draft'); expect(resolved.previous.slot).toBe('previous')
    expect(resolved.active.realtimeDialogue).toBe('fixture-realtime-active')
    expect(resolved.draft.inputTranscription).toBe('fixture-transcription-draft')
    expect(resolved.previous.memoryExtractor).toBe('fixture-memory-previous')
    expect(resolved.active.voice).toBe('fixture-voice-active')
    expect(resolved.active.fingerprint).not.toBe(resolved.draft.fingerprint)
  })

  it('freezes session and job snapshots at their explicit active boundaries', () => {
    const resolved = resolveModelSettings(fixtureSlots())
    const session = createSessionModelSnapshot(resolved.active, '2026-08-19T00:00:00.000Z')
    const job = createJobModelSnapshot(resolved.active, '2026-08-19T00:00:01.000Z')
    expect(session).toEqual({ configVersion: resolved.active.configVersion, fingerprint: resolved.active.fingerprint, realtimeDialogue: 'fixture-realtime-active', inputTranscription: 'fixture-transcription-active', voice: 'fixture-voice-active', takenAt: '2026-08-19T00:00:00.000Z' })
    expect(job).toEqual({ configVersion: resolved.active.configVersion, fingerprint: resolved.active.fingerprint, memoryExtractor: 'fixture-memory-active', takenAt: '2026-08-19T00:00:01.000Z' })
    expect(Object.isFrozen(session)).toBe(true); expect(Object.isFrozen(job)).toBe(true)
    expect(() => Object.defineProperty(session, 'realtimeDialogue', { value: 'fixture-realtime-other' })).toThrow()
  })

  it('rejects an invalid configured role instead of substituting another slot', () => {
    const slots = fixtureSlots(); const invalidDraft: MirrorConfig = { ...slots.draft, aiModels: { ...slots.draft.aiModels, inputTranscription: { modelId: '' } } }
    expect(() => resolveModelSettings({ ...slots, draft: invalidDraft })).toThrowError(expect.objectContaining({ name: 'ModelSettingsError', code: 'model_settings_invalid_role', slot: 'draft', role: 'inputTranscription' }))
  })
})
```

Add the ConfigService boundary harness using the existing injected `ConfigFileOperations`, `ConfigAtomicWriter`, and `ConfigEventSink` seams. Use only `boundary-config`/`boundary-default` in-memory keys, deterministic fixture JSON, and metadata-only events—never real directories, `.env`, credentials, network, or disk. Include this exact publish/rollback assertion sequence:

```ts
it('tests whole-config publish and rollback at the ConfigService boundary', async () => {
  const harness = makeConfigBoundaryHarness(); const initial = fixtureConfig(7, 'active')
  harness.store.set('boundary-default', encode(initial)); await harness.service.initialize()
  const draft = fixtureConfig(7, 'published'); await harness.service.saveDraft(draft)
  const beforePublish = await harness.service.read(); const beforeResolution = resolveModelSettings(beforePublish)
  const oldSession = createSessionModelSnapshot(beforeResolution.active, '2026-08-19T00:01:00.000Z')
  const oldJob = createJobModelSnapshot(beforeResolution.active, '2026-08-19T00:01:01.000Z')
  const draftDiff = await harness.service.diff('active', 'draft')
  expect(draftDiff.nonModelChanges).toBe(true)
  expect(draftDiff.changed.map((change) => change.path)).toEqual(expect.arrayContaining(['aiModels.realtimeDialogue.modelId', 'aiModels.inputTranscription.modelId', 'aiModels.memoryExtractor.modelId', 'persona.name', 'voice']))
  const published = await harness.service.publish(); const afterPublish = await harness.service.read()
  expect(afterPublish.active).toEqual(published); expect(afterPublish.previous).toEqual(initial); expect(afterPublish.draft).toEqual(published)
  expect(published.persona.name).toBe(draft.persona.name); expect(published.voice).toBe(draft.voice); expect(published.aiModels).toEqual(draft.aiModels)
  const afterResolution = resolveModelSettings(afterPublish)
  expect(oldSession.realtimeDialogue).toBe('fixture-realtime-active'); expect(oldSession.inputTranscription).toBe('fixture-transcription-active'); expect(oldJob.memoryExtractor).toBe('fixture-memory-active')
  expect(afterResolution.active.realtimeDialogue).toBe('fixture-realtime-published'); expect(afterResolution.active.inputTranscription).toBe('fixture-transcription-published'); expect(afterResolution.active.memoryExtractor).toBe('fixture-memory-published'); expect(afterResolution.active.configVersion).toBe(published.configVersion)
  const rollbackDiff = await harness.service.diff('active', 'previous'); expect(rollbackDiff.nonModelChanges).toBe(true)
  const rolledBack = await harness.service.rollback(); const afterRollback = await harness.service.read()
  expect({ ...rolledBack, configVersion: initial.configVersion }).toEqual(initial); expect(afterRollback.active).toEqual(rolledBack); expect(afterRollback.draft).toEqual(rolledBack); expect(afterRollback.previous).toEqual(published)
})
```

Also test invalid Draft through `harness.service.saveDraft(...)`: rejected `ConfigServiceError.code` is exactly `'config_schema_invalid'`, the prior active full config remains unchanged, and no partial publish is observed. Add the exact simulator success/failure assertions below, using a deterministic observation standing in for three mock factories:

```ts
it('returns metadata-only simulator evidence with source and reason', () => {
  const resolved = resolveModelSettings(fixtureSlots()); const session = createSessionModelSnapshot(resolved.active, '2026-08-19T00:02:00.000Z'); const job = createJobModelSnapshot(resolved.active, '2026-08-19T00:02:01.000Z')
  const observed: ModelSettingsSimulatorObservation = { session: { realtimeDialogue: session.realtimeDialogue, inputTranscription: session.inputTranscription, voice: session.voice }, job: { memoryExtractor: job.memoryExtractor } }
  const evidence = buildModelSettingsSimulatorEvidence(resolved.active, session, job, observed)
  expect(evidence.result).toBe('mock_passed'); expect(evidence.source).toBe('simulator'); expect(evidence.roleCount).toBe(3)
  expect(evidence.reason).toBe('operation=simulate;result=mock_passed;role_count=3;config_version=7;session_config_version=7;job_config_version=7;cause=all_configured_ids_observed')
  expect(evidence.event).toMatchObject({ module: 'openai', event: 'model_settings_simulated', status: 'success', source: 'simulator', reason: evidence.reason })
  expect(Object.keys(evidence.event).sort()).toEqual(['event', 'module', 'reason', 'source', 'status'])
  expect(JSON.stringify(evidence)).not.toContain('fixture-realtime-active'); expect(JSON.stringify(evidence)).not.toContain('fixture-transcription-active'); expect(JSON.stringify(evidence)).not.toContain('fixture-memory-active')
})

it('returns failed simulator metadata for a mismatched role without fallback', () => {
  const resolved = resolveModelSettings(fixtureSlots()); const session = createSessionModelSnapshot(resolved.active, '2026-08-19T00:03:00.000Z'); const job = createJobModelSnapshot(resolved.active, '2026-08-19T00:03:01.000Z')
  const evidence = buildModelSettingsSimulatorEvidence(resolved.active, session, job, { session: { realtimeDialogue: session.realtimeDialogue, inputTranscription: 'fixture-transcription-wrong', voice: session.voice }, job: { memoryExtractor: job.memoryExtractor } })
  expect(evidence.result).toBe('failed'); expect(evidence.source).toBe('simulator'); expect(evidence.reason).toContain('cause=capture_mismatch'); expect(evidence.reason).toContain('role=inputTranscription')
  expect(evidence.event).toMatchObject({ status: 'failed', source: 'simulator', error_code: 'model_settings_simulator_mismatch' })
})
```

The evidence tests inspect metadata and event reasons only; no observed IDs, transcript-like strings, raw errors, prompts, audio, private context, credentials, or arbitrary payload may enter returned evidence/events. Read the test diff and confirm only the named test path changed.

### Gate 2: One tester runs the focused RED checkpoint

**Role/scope:** `tester`, read-only; no files may change. Run exactly:

```powershell
npx vitest run tests/unit/model-settings.test.ts
```

Expected RED is a non-zero module-resolution/collection failure because `src/main/model-settings.ts` is absent. If a production file unexpectedly exists, the expected failure is the missing `buildModelSettingsSimulatorEvidence` export. Verify the failure is the expected missing-module/export condition, do not edit or create production code, and return complete stdout/stderr, exit code, changed-file scope, and metadata-only risk.

### Gate 3: One implementer creates the complete smallest production implementation

**Role/scope:** `implementer`, create only `src/main/model-settings.ts`; read-only `src/main/config-service.ts`, `src/shared/types.ts`, `src/main/telemetry.ts`, and the test path. Do not modify the test, ConfigService, shared types, Telemetry, module registry, UI, IPC, or any other path. This gate runs only after Gate 2’s RED.

Implement all exact contract symbols in one pure module:

1. Freeze `MODEL_SETTINGS_ROLES` in the exact configured-key order. `ModelSettingsError` has a constant safe message, stable code, nullable slot/role metadata, and never stores raw config or caught exceptions.
2. `stableConfigValue` recursively sorts object keys while preserving array order. `fingerprintConfig` hashes the complete `MirrorConfig` with built-in `createHash('sha256')`; serialization failure throws `ModelSettingsError('model_settings_invalid_config', slot, null)` without exposing the underlying error.
3. `resolveSlot(slot, config)` validates version/voice, verifies `Object.keys(config.aiModels)` is exactly the three role keys, reads each configured `modelId` directly, rejects missing/non-string/blank IDs, preserves each original string, fingerprints the whole config, and returns a frozen slot view. No `??`, candidate list, auto-latest, alternate slot, hardcoded ID, or fallback branch.
4. `resolveModelSettings(slots)` calls `resolveSlot` once for each `active`, `draft`, and `previous`, then freezes the container; it never catches an invalid slot to substitute another.
5. Snapshot builders first assert active slot and non-empty `takenAt`, then return the exact frozen shapes:

```ts
export function createSessionModelSnapshot(active: ActiveModelSettings, takenAt: string): Readonly<SessionModelSnapshot> {
  assertActive(active); assertTakenAt(takenAt)
  return Object.freeze({ configVersion: active.configVersion, fingerprint: active.fingerprint, realtimeDialogue: active.realtimeDialogue, inputTranscription: active.inputTranscription, voice: active.voice, takenAt })
}
export function createJobModelSnapshot(active: ActiveModelSettings, takenAt: string): Readonly<JobModelSnapshot> {
  assertActive(active); assertTakenAt(takenAt)
  return Object.freeze({ configVersion: active.configVersion, fingerprint: active.fingerprint, memoryExtractor: active.memoryExtractor, takenAt })
}
```

6. Implement `ModelSettingsSimulatorObservation`, `ModelSettingsSimulatorEvidence`, and `buildModelSettingsSimulatorEvidence` as pure metadata construction. Compare observed values to snapshots and snapshots to Active in fixed order `realtimeDialogue`, `inputTranscription`, `memoryExtractor`, `voice`, then session/job `configVersion` and `fingerprint` boundaries. Use exactly:

```ts
const successReason = 'operation=simulate;result=mock_passed;role_count=3;config_version=' + String(active.configVersion) + ';session_config_version=' + String(session.configVersion) + ';job_config_version=' + String(job.configVersion) + ';cause=all_configured_ids_observed'
const mismatchReason = 'operation=simulate;result=failed;role_count=3;config_version=' + String(active.configVersion) + ';session_config_version=' + String(session.configVersion) + ';job_config_version=' + String(job.configVersion) + ';cause=capture_mismatch;role=' + mismatchRole
```

Construct event exactly as `{ module: 'openai', event: 'model_settings_simulated', status: 'success' | 'failed', source: 'simulator', reason }`, adding only `error_code: 'model_settings_simulator_mismatch'` for failure; freeze evidence and event. Do not include model ID values, raw errors, arbitrary `details`, fallback action, SDK data, credential state, content fields, or a sink call. Read the production diff and confirm the only new behavior is pure metadata construction with no runtime model literal, provider call, persistence call, or fallback vocabulary.

### Gate 4: One tester runs focused GREEN and inspects the two-file diff

**Role/scope:** `tester`, read-only. Run exactly:

```powershell
npx vitest run tests/unit/model-settings.test.ts
```

Expected GREEN is zero exit with every core resolver, snapshot-boundary, ConfigService publish/rollback, invalid-Draft, and simulator evidence test passing. Inspect only `src/main/model-settings.ts` and `tests/unit/model-settings.test.ts`; report exact files, exported symbols, diff summary/line count, focused test count/duration/exit code, ConfigService consumed rather than redefined, old snapshot unchanged after Publish, new snapshot using new Active revision, no raw content/secrets in evidence, Windows/macOS verification risk, checked invariant IDs, and self-review pass count capped at three.

### Gate 5: One tester runs full validation and both negative source scans

**Role/scope:** `tester`, read-only. Run each command separately and return complete stdout/stderr and exit code for every command:

```powershell
npm test
npm run typecheck
npm run build
rg -n --glob '*.ts' --glob '!tests/**' 'gpt-[A-Za-z0-9.-]+|modelId\s*:\s*[\x22\x27]' src
rg -n --glob '*.ts' --glob '!tests/**' 'fallback|auto.?latest|candidate.?model' src/main/model-settings.ts
```

Expected: `npm test`, `npm run typecheck`, and `npm run build` exit `0` (complete suite, Node/web typecheck, Electron Vite main/preload/renderer build). Both `rg` scans exit `1` with empty output. The first catches provider-looking literals and direct string-valued `modelId` assignments in runtime `src`; the second catches fallback/candidate routing vocabulary. If either scan exits `0`, print only matching paths/line numbers and fail the gate—never print model values. Return exact changed files, diff summary, all outputs/codes, invariant IDs, self-review pass count, and unresolved risks; do not inspect `.env` or credentials.

## Root Review Checklist

Root accepts only evidence that: Gate 1 wrote all focused tests before production; Gate 2 produced the expected missing-module/export RED; Gate 3 changed only the named resolver path; Gate 4 is green and the two-file diff proves all three slots, exact role keys, frozen Active-only snapshots, ConfigService boundary consumption, invalid-Draft preservation, and metadata-only simulator success/failure; and Gate 5 has full suite, Node/web typecheck, Electron build, and both negative scans.

Root also checks that no slot/role falls through to another ID, no generic router/provider list exists, old snapshots survive Publish, new snapshots require explicit creation, simulator evidence is bounded/reasoned and never a real contract result, failures do not gate unrelated adapters, and the worker route is not copied into runtime configuration or artifacts. Canonical invariants 1, 3, 9, 10, 11, and 12 must be explicitly checked; 2, 4, 5, 6, 7, and 8 remain outside scope. No `.env` content, credential value, transcript, audio, private context, user-content prompt, image, embedding, or secret may appear in source, output, telemetry, or report.

## Explicit Non-Goals

- No implementation outside the two named paths in this plan; no ConfigService schema/persistence rewrite, active/draft/previous format change, or new persistence layer.
- No OpenAI or Agents SDK call, RealtimeSession, WebRTC, Responses extractor, credential exchange, or model connectivity test.
- No runtime model ID literals, default IDs, hidden SDK defaults, fallback IDs, retry policy, provider router, model dropdown, or multi-provider abstraction.
- No IPC, renderer, Console page, boot/lifecycle wiring, module-registry/module-mock change, telemetry writer change, database change, or Phase 1/Phase 2 behavior.
- No identity/profile/guest ownership, private-memory loading, extraction ownership, control-turn filtering, exact spell matching, microphone ownership, avatar, device, or wake implementation.

