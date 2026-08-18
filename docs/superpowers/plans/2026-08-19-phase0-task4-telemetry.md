# Phase 0 Task 4 — Metadata-only Telemetry Implementation Plan

> Harness note: Only the interactive root dispatches fresh profile-backed CLI workers; no worker may delegate or spawn a child. Steps use checkbox syntax for tracking.

**Goal:** Add a Main-owned, metadata-only telemetry sink with bounded RAM history, a bounded non-blocking JSONL writer, deterministic rotation, source separation, and visible failure counters without wiring it into the application boot path.

**Architecture:** The sink accepts the existing synchronous Omit<MirrorEvent, 'time'> producer seam, normalizes only the shared allow-listed fields, timestamps accepted events with an injected clock, and stores them in a 2,000-entry RAM ring. A separate FIFO queue feeds an injected file-operation adapter through an injected scheduler; queue, writer, and rotation failures are reported directly to the RAM ring and counters through a non-recursive path. Task 4 leaves index.ts boot markers, IPC, Console pages, lifecycle wiring, and Task 5 SQLite ownership unchanged.

**Tech Stack:** TypeScript 5.9, Node built-ins for directory/stat/append/rename/remove operations, the existing shared MirrorEvent type, and Vitest 4.1.10. Add no dependency, package script, model literal, network client, or external telemetry stack.

**Spec:** docs/Magic_Mirror_PRD_v0.3.md §§9.1 and 11; docs/Magic_Mirror_Tech_Spec_v0.3.md §§6.3, 14.1, 17.1, and 18; docs/Magic_Mirror_Implementation_Plan_v0.3.md §§3.3–3.4, Phase 0, P0-D3, and P0-D4; docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md §A1; src/shared/types.ts; and the Task 3 event seam in docs/superpowers/plans/2026-08-18-phase0-task3-config-service.md.

## Global Constraints

- Status at planning time: Application Task 3 (ConfigService + credentials) is completed, corrected, integrated, and pushed on main at implementation commit 0270686 with correction/integration tip 835c92d. Fresh merged-main verification supplied for this planning unit is 7 test files / 92 tests passed, full Node plus web typecheck exit 0, and Electron Vite main/preload/renderer build exit 0.
- Current branch: phase0-telemetry, pushed from main. Task 4 is current and not started; this document is planning/process state only.
- Current implementation write order is exact: create tests/unit/telemetry.test.ts first, then create src/main/telemetry.ts. No other application, test, package, config, renderer, preload, IPC, or resource path is an intended Task 4 write path.
- Task 4 must not edit src/main/index.ts, src/main/lifecycle.ts, src/shared/types.ts, any preload or renderer, package.json, package-lock.json, electron.vite.config.ts, or the existing Task 3 files. Existing boot markers in index.ts remain the Phase 0 stand-in until the later boot owner wires a telemetry sink.
- Main owns the RAM ring, queue, writer lifecycle, and counters. Telemetry never becomes a renderer/model boundary and never receives guest/profile identifiers from a renderer or model tool.
- Persisted event fields are exactly time, module, event, status, duration_ms?, error_code?, session_id?, scene_id?, reason?, source?. Unknown fields are stripped before any serialization; raw errors are never serialized.
- The exact production caps are RAM ring maximum 2,000 events, writer queue maximum 1,000 events, JSONL maximum 5 * 1024 * 1024 bytes per file, and maximum 5 files. The queue drops its oldest item at capacity and increments telemetryDroppedCount.
- The writer is non-blocking from emit: emit is synchronous, returns void, never waits for disk, and never throws to wake, Voice, Avatar, scenes, config, credentials, or lifecycle producers. flush and close are explicit asynchronous test/control methods.
- Internal drop, scheduler, writer, and rotation diagnostics bypass emit and enqueue directly into RAM plus counters. They never enqueue themselves and never retry indefinitely.
- Source labels remain distinct: omitted source normalizes to runtime; explicit runtime, simulator, and contract_test are preserved and filterable. A simulator or contract-test event is never relabeled as runtime.
- Wake telemetry carries the configurable keyword plus configured_threshold, boost, and num_trailing_blanks in the metadata reason representation. It never accepts or persists a per-event confidence value, and Task 4 does not implement wake detection.
- No transcript, audio, prompt, private context, memory value, image/frame, embedding, key, Realtime secret, or arbitrary raw exception detail may enter RAM telemetry, JSONL, diagnostics, or worker evidence.
- Use only existing dependencies and Node built-ins. Windows development uses the same Electron safeStorage API backed by DPAPI as the target macOS Keychain path; this Windows task does not field-verify macOS Keychain, TCC, signing, or entitlements.
- Tasks 3–5 remain sequential. Task 5 may consume the telemetry sink for DB health metadata, but telemetry remains in RAM/JSONL and is not written to SQLite by Task 4.
- No worker stages, commits, pushes, merges, or changes immutable product/skill sources. The root performs the external review and intentional Git integration after worker evidence.

---

## Status and scope

- Phase: Phase 0 — Foundation / Visible Skeleton.
- Current unit: Application Task 4 — Telemetry (metadata-only, non-blocking).
- User-visible status: the Task 4 contract is being prepared; no runtime telemetry implementation, Console event timeline, IPC exposure, or phase demo result is claimed by this plan.
- Exact future implementation files: tests/unit/telemetry.test.ts first; src/main/telemetry.ts second.
- Exact process files updated with this plan: AGENTS.md, PROGRESS.md, and DECISIONS.md.
- Existing boot markers remain in src/main/index.ts until the later boot/Console owner explicitly wires the sink.

## Unit template

**Story / Phase:** US-DEV-001 / Phase 0 Foundation, Application Task 4.

**User-visible outcome:** Main will have a bounded metadata-only event timeline and a bounded rotating local diagnostic log that can later be paged by Console. Queue saturation, invalid events, scheduler failure, writer failure, and rotation failure remain visible as safe RAM events and counters while the visitor hot path continues.

**Files / modules expected to change:** Create tests/unit/telemetry.test.ts first; then create src/main/telemetry.ts. Do not change index.ts, IPC, preload, renderer, Console UI, shared types, Task 3 modules, package files, or SQLite files.

**Console control or telemetry to add:** Add the Main-only Telemetry interface, source-filterable RAM pagination, telemetryDroppedCount and bounded health counters, and internal metadata-only diagnostics. Preserve the existing boot-marker output for the later boot owner; do not add a Console page or IPC channel in Task 4.

**Happy-path test:** Emit synthetic metadata-only runtime, simulator, and contract_test events; verify deterministic time, exact field order, RAM pagination, FIFO drain order, newline-delimited JSONL, and rotation at the exact byte cap.

**Failure / fallback test:** Inject arbitrary and sensitive extra fields, invalid metadata, a full queue, a pending writer, scheduler failure, writer failure, rotation failure, and close-after-flush; verify safe stripping/rejection, counters, direct RAM diagnostics, no raw error detail, no throw, bounded queues, and continued producer return.

