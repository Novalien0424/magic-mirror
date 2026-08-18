# Phase 0 Task 3 — ConfigService + CredentialStore Implementation Plan

> For agentic workers: execute this single bounded unit through the repository's direct worker route. The root Codex thread is the sole orchestrator and reviewer. Each direct worker has exactly one role, either implementer or tester. No nested worker, reviewer worker, or delegation is created. Steps use checkbox syntax for tracking.

**Goal:** Build the Main-only Phase 0 configuration and credential contracts. ConfigService owns versioned Active/Draft/Previous JSON, schema validation, first-boot seeding, defensive recovery, atomic publish and rollback, deterministic config revisions, diff metadata, and degradation of malformed scene/spell entries. CredentialStore owns one Electron safeStorage-encrypted blob outside config and backups, with set/get/clear and safeStorage re-encryption handling. Both services expose Task 4-compatible metadata-only event seams.

**Architecture:** `src/main/config-service.ts` receives its config directory and versioned default JSON path from its caller, requires an event sink, and accepts optional file-operation and atomic-writer adapters. `src/main/credential-store.ts` receives a caller-supplied credential path, an injected Electron 43 safeStorage adapter, a required event sink, and optional file-operation and atomic-writer adapters. Each factory selects its private Node disk adapters only when the corresponding adapter is omitted and honors every injected adapter when supplied. Neither module imports `app`, opens IPC, calls a network, resolves model roles, creates session/job snapshots, or writes durable telemetry.

**Tech Stack:** TypeScript 5.9, zod `^4.4.3`, write-file-atomic `^8.0.0`, Electron `^43.0.0` safeStorage through an injected adapter, Node file APIs, and Vitest `^4.1.10`. Use the existing package and lockfile exactly; add no dependency and change no script.

**Spec:** [PRD](../../Magic_Mirror_PRD_v0.3.md) §§ 5.1, 6.1, 9.1, 11; [Tech Spec](../../Magic_Mirror_Tech_Spec_v0.3.md) §§ 6.3, 13.2–13.4, 14.1; [Implementation Plan](../../Magic_Mirror_Implementation_Plan_v0.3.md) §§ 3.3–3.4, Phase 0 scope, P0-D4, and P0-D5; [Stack Adversarial Review](../../Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md) § D; the shared contracts in `src/shared/types.ts`; and the existing worker shape in `docs/superpowers/plans/2026-08-17-phase0-task2-lifecycle.md`.

## Global Constraints

- Application Task 2 is completed and locally integrated. Application Task 3 is prepared but not started on branch `phase0-config`. Phase 0 remains in progress, Phase 1 remains blocked, and this plan supplies no demo or Phase 0 exit evidence.
- The implementation write scope is exactly these five paths:
  - `src/main/config-service.ts`
  - `src/main/credential-store.ts`
  - `resources/config/default.json`
  - `tests/unit/config-service.test.ts`
  - `tests/unit/credential-store.test.ts`
- The two test files are written first by a test-only implementer. The two TypeScript source files and the JSON resource are written later by the same logical implementer. No worker writes, stages, commits, pushes, or merges.
- `AGENTS.md`, `PROGRESS.md`, `DECISIONS.md`, `src/main/index.ts`, `src/main/log.ts`, `src/shared/types.ts`, `src/shared/bridge.ts`, every preload and renderer, `package.json`, `package-lock.json`, all existing tests, all other resources, and every other path are read-only.
- Never access `scripts/install-node-lts.ps1`. Do not run tests, typecheck, build, install, stage, commit, push, merge, checkout, or a package manager command during this planning unit.
- Use only the existing zod, write-file-atomic, Electron safeStorage, Node, TypeScript, and Vitest baseline. Do not add a dependency, change a package version, change a runtime model setting, or change a package script.
- `ConfigService` receives `configDir` and `defaultConfigPath`; it never derives either path from `app.getPath`, `__dirname`, an environment variable, a renderer, or a hard-coded resource path. The caller supplies the packaged resource path.
- `CredentialStore` receives `credentialPath`; it never derives a path from `app.getPath`, config contents, backup contents, a renderer, or a network response. The caller places the path in a data directory outside `config/` and `backups/`.
- The shared `MirrorConfig` interface remains authoritative. The service validates every core field, preserves the exact three AI model-role fields as non-empty strings, and never resolves a role, chooses a candidate, substitutes a model, or carries a model fallback list.
- Fake model IDs exist in the versioned `resources/config/default.json` fixture and in test-only literal fixtures as visibly named mock values. Production TypeScript contains no model ID literal or fallback list, and the worker harness model is not copied into the resource or runtime source.
- `configVersion` is a positive safe integer. First boot preserves the default resource version. `saveDraft` keeps the current Active version. Every successful Publish and Rollback sets the new Active and Draft version to exactly `active.configVersion + 1`; the old Active becomes Previous. No caller-supplied future revision is trusted.
- Publish and Rollback are multi-file transactions implemented with write-file-atomic per file plus compensating restoration of the exact pre-operation bytes or absence for all three slots. A one-shot injected transaction failure must run a successful restoration and leave Active, Draft, and Previous byte-for-byte unchanged; a separate one-shot restoration failure must emit a distinct compensation failure and throw `config_compensation_failed`.
- Active, Draft, and Previous are read independently. A missing or malformed Draft falls back in memory to a validated Active with a reason. A missing or malformed Previous falls back in memory to validated Active with a reason. A missing or malformed Active falls back first to validated Previous and then to the validated versioned default, with a reason. If no validated core remains, the operation fails visibly with a metadata-only event.
- A malformed spell or scene entry never rejects the anonymous core. A malformed container becomes an empty array; a malformed item becomes an explicit disabled local envelope with an indexed reason. The valid core remains available. Phase 4 owns the eventual scene and spell schema.
- All event sinks use the structural Task 4 seam `emit(event: Omit<MirrorEvent, 'time'>): void`. Events always use `source: 'runtime'`, `module: 'config'`, fixed event names, fixed statuses, typed error codes, and metadata-only reasons. No config values, model ID values, scene names, spell text, plaintext credentials, transcripts, audio, private context, images, embeddings, prompts, or raw exception messages enter an event.
- Config validation errors expose only allow-listed field paths, safe schema categories, and issue counts. Storage and credential errors expose stable safe error codes and operation causes; they do not preserve an adapter exception as `cause`, `message`, or serialized data. Every public safe error uses a constant message and has no `cause` property.
- CredentialStore gates `set` and `get` on `safeStorage.isEncryptionAvailable()`. It stores only the encrypted Buffer returned by the adapter, handles `shouldReEncrypt()` after a successful decrypt by encrypting and atomically replacing the blob, and keeps plaintext only in the call stack and returned value.
- CredentialStore does not import Electron `app`, wait for `app.ready`, register IPC, mint a short-lived credential, call a network, use keytar, write config or backups, or expose a renderer API. Task 8 owns `app.ready`, Main wiring, IPC, and Phase 1 owns short-lived credential exchange.
- Electron safeStorage uses DPAPI on the Windows development machine and Keychain on the target macOS machine through the same adapter contract. Unit tests exercise the injected seam; a Windows result does not field-verify macOS Keychain, TCC, signing, or entitlement behavior.
- Task 4 durable telemetry, Task 7 model-role resolution and `SessionModelSnapshot`/`JobModelSnapshot`, Task 8 app.ready/IPC/boot wiring, Task 9 UI, and Phase 1 credential exchange are explicitly outside this unit.
- Preserve all canonical invariants 1–12. This unit directly exercises 1, 3, 9, 10, 11, and 12. Invariants 2, 4, 5, 6, 7, and 8 remain preserved by the absence of face authorization, profile switching, memory extraction, spell execution, and microphone ownership in these modules.
- The root remains the sole orchestrator and reviewer. Every later worker dispatch carries `model: "gpt-5.6-luna"`, `reasoning_effort: "max"`, `role: exactly one of "implementer" or "tester"`, and `fresh_worker: true`, plus exact scope, skills, invariant IDs, and metadata-only evidence requirements.

## Unit Scope — 1–2 Days

**Story / Phase:** `US-FOUND-001` and `US-DEV-001` / Phase 0 Foundation, Application Task 3.

**User-visible outcome:** Main can seed and read a usable versioned configuration, save a Draft, publish a deterministic new revision, show a structural diff, roll back the complete configuration after a tested failure path, and keep malformed future scene/spell data visibly degraded without blocking anonymous core operation. Main can store, retrieve, re-encrypt, and clear an OS-keystore credential without placing plaintext in config, backups, telemetry, or errors.

**Files / modules expected to change:** Create exactly `src/main/config-service.ts`, `src/main/credential-store.ts`, `resources/config/default.json`, `tests/unit/config-service.test.ts`, and `tests/unit/credential-store.test.ts`.

**Console control or telemetry to add:** Add only injected metadata event seams for `config_seeded`, `config_loaded`, `config_recovered`, `config_auxiliary_degraded`, `config_draft_saved`, `config_published`, `config_rolled_back`, `config_diff_computed`, `config_operation_failed`, `config_transaction_compensated`, `credential_set`, `credential_get`, `credential_missing`, `credential_cleared`, `credential_reencrypted`, and `credential_operation_failed`. Task 4 owns the durable writer and Console rendering.

**Happy-path test:** Initialize from the caller-supplied default, read all three slots, save a Draft, compute a model/non-model diff, publish with `configVersion + 1`, read the new Active/Draft/Previous, roll back with another deterministic revision, and set/get/clear an encrypted credential.

**Failure / fallback test:** Read malformed/missing Active, Draft, Previous, scene entries, and spell entries; reject malformed core data; inject a publish write failure and a rollback write failure and assert exact restoration; gate safeStorage unavailable; inject encrypt/decrypt/read/write/clear failures; exercise `shouldReEncrypt`; assert every fallback, drop, reject, and degrade has the exact metadata-only event and reason.

**Explicit non-goals:** Main boot wiring, `app.ready`, Electron IPC, Renderer or Console UI, Task 4 durable telemetry, Task 7 model resolver and snapshots, SQLite, migrations, backup rotation/restore, model contract tests, Realtime credentials, network calls, keytar, face identity, memory extraction, spell matching, scene adapters, microphone ownership, and Phase 1 credential exchange.

**Demo step affected:** P0-D4 and P0-D5 only at the service-contract level. The unit creates no windows, no IPC command, no durable telemetry timeline, no model-role resolver, and no runnable demo. P0-D4/P0-D5 remain later root-reviewed application demos.

## Phase Demo and Exit Impact

- P0-D4 will have a caller-owned path contract and testable defensive config reads, but Task 3 does not wire restart boot or prove that a packaged app can reopen its files.
- P0-D5 will have versioned mock data, Draft/Active/Previous behavior, diff metadata, and safe seams for later mock factories, but Task 3 does not create a model resolver, session snapshot, job snapshot, Console Models page, or mock factory.
- The anonymous core remains usable when a scene/spell item is malformed. A core schema failure is a local configuration failure and is reported as such; it does not get replaced by a different model or a hidden default list.
- Credential unit evidence proves the Main-only boundary and encrypted-blob separation at the adapter seam. It does not prove macOS Keychain field behavior; Windows DPAPI is the development platform only.
- Phase 0 remains in progress after this unit. A green focused suite does not claim Task 3 completion, P0-D4, P0-D5, a Phase 0 demo, or Phase 0 exit.

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `tests/unit/config-service.test.ts` | Create first | Specify the core schema, first boot, defensive slot reads, auxiliary degradation, Draft, Publish, Rollback, diff, deterministic revisions, compensation, event shape, and model-source/privacy constraints. |
| `tests/unit/credential-store.test.ts` | Create first | Specify safeStorage availability, encrypted bytes, set/get/clear, missing data, re-encryption, failure redaction, path separation, metadata-only events, and synthetic-secret absence. |
| `src/main/config-service.ts` | Create second | Implement the exact ConfigService public/internal contracts, zod core validation, auxiliary sanitizers, path resolution from caller inputs, atomic slot transactions, compensation, diff, and event mapping. |
| `src/main/credential-store.ts` | Create second | Implement the exact Main-only CredentialStore contract, injected safeStorage/file/atomic seams, encrypted blob lifecycle, re-encryption, safe errors, and event mapping. |
| `resources/config/default.json` | Create second | Versioned mock-only MirrorConfig fixture. It contains all three mock model-role IDs and no worker harness model, secret, transcript, audio, private context, image, embedding, or prompt content. |
| `src/shared/types.ts` | Read only | Supplies `MirrorConfig`, `ConfigDiff`, `FieldError`, `MirrorEvent`, and `ModuleId`; no shared type changes are allowed. |
| `src/main/index.ts` | Read only | Confirms Task 8 owns `app.whenReady`, Main boot, and future config/credential wiring. |
| `src/main/log.ts` | Read only | Confirms the existing boot marker is metadata-only and is not a Task 3 event writer. |
| `src/shared/bridge.ts` | Read only | Confirms no Task 3 IPC or Renderer bridge is allowed. |
| `package.json` and `package-lock.json` | Read only | Confirm the existing zod, write-file-atomic, Electron, TypeScript, and Vitest baseline. |
| `tsconfig.node.json` | Read only | Confirms both Main modules and unit tests are covered by node typecheck. |

## Exact Public Interfaces

