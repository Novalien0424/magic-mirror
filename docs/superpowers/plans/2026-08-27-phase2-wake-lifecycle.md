# Phase 2 Wake Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local `魔鏡阿魔鏡` wake-to-Realtime activation, exclusive two-way
microphone handoff, idle/sleep return, offline wake, and truthful Console
evidence without accepting Phase 1 or Phase 2 prematurely.

**Architecture:** Preserve the existing Main lifecycle and renderer Realtime
owner. Add one Main-owned utility-process wake supervisor and a small
conversation activation coordinator; all cross-process messages are bounded
metadata and every microphone transition is release-then-acquire.

**Tech Stack:** Electron 43.4.1, TypeScript, React, XState v5, npm,
Porcupine 4.x and sherpa-onnx-node >=1.13.5 evaluation adapters, one selected
native capture backend, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-phase2-wake-lifecycle-overlap-design.md`

## Global Constraints

- Default configurable phrase is exactly `魔鏡阿魔鏡`.
- Invariants 1, 8, 9, 10, 11, and 12 apply.
- No audio/transcript/private content or credential persistence/output.
- No simultaneous microphone owners; handoff failure is Maintenance.
- No model substitution, duplicate Realtime controller, generic worker
  framework, automatic tuning, or multiple capture backends. Detector A/B is
  an explicit measured selection, never runtime fallback.
- Phase 1 and Phase 2 evidence stays separately attributable.

---

### Task 1: Freeze the Phase 1 candidate

**Files:**
- Modify: `src/main/boot.ts`
- Modify: `src/main/phase1-live-smoke.ts`
- Modify: `src/main/index.ts`
- Modify: `scripts/run-phase1-live-smoke.mjs`
- Test: `tests/unit/phase1-live-smoke.test.ts`
- Test: `tests/unit/phase1-live-smoke-runner.test.ts`
- Test: `tests/integration/realtime-contract.test.ts`

**Interfaces:**
- Produces: one pre-provider provenance result using user-data path and safe
  session snapshot identifiers; failure reason `config_provenance_mismatch`.

- [ ] Add a failing test proving mismatch makes zero probe/start calls.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Add the smallest Main-only provenance check; expose no new renderer IPC.
- [ ] Run focused tests, `npm run typecheck:node`, and
  `npm run test:phase1:live`.
- [ ] Commit the exact Phase 1 candidate before Phase 2 runtime files change.

### Task 2: Version replaceable Wake Model Packages

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/config-service.ts`
- Modify: `src/main/console-config.ts`
- Modify: `resources/config/default.json`
- Modify: `electron-builder.yml`
- Create: `src/main/wake/model-package.ts`
- Create: `scripts/fetch-wake-model.mjs`
- Create: `scripts/import-wake-model.mjs`
- Test: `tests/unit/config-service.test.ts`
- Test: `tests/unit/console-config-models.test.ts`
- Test: `tests/unit/offline-loop-packaging.test.ts`

**Interfaces:**
- Produces: validated `wake.phrase`, `modelVersion`, and model-package
  reference; immutable manifest with engine/platform/artifact hashes/tuning.

- [ ] Add failing migration/default/Draft validation tests using
  `魔鏡阿魔鏡`, package/phrase equality, platform, and hand-derived hashes.
- [ ] Run focused tests and confirm they fail for the missing fields.
- [ ] Implement the schema/default/migration and resource resolver changes.
- [ ] Recheck current Porcupine, sherpa, and capture package versions. Pin the
  two demanded detector candidates plus one capture path; neither candidate is
  an automatic fallback.
- [ ] Run focused tests and `npm run typecheck:node`.
- [ ] Commit configuration and resource support.

### Task 3: Implement detector adapters and the isolated worker

**Files:**
- Create: `src/main/wake/protocol.ts`
- Create: `src/main/wake/detector.ts`
- Create: `src/main/wake/porcupine-detector.ts`
- Create: `src/main/wake/sherpa-detector.ts`
- Create: `src/main/wake/worker.ts`
- Modify: `electron.vite.config.ts`
- Test: `tests/main/wake/protocol.test.ts`
- Test: `tests/main/wake/detector.test.ts`