**Explicit non-goals:** Telemetry wiring in index.ts or lifecycle.ts; IPC; Console rendering or pagination UI; boot-marker replacement; wake detection or microphone handling; Realtime, Avatar, scene, face, memory, model resolver, credentials, SQLite, Task 5, Tasks 6–10, Phase 1/2 implementation, external observability, package changes, tests/build/typecheck execution by this worker, and Git operations by workers.

**Demo step affected:** P0-D3 Observability and P0-D4 Restart will later consume this contract. Task 4 itself supplies deterministic unit evidence only; the later boot/Console owner preserves the existing markers and performs the visible demo wiring.

## Source anchors and decision labels

The following labels distinguish facts already present in the authorized sources from design choices needed to make the bounded module directly testable.

### Verified requirements

| Label | Anchor | Requirement carried into the plan |
|---|---|---|
| verified | PRD §9.1 FR-DEV-01 and FR-DEV-03 | Telemetry contains timestamp, module, event, status, duration, error code, session ID, and non-content metadata; every drop/fallback/failure is visible. |
| verified | PRD §11.1–11.2 | Persistent telemetry is bounded; allowed diagnostics exclude full transcripts, audio, private context, runtime frames, embeddings, model traces, keys, and Realtime secrets. |
| verified | Tech Spec §6.3 | Main owns a 2,000-entry RAM ring, non-blocking rotating JSONL is 5 MB per file and 5 files, writer queue is 1,000, oldest queue items may drop with telemetryDroppedCount, Console reads pages, and no external telemetry stack is used. |
| verified | Tech Spec §6.3 | The persisted field order and optionality are time, module, event, status, duration_ms?, error_code?, session_id?, scene_id?, reason?, source?. |
| verified | Tech Spec §6.3 and §17.1 | Simulator source labeling is separate and full queue/disk failure must not block the visitor hot path. |
| verified | Tech Spec §14.1 | Ignore, drop, fallback, and failure paths carry a safe reason and do not silently return. |
| verified | Tech Spec §18 decision 10 | Console/local telemetry starts in Foundation and does not use an external observability stack. |
| verified | Implementation Plan §3.3–3.4 and Phase 0 scope | Metadata-only rotating events, safe fallback visibility, source=contract_test separation, and P0-D3/P0-D4 observability/restart consumers are part of the Phase 0 baseline. |
| verified | Stack Adversarial Review §A1 | sherpa-onnx does not provide a per-event confidence score; wake metadata is keyword, configured threshold, boost, and num_trailing_blanks. |
| verified | src/shared/types.ts | MirrorEvent already defines the time-owned-by-Telemetry seam and the runtime/simulator/contract_test source union. |
| verified | src/main/lifecycle.ts and Task 3 plan/source | Existing producers use synchronous emit(Omit<MirrorEvent, 'time'>): void; Task 3 events are metadata-only and use the same injected seam. |
| verified | package.json, tsconfig.node.json, electron.vite.config.ts | Existing TypeScript/Vitest/Node toolchain and Node built-ins are sufficient; no dependency or build-config change is needed. |

### Explicit design decisions and inferences

| Label | Decision | Reason |
|---|---|---|
| decision | Use file names telemetry-0.jsonl through telemetry-4.jsonl, with suffix 0 newest/current and larger suffixes older. | Gives deterministic newest-first rotation without a directory scan or timestamp ambiguity. |
| decision | Interpret 5 MB as 5 * 1024 * 1024 bytes and measure UTF-8 bytes with Buffer.byteLength. | Makes the cap exact and independent of platform newline encoding. |
| decision | Normalize omitted source to runtime; preserve explicit simulator and contract_test values. | Existing producers may omit the optional field, while test and simulator provenance must never be merged. |
| decision | Strip unknown top-level keys and retain a valid core event; reject invalid allow-listed fields. | Keeps useful metadata, prevents sensitive extras from serialization, and makes the behavior observable through a non-recursive RAM diagnostic. |
| decision | Require metadata-safe lowercase snake error codes and a delimiter-safe reason grammar; do not attempt content classification. | Stable producer codes and encoded wake metadata can be retained while spaces, newlines, quotes, raw errors, and ordinary private content are rejected before serialization. |
| decision | Use newest-first pages with an exclusive internal sequence cursor and a default page size of 50, clamped to 1–200. | Gives deterministic Console pagination without persisting a sequence field. |
| decision | On the first writer/rotation failure in a drain, drop the failed item and all remaining queued items, increment telemetryDroppedCount for each, record one direct RAM diagnostic, and resolve flush/close. | Avoids retry mazes and preserves the non-blocking contract; a later emit may retry after the adapter recovers. |
| decision | Treat scheduler failure like a bounded writer failure: clear the queued batch, increment the counter, record one direct RAM diagnostic, and never throw from emit. | A failed scheduling seam must not strand an unbounded queue. |
| decision | close marks the sink closed before draining; later emit calls are dropped with a direct RAM diagnostic, and close is idempotent. | Makes concurrent shutdown deterministic and keeps post-close producers non-throwing. |
| inference | The wake keyword is URL-encoded inside reason as keyword=<encoded> so a configurable Chinese phrase remains one safe key-value segment; threshold, boost, and num_trailing_blanks remain explicit keys. | The shared persisted schema has no keyword field, while reason is the existing metadata channel and JSONL must remain one line. |

## File map and exact public contract

### File responsibilities

- tests/unit/telemetry.test.ts: test-only harnesses for the injected clock, file operations, scheduler, RAM/queue limits, normalization, serialization, rotation, and failure paths. It is written before production code and is the only test write path.
- src/main/telemetry.ts: Main-only Telemetry implementation, default Node file adapter, normalization, bounded ring/queue, writer scheduler, JSONL rotation, counters, flush/close, and the wake metadata formatter. It is the only production write path.
- src/main/index.ts: read-only in Task 4. Its metadata-only boot markers remain intact for the later boot owner.
- src/shared/types.ts: read-only in Task 4. MirrorEvent remains authoritative.

### Public TypeScript interfaces and signatures

The production file must expose the following contract. Names may not drift between the RED test and the GREEN implementation.

~~~ts
import type { MirrorEvent, ModuleId } from '../shared/types'

export type TelemetryEventInput = Omit<MirrorEvent, 'time'>
export type TelemetrySource = NonNullable<MirrorEvent['source']>

export interface TelemetryFileOperations {
  ensureDirectory(directoryPath: string): Promise<void>
  size(filePath: string): Promise<number | null>
  append(filePath: string, data: string): Promise<void>
  rename(fromPath: string, toPath: string): Promise<void>
  remove(filePath: string): Promise<void>
}

export type TelemetryClock = () => string

export interface TelemetryDrainScheduler {
  schedule(drain: () => Promise<void>): void
}

export interface TelemetryOptions {
  directory: string
  filePrefix?: string
  clock?: TelemetryClock
  files?: TelemetryFileOperations
  scheduler?: TelemetryDrainScheduler
}

export interface TelemetryPageRequest {
  limit?: number
  beforeSequence?: number
  module?: ModuleId
  status?: MirrorEvent['status']
  source?: TelemetrySource
}

export interface TelemetryPage {
  events: ReadonlyArray<MirrorEvent>
  nextBeforeSequence: number | null
}