The following exported declarations are mandatory. Names, property types, and method signatures are part of the Task 3 contract.

    import type { ConfigDiff, FieldError, MirrorConfig, MirrorEvent } from '../shared/types';

    export type ConfigSlot = 'active' | 'draft' | 'previous';

    export interface ConfigSlots {
      active: MirrorConfig;
      draft: MirrorConfig;
      previous: MirrorConfig;
    }

    export interface ConfigFileOperations {
      ensureDirectory(directoryPath: string): Promise<void>;
      readText(filePath: string): Promise<string | null>;
      remove(filePath: string): Promise<void>;
    }

    export interface ConfigAtomicWriter {
      write(filePath: string, contents: string): Promise<void>;
    }

    export interface ConfigEventSink {
      emit(event: Omit<MirrorEvent, 'time'>): void;
    }

    export interface ConfigServiceOptions {
      configDir: string;
      defaultConfigPath: string;
      files?: ConfigFileOperations;
      atomicWriter?: ConfigAtomicWriter;
      events: ConfigEventSink;
    }

    export interface ConfigService {
      initialize(): Promise<ConfigSlots>;
      read(): Promise<ConfigSlots>;
      saveDraft(candidate: unknown): Promise<MirrorConfig>;
      publish(): Promise<MirrorConfig>;
      rollback(): Promise<MirrorConfig>;
      diff(from: ConfigSlot, to: ConfigSlot): Promise<ConfigDiff>;
    }

    export type ConfigErrorCode =
      | 'config_schema_invalid'
      | 'config_read_failed'
      | 'config_write_failed'
      | 'config_default_invalid'
      | 'config_previous_unavailable'
      | 'config_revision_exhausted'
      | 'config_compensation_failed';

    export type ConfigRecoveryTelemetryCode =
      | 'config_slot_missing'
      | 'config_slot_invalid'
      | 'config_slot_unreadable';

    export type ConfigAuxiliaryTelemetryCode =
      | 'config_spell_container_invalid'
      | 'config_scene_container_invalid'
      | 'config_spell_entry_invalid'
      | 'config_scene_entry_invalid';

    export type ConfigTelemetryErrorCode =
      | ConfigErrorCode
      | ConfigRecoveryTelemetryCode
      | ConfigAuxiliaryTelemetryCode;

    export class ConfigServiceError extends Error {
      readonly code: ConfigErrorCode;
      readonly fields: readonly FieldError[];
      constructor(code: ConfigErrorCode, fields?: readonly FieldError[]);
    }

    export const mirrorConfigSchema: z.ZodType<unknown>;
    export function createConfigService(options: ConfigServiceOptions): ConfigService;

The `mirrorConfigSchema` export is the strict core envelope validator. Its inferred output is normalized to `MirrorConfig` only after auxiliary scene/spell sanitization. It contains no model literal.

CredentialStore exports the following separate declarations. It has no Electron app, IPC, or network import.

    export interface SafeStorageAdapter {
      isEncryptionAvailable(): boolean;
      encryptString(plaintext: string): Buffer;
      decryptString(encrypted: Buffer): string;
      shouldReEncrypt(): boolean;
    }

    export interface CredentialFileOperations {
      ensureDirectory(directoryPath: string): Promise<void>;
      readBytes(filePath: string): Promise<Buffer | null>;
      remove(filePath: string): Promise<void>;
    }

    export interface CredentialAtomicWriter {
      write(filePath: string, encrypted: Buffer): Promise<void>;
    }

    export interface CredentialEventSink {
      emit(event: Omit<MirrorEvent, 'time'>): void;
    }

    export interface CredentialStoreOptions {
      credentialPath: string;
      safeStorage: SafeStorageAdapter;
      files?: CredentialFileOperations;
      atomicWriter?: CredentialAtomicWriter;
      events: CredentialEventSink;
    }

    export interface CredentialStore {
      set(plaintext: string): Promise<void>;
      get(): Promise<string | null>;
      clear(): Promise<void>;
    }

    export type CredentialErrorCode =
      | 'credential_input_invalid'
      | 'credential_encryption_unavailable'
      | 'credential_encrypt_failed'
      | 'credential_decrypt_failed'
      | 'credential_io_failed'
      | 'credential_reencrypt_failed'
      | 'credential_clear_failed';

    export type CredentialTelemetryErrorCode = CredentialErrorCode;

    export class CredentialStoreError extends Error {
      readonly code: CredentialErrorCode;
      constructor(code: CredentialErrorCode);
    }

    export function createCredentialStore(options: CredentialStoreOptions): CredentialStore;

`CredentialStore.set`, `get`, and `clear` return no event payload and never expose the credential to the event sink. The only plaintext return is the deliberate caller-side result of `get()`, which Task 8 must keep in Main.

## Exact Internal Interfaces and Constants

ConfigService uses these internal records; they are not exported.

    type SlotInspection =
      | { status: 'missing'; raw: null }
      | { status: 'valid'; raw: string; value: MirrorConfig }
      | { status: 'invalid'; raw: string; fields: readonly FieldError[] }
      | { status: 'unreadable'; raw: null };

    type RawSlots = Record<ConfigSlot, string | null>;

    type AuxiliarySlot = 'spells' | 'scenes';

    interface AuxiliaryEnvelope {
      id: string;
      enabled: boolean;
    }

    const SLOT_ORDER: readonly ConfigSlot[] = ['previous', 'active', 'draft'];
    const MODEL_PATHS: ReadonlySet<string> = new Set([
      'aiModels.realtimeDialogue.modelId',
      'aiModels.inputTranscription.modelId',
      'aiModels.memoryExtractor.modelId',
    ]);

    const SLOT_FILE_NAMES: Record<ConfigSlot, string> = {
      active: 'active.json',
      draft: 'draft.json',
      previous: 'previous.json',
    };

    interface ResolvedConfigServiceOptions {
      configDir: string;
      defaultConfigPath: string;
      files: ConfigFileOperations;
      atomicWriter: ConfigAtomicWriter;
      events: ConfigEventSink;
    }

    function slotPath(configDir: string, slot: ConfigSlot): string;
    function serializeConfig(config: MirrorConfig): string;
    function parseConfigText(contents: string, slot: ConfigSlot, events: ConfigEventSink): MirrorConfig;
    function normalizeAuxiliary(config: MirrorConfig, slot: ConfigSlot, events: ConfigEventSink): MirrorConfig;
    function inspectSlot(options: ResolvedConfigServiceOptions, slot: ConfigSlot): Promise<SlotInspection>;
    function readRawSlots(options: ResolvedConfigServiceOptions): Promise<RawSlots>;
    function restoreRawSlots(options: ResolvedConfigServiceOptions, raw: RawSlots): Promise<void>;
    function writeSlotTransaction(options: ResolvedConfigServiceOptions, next: RawSlots, before: RawSlots, operation: 'seed' | 'publish' | 'rollback'): Promise<void>;
    function resolveConfigOptions(options: ConfigServiceOptions): ResolvedConfigServiceOptions;
    function flattenJson(value: unknown, path: string, output: Map<string, unknown>): void;
    function makeConfigDiff(from: MirrorConfig, to: MirrorConfig): ConfigDiff;

The implementation must use `node:path` join/dirname and `node:fs/promises` only in the default injected adapters. The default adapters are private:

    const diskConfigFiles: ConfigFileOperations = {
      async ensureDirectory(directoryPath) {
        await mkdir(directoryPath, { recursive: true });
      },
      async readText(filePath) {
        try {
          return await readFile(filePath, 'utf8');
        } catch (error) {
          if (isNotFoundError(error)) return null;
          throw error;
        }
      },
      async remove(filePath) {
        try {
          await unlink(filePath);
        } catch (error) {
          if (!isNotFoundError(error)) throw error;
        }
      },
    };

    const diskConfigAtomicWriter: ConfigAtomicWriter = {
      async write(filePath, contents) {
        await writeFileAtomic(filePath, contents, { encoding: 'utf8' });
      },
    };

`createConfigService` always uses caller-injected adapters when supplied by the public options. The private defaults are only the concrete Node implementation of the same seams and do not change the public constructor.

`ConfigServiceOptions.events` is required. `files` and `atomicWriter` are optional independently: the factory resolves each missing adapter to its private disk implementation and leaves each supplied adapter untouched. Tests that supply one adapter and omit the other therefore exercise the mixed seam as well as the all-injected seam.

CredentialStore uses the analogous private disk adapters. Its atomic writer calls write-file-atomic with a Buffer, and its file adapter returns `null` for ENOENT. The source file must not import `safeStorage`; the caller maps Electron safeStorage to `SafeStorageAdapter` after `app.ready`.

`CredentialStoreOptions.events` is required. `files` and `atomicWriter` are optional independently and are resolved to private disk adapters only when omitted. The same injected safeStorage adapter is always used; the factory never creates or imports Electron safeStorage.

## Core Schema and Auxiliary Schema

The core schema is exact and strict:

    const aiModelRoleSchema = z.object({
      modelId: z.string().trim().min(1),
      note: z.string().optional(),
    }).strict();

    const mirrorConfigCoreEnvelope = z.object({
      configVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
      persona: z.object({
        name: z.string().trim().min(1),
        instructions: z.string().min(1),
      }).strict(),
      voice: z.string().trim().min(1),
      idleSeconds: z.number().int().min(1).max(86_400),
      aiModels: z.object({
        realtimeDialogue: aiModelRoleSchema,
        inputTranscription: aiModelRoleSchema,
        memoryExtractor: aiModelRoleSchema,
      }).strict(),
      wake: z.object({
        phrase: z.string().trim().min(1),
        modelVersion: z.string().trim().min(1),
      }).strict(),
      faceModel: z.object({
        detectorId: z.string().trim().min(1),
        recognizerId: z.string().trim().min(1),
      }).strict(),
      assets: z.object({
        offlineLoopVideo: z.string().trim().min(1),
        avatarDir: z.string().trim().min(1),
        musicDir: z.string().trim().min(1),
      }).strict(),
      spells: z.unknown(),
      scenes: z.unknown(),
      adapters: z.object({
        lighting: z.enum(['mock', 'physical']),
        fog: z.enum(['mock', 'physical']),
        music: z.enum(['mock', 'physical']),
      }).strict(),
    }).strict();

    export const mirrorConfigSchema = mirrorConfigCoreEnvelope;

The schema rejects missing or invalid core fields and extra top-level keys. It does not treat `spells` or `scenes` as final Phase 4 data. Their containers and entries are normalized after the core envelope parses:

    const spellEnvelopeSchema = z.object({
      id: z.string().trim().min(1),
      phrase: z.string().trim().min(1),
      sceneId: z.string().trim().min(1),
      enabled: z.boolean(),
    }).passthrough();

    const sceneEnvelopeSchema = z.object({
      id: z.string().trim().min(1),
      enabled: z.boolean(),
      cues: z.array(z.unknown()),
    }).passthrough();

    function disabledSpell(index: number): AuxiliaryEnvelope & {
      phrase: string;
      sceneId: string;
    } {
      return {
        id: 'disabled-spell-' + String(index),
        phrase: '',
        sceneId: '',
        enabled: false,
      };
    }

    function disabledScene(index: number): AuxiliaryEnvelope & {
      cues: unknown[];
    } {
      return {
        id: 'disabled-scene-' + String(index),
        enabled: false,
        cues: [],
      };
    }

    function normalizeAuxiliary(config: MirrorConfig, slot: ConfigSlot, events: ConfigEventSink): MirrorConfig {
      const spells = normalizeEntries(config.spells, spellEnvelopeSchema, disabledSpell, 'spells', slot, events);
      const scenes = normalizeEntries(config.scenes, sceneEnvelopeSchema, disabledScene, 'scenes', slot, events);
      return { ...config, spells, scenes };
    }

`normalizeEntries` returns an empty array when the container is not an array and emits one container event. It maps every invalid item to the exact disabled envelope above and emits one indexed item event. It preserves valid item objects, including future Phase 4 fields accepted by `passthrough()`. No scene or spell text is included in an event.

## Config Read, Write, Publish, Rollback, and Diff Behavior

### Slot paths and first boot

The only slot paths are `join(configDir, 'active.json')`, `join(configDir, 'draft.json')`, and `join(configDir, 'previous.json')`. `defaultConfigPath` is read only as the first-boot or final recovery source.

`initialize()` performs these exact steps:

1. Read the three slot paths independently.
2. If all three are missing, read and parse `defaultConfigPath`, normalize its auxiliary entries, ensure `configDir`, and write the same normalized serialized config to Active, Draft, and Previous through the compensating transaction writer. Emit `config_seeded`.
3. If any slot exists, call the defensive read algorithm below without overwriting valid bytes.
4. Return `ConfigSlots`.

The seeded `configVersion` remains the integer in `default.json`; no source code supplies a version or model ID.

### Defensive read algorithm

`read()` reads Active, Previous, and Draft independently and returns a usable `ConfigSlots`:

| Slot condition | Value returned | Event |
|---|---|---|
| Valid core and valid/normalized auxiliary data | Parsed value | `config_loaded` once after all slots resolve |
| Draft missing, malformed, or unreadable while Active is valid | Active value in the Draft position | `config_recovered`, `status=degraded`, `error_code=config_slot_missing`, `config_slot_invalid`, or `config_slot_unreadable`; reason `slot=draft;source=active;action=use_active;cause=missing`, `invalid`, or `unreadable` |
| Previous missing, malformed, or unreadable while Active is valid | Active value in the Previous position | `config_recovered`, `status=degraded`, with `slot=previous;source=active;action=use_active;cause=missing|invalid|unreadable` |
| Active missing, malformed, or unreadable while Previous is valid | Previous value in the Active position | `config_recovered`, `status=degraded`, with `slot=active;source=previous;action=use_previous;cause=missing|invalid|unreadable` |
| Active unavailable and Previous unavailable while default is valid | Default value in the Active position | `config_recovered`, `status=degraded`, with `slot=active;source=default;action=use_default;cause=missing|invalid|unreadable` |
| No valid Active, Previous, or default core | No value | `config_operation_failed`, `status=failed`, `error_code=config_default_invalid` or `config_read_failed`, then throw `ConfigServiceError` |

