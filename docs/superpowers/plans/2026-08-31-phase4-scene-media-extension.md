# Phase 4 Scene Media Extension Implementation Plan

**Goal:** Add managed image/video stages, event-driven and bounded stage endings,
safe stop/replacement semantics, and Windows human-test readiness without
turning Scenes into a workflow engine.

**Architecture:** Electron Main owns the published catalog, active run, command
serialization, timers, and cleanup. Console Chromium performs the authoritative
import decode probe; Mirror Chromium owns live presentation and reports typed
observations carrying the existing run/stage/action lease. The existing Avatar
audio controller becomes the one shared background-audio bus for BGM and video
audio. Existing duration-only Scenes migrate without timing changes.

**Source design:**
`docs/superpowers/specs/2026-08-31-phase4-scene-media-extension-design.md`

**Constraints:** npm only; preserve unrelated dirty-worktree changes; do not
change runtime model IDs or dependencies; Windows evidence does not claim Mac or
physical Lighting/Fog readiness.

## Task 1: Persist the new catalog without breaking existing Scenes

**Tests first**

- Extend `tests/main/scenes/scene-config.test.ts` with every valid/invalid
  end-condition matrix row, one-visual-per-Stage, duplicate action IDs, visual
  asset references, muted gain, and uncertain audio-track behavior.
- Extend `tests/unit/config-service.test.ts` with a schema-v4 fixture proving
  `durationMs` becomes `{ kind: 'duration', durationMs }` in v5 while Active,
  Draft, and Previous remain atomic.
- Run:
  `npm test -- tests/main/scenes/scene-config.test.ts tests/unit/config-service.test.ts`
  and confirm the new assertions fail before implementation.

**Implementation**

- In `src/shared/types.ts`, add `ManagedVisualAsset`, `StageEndCondition`, the
  `visual` action variant, visual playback reports, start/status results, and
  `visualAssets` on `MirrorConfig`; replace Stage `durationMs` with
  `endCondition`.
- In `src/main/scenes/scene-config.ts`, add strict visual asset/action schemas
  and cross-reference/matrix validation. Keep warnings separate from hard Zod
  errors so unknown audio and intentional BGM overlap stay publishable.
- In `src/main/config-service.ts`, bump the schema to v5 and migrate only the
  Stage shape for v4; do not let a valid old catalog fall through the existing
  auxiliary-degrade-to-empty path.
- Thread `visualAssets` through `src/shared/console-types.ts`,
  `src/main/console-config.ts`, and `resources/config/default.json`.

**Proof**

- Re-run the two focused tests and `npm run typecheck:node`.

## Task 2: Import and serve visual assets through managed storage

**Tests first**

- Add `tests/main/scenes/visual-assets.test.ts` for allowlisted formats, 25/250
  MiB limits, empty/read/write failure, generated basename-only storage names,
  hash identity, pending cancellation, and finalize metadata bounds.
- Extend `tests/unit/boot-ipc.test.ts` and `tests/unit/security.test.ts` for
  Console-only import/finalize, exact-key payloads, pending-token expiry, and
  denial of paths/URLs and Mirror/unknown senders.
- Confirm the focused tests fail.

**Implementation**

- Add `src/main/scenes/visual-assets.ts`. Copy a selected file into an exact
  `.pending` location under user-data, return only an opaque token plus safe
  metadata, finalize by atomically moving it to a hash-derived name, and remove
  rejected/expired pending files. Never expose the source path.
- Extend `src/shared/bridge.ts`, `src/preload/console.ts`, `src/main/ipc.ts`, and
  `src/main/index.ts` with bounded import/finalize/cancel channels. The Console
  probes image dimensions or video metadata/first frame using Chromium, then
  submits finite validated metadata. Audio presence may remain `unknown`.
- Extend the existing `magic-mirror-media` protocol with separate pending and
  published visual hosts. Resolve only opaque tokens or published asset IDs;
  recompute the published file hash before playback and return a stable failure
  without leaking a filesystem path.
- Add `src/renderer/console/visual-asset-probe.ts` as the small DOM-media probe
  boundary, with deterministic unit tests for ready/decode/timeout cleanup.

**Proof**

- Run the three focused test files, `npm run typecheck:node`, and
  `npm run typecheck:web`.

## Task 3: Replace the global-stop runtime with one serialized active run

**Tests first**

- Rewrite/extend `tests/main/scenes/scene-runtime.test.ts` to prove immediate
  start acceptance, single active run, replacement cleanup-before-dispatch,
  Stop All as a queue barrier, stale event fencing, duration compatibility,
  video completion, bounded loops, and idempotent terminal cleanup.
- Cover image/video start, no-progress, once-video absolute timeout, duration
  mismatch, maximum runtime, per-category 3-second cleanup, failed handover
  isolation, and the independent 10-minute continuous-fog safety release
  without treating every Stage boundary as an implicit off action.
- Use injected clocks/deferred promises; do not use wall-clock sleeps.
- Confirm the new runtime tests fail.

**Implementation**

- Refactor `src/main/scenes/scene-runtime.ts` around one `activeRun`, one short
  asynchronous mutation queue, and per-run `AbortController`. A start returns
  after admission/initial dispatch; the run loop reports later status through
  an event sink instead of holding IPC open.
- Reuse `runId + sceneId + stageId + actionId` as the only event lease. Timers
  and feedback re-enter the mutation queue and must verify the lease before
  changing state.
- Track only four acquired categories: visual, music, lighting, and fog. Final
  Stage actions express authored fades/off; every terminal path independently
  invokes bounded system release. A timed-out replacement category is omitted
  from the next run while unrelated categories proceed.