export interface TelemetryCounters {
  telemetryDroppedCount: number
  ramEvictedCount: number
  rejectedEventCount: number
  extraFieldStrippedCount: number
  writerFailureCount: number
  rotationFailureCount: number
  schedulerFailureCount: number
}

export interface TelemetryStats extends TelemetryCounters {
  ramEventCount: number
  queueDepth: number
  closed: boolean
}

export interface Telemetry {
  emit(event: TelemetryEventInput): void
  readPage(request?: TelemetryPageRequest): TelemetryPage
  getStats(): TelemetryStats
  flush(): Promise<void>
  close(): Promise<void>
}

export interface WakeTelemetryMetadata {
  keyword: string
  configured_threshold: number
  boost: number
  num_trailing_blanks: number
}

export const TELEMETRY_DEFAULTS: Readonly<{
  ramLimit: 2000
  queueLimit: 1000
  maxFileBytes: 5242880
  maxFiles: 5
  pageSize: 50
  maxPageSize: 200
  filePrefix: 'telemetry'
}> 

export type TelemetryInternalErrorCode =
  | 'telemetry_event_invalid'
  | 'telemetry_event_too_large'
  | 'telemetry_queue_full'
  | 'telemetry_writer_failed'
  | 'telemetry_rotation_failed'
  | 'telemetry_scheduler_failed'
  | 'telemetry_closed'

export function createTelemetry(options: TelemetryOptions): Telemetry
export function formatWakeMetadata(metadata: WakeTelemetryMetadata): string
~~~

The implementation may add unexported helper types and functions, but it must not add public persisted fields, a second producer seam, a model resolver, an IPC channel, or a network client.

## Exact behavior contract

### Constants and validation

1. Export TELEMETRY_DEFAULTS with the exact values above. Do not expose production limit overrides through TelemetryOptions.
2. The input top-level allow-list is module, event, status, duration_ms, error_code, session_id, scene_id, reason, and source. time is never accepted from a producer; Telemetry creates it. Every other enumerable key is stripped without reading or serializing its value.
3. module must be one of the existing ModuleId values: app, openai, wake, audio, camera, identity, memory, avatar, lighting, fog, music, sqlite, config, or telemetry.
4. event must match the metadata-only name pattern ^[a-z][a-z0-9_]{0,63}$. Internal event names are fixed: telemetry_event_rejected, telemetry_extra_fields_stripped, telemetry_queue_drop, telemetry_writer_degraded, telemetry_scheduler_degraded, and telemetry_emit_ignored.
5. status must be success, degraded, failed, or info.
6. source may be omitted, runtime, simulator, or contract_test. Omitted source becomes runtime; an explicit source is retained exactly.
7. duration_ms must be a finite number from 0 through 86400000. It is not rounded or converted to text.
8. error_code must match ^[a-z][a-z0-9_]{0,63}$. Raw exception messages, stack traces, and arbitrary punctuation are rejected. The internal error-code union above is stable and metadata-only; module producers must map their own failures to similarly stable codes before emit.
9. session_id and scene_id must be non-empty safe identifiers of at most 128 characters using A–Z, a–z, 0–9, period, underscore, colon, or hyphen.
10. reason is optional, at most 1024 characters, and must match the delimiter-safe metadata grammar ^[A-Za-z0-9_=;.%:+,/?-]+$. This prevents spaces, quotes, control characters, newlines, raw errors, and ordinary private content. Wake phrases are encoded by formatWakeMetadata.
11. A non-object, array, invalid allow-listed field, invalid source, invalid time result, or invalid reason rejects the event without throwing. The rejection counter increments and a direct RAM-only telemetry_event_rejected event uses reason cause=validation_failed;field=<safe-field-name> and error_code telemetry_event_invalid.
12. If unknown keys are present but the allow-listed core is valid, the event is accepted after copying only the allow-listed values. extraFieldStrippedCount increments and one direct RAM-only telemetry_extra_fields_stripped event records only field_count=<number>. It never records the unknown names or values.
13. Construct normalized objects from selected fields. Never JSON.stringify the input object, an unknown value, or a caught exception. This is the sensitive-sentinel boundary.
14. Use the injected clock for time. It must return a valid ISO-8601 string; if it throws or returns an invalid value, use a safe current ISO timestamp and record only the stable validation/fallback reason in RAM. Never include the clock exception.

### RAM ring and pagination

- Assign a private monotonically increasing sequence beginning at 1 to every accepted or internal event. The sequence never appears in MirrorEvent or JSONL.
- Store a fresh normalized object in the RAM ring before queueing. When the ring exceeds 2,000, evict exactly the oldest sequence and increment ramEvictedCount. RAM eviction does not increment telemetryDroppedCount because the queue-drop counter measures writer-queue loss.
- readPage is synchronous and never throws. It filters by optional module, status, and source; applies beforeSequence as an exclusive sequence boundary; clamps a finite integer limit to 1–200 and uses 50 when absent or invalid; and returns newest matching events first.
- Each returned event is a fresh object. nextBeforeSequence is the sequence of the oldest returned matching event when an older matching event remains in the ring, otherwise null. A stale cursor returns the remaining older matching events without duplicate or skipped entries. A sequence gap caused by eviction is expected.
- getStats returns fresh metadata-only counters and current ring/queue sizes. No event payload is returned by getStats.

### Synchronous producer, queue, and drain behavior

- emit returns void synchronously. It normalizes and appends to RAM synchronously, enqueues the serialized record if valid, requests at most one scheduled drain while a drain is pending, and never awaits a file promise.
- The queue is FIFO and capped at 1,000. When adding the 1,001st item, remove the oldest queued item, increment telemetryDroppedCount exactly once, and direct-record telemetry_queue_drop with status degraded, source runtime, error_code telemetry_queue_full, and reason cause=queue_full;dropped=oldest;queue_limit=1000. This diagnostic is not queued.
- The injected scheduler receives one Promise-returning drain callback for a non-empty queue. Scheduler calls are wrapped; if scheduling throws, increment schedulerFailureCount, count all queued items as dropped, clear the queue, direct-record telemetry_scheduler_degraded with error_code telemetry_scheduler_failed and reason cause=scheduler_failure;dropped_count=<count>, and return from emit without throwing.
- A drain initializes the supplied directory, then processes queued lines oldest first. New events emitted while an awaited file operation is pending remain FIFO after the current item.
- On a line write or rotation failure, do not expose the caught error. Increment writerFailureCount for a write failure or rotationFailureCount for a rotation failure; increment telemetryDroppedCount for the failed item and every remaining queued item; clear the queue; direct-record one telemetry_writer_degraded event with the matching stable error code and reason cause=writer_failure;dropped_count=<count> or cause=rotation_failure;dropped_count=<count>; resolve drain/flush.
- No internal diagnostic calls emit, schedules, or queues another event. It only appends a trusted normalized record to RAM and updates counters. If RAM is at capacity, the normal oldest-ring eviction rule applies.
- An event whose serialized UTF-8 line exceeds maxFileBytes is not written. Increment telemetryDroppedCount, direct-record telemetry_writer_degraded with error_code telemetry_event_too_large and reason cause=line_too_large;dropped_count=1, and continue without rotation.

### JSONL serialization and rotation