Defensive reads do not silently substitute a model ID. They select a whole validated configuration source and record the source and cause. They do not auto-delete malformed files. Later Task 8 may route an unrecoverable error to Maintenance.

### Draft

`saveDraft(candidate)` parses the unknown input with the core schema, normalizes scene/spell entries, replaces `configVersion` with the current Active `configVersion`, ensures the config directory, and atomically writes only `draft.json`. It emits `config_draft_saved` with reason `operation=save_draft;slot=draft;config_version=N`. A core schema failure emits `config_operation_failed` with `error_code=config_schema_invalid`, reason `operation=save_draft;slot=draft;action=reject;cause=schema_invalid;issue_count=N`, then throws `ConfigServiceError` with field paths. A write failure emits `config_operation_failed` with `error_code=config_write_failed`, reason `operation=save_draft;slot=draft;action=reject;cause=io_failure`, then throws a safe error.

### Publish

`publish()` reads the resolved slots and the original raw slot bytes, validates the resolved Draft, and builds:

| Slot | New value |
|---|---|
| Previous | old Active, unchanged `configVersion` |
| Active | old Draft content with `configVersion = old Active.configVersion + 1` |
| Draft | the new Active value with the same bumped version |

It writes in the fixed order Previous, Active, Draft. On any injected I/O failure, it emits `config_operation_failed` with `error_code=config_write_failed`, reason `operation=publish;slot=all;action=failed;cause=io_failure`, restores the exact old bytes or absence for all three files, emits `config_transaction_compensated` with `status=info` and reason `operation=publish;action=restore;cause=io_failure`, and throws `ConfigServiceError('config_write_failed')`. Restoration is a separate operation, not part of the one-shot failure. If restoration fails, it emits a second `config_operation_failed` with `error_code=config_compensation_failed`, reason `operation=publish;slot=all;action=restore;cause=compensation_failure`, then throws `ConfigServiceError('config_compensation_failed')` without exposing the adapter exception.

On success it emits `config_published` with reason `operation=publish;active_version=N;previous_version=M` and returns the new Active. The existing Active remains the exact Previous configuration; there is no partial publish and no model fallback.

### Rollback

`rollback()` never calls the ordinary defensive `read()` resolver for Previous. It reads `join(configDir, 'previous.json')` directly, classifies that physical read as `missing`, `invalid`, `unreadable`, or `valid`, and rejects the first three states without writing. In particular, the in-memory Active value that ordinary `read()` may return in the Previous position is never a rollback source. It also captures the physical raw bytes for Active, Draft, and Previous before writing; an unreadable Draft or Active is rejected because exact compensation cannot be guaranteed.

For a missing, invalid, or unreadable physical Previous, emit `config_operation_failed` with `error_code=config_previous_unavailable` and exactly one of these reasons: `operation=rollback;slot=previous;action=reject;cause=missing`, `operation=rollback;slot=previous;action=reject;cause=invalid`, or `operation=rollback;slot=previous;action=reject;cause=unreadable`. Throw `ConfigServiceError('config_previous_unavailable')`. Do not substitute Active or the versioned default.

On success it builds:

| Slot | New value |
|---|---|
| Previous | old Active |
| Active | old Previous content with `configVersion = old Active.configVersion + 1` |
| Draft | the new Active value with the same bumped version |

It uses the same fixed write order and compensation algorithm as Publish. `Previous` is the validated physical Previous content, `Active` is that content with `configVersion = physicalActive.configVersion + 1`, and `Draft` is the new Active. Failure reasons use `operation=rollback`; success emits `config_rolled_back` with reason `operation=rollback;active_version=N;previous_version=M`. The one-shot transaction-failure test must allow all compensation writes/removes to run and assert byte-for-byte restoration; a separate one-shot compensation-failure test must fail during restoration and assert `config_compensation_failed`.

### Diff

`diff(from, to)` reads the resolved slots, flattens every leaf in deterministic lexicographic path order, compares exact JSON values, and returns the shared `ConfigDiff` shape:

    {
      changed: [
        { path: 'aiModels.realtimeDialogue.modelId', from: oldValue, to: newValue },
        { path: 'voice', from: oldVoice, to: newVoice }
      ],
      nonModelChanges: true
    }

Array paths use `spells[0]` and `scenes[0].cues[0]`. Empty arrays and empty objects are leaves. `nonModelChanges` is true when any changed path is not one of the three exact model paths in `MODEL_PATHS`; it is false for a model-only diff or no diff. The returned diff may contain config values for the caller's local Console use, but `config_diff_computed` contains only `from`, `to`, `changed_count`, and `non_model_changes` metadata in its reason: `operation=diff;from=draft;to=active;changed_count=N;non_model_changes=true|false`.

## Exact Config Event Contract

Both services use `module: 'config'` because `ModuleId` has no credential member. The event name distinguishes configuration from credential operations. Every event has `source: 'runtime'`; no event has `time` because Task 4 adds it.

| Event | Status | Error code | Exact reason grammar |
|---|---|---|---|
| `config_seeded` | `success` | absent | `operation=initialize;action=seed;config_version=N` |
| `config_loaded` | `success` | absent | `operation=read;active_version=N;draft_version=N;previous_version=N` |
| `config_recovered` | `degraded` | `ConfigRecoveryTelemetryCode` (`config_slot_missing`, `config_slot_invalid`, or `config_slot_unreadable`) | `slot=active|draft|previous;source=active|previous|default;action=use_active|use_previous|use_default;cause=missing|invalid|unreadable` |
| `config_auxiliary_degraded` | `degraded` | `ConfigAuxiliaryTelemetryCode` (`config_spell_container_invalid`, `config_scene_container_invalid`, `config_spell_entry_invalid`, or `config_scene_entry_invalid`) | `slot=active|draft|previous;field=spells|scenes;index=container|N;action=empty|disabled;cause=not_array|schema_invalid` |
| `config_draft_saved` | `success` | absent | `operation=save_draft;slot=draft;config_version=N` |
| `config_published` | `success` | absent | `operation=publish;active_version=N;previous_version=M` |
| `config_rolled_back` | `success` | absent | `operation=rollback;active_version=N;previous_version=M` |
| `config_diff_computed` | `info` | absent | `operation=diff;from=active|draft|previous;to=active|draft|previous;changed_count=N;non_model_changes=true|false` |
| `config_operation_failed` | `failed` | one of the seven thrown `ConfigErrorCode` values | `operation=initialize|read|save_draft|publish|rollback;slot=active|draft|previous|all;action=seed|read|reject|failed|restore;cause=schema_invalid|io_failure|previous_unavailable|revision_exhausted|compensation_failure;issue_count=N` when schema validation is the cause |
| `config_transaction_compensated` | `info` | absent | `operation=seed|publish|rollback;action=restore;cause=io_failure` |

No success event includes a model ID, path, config object, scene name, spell phrase, file contents, or credential result value. Version numbers and counts are metadata.

## Exact Credential Behavior and Event Contract

### Storage and adapter boundary

The only persistent artifact is the encrypted Buffer at the caller-supplied `credentialPath`. The source never writes a JSON envelope, plaintext, backup copy, config value, telemetry value, diagnostic export, or temporary plaintext file. The caller must place the path in a data directory outside config and backups; unit tests use a path with a data segment and assert no other path is written.

`set(plaintext)` rejects an empty string with `credential_input_invalid`, checks `isEncryptionAvailable()`, calls `encryptString`, ensures the parent directory, and atomically replaces the encrypted blob. It emits `credential_set` only after success.

`get()` checks `isEncryptionAvailable()`, reads the encrypted Buffer, returns `null` and emits `credential_missing` when the file is absent, decrypts the bytes, and if `shouldReEncrypt()` is true encrypts the plaintext again and atomically replaces the same path before returning the plaintext. It emits `credential_get` after a normal read and `credential_reencrypted` after a successful replacement. Plaintext is never passed to an event sink.

`clear()` removes the encrypted blob. An absent file is a successful idempotent clear. It does not need encryption availability because it never decrypts or writes a secret. It emits `credential_cleared` with `result=removed` or `result=already_absent`.

All safeStorage, file, and atomic adapter exceptions are caught and replaced with `CredentialStoreError` carrying only a stable code. The original exception is not assigned to `cause`, interpolated into `message`, emitted, or serialized.

### Credential event table

| Event | Status | Error code | Exact reason grammar |
|---|---|---|---|
| `credential_set` | `success` | absent | `operation=set;storage=encrypted_blob` |
| `credential_get` | `success` | absent | `operation=get;result=present;storage=encrypted_blob` |
| `credential_missing` | `info` | absent | `operation=get;result=missing;cause=not_found` |
| `credential_cleared` | `success` | absent | `operation=clear;result=removed|already_absent` |
| `credential_reencrypted` | `success` | absent | `operation=get;cause=should_reencrypt` |
| `credential_operation_failed` | `failed` | `CredentialTelemetryErrorCode` (`CredentialErrorCode`) | `operation=set|get|clear;cause=empty_input|encryption_unavailable|encrypt_failed|decrypt_failed|io_failure|reencrypt_failed|clear_failed` |

The `credentialPath` itself is never placed in an event. The safe error message is the constant `Credential store operation failed`; the config error message is the constant `Config operation failed`.

## A. Versioned mock resource

Create resources/config/default.json with exactly this UTF-8 content, including the
final newline:

~~~json
{
  "configVersion": 1,
  "persona": {
    "name": "mock-persona-v1",
    "instructions": "mock-persona-instructions-v1"
  },
  "voice": "mock-voice-v1",
  "idleSeconds": 300,
  "aiModels": {
    "realtimeDialogue": {
      "modelId": "mock-realtime-dialogue-v1"
    },
    "inputTranscription": {
      "modelId": "mock-input-transcription-v1"
    },
    "memoryExtractor": {
      "modelId": "mock-memory-extractor-v1"
    }
  },
  "wake": {
    "phrase": "mock-wake-phrase-v1",
    "modelVersion": "mock-wake-model-v1"
  },
  "faceModel": {
    "detectorId": "mock-face-detector-v1",
    "recognizerId": "mock-face-recognizer-v1"
  },
  "assets": {
    "offlineLoopVideo": "mock/offline-loop-v1.mp4",
    "avatarDir": "mock/avatar-v1",
    "musicDir": "mock/music-v1"
  },
  "spells": [],
  "scenes": [],
  "adapters": {
    "lighting": "mock",
    "fog": "mock",
    "music": "mock"
  }
}
~~~

The three aiModels values are the only model-role values in this resource and
are visibly fake. Do not add a note, candidate list, fallback list, provider
credential, secret, transcript, audio sample, private context, image, image
embedding, or prompt text. The required persona.instructions field is only the
literal fixture label above. Do not copy the worker harness model into this
resource or into either production TypeScript file.

## B. Exact TDD order and test files

The test-only worker creates the two test files before either production source
file or the resource exists. The listings below are the complete test
contracts. Preserve the synthetic values exactly; none is a real credential or
visitor content.

### Step 1: Create tests/unit/config-service.test.ts

Write the following complete file:

~~~ts
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ConfigServiceError,
  createConfigService,
  mirrorConfigSchema,
  type ConfigAtomicWriter,
  type ConfigEventSink,
  type ConfigFileOperations,
  type ConfigService,
  type ConfigSlot,
} from '../../src/main/config-service'
import type { ConfigDiff, MirrorConfig, MirrorEvent } from '../../src/shared/types'

type ConfigEvent = Omit<MirrorEvent, 'time'>
type SlotFailure = 'missing' | 'invalid' | 'unreadable'

const MODEL_PATHS = [
  'aiModels.realtimeDialogue.modelId',
  'aiModels.inputTranscription.modelId',
  'aiModels.memoryExtractor.modelId',
] as const

const CONFIG_EVENT_NAMES = new Set([
  'config_seeded',
  'config_loaded',
  'config_recovered',
  'config_auxiliary_degraded',
  'config_draft_saved',
  'config_published',
  'config_rolled_back',
  'config_diff_computed',
  'config_operation_failed',
  'config_transaction_compensated',
])

const CONFIG_EVENT_STATUS: Record<string, ConfigEvent['status']> = {
  config_seeded: 'success',
  config_loaded: 'success',
  config_recovered: 'degraded',
  config_auxiliary_degraded: 'degraded',
  config_draft_saved: 'success',
  config_published: 'success',
  config_rolled_back: 'success',
  config_diff_computed: 'info',
  config_operation_failed: 'failed',
  config_transaction_compensated: 'info',
}

const CONFIG_ERROR_EVENTS = new Set([
  'config_recovered',
  'config_auxiliary_degraded',
  'config_operation_failed',
])

const CONFIG_ERROR_CODES = new Set([
  'config_schema_invalid',
  'config_read_failed',
  'config_write_failed',
  'config_default_invalid',
  'config_previous_unavailable',
  'config_revision_exhausted',
  'config_compensation_failed',
  'config_slot_missing',
  'config_slot_invalid',
  'config_slot_unreadable',
  'config_spell_container_invalid',
  'config_scene_container_invalid',
  'config_spell_entry_invalid',
  'config_scene_entry_invalid',
])

const observedEvents: ConfigEvent[] = []
const temporaryDirectories: string[] = []