**Interfaces:**
- Consumes: one validated Wake Model Package, an ephemeral engine credential
  when required, and resource paths.
- Produces: validated `initialize`, `acquire_microphone`,
  `release_microphone`, `update_config`, `shutdown` commands and `ready`,
  `microphone_acquired`, `microphone_released`, `wake_detected`, `failed`,
  `stopped` outcomes.

- [ ] Add failing protocol tests for malformed messages and bounded reasons.
- [ ] Add failing contract tests that run identical frames through either
  adapter, proving one bounded detection shape and no automatic fallback.
- [ ] Add a failing sherpa test proving detection resets its stream and emits
  no samples/transcript; add a Porcupine test proving exact frame sizing and
  explicit release.
- [ ] Run both files and confirm the expected failures.
- [ ] Implement protocol validation, the common detector contract, and both
  injected adapters. Only the configured package creates an engine.
- [ ] Add the worker build entry and one real capture adapter.
- [ ] Run focused tests, each engine's official known-WAV check when its
  credential/artifact is available, and node typecheck.
- [ ] Commit the worker boundary.

### Task 4: Supervise the worker and expose truthful status

**Files:**
- Create: `src/main/wake/supervisor.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/module-registry.ts`
- Test: `tests/main/wake/supervisor.test.ts`
- Test: `tests/unit/boot-ipc.test.ts`

**Interfaces:**
- Produces: `start`, `acquire`, `release`, `updateConfig`, `shutdown`, and a
  metadata-only status snapshot. Unexpected exit restarts once.

- [ ] Add failing tests for ready/acquire/release, duplicate detection, one
  restart, second failure, and invalid worker messages.
- [ ] Run focused tests and confirm the missing supervisor behavior fails.
- [ ] Implement one utility-process supervisor; sanitize every outcome.
- [ ] Project status into the existing wake module and Console snapshot.
- [ ] Run focused tests and node typecheck.
- [ ] Commit worker supervision.

### Task 5: Wire exclusive wake-to-Realtime handoff

**Files:**
- Create: `src/main/wake/conversation-activation.ts`
- Modify: `src/main/boot.ts`
- Modify: `src/shared/bridge.ts`
- Modify: `src/main/ipc.ts`
- Test: `tests/main/wake/conversation-activation.test.ts`
- Test: `tests/unit/boot-runtime.test.ts`
- Test: `tests/unit/boot-ipc.test.ts`

**Interfaces:**
- Consumes: wake supervisor acquire/release and existing renderer Realtime
  command dispatch.
- Produces: wake/manual activation and manual/idle/sleep stop with explicit
  handoff results.

- [ ] Add a failing ordered test: Waking -> worker release -> renderer start.
- [ ] Add a failing reverse test: renderer stop -> worker acquire -> Dormant.
- [ ] Add failing failure tests proving local handoff errors enter Maintenance.
- [ ] Run focused tests and confirm expected order/failure mismatches.
- [ ] Implement one coordinator and reuse it from manual and wake paths.
- [ ] Run focused tests and node/web typechecks.
- [ ] Commit exclusive handoff.

### Task 6: Add idle and exact spoken sleep

**Files:**
- Create: `src/renderer/realtime/sleep-command.ts`
- Modify: `src/renderer/realtime/turn-controller.ts`
- Modify: `src/renderer/realtime/realtime-runtime-owner.ts`
- Modify: `src/preload/mirror.ts`
- Modify: `src/shared/bridge.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/boot.ts`
- Test: `tests/unit/realtime-sleep-command.test.ts`
- Test: `tests/unit/realtime-playback-completion.test.ts`
- Test: `tests/unit/boot-runtime.test.ts`

**Interfaces:**
- Produces: payload-free sleep request after current actual playback and one
  Main-owned idle timer using production `idleSeconds` or Developer Mode 15/30.

- [ ] Add failing exact-normalization tests for `睡吧` and negative substrings.
- [ ] Add failing tests for playback-before-sleep, idle reset/cancel, and one
  timer only.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement RAM-only matching, payload-free IPC, and bounded timer wiring.
- [ ] Run focused tests and node/web typechecks.
- [ ] Commit idle and sleep behavior.