- Serialize a fresh object in this exact insertion order: time, module, event, status, duration_ms when defined, error_code when defined, session_id when defined, scene_id when defined, reason when defined, source when defined. Omit undefined optional fields; never emit null placeholders.
- The line is JSON.stringify(normalizedEvent) plus exactly one LF character. It has no indentation, no CRLF conversion, no trailing spaces, and no second record on the line. Measure Buffer.byteLength(line, 'utf8').
- The default file prefix is telemetry. The active path is directory/telemetry-0.jsonl. Suffix 0 is newest/current; suffix 1 is the immediately older file; suffix 4 is the oldest retained file.
- Before appending, query the active file size. If the file exists and current bytes plus the new line bytes would exceed 5,242,880, rotate first. A line exactly filling the remaining bytes is accepted; the next non-empty line rotates.
- Rotation removes directory/telemetry-4.jsonl if present, renames 3 to 4, 2 to 3, 1 to 2, and 0 to 1 in descending order, then appends the new line to 0. Missing files are skipped. The result has at most 5 files with this naming/order.
- If any remove or rename fails, classify it as rotation failure, do not append the line, apply the bounded failure behavior, and leave the failure visible in RAM/counters. The module does not retry a failed rotation within the same drain.
- File operations are injected for tests and default to Node fs/promises built-ins. No external writer, log framework, remote endpoint, or SQLite call is allowed.

### flush and close

- flush returns a Promise that resolves only after the queue is empty and all current drain work has settled. It calls the internal drain directly so deterministic tests do not depend on a microtask scheduler. A writer or rotation failure is a visible degraded result but does not reject flush.
- close is idempotent. It marks the sink closed before flushing, drains the already-queued batch, and resolves after the queue is empty. It does not delete files or alter retained rotation files.
- emit after close increments telemetryDroppedCount, direct-records telemetry_emit_ignored with status info, source runtime, error_code telemetry_closed, and reason cause=closed, then returns. It never queues or throws.

### Wake metadata

formatWakeMetadata accepts the exact WakeTelemetryMetadata shape and returns a deterministic reason string:

~~~text
keyword=<encodeURIComponent(keyword)>;configured_threshold=<number>;boost=<number>;num_trailing_blanks=<integer>
~~~

It validates non-empty keyword, finite threshold and boost, and non-negative integer trailing blanks. A wake producer uses it as:

~~~ts
telemetry.emit({
  module: 'wake',
  event: 'wake_detected',
  status: 'success',
  source: 'runtime',
  reason: formatWakeMetadata({
    keyword: configuredWakePhrase,
    configured_threshold: configuredThreshold,
    boost: configuredBoost,
    num_trailing_blanks: configuredTrailingBlanks
  })
})
~~~

The reason must contain the configured keyword representation and all three configured numeric keys. It must not contain confidence, score, probability, or an event-level confidence substitute. Task 4 does not read wake configuration, detect audio, tune a model, or create a keyword artifact.

## TDD execution tasks

### Task 1: Write the telemetry RED contract

**Files:**

- Create: tests/unit/telemetry.test.ts
- Read: src/shared/types.ts, src/main/lifecycle.ts, src/main/config-service.ts, src/main/credential-store.ts
- Do not create or modify: src/main/telemetry.ts during this test-only unit

**Interfaces:**

- Consumes: the public contract in this plan and the existing Omit<MirrorEvent, 'time'> shape.
- Produces: a deterministic test harness that the production implementer must satisfy without changing the named signatures.

- [ ] **Step 1: Create the injected harness before writing assertions**

Use synthetic metadata-only values and a fake file system. The scheduler stores Promise-returning drain callbacks instead of running them automatically; the fake file system stores strings by path, tracks append/rename/remove order, returns null for missing files, and exposes independent failure switches. The clock returns fixed ISO strings.

~~~ts
const FIXED_TIME = '2026-08-19T00:00:00.000Z'
const RAW_ERROR_SENTINEL = 'synthetic-raw-error-sentinel'
const TRANSCRIPT_SENTINEL = 'synthetic-transcript-sentinel'

const scheduled: Array<() => Promise<void>> = []
const scheduler: TelemetryDrainScheduler = {
  schedule: (drain) => { scheduled.push(drain) }
}

const harness = makeFileHarness()
const telemetry = createTelemetry({
  directory: 'synthetic-telemetry-directory',
  clock: () => FIXED_TIME,
  files: harness.files,
  scheduler
})
~~~

- [ ] **Step 2: Add RED assertions for accepted schema and exact serialization**

Cover fixed time, required fields, optional-field omission, exact Object.keys order, one LF, UTF-8 byte sizing, and no incoming time trust.

~~~ts
telemetry.emit({
  module: 'app',
  event: 'synthetic_event',
  status: 'success',
  duration_ms: 12,
  reason: 'cause=synthetic',
  source: 'runtime'
})

expect(telemetry.readPage().events[0]).toEqual({
  time: FIXED_TIME,
  module: 'app',
  event: 'synthetic_event',
  status: 'success',
  duration_ms: 12,
  reason: 'cause=synthetic',
  source: 'runtime'
})
~~~

- [ ] **Step 3: Add RED assertions for normalization, privacy, and source separation**

Use a cast-only input containing extra keys named transcript, audio, prompt, private_context, memory_value, image, frame, embedding, key, realtime_secret, and raw_error, each holding synthetic sentinel strings. Verify accepted output and file lines contain none of those keys or values; verify extraFieldStrippedCount and the direct diagnostic. Add invalid module/status/event/duration/error_code/session_id/scene_id/reason cases and verify rejection without throw. Emit runtime, simulator, and contract_test records and verify source filters keep the three categories separate.

- [ ] **Step 4: Add RED assertions for the 2,000-entry ring and pagination**

Emit 2,001 valid synthetic events, verify ramEventCount is 2,000 and only the newest 2,000 remain. Read pages of limit 2 with nextBeforeSequence, verify newest-first order, exclusive cursor behavior, no duplicate sequence, filter behavior, and safe clamping of invalid or oversized limits.

- [ ] **Step 5: Add RED assertions for the 1,000-entry queue and no-throw producer**

Keep the scheduler pending, emit 1,001 valid records, verify queueDepth is 1,000, telemetryDroppedCount is 1, the oldest producer record is absent from the queue harness, and telemetry_queue_drop is present in RAM with no recursive queue growth. Make append return a never-resolving Promise and measure that emit returns synchronously before the Promise settles.

- [ ] **Step 6: Add RED assertions for FIFO drain and JSONL newline behavior**

Run the scheduled callback manually, await it, and assert ensureDirectory and append calls occur in event order. Verify each append is one compact JSON object plus LF and that the writer receives no raw input object.

- [ ] **Step 7: Add RED assertions for exact rotation**

Compute the serialized UTF-8 byte length `L` of the actual valid test line with `Buffer.byteLength(line, 'utf8')`. Seed `telemetry-0.jsonl` at `maxFileBytes - L`, append that same line, and verify the exact fit does not rotate. Reset the harness, seed the active file at `maxFileBytes - L + 1`, append the same line, and verify the one-byte overflow removes index 4 then renames 3, 2, 1, and 0 in descending order before writing index 0. Verify at most five files and newest-to-oldest suffix order without writing five real megabyte files; do not use a one-byte remainder for a multi-byte line.