function baseConfig(configVersion = 7): MirrorConfig {
  return {
    configVersion,
    persona: {
      name: 'mock-persona-v1',
      instructions: 'mock-persona-instructions-v1',
    },
    voice: 'mock-voice-v1',
    idleSeconds: 300,
    aiModels: {
      realtimeDialogue: { modelId: 'mock-realtime-dialogue-v1' },
      inputTranscription: { modelId: 'mock-input-transcription-v1' },
      memoryExtractor: { modelId: 'mock-memory-extractor-v1' },
    },
    wake: {
      phrase: 'mock-wake-phrase-v1',
      modelVersion: 'mock-wake-model-v1',
    },
    faceModel: {
      detectorId: 'mock-face-detector-v1',
      recognizerId: 'mock-face-recognizer-v1',
    },
    assets: {
      offlineLoopVideo: 'mock/offline-loop-v1.mp4',
      avatarDir: 'mock/avatar-v1',
      musicDir: 'mock/music-v1',
    },
    spells: [
      {
        id: 'mock-spell-1',
        phrase: 'mock-spell-phrase-1',
        sceneId: 'mock-scene-1',
        enabled: true,
      },
    ],
    scenes: [
      {
        id: 'mock-scene-1',
        enabled: true,
        cues: ['mock-cue-v1'],
      },
    ],
    adapters: {
      lighting: 'mock',
      fog: 'physical',
      music: 'mock',
    },
  }
}

function encode(config: MirrorConfig): string {
  return JSON.stringify(config, null, 2) + '\n'
}

