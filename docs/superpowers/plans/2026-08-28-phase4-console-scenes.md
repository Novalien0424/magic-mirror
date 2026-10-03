# Phase 4 Console-Managed Scenes Implementation Plan

**Goal:** Deliver Console-managed spells, reusable typed actions, and duration-driven scenes that safely coordinate Realtime dialogue, Live2D animation, local music, and mock physical effects.

**Architecture:** Completed transcripts are normalized and matched exactly in the Mirror renderer so transcript text never crosses IPC. Electron Main owns the published scene catalog, cooldown/dedupe, fixed-duration stage scheduler, media assets, and physical adapters. Stage feedback is observational: every stage advances when `durationMs` expires, while adapter acknowledgements/completions update diagnostics and never create a hidden workflow dependency.

**Boundary:** Phase 4 supports a small ordered timeline, not branching or arbitrary automation. Lighting and fog use approved typed presets with mock transports until hardware exists. Physical-device proof is deferred to Phase 7; mock success, failure, and timeout behavior must pass now.

## Task 1: Align product, technical, implementation, and UI/UX specifications

**Files:**
- Modify: `docs/Magic_Mirror_PRD_v0.3.md`
- Modify: `docs/Magic_Mirror_Tech_Spec_v0.3.md`
- Modify: `docs/Magic_Mirror_Implementation_Plan_v0.3.md`
- Create: `docs/Magic_Mirror_Phase4_UIUX_Design_v0.3.md`

Define the same spell/action/stage/scene model, fixed-duration advancement, feedback semantics, verbatim-dialogue trust boundary, Cubism 2D terms, music lifecycle, publish safety, and hardware-deferred acceptance in all four documents. Verify with targeted cross-document searches and `git diff --check`.

## Task 2: Add the typed Phase 4 configuration and safe publication boundary

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/console-types.ts`
- Modify: `src/main/config-service.ts`
- Modify: `resources/config/default.json`
- Test: `tests/main/config-service.test.ts`

Write failing schema/migration/publication tests first. Add reusable actions, spells, ordered stages, scene references, approved adapter presets, media metadata, and schema-version migration. Invalid links, unsupported parameters, empty phrases, and unsafe paths must fail without replacing active config.

## Task 3: Implement the fixed-duration scene runtime and mock adapters

**Files:**
- Create: `src/main/scenes/scene-runtime.ts`
- Create: `src/main/scenes/adapters.ts`
- Modify: `src/main/scenes/spell-trigger.ts`
- Test: `tests/main/scenes/scene-runtime.test.ts`
- Test: `tests/main/scenes/adapters.test.ts`

Write failing tests for once-per-turn, cooldown, same-stage parallel dispatch, exact duration advancement, observational feedback, timeout/failure isolation, stop-all, and result summaries. Use an injected clock so timing tests remain deterministic.

## Task 4: Wire privacy-safe IPC, Realtime dialogue, Cubism actions, and managed music

**Files:**
- Modify: `src/shared/bridge.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/boot.ts`
- Modify: `src/preload/mirror.ts`
- Modify: `src/preload/console.ts`
- Modify: `src/renderer/realtime/realtime-session-adapter.ts`
- Modify: `src/renderer/realtime/realtime-runtime-owner.ts`
- Modify: `src/renderer/avatar/cubism-avatar.ts`
- Modify: `src/renderer/mirror/App.tsx`
- Test: corresponding focused IPC, Realtime, runtime-owner, and avatar unit tests

Keep transcript text in renderer memory; send only matched spell/turn metadata to Main. Send authored dialogue to the active Realtime session with an explicit speak-verbatim instruction, accepting the documented best-effort limitation. Add one-shot Cubism motion-group and expression commands with started/completed feedback. Import supported audio through a native picker into managed storage and play it through the existing Web Audio graph.

## Task 5: Build the Console authoring and focused-test experience

**Files:**
- Modify: `src/renderer/console/App.tsx`
- Modify: `src/renderer/console/styles.css`
- Test: `tests/renderer/console-app.test.tsx`

Add a Scenes workspace for phrase/action/stage/scene CRUD, linking, reordering, duration editing, validation, media upload, preview, focused action tests, scene runs, and Draft/Test/Publish. Make incomplete links and unpublished changes visible, and expose mock/physical adapter capability plus recent results.

## Task 6: Add and run the Phase 4 harness

**Files:**
- Create or modify: `scripts/run-phase4-demos.mjs`
- Modify: `package.json`
- Modify: Phase-test persistence/types only as required to record Phase 4 evidence

Automate the 20-positive/30-negative corpus, duplicate/cooldown behavior, three mock scenes, fog timeout isolation, transcript-unavailable behavior, scene-duration evidence, and Console screenshots. Before any Electron run, verify the two canonical Windows Firewall rules point to the canonical Electron executable.

## Task 7: Real-output avatar/audio QA and final verification

Run focused tests, typecheck, build, full test suite, and the canonical Windows Electron harness. QA real Ren motion-group transitions with visual screenshots plus motion-start/motion-finished telemetry, and QA music through the actual Web Audio/analyser path. Record physical lighting/fog as deferred—not passed—and do not claim final-transcript evidence unless a real completed Realtime transcript was observed.