- [ ] **Step 8: Add RED assertions for writer, rotation, scheduler, flush, and close failures**

Inject each failure separately. Verify no promise rejection escapes emit, flush, or close; counters increment exactly; queued items are bounded and cleared after the first drain failure; one stable direct RAM diagnostic appears; raw error sentinel is absent; close drains existing work, is idempotent, and post-close emit records telemetry_emit_ignored without queueing.

- [ ] **Step 9: Add RED assertions for wake metadata**

Call formatWakeMetadata with a synthetic configurable phrase and numeric threshold, boost, and trailing blank values. Assert the encoded keyword and all three exact keys are present, the output is reason-grammar safe, and the string contains no confidence, score, or probability key. Emit it through the wake event and verify it persists only in reason.

- [ ] **Step 10: Leave the test file self-contained and metadata-only**

Do not read .env, use real credentials, capture audio/images, use a real wake model, call a network, use a real external writer, add a dependency, or alter shared types. The RED file may reference src/main/telemetry.ts so the expected pre-implementation failure is explicit.

The test-only implementer returns the changed test path, concise test-contract summary, complete command output only if a tester supplied it, and unresolved risks. It does not run commands, edit production code, or perform Git operations.

### Task 2: Implement the smallest production sink

**Files:**

- Create: src/main/telemetry.ts
- Read: src/shared/types.ts and the RED test
- Do not modify: tests/unit/telemetry.test.ts, src/main/index.ts, src/main/lifecycle.ts, src/main/config-service.ts, src/main/credential-store.ts, package files, or Console/IPC files

**Interfaces:**

- Consumes: TelemetryOptions, TelemetryEventInput, MirrorEvent, injected file operations, injected clock, and injected scheduler.
- Produces: createTelemetry, Telemetry, TelemetryStats, TelemetryPage, formatWakeMetadata, exact constants, and stable internal diagnostics defined above.

- [ ] **Step 1: Add constants, adapter defaults, and option validation**

Implement TELEMETRY_DEFAULTS exactly. Use node:fs/promises mkdir, stat, appendFile, rename, and unlink in the default adapter; map ENOENT from size/remove to null/no-op. Validate a safe non-empty directory and filePrefix pattern without exposing path details in telemetry.

- [ ] **Step 2: Implement normalization before any queue or file operation**

Copy only the exact allow-listed keys, reject invalid allow-listed values using stable field names, default omitted source to runtime, take time from the injected clock, and count/diagnose stripped keys without reading their values. Build JSON only from the normalized object. Keep all caught exceptions private.

~~~ts
function recordInternal(
  event: 'telemetry_event_rejected' | 'telemetry_extra_fields_stripped' | 'telemetry_queue_drop' | 'telemetry_writer_degraded' | 'telemetry_scheduler_degraded' | 'telemetry_emit_ignored',
  status: MirrorEvent['status'],
  reason: string,
  errorCode?: TelemetryInternalErrorCode
): void {
  // Direct ring append and counter update only; never call emit or schedule.
}
~~~

- [ ] **Step 3: Implement the ring, private sequence, page filters, and stats**

Store normalized records with private sequence metadata, evict oldest over 2,000, return cloned newest-first pages with exclusive cursors, and expose only metadata counters/sizes from getStats. Do not expose sequence in MirrorEvent or persisted JSON.

- [ ] **Step 4: Implement FIFO queueing and one scheduled drain**

Append accepted serialized lines to a 1,000-entry FIFO, drop oldest at overflow, and schedule at most one drain. Wrap scheduler calls and all asynchronous drain failures; apply the exact direct-diagnostic and counter rules. Ensure emit returns before any file Promise settles.

- [ ] **Step 5: Implement deterministic JSONL serialization and rotation**

Use exact field insertion order, compact JSON.stringify, one LF, Buffer.byteLength, active suffix 0, descending suffix rename, oldest removal, and the exact 5,242,880-byte / five-file bounds. Separate write and rotation error classification without serializing the caught error.

- [ ] **Step 6: Implement flush, close, and wake metadata formatting**

Make flush directly drain until empty and resolve after bounded failures; make close idempotent and post-close emit safe; implement URL-encoded keyword plus the three configured wake metadata keys and no confidence field.

- [ ] **Step 7: Preserve the application boundary**

Do not import Electron app, open IPC, change boot markers, call SQLite, read config, inspect credentials, access .env, implement wake detection, or add external observability. The only source write is src/main/telemetry.ts.

- [ ] **Step 8: Read the own source and RED test before handoff**

Check that every public signature matches Task 1, every internal diagnostic bypasses emit, every failure path has a stable reason and counter, and no sensitive sentinel can be copied through normalization. The production implementer self-reviews at most three passes and returns exact changed files, diff summary, command outputs if any, and risks.

### Task 3: Tester-owned checkpoint verification

**Files:**

- RED tester — Read: `tests/unit/telemetry.test.ts`; verify that `src/main/telemetry.ts` is absent at this checkpoint. Write: none; this tester is fully read-only.
- GREEN/regression tester — Read: `tests/unit/telemetry.test.ts` and `src/main/telemetry.ts`. Write: only ignored generated build output under `out/` when `npm run build` is included; no tracked files or other writes.
- Merged-main tester — Read: `tests/unit/telemetry.test.ts` and `src/main/telemetry.ts` after integration. Write: only ignored generated build output under `out/` when `npm run build` is included; no tracked files or other writes.

**Interfaces:**

- Consumes: the test-only RED contract, the production implementation, the exact checkpoint commands below, and the merged `main` state for the final regression gate.
- Produces: complete stdout/stderr and exit code for every named command at each checkpoint, counts/statuses, and unresolved risks using metadata-only evidence.
- Sequencing: the RED tester is one fresh worker dispatched after Task 1 and runs only the missing-module command. After root accepts that RED evidence and Task 2 returns, root dispatches a different fresh GREEN/regression tester for the focused and full gates. Neither tester crosses the other checkpoint.

- [ ] **Step 1: Dispatch one fresh RED tester after the test-only worker**

The interactive root dispatches exactly one fresh RED tester after Task 1. It runs only:

~~~text
npx vitest run tests/unit/telemetry.test.ts
~~~

Expected: non-zero because `src/main/telemetry.ts` is not yet present. The tester returns complete stdout/stderr and the exit code even if the command is unavailable or fails differently; it does not summarize away a failure, run any other command, or write any file. Root must accept this RED evidence before dispatching the production implementer.

- [ ] **Step 2: Dispatch a different fresh GREEN/regression tester after production**

After Task 2 returns and root accepts its bounded diff, the interactive root dispatches a different fresh GREEN/regression tester. It runs these commands in order:

~~~text
npx vitest run tests/unit/telemetry.test.ts
npm test
npm run typecheck
npm run build
~~~