function slotPath(configDir: string, slot: ConfigSlot): string {
  return join(configDir, slot + '.json')
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function makeSink(events: ConfigEvent[]): ConfigEventSink {
  return {
    emit(event) {
      events.push(event)
      observedEvents.push(event)
    },
  }
}

type MemoryHarness = {
  store: Map<string, string>
  unreadable: Set<string>
  events: ConfigEvent[]
  files: ConfigFileOperations
  writer: ConfigAtomicWriter & {
    writeCount: number
    writePaths: string[]
    failWrites: Set<number>
  }
  removePaths: string[]
  service: (configDir?: string, defaultConfigPath?: string) => ConfigService
}

function makeMemoryHarness(): MemoryHarness {
  const store = new Map<string, string>()
  const unreadable = new Set<string>()
  const events: ConfigEvent[] = []
  const removePaths: string[] = []

  const files: ConfigFileOperations = {
    async ensureDirectory() {},
    async readText(filePath) {
      if (unreadable.has(filePath)) throw new Error('synthetic-read-adapter-detail')
      return store.get(filePath) ?? null
    },
    async remove(filePath) {
      removePaths.push(filePath)
      store.delete(filePath)
    },
  }

  const writer: MemoryHarness['writer'] = {
    writeCount: 0,
    writePaths: [],
    failWrites: new Set<number>(),
    async write(filePath, contents) {
      this.writeCount += 1
      this.writePaths.push(filePath)
      if (this.failWrites.has(this.writeCount)) {
        throw new Error('synthetic-write-adapter-detail')
      }
      store.set(filePath, contents)
    },
  }

  return {
    store,
    unreadable,
    events,
    files,
    writer,
    removePaths,
    service(configDir = 'mock-config', defaultConfigPath = 'mock-default') {
      return createConfigService({
        configDir,
        defaultConfigPath,
        files,
        atomicWriter: writer,
        events: makeSink(events),
      })
    },
  }
}

function seedSlots(
  harness: MemoryHarness,
  configDir: string,
  active: MirrorConfig,
  draft: MirrorConfig = active,
  previous: MirrorConfig | null = active,
): void {
  const values: Record<ConfigSlot, MirrorConfig | null> = { active, draft, previous }
  for (const slot of ['active', 'draft', 'previous'] as const) {
    const path = slotPath(configDir, slot)
    const value = values[slot]
    if (value === null) harness.store.delete(path)
    else harness.store.set(path, encode(value))
  }
}

function applyFailure(harness: MemoryHarness, path: string, failure: SlotFailure): void {
  harness.unreadable.delete(path)
  if (failure === 'missing') {
    harness.store.delete(path)
  } else if (failure === 'invalid') {
    harness.store.set(path, '{"configVersion":0}')
  } else {
    harness.store.set(path, encode(baseConfig()))
    harness.unreadable.add(path)
  }
}

function expectEvent(
  events: ConfigEvent[],
  event: string,
  status: ConfigEvent['status'],
  reason: string,
  errorCode?: string,
): void {
  const expected: ConfigEvent = {
    module: 'config',
    event,
    status,
    source: 'runtime',
    reason,
  }
  if (errorCode !== undefined) expected.error_code = errorCode
  expect(events).toContainEqual(expected)
}

function assertConfigEvents(events: readonly ConfigEvent[]): void {
  for (const event of events) {
    expect(CONFIG_EVENT_NAMES.has(event.event)).toBe(true)
    expect(event.module).toBe('config')
    expect(event.source).toBe('runtime')
    expect(event.status).toBe(CONFIG_EVENT_STATUS[event.event])
    expect(Object.keys(event).every((key) =>
      ['module', 'event', 'status', 'source', 'reason', 'error_code'].includes(key),
    )).toBe(true)
    expect(Object.keys(event)).not.toContain('time')
    expect(event.reason).toMatch(/^[A-Za-z0-9_=;.-]+$/)
    if (CONFIG_ERROR_EVENTS.has(event.event)) {
      expect(typeof event.error_code).toBe('string')
      expect(CONFIG_ERROR_CODES.has(event.error_code as string)).toBe(true)
    } else {
      expect(event.error_code).toBeUndefined()
    }
    const serialized = JSON.stringify(event)
    for (const modelPath of MODEL_PATHS) {
      void modelPath
    }
    expect(serialized).not.toContain('mock-realtime-dialogue-v1')
    expect(serialized).not.toContain('mock-input-transcription-v1')
    expect(serialized).not.toContain('mock-memory-extractor-v1')
    expect(serialized).not.toContain('synthetic-read-adapter-detail')
    expect(serialized).not.toContain('synthetic-write-adapter-detail')
  }
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-task3-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  assertConfigEvents(observedEvents)
  observedEvents.length = 0
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('ConfigService contract', () => {
  it('validates the strict core without deciding auxiliary Phase 4 shape', () => {
    expect(mirrorConfigSchema.safeParse(baseConfig()).success).toBe(true)
    expect(
      mirrorConfigSchema.safeParse({
        ...baseConfig(),
        unexpected: 'mock-extra-v1',
      }).success,
    ).toBe(false)
    expect(
      mirrorConfigSchema.safeParse({
        ...baseConfig(),
        aiModels: {
          ...baseConfig().aiModels,
          realtimeDialogue: { modelId: ' ' },
        },
      }).success,
    ).toBe(false)
  })

  it('keeps the versioned resource mock-only and free of forbidden content fields', async () => {
    const resourcePath = resolve(process.cwd(), 'resources/config/default.json')
    const resource = JSON.parse(await readFile(resourcePath, 'utf8')) as Record<string, unknown>
    expect(resource).toEqual({
      configVersion: 1,
      persona: {
        name: 'mock-persona-v1',
        instructions: 'mock-persona-instructions-v1',
      },
      voice: 'mock-voice-v1',
      idleSeconds: 300,
      aiModels: {
        realtimeDialogue: { modelId: 'mock-realtime-dialogue-v1' },
        inputTranscription: { modelId: 'mock-input-transcription-v1' },
        memoryExtractor: { modelId: 'mock-memory-extractor-v1' },
      },
      wake: {
        phrase: 'mock-wake-phrase-v1',
        modelVersion: 'mock-wake-model-v1',
      },
      faceModel: {
        detectorId: 'mock-face-detector-v1',
        recognizerId: 'mock-face-recognizer-v1',
      },
      assets: {
        offlineLoopVideo: 'mock/offline-loop-v1.mp4',
        avatarDir: 'mock/avatar-v1',
        musicDir: 'mock/music-v1',
      },
      spells: [],
      scenes: [],
      adapters: {
        lighting: 'mock',
        fog: 'mock',
        music: 'mock',
      },
    })
    const forbiddenKeys = new Set([
      'credential',
      'credentials',
      'transcript',
      'audio',
      'privateContext',
      'image',
      'embedding',
      'prompt',
    ])
    const walkKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walkKeys(item)
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          expect(forbiddenKeys.has(key)).toBe(false)
          walkKeys(child)
        }
      }
    }
    walkKeys(resource)
    const roleValues = Object.values(resource.aiModels as Record<string, { modelId: string }>)
    expect(roleValues.every((role) => role.modelId.startsWith('mock-'))).toBe(true)
    const production = await Promise.all([
      readFile(resolve(process.cwd(), 'src/main/config-service.ts'), 'utf8'),
      readFile(resolve(process.cwd(), 'src/main/credential-store.ts'), 'utf8'),
    ])
    const productionText = production.join('\n')
    expect(productionText).not.toMatch(/modelId\s*:\s*['"]/)
    expect(productionText).not.toMatch(/(?:mock|candidate|fallback)[A-Za-z-]*(?:model|id)/i)
  })

  it('seeds all three slots from the caller-supplied default and preserves its version', async () => {
    const harness = makeMemoryHarness()
    const config = baseConfig(7)
    harness.store.set('mock-default', encode(config))

    const result = await harness.service().initialize()

    expect(result).toEqual({ active: config, draft: config, previous: config })
    expect(harness.store.get(slotPath('mock-config', 'active'))).toBe(encode(config))
    expect(harness.store.get(slotPath('mock-config', 'draft'))).toBe(encode(config))
    expect(harness.store.get(slotPath('mock-config', 'previous'))).toBe(encode(config))
    expect(harness.events).toEqual([
      {
        module: 'config',
        event: 'config_seeded',
        status: 'success',
        source: 'runtime',
        reason: 'operation=initialize;action=seed;config_version=7',
      },
    ])
  })

  it('resolves files-only and atomic-only mixed optional adapter seams', async () => {
    const firstRoot = await makeTemporaryDirectory()
    const firstConfigDir = join(firstRoot, 'config')
    const firstDefaultPath = join(firstRoot, 'default.json')
    await mkdir(firstConfigDir, { recursive: true })
    await writeFile(firstDefaultPath, encode(baseConfig(4)), 'utf8')
    const fileReads: string[] = []
    const injectedFiles: ConfigFileOperations = {
      async ensureDirectory(path) {
        await mkdir(path, { recursive: true })
      },
      async readText(path) {
        fileReads.push(path)
        try {
          return await readFile(path, 'utf8')
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      async remove(path) {
        try {
          await unlink(path)
        } catch (error) {
          if (!isNotFound(error)) throw error
        }
      },
    }
    const firstEvents: ConfigEvent[] = []
    await createConfigService({
      configDir: firstConfigDir,
      defaultConfigPath: firstDefaultPath,
      files: injectedFiles,
      events: makeSink(firstEvents),
    }).initialize()
    expect(fileReads).toContain(firstDefaultPath)
    expect(await readFile(slotPath(firstConfigDir, 'active'), 'utf8')).toBe(
      encode(baseConfig(4)),
    )

    const secondRoot = await makeTemporaryDirectory()
    const secondConfigDir = join(secondRoot, 'config')
    const secondDefaultPath = join(secondRoot, 'default.json')
    await mkdir(secondConfigDir, { recursive: true })
    await writeFile(secondDefaultPath, encode(baseConfig(5)), 'utf8')
    const atomicPaths: string[] = []
    const injectedAtomicWriter: ConfigAtomicWriter = {
      async write(path, contents) {
        atomicPaths.push(path)
        await writeFile(path, contents, 'utf8')
      },
    }
    const secondEvents: ConfigEvent[] = []
    await createConfigService({
      configDir: secondConfigDir,
      defaultConfigPath: secondDefaultPath,
      atomicWriter: injectedAtomicWriter,
      events: makeSink(secondEvents),
    }).initialize()
    expect(atomicPaths).toEqual([
      slotPath(secondConfigDir, 'previous'),
      slotPath(secondConfigDir, 'active'),
      slotPath(secondConfigDir, 'draft'),
    ])
    expect(await readFile(slotPath(secondConfigDir, 'draft'), 'utf8')).toBe(
      encode(baseConfig(5)),
    )
  })

  const directFallbackCases: Array<{
    slot: 'draft' | 'previous'
    failure: SlotFailure
    errorCode: string
    cause: string
  }> = [
    { slot: 'draft', failure: 'missing', errorCode: 'config_slot_missing', cause: 'missing' },
    { slot: 'draft', failure: 'invalid', errorCode: 'config_slot_invalid', cause: 'invalid' },
    { slot: 'draft', failure: 'unreadable', errorCode: 'config_slot_unreadable', cause: 'unreadable' },
    { slot: 'previous', failure: 'missing', errorCode: 'config_slot_missing', cause: 'missing' },
    { slot: 'previous', failure: 'invalid', errorCode: 'config_slot_invalid', cause: 'invalid' },
    { slot: 'previous', failure: 'unreadable', errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ]

  it.each(directFallbackCases)(
    'falls back from $slot when the physical slot is $failure',
    async ({ slot, failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      const active = baseConfig(7)
      const draft = baseConfig(7)
      const previous = baseConfig(7)
      seedSlots(harness, 'mock-config', active, draft, previous)
      applyFailure(harness, slotPath('mock-config', slot), failure)

      const result = await harness.service().read()

      expect(result.active).toEqual(active)
      expect(result[slot]).toEqual(active)
      expectEvent(
        harness.events,
        'config_recovered',
        'degraded',
        'slot=' + slot + ';source=active;action=use_active;cause=' + cause,
        errorCode,
      )
    },
  )

  it.each([
    { failure: 'missing' as const, errorCode: 'config_slot_missing', cause: 'missing' },
    { failure: 'invalid' as const, errorCode: 'config_slot_invalid', cause: 'invalid' },
    { failure: 'unreadable' as const, errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ])(
    'falls back from physical Active to physical Previous when Active is $failure',
    async ({ failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      const previous = baseConfig(6)
      seedSlots(harness, 'mock-config', baseConfig(7), baseConfig(7), previous)
      applyFailure(harness, slotPath('mock-config', 'active'), failure)

      const result = await harness.service().read()

      expect(result.active).toEqual(previous)
      expect(result.previous).toEqual(previous)
      expectEvent(
        harness.events,
        'config_recovered',
        'degraded',
        'slot=active;source=previous;action=use_previous;cause=' + cause,
        errorCode,
      )
    },
  )

  it.each([
    { failure: 'missing' as const, errorCode: 'config_slot_missing', cause: 'missing' },
    { failure: 'invalid' as const, errorCode: 'config_slot_invalid', cause: 'invalid' },
    { failure: 'unreadable' as const, errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ])(
    'falls back from unavailable Active and Previous to the versioned default for Active $failure',
    async ({ failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      const defaultConfig = baseConfig(3)
      seedSlots(harness, 'mock-config', baseConfig(7), baseConfig(7), baseConfig(7))
      applyFailure(harness, slotPath('mock-config', 'active'), failure)
      applyFailure(harness, slotPath('mock-config', 'previous'), 'missing')
      harness.store.set('mock-default', encode(defaultConfig))

      const result = await harness.service().read()

      expect(result.active).toEqual(defaultConfig)
      expect(result.previous).toEqual(defaultConfig)
      expectEvent(
        harness.events,
        'config_recovered',
        'degraded',
        'slot=active;source=default;action=use_default;cause=' + cause,
        errorCode,
      )
    },
  )

  it('fails visibly when Active, Previous, and the default have no valid core', async () => {
    const harness = makeMemoryHarness()
    const invalid = JSON.stringify({ ...baseConfig(1), configVersion: 0 })
    harness.store.set(slotPath('mock-config', 'active'), invalid)
    harness.store.set(slotPath('mock-config', 'previous'), invalid)
    harness.store.set(slotPath('mock-config', 'draft'), encode(baseConfig(7)))
    harness.store.set('mock-default', invalid)

    let caught: unknown
    try {
      await harness.service().read()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConfigServiceError)
    expect((caught as ConfigServiceError).code).toBe('config_default_invalid')
    expect((caught as ConfigServiceError).fields).toEqual([
      { path: 'configVersion', message: 'too_small' },
    ])
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=read;slot=active;action=read;cause=schema_invalid;issue_count=1',
      'config_default_invalid',
    )
  })

  it('degrades malformed auxiliary containers without blocking the valid core', async () => {
    const harness = makeMemoryHarness()
    const malformed = baseConfig(7)
    malformed.spells = null as unknown as unknown[]
    malformed.scenes = [
      { id: 'mock-scene-valid', enabled: true, cues: [] },
      { id: 7, enabled: true, cues: [] },
    ]
    seedSlots(harness, 'mock-config', malformed, malformed, malformed)

    const result = await harness.service().read()

    expect(result.active.voice).toBe('mock-voice-v1')
    expect(result.active.spells).toEqual([])
    expect(result.active.scenes).toEqual([
      { id: 'mock-scene-valid', enabled: true, cues: [] },
      { id: 'disabled-scene-1', enabled: false, cues: [] },
    ])
    expectEvent(
      harness.events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=active;field=spells;index=container;action=empty;cause=not_array',
      'config_spell_container_invalid',
    )
    expectEvent(
      harness.events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=active;field=scenes;index=1;action=disabled;cause=schema_invalid',
      'config_scene_entry_invalid',
    )
  })

  it('maps malformed spell entries to disabled envelopes and preserves valid future fields', async () => {
    const harness = makeMemoryHarness()
    const malformed = baseConfig(7)
    malformed.spells = [
      {
        id: 'mock-spell-valid',
        phrase: 'mock-spell-phrase-valid',
        sceneId: 'mock-scene-1',
        enabled: true,
        futureField: 'mock-future-v1',
      },
      { id: 3, phrase: '', sceneId: '', enabled: 'yes' },
    ]
    seedSlots(harness, 'mock-config', malformed, malformed, malformed)

    const result = await harness.service().read()

    expect(result.active.spells).toEqual([
      {
        id: 'mock-spell-valid',
        phrase: 'mock-spell-phrase-valid',
        sceneId: 'mock-scene-1',
        enabled: true,
        futureField: 'mock-future-v1',
      },
      {
        id: 'disabled-spell-1',
        phrase: '',
        sceneId: '',
        enabled: false,
      },
    ])
    expectEvent(
      harness.events,
      'config_auxiliary_degraded',
      'degraded',
      'slot=active;field=spells;index=1;action=disabled;cause=schema_invalid',
      'config_spell_entry_invalid',
    )
  })

  it('saves a Draft at the current Active revision and writes only draft.json', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    seedSlots(harness, 'mock-config', active)
    const beforeActive = harness.store.get(slotPath('mock-config', 'active'))
    const beforePrevious = harness.store.get(slotPath('mock-config', 'previous'))
    const candidate = baseConfig(999)
    candidate.voice = 'mock-voice-v2'
    candidate.aiModels.realtimeDialogue.modelId = 'mock-realtime-dialogue-v2'

    const saved = await harness.service().saveDraft(candidate)

    expect(saved.configVersion).toBe(7)
    expect(saved.voice).toBe('mock-voice-v2')
    expect(harness.store.get(slotPath('mock-config', 'active'))).toBe(beforeActive)
    expect(harness.store.get(slotPath('mock-config', 'previous'))).toBe(beforePrevious)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'draft')) as string)).toMatchObject({
      configVersion: 7,
      voice: 'mock-voice-v2',
    })
    expect(harness.writer.writePaths).toEqual([slotPath('mock-config', 'draft')])
    expectEvent(
      harness.events,
      'config_draft_saved',
      'success',
      'operation=save_draft;slot=draft;config_version=7',
    )
  })

  it('rejects malformed core Draft input with safe fields and an issue count', async () => {
    const harness = makeMemoryHarness()
    seedSlots(harness, 'mock-config', baseConfig(7))
    const candidate = { ...baseConfig(7), voice: '' }

    let caught: unknown
    try {
      await harness.service().saveDraft(candidate)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConfigServiceError)
    expect((caught as ConfigServiceError).code).toBe('config_schema_invalid')
    expect((caught as ConfigServiceError).fields).toEqual([
      { path: 'voice', message: 'too_small' },
    ])
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=save_draft;slot=draft;action=reject;cause=schema_invalid;issue_count=1',
      'config_schema_invalid',
    )
  })

  it('reports a Draft write failure without exposing the adapter error', async () => {
    const harness = makeMemoryHarness()
    seedSlots(harness, 'mock-config', baseConfig(7))
    harness.writer.failWrites.add(1)

    let caught: unknown
    try {
      await harness.service().saveDraft(baseConfig(7))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConfigServiceError)
    expect((caught as ConfigServiceError).code).toBe('config_write_failed')
    expect((caught as Error).message).toBe('Config operation failed')
    expect(Object.prototype.hasOwnProperty.call(caught, 'cause')).toBe(false)
    expect(String(caught)).not.toContain('synthetic-write-adapter-detail')
    expect(JSON.stringify(harness.events)).not.toContain('synthetic-write-adapter-detail')
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=save_draft;slot=draft;action=reject;cause=io_failure',
      'config_write_failed',
    )
  })

  it('computes deterministic model and non-model diffs, including array paths', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    const draft = baseConfig(7)
    draft.aiModels.realtimeDialogue.modelId = 'mock-realtime-dialogue-v2'
    draft.voice = 'mock-voice-v2'
    draft.scenes = [{ id: 'mock-scene-1', enabled: true, cues: ['mock-cue-v2'] }]
    seedSlots(harness, 'mock-config', active, draft, active)

    const diff = await harness.service().diff('active', 'draft')

    const expected: ConfigDiff = {
      changed: [
        {
          path: 'aiModels.realtimeDialogue.modelId',
          from: 'mock-realtime-dialogue-v1',
          to: 'mock-realtime-dialogue-v2',
        },
        {
          path: 'scenes[0].cues[0]',
          from: 'mock-cue-v1',
          to: 'mock-cue-v2',
        },
        {
          path: 'voice',
          from: 'mock-voice-v1',
          to: 'mock-voice-v2',
        },
      ],
      nonModelChanges: true,
    }
    expect(diff).toEqual(expected)
    expectEvent(
      harness.events,
      'config_diff_computed',
      'info',
      'operation=diff;from=active;to=draft;changed_count=3;non_model_changes=true',
    )
  })

  it('marks model-only and empty diffs as non-model false', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    const modelDraft = baseConfig(7)
    modelDraft.aiModels.memoryExtractor.modelId = 'mock-memory-extractor-v2'
    seedSlots(harness, 'mock-config', active, modelDraft, active)

    expect(await harness.service().diff('active', 'draft')).toEqual({
      changed: [
        {
          path: 'aiModels.memoryExtractor.modelId',
          from: 'mock-memory-extractor-v1',
          to: 'mock-memory-extractor-v2',
        },
      ],
      nonModelChanges: false,
    })
    expect(await harness.service().diff('active', 'active')).toEqual({
      changed: [],
      nonModelChanges: false,
    })
    expectEvent(
      harness.events,
      'config_diff_computed',
      'info',
      'operation=diff;from=active;to=active;changed_count=0;non_model_changes=false',
    )
  })

  it('publishes a deterministic revision and keeps the old Active as Previous', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(7)
    const draft = baseConfig(7)
    draft.voice = 'mock-voice-v2'
    seedSlots(harness, 'mock-config', active, draft, active)

    const published = await harness.service().publish()

    expect(published.configVersion).toBe(8)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'previous')) as string)).toEqual(active)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'active')) as string)).toEqual({
      ...draft,
      configVersion: 8,
    })
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'draft')) as string)).toEqual({
      ...draft,
      configVersion: 8,
    })
    expect(harness.writer.writePaths.slice(-3)).toEqual([
      slotPath('mock-config', 'previous'),
      slotPath('mock-config', 'active'),
      slotPath('mock-config', 'draft'),
    ])
    expectEvent(
      harness.events,
      'config_published',
      'success',
      'operation=publish;active_version=8;previous_version=7',
    )
  })

  it('rejects a publish revision at Number.MAX_SAFE_INTEGER without writing', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(Number.MAX_SAFE_INTEGER)
    seedSlots(harness, 'mock-config', active)
    const before = new Map(harness.store)

    let caught: unknown
    try {
      await harness.service().publish()
    } catch (error) {
      caught = error
    }

    expect((caught as ConfigServiceError).code).toBe('config_revision_exhausted')
    expect(harness.writer.writePaths).toEqual([])
    expect(harness.store).toEqual(before)
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=publish;slot=all;action=reject;cause=revision_exhausted',
      'config_revision_exhausted',
    )
  })

  const transactionCases: Array<{ operation: 'publish' | 'rollback'; name: string }> = [
    { operation: 'publish', name: 'publish' },
    { operation: 'rollback', name: 'rollback' },
  ]

  it.each(transactionCases)(
    '$name restores exact bytes and absence after a one-shot transaction failure',
    async ({ operation }) => {
      const harness = makeMemoryHarness()
      const active = baseConfig(8)
      const draft = baseConfig(8)
      const previous = operation === 'rollback' ? baseConfig(7) : null
      seedSlots(harness, 'mock-config', active, draft, previous)
      const before = new Map(harness.store)
      harness.writer.failWrites.add(2)

      let caught: unknown
      try {
        if (operation === 'publish') await harness.service().publish()
        else await harness.service().rollback()
      } catch (error) {
        caught = error
      }

      expect((caught as ConfigServiceError).code).toBe('config_write_failed')
      for (const slot of ['active', 'draft', 'previous'] as const) {
        const path = slotPath('mock-config', slot)
        if (!before.has(path)) expect(harness.store.has(path)).toBe(false)
        else expect(harness.store.get(path)).toBe(before.get(path))
      }
      expect(harness.removePaths).toContain(slotPath('mock-config', 'previous'))
      expectEvent(
        harness.events,
        'config_operation_failed',
        'failed',
        'operation=' + operation + ';slot=all;action=failed;cause=io_failure',
        'config_write_failed',
      )
      expectEvent(
        harness.events,
        'config_transaction_compensated',
        'info',
        'operation=' + operation + ';action=restore;cause=io_failure',
      )
      expect(JSON.stringify(harness.events)).not.toContain('synthetic-write-adapter-detail')
    },
  )

  it('reports a distinct compensation failure when restoration itself fails', async () => {
    const harness = makeMemoryHarness()
    seedSlots(harness, 'mock-config', baseConfig(8), baseConfig(8), baseConfig(7))
    harness.writer.failWrites.add(2)
    harness.writer.failWrites.add(4)

    let caught: unknown
    try {
      await harness.service().publish()
    } catch (error) {
      caught = error
    }

    expect((caught as ConfigServiceError).code).toBe('config_compensation_failed')
    expect((caught as Error).message).toBe('Config operation failed')
    expect(Object.prototype.hasOwnProperty.call(caught, 'cause')).toBe(false)
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=publish;slot=all;action=failed;cause=io_failure',
      'config_write_failed',
    )
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=publish;slot=all;action=restore;cause=compensation_failure',
      'config_compensation_failed',
    )
    expect(harness.events.some((event) => event.event === 'config_transaction_compensated')).toBe(false)
  })

  const physicalPreviousCases: Array<{
    failure: SlotFailure
    errorCode: string
    cause: string
  }> = [
    { failure: 'missing', errorCode: 'config_slot_missing', cause: 'missing' },
    { failure: 'invalid', errorCode: 'config_slot_invalid', cause: 'invalid' },
    { failure: 'unreadable', errorCode: 'config_slot_unreadable', cause: 'unreadable' },
  ]

  it.each(physicalPreviousCases)(
    'rejects rollback when the physical Previous is $failure instead of using read fallback',
    async ({ failure, errorCode, cause }) => {
      const harness = makeMemoryHarness()
      seedSlots(harness, 'mock-config', baseConfig(8), baseConfig(8), baseConfig(7))
      applyFailure(harness, slotPath('mock-config', 'previous'), failure)

      let caught: unknown
      try {
        await harness.service().rollback()
      } catch (error) {
        caught = error
      }

      expect((caught as ConfigServiceError).code).toBe('config_previous_unavailable')
      expect(harness.writer.writePaths).toEqual([])
      expectEvent(
        harness.events,
        'config_operation_failed',
        'failed',
        'operation=rollback;slot=previous;action=reject;cause=' + cause,
        'config_previous_unavailable',
      )
      expect(errorCode).toMatch(/^config_slot_/)
    },
  )

  it('rolls back from physical Previous with the next deterministic revision', async () => {
    const harness = makeMemoryHarness()
    const active = baseConfig(8)
    const previous = baseConfig(7)
    previous.voice = 'mock-voice-previous-v1'
    seedSlots(harness, 'mock-config', active, active, previous)

    const rolledBack = await harness.service().rollback()

    expect(rolledBack).toEqual({ ...previous, configVersion: 9 })
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'previous')) as string)).toEqual(active)
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'active')) as string)).toEqual({
      ...previous,
      configVersion: 9,
    })
    expect(JSON.parse(harness.store.get(slotPath('mock-config', 'draft')) as string)).toEqual({
      ...previous,
      configVersion: 9,
    })
    expectEvent(
      harness.events,
      'config_rolled_back',
      'success',
      'operation=rollback;active_version=9;previous_version=8',
    )
  })

  it('rejects rollback revision exhaustion before any write', async () => {
    const harness = makeMemoryHarness()
    seedSlots(
      harness,
      'mock-config',
      baseConfig(Number.MAX_SAFE_INTEGER),
      baseConfig(Number.MAX_SAFE_INTEGER),
      baseConfig(7),
    )

    let caught: unknown
    try {
      await harness.service().rollback()
    } catch (error) {
      caught = error
    }

    expect((caught as ConfigServiceError).code).toBe('config_revision_exhausted')
    expect(harness.writer.writePaths).toEqual([])
    expectEvent(
      harness.events,
      'config_operation_failed',
      'failed',
      'operation=rollback;slot=all;action=reject;cause=revision_exhausted',
      'config_revision_exhausted',
    )
  })
})
~~~