- Keep exact spell once-per-turn/cooldown checks in the same serialized owner.

**Proof**

- Run `npm test -- tests/main/scenes/scene-runtime.test.ts` and node typecheck.

## Task 4: Make IPC completion event-driven and stop targeting race-safe

**Tests first**

- Extend `tests/unit/boot-ipc.test.ts` for immediate start DTOs, run-status
  delivery, visual reports, targeted stop, stale reports, renderer-gone cleanup,
  and metadata-only telemetry.
- Extend `tests/unit/realtime-session-adapter.test.ts` and
  `tests/unit/realtime-runtime-owner.test.ts` so a user input item ID is exposed
  at creation and paired with its completed transcription without persisting
  transcript text.
- Add focused tests around the Mirror transcript controller proving exact stop
  phrase, turn-start run snapshot, one consumption, stale stop, no spell double
  trigger, and `transcript_unavailable`.

**Implementation**

- Update `src/main/ipc.ts`, `src/shared/bridge.ts`, and `src/preload/mirror.ts`
  with exact DTO validation for visual observations, scene status, and targeted
  stop. Remove the current pending-action map as a competing run authority;
  route observations into `SceneRuntime`.
- Update `src/renderer/realtime/realtime-session-adapter.ts` and
  `src/renderer/realtime/realtime-runtime-owner.ts` to expose a RAM-only input
  item/turn boundary. In `src/renderer/mirror/App.tsx`, snapshot the current
  active `runId` at that boundary and evaluate the configured wake phrase first
  on completion. A stop control turn cannot also trigger a Scene.
- Hook lifecycle transitions, Mirror `render-process-gone`, window close, and
  shutdown to the same runtime barrier. Keep LaunchAgent as the only app restart
  owner.

**Proof**

- Run the focused IPC/Realtime tests and both repository typechecks.

## Task 5: Present visuals and share the existing ducked background bus

**Tests first**

- Add `tests/renderer/mirror/scene-visual-controller.test.ts` for ready/playing/
  progress/ended/failed reports, image/video teardown, stale command replacement,
  loop wrap, and lifecycle preemption.
- Extend Avatar audio tests for concurrent BGM plus embedded video, one shared
  duck gain, actual-output duck/release, and one-member failure isolation.
- Extend `tests/unit/mirror-projection.test.ts` or the closest App contract test
  for lifecycle surface > Scene visual > Avatar and never-black fallback.

**Implementation**

- Add `src/renderer/mirror/scene-visual-controller.ts` and a focused visual
  layer in `src/renderer/mirror/App.tsx`. Keep Avatar visible until decoded/
  playing, dispose each media element once, and restore the current lifecycle
  surface on every release.
- Extend `AvatarControlCommand` and both preload validators with explicit
  visual start/stop commands; no renderer decides Stage advancement.
- Refactor `src/renderer/avatar/audio/avatar-media-controller.ts` so BGM and an
  optional video element have individual authored gains feeding one background
  analyser/duck gain. Realtime dialogue remains on its existing direct output.

**Proof**

- Run the focused renderer tests and `npm run typecheck:web`.

## Task 6: Extend the Console editor without adding workflow concepts

**Tests first**

- Extend `tests/unit/console-ui.test.ts`, `tests/unit/console-config-ui.test.ts`,
  and `tests/unit/console-ipc.test.ts` for import/preview, visual action fields,
  end-condition controls, matrix errors/warnings, estimated maximum duration,
  current run status, and Stop All.

**Implementation**

- Update `src/renderer/console/App.tsx` and its stylesheet with one Managed
  visuals fieldset and the minimum new controls inside the existing vertical
  Scenes editor. Keep keyboard reorder, units, text-plus-icon status, and
  `aria-live` behavior.
- Test Draft exercises the media decode path and surfaces an
  `audio_track_unverified` warning when embedded-audio presence is unknown; it
  never pretends silence analysis proves track absence. Failed Test
  Draft/Publish never changes Active. Preview uses the pending/published managed
  protocol and never activates Draft.

**Proof**

- Run the three Console tests and `npm run typecheck:web`.

## Task 7: Extend deterministic Phase 4 evidence and prepare human testing

**Tests first**

- Extend `tests/unit/phase4-qa-runner.test.ts` for finite video, loop+external
  BGM, replacement, stale event, failure cleanup, and privacy marker shapes.

**Implementation**

- Extend `src/main/phase4-qa.ts` and `scripts/run-phase4-qa.mjs` with deterministic
  media cases using only synthetic/local test assets. Mark adapter evidence
  `mock`; never promote it to physical evidence.
- Add `docs/testing/phase4-scene-media-windows-checklist.md` containing the
  operator sequence, expected visible/audio behavior, evidence locations, and
  explicit Mac/physical-hardware exclusions.
- After all implementation checks are green, update only the Phase 4 evidence
  and human-test-readiness fields in `PROGRESS.md`; do not mark human testing,
  physical hardware, phase exit, tag, or Mac readiness complete.

**Final proof from the canonical checkout**

1. Focused changed-boundary tests.
2. `npm run typecheck:node` and `npm run typecheck:web`.
3. `npm run build`.
4. `npm test`.
5. Verify the persistent Private-profile TCP and UDP firewall rules resolve
   exactly to `C:\Project\magic-mirror\node_modules\electron\dist\electron.exe`.
   If either is absent/mismatched, stop and ask the user to run the documented
   elevated firewall script; do not launch Electron first.
6. `npm run test:phase4:qa` from the canonical checkout and preserve its concise
   result marker plus evidence index.
7. `git diff --check` and a final scoped diff/status review.

The handoff is “ready for Windows human real testing” only when all seven
automated steps pass and the checklist names every still-human observation.