Expected: every command exits 0; the focused test passes, the full suite passes, typecheck succeeds for both Node and web projects, and the Electron Vite build produces main, preload, and renderer bundles. The tester returns complete stdout/stderr and the exit code for every command, including unavailable or failed commands. The build may write only ignored generated output under `out/`; no tracked file or other path may be written. Do not treat the existing unrelated Node DEP0190 warning as a Task 4 failure unless the exit status or behavior changes.

- [ ] **Step 3: Perform metadata-only verification at the GREEN checkpoint**

Confirm the two application files are the only Task 4 implementation paths, no new dependency or source model literal was added, no forbidden payload can appear in serialized output, and no index/IPC/Console wiring was introduced. Do not read `.env` or `scripts/install-node-lts.ps1`, run Git commands, or write private/user content to the evidence. The GREEN tester remains limited to ignored generated `out/` build output when the named build command produces it.

- [ ] **Step 4: Dispatch a fresh merged-main tester after integration**

After the interactive root switches to `main` and fast-forward merges `phase0-telemetry`, it dispatches a fresh merged-main tester (a new worker, not either checkpoint tester). That tester runs exactly:

~~~text
npm test
npm run typecheck
npm run build
~~~

It returns complete stdout/stderr and the exit code for all three commands, including unavailable or failed commands. It may write only ignored generated output under `out/` for `npm run build`; it writes no tracked file or other path. Root accepts this evidence before pushing `main`.

## Exact command schedule and ownership

The current documentation worker runs none of these commands. The tester role owns every execution, with one fresh worker per checkpoint:

| Gate | Exact command | Owner / sequence | Expected result |
|---|---|---|---|
| RED | npx vitest run tests/unit/telemetry.test.ts | one fresh RED tester after Task 1 | Non-zero because src/main/telemetry.ts is not yet present; complete output and exit code returned. |
| Focused GREEN | npx vitest run tests/unit/telemetry.test.ts | a different fresh GREEN/regression tester after Task 2 | Exit 0; complete output and exit code returned. |
| Full test | npm test | that GREEN/regression tester, after focused GREEN | Exit 0; complete output and exit code returned. |
| Typecheck | npm run typecheck | that GREEN/regression tester, after full test | Exit 0 for Node and web; complete output and exit code returned. |
| Build | npm run build | that GREEN/regression tester, after typecheck | Exit 0 for Electron main/preload/renderer; complete output and exit code returned; ignored `out/` output only. |
| Merged-main full test | npm test | one fresh merged-main tester after fast-forward merge | Exit 0; complete output and exit code returned. |
| Merged-main typecheck | npm run typecheck | that merged-main tester, after merged-main full test | Exit 0 for Node and web; complete output and exit code returned. |
| Merged-main build | npm run build | that merged-main tester, after merged-main typecheck | Exit 0 for Electron main/preload/renderer; complete output and exit code returned; ignored `out/` output only. |

The test-only and production implementers do not execute these commands. The RED tester does not run the GREEN/regression commands, and the GREEN/regression tester does not run the RED checkpoint. No worker executes Git commands. A command that is unavailable is still reported with its complete output and exit code.

## Requirements-to-test matrix

| Requirement | Test evidence |
|---|---|
| Existing synchronous emit seam | accepted-schema test calls emit and observes immediate RAM state before any scheduler callback |
| Exact persisted field set and order | exact Object.keys and JSONL line assertion |
| Time owned by Telemetry | incoming time is ignored; injected clock value is persisted |
| Runtime module/status/source allow-lists | valid enum cases pass; invalid values reject; source filters separate runtime/simulator/contract_test |
| Event, ID, duration, error, and reason validation | table-driven invalid metadata cases produce stable rejection diagnostics and no throw |
| Arbitrary extra stripping | cast-only unknown keys are absent from RAM and JSONL; counter and direct diagnostic increment |
| Sensitive sentinel exclusion | transcript/audio/prompt/private context/memory/image/frame/embedding/key/secret/raw-error sentinels never occur in output |
| RAM cap 2,000 | 2,001 emits retain exactly the newest 2,000 and increment ramEvictedCount |
| RAM pagination | newest-first pages, exclusive cursor, filters, clamping, and eviction gaps |
| Queue cap 1,000 | 1,001 pending emits drop exactly the oldest queue item and increment telemetryDroppedCount exactly once |
| No-throw/non-blocking producer | pending writer and failing scheduler tests show emit returns synchronously and never rejects |
| FIFO drain order | scheduled callback appends lines in original queue order |
| JSONL newline | compact UTF-8 JSON plus exactly one LF per line |
| 5 MB file limit | byte-boundary harness accepts a fitting line and rotates a non-fitting line at 5,242,880 bytes |
| Five-file rotation | suffix 4 removal and descending 3→4, 2→3, 1→2, 0→1 order; no sixth file |
| Writer and rotation failures | stable direct RAM diagnostic, exact failure counter, bounded queue clear, no raw error |
| Flush and close | flush settles after queue drain or bounded failure; close is idempotent and post-close emit is visible but not queued |
| Internal recursive-failure protection | diagnostics do not schedule, enqueue, or cause an unbounded counter/event cascade |
| Wake rule | encoded configurable keyword, configured_threshold, boost, and num_trailing_blanks appear in reason; confidence/score/probability does not |
| No external stack | package and dependency scope remains unchanged; source imports only Node built-ins/shared types |
| Task 4 boundary | no index, lifecycle, IPC, preload, renderer, Console, SQLite, credential, or wake detector change |

## Dispatch envelopes

Each envelope is copied into a fresh profile-backed worker invocation by the interactive root. Every envelope repeats the complete invariant checklist so a worker does not infer a weaker privacy or failure boundary.

The writing-plans skill is planning-time only; it is not an implementation or test execution-envelope skill.

### Envelope A — test-only implementer

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI implementer described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: Write the bounded RED contract for Application Task 4 in tests/unit/telemetry.test.ts only. Implement the injected clock/file/scheduler harness and every named metadata-only, cap, pagination, queue, drain, rotation, failure, flush/close, source-separation, and wake-metadata assertion from the plan. Explicit non-goals: do not create src/main/telemetry.ts; do not modify shared types, index/lifecycle, Task 3 modules, package/config files, IPC, preload, renderer, Console, SQLite, wake detection, credentials, .env, installer scripts, product docs, skill sources, or any other path; do not run tests/build/typecheck; do not stage/commit/push or dispatch a child.
write_scope: exactly tests/unit/telemetry.test.ts; read-only all other paths
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/test-driven-development/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 8, 9, 10, 11, 12
evidence: exact changed files, concise diff summary, complete stdout/stderr and exit code for every command actually run, unresolved risks; metadata-only, no secrets or user content
self_review: read the own diff/output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review

complete invariant checklist:
1. Final transcripts, conversation audio, extracted memory values, and injected private context remain RAM-only; diagnostics contain metadata.
2. Face recognition proposes a candidate; private memory follows explicit verbal confirmation.
3. Guest and candidate profile IDs remain in Electron Main and never cross renderer/model tool boundaries.
4. A profile change closes the old session and confirms in a clean Persona+Master-only session before updating the agent.
5. Extraction writes to the owner snapshot taken at turn start.
6. Identity, naming, switching, group, sleep, and spell control turns skip extraction.
7. A scene requires normalized exact full-transcript spell matching and one trigger per turn; approved presets alone control hardware.
8. Exactly one microphone owner exists at a time, with explicit release-then-acquire handoff.
9. Every ignore, drop, fallback, or degrade is visitor-visible or a metadata-only Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Model IDs come only from versioned configuration; a failed configured ID never silently substitutes another ID.
12. Credentials are read by Main through safeStorage; keys never enter renderer data, logs, telemetry, or exports.
~~~