The config test has four deliberate privacy assertions: the resource must
contain only the exact mock object, production TypeScript must not contain
model-role literals or candidate/fallback declarations, every event must use
the allow-listed metadata shape, and adapter exception detail must not appear
in errors or events. The test also proves that an absent slot is restored by
remove rather than by writing a synthetic empty file.

### Step 2: Create tests/unit/credential-store.test.ts

Write the following complete file:

~~~ts
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CredentialStoreError,
  createCredentialStore,
  type CredentialAtomicWriter,
  type CredentialEventSink,
  type CredentialFileOperations,
  type SafeStorageAdapter,
} from '../../src/main/credential-store'
import type { MirrorEvent } from '../../src/shared/types'

type CredentialEvent = Omit<MirrorEvent, 'time'>

const FAKE_SECRET = 'mock-secret-value-v1'
const RAW_ADAPTER_DETAIL = 'synthetic-credential-adapter-detail'
const CREDENTIAL_PATH = resolve('mock-task3-data', 'credentials', 'credential.blob')
const OLD_ENCRYPTED = Buffer.from([0x11, 0x22, 0x33])
const NEW_ENCRYPTED = Buffer.from([0x44, 0x55, 0x66])

const CREDENTIAL_EVENT_NAMES = new Set([
  'credential_set',
  'credential_get',
  'credential_missing',
  'credential_cleared',
  'credential_reencrypted',
  'credential_operation_failed',
])

const CREDENTIAL_EVENT_STATUS: Record<string, CredentialEvent['status']> = {
  credential_set: 'success',
  credential_get: 'success',
  credential_missing: 'info',
  credential_cleared: 'success',
  credential_reencrypted: 'success',
  credential_operation_failed: 'failed',
}

const CREDENTIAL_ERROR_CODES = new Set([
  'credential_input_invalid',
  'credential_encryption_unavailable',
  'credential_encrypt_failed',
  'credential_decrypt_failed',
  'credential_io_failed',
  'credential_reencrypt_failed',
  'credential_clear_failed',
])

const observedEvents: CredentialEvent[] = []
const temporaryDirectories: string[] = []

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function makeSink(events: CredentialEvent[]): CredentialEventSink {
  return {
    emit(event) {
      events.push(event)
      observedEvents.push(event)
    },
  }
}

type CredentialHarness = {
  bytes: Map<string, Buffer>
  events: CredentialEvent[]
  files: CredentialFileOperations & {
    readPaths: string[]
    removePaths: string[]
    failRead: boolean
    failRemove: boolean
  }
  writer: CredentialAtomicWriter & {
    writePaths: string[]
    failWrite: boolean
  }
  safe: SafeStorageAdapter & {
    available: boolean
    reencrypt: boolean
    failEncrypt: boolean
    failDecrypt: boolean
    nextEncrypted: Buffer
  }
}

function makeHarness(): CredentialHarness {
  const bytes = new Map<string, Buffer>()
  const events: CredentialEvent[] = []
  const files: CredentialHarness['files'] = {
    readPaths: [],
    removePaths: [],
    failRead: false,
    failRemove: false,
    async ensureDirectory() {},
    async readBytes(filePath) {
      this.readPaths.push(filePath)
      if (this.failRead) throw new Error(RAW_ADAPTER_DETAIL)
      const value = bytes.get(filePath)
      return value === undefined ? null : Buffer.from(value)
    },
    async remove(filePath) {
      this.removePaths.push(filePath)
      if (this.failRemove) throw new Error(RAW_ADAPTER_DETAIL)
      bytes.delete(filePath)
    },
  }
  const writer: CredentialHarness['writer'] = {
    writePaths: [],
    failWrite: false,
    async write(filePath, encrypted) {
      this.writePaths.push(filePath)
      if (this.failWrite) throw new Error(RAW_ADAPTER_DETAIL)
      bytes.set(filePath, Buffer.from(encrypted))
    },
  }
  const safe: CredentialHarness['safe'] = {
    available: true,
    reencrypt: false,
    failEncrypt: false,
    failDecrypt: false,
    nextEncrypted: Buffer.from(OLD_ENCRYPTED),
    isEncryptionAvailable() {
      return this.available
    },
    encryptString() {
      if (this.failEncrypt) throw new Error(RAW_ADAPTER_DETAIL)
      return Buffer.from(this.nextEncrypted)
    },
    decryptString(encrypted) {
      if (this.failDecrypt) throw new Error(RAW_ADAPTER_DETAIL)
      expect(Buffer.from(encrypted)).toEqual(OLD_ENCRYPTED)
      return FAKE_SECRET
    },
    shouldReEncrypt() {
      return this.reencrypt
    },
  }
  return { bytes, events, files, writer, safe }
}

function makeStore(harness: CredentialHarness, credentialPath = CREDENTIAL_PATH) {
  return createCredentialStore({
    credentialPath,
    safeStorage: harness.safe,
    files: harness.files,
    atomicWriter: harness.writer,
    events: makeSink(harness.events),
  })
}

function expectEvent(
  events: CredentialEvent[],
  event: string,
  status: CredentialEvent['status'],
  reason: string,
  errorCode?: string,
): void {
  const expected: CredentialEvent = {
    module: 'config',
    event,
    status,
    source: 'runtime',
    reason,
  }
  if (errorCode !== undefined) expected.error_code = errorCode
  expect(events).toContainEqual(expected)
}