### Task 7: Add offline wake, Console controls, and phase evidence

**Files:**
- Modify: `src/main/boot.ts`
- Modify: `src/main/console-data.ts`
- Modify: `src/shared/console-types.ts`
- Modify: `src/preload/console.ts`
- Modify: `src/renderer/console/App.tsx`
- Modify: `src/renderer/console/styles.css`
- Test: `tests/unit/console-data.test.ts`
- Test: `tests/unit/console-ui.test.ts`
- Test: `tests/unit/console-ipc.test.ts`
- Test: `tests/integration/phase2-wake-lifecycle.test.ts`

**Interfaces:**
- Produces: offline wake -> OfflineLoop, worker/mic/timer/keyword cards,
  Simulate Wake, known-WAV test, and metadata-only P2 evidence recording.

- [ ] Add failing offline wake and Console projection/action tests.
- [ ] Run focused tests and confirm the new behavior is absent.
- [ ] Implement the smallest Console increment and reuse existing simulator and
  Phase Tests surfaces.
- [ ] Run focused tests and typechecks.
- [ ] Commit Phase 2 observability and deterministic demo support.

### Task 8: Select the highest-quality target-Mac package

**Files:**
- Create: `scripts/evaluate-wake-models.mjs`
- Create: `src/main/wake/corpus-evaluator.ts`
- Create: `tests/main/wake/corpus-evaluator.test.ts`
- Modify: `PROGRESS.md` with metadata-only aggregate results.

**Interfaces:**
- Consumes: versioned positive, hard-negative, background, and noise corpus
  entries; raw audio stays in the explicitly approved local corpus directory.
- Produces: per-package aggregate false-reject, false-accept, latency, CPU, and
  stability results with no audio or utterance content in diagnostics.

- [ ] Add failing evaluator tests using synthetic sample IDs and literal count/
  rate expectations.
- [ ] Implement one corpus runner that feeds identical PCM to both detector
  adapters and writes metadata-only aggregates.
- [ ] Train/import a `魔鏡阿魔鏡` macOS arm64 Porcupine package and compile the
  equivalent sherpa package.
- [ ] On the M4 run at least 100 positives across speakers/distances/noise, hard
  negatives including `魔鏡魔鏡` and `魔鏡啊魔鏡`, and two hours of approved
  background audio; keep the official 30-minute live ambient exit demo and
  Phase 7 eight-hour ambient run distinct.
- [ ] Tune each engine independently, compare at an equal false-accept target,
  select one package in Draft, and Publish only after its contract passes.
- [ ] If the Porcupine candidate is evaluated, keep its AccessKey out of config,
  renderer IPC, logs, telemetry, exports, and commits.
- [ ] Commit only package manifests/hashes and aggregate results; do not commit
  private corpus audio.

### Task 9: Build the engineering candidate and stop for human evidence

**Files:**
- Modify: `PROGRESS.md` with exact automated results only.
- Modify: `DECISIONS.md` only if implementation creates a durable ruling.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run package`.
- [ ] Run `npm run test:phase1:live` once.
- [ ] Run `git diff --check` and a metadata/privacy/model-source scan.
- [ ] Record Phase 2 as engineering candidate; leave P1-D1/D2/D5 and
  P2-D1..D5 real evidence pending/not-executed.
- [ ] Commit and push `phase2-wake-lifecycle`; create no phase tag.

### Human return: sequential evidence in one session

- [ ] Launch the exact Phase 1 candidate and run P1-D1 (20 turns), P1-D2 (10
  interruptions), and P1-D5 (Draft/Publish/snapshot/invalid Draft).
- [ ] If passed, record evidence, tag `phase1-v0.3.1`, push, and merge the
  accepted Phase 1 record into the Phase 2 branch.
- [ ] Launch the Phase 2 candidate and run 20 wake/talk/sleep cycles, offline
  wake, 30-second developer idle, exact `睡吧`, and mic-owner timeline.
- [ ] Run the 30-minute approved ambient/TV negative sample.
- [ ] Complete target-Mac TCC/signing/packaged-worker/LaunchAgent/power/boot/
  OfflineLoop checks before `phase2-v0.3.1`; otherwise record Mac pending.