### Envelope B — production implementer

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "implementer"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI implementer described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: Implement the bounded Main-only metadata telemetry contract in src/main/telemetry.ts, after the RED test exists. Implement exact normalization, 2,000 RAM ring, 1,000 FIFO queue, non-blocking no-throw emit, direct non-recursive diagnostics, exact JSONL field order/newline, 5,242,880-byte and five-file rotation, source preservation, deterministic pagination, flush/close, and wake metadata formatting. Explicit non-goals: do not modify tests/unit/telemetry.test.ts after the RED handoff; do not modify shared types, index/lifecycle, Task 3 modules, package/config files, IPC, preload, renderer, Console, SQLite, wake detection, credentials, .env, installer scripts, product docs, skill sources, or any other path; do not add dependencies; do not run tests/build/typecheck; do not stage/commit/push or dispatch a child.
write_scope: exactly src/main/telemetry.ts; read-only all other paths
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/test-driven-development/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 8, 9, 10, 11, 12
evidence: exact changed files, concise diff summary, complete stdout/stderr and exit code for every command actually run, unresolved risks; metadata-only, no secrets or user content
self_review: read the own diff/output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review

complete invariant checklist:
1. Final transcripts, conversation audio, extracted memory values, and injected private context remain RAM-only; diagnostics contain metadata.
2. Face recognition proposes a candidate; private memory follows explicit verbal confirmation.
3. Guest and candidate profile IDs remain in Electron Main and never cross renderer/model tool boundaries.
4. A profile change closes the old session and confirms in a clean Persona+Master-only session before updating the agent.
5. Extraction writes to the owner snapshot taken at turn start.
6. Identity, naming, switching, group, sleep, and spell control turns skip extraction.
7. A scene requires normalized exact full-transcript spell matching and one trigger per turn; approved presets alone control hardware.
8. Exactly one microphone owner exists at a time, with explicit release-then-acquire handoff.
9. Every ignore, drop, fallback, or degrade is visitor-visible or a metadata-only Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Model IDs come only from versioned configuration; a failed configured ID never silently substitutes another ID.
12. Credentials are read by Main through safeStorage; keys never enter renderer data, logs, telemetry, or exports.
~~~

### Envelope C — RED tester

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "tester"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI tester described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: After the test-only worker returns and before the production implementer is dispatched, run only npx vitest run tests/unit/telemetry.test.ts as the RED checkpoint. Expect a non-zero missing-module failure because src/main/telemetry.ts is absent. Explicit non-goals: do not run any other command; do not modify application or test source; do not add dependencies; do not read .env or scripts/install-node-lts.ps1; do not stage/commit/push/merge; do not dispatch a child; do not hide unavailable or failed output; do not inspect or record secrets/user content.
write_scope: read-only; no files may be written
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/verification-before-completion/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 8, 9, 10, 11, 12
evidence: exact files inspected, concise result summary, complete stdout/stderr and exit code for the only named command, including unavailable/failed output, unresolved risks; metadata-only, no secrets or user content
self_review: read the own output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review

complete invariant checklist:
1. Final transcripts, conversation audio, extracted memory values, and injected private context remain RAM-only; diagnostics contain metadata.
2. Face recognition proposes a candidate; private memory follows explicit verbal confirmation.
3. Guest and candidate profile IDs remain in Electron Main and never cross renderer/model tool boundaries.
4. A profile change closes the old session and confirms in a clean Persona+Master-only session before updating the agent.
5. Extraction writes to the owner snapshot taken at turn start.
6. Identity, naming, switching, group, sleep, and spell control turns skip extraction.
7. A scene requires normalized exact full-transcript spell matching and one trigger per turn; approved presets alone control hardware.
8. Exactly one microphone owner exists at a time, with explicit release-then-acquire handoff.
9. Every ignore, drop, fallback, or degrade is visitor-visible or a metadata-only Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Model IDs come only from versioned configuration; a failed configured ID never silently substitutes another ID.
12. Credentials are read by Main through safeStorage; keys never enter renderer data, logs, telemetry, or exports.
~~~

### Envelope D — GREEN/regression tester

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "tester"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI tester described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: After root accepts the RED evidence and the production implementer returns, act as a different fresh GREEN/regression tester. Run exactly, in order, npx vitest run tests/unit/telemetry.test.ts, npm test, npm run typecheck, and npm run build. Explicit non-goals: do not rerun or replace the RED checkpoint; do not modify application or test source; do not add dependencies; do not read .env or scripts/install-node-lts.ps1; do not stage/commit/push/merge; do not dispatch a child; do not hide unavailable or failed output; do not inspect or record secrets/user content.
write_scope: read-only except ignored generated build output under out/ while npm run build executes; no tracked files or other writes
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/verification-before-completion/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 8, 9, 10, 11, 12
evidence: exact files inspected, concise result summary, complete stdout/stderr and exit code for every named command, including unavailable/failed output, unresolved risks; metadata-only, no secrets or user content
self_review: read the own output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review

complete invariant checklist:
1. Final transcripts, conversation audio, extracted memory values, and injected private context remain RAM-only; diagnostics contain metadata.
2. Face recognition proposes a candidate; private memory follows explicit verbal confirmation.
3. Guest and candidate profile IDs remain in Electron Main and never cross renderer/model tool boundaries.
4. A profile change closes the old session and confirms in a clean Persona+Master-only session before updating the agent.
5. Extraction writes to the owner snapshot taken at turn start.
6. Identity, naming, switching, group, sleep, and spell control turns skip extraction.
7. A scene requires normalized exact full-transcript spell matching and one trigger per turn; approved presets alone control hardware.
8. Exactly one microphone owner exists at a time, with explicit release-then-acquire handoff.
9. Every ignore, drop, fallback, or degrade is visitor-visible or a metadata-only Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Model IDs come only from versioned configuration; a failed configured ID never silently substitutes another ID.
12. Credentials are read by Main through safeStorage; keys never enter renderer data, logs, telemetry, or exports.
~~~

### Envelope E — merged-main tester

~~~text
model: "gpt-5.6-luna"
reasoning_effort: "max"
role: "tester"
fresh_worker: true
ROLE LOCK: You are the fresh profile-backed CLI tester described by C:\Project\magic-mirror\AGENTS.md. You are not the interactive root. Execute directly. Never call codex, codex exec, spawn_agent, or dispatch any child.
task: After root switches to main and fast-forward merges phase0-telemetry, act as a fresh merged-main tester distinct from both checkpoint testers. Run exactly, in order, npm test, npm run typecheck, and npm run build. Explicit non-goals: do not run the focused or RED checkpoint; do not modify application or test source; do not add dependencies; do not read .env or scripts/install-node-lts.ps1; do not stage/commit/push/merge; do not dispatch a child; do not hide unavailable or failed output; do not inspect or record secrets/user content.
write_scope: read-only except ignored generated build output under out/ while npm run build executes; no tracked files or other writes
skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-electron-foundation/SKILL.md, C:/Users/b8901/.codex/plugins/cache/superpowers-dev/superpowers/6.3.0/skills/verification-before-completion/SKILL.md
self_invariants: 1-12, direct focus 1, 3, 8, 9, 10, 11, 12
evidence: exact files inspected, concise result summary, complete stdout/stderr and exit code for every named command, including unavailable/failed output, unresolved risks; metadata-only, no secrets or user content
self_review: read the own output; no more than 3 passes
root_review: external interactive-root gate after return; not part of self-review