function assertCredentialEvents(events: readonly CredentialEvent[]): void {
  for (const event of events) {
    expect(CREDENTIAL_EVENT_NAMES.has(event.event)).toBe(true)
    expect(CREDENTIAL_EVENT_STATUS[event.event]).toBe(event.status)
    expect(event.module).toBe('config')
    expect(event.source).toBe('runtime')
    expect(Object.keys(event).every((key) =>
      ['module', 'event', 'status', 'source', 'reason', 'error_code'].includes(key),
    )).toBe(true)
    expect(Object.keys(event)).not.toContain('time')
    expect(event.reason).toMatch(/^[A-Za-z0-9_=;.-]+$/)
    if (event.event === 'credential_operation_failed') {
      expect(typeof event.error_code).toBe('string')
      expect(CREDENTIAL_ERROR_CODES.has(event.error_code as string)).toBe(true)
    } else {
      expect(event.error_code).toBeUndefined()
    }
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(FAKE_SECRET)
    expect(serialized).not.toContain(RAW_ADAPTER_DETAIL)
    expect(serialized).not.toContain(CREDENTIAL_PATH)
  }
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'magic-mirror-task3-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  assertCredentialEvents(observedEvents)
  observedEvents.length = 0
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('CredentialStore contract', () => {
  it('persists only encrypted bytes at the caller-supplied credential path', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)

    await store.set(FAKE_SECRET)

    expect(harness.bytes.get(CREDENTIAL_PATH)).toEqual(OLD_ENCRYPTED)
    expect(harness.writer.writePaths).toEqual([CREDENTIAL_PATH])
    expect(harness.files.removePaths).toEqual([])
    expect(harness.files.readPaths).toEqual([])
    expect(JSON.stringify(harness.events)).not.toContain(FAKE_SECRET)
    expect(JSON.stringify(harness.events)).not.toContain(CREDENTIAL_PATH)
    expect(CREDENTIAL_PATH).not.toContain('config')
    expect(CREDENTIAL_PATH).not.toContain('backups')
    expectEvent(
      harness.events,
      'credential_set',
      'success',
      'operation=set;storage=encrypted_blob',
    )

    expect(await store.get()).toBe(FAKE_SECRET)
    expectEvent(
      harness.events,
      'credential_get',
      'success',
      'operation=get;result=present;storage=encrypted_blob',
    )
  })

  it('returns missing without decrypting and clears present and absent blobs idempotently', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)

    expect(await store.get()).toBe(null)
    expectEvent(
      harness.events,
      'credential_missing',
      'info',
      'operation=get;result=missing;cause=not_found',
    )

    harness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    await store.clear()
    expect(harness.bytes.has(CREDENTIAL_PATH)).toBe(false)
    expectEvent(
      harness.events,
      'credential_cleared',
      'success',
      'operation=clear;result=removed',
    )

    await store.clear()
    expectEvent(
      harness.events,
      'credential_cleared',
      'success',
      'operation=clear;result=already_absent',
    )
  })

  it('gates set and get on safeStorage availability while clear remains local and usable', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)
    harness.safe.available = false

    await expect(store.set(FAKE_SECRET)).rejects.toMatchObject({
      code: 'credential_encryption_unavailable',
    })
    await expect(store.get()).rejects.toMatchObject({
      code: 'credential_encryption_unavailable',
    })
    expect(harness.writer.writePaths).toEqual([])
    expect(harness.files.readPaths).toEqual([])
    expectEvent(
      harness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=encryption_unavailable',
      'credential_encryption_unavailable',
    )
    expectEvent(
      harness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=encryption_unavailable',
      'credential_encryption_unavailable',
    )

    harness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    await store.clear()
    expect(harness.bytes.has(CREDENTIAL_PATH)).toBe(false)
  })

  it('re-encrypts stale bytes atomically before returning the plaintext', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)
    harness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    harness.safe.reencrypt = true
    harness.safe.nextEncrypted = Buffer.from(NEW_ENCRYPTED)

    expect(await store.get()).toBe(FAKE_SECRET)

    expect(harness.bytes.get(CREDENTIAL_PATH)).toEqual(NEW_ENCRYPTED)
    expect(harness.writer.writePaths).toEqual([CREDENTIAL_PATH])
    expect(harness.events.slice(-2)).toEqual([
      {
        module: 'config',
        event: 'credential_reencrypted',
        status: 'success',
        source: 'runtime',
        reason: 'operation=get;cause=should_reencrypt',
      },
      {
        module: 'config',
        event: 'credential_get',
        status: 'success',
        source: 'runtime',
        reason: 'operation=get;result=present;storage=encrypted_blob',
      },
    ])
  })

  it('rejects empty input with a redacted stable error', async () => {
    const harness = makeHarness()
    const store = makeStore(harness)

    let caught: unknown
    try {
      await store.set('')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CredentialStoreError)
    expect((caught as CredentialStoreError).code).toBe('credential_input_invalid')
    expect((caught as Error).message).toBe('Credential store operation failed')
    expect(Object.prototype.hasOwnProperty.call(caught, 'cause')).toBe(false)
    expect(String(caught)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      harness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=empty_input',
      'credential_input_invalid',
    )
  })

  it('redacts encrypt, decrypt, read, re-encrypt, write, and clear failures', async () => {
    const encryptHarness = makeHarness()
    encryptHarness.safe.failEncrypt = true
    let encryptError: unknown
    try {
      await makeStore(encryptHarness).set(FAKE_SECRET)
    } catch (error) {
      encryptError = error
    }
    expect((encryptError as CredentialStoreError).code).toBe('credential_encrypt_failed')
    expect((encryptError as Error).message).toBe('Credential store operation failed')
    expect(Object.prototype.hasOwnProperty.call(encryptError, 'cause')).toBe(false)
    expect(String(encryptError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      encryptHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=encrypt_failed',
      'credential_encrypt_failed',
    )

    const decryptHarness = makeHarness()
    decryptHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    decryptHarness.safe.failDecrypt = true
    let decryptError: unknown
    try {
      await makeStore(decryptHarness).get()
    } catch (error) {
      decryptError = error
    }
    expect((decryptError as CredentialStoreError).code).toBe('credential_decrypt_failed')
    expect((decryptError as Error).message).toBe('Credential store operation failed')
    expect(String(decryptError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      decryptHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=decrypt_failed',
      'credential_decrypt_failed',
    )

    const readHarness = makeHarness()
    readHarness.files.failRead = true
    let readError: unknown
    try {
      await makeStore(readHarness).get()
    } catch (error) {
      readError = error
    }
    expect((readError as CredentialStoreError).code).toBe('credential_io_failed')
    expect(String(readError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      readHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=io_failure',
      'credential_io_failed',
    )

    const reencryptEncryptHarness = makeHarness()
    reencryptEncryptHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    reencryptEncryptHarness.safe.reencrypt = true
    reencryptEncryptHarness.safe.failEncrypt = true
    let reencryptEncryptError: unknown
    try {
      await makeStore(reencryptEncryptHarness).get()
    } catch (error) {
      reencryptEncryptError = error
    }
    expect((reencryptEncryptError as CredentialStoreError).code).toBe('credential_reencrypt_failed')
    expectEvent(
      reencryptEncryptHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=reencrypt_failed',
      'credential_reencrypt_failed',
    )

    const writeHarness = makeHarness()
    writeHarness.writer.failWrite = true
    let writeError: unknown
    try {
      await makeStore(writeHarness).set(FAKE_SECRET)
    } catch (error) {
      writeError = error
    }
    expect((writeError as CredentialStoreError).code).toBe('credential_io_failed')
    expect(String(writeError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      writeHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=set;cause=io_failure',
      'credential_io_failed',
    )

    const reencryptWriteHarness = makeHarness()
    reencryptWriteHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    reencryptWriteHarness.safe.reencrypt = true
    reencryptWriteHarness.writer.failWrite = true
    let reencryptWriteError: unknown
    try {
      await makeStore(reencryptWriteHarness).get()
    } catch (error) {
      reencryptWriteError = error
    }
    expect((reencryptWriteError as CredentialStoreError).code).toBe('credential_reencrypt_failed')
    expectEvent(
      reencryptWriteHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=get;cause=reencrypt_failed',
      'credential_reencrypt_failed',
    )

    const clearHarness = makeHarness()
    clearHarness.bytes.set(CREDENTIAL_PATH, OLD_ENCRYPTED)
    clearHarness.files.failRemove = true
    let clearError: unknown
    try {
      await makeStore(clearHarness).clear()
    } catch (error) {
      clearError = error
    }
    expect((clearError as CredentialStoreError).code).toBe('credential_clear_failed')
    expect(String(clearError)).not.toContain(RAW_ADAPTER_DETAIL)
    expectEvent(
      clearHarness.events,
      'credential_operation_failed',
      'failed',
      'operation=clear;cause=clear_failed',
      'credential_clear_failed',
    )
  })

  it('resolves files-only and atomic-only mixed optional adapter seams without path leakage', async () => {
    const firstRoot = await makeTemporaryDirectory()
    const firstCredentialPath = join(firstRoot, 'data', 'credentials', 'credential.blob')
    await mkdir(dirname(firstCredentialPath), { recursive: true })
    const firstFiles: CredentialFileOperations = {
      async ensureDirectory(path) {
        await mkdir(path, { recursive: true })
      },
      async readBytes(path) {
        try {
          return await readFile(path)
        } catch (error) {
          if (isNotFound(error)) return null
          throw error
        }
      },
      async remove(path) {
        try {
          await unlink(path)
        } catch (error) {
          if (!isNotFound(error)) throw error
        }
      },
    }
    const firstHarness = makeHarness()
    await createCredentialStore({
      credentialPath: firstCredentialPath,
      safeStorage: firstHarness.safe,
      files: firstFiles,
      events: makeSink(firstHarness.events),
    }).set(FAKE_SECRET)
    expect(await readFile(firstCredentialPath)).toEqual(OLD_ENCRYPTED)

    const secondRoot = await makeTemporaryDirectory()
    const secondCredentialPath = join(secondRoot, 'data', 'credentials', 'credential.blob')
    await mkdir(dirname(secondCredentialPath), { recursive: true })
    const atomicPaths: string[] = []
    const secondHarness = makeHarness()
    const atomicWriter: CredentialAtomicWriter = {
      async write(path, encrypted) {
        atomicPaths.push(path)
        await writeFile(path, encrypted)
      },
    }
    await createCredentialStore({
      credentialPath: secondCredentialPath,
      safeStorage: secondHarness.safe,
      atomicWriter,
      events: makeSink(secondHarness.events),
    }).set(FAKE_SECRET)
    expect(atomicPaths).toEqual([secondCredentialPath])
    expect(await readFile(secondCredentialPath)).toEqual(OLD_ENCRYPTED)
    expect(atomicPaths.every((path) => path === secondCredentialPath)).toBe(true)
  })
})
~~~

The credential test deliberately stores only byte buffers in its fake file
system, verifies that only the caller path is written or removed, checks that
safeStorage availability gates only set/get, and checks every stable error
classification without serializing adapter details. The re-encryption test
requires the reencrypted event before the ordinary get event.

### Step 3: RED gate before production files exist

After only the two test files have been created, the tester runs exactly:

    npx vitest run tests/unit/config-service.test.ts tests/unit/credential-store.test.ts

Expected result: a non-zero exit (normally exit code 1) because the imported
production modules src/main/config-service.ts and src/main/credential-store.ts
do not exist yet; the resource assertion may also report a missing
resources/config/default.json. The tester must preserve complete stdout and
stderr and the exit code. Do not treat this expected RED result as a failure
of the plan, and do not create placeholder production files merely to change
the reason.

## C. Exact production implementation steps

The implementation worker now creates only the three remaining named paths.
Use the declarations, constants, and algorithms already specified above
without changing their public names, return types, event names, or error
codes.

### Step 4: Implement src/main/config-service.ts

1. Import only zod, node:path, node:fs/promises, write-file-atomic, and the
   shared types named in the Exact Public Interfaces. Do not import Electron,
   app, safeStorage, IPC, a renderer, a model SDK, or a model ID. Keep the
   source free of model-role literals and fallback arrays.

2. Copy the exact exported interfaces, ConfigErrorCode unions,
   ConfigServiceError, mirrorConfigSchema, and createConfigService signature
   from the earlier sections. The public error constructor must always call
   Error with the constant message Config operation failed, set name to
   ConfigServiceError, copy the code, copy fields to a new array, and never
   assign cause or raw zod/adapter errors.

3. Copy the exact private SLOT_ORDER, MODEL_PATHS, SLOT_FILE_NAMES,
   SlotInspection, RawSlots, AuxiliarySlot, AuxiliaryEnvelope, and resolved
   option declarations. Implement slotPath with join(configDir,
   SLOT_FILE_NAMES[slot]) and serializeConfig with
   JSON.stringify(config, null, 2) + newline. The only model-path membership
   check is MODEL_PATHS.has(path); it is not a model resolver.

4. Implement the private diskConfigFiles and diskConfigAtomicWriter exactly as
   the earlier adapter listing specifies. Catch only ENOENT in readText/remove;
   rethrow every other adapter error to the service classifier. The atomic
   writer uses write-file-atomic with UTF-8 text. The factory must resolve
   files and atomicWriter independently, so the files-only and atomic-only
   tests exercise a real mixed seam.

5. Implement the exact core and auxiliary schemas. Map zod failures to safe
   FieldError values as follows, never using issue.message:

   - invalid_type -> invalid_type
   - too_small -> too_small
   - too_big -> too_big
   - invalid_value -> invalid_value
   - unrecognized_keys -> unrecognized_keys
   - invalid_format -> invalid_format
   - invalid_union -> invalid_union
   - invalid_key -> invalid_key
   - invalid_element -> invalid_element
   - every other issue code -> schema_invalid

   Convert paths using only allow-listed core fields and their declared
   nested fields. A numeric path segment is written as [N]. Any unknown path
   becomes $. A JSON.parse failure becomes { path: '$', message:
   'invalid_json' }. Do not include a raw JSON fragment or adapter message.

6. Implement parseConfigText so it parses JSON, safe-parses the strict core,
   throws an internal classified schema result on failure, casts only the
   successful core to MirrorConfig, and calls normalizeAuxiliary before
   returning. Implement normalizeEntries so a non-array emits exactly one
   config_auxiliary_degraded event with index=container/action=empty and
   returns [], while an invalid item becomes the exact disabledSpell or
   disabledScene envelope and emits one indexed event. Valid passthrough items
   remain byte-for-byte value-equivalent in the returned object. The event
   contains only source=runtime, module=config, the fixed event name/status,
   the typed auxiliary error code, and the exact metadata-only reason.

7. Implement inspectSlot using the private files adapter. A null read returns
   { status: 'missing', raw: null }; a thrown read returns
   { status: 'unreadable', raw: null }; a parse/schema failure returns
   { status: 'invalid', raw, fields }; a successful parse returns
   { status: 'valid', raw, value }. Do not emit a recovery event from
   inspectSlot itself: the resolver emits one only for the source actually
   selected. Auxiliary degradation events are emitted while parsing a valid
   core, with the physical slot label passed to normalizeAuxiliary.

8. Implement readRawSlots as three independent physical reads. Preserve
   null for ENOENT and throw a private operation-classified read error for
   any other read failure; this helper is used before a multi-file transaction
   so exact compensation never begins with an unknown pre-operation byte.
   Implement restoreRawSlots over SLOT_ORDER. For a null raw value call
   files.remove(slotPath); otherwise call atomicWriter.write(slotPath, raw).
   Never write a placeholder for absence.

9. Implement the defensive read resolver exactly in the earlier table:
   resolve Active from valid physical Active, else valid physical Previous,
   else a valid parsed default resource; resolve Previous from valid physical
   Previous else the resolved Active; resolve Draft from valid physical Draft
   else the resolved Active. For each missing/invalid/unreadable physical
   fallback emit config_recovered with the corresponding typed error code and
   one exact reason. If the default is missing or schema-invalid, emit
   config_operation_failed with config_default_invalid and reason
   operation=read;slot=active;action=read;cause=schema_invalid;issue_count=N.
   If reading the default throws a non-ENOENT error, use
   config_read_failed and reason operation=read;slot=active;action=read;cause=io_failure.
   A successful resolution emits exactly one config_loaded event after all
   three positions are filled. Never alter any physical malformed file.

10. Implement initialize. Read the three slots independently. When all are
    physically missing, read and validate the caller-supplied default,
    normalize it with slot=active, ensure configDir, and call
    writeSlotTransaction with the same serialized config for all slots and a
    before RawSlots of three nulls. Emit config_seeded only after the
    transaction succeeds. Preserve the resource configVersion. When any
    physical slot exists, delegate to the defensive read resolver without
    overwriting valid bytes.

11. Implement saveDraft. First call the defensive read resolver and use its
    resolved Active version. Safe-parse the unknown candidate, normalize it
    with slot=draft, replace candidate.configVersion with the resolved Active
    version regardless of the candidate value, ensure configDir, and atomically
    write only draft.json. A schema failure emits
    config_operation_failed/config_schema_invalid with
    operation=save_draft;slot=draft;action=reject;cause=schema_invalid;issue_count=N
    and throws ConfigServiceError with only safe fields. An ensure/write
    failure emits config_operation_failed/config_write_failed with
    operation=save_draft;slot=draft;action=reject;cause=io_failure and throws
    the constant-message safe error. Success emits config_draft_saved.

12. Implement writeSlotTransaction with the exact Previous, Active, Draft
    order in SLOT_ORDER. Ensure the directory once, write non-null entries
    with the atomic writer, and remove null entries. On the first write/remove
    failure emit config_operation_failed with the operation-specific
    write_failed reason operation=publish|rollback;slot=all;action=failed;
    cause=io_failure (seed uses operation=seed), then run a separate
    restoreRawSlots attempt. If restoration succeeds, emit
    config_transaction_compensated with
    operation=publish|rollback|seed;action=restore;cause=io_failure and throw
    config_write_failed. If restoration throws, emit a second
    config_operation_failed with config_compensation_failed and
    operation=...;slot=all;action=restore;cause=compensation_failure, then
    throw config_compensation_failed. Never expose either adapter exception.
    The original failure is one-shot only; restoration calls are allowed to
    complete all slots and must not be skipped after the first failure.

13. Implement publish. Resolve slots, capture all three physical raw values,
    reject a non-readable raw capture with config_read_failed before writing,
    and reject active.configVersion === Number.MAX_SAFE_INTEGER with
    config_revision_exhausted and reason
    operation=publish;slot=all;action=reject;cause=revision_exhausted. Build
    Previous=old resolved Active, Active=old resolved Draft with
    configVersion=old resolved Active.configVersion + 1, and Draft=that new
    Active. Serialize all three deterministically and pass them with the
    before RawSlots to writeSlotTransaction. On success emit
    config_published with active_version=N;previous_version=M and return the
    new Active. No source may select a different model ID.

14. Implement rollback without calling read() as its Previous source. Read
    physical previous.json directly and classify missing, invalid, and
    unreadable before any write. Each rejection emits
    config_operation_failed/config_previous_unavailable with exactly
    operation=rollback;slot=previous;action=reject;cause=missing|invalid|unreadable.
    Then capture physical Active, Draft, and Previous raw bytes. If Active or
    Draft cannot be read, emit config_read_failed with
    operation=rollback;slot=all;action=read;cause=io_failure and throw before
    writing. Require a valid physical Active to calculate the next revision.
    Reject a max-safe Active version with the revision_exhausted event above.
    Build Previous=old physical Active, Active=physical Previous value with
    configVersion=physical Active.configVersion + 1, and Draft=new Active.
    Use the same transaction/compensation routine and emit
    config_rolled_back with active_version=N;previous_version=M only after
    success. The in-memory Previous fallback from read() must never satisfy
    this operation.

15. Implement flattenJson and makeConfigDiff exactly as declared. Flatten
    object keys in lexicographic order, arrays with [N] segments, empty
    arrays/objects as leaves, and primitive leaves at their current path.
    Compare the sorted union of paths by JSON value, preserve lexicographic
    changed order, set nonModelChanges true iff a changed path is not in
    MODEL_PATHS, and emit config_diff_computed with only from, to,
    changed_count, and non_model_changes metadata. The returned ConfigDiff
    may contain local values; no event may contain them.

### Step 5: Implement src/main/credential-store.ts

1. Import only node:path, node:fs/promises, write-file-atomic, and the shared
   MirrorEvent type. Do not import Electron, app, safeStorage, keytar, IPC,
   network modules, config files, or backups. Copy the exact exported
   SafeStorageAdapter, file/atomic/event/store interfaces, error union,
   CredentialStoreError, and factory signature from the earlier contract.

2. Implement private disk credential adapters with mkdir/readFile/unlink and
   ENOENT-to-null behavior. The private atomic writer passes the encrypted
   Buffer directly to write-file-atomic and never converts it to text. Resolve
   files and atomicWriter independently. Use dirname(credentialPath) only for
   ensureDirectory; never derive or normalize the path from another input.

3. Implement CredentialStoreError with constant message Credential store
   operation failed, name CredentialStoreError, the stable code, and no cause.
   Use one event helper that always emits module=config, source=runtime, the
   fixed credential event, fixed status, exact reason, and optional typed
   error_code. Never include credentialPath, plaintext, encrypted bytes,
   adapter messages, or return values in an event.

4. Implement set. Reject only a non-string or zero-length runtime value with
   credential_input_invalid and reason operation=set;cause=empty_input.
   Check isEncryptionAvailable; false or an adapter check failure maps to
   credential_encryption_unavailable and reason
   operation=set;cause=encryption_unavailable. Catch encryptString only as
   credential_encrypt_failed with encrypt_failed. Call ensureDirectory and
   atomicWriter.write(credentialPath, encrypted Buffer); map either failure
   to credential_io_failed with io_failure. Emit credential_set only after
   atomic success. Keep plaintext on the call stack only.

5. Implement get. Gate on availability with the same stable error. Read only
   credentialPath; map read failure to credential_io_failed/io_failure and
   null to credential_missing with result=missing;cause=not_found. Decrypt
   only the returned Buffer; map failure to credential_decrypt_failed/
   decrypt_failed. If shouldReEncrypt is true, encrypt the returned plaintext,
   ensure the same parent directory, and atomically replace the same path.
   Map any re-encryption check/encrypt/ensure/write failure to
   credential_reencrypt_failed/reencrypt_failed. Emit
   credential_reencrypted first, then credential_get. If no re-encryption is
   needed, emit only credential_get. Return plaintext only to the direct
   Main caller.

6. Implement clear without an availability check. Read the same path first so
   the event can distinguish absent from removed; map a read failure to
   credential_io_failed/io_failure. If null, emit
   credential_cleared with result=already_absent and return. Otherwise remove
   the path; map failure to credential_clear_failed/clear_failed, and emit
   result=removed only after success. Do not create a backup or a plaintext
   temporary.

## D. GREEN and complete verification gates

After the three production files exist, the fresh tester runs each focused
command separately:

    npx vitest run tests/unit/config-service.test.ts
    npx vitest run tests/unit/credential-store.test.ts
    npx vitest run tests/unit/config-service.test.ts tests/unit/credential-store.test.ts

Each command must exit 0. Capture complete stdout and stderr for each command,
including the test count and any warnings; do not report only a summary line.
The tester then runs the node typecheck:

    npm run typecheck:node

It must exit 0 with complete stdout and stderr. The full verification commands
are:

    npm test
    npm run typecheck
    npm run build

Each must exit 0. The tester returns complete stdout/stderr and the exit code
for every command, including a failed or unavailable command. No command in
this correction is run by the current worker.

## E. Requirements and coverage matrix

| Promised behavior | Test name(s) | Implementation location | Invariant |
|---|---|---|---|
| Strict MirrorConfig core, non-empty three model roles, no extra core keys | validates the strict core without deciding auxiliary Phase 4 shape | config-service.ts mirrorConfigSchema and safe issue mapper | 11 |
| Exact mock resource, no worker model, secret/content fields, or production model literals | keeps the versioned resource mock-only and free of forbidden content fields | resources/config/default.json; both production modules | 1, 11, 12 |
| First boot seeds all slots, preserves resource revision, uses caller paths | seeds all three slots from the caller-supplied default and preserves its version | initialize, writeSlotTransaction | 9, 10, 11 |
| Optional file/atomic seams resolve independently | resolves files-only and atomic-only mixed optional adapter seams | resolveConfigOptions and disk adapters | 9, 10 |
| Missing/invalid/unreadable Draft fallback | directFallbackCases for Draft | inspectSlot and defensive resolver | 9, 10 |
| Missing/invalid/unreadable Previous fallback for ordinary read | directFallbackCases for Previous | inspectSlot and defensive resolver | 9, 10 |
| Missing/invalid/unreadable Active fallback to Previous | falls back from physical Active to physical Previous when Active is $failure | defensive resolver | 9, 10 |
| Active plus Previous unavailable fallback to default | falls back from unavailable Active and Previous to the versioned default | default read branch | 9, 10, 11 |
| Unrecoverable core fails visibly with safe fields | fails visibly when Active, Previous, and the default have no valid core | ConfigServiceError and default classifier | 9, 10, 11 |
| Malformed auxiliary containers degrade to empty arrays | degrades malformed auxiliary containers without blocking the valid core | normalizeEntries | 9, 10 |
| Malformed spell/scene entries become disabled envelopes; valid passthrough survives | maps malformed spell entries to disabled envelopes and preserves valid future fields | normalizeEntries, disabledSpell, disabledScene | 9, 10 |
| Draft uses current Active version and only writes Draft | saves a Draft at the current Active revision and writes only draft.json | saveDraft | 9, 11 |
| Draft schema/write failures are visible and redacted | rejects malformed core Draft input; reports a Draft write failure | saveDraft error/event mapping | 1, 9, 10, 11 |
| Deterministic model/non-model/array diff metadata | computes deterministic model and non-model diffs; marks model-only and empty diffs | flattenJson, makeConfigDiff | 1, 9, 11 |
| Publish bumps exactly once and preserves old Active as Previous | publishes a deterministic revision and keeps the old Active as Previous | publish | 9, 10, 11 |
| Publish max-safe revision rejection | rejects a publish revision at Number.MAX_SAFE_INTEGER | nextRevision guard | 9, 10, 11 |
| Publish transaction compensates exact bytes and absence | publish row in transactionCases | writeSlotTransaction, restoreRawSlots | 1, 9, 10 |
| Rollback transaction compensates exact bytes and absence | rollback row in transactionCases | writeSlotTransaction, restoreRawSlots | 1, 9, 10 |
| Separate compensation-failure event/error | reports a distinct compensation failure when restoration itself fails | writeSlotTransaction compensation branch | 9, 10 |
| Rollback uses physical Previous, not read fallback | rejects rollback when physical Previous is missing/invalid/unreadable | rollback direct physical inspection | 9, 10, 11 |
| Rollback revision and slot contents are deterministic | rolls back from physical Previous with the next deterministic revision | rollback | 9, 10, 11 |
| Rollback max-safe revision rejection | rejects rollback revision exhaustion before any write | rollback nextRevision guard | 9, 10, 11 |
| SafeStorage unavailable gates set/get | gates set and get on safeStorage availability while clear remains local | credential set/get/clear | 9, 10, 12 |
| Encrypted-only persistence and caller path separation | persists only encrypted bytes at the caller-supplied credential path | credential atomic/file adapters | 1, 3, 12 |
| Missing and idempotent clear | returns missing without decrypting and clears present and absent blobs idempotently | credential get/clear | 9, 10, 12 |
| SafeStorage re-encryption | re-encrypts stale bytes atomically before returning the plaintext | credential get reencrypt branch | 1, 9, 12 |
| Empty-input and all adapter failure classes | rejects empty input; redacts encrypt, decrypt, read, re-encrypt, write, and clear failures | CredentialStoreError and operation classifiers | 1, 9, 10, 12 |
| Credential optional seams resolve independently | resolves files-only and atomic-only mixed optional adapter seams without path leakage | resolveCredentialOptions and disk adapters | 1, 9, 10, 12 |
| Credential event allow-list, exact status/reason, no secret/path | assertCredentialEvents after every test | credential event helper | 1, 9, 12 |

The applicable invariant checklist remains all twelve: 1 RAM-only sensitive
content, 2 face candidate does not unlock memory, 3 Main-only profile IDs, 4
clean profile switching, 5 turn-start extraction owner, 6 control turns skip
extraction, 7 exact spells and approved presets, 8 one microphone owner, 9
visible metadata-only fallback/degrade, 10 non-blocking degradation, 11
versioned model IDs with no silent substitution, and 12 Main-only
safeStorage credentials. This unit directly exercises 1, 9, 10, 11, and 12;
the other seven remain preserved by the explicit absence of those domains.

## F. Implementer handoff

The implementation worker receives this bounded envelope:

    model: "gpt-5.6-luna"
    reasoning_effort: "max"
    role: "implementer"
    fresh_worker: true
    task: implement only Task 3 production files after the two test files are red
    write_scope: src/main/config-service.ts, src/main/credential-store.ts, resources/config/default.json
    explicit_non_goals: all other paths, application wiring, IPC, telemetry persistence, tests after their initial creation, Git, secrets, and runtime model changes
    skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md
    self_invariants: 1, 3, 8, 9, 10, 11, 12
    evidence: exact changed files, concise diff summary, complete stdout/stderr and exit code for each permitted command, unresolved risks, metadata-only
    self_review: read the own diff/output; no more than 3 passes
    root_review: external interactive-root gate after return; not part of self-review

The test-only worker has the same model, effort, role, fresh_worker, skills,
invariant, evidence, and root-review fields but write_scope exactly
tests/unit/config-service.test.ts and tests/unit/credential-store.test.ts and
may run only the RED command. Neither worker reads .env or
scripts/install-node-lts.ps1. Neither worker stages, commits, pushes, or
modifies any path outside its exact write scope.

The implementer handoff must report metadata only: paths, test names, event
names, error codes, counts, statuses, hashes if useful, complete command
outputs, exit codes, and unresolved risks. It must not report the synthetic
secret, any plaintext, any config content beyond IDs/counts, any transcript,
audio, private context, image, embedding, prompt, or adapter exception detail.

## G. Root review checklist and intentional Git handoff

The interactive root performs the external gate after the worker returns and
does not run the tests itself. Accept only when all of the following are
evidenced:

- The diff contains only the five intentional Task 3 paths and preserves all
  earlier plan lines through the A heading.
- The two focused suites, combined focused suite, node typecheck, full test
  suite, full typecheck, and build each have a fresh tester result with exit
  code 0 and complete stdout/stderr.
- The public interfaces, constants, exact event tables, physical-Previous
  rollback rule, deterministic revisions, and compensation semantics are
  unchanged from this plan.
- The tests prove every row of the coverage matrix, including mixed optional
  adapters, every missing/invalid/unreadable slot class, exact bytes/absence,
  restoration failure, safeStorage availability, encrypted-only storage,
  re-encryption, error redaction, and path separation.
- Event objects are allow-listed, source=runtime, module=config, reason-only
  metadata; no event contains a model ID, path, secret, plaintext, raw error,
  or user-content value.
- Production TypeScript contains no model literal or model fallback list,
  never imports Electron app/safeStorage, never writes config/backups from
  CredentialStore, and never gates unrelated conversation behavior.
- All twelve invariant IDs are preserved, with direct evidence for 1, 9, 10,
  11, and 12.
- No .env file and no scripts/install-node-lts.ps1 path is present in the diff
  or index.

If the root accepts the worker result, the only intentional staging command is:

    git add src/main/config-service.ts src/main/credential-store.ts resources/config/default.json tests/unit/config-service.test.ts tests/unit/credential-store.test.ts

Before committing, the root checks the staged name list with:

    git diff --cached --name-only

The exact expected five names are the five arguments above. Never use git add
., git add -A, a wildcard, or a parent directory. The exact commit command is:

    git commit -m "feat: add phase 0 config and credential services"

The exact branch push command is:

    git push -u origin phase0-config

The current correction does not run any of these commands. .env and
scripts/install-node-lts.ps1 are never staged, committed, pushed, opened, or
read as part of this plan.

## H. Integration and next-task handoff

Task 3 cannot be accepted on focused tests alone. A fresh tester must first
pass both focused suites, the combined focused suite, all existing tests, the
node typecheck, the complete typecheck, and the production build, all with
exit code 0 and complete stdout/stderr. The interactive root then performs the
external review, integrates the accepted commit, and pushes the integrated
main branch. A worker does not integrate or push main.

After that root integration, Application Task 4 remains next. Tasks 3, 4, and
5 stay sequential; this continuation does not start Task 4, alter Task 4's
order, declare a Phase 0 demo or exit, or change any application status.

Plan complete