complete invariant checklist:
1. Final transcripts, conversation audio, extracted memory values, and injected private context remain RAM-only; diagnostics contain metadata.
2. Face recognition proposes a candidate; private memory follows explicit verbal confirmation.
3. Guest and candidate profile IDs remain in Electron Main and never cross renderer/model tool boundaries.
4. A profile change closes the old session and confirms in a clean Persona+Master-only session before updating the agent.
5. Extraction writes to the owner snapshot taken at turn start.
6. Identity, naming, switching, group, sleep, and spell control turns skip extraction.
7. A scene requires normalized exact full-transcript spell matching and one trigger per turn; approved presets alone control hardware.
8. Exactly one microphone owner exists at a time, with explicit release-then-acquire handoff.
9. Every ignore, drop, fallback, or degrade is visitor-visible or a metadata-only Console event with a reason.
10. Failures degrade without gating conversation or unrelated adapters.
11. Model IDs come only from versioned configuration; a failed configured ID never silently substitutes another ID.
12. Credentials are read by Main through safeStorage; keys never enter renderer data, logs, telemetry, or exports.
~~~

## Root external-review checklist

The interactive root accepts Task 4 only after the following external review, separate from each worker's maximum three self-review passes:

- Confirm the diff contains exactly tests/unit/telemetry.test.ts and src/main/telemetry.ts for application implementation, with no index/IPC/Console/SQLite/package/config/source-model changes.
- Confirm the RED test was observed failing for the missing production module, the focused GREEN test is complete, and full test/typecheck/build outputs include exit codes.
- Confirm all public names/signatures match this plan and the existing synchronous emit seam.
- Confirm field allow-list construction never copies arbitrary values; exact field order, optional omission, UTF-8 byte accounting, LF newline, file suffix order, and caps are test-backed.
- Confirm queue oldest-drop increments telemetryDroppedCount, writer/rotation/scheduler failures clear only bounded work, and internal diagnostics never call emit or enqueue.
- Confirm all ignore/drop/degrade/failure paths have a safe reason and stable error code, with no raw exception message or stack.
- Confirm RAM pagination is bounded, deterministic, source-filterable, and does not expose its private sequence.
- Confirm wake metadata contains configurable keyword, configured_threshold, boost, and num_trailing_blanks and contains no confidence-like field.
- Confirm no transcript, audio, prompt/private context, memory value, image/frame, embedding, key, Realtime secret, or user-content sentinel can reach RAM JSONL or evidence.
- Confirm invariant IDs 1–12 were checked, with direct focus on 1, 3, 8, 9, 10, 11, and 12.
- Confirm Windows-only evidence does not claim macOS Keychain/TCC/signing/entitlement field verification and the existing unrelated Node DEP0190 warning is not silently erased.
- Confirm no Task 5 SQLite behavior or Task 4 boot/Console wiring has been pulled forward.

## Privacy and scope review

- Data allowed in an accepted event is metadata only: fixed enums, safe IDs, durations, stable error codes, encoded wake settings, source, and bounded reasons.
- Sensitive extras are removed before normalization output is built; rejection and stripping diagnostics report only a safe field category/count, never the unknown key or value.
- Writer failures report operation category and dropped count only. They never call String(error), serialize the exception, expose file contents, or include a path in an event.
- Synthetic test values are artificial metadata/sentinel values only. Tests do not use real names, transcripts, audio, images, embeddings, credentials, prompts, private memory, or network responses.
- The task does not read .env. Process records may retain only the supplied metadata boundary: local presence was recorded, content/value was not accessed or validated, and long-lived credentials remain Main plus safeStorage.
- scripts/install-node-lts.ps1 remains untracked user work and is not read or touched.
- The source write scope is exactly one test file followed by one Main module. The process-record update is separate documentation work and does not authorize application wiring.

## Exact intentional Git instructions

Workers must not execute these commands. After external root review accepts this documentation/process update, the root may stage exactly:

~~~text
git add -- AGENTS.md PROGRESS.md DECISIONS.md docs/superpowers/plans/2026-08-19-phase0-task4-telemetry.md
git commit -m "docs: plan Phase 0 Task 4 telemetry"
git push origin phase0-telemetry
~~~

After the Task 4 test and production workers pass root review and the tester gates, the root may stage exactly the two implementation paths:

~~~text
git add -- tests/unit/telemetry.test.ts src/main/telemetry.ts
git commit -m "feat: add bounded metadata-only telemetry"
git push origin phase0-telemetry
~~~

The root then performs the project’s normal sequential integration from phase0-telemetry into main. Before merged-main verification, the Git command block is:

~~~text
git switch main
git merge --ff-only phase0-telemetry
~~~

The root then dispatches Envelope E as the fresh merged-main tester. Only after root accepts its complete `npm test`, `npm run typecheck`, and `npm run build` evidence does the root push the integrated `main` tip:

~~~text
git push origin main
~~~

The root records the exact commit IDs, file counts, test/typecheck/build exit codes, warnings, and risks in process state. No worker stages, commits, pushes, merges, or claims a demo.

## Integration gate

Task 4 is accepted only when all of these are true:

1. Task 3’s verified pushed-main evidence remains intact: 0270686 plus correction/integration tip 835c92d, 7 test files / 92 tests passed, full Node plus web typecheck exit 0, and Electron Vite main/preload/renderer build exit 0.
2. The two Task 4 implementation files pass the focused GREEN test, full npm test, npm run typecheck, and npm run build tester gates with complete output.
3. Root review accepts scope, privacy, source separation, cap behavior, failure paths, and invariant checklist 1–12.
4. The exact Task 4 implementation commit is intentionally pushed on phase0-telemetry and then fast-forward integrated to main by root.
5. A fresh merged-main tester repeats the relevant full gates and records actual counts/statuses; root accepts that evidence before pushing main, and no Phase 0 demo is claimed solely from unit tests.
6. PROGRESS.md records Task 4 as accepted only after those gates. Until then, Task 4 remains current and implementation status is not started or accepted according to the evidence actually available.

## Task 5 handoff

After Task 4 is integrated, Task 5 remains the next sequential application task. It may consume the Telemetry interface for metadata-only SQLite health/open/migration events, but it must not move telemetry events into SQLite, expand the persisted event schema, bypass the Main-owned sink, or alter the 2,000 RAM / 1,000 queue / 5-file JSONL contract. Task 5 owns node:sqlite initialization and migrations only; Task 4 owns no database path, schema, backup, or migration behavior.

Plan complete
